import { describe, expect, it } from 'vitest'
import { applyPatch, enrichEntries, isEnrichmentAvailable } from '@/lib/ingest/enrich'
import type { DraftEntry, Project } from '@/lib/pedr/types'

const projects: Project[] = [{
  id: 'p-bat', userId: 'u1', code: '1042', name: 'Battersea Square Phase 2',
  client: null, sector: null, valueGbp: null, procurement: null, contractForm: null,
  isCaseStudy: false, notes: null, aliases: [], archived: false, createdAt: '2025-01-01T00:00:00Z',
}]

const entry: DraftEntry = {
  date: '2026-09-07',
  minutes: 240,
  minutesEstimated: false,
  projectId: null,
  projectHint: 'Battersea',
  stage: 4,
  officeCategory: null,
  activity: 'worked on drawings',
  detail: null,
  people: [],
  criteria: ['PC5'],
  wentWrong: null,
  learned: null,
  confidence: 0.4,
  source: 'dump',
  provenance: 'line 2: mon - battersea drawings',
}

const fullPatch = {
  index: 0,
  date: null,
  activity: 'Produced the Stage 4 stair balustrade details',
  detail: null,
  projectRef: 'p-bat',
  officeCategory: null,
  stage: 4,
  criteria: ['PC5'],
  people: ['Tom Reilly'],
  wentWrong: null,
  learned: null,
  confidence: 0.9,
}

describe('applyPatch — the safety boundary', () => {
  it('never lets the model change the hours', () => {
    const patched = applyPatch(entry, { ...fullPatch, minutes: 450 } as never, projects)
    expect(patched.minutes).toBe(240)
    expect(patched.minutesEstimated).toBe(false)
  })

  it('never lets the model mark estimated hours as stated', () => {
    const estimated = { ...entry, minutes: 225, minutesEstimated: true }
    const patched = applyPatch(estimated, fullPatch, projects)
    expect(patched.minutesEstimated).toBe(true)
    expect(patched.minutes).toBe(225)
  })

  it('accepts a project that exists and clears the now-redundant hint', () => {
    const patched = applyPatch(entry, fullPatch, projects)
    expect(patched.projectId).toBe('p-bat')
    expect(patched.projectHint).toBeNull()
  })

  it('rejects a project id that is not on the list', () => {
    const patched = applyPatch(entry, { ...fullPatch, projectRef: 'p-invented' }, projects)
    expect(patched.projectId).toBeNull()
    expect(patched.projectHint).toBe('Battersea') // the parser's hint survives
  })

  it('rejects a stage outside 0-7 and keeps what the parser found', () => {
    expect(applyPatch(entry, { ...fullPatch, stage: 9 }, projects).stage).toBe(4)
    expect(applyPatch(entry, { ...fullPatch, stage: -1 }, projects).stage).toBe(4)
  })

  it('accepts a corrected stage inside the range', () => {
    expect(applyPatch(entry, { ...fullPatch, stage: 5 }, projects).stage).toBe(5)
  })

  it('drops criteria that are not real', () => {
    const patched = applyPatch(entry, { ...fullPatch, criteria: ['PC2', 'PC9', 'GC1'] }, projects)
    expect(patched.criteria).toEqual(['PC2'])
  })

  it('caps criteria at three so a sheet stays readable', () => {
    const patched = applyPatch(entry, {
      ...fullPatch, criteria: ['PC1', 'PC2', 'PC3', 'PC4', 'PC5'],
    }, projects)
    expect(patched.criteria).toHaveLength(3)
  })

  it('rejects an invalid office category', () => {
    const patched = applyPatch(entry, { ...fullPatch, projectRef: null, officeCategory: 'lunch' }, projects)
    expect(patched.officeCategory).toBeNull()
  })

  it('accepts a real office category when there is no project', () => {
    const patched = applyPatch(entry, { ...fullPatch, projectRef: null, officeCategory: 'cpd' }, projects)
    expect(patched.officeCategory).toBe('cpd')
  })

  it('rejects a malformed corrected date', () => {
    expect(applyPatch(entry, { ...fullPatch, date: '2026-02-30' }, projects).date).toBe('2026-09-07')
    expect(applyPatch(entry, { ...fullPatch, date: 'Monday' }, projects).date).toBe('2026-09-07')
  })

  it('accepts a valid corrected date', () => {
    expect(applyPatch(entry, { ...fullPatch, date: '2026-09-08' }, projects).date).toBe('2026-09-08')
  })

  it('improves the activity line but never blanks it', () => {
    expect(applyPatch(entry, fullPatch, projects).activity).toMatch(/stair balustrade/)
    expect(applyPatch(entry, { ...fullPatch, activity: '   ' }, projects).activity).toBe('worked on drawings')
  })

  it('clamps a confidence outside 0-1', () => {
    expect(applyPatch(entry, { ...fullPatch, confidence: 5 }, projects).confidence).toBe(1)
    expect(applyPatch(entry, { ...fullPatch, confidence: -2 }, projects).confidence).toBe(0)
    expect(applyPatch(entry, { ...fullPatch, confidence: Number.NaN }, projects).confidence).toBe(0.4)
  })

  it('keeps the provenance trail so the original input is still traceable', () => {
    expect(applyPatch(entry, fullPatch, projects).provenance).toBe(entry.provenance)
  })
})

describe('enrichEntries without an API key', () => {
  it('reports itself unavailable', () => {
    expect(isEnrichmentAvailable('')).toBe(false)
    expect(isEnrichmentAvailable('   ')).toBe(false)
    expect(isEnrichmentAvailable('sk-ant-test')).toBe(true)
  })

  it('returns the entries untouched and says why', async () => {
    const result = await enrichEntries('some raw text', [entry], { apiKey: '' })
    expect(result.entries).toEqual([entry])
    expect(result.enriched).toBe(false)
    expect(result.usage).toBeNull()
    expect(result.warnings.join(' ')).toMatch(/no ANTHROPIC_API_KEY/)
  })

  it('does nothing at all for an empty parse', async () => {
    const result = await enrichEntries('', [], { apiKey: 'sk-ant-test' })
    expect(result.entries).toEqual([])
    expect(result.enriched).toBe(false)
  })
})
