import { SCORING, scoreBand, type CriterionId, type StageId } from './constants'
import type {
  Entry, Gap, MonthScore, PeriodScore, ScoreComponent, WeekNote, WeekScore, WeekStatus,
} from './types'
import {
  addDays, addWeeks, formatMonth, formatWeek, monthKeyOf, weekEndKey, weekIdOf, weekRange,
  weekStartKey, type DateKey, type MonthKey, type WeekId,
} from './week'

/**
 * Scoring turns "did you log this week" into "is this week defensible at an
 * oral exam". The weights live in constants.ts; the judgement calls about what
 * counts as a real activity live here.
 */

/** Text that is technically present but says nothing. */
const EMPTY_ISH = new Set([
  '', '-', '--', 'n/a', 'na', 'none', 'nothing', 'nil', 'tbc', 'tbd', '?', '.', 'x',
  'no', 'nope', 'same', 'as above', 'see above', 'n/a.', 'none.', 'nothing.',
])

export function hasSubstance(text: string | null | undefined, minWords = 3): boolean {
  if (!text) return false
  const trimmed = text.trim()
  if (EMPTY_ISH.has(trimmed.toLowerCase())) return false
  const words = trimmed.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w))
  return words.length >= minWords
}

/**
 * Activities an examiner cannot do anything with. "Worked on drawings" is the
 * canonical one: true of every week of every year of everyone's training.
 */
const VAGUE_ACTIVITIES = [
  'work', 'worked', 'working', 'drawings', 'drawing', 'cad', 'revit', 'modelling', 'modeling',
  'model', 'admin', 'general', 'various', 'misc', 'miscellaneous', 'office', 'office work',
  'project work', 'same as last week', 'usual', 'as usual', 'stuff', 'things', 'busy',
  'worked on drawings', 'did drawings', 'general work', 'normal work', 'catching up',
  'emails', 'meetings', 'meeting', 'various tasks',
]

const VAGUE_SET = new Set(VAGUE_ACTIVITIES)

export function normaliseActivity(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * An activity counts as specific when it names something an examiner could ask
 * a follow-up question about. Three or more meaningful words, and not one of
 * the stock non-answers.
 */
export function isSpecificActivity(text: string | null | undefined): boolean {
  if (!text) return false
  const norm = normaliseActivity(text)
  if (!norm || VAGUE_SET.has(norm)) return false
  const words = norm.split(' ').filter(Boolean)
  if (words.length < 3) return false
  // "worked on drawings again" — still nothing, just padded.
  const meaningful = words.filter((w) => !STOPWORDS.has(w) && !VAGUE_SET.has(w))
  return meaningful.length >= 2
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'for', 'in', 'on', 'at', 'by', 'with',
  'from', 'up', 'out', 'some', 'more', 'again', 'today', 'yesterday', 'then', 'also', 'was',
  'were', 'is', 'are', 'be', 'been', 'did', 'do', 'done', 'i', 'we', 'my', 'our', 'it', 'this',
  'that', 'all', 'day', 'morning', 'afternoon', 'am', 'pm',
])

// ---------------------------------------------------------------------------
// Week scoring
// ---------------------------------------------------------------------------

