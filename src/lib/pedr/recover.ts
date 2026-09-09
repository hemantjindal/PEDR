import { REQUIREMENTS, SHEET_RULES } from './constants'
import { normaliseActivity } from './scoring'
import type { DraftEntry, EntrySource } from './types'
import {
  addDays, addMonths, daysBetween, formatDate, formatWeekRange, monthKeyOf, todayKey,
  weekIdOf, weekRange, weekStartKey, type DateKey, type WeekId,
} from './week'

/**
 * Catching up.
 *
 * Every feature before this one was built for somebody keeping up — a weekly
 * score, a streak, a nudge on a Friday. Almost nobody doing a PEDR is keeping
 * up. They put it off for a term, then a quarter, then it becomes a thing they
 * are afraid of, and by the time they open it there are eight months of blank
 * weeks and a streak of zero, which is a shame machine rather than a tool.
 *
 * So this is the other direction. You do not have to remember eight months.
 * You already recorded them — in your calendar, in the practice timesheet, in
 * a Teams thread — and this pulls those together, merges them, tells you which
 * weeks it managed to reach, and for the ones it could not, tells you what it
 * *does* know about that week so you have something to remember from.
 *
 * The one rule: this recovers, it never invents. A week nothing reached comes
 * back blank with a prompt, not with a plausible sentence in it. A PEDR is
 * signed by a mentor and read by an examiner, and a fabricated week is the one
 * failure this whole tool exists to prevent.
 */

export type RecoverySource = EntrySource | 'memory'

export interface SourceBatch {
  /** Where these came from, for the report and for the merge order. */
  source: RecoverySource
  /** A human label: "Outlook export", "Practice timesheet Q1". */
  label: string
  entries: DraftEntry[]
}

export interface RecoveredWeek {
  weekId: WeekId
  start: DateKey
  entries: DraftEntry[]
  minutes: number
  /** Which sources reached this week. */
  sources: RecoverySource[]
  /** Nothing reached it. */
  blank: boolean
  /**
   * Recovered, but only just: a single entry, or nothing anybody could be
   * asked a follow-up question about. Worth a second pass.
   */
  thin: boolean
}

export interface BlankWeekPrompt {
  weekId: WeekId
  label: string
  /**
   * What is known about the week even though nothing was recovered — the
   * projects you were on either side of it, whether anything was filtered out.
   * Recall needs a handle; "what did you do in February" does not have one.
   */
  context: string
  /** The question to put in front of somebody, given that context. */
  ask: string
}

export interface RecoveryReport {
  from: DateKey
  to: DateKey
  weeks: RecoveredWeek[]
  /** Merged and deduplicated across every source. */
  entries: DraftEntry[]
  /** Weeks that now have something in them. */
  recovered: number
  /** Weeks in the window, total. */
  total: number
  blank: WeekId[]
  thin: WeekId[]
  bySource: Array<{ source: RecoverySource; label: string; kept: number; duplicates: number }>
  prompts: BlankWeekPrompt[]
  /** Months of experience this window is worth if it all stands up. */
  monthsRecovered: number
  headline: string
}

export interface RecoverOptions {
  from: DateKey
  to: DateKey
  sources: SourceBatch[]
  /** Weeks already on the record, so recovery does not duplicate them. */
  existing?: DraftEntry[]
}

/**
 * How trustworthy a source is when two of them describe the same afternoon.
 *
 * A timesheet is somebody's billing record and has the hours right. A calendar
 * has the date and the people right. A chat log is the loosest. When they
 * collide, the higher number wins and the other is dropped as a duplicate
 * rather than doubling the day.
 */
const PRECEDENCE: Record<RecoverySource, number> = {
  manual: 6,
  memory: 5,
  timesheet: 4,
  calendar: 3,
  import: 2,
  dump: 1,
  teams: 0,
}

