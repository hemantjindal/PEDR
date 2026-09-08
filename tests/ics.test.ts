import { describe, expect, it } from 'vitest'
import { buildCalendar, buildReminderCalendar, escapeText, fold } from '@/lib/ics'
import { planSheetPeriods } from '@/lib/pedr/deadlines'

const now = new Date('2026-09-08T09:00:00.000Z')

describe('escapeText', () => {
  it('escapes the characters the spec reserves', () => {
    expect(escapeText('a;b,c')).toBe('a\;b\\,c')
    expect(escapeText('line one\nline two')).toBe('line one\\nline two')
  })

  it('escapes backslashes first, so escapes are not double-escaped', () => {
    expect(escapeText('a\\b;c')).toBe('a\\\\b\;c')
  })
})

describe('fold', () => {
  it('leaves short lines alone', () => {
    expect(fold('SUMMARY:Short')).toBe('SUMMARY:Short')
  })

  it('folds long lines with a leading space on continuations', () => {
    const folded = fold(`SUMMARY:${'x'.repeat(200)}`)
    const lines = folded.split('\r\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(Buffer.from(lines[0], 'utf8').length).toBeLessThanOrEqual(75)
    for (const line of lines.slice(1)) expect(line.startsWith(' ')).toBe(true)
  })

  it('never splits a multi-byte character in half', () => {
    const folded = fold(`SUMMARY:${'é'.repeat(120)}`)
    // Rejoining must reproduce the original exactly — a split character would
    // turn into replacement characters here.
    const rejoined = folded.split('\r\n').map((l, i) => (i === 0 ? l : l.slice(1))).join('')
    expect(rejoined).toBe(`SUMMARY:${'é'.repeat(120)}`)
  })
})

describe('buildCalendar', () => {
  const ics = buildCalendar(
    [{
      uid: 'test@pedr',
      start: '2026-09-11',
      summary: 'Log this week',
      description: 'Two minutes; a quarter saved.',
      alarmDaysBefore: 2,
    }],
    { name: 'PEDR', now },
  )

  it('uses CRLF throughout, as the spec requires', () => {
    expect(ics.includes('\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('opens and closes the calendar and the event', () => {
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VEVENT')
  })

  it('writes all-day dates with an exclusive end', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20260911')
    expect(ics).toContain('DTEND;VALUE=DATE:20260912')
  })

  it('adds an alarm when one was asked for', () => {
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('TRIGGER:-P2D')
  })
})

describe('buildReminderCalendar', () => {
  const periods = planSheetPeriods('2025-01-01', { today: '2026-09-08' })
  const ics = buildReminderCalendar({
    name: 'PEDR — A. Candidate',
    token: 'tok123',
    periods,
    weeklyFrom: '2026-09-11',
    appUrl: 'https://example.test',
    now,
  })

  it('repeats the nudge every Friday', () => {
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=FR')
  })

  it('adds one dated event per outstanding sheet', () => {
    const count = (ics.match(/BEGIN:VEVENT/g) ?? []).length
    expect(count).toBe(periods.length + 1) // the weekly one, plus each sheet
  })

  it('warns a fortnight before a deadline', () => {
    expect(ics).toContain('TRIGGER:-P14D')
  })

  it('leaves out sheets that are already signed off', () => {
    const done = planSheetPeriods('2025-01-01', { today: '2026-09-08' })
    done[0].status = 'psa_signed'
    const withDone = buildReminderCalendar({
      name: 'PEDR', token: 't', periods: done, weeklyFrom: '2026-09-11', now,
    })
    expect((withDone.match(/BEGIN:VEVENT/g) ?? []).length).toBe(periods.length)
  })

  it('gives every event a stable, unique id', () => {
    const uids = [...ics.matchAll(/UID:(.+)\r\n/g)].map((m) => m[1])
    expect(new Set(uids).size).toBe(uids.length)
  })
})
