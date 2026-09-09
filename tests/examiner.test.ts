import { describe, expect, it } from 'vitest'
import { examine } from '@/lib/pedr/examiner'
import type { Project } from '@/lib/pedr/types'
import type { CriterionId, StageId } from '@/lib/pedr/constants'
import { entry } from './helpers'

const projects: Project[] = [
  {
    id: 'p1', userId: 'u1', code: '1042', name: 'Battersea Square Phase 2',
    client: 'BSQ Developments', sector: 'Residential', valueGbp: 48_000_000,
    procurement: 'Two stage design and build', contractForm: 'JCT D&B 2016',
    isCaseStudy: true, notes: null, aliases: [], archived: false,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'p2', userId: 'u1', code: '1088', name: 'Nine Elms Fit-Out',
    client: null, sector: null, valueGbp: null, procurement: null, contractForm: null,
    isCaseStudy: false, notes: null, aliases: [], archived: false,
    createdAt: '2025-01-01T00:00:00Z',
  },
]

const find = (report: ReturnType<typeof examine>, id: string) =>
  report.questions.find((q) => q.id === id)

// ---------------------------------------------------------------------------

describe('an empty record', () => {
  const report = examine({ entries: [], projects })

  it('still invites every criterion, because all five are examinable', () => {
    expect(report.questions.filter((q) => q.criterion).length).toBeGreaterThanOrEqual(5)
  })

  it('says so plainly rather than scoring zero out of zero', () => {
    expect(report.readiness).toBeLessThan(0.6)
    expect(report.headline).toBeTruthy()
  })
})

describe('friction', () => {
  it('turns something that went wrong into the question it invites', () => {
    const report = examine({
      entries: [entry({
        date: '2026-07-06',
        activity: 'Issued the curtain wall head detail for the tender package',
        wentWrong: 'Issued against a superseded structural grid because I did not check the incoming revision.',
        learned: 'Check the revision block before the transmittal, not after.',
      })],
      projects,
    })
    const q = report.questions.find((x) => x.source === 'friction')
    expect(q).toBeTruthy()
    expect(q?.evidence.quote).toMatch(/superseded structural grid/)
    // You lived it, so you can answer it.
    expect(q?.verdict).toBe('answerable')
  })

  it('marks it thin when you logged the mistake but not what you took from it', () => {
    const report = examine({
      entries: [entry({
        date: '2026-07-06',
        wentWrong: 'Sent the client a drawing set without the revision cloud and it made the meeting much harder.',
        learned: null,
      })],
      projects,
    })
    const q = report.questions.find((x) => x.source === 'friction')
    expect(q?.verdict).toBe('thin')
    expect(q?.fix).toMatch(/what you took from it/i)
  })

  it('does not treat a two-word note as reflection', () => {
    const report = examine({
      entries: [entry({ date: '2026-07-06', wentWrong: 'was late' })],
      projects,
    })
    expect(report.questions.some((x) => x.source === 'friction')).toBe(false)
  })
})

describe('a criterion claimed but not evidenced', () => {
  const report = examine({
    entries: [
      // Tagged PC4, but the activity says nothing and it was watched.
      entry({
        date: '2026-07-06', activity: 'worked on drawings', projectId: 'p1',
        criteria: ['PC4'] as CriterionId[], participation: 'observer',
      }),
    ],
    projects,
  })

  it('is exposed — worse than an empty one', () => {
    expect(find(report, 'criterion-PC4')?.verdict).toBe('exposed')
  })

  it('says why, in terms of the record', () => {
    expect(find(report, 'criterion-PC4')?.because).toMatch(/claims PC4/)
    expect(find(report, 'criterion-PC4')?.because).toMatch(/invites the question/)
  })

  it('ranks an exposure above a gap', () => {
    // PC4 is claimed-and-empty; the others have nothing at all.
    expect(report.questions[0].verdict).toBe('exposed')
  })
})

describe('a criterion propped up by CPD alone', () => {
  const report = examine({
    entries: [
      entry({
        date: '2026-07-06', projectId: null, officeCategory: 'cpd',
        criteria: ['PC1'] as CriterionId[], participation: 'participant',
        activity: 'CPD seminar on the Building Safety Act gateways',
      }),
      entry({
        date: '2026-07-13', projectId: null, officeCategory: 'part3',
        criteria: ['PC1'] as CriterionId[], participation: 'participant',
        activity: 'Part 3 lecture on professional indemnity and duty of care',
      }),
    ],
    projects,
  })

  it('is thin: that is knowledge, and the question asks for experience', () => {
    expect(find(report, 'criterion-PC1')?.verdict).toBe('thin')
  })

  it('says exactly why the sheet looks covered when it is not', () => {
    expect(find(report, 'criterion-PC1')?.because).toMatch(/CPD or a Part 3 lecture/)
    expect(find(report, 'criterion-PC1')?.because).toMatch(/looks covered/)
  })

  it('asks for it on a job, not for more reading', () => {
    expect(find(report, 'criterion-PC1')?.fix).toMatch(/Now get it on a job/)
  })
})

