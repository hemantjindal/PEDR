import { PROFESSIONAL_CRITERIA, RIBA_STAGES, officeCategory } from './constants'
import type { Coverage, CoverageCell, Entry } from './types'
import { monthKeyOf, weekIdOf, type DateKey, type MonthKey } from './week'

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

// ---------------------------------------------------------------------------
// Watching, and then doing.
// ---------------------------------------------------------------------------

/**
 * The one thing a Reflective Experience Summary has to show and nobody can
 * produce on demand: development over time.
 *
 * Observer hours are not a weakness — being shown a valuation you have never
 * seen is exactly how this is supposed to work. What matters is the direction.
 * A record that is 60% observer in the first quarter and 10% in the last is an
 * argument. One that is 40% observer throughout is a conversation with a team
 * leader, and it is a far easier conversation at month nine than at month
 * twenty-two.
 */
export interface ParticipationPoint {
  monthKey: MonthKey
  participant: number
  observer: number
  /** Observer as a share of the month, 0–1. Null when nothing was logged. */
  observerShare: number | null
}

export interface ParticipationTrend {
  months: ParticipationPoint[]
  participant: number
  observer: number
  /** Across everything logged. Null when nothing has been. */
  observerShare: number | null
  /** The first half against the second: negative means moving towards doing. */
  shift: number | null
  /** A sentence, or nothing when there is not enough to say anything true. */
  note: string | null
}

export function participationTrend(entries: Entry[]): ParticipationTrend {
  const byMonth = new Map<MonthKey, { participant: number; observer: number }>()
  let participant = 0
  let observer = 0

  for (const entry of entries) {
    if (entry.minutes <= 0) continue
    // Absence is not experience, and counting holiday as participant hours
    // would flatter every record by the same amount.
    if (entry.officeCategory && officeCategory(entry.officeCategory)?.countsAsExperience === false) {
      continue
    }
    const key = monthKeyOf(entry.date)
    const bucket = byMonth.get(key) ?? { participant: 0, observer: 0 }
    bucket[entry.participation] += entry.minutes
    byMonth.set(key, bucket)
    if (entry.participation === 'observer') observer += entry.minutes
    else participant += entry.minutes
  }

  const months: ParticipationPoint[] = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monthKey, split]) => {
      const total = split.participant + split.observer
      return {
        monthKey,
        participant: split.participant,
        observer: split.observer,
        observerShare: total > 0 ? split.observer / total : null,
      }
    })

  const total = participant + observer
  const observerShare = total > 0 ? observer / total : null

  // Two halves rather than a regression: with eight quarters of data a slope
  // is false precision, and "more than it was" is the whole question.
  let shift: number | null = null
  if (months.length >= 4) {
    const half = Math.floor(months.length / 2)
    const first = shareOf(months.slice(0, half))
    const second = shareOf(months.slice(months.length - half))
    if (first !== null && second !== null) shift = second - first
  }

  return { months, participant, observer, observerShare, shift, note: noteFor(observerShare, shift, months.length) }
}

function shareOf(points: ParticipationPoint[]): number | null {
  const participant = points.reduce((sum, p) => sum + p.participant, 0)
  const observer = points.reduce((sum, p) => sum + p.observer, 0)
  const total = participant + observer
  return total > 0 ? observer / total : null
}

function noteFor(share: number | null, shift: number | null, months: number): string | null {
  if (share === null) return null
  if (share === 0) {
    return months >= 3
      ? 'Every hour logged is participant. Either nothing has been marked as observer, or you ' +
        'are recording only what you did yourself — a PSA will read a record with no observed ' +
        'experience at all as slightly odd.'
      : null
  }
  const percent = Math.round(share * 100)
  if (shift === null) {
    return `${percent}% of your hours so far are observer hours.`
  }
  if (shift <= -0.08) {
    return `${percent}% observer overall, and falling — ${Math.abs(Math.round(shift * 100))} ` +
      'points lower in the second half than the first. That is development over time, and it is ' +
      'the thing to say in the summary.'
  }
  if (shift >= 0.08) {
    return `${percent}% observer overall, and rising. That is fine if you have moved onto ` +
      'something new, and worth a sentence saying so. If it is not deliberate, it is worth a ' +
      'conversation now rather than at month twenty-two.'
  }
  return `${percent}% observer overall, flat across the period. Examiners look for the shift ` +
    'from watching to doing, so it is worth asking to run something yourself.'
}
