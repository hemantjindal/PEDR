import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GUIDES, GUIDE_SLUGS, guide, STANDALONE_PAGES } from '@/lib/content/guides'
import { SHEET_RULES, REQUIREMENTS } from '@/lib/pedr/constants'
import { absolute, isPublicSite, origin } from '@/lib/site'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'

/**
 * These pages exist to be found. That makes a handful of dull properties —
 * unique slugs, a description that fits in a search result, an answer before
 * the detail — load-bearing rather than cosmetic, so they are checked.
 */
describe('guides', () => {
  it('has unique slugs, all lower-case and hyphenated', () => {
    expect(new Set(GUIDE_SLUGS).size).toBe(GUIDE_SLUGS.length)
    for (const slug of GUIDE_SLUGS) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('does not collide with the standalone pages', () => {
    for (const page of STANDALONE_PAGES) expect(GUIDE_SLUGS).not.toContain(page.slug)
  })

  it('writes meta descriptions that survive a search result', () => {
    for (const g of GUIDES) {
      // Under about 110 and a search engine pads it; over about 160 and it is
      // truncated mid-sentence.
      expect(g.description.length, `${g.slug} description`).toBeGreaterThanOrEqual(110)
      expect(g.description.length, `${g.slug} description`).toBeLessThanOrEqual(200)
      expect(g.metaTitle.length, `${g.slug} title`).toBeLessThanOrEqual(60)
    }
  })

  it('answers the question before any of the detail', () => {
    for (const g of GUIDES) {
      expect(g.question.length, `${g.slug} question`).toBeGreaterThan(10)
      expect(g.answer.length, `${g.slug} answer`).toBeGreaterThan(40)
      expect(g.faq.length, `${g.slug} faq`).toBeGreaterThanOrEqual(2)
      for (const f of g.faq) {
        expect(f.q.trim().endsWith('?'), `${g.slug}: "${f.q}"`).toBe(true)
        // Emitted as structured data, so it has to read as plain prose.
        expect(f.a).not.toMatch(/[<>]/)
        expect(f.a.length).toBeGreaterThan(40)
      }
    }
  })

  it('only points at guides that exist', () => {
    const known = new Set<string>([
      ...GUIDE_SLUGS,
      ...STANDALONE_PAGES.map((p) => p.slug),
    ])
    for (const g of GUIDES) {
      for (const slug of g.related) {
        expect(known.has(slug), `${g.slug} → ${slug}`).toBe(true)
        expect(slug).not.toBe(g.slug)
      }
    }
  })

  it('quotes the rules rather than retyping them', () => {
    // If SHEET_RULES ever changes, these pages have to change with it. The
    // cheapest guarantee of that is that the numbers are interpolated, so a
    // guide that mentions the deadline mentions the current one.
    const deadlines = guide('pedr-deadlines')
    expect(deadlines).toBeDefined()
    expect(deadlines!.answer).toContain(String(SHEET_RULES.requiredSheets))
    expect(deadlines!.answer).toContain(String(REQUIREMENTS.minTotalMonths))
  })

  it('renders every guide body without throwing', () => {
    for (const g of GUIDES) expect(() => g.body()).not.toThrow()
  })
})

describe('site urls', () => {
  it('builds absolute urls with no double slash', () => {
    expect(absolute('/guides')).toBe(`${origin()}/guides`)
    expect(absolute('guides')).toBe(`${origin()}/guides`)
    expect(origin().endsWith('/')).toBe(false)
  })

  it('refuses to look public without https', () => {
    // Local and preview builds must not invite crawlers in.
    expect(isPublicSite()).toBe(origin().startsWith('https://'))
  })
})

describe('crawler rules', () => {
  // Without this the site looks like a local build, robots.txt is a single
  // "Disallow: /", and the interesting rules are never exercised at all.
  beforeEach(() => {
    vi.stubEnv('APP_URL', 'https://pedr.test')
    vi.stubEnv('VERCEL_ENV', 'production')
  })
  afterEach(() => vi.unstubAllEnvs())

  const publicPaths = [
    '/',
    '/guides',
    '/what-is-a-pedr',
    '/behind',
    ...GUIDE_SLUGS.map((slug) => `/guides/${slug}`),
  ]

  it('never blocks a page it also advertises', () => {
    // robots.txt paths are prefixes, so a rule for the signed-in "/guide" page
    // silently takes "/guides" and everything under it with it unless it is
    // anchored. This is the check that catches that.
    const rules = robots().rules
    const disallow = (Array.isArray(rules) ? rules : [rules])
      .flatMap((r) => (Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : []))
    // If this is empty the rest of the test proves nothing.
    expect(disallow.length).toBeGreaterThan(5)
    expect(disallow).not.toContain('/')

    for (const path of publicPaths) {
      for (const rule of disallow) {
        const blocked = rule.endsWith('$') ? path === rule.slice(0, -1) : path.startsWith(rule)
        expect(blocked, `${rule} blocks ${path}`).toBe(false)
      }
    }
  })

  it('lists every public page in the sitemap, and nothing else', () => {
    const urls = sitemap().map((entry) => entry.url)
    expect([...urls].sort()).toEqual(publicPaths.map((p) => absolute(p)).sort())
    expect(new Set(urls).size).toBe(urls.length)
  })
})
