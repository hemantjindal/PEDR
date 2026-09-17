import { getStaleConnections } from '@/lib/data'
import { syncConnection } from '@/lib/connectors/sync'
import { needsRenewal, renewConnection } from '@/lib/connectors/watch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * The scheduled pass that makes the connectors trustworthy.
 *
 * Push notifications are fast but not reliable: a subscription expires (three
 * days for Microsoft, a week for Google), a delivery is dropped, a deploy
 * happens mid-notification. None of that is visible to the person whose record
 * quietly stops filling itself in.
 *
 * So this runs regardless. It renews anything close to lapsing, and syncs any
 * connection that has not been read recently — which costs one small
 * incremental request per calendar, because every provider here supports
 * "only what changed since".
 */

/** Sync anything not read in this long, notification or no notification. */
const STALE_HOURS = 6

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const header = request.headers.get('authorization')
    if (header !== `Bearer ${secret}`) {
      return Response.json({ error: 'Not authorised.' }, { status: 401 })
    }
  }

  const before = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString()
  const connections = await getStaleConnections(before)

  let synced = 0
  let renewed = 0
  let failed = 0
  const errors: string[] = []

  for (const connection of connections) {
    if (needsRenewal(connection)) {
      // Best effort. A subscription that cannot be renewed is a slower
      // connector, not a broken one — this loop is the fallback for exactly
      // that case, so it must not stop because of it.
      const ok = await renewConnection(connection).catch(() => false)
      if (ok) renewed++
    }

    const outcome = await syncConnection(connection, { reason: 'the scheduled check' })
    if (outcome.ok) {
      synced++
    } else {
      failed++
      if (errors.length < 10) errors.push(`${connection.provider}: ${outcome.error}`)
    }
  }

  return Response.json({ considered: connections.length, synced, renewed, failed, errors })
}
