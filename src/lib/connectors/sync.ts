import {
  createDump,
  deleteImportedByEventIds,
  findUserById,
  getConnectionById,
  getKnownPeople,
  getProjects,
  saveParsedEntries,
  updateConnection,
  type CalendarConnection,
} from '../data'
import { calendarToEntries } from '../ingest'
import { filterEvents } from '../ingest/events'
import { PARSER_VERSION } from '../ingest'
import { decryptSecret, encryptSecret } from '../secrets'
import { addDays, todayKey, type DateKey } from '../pedr/week'
import { getProvider } from './index'
import { ProviderError, type Provider } from './types'

/**
 * Reading a connected calendar and putting what it finds on the record.
 *
 * Three things make this different from the one-off .ics import:
 *
 *  - It is incremental. Each provider hands back a cursor meaning "only what
 *    changed since", so the second sync costs one small request rather than a
 *    year of events.
 *  - It can subtract. A meeting cancelled after it was imported is taken back
 *    off, because a record that says you attended a meeting that never happened
 *    is worse than one with a gap in it.
 *  - Nothing it writes is verified. The .ics path auto-verifies because a
 *    person just looked at the list on screen and pressed save. A background
 *    sync has had no such moment, so everything it adds waits in Review.
 */

/** How far back a first sync reaches when there is nothing better to go on. */
const DEFAULT_MONTHS_BACK = 6
/** And the hard floor, so connecting an old account is not a thousand requests. */
const MAX_MONTHS_BACK = 30

export interface SyncOutcome {
  ok: boolean
  imported: number
  removed: number
  skipped: number
  /** Set when the provider made us re-read the whole window. */
  resynced: boolean
  error: string | null
  /** True when the person has to authorise the account again. */
  reauth: boolean
}

export async function syncConnection(
  connection: CalendarConnection,
  opts: { reason?: string } = {},
): Promise<SyncOutcome> {
  const provider = getProvider(connection.provider)
  if (!provider || !provider.configured()) {
    return fail(connection, `${connection.provider} is not set up on this deployment.`, false)
  }

  const user = await findUserById(connection.userId)
  if (!user) return fail(connection, 'That account no longer exists.', false)

  let accessToken: string
  try {
    accessToken = await freshAccessToken(connection, provider)
  } catch (error) {
    const reauth = error instanceof ProviderError ? error.reauth : false
    return fail(connection, message(error), reauth)
  }

  const today = todayKey()
  const window = {
    from: connection.windowFrom ?? monthsBack(today, DEFAULT_MONTHS_BACK),
    // A PEDR records what happened. Tomorrow is the edge, to catch anything
    // logged in a timezone ahead of this server's.
    to: addDays(today, 1),
  }

  let result
  try {
    result = await provider.fetchEvents({
      accessToken,
      calendarId: connection.calendarId,
      window,
      cursor: connection.syncCursor,
    })
  } catch (error) {
    const reauth = error instanceof ProviderError ? error.reauth : false
    return fail(connection, message(error), reauth)
  }

  const parsed = filterEvents(result.sources, {
    from: window.from,
    to: window.to,
    email: user.email,
    name: user.name,
    ignore: connection.ignore ?? [],
  })

  const [projects, knownPeople] = await Promise.all([
    getProjects(user.id),
    getKnownPeople(user.id),
  ])

  const entries = calendarToEntries(parsed, { reference: today, projects, knownPeople })

  let imported = 0
  if (entries.length > 0) {
    const dumpId = await createDump({
      userId: user.id,
      raw: [
        `Sync from ${provider.label} (${connection.accountEmail})`,
        opts.reason ? `Triggered by ${opts.reason}` : null,
        `Window ${window.from} to ${window.to}`,
        `${entries.length} events`,
        '',
        ...entries.slice(0, 500).map((e) => `${e.date}  ${e.minutes}m  ${e.activity}`),
      ].filter(Boolean).join('\n'),
      kind: 'calendar',
      note: `${provider.label}: ${connection.calendarName}`,
    })

    const saved = await saveParsedEntries({
      userId: user.id,
      dumpId,
      entries,
      parserVersion: PARSER_VERSION,
      enriched: false,
      // Nobody has looked at these yet. They wait in Review.
      autoVerify: false,
    })
    imported = saved.length
  }

  const removed = result.removedIds.length
    ? await deleteImportedByEventIds(
        user.id,
        result.removedIds.map((id) => `${connection.provider}:${id}:`),
      )
    : 0

  await updateConnection(connection.id, {
    // A pass that returned no new cursor keeps the old one rather than
    // silently falling back to re-reading the whole window every time.
    syncCursor: result.cursor ?? connection.syncCursor,
    windowFrom: connection.windowFrom ?? window.from,
    lastSyncedAt: new Date().toISOString(),
    lastImported: imported,
    lastSkipped: parsed.skipped.length,
    lastError: null,
  })

  return {
    ok: true,
    imported,
    removed,
    skipped: parsed.skipped.length,
    resynced: result.resynced,
    error: null,
    reauth: false,
  }
}

