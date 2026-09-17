import { afterEach, describe, expect, it, vi } from 'vitest'
import { google } from '@/lib/connectors/google'
import { microsoft } from '@/lib/connectors/microsoft'
import { ProviderError } from '@/lib/connectors/types'

/**
 * The two adapters, driven through their real fetch path.
 *
 * `toSource` is deliberately not exported — testing it directly would prove the
 * mapping and nothing about paging, delta links, or the way each provider
 * reports a deletion, which is where the mistakes actually are.
 */

const WINDOW = { from: '2026-04-01' as const, to: '2026-04-30' as const }

interface Stub {
  match: string
  body: unknown
  status?: number
}

/** Answer each request with the first stub whose fragment appears in the URL. */
function stubFetch(stubs: Stub[]): { calls: string[] } {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push(url)
    const stub = stubs.find((s) => url.includes(s.match))
    if (!stub) throw new Error(`No stub for ${url}`)
    return new Response(JSON.stringify(stub.body), {
      status: stub.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { calls }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Microsoft Graph', () => {
  const timeZone = { match: '/mailboxSettings/timeZone', body: { value: 'GMT Standard Time' } }

  it('reads a page, follows the next link, and keeps the delta link', async () => {
    const { calls } = stubFetch([
      timeZone,
      {
        match: 'calendarView/delta?',
        body: {
          value: [
            {
              id: 'EVENT-1',
              subject: 'Stage 3 design team meeting',
              start: { dateTime: '2026-04-13T09:00:00.0000000', timeZone: 'GMT Standard Time' },
              end: { dateTime: '2026-04-13T10:30:00.0000000', timeZone: 'GMT Standard Time' },
              isAllDay: false,
              showAs: 'busy',
              responseStatus: { response: 'accepted' },
              organizer: { emailAddress: { name: 'Sarah Chen', address: 'sarah.chen@practice.com' } },
              attendees: [
                { type: 'required', emailAddress: { name: 'Tom Reed', address: 'tom@engineers.com' } },
                { type: 'resource', emailAddress: { name: 'Studio 2', address: 'studio2@practice.com' } },
              ],
              body: { contentType: 'html', content: '<p>Reviewed the transfer beam.</p>' },
            },
          ],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/page2',
        },
      },
      {
        match: '/page2',
        body: {
          value: [{ id: 'EVENT-2', '@removed': { reason: 'deleted' } }],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/delta-next',
        },
      },
    ])

    const result = await microsoft.fetchEvents({
      accessToken: 'token',
      calendarId: 'primary',
      window: WINDOW,
      cursor: null,
    })

    expect(result.sources).toHaveLength(1)
    const [event] = result.sources
    expect(event.uid).toBe('microsoft:EVENT-1')
    expect(event.occurrences).toEqual([{ date: '2026-04-13', minutes: 90, allDay: false }])
    expect(event.organiser).toEqual({ name: 'Sarah Chen', email: 'sarah.chen@practice.com' })
    expect(event.attendees.find((a) => a.email === 'studio2@practice.com')?.resource).toBe(true)
    expect(event.description).toContain('Reviewed the transfer beam.')

    expect(result.removedIds).toEqual(['EVENT-2'])
    expect(result.cursor).toBe('https://graph.microsoft.com/v1.0/delta-next')

    // The mailbox zone is asked for, so a 09:00 meeting stays on the 13th.
    expect(calls.some((c) => c.includes('mailboxSettings'))).toBe(true)
  })

  it('asks for the window it was given, in the calendar view', async () => {
    const { calls } = stubFetch([
      timeZone,
      { match: 'calendarView/delta?', body: { value: [], '@odata.deltaLink': 'next' } },
    ])
    await microsoft.fetchEvents({
      accessToken: 'token', calendarId: 'primary', window: WINDOW, cursor: null,
    })
    const request = calls.find((c) => c.includes('calendarView/delta'))!
    expect(request).toContain('startDateTime=2026-04-01')
    expect(request).toContain('endDateTime=2026-04-30')
  })

  it('reads an all-day block as every working day it covers', async () => {
    stubFetch([
      timeZone,
      {
        match: 'calendarView/delta?',
        body: {
          value: [{
            id: 'LEAVE-1',
            subject: 'Annual leave',
            isAllDay: true,
            start: { dateTime: '2026-04-13T00:00:00.0000000' },
            end: { dateTime: '2026-04-18T00:00:00.0000000' },
            showAs: 'oof',
          }],
          '@odata.deltaLink': 'next',
        },
      },
    ])
    const result = await microsoft.fetchEvents({
      accessToken: 'token', calendarId: 'primary', window: WINDOW, cursor: null,
    })
    expect(result.sources[0].occurrences.map((o) => o.date)).toEqual([
      '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17',
    ])
  })

  it('marks a declined meeting, and one shown as free', async () => {
    stubFetch([
      timeZone,
      {
        match: 'calendarView/delta?',
        body: {
          value: [
            {
              id: 'A', subject: 'Thing', showAs: 'busy',
              responseStatus: { response: 'declined' },
              start: { dateTime: '2026-04-13T09:00:00' }, end: { dateTime: '2026-04-13T10:00:00' },
            },
            {
              id: 'B', subject: 'Other', showAs: 'free',
              start: { dateTime: '2026-04-14T09:00:00' }, end: { dateTime: '2026-04-14T10:00:00' },
            },
          ],
          '@odata.deltaLink': 'next',
        },
      },
    ])
    const result = await microsoft.fetchEvents({
      accessToken: 'token', calendarId: 'primary', window: WINDOW, cursor: null,
    })
    expect(result.sources[0].declined).toBe(true)
    expect(result.sources[1].free).toBe(true)
  })

  it('starts the window again when a stale delta link is refused', async () => {
    let served = 0
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = input.toString()
      if (url.includes('mailboxSettings')) {
        return new Response(JSON.stringify({ value: 'UTC' }), { status: 200 })
      }
      if (url.includes('stale-link')) {
        served++
        return new Response(JSON.stringify({ error: { message: 'gone' } }), { status: 410 })
      }
      return new Response(
        JSON.stringify({ value: [], '@odata.deltaLink': 'fresh' }),
        { status: 200 },
      )
    })

    const result = await microsoft.fetchEvents({
      accessToken: 'token',
      calendarId: 'primary',
      window: WINDOW,
      cursor: 'https://graph.microsoft.com/v1.0/stale-link',
    })
    expect(served).toBe(1)
    expect(result.resynced).toBe(true)
    expect(result.cursor).toBe('fresh')
  })

  it('reports a rejected token rather than retrying forever', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }))
    await expect(
      microsoft.fetchEvents({
        accessToken: 'dead', calendarId: 'primary', window: WINDOW, cursor: null,
      }),
    ).rejects.toBeInstanceOf(ProviderError)
  })
})

