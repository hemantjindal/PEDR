import ICAL from 'ical.js'
import type { DateKey } from '../pedr/week'
import { addDays, isDateKey, toDateKey } from '../pedr/week'
import { filterEvents, nullable, spanWorkingDays } from './events'
import type {
  CalendarOptions,
  CalendarParse,
  RawAttendee,
  RawPerson,
  RawSourceEvent,
} from './events'

/**
 * Reading a published calendar file.
 *
 * This is one of three ways a calendar gets in — the other two are the
 * Microsoft and Google connectors, which read the same calendar over an API and
 * keep reading it. All three end up in `filterEvents`, which owns every
 * decision about what counts. This file only turns iCalendar into that shape.
 *
 * It stays because not every practice will let you authorise an app against the
 * company tenant, and a .ics export is the thing you can always get hold of.
 */

export type {
  CalendarEvent,
  CalendarOptions,
  CalendarParse,
  CalendarSkip,
} from './events'
export { cleanDescription } from './events'

export function parseCalendar(ics: string, opts: CalendarOptions = {}): CalendarParse {
  let root: ICAL.Component
  try {
    root = new ICAL.Component(ICAL.parse(ics))
  } catch {
    return {
      events: [],
      skipped: [],
      warnings: ['That did not read as a calendar file. Export your calendar as .ics and try again.'],
      range: null,
    }
  }

  const vevents = root.getAllSubcomponents('vevent')
  if (vevents.length === 0) {
    return { events: [], skipped: [], warnings: ['No events in that calendar.'], range: null }
  }

  const myEmail = opts.email?.trim().toLowerCase() ?? null
  const sources: RawSourceEvent[] = []

  for (const vevent of vevents) {
    let event: ICAL.Event
    try {
      event = new ICAL.Event(vevent)
    } catch {
      continue
    }

    sources.push({
      uid: event.uid ?? 'no-uid',
      summary: (event.summary ?? '').trim(),
      description: event.description ?? null,
      location: nullable(event.location),
      attendees: readAttendees(vevent),
      organiser: readOrganiser(vevent),
      cancelled:
        (vevent.getFirstPropertyValue('status') as string | null)?.toUpperCase() === 'CANCELLED',
      declined: myEmail ? declinedBy(vevent, myEmail) : false,
      free: isFree(vevent),
      recurring: event.isRecurring(),
      occurrences: expand(event, opts.from, opts.to),
    })
  }

  return filterEvents(sources, opts)
}

/**
 * One occurrence per instance, expanding a recurrence rule across the window.
 * Bounded hard: a daily meeting with no end date would otherwise run forever.
 */
function expand(
  event: ICAL.Event,
  from: DateKey | undefined,
  to: DateKey | undefined,
): Array<{ date: DateKey; minutes: number; allDay: boolean }> {
  const allDay = Boolean(event.startDate?.isDate)
  const minutes = Math.max(0, Math.round((event.duration?.toSeconds() ?? 0) / 60))

  if (!event.isRecurring()) {
    const date = dateKeyOf(event.startDate)
    if (!date) return []
    // A week booked off is one VEVENT spanning five days. Recording it as a
    // single Monday would leave four days looking unaccounted for.
    if (allDay) return spanWorkingDays(date, dateKeyOf(event.endDate), minutes)
    return [{ date, minutes, allDay }]
  }

  const out: Array<{ date: DateKey; minutes: number; allDay: boolean }> = []
  try {
    const iterator = event.iterator()
    let next: ICAL.Time | null
    let guard = 0
    while ((next = iterator.next()) && guard < 800) {
      guard++
      const date = dateKeyOf(next)
      if (!date) continue
      if (to && date > to) break
      if (from && date < from) continue
      out.push({ date, minutes, allDay })
    }
  } catch {
    // A rule we cannot expand still has its first instance, which is better
    // than dropping the event entirely.
    const date = dateKeyOf(event.startDate)
    if (date) out.push({ date, minutes, allDay })
  }
  return out
}

/**
 * The calendar date as the event's own timezone shows it. Converting to UTC
 * first would move an early meeting in Sydney onto the previous day.
 */
function dateKeyOf(time: ICAL.Time | null | undefined): DateKey | null {
  if (!time) return null
  const key = `${String(time.year).padStart(4, '0')}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
  return isDateKey(key) ? key : null
}

function declinedBy(vevent: ICAL.Component, myEmail: string): boolean {
  for (const attendee of vevent.getAllProperties('attendee')) {
    const value = String(attendee.getFirstValue() ?? '').toLowerCase()
    if (!value.includes(myEmail)) continue
    const partstat = String(attendee.getParameter('partstat') ?? '').toUpperCase()
    return partstat === 'DECLINED'
  }
  return false
}

/** TRANSP:TRANSPARENT, or Outlook's own free/busy marker. */
function isFree(vevent: ICAL.Component): boolean {
  const transp = String(vevent.getFirstPropertyValue('transp') ?? '').toUpperCase()
  if (transp === 'TRANSPARENT') return true
  const busy = String(vevent.getFirstPropertyValue('x-microsoft-cdo-busystatus') ?? '').toUpperCase()
  return busy === 'FREE'
}

function readAttendees(vevent: ICAL.Component): RawAttendee[] {
  const out: RawAttendee[] = []
  for (const attendee of vevent.getAllProperties('attendee')) {
    const type = String(attendee.getParameter('cutype') ?? 'INDIVIDUAL').toUpperCase()
    const cn = attendee.getParameter('cn')
    out.push({
      name: typeof cn === 'string' && cn.trim() ? cn.trim() : null,
      email: String(attendee.getFirstValue() ?? '').replace(/^mailto:/i, '').toLowerCase() || null,
      resource: type !== 'INDIVIDUAL',
    })
  }
  return out
}

function readOrganiser(vevent: ICAL.Component): RawPerson | null {
  const organiser = vevent.getFirstProperty('organizer')
  if (!organiser) return null
  const cn = organiser.getParameter('cn')
  return {
    name: typeof cn === 'string' && cn.trim() ? cn.trim() : null,
    email: String(organiser.getFirstValue() ?? '').replace(/^mailto:/i, '').toLowerCase() || null,
  }
}

/** A sensible default window: the last N months up to today. */
export function defaultWindow(today: DateKey, months = 3): { from: DateKey; to: DateKey } {
  const d = new Date(`${today}T00:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() - months)
  return { from: toDateKey(d), to: addDays(today, 1) }
}
