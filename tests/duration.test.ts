import { describe, expect, it } from 'vitest'
import { allocateDayMinutes, parseDuration, stripDuration } from '@/lib/ingest/duration'

const mins = (text: string) => parseDuration(text)?.minutes ?? null

describe('parseDuration', () => {
  it('reads plain hour amounts', () => {
    expect(mins('4h on the tender package')).toBe(240)
    expect(mins('spent 4 hrs on details')).toBe(240)
    expect(mins('4 hours')).toBe(240)
    expect(mins('4.5 hours')).toBe(270)
    expect(mins('1,5 hours')).toBe(90)
  })

  it('reads hours and minutes together', () => {
    expect(mins('2h30 on site')).toBe(150)
    expect(mins('2h 30m')).toBe(150)
    expect(mins('2 hours 15 minutes')).toBe(135)
  })

  it('reads minute amounts', () => {
    expect(mins('90 mins')).toBe(90)
    expect(mins('45m call')).toBe(45)
    expect(mins('30 minutes')).toBe(30)
  })

  it('reads clock ranges', () => {
    expect(mins('09:00-17:30')).toBe(510)
    expect(mins('9am to 5pm')).toBe(480)
    expect(mins('9.00 - 17.30 on site')).toBe(510)
    expect(mins('9 to 5')).toBe(480)
  })

  it('reads a bare shift range only when a verb makes it one', () => {
    expect(mins('worked 9-5')).toBe(480)
    // Without the cue this is a quantity, not a shift.
    expect(mins('issued 3-4 drawings')).toBeNull()
    expect(mins('revisions 8-10 reviewed')).toBeNull()
  })

  it('reads portions of a day', () => {
    expect(mins('half day on site')).toBe(225)
    expect(mins('half a day')).toBe(225)
    expect(mins('1/2 day')).toBe(225)
    expect(mins('all day at the DTM')).toBe(450)
    expect(mins('full day')).toBe(450)
    expect(mins('all morning')).toBe(225)
    expect(mins('couple of hours')).toBe(120)
  })

  it('marks day fractions as fractional and clock amounts as not', () => {
    expect(parseDuration('half day')?.fractional).toBe(true)
    expect(parseDuration('4h')?.fractional).toBe(false)
  })

  it('refuses to invent a duration that is not there', () => {
    expect(mins('Issued the RFI response on the curtain wall head detail')).toBeNull()
    expect(mins('site visit with Sarah')).toBeNull()
    expect(mins('')).toBeNull()
  })

  it('does not read a date as a duration', () => {
    expect(mins('08/09/2026')).toBeNull()
    expect(mins('2026-09-08')).toBeNull()
  })

  it('rejects implausible spans rather than recording a 30-hour day', () => {
    expect(mins('40 hours')).toBeNull()
    expect(mins('25h')).toBeNull()
  })

  it('is unsure about an uncued range and certain about an explicit one', () => {
    expect(parseDuration('worked 9-5')!.confidence).toBeLessThan(0.9)
    expect(parseDuration('09:00-17:30')!.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('honours a non-standard working day', () => {
    expect(parseDuration('half day', { standardDayMinutes: 480 })?.minutes).toBe(240)
  })
})

describe('stripDuration', () => {
  it('leaves clean activity text behind', () => {
    expect(stripDuration('4h on the tender package', '4h')).toBe('on the tender package')
    expect(stripDuration('Site visit (2h30)', '2h30')).toBe('Site visit')
    expect(stripDuration('DTM, all day', 'all day')).toBe('DTM')
  })

  it('is a no-op when nothing matched', () => {
    expect(stripDuration('Site visit', null)).toBe('Site visit')
  })
})

describe('allocateDayMinutes', () => {
  it('does nothing when every entry already has a duration', () => {
    const out = allocateDayMinutes([{ minutes: 120 }, { minutes: 180 }])
    expect(out.map((e) => e.minutes)).toEqual([120, 180])
    expect(out.every((e) => !e.minutesEstimated)).toBe(true)
  })

  it('spreads the rest of the day across the blanks', () => {
    const out = allocateDayMinutes([{ minutes: 150 }, { minutes: 0 }, { minutes: 0 }])
    expect(out[0].minutes).toBe(150)
    expect(out[1].minutes).toBe(150) // (450 - 150) / 2
    expect(out[2].minutes).toBe(150)
  })

  it('marks every invented minute as estimated', () => {
    const out = allocateDayMinutes([{ minutes: 0 }, { minutes: 240 }])
    expect(out[0].minutesEstimated).toBe(true)
    expect(out[1].minutesEstimated).toBe(false)
  })

  it('rounds to quarter hours, because nobody believes a 37-minute entry', () => {
    const out = allocateDayMinutes([{ minutes: 0 }, { minutes: 0 }, { minutes: 0 }])
    expect(out.every((e) => e.minutes % 15 === 0)).toBe(true)
  })

  it('still gives a blank entry something when the day is already full', () => {
    const out = allocateDayMinutes([{ minutes: 450 }, { minutes: 0 }])
    expect(out[1].minutes).toBe(15)
    expect(out[1].minutesEstimated).toBe(true)
  })
})

describe('stripDuration tidies what removal leaves behind', () => {
  it('collapses the orphaned punctuation', () => {
    expect(stripDuration('worked up the stair details with Tom. 4h. sent the wrong revision', '4h'))
      .toBe('worked up the stair details with Tom. sent the wrong revision')
  })

  it('does not leave a space before punctuation', () => {
    expect(stripDuration('Site visit 2h30, then back to the office', '2h30'))
      .toBe('Site visit, then back to the office')
  })

  it('drops a leading full stop left by a removal at the start', () => {
    expect(stripDuration('4h. tender package', '4h')).toBe('tender package')
  })
})
