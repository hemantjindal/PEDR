import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import * as z from 'zod/v4'
import {
  OFFICE_MANAGEMENT_CATEGORIES, PROFESSIONAL_CRITERIA, RIBA_STAGES,
  type CriterionId, type OfficeCategoryId, type StageId,
} from '../pedr/constants'
import type { DraftEntry, Project } from '../pedr/types'
import { isDateKey, type DateKey } from '../pedr/week'

/**
 * An optional second pass over a parsed dump.
 *
 * The deterministic parser is the product; this makes it better on messy input.
 * Everything degrades cleanly: with no API key configured, `enrichEntries`
 * returns what it was given and says it did nothing. Nothing in the app
 * requires this to be switched on.
 *
 * Two hard boundaries, enforced in code and not merely asked for in the prompt:
 *
 *   1. The model may never set or change `minutes`. Hours are what a mentor
 *      signs and what the record sheet totals. They come from a stated duration
 *      or from a timesheet, or they stay zero. A model that guesses "probably
 *      about half a day" produces a number that looks exactly like a real one.
 *   2. The model may only choose from values that exist — a project on the
 *      user's own list, a stage in 0–7, a criterion in PC1–PC5. Anything else
 *      is dropped rather than written to the record.
 */

const MODEL = 'claude-opus-5'

/** Entries per request. Keeps the response bounded and the latency sane. */
const BATCH_SIZE = 30

const EnrichedEntry = z.object({
  index: z.number().int().describe('The index of the entry being corrected'),
  date: z.string().nullable().describe('YYYY-MM-DD, only if the parsed date is wrong'),
  activity: z.string().describe('A clear one-line description of the task, in the past tense'),
  detail: z.string().nullable().describe('Any remaining substance that does not belong in the one-liner'),
  projectRef: z.string().nullable().describe('The id of a project from the supplied list, or null'),
  officeCategory: z.string().nullable().describe('An office management category id, or null'),
  stage: z.number().int().nullable().describe('RIBA Plan of Work stage 0-7, or null if unclear'),
  criteria: z.array(z.string()).describe('Professional Criteria ids, PC1 to PC5, at most three'),
  people: z.array(z.string()).describe('Names of people dealt with, as written'),
  wentWrong: z.string().nullable().describe('Friction, mistake or surprise, quoted or closely paraphrased'),
  learned: z.string().nullable().describe('What was learned, if the text says'),
  confidence: z.number().describe('0 to 1: how sure you are this entry is right'),
})

const EnrichResponse = z.object({
  entries: z.array(EnrichedEntry),
})

export interface EnrichOptions {
  projects?: Project[]
  apiKey?: string
  /**
   * How hard the model should work. Extraction is not a reasoning-heavy task,
   * so this defaults to medium; raise it for very messy input.
   */
  effort?: 'low' | 'medium' | 'high'
  signal?: AbortSignal
}

export interface EnrichResult {
  entries: DraftEntry[]
  enriched: boolean
  warnings: string[]
  /** Null when the pass did not run. */
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } | null
}

export function isEnrichmentAvailable(apiKey = process.env.ANTHROPIC_API_KEY): boolean {
  return Boolean(apiKey && apiKey.trim())
}

export async function enrichEntries(
  raw: string,
  entries: DraftEntry[],
  opts: EnrichOptions = {},
): Promise<EnrichResult> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY
  const unchanged: EnrichResult = { entries, enriched: false, warnings: [], usage: null }

  if (!isEnrichmentAvailable(apiKey)) {
    return {
      ...unchanged,
      warnings: ['Model pass skipped: no ANTHROPIC_API_KEY configured. The parsed record is unchanged.'],
    }
  }
  if (entries.length === 0) return unchanged

  const client = new Anthropic({ apiKey })
  const projects = opts.projects ?? []
  const out = [...entries]
  const warnings: string[] = []
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }

  for (let start = 0; start < entries.length; start += BATCH_SIZE) {
    const batch = entries.slice(start, start + BATCH_SIZE)
    try {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        output_config: {
          format: zodOutputFormat(EnrichResponse),
          effort: opts.effort ?? 'medium',
        },
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            // The system prompt never changes between dumps, so it caches.
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: buildUserMessage(raw, batch, projects, start),
          },
        ],
      }, { signal: opts.signal })

      usage.inputTokens += response.usage.input_tokens
      usage.outputTokens += response.usage.output_tokens
      usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0

      if (response.stop_reason === 'refusal') {
        warnings.push('The model declined to process part of this dump. That part is unchanged.')
        continue
      }
      const parsed = response.parsed_output
      if (!parsed) {
        warnings.push('The model returned a response that could not be read. That part is unchanged.')
        continue
      }

      for (const patch of parsed.entries) {
        const target = out[patch.index]
        if (!target) continue
        out[patch.index] = applyPatch(target, patch, projects)
      }
    } catch (error) {
      warnings.push(describeError(error))
      // Keep the deterministic result for this batch and carry on with the next.
    }
  }

  return {
    entries: out,
    enriched: warnings.length < Math.ceil(entries.length / BATCH_SIZE),
    warnings,
    usage,
  }
}

/**
 * Apply a model suggestion to an entry, discarding anything invalid.
 *
 * This is the safety boundary. `minutes` and `minutesEstimated` are copied from
 * the original and never taken from the model.
 */
