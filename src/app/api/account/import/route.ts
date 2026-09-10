import { requireUser } from '@/lib/auth'
import { fail, handler, ok, readJson } from '@/lib/api'
import { createDump, saveParsedEntries, updateUser } from '@/lib/data'
import { sanitiseEntries } from '@/lib/entry-input'
import { isDateKey } from '@/lib/pedr/week'
import { PARSER_VERSION } from '@/lib/ingest'

export const runtime = 'nodejs'
export const maxDuration = 60

interface Body {
  experienceStart?: string
  entries?: unknown
}

/**
 * Put the work somebody did before signing up into the account they just made.
 *
 * The entries arrive already parsed, because they were parsed in the browser
 * before there was an account to parse them into. They are re-validated here
 * regardless: nothing that arrives from a client is trusted, whoever it came
 * from.
 */
export const POST = handler(async (request: Request) => {
  const user = await requireUser()
  const body = await readJson<Body>(request)

  // The start date decides every deadline in the app, so take it if we have it
  // and the account has not already been told.
  if (!user.experienceStart && isDateKey(body.experienceStart)) {
    await updateUser(user.id, { experienceStart: body.experienceStart })
  }

  // A calendar is a shortcut, not a requirement. Somebody may arrive having
  // told us only when they started, and that is a complete answer.
  const supplied = Array.isArray(body.entries) ? body.entries : []
  if (supplied.length === 0) return ok({ saved: 0, duplicates: 0 })

  const parsed = sanitiseEntries(supplied, { source: 'calendar' })
  if (!parsed.ok) return fail(parsed.error)

  const dumpId = await createDump({
    userId: user.id,
    raw: '',
    kind: 'calendar',
    note: 'Recovered before sign-up',
  })

  const saved = await saveParsedEntries({
    userId: user.id,
    dumpId,
    entries: parsed.entries,
    parserVersion: PARSER_VERSION,
    enriched: false,
  })

  return ok({
    saved: saved.length,
    duplicates: parsed.entries.length - saved.length,
  })
})
