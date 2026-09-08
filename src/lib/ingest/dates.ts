import { addDays, daysBetween, isDateKey, isoDayOfWeek, toDateKey, weekStartKey, weekIdOf, type DateKey } from '../pedr/week'

/**
 * Turning the date phrases people actually type into calendar dates.
 *
 * Everything here is UK-first. `08/09/2026` is the 8th of September, not the
 * 9th of August, because this is a tool for UK practice and getting that
 * backwards would silently corrupt a year of records. Where a date is genuinely
 * ambiguous the resolution comes back with lower confidence so it can be shown
 * for confirmation rather than accepted quietly.
 */

export interface DateContext {
  /** The day the dump was written. Bare weekday names resolve relative to it. */
  reference: DateKey
  /** Set by a "week commencing" header; bare weekdays then land in that week. */
  weekStart?: DateKey | null
}

export interface DateResolution {
  date: DateKey | null
  confidence: number
  matchedText: string | null
  /** Present when the phrase was a week header rather than a single day. */
  weekStart?: DateKey
  /** True when the phrase named a week, not a day. */
  isWeekHeader?: boolean
}

const NONE: DateResolution = { date: null, confidence: 0, matchedText: null }

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
}

const WEEKDAYS: Record<string, number> = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4,
  sat: 5, saturday: 5, sun: 6, sunday: 6,
}

const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')
const WEEKDAY_NAMES = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|')

/**
 * A week header: "w/c 7 Sep", "week commencing 7 September 2026", "week 37".
 * Returns the Monday of that week and sets the context for the lines under it.
 */
export function resolveWeekHeader(text: string, ctx: DateContext): DateResolution {
  const cleaned = text.trim()

  const wc = new RegExp(
    String.raw`^\s*(?:w\/c|w\.c\.?|week\s+(?:commencing|beginning|starting|of)|week)\s*:?\s+(.+)$`,
    'i',
  ).exec(cleaned)
  if (wc) {
    const isoWeek = /^(\d{4})[-\s]?W?(\d{1,2})$/i.exec(wc[1].trim())
    if (isoWeek) {
      const id = `${isoWeek[1]}-W${String(Number(isoWeek[2])).padStart(2, '0')}`
      try {
        const start = weekStartKey(id)
        return { date: start, confidence: 0.95, matchedText: cleaned, weekStart: start, isWeekHeader: true }
      } catch {
        return NONE
      }
    }
    const inner = resolveDatePhrase(wc[1], ctx)
    if (inner.date) {
      const start = weekStartKey(weekIdOf(inner.date))
      return {
        date: start,
        confidence: Math.min(0.95, inner.confidence),
        matchedText: cleaned,
        weekStart: start,
        isWeekHeader: true,
      }
    }
  }

  // "Week 37" on its own, or "Week 37 2026".
  const bare = /^\s*week\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\s*$/i.exec(cleaned)
  if (bare) {
    const year = bare[2] ? Number(bare[2]) : Number(ctx.reference.slice(0, 4))
    const id = `${year}-W${String(Number(bare[1])).padStart(2, '0')}`
    try {
      const start = weekStartKey(id)
      return { date: start, confidence: 0.8, matchedText: cleaned, weekStart: start, isWeekHeader: true }
    } catch {
      return NONE
    }
  }

  return NONE
}

/**
 * Find a date somewhere in a line of text. Returns the first confident match.
 * Order matters: the most explicit forms are tried first so "8 Sep 2026" is
 * never mistaken for a bare weekday or a relative phrase.
 */
export function resolveDatePhrase(text: string, ctx: DateContext): DateResolution {
  const t = text.trim()
  if (!t) return NONE

  for (const attempt of [matchIso, matchNumeric, matchNamedMonth, matchRelative, matchWeekday]) {
    const result = attempt(t, ctx)
    if (result.date) return result
  }
  return NONE
}

// 2026-09-08
function matchIso(text: string, _ctx: DateContext): DateResolution {
  const m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text)
  if (!m) return NONE
  if (!isDateKey(m[0])) return NONE
  return { date: m[0], confidence: 1, matchedText: m[0] }
}

// 08/09/2026, 8/9/26, 8.9.2026 — day first.
function matchNumeric(text: string, ctx: DateContext): DateResolution {
  // Two shapes, tried in order. Slashes may omit the year; dots may not, because
  // "4.5 hours" is a decimal and "8.9.2026" is a date, and nothing else can tell
  // them apart. The trailing guard rejects "1/2 day" and "3/4 hr", which are
  // fractions of a working day rather than the 1st of February.
  const slash = /(?<![\d/.\-])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])(?!\s*(?:day|d\b|hr|hrs|hour|hours|m\b|min|mins))/i
  const dotted = /(?<![\d/.\-])(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?![\d/.])/

  const m = slash.exec(text) ?? dotted.exec(text)
  if (!m) return NONE

  let day = Number(m[1])
  let month = Number(m[2])
  let confidence = 0.9

  if (day > 31 || month > 31 || day < 1 || month < 1) return NONE

  if (month > 12 && day <= 12) {
    // Only makes sense read the American way round. Take it, but say so.
    ;[day, month] = [month, day]
    confidence = 0.55
  } else if (month > 12) {
    return NONE
  } else if (day <= 12) {
    // Genuinely ambiguous: 08/09 could be either. UK reading, lower confidence.
    confidence = 0.7
  }

  const year = m[3] ? expandYear(Number(m[3])) : null
  const key = buildDate(year ?? Number(ctx.reference.slice(0, 4)), month, day)
  if (!key) return NONE
  const resolved = year === null ? nudgeYear(key, ctx.reference) : key
  return { date: resolved, confidence, matchedText: m[0] }
}

