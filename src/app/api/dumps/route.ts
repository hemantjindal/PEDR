import { requireUser } from '@/lib/auth'
import { fail, handler, ok, readJson } from '@/lib/api'
import { createDump, saveParsedEntries } from '@/lib/data'
import { sanitiseEntries } from '@/lib/entry-input'
import { PARSER_VERSION } from '@/lib/ingest'
import { REVIEW_THRESHOLD, type DraftEntry, type DumpKind } from '@/lib/pedr/types'

export const runtime = 'nodejs'

interface Body {
  raw: string
  kind?: DumpKind
  note?: string
  enriched?: boolean
  entries: DraftEntry[]
}

/**
 * Commit a reviewed dump.
 *
 * The client sends back entries it may have edited, so everything is
 * re-validated here — a route handler never trusts its own UI.
 */
export const POST = handler(async (request: Request) => {
  const user = await requireUser()
  const body = await readJson<Body>(request)

  const raw = (body.raw ?? '').trim()
  if (!raw) return fail('Nothing to save.')

  const checked = sanitiseEntries(body.entries, { source: 'dump' })
  if (!checked.ok) return fail(checked.error)
  const clean = checked.entries

  const dumpId = await createDump({
    userId: user.id,
    raw,
    kind: body.kind ?? 'freeform',
    note: body.note ?? null,
  })

  const saved = await saveParsedEntries({
    userId: user.id,
    dumpId,
    entries: clean,
    parserVersion: PARSER_VERSION,
    enriched: Boolean(body.enriched),
    // Coming back from the review screen counts as a human confirming it.
    autoVerify: true,
  })

  return ok({
    dumpId,
    saved: saved.length,
    needsReview: clean.filter((e) => e.confidence < REVIEW_THRESHOLD).length,
  })
})
