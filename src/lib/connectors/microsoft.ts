import { isDateKey, type DateKey } from '../pedr/week'
import { htmlToText, spanWorkingDays } from '../ingest/events'
import type { RawAttendee, RawPerson, RawSourceEvent } from '../ingest/events'
import { apiGet, apiSend, tokenRequest } from './oauth'
import { ProviderError, type Channel, type FetchResult, type Identity, type Provider, type Tokens } from './types'

/**
 * Microsoft 365 — Outlook and Teams.
 *
 * The one that matters for UK practice. Almost every architect's calendar is a
 * work Outlook calendar, Teams meetings land in it, and the attendee list on an
 * invite is the only written record of who you actually dealt with.
 *
 * Reads only: `Calendars.Read`. This app never writes to anybody's calendar.
 */

const AUTH_HOST = 'https://login.microsoftonline.com/common/oauth2/v2.0'
const GRAPH = 'https://graph.microsoft.com/v1.0'

const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'Calendars.Read',
  'MailboxSettings.Read',
]

/**
 * Graph caps an events subscription at 4230 minutes — just under three days —
 * so this is renewed by the cron long before it lapses.
 */
const CHANNEL_MINUTES = 4_000

function clientId(): string {
  return process.env.MICROSOFT_CLIENT_ID?.trim() ?? ''
}
function clientSecret(): string {
  return process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? ''
}

export const microsoft: Provider = {
  id: 'microsoft',
  label: 'Microsoft 365',
  blurb: 'Outlook and Teams — the work calendar most practices run on.',
  permission: 'Read your calendar. It cannot write to it, send anything, or read your email.',

  configured() {
    return Boolean(clientId() && clientSecret())
  },

  authorizeUrl({ redirectUri, state, challenge }) {
    const params = new URLSearchParams({
      client_id: clientId(),
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: SCOPES.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })
    return `${AUTH_HOST}/authorize?${params.toString()}`
  },

  exchange({ code, redirectUri, verifier }) {
    return tokenRequest(`${AUTH_HOST}/token`, {
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      scope: SCOPES.join(' '),
    })
  },

  refresh(refreshToken): Promise<Tokens> {
    return tokenRequest(`${AUTH_HOST}/token`, {
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPES.join(' '),
    })
  },

  async identity(accessToken): Promise<Identity> {
    const response = await apiGet(`${GRAPH}/me?$select=displayName,mail,userPrincipalName`, accessToken)
    const me = (await response.json()) as {
      displayName?: string
      mail?: string
      userPrincipalName?: string
    }
    // A work account without a licensed mailbox has no `mail`, but the UPN is
    // the address the person recognises either way.
    const email = (me.mail || me.userPrincipalName || '').toLowerCase()
    if (!email) throw new ProviderError('Microsoft returned an account with no address.')
    return { email, name: me.displayName?.trim() || null }
  },

  async fetchEvents({ accessToken, calendarId, window, cursor }): Promise<FetchResult> {
    // Dates come back in whatever zone we ask for. A record is kept in local
    // working days, so ask for the mailbox's own zone — otherwise a 09:00
    // meeting in a +0200 office lands on the previous day in UTC.
    const zone = await mailboxTimeZone(accessToken)

    const sources: RawSourceEvent[] = []
    const removedIds: string[] = []
    let resynced = false

    let url = cursor ?? deltaUrl(calendarId, window)
    let nextCursor: string | null = null
    let pages = 0

    while (url && pages < 40) {
      pages++
      let response: Response
      try {
        response = await apiGet(url, accessToken, {
          // maxpagesize keeps a busy year from arriving as one enormous body.
          prefer: `odata.maxpagesize=100, outlook.timezone="${zone}"`,
        })
      } catch (error) {
        // A delta link goes stale if it is left too long. Graph says so with a
        // 410; the answer is to walk the window again from scratch.
        if (error instanceof ProviderError && error.status === 410 && !resynced) {
          url = deltaUrl(calendarId, window)
          resynced = true
          // Anything already gathered belongs to the abandoned pass.
          sources.length = 0
          removedIds.length = 0
          continue
        }
        throw error
      }

      const page = (await response.json()) as {
        value?: unknown[]
        '@odata.nextLink'?: string
        '@odata.deltaLink'?: string
      }

      for (const item of page.value ?? []) {
        const event = item as GraphEvent
        if (event['@removed']) {
          if (event.id) removedIds.push(event.id)
          continue
        }
        const source = toSource(event)
        if (source) sources.push(source)
      }

      if (page['@odata.deltaLink']) {
        nextCursor = page['@odata.deltaLink']
        break
      }
      url = page['@odata.nextLink'] ?? ''
    }

    return { sources, cursor: nextCursor, removedIds, resynced }
  },

  async watch({ accessToken, calendarId, notifyUrl, secret }): Promise<Channel> {
    const resource =
      calendarId === 'primary' ? '/me/events' : `/me/calendars/${encodeURIComponent(calendarId)}/events`

    const response = await apiSend(`${GRAPH}/subscriptions`, accessToken, {
      method: 'POST',
      body: {
        changeType: 'created,updated,deleted',
        notificationUrl: notifyUrl,
        resource,
        expirationDateTime: new Date(Date.now() + CHANNEL_MINUTES * 60_000).toISOString(),
        clientState: secret,
      },
    })
    const created = (await response.json()) as { id?: string; expirationDateTime?: string }
    if (!created.id) throw new ProviderError('Microsoft created no subscription.')

    return {
      id: created.id,
      resourceId: null,
      expiresAt:
        created.expirationDateTime ?? new Date(Date.now() + CHANNEL_MINUTES * 60_000).toISOString(),
      secret,
    }
  },

  async unwatch({ accessToken, channelId }) {
    try {
      await apiSend(`${GRAPH}/subscriptions/${encodeURIComponent(channelId)}`, accessToken, {
        method: 'DELETE',
      })
    } catch (error) {
      // Already gone is the outcome we wanted. Anything else is worth knowing
      // about but is not a reason to refuse to disconnect an account.
      if (!(error instanceof ProviderError && error.status === 404)) throw error
    }
  },
}

