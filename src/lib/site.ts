/**
 * Where this thing lives on the internet.
 *
 * Canonical URLs, the sitemap and OpenGraph cards all need an absolute origin,
 * and Next needs it at build time as well as at request time. `APP_URL` is
 * already the variable the ICS feed and the settings page use, so it stays the
 * one place to set it.
 */

const FALLBACK = 'http://localhost:3000'

/** The origin, with no trailing slash. */
export function origin(): string {
  // APP_URL is the one to set. VERCEL_PROJECT_PRODUCTION_URL is a safety net:
  // Vercel sets it on every build and every request, and it always names the
  // production domain, so forgetting APP_URL costs you nothing worse than a
  // vercel.app canonical rather than a localhost one.
  const raw = (process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim()
  if (!raw) return FALLBACK
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withScheme.replace(/\/+$/, '')
}

/** An absolute URL for a path like `/guides/pedr-deadlines`. */
export function absolute(path = '/'): string {
  return `${origin()}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * True when this deployment is the real, public one.
 *
 * Preview builds and local runs must not be indexed — otherwise a half-written
 * copy of every guide competes with the real one in search results.
 */
export function isPublicSite(): boolean {
  // A preview deployment inherits the production domain through
  // VERCEL_PROJECT_PRODUCTION_URL, so https on its own is not enough to prove
  // this is the real site.
  const env = process.env.VERCEL_ENV
  if (env && env !== 'production') return false
  return origin().startsWith('https://')
}

export const SITE = {
  name: 'PEDR',
  /** Used as the title suffix. Kept short: it eats characters in a result. */
  titleSuffix: 'PEDR',
  tagline: 'Catch up on your PEDR',
  description:
    'Months behind on your PEDR? It is already written down — in your calendar and your ' +
    'timesheet. This pulls it back out, week by week, and says which weeks it could not reach.',
} as const
