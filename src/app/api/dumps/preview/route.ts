import { requireUser } from '@/lib/auth'
import { fail, handler, ok, readJson } from '@/lib/api'
import { getKnownPeople, getProjects } from '@/lib/data'
import { parseDump } from '@/lib/ingest'
import { enrichEntries, isEnrichmentAvailable } from '@/lib/ingest/enrich'
import type { DumpKind } from '@/lib/pedr/types'
import { isDateKey, todayKey } from '@/lib/pedr/week'

export const runtime = 'nodejs'
export const maxDuration = 60

interface Body {
  raw: string
  reference?: string
  kind?: DumpKind
  fillMissingDurations?: boolean
  useModel?: boolean
}

/**
 * Parse without saving, so someone can see what we made of their dump and fix
 * it before any of it reaches the record.
 */
export const POST = handler(async (request: Request) => {
  const user = await requireUser()
  const body = await readJson<Body>(request)

  const raw = (body.raw ?? '').trim()
  if (!raw) return fail('Nothing to parse.')
  if (raw.length > 400_000) return fail('That is very large. Paste it in a few goes.')

  const reference = body.reference && isDateKey(body.reference) ? body.reference : todayKey()

  const [projects, knownPeople] = await Promise.all([
    getProjects(user.id),
    getKnownPeople(user.id),
  ])

  const result = parseDump(raw, {
    reference,
    projects,
    knownPeople,
    me: user.teamsName ?? user.name,
    kind: body.kind,
    fillMissingDurations: body.fillMissingDurations ?? false,
  })

  let entries = result.entries
  let warnings = result.warnings
  let enriched = false

  if (body.useModel && isEnrichmentAvailable()) {
    const pass = await enrichEntries(raw, entries, { projects })
    entries = pass.entries
    warnings = [...warnings, ...pass.warnings]
    enriched = pass.enriched
  }

  return ok({
    kind: result.kind,
    entries,
    warnings,
    enriched,
    stats: result.stats,
    parserVersion: result.parserVersion,
    modelAvailable: isEnrichmentAvailable(),
    reference,
  })
})