export function scoreWeek(
  weekId: WeekId,
  entries: Entry[],
  note?: WeekNote | null,
): WeekScore {
  const minutes = entries.reduce((sum, e) => sum + (e.minutes || 0), 0)

  const projectKeys = unique(
    entries
      .map((e) => e.projectId ?? (e.projectHint ? `hint:${e.projectHint.toLowerCase()}` : null))
      .filter((v): v is string => Boolean(v)),
  )

  const specificActivities = unique(
    entries
      .map((e) => e.activity)
      .filter(isSpecificActivity)
      .map(normaliseActivity),
  )

  const people = unique(
    entries.flatMap((e) => e.people).map((p) => p.trim().toLowerCase()).filter(Boolean),
  )

  const frictionFromEntries = entries.some((e) => hasSubstance(e.wentWrong, 3))
  const frictionFromNote = hasSubstance(note?.wentWrong, 4)

  const hasAnything =
    entries.length > 0 ||
    hasSubstance(note?.did, 3) ||
    hasSubstance(note?.learned, 3) ||
    hasSubstance(note?.wentWell, 3) ||
    hasSubstance(note?.wentWrong, 3) ||
    hasSubstance(note?.next, 3)

  const components: ScoreComponent[] = [
    build('logged', SCORING.logged, hasAnything, 'Log even one line for this week.'),
    build(
      'projects',
      SCORING.projects,
      projectKeys.length > 0,
      'Say which project each thing was on.',
    ),
    build(
      'activities',
      SCORING.activities,
      specificActivities.length >= 2,
      specificActivities.length === 1
        ? 'Add a second specific activity — one is not a week.'
        : 'Replace "worked on drawings" with what the drawings were and what changed.',
    ),
    build('people', SCORING.people, people.length > 0, 'Name who you dealt with — client, contractor, engineer, your own team.'),
    build(
      'wentWrong',
      SCORING.wentWrong,
      frictionFromEntries || frictionFromNote,
      'Write one line on what went wrong or surprised you. This is the box that scores.',
    ),
  ]

  const score = components.reduce((sum, c) => sum + c.earned, 0)
  const band = scoreBand(score)

  // The most valuable unearned point, so the UI can say one thing rather than five.
  const nextBest = components
    .filter((c) => c.earned === 0)
    .sort((a, b) => b.points - a.points)[0]

  return {
    weekId,
    score,
    band: band.id,
    bandLabel: band.label,
    components,
    minutes,
    entryCount: entries.length,
    projectKeys,
    stages: unique(entries.map((e) => e.stage).filter((s): s is StageId => s !== null)).sort(
      (a, b) => a - b,
    ),
    criteria: unique(entries.flatMap((e) => e.criteria)).sort() as CriterionId[],
    nextBestAction: nextBest ? nextBest.fix : null,
  }
}

function build(
  id: string,
  spec: { points: number; label: string; why: string },
  earned: boolean,
  fix: string,
): ScoreComponent {
  return {
    id,
    label: spec.label,
    points: spec.points,
    earned: earned ? spec.points : 0,
    why: spec.why,
    fix: earned ? null : fix,
  }
}

// ---------------------------------------------------------------------------
// Grouping and rollups
// ---------------------------------------------------------------------------

export function groupEntriesByWeek(entries: Entry[]): Map<WeekId, Entry[]> {
  const map = new Map<WeekId, Entry[]>()
  for (const entry of entries) {
    const id = weekIdOf(entry.date)
    const bucket = map.get(id)
    if (bucket) bucket.push(entry)
    else map.set(id, [entry])
  }
  return map
}

/**
 * Score every week across a span, including the ones with nothing in them —
 * absence is the point of the exercise.
 */
export function scoreWeeks(
  from: WeekId | DateKey,
  to: WeekId | DateKey,
  entries: Entry[],
  notes: WeekNote[] = [],
): WeekScore[] {
  const byWeek = groupEntriesByWeek(entries)
  const noteByWeek = new Map(notes.map((n) => [n.weekId, n]))
  return weekRange(from, to).map((weekId) =>
    scoreWeek(weekId, byWeek.get(weekId) ?? [], noteByWeek.get(weekId)),
  )
}

export function weekStatuses(scores: WeekScore[], inScope: (w: WeekId) => boolean = () => true): WeekStatus[] {
  return scores.map((s) => ({
    weekId: s.weekId,
    startDate: weekStartKey(s.weekId),
    endDate: weekEndKey(s.weekId),
    score: s.score,
    band: s.band,
    minutes: s.minutes,
    entryCount: s.entryCount,
    inScope: inScope(s.weekId),
  }))
}

