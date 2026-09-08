import { REQUIREMENTS, type ExperienceCategory } from './constants'
import type { Employment, Entry, Progress, RequirementCheck, WeekScore } from './types'
import {
  addMonths, addWeeks, todayKey, weekIdOf, weekStartKey, weeksBetween,
  type DateKey, type WeekId,
} from './week'

/**
 * Progress answers the only question that actually matters: can I sit the exam
 * yet, and if not, when.
 *
 * Experience is counted in *weeks logged*, not in hours. That is deliberate.
 * The regulations are expressed in months of practical experience, and a month
 * of experience is a month you turned up and worked — it is not 140 hours of
 * timesheet. Counting hours would let a run of 60-hour weeks buy you months you
 * did not serve, which is not how any PSA reads a record.
 */

export interface ProgressOptions {
  today?: DateKey
  /** Weeks with a score at or below this do not count as experience. */
  scoreThreshold?: number
  /** How far back to look when estimating the current logging rate. */
  rateWindowWeeks?: number
}

export function computeProgress(
  entries: Entry[],
  scores: WeekScore[],
  employments: Employment[] = [],
  opts: ProgressOptions = {},
): Progress {
  const today = opts.today ?? todayKey()
  const threshold = opts.scoreThreshold ?? 0
  const rateWindow = opts.rateWindowWeeks ?? 12

  const loggedWeeks = scores.filter((s) => s.score > threshold)
  const weeksLogged = loggedWeeks.length
  const totalMinutes = entries.reduce((sum, e) => sum + (e.minutes || 0), 0)

  const dates = entries.map((e) => e.date).sort()
  const firstDate = dates[0] ?? null
  const lastDate = dates[dates.length - 1] ?? null

  const monthsLogged = weeksLogged / REQUIREMENTS.weeksPerMonth

  // The recency rule: experience only counts toward `minRecentMonths` if it
  // falls inside the window immediately before the exam.
  const recentFrom = addMonths(today, -REQUIREMENTS.recentWindowMonths)
  const recentWeeks = loggedWeeks.filter((s) => weekStartKey(s.weekId) >= recentFrom)
  const monthsRecent = recentWeeks.length / REQUIREMENTS.weeksPerMonth

  const byCategory = categorise(loggedWeeks, employments)

  const checks: RequirementCheck[] = [
    {
      id: 'total-months',
      label: `${REQUIREMENTS.minTotalMonths} months of practical experience`,
      detail: 'The minimum before you can sit Part 3.',
      met: monthsLogged >= REQUIREMENTS.minTotalMonths,
      value: round1(monthsLogged),
      target: REQUIREMENTS.minTotalMonths,
      unit: 'months',
      regulatory: true,
    },
    {
      id: 'recent-months',
      label: `${REQUIREMENTS.minRecentMonths} months in the last ${REQUIREMENTS.recentWindowMonths}`,
      detail: `At least ${REQUIREMENTS.minRecentMonths} of the ${REQUIREMENTS.minTotalMonths} months must fall in the ${REQUIREMENTS.recentWindowMonths} months immediately before the exam.`,
      met: monthsRecent >= REQUIREMENTS.minRecentMonths,
      value: round1(monthsRecent),
      target: REQUIREMENTS.minRecentMonths,
      unit: 'months',
      regulatory: true,
    },
    {
      id: 'no-long-gaps',
      label: 'No gap longer than a quarter',
      detail:
        'Not a regulation — our rule. A 13-week hole in the record is the thing a PSA ' +
        'queries and the thing you will not be able to reconstruct honestly later.',
      met: longestGap(scores) < REQUIREMENTS.sheetPeriodWeeks,
      value: longestGap(scores),
      target: REQUIREMENTS.sheetPeriodWeeks - 1,
      unit: 'weeks',
      regulatory: false,
    },
  ]

  // How many more weeks of logging each unmet regulatory check needs.
  const weeksNeeded = checks
    .filter((c) => c.regulatory && !c.met)
    .map((c) => Math.ceil((c.target - c.value) * REQUIREMENTS.weeksPerMonth))
  const weeksRemaining = weeksNeeded.length ? Math.max(...weeksNeeded) : 0

  const loggingRate = recentLoggingRate(scores, today, rateWindow, threshold)
  const projectedReadyDate =
    weeksRemaining === 0
      ? today
      : loggingRate > 0
        ? weekStartKey(addWeeks(weekIdOf(today), Math.ceil(weeksRemaining / loggingRate)))
        : null

  return {
    firstDate,
    lastDate,
    weeksLogged,
    totalMinutes,
    monthsLogged: round1(monthsLogged),
    monthsRecent: round1(monthsRecent),
    byCategory,
    checks,
    ready: checks.filter((c) => c.regulatory).every((c) => c.met),
    weeksRemaining,
    projectedReadyDate,
    loggingRate: Math.round(loggingRate * 100) / 100,
  }
}

/** Months of logged experience attributed to each category of experience. */
function categorise(
  loggedWeeks: WeekScore[],
  employments: Employment[],
): Record<ExperienceCategory, number> {
  const totals: Record<ExperienceCategory, number> = { i: 0, ii: 0, iii: 0 }
  for (const week of loggedWeeks) {
    const employment = employmentForWeek(week.weekId, employments)
    if (!employment) continue
    totals[employment.category] += 1
  }
  return {
    i: round1(totals.i / REQUIREMENTS.weeksPerMonth),
    ii: round1(totals.ii / REQUIREMENTS.weeksPerMonth),
    iii: round1(totals.iii / REQUIREMENTS.weeksPerMonth),
  }
}

/** The employment covering a week, preferring the one that started most recently. */
export function employmentForWeek(
  weekId: WeekId,
  employments: Employment[],
): Employment | null {
  const start = weekStartKey(weekId)
  const matches = employments.filter(
    (e) => e.startDate <= start && (e.endDate === null || e.endDate >= start),
  )
  if (matches.length === 0) return null
  return matches.sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
}

/** Logged weeks per week over the recent window: 1.0 means never missing one. */
function recentLoggingRate(
  scores: WeekScore[],
  today: DateKey,
  windowWeeks: number,
  threshold: number,
): number {
  const currentWeek = weekIdOf(today)
  // The current week is still in progress, so judging it as a miss is unfair.
  const window = scores.filter((s) => {
    const distance = weeksBetween(s.weekId, currentWeek)
    return distance >= 1 && distance <= windowWeeks
  })
  if (window.length === 0) return 0
  return window.filter((s) => s.score > threshold).length / window.length
}

function longestGap(scores: WeekScore[]): number {
  let longest = 0
  let run = 0
  let seenAny = false
  for (const s of scores) {
    if (s.score > 0) {
      seenAny = true
      run = 0
    } else if (seenAny) {
      // Only count holes between logged weeks — leading empties are just
      // "before you started", not a gap in the record.
      run++
      longest = Math.max(longest, run)
    }
  }
  return longest
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
