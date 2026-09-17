import { requireUser } from '@/lib/auth'
import { fail, handler, ok, readJson } from '@/lib/api'
import { syncConnection } from '@/lib/connectors/sync'
import { subscribeConnection, unsubscribeConnection } from '@/lib/connectors/watch'
import { deleteConnection, getConnection, updateConnection } from '@/lib/data'

export const runtime = 'nodejs'
export const maxDuration = 60

type Context = { params: Promise<{ id: string }> }

/** Read it now, rather than waiting to be told. */
export const POST = handler(async (_request: Request, context: Context) => {
  const user = await requireUser()
  const { id } = await context.params
  const connection = await getConnection(user.id, id)
  if (!connection) return fail('That calendar is not connected.', 404)

  const outcome = await syncConnection(connection, { reason: 'you asking' })
  if (!outcome.ok) return fail(outcome.error ?? 'That calendar could not be read.', 502)

  // A sync that worked on a connection with no live subscription is a good
  // moment to get one — the first attempt may have failed at connect time.
  if (!connection.channelId) {
    await subscribeConnection(connection).catch(() => undefined)
  }

  return ok(outcome)
})

interface Patch {
  enabled?: boolean
  ignore?: string[]
}

export const PATCH = handler(async (request: Request, context: Context) => {
  const user = await requireUser()
  const { id } = await context.params
  const connection = await getConnection(user.id, id)
  if (!connection) return fail('That calendar is not connected.', 404)

  const body = await readJson<Patch>(request)

  if (typeof body.enabled === 'boolean' && body.enabled !== connection.enabled) {
    // Pausing a calendar should stop the provider talking to us as well, not
    // just make this app ignore what it says.
    if (body.enabled) await subscribeConnection(connection).catch(() => undefined)
    else await unsubscribeConnection(connection).catch(() => undefined)
  }

  await updateConnection(connection.id, {
    ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled, lastError: null } : {}),
    ...(Array.isArray(body.ignore)
      ? { ignore: body.ignore.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 60) }
      : {}),
  })

  return ok({ updated: true })
})

/**
 * Disconnect. Entries already imported stay — they are the record, and the
 * person wrote most of what is on them.
 */
export const DELETE = handler(async (_request: Request, context: Context) => {
  const user = await requireUser()
  const { id } = await context.params
  const connection = await getConnection(user.id, id)
  if (!connection) return fail('That calendar is not connected.', 404)

  // Tell the provider to stop first. If that fails the row still goes, because
  // refusing to disconnect because a remote call failed is the wrong answer to
  // somebody asking for their account to be unlinked.
  await unsubscribeConnection(connection).catch(() => undefined)
  await deleteConnection(user.id, connection.id)

  return ok({ removed: true })
})
