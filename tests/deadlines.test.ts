import { describe, expect, it } from 'vitest'
import {
  describeWindow, planSheetPeriods, signOffState, summariseDeadlines,
} from '@/lib/pedr/deadlines'
import type { Sheet } from '@/lib/pedr/types'

const TODAY = '2026-09-08'

function sheet(over: Partial<Sheet> = {}): Sheet {
  return {
    id: 's1', userId: 'u1', employmentId: null,
    periodStart: '2026-01-01', periodEnd: '2026-03-31',
    status: 'draft',
    content: {
      general: { employer: '', location: 'UK', category: 'i', supervisorName: '', role: '', daysWorked: 0, hoursWorked: 0 },
      projects: [], stageMinutes: {}, stageParticipation: {},
      participation: { participant: 0, observer: 0 }, criteria: {},
      reflection: { did: '', learned: '', wentWell: '', wentWrong: '', next: '' },
    },
    mentorComment: null, mentorSignedAt: null, psaComment: null, psaSignedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('planSheetPeriods', () => {
  it('cuts quarters from the day experience started, not calendar quarters', () => {
    const periods = planSheetPeriods('2025-02-17', { today: TODAY })
    expect(periods[0].periodStart).toBe('2025-02-17')
    expect(periods[0].periodEnd).toBe('2025-05-16')
    expect(periods[1].periodStart).toBe('2025-05-17')
  })

  it('sets the deadline two months after the period ends', () => {
    const periods = planSheetPeriods('2025-01-01', { today: TODAY })
    expect(periods[0].periodEnd).toBe('2025-03-31')
    expect(periods[0].dueDate).toBe('2025-05-31')
  })

  it('produces the eight sheets a Part 3 submission needs', () => {
    const periods = planSheetPeriods('2026-08-01', { today: TODAY, count: 8 })
    expect(periods).toHaveLength(8)
    expect(periods[7].periodEnd).toBe('2028-07-31')
  })

  it('marks an overdue unfinished period late, with the days counted', () => {
    const periods = planSheetPeriods('2025-01-01', { today: TODAY })
    const first = periods[0]
    expect(first.late).toBe(true)
    expect(first.daysLate).toBeGreaterThan(90)
    expect(describeWindow(first)).toMatch(/days late/)
  })

  it('is not late once the PSA has signed it', () => {
    const periods = planSheetPeriods('2025-01-01', {
      today: TODAY,
      sheets: [sheet({ periodStart: '2025-01-01', periodEnd: '2025-03-31', status: 'psa_signed' })],
    })
    expect(periods[0].late).toBe(false)
    expect(periods[0].status).toBe('psa_signed')
  })

  it('does not call a period late while it is still running', () => {
    const periods = planSheetPeriods('2026-08-01', { today: TODAY })
    expect(periods[0].inProgress).toBe(true)
    expect(periods[0].late).toBe(false)
    expect(describeWindow(periods[0])).toMatch(/Period runs to/)
  })

  it('matches a sheet to its period even when the dates are not identical', () => {
    const periods = planSheetPeriods('2025-01-01', {
      today: TODAY,
      sheets: [sheet({ periodStart: '2025-01-05', periodEnd: '2025-03-28', status: 'submitted' })],
    })
    expect(periods[0].status).toBe('submitted')
    expect(periods[0].sheetId).toBe('s1')
  })
})

describe('summariseDeadlines', () => {
  it('leads with late sheets and names the worst one', () => {
    const summary = summariseDeadlines(planSheetPeriods('2025-01-01', { today: TODAY }))
    expect(summary.lateCount).toBeGreaterThan(0)
    expect(summary.headline).toMatch(/past the two-month deadline/)
    expect(summary.headline).toMatch(/days late/)
  })

  it('warns when a deadline is close but not missed', () => {
    // Period 1 runs 25 Apr – 24 Jul 2026, so it falls due on 24 Sep: 16 days out.
    const periods = planSheetPeriods('2026-04-25', { today: TODAY })
    const summary = summariseDeadlines(periods)
    expect(summary.lateCount).toBe(0)
    expect(summary.headline).toMatch(/due in \d+ days/)
  })

  it('says nothing when there is nothing to say', () => {
    const summary = summariseDeadlines(planSheetPeriods('2026-08-01', { today: TODAY }))
    expect(summary.headline).toBeNull()
  })

  it('counts sheets signed off against the eight required', () => {
    const summary = summariseDeadlines(
      planSheetPeriods('2025-01-01', {
        today: TODAY,
        sheets: [sheet({ periodStart: '2025-01-01', periodEnd: '2025-03-31', status: 'psa_signed' })],
      }),
    )
    expect(summary.completeCount).toBe(1)
    expect(summary.requiredSheets).toBe(8)
  })
})

describe('signOffState', () => {
  it('starts with you, before anything exists', () => {
    const state = signOffState(null, TODAY)
    expect(state).toMatchObject({ stage: 'not_started', waitingOn: 'you', progress: 0 })
  })

  it('tracks the chain through mentor and PSA', () => {
    expect(signOffState(sheet({ status: 'draft' }), TODAY).waitingOn).toBe('you')
    expect(signOffState(sheet({ status: 'submitted' }), TODAY).waitingOn).toBe('mentor')
    expect(signOffState(sheet({ status: 'mentor_signed' }), TODAY).waitingOn).toBe('psa')
    expect(signOffState(sheet({ status: 'psa_signed' }), TODAY).waitingOn).toBeNull()
  })

  it('tells you to nudge a mentor sitting on it too long', () => {
    const fresh = signOffState(sheet({ status: 'submitted', updatedAt: '2026-09-05T00:00:00Z' }), TODAY)
    const stale = signOffState(sheet({ status: 'submitted', updatedAt: '2026-07-01T00:00:00Z' }), TODAY)
    expect(fresh.chase).toBeNull()
    expect(stale.chase).toMatch(/mentor has had this \d+ days/)
  })

  it('tells you to chase a PSA past their published target', () => {
    const stale = signOffState(
      sheet({ status: 'mentor_signed', mentorSignedAt: '2026-06-01T00:00:00Z' }),
      TODAY,
    )
    expect(stale.chase).toMatch(/past their 30-day target/)
    expect(stale.ageDays).toBeGreaterThan(90)
  })

  it('never reports a negative age from a future timestamp', () => {
    const state = signOffState(sheet({ status: 'submitted', updatedAt: '2027-01-01T00:00:00Z' }), TODAY)
    expect(state.ageDays).toBe(0)
  })
})