export function applyPatch(
  entry: DraftEntry,
  patch: z.infer<typeof EnrichedEntry>,
  projects: Project[],
): DraftEntry {
  const validStages = new Set<number>(RIBA_STAGES.map((s) => s.id))
  const validCriteria = new Set<string>(PROFESSIONAL_CRITERIA.map((c) => c.id))
  const validOffice = new Set<string>(OFFICE_MANAGEMENT_CATEGORIES.map((c) => c.id))
  const projectIds = new Set(projects.map((p) => p.id))

  const date: DateKey = patch.date && isDateKey(patch.date) ? patch.date : entry.date
  const projectId = patch.projectRef && projectIds.has(patch.projectRef) ? patch.projectRef : entry.projectId
  const stage =
    patch.stage !== null && validStages.has(patch.stage) ? (patch.stage as StageId) : entry.stage
  const officeCategory =
    patch.officeCategory && validOffice.has(patch.officeCategory)
      ? (patch.officeCategory as OfficeCategoryId)
      : entry.officeCategory

  const criteria = patch.criteria
    .filter((c): c is CriterionId => validCriteria.has(c))
    .slice(0, 3)

  return {
    ...entry,
    date,
    // Hours are never model-derived. This is the line that matters.
    minutes: entry.minutes,
    minutesEstimated: entry.minutesEstimated,
    projectId,
    projectHint: projectId ? null : entry.projectHint,
    officeCategory: projectId ? null : officeCategory,
    stage,
    activity: nonEmpty(patch.activity) ?? entry.activity,
    detail: nonEmpty(patch.detail) ?? entry.detail,
    people: patch.people.map((p) => p.trim()).filter(Boolean),
    criteria: criteria.length > 0 ? criteria : entry.criteria,
    wentWrong: nonEmpty(patch.wentWrong) ?? entry.wentWrong,
    learned: nonEmpty(patch.learned) ?? entry.learned,
    confidence: clamp01(patch.confidence, entry.confidence),
    provenance: entry.provenance,
  }
}

const SYSTEM_PROMPT = `You clean up rough work diaries kept by UK architectural assistants for their RIBA PEDR — the record of practical experience required before sitting the Part 3 exam.

You are given the raw text someone typed, and the entries a deterministic parser already extracted from it. Your job is to correct and improve those entries.

WHAT YOU MUST NOT DO
- Never invent facts. If the text does not say who was there, the people list is empty. If it does not say what went wrong, wentWrong is null.
- Never state or change hours. Durations are not yours to set and are ignored if you return them.
- Never choose a project that is not on the supplied list. If the work was on something else, leave projectRef null.
- Never soften or omit a mistake the writer admitted to. Those are the most valuable part of the record.

WHAT TO DO
- Rewrite each activity as one clear line in the past tense, naming what was actually done. Keep the writer's own technical vocabulary. "Worked on drawings" is not acceptable output if the text says which drawings.
- Split an entry into several only if the text plainly describes separate tasks; return them with the same index and they will be treated as one.
- Assign the RIBA Plan of Work stage the work belongs to, or null if genuinely unclear. Do not guess to fill the field.
- Assign up to three Professional Criteria.
- Extract names of people dealt with. A role with no name ("the QS") is not a name.
- Quote or closely paraphrase anything that went wrong, and anything the writer says they learned.
- Set confidence honestly. Below 0.55 the entry is shown to the user for confirmation, which is the right outcome when you are unsure.

RIBA PLAN OF WORK 2020 STAGES
${RIBA_STAGES.map((s) => `${s.id} — ${s.name}: ${s.blurb}`).join('\n')}

ARB PROFESSIONAL CRITERIA AT PART 3
${PROFESSIONAL_CRITERIA.map((c) => `${c.id} — ${c.name}: ${c.blurb}`).join('\n')}

OFFICE MANAGEMENT CATEGORIES (non-project time, a separate section of the record sheet)
${OFFICE_MANAGEMENT_CATEGORIES.map((c) => `${c.id} — ${c.name}: ${c.blurb}`).join('\n')}`

function buildUserMessage(
  raw: string,
  batch: DraftEntry[],
  projects: Project[],
  offset: number,
): string {
  const projectList =
    projects.length > 0
      ? projects
          .filter((p) => !p.archived)
          .map((p) => `- id "${p.id}": ${p.code} — ${p.name}${p.aliases.length ? ` (also called: ${p.aliases.join(', ')})` : ''}`)
          .join('\n')
      : '(none on record — leave projectRef null)'

  const parsed = batch
    .map((entry, i) =>
      JSON.stringify({
        index: offset + i,
        date: entry.date,
        activity: entry.activity,
        detail: entry.detail,
        projectId: entry.projectId,
        projectHint: entry.projectHint,
        stage: entry.stage,
        officeCategory: entry.officeCategory,
        people: entry.people,
        criteria: entry.criteria,
        wentWrong: entry.wentWrong,
        learned: entry.learned,
        source: entry.source,
        fromInput: entry.provenance ?? null,
      }),
    )
    .join('\n')

  return `PROJECTS ON RECORD
${projectList}

RAW TEXT AS TYPED
"""
${raw}
"""

ENTRIES THE PARSER EXTRACTED (correct these; return one object per index)
${parsed}`
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'Model pass skipped: the ANTHROPIC_API_KEY was rejected. The parsed record is unchanged.'
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Model pass skipped: rate limited. Try again shortly — the parsed record is unchanged.'
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `Model pass skipped: the request was rejected (${error.message}). The parsed record is unchanged.`
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Model pass skipped: could not reach the API. The parsed record is unchanged.'
  }
  if (error instanceof Anthropic.APIError) {
    return `Model pass skipped: API error ${error.status}. The parsed record is unchanged.`
  }
  return 'Model pass skipped: unexpected error. The parsed record is unchanged.'
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function clamp01(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(1, value))
}
