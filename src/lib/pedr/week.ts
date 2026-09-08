/**
 * Date and ISO-week arithmetic.
 *
 * Two rules make the rest of the codebase safe:
 *
 *   1. A calendar date is a `YYYY-MM-DD` string, never a Date. Dates go into
 *      the database, get compared, get sorted and get shown to a user in
 *      Brisbane and in London; a JS Date carries a timezone and will silently
 *      shift a Friday site visit onto Thursday for half the world.
 *   2. Anything that must become a Date does so at UTC midnight, here, and
 *      nowhere else.
 *
 * Weeks are ISO-8601 weeks, because that is what "week commencing" means to
 * everyone in UK practice: Monday to Sunday, week 1 is the week containing the
 * first Thursday of the year.
 */

export type DateKey = string // 'YYYY-MM-DD'
export type WeekId = string // 'YYYY-Wnn'
export type MonthKey = string // 'YYYY-MM'

const MS_PER_DAY = 86_400_000
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const WEEK_ID_RE = /^(\d{4})-W(\d{2})$/

// ---------------------------------------------------------------------------
// Date keys
// ---------------------------------------------------------------------------

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string') return false
  const m = DATE_KEY_RE.exec(value)
  if (!m) return false
  // Reject 2026-02-31 and friends: round-tripping catches every rollover.
  return toDateKey(fromDateKey(value)) === value
}

/** UTC midnight Date for a date key. Throws on a malformed key. */
export function fromDateKey(key: DateKey): Date {
  const m = DATE_KEY_RE.exec(key)
  if (!m) throw new Error(`Not a date key: ${JSON.stringify(key)}`)
  const [, y, mo, d] = m
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
}

export function toDateKey(date: Date): DateKey {
  const y = String(date.getUTCFullYear()).padStart(4, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(key: DateKey, days: number): DateKey {
  return toDateKey(new Date(fromDateKey(key).getTime() + days * MS_PER_DAY))
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((fromDateKey(b).getTime() - fromDateKey(a).getTime()) / MS_PER_DAY)
}

export function addMonths(key: DateKey, months: number): DateKey {
  const d = fromDateKey(key)
  const targetMonth = d.getUTCMonth() + months
  const probe = new Date(Date.UTC(d.getUTCFullYear(), targetMonth, 1))
  // Clamp the day so 31 Jan + 1 month is 28/29 Feb rather than rolling into March.
  const lastDay = new Date(
    Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth() + 1, 0),
  ).getUTCDate()
  probe.setUTCDate(Math.min(d.getUTCDate(), lastDay))
  return toDateKey(probe)
}

export function minDateKey(a: DateKey, b: DateKey): DateKey {
  return a <= b ? a : b
}

export function maxDateKey(a: DateKey, b: DateKey): DateKey {
  return a >= b ? a : b
}

/** Today, in UTC. Everything user-facing is week-grained, so UTC is fine. */
export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now)
}

export function monthKeyOf(key: DateKey): MonthKey {
  return key.slice(0, 7)
}

// ---------------------------------------------------------------------------
// ISO weeks
// ---------------------------------------------------------------------------

/** 0 = Monday … 6 = Sunday. */
export function isoDayOfWeek(key: DateKey): number {
  return (fromDateKey(key).getUTCDay() + 6) % 7
}

export function isoWeekOf(key: DateKey): { year: number; week: number; id: WeekId } {
  const date = fromDateKey(key)
  // Shift to the Thursday of this week: the ISO year is whichever year that
  // Thursday falls in, which is the whole trick behind week 53 and week 1.
  const thursday = new Date(date.getTime())
  thursday.setUTCDate(thursday.getUTCDate() - isoDayOfWeek(key) + 3)

  const year = thursday.getUTCFullYear()
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Thursday = new Date(jan4.getTime())
  jan4Thursday.setUTCDate(jan4Thursday.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3)

  const week = 1 + Math.round((thursday.getTime() - jan4Thursday.getTime()) / (7 * MS_PER_DAY))
  return { year, week, id: formatWeekId(year, week) }
}

