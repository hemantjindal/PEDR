import { createHash, randomBytes } from 'node:crypto'
import { ProviderError, type Tokens } from './types'

/**
 * The parts of OAuth that are the same whoever you are talking to.
 *
 * PKCE throughout, even though both providers here support a client secret.
 * The authorization code travels back through the user's browser, and a code
 * that is useless without the verifier is one less thing that can be replayed
 * out of a browser history, a referrer header or a shared screen.
 */

/**
 * Where the state and PKCE verifier live between the two halves of the
 * handshake. A route file may only export route handlers, so this cannot sit
 * next to the route that sets it.
 */
export const HANDSHAKE_COOKIE = 'pedr.oauth'
export const HANDSHAKE_MINUTES = 10

export interface Pkce {
  verifier: string
  challenge: string
}

export function createPkce(): Pkce {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/**
 * Exchange or refresh, which are the same request with different grants.
 *
 * Errors are surfaced with the provider's own `error` code where there is one,
 * because "invalid_grant" is the difference between "try again in a second"
 * and "this person revoked us and has to connect again".
 */
export async function tokenRequest(
  url: string,
  form: Record<string, string>,
): Promise<Tokens> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams(form).toString(),
  })

  const text = await response.text()
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    // Left empty: a non-JSON body is reported through the status below.
  }

  if (!response.ok) {
    const code = typeof body.error === 'string' ? body.error : `HTTP ${response.status}`
    const detail =
      typeof body.error_description === 'string' ? body.error_description : text.slice(0, 200)
    throw new ProviderError(`${code}: ${detail}`, {
      status: response.status,
      // The grant is gone: consent withdrawn, password changed, token expired
      // past its refresh window. Nothing to do but ask for it again.
      reauth: code === 'invalid_grant' || code === 'invalid_client',
    })
  }

  const accessToken = typeof body.access_token === 'string' ? body.access_token : null
  if (!accessToken) {
    throw new ProviderError('The provider returned no access token.', { status: response.status })
  }

  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : null

  return {
    accessToken,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    scope: typeof body.scope === 'string' ? body.scope : null,
  }
}

/**
 * A GET against a provider API, with the failure modes named.
 *
 * 401 means the access token is stale — the caller refreshes and retries once.
 * 403 and 429 mean slow down or you are not allowed; neither is fixed by
 * reconnecting, so they are reported as-is rather than prompting a person to
 * re-authorise something that was already authorised.
 */
export async function apiGet(
  url: string,
  accessToken: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json', ...headers },
  })
  if (response.status === 401) {
    throw new ProviderError('The access token was rejected.', { status: 401, reauth: false })
  }
  if (!response.ok) {
    throw new ProviderError(await describe(response), { status: response.status })
  }
  return response
}

export async function apiSend(
  url: string,
  accessToken: string,
  init: { method: string; body?: unknown; headers?: Record<string, string> },
): Promise<Response> {
  const response = await fetch(url, {
    method: init.method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (response.status === 401) {
    throw new ProviderError('The access token was rejected.', { status: 401, reauth: false })
  }
  if (!response.ok) {
    throw new ProviderError(await describe(response), { status: response.status })
  }
  return response
}

async function describe(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  try {
    const body = JSON.parse(text) as { error?: { message?: string } | string }
    const error = body.error
    if (typeof error === 'string') return `HTTP ${response.status}: ${error}`
    if (error?.message) return `HTTP ${response.status}: ${error.message}`
  } catch {
    // Not JSON. The status and a slice of the body is all there is to say.
  }
  return `HTTP ${response.status}: ${text.slice(0, 200) || response.statusText}`
}
