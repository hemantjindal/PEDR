import type { CriterionId, StageId } from '@/lib/pedr/constants'
import type { Employment, Entry, WeekNote } from '@/lib/pedr/types'
import type { DateKey, WeekId } from '@/lib/pedr/week'
import { weekStartKey, addDays } from '@/lib/pedr/week'

let seq = 0

export function entry(over: Partial<Entry> & { date: DateKey }): Entry {
  seq += 1
  return {
    id: `e${seq}`,
    userId: 'u1',
    dumpId: null,
    minutes: 240,
    minutesEstimated: false,
    projectId: 'p1',
    projectHint: null,
    stage: 4 as StageId,
    officeCategory: null,
    activity: 'Issued RFI response on the curtain wall head detail',
    detail: null,
    people: ['Sarah Chen'],
    criteria: ['PC5'] as CriterionId[],
    wentWrong: null,
    learned: null,
    confidence: 0.9,
    source: 'manual',
    verified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

/** An entry on the Monday of the given ISO week. */
export function entryInWeek(weekId: WeekId, over: Partial<Entry> = {}): Entry {
  return entry({ date: weekStartKey(weekId), ...over })
}

/** A full, well-formed week: two specific activities, people, and friction. */
export function goodWeek(weekId: WeekId, over: Partial<Entry> = {}): Entry[] {
  const monday = weekStartKey(weekId)
  return [
    entry({
      date: monday,
      activity: 'Issued RFI response on the curtain wall head detail',
      people: ['Sarah Chen'],
      wentWrong: 'Sent the wrong revision and had to reissue within the hour.',
      ...over,
    }),
    entry({
      date: addDays(monday, 2),
      activity: 'Chaired the design team meeting on the atrium roof build-up',
      people: ['Tom Reilly'],
      stage: 3 as StageId,
      criteria: ['PC2'] as CriterionId[],
      ...over,
    }),
  ]
}

export function note(weekId: WeekId, over: Partial<WeekNote> = {}): WeekNote {
  return {
    userId: 'u1',
    weekId,
    did: '',
    learned: '',
    wentWell: '',
    wentWrong: '',
    next: '',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

export function employment(over: Partial<Employment> = {}): Employment {
  return {
    id: 'emp1',
    userId: 'u1',
    employer: 'Foster + Partners',
    officeLocation: 'London',
    location: 'UK',
    category: 'i',
    role: 'Architectural Assistant',
    supervisorName: 'A. Supervisor',
    supervisorRegBody: 'ARB',
    supervisorRegNumber: '000000A',
    mentorName: null,
    mentorEmail: null,
    startDate: '2024-01-01',
    endDate: null,
    weeklyHours: 37.5,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...over,
  }
}
