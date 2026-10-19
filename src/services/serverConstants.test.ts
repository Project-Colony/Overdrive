import {describe, it, expect, vi, afterEach} from 'vitest'

const lan = vi.hoisted(() => ({enabled: false}))

vi.mock('../../app/server/lanAccess', () => ({
  isLanAccessEnabled: () => lan.enabled,
  getBindHost: () => (lan.enabled ? '0.0.0.0' : '127.0.0.1'),
}))

import {
  FIXED_PORT,
  getAllowLan,
  getBindHostForServer,
  createCorsMiddleware,
  isAllowedHost,
  isAllowedOrigin,
  isLoopbackHost,
  isPrivateIpv4,
} from '../../app/server/constants.js'

describe('server constants', () => {
  afterEach(() => {
    lan.enabled = false
    vi.unstubAllEnvs()
  })

  it('detects loopback hosts', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('192.168.1.2')).toBe(false)
  })

  it('detects private ipv4 ranges', () => {
    expect(isPrivateIpv4('192.168.0.10')).toBe(true)
    expect(isPrivateIpv4('10.0.0.5')).toBe(true)
    expect(isPrivateIpv4('8.8.8.8')).toBe(false)
  })

  it('allows missing origin', () => {
    expect(isAllowedOrigin(undefined)).toBe(true)
  })

  it('allows loopback browser origins', () => {
    expect(isAllowedOrigin('http://localhost:12321')).toBe(true)
  })

  it('only allows the API port (or same-origin) for loopback origins', () => {
    expect(isAllowedOrigin('http://localhost:12321', 12321)).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:12321', 12321)).toBe(true)
    expect(isAllowedOrigin('http://[::1]:12321', 12321)).toBe(true)
    expect(isAllowedOrigin('http://localhost:8080', 12321)).toBe(false)
    expect(isAllowedOrigin('http://localhost:8080', 12321, 'localhost:8080')).toBe(true)
    expect(isAllowedOrigin('http://192.168.1.5:12321', 12321)).toBe(false)
  })

  it('accepts LAN origins behind a proxy that changes the port, on the same host only', () => {
    lan.enabled = true
    expect(isAllowedOrigin('http://192.168.1.5:8443', 12321, '192.168.1.5')).toBe(true)
    expect(isAllowedOrigin('http://192.168.1.5:8443', 12321, '192.168.1.5:12321')).toBe(true)
    expect(isAllowedOrigin('http://192.168.1.9:8443', 12321, '192.168.1.5:12321')).toBe(false)
    // Loopback keeps the exact host:port rule.
    expect(isAllowedOrigin('http://localhost:8080', 12321, 'localhost:12321')).toBe(false)
  })

  it('exempts the Vite port only for the Electron dev script', () => {
    vi.stubEnv('MEDIA_CHIPS_VITE_DEV', '')
    vi.stubEnv('NODE_ENV', 'development')
    expect(isAllowedOrigin('http://localhost:3000', 12321)).toBe(false)
    vi.stubEnv('MEDIA_CHIPS_VITE_DEV', '1')
    expect(isAllowedOrigin('http://localhost:3000', 12321)).toBe(true)
  })

  it('rejects foreign Host headers in loopback mode', () => {
    expect(isAllowedHost('127.0.0.1:12321')).toBe(true)
    expect(isAllowedHost('localhost:12321')).toBe(true)
    expect(isAllowedHost('[::1]:12321')).toBe(true)
    expect(isAllowedHost('evil.example:12321')).toBe(false)
    expect(isAllowedHost(undefined)).toBe(false)
  })

  it('answers 403 before routing for a rebinding Host or a foreign port', () => {
    const run = (headers: Record<string, string>) => {
      let status = 0
      const res = {
        status(code: number) { status = code; return res },
        json: () => res,
        header: () => res,
      }
      const next = vi.fn()
      createCorsMiddleware()({headers, method: 'GET', socket: {localPort: 12321}} as never, res as never, next)
      return next.mock.calls.length ? 'next' : status
    }

    expect(run({host: 'evil.example:12321'})).toBe(403)
    expect(run({host: '127.0.0.1:12321', origin: 'http://localhost:8080'})).toBe(403)
    expect(run({host: '127.0.0.1:12321', origin: 'http://localhost:12321'})).toBe('next')
    expect(run({host: '127.0.0.1:12321', origin: 'http://127.0.0.1:12321'})).toBe('next')
  })

  it('exports fixed server port', () => {
    expect(FIXED_PORT).toBe(12321)
    expect(typeof getBindHostForServer()).toBe('string')
    expect(typeof getAllowLan()).toBe('boolean')
  })
})
