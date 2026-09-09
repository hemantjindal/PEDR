import ICAL from 'ical.js'
import type { DateKey } from '../pedr/week'
import { addDays, isDateKey, toDateKey } from '../pedr/week'

/**
 * Reading a calendar.
 *
 * This is the richest source there is. Your Outlook or Teams calendar already
 * records, for every working day, what you did, when, for how long, where, and
 * — uniquely — who else was in the room. A timesheet has none of that last
 * part, and "who you dealt with" is what shows the level you were operating at.
 * It was also written at the time, by you, which is the whole problem with
 * reconstructing a quarter from memory.
 *
 * The work here is almost entirely filtering. A real calendar is mostly noise:
 * lunch, focus blocks, holds, standups, meetings you declined, all-day markers
 * for other people's leave. Import it raw and you bury a good record under
 * three hundred entries nobody will read.
 */

export interface CalendarEvent {
  uid: string
  date: DateKey
  minutes: number
  summary: string
  description: string | null
  location: string | null
  /** Display names, never email addresses. */
  attendees: string[]
  organiser: string | null
  allDay: boolean
  recurring: boolean
  /** Set when this event was read as leave rather than as work. */
  leave: boolean
}

export interface CalendarSkip {
  summary: string
  date: DateKey | null
  reason: string
}

export interface CalendarParse {
  events: CalendarEvent[]
  /** What was left out, and why — so nobody wonders where Tuesday went. */
  skipped: CalendarSkip[]
  warnings: string[]
  range: { from: DateKey; to: DateKey } | null
}

export interface CalendarOptions {
  /** Only import events on or after this date. */
  from?: DateKey
  /** Only import events on or before this date. */
  to?: DateKey
  /** Your address, so meetings you declined can be dropped and you are not
   *  listed as somebody you dealt with. */
  email?: string
  /** Your name, for the same reason. */
  name?: string
  /** Extra title fragments to ignore, on top of the defaults. */
  ignore?: string[]
  /** Events shorter than this are noise. Defaults to 15 minutes. */
  minMinutes?: number
  /** Length of a working day, for all-day leave. Defaults to 7.5 hours. */
  standardDayMinutes?: number
  /** Hard cap so one all-hands does not add forty people to a record. */
  maxAttendees?: number
}

/** Titles that are never practical experience. */
const NOISE = [
  'lunch', 'break', 'coffee', 'gym', 'commute', 'travel home', 'focus time',
  'focus block', 'do not book', 'do not disturb', 'busy', 'hold', 'placeholder',
  'blocked', 'no meetings', 'tentative hold', 'prep time', 'buffer',
  'daily standup', 'stand-up', 'standup', 'scrum', 'wfh', 'working from home',
  'dentist', 'doctor', 'appointment', 'school run', 'birthday', 'anniversary',
]

/** Titles that mean absence. Recorded, but not as experience. */
const LEAVE = [
  'annual leave', 'holiday', 'vacation', 'out of office', 'ooo', 'o.o.o',
  'off sick', 'sick leave', 'sick day', 'bank holiday', 'public holiday',
  'toil', 'day off', 'leave', 'paternity', 'maternity', 'compassionate',
]