describe('Google Calendar', () => {
  it('expands the series itself and keeps the sync token', async () => {
    const { calls } = stubFetch([{
      match: '/events?',
      body: {
        items: [
          {
            id: 'abc_20260413T080000Z',
            status: 'confirmed',
            summary: 'Site visit',
            start: { dateTime: '2026-04-13T09:00:00+01:00' },
            end: { dateTime: '2026-04-13T12:00:00+01:00' },
            recurringEventId: 'abc',
            organizer: { email: 'me@practice.com', self: true },
            attendees: [
              { email: 'me@practice.com', self: true, responseStatus: 'accepted' },
              { email: 'client@developer.com', displayName: 'Jo Patel' },
            ],
          },
          { id: 'gone-1', status: 'cancelled' },
        ],
        nextSyncToken: 'SYNC-TOKEN-1',
      },
    }])

    const result = await google.fetchEvents({
      accessToken: 'token', calendarId: 'primary', window: WINDOW, cursor: null,
    })

    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].uid).toBe('google:abc_20260413T080000Z')
    expect(result.sources[0].recurring).toBe(true)
    // +01:00 at 09:00 is still the 13th; parsing to UTC would not change it
    // here, but the date must come from the local wall clock either way.
    expect(result.sources[0].occurrences).toEqual([
      { date: '2026-04-13', minutes: 180, allDay: false },
    ])
    expect(result.removedIds).toEqual(['gone-1'])
    expect(result.cursor).toBe('SYNC-TOKEN-1')

    const request = calls[0]
    expect(request).toContain('singleEvents=true')
    expect(request).toContain('timeMin=2026-04-01')
  })

  it('never sends a window alongside a sync token', async () => {
    // Google rejects the combination outright, which would break every
    // incremental sync after the first.
    const { calls } = stubFetch([{ match: '/events?', body: { items: [], nextSyncToken: 'T2' } }])
    await google.fetchEvents({
      accessToken: 'token', calendarId: 'primary', window: WINDOW, cursor: 'T1',
    })
    expect(calls[0]).toContain('syncToken=T1')
    expect(calls[0]).not.toContain('timeMin')
    expect(calls[0]).not.toContain('timeMax')
  })

  it('follows pages and only keeps the token from the last one', async () => {
    let page = 0
    vi.stubGlobal('fetch', async () => {
      page++
      return new Response(
        JSON.stringify(
          page === 1
            ? { items: [event('one', '2026-04-13')], nextPageToken: 'p2' }
            : { items: [event('two', '2026-04-14')], nextSyncToken: 'FINAL' },
        ),
        { status: 200 },
      )
    })

    const result = await google.fetchEvents({
      accessToken: 'token', calendarId: 'primary', window: WINDOW, cursor: null,
    })
    expect(result.sources.map((s) => s.uid)).toEqual(['google:one', 'google:two'])
    expect(result.cursor).toBe('FINAL')
  })

  it('throws away a partial read when the sync token is refused', async () => {
    let attempt = 0
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      attempt++
      if (input.toString().includes('syncToken')) {
        return new Response(JSON.stringify({ error: { message: 'gone' } }), { status: 410 })
      }
      return new Response(
        JSON.stringify({ items: [event('fresh', '2026-04-13')], nextSyncToken: 'NEW' }),
        { status: 200 },
      )
    })

    const result = await google.fetchEvents({
      accessToken: 'token', calendarId: 'primary', window: WINDOW, cursor: 'OLD',
    })
    expect(attempt).toBe(2)
    expect(result.resynced).toBe(true)
    // The events from the failed attempt must not be carried over.
    expect(result.sources.map((s) => s.uid)).toEqual(['google:fresh'])
    expect(result.cursor).toBe('NEW')
  })

  it('spans an all-day event across its exclusive end date', async () => {
    stubFetch([{
      match: '/events?',
      body: {
        items: [{
          id: 'leave',
          status: 'confirmed',
          summary: 'Annual leave',
          start: { date: '2026-04-13' },
          end: { date: '2026-04-16' },
        }],
        nextSyncToken: 'T',
      },
    }])
    const result = await google.fetchEvents({
      accessToken: 'token', calendarId: 'primary', window: WINDOW, cursor: null,
    })
    expect(result.sources[0].occurrences.map((o) => o.date)).toEqual([
      '2026-04-13', '2026-04-14', '2026-04-15',
    ])
  })

  it('sees a declined invitation through the self attendee', async () => {
    stubFetch([{
      match: '/events?',
      body: {
        items: [{
          id: 'x', status: 'confirmed', summary: 'Thing',
          start: { dateTime: '2026-04-13T09:00:00Z' },
          end: { dateTime: '2026-04-13T10:00:00Z' },
          attendees: [{ email: 'me@practice.com', self: true, responseStatus: 'declined' }],
        }],
        nextSyncToken: 'T',
      },
    }])
    const result = await google.fetchEvents({
      accessToken: 'token', calendarId: 'primary', window: WINDOW, cursor: null,
    })
    expect(result.sources[0].declined).toBe(true)
  })
})

function event(id: string, date: string) {
  return {
    id,
    status: 'confirmed',
    summary: 'Meeting',
    start: { dateTime: `${date}T09:00:00Z` },
    end: { dateTime: `${date}T10:00:00Z` },
  }
}

describe('a Graph timestamp that already carries an offset', () => {
  it('is not mangled into a zero-length meeting', async () => {
    stubFetch([
      { match: '/mailboxSettings/timeZone', body: { value: 'UTC' } },
      {
        match: 'calendarView/delta?',
        body: {
          value: [{
            id: 'OFFSET-1',
            subject: 'Client workshop',
            showAs: 'busy',
            start: { dateTime: '2026-04-13T09:00:00+01:00' },
            end: { dateTime: '2026-04-13T11:00:00+01:00' },
          }],
          '@odata.deltaLink': 'next',
        },
      },
    ])
    const result = await microsoft.fetchEvents({
      accessToken: 'token', calendarId: 'primary', window: WINDOW, cursor: null,
    })
    expect(result.sources[0].occurrences[0].minutes).toBe(120)
  })
})
