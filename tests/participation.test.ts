import { describe, expect, it } from 'vitest'
import { detectParticipation } from '@/lib/ingest/classify'
import { parseDump } from '@/lib/ingest'
import { participationTrend } from '@/lib/pedr/coverage'
import { buildSheet } from '@/lib/pedr/sheet'
import { sanitiseEntries } from '@/lib/entry-input'
import { entry } from './helpers'
import type { StageId } from '@/lib/pedr/constants'

describe('detectParticipation', () => {
  it('reads work you did as participant', () => {
    expect(detectParticipation('Issued the RFI response on the curtain wall head detail').participation)
      .toBe('participant')
    expect(detectParticipation('Produced the tender package drawings').participation)
      .toBe('participant')
  })

  it('reads watching as observer, the way people actually write it', () => {
    for (const text of [
      'Sat in on the valuation meeting with the QS',
      'Shadowed Tom on the site inspection',
      'Was shown how the NBS spec is put together',
      'Sarah talked me through the collateral warranty',
      'Went along to the client presentation',
      'Watched the principal designer run the CDM workshop',
    ]) {
      expect(detectParticipation(text).participation, text).toBe('observer')
    }
  })

  it('reads doing as doing even when you were sitting with somebody', () => {
    // "Sat with Tom and produced the schedule" is work, not watching.
    const result = detectParticipation('Sat with Tom and produced the drawing schedule myself')
    expect(result.participation).toBe('participant')
  })

  it('does not fire on a word that merely contains a trigger', () => {
    expect(detectParticipation('Reviewed the watchmaker’s shopfront elevation').participation)
      .toBe('participant')
  })

  it('is more sure about observer than about the default', () => {
    expect(detectParticipation('Sat in on the valuation').confidence)
      .toBeGreaterThan(detectParticipation('Drew the stair detail').confidence)
  })
})

describe('parsing a dump', () => {
  const opts = { reference: '2026-09-11' }

  it('splits a week into the two columns', () => {
    const result = parseDump(
      [
        'mon - issued the stair details for 1042',
        'tue - sat in on the valuation meeting with the QS',
        'wed - produced the tender package drawings',
      ].join('\n'),
      opts,
    )
    expect(result.entries.map((e) => e.participation)).toEqual([
      'participant', 'observer', 'participant',
    ])
  })

  it('holds an observed entry back for review', () => {
    // Filing work somebody did as "watched" understates their record.
    const result = parseDump('tue - shadowed Tom on the site inspection', opts)
    expect(result.entries[0].confidence).toBeLessThanOrEqual(0.5)
  })

  it('never files leave as observed', () => {
    const result = parseDump('mon - annual leave', opts)
    expect(result.entries[0].participation).toBe('participant')
  })
})

describe('what the route accepts back', () => {
  it('keeps a valid choice', () => {
    const result = sanitiseEntries(
      [{ date: '2026-09-08', minutes: 60, activity: 'x', participation: 'observer' }],
      { source: 'dump' },
    )
    expect(result.ok && result.entries[0].participation).toBe('observer')
  })

  it('falls back to participant rather than demoting work it cannot read', () => {
    for (const value of ['spectator', '', null, undefined, 42]) {
      const result = sanitiseEntries(
        [{ date: '2026-09-08', minutes: 60, activity: 'x', participation: value }],
        { source: 'dump' },
      )
      expect(result.ok && result.entries[0].participation).toBe('participant')
    }
  })
})

describe('the sheet', () => {
  const entries = [
    entry({ date: '2026-07-06', minutes: 300, stage: 4 as StageId, participation: 'participant' }),
    entry({ date: '2026-07-07', minutes: 120, stage: 4 as StageId, participation: 'observer' }),
    entry({ date: '2026-07-08', minutes: 180, stage: 5 as StageId, participation: 'observer' }),
    entry({
      date: '2026-07-09', minutes: 450, stage: null, projectId: null,
      officeCategory: 'leave', participation: 'participant',
    }),
  ]
  const sheet = buildSheet({
    periodStart: '2026-07-01', periodEnd: '2026-09-30',
    entries, notes: [], projects: [], employment: null,
  })

  it('splits each stage into the two columns', () => {
    expect(sheet.stageParticipation['4']).toEqual({ participant: 300, observer: 120 })
    expect(sheet.stageParticipation['5']).toEqual({ participant: 0, observer: 180 })
    expect(sheet.stageParticipation['0']).toEqual({ participant: 0, observer: 0 })
  })

  it('still totals to the stage figure', () => {
    for (const key of Object.keys(sheet.stageMinutes)) {
      const split = sheet.stageParticipation[key]
      expect(split.participant + split.observer).toBe(sheet.stageMinutes[key])
    }
  })

  it('leaves holiday out of the balance, since it is not experience', () => {
    expect(sheet.participation).toEqual({ participant: 300, observer: 300 })
  })
})

