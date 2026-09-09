import { describe, expect, it } from 'vitest'
import { buildMissions, isOnTrack, missionHeadline, rankFor, RANKS } from '@/lib/pedr/missions'
import { computeCoverage, participationTrend } from '@/lib/pedr/coverage'
import { computeProgress } from '@/lib/pedr/progress'
import { planSheetPeriods, summariseDeadlines } from '@/lib/pedr/deadlines'
import { scoreWeeks } from '@/lib/pedr/scoring'
import { weekIdOf } from '@/lib/pedr/week'
import type { Entry } from '@/lib/pedr/types'
import type { StageId, CriterionId } from '@/lib/pedr/constants'
import { entry } from './helpers'

const TODAY = '2026-09-09'
const START = '2025-05-09'

/** The board as it comes out for a given record, with everything derived. */
function board(entries: Entry[], opts: {
  hasExperienceStart?: boolean
  hasEmployment?: boolean
  projectCount?: number
  sheets?: never[]
} = {}) {
  const from = weekIdOf(START)
  const to = weekIdOf(TODAY)
  const scores = scoreWeeks(from, to, entries, [])
  const coverage = computeCoverage(entries)
  const progress = computeProgress(entries, scores, [], { today: TODAY })
  const deadlines = summariseDeadlines(planSheetPeriods(START, { today: TODAY, sheets: [] }))
  return buildMissions({
    thisWeek: scores[scores.length - 1] ?? null,
    scores,
    coverage,
    deadlines,
    progress,
    participation: participationTrend(entries),
    hasExperienceStart: opts.hasExperienceStart ?? true,
    hasEmployment: opts.hasEmployment ?? true,
    projectCount: opts.projectCount ?? 3,
  })
}

/**
 * One date per week, counting back from today. The obvious shortcut —
 * `2026-0${i % 9}-0${i % 8}` — collides on dates and quietly produces a
 * record a third the length you meant, which then fails the month thresholds
 * for reasons that look like engine bugs.
 */
function weeklyDates(count: number, endingAt = TODAY): string[] {
  const end = new Date(`${endingAt}T00:00:00.000Z`)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(end)
    d.setUTCDate(d.getUTCDate() - (count - 1 - i) * 7)
    return d.toISOString().slice(0, 10)
  })
}

/** A week with everything an examiner wants in it. */
function fullWeek(date: string): Entry[] {
  return [
    entry({
      date, minutes: 300, stage: 4 as StageId, projectId: 'p1',
      activity: 'Issued the curtain wall head detail after the facade meeting',
      people: ['Sarah Chen'], criteria: ['PC5'] as CriterionId[],
      wentWrong: 'Sent the wrong revision and had to reissue within the hour.',
    }),
    entry({
      date, minutes: 240, stage: 3 as StageId, projectId: 'p1',
      activity: 'Prepared the planning submission pack for Battersea',
      people: ['Priya Nair'], criteria: ['PC3'] as CriterionId[],
    }),
  ]
}

// ---------------------------------------------------------------------------

describe('rankFor', () => {
  it('starts everybody at the beginning', () => {
    expect(rankFor(0).rank.id).toBe('starting')
    expect(rankFor(2.9).rank.id).toBe('starting')
  })

  it('moves up on months of experience, not on activity', () => {
    expect(rankFor(3).rank.id).toBe('first-sheet')
    expect(rankFor(12.4).rank.id).toBe('year')
    expect(rankFor(24).rank.id).toBe('eligible')
    expect(rankFor(40).rank.id).toBe('eligible')
  })

  it('says how far the next one is', () => {
    const at = rankFor(5)
    expect(at.next?.id).toBe('halfway-year')
    expect(at.toNext).toBe(1)
  })

  it('has nothing beyond eligible, because there is nothing beyond it', () => {
    expect(rankFor(24).next).toBeNull()
    expect(RANKS[RANKS.length - 1].fromMonths).toBe(24)
  })
})

describe('missions from setup', () => {
  it('asks for the start date before anything else', () => {
    const b = board(fullWeek(TODAY), { hasExperienceStart: false })
    expect(b.headline?.id).toBe('setup-start')
    expect(b.headline?.kind).toBe('setup')
  })

  it('asks for the supervisor, because a sheet needs their number', () => {
    const b = board(fullWeek(TODAY), { hasEmployment: false })
    expect(b.missions.some((m) => m.id === 'setup-employment')).toBe(true)
  })

  it('asks for projects once the essentials are in', () => {
    const b = board(fullWeek(TODAY), { projectCount: 0 })
    expect(b.missions.some((m) => m.id === 'setup-projects')).toBe(true)
  })

  it('says nothing about setup when it is done', () => {
    const b = board(fullWeek(TODAY))
    expect(b.missions.some((m) => m.kind === 'setup')).toBe(false)
  })
})