export function recover(opts: RecoverOptions): RecoveryReport {
  const { from, to } = opts
  const weekIds = weekRange(from, to)

  // Existing entries are not re-imported, but they do count as "this week is
  // not blank" — otherwise catching up would ask you to redo what is done.
  const existing = (opts.existing ?? []).filter((e) => e.date >= from && e.date <= to)

  const seen: DraftEntry[] = [...existing]
  const kept: DraftEntry[] = []
  const bySource: RecoveryReport['bySource'] = []

  // Most trustworthy first, so the survivor of a collision is the better row.
  const ordered = [...opts.sources].sort(
    (a, b) => PRECEDENCE[b.source] - PRECEDENCE[a.source],
  )

  for (const batch of ordered) {
    let keptHere = 0
    let duplicates = 0
    for (const entry of batch.entries) {
      if (entry.date < from || entry.date > to) continue
      if (seen.some((other) => isSameThing(entry, other))) {
        duplicates++
        continue
      }
      const tagged = { ...entry, source: sourceFor(batch.source) }
      seen.push(tagged)
      kept.push(tagged)
      keptHere++
    }
    bySource.push({ source: batch.source, label: batch.label, kept: keptHere, duplicates })
  }

  // --- Week by week -------------------------------------------------------

  const all = [...existing, ...kept]
  const byWeek = new Map<WeekId, DraftEntry[]>()
  for (const entry of all) {
    const weekId = weekIdOf(entry.date)
    const bucket = byWeek.get(weekId)
    if (bucket) bucket.push(entry)
    else byWeek.set(weekId, [entry])
  }

  const weeks: RecoveredWeek[] = weekIds.map((weekId) => {
    const entries = byWeek.get(weekId) ?? []
    const minutes = entries.reduce((sum, e) => sum + e.minutes, 0)
    const sources = [...new Set(entries.map((e) => e.source as RecoverySource))]
    return {
      weekId,
      start: weekStartKey(weekId),
      entries,
      minutes,
      sources,
      blank: entries.length === 0,
      // One line is a week you have technically logged and cannot discuss.
      thin: entries.length > 0 && entries.length < 2,
    }
  })

  const blank = weeks.filter((w) => w.blank).map((w) => w.weekId)
  const thin = weeks.filter((w) => w.thin).map((w) => w.weekId)
  const recovered = weeks.length - blank.length
  const monthsRecovered = Math.round((recovered / REQUIREMENTS.weeksPerMonth) * 10) / 10

  return {
    from,
    to,
    weeks,
    entries: kept,
    recovered,
    total: weeks.length,
    blank,
    thin,
    bySource,
    prompts: promptsFor(weeks),
    monthsRecovered,
    headline: headlineFor(recovered, weeks.length, monthsRecovered, kept.length),
  }
}

function headlineFor(
  recovered: number,
  total: number,
  months: number,
  entries: number,
): string {
  if (total === 0) return 'That window has no weeks in it.'
  if (recovered === 0) {
    return 'Nothing reached those weeks. That is not a dead end — it means the record has to come ' +
      'from you, and the prompts below are built from what little is known about each one.'
  }
  if (recovered === total) {
    return `Every one of the ${total} weeks now has something in it — ${entries} entries, about ` +
      `${months} months of experience. Read them before you keep them.`
  }
  return `${recovered} of ${total} weeks recovered from ${entries} entries — about ${months} ` +
    `months. ${total - recovered} weeks nothing could reach; they are below with what is known ` +
    'about each.'
}

/**
 * Two records of the same afternoon.
 *
 * The same design team meeting is in the calendar and on the timesheet. Same
 * day plus a recognisably similar activity is enough — this errs towards
 * keeping both, because a duplicate is visible on the review screen and gets
 * deleted in one click, whereas something wrongly dropped is invisible.
 */
export function isSameThing(a: DraftEntry, b: DraftEntry): boolean {
  if (a.date !== b.date) return false
  if (a.externalId && b.externalId) return a.externalId === b.externalId

  const left = normaliseActivity(a.activity)
  const right = normaliseActivity(b.activity)
  if (!left || !right) return false
  if (left === right) return true

  // One is a prefix of the other: "Design team meeting" against "Design team
  // meeting 1042" is the same hour recorded twice, differently.
  if (left.startsWith(right) || right.startsWith(left)) return true

  // Same project, same day, and the durations are within a few minutes: two
  // systems rounding the same block.
  if (a.projectId && a.projectId === b.projectId && a.minutes > 0) {
    if (Math.abs(a.minutes - b.minutes) <= 15) return true
  }
  return false
}

/**
 * What we can still say about a week nothing reached.
 *
 * "What did you do in the week of 12 February?" is unanswerable. "You were on
 * 1042 the week before and the week after, and your calendar had three
 * meetings that week which were all filtered out as routine" is a handle, and
 * most people can pull the week back with one.
 *
 * Runs of blank weeks are handled apart from single ones. The nearest weeks
 * with anything in them are, by definition, the same on both sides of a run,
 * so asking each week of a five-week gap separately produced five identical
 * paragraphs — which reads as broken and is no help to anyone. A run is also
 * usually one thing: leave, a secondment, a quiet spell between jobs. So the
 * run gets asked about once, as a run, and the rest of it only has to say
 * whether it differed.
 */
