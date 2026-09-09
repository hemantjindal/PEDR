import type { MetadataRoute } from 'next'
import { absolute, isPublicSite } from '@/lib/site'

// Read at request time. A robots.txt frozen at build time is a robots.txt that
// says whatever the environment happened to say on the build machine.
export const dynamic = 'force-dynamic'

/**
 * Preview and local builds are closed off entirely. A preview deployment that
 * gets indexed competes with the real site for its own pages, and the fix
 * afterwards is slow.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isPublicSite()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Everything below these needs a session, so a crawler only ever sees
        // a redirect to the sign-in form.
        // These are prefixes, which is the trap: a bare "/guide" would also
        // block every /guides page. The "$" anchors it to that one path.
        disallow: [
          '/api/', '/dashboard', '/weeks', '/sheets', '/coverage', '/exam', '/dump',
          '/calendar', '/catch-up', '/projects', '/review', '/settings', '/start',
          '/welcome', '/guide$',
        ],
      },
    ],
    sitemap: absolute('/sitemap.xml'),
  }
}
