import type { DraftEntry, DumpKind, EntrySource, Project } from '../pedr/types'
import { REVIEW_THRESHOLD } from '../pedr/types'
import { todayKey, type DateKey } from '../pedr/week'
import { classify } from './classify'
import type { DateContext } from './dates'
import { allocateDayMinutes, parseDuration, STANDARD_DAY_MINUTES, stripDuration } from './duration'
import { parseFreeform, type FreeformSegment } from './freeform'
import { extractPeople } from './people'
import { matchProject } from './projects'
import { isNoise, parseTeams } from './teams'
import { looksLikeTimesheet, parseTimesheet } from './timesheet'

export const PARSER_VERSION = '1.0.0'

export interface ParseOptions {
  /** The day the dump was written. Bare weekdays resolve against it. */
  reference?: DateKey
  projects?: Project[]
  /** People already on the record, matched with high confidence. */
  knownPeople?: string[]
  /** Your Teams display name, so we know which messages are yours. */
  me?: string
  /** Length of a full working day, for "half day" and for filling blanks. */
  standardDayMinutes?: number
  /**
   * Fill in durations for entries that state none, by spreading a standard day
   * across the day's entries. Off by default: a fabricated number a mentor
   * signs is worse than a blank one.
   */
  fillMissingDurations?: boolean
  /** Force a parser rather than detecting one. */
  kind?: DumpKind
}

export interface ParseResult {
  kind: DumpKind
  entries: DraftEntry[]
  warnings: string[]
  parserVersion: string
  stats: {
    /** Entries confident enough to accept without review. */
    confident: number
    /** Entries held back for confirmation. */
    needsReview: number
    days: number
    totalMinutes: number
  }
}

/**
 * Work out what has been pasted in.
 *
 * Order matters. A timesheet export is the most structured and the easiest to
 * be sure about, so it is tested first. A Teams conversation is recognised by
 * its author-and-timestamp shape. Anything else is prose.
 */
export function detectDumpKind(raw: string): DumpKind {
  const text = raw.trim()
  if (!text) return 'unknown'
  if (looksLikeTimesheet(text)) return 'timesheet'
  if (looksLikeTeams(text)) return 'teams'
  return 'freeform'
}

