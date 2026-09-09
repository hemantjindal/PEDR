import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Fetching a calendar somebody linked.
 *
 * Outlook, Teams and Google all publish a private .ics URL, and storing one is
 * what turns a one-off import into a sync. It is also a URL a user chose and
 * this server then requests, which is the definition of a server-side request
 * forgery hole: without the checks below, "https://169.254.169.254/…" would
 * make this app read its own host's cloud credentials and hand them back.
 *
 * So: https only, public addresses only, checked after DNS resolution, with
 * redirects followed by hand so the second hop is checked as hard as the
 * first.
 */

export interface FeedFetch {
  ics: string
  /** The URL actually read, after any redirects. */
  finalUrl: string
  bytes: number
}

export class FeedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedError'
  }
}

const MAX_BYTES = 8_000_000
const TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 3

/**
 * Tidy a pasted calendar address.
 *
 * `webcal://` is what Outlook and Apple hand you from a "Subscribe" button.
 * It is not a real scheme — it means "https, but open it in a calendar app" —
 * so it is rewritten rather than rejected, because being told your own
 * calendar link is invalid is maddening.
 */
export function normaliseFeedUrl(input: string): URL {
  const trimmed = input.trim()
  if (!trimmed) throw new FeedError('Paste your calendar link first.')

  const rewritten = trimmed.replace(/^webcals?:\/\//i, 'https://')
  let url: URL
  try {
    url = new URL(rewritten)
  } catch {
    throw new FeedError('That does not look like a link. It should start with https://')
  }

  if (url.protocol === 'http:') {
    // The link carries a token that reads your calendar. Not over plain HTTP.
    throw new FeedError('That link is not secure. Use the https:// version of it.')
  }
  if (url.protocol !== 'https:') {
    throw new FeedError('Calendar links have to start with https:// or webcal://')
  }
  if (!url.hostname || url.hostname === 'localhost') {
    throw new FeedError('That link points at this server, not at a calendar.')
  }
  return url
}

/**
 * Addresses no calendar is ever served from, and several that would leak
 * something if this server requested them: loopback, the link-local range that
 * cloud metadata services sit on, and the private ranges of whatever network
 * this happens to be running in.
 */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return isPublicV4(address)
  if (version === 6) return isPublicV6(address)
  return false
}

function isPublicV4(address: string): boolean {
  const [a, b] = address.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 169 && b === 254) return false // link-local, and cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 100 && b >= 64 && b <= 127) return false // carrier-grade NAT
  if (a === 192 && b === 0) return false
  if (a >= 224) return false // multicast and reserved
  return true
}

function isPublicV6(address: string): boolean {
  const value = address.toLowerCase().split('%')[0]
  if (value === '::' || value === '::1') return false
  if (value.startsWith('fe80')) return false // link-local
  if (/^f[cd]/.test(value)) return false // unique local
  // ::ffff:10.0.0.1 and friends are IPv4 wearing a hat.
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPublicV4(mapped[1])
  return true
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    if (!isPublicAddress(host)) {
      throw new FeedError('That link points inside a private network, so it was not fetched.')
    }
    return
  }
  let addresses: Array<{ address: string }>
  try {
    addresses = await lookup(host, { all: true })
  } catch {
    throw new FeedError(`Could not find ${host}. Check the link and try again.`)
  }
  if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
    throw new FeedError('That link resolves inside a private network, so it was not fetched.')
  }
}

/** Read a published calendar. Throws a `FeedError` a user can act on. */
export async function fetchCalendar(rawUrl: string): Promise<FeedFetch> {
  let url = normaliseFeedUrl(rawUrl)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(url, {
        // Followed by hand, so every hop gets checked and not just the first.
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5' },
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new FeedError('The calendar took too long to answer. Try again in a minute.')
      }
      throw new FeedError('Could not reach that calendar. Check the link is still published.')
    } finally {
      clearTimeout(timer)
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new FeedError('That calendar link redirects nowhere.')
      url = normaliseFeedUrl(new URL(location, url).toString())
      continue
    }

    if (response.status === 401 || response.status === 403) {
      throw new FeedError(
        'That calendar would not let us in. Publish it again and copy the new link — ' +
        'these links expire when a calendar is unpublished.',
      )
    }
    if (response.status === 404) {
      throw new FeedError('There is no calendar at that link any more.')
    }
    if (!response.ok) {
      throw new FeedError(`The calendar server answered ${response.status}. Try again later.`)
    }

    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > MAX_BYTES) {
      throw new FeedError('That calendar is enormous. Export a narrower date range instead.')
    }

    const ics = await readCapped(response)
    if (!/BEGIN:VCALENDAR/i.test(ics)) {
      throw new FeedError(
        'That link returned a web page rather than a calendar. Use the .ics address, ' +
        'not the one that opens the calendar in a browser.',
      )
    }
    return { ics, finalUrl: url.toString(), bytes: ics.length }
  }

  throw new FeedError('That calendar link redirects too many times.')
}

/** Read the body, stopping rather than filling memory with somebody's 90MB feed. */
async function readCapped(response: Response): Promise<string> {
  if (!response.body) return response.text()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > MAX_BYTES) {
      await reader.cancel()
      throw new FeedError('That calendar is enormous. Export a narrower date range instead.')
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

/** Show a stored feed link without printing the token in it back at full length. */
export function describeFeedUrl(raw: string): string {
  try {
    const url = new URL(raw)
    const path = url.pathname.length > 24 ? `${url.pathname.slice(0, 12)}…` : url.pathname
    return `${url.hostname}${path}`
  } catch {
    return 'a calendar link'
  }
}
