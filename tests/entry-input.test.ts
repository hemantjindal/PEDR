import { describe, expect, it } from 'vitest'
import { sanitiseEntries } from '@/lib/entry-input'
import type { DraftEntry } from '@/lib/pedr/types'

function draft(over: Partial<DraftEntry> = {}): Record<string, unknown> {
  return {
    date: '2026-09-08',
    minutes: 90,
    minutesEstimated: false,
    projectId: null,
    projectHint: null,
    stage: 4,
    officeCategory: null,
    activity: 'Issued RFI response on the curtain wall head detail',
    detail: null,
    people: ['Sarah Chen'],
    criteria: ['PC5'],
    wentWrong: null,
    learned: null,
    confidence: 0.8,
    source: 'calendar',
    ...over,
  }
}

const defaults = { source: 'dump' as const }

describe('sanitiseEntries', () => {
  it('lets a well-formed entry through unchanged', () => {
    const result = sanitiseEntries([draft()], defaults)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries[0]).toMatchObject({ minutes: 90, stage: 4, criteria: ['PC5'] })
  })

  it('refuses a batch that is not a list', () => {
    expect(sanitiseEntries('everything', defaults)).toEqual({ ok: false, error: 'No entries supplied.' })
  })

  it('refuses an absurd batch', () => {
    const many = Array.from({ length: 2001 }, () => draft())
    expect(sanitiseEntries(many, defaults).ok).toBe(false)
  })

  it('refuses a date it cannot trust', () => {
    const result = sanitiseEntries([draft({ date: '08/09/2026' as never })], defaults)
    expect(result).toMatchObject({ ok: false })
  })

  it('refuses a duration longer than a day', () => {
    const result = sanitiseEntries([draft({ minutes: 2000 })], defaults)
    expect(result).toMatchObject({ ok: false })
    expect(sanitiseEntries([draft({ minutes: -5 })], defaults).ok).toBe(false)
  })

  it('drops a stage and criteria the client made up', () => {
    const result = sanitiseEntries(
      [draft({ stage: 99 as never, criteria: ['PC9', 'PC1'] as never })],
      defaults,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries[0].stage).toBeNull()
    expect(result.entries[0].criteria).toEqual(['PC1'])
  })

  it('drops an office category that is not one of ours', () => {
    const result = sanitiseEntries([draft({ officeCategory: 'nonsense' as never })], defaults)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries[0].officeCategory).toBeNull()
  })

  it('skips an entry with nothing written in it', () => {
    const result = sanitiseEntries([draft({ activity: '   ' })], defaults)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries).toHaveLength(0)
  })

  it('caps the people and the criteria', () => {
    const result = sanitiseEntries([draft({
      people: Array.from({ length: 50 }, (_, i) => `Person ${i}`),
      criteria: ['PC1', 'PC2', 'PC3', 'PC4', 'PC5'],
    })], defaults)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries[0].people).toHaveLength(30)
    expect(result.entries[0].criteria).toHaveLength(3)
  })

  it('drops a repeated external id inside one batch', () => {
    // Two rows for the same meeting would be rejected by the unique index
    // anyway; dropping it here means the count reported back is the truth.
    const result = sanitiseEntries(
      [draft({ externalId: 'evt-1:2026-09-08' }), draft({ externalId: 'evt-1:2026-09-08' })],
      defaults,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries).toHaveLength(1)
  })

  it('falls back to the caller’s source when the client sends none', () => {
    const result = sanitiseEntries([draft({ source: undefined as never })], { source: 'calendar' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries[0].source).toBe('calendar')
  })

  it('clamps a confidence outside the range', () => {
    const result = sanitiseEntries(
      [draft({ confidence: 8 }), draft({ confidence: -1 }), draft({ confidence: NaN })],
      defaults,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries.map((e) => e.confidence)).toEqual([1, 0, 0.5])
  })

  it('clears a project hint once a project is chosen', () => {
    const result = sanitiseEntries([draft({ projectId: 'p1', projectHint: 'battersea' })], defaults)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries[0].projectHint).toBeNull()
  })
})
