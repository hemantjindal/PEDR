import { cookies } from 'next/headers'
import { requireUser } from '@/lib/auth'
import { getProvider } from '@/lib/connectors'
import { createPkce, randomToken, HANDSHAKE_COOKIE, HANDSHAKE_MINUTES } from '@/lib/connectors/oauth'
import { canStoreSecrets } from '@/lib/secrets'
import { absolute } from '@/lib/site'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Send somebody off to authorise their calendar.
 *
 * The state and the PKCE verifier go in an httpOnly cookie rather than a table.
 * They are needed for exactly one round trip through the browser that is
 * already holding them, a row would outlive its usefulness by weeks, and a
 * cookie cannot be read by the provider or by script on the page.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const user = await requireUser()
  const { provider: id } = await context.params

  const provider = getProvider(id)
  if (!provider) return back('unknown-provider')
  if (!canStoreSecrets()) return back('no-key')
  if (!provider.configured()) return back('not-configured')

  const state = randomToken(24)
  const { verifier, challenge } = createPkce()

  const jar = await cookies()
  jar.set(
    HANDSHAKE_COOKIE,
    JSON.stringify({ state, verifier, provider: provider.id, userId: user.id }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      // The provider redirects back as a top-level GET from its own origin, so
      // the cookie has to survive a cross-site navigation. 'lax' does that for
      // GET and still blocks it being sent on a cross-site POST.
      sameSite: 'lax',
      path: '/',
      maxAge: HANDSHAKE_MINUTES * 60,
    },
  )

  return Response.redirect(
    provider.authorizeUrl({
      redirectUri: absolute(`/api/connect/${provider.id}/callback`),
      state,
      challenge,
    }),
    302,
  )
}

function back(reason: string): Response {
  return Response.redirect(absolute(`/calendar?connect=${reason}`), 302)
}
