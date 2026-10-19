import axios, { type LookupAddressEntry } from 'axios'
import dns from 'dns'
import net from 'net'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RETRIES = 3
const MIN_IMAGE_BYTES = 128

// SSRF guard: loopback, private, link-local, CGNAT, benchmark, multicast and reserved targets.
// BlockList also matches IPv4-mapped IPv6 (::ffff:127.0.0.1) against the IPv4 rules;
// ::/96 (IPv4-compatible, plus :: and ::1) and 64:ff9b::/96 (NAT64) need their own entries.
const blockedAddresses = new net.BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
  ['::', 96], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6')
}

function assertPublicAddress(address: string) {
  const ip = address.replace(/^\[|\]$/g, '')
  const family = net.isIP(ip)
  if (family && blockedAddresses.check(ip, family === 6 ? 'ipv6' : 'ipv4')) {
    throw new Error(`Blocked image host: ${address}`)
  }
}

// Checks every resolved address, so a public name pointing at 127.0.0.1 is refused too.
// Always answers with the full list; axios narrows it when Node asked for a single address.
function publicOnlyLookup(
  hostname: string,
  _options: object,
  callback: (err: Error | null, addresses: LookupAddressEntry[]) => void,
) {
  dns.lookup(hostname, {all: true}, (err, addresses) => {
    if (err) return callback(err, [])
    try {
      addresses.forEach((entry) => assertPublicAddress(entry.address))
    } catch (error) {
      return callback(error as Error, [])
    }
    callback(null, addresses as LookupAddressEntry[])
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAcceptableImageContentType(contentType: string): boolean {
  if (!contentType) return true
  return contentType.startsWith('image/') || contentType.includes('octet-stream')
}

function buildDownloadHeaders(url: string, referer?: string) {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'image/*,*/*;q=0.8',
    ...(referer ? {Referer: referer} : {}),
  }
}

function refererCandidatesForUrl(url: URL): Array<string | undefined> {
  // TMDB CDN is more reliable without a referer (and rejects image.tmdb.org as referer).
  if (/(^|\.)tmdb\.org$/i.test(url.hostname)) {
    return [undefined, 'https://www.themoviedb.org/']
  }
  // TPDB CDN accepts either the site or CDN origin; prefer the site first.
  if (/(^|\.)theporndb\.net$/i.test(url.hostname)) {
    return ['https://theporndb.net/', `${url.origin}/`, undefined]
  }
  return [`${url.origin}/`, undefined]
}

export async function downloadRemoteImage(
  url: string,
  {retries = DEFAULT_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS} = {},
): Promise<Buffer> {
  const trimmedUrl = url.trim()
  if (!/^https?:\/\//i.test(trimmedUrl)) {
    throw new Error('Invalid image URL')
  }

  const parsedUrl = new URL(trimmedUrl)
  // IP literals skip DNS, so the lookup hook never sees them.
  assertPublicAddress(parsedUrl.hostname)
  const refererCandidates = refererCandidatesForUrl(parsedUrl)

  let lastError: unknown

  for (let attempt = 1; attempt <= retries; attempt++) {
    for (const referer of refererCandidates) {
      try {
        const response = await axios.get(trimmedUrl, {
          responseType: 'arraybuffer',
          timeout: timeoutMs,
          maxRedirects: 5,
          // lookup/beforeRedirect only exist on the Node http adapter; never fall back to XHR.
          adapter: 'http',
          // ponytail: no HTTP(S)_PROXY: a proxy resolves the target itself, so the lookup hook
          // would only vet the proxy. Re-check targets through the proxy if users need one.
          proxy: false,
          lookup: publicOnlyLookup,
          beforeRedirect: (options) => assertPublicAddress(String(options.hostname ?? '')),
          headers: buildDownloadHeaders(trimmedUrl, referer),
          validateStatus: (status) => status >= 200 && status < 300,
        })

        const contentType = String(response.headers['content-type'] || '').toLowerCase()
        if (!isAcceptableImageContentType(contentType)) {
          throw new Error(`Unexpected content type: ${contentType}`)
        }

        const buffer = Buffer.from(response.data)
        if (buffer.length < MIN_IMAGE_BYTES) {
          throw new Error(`Downloaded image is too small (${buffer.length} bytes)`)
        }

        return buffer
      } catch (error) {
        lastError = error
      }
    }

    if (attempt < retries) {
      await sleep(400 * attempt)
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error('Failed to download image')
}