export function rollUpByMonth(scores: WeekScore[]): MonthScore[] {
  const buckets = new Map<MonthKey, WeekScore[]>()
  for (const score of scores) {
    // A week belongs to the month containing its Thursday, so a week split
    // across two months lands in the month it mostly falls in.
    const key = monthKeyOf(addDays(weekStartKey(score.weekId), 3))
    const bucket = buckets.get(key)
    if (bucket) bucket.push(score)
    else buckets.set(key, [score])
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, weeks]) => ({
      ...summarise(weeks),
      key: monthKey,
      monthKey,
      label: formatMonth(monthKey),
    }))
}

/** Rolling quarters of 13 weeks, anchored to the first week of the span. */
export function rollUpByQuarter(scores: WeekScore[], weeksPerPeriod = 13): PeriodScore[] {
  const out: PeriodScore[] = []
  for (let i = 0; i < scores.length; i += weeksPerPeriod) {
    const chunk = scores.slice(i, i + weeksPerPeriod)
    if (chunk.length === 0) continue
    const first = chunk[0].weekId
    const last = chunk[chunk.length - 1].weekId
    out.push({
      ...summarise(chunk),
      key: `${first}_${last}`,
      label: `${formatWeek(first)} → ${formatWeek(last)}`,
    })
  }
  return out
}

function summarise(weeks: WeekScore[]): Omit<PeriodScore, 'key' | 'label'> {
  const logged = weeks.filter((w) => w.score > 0)
  const total = weeks.reduce((sum, w) => sum + w.score, 0)
  return {
    weeks: weeks.map((w) => w.weekId),
    weeksLogged: logged.length,
    weeksMissing: weeks.length - logged.length,
    // Averaged over every week in the period, not just the logged ones: three
    // brilliant weeks out of thirteen is not a 90% quarter.
    averageScore: weeks.length ? Math.round(total / weeks.length) : 0,
    minutes: weeks.reduce((sum, w) => sum + w.minutes, 0),
    entryCount: weeks.reduce((sum, w) => sum + w.entryCount, 0),
  }
}

// ---------------------------------------------------------------------------
// Gaps
// ---------------------------------------------------------------------------

/**
 * Runs of consecutive weeks with nothing in them. Reported as runs rather than
 * a list of 40 week ids, because "W12 to W19, eight weeks" is something you can
 * act on and a wall of ids is not.
 */
export function findGaps(scores: WeekScore[], threshold = 0): Gap[] {
  const gaps: Gap[] = []
  let run: WeekId[] = []

  const flush = () => {
    if (run.length === 0) return
    gaps.push({ from: run[0], to: run[run.length - 1], weeks: [...run], count: run.length })
    run = []
  }

  for (const score of scores) {
    if (score.score <= threshold) run.push(score.weekId)
    else flush()
  }
  flush()
  return gaps
}

/** Weeks that were logged but too thinly to be worth much at an exam. */
export function findThinWeeks(scores: WeekScore[], min = 60): WeekScore[] {
  return scores.filter((s) => s.score > 0 && s.score < min)
}

/** Consecutive logged weeks ending at `upTo`. The streak the UI nags about. */
export function currentStreak(scores: WeekScore[], upTo?: WeekId): number {
  const end = upTo ?? scores[scores.length - 1]?.weekId
  if (!end) return 0
  const byWeek = new Map(scores.map((s) => [s.weekId, s]))
  let streak = 0
  let cursor = end
  // The current week is not a miss until it is over, so start from the last
  // completed week if the current one is empty.
  if ((byWeek.get(cursor)?.score ?? 0) === 0) cursor = addWeeks(cursor, -1)
  while (byWeek.has(cursor) && (byWeek.get(cursor)?.score ?? 0) > 0) {
    streak++
    cursor = addWeeks(cursor, -1)
  }
  return streak
}

export function bestStreak(scores: WeekScore[]): number {
  let best = 0
  let run = 0
  for (const s of scores) {
    if (s.score > 0) {
      run++
      best = Math.max(best, run)
    } else {
      run = 0
    }
  }
  return best
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}