/**
 * A token that will still be valid when it is used.
 *
 * Refreshed a minute early rather than on a 401, because the alternative is
 * every sync making one request that is guaranteed to fail first. The new
 * tokens are written back immediately: a refresh token that has been rotated
 * and not stored locks the account out.
 */
export async function freshAccessToken(
  stale: CalendarConnection,
  provider: Provider,
): Promise<string> {
  // Always off the current row. Microsoft rotates the refresh token on every
  // use, so a caller holding a copy from before an earlier refresh would spend
  // one that has already been replaced — and lock the connection out for good.
  const connection = (await getConnectionById(stale.id)) ?? stale
  const expires = connection.expiresAt ? Date.parse(connection.expiresAt) : 0
  const stillGood = expires > Date.now() + 60_000

  if (stillGood) return decryptSecret(connection.accessToken)

  if (!connection.refreshToken) {
    throw new ProviderError(
      'This connection has no refresh token, so it cannot renew itself. Connect the account again.',
      { reauth: true },
    )
  }

  const tokens = await provider.refresh(decryptSecret(connection.refreshToken))

  await updateConnection(connection.id, {
    accessToken: encryptSecret(tokens.accessToken),
    ...(tokens.refreshToken ? { refreshToken: encryptSecret(tokens.refreshToken) } : {}),
    expiresAt: tokens.expiresAt,
    ...(tokens.scope ? { scope: tokens.scope } : {}),
  })

  return tokens.accessToken
}

async function fail(
  connection: CalendarConnection,
  error: string,
  reauth: boolean,
): Promise<SyncOutcome> {
  await updateConnection(connection.id, {
    lastError: error.slice(0, 400),
    // A connection needing re-authorisation is switched off, so the scheduled
    // sync stops hammering a provider that has already said no.
    ...(reauth ? { enabled: false } : {}),
  })
  return { ok: false, imported: 0, removed: 0, skipped: 0, resynced: false, error, reauth }
}

function message(error: unknown): string {
  if (error instanceof ProviderError) return error.message
  if (error instanceof Error) return error.message
  return 'The calendar could not be read.'
}

/** A first sync reaches back this far, bounded so connecting is never enormous. */
export function firstWindowFrom(experienceStart: string | null, today: DateKey): DateKey {
  const floor = monthsBack(today, MAX_MONTHS_BACK)
  const wanted = experienceStart && experienceStart > floor
    ? experienceStart
    : monthsBack(today, DEFAULT_MONTHS_BACK)
  return wanted < floor ? floor : (wanted as DateKey)
}

function monthsBack(today: DateKey, months: number): DateKey {
  const d = new Date(`${today}T00:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString().slice(0, 10) as DateKey
}