describe('a criterion with real evidence', () => {
  const report = examine({
    entries: [
      entry({
        date: '2026-07-06', criteria: ['PC5'] as CriterionId[], participation: 'participant',
        activity: 'Marked up the contractor shop drawings for the curtain wall head condition',
      }),
      entry({
        date: '2026-07-13', criteria: ['PC5'] as CriterionId[], participation: 'participant',
        activity: 'Answered the technical query from the main contractor on the soffit detail',
      }),
    ],
    projects,
  })

  it('is answerable, and says how many entries back it', () => {
    const q = find(report, 'criterion-PC5')
    expect(q?.verdict).toBe('answerable')
    expect(q?.evidence.supporting).toBe(2)
    expect(q?.fix).toBeNull()
  })

  it('quotes the record back, because that is how it happens', () => {
    expect(find(report, 'criterion-PC5')?.evidence.quote).toMatch(/curtain wall head|soffit/)
  })
})

describe('a stage you only watched', () => {
  const report = examine({
    entries: [
      entry({
        date: '2026-07-06', stage: 5 as StageId, minutes: 480, participation: 'observer',
        activity: 'Sat in on the valuation meeting with the quantity surveyor',
      }),
      entry({
        date: '2026-07-13', stage: 5 as StageId, minutes: 480, participation: 'observer',
        activity: 'Watched the contract administrator issue an instruction',
      }),
    ],
    projects,
  })

  it('is exposed: the sheet says you were there, not that you did anything', () => {
    const q = find(report, 'stage-5')
    expect(q?.verdict).toBe('exposed')
    expect(q?.source).toBe('observed')
    expect(q?.because).toMatch(/every minute of it observed/)
  })

  it('asks for one hour of doing rather than more watching', () => {
    expect(find(report, 'stage-5')?.fix).toMatch(/One hour\s+participating/)
  })
})

describe('a stage touched for an afternoon', () => {
  it('is thin, and says so without pretending it is nothing', () => {
    const report = examine({
      entries: [entry({
        date: '2026-07-06', stage: 6 as StageId, minutes: 90, participation: 'participant',
        activity: 'Sat in on the handover walkround',
      })],
      projects,
    })
    const q = find(report, 'stage-6')
    expect(q?.verdict).toBe('thin')
    expect(q?.source).toBe('token')
  })

  it('says nothing at all about a stage that is properly covered', () => {
    const report = examine({
      entries: Array.from({ length: 6 }, (_, i) => entry({
        date: `2026-07-0${i + 1}`, stage: 4 as StageId, minutes: 300, participation: 'participant',
        activity: `Produced the balustrade detail revision ${String.fromCharCode(65 + i)} for tender`,
      })),
      projects,
    })
    expect(find(report, 'stage-4')).toBeUndefined()
  })
})

describe('the project they open on', () => {
  const entries = [
    entry({ date: '2026-07-06', projectId: 'p1', minutes: 600, stage: 4 as StageId }),
    entry({ date: '2026-07-07', projectId: 'p2', minutes: 60, stage: 4 as StageId }),
  ]

  it('picks the one with the most hours', () => {
    const report = examine({ entries, projects })
    expect(find(report, 'project-procurement')?.question).toMatch(/1042 Battersea Square Phase 2/)
  })

  it('is answerable when the record knows the route', () => {
    const report = examine({ entries, projects })
    expect(find(report, 'project-procurement')?.verdict).toBe('answerable')
    expect(find(report, 'project-procurement')?.evidence.quote).toMatch(/Two stage design and build/)
  })

  it('says plainly what happens if you cannot answer it', () => {
    const bare = [{ ...projects[1], id: 'p2' }]
    const report = examine({
      entries: [entry({ date: '2026-07-06', projectId: 'p2', minutes: 600 })],
      projects: bare,
    })
    const q = find(report, 'project-procurement')
    expect(q?.verdict).toBe('thin')
    expect(q?.fix).toMatch(/worst ninety seconds/)
  })

  it('asks a contract question when there is a contract on the sheet', () => {
    const report = examine({ entries, projects })
    const q = find(report, 'project-contract')
    expect(q?.question).toMatch(/JCT D&B 2016/)
    // No construction-stage work of their own, so they would be quoting a lecture.
    expect(q?.verdict).toBe('thin')
  })
})

describe('the same empty line, over and over', () => {
  const report = examine({
    entries: Array.from({ length: 14 }, (_, i) =>
      entry({ date: `2026-0${(i % 9) + 1}-0${(i % 8) + 1}`, activity: 'worked on drawings' }),
    ),
    projects,
  })

  it('counts them and quotes them', () => {
    const q = find(report, 'vague-repeat')
    expect(q?.question).toMatch(/"worked on drawings" 14 times/)
    expect(q?.verdict).toBe('exposed')
  })

  it('says what it actually reveals to an examiner', () => {
    expect(find(report, 'vague-repeat')?.because)
      .toMatch(/written at the time or reconstructed afterwards/)
  })

  it('ignores a phrase used once or twice', () => {
    const report2 = examine({
      entries: [entry({ date: '2026-07-06', activity: 'admin' }), entry({ date: '2026-07-07', activity: 'admin' })],
      projects,
    })
    expect(find(report2, 'vague-repeat')).toBeUndefined()
  })
})

