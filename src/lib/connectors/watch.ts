import { getConnectionById, updateConnection, type CalendarConnection } from '../data'
import { absolute } from '../site'
import { getProvider } from './index'
import { renewMicrosoftChannel } from './microsoft'
import { randomToken } from './oauth'
import { freshAccessToken } from './sync'

export { getConnectionById }

/**
 * Push notifications: being told a calendar changed, rather than asking.
 *
 * Both providers do the same thing under different names — Google calls it a
 * channel, Microsoft a subscription — and both expire. Google gives a week,
 * Microsoft under three days. So this is only ever half the story: the
 * scheduled sync in `/api/cron/sync` renews them and catches anything a missed
 * notification would otherwise have lost. A webhook makes it fast; the cron
 * makes it correct.
 */

/** Ask the provider to notify us. Safe to call on a connection already watched. */
export async function subscribeConnection(connection: CalendarConnection): Promise<boolean> {
  const provider = getProvider(connection.provider)
  if (!provider?.configured()) return false

  // Drop the old one first, or a reconnect leaves a channel nobody reads
  // pointing at this app until it expires.
  if (connection.channelId) {
    await unsubscribeConnection(connection).catch(() => undefined)
  }

  const accessToken = await freshAccessToken(connection, provider)
  const secret = randomToken(24)

  const channel = await provider.watch({
    accessToken,
    calendarId: connection.calendarId,
    notifyUrl: absolute(`/api/connect/webhook/${provider.id}`),
    secret,
  })

  await updateConnection(connection.id, {
    channelId: channel.id,
    channelResourceId: channel.resourceId,
    channelExpiresAt: channel.expiresAt,
    channelSecret: channel.secret,
  })
  return true
}

export async function unsubscribeConnection(connection: CalendarConnection): Promise<void> {
  const provider = getProvider(connection.provider)
  if (!provider?.configured() || !connection.channelId) return

  const accessToken = await freshAccessToken(connection, provider)
  await provider.unwatch({
    accessToken,
    channelId: connection.channelId,
    resourceId: connection.channelResourceId,
  })

  await updateConnection(connection.id, {
    channelId: null,
    channelResourceId: null,
    channelExpiresAt: null,
    channelSecret: null,
  })
}

/**
 * Keep a subscription alive.
 *
 * Microsoft can extend one in place, which keeps the same channel id and costs
 * one request. Google cannot, so it gets a new channel and the old one is
 * stopped on the way.
 */
export async function renewConnection(connection: CalendarConnection): Promise<boolean> {
  const provider = getProvider(connection.provider)
  if (!provider?.configured()) return false
  if (!connection.channelId) return subscribeConnection(connection)

  if (connection.provider === 'microsoft') {
    const accessToken = await freshAccessToken(connection, provider)
    const expiresAt = await renewMicrosoftChannel(accessToken, connection.channelId)
    await updateConnection(connection.id, { channelExpiresAt: expiresAt })
    return true
  }

  return subscribeConnection(connection)
}

/** Channels within this of expiry are renewed by the scheduled run. */
export function needsRenewal(connection: CalendarConnection, now = Date.now()): boolean {
  if (!connection.enabled) return false
  if (!connection.channelId || !connection.channelExpiresAt) return true
  const expires = Date.parse(connection.channelExpiresAt)
  if (Number.isNaN(expires)) return true
  // Half a day's head start. Microsoft's ceiling is under three days, so this
  // gives several scheduled runs to succeed before anything lapses.
  return expires - now < 12 * 60 * 60 * 1000
}
