import { beforeEach, describe, expect, it } from 'vitest'
import { canStoreSecrets, decryptSecret, encryptSecret, secretsMatch } from '@/lib/secrets'
import { filterEvents, htmlToText, spanWorkingDays } from '@/lib/ingest/events'
import type { RawSourceEvent } from '@/lib/ingest/events'
import { firstWindowFrom } from '@/lib/connectors/sync'
import { needsRenewal } from '@/lib/connectors/watch'
import type { CalendarConnection } from '@/lib/data'

const KEY = Buffer.alloc(32, 7).toString('base64')

describe('secrets at rest', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY
  })

  it('round-trips a token', () => {
    const token = 'ya29.a0AfH6SMB' + 'x'.repeat(200)
    expect(decryptSecret(encryptSecret(token))).toBe(token)
  })

  it('produces a different ciphertext every time', () => {
    // A fixed IV would let anyone with the database see which two accounts
    // hold the same token.
    const a = encryptSecret('same')
    const b = encryptSecret('same')
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe('same')
    expect(decryptSecret(b)).toBe('same')
  })

  it('refuses a tampered ciphertext rather than returning something wrong', () => {
    const blob = encryptSecret('original')
    const [version, iv, tag, body] = blob.split('.')
    const flipped = Buffer.from(body, 'base64')
    flipped[0] ^= 0xff
    const forged = [version, iv, tag, flipped.toString('base64')].join('.')
    expect(() => decryptSecret(forged)).toThrow()
  })

  it('refuses a blob from an unknown format version', () => {
    expect(() => decryptSecret('v9.a.b.c')).toThrow(/format/)
  })

  it('rejects a key that is not 32 bytes', () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64')
    expect(canStoreSecrets()).toBe(false)
    expect(() => encryptSecret('x')).toThrow(/32 bytes/)
  })

  it('reports itself unavailable with no key, rather than throwing at import', () => {
    delete process.env.ENCRYPTION_KEY
    expect(canStoreSecrets()).toBe(false)
  })

  it('accepts a hex key as well as base64', () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
    expect(canStoreSecrets()).toBe(true)
    expect(decryptSecret(encryptSecret('hi'))).toBe('hi')
  })
})

describe('comparing a webhook secret', () => {
  it('matches only an exact value', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true)
    expect(secretsMatch('abc', 'abd')).toBe(false)
    expect(secretsMatch('abc', 'abcd')).toBe(false)
  })

  it('never matches when either side is missing', () => {
    // A connection with no stored secret must not be syncable by anyone who
    // guesses a channel id and sends no token at all.
    expect(secretsMatch(null, null)).toBe(false)
    expect(secretsMatch('abc', null)).toBe(false)
    expect(secretsMatch(null, 'abc')).toBe(false)
    expect(secretsMatch('', '')).toBe(false)
  })
})

/** The shape a provider hands to the shared filter. */
function source(over: Partial<RawSourceEvent> = {}): RawSourceEvent {
  return {
    uid: 'microsoft:AAA',
    summary: 'Stage 3 design team meeting',
    description: null,
    location: null,
    attendees: [],
    organiser: null,
    cancelled: false,
    free: false,
    declined: false,
    recurring: false,
    occurrences: [{ date: '2026-04-13', minutes: 60, allDay: false }],
    ...over,
  }
}