function looksLikeTeams(raw: string): boolean {
  const lines = raw.split('\n').filter((l) => l.trim())
  if (lines.length < 3) return false

  const patterns = [
    /^\s*\[\s*\d{1,2}[:.]\d{2}/, // [10:32] Name
    /^\s*<v\s+[^>]+>/i, // WebVTT speaker
    /^\s*[^\d[\]<>|]{2,60}?\s{1,}\d{1,2}[:.]\d{2}\s*(am|pm)?\s*$/i, // Name  10:32
    /^\s*\d{1,2}[:.]\d{2}\s*(am|pm)?\s*$/i, // a bare time under a name
  ]
  const hits = lines.filter((l) => patterns.some((p) => p.test(l))).length
  // Two or more speaker turns, and enough of the text to be a conversation.
  return hits >= 2 && hits / lines.length > 0.12
}

export function parseDump(raw: string, opts: ParseOptions = {}): ParseResult {
  const reference = opts.reference ?? todayKey()
  const kind = opts.kind && opts.kind !== 'unknown' ? opts.kind : detectDumpKind(raw)
  const ctx: DateContext = { reference }

  let entries: DraftEntry[] = []
  let warnings: string[] = []

  switch (kind) {
    case 'timesheet': {
      const parsed = parseTimesheet(raw, ctx)
      warnings = parsed.warnings
      if (parsed.unmappedColumns.length > 0) {
        warnings.push(`Columns ignored: ${parsed.unmappedColumns.join(', ')}.`)
      }
      entries = parsed.rows.map((row) =>
        buildEntry({
          text: [row.project, row.description].filter(Boolean).join(' — ') || 'Timesheet entry',
          activityText: row.description || row.project || 'Timesheet entry',
          date: row.date,
          dateConfidence: 1,
          minutes: row.minutes,
          stageOverride: row.stage,
          projectText: row.project ?? '',
          provenance: `timesheet row ${row.line}`,
          source: 'timesheet',
          opts,
        }),
      )
      break
    }

    case 'teams': {
      const parsed = parseTeams(raw, { ...ctx, me: opts.me })
      warnings = parsed.warnings
      entries = teamsToEntries(parsed, reference, opts)
      break
    }

    default: {
      const parsed = parseFreeform(raw, ctx)
      warnings = parsed.warnings
      entries = parsed.segments.map((segment) => fromFreeform(segment, opts))
      break
    }
  }

  if (opts.fillMissingDurations) {
    entries = fillDurations(entries, opts.standardDayMinutes ?? STANDARD_DAY_MINUTES)
  }

  const days = new Set(entries.map((e) => e.date)).size
  return {
    kind,
    entries,
    warnings,
    parserVersion: PARSER_VERSION,
    stats: {
      confident: entries.filter((e) => e.confidence >= REVIEW_THRESHOLD).length,
      needsReview: entries.filter((e) => e.confidence < REVIEW_THRESHOLD).length,
      days,
      totalMinutes: entries.reduce((sum, e) => sum + e.minutes, 0),
    },
  }
}

function fromFreeform(segment: FreeformSegment, opts: ParseOptions): DraftEntry {
  return buildEntry({
    text: segment.text,
    activityText: segment.text,
    date: segment.date,
    dateConfidence: segment.dateConfidence,
    minutes: null,
    stageOverride: null,
    projectText: segment.text,
    provenance: segment.provenance,
    source: 'dump',
    opts,
  })
}

/**
 * Turn a conversation into entries.
 *
 * Only your own messages become activities — what other people said is context,
 * not evidence of what you did. But everyone in the thread becomes a person you
 * dealt with, which is the part of a chat log that is genuinely hard to
 * reconstruct from memory and easy to read off a transcript.
 */
function teamsToEntries(
  parsed: ReturnType<typeof parseTeams>,
  reference: DateKey,
  opts: ParseOptions,
): DraftEntry[] {
  const byDay = new Map<DateKey, typeof parsed.messages>()
  for (const message of parsed.messages) {
    const date = message.date ?? reference
    const bucket = byDay.get(date)
    if (bucket) bucket.push(message)
    else byDay.set(date, [message])
  }

  const entries: DraftEntry[] = []
  const me = parsed.me?.toLowerCase() ?? null

  for (const [date, messages] of byDay) {
    const others = [...new Set(messages.map((m) => m.author))].filter(
      (a) => a.toLowerCase() !== me,
    )
    const mine = messages.filter(
      (m) => (!me || m.author.toLowerCase() === me) && !isNoise(m.text),
    )

    for (const message of mine) {
      const entry = buildEntry({
        text: message.text,
        activityText: message.text,
        date,
        // Chat is noisy evidence, and a message about a job is not proof you
        // worked on it that day. Everything from here lands in review.
        dateConfidence: message.date ? 0.7 : 0.4,
        minutes: null,
        stageOverride: null,
        projectText: message.text,
        provenance: `Teams, ${message.time ?? 'no time'} — ${truncate(message.text, 60)}`,
        source: 'teams',
        opts,
      })
      // Everyone in the thread that day counts as someone you dealt with.
      entry.people = [...new Set([...entry.people, ...others])]
      entry.confidence = Math.min(entry.confidence, 0.5)
      entries.push(entry)
    }
  }

  return entries
}

interface BuildArgs {
  text: string
  activityText: string
  date: DateKey
  dateConfidence: number
  minutes: number | null
  stageOverride: number | null
  projectText: string
  provenance: string
  source: EntrySource
  opts: ParseOptions
}

function buildEntry(args: BuildArgs): DraftEntry {
  const { text, date, dateConfidence, provenance, source, opts } = args
  const standardDay = opts.standardDayMinutes ?? STANDARD_DAY_MINUTES

  const duration = args.minutes === null ? parseDuration(text, { standardDayMinutes: standardDay }) : null
  const minutes = args.minutes ?? duration?.minutes ?? 0

  const project = matchProject(args.projectText, opts.projects ?? [])
  const classification = classify(text)
  const { people } = extractPeople(text, opts.knownPeople ?? [])

  // Strip the mechanics out of the activity line so the sheet reads cleanly.
  const activity = tidy(stripDuration(args.activityText, duration?.matchedText ?? null))

  const stage =
    args.stageOverride !== null ? (args.stageOverride as DraftEntry['stage']) : classification.stage

  return {
    date,
    minutes,
    minutesEstimated: false,
    projectId: project.projectId,
    projectHint: project.projectId ? null : project.hint,
    stage,
    officeCategory: project.officeCategory,
    activity: activity || text.trim(),
    detail: activity && activity !== text.trim() ? text.trim() : null,
    people,
    criteria: classification.criteria,
    wentWrong: classification.wentWrong,
    learned: classification.learned,
    confidence: combineConfidence({
      date: dateConfidence,
      project: project.confidence,
      stage: args.stageOverride !== null ? 1 : classification.stageConfidence,
      source,
    }),
    source,
    provenance,
  }
}

/**
 * One number for "how much should we trust this row".
 *
 * The date dominates. A misfiled date corrupts a week, a quarter and every
 * derived figure on the dashboard, whereas a missing stage tag is a dropdown
 * somebody fixes in two seconds.
 */
function combineConfidence(parts: {
  date: number
  project: number
  stage: number
  source: EntrySource
}): number {
  const base = parts.date * 0.6 + parts.project * 0.25 + parts.stage * 0.15
  const sourceCeiling: Record<EntrySource, number> = {
    manual: 1, timesheet: 0.98, import: 0.9, dump: 0.9, teams: 0.6,
  }
  return Math.round(Math.min(base, sourceCeiling[parts.source]) * 100) / 100
}

function fillDurations(entries: DraftEntry[], standardDay: number): DraftEntry[] {
  const byDay = new Map<DateKey, DraftEntry[]>()
  for (const entry of entries) {
    const bucket = byDay.get(entry.date)
    if (bucket) bucket.push(entry)
    else byDay.set(entry.date, [entry])
  }
  const out: DraftEntry[] = []
  for (const group of byDay.values()) {
    out.push(...allocateDayMinutes(group, standardDay))
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Tidy an activity line: trim connectives and leftover punctuation. */
function tidy(text: string): string {
  return text
    .replace(/^[\s\-–—:,.]+/, '')
    .replace(/[\s\-–—:,]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

export { parseFreeform, parseTeams, parseTimesheet, classify, extractPeople, matchProject }
export { parseDuration, allocateDayMinutes } from './duration'
