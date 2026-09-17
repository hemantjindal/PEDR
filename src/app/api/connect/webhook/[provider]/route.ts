import { findConnectionByChannel } from '@/lib/data'
import { syncConnection } from '@/lib/connectors/sync'
import { secretsMatch } from '@/lib/secrets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * A provider telling us a calendar changed.
 *
 * This endpoint is public — it has to be, the providers are not going to sign
 * in — so it assumes every request is hostile until proved otherwise. Nothing
 * in the body is trusted and nothing in the body is needed: the channel id
 * names a connection, the secret proves the caller is the provider that
 * channel was created for, and then this app goes and reads the calendar
 * itself over an authenticated connection. A forged notification at worst
 * causes a sync that was going to happen anyway.
 *
 * It always answers 200. A provider that gets an error back retries, and then
 * disables the subscription after enough of them; there is nothing useful to
 * say to it about a channel we no longer recognise.
 */

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params
  const url = new URL(request.url)

  // Microsoft proves the endpoint is ours before it will create a subscription:
  // echo the token back as plain text, within ten seconds, or no subscription.
  const validation = url.searchParams.get('validationToken')
  if (validation) {
    return new Response(validation, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  if (provider === 'google') return handleGoogle(request)
  if (provider === 'microsoft') return handleMicrosoft(request)
  return ok()
}

/**
 * Google also validates by GET in some configurations, and a browser hitting
 * this URL should not see an error page either.
 */
export async function GET(request: Request) {
  const validation = new URL(request.url).searchParams.get('validationToken')
  if (validation) {
    return new Response(validation, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
  return ok()
}

/**
 * Google sends an empty body and puts everything in headers. The first
 * notification after a watch is created is a 'sync' handshake with nothing
 * behind it, so it is acknowledged and ignored.
 */
async function handleGoogle(request: Request): Promise<Response> {
  const channelId = request.headers.get('x-goog-channel-id')
  const token = request.headers.get('x-goog-channel-token')
  const state = request.headers.get('x-goog-resource-state')

  if (!channelId) return ok()
  if (state === 'sync') return ok()

  const connection = await findConnectionByChannel(channelId)
  if (!connection || !connection.enabled) return ok()
  if (!secretsMatch(connection.channelSecret, token)) return ok()

  await syncConnection(connection, { reason: 'a change in your calendar' }).catch(() => undefined)
  return ok()
}

interface GraphNotification {
  subscriptionId?: string
  clientState?: string
}

/**
 * Microsoft posts a batch of notifications. Several edits at once arrive
 * together, and they all mean the same thing here — read the calendar again —
 * so the connections are de-duplicated before anything is synced.
 */
async function handleMicrosoft(request: Request): Promise<Response> {
  let body: { value?: GraphNotification[] }
  try {
    body = (await request.json()) as { value?: GraphNotification[] }
  } catch {
    return ok()
  }

  const seen = new Set<string>()
  for (const notification of body.value ?? []) {
    const channelId = notification.subscriptionId
    if (!channelId || seen.has(channelId)) continue
    seen.add(channelId)

    const connection = await findConnectionByChannel(channelId)
    if (!connection || !connection.enabled) continue
    if (!secretsMatch(connection.channelSecret, notification.clientState)) continue

    await syncConnection(connection, { reason: 'a change in your calendar' }).catch(() => undefined)
  }

  return ok()
}

function ok(): Response {
  return new Response(null, { status: 200 })
}
