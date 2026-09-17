import { isDateKey, type DateKey } from '../pedr/week'
import { spanWorkingDays } from '../ingest/events'
import type { RawAttendee, RawPerson, RawSourceEvent } from '../ingest/events'
import { apiGet, apiSend, tokenRequest } from './oauth'
import { ProviderError, type Channel, type FetchResult, type Identity, type Provider, type Tokens } from './types'

/**
 * Google Workspace.
 *
 * Smaller practices and anyone whose studio never went near Microsoft. Same
 * data, different shape: Google expands a recurring series for you when you ask
 * for `singleEvents`, and hands back a sync token rather than a link.
 *
 * Reads only: `calendar.events.readonly`.
 */

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/calendar/v3'
const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo'

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events.readonly',
]

/** Google caps a calendar watch at a week. Renewed well inside that. */
const CHANNEL_SECONDS = 7 * 24 * 60 * 60

function clientId(): string {
  return process.env.GOOGLE_CLIENT_ID?.trim() ?? ''
}
function clientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() ?? ''
}

export const google: Provider = {
  id: 'google',
  label: 'Google Calendar',
  blurb: 'Google Workspace, or a personal Google account.',
  permission: 'Read your calendar events. It cannot change them or see anything else.',

  configured() {
    return Boolean(clientId() && clientSecret())
  },

  authorizeUrl({ redirectUri, state, challenge }) {
    const params = new URLSearchParams({
      client_id: clientId(),
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      // Without both of these Google issues no refresh token on a repeat
      // authorisation, and the connection silently dies after an hour.
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    })
    return `${AUTH}?${params.toString()}`
  },

  exchange({ code, redirectUri, verifier }) {
    return tokenRequest(TOKEN, {
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    })
  },

  refresh(refreshToken): Promise<Tokens> {
    return tokenRequest(TOKEN, {
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
  },

  async identity(accessToken): Promise<Identity> {
    const response = await apiGet(USERINFO, accessToken)
    const me = (await response.json()) as { email?: string; name?: string }
    const email = (me.email ?? '').toLowerCase()
    if (!email) throw new ProviderError('Google returned an account with no address.')
    return { email, name: me.name?.trim() || null }
  },

  async fetchEvents({ accessToken, calendarId, window, cursor }): Promise<FetchResult> {
    const calendar = calendarId === 'primary' ? 'primary' : calendarId
    const sources: RawSourceEvent[] = []
    const removedIds: string[] = []
    let resynced = false
    let useCursor = cursor

    let pageToken: string | null = null
    let nextCursor: string | null = null
    let pages = 0

    while (pages < 40) {
      pages++
      let response: Response
      try {
        response = await apiGet(listUrl(calendar, window, useCursor, pageToken), accessToken)
      } catch (error) {
        // A sync token expires if it is left long enough, and Google is exact
        // about it: 410 means start again with the full window.
        if (error instanceof ProviderError && error.status === 410 && useCursor) {
          useCursor = null
          pageToken = null
          sources.length = 0
          removedIds.length = 0
          resynced = true
          continue
        }
        throw error
      }

      const page = (await response.json()) as {
        items?: unknown[]
        nextPageToken?: string
        nextSyncToken?: string
      }

      for (const item of page.items ?? []) {
        const event = item as GoogleEvent
        // Google reports a deletion as a normal item with status 'cancelled',
        // so on an incremental pass this is how a dropped meeting arrives.
        if (event.status === 'cancelled') {
          if (event.id) removedIds.push(event.id)
          continue
        }
        const source = toSource(event)
        if (source) sources.push(source)
      }

      if (page.nextPageToken) {
        pageToken = page.nextPageToken
        continue
      }
      nextCursor = page.nextSyncToken ?? null
      break
    }

    return { sources, cursor: nextCursor, removedIds, resynced }
  },

  async watch({ accessToken, calendarId, notifyUrl, secret }): Promise<Channel> {
    const calendar = calendarId === 'primary' ? 'primary' : calendarId
    const response = await apiSend(
      `${API}/calendars/${encodeURIComponent(calendar)}/events/watch`,
      accessToken,
      {
        method: 'POST',
        body: {
          // Google requires the channel id to be ours and unique.
          id: crypto.randomUUID(),
          type: 'web_hook',
          address: notifyUrl,
          token: secret,
          params: { ttl: String(CHANNEL_SECONDS) },
        },
      },
    )
    const created = (await response.json()) as {
      id?: string
      resourceId?: string
      expiration?: string
    }
    if (!created.id || !created.resourceId) {
      throw new ProviderError('Google created no notification channel.')
    }
    return {
      id: created.id,
      resourceId: created.resourceId,
      // `expiration` is epoch milliseconds as a string.
      expiresAt: created.expiration
        ? new Date(Number(created.expiration)).toISOString()
        : new Date(Date.now() + CHANNEL_SECONDS * 1000).toISOString(),
      secret,
    }
  },

  async unwatch({ accessToken, channelId, resourceId }) {
    if (!resourceId) return
    try {
      await apiSend(`${API}/channels/stop`, accessToken, {
        method: 'POST',
        body: { id: channelId, resourceId },
      })
    } catch (error) {
      if (!(error instanceof ProviderError && (error.status === 404 || error.status === 400))) {
        throw error
      }
    }
  },
}

function listUrl(
  calendar: string,
  window: { from: DateKey; to: DateKey },
  cursor: string | null,
  pageToken: string | null,
): string {
  const params = new URLSearchParams({ maxResults: '250', singleEvents: 'true' })

  if (cursor) {
    // Google rejects a request that carries both a sync token and a window.
    params.set('syncToken', cursor)
  } else {
    params.set('timeMin', `${window.from}T00:00:00Z`)
    params.set('timeMax', `${window.to}T23:59:59Z`)
    params.set('orderBy', 'startTime')
  }
  if (pageToken) params.set('pageToken', pageToken)

  return `${API}/calendars/${encodeURIComponent(calendar)}/events?${params.toString()}`
}

interface GoogleEvent {
  id?: string
  status?: string
  summary?: string | null
  description?: string | null
  location?: string | null
  start?: { date?: string; dateTime?: string; timeZone?: string } | null
  end?: { date?: string; dateTime?: string; timeZone?: string } | null
  transparency?: string
  recurringEventId?: string | null
  organizer?: { email?: string; displayName?: string; self?: boolean } | null
  attendees?: Array<{
    email?: string
    displayName?: string
    resource?: boolean
    self?: boolean
    responseStatus?: string
  }> | null
  eventType?: string
}

function toSource(event: GoogleEvent): RawSourceEvent | null {
  if (!event.id) return null

  const allDay = Boolean(event.start?.date)
  const date = allDay ? dateKeyOf(event.start?.date) : dateKeyOf(event.start?.dateTime)
  if (!date) return null

  const self = (event.attendees ?? []).find((a) => a.self)

  return {
    // Namespaced, so an id from one provider can never collide with an id
    // from the other and dedupe silently drop a real meeting.
    uid: `google:${event.id}`,
    summary: (event.summary ?? '').trim(),
    description: event.description ?? null,
    location: event.location?.trim() || null,
    attendees: readAttendees(event),
    organiser: readOrganiser(event),
    cancelled: event.status === 'cancelled',
    declined: self?.responseStatus === 'declined',
    free: event.transparency === 'transparent',
    recurring: Boolean(event.recurringEventId),
    // A week off is one event with an exclusive end date, not five events.
    occurrences: allDay
      ? spanWorkingDays(date, dateKeyOf(event.end?.date), 0)
      : [{ date, minutes: lengthMinutes(event.start?.dateTime, event.end?.dateTime), allDay }],
  }
}

function readAttendees(event: GoogleEvent): RawAttendee[] {
  return (event.attendees ?? []).map((attendee) => ({
    name: attendee.displayName?.trim() || null,
    email: attendee.email?.toLowerCase() || null,
    resource: Boolean(attendee.resource),
  }))
}

function readOrganiser(event: GoogleEvent): RawPerson | null {
  const organiser = event.organizer
  if (!organiser?.email) return null
  return {
    name: organiser.displayName?.trim() || null,
    email: organiser.email.toLowerCase(),
  }
}

/**
 * The date as the calendar shows it.
 *
 * Google sends an RFC3339 stamp with the event's own offset —
 * "2026-04-13T09:00:00+01:00" — so the first ten characters are already the
 * local day. Parsing it into a Date would convert to UTC and move an early
 * morning meeting in Sydney onto the day before.
 */
function dateKeyOf(value: string | null | undefined): DateKey | null {
  if (!value) return null
  const key = value.slice(0, 10)
  return isDateKey(key) ? key : null
}

function lengthMinutes(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end) return 0
  const from = Date.parse(start)
  const to = Date.parse(end)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.max(0, Math.round((to - from) / 60_000))
}
