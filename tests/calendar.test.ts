import { describe, expect, it } from 'vitest'
import { cleanDescription, defaultWindow, parseCalendar } from '@/lib/ingest/calendar'
import { calendarToEntries } from '@/lib/ingest'
import type { Project } from '@/lib/pedr/types'

const projects: Project[] = [
  {
    id: 'p-bat', userId: 'u1', code: '1042', name: 'Battersea Square Phase 2',
    client: 'BSQ Developments', sector: 'Residential', valueGbp: 48_000_000,
    procurement: 'Two stage D&B', contractForm: 'JCT D&B 2016', isCaseStudy: true,
    notes: null, aliases: ['BSQ', 'Battersea'], archived: false,
    createdAt: '2025-01-01T00:00:00Z',
  },
]

/** Wrap VEVENT bodies in the smallest valid calendar. */
function ics(...bodies: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//EN',
    ...bodies.map((b) => `BEGIN:VEVENT\n${b.trim()}\nEND:VEVENT`),
    'END:VCALENDAR',
  ].join('\n')
}

function event(over: Record<string, string> = {}): string {
  const fields: Record<string, string> = {
    UID: `uid-${Math.random().toString(36).slice(2)}`,
    DTSTAMP: '20260901T090000Z',
    DTSTART: '20260908T100000Z',
    DTEND: '20260908T113000Z',
    SUMMARY: 'Design team meeting 1042',
    ...over,
  }
  return Object.entries(fields)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}:${v}`)
    .join('\n')
}

const me = { email: 'hemant@practice.com', name: 'Hemant Jindal' }

// ---------------------------------------------------------------------------

describe('parseCalendar', () => {
  it('reads a plain meeting into date, length and title', () => {
    const parsed = parseCalendar(ics(event()))
    expect(parsed.events).toHaveLength(1)
    expect(parsed.events[0]).toMatchObject({
      date: '2026-09-08',
      minutes: 90,
      summary: 'Design team meeting 1042',
      allDay: false,
      leave: false,
    })
  })

  it('returns a usable message rather than throwing on rubbish input', () => {
    const parsed = parseCalendar('this is not a calendar')
    expect(parsed.events).toHaveLength(0)
    expect(parsed.warnings[0]).toMatch(/did not read as a calendar/i)
  })

  it('says so when the file is a calendar but has no events', () => {
    const parsed = parseCalendar('BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//T//EN\nEND:VCALENDAR')
    expect(parsed.warnings).toEqual(['No events in that calendar.'])
  })

  it('reports the span of what it found', () => {
    const parsed = parseCalendar(ics(
      event({ DTSTART: '20260907T090000Z', DTEND: '20260907T100000Z', SUMMARY: 'Stage 4 review' }),
      event({ DTSTART: '20260911T090000Z', DTEND: '20260911T100000Z', SUMMARY: 'Site visit 1042' }),
    ))
    expect(parsed.range).toEqual({ from: '2026-09-07', to: '2026-09-11' })
  })
})

describe('parseCalendar filtering', () => {
  it('drops cancelled meetings', () => {
    const parsed = parseCalendar(ics(event({ STATUS: 'CANCELLED' })))
    expect(parsed.events).toHaveLength(0)
    expect(parsed.skipped[0].reason).toBe('cancelled')
  })

  it('drops meetings you declined', () => {
    const parsed = parseCalendar(
      ics(event({ 'ATTENDEE;PARTSTAT=DECLINED;CN=Hemant Jindal': 'mailto:hemant@practice.com' })),
      me,
    )
    expect(parsed.events).toHaveLength(0)
    expect(parsed.skipped[0].reason).toBe('you declined it')
  })

  it('keeps meetings you accepted', () => {
    const parsed = parseCalendar(
      ics(event({ 'ATTENDEE;PARTSTAT=ACCEPTED;CN=Hemant Jindal': 'mailto:hemant@practice.com' })),
      me,
    )
    expect(parsed.events).toHaveLength(1)
  })

  it('drops anything marked free', () => {
    const transparent = parseCalendar(ics(event({ TRANSP: 'TRANSPARENT' })))
    expect(transparent.events).toHaveLength(0)
    const outlook = parseCalendar(ics(event({ 'X-MICROSOFT-CDO-BUSYSTATUS': 'FREE' })))
    expect(outlook.events).toHaveLength(0)
    expect(outlook.skipped[0].reason).toBe('marked free')
  })

  it('drops the routine furniture of a working week', () => {
    const parsed = parseCalendar(ics(
      event({ SUMMARY: 'Lunch' }),
      event({ SUMMARY: 'Focus time' }),
      event({ SUMMARY: 'Daily standup' }),
      event({ SUMMARY: 'HOLD - do not book' }),
      event({ SUMMARY: 'Dentist' }),
      event({ SUMMARY: 'Stage 4 coordination workshop' }),
    ))
    expect(parsed.events.map((e) => e.summary)).toEqual(['Stage 4 coordination workshop'])
    expect(parsed.skipped).toHaveLength(5)
  })

  it('accepts extra things to ignore', () => {
    const parsed = parseCalendar(ics(event({ SUMMARY: 'Timesheet reminder' })), {
      ignore: ['timesheet reminder'],
    })
    expect(parsed.events).toHaveLength(0)
  })

  it('does not let a noise word fire inside a longer word', () => {
    // "hold" inside "Leaseholder", "break" inside "Breakout".
    const parsed = parseCalendar(ics(
      event({ SUMMARY: 'Leaseholder consultation' }),
      event({ SUMMARY: 'Breakout session on the facade package' }),
    ))
    expect(parsed.events).toHaveLength(2)
  })

  it('drops events shorter than the floor', () => {
    const parsed = parseCalendar(ics(
      event({ DTSTART: '20260908T100000Z', DTEND: '20260908T100500Z', SUMMARY: 'Quick sync on 1042' }),
    ))
    expect(parsed.events).toHaveLength(0)
    expect(parsed.skipped[0].reason).toBe('under 15 minutes')
  })

  it('honours a date window', () => {
    const parsed = parseCalendar(
      ics(
        event({ DTSTART: '20260601T090000Z', DTEND: '20260601T100000Z', SUMMARY: 'Old workshop' }),
        event({ DTSTART: '20260908T090000Z', DTEND: '20260908T100000Z', SUMMARY: 'Recent workshop' }),
      ),
      { from: '2026-09-01', to: '2026-09-30' },
    )
    expect(parsed.events.map((e) => e.summary)).toEqual(['Recent workshop'])
  })

  it('warns when everything was filtered away', () => {
    const parsed = parseCalendar(ics(event({ SUMMARY: 'Lunch' }), event({ SUMMARY: 'Coffee' })))
    expect(parsed.warnings[0]).toMatch(/filtered out/i)
  })
})

describe('parseCalendar and all-day events', () => {
  it('drops an all-day block that is not leave', () => {
    const parsed = parseCalendar(ics(
      event({ 'DTSTART;VALUE=DATE': '20260908', 'DTEND;VALUE=DATE': '20260909', DTSTART: '', DTEND: '', SUMMARY: 'Design week' }),
    ))
    expect(parsed.events).toHaveLength(0)
    expect(parsed.skipped[0].reason).toBe('all-day marker')
  })

  it('keeps all-day leave, as a standard day', () => {
    const parsed = parseCalendar(ics(
      event({ 'DTSTART;VALUE=DATE': '20260908', 'DTEND;VALUE=DATE': '20260909', DTSTART: '', DTEND: '', SUMMARY: 'Annual leave' }),
    ))
    expect(parsed.events).toHaveLength(1)
    expect(parsed.events[0]).toMatchObject({ leave: true, allDay: true, minutes: 450 })
  })

  it('spreads a week off across its working days', () => {
    // Monday 10 to Friday 14 August 2026. An .ics end date is exclusive.
    const parsed = parseCalendar(ics(
      event({
        'DTSTART;VALUE=DATE': '20260810', 'DTEND;VALUE=DATE': '20260815',
        DTSTART: '', DTEND: '', SUMMARY: 'Annual leave',
      }),
    ))
    expect(parsed.events.map((e) => e.date)).toEqual([
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
    ])
    expect(parsed.events.every((e) => e.leave && e.minutes === 450)).toBe(true)
  })

  it('leaves the weekend out of a block that spans one', () => {
    // Friday 14 August to Tuesday 18 August.
    const parsed = parseCalendar(ics(
      event({
        'DTSTART;VALUE=DATE': '20260814', 'DTEND;VALUE=DATE': '20260819',
        DTSTART: '', DTEND: '', SUMMARY: 'Annual leave',
      }),
    ))
    expect(parsed.events.map((e) => e.date)).toEqual([
      '2026-08-14', '2026-08-17', '2026-08-18',
    ])
  })

  it('gives each day of a block its own id', () => {
    const parsed = parseCalendar(ics(
      event({
        UID: 'leave-1', 'DTSTART;VALUE=DATE': '20260810', 'DTEND;VALUE=DATE': '20260813',
        DTSTART: '', DTEND: '', SUMMARY: 'Annual leave',
      }),
    ))
    expect(new Set(parsed.events.map((e) => e.uid)).size).toBe(3)
  })

  it('recognises the ways people write absence', () => {
    const parsed = parseCalendar(ics(
      event({ SUMMARY: 'OOO' }),
      event({ SUMMARY: 'Bank holiday' }),
      event({ SUMMARY: 'Off sick' }),
      event({ SUMMARY: 'TOIL' }),
    ))
    expect(parsed.events).toHaveLength(4)
    expect(parsed.events.every((e) => e.leave)).toBe(true)
  })
})

describe('parseCalendar and people', () => {
  it('reads attendees as names, never addresses', () => {
    const parsed = parseCalendar(
      ics(event({
        'ATTENDEE;CN=Sarah Chen': 'mailto:sarah.chen@practice.com',
        'ATTENDEE;CN=': 'mailto:tom.reilly@mace.com',
      })),
      me,
    )
    expect(parsed.events[0].attendees).toEqual(['Sarah Chen', 'Tom Reilly'])
  })

  it('leaves you out of your own meeting', () => {
    const parsed = parseCalendar(
      ics(event({
        'ATTENDEE;CN=Hemant Jindal': 'mailto:hemant@practice.com',
        'ATTENDEE;CN=Sarah Chen': 'mailto:sarah.chen@practice.com',
      })),
      me,
    )
    expect(parsed.events[0].attendees).toEqual(['Sarah Chen'])
  })

  it('leaves out rooms and equipment', () => {
    const parsed = parseCalendar(ics(event({
      'ATTENDEE;CUTYPE=ROOM;CN=Meeting Room 3': 'mailto:room3@practice.com',
      'ATTENDEE;CUTYPE=RESOURCE;CN=Projector': 'mailto:av@practice.com',
      'ATTENDEE;CN=Sarah Chen': 'mailto:sarah.chen@practice.com',
    })))
    expect(parsed.events[0].attendees).toEqual(['Sarah Chen'])
  })

  it('caps the guest list so one all-hands does not flood a record', () => {
    const attendees: Record<string, string> = {}
    for (let i = 0; i < 30; i++) {
      attendees[`ATTENDEE;CN=Person ${String.fromCharCode(65 + i)}`] = `mailto:p${i}@practice.com`
    }
    const parsed = parseCalendar(ics(event(attendees)), { maxAttendees: 8 })
    expect(parsed.events[0].attendees).toHaveLength(8)
  })

  it('reads the organiser, unless it is you', () => {
    const theirs = parseCalendar(
      ics(event({ 'ORGANIZER;CN=Sarah Chen': 'mailto:sarah.chen@practice.com' })),
      me,
    )
    expect(theirs.events[0].organiser).toBe('Sarah Chen')

    const mine = parseCalendar(
      ics(event({ 'ORGANIZER;CN=Hemant Jindal': 'mailto:hemant@practice.com' })),
      me,
    )
    expect(mine.events[0].organiser).toBeNull()
  })

  it('does not invent a name from an address it cannot read', () => {
    const parsed = parseCalendar(ics(event({ 'ATTENDEE;CN=': 'mailto:info@practice.com' })))
    // "info" is a single short word, not a person.
    expect(parsed.events[0].attendees).toEqual([])
  })
})

describe('parseCalendar and recurrence', () => {
  it('expands a weekly meeting across the window', () => {
    const parsed = parseCalendar(
      ics(event({
        DTSTART: '20260907T090000Z',
        DTEND: '20260907T100000Z',
        RRULE: 'FREQ=WEEKLY;COUNT=4',
        SUMMARY: 'Client progress meeting 1042',
      })),
      { from: '2026-09-01', to: '2026-09-30' },
    )
    expect(parsed.events.map((e) => e.date)).toEqual([
      '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28',
    ])
    expect(parsed.events.every((e) => e.recurring)).toBe(true)
  })

  it('does not run away on a rule with no end', () => {
    const parsed = parseCalendar(
      ics(event({
        DTSTART: '20260907T090000Z',
        DTEND: '20260907T100000Z',
        RRULE: 'FREQ=DAILY',
        SUMMARY: 'Package coordination call',
      })),
      { from: '2026-09-01', to: '2026-09-30' },
    )
    // 7 September to the end of the month, and not a day past the window.
    expect(parsed.events).toHaveLength(24)
    expect(parsed.events.at(-1)!.date).toBe('2026-09-30')
  })

  it('gives each occurrence its own id', () => {
    const parsed = parseCalendar(
      ics(event({
        UID: 'weekly-1', DTSTART: '20260907T090000Z', DTEND: '20260907T100000Z',
        RRULE: 'FREQ=WEEKLY;COUNT=3', SUMMARY: 'Client progress meeting 1042',
      })),
      { from: '2026-09-01', to: '2026-09-30' },
    )
    expect(new Set(parsed.events.map((e) => e.uid)).size).toBe(3)
  })

  it('warns when the import is mostly recurring meetings', () => {
    const parsed = parseCalendar(
      ics(event({
        DTSTART: '20260901T090000Z', DTEND: '20260901T100000Z',
        RRULE: 'FREQ=DAILY;COUNT=20', SUMMARY: 'Package coordination call',
      })),
      { from: '2026-09-01', to: '2026-09-30' },
    )
    expect(parsed.warnings.some((w) => /recurring/i.test(w))).toBe(true)
  })
})

describe('calendar dates', () => {
  it('files an event on its own local day, not the UTC one', () => {
    // 08:00 in Sydney on the 9th is 22:00 UTC on the 8th. It was still the 9th
    // for the person who attended it.
    const parsed = parseCalendar([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//EN',
      'BEGIN:VTIMEZONE',
      'TZID:Australia/Sydney',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+1000',
      'TZOFFSETTO:+1000',
      'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'UID:syd-1',
      'DTSTAMP:20260901T090000Z',
      'DTSTART;TZID=Australia/Sydney:20260909T080000',
      'DTEND;TZID=Australia/Sydney:20260909T090000',
      'SUMMARY:Early handover call on 1042',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n'))
    expect(parsed.events[0].date).toBe('2026-09-09')
  })
})

describe('cleanDescription', () => {
  it('strips the Teams join boilerplate out of an invite body', () => {
    const body = [
      'Agenda: review the curtain wall package and agree the fire strategy.',
      '________________________________________________________________________________',
      'Microsoft Teams Need help?',
      'Join the meeting now',
      'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc',
      'Meeting ID: 123 456 789',
      'Passcode: aBc123',
      'Dial in by phone',
      '+44 20 7946 0000,,123456789# United Kingdom, London',
      'Phone Conference ID: 123 456 789#',
    ].join('\n')
    expect(cleanDescription(body)).toBe(
      'Agenda: review the curtain wall package and agree the fire strategy.',
    )
  })

  it('returns nothing when the body was only boilerplate', () => {
    expect(cleanDescription('Join the meeting now\nhttps://teams.microsoft.com/x')).toBeNull()
    expect(cleanDescription('')).toBeNull()
    expect(cleanDescription(null)).toBeNull()
  })
})

describe('defaultWindow', () => {
  it('looks back three months by default and includes today', () => {
    expect(defaultWindow('2026-09-09')).toEqual({ from: '2026-06-09', to: '2026-09-10' })
  })

  it('takes a longer look back', () => {
    expect(defaultWindow('2026-09-09', 12).from).toBe('2025-09-09')
  })
})

// ---------------------------------------------------------------------------

describe('calendarToEntries', () => {
  const opts = { projects, reference: '2026-09-11' as const }

  it('trusts the date and the length, but not the meaning', () => {
    const parsed = parseCalendar(ics(event({
      SUMMARY: 'Stage 4 technical design review 1042',
      DTSTART: '20260908T100000Z',
      DTEND: '20260908T120000Z',
    })))
    const [entry] = calendarToEntries(parsed, opts)
    expect(entry.date).toBe('2026-09-08')
    expect(entry.minutes).toBe(120)
    expect(entry.minutesEstimated).toBe(false)
    expect(entry.source).toBe('calendar')
    // Never certain: a title is not a description of work.
    expect(entry.confidence).toBeLessThanOrEqual(0.85)
  })

  it('matches the job number in a meeting title to a project', () => {
    const parsed = parseCalendar(ics(event({ SUMMARY: 'Design team meeting 1042' })))
    const [entry] = calendarToEntries(parsed, opts)
    expect(entry.projectId).toBe('p-bat')
  })

  it('picks up the RIBA stage from the title', () => {
    const parsed = parseCalendar(ics(event({
      SUMMARY: 'Planning submission review 1042',
    })))
    const [entry] = calendarToEntries(parsed, opts)
    expect(entry.stage).toBe(3)
  })

  it('takes people from the invite and never from the title', () => {
    // "Nine Elms" is a place, and it was being filed as a colleague.
    const parsed = parseCalendar(ics(event({
      SUMMARY: 'Site visit Nine Elms 1088', LOCATION: 'Nine Elms, SW8',
    })))
    const [entry] = calendarToEntries(parsed, opts)
    expect(entry.people).toEqual([])
  })

  it('still uses the location to work out the stage', () => {
    const parsed = parseCalendar(ics(event({
      SUMMARY: 'Weekly walkround 1042', LOCATION: 'On site, Battersea Square',
    })))
    const [entry] = calendarToEntries(parsed, opts)
    expect(entry.stage).toBe(5)
  })

  it('puts everyone in the room on the record', () => {
    const parsed = parseCalendar(
      ics(event({
        SUMMARY: 'Design team meeting 1042',
        'ORGANIZER;CN=Sarah Chen': 'mailto:sarah.chen@practice.com',
        'ATTENDEE;CN=Tom Reilly': 'mailto:tom.reilly@mace.com',
      })),
      me,
    )
    const [entry] = calendarToEntries(parsed, opts)
    expect(entry.people).toEqual(expect.arrayContaining(['Sarah Chen', 'Tom Reilly']))
  })

  it('records leave without classifying it as experience', () => {
    const parsed = parseCalendar(ics(event({
      'DTSTART;VALUE=DATE': '20260908', 'DTEND;VALUE=DATE': '20260909',
      DTSTART: '', DTEND: '', SUMMARY: 'Annual leave',
    })))
    const [entry] = calendarToEntries(parsed, opts)
    expect(entry.officeCategory).toBe('leave')
    expect(entry.stage).toBeNull()
    expect(entry.criteria).toEqual([])
    expect(entry.projectId).toBeNull()
    // We assumed a working day's length; that must show as an assumption.
    expect(entry.minutesEstimated).toBe(true)
  })

  it('holds a one-word meeting back for review', () => {
    const parsed = parseCalendar(ics(event({ SUMMARY: 'Catch-up' })))
    const [entry] = calendarToEntries(parsed, opts)
    expect(entry.confidence).toBeLessThan(0.55)
  })

  it('keeps the title as the activity and cites where it came from', () => {
    const parsed = parseCalendar(ics(event({
      SUMMARY: 'Site visit 1042', LOCATION: 'Battersea Square, SW11',
    })))
    const [entry] = calendarToEntries(parsed, opts)
    expect(entry.activity).toBe('Site visit 1042')
    expect(entry.provenance).toBe('calendar: Site visit 1042 (Battersea Square, SW11)')
  })
})
