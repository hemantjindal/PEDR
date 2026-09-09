import { CRITERION_IDS, OFFICE_MANAGEMENT_CATEGORIES, STAGE_IDS } from './pedr/constants'
import type { DraftEntry } from './pedr/types'
import { isDateKey } from './pedr/week'

/**
 * Validating entries a browser sends back.
 *
 * Every route into the record ends here. The client has just let somebody edit
 * these rows, so nothing it sends can be trusted — not the stage id, not the
 * criteria, and least of all the minutes, which feed the total a mentor signs.
 * A route handler never trusts its own UI.
 */

const OFFICE_IDS = new Set<string>(OFFICE_MANAGEMENT_CATEGORIES.map((c) => c.id))
const CRITERIA = new Set<string>(CRITERION_IDS)
const STAGES = new Set<number>(STAGE_IDS)

export type SanitiseResult =
  | { ok: true; entries: DraftEntry[] }
  | { ok: false; error: string }

export function sanitiseEntries(
  input: unknown,
  defaults: { source: DraftEntry['source'] },
): SanitiseResult {
  if (!Array.isArray(input)) return { ok: false, error: 'No entries supplied.' }
  if (input.length > 2000) return { ok: false, error: 'That is too many entries in one go.' }

  const entries: DraftEntry[] = []
  const seenExternal = new Set<string>()

  for (const value of input) {
    const entry = value as Partial<DraftEntry> | null
    if (!entry || typeof entry !== 'object') continue
    if (!isDateKey(String(entry.date))) {
      return { ok: false, error: `"${String(entry.date)}" is not a valid date.` }
    }

    const activity = String(entry.activity ?? '').trim()
    if (!activity) continue

    const minutes = Number(entry.minutes)
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) {
      return { ok: false, error: `"${activity}" has an impossible duration.` }
    }

    // A repeated external id inside one batch would be rejected by the unique
    // index anyway; dropping it here means the count we report is the truth.
    const externalId = entry.externalId ? String(entry.externalId).slice(0, 400) : null
    if (externalId) {
      if (seenExternal.has(externalId)) continue
      seenExternal.add(externalId)
    }

    entries.push({
      date: entry.date as DraftEntry['date'],
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
      source: entry.source ?? defaults.source,
      provenance: entry.provenance ?? undefined,
      externalId,
    })
  }

  return { ok: true, entries }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}
