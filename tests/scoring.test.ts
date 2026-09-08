import { describe, expect, it } from 'vitest'
import {
  bestStreak, currentStreak, findGaps, findThinWeeks, groupEntriesByWeek, hasSubstance,
  isSpecificActivity, rollUpByMonth, rollUpByQuarter, scoreWeek, scoreWeeks,
} from '@/lib/pedr/scoring'
import { entry, entryInWeek, goodWeek, note } from './helpers'
import { weekStartKey } from '@/lib/pedr/week'

const W = '2026-W10'

function componentEarned(score: ReturnType<typeof scoreWeek>, id: string) {
  return score.components.find((c) => c.id === id)?.earned ?? -1
}

describe('hasSubstance', () => {
  it('rejects placeholders that look like answers', () => {
    for (const junk of ['', '  ', 'n/a', 'N/A', 'none', 'nothing', '-', 'tbc', 'see above']) {
      expect(hasSubstance(junk)).toBe(false)
    }
    expect(hasSubstance(null)).toBe(false)
    expect(hasSubstance(undefined)).toBe(false)
  })

  it('requires enough words to say something', () => {
    expect(hasSubstance('too short', 3)).toBe(false)
    expect(hasSubstance('three words here', 3)).toBe(true)
    expect(hasSubstance('!!! ???', 1)).toBe(false)
  })
})

describe('isSpecificActivity', () => {
  it('rejects the stock non-answers', () => {
    for (const vague of [
      'worked on drawings', 'drawings', 'CAD', 'admin', 'general work',
      'various tasks', 'meetings', 'same as last week', 'busy',
    ]) {
      expect(isSpecificActivity(vague), vague).toBe(false)
    }
  })

  it('rejects padding around a non-answer', () => {
    expect(isSpecificActivity('worked on drawings again today')).toBe(false)
  })

  it('accepts something an examiner could ask about', () => {
    for (const good of [
      'Issued RFI response on the curtain wall head detail',
      'Marked up contractor shop drawings for the stair balustrade',
      'Drafted the Stage 3 planning submission cover letter',
    ]) {
      expect(isSpecificActivity(good), good).toBe(true)
    }
  })
})

describe('scoreWeek', () => {
  it('scores an empty week zero and bands it missing', () => {
    const score = scoreWeek(W, [])
    expect(score.score).toBe(0)
    expect(score.band).toBe('missing')
    expect(score.nextBestAction).toMatch(/Log even one line/)
  })

  it('gives a complete week full marks', () => {
    const score = scoreWeek(W, goodWeek(W))
    expect(score.score).toBe(100)
    expect(score.band).toBe('strong')
    expect(score.nextBestAction).toBeNull()
  })

  it('caps a frictionless week at 80 — the whole point of the weighting', () => {
    const entries = goodWeek(W).map((e) => ({ ...e, wentWrong: null }))
    const score = scoreWeek(W, entries)
    expect(score.score).toBe(80)
    expect(componentEarned(score, 'wentWrong')).toBe(0)
    expect(score.nextBestAction).toMatch(/went wrong/)
  })

  it('does not accept "n/a" as reflection', () => {
    const entries = goodWeek(W).map((e) => ({ ...e, wentWrong: 'n/a' }))
    expect(scoreWeek(W, entries).score).toBe(80)
  })

  it('accepts friction written in the week note instead of an entry', () => {
    const entries = goodWeek(W).map((e) => ({ ...e, wentWrong: null }))
    const score = scoreWeek(W, entries, note(W, { wentWrong: 'Misread the drawing register and issued an old revision.' }))
    expect(score.score).toBe(100)
  })

  it('needs two specific activities, not one repeated', () => {
    const monday = weekStartKey(W)
    const same = 'Issued RFI response on the curtain wall head detail'
    const score = scoreWeek(W, [
      entry({ date: monday, activity: same }),
      entry({ date: monday, activity: same }),
    ])
    expect(componentEarned(score, 'activities')).toBe(0)
    const fix = score.components.find((c) => c.id === 'activities')?.fix
    expect(fix).toMatch(/second specific activity/)
  })

  it('gives no activity credit for vague text however much of it there is', () => {
    const monday = weekStartKey(W)
    const score = scoreWeek(W, [
      entry({ date: monday, activity: 'worked on drawings' }),
      entry({ date: monday, activity: 'admin' }),
      entry({ date: monday, activity: 'meetings' }),
    ])
    expect(componentEarned(score, 'activities')).toBe(0)
  })

  it('counts an unmatched project hint as naming a project', () => {
    const score = scoreWeek(W, [
      entryInWeek(W, { projectId: null, projectHint: 'Battersea' }),
    ])
    expect(componentEarned(score, 'projects')).toBe(15)
  })

  it('gives nothing for a project when neither id nor hint is present', () => {
    const score = scoreWeek(W, [entryInWeek(W, { projectId: null, projectHint: null })])
    expect(componentEarned(score, 'projects')).toBe(0)
  })

  it('scores a week that has only a note, no entries', () => {
    const score = scoreWeek(W, [], note(W, {
      did: 'Ran the site inspection and wrote it up.',
      wentWrong: 'Missed the drainage connection detail entirely.',
    }))
    expect(score.score).toBe(60) // logged + wentWrong
    expect(score.entryCount).toBe(0)
  })

  it('reports the stages and criteria it saw, sorted and deduplicated', () => {
    const score = scoreWeek(W, goodWeek(W))
    expect(score.stages).toEqual([3, 4])
    expect(score.criteria).toEqual(['PC2', 'PC5'])
  })

  it('sums minutes across the week', () => {
    expect(scoreWeek(W, goodWeek(W)).minutes).toBe(480)
  })
})

