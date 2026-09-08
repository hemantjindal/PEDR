import { describe, expect, it } from 'vitest'
import {
  isDateOnlyLine, resolveDatePhrase, resolveWeekHeader, stripDatePhrase,
} from '@/lib/ingest/dates'

// Tuesday 8 September 2026. Monday of that ISO week is the 7th.
const ctx = { reference: '2026-09-08' as const }

const on = (text: string, extra: Partial<typeof ctx> & { weekStart?: string } = {}) =>
  resolveDatePhrase(text, { ...ctx, ...extra })

describe('explicit dates', () => {
  it('reads ISO dates exactly', () => {
    expect(on('2026-09-08 site visit')).toMatchObject({ date: '2026-09-08', confidence: 1 })
  })

  it('reads UK day-first numeric dates', () => {
    expect(on('08/09/2026').date).toBe('2026-09-08')
    expect(on('8/9/26').date).toBe('2026-09-08')
    expect(on('8.9.2026').date).toBe('2026-09-08')
  })

  it('is certain when the day cannot be a month', () => {
    const r = on('13/09/2026')
    expect(r.date).toBe('2026-09-13')
    expect(r.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('flags a genuinely ambiguous numeric date instead of pretending', () => {
    const r = on('08/09/2026')
    expect(r.date).toBe('2026-09-08')
    expect(r.confidence).toBeLessThan(0.9)
  })

  it('accepts an American-ordered date but says it is unsure', () => {
    const r = on('09/13/2026')
    expect(r.date).toBe('2026-09-13')
    expect(r.confidence).toBeLessThan(0.6)
  })

  it('rejects impossible dates outright', () => {
    expect(on('31/02/2026').date).toBeNull()
    expect(on('2026-02-30').date).toBeNull()
    expect(on('45/45/2026').date).toBeNull()
  })

  it('does not mistake a duration for a date', () => {
    expect(on('spent 4.5 hours on the tender package').date).toBeNull()
    expect(on('did a 1/2 day on site').date).toBeNull()
    expect(on('3/4 day at the office').date).toBeNull()
  })

  it('reads named months either way round, with or without ordinals', () => {
    expect(on('8 Sep').date).toBe('2026-09-08')
    expect(on('8th September 2026').date).toBe('2026-09-08')
    expect(on('Sept 8').date).toBe('2026-09-08')
    expect(on('September 8th, 2026').date).toBe('2026-09-08')
  })
})

describe('year inference', () => {
  it('keeps the current year for a date already past', () => {
    expect(on('3 Jan').date).toBe('2026-01-03')
  })

  it('rolls back a year rather than inventing a future date', () => {
    // On 8 Sep 2026, "20 Dec" means the December that has been, not the one to come.
    expect(on('20 Dec').date).toBe('2025-12-20')
  })

  it('allows a date slightly in the future — end of this week is still this year', () => {
    expect(on('30 Sep').date).toBe('2026-09-30')
  })

  it('expands two-digit years sensibly', () => {
    expect(on('8/9/26').date).toBe('2026-09-08')
    expect(on('8/9/99').date).toBe('1999-09-08')
  })
})

describe('relative and weekday phrases', () => {
  it('resolves today and yesterday', () => {
    expect(on('today').date).toBe('2026-09-08')
    expect(on('this morning on site').date).toBe('2026-09-08')
    expect(on('yesterday').date).toBe('2026-09-07')
  })

  it('resolves a bare weekday to the most recent one already past', () => {
    expect(on('Mon - Battersea').date).toBe('2026-09-07')
    expect(on('Tuesday').date).toBe('2026-09-08')
    // Friday has not happened yet this week, so it means last Friday.
    expect(on('Friday').date).toBe('2026-09-04')
  })

  it('resolves "last Friday" to the week before', () => {
    expect(on('last Friday').date).toBe('2026-09-04')
  })

  it('places weekdays inside an explicit week context', () => {
    expect(on('Friday', { weekStart: '2026-08-31' }).date).toBe('2026-09-04')
    expect(on('Mon', { weekStart: '2026-08-31' }).date).toBe('2026-08-31')
  })

  it('does not read a weekday out of the middle of a word', () => {
    expect(on('summoned to a review').date).toBeNull()
    expect(on('monitoring the works').date).toBeNull()
  })

  it('prefers an explicit date over a weekday in the same line', () => {
    expect(on('Monday 1 September 2026').date).toBe('2026-09-01')
  })
})

describe('week headers', () => {
  const header = (text: string) => resolveWeekHeader(text, ctx)

  it('reads the common shorthands', () => {
    for (const text of [
      'w/c 7 Sep', 'w/c 7 September 2026', 'Week commencing 7 Sep',
      'week beginning 7 September', 'Week of 7 Sep',
    ]) {
      expect(header(text), text).toMatchObject({ weekStart: '2026-09-07', isWeekHeader: true })
    }
  })

  it('reads an ISO week number', () => {
    expect(header('Week 2026-W37').weekStart).toBe('2026-09-07')
    expect(header('Week 37').weekStart).toBe('2026-09-07')
  })

  it('snaps a mid-week date back to its Monday', () => {
    expect(header('w/c 10 Sep').weekStart).toBe('2026-09-07')
  })

  it('rejects a week that does not exist', () => {
    expect(header('Week 2021-W53').date).toBeNull()
  })

  it('is not fooled by ordinary prose', () => {
    expect(header('spent the week on the tender package').date).toBeNull()
  })
})

describe('stripDatePhrase', () => {
  it('removes the date and the separator after it', () => {
    expect(stripDatePhrase('Mon - Battersea stair details', 'Mon')).toBe('Battersea stair details')
    expect(stripDatePhrase('8 Sep: site visit', '8 Sep')).toBe('site visit')
    expect(stripDatePhrase('• Tuesday — RFI response', 'Tuesday')).toBe('RFI response')
  })

  it('leaves text alone when nothing matched', () => {
    expect(stripDatePhrase('Battersea stair details', null)).toBe('Battersea stair details')
  })
})

describe('isDateOnlyLine', () => {
  it('spots a header line', () => {
    for (const line of ['Monday', 'Mon', '8 September', 'Tuesday 8 September', '2026-09-08']) {
      expect(isDateOnlyLine(line, ctx), line).toBe(true)
    }
  })

  it('does not treat a real entry as a header', () => {
    for (const line of ['Mon - Battersea stair details', 'Tuesday: site visit with Sarah']) {
      expect(isDateOnlyLine(line, ctx), line).toBe(false)
    }
  })
})
