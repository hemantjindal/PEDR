import { SHEET_RULES } from './constants'
import type { Sheet, SheetStatus } from './types'
import { addDays, addMonths, daysBetween, formatDate, todayKey, type DateKey } from './week'

/**
 * The deadline engine.
 *
 * This is the part of PEDR that costs people marks and that nothing in the
 * official system makes visible. A sheet covers up to three months and must be
 * completed within two months of the end of that period. Miss it and the sheet
 * is late — the PSA cannot give useful feedback, and a run of late sheets is a
 * number an examiner can count against your time management.
 *
 * Then there are two more clocks nobody owns: the mentor's turnaround and the
 * PSA's. Accounts of three-month waits are common. Nothing chases them for you,
 * so we make the age of each stage visible instead.
 */

export type SheetLifecycle = SheetStatus | 'not_started'

export interface SheetPeriod {
  /** 1-based. Sheet 8 is normally the last one you need. */
  index: number
  periodStart: DateKey
  periodEnd: DateKey
  /** Period end plus two months. The date that decides late or not. */
  dueDate: DateKey
  status: SheetLifecycle
  sheetId: string | null
  /** Negative once the due date has passed. */
  daysUntilDue: number
  /** True when the period is over, the deadline has passed and it is unfinished. */
  late: boolean
  daysLate: number
  /** True when the period has not finished yet. */
  inProgress: boolean
  /** True when the period is over but the deadline has not passed. */
  writable: boolean
  label: string
}

/**
 * Cut a continuous run of experience into quarterly sheet periods, starting
 * from the day the experience started rather than from calendar quarters —
 * which is how PEDR periods actually run.
 */
export function planSheetPeriods(
  experienceStart: DateKey,
  opts: { today?: DateKey; sheets?: Sheet[]; count?: number } = {},
): SheetPeriod[] {
  const today = opts.today ?? todayKey()
  const sheets = opts.sheets ?? []
  const periods: SheetPeriod[] = []

  let cursor = experienceStart
  let index = 1
  const maxPeriods = opts.count ?? 40 // a hard stop; nobody logs ten years

  while (index <= maxPeriods) {
    const periodStart = cursor
    const periodEnd = addDays(addMonths(periodStart, SHEET_RULES.maxPeriodMonths), -1)
    const dueDate = addMonths(periodEnd, SHEET_RULES.submitWithinMonths)

    const match = sheets.find(
      (s) => s.periodStart <= periodEnd && s.periodEnd >= periodStart,
    )
    const status: SheetLifecycle = match ? match.status : 'not_started'
    const finished = status === 'psa_signed'
    const daysUntilDue = daysBetween(today, dueDate)
    const periodOver = today > periodEnd
    const late = periodOver && daysUntilDue < 0 && !finished

    periods.push({
      index,
      periodStart,
      periodEnd,
      dueDate,
      status,
      sheetId: match?.id ?? null,
      daysUntilDue,
      late,
      daysLate: late ? -daysUntilDue : 0,
      inProgress: !periodOver,
      writable: periodOver && daysUntilDue >= 0,
      label: `Sheet ${index} · ${formatDate(periodStart, { year: false })} – ${formatDate(periodEnd)}`,
    })

    // Stop once we have covered today and produced the required number.
    if (!periodOver && index >= SHEET_RULES.requiredSheets) break
    if (!periodOver && opts.count === undefined) break

    cursor = addDays(periodEnd, 1)
    index++
  }

  return periods
}

export interface DeadlineSummary {
  periods: SheetPeriod[]
  /** Sheets whose deadline has passed without being finished. */
  lateCount: number
  /** The next deadline you can still hit. */
  nextDue: SheetPeriod | null
  /** Periods finished and signed off by the PSA. */
  completeCount: number
  requiredSheets: number
  /** One sentence for the top of the dashboard, or null when all is well. */
  headline: string | null
}

