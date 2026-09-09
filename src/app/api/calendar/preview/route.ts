import { requireUser } from '@/lib/auth'
import { fail, handler, ok, readJson } from '@/lib/api'
import { findImportedExternalIds, getCalendarFeed, getKnownPeople, getProjects } from '@/lib/data'
import { calendarToEntries } from '@/lib/ingest'
import { defaultWindow, parseCalendar } from '@/lib/ingest/calendar'
import { fetchCalendar, FeedError } from '@/lib/ingest/feed'
import { isDateKey, todayKey } from '@/lib/pedr/week'

export const runtime = 'nodejs'
export const maxDuration = 60

interface Body {
  /** A pasted or uploaded .ics file. */
  ics?: string
  /** Or a published calendar address to read. */
  url?: string
  /** Or a feed already linked, re-read using its stored address. */
  feedId?: string
  from?: string
  to?: string
  ignore?: string[]
  minMinutes?: number
}

/**
 * Read a calendar and show what it would put on the record, without saving any
 * of it. Events already imported are marked rather than dropped, so the count
 * on the screen matches the calendar the person is looking at.
 */
export const POST = handler(async (request: Request) => {
  const user = await requireUser()
  const body = await readJson<Body>(request)

  const today = todayKey()
  const window = defaultWindow(today, 3)
  const from = body.from && isDateKey(body.from) ? body.from : window.from
  const to = body.to && isDateKey(body.to) ? body.to : window.to
  if (from > to) return fail('That date range runs backwards.')

  let ics = body.ics ?? ''
  let source = 'the file you uploaded'
  let url: string | null = null
  let ignore = Array.isArray(body.ignore) ? body.ignore.slice(0, 60).map(String) : []

  if (body.feedId) {
    const feed = await getCalendarFeed(user.id, body.feedId)
    if (!feed) return fail('That calendar is not linked any more.')
    if (!feed.url) return fail('That calendar was a one-off upload, so there is nothing to re-read.')
    url = feed.url
    ignore = [...ignore, ...feed.ignore]
    source = feed.name
  } else if (body.url) {
    url = body.url
  }

  if (url) {
    try {
      const fetched = await fetchCalendar(url)
      ics = fetched.ics
      url = fetched.finalUrl
    } catch (error) {
      if (error instanceof FeedError) return fail(error.message)
      throw error
    }
  }

  if (!ics.trim()) return fail('Give us a calendar link or an .ics file.')
  if (ics.length > 8_000_000) return fail('That calendar is enormous. Export a shorter range.')

  const parsed = parseCalendar(ics, {
    from,
    to,
    email: user.email,
    name: user.name,
    ignore,
    minMinutes: typeof body.minMinutes === 'number' ? clampMinutes(body.minMinutes) : undefined,
  })

  const [projects, knownPeople] = await Promise.all([
    getProjects(user.id),
    getKnownPeople(user.id),
  ])

  const entries = calendarToEntries(parsed, { reference: today, projects, knownPeople })
  const already = await findImportedExternalIds(
    user.id,
    entries.map((e) => e.externalId).filter((id): id is string => Boolean(id)),
  )

  const fresh = entries.filter((e) => !e.externalId || !already.has(e.externalId))
  const warnings = [...parsed.warnings]

  // The honest limit of this whole feature, said once, where it matters.
  if (fresh.length > 0) {
    warnings.push(
      'A calendar records meetings, not work. The hours below are the meetings only — ' +
      'the desk time still has to go in by hand.',
    )
  }

  return ok({
    source,
    url,
    from,
    to,
    entries: fresh,
    warnings,
    skipped: parsed.skipped.slice(0, 200),
    stats: {
      found: parsed.events.length,
      alreadyImported: entries.length - fresh.length,
      filtered: parsed.skipped.length,
      days: new Set(fresh.map((e) => e.date)).size,
      totalMinutes: fresh.reduce((sum, e) => sum + e.minutes, 0),
      people: new Set(fresh.flatMap((e) => e.people)).size,
    },
  })
})

function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 15
  return Math.max(0, Math.min(240, Math.round(value)))
}