function promptsFor(weeks: RecoveredWeek[]): BlankWeekPrompt[] {
  return weeks
    .map((week, index) => {
      if (!week.blank) return null

      const before = previousWithEntries(weeks, index)
      const after = nextWithEntries(weeks, index)
      const run = runAround(weeks, index)
      const position = index - run.start + 1

      // Somewhere in the middle of a gap. The head of the run carries the
      // context; repeating it here would say nothing new.
      if (run.length > 1 && position > 1) {
        return {
          weekId: week.weekId,
          label: formatWeekRange(week.weekId),
          context:
            `Week ${position} of the ${run.length}-week gap that starts ` +
            `${formatWeekRange(weeks[run.start].weekId)}.`,
          ask: 'Same as the rest of that gap, or was this week different?',
        }
      }

      const projects = [
        ...new Set(
          [...(before?.entries ?? []), ...(after?.entries ?? [])]
            .map((e) => e.projectHint ?? e.projectId)
            .filter((v): v is string => Boolean(v)),
        ),
      ]

      const opening = run.length > 1
        ? `${run.length} weeks in a row with nothing in them at all` +
          `${before ? `. Before the gap, ${describe(before)}` : ''}` +
          `${after ? `. After it, ${describe(after)}` : ''}.`
        : projects.length > 0
          ? `Either side of this week you were on ${projects.length === 1 ? 'one job' : `${projects.length} jobs`}` +
            `${before ? `. The week before, ${describe(before)}` : ''}` +
            `${after ? `. The week after, ${describe(after)}` : ''}.`
          : before || after
            ? `Nothing recovered here${before ? `, but the week before ${describe(before)}` : ''}` +
              `${after ? `, and the week after ${describe(after)}` : ''}.`
            : 'Nothing recovered here, and nothing either side of it to go on.'

      return {
        weekId: week.weekId,
        label: formatWeekRange(week.weekId),
        context: opening,
        ask: run.length > 1
          ? 'A gap that long is usually one thing — leave, a secondment, or a quiet spell ' +
            'between jobs. Which was it? One answer covers the whole run.'
          : projects.length > 0
            ? 'Same job that week, or something else? One line is enough.'
            : 'What were you on that week? One line is enough — the shape matters more than the detail.',
      }
    })
    .filter((p): p is BlankWeekPrompt => p !== null)
}

/** The unbroken run of blank weeks containing `index`. */
function runAround(weeks: RecoveredWeek[], index: number): { start: number; length: number } {
  let start = index
  while (start > 0 && weeks[start - 1].blank) start--
  let end = index
  while (end + 1 < weeks.length && weeks[end + 1].blank) end++
  return { start, length: end - start + 1 }
}

function previousWithEntries(weeks: RecoveredWeek[], index: number): RecoveredWeek | null {
  for (let i = index - 1; i >= 0 && i >= index - 4; i--) {
    if (!weeks[i].blank) return weeks[i]
  }
  return null
}

function nextWithEntries(weeks: RecoveredWeek[], index: number): RecoveredWeek | null {
  for (let i = index + 1; i < weeks.length && i <= index + 4; i++) {
    if (!weeks[i].blank) return weeks[i]
  }
  return null
}

