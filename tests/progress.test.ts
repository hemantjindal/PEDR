import { describe, expect, it } from 'vitest'
import { computeProgress, employmentForWeek } from '@/lib/pedr/progress'
import { scoreWeeks } from '@/lib/pedr/scoring'
import { REQUIREMENTS } from '@/lib/pedr/constants'
import { addWeeks, weekIdOf, weekRange, weekStartKey } from '@/lib/pedr/week'
import { employment, goodWeek } from './helpers'

/** Entries covering every week from `from` to `to`. */
function loggedThrough(from: string, to: string) {
  return weekRange(from, to).flatMap((w) => goodWeek(w))
}

const TODAY = '2026-09-08'

function progressFor(from: string, to: string, opts: Parameters<typeof computeProgress>[3] = {}) {
  const entries = loggedThrough(from, to)
  const scores = scoreWeeks(from, weekIdOf(TODAY), entries)
  return computeProgress(entries, scores, [employment()], { today: TODAY, ...opts })
}

describe('computeProgress', () => {
  it('is empty and not ready with no data', () => {
    const p = computeProgress([], [], [], { today: TODAY })
    expect(p.weeksLogged).toBe(0)
    expect(p.monthsLogged).toBe(0)
    expect(p.ready).toBe(false)
    expect(p.firstDate).toBeNull()
    expect(p.projectedReadyDate).toBeNull() // no logging rate to extrapolate from
  })

  it('counts experience in weeks logged, not in hours worked', () => {
    // 52 logged weeks is 12 months regardless of how long the days were.
    const p = progressFor('2025-W37', '2026-W36')
    expect(p.weeksLogged).toBe(52)
    expect(p.monthsLogged).toBeCloseTo(12, 0)
  })

  it('does not let a long gap in the middle count as served time', () => {
    const entries = [...loggedThrough('2025-W01', '2025-W10'), ...loggedThrough('2026-W01', '2026-W10')]
    const scores = scoreWeeks('2025-W01', weekIdOf(TODAY), entries)
    const p = computeProgress(entries, scores, [employment()], { today: TODAY })
    expect(p.weeksLogged).toBe(20)
    expect(p.monthsLogged).toBeCloseTo(20 / REQUIREMENTS.weeksPerMonth, 1)
  })

  it('applies the recency rule: old experience stops counting toward the recent total', () => {
    // Two years logged, but all of it finishing well over 24 months ago.
    const p = progressFor('2021-W01', '2023-W02') // 106 weeks ≈ 24.4 months
    const total = p.checks.find((c) => c.id === 'total-months')!
    const recent = p.checks.find((c) => c.id === 'recent-months')!
    expect(total.met).toBe(true)
    expect(recent.met).toBe(false)
    expect(p.monthsRecent).toBe(0)
    expect(p.ready).toBe(false)
  })

  it('is ready when both regulatory checks pass', () => {
    const p = progressFor('2024-W36', '2026-W36') // ~two continuous years to date
    expect(p.checks.find((c) => c.id === 'total-months')!.met).toBe(true)
    expect(p.checks.find((c) => c.id === 'recent-months')!.met).toBe(true)
    expect(p.ready).toBe(true)
    expect(p.weeksRemaining).toBe(0)
  })

  it('readiness ignores our own non-regulatory advice', () => {
    // Two full years, then a deliberate 20-week hole before today.
    const entries = loggedThrough('2024-W01', '2026-W16')
    const scores = scoreWeeks('2024-W01', weekIdOf(TODAY), entries)
    const p = computeProgress(entries, scores, [employment()], { today: TODAY })
    const gapCheck = p.checks.find((c) => c.id === 'no-long-gaps')!
    expect(gapCheck.regulatory).toBe(false)
    expect(gapCheck.met).toBe(false)
    expect(p.ready).toBe(true) // the gap is advice, not a bar to sitting
  })

  it('projects a finish date from the recent logging rate', () => {
    const p = progressFor('2025-W37', '2026-W36') // 12 months, logged every week
    expect(p.loggingRate).toBe(1)
    expect(p.weeksRemaining).toBeGreaterThan(0)
    expect(p.projectedReadyDate).not.toBeNull()
    // A perfect rate means the projection is simply "now + weeks remaining".
    expect(p.projectedReadyDate).toBe(
      weekStartKey(addWeeks(weekIdOf(TODAY), p.weeksRemaining)),
    )
  })

  it('halving the logging rate roughly doubles the projection', () => {
    const everyOther = weekRange('2025-W37', '2026-W36')
      .filter((_, i) => i % 2 === 0)
      .flatMap((w) => goodWeek(w))
    const scores = scoreWeeks('2025-W37', weekIdOf(TODAY), everyOther)
    const p = computeProgress(everyOther, scores, [employment()], { today: TODAY })
    expect(p.loggingRate).toBeGreaterThan(0.4)
    expect(p.loggingRate).toBeLessThan(0.6)
  })

  it('attributes months to the category of the employment covering each week', () => {
    const entries = loggedThrough('2026-W01', '2026-W26')
    const scores = scoreWeeks('2026-W01', weekIdOf(TODAY), entries)
    const p = computeProgress(entries, scores, [
      employment({ id: 'a', category: 'i', startDate: '2026-01-01', endDate: '2026-03-31' }),
      employment({ id: 'b', category: 'iii', startDate: '2026-04-01', endDate: null }),
    ], { today: TODAY })
    expect(p.byCategory.i).toBeGreaterThan(0)
    expect(p.byCategory.iii).toBeGreaterThan(0)
    expect(p.byCategory.ii).toBe(0)
  })

  it('ignores weeks with no employment on record rather than guessing', () => {
    const entries = loggedThrough('2026-W01', '2026-W10')
    const scores = scoreWeeks('2026-W01', weekIdOf(TODAY), entries)
    const p = computeProgress(entries, scores, [], { today: TODAY })
    expect(p.byCategory).toEqual({ i: 0, ii: 0, iii: 0 })
    expect(p.weeksLogged).toBe(10) // still counted as experience overall
  })
})

describe('employmentForWeek', () => {
  const a = employment({ id: 'a', startDate: '2024-01-01', endDate: '2025-06-30' })
  const b = employment({ id: 'b', startDate: '2025-07-01', endDate: null })

  it('picks the employment covering the week', () => {
    expect(employmentForWeek('2024-W10', [a, b])?.id).toBe('a')
    expect(employmentForWeek('2026-W10', [a, b])?.id).toBe('b')
  })

  it('returns null outside every employment', () => {
    expect(employmentForWeek('2020-W10', [a, b])).toBeNull()
  })

  it('prefers the most recently started when two overlap', () => {
    const overlapping = employment({ id: 'c', startDate: '2025-01-01', endDate: null })
    expect(employmentForWeek('2025-W10', [a, overlapping])?.id).toBe('c')
  })
})
