/**
 * Reading "how long did that take" out of the way people actually write it.
 *
 * The bias throughout is against inventing hours. Where no duration is stated
 * the answer is null, not a guess — a mentor signs these records, and a plausible
 * fabricated number is worse than an obvious blank. Filling blanks is a separate,
 * explicit step (`allocateDayMinutes`) that marks what it estimated.
 */

export interface DurationOptions {
  /** A full working day. Defaults to 7.5 hours. */
  standardDayMinutes?: number
}

export interface DurationMatch {
  minutes: number
  matchedText: string
  confidence: number
  /** True when the phrase named a portion of a day rather than a clock amount. */
  fractional: boolean
}

const DEFAULT_DAY = 450 // 7.5h — a 37.5-hour week

export function parseDuration(text: string, opts: DurationOptions = {}): DurationMatch | null {
  const day = opts.standardDayMinutes ?? DEFAULT_DAY
  for (const attempt of [matchClockRange, matchHoursAndMinutes, matchSingleUnit, matchDayFraction]) {
    const found = attempt(text, day)
    if (found && found.minutes > 0) return found
  }
  return null
}

// 09:00-17:30, 9am to 5.30pm, "worked 9-5"
function matchClockRange(text: string, _day: number): DurationMatch | null {
  const re =
    /(?<![\d:.])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|—|\bto\b|\btill\b|\buntil\b)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?![\d:.])/i
  const m = re.exec(text)
  if (!m) return null

  const [, h1, min1, mer1, h2, min2, mer2] = m
  const explicit = Boolean(min1 || min2 || mer1 || mer2 || /\b(to|till|until)\b/i.test(m[0]))
  // A bare "3-4" is far more often a quantity than a shift. Require either a
  // clock marker, or a verb right before it that makes it a shift.
  const cued = /\b(worked|working|work|shift|office|on site|onsite|in)\s*$/i.test(
    text.slice(0, m.index),
  )
  if (!explicit && !cued) return null

  let start = toMinutes(Number(h1), min1, mer1)
  let end = toMinutes(Number(h2), min2, mer2)
  if (start === null || end === null) return null

  // "9-5" with no meridiem: the second number is an afternoon hour.
  if (!mer1 && !mer2 && end <= start) end += 12 * 60
  if (end <= start) return null

  const minutes = end - start
  if (minutes > 16 * 60) return null // not a working day; probably not a range

  return {
    minutes,
    matchedText: m[0].trim(),
    confidence: explicit ? 0.9 : 0.65,
    fractional: false,
  }
}

// 2h30, 2h 30m, 2 hours 30 minutes
function matchHoursAndMinutes(text: string, _day: number): DurationMatch | null {
  const re = /(?<![\d.])(\d{1,2})\s*(?:h|hr|hrs|hour|hours)\s*(\d{1,2})\s*(?:m|min|mins|minutes)?(?![\d])/i
  const m = re.exec(text)
  if (!m) return null
  const minutes = Number(m[1]) * 60 + Number(m[2])
  if (minutes <= 0 || minutes > 16 * 60) return null
  return { minutes, matchedText: m[0].trim(), confidence: 0.95, fractional: false }
}

// 4h, 4.5 hours, 90 mins, 45m
function matchSingleUnit(text: string, _day: number): DurationMatch | null {
  const hours = /(?<![\d.])(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:h\b|hr\b|hrs\b|hour\b|hours\b)/i.exec(text)
  if (hours) {
    const minutes = Math.round(Number(hours[1].replace(',', '.')) * 60)
    if (minutes > 0 && minutes <= 16 * 60) {
      return { minutes, matchedText: hours[0].trim(), confidence: 0.95, fractional: false }
    }
  }
  const mins = /(?<![\d.])(\d{1,3})\s*(?:m\b|min\b|mins\b|minute\b|minutes\b)/i.exec(text)
  if (mins) {
    const minutes = Number(mins[1])
    if (minutes > 0 && minutes <= 16 * 60) {
      return { minutes, matchedText: mins[0].trim(), confidence: 0.9, fractional: false }
    }
  }
  return null
}

// half day, all day, all morning
function matchDayFraction(text: string, day: number): DurationMatch | null {
  const patterns: Array<[RegExp, number, number]> = [
    [/\b(?:all|full|whole|entire)\s+day\b/i, 1, 0.85],
    [/\bfull\s+day\b/i, 1, 0.85],
    [/\bhalf\s+(?:a\s+)?day\b/i, 0.5, 0.85],
    [/\b1\/2\s*day\b/i, 0.5, 0.85],
    [/\b3\/4\s*day\b/i, 0.75, 0.8],
    [/\b1\/4\s*day\b/i, 0.25, 0.8],
    [/\b(?:all|whole)\s+(?:morning|afternoon)\b/i, 0.5, 0.8],
    [/\bmost\s+of\s+the\s+day\b/i, 0.8, 0.7],
    [/\bcouple\s+of\s+hours\b/i, 120 / day, 0.7],
    [/\ba\s+few\s+hours\b/i, 180 / day, 0.6],
  ]
  for (const [re, fraction, confidence] of patterns) {
    const m = re.exec(text)
    if (m) {
      return {
        minutes: Math.round(day * fraction),
        matchedText: m[0].trim(),
        confidence,
        fractional: true,
      }
    }
  }
  return null
}

function toMinutes(hour: number, minutes: string | undefined, meridiem: string | undefined): number | null {
  if (hour > 24) return null
  let h = hour
  const mer = meridiem?.toLowerCase()
  if (mer === 'pm' && h < 12) h += 12
  if (mer === 'am' && h === 12) h = 0
  const m = minutes ? Number(minutes) : 0
  if (m > 59) return null
  return h * 60 + m
}

/** Remove a duration phrase so it does not clutter the activity text. */
export function stripDuration(text: string, matched: string | null): string {
  if (!matched) return text.trim()
  const idx = text.toLowerCase().indexOf(matched.toLowerCase())
  if (idx === -1) return text.trim()
  const out = text.slice(0, idx) + text.slice(idx + matched.length)
  return out
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s*[,;]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, '')
    .trim()
}

/**
 * Spread a standard day across the entries of a day that carry no stated
 * duration, leaving stated durations untouched.
 *
 * Called only when the user asks for it. Every minute it invents is marked
 * estimated so a mentor can see which numbers were reconstructed.
 */
export function allocateDayMinutes<T extends { minutes: number }>(
  entries: T[],
  standardDayMinutes = DEFAULT_DAY,
): Array<T & { minutesEstimated: boolean }> {
  const stated = entries.filter((e) => e.minutes > 0)
  const blank = entries.filter((e) => e.minutes <= 0)
  if (blank.length === 0) return entries.map((e) => ({ ...e, minutesEstimated: false }))

  const used = stated.reduce((sum, e) => sum + e.minutes, 0)
  const spare = Math.max(0, standardDayMinutes - used)
  // Round to 15-minute blocks: nobody believes a timesheet that says 37 minutes.
  const each = Math.max(15, Math.round(spare / blank.length / 15) * 15)

  return entries.map((e) =>
    e.minutes > 0
      ? { ...e, minutesEstimated: false }
      : { ...e, minutes: each, minutesEstimated: true },
  )
}

export const STANDARD_DAY_MINUTES = DEFAULT_DAY