// 8 Sep, 8th September 2026, Sept 8, September 8th
function matchNamedMonth(text: string, ctx: DateContext): DateResolution {
  const dayFirst = new RegExp(
    String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_NAMES})\b\.?(?:\s*,?\s*(\d{4}))?`,
    'i',
  ).exec(text)
  const monthFirst = new RegExp(
    String.raw`\b(${MONTH_NAMES})\b\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?`,
    'i',
  ).exec(text)

  const m = dayFirst ?? monthFirst
  if (!m) return NONE

  const day = Number(dayFirst ? m[1] : m[2])
  const monthName = (dayFirst ? m[2] : m[1]).toLowerCase()
  const month = MONTHS[monthName]
  if (!month) return NONE

  const year = m[3] ? Number(m[3]) : null
  const key = buildDate(year ?? Number(ctx.reference.slice(0, 4)), month, day)
  if (!key) return NONE
  const resolved = year === null ? nudgeYear(key, ctx.reference) : key
  return { date: resolved, confidence: year ? 1 : 0.9, matchedText: m[0] }
}

// today, yesterday, last Friday, this morning
function matchRelative(text: string, ctx: DateContext): DateResolution {
  const lower = text.toLowerCase()

  if (/\b(today|this morning|this afternoon|this evening|tonight)\b/.test(lower)) {
    const m = /\b(today|this morning|this afternoon|this evening|tonight)\b/.exec(lower)!
    return { date: ctx.reference, confidence: 0.9, matchedText: m[0] }
  }
  if (/\byesterday\b/.test(lower)) {
    return { date: addDays(ctx.reference, -1), confidence: 0.9, matchedText: 'yesterday' }
  }
  if (/\bday before yesterday\b/.test(lower)) {
    return { date: addDays(ctx.reference, -2), confidence: 0.85, matchedText: 'day before yesterday' }
  }

  const last = new RegExp(String.raw`\blast\s+(${WEEKDAY_NAMES})\b`, 'i').exec(text)
  if (last) {
    const target = WEEKDAYS[last[1].toLowerCase()]
    // "Last Friday" means the Friday of the week before this one.
    const thisWeekMonday = weekStartKey(weekIdOf(ctx.reference))
    return {
      date: addDays(thisWeekMonday, target - 7),
      confidence: 0.8,
      matchedText: last[0],
    }
  }
  return NONE
}

// Mon, Monday, Weds — resolved inside the week context, or the week just gone.
function matchWeekday(text: string, ctx: DateContext): DateResolution {
  const m = new RegExp(String.raw`(^|[\s\-–—•*(\[])(${WEEKDAY_NAMES})\b`, 'i').exec(text)
  if (!m) return NONE
  const target = WEEKDAYS[m[2].toLowerCase()]

  if (ctx.weekStart) {
    return { date: addDays(ctx.weekStart, target), confidence: 0.85, matchedText: m[2] }
  }

  // No week header: take the most recent occurrence on or before the reference
  // day, because people log what has already happened.
  const monday = weekStartKey(weekIdOf(ctx.reference))
  let candidate = addDays(monday, target)
  if (candidate > ctx.reference) candidate = addDays(candidate, -7)
  return { date: candidate, confidence: 0.75, matchedText: m[2] }
}

function expandYear(y: number): number {
  if (y >= 1000) return y
  // Two-digit years: 26 -> 2026, 99 -> 1999. Nobody is logging PEDR in 2099.
  return y <= 69 ? 2000 + y : 1900 + y
}

function buildDate(year: number, month: number, day: number): DateKey | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  // Reject 31 February rather than letting it roll into March.
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return toDateKey(d)
}

/**
 * With no year given, pick the year that puts the date in the recent past.
 * Someone typing "3 Jan" in December means next month's January only rarely;
 * they almost always mean the January that has been and gone.
 */
function nudgeYear(key: DateKey, reference: DateKey): DateKey {
  if (daysBetween(reference, key) <= 30) return key
  const [y, rest] = [Number(key.slice(0, 4)), key.slice(4)]
  const shifted = `${y - 1}${rest}` as DateKey
  return isDateKey(shifted) ? shifted : key
}

/** Remove a matched date phrase from a line, plus any leftover separator. */
export function stripDatePhrase(text: string, matched: string | null): string {
  if (!matched) return text.trim()
  const idx = text.toLowerCase().indexOf(matched.toLowerCase())
  if (idx === -1) return text.trim()
  const out = text.slice(0, idx) + text.slice(idx + matched.length)
  return out.replace(/^[\s\-–—:•*.,)\]]+/, '').replace(/\s{2,}/g, ' ').trim()
}

/**
 * True when a line is nothing but a date — a header for the lines below it,
 * rather than a record of work in its own right.
 */
export function isDateOnlyLine(text: string, ctx: DateContext): boolean {
  const resolution = resolveDatePhrase(text, ctx)
  if (!resolution.date) return false
  const remainder = stripDatePhrase(text, resolution.matchedText)
  // Allow a trailing weekday or ordinal that the matcher did not consume.
  return remainder.replace(new RegExp(`^(${WEEKDAY_NAMES})\\b[\\s,:-]*`, 'i'), '').trim().length === 0
}

export { WEEKDAYS, MONTHS }
export const WEEKDAY_PATTERN = WEEKDAY_NAMES
export const MONTH_PATTERN = MONTH_NAMES

/** Day of week as a short label, for provenance strings. */
export function weekdayLabel(key: DateKey): string {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][isoDayOfWeek(key)]
}
