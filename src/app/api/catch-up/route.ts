import { requireUser } from '@/lib/auth'
import { fail, handler, ok, readJson } from '@/lib/api'
import { getEntries, getKnownPeople, getProjects } from '@/lib/data'
import { calendarToEntries, parseDump } from '@/lib/ingest'
import { parseCalendar } from '@/lib/ingest/calendar'
import { recover, type SourceBatch } from '@/lib/pedr/recover'
import { isDateKey, todayKey } from '@/lib/pedr/week'
import type { DraftEntry } from '@/lib/pedr/types'

export const runtime = 'nodejs'
export const maxDuration = 60

interface Body {
  from: string
  to: string
  /** Whatever they have. Any combination, in any order. */
  calendar?: string
  timesheet?: string
  teams?: string
  notes?: string
}

/**
 * Reconstruct a period from whatever already exists.
 *
 * Every parser this app has, pointed backwards at once. Nothing is saved here
 * — the whole point of catching up is that somebody reads a couple of hundred
 * recovered entries before any of them reach a record a mentor signs.
 */
export const POST = handler(async (request: Request) => {
  const user = await requireUser()
  const body = await readJson<Body>(request)

  if (!isDateKey(body.from) || !isDateKey(body.to)) return fail('Pick a period first.')
  if (body.from > body.to) return fail('That period runs backwards.')

  const [projects, knownPeople, existing] = await Promise.all([
    getProjects(user.id),
    getKnownPeople(user.id),
    getEntries(user.id, { from: body.from, to: body.to }),
  ])

  const today = todayKey()
  const parseOpts = { reference: today, projects, knownPeople, me: user.teamsName ?? user.name }
  const sources: SourceBatch[] = []
  const warnings: string[] = []

  if (body.calendar?.trim()) {
    const parsed = parseCalendar(body.calendar, {
      from: body.from,
      to: body.to,
      email: user.email,
      name: user.name,
    })
    warnings.push(...parsed.warnings)
    sources.push({
      source: 'calendar',
      label: 'Your calendar',
      entries: calendarToEntries(parsed, parseOpts),
    })
  }

  for (const [key, label, source] of [
    ['timesheet', 'Your timesheet', 'timesheet'],
    ['teams', 'Teams', 'teams'],
    ['notes', 'What you remember', 'memory'],
  ] as const) {
    const raw = body[key]?.trim()
    if (!raw) continue
    const parsed = parseDump(raw, {
      ...parseOpts,
      // A pasted timesheet is a timesheet; the rest can be sniffed.
      kind: key === 'timesheet' ? 'timesheet' : undefined,
      // Reconstructing months, an undated line belongs to nothing rather than
      // to today, so anything the parser could not date is dropped below.
    })
    warnings.push(...parsed.warnings)
    sources.push({ source, label, entries: parsed.entries })
  }

  if (sources.length === 0) return fail('Give it something to work from.')

  const report = recover({
    from: body.from,
    to: body.to,
    sources,
    existing: existing as unknown as DraftEntry[],
  })

  return ok({ ...report, warnings })
})
