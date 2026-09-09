import {
  PROFESSIONAL_CRITERIA, REQUIREMENTS, RIBA_STAGES, SCORING, SHEET_RULES,
} from './constants'
import type { Coverage } from './types'
import type { DeadlineSummary } from './deadlines'
import type { ParticipationTrend } from './coverage'
import type { Progress, WeekScore } from './types'
import { formatWeekRange, type WeekId } from './week'

/**
 * The next thing to do, and why it is worth doing.
 *
 * The case for making this feel like a game is real: the failure mode of a
 * PEDR is not difficulty, it is that nothing happens if you skip a week, and
 * nothing keeps happening until month twenty-two, when suddenly everything
 * happens at once. Anything that makes the cost of skipping visible today is
 * doing the job.
 *
 * The case against most gamification is equally real, and it is the reason
 * everything here is derived rather than invented. There is no separate points
 * currency: a mission is worth what the thing it asks for is actually worth on
 * the record, and the numbers come straight from `SCORING`, from coverage that
 * is genuinely empty, and from deadlines that genuinely exist. If a mission
 * could be satisfied by typing something untrue, it does not belong here.
 *
 * So: no badges for logging in, no streak that punishes a fortnight's leave,
 * and no confetti for a week that would embarrass you at the oral.
 */

export type MissionKind =
  /** Something missing from the week in progress. Cheap, immediate. */
  | 'week'
  /** A stage or criterion with nothing against it. Expensive, strategic. */
  | 'coverage'
  /** A sheet that is due, or late. */
  | 'deadline'
  /** The shift from watching to doing. */
  | 'balance'
  /** Setup the record cannot work without. */
  | 'setup'

export type MissionUrgency = 'now' | 'soon' | 'whenever'

export interface Mission {
  id: string
  kind: MissionKind
  urgency: MissionUrgency
  /** What to do, in the imperative, short enough for a card. */
  title: string
  /** Why it is worth doing, in the terms an examiner would use. */
  why: string
  /** Points on the record. Real ones — see the note above. */
  points: number
  /** Where doing it happens. */
  href: string
  /** Progress towards it, when it is the kind of thing you can be part-way through. */
  progress?: { done: number; target: number }
}

export interface Rank {
  id: string
  /** What you are, in PEDR terms rather than invented ones. */
  name: string
  /** The months of experience this rank starts at. */
  fromMonths: number
  blurb: string
}

/**
 * Ranks are months of qualifying experience, because that is the thing that
 * actually gates the exam. Nobody needs a made-up ladder next to a real one.
 */
export const RANKS: Rank[] = [
  { id: 'starting', name: 'Starting out', fromMonths: 0, blurb: 'The record begins.' },
  { id: 'first-sheet', name: 'First sheet', fromMonths: 3, blurb: 'One quarter down. Seven to go.' },
  { id: 'halfway-year', name: 'Half a year', fromMonths: 6, blurb: 'Long enough to see what you are missing.' },
  { id: 'year', name: 'A year in', fromMonths: 12, blurb: 'Half the experience. All of the habits.' },
  { id: 'recent-window', name: 'In the window', fromMonths: 18, blurb: 'The last stretch counts twice — it has to be recent.' },
  { id: 'eligible', name: 'Eligible', fromMonths: 24, blurb: 'The experience requirement is met.' },
]

export function rankFor(monthsLogged: number): { rank: Rank; next: Rank | null; toNext: number } {
  const index = Math.max(
    0,
    RANKS.reduce((found, rank, i) => (monthsLogged >= rank.fromMonths ? i : found), 0),
  )
  const rank = RANKS[index]
  const next = RANKS[index + 1] ?? null
  return { rank, next, toNext: next ? Math.max(0, next.fromMonths - monthsLogged) : 0 }
}

export interface MissionInput {
  thisWeek: WeekScore | null
  scores: WeekScore[]
  coverage: Coverage
  deadlines: DeadlineSummary
  progress: Progress
  participation: ParticipationTrend
  /** False when the app is still working off a guessed start date. */
  hasExperienceStart: boolean
  hasEmployment: boolean
  projectCount: number
}

export interface MissionBoard {
  missions: Mission[]
  /** The one to do first. */
  headline: Mission | null
  rank: Rank
  nextRank: Rank | null
  monthsToNextRank: number
  /** This week out of 100, and what would take it higher. */
  weekScore: number
  weekTarget: number
  streak: number
  /** Points sitting on the table this week. */
  availableThisWeek: number
}

