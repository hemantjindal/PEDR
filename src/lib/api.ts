import { NextResponse } from 'next/server'
import { UnauthorisedError } from './auth'

/** JSON helpers shared by the route handlers. */

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Wrap a handler so an unauthenticated caller gets a 401 and an unexpected
 * error gets a 500 without leaking a stack trace into the response.
 */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args)
    } catch (error) {
      if (error instanceof UnauthorisedError) return fail('Sign in first.', 401)
      console.error('[api]', error)
      return fail('Something went wrong. Nothing was saved.', 500)
    }
  }
}

/** Parse a JSON body, with a size guard so a huge paste cannot wedge the route. */
export async function readJson<T>(request: Request, maxBytes = 4_000_000): Promise<T> {
  const text = await request.text()
  if (text.length > maxBytes) {
    throw new Error(`Body too large: ${text.length} bytes`)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Body was not valid JSON')
  }
}