describe('the rules, applied to any source', () => {
  it('keeps a real meeting and namespaces its id by date', () => {
    const { events } = filterEvents([source()])
    expect(events).toHaveLength(1)
    expect(events[0].uid).toBe('microsoft:AAA:2026-04-13')
    expect(events[0].minutes).toBe(60)
  })

  it('drops what did not happen, and says why once per event', () => {
    const weekly = { occurrences: Array.from({ length: 10 }, (_, i) => ({
      date: `2026-04-${String(13 + i).padStart(2, '0')}`, minutes: 60, allDay: false,
    })) }

    const declined = filterEvents([source({ declined: true, ...weekly })])
    expect(declined.events).toHaveLength(0)
    // One line on the review screen, not ten.
    expect(declined.skipped).toHaveLength(1)
    expect(declined.skipped[0].reason).toBe('you declined it')

    expect(filterEvents([source({ cancelled: true })]).skipped[0].reason).toBe('cancelled')
    expect(filterEvents([source({ free: true })]).skipped[0].reason).toBe('marked free')
    expect(filterEvents([source({ summary: 'Lunch' })]).skipped[0].reason).toBe('routine')
    expect(filterEvents([source({ summary: '' })]).skipped[0].reason).toBe('no title')
  })

  it('treats an all-day block as leave only when it says so', () => {
    const day = [{ date: '2026-04-13' as const, minutes: 0, allDay: true }]

    const marker = filterEvents([source({ summary: 'Team offsite', occurrences: day })])
    expect(marker.events).toHaveLength(0)
    expect(marker.skipped[0].reason).toBe('all-day marker')

    const leave = filterEvents([source({ summary: 'Annual leave', occurrences: day })])
    expect(leave.events).toHaveLength(1)
    expect(leave.events[0].leave).toBe(true)
    // A day of leave is booked as a standard working day, not as zero.
    expect(leave.events[0].minutes).toBe(450)
  })

  it('drops a five-minute slot but never a day of leave', () => {
    const brief = [{ date: '2026-04-13' as const, minutes: 5, allDay: false }]
    expect(filterEvents([source({ occurrences: brief })]).events).toHaveLength(0)
    expect(
      filterEvents([source({ summary: 'Sick day', occurrences: brief })]).events,
    ).toHaveLength(1)
  })

  it('leaves you and the meeting rooms off the list of people', () => {
    const { events } = filterEvents(
      [source({
        attendees: [
          { name: 'Sarah Chen', email: 'sarah.chen@practice.com' },
          { name: 'Me', email: 'me@practice.com' },
          { name: 'Studio 2', email: 'studio2@practice.com', resource: true },
          { name: null, email: 'tom.reed@engineers.com' },
          { name: null, email: 'info@contractor.com' },
        ],
      })],
      { email: 'me@practice.com' },
    )
    // The room, the user, and a mailbox nobody sits behind are all gone; the
    // one with no display name is recovered from the address.
    expect(events[0].attendees).toEqual(['Sarah Chen', 'Tom Reed'])
  })

  it('honours the window the caller asked for', () => {
    const spread = source({
      occurrences: [
        { date: '2026-03-01', minutes: 60, allDay: false },
        { date: '2026-04-13', minutes: 60, allDay: false },
        { date: '2026-05-30', minutes: 60, allDay: false },
      ],
    })
    const { events } = filterEvents([spread], { from: '2026-04-01', to: '2026-04-30' })
    expect(events.map((e) => e.date)).toEqual(['2026-04-13'])
  })
})

describe('a multi-day block', () => {
  it('covers every working day and leaves the weekend alone', () => {
    // 2026-04-13 is a Monday; the end is exclusive, so this is Mon-Fri.
    const days = spanWorkingDays('2026-04-13', '2026-04-18', 0)
    expect(days.map((d) => d.date)).toEqual([
      '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17',
    ])
  })

  it('still records the day when there is no end at all', () => {
    expect(spanWorkingDays('2026-04-13', null, 0).map((d) => d.date)).toEqual(['2026-04-13'])
  })

  it('cannot run away with a decade-long marker', () => {
    expect(spanWorkingDays('2026-04-13', '2036-04-13', 0).length).toBeLessThanOrEqual(62)
  })
})

describe('an Outlook invite body', () => {
  it('survives being HTML', () => {
    const html = '<html><head><style>p{color:red}</style></head><body>' +
      '<div>Reviewed the Stage 3 drawings with the structural engineer.</div>' +
      '<p>Agreed the transfer beam &amp; slab depth.</p></body></html>'
    const text = htmlToText(html)
    expect(text).toContain('Reviewed the Stage 3 drawings')
    expect(text).toContain('transfer beam & slab depth')
    expect(text).not.toContain('color:red')
    expect(text).not.toContain('<')
  })
})

describe('how far back a first sync reaches', () => {
  it('starts where the experience started, when that is recent enough', () => {
    expect(firstWindowFrom('2026-01-15', '2026-09-17')).toBe('2026-01-15')
  })

  it('does not walk back further than the floor for an old account', () => {
    // Connecting an account that started in 2019 must not be a thousand pages.
    expect(firstWindowFrom('2019-01-01', '2026-09-17') >= '2024-03-17').toBe(true)
  })

  it('falls back to a sensible window when no start date is set', () => {
    const from = firstWindowFrom(null, '2026-09-17')
    expect(from).toBe('2026-03-17')
  })
})

function connection(over: Partial<CalendarConnection> = {}): CalendarConnection {
  return { enabled: true, channelId: 'ch', channelExpiresAt: null, ...over } as CalendarConnection
}

describe('when a push subscription needs renewing', () => {
  const now = Date.parse('2026-09-17T12:00:00Z')

  it('renews one that is close to lapsing', () => {
    const soon = new Date(now + 6 * 60 * 60 * 1000).toISOString()
    expect(needsRenewal(connection({ channelExpiresAt: soon }), now)).toBe(true)
  })

  it('leaves one with plenty of time', () => {
    const later = new Date(now + 48 * 60 * 60 * 1000).toISOString()
    expect(needsRenewal(connection({ channelExpiresAt: later }), now)).toBe(false)
  })

  it('treats a missing or unreadable expiry as due', () => {
    expect(needsRenewal(connection({ channelExpiresAt: null }), now)).toBe(true)
    expect(needsRenewal(connection({ channelId: null }), now)).toBe(true)
    expect(needsRenewal(connection({ channelExpiresAt: 'not a date' }), now)).toBe(true)
  })

  it('leaves a paused connection alone', () => {
    expect(needsRenewal(connection({ enabled: false, channelExpiresAt: null }), now)).toBe(false)
  })
})