/** How many weeks in a row, counting back from the most recent. */
function streakOf(scores: WeekScore[]): number {
  let count = 0
  for (let i = scores.length - 1; i >= 0; i--) {
    if (scores[i].score <= 0) break
    count++
  }
  return count
}

export function buildMissions(input: MissionInput): MissionBoard {
  const missions: Mission[] = []
  const { thisWeek, coverage, deadlines, progress, participation } = input

  // --- Setup ---------------------------------------------------------------
  // Nothing else on the dashboard means anything without these, so they sit
  // above every other kind of mission regardless of points.

  if (!input.hasExperienceStart) {
    missions.push({
      id: 'setup-start',
      kind: 'setup',
      urgency: 'now',
      title: 'Say when your experience started',
      why:
        'Every date on this dashboard is counted from it — when you can sit, what is overdue, ' +
        'which quarter you are in. Until it is set, they are guesses.',
      points: 0,
      href: '/settings',
    })
  }
  if (!input.hasEmployment) {
    missions.push({
      id: 'setup-employment',
      kind: 'setup',
      urgency: 'now',
      title: 'Add where you work and who supervises you',
      why:
        'Category i experience has to be supervised by a registered architect, and their ' +
        'registration number goes on every sheet. It is the first thing a PSA checks.',
      points: 0,
      href: '/settings',
    })
  }
  if (input.projectCount === 0) {
    missions.push({
      id: 'setup-projects',
      kind: 'setup',
      urgency: 'soon',
      title: 'Add the jobs you are on',
      why:
        'Once a job number and its nicknames are here, writing "1042" or "Battersea" files the ' +
        'entry by itself. Sheets are assessed per project.',
      points: 0,
      href: '/projects',
    })
  }

  // --- Deadlines -----------------------------------------------------------
  // A late sheet cannot be un-latened, so this outranks everything else.

  if (deadlines.lateCount > 0) {
    missions.push({
      id: 'deadline-late',
      kind: 'deadline',
      urgency: 'now',
      title: `Finish ${deadlines.lateCount} overdue ${deadlines.lateCount === 1 ? 'sheet' : 'sheets'}`,
      why:
        `A sheet has to be completed within ${SHEET_RULES.submitWithinMonths} months of the period ` +
        'it covers. Past that, your PSA cannot give feedback that is any use, and a run of late ' +
        'sheets is a number an examiner can count.',
      points: 0,
      href: '/sheets',
    })
  } else if (deadlines.nextDue && deadlines.nextDue.daysUntilDue <= 30) {
    missions.push({
      id: 'deadline-next',
      kind: 'deadline',
      urgency: deadlines.nextDue.daysUntilDue <= 14 ? 'now' : 'soon',
      title: `Write up the quarter due in ${deadlines.nextDue.daysUntilDue} days`,
      why: 'It is far quicker now, while you can still remember the weeks it covers.',
      points: 0,
      href: '/sheets',
      progress: { done: 30 - deadlines.nextDue.daysUntilDue, target: 30 },
    })
  }

  // --- This week -----------------------------------------------------------
  // The cheap ones. Each is worth exactly what the score says it is worth,
  // because it is the same component.

  const weekHref = thisWeek ? `/weeks/${thisWeek.weekId}` : '/dump'
  if (thisWeek) {
    for (const component of thisWeek.components) {
      if (component.earned > 0 || !component.fix) continue
      missions.push({
        id: `week-${component.id}`,
        kind: 'week',
        urgency: component.id === 'logged' ? 'now' : 'soon',
        title: component.fix,
        why: component.why,
        points: component.points,
        href: component.id === 'logged' ? '/dump' : weekHref,
      })
    }
  }

  // --- Coverage ------------------------------------------------------------
  // The expensive ones. No points, because you cannot fix a missing stage by
  // typing — you have to be put on different work, which is a conversation.

  const emptyStages = coverage.stages.filter((s) => s.minutes === 0)
  if (emptyStages.length > 0) {
    const names = emptyStages.map((s) => s.id).join(', ')
    missions.push({
      id: 'coverage-stages',
      kind: 'coverage',
      urgency: progress.monthsLogged > 9 ? 'now' : 'whenever',
      title: `Ask to be put on work at ${emptyStages.length === 1 ? 'Stage' : 'Stages'} ${names}`,
      why:
        'Breadth across the Plan of Work is what a PSA signs off on. A stage still empty at month ' +
        'twenty is very hard to fix; at month eight it is one conversation with your team leader.',
      points: 0,
      href: '/coverage',
      progress: { done: RIBA_STAGES.length - emptyStages.length, target: RIBA_STAGES.length },
    })
  }

  const emptyCriteria = coverage.criteria.filter((c) => c.minutes === 0)
  if (emptyCriteria.length > 0) {
    missions.push({
      id: 'coverage-criteria',
      kind: 'coverage',
      urgency: progress.monthsLogged > 12 ? 'now' : 'whenever',
      title: `Get something against ${emptyCriteria.map((c) => c.id).join(', ')}`,
      why:
        'The Professional Criteria are what the oral exam is actually about. An empty one is a ' +
        'question you will be asked and cannot answer from your own record.',
      points: 0,
      href: '/coverage',
      progress: {
        done: PROFESSIONAL_CRITERIA.length - emptyCriteria.length,
        target: PROFESSIONAL_CRITERIA.length,
      },
    })
  }

  // --- Balance -------------------------------------------------------------

  if (
    participation.observerShare !== null &&
    participation.observerShare > 0.35 &&
    progress.monthsLogged >= 9 &&
    (participation.shift ?? 0) > -0.05
  ) {
    missions.push({
      id: 'balance-observer',
      kind: 'balance',
      urgency: 'soon',
      title: 'Ask to run something yourself',
      why:
        `${Math.round(participation.observerShare * 100)}% of your hours are still observed, and ` +
        'the share is not falling. The shift from watching to doing is the development an ' +
        'examiner looks for, and it has to be visible in the record.',
      points: 0,
      href: '/coverage',
    })
  }

  if (participation.observerShare === 0 && progress.monthsLogged >= 3) {
    missions.push({
      id: 'balance-none-observed',
      kind: 'balance',
      urgency: 'whenever',
      title: 'Mark the things you watched rather than did',
      why:
        'Every hour on your record is logged as work you did yourself. The sheet has a second ' +
        'column for observed experience, and a record with nothing in it reads as either ' +
        'incomplete or implausible.',
      points: 0,
      href: '/dump',
    })
  }

  // Most urgent first, then most valuable, then cheapest to satisfy.
  const order: Record<MissionUrgency, number> = { now: 0, soon: 1, whenever: 2 }
  const kindOrder: Record<MissionKind, number> = {
    setup: 0, deadline: 1, week: 2, balance: 3, coverage: 4,
  }
  missions.sort((a, b) =>
    order[a.urgency] - order[b.urgency] ||
    kindOrder[a.kind] - kindOrder[b.kind] ||
    b.points - a.points,
  )

  const { rank, next, toNext } = rankFor(progress.monthsLogged)
  const weekScore = thisWeek?.score ?? 0
  const availableThisWeek = missions
    .filter((m) => m.kind === 'week')
    .reduce((sum, m) => sum + m.points, 0)

  return {
    missions,
    headline: missions[0] ?? null,
    rank,
    nextRank: next,
    monthsToNextRank: Math.round(toNext * 10) / 10,
    weekScore,
    // Not 100: a week where nothing went wrong genuinely has nothing to write
    // in the box that matters, and demanding it would teach people to invent
    // friction. Everything except that component is the honest target.
    weekTarget: 100 - SCORING.wentWrong.points,
    streak: streakOf(input.scores),
    availableThisWeek,
  }
}

/**
 * The one line to put at the top of a screen.
 *
 * Deliberately not congratulatory when there is nothing to congratulate: a
 * tool that says "great work!" over a record with four late sheets is a tool
 * nobody believes the next time it says anything.
 */
export function missionHeadline(board: MissionBoard): string {
  if (board.headline) return board.headline.title
  if (board.weekScore >= board.weekTarget) {
    return 'This week is done. Nothing is missing.'
  }
  return 'Nothing outstanding.'
}

/** Whether the record is in a state worth saying something good about. */
export function isOnTrack(board: MissionBoard, deadlines: DeadlineSummary): boolean {
  return (
    deadlines.lateCount === 0 &&
    board.streak >= 4 &&
    board.weekScore >= board.weekTarget &&
    !board.missions.some((m) => m.urgency === 'now')
  )
}

export { REQUIREMENTS }