export function parseCalendar(ics: string, opts: CalendarOptions = {}): CalendarParse {
  const {
    from, to, email, name,
    minMinutes = 15,
    standardDayMinutes = 450,
    maxAttendees = 8,
  } = opts

  const ignore = [...NOISE, ...(opts.ignore ?? []).map((s) => s.toLowerCase())]
  const events: CalendarEvent[] = []
  const skipped: CalendarSkip[] = []
  const warnings: string[] = []

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

  const myEmail = email?.trim().toLowerCase() ?? null
  const myName = name?.trim().toLowerCase() ?? null

  for (const vevent of vevents) {
    let event: ICAL.Event
    try {
      event = new ICAL.Event(vevent)
    } catch {
      continue
    }

    const summary = (event.summary ?? '').trim()
    const lower = summary.toLowerCase()

    // Cancelled meetings did not happen.
    if ((vevent.getFirstPropertyValue('status') as string | null)?.toUpperCase() === 'CANCELLED') {
      skipped.push({ summary, date: null, reason: 'cancelled' })
      continue
    }

    // A meeting you declined is not experience.
    if (myEmail && declinedBy(vevent, myEmail)) {
      skipped.push({ summary, date: null, reason: 'you declined it' })
      continue
    }

    // Marked free in the calendar means it was not really being done.
    if (isFree(vevent)) {
      skipped.push({ summary, date: null, reason: 'marked free' })
      continue
    }

    const isLeave = LEAVE.some((word) => matches(lower, word))
    if (!isLeave && ignore.some((word) => matches(lower, word))) {
      skipped.push({ summary, date: null, reason: 'routine' })
      continue
    }
    if (!summary) {
      skipped.push({ summary: '(untitled)', date: null, reason: 'no title' })
      continue
    }

    for (const occurrence of expand(event, from, to)) {
      const { date, minutes, allDay } = occurrence

      if (from && date < from) continue
      if (to && date > to) continue

      // An all-day block is somebody's leave marker far more often than a day
      // of work. Keep it only when it says so.
      if (allDay && !isLeave) {
        skipped.push({ summary, date, reason: 'all-day marker' })
        continue
      }

      const length = allDay ? standardDayMinutes : minutes
      if (!isLeave && length < minMinutes) {
        skipped.push({ summary, date, reason: `under ${minMinutes} minutes` })
        continue
      }

      events.push({
        uid: `${event.uid ?? 'no-uid'}:${date}`,
        date,
        minutes: Math.min(length, 12 * 60),
        summary,
        description: cleanDescription(event.description),
        location: nullable(event.location),
        attendees: readAttendees(vevent, { myEmail, myName, max: maxAttendees }),
        organiser: readOrganiser(vevent, myEmail),
        allDay,
        recurring: event.isRecurring(),
        leave: isLeave,
      })
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.summary.localeCompare(b.summary))

  if (events.length === 0 && skipped.length > 0) {
    warnings.push(
      `Every one of the ${skipped.length} events was filtered out as routine, declined or all-day. ` +
      'Widen the date range or check you exported the right calendar.',
    )
  }
  const recurringCount = events.filter((e) => e.recurring).length
  if (recurringCount > events.length * 0.6 && events.length > 10) {
    warnings.push(
      'Most of these are recurring meetings. Worth checking they are all things you actually attended.',
    )
  }

  return {
    events,
    skipped,
    warnings,
    range: events.length
      ? { from: events[0].date, to: events[events.length - 1].date }
      : null,
  }
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
    return date ? [{ date, minutes, allDay }] : []
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

function readAttendees(
  vevent: ICAL.Component,
  opts: { myEmail: string | null; myName: string | null; max: number },
): string[] {
  const names: string[] = []
  for (const attendee of vevent.getAllProperties('attendee')) {
    // Rooms and equipment are not people you dealt with.
    const type = String(attendee.getParameter('cutype') ?? 'INDIVIDUAL').toUpperCase()
    if (type !== 'INDIVIDUAL') continue

    const address = String(attendee.getFirstValue() ?? '').replace(/^mailto:/i, '').toLowerCase()
    if (opts.myEmail && address === opts.myEmail) continue

    const cn = attendee.getParameter('cn')
    const name = typeof cn === 'string' && cn.trim() ? cn.trim() : prettifyAddress(address)
    if (!name) continue
    if (opts.myName && name.toLowerCase() === opts.myName) continue
    if (!names.includes(name)) names.push(name)
  }
  return names.slice(0, opts.max)
}

function readOrganiser(vevent: ICAL.Component, myEmail: string | null): string | null {
  const organiser = vevent.getFirstProperty('organizer')
  if (!organiser) return null
  const address = String(organiser.getFirstValue() ?? '').replace(/^mailto:/i, '').toLowerCase()
  if (myEmail && address === myEmail) return null
  const cn = organiser.getParameter('cn')
  return typeof cn === 'string' && cn.trim() ? cn.trim() : prettifyAddress(address)
}

/** Addresses nobody sits behind. "Info" is not somebody you dealt with. */
const ROLE_MAILBOXES = new Set([
  'info', 'admin', 'hello', 'hi', 'enquiries', 'inquiries', 'contact', 'office',
  'accounts', 'finance', 'invoices', 'hr', 'it', 'support', 'help', 'helpdesk',
  'noreply', 'no', 'donotreply', 'mail', 'post', 'reception', 'team', 'all',
  'everyone', 'staff', 'notifications', 'calendar', 'meetings', 'rooms', 'room',
  'projects', 'design', 'studio', 'marketing', 'careers', 'jobs', 'recruitment',
])

/** "sarah.chen@practice.com" -> "Sarah Chen". Better than an email on a record. */
function prettifyAddress(address: string): string | null {
  const local = address.split('@')[0]
  if (!local) return null
  const parts = local.split(/[._\-+]+/).filter((w) => w.length > 1 && /^[a-z]+$/i.test(w))
  if (parts.length === 0 || parts.length > 3) return null
  // A single-word mailbox is a person only if it is not a department.
  if (parts.length === 1 && ROLE_MAILBOXES.has(parts[0].toLowerCase())) return null
  return parts.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

/** Whole-word match, so "leave" does not fire inside "leaver's do". */
function matches(haystack: string, word: string): boolean {
  return new RegExp(`(?<![a-z0-9])${escapeRegExp(word)}(?![a-z0-9])`, 'i').test(haystack)
}

/**
 * An Outlook invite body is mostly boilerplate: the Teams join block, dial-in
 * numbers, conference IDs, rules of underscores and legal footers. None of it
 * says anything about what you did, and all of it would end up on a record a
 * mentor has to read.
 *
 * Whole lines go, rather than fragments. Cutting a phone number out of a line
 * leaves ",,123456789# United Kingdom, London" behind, which is worse than
 * either keeping or dropping the lot.
 */
const NOISE_LINE = [
  /^_{5,}$/,
  /^-{5,}$/,
  /microsoft teams/i,
  /^join (?:the )?(?:meeting|conversation|now|on your computer)/i,
  /click here to join/i,
  /^(?:phone )?(?:meeting|conference) id\s*:/i,
  /^passcode\s*:/i,
  /^dial[- ]?in/i,
  /^find a local number/i,
  /^reset dial-?in pin/i,
  /^(?:organi[sz]er|required|optional|attendees?|when|where)\s*:/i,
  /^\+?\d[\d\s()+-]{7,}/,
  /^https?:\/\//i,
  /^(?:learn more|help|need help\?)\b/i,
  /this (?:e-?mail|message) (?:and any attachments |)is confidential/i,
]

export function cleanDescription(value: string | null | undefined): string | null {
  if (!value) return null
  const lines: string[] = []
  for (const raw of value.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s{2,}/g, ' ').trim()
    if (line.length < 2) continue
    if (NOISE_LINE.some((pattern) => pattern.test(line))) continue
    // A bare link on a line of its own carries nothing; one inside a sentence
    // can go without taking the sentence with it.
    const stripped = line.replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim()
    if (stripped.length < 3) continue
    lines.push(stripped)
  }
  const text = lines.join('\n').trim()
  return text.length > 3 ? truncate(text, 600) : null
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}\u2026`
}

function nullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A sensible default window: the last N months up to today. */
export function defaultWindow(today: DateKey, months = 3): { from: DateKey; to: DateKey } {
  const d = new Date(`${today}T00:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() - months)
  return { from: toDateKey(d), to: addDays(today, 1) }
}