describe('who you dealt with', () => {
  it('calls a record that names nobody what it is', () => {
    const report = examine({
      entries: [entry({ date: '2026-07-06', people: [] })],
      projects,
    })
    const q = find(report, 'people-none')
    expect(q?.verdict).toBe('exposed')
    expect(q?.because).toMatch(/kept indoors/)
  })

  it('asks for the friction once names are there', () => {
    const report = examine({
      entries: [
        entry({
          date: '2026-07-06', people: ['Sarah Chen'],
          activity: 'Met the client to agree the revised programme',
        }),
        entry({
          date: '2026-07-13', people: ['Dan Okafor'],
          activity: 'Answered a technical query from the main contractor on the soffit',
        }),
      ],
      projects,
    })
    expect(find(report, 'people-none')).toBeUndefined()
    expect(find(report, 'people-external')?.question).toMatch(/disagreement/)
  })
})

describe('readiness', () => {
  it('is defensibility, not completeness', () => {
    const strong = examine({
      entries: [
        ...Array.from({ length: 4 }, (_, i) => entry({
          date: `2026-07-0${i + 1}`, projectId: 'p1', stage: 4 as StageId, minutes: 300,
          participation: 'participant', criteria: ['PC5'] as CriterionId[],
          activity: `Produced the curtain wall head detail revision ${i} for the tender package`,
          people: ['Sarah Chen'],
        })),
      ],
      projects,
    })
    const weak = examine({
      entries: Array.from({ length: 4 }, (_, i) => entry({
        date: `2026-07-0${i + 1}`, activity: 'worked on drawings', projectId: null,
        criteria: ['PC1', 'PC2'] as CriterionId[], people: [], participation: 'observer',
      })),
      projects,
    })
    expect(strong.readiness).toBeGreaterThan(weak.readiness)
    expect(weak.exposed).toBeGreaterThan(strong.exposed)
  })

  it('leads with the exposure when there is one', () => {
    const report = examine({
      entries: [entry({
        date: '2026-07-06', activity: 'worked on drawings', criteria: ['PC3'] as CriterionId[],
        participation: 'observer', people: [],
      })],
      projects,
    })
    expect(report.worst?.verdict).toBe('exposed')
    expect(report.headline).toMatch(/cannot answer/)
  })

  it('breaks the count down by criterion, because that is how a PSA reads it', () => {
    const report = examine({ entries: [], projects })
    expect(Object.keys(report.byCriterion).sort()).toEqual(['PC1', 'PC2', 'PC3', 'PC4', 'PC5'])
  })

  it('only examines the period it was given', () => {
    const entries = [
      entry({ date: '2025-01-06', activity: 'Old work nobody is asking about now' }),
      entry({ date: '2026-07-06', activity: 'Produced the balustrade detail for the tender package' }),
    ]
    const report = examine({ entries, projects, from: '2026-01-01', to: '2026-12-31' })
    const quotes = JSON.stringify(report.questions)
    expect(quotes).not.toMatch(/Old work nobody/)
  })
})

describe('every question', () => {
  const report = examine({
    entries: [
      entry({
        date: '2026-07-06', projectId: 'p1', stage: 5 as StageId, participation: 'observer',
        criteria: ['PC5'] as CriterionId[], wentWrong: 'The QS pushed back hard on my cost assumptions and was right to.',
        activity: 'Sat in on the valuation meeting with the quantity surveyor',
      }),
      ...Array.from({ length: 4 }, (_, i) => entry({ date: `2026-08-0${i + 1}`, activity: 'admin' })),
    ],
    projects,
  })

  it('is a question somebody could actually be asked out loud', () => {
    // Half of what an examiner says is an imperative — "talk me through it",
    // "describe a time" — so a question mark is not the test. Being a prompt
    // a human would say in a room is.
    // The imperative can follow a quotation, so the sentence break may be
            // `." ` rather than `. `.
    const spoken = /\?|(^|[.!?]["\u201d\u2019']?\s+)(describe|talk|tell|walk|take|explain|give)\b/i
    for (const q of report.questions) {
      expect(q.question.length, q.id).toBeGreaterThan(25)
      expect(q.question, q.id).toMatch(spoken)
    }
  })

  it('says why this record invites it, never generically', () => {
    for (const q of report.questions) {
      expect(q.because.length).toBeGreaterThan(30)
    }
  })

  it('says what a good answer contains without writing it', () => {
    for (const q of report.questions) {
      expect(q.looksFor.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('offers something to do about it whenever it is not answerable', () => {
    for (const q of report.questions) {
      if (q.verdict === 'answerable') continue
      expect(q.fix, q.id).toBeTruthy()
    }
  })

  it('has a stable, unique id', () => {
    const ids = report.questions.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
