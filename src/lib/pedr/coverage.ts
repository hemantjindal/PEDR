import { PROFESSIONAL_CRITERIA, RIBA_STAGES } from './constants'
import type { Coverage, CoverageCell, Entry } from './types'
import { weekIdOf, type DateKey } from './week'

/**
 * Coverage is the strategic view: not "have you logged" but "have you actually
 * been near the parts of practice the exam asks about".
 *
 * In a big practice with specialised teams this is the number that hurts.
 * Someone three years into a competition-and-concept team can have a perfect
 * logging record and nothing at all against Stage 5, Stage 6 or PC5 — and the
 * time to find that out is now, while you can still ask to be put on a job
 * that is on site, not at the oral.
 */

export interface CoverageOptions {
  /** Only minutes on or after this date count as "recent". */
  recentFrom?: DateKey
  /** A dimension is thin below this many distinct weeks. */
  minWeeks?: number
  /** …or below this share of all recorded minutes. */
  minShare?: number
}

export function computeCoverage(entries: Entry[], opts: CoverageOptions = {}): Coverage {
  const { recentFrom, minWeeks = 3, minShare = 0.02 } = opts
  const totalMinutes = entries.reduce((sum, e) => sum + (e.minutes || 0), 0)

  const stages = RIBA_STAGES.map((s) =>
    cell({
      id: String(s.id),
      label: `${s.code} · ${s.name}`,
      matches: entries.filter((e) => e.stage === s.id),
      totalMinutes,
      recentFrom,
    }),
  )

  const criteria = PROFESSIONAL_CRITERIA.map((c) =>
    cell({
      id: c.id,
      label: `${c.id} · ${c.name}`,
      matches: entries.filter((e) => e.criteria.includes(c.id)),
      totalMinutes,
      recentFrom,
    }),
  )

  const isThin = (c: CoverageCell) => c.weeks < minWeeks || c.share < minShare

  return {
    stages,
    criteria,
    totalMinutes,
    thinStages: stages.filter(isThin),
    thinCriteria: criteria.filter(isThin),
  }
}

function cell(args: {
  id: string
  label: string
  matches: Entry[]
  totalMinutes: number
  recentFrom?: DateKey
}): CoverageCell {
  const { id, label, matches, totalMinutes, recentFrom } = args
  const minutes = matches.reduce((sum, e) => sum + (e.minutes || 0), 0)
  const weeks = new Set(matches.map((e) => weekIdOf(e.date))).size
  const lastSeen = matches.reduce<DateKey | null>(
    (latest, e) => (latest === null || e.date > latest ? e.date : latest),
    null,
  )
  const recentMinutes = recentFrom
    ? matches.filter((e) => e.date >= recentFrom).reduce((sum, e) => sum + (e.minutes || 0), 0)
    : minutes

  return {
    id,
    label,
    minutes,
    entries: matches.length,
    weeks,
    share: totalMinutes > 0 ? minutes / totalMinutes : 0,
    lastSeen,
    recentMinutes,
  }
}

/**
 * One sentence about the biggest hole, for the top of the dashboard.
 * Returns null when there is nothing worth saying.
 */
export function coverageHeadline(coverage: Coverage): string | null {
  if (coverage.totalMinutes === 0) return null

  const emptyStages = coverage.stages.filter((s) => s.minutes === 0)
  const emptyCriteria = coverage.criteria.filter((c) => c.minutes === 0)

  if (emptyCriteria.length > 0) {
    const names = emptyCriteria.map((c) => c.id).join(', ')
    return `Nothing recorded against ${names}. Every Part 3 candidate is assessed on all five.`
  }
  if (emptyStages.length > 0) {
    const names = emptyStages.map((s) => s.label.split(' · ')[0]).join(', ')
    return `No experience logged at RIBA Stage ${names}. Worth asking for a job that is at that stage.`
  }
  const thinnest = [...coverage.criteria].sort((a, b) => a.share - b.share)[0]
  if (thinnest && thinnest.share < 0.05) {
    return `${thinnest.label} is your thinnest area at ${Math.round(thinnest.share * 100)}% of recorded time.`
  }
  return null
}