describe('missions from the week in progress', () => {
  it('asks for the highest-value thing missing', () => {
    // Nothing logged at all this week.
    const b = board([entry({ date: '2026-01-06' })])
    const logged = b.missions.find((m) => m.id === 'week-logged')
    expect(logged).toBeTruthy()
    expect(logged?.points).toBe(40)
  })

  it('worth exactly what the score says, never an invented number', () => {
    const b = board([entry({
      date: TODAY, activity: 'worked on drawings', projectId: null,
      people: [], criteria: [], wentWrong: null,
    })])
    const byId = Object.fromEntries(b.missions.map((m) => [m.id, m.points]))
    expect(byId['week-projects']).toBe(15)
    expect(byId['week-activities']).toBe(15)
    expect(byId['week-people']).toBe(10)
    expect(byId['week-wentWrong']).toBe(20)
  })

  it('adds up what is still on the table this week', () => {
    const b = board([entry({
      date: TODAY, activity: 'worked on drawings', projectId: null,
      people: [], criteria: [], wentWrong: null,
    })])
    expect(b.availableThisWeek).toBe(15 + 15 + 10 + 20)
  })

  it('drops a week mission once it is satisfied', () => {
    const b = board(fullWeek(TODAY))
    expect(b.missions.some((m) => m.id === 'week-people')).toBe(false)
    expect(b.missions.some((m) => m.id === 'week-wentWrong')).toBe(false)
  })

  it('does not demand friction to call a week finished', () => {
    // A week where nothing went wrong genuinely has nothing to write in that
    // box, and demanding it would teach people to invent it.
    const b = board(fullWeek(TODAY))
    expect(b.weekTarget).toBe(80)
    expect(b.weekScore).toBeGreaterThanOrEqual(b.weekTarget)
  })
})

describe('missions from coverage', () => {
  // A year of weeks, every one of them at Stage 4 — the specialised-team
  // record this whole view exists to catch.
  const oneStage = weeklyDates(52).map((date) =>
    entry({ date, stage: 4 as StageId, projectId: 'p1', criteria: ['PC5'] as CriterionId[] }),
  )

  it('names the stages with nothing against them', () => {
    const b = board(oneStage)
    const mission = b.missions.find((m) => m.id === 'coverage-stages')
    expect(mission).toBeTruthy()
    expect(mission?.title).toMatch(/Stages 0, 1, 2, 3, 5, 6, 7/)
  })

  it('carries no points, because you cannot type your way out of it', () => {
    const b = board(oneStage)
    expect(b.missions.find((m) => m.id === 'coverage-stages')?.points).toBe(0)
  })

  it('gets more urgent the later it is left', () => {
    const early = board([entry({ date: TODAY, stage: 4 as StageId })])
    expect(early.missions.find((m) => m.id === 'coverage-stages')?.urgency).toBe('whenever')
    const late = board(oneStage)
    expect(late.missions.find((m) => m.id === 'coverage-stages')?.urgency).toBe('now')
  })

  it('shows how much of the map is covered', () => {
    const b = board(oneStage)
    expect(b.missions.find((m) => m.id === 'coverage-stages')?.progress)
      .toEqual({ done: 1, target: 8 })
  })
})

describe('missions from the participant and observer balance', () => {
  // A year of weeks, half of every one of them observed and never improving.
  const stuck = weeklyDates(52).flatMap((date) => [
    entry({ date, minutes: 300, stage: 4 as StageId, projectId: 'p1', participation: 'observer' }),
    entry({ date, minutes: 300, stage: 4 as StageId, projectId: 'p1', participation: 'participant' }),
  ])

  it('says something when the share is high and flat', () => {
    const b = board(stuck)
    expect(b.missions.some((m) => m.id === 'balance-observer')).toBe(true)
  })

  it('says nothing when it is already falling', () => {
    const dates = weeklyDates(52)
    const falling = dates.map((date, i) => entry({
      date,
      minutes: 300,
      // Mostly watching in the first half, almost all doing by the end.
      participation: i < dates.length / 2 ? 'observer' : 'participant',
    }))
    expect(board(falling).missions.some((m) => m.id === 'balance-observer')).toBe(false)
  })

  it('notices a record with nothing observed at all', () => {
    const allDone = weeklyDates(30).map((date) => entry({ date, participation: 'participant' }))
    expect(board(allDone).missions.some((m) => m.id === 'balance-none-observed')).toBe(true)
  })
})

describe('ordering', () => {
  it('puts setup above a late sheet, and a late sheet above a week nit', () => {
    const b = board([entry({ date: '2025-06-02' })], { hasExperienceStart: false })
    const kinds = b.missions.map((m) => m.kind)
    expect(kinds[0]).toBe('setup')
    expect(kinds.indexOf('deadline')).toBeLessThan(
      kinds.indexOf('coverage') === -1 ? Infinity : kinds.indexOf('coverage'),
    )
  })

  it('puts the most valuable week mission before the cheaper ones', () => {
    const b = board([entry({
      date: TODAY, activity: 'worked on drawings', projectId: null,
      people: [], criteria: [], wentWrong: null,
    })])
    const weekly = b.missions.filter((m) => m.kind === 'week')
    expect(weekly.map((m) => m.points)).toEqual([...weekly.map((m) => m.points)].sort((a, b) => b - a))
  })
})

describe('the headline', () => {
  it('never congratulates a record with something outstanding', () => {
    const b = board([entry({ date: '2025-06-02' })])
    expect(missionHeadline(b)).not.toMatch(/well done|great|nice/i)
    expect(isOnTrack(b, summariseDeadlines(planSheetPeriods(START, { today: TODAY, sheets: [] }))))
      .toBe(false)
  })

  it('says the week is done when it is', () => {
    const b = board(weeklyDates(9).flatMap(fullWeek))
    expect(b.missions.filter((m) => m.kind === 'week')).toEqual([])
  })
})

describe('the streak', () => {
  it('counts consecutive logged weeks back from the most recent', () => {
    const weeks = weeklyDates(6).map((date) => entry({ date }))
    expect(board(weeks).streak).toBe(6)
  })

  it('is zero when this week is empty', () => {
    expect(board([entry({ date: '2026-01-06' })]).streak).toBe(0)
  })
})
