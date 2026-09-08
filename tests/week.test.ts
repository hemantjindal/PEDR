import { describe, expect, it } from 'vitest'
import {
  addDays, addMonths, addWeeks, daysBetween, formatDuration, formatWeek, formatWeekRange,
  fromDateKey, isDateKey, isWeekId, isoDayOfWeek, isoWeekOf, isoWeeksInYear, monthKeyOf,
  parseWeekId, toDateKey, weekDayKeys, weekEndKey, weekIdOf, weekRange, weekStartKey,
  weeksBetween,
} from '@/lib/pedr/week'

describe('date keys', () => {
  it('round-trips through UTC without drifting', () => {
    for (const key of ['2026-01-01', '2026-12-31', '2024-02-29', '2026-06-15']) {
      expect(toDateKey(fromDateKey(key))).toBe(key)
    }
  })

  it('rejects malformed and impossible dates', () => {
    expect(isDateKey('2026-02-30')).toBe(false)
    expect(isDateKey('2025-02-29')).toBe(false) // 2025 is not a leap year
    expect(isDateKey('2026-13-01')).toBe(false)
    expect(isDateKey('26-01-01')).toBe(false)
    expect(isDateKey('2026-1-1')).toBe(false)
    expect(isDateKey(20260101)).toBe(false)
    expect(isDateKey('2024-02-29')).toBe(true)
  })

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('clamps month arithmetic instead of rolling over', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2026-08-15', -24)).toBe('2024-08-15')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
  })

  it('counts days between dates', () => {
    expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7)
    expect(daysBetween('2026-01-08', '2026-01-01')).toBe(-7)
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2) // leap day counted
  })

  it('derives month keys', () => {
    expect(monthKeyOf('2026-09-08')).toBe('2026-09')
  })
})

describe('ISO weeks', () => {
  // The canonical hard cases: years that start or end mid-week, and week 53.
  const cases: Array<[string, string]> = [
    ['2026-01-01', '2026-W01'], // Thursday — week 1 of its own year
    ['2026-09-08', '2026-W37'],
    ['2021-01-01', '2020-W53'], // Friday — belongs to the previous ISO year
    ['2021-01-04', '2021-W01'],
    ['2016-01-03', '2015-W53'], // Sunday — last day of the previous ISO year
    ['2016-01-04', '2016-W01'],
    ['2019-12-30', '2020-W01'], // Monday — belongs to the next ISO year
    ['2020-12-31', '2020-W53'],
    ['2005-01-01', '2004-W53'],
    ['2007-12-31', '2008-W01'],
  ]

  it.each(cases)('%s is %s', (date, expected) => {
    expect(weekIdOf(date)).toBe(expected)
  })

  it('knows which years have 53 weeks', () => {
    expect(isoWeeksInYear(2020)).toBe(53)
    expect(isoWeeksInYear(2015)).toBe(53)
    expect(isoWeeksInYear(2026)).toBe(53)
    expect(isoWeeksInYear(2021)).toBe(52)
    expect(isoWeeksInYear(2025)).toBe(52)
  })

  it('starts weeks on Monday and ends them on Sunday', () => {
    expect(weekStartKey('2026-W37')).toBe('2026-09-07')
    expect(weekEndKey('2026-W37')).toBe('2026-09-13')
    expect(isoDayOfWeek(weekStartKey('2026-W37'))).toBe(0)
    expect(isoDayOfWeek(weekEndKey('2026-W37'))).toBe(6)
  })

  it('round-trips every week start back to its own week id', () => {
    for (const year of [2015, 2016, 2019, 2020, 2021, 2024, 2026, 2027]) {
      for (let w = 1; w <= isoWeeksInYear(year); w++) {
        const id = `${year}-W${String(w).padStart(2, '0')}`
        expect(weekIdOf(weekStartKey(id))).toBe(id)
        expect(weekIdOf(weekEndKey(id))).toBe(id)
      }
    }
  })

  it('assigns all seven days of a week to the same week', () => {
    const ids = new Set(weekDayKeys('2020-W53').map(weekIdOf))
    expect([...ids]).toEqual(['2020-W53'])
  })

  it('rejects weeks that do not exist', () => {
    expect(() => parseWeekId('2021-W53')).toThrow() // 2021 has only 52
    expect(() => parseWeekId('2026-W00')).toThrow()
    expect(() => parseWeekId('nonsense')).toThrow()
    expect(isWeekId('2020-W53')).toBe(true)
    expect(isWeekId('2021-W53')).toBe(false)
  })

  it('adds weeks across the year boundary', () => {
    expect(addWeeks('2020-W52', 1)).toBe('2020-W53')
    expect(addWeeks('2020-W53', 1)).toBe('2021-W01')
    expect(addWeeks('2021-W01', -1)).toBe('2020-W53')
  })

  it('measures the distance between weeks', () => {
    expect(weeksBetween('2026-W01', '2026-W37')).toBe(36)
    expect(weeksBetween('2026-W37', '2026-W01')).toBe(-36)
    expect(weeksBetween('2020-W52', '2021-W01')).toBe(2)
  })
})

describe('weekRange', () => {
  it('is inclusive at both ends', () => {
    expect(weekRange('2026-W01', '2026-W04')).toEqual([
      '2026-W01', '2026-W02', '2026-W03', '2026-W04',
    ])
  })

  it('handles a single week', () => {
    expect(weekRange('2026-W07', '2026-W07')).toEqual(['2026-W07'])
  })

  it('returns nothing when the range runs backwards', () => {
    expect(weekRange('2026-W10', '2026-W04')).toEqual([])
  })

  it('accepts date keys as well as week ids', () => {
    expect(weekRange('2026-09-08', '2026-09-20')).toEqual(['2026-W37', '2026-W38'])
  })

  it('crosses a 53-week year correctly', () => {
    const range = weekRange('2020-W51', '2021-W02')
    expect(range).toEqual(['2020-W51', '2020-W52', '2020-W53', '2021-W01', '2021-W02'])
  })

  it('produces two years of weeks without gaps or repeats', () => {
    const range = weekRange('2024-W01', '2026-W01')
    expect(new Set(range).size).toBe(range.length)
    for (let i = 1; i < range.length; i++) {
      expect(weeksBetween(range[i - 1], range[i])).toBe(1)
    }
  })
})

describe('formatting', () => {
  it('formats weeks the way practice refers to them', () => {
    expect(formatWeek('2026-W37')).toBe('w/c 7 Sep 2026')
    expect(formatWeekRange('2026-W37')).toBe('7–13 Sep 2026')
    expect(formatWeekRange('2026-W40')).toBe('28 Sep – 4 Oct 2026')
  })

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0h')
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(390)).toBe('6h 30m')
    expect(formatDuration(480)).toBe('8h')
    expect(formatDuration(-5)).toBe('0h')
    expect(formatDuration(Number.NaN)).toBe('0h')
  })
})

describe('isoWeekOf', () => {
  it('reports the ISO year, which is not always the calendar year', () => {
    expect(isoWeekOf('2021-01-01')).toEqual({ year: 2020, week: 53, id: '2020-W53' })
    expect(isoWeekOf('2019-12-30')).toEqual({ year: 2020, week: 1, id: '2020-W01' })
  })
})