describe('participationTrend', () => {
  it('says nothing when nothing has been logged', () => {
    const trend = participationTrend([])
    expect(trend.observerShare).toBeNull()
    expect(trend.note).toBeNull()
  })

  it('reads a record that moves from watching to doing', () => {
    const entries = [
      // Two months mostly watching...
      entry({ date: '2026-01-06', minutes: 400, participation: 'observer' }),
      entry({ date: '2026-01-07', minutes: 100, participation: 'participant' }),
      entry({ date: '2026-02-06', minutes: 400, participation: 'observer' }),
      entry({ date: '2026-02-07', minutes: 100, participation: 'participant' }),
      // ...then two months mostly doing.
      entry({ date: '2026-05-06', minutes: 60, participation: 'observer' }),
      entry({ date: '2026-05-07', minutes: 440, participation: 'participant' }),
      entry({ date: '2026-06-06', minutes: 40, participation: 'observer' }),
      entry({ date: '2026-06-07', minutes: 460, participation: 'participant' }),
    ]
    const trend = participationTrend(entries)
    expect(trend.months).toHaveLength(4)
    expect(trend.shift).toBeLessThan(-0.08)
    expect(trend.note).toMatch(/falling/i)
    expect(trend.note).toMatch(/development over time/i)
  })

  it('flags a record where the share is climbing', () => {
    const entries = [
      entry({ date: '2026-01-06', minutes: 480, participation: 'participant' }),
      entry({ date: '2026-02-06', minutes: 480, participation: 'participant' }),
      entry({ date: '2026-05-06', minutes: 400, participation: 'observer' }),
      entry({ date: '2026-06-06', minutes: 400, participation: 'observer' }),
    ]
    const trend = participationTrend(entries)
    expect(trend.shift).toBeGreaterThan(0.08)
    expect(trend.note).toMatch(/rising/i)
  })

  it('calls out a record that never moves', () => {
    const entries = Array.from({ length: 6 }, (_, i) => [
      entry({ date: `2026-0${i + 1}-06`, minutes: 300, participation: 'participant' }),
      entry({ date: `2026-0${i + 1}-07`, minutes: 200, participation: 'observer' }),
    ]).flat()
    const trend = participationTrend(entries)
    expect(Math.abs(trend.shift ?? 1)).toBeLessThan(0.08)
    expect(trend.note).toMatch(/flat/i)
  })

  it('notices a record with no observed experience at all', () => {
    const entries = Array.from({ length: 4 }, (_, i) =>
      entry({ date: `2026-0${i + 1}-06`, minutes: 300, participation: 'participant' }),
    )
    const trend = participationTrend(entries)
    expect(trend.observerShare).toBe(0)
    expect(trend.note).toMatch(/no observed experience/i)
  })

  it('keeps holiday out of the balance', () => {
    const trend = participationTrend([
      entry({ date: '2026-01-06', minutes: 300, participation: 'participant' }),
      entry({
        date: '2026-01-07', minutes: 450, projectId: null,
        officeCategory: 'leave', participation: 'participant',
      }),
    ])
    expect(trend.participant).toBe(300)
  })

  it('will not guess a direction from two months', () => {
    const trend = participationTrend([
      entry({ date: '2026-01-06', minutes: 300, participation: 'observer' }),
      entry({ date: '2026-02-06', minutes: 300, participation: 'participant' }),
    ])
    expect(trend.shift).toBeNull()
    expect(trend.note).toMatch(/50% of your hours/i)
  })
})
