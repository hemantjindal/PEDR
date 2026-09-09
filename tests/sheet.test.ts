import { describe, expect, it } from 'vitest'
import { buildSheet, entriesToCsv, officeSummary } from '@/lib/pedr/sheet'
import type { Project } from '@/lib/pedr/types'
import { employment, entry as baseEntry, note } from './helpers'
import type { Entry } from '@/lib/pedr/types'
import type { DateKey } from '@/lib/pedr/week'

/** The helper defaults to a project id this file's register does not carry. */
const entry = (over: Partial<Entry> & { date: DateKey }): Entry =>
  baseEntry({ projectId: 'p-bat', ...over })

const projects: Project[] = [
  {
    id: 'p-bat', userId: 'u1', code: '1042', name: 'Battersea Square Phase 2',
    client: 'BSQ Developments', sector: 'Residential', valueGbp: 48_000_000,
    procurement: 'Two stage D&B', contractForm: 'JCT D&B 2016', isCaseStudy: true,
    notes: null, aliases: [], archived: false, createdAt: '2025-01-01T00:00:00Z',
  },
]

const base = {
  periodStart: '2026-01-01' as const,
  periodEnd: '2026-03-31' as const,
  projects,
  employment: employment(),
}

describe('buildSheet', () => {
  const sheet = buildSheet({
    ...base,
    entries: [
      entry({ date: '2026-01-05', minutes: 240, stage: 4, activity: 'Produced the stair balustrade details for tender' }),
      entry({ date: '2026-01-06', minutes: 180, stage: 5, activity: 'Answered contractor technical query on the curtain wall', criteria: ['PC5'] }),
      entry({ date: '2026-02-10', minutes: 450, stage: 3, activity: 'Compiled the planning submission drawings', criteria: ['PC3'] }),
      // Outside the period: must be excluded.
      entry({ date: '2026-05-01', minutes: 480, activity: 'Something in the next quarter' }),
    ],
    notes: [note('2026-W02', { wentWrong: 'Issued against a superseded structural grid and had to reissue.' })],
  })

  it('only counts entries inside the period', () => {
    expect(sheet.general.hoursWorked).toBe(14.5) // 240 + 180 + 450 minutes
    expect(sheet.general.daysWorked).toBe(3)
  })

  it('carries the employment details into General Information', () => {
    expect(sheet.general.employer).toBe('Foster + Partners')
    expect(sheet.general.category).toBe('i')
    expect(sheet.general.location).toBe('UK')
  })

  it('groups time by project and lists the stages touched', () => {
    expect(sheet.projects).toHaveLength(1)
    expect(sheet.projects[0]).toMatchObject({ code: '1042', minutes: 870 })
    expect(sheet.projects[0].stages).toEqual([3, 4, 5])
  })

  it('totals hours against every work stage', () => {
    expect(sheet.stageMinutes['4']).toBe(240)
    expect(sheet.stageMinutes['5']).toBe(180)
    expect(sheet.stageMinutes['3']).toBe(450)
    expect(sheet.stageMinutes['0']).toBe(0)
  })

  it('gives concrete examples per criterion', () => {
    expect(sheet.criteria.PC3.entries).toBe(1)
    expect(sheet.criteria.PC3.examples[0]).toMatch(/planning submission/)
    expect(sheet.criteria.PC1.entries).toBe(0)
    expect(sheet.criteria.PC1.examples).toEqual([])
  })

  it('drafts the reflection from what was captured at the time', () => {
    expect(sheet.reflection.wentWrong).toMatch(/superseded structural grid/)
    expect(sheet.reflection.did).toMatch(/stair balustrade/)
  })

  it('does not repeat the same line twice', () => {
    const repeated = buildSheet({
      ...base,
      entries: [
        entry({ date: '2026-01-05', activity: 'Produced the stair balustrade details' }),
        entry({ date: '2026-01-06', activity: 'Produced the stair balustrade details' }),
      ],
      notes: [],
    })
    expect(repeated.reflection.did.split('\n')).toHaveLength(1)
  })

  it('leaves vague activities out of the project summary', () => {
    const vague = buildSheet({
      ...base,
      entries: [entry({ date: '2026-01-05', activity: 'worked on drawings' })],
      notes: [],
    })
    expect(vague.projects[0].summary).toBe('')
  })
})

describe('holiday', () => {
  const sheet = buildSheet({
    ...base,
    entries: [
      entry({ date: '2026-01-05', minutes: 450, projectId: 'p-bat' }),
      entry({ date: '2026-01-06', minutes: 450, projectId: null, officeCategory: 'leave', activity: 'Annual leave' }),
      entry({ date: '2026-01-07', minutes: 120, projectId: null, officeCategory: 'cpd', activity: 'CPD talk on the Building Safety Act' }),
    ],
    notes: [],
  })

  it('is recorded but does not count as experience', () => {
    // 450 (project) + 120 (CPD) = 9.5h. The leave day is excluded.
    expect(sheet.general.hoursWorked).toBe(9.5)
  })

  it('still appears in the office management summary', () => {
    const summary = officeSummary([
      entry({ date: '2026-01-06', minutes: 450, officeCategory: 'leave', activity: 'Annual leave' }),
      entry({ date: '2026-01-07', minutes: 120, officeCategory: 'cpd', activity: 'CPD' }),
    ])
    expect(summary.map((r) => r.id).sort()).toEqual(['cpd', 'leave'])
    expect(summary.find((r) => r.id === 'leave')!.counts).toBe(false)
    expect(summary.find((r) => r.id === 'cpd')!.counts).toBe(true)
  })
})

describe('entriesToCsv', () => {
  it('writes a header and a row per entry', () => {
    const csv = entriesToCsv([entry({ date: '2026-01-05', minutes: 240 })], projects)
    const lines = csv.split('\r\n')
    expect(lines[0]).toMatch(/^Date,Project code,Project,RIBA stage/)
    expect(lines[1]).toMatch(/^2026-01-05,1042,Battersea Square Phase 2,4/)
    expect(lines[1]).toContain('4.00')
  })

  it('escapes quotes and commas so the file does not break', () => {
    const csv = entriesToCsv([
      entry({ date: '2026-01-05', activity: 'Said "no", then reissued', people: ['A, B'] }),
    ], projects)
    expect(csv).toContain('"Said ""no"", then reissued"')
    expect(csv).toContain('"A, B"')
  })

  it('marks estimated hours as estimated', () => {
    const csv = entriesToCsv([entry({ date: '2026-01-05', minutesEstimated: true })], projects)
    expect(csv.split('\r\n')[1]).toContain(',yes,')
  })
})
