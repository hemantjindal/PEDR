import { requireUser } from '@/lib/auth'
import { fail, handler, ok, readJson } from '@/lib/api'
import { createDump, saveParsedEntries } from '@/lib/data'
import { PARSER_VERSION } from '@/lib/ingest'
import { REVIEW_THRESHOLD, type DraftEntry, type DumpKind } from '@/lib/pedr/types'
import { isDateKey } from '@/lib/pedr/week'
import { CRITERION_IDS, OFFICE_MANAGEMENT_CATEGORIES, STAGE_IDS } from '@/lib/pedr/constants'

export const runtime = 'nodejs'

interface Body {
  raw: string
  kind?: DumpKind
  note?: string
  enriched?: boolean
  entries: DraftEntry[]
}

const OFFICE_IDS = new Set<string>(OFFICE_MANAGEMENT_CATEGORIES.map((c) => c.id))
const CRITERIA = new Set<string>(CRITERION_IDS)
const STAGES = new Set<number>(STAGE_IDS)

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
  if (!Array.isArray(body.entries)) return fail('No entries supplied.')
  if (body.entries.length > 2000) return fail('That is too many entries in one go.')

  const clean: DraftEntry[] = []
  for (const entry of body.entries) {
    if (!entry || typeof entry !== 'object') continue
    if (!isDateKey(entry.date)) return fail(`"${String(entry.date)}" is not a valid date.`)

    const activity = String(entry.activity ?? '').trim()
    if (!activity) continue

    const minutes = Number(entry.minutes)
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) {
      return fail(`"${activity}" has an impossible duration.`)
    }

    clean.push({
      date: entry.date,
      minutes: Math.round(minutes),
      minutesEstimated: Boolean(entry.minutesEstimated),
      projectId: entry.projectId ?? null,
      projectHint: entry.projectId ? null : (entry.projectHint ?? null),
      stage: typeof entry.stage === 'number' && STAGES.has(entry.stage) ? entry.stage : null,
      officeCategory:
        entry.officeCategory && OFFICE_IDS.has(entry.officeCategory) ? entry.officeCategory : null,
      activity,
      detail: entry.detail ? String(entry.detail) : null,
      people: Array.isArray(entry.people)
        ? entry.people.map((p) => String(p).trim()).filter(Boolean).slice(0, 30)
        : [],
      criteria: Array.isArray(entry.criteria)
        ? entry.criteria.filter((c) => CRITERIA.has(c)).slice(0, 3)
        : [],
      wentWrong: entry.wentWrong ? String(entry.wentWrong) : null,
      learned: entry.learned ? String(entry.learned) : null,
      confidence: clamp01(Number(entry.confidence)),
      source: entry.source ?? 'dump',
      provenance: entry.provenance ?? undefined,
    })
  }

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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}
