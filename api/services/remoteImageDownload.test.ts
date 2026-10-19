/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}))

import axios from 'axios'
import net from 'net'
import { downloadRemoteImage } from './remoteImageDownload'

describe('downloadRemoteImage', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset()
  })

  it('returns downloaded image bytes for valid responses', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: Buffer.alloc(256, 1),
      headers: {'content-type': 'image/jpeg'},
    })

    const buffer = await downloadRemoteImage('https://cdn.example.com/poster.jpg', {retries: 1})
    expect(buffer.length).toBe(256)
  })

  it('retries when the first download attempt fails', async () => {
    vi.mocked(axios.get)
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({
        data: Buffer.alloc(256, 2),
        headers: {'content-type': 'image/jpeg'},
      })

    const buffer = await downloadRemoteImage('https://cdn.example.com/poster.jpg', {retries: 2})
    expect(buffer.length).toBe(256)
    expect(axios.get).toHaveBeenCalled()
  })

  it('rejects unsupported content types', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: Buffer.alloc(256, 3),
      headers: {'content-type': 'text/html'},
    })

    await expect(
      downloadRemoteImage('https://cdn.example.com/poster.jpg', {retries: 1}),
    ).rejects.toThrow('Unexpected content type')
  })

  it('prefers theporndb.net referer for TPDB CDN URLs', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: Buffer.alloc(256, 4),
      headers: {'content-type': 'image/jpeg'},
    })

    await downloadRemoteImage(
      'https://cdn.theporndb.net/scene/aa/bb/cc/hash/background/poster.webp',
      {retries: 1},
    )

    expect(axios.get).toHaveBeenCalledWith(
      'https://cdn.theporndb.net/scene/aa/bb/cc/hash/background/poster.webp',
      expect.objectContaining({
        headers: expect.objectContaining({
          Referer: 'https://theporndb.net/',
        }),
      }),
    )
  })
})

describe('downloadRemoteImage SSRF guard', () => {
  it('rejects loopback targets without opening a socket', async () => {
    const {default: realAxios} = await vi.importActual<typeof import('axios')>('axios')
    vi.mocked(axios.get).mockImplementation((url, config) => realAxios.get(url, config))

    let connections = 0
    const server = net.createServer((socket) => {
      connections++
      socket.destroy()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const {port} = server.address() as net.AddressInfo

    try {
      for (const url of [
        `http://127.0.0.1:${port}/`,
        `http://2130706433:${port}/`,
        `http://[::1]:${port}/`,
        `http://[::ffff:127.0.0.1]:${port}/`,
        `http://[::7f00:1]:${port}/`,
        `http://[64:ff9b::7f00:1]:${port}/`,
        `http://198.18.0.1:${port}/`,
        `http://255.255.255.255:${port}/`,
        `http://localhost:${port}/`,
      ]) {
        await expect(downloadRemoteImage(url, {retries: 1}), url).rejects.toThrow(/Blocked image host/)
      }
      expect(connections).toBe(0)
    } finally {
      server.close()
    }
  })

  it('refuses redirects to internal IP literals', async () => {
    vi.mocked(axios.get).mockReset().mockResolvedValue({
      data: Buffer.alloc(256, 5),
      headers: {'content-type': 'image/jpeg'},
    })
    await downloadRemoteImage('https://cdn.example.com/poster.jpg', {retries: 1})

    const config = vi.mocked(axios.get).mock.calls[0][1] as unknown as {
      beforeRedirect: (options: {hostname: string}) => void
      proxy: unknown
    }
    // An env proxy would resolve targets itself, out of reach of the lookup hook.
    expect(config.proxy).toBe(false)
    expect(() => config.beforeRedirect({hostname: '169.254.169.254'})).toThrow(/Blocked image host/)
    expect(() => config.beforeRedirect({hostname: '::1'})).toThrow(/Blocked image host/)
    expect(() => config.beforeRedirect({hostname: 'cdn.example.com'})).not.toThrow()
  })
})
