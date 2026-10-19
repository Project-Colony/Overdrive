import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createServer, type Server} from 'node:http'
import expressWs from 'express-ws'
import WebSocket from 'ws'
import type {ApiDb} from '../../api/types/db'
import type {ExpressWithWs} from '../types/websockets'
import {createExpressApp} from './createApp'
import {createAuthMiddleware, createAuthService} from './auth'

const settingRows = vi.hoisted(() => ({rows: [] as Array<{option: string; value: string}>}))

vi.mock('../../api/db/repositories/settings', () => ({
  createSettingsRepository: () => ({
    findAll: () => settingRows.rows,
    upsertByOption: (option: string, value: string) => {
      const row = settingRows.rows.find((entry) => entry.option === option)
      if (row) row.value = value
      else settingRows.rows.push({option, value})
    },
  }),
}))

type TestServer = {
  baseUrl: string
  server: Server
  close: () => Promise<void>
}

async function listen(app: ReturnType<typeof createExpressApp>['app']): Promise<TestServer> {
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to resolve test server port')

  return {
    baseUrl: 'http://127.0.0.1:' + address.port,
    server,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    }),
  }
}

async function startServer(): Promise<TestServer> {
  const {app} = createExpressApp()
  const authService = {
    isAuthRequired: async () => true,
    isRequestAuthenticated: () => false,
  } as unknown as Parameters<typeof createAuthMiddleware>[0]
  app.use(createAuthMiddleware(authService))
  app.get('/api/config', (_req, res) => res.json({ok: true}))
  app.get('/api/setting', (_req, res) => res.json({ok: true}))
  app.get('/api/tags', (_req, res) => res.json({ok: true}))

  return listen(app)
}

/**
 * Real auth service over a mocked settings table, plus a /moving WebSocket.
 * auth.ts reads MEDIA_CHIPS_API_SECRET once at load, so each server gets a fresh copy.
 */
async function startRealServer(secret?: string): Promise<TestServer & {authService: ReturnType<typeof createAuthService>}> {
  if (secret) process.env.MEDIA_CHIPS_API_SECRET = secret
  vi.resetModules()
  const auth = await import('./auth')
  const {app, router} = createExpressApp()
  const authService = auth.createAuthService({} as ApiDb)
  // Same order as app/server.ts: the shared router (video streaming) sits behind auth.
  app.use(auth.createAuthMiddleware(authService))
  app.use(router)
  auth.registerAuthRoutes(app, authService)
  app.get('/api/tags', (_req, res) => res.json({ok: true}))
  router.get('/api/video/:id', (_req, res) => res.json({ok: true}))

  const test = await listen(app)
  expressWs(app, test.server)
  ;(app as unknown as ExpressWithWs).ws('/moving', (ws) => ws.send('ready'))
  return {...test, authService}
}

/** Resolves with the first message, or null when the server closes the socket first. */
function firstWsMessage(url: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('message', (data) => {
      ws.close()
      resolve(String(data))
    })
    ws.once('close', () => resolve(null))
    ws.once('error', reject)
  })
}

function login(server: TestServer, body: unknown, headers: Record<string, string> = {}) {
  return fetch(server.baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...headers},
    body: JSON.stringify(body),
  })
}

describe('auth middleware public paths', () => {
  let server: TestServer | null = null

  afterEach(async () => {
    await server?.close()
    server = null
  })

  it('leaves the shared router unmounted, so it cannot run ahead of auth', async () => {
    const {app, router} = createExpressApp()
    router.get('/api/video/:id', (_req, res) => res.json({ok: true}))
    server = await listen(app)
    expect((await fetch(server.baseUrl + '/api/video/1')).status).toBe(404)
  })

  it('lets the SPA fetch /api/config without a session', async () => {
    server = await startServer()
    const response = await fetch(server.baseUrl + '/api/config')
    expect(response.status).toBe(200)
  })

  it('still protects library routes', async () => {
    server = await startServer()
    const response = await fetch(server.baseUrl + '/api/tags')
    expect(response.status).toBe(401)
  })

  it('protects /API/ paths, which Express routes case-insensitively', async () => {
    server = await startServer()
    const response = await fetch(server.baseUrl + '/API/tags')
    expect(response.status).toBe(401)
  })
})

