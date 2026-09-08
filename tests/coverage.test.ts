import { describe, expect, it } from 'vitest'
import { computeCoverage, coverageHeadline } from '@/lib/pedr/coverage'
import type { CriterionId, StageId } from '@/lib/pedr/constants'
import { entry } from './helpers'

const all = <T,>(xs: T[]) => xs

describe('computeCoverage', () => {
  it('reports every stage and every criterion, including the empty ones', () => {
    const coverage = computeCoverage([entry({ date: '2026-03-02' })])
    expect(coverage.stages).toHaveLength(8) // stages 0–7
    expect(coverage.criteria).toHaveLength(5) // PC1–PC5
    expect(coverage.stages.filter((s) => s.minutes === 0)).toHaveLength(7)
  })

  it('splits minutes, entries and distinct weeks per stage', () => {
    const coverage = computeCoverage([
      entry({ date: '2026-03-02', stage: 4 as StageId, minutes: 120 }),
      entry({ date: '2026-03-03', stage: 4 as StageId, minutes: 60 }), // same week
      entry({ date: '2026-03-10', stage: 4 as StageId, minutes: 60 }), // next week
      entry({ date: '2026-03-11', stage: 5 as StageId, minutes: 240 }),
    ])
    const s4 = coverage.stages.find((s) => s.id === '4')!
    expect(s4.minutes).toBe(240)
    expect(s4.entries).toBe(3)
    expect(s4.weeks).toBe(2)
    expect(s4.share).toBeCloseTo(240 / 480)
    expect(s4.lastSeen).toBe('2026-03-10')
  })

  it('counts an entry against every criterion it was tagged with', () => {
    const coverage = computeCoverage([
      entry({ date: '2026-03-02', minutes: 100, criteria: ['PC1', 'PC3'] as CriterionId[] }),
    ])
    expect(coverage.criteria.find((c) => c.id === 'PC1')!.minutes).toBe(100)
    expect(coverage.criteria.find((c) => c.id === 'PC3')!.minutes).toBe(100)
    expect(coverage.criteria.find((c) => c.id === 'PC2')!.minutes).toBe(0)
    // Total stays honest even though the entry was double-counted per criterion.
    expect(coverage.totalMinutes).toBe(100)
  })

  it('separates recent minutes from lifetime minutes', () => {
    const coverage = computeCoverage(
      [
        entry({ date: '2023-01-10', stage: 4 as StageId, minutes: 600 }),
        entry({ date: '2026-03-10', stage: 4 as StageId, minutes: 120 }),
      ],
      { recentFrom: '2024-09-01' },
    )
    const s4 = coverage.stages.find((s) => s.id === '4')!
    expect(s4.minutes).toBe(720)
    expect(s4.recentMinutes).toBe(120)
  })

  it('flags the thin dimensions', () => {
    // Four weeks of Stage 4 and a single hour of Stage 5.
    const entries = all([
      entry({ date: '2026-03-02', stage: 4 as StageId, minutes: 600 }),
      entry({ date: '2026-03-09', stage: 4 as StageId, minutes: 600 }),
      entry({ date: '2026-03-16', stage: 4 as StageId, minutes: 600 }),
      entry({ date: '2026-03-23', stage: 4 as StageId, minutes: 600 }),
      entry({ date: '2026-03-24', stage: 5 as StageId, minutes: 60 }),
    ])
    const coverage = computeCoverage(entries, { minWeeks: 3, minShare: 0.02 })
    const thin = coverage.thinStages.map((s) => s.id)
    expect(thin).toContain('5') // one week, ~2.4% share -> under minWeeks
    expect(thin).not.toContain('4')
  })

  it('does not divide by zero when nothing is recorded', () => {
    const coverage = computeCoverage([])
    expect(coverage.totalMinutes).toBe(0)
    expect(coverage.stages.every((s) => s.share === 0)).toBe(true)
    expect(coverage.stages.every((s) => s.lastSeen === null)).toBe(true)
  })
})

describe('coverageHeadline', () => {
  it('says nothing when there is nothing to say', () => {
    expect(coverageHeadline(computeCoverage([]))).toBeNull()
  })

  it('leads with missing criteria over missing stages', () => {
    const headline = coverageHeadline(computeCoverage([entry({ date: '2026-03-02' })]))
    expect(headline).toMatch(/PC1, PC2, PC3, PC4/)
  })

  it('falls back to missing stages once all five criteria are touched', () => {
    const entries = (['PC1', 'PC2', 'PC3', 'PC4', 'PC5'] as CriterionId[]).map((c, i) =>
      entry({ date: `2026-03-0${i + 2}`, criteria: [c], stage: (i % 4) as StageId }),
    )
    const headline = coverageHeadline(computeCoverage(entries))
    expect(headline).toMatch(/No experience logged at RIBA Stage/)
    expect(headline).toMatch(/5/)
  })
})