export function weekIdOf(key: DateKey): WeekId {
  return isoWeekOf(key).id
}

export function formatWeekId(year: number, week: number): WeekId {
  return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}`
}

export function parseWeekId(id: WeekId): { year: number; week: number } {
  const m = WEEK_ID_RE.exec(id)
  if (!m) throw new Error(`Not a week id: ${JSON.stringify(id)}`)
  const year = Number(m[1])
  const week = Number(m[2])
  if (week < 1 || week > isoWeeksInYear(year)) {
    throw new Error(`Week ${week} does not exist in ISO year ${year}`)
  }
  return { year, week }
}

export function isWeekId(value: unknown): value is WeekId {
  if (typeof value !== 'string') return false
  try {
    parseWeekId(value)
    return true
  } catch {
    return false
  }
}

/** 52 or 53. A year has 53 ISO weeks when it starts or ends on a Thursday. */
export function isoWeeksInYear(year: number): number {
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay()
  const dec31 = new Date(Date.UTC(year, 11, 31)).getUTCDay()
  return jan1 === 4 || dec31 === 4 ? 53 : 52
}

/** The Monday of an ISO week. */
export function weekStartKey(id: WeekId): DateKey {
  const { year, week } = parseWeekId(id)
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Monday = new Date(jan4.getTime())
  jan4Monday.setUTCDate(jan4Monday.getUTCDate() - ((jan4.getUTCDay() + 6) % 7))
  return toDateKey(new Date(jan4Monday.getTime() + (week - 1) * 7 * MS_PER_DAY))
}

/** The Sunday of an ISO week. */
export function weekEndKey(id: WeekId): DateKey {
  return addDays(weekStartKey(id), 6)
}

export function weekDayKeys(id: WeekId): DateKey[] {
  const start = weekStartKey(id)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function addWeeks(id: WeekId, weeks: number): WeekId {
  return weekIdOf(addDays(weekStartKey(id), weeks * 7))
}

/** Whole weeks from `a` to `b`. Negative when `b` is earlier. */
export function weeksBetween(a: WeekId, b: WeekId): number {
  return Math.round(daysBetween(weekStartKey(a), weekStartKey(b)) / 7)
}

/**
 * Every ISO week id from `from` to `to`, inclusive at both ends.
 * Accepts week ids or date keys, so callers do not have to convert first.
 */
export function weekRange(from: WeekId | DateKey, to: WeekId | DateKey): WeekId[] {
  const start = isWeekId(from) ? from : weekIdOf(from as DateKey)
  const end = isWeekId(to) ? to : weekIdOf(to as DateKey)
  const count = weeksBetween(start, end)
  if (count < 0) return []
  const out: WeekId[] = []
  let cursor = start
  for (let i = 0; i <= count; i++) {
    out.push(cursor)
    cursor = addWeeks(cursor, 1)
  }
  return out
}

/** "Mon 7 Sep 2026". Deterministic across runtimes — no Intl locale surprises. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function formatDate(key: DateKey, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = fromDateKey(key)
  const day = d.getUTCDate()
  const month = MONTHS[d.getUTCMonth()]
  const parts: string[] = []
  if (opts.weekday) parts.push(DAYS[isoDayOfWeek(key)])
  parts.push(String(day), month)
  if (opts.year !== false) parts.push(String(d.getUTCFullYear()))
  return parts.join(' ')
}

/** "w/c 7 Sep 2026" — how a week gets referred to in practice. */
export function formatWeek(id: WeekId): string {
  return `w/c ${formatDate(weekStartKey(id))}`
}

export function formatWeekRange(id: WeekId): string {
  const s = weekStartKey(id)
  const e = weekEndKey(id)
  const sameMonth = s.slice(0, 7) === e.slice(0, 7)
  return sameMonth
    ? `${fromDateKey(s).getUTCDate()}–${formatDate(e)}`
    : `${formatDate(s, { year: false })} – ${formatDate(e)}`
}

export function formatMonth(key: MonthKey): string {
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

/** Minutes as "6h 30m" / "45m" / "8h". */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0h'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