describe('auth with the real service', () => {
  let server: Awaited<ReturnType<typeof startRealServer>> | null = null

  beforeEach(() => {
    settingRows.rows = [
      {option: 'passwordProtection', value: '1'},
      {option: 'phrase', value: 'hunter2'},
    ]
  })

  afterEach(async () => {
    vi.useRealTimers()
    delete process.env.MEDIA_CHIPS_API_SECRET
    await server?.close()
    server = null
  })

  it('authenticates WebSocket upgrades with ?token=', async () => {
    server = await startRealServer()
    const wsBase = server.baseUrl.replace('http', 'ws') + '/moving'

    expect(await firstWsMessage(wsBase)).toBeNull()

    const token = server.authService.createSession()
    expect(await firstWsMessage(`${wsBase}?token=${token}`)).toBe('ready')
  })

  it('throttles repeated bad logins and accepts the right password', async () => {
    server = await startRealServer()

    expect((await login(server, {password: 'hunter2'})).status).toBe(200)
    // The plain-text password inherited from MediaChips was rewritten as a hash.
    expect(settingRows.rows.find((row) => row.option === 'phrase')?.value).toMatch(/^scrypt\$/)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await login(server, {password: 'wrong'})).status).toBe(401)
    }
    expect((await login(server, {password: 'hunter2'})).status).toBe(429)
  })

  it('forgets old failures after a quiet day', async () => {
    vi.useFakeTimers({toFake: ['Date']})
    server = await startRealServer()
    for (let attempt = 0; attempt < 5; attempt += 1) await login(server, {password: 'wrong'})
    expect((await login(server, {password: 'wrong'})).status).toBe(429)

    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000)
    // Without decay the count would carry on and lock again after one more failure.
    expect((await login(server, {password: 'wrong'})).status).toBe(401)
    expect((await login(server, {password: 'wrong'})).status).toBe(401)
  })

  it('requires the per-launch secret when the password is off', async () => {
    settingRows.rows = []
    server = await startRealServer('launch-secret')
    const key = {'X-Overdrive-Key': 'launch-secret'}

    // Read once, then dropped: spawned players and ffmpeg must not inherit it.
    expect(process.env.MEDIA_CHIPS_API_SECRET).toBeUndefined()
    expect((await fetch(server.baseUrl + '/api/video/1')).status).toBe(401)
    expect((await fetch(server.baseUrl + '/api/video/1', {headers: key})).status).toBe(200)

    expect((await fetch(server.baseUrl + '/api/tags')).status).toBe(401)
    expect((await fetch(server.baseUrl + '/api/tags', {headers: {'X-Overdrive-Key': 'wrong'}})).status).toBe(401)
    expect((await fetch(server.baseUrl + '/api/tags', {headers: key})).status).toBe(200)
    expect((await login(server, {})).status).toBe(401)
    expect((await login(server, {}, key)).status).toBe(200)

    // Lets a browser on the same machine explain the lockout instead of failing silently.
    const status = async (headers = {}) => (await fetch(server!.baseUrl + '/api/auth/status', {headers})).json()
    expect(await status()).toMatchObject({required: false, secretRequired: true})
    expect(await status(key)).toMatchObject({secretRequired: false})
  })

  it('blanks credential settings for callers that may not use the API', () => {
    const service = createAuthService({} as ApiDb)
    const rows = [
      {option: 'phrase', value: 'hunter2'},
      {option: 'tmdbApiKey', value: 'tmdb'},
      {option: 'tpdbApiKey', value: 'tpdb'},
      {option: 'theme', value: 'dark'},
    ]
    expect(service.sanitizeSettingRows(rows, true)).toEqual([
      {option: 'phrase', value: ''},
      {option: 'tmdbApiKey', value: 'tmdb'},
      {option: 'tpdbApiKey', value: 'tpdb'},
      {option: 'theme', value: 'dark'},
    ])
    expect(service.sanitizeSettingRows(rows, false)).toEqual([
      {option: 'phrase', value: ''},
      {option: 'tmdbApiKey', value: ''},
      {option: 'tpdbApiKey', value: ''},
      {option: 'theme', value: 'dark'},
    ])
    expect(service.sanitizeSettingRow({option: 'stashApiKey', value: 's'}, false)).toEqual({option: 'stashApiKey', value: ''})
  })

  it('stays open without a password when no secret is configured', async () => {
    settingRows.rows = []
    server = await startRealServer()
    expect((await fetch(server.baseUrl + '/api/tags')).status).toBe(200)
    expect((await login(server, {})).status).toBe(200)
  })
})
