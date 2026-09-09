import type { MetadataRoute } from 'next'
import { GUIDES, STANDALONE_PAGES } from '@/lib/content/guides'
import { absolute } from '@/lib/site'

// Read at request time, for the same reason as robots.txt: the origin has to
// be the one this deployment is actually served from.
export const dynamic = 'force-dynamic'

/**
 * Only the pages somebody can read without an account go in here. Everything
 * behind the session redirects to sign-in, and a sitemap full of redirects is
 * worse than no sitemap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return [
    { url: absolute('/'), lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: absolute('/guides'), lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    ...STANDALONE_PAGES.map((page) => ({
      url: absolute(page.href),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    })),
    ...GUIDES.map((g) => ({
      url: absolute(`/guides/${g.slug}`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]
}
