import { requireUser } from '@/lib/auth'
import { fail, handler, ok, readJson } from '@/lib/api'
import { deleteCalendarFeed, getCalendarFeed, updateCalendarFeed } from '@/lib/data'

export const runtime = 'nodejs'

type Context = { params: Promise<{ id: string }> }

/** Unlink a calendar. Entries already imported stay — they are the record. */
export const DELETE = handler(async (_request: Request, context: Context) => {
  const user = await requireUser()
  const { id } = await context.params
  const feed = await getCalendarFeed(user.id, id)
  if (!feed) return fail('That calendar is not linked.', 404)
  await deleteCalendarFeed(user.id, id)
  return ok({ removed: true })
})

interface Patch {
  name?: string
  enabled?: boolean
  ignore?: string[]
}

export const PATCH = handler(async (request: Request, context: Context) => {
  const user = await requireUser()
  const { id } = await context.params
  const feed = await getCalendarFeed(user.id, id)
  if (!feed) return fail('That calendar is not linked.', 404)

  const body = await readJson<Patch>(request)
  await updateCalendarFeed(user.id, id, {
    ...(typeof body.name === 'string' ? { name: body.name.trim().slice(0, 120) || feed.name } : {}),
    ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
    ...(Array.isArray(body.ignore)
      ? { ignore: body.ignore.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 60) }
      : {}),
  })
  return ok({ updated: true })
})