/** Extend an existing subscription rather than tearing it down and rebuilding. */
export async function renewMicrosoftChannel(
  accessToken: string,
  channelId: string,
): Promise<string> {
  const expiration = new Date(Date.now() + CHANNEL_MINUTES * 60_000).toISOString()
  await apiSend(`${GRAPH}/subscriptions/${encodeURIComponent(channelId)}`, accessToken, {
    method: 'PATCH',
    body: { expirationDateTime: expiration },
  })
  return expiration
}

function deltaUrl(calendarId: string, window: { from: DateKey; to: DateKey }): string {
  const base =
    calendarId === 'primary'
      ? `${GRAPH}/me/calendarView/delta`
      : `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/calendarView/delta`

  // calendarView expands a recurring series into its occurrences server-side,
  // which is why this is used rather than /events.
  const params = new URLSearchParams({
    startDateTime: `${window.from}T00:00:00`,
    endDateTime: `${window.to}T23:59:59`,
  })
  return `${base}?${params.toString()}`
}

async function mailboxTimeZone(accessToken: string): Promise<string> {
  try {
    const response = await apiGet(`${GRAPH}/me/mailboxSettings/timeZone`, accessToken)
    const body = (await response.json()) as { value?: string }
    const zone = body.value?.trim()
    // Graph may answer with a Windows zone name ("GMT Standard Time"), which is
    // also what it accepts back in the Prefer header, so it is used as given.
    return zone || 'UTC'
  } catch {
    return 'UTC'
  }
}

interface GraphEvent {
  id?: string
  '@removed'?: { reason?: string }
  subject?: string | null
  bodyPreview?: string | null
  body?: { contentType?: string; content?: string } | null
  location?: { displayName?: string } | null
  start?: { dateTime?: string; timeZone?: string } | null
  end?: { dateTime?: string; timeZone?: string } | null
  isAllDay?: boolean
  isCancelled?: boolean
  showAs?: string
  type?: string
  seriesMasterId?: string | null
  responseStatus?: { response?: string } | null
  organizer?: { emailAddress?: { name?: string; address?: string } } | null
  attendees?: Array<{
    type?: string
    status?: { response?: string }
    emailAddress?: { name?: string; address?: string }
  }> | null
}

function toSource(event: GraphEvent): RawSourceEvent | null {
  const date = dateKeyOf(event.start?.dateTime)
  if (!date || !event.id) return null

  const minutes = lengthMinutes(event.start?.dateTime, event.end?.dateTime)
  const allDay = Boolean(event.isAllDay)

  const response = event.responseStatus?.response?.toLowerCase() ?? ''

  return {
    // Namespaced, so an id from one provider can never collide with an id
    // from the other and dedupe silently drop a real meeting.
    uid: `microsoft:${event.id}`,
    summary: (event.subject ?? '').trim(),
    description: readBody(event),
    location: event.location?.displayName?.trim() || null,
    attendees: readAttendees(event),
    organiser: readOrganiser(event),
    cancelled: Boolean(event.isCancelled),
    declined: response === 'declined',
    // Outlook's own free/busy marker. 'free' and 'workingElsewhere' both mean
    // the slot was not really this meeting.
    free: ['free', 'workingelsewhere'].includes((event.showAs ?? '').toLowerCase()),
    recurring: Boolean(event.seriesMasterId) || event.type === 'occurrence' || event.type === 'exception',
    // Graph gives an all-day block one event with an exclusive end midnight.
    occurrences: allDay
      ? spanWorkingDays(date, dateKeyOf(event.end?.dateTime), 0)
      : [{ date, minutes, allDay }],
  }
}

function readBody(event: GraphEvent): string | null {
  const content = event.body?.content
  if (content) {
    const text = event.body?.contentType?.toLowerCase() === 'html' ? htmlToText(content) : content
    if (text.trim()) return text
  }
  return event.bodyPreview?.trim() || null
}

function readAttendees(event: GraphEvent): RawAttendee[] {
  return (event.attendees ?? []).map((attendee) => ({
    name: attendee.emailAddress?.name?.trim() || null,
    email: attendee.emailAddress?.address?.toLowerCase() || null,
    resource: attendee.type?.toLowerCase() === 'resource',
  }))
}

function readOrganiser(event: GraphEvent): RawPerson | null {
  const organiser = event.organizer?.emailAddress
  if (!organiser) return null
  return {
    name: organiser.name?.trim() || null,
    email: organiser.address?.toLowerCase() || null,
  }
}

/**
 * Graph returns "2026-04-13T09:00:00.0000000" with no offset — it is already in
 * the zone that was asked for, so the date is the first ten characters and
 * parsing it as a Date would only put it back into UTC.
 */
function dateKeyOf(value: string | null | undefined): DateKey | null {
  if (!value) return null
  const key = value.slice(0, 10)
  return isDateKey(key) ? key : null
}

function lengthMinutes(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end) return 0
  // Both carry the same zone, so the difference is right without knowing it.
  const from = Date.parse(asUtc(start))
  const to = Date.parse(asUtc(end))
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.max(0, Math.round((to - from) / 60_000))
}

/**
 * Graph normally returns a naive stamp in the zone that was asked for, and
 * reading it as UTC gives the right difference. It does not do so invariably,
 * and appending Z to one that already carries an offset produces an invalid
 * date — which would silently make a meeting zero minutes long.
 */
function asUtc(value: string): string {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`
}
