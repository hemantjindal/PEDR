import { requireUser } from '@/lib/auth'
import { fail, handler, ok, readJson } from '@/lib/api'
import { createCalendarFeed, createDump, getCalendarFeeds, saveParsedEntries, updateCalendarFeed } from '@/lib/data'
import { sanitiseEntries } from '@/lib/entry-input'
import { PARSER_VERSION } from '@/lib/ingest'
import { FeedError, normaliseFeedUrl } from '@/lib/ingest/feed'
import { REVIEW_THRESHOLD, type DraftEntry } from '@/lib/pedr/types'

export const runtime = 'nodejs'

interface Body {
  entries: DraftEntry[]
  /** Where it came from, for the record of what was imported. */
  source?: string
  from?: string
  to?: string
  /** Save the address so this calendar can be synced again later. */
  link?: { name: string; url: string } | null
  /** Or update the feed that was just re-read. */
  feedId?: string
}

const MAX_FEEDS = 6

/** Commit a reviewed calendar import, and optionally remember the calendar. */
export const POST = handler(async (request: Request) => {
  const user = await requireUser()
  const body = await readJson<Body>(request)

  const checked = sanitiseEntries(body.entries, { source: 'calendar' })
  if (!checked.ok) return fail(checked.error)
  const clean = checked.entries
  if (clean.length === 0) return fail('Nothing to save.')

  // The dump row is the audit trail: what was imported, from where, and when.
  const dumpId = await createDump({
    userId: user.id,
    raw: [
      `Calendar import from ${body.source ?? 'a calendar'}`,
      body.from && body.to ? `Range ${body.from} to ${body.to}` : null,
      `${clean.length} events`,
      '',
      ...clean.map((e) => `${e.date}  ${minutesLabel(e.minutes)}  ${e.activity}`),
    ].filter(Boolean).join('\n'),
    kind: 'calendar',
    note: body.source ?? null,
  })

  const saved = await saveParsedEntries({
    userId: user.id,
    dumpId,
    entries: clean,
    parserVersion: PARSER_VERSION,
    enriched: false,
    // Coming back from the review screen counts as a human confirming it.
    autoVerify: true,
  })

  let feedId = body.feedId ?? null
  let feedError: string | null = null

  if (body.link?.url) {
    try {
      const url = normaliseFeedUrl(body.link.url).toString()
      const existing = await getCalendarFeeds(user.id)
      const match = existing.find((f) => f.url === url)
      if (match) {
        feedId = match.id
      } else if (existing.length >= MAX_FEEDS) {
        feedError = `You can link ${MAX_FEEDS} calendars. Remove one first.`
      } else {
        const feed = await createCalendarFeed({
          userId: user.id,
          name: body.link.name?.trim() || 'My calendar',
          url,
        })
        feedId = feed.id
      }
    } catch (error) {
      if (error instanceof FeedError) feedError = error.message
      else throw error
    }
  }

  if (feedId) {
    await updateCalendarFeed(user.id, feedId, {
      lastSyncedAt: new Date().toISOString(),
      lastImported: saved.length,
      lastSkipped: 0,
      lastError: null,
    })
  }

  return ok({
    dumpId,
    feedId,
    feedError,
    saved: saved.length,
    // Anything the review screen had already filtered out but that arrived
    // anyway — a stale tab, a double tap, two syncs at once.
    duplicates: clean.length - saved.length,
    needsReview: clean.filter((e) => e.confidence < REVIEW_THRESHOLD).length,
  })
})

function minutesLabel(minutes: number): string {
  return minutes >= 60 ? `${+(minutes / 60).toFixed(2)}h` : `${minutes}m`
}
