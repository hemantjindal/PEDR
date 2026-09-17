import { cookies } from 'next/headers'
import { requireUser } from '@/lib/auth'
import { getProvider } from '@/lib/connectors'
import { firstWindowFrom, syncConnection } from '@/lib/connectors/sync'
import { subscribeConnection } from '@/lib/connectors/watch'
import { upsertConnection } from '@/lib/data'
import { encryptSecret, secretsMatch } from '@/lib/secrets'
import { todayKey } from '@/lib/pedr/week'
import { absolute } from '@/lib/site'
import { HANDSHAKE_COOKIE } from '@/lib/connectors/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Handshake {
  state: string
  verifier: string
  provider: string
  userId: string
}

/**
 * Coming back with an authorization code.
 *
 * Everything here is checked before the code is spent: the state must match the
 * one this browser was given, the cookie must name the same provider as the
 * URL, and the signed-in user must be the one who started it. A code arriving
 * without all three is somebody else's — or nobody's.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const user = await requireUser()
  const { provider: id } = await context.params
  const url = new URL(request.url)

  const jar = await cookies()
  const raw = jar.get(HANDSHAKE_COOKIE)?.value
  jar.delete(HANDSHAKE_COOKIE)

  // The provider says no by redirecting back with an error rather than a code.
  const denied = url.searchParams.get('error')
  if (denied) {
    return back(denied === 'access_denied' ? 'declined' : 'failed')
  }

  const provider = getProvider(id)
  if (!provider) return back('unknown-provider')

  let handshake: Handshake | null = null
  try {
    handshake = raw ? (JSON.parse(raw) as Handshake) : null
  } catch {
    handshake = null
  }
  if (!handshake) return back('expired')

  const state = url.searchParams.get('state') ?? ''
  if (!secretsMatch(handshake.state, state)) return back('state')
  if (handshake.provider !== provider.id) return back('state')
  if (handshake.userId !== user.id) return back('state')

  const code = url.searchParams.get('code')
  if (!code) return back('failed')

  try {
    const tokens = await provider.exchange({
      code,
      redirectUri: absolute(`/api/connect/${provider.id}/callback`),
      verifier: handshake.verifier,
    })

    const identity = await provider.identity(tokens.accessToken)

    const connection = await upsertConnection({
      userId: user.id,
      provider: provider.id,
      accountEmail: identity.email,
      accountName: identity.name,
      calendarId: 'primary',
      calendarName: 'Calendar',
      accessToken: encryptSecret(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      windowFrom: firstWindowFrom(user.experienceStart, todayKey()),
    })

    // Read it once now, so the screen they land on has something on it rather
    // than an empty panel and a promise.
    const outcome = await syncConnection(connection, { reason: 'connecting' })

    // And ask to be told about changes from here on. A failure is not fatal —
    // the scheduled sync still runs — so it must not fail the connection.
    await subscribeConnection(connection).catch(() => undefined)

    if (!outcome.ok) return back('sync-failed')
    return back('connected')
  } catch {
    return back('failed')
  }
}

function back(reason: string): Response {
  return Response.redirect(absolute(`/calendar?connect=${reason}`), 302)
}
