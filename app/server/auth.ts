import type { ApiDb } from '../../api/types/db'
import type { Express, Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { createSettingsRepository } from '../../api/db/repositories/settings'
import { validateBody } from '../../api/middleware/validateBody'
import { AuthLoginRequestSchema } from '../../shared/schemas/requests'
import { hashPassword, isPasswordHash, verifyPasswordHash } from '../../api/utils/passwordHash'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SETTINGS_CACHE_MS = 10_000
const LOGIN_FREE_FAILURES = 5
const LOGIN_MAX_LOCK_MS = 15 * 60 * 1000
/** Longer than any lock, so waiting out a reset is slower than the capped lockout itself. */
const LOGIN_FAILURE_TTL_MS = 24 * 60 * 60 * 1000
/** Per-launch key the Electron shell injects into every renderer request. */
const API_SECRET_HEADER = 'x-overdrive-key'
/** Only set when the Electron shell spawned this API. Dropped from the env so
 * players, ffmpeg and file managers spawned later never inherit it. */
const API_SECRET = process.env.MEDIA_CHIPS_API_SECRET || ''
delete process.env.MEDIA_CHIPS_API_SECRET

interface Session {
  createdAt: number
  expiresAt: number
}

interface SecuritySettings {
  passwordProtection: boolean
  phrase: string
}

interface SettingRow {
  option: string
  value: string
}

type AuthService = ReturnType<typeof createAuthService>

/** Settings rows that hold credentials (the password and integration API keys). */
const SECRET_SETTING_OPTIONS = new Set(['phrase', 'tpdbApiKey', 'tmdbApiKey', 'jellyfinApiKey', 'stashApiKey'])

function createAuthService(db: ApiDb) {
  const sessions = new Map<string, Session>()
  let settingsCache: { at: number; settings: SecuritySettings } | null = null

  function invalidateSettingsCache() {
    settingsCache = null
  }

  async function loadSecuritySettings(): Promise<SecuritySettings> {
    if (settingsCache && Date.now() - settingsCache.at < SETTINGS_CACHE_MS) {
      return settingsCache.settings
    }

    const settingsRepo = createSettingsRepository(db.drizzle)
    const rows = settingsRepo.findAll() as SettingRow[]
    const map = Object.fromEntries(rows.map((row) => [row.option, row.value]))
    let phrase = map.phrase || ''
    // Libraries from MediaChips (and older Overdrive builds) store the password in plain text.
    if (phrase && !isPasswordHash(phrase)) {
      phrase = hashPassword(phrase)
      settingsRepo.upsertByOption('phrase', phrase)
    }
    const settings = {
      passwordProtection: map.passwordProtection === '1',
      phrase,
    }

    settingsCache = {at: Date.now(), settings}
    return settings
  }

  function createSession(): string {
    const token = crypto.randomBytes(32).toString('hex')
    const now = Date.now()
    sessions.set(token, {createdAt: now, expiresAt: now + SESSION_TTL_MS})
    return token
  }

  function validateToken(token: string | undefined | null): boolean {
    if (!token) return false

    const session = sessions.get(token)
    if (!session) return false

    if (Date.now() > session.expiresAt) {
      sessions.delete(token)
      return false
    }

    return true
  }

  function revokeToken(token: string) {
    sessions.delete(token)
  }

  async function isAuthRequired(): Promise<boolean> {
    const settings = await loadSecuritySettings()
    return settings.passwordProtection
  }

  async function verifyPassword(password: string): Promise<boolean> {
    const settings = await loadSecuritySettings()
    if (!settings.passwordProtection) return true
    if (!settings.phrase) return password === ''
    return verifyPasswordHash(password, settings.phrase)
  }

  function extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim()
    }

    const queryToken = req.query?.token
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim()
    }
    if (Array.isArray(queryToken) && typeof queryToken[0] === 'string' && queryToken[0].trim()) {
      return queryToken[0].trim()
    }

    return null
  }

  function isRequestAuthenticated(req: Request): boolean {
    return validateToken(extractToken(req))
  }

  /** `allowed`: isRequestAllowed(). /api/setting is public, so others get no credentials. */
  /** The password hash is never sent, even to the app: the UI only ever writes a new one. */
  function sanitizeSettingRow(row: SettingRow | null, allowed: boolean): SettingRow | null {
    if (!row || !SECRET_SETTING_OPTIONS.has(row.option)) return row
    if (allowed && row.option !== 'phrase') return row
    return {...row, value: ''}
  }

  function sanitizeSettingRows(rows: SettingRow[], allowed: boolean): SettingRow[] {
    return rows.map((row) => sanitizeSettingRow(row, allowed) as SettingRow)
  }

  setInterval(() => {
    const now = Date.now()
    for (const [token, session] of sessions) {
      if (now > session.expiresAt) {
        sessions.delete(token)
      }
    }
  }, 60 * 60 * 1000).unref()

  return {
    invalidateSettingsCache,
    loadSecuritySettings,
    createSession,
    validateToken,
    revokeToken,
    isAuthRequired,
    verifyPassword,
    extractToken,
    isRequestAuthenticated,
    sanitizeSettingRows,
    sanitizeSettingRow,
  }
}

