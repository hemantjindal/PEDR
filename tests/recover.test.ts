import { describe, expect, it } from 'vitest'
import { isSameThing, recover, recoveryWindow, triage } from '@/lib/pedr/recover'
import type { DraftEntry } from '@/lib/pedr/types'
import type { StageId } from '@/lib/pedr/constants'

function draft(over: Partial<DraftEntry> & { date: string }): DraftEntry {
  return {
    minutes: 240,
    minutesEstimated: false,
    participation: 'participant',
    projectId: null,
    projectHint: null,
    stage: null,
    officeCategory: null,
    activity: 'Produced the balustrade detail for the tender package',
    detail: null,
    people: [],
    criteria: [],
    wentWrong: null,
    learned: null,
    confidence: 0.8,
    source: 'dump',
    ...over,
  } as DraftEntry
}

// ---------------------------------------------------------------------------

describe('merging what several systems remember', () => {
  it('keeps the timesheet row and drops the calendar copy of the same meeting', () => {
    const report = recover({
      from: '2026-01-05',
      to: '2026-01-11',
      sources: [
        {
          source: 'calendar', label: 'Outlook',
          entries: [draft({ date: '2026-01-06', activity: 'Design team meeting', minutes: 60 })],
        },
        {
          source: 'timesheet', label: 'Practice timesheet',
          entries: [draft({ date: '2026-01-06', activity: 'Design team meeting 1042', minutes: 90 })],
        },
      ],
    })
    expect(report.entries).toHaveLength(1)
    // The timesheet is the billing record, so its hours win.
    expect(report.entries[0].minutes).toBe(90)
    expect(report.bySource.find((s) => s.source === 'calendar')?.duplicates).toBe(1)
  })

  it('keeps two genuinely different things on the same day', () => {
    const report = recover({
      from: '2026-01-05', to: '2026-01-11',
      sources: [{
        source: 'calendar', label: 'Outlook',
        entries: [
          draft({ date: '2026-01-06', activity: 'Design team meeting on the atrium roof' }),
          draft({ date: '2026-01-06', activity: 'Site visit to Nine Elms with the contractor' }),
        ],
      }],
    })
    expect(report.entries).toHaveLength(2)
  })

  it('never re-imports something already on the record', () => {
    const report = recover({
      from: '2026-01-05', to: '2026-01-11',
      existing: [draft({ date: '2026-01-06', activity: 'Design team meeting 1042' })],
      sources: [{
        source: 'calendar', label: 'Outlook',
        entries: [draft({ date: '2026-01-06', activity: 'Design team meeting 1042' })],
      }],
    })
    expect(report.entries).toHaveLength(0)
    // But the week is not blank — it was already done.
    expect(report.blank).toEqual([])
  })

  it('ignores anything outside the window', () => {
    const report = recover({
      from: '2026-01-05', to: '2026-01-11',
      sources: [{
        source: 'calendar', label: 'Outlook',
        entries: [draft({ date: '2025-11-03' }), draft({ date: '2026-01-06' })],
      }],
    })
    expect(report.entries).toHaveLength(1)
  })

  it('reports what each source actually contributed', () => {
    const report = recover({
      from: '2026-01-05', to: '2026-01-18',
      sources: [
        { source: 'timesheet', label: 'Q1 timesheet', entries: [draft({ date: '2026-01-06' })] },
        {
          source: 'teams', label: 'Teams export',
          entries: [
            draft({ date: '2026-01-06' }),
            draft({ date: '2026-01-13', activity: 'Chased the engineer on the frame drawings' }),
          ],
        },
      ],
    })
    const timesheet = report.bySource.find((s) => s.source === 'timesheet')
    const teams = report.bySource.find((s) => s.source === 'teams')
    expect(timesheet?.kept).toBe(1)
    expect(teams?.kept).toBe(1)
    expect(teams?.duplicates).toBe(1)
  })
})

