import type { SheetPeriod } from './pedr/deadlines'
import { formatDate, type DateKey } from './pedr/week'

/**
 * An iCalendar feed.
 *
 * A web app cannot send you a push notification, but your phone's calendar
 * already can — so the reminders live there. Subscribe once and a nudge lands
 * every Friday afternoon, with every sheet deadline sitting alongside it and
 * an alarm a fortnight ahead of each one.
 *
 * The format is fussy: CRLF line endings, lines folded at 75 octets, and a
 * specific set of characters escaped. Getting any of those wrong produces a
 * calendar that imports as empty, so all three are handled here and tested.
 */

export interface CalendarEvent {
  uid: string
  start: DateKey
  /** Exclusive, per the spec, for an all-day event. */
  end?: DateKey
  summary: string
  description?: string
  /** RFC 5545 recurrence rule, without the "RRULE:" prefix. */
  rrule?: string
  /** Days before the event to raise an alarm. */
  alarmDaysBefore?: number
}

export interface CalendarOptions {
  name: string
  description?: string
  /** Stamp for DTSTAMP. Injectable so the output is testable. */
  now?: Date
}

export function buildCalendar(events: CalendarEvent[], opts: CalendarOptions): string {
  const stamp = formatStamp(opts.now ?? new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PEDR//Practical experience record//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    'X-PUBLISHED-TTL:PT12H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
  ]
  if (opts.description) lines.push(`X-WR-CALDESC:${escapeText(opts.description)}`)

  for (const event of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${event.uid}`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`DTSTART;VALUE=DATE:${compact(event.start)}`)
    lines.push(`DTEND;VALUE=DATE:${compact(event.end ?? addOneDay(event.start))}`)
    lines.push(`SUMMARY:${escapeText(event.summary)}`)
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
    if (event.rrule) lines.push(`RRULE:${event.rrule}`)
    lines.push('TRANSP:TRANSPARENT')

    if (event.alarmDaysBefore !== undefined) {
      lines.push('BEGIN:VALARM')
      lines.push('ACTION:DISPLAY')
      lines.push(`DESCRIPTION:${escapeText(event.summary)}`)
      lines.push(`TRIGGER:-P${event.alarmDaysBefore}D`)
      lines.push('END:VALARM')
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** The weekly nudge, plus one event per sheet deadline. */
export function buildReminderCalendar(input: {
  name: string
  token: string
  periods: SheetPeriod[]
  /** The Friday the weekly reminder starts from. */
  weeklyFrom: DateKey
  appUrl?: string
  now?: Date
}): string {
  const { periods, appUrl } = input
  const link = appUrl ? `\n\n${appUrl}/dump` : ''

  const events: CalendarEvent[] = [
    {
      uid: `weekly-${input.token}@pedr`,
      start: input.weeklyFrom,
      summary: 'Log this week for your PEDR',
      description:
        'Three lines about what you did, one about what went wrong. Two minutes now is an hour ' +
        'saved at the end of the quarter.' + link,
      rrule: 'FREQ=WEEKLY;BYDAY=FR',
      alarmDaysBefore: 0,
    },
  ]

  for (const period of periods) {
    if (period.status === 'psa_signed') continue
    events.push({
      uid: `sheet-${period.index}-${input.token}@pedr`,
      start: period.dueDate,
      summary: `PEDR sheet ${period.index} due`,
      description:
        `Covers ${formatDate(period.periodStart)} to ${formatDate(period.periodEnd)}. ` +
        'A sheet must be completed within two months of the end of the period it covers. ' +
        'After that it is late, your PSA cannot give you useful feedback, and a run of late ' +
        'sheets reads badly at the exam.' +
        (appUrl ? `\n\n${appUrl}/sheets` : ''),
      // Two weeks' warning, then again on the day.
      alarmDaysBefore: 14,
    })
  }

  return buildCalendar(events, {
    name: input.name,
    description: 'Weekly logging reminders and record sheet deadlines.',
    now: input.now,
  })
}

// ---------------------------------------------------------------------------

function compact(key: DateKey): string {
  return key.replace(/-/g, '')
}

function addOneDay(key: DateKey): DateKey {
  const d = new Date(`${key}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function formatStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

/**
 * Escape per RFC 5545: backslash first, then the rest, or the escapes we add
 * get escaped again.
 */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Fold to 75 octets, continuing with a leading space. Measured in bytes rather
 * than characters, because a line split through the middle of a multi-byte
 * character produces a file some clients refuse.
 */
export function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line

  const chunks: string[] = []
  let start = 0
  let limit = 75
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    // Back off to a character boundary: continuation bytes are 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end] & 0b1100_0000) === 0b1000_0000) {
      end--
    }
    chunks.push(bytes.subarray(start, end).toString('utf8'))
    start = end
    limit = 74 // subsequent lines carry a leading space
  }
  return chunks.join('\r\n ')
}