const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/ping',
  '/api/config',
  '/api/clear-cache',
  '/api/auth/login',
  '/api/auth/status',
  '/api/auth/logout',
  '/api/setting',
])

function isPublicApiPath(url: string): boolean {
  const path = url.split('?')[0].toLowerCase()
  return PUBLIC_PATHS.has(path)
}

/** express-ws upgrades arrive as '/moving/.websocket' and '/watcher/.websocket'. */
const WS_PATH = /^\/(watcher|moving)(\/|$)/

function hasValidSecret(req: Request): boolean {
  const provided = req.headers[API_SECRET_HEADER]
  if (!API_SECRET || typeof provided !== 'string') return false
  const a = Buffer.from(provided)
  const b = Buffer.from(API_SECRET)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * A login token always passes. Without a password, the Electron API also
 * wants its per-launch secret; headless servers (no secret) stay open.
 */
async function isRequestAllowed(
  authService: Pick<AuthService, 'isAuthRequired' | 'isRequestAuthenticated'>,
  req: Request,
): Promise<boolean> {
  if (authService.isRequestAuthenticated(req)) return true
  if (await authService.isAuthRequired()) return false
  return !API_SECRET || hasValidSecret(req)
}

function createAuthMiddleware(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Express routing is case-insensitive, so the guard must be too.
    const path = (req.path || '').toLowerCase()
    if (!path.startsWith('/api/') && !WS_PATH.test(path)) return next()
    if (req.method === 'OPTIONS') return next()
    if (isPublicApiPath(path)) return next()

    try {
      if (await isRequestAllowed(authService, req)) return next()

      return res.status(401).json({message: 'Authentication required'})
    } catch (err) {
      next(err)
    }
  }
}

function registerAuthRoutes(app: Express, authService: AuthService) {
  // ponytail: in-memory and per-IP, so clients behind one IP (reverse proxy, Docker
  // Desktop) share a lockout; key on the forwarded IP if that ever matters.
  const loginFailures = new Map<string, {count: number; lockedUntil: number}>()

  app.get('/api/auth/status', async (req: Request, res: Response) => {
    try {
      const required = await authService.isAuthRequired()
      res.json({
        required,
        authenticated: authService.isRequestAuthenticated(req),
        secretRequired: Boolean(API_SECRET) && !hasValidSecret(req),
      })
    } catch (_err: unknown) {
      res.status(500).json({message: 'Failed to read auth status'})
    }
  })

  app.post('/api/auth/login', validateBody(AuthLoginRequestSchema), async (req: Request, res: Response) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || ''
      const previous = loginFailures.get(ip)
      // Failures decay after a quiet day, so typos weeks apart never add up.
      const failure = previous && Date.now() - previous.lockedUntil < LOGIN_FAILURE_TTL_MS ? previous : undefined
      if (failure && Date.now() < failure.lockedUntil) {
        res.setHeader('Retry-After', String(Math.ceil((failure.lockedUntil - Date.now()) / 1000)))
        return res.status(429).json({message: 'Too many failed login attempts'})
      }

      const required = await authService.isAuthRequired()
      const password = req.body?.password

      if (!required) {
        if (API_SECRET && !hasValidSecret(req)) {
          return res.status(401).json({message: 'Authentication required'})
        }
        const token = authService.createSession()
        return res.json({token, required: false})
      }

      if (typeof password !== 'string') {
        return res.status(400).json({message: 'Password required'})
      }

      const valid = await authService.verifyPassword(password)
      if (!valid) {
        // Exponential lockout after the free attempts: 1 s, 2 s, 4 s … capped at 15 min.
        const count = (failure?.count || 0) + 1
        const lockMs = count >= LOGIN_FREE_FAILURES
          ? Math.min(2 ** (count - LOGIN_FREE_FAILURES) * 1000, LOGIN_MAX_LOCK_MS)
          : 0
        loginFailures.set(ip, {count, lockedUntil: Date.now() + lockMs})
        return res.status(401).json({message: 'Invalid password'})
      }

      loginFailures.delete(ip)
      const token = authService.createSession()
      res.json({token, required: true})
    } catch (_err: unknown) {
      res.status(500).json({message: 'Login failed'})
    }
  })

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = authService.extractToken(req)
    if (token) authService.revokeToken(token)
    res.json({success: true})
  })
}

export { createAuthService, createAuthMiddleware, registerAuthRoutes, isRequestAllowed, hasValidSecret }
