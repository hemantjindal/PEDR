import type { DateKey } from '../pedr/week'
import type { RawSourceEvent } from '../ingest/events'

/** The two calendars an architectural practice actually runs on. */
export type ProviderId = 'microsoft' | 'google'

export interface Tokens {
  accessToken: string
  /** Absent on a refresh that reuses the existing one. */
  refreshToken: string | null
  /** ISO, or null when the provider did not say. */
  expiresAt: string | null
  scope: string | null
}

export interface Identity {
  email: string
  name: string | null
}

export interface FetchWindow {
  from: DateKey
  to: DateKey
}

export interface FetchResult {
  sources: RawSourceEvent[]
  /**
   * Where to resume. Google hands back an opaque token, Microsoft a full URL;
   * both mean "only what changed since this point".
   */
  cursor: string | null
  /**
   * Ids the provider says are gone. A meeting cancelled after it was imported
   * has to come back off the record, or the record says you attended it.
   */
  removedIds: string[]
  /** Set when the cursor was rejected and the whole window was re-read. */
  resynced: boolean
}

export interface Channel {
  id: string
  /** Google needs this to stop the channel again; Microsoft does not use it. */
  resourceId: string | null
  expiresAt: string
  secret: string
}

export interface Provider {
  id: ProviderId
  /** What to call it on a button. */
  label: string
  /** What it actually covers, in the words somebody would use. */
  blurb: string
  /** The scopes, spelled out for the screen that asks for consent. */
  permission: string
  /** False when this deployment has no client credentials for it. */
  configured(): boolean

  authorizeUrl(opts: { redirectUri: string; state: string; challenge: string }): string
  exchange(opts: { code: string; redirectUri: string; verifier: string }): Promise<Tokens>
  refresh(refreshToken: string): Promise<Tokens>
  identity(accessToken: string): Promise<Identity>

  fetchEvents(opts: {
    accessToken: string
    calendarId: string
    window: FetchWindow
    cursor: string | null
  }): Promise<FetchResult>

  /** Ask the provider to tell us when something changes. */
  watch(opts: {
    accessToken: string
    calendarId: string
    notifyUrl: string
    secret: string
  }): Promise<Channel>

  unwatch(opts: {
    accessToken: string
    channelId: string
    resourceId: string | null
  }): Promise<void>
}

export class ProviderError extends Error {
  readonly status: number
  /** True when the account has to be reconnected — refreshing will not help. */
  readonly reauth: boolean

  constructor(message: string, opts: { status?: number; reauth?: boolean } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.status = opts.status ?? 0
    this.reauth = opts.reauth ?? false
  }
}