describe('scoreWeeks', () => {
  it('scores empty weeks in the span, because absence is the point', () => {
    const scores = scoreWeeks('2026-W10', '2026-W13', goodWeek('2026-W11'))
    expect(scores.map((s) => s.weekId)).toEqual(['2026-W10', '2026-W11', '2026-W12', '2026-W13'])
    expect(scores.map((s) => s.score)).toEqual([0, 100, 0, 0])
  })

  it('files each entry into the week its date falls in', () => {
    const grouped = groupEntriesByWeek([
      entry({ date: '2026-01-04' }), // Sunday — still 2026-W01
      entry({ date: '2026-01-05' }), // Monday — 2026-W02
    ])
    expect([...grouped.keys()].sort()).toEqual(['2026-W01', '2026-W02'])
  })
})

describe('gaps', () => {
  const scores = scoreWeeks('2026-W01', '2026-W10', [
    ...goodWeek('2026-W01'),
    ...goodWeek('2026-W05'),
    ...goodWeek('2026-W10'),
  ])

  it('reports runs of empty weeks, not a list of ids', () => {
    const gaps = findGaps(scores)
    expect(gaps).toHaveLength(2)
    expect(gaps[0]).toMatchObject({ from: '2026-W02', to: '2026-W04', count: 3 })
    expect(gaps[1]).toMatchObject({ from: '2026-W06', to: '2026-W09', count: 4 })
  })

  it('finds nothing when every week is logged', () => {
    const full = scoreWeeks('2026-W01', '2026-W03', [
      ...goodWeek('2026-W01'), ...goodWeek('2026-W02'), ...goodWeek('2026-W03'),
    ])
    expect(findGaps(full)).toEqual([])
  })

  it('treats a whole empty span as one gap', () => {
    expect(findGaps(scoreWeeks('2026-W01', '2026-W04', []))).toEqual([
      { from: '2026-W01', to: '2026-W04', weeks: ['2026-W01', '2026-W02', '2026-W03', '2026-W04'], count: 4 },
    ])
  })

  it('separates thin weeks from missing ones', () => {
    const mixed = scoreWeeks('2026-W01', '2026-W02', [
      entryInWeek('2026-W01', { activity: 'admin', people: [], wentWrong: null }),
    ])
    expect(findGaps(mixed).map((g) => g.from)).toEqual(['2026-W02'])
    expect(findThinWeeks(mixed).map((w) => w.weekId)).toEqual(['2026-W01'])
  })
})

describe('streaks', () => {
  it('counts back from the last completed week', () => {
    const scores = scoreWeeks('2026-W01', '2026-W06', [
      ...goodWeek('2026-W03'), ...goodWeek('2026-W04'), ...goodWeek('2026-W05'),
    ])
    // W06 is the current, still-empty week, so it does not break the streak.
    expect(currentStreak(scores)).toBe(3)
  })

  it('is zero when the last two weeks are both empty', () => {
    const scores = scoreWeeks('2026-W01', '2026-W06', [...goodWeek('2026-W01')])
    expect(currentStreak(scores)).toBe(0)
  })

  it('remembers the best run', () => {
    const scores = scoreWeeks('2026-W01', '2026-W08', [
      ...goodWeek('2026-W01'), ...goodWeek('2026-W02'), ...goodWeek('2026-W03'),
      ...goodWeek('2026-W06'),
    ])
    expect(bestStreak(scores)).toBe(3)
  })
})

describe('rollups', () => {
  it('averages a month over every week in it, not just the logged ones', () => {
    // 2026-W06..W09 all sit in February 2026.
    const scores = scoreWeeks('2026-W06', '2026-W09', [...goodWeek('2026-W06'), ...goodWeek('2026-W07')])
    const feb = rollUpByMonth(scores).find((m) => m.monthKey === '2026-02')
    expect(feb).toBeDefined()
    expect(feb!.weeksLogged).toBe(2)
    expect(feb!.weeksMissing).toBe(2)
    expect(feb!.averageScore).toBe(50) // (100+100+0+0)/4
  })

  it('assigns a split week to the month holding most of it', () => {
    // 2026-W05 runs Mon 26 Jan – Sun 1 Feb: four days in January.
    const months = rollUpByMonth(scoreWeeks('2026-W05', '2026-W05', goodWeek('2026-W05')))
    expect(months.map((m) => m.monthKey)).toEqual(['2026-01'])
  })

  it('chunks weeks into 13-week quarters', () => {
    const scores = scoreWeeks('2026-W01', '2026-W26', [])
    const quarters = rollUpByQuarter(scores)
    expect(quarters).toHaveLength(2)
    expect(quarters[0].weeks).toHaveLength(13)
    expect(quarters[1].weeks).toHaveLength(13)
  })

  it('keeps a short trailing quarter rather than dropping it', () => {
    const quarters = rollUpByQuarter(scoreWeeks('2026-W01', '2026-W15', []))
    expect(quarters).toHaveLength(2)
    expect(quarters[1].weeks).toHaveLength(2)
  })
})

describe('nextBestAction', () => {
  it('names the most valuable missing thing first, not the first missing thing', () => {
    // Missing both a second activity (15) and any friction (20): friction wins.
    const monday = weekStartKey(W)
    const score = scoreWeek(W, [
      entry({ date: monday, activity: 'Issued RFI response on the curtain wall head detail', wentWrong: null }),
    ])
    expect(score.nextBestAction).toMatch(/went wrong/)
  })

  it('falls through to the next gap once friction is recorded', () => {
    const monday = weekStartKey(W)
    const score = scoreWeek(W, [
      entry({
        date: monday,
        activity: 'Issued RFI response on the curtain wall head detail',
        wentWrong: 'Issued against a superseded structural grid.',
      }),
    ])
    expect(score.nextBestAction).toMatch(/second specific activity/)
  })
})