describe('isSameThing', () => {
  it('needs the same day', () => {
    expect(isSameThing(draft({ date: '2026-01-06' }), draft({ date: '2026-01-07' }))).toBe(false)
  })

  it('trusts an external id over anything else', () => {
    const a = draft({ date: '2026-01-06', activity: 'A', externalId: 'evt-1' })
    const b = draft({ date: '2026-01-06', activity: 'Completely different', externalId: 'evt-1' })
    expect(isSameThing(a, b)).toBe(true)
  })

  it('sees one description as a longer version of the other', () => {
    expect(isSameThing(
      draft({ date: '2026-01-06', activity: 'Design team meeting' }),
      draft({ date: '2026-01-06', activity: 'Design team meeting 1042 atrium' }),
    )).toBe(true)
  })

  it('sees the same block rounded differently by two systems', () => {
    expect(isSameThing(
      draft({ date: '2026-01-06', activity: 'Detailing', projectId: 'p1', minutes: 240 }),
      draft({ date: '2026-01-06', activity: 'Package work', projectId: 'p1', minutes: 250 }),
    )).toBe(true)
  })

  it('does not merge two different jobs on the same day', () => {
    expect(isSameThing(
      draft({ date: '2026-01-06', activity: 'Detailing', projectId: 'p1', minutes: 240 }),
      draft({ date: '2026-01-06', activity: 'Package work', projectId: 'p2', minutes: 240 }),
    )).toBe(false)
  })
})

describe('the week-by-week report', () => {
  const report = recover({
    from: '2026-01-05',
    to: '2026-02-01', // four weeks
    sources: [{
      source: 'calendar', label: 'Outlook',
      entries: [
        draft({ date: '2026-01-06', activity: 'Design team meeting on the atrium roof' }),
        draft({ date: '2026-01-07', activity: 'Site visit to Nine Elms with the contractor' }),
        // Week three has a single line and nothing else.
        draft({ date: '2026-01-20', activity: 'Chased the engineer on the frame drawings' }),
      ],
    }],
  })

  it('covers every week in the window, not only the ones with entries', () => {
    expect(report.weeks).toHaveLength(4)
    expect(report.total).toBe(4)
  })

  it('names the blank weeks', () => {
    expect(report.blank).toHaveLength(2)
    expect(report.recovered).toBe(2)
  })

  it('marks a week with one line as thin rather than done', () => {
    expect(report.thin).toHaveLength(1)
  })

  it('converts recovered weeks into months, which is the unit that matters', () => {
    expect(report.monthsRecovered).toBeCloseTo(0.5, 1)
  })
})

describe('the prompts for weeks nothing reached', () => {
  const report = recover({
    from: '2026-01-05', to: '2026-02-01',
    sources: [{
      source: 'timesheet', label: 'Timesheet',
      entries: [
        draft({
          date: '2026-01-06', projectId: 'p1', projectHint: null,
          activity: 'Produced the Stage 4 balustrade details for 1042',
        }),
        draft({
          date: '2026-01-27', projectId: 'p1', projectHint: null,
          activity: 'Issued the revised setting-out drawings for 1042',
        }),
      ],
    }],
  })

  it('gives every blank week something to remember from', () => {
    expect(report.prompts).toHaveLength(2)
    for (const prompt of report.prompts) {
      expect(prompt.context.length).toBeGreaterThan(20)
      expect(prompt.ask).toBeTruthy()
    }
  })

  it('quotes the weeks either side, because recall needs a handle', () => {
    const prompt = report.prompts[0]
    expect(prompt.context).toMatch(/balustrade|setting-out/)
  })

  it('says so honestly when there is nothing either side', () => {
    const empty = recover({ from: '2026-01-05', to: '2026-01-11', sources: [] })
    expect(empty.prompts[0].context).toMatch(/nothing either side/)
  })

  it('labels the week the way a person says it', () => {
    expect(report.prompts[0].label).toMatch(/Jan/)
  })

  it('never asks the same question twice', () => {
    // The nearest week with anything in it is, by definition, the same on both
    // sides of a run of blank weeks. Asking each one separately used to
    // produce the identical paragraph N times, which reads as a broken page.
    const long = recover({
      from: '2026-01-05', to: '2026-03-15',
      sources: [{
        source: 'timesheet', label: 'Timesheet',
        entries: [
          draft({ date: '2026-01-06', projectId: 'p1', activity: 'Stage 4 balustrade details' }),
          draft({ date: '2026-03-10', projectId: 'p1', activity: 'Revised setting-out drawings' }),
        ],
      }],
    })

    expect(long.prompts.length).toBeGreaterThan(4)
    const contexts = long.prompts.map((p) => p.context)
    expect(new Set(contexts).size).toBe(contexts.length)
  })

  it('asks about a run of blank weeks as one thing', () => {
    const long = recover({
      from: '2026-01-05', to: '2026-03-15',
      sources: [{
        source: 'timesheet', label: 'Timesheet',
        entries: [
          draft({ date: '2026-01-06', projectId: 'p1', activity: 'Stage 4 balustrade details' }),
          draft({ date: '2026-03-10', projectId: 'p1', activity: 'Revised setting-out drawings' }),
        ],
      }],
    })

    // The head of the run carries the whole gap and one question that covers
    // it; the rest only have to say whether they differed.
    expect(long.prompts[0].context).toMatch(/weeks in a row/)
    expect(long.prompts[0].ask).toMatch(/leave, a secondment/)
    expect(long.prompts[1].context).toMatch(/^Week 2 of the \d+-week gap/)
    expect(long.prompts[1].ask).toMatch(/different/)
  })
})

