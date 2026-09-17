import { addDays, type DateKey } from '../pedr/week'

/**
 * What a calendar event means, independent of where it came from.
 *
 * There are three ways a calendar reaches this app — a published .ics feed, the
 * Microsoft Graph API and the Google Calendar API — and exactly one set of
 * rules about what counts as practical experience. Those rules live here, so a
 * meeting you declined is dropped the same way whether it arrived as a VEVENT
 * or as JSON, and so the review screen can explain a skip in the same words.
 *
 * The filtering is almost all of the work. A real calendar is mostly noise:
 * lunch, focus blocks, holds, standups, meetings you declined, all-day markers
 * for other people's leave. Import it raw and you bury a good record under
 * three hundred entries nobody will read.
 */

export interface RawPerson {
  name: string | null
  email: string | null
}

export interface RawAttendee extends RawPerson {
  /** A room or a projector, not somebody you dealt with. */
  resource?: boolean
}

/**
 * One event from a source, with every occurrence it produces.
 *
 * A recurring meeting is one of these with many occurrences from an .ics feed,
 * and many of these with one occurrence each from an API that expands the
 * series itself. Keeping the shape means a rule that applies to the event —
 * you declined it, it was cancelled — is applied once either way.
 */
export interface RawSourceEvent {
  /** The source's own id, made unique per occurrence with the date. */
  uid: string
  summary: string
  description: string | null
  location: string | null
  attendees: RawAttendee[]
  organiser: RawPerson | null
  /** It did not happen. */
  cancelled: boolean
  /** Marked free or transparent — it was not really being done. */
  free: boolean
  /** You said no. Not experience. */
  declined: boolean
  recurring: boolean
  occurrences: Array<{ date: DateKey; minutes: number; allDay: boolean }>
}

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

/**
 * Every working day an all-day block covers.
 *
 * A week booked off is one event, not five. Recorded against its start date
 * alone it leaves four days looking unaccounted for, which is exactly the kind
 * of hole this app exists to close. The end is exclusive in every source that
 * produces one, and weekends are left out — a Saturday nobody was going to work
 * is not something to put on a record.
 */
export function spanWorkingDays(
  start: DateKey,
  endExclusive: DateKey | null,
  minutes: number,
): Array<{ date: DateKey; minutes: number; allDay: boolean }> {
  const out: Array<{ date: DateKey; minutes: number; allDay: boolean }> = []
  let cursor = start
  // 62 days: long enough for a sabbatical, short enough that a calendar with a
  // decade-long marker in it cannot fill the record.
  for (let i = 0; i < 62; i++) {
    if (!isWeekend(cursor)) out.push({ date: cursor, minutes, allDay: true })
    const next = addDays(cursor, 1)
    if (!endExclusive || next >= endExclusive) break
    cursor = next
  }
  return out.length > 0 ? out : [{ date: start, minutes, allDay: true }]
}

function isWeekend(date: DateKey): boolean {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  return day === 0 || day === 6
}

/** Titles that are never practical experience. */
export const NOISE = [
  'lunch', 'break', 'coffee', 'gym', 'commute', 'travel home', 'focus time',
  'focus block', 'do not book', 'do not disturb', 'busy', 'hold', 'placeholder',
  'blocked', 'no meetings', 'tentative hold', 'prep time', 'buffer',
  'daily standup', 'stand-up', 'standup', 'scrum', 'wfh', 'working from home',
  'dentist', 'doctor', 'appointment', 'school run', 'birthday', 'anniversary',
]

/** Titles that mean absence. Recorded, but not as experience. */
export const LEAVE = [
  'annual leave', 'holiday', 'vacation', 'out of office', 'ooo', 'o.o.o',
  'off sick', 'sick leave', 'sick day', 'bank holiday', 'public holiday',
  'toil', 'day off', 'leave', 'paternity', 'maternity', 'compassionate',
]

/**
 * Apply the rules to a batch of source events.
 *
 * Event-level decisions happen once per event, before its occurrences are
 * considered, so a weekly meeting you declined is one line on the review screen
 * rather than fifty-two.
 */
export function filterEvents(
  sources: RawSourceEvent[],
  opts: CalendarOptions = {},
): CalendarParse {
  const {
    from, to,
    minMinutes = 15,
    standardDayMinutes = 450,
    maxAttendees = 8,
  } = opts

  const ignore = [...NOISE, ...(opts.ignore ?? []).map((s) => s.toLowerCase())]
  const myEmail = opts.email?.trim().toLowerCase() ?? null
  const myName = opts.name?.trim().toLowerCase() ?? null

  const events: CalendarEvent[] = []
  const skipped: CalendarSkip[] = []
  const warnings: string[] = []

  for (const source of sources) {
    const summary = (source.summary ?? '').trim()
    const lower = summary.toLowerCase()

    if (source.cancelled) {
      skipped.push({ summary, date: null, reason: 'cancelled' })
      continue
    }
    if (source.declined) {
      skipped.push({ summary, date: null, reason: 'you declined it' })
      continue
    }
    if (source.free) {
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

    const attendees = readAttendees(source.attendees, { myEmail, myName, max: maxAttendees })
    const organiser = readOrganiser(source.organiser, myEmail)
    const description = cleanDescription(source.description)
    const location = nullable(source.location)

    for (const { date, minutes, allDay } of source.occurrences) {
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
        uid: `${source.uid}:${date}`,
        date,
        minutes: Math.min(length, 12 * 60),
        summary,
        description,
        location,
        attendees,
        organiser,
        allDay,
        recurring: source.recurring,
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

function readAttendees(
  attendees: RawAttendee[],
  opts: { myEmail: string | null; myName: string | null; max: number },
): string[] {
  const names: string[] = []
  for (const attendee of attendees) {
    // Rooms and equipment are not people you dealt with.
    if (attendee.resource) continue

    const address = (attendee.email ?? '').replace(/^mailto:/i, '').toLowerCase()
    if (opts.myEmail && address === opts.myEmail) continue

    const name = attendee.name?.trim() ? attendee.name.trim() : prettifyAddress(address)
    if (!name) continue
    if (opts.myName && name.toLowerCase() === opts.myName) continue
    if (!names.includes(name)) names.push(name)
  }
  return names.slice(0, opts.max)
}

function readOrganiser(organiser: RawPerson | null, myEmail: string | null): string | null {
  if (!organiser) return null
  const address = (organiser.email ?? '').replace(/^mailto:/i, '').toLowerCase()
  if (myEmail && address === myEmail) return null
  return organiser.name?.trim() ? organiser.name.trim() : prettifyAddress(address)
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
export function prettifyAddress(address: string): string | null {
  const local = address.split('@')[0]
  if (!local) return null
  const parts = local.split(/[._\-+]+/).filter((w) => w.length > 1 && /^[a-z]+$/i.test(w))
  if (parts.length === 0 || parts.length > 3) return null
  // A single-word mailbox is a person only if it is not a department.
  if (parts.length === 1 && ROLE_MAILBOXES.has(parts[0].toLowerCase())) return null
  return parts.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

/** Whole-word match, so "leave" does not fire inside "leaver's do". */
export function matches(haystack: string, word: string): boolean {
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
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

export function nullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Strip the HTML an API hands back for an invite body.
 *
 * Graph returns `contentType: "html"` for almost every event, and the body is
 * an Outlook-authored document — styles, divs, the Teams join block as markup.
 * The line filtering above only works on text, so this has to come first.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