export function summariseDeadlines(periods: SheetPeriod[]): DeadlineSummary {
  const lateList = periods.filter((p) => p.late)
  const complete = periods.filter((p) => p.status === 'psa_signed')
  const nextDue =
    periods
      .filter((p) => p.status !== 'psa_signed' && p.daysUntilDue >= 0)
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue)[0] ?? null

  let headline: string | null = null
  if (lateList.length > 0) {
    const worst = lateList.sort((a, b) => b.daysLate - a.daysLate)[0]
    headline =
      `${lateList.length} sheet${lateList.length === 1 ? '' : 's'} past the two-month deadline. ` +
      `Sheet ${worst.index} is ${worst.daysLate} days late.`
  } else if (nextDue && nextDue.daysUntilDue <= 21 && !nextDue.inProgress) {
    headline = `Sheet ${nextDue.index} is due in ${nextDue.daysUntilDue} days.`
  }

  return {
    periods,
    lateCount: lateList.length,
    nextDue,
    completeCount: complete.length,
    requiredSheets: SHEET_RULES.requiredSheets,
    headline,
  }
}

// ---------------------------------------------------------------------------
// The sign-off chain
// ---------------------------------------------------------------------------

export interface SignOffState {
  stage: SheetLifecycle
  label: string
  /** Who the sheet is sitting with right now. */
  waitingOn: 'you' | 'mentor' | 'psa' | null
  /** How long it has been sitting there. */
  ageDays: number
  /** Set when it has been sitting too long and is worth a nudge. */
  chase: string | null
  /** 0–1, for a progress bar. */
  progress: number
}

const STAGE_LABELS: Record<SheetLifecycle, string> = {
  not_started: 'Not started',
  draft: 'Draft with you',
  submitted: 'With your mentor',
  mentor_signed: 'With your PSA',
  psa_signed: 'Signed off',
}

export function signOffState(
  sheet: Pick<Sheet, 'status' | 'updatedAt' | 'mentorSignedAt' | 'psaSignedAt'> | null,
  today: DateKey = todayKey(),
): SignOffState {
  if (!sheet) {
    return {
      stage: 'not_started',
      label: STAGE_LABELS.not_started,
      waitingOn: 'you',
      ageDays: 0,
      chase: null,
      progress: 0,
    }
  }

  const since = (iso: string | null): number => {
    if (!iso) return 0
    const key = iso.slice(0, 10)
    const days = daysBetween(key, today)
    return days > 0 ? days : 0
  }

  switch (sheet.status) {
    case 'draft':
      return {
        stage: 'draft', label: STAGE_LABELS.draft, waitingOn: 'you',
        ageDays: since(sheet.updatedAt), chase: null, progress: 0.25,
      }
    case 'submitted': {
      const age = since(sheet.updatedAt)
      return {
        stage: 'submitted', label: STAGE_LABELS.submitted, waitingOn: 'mentor', ageDays: age,
        chase:
          age > SHEET_RULES.mentorTargetDays
            ? `Your mentor has had this ${age} days. Worth a nudge.`
            : null,
        progress: 0.5,
      }
    }
    case 'mentor_signed': {
      const age = since(sheet.mentorSignedAt ?? sheet.updatedAt)
      return {
        stage: 'mentor_signed', label: STAGE_LABELS.mentor_signed, waitingOn: 'psa', ageDays: age,
        chase:
          age > SHEET_RULES.psaTargetDays
            ? `Your PSA has had this ${age} days, past their ${SHEET_RULES.psaTargetDays}-day target. Chase it.`
            : null,
        progress: 0.75,
      }
    }
    case 'psa_signed':
      return {
        stage: 'psa_signed', label: STAGE_LABELS.psa_signed, waitingOn: null,
        ageDays: since(sheet.psaSignedAt), chase: null, progress: 1,
      }
  }
}

/**
 * The window a sheet period can still be written in, expressed as something a
 * human can act on rather than two dates.
 */
export function describeWindow(period: SheetPeriod): string {
  if (period.inProgress) return `Period runs to ${formatDate(period.periodEnd)}`
  if (period.late) return `${period.daysLate} days late — write it anyway`
  if (period.daysUntilDue === 0) return 'Due today'
  return `Due ${formatDate(period.dueDate)} · ${period.daysUntilDue} days left`
}