describe('recovering nothing', () => {
  const report = recover({ from: '2026-01-05', to: '2026-02-01', sources: [] })

  it('does not pretend', () => {
    expect(report.recovered).toBe(0)
    expect(report.entries).toEqual([])
  })

  it('says what to do instead of scolding', () => {
    expect(report.headline).toMatch(/not a dead end/)
  })
})

// ---------------------------------------------------------------------------

describe('triage — am I in trouble', () => {
  const TODAY = '2026-09-09'

  it('says so when somebody is actually fine', () => {
    const result = triage({
      experienceStart: '2026-03-09', sheetsDone: 1, weeksLogged: 26, today: TODAY,
    })
    expect(result.trouble).toBe('fine')
    expect(result.verdict).toMatch(/small minority/)
  })

  it('calls one late sheet what it is: annoying, not serious', () => {
    const result = triage({
      experienceStart: '2025-09-09', sheetsDone: 2, weeksLogged: 48, today: TODAY,
    })
    expect(result.trouble).toBe('slipping')
    expect(result.verdict).toMatch(/annoying, not serious/)
  })

  it('normalises being a few sheets behind, because that is the normal state', () => {
    // A year in, three sheets due, one done. Two late.
    const result = triage({
      experienceStart: '2025-09-09', sheetsDone: 1, weeksLogged: 40, today: TODAY,
    })
    expect(result.sheetsLate).toBe(2)
    expect(result.trouble).toBe('behind')
    expect(result.verdict).toMatch(/normal state of a PEDR/)
    expect(result.verdict).toMatch(/weekend of work/)
  })

  it('does not soften it when it is bad', () => {
    const result = triage({
      experienceStart: '2024-01-09', sheetsDone: 0, weeksLogged: 6, today: TODAY,
    })
    expect(result.trouble).toBe('serious')
    expect(result.verdict).toMatch(/worth saying plainly/)
    expect(result.verdict).toMatch(/examiner can count/)
    // And still tells them it is fixable, because it is.
    expect(result.verdict).toMatch(/still recoverable/)
  })

  it('leads with recovery, not with remembering', () => {
    const result = triage({
      experienceStart: '2025-01-09', sheetsDone: 1, weeksLogged: 20, today: TODAY,
    })
    expect(result.steps[0]).toMatch(/calendar and your practice timesheet/)
    expect(result.steps[0]).toMatch(/before you try to remember/)
  })

  it('tells somebody to speak to their PSA before they are asked', () => {
    const result = triage({
      experienceStart: '2025-01-09', sheetsDone: 0, weeksLogged: 10, today: TODAY,
    })
    expect(result.steps.join(' ')).toMatch(/Tell your PSA before they notice/)
  })

  it('admits when the time is too far back to pull out of a calendar', () => {
    const result = triage({
      experienceStart: '2022-01-09', sheetsDone: 0, weeksLogged: 2, today: TODAY,
    })
    expect(result.recoverable).toBe(false)
    expect(result.steps[0]).toMatch(/may have been wiped/)
  })

  it('does not count a period whose grace has not run out yet', () => {
    // Four months in: one quarter is over, but its two-month window is not.
    const result = triage({
      experienceStart: '2026-05-09', sheetsDone: 0, weeksLogged: 17, today: TODAY,
    })
    expect(result.sheetsDue).toBe(0)
    expect(result.sheetsLate).toBe(0)
  })
})

describe('recoveryWindow', () => {
  it('goes back to the start when that is inside two years', () => {
    expect(recoveryWindow('2025-05-09', '2026-09-09').from).toBe('2025-05-09')
  })

  it('caps at two years, because nothing older is still in a calendar', () => {
    expect(recoveryWindow('2020-01-01', '2026-09-09').from).toBe('2024-09-09')
  })
})