function describe(week: RecoveredWeek): string {
  const first = week.entries.find((e) => e.activity)?.activity
  return first ? `you logged “${truncate(first, 60)}”` : 'there was something'
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

/** 'memory' is how it reached us, not something the entry schema knows about. */
function sourceFor(source: RecoverySource): EntrySource {
  return source === 'memory' ? 'manual' : source
}

// ---------------------------------------------------------------------------
// How far behind, and does it matter
// ---------------------------------------------------------------------------

export type Trouble = 'fine' | 'slipping' | 'behind' | 'serious'

export interface Triage {
  /** How many quarterly sheets the elapsed time should have produced. */
  sheetsDue: number
  sheetsDone: number
  sheetsLate: number
  monthsElapsed: number
  monthsLogged: number
  /** Weeks with nothing in them across the whole period. */
  weeksMissing: number
  trouble: Trouble
  /** The honest answer to "am I in trouble". */
  verdict: string
  /** What to do about it, in order. */
  steps: string[]
  /** Whether the time can still be recovered from other records. */
  recoverable: boolean
}

/**
 * Am I in trouble?
 *
 * The question everybody actually arrives with, and the reason they have not
 * opened it for four months. Fear of a PEDR is almost always worse than the
 * PEDR, because the thing people imagine is "I have lost that time" and the
 * truth is nearly always "that time is recoverable, the deadline is a soft
 * one, and this is a weekend of work rather than a year".
 *
 * So this answers it plainly, including when the answer is bad. A tool that
 * says "you're doing great!" to somebody nine months behind gets closed and
 * never opened again.
 */
export function triage(input: {
  experienceStart: DateKey
  sheetsDone: number
  weeksLogged: number
  today?: DateKey
}): Triage {
  const today = input.today ?? todayKey()
  const monthsElapsed = Math.max(
    0,
    Math.round((daysBetween(input.experienceStart, today) / 30.44) * 10) / 10,
  )
  const monthsLogged = Math.round((input.weeksLogged / REQUIREMENTS.weeksPerMonth) * 10) / 10

  // A period is only "due" once its own two-month grace has also passed.
  const sheetsDue = Math.max(
    0,
    Math.floor((monthsElapsed - SHEET_RULES.submitWithinMonths) / SHEET_RULES.maxPeriodMonths),
  )
  const sheetsLate = Math.max(0, sheetsDue - input.sheetsDone)
  const totalWeeks = Math.max(0, Math.round(daysBetween(input.experienceStart, today) / 7))
  const weeksMissing = Math.max(0, totalWeeks - input.weeksLogged)

  const trouble: Trouble =
    sheetsLate === 0 && weeksMissing <= 4 ? 'fine'
    : sheetsLate <= 1 ? 'slipping'
    : sheetsLate <= 3 ? 'behind'
    : 'serious'

  // Anything inside a couple of years is still sitting in a calendar and a
  // timesheet. Beyond that the systems have usually been wiped or you have
  // changed jobs, and it becomes a conversation with your PSA instead.
  const recoverable = monthsElapsed - monthsLogged <= 26

  const verdict = {
    fine:
      `${monthsElapsed} months in, ${monthsLogged} logged, nothing overdue. You are in the small ` +
      'minority who are on top of this.',
    slipping:
      `${monthsElapsed} months in and ${monthsLogged} logged. One sheet is past its deadline — ` +
      'annoying, not serious, and entirely fixable this week.',
    behind:
      `${sheetsLate} sheets past their deadline and ${weeksMissing} weeks with nothing in them. ` +
      'This is the normal state of a PEDR at this point, and it is a weekend of work rather than ' +
      'a lost year.',
    serious:
      `${sheetsLate} sheets overdue and ${weeksMissing} weeks blank. That is a lot, and it is ` +
      'worth saying plainly: your PSA cannot give you useful feedback on a period this far back, ' +
      'and a run of late sheets is something an examiner can count. It is still recoverable — ' +
      'almost all of it is sitting in your calendar and your timesheets — but do it now, not next term.',
  }[trouble]

  const steps: string[] = []
  if (weeksMissing > 4) {
    steps.push(
      recoverable
        ? `Recover the ${weeksMissing} blank weeks from your calendar and your practice timesheet ` +
          'before you try to remember any of it. Most of it is already written down.'
        : 'Some of this is far enough back that the systems may have been wiped. Start with what ' +
          'you can still reach, and talk to your PSA about the rest — they have seen worse.',
    )
  }
  if (sheetsLate > 0) {
    steps.push(
      `Write up the ${sheetsLate} overdue ${sheetsLate === 1 ? 'sheet' : 'sheets'} oldest first. ` +
      'A late sheet still counts; an unwritten one does not.',
    )
  }
  steps.push(
    sheetsLate > 0
      ? 'Tell your PSA before they notice. Everybody is late; the ones who get a hard time are ' +
        'the ones who go quiet.'
      : 'Put twenty minutes in your calendar for Friday afternoon, repeating. That is the whole habit.',
  )

  return {
    sheetsDue,
    sheetsDone: input.sheetsDone,
    sheetsLate,
    monthsElapsed,
    monthsLogged,
    weeksMissing,
    trouble,
    verdict,
    steps,
    recoverable,
  }
}

/** A sensible window to try to recover: back to the start, capped at two years. */
export function recoveryWindow(experienceStart: DateKey, today = todayKey()) {
  const cap = addMonths(today, -24)
  return { from: experienceStart > cap ? experienceStart : cap, to: today }
}

export { monthKeyOf, addDays, formatDate }
