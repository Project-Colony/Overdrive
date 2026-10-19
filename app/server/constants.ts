import type { NextFunction, Request, Response } from 'express'
import { FIXED_PORT } from './ports'
import { getBindHost, isLanAccessEnabled } from './lanAccess'

function getAllowLan(): boolean {
  return isLanAccessEnabled()
}

function getBindHostForServer(): string {
  return getBindHost()
}

function isLoopbackHost(hostname: string): boolean {
  // URL.hostname keeps IPv6 brackets ('[::1]'); raw socket addresses do not.
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
}

function isPrivateIpv4(hostname: string): boolean {
  return /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
}

function isAllowedOrigin(
  origin: string | string[] | undefined,
  listenPort: number = FIXED_PORT,
  requestHost?: string,
): boolean {
  if (!origin || Array.isArray(origin)) return !origin

  try {
    const parsed = new URL(origin)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false

    const hostname = parsed.hostname.toLowerCase()
    if (!isLoopbackHost(hostname) && !(getAllowLan() && isPrivateIpv4(hostname))) return false

    // Exact port: other local apps, dev servers or LAN devices must not get
    // credentialed CORS. Same-origin also passes (Docker host-port remaps).
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
    if (port === String(listenPort)) return true
    // Vite dev server: only when the Electron dev script says so, never a headless launch.
    if (process.env.MEDIA_CHIPS_VITE_DEV === '1' && port === String(process.env.VITE_DEV_SERVER_PORT || 3000)) return true
    if (!requestHost) return false
    // LAN origins only need the same host: a reverse proxy may change the port or drop it from Host.
    return isLoopbackHost(hostname)
      ? parsed.host === requestHost.toLowerCase()
      : hostname === new URL('http://' + requestHost).hostname
  } catch {
    return false
  }
}

/** Loopback-only mode: reject foreign Host headers (DNS rebinding). */
function isAllowedHost(host: string | undefined): boolean {
  if (getAllowLan()) return true
  try {
    return isLoopbackHost(new URL('http://' + (host || '')).hostname)
  } catch {
    return false
  }
}

function createCorsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isAllowedHost(req.headers.host)) {
      return res.status(403).json({error: 'Host is not allowed'})
    }

    const origin = req.headers.origin
    if (!isAllowedOrigin(origin, req.socket.localPort, req.headers.host)) {
      return res.status(403).json({error: 'Origin is not allowed'})
    }

    if (origin) {
      res.header('Access-Control-Allow-Origin', origin)
      res.header('Vary', 'Origin')
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Content-Disposition, X-Overdrive-Key')
    res.header('Access-Control-Allow-Credentials', 'true')
    res.header('Access-Control-Expose-Headers', 'Content-Disposition')

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200)
    }

    next()
  }
}

export {
  FIXED_PORT,
  getAllowLan,
  getBindHostForServer,
  isLoopbackHost,
  isPrivateIpv4,
  isAllowedOrigin,
  isAllowedHost,
  createCorsMiddleware,
}

