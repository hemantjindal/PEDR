import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db, schema } from './db/client'
import type {
  CriterionId, ExperienceCategory, ExperienceLocation, OfficeCategoryId, StageId,
} from './pedr/constants'
import { REQUIREMENTS } from './pedr/constants'
import { computeCoverage, coverageHeadline } from './pedr/coverage'
import { planSheetPeriods, summariseDeadlines } from './pedr/deadlines'
import { computeProgress } from './pedr/progress'
import {
  bestStreak, currentStreak, findGaps, findThinWeeks, rollUpByMonth, scoreWeeks,
} from './pedr/scoring'
import type {
  DraftEntry, Employment, Entry, EntrySource, Project, Sheet, SheetContent, WeekNote,
} from './pedr/types'
import {
  addMonths, todayKey, weekEndKey, weekIdOf, weekStartKey, type DateKey, type WeekId,
} from './pedr/week'

/**
 * Everything between the database and the domain.
 *
 * Rows go in one direction only: SQL rows are mapped to domain types here and
 * nowhere else, so the shapes in `pedr/` never have to know that confidence is
 * stored as an integer percentage or that booleans are 0 and 1.
 */

const now = () => new Date().toISOString()

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

type EntryRow = typeof schema.entries.$inferSelect

function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    userId: row.userId,
    dumpId: row.dumpId,
    date: row.date,
    minutes: row.minutes,
    minutesEstimated: row.minutesEstimated,
    projectId: row.projectId,
    projectHint: row.projectHint,
    stage: (row.stage ?? null) as StageId | null,
    officeCategory: (row.officeCategory ?? null) as OfficeCategoryId | null,
    activity: row.activity,
    detail: row.detail,
    people: row.people ?? [],
    criteria: (row.criteria ?? []) as CriterionId[],
    wentWrong: row.wentWrong,
    learned: row.learned,
    confidence: row.confidence / 100,
    source: row.source as EntrySource,
    verified: row.verified,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function getEntries(
  userId: string,
  opts: { from?: DateKey; to?: DateKey; verifiedOnly?: boolean } = {},
): Promise<Entry[]> {
  const filters = [eq(schema.entries.userId, userId)]
  if (opts.from) filters.push(gte(schema.entries.date, opts.from))
  if (opts.to) filters.push(lte(schema.entries.date, opts.to))
  if (opts.verifiedOnly) filters.push(eq(schema.entries.verified, true))

  const rows = await db
    .select()
    .from(schema.entries)
    .where(and(...filters))
    .orderBy(asc(schema.entries.date), asc(schema.entries.createdAt))
  return rows.map(toEntry)
}

export async function getEntriesForWeek(userId: string, weekId: WeekId): Promise<Entry[]> {
  return getEntries(userId, { from: weekStartKey(weekId), to: weekEndKey(weekId) })
}

export async function getProjects(userId: string): Promise<Project[]> {
  const rows = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(asc(schema.projects.archived), asc(schema.projects.name))
  return rows.map((row) => ({ ...row, aliases: row.aliases ?? [] }))
}

export async function getEmployments(userId: string): Promise<Employment[]> {
  const rows = await db
    .select()
    .from(schema.employments)
    .where(eq(schema.employments.userId, userId))
    .orderBy(desc(schema.employments.startDate))
  return rows.map((row) => ({
    ...row,
    location: row.location as ExperienceLocation,
    category: row.category as ExperienceCategory,
    // Stored in tenths of an hour so the column can stay an integer.
    weeklyHours: row.weeklyHours / 10,
  }))
}

export async function getWeekNotes(userId: string): Promise<WeekNote[]> {
  return db.select().from(schema.weekNotes).where(eq(schema.weekNotes.userId, userId))
}

export async function getWeekNote(userId: string, weekId: WeekId): Promise<WeekNote | null> {
  const rows = await db
    .select()
    .from(schema.weekNotes)
    .where(and(eq(schema.weekNotes.userId, userId), eq(schema.weekNotes.weekId, weekId)))
    .limit(1)
  return rows[0] ?? null
}

export async function getSheets(userId: string): Promise<Sheet[]> {
  const rows = await db
    .select()
    .from(schema.sheets)
    .where(eq(schema.sheets.userId, userId))
    .orderBy(asc(schema.sheets.periodStart))
  return rows.map((row) => ({ ...row, content: row.content as SheetContent })) as Sheet[]
}

export async function getDumps(userId: string, limit = 30) {
  return db
    .select()
    .from(schema.dumps)
    .where(eq(schema.dumps.userId, userId))
    .orderBy(desc(schema.dumps.createdAt))
    .limit(limit)
}

/** Names already on the record, so the parser recognises them next time. */
export async function getKnownPeople(userId: string, limit = 200): Promise<string[]> {
  const rows = await db
    .select({ people: schema.entries.people })
    .from(schema.entries)
    .where(eq(schema.entries.userId, userId))
    .orderBy(desc(schema.entries.date))
    .limit(500)

  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const person of row.people ?? []) {
      const name = person.trim()
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name)
}

export async function countUnverified(userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.entries)
    .where(and(eq(schema.entries.userId, userId), eq(schema.entries.verified, false)))
  return Number(rows[0]?.n ?? 0)
}

// ---------------------------------------------------------------------------
// The dashboard: one query set, one shape
// ---------------------------------------------------------------------------

export interface Dashboard {
  today: DateKey
  entries: Entry[]
  projects: Project[]
  employments: Employment[]
  notes: WeekNote[]
  sheets: Sheet[]
  scores: ReturnType<typeof scoreWeeks>
  months: ReturnType<typeof rollUpByMonth>
  gaps: ReturnType<typeof findGaps>
  thinWeeks: ReturnType<typeof findThinWeeks>
  coverage: ReturnType<typeof computeCoverage>
  coverageNote: string | null
  progress: ReturnType<typeof computeProgress>
  deadlines: ReturnType<typeof summariseDeadlines>
  streak: number
  best: number
  unverified: number
  /** The first week we show. Where the record starts, or a year back. */
  from: WeekId
  to: WeekId
}

export async function getDashboard(
  userId: string,
  opts: { today?: DateKey; experienceStart?: DateKey | null } = {},
): Promise<Dashboard> {
  const today = opts.today ?? todayKey()

  const [entries, projects, employments, notes, sheets, unverified] = await Promise.all([
    getEntries(userId),
    getProjects(userId),
    getEmployments(userId),
    getWeekNotes(userId),
    getSheets(userId),
    countUnverified(userId),
  ])

  // The record starts at the earliest of: a declared start, the first
  // employment, the first entry. Falling back to a year of empty weeks rather
  // than nothing, so a new account still shows the shape of what is coming.
  const candidates = [
    opts.experienceStart ?? null,
    employments[employments.length - 1]?.startDate ?? null,
    entries[0]?.date ?? null,
  ].filter((d): d is DateKey => Boolean(d))

  const start = candidates.length > 0
    ? candidates.sort()[0]
    : addMonths(today, -12)

  const from = weekIdOf(start)
  const to = weekIdOf(today)

  const scores = scoreWeeks(from, to, entries, notes)
  const recentFrom = addMonths(today, -REQUIREMENTS.recentWindowMonths)
  const coverage = computeCoverage(entries, { recentFrom })

  const periods = opts.experienceStart || candidates.length > 0
    ? planSheetPeriods(start, { today, sheets })
    : []

  return {
    today,
    entries,
    projects,
    employments,
    notes,
    sheets,
    scores,
    months: rollUpByMonth(scores),
    gaps: findGaps(scores),
    thinWeeks: findThinWeeks(scores),
    coverage,
    coverageNote: coverageHeadline(coverage),
    progress: computeProgress(entries, scores, employments, { today }),
    deadlines: summariseDeadlines(periods),
    streak: currentStreak(scores),
    best: bestStreak(scores),
    unverified,
    from,
    to,
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createDump(input: {
  userId: string
  raw: string
  kind: string
  note?: string | null
}): Promise<string> {
  const id = randomUUID()
  await db.insert(schema.dumps).values({
    id,
    userId: input.userId,
    raw: input.raw,
    kind: input.kind,
    status: 'pending',
    note: input.note ?? null,
    createdAt: now(),
  })
  return id
}

export async function saveParsedEntries(input: {
  userId: string
  dumpId: string
  entries: DraftEntry[]
  parserVersion: string
  enriched: boolean
  /** Accept without review; otherwise low-confidence rows wait for a human. */
  autoVerify?: boolean
}): Promise<Entry[]> {
  const timestamp = now()
  const rows = input.entries.map((entry) => ({
    id: randomUUID(),
    userId: input.userId,
    dumpId: input.dumpId,
    date: entry.date,
    minutes: Math.max(0, Math.round(entry.minutes)),
    minutesEstimated: entry.minutesEstimated,
    projectId: entry.projectId,
    projectHint: entry.projectHint,
    stage: entry.stage,
    officeCategory: entry.officeCategory,
    activity: entry.activity.slice(0, 2000),
    detail: entry.detail?.slice(0, 8000) ?? null,
    people: entry.people,
    criteria: entry.criteria,
    wentWrong: entry.wentWrong?.slice(0, 4000) ?? null,
    learned: entry.learned?.slice(0, 4000) ?? null,
    confidence: Math.round(Math.max(0, Math.min(1, entry.confidence)) * 100),
    source: entry.source,
    verified: input.autoVerify ?? false,
    provenance: entry.provenance ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))

  if (rows.length > 0) {
    // Chunked: SQLite has a bound-parameter ceiling and a big paste can exceed it.
    for (let i = 0; i < rows.length; i += 50) {
      await db.insert(schema.entries).values(rows.slice(i, i + 50))
    }
  }

  await db
    .update(schema.dumps)
    .set({
      status: 'applied',
      parserVersion: input.parserVersion,
      enriched: input.enriched,
      entryCount: rows.length,
      processedAt: timestamp,
    })
    .where(eq(schema.dumps.id, input.dumpId))

  return rows.map(toEntry)
}

export async function updateEntry(
  userId: string,
  entryId: string,
  patch: Partial<Pick<Entry,
    'date' | 'minutes' | 'minutesEstimated' | 'projectId' | 'projectHint' | 'stage' |
    'officeCategory' | 'activity' | 'detail' | 'people' | 'criteria' | 'wentWrong' |
    'learned' | 'verified'
  >>,
): Promise<void> {
  const values: Record<string, unknown> = { updatedAt: now() }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) values[key] = value
  }
  if (patch.minutes !== undefined) values.minutes = Math.max(0, Math.round(patch.minutes))
  // Any human edit is a confirmation of the row.
  if (patch.verified === undefined) values.verified = true

  await db
    .update(schema.entries)
    .set(values)
    .where(and(eq(schema.entries.id, entryId), eq(schema.entries.userId, userId)))
}

export async function verifyEntries(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db
    .update(schema.entries)
    .set({ verified: true, updatedAt: now() })
    .where(and(eq(schema.entries.userId, userId), inArray(schema.entries.id, ids)))
}

export async function deleteEntries(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db
    .delete(schema.entries)
    .where(and(eq(schema.entries.userId, userId), inArray(schema.entries.id, ids)))
}

export async function upsertWeekNote(
  userId: string,
  weekId: WeekId,
  patch: Partial<Omit<WeekNote, 'userId' | 'weekId' | 'updatedAt'>>,
): Promise<void> {
  const timestamp = now()
  await db
    .insert(schema.weekNotes)
    .values({
      userId,
      weekId,
      did: patch.did ?? '',
      learned: patch.learned ?? '',
      wentWell: patch.wentWell ?? '',
      wentWrong: patch.wentWrong ?? '',
      next: patch.next ?? '',
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [schema.weekNotes.userId, schema.weekNotes.weekId],
      set: { ...patch, updatedAt: timestamp },
    })
}

export async function createProject(
  userId: string,
  input: Partial<Project> & { name: string },
): Promise<string> {
  const id = randomUUID()
  await db.insert(schema.projects).values({
    id,
    userId,
    code: input.code ?? '',
    name: input.name,
    client: input.client ?? null,
    sector: input.sector ?? null,
    valueGbp: input.valueGbp ?? null,
    procurement: input.procurement ?? null,
    contractForm: input.contractForm ?? null,
    isCaseStudy: input.isCaseStudy ?? false,
    notes: input.notes ?? null,
    aliases: input.aliases ?? [],
    archived: false,
    createdAt: now(),
  })
  return id
}

export async function updateProject(
  userId: string,
  projectId: string,
  patch: Partial<Project>,
): Promise<void> {
  const values: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && !['id', 'userId', 'createdAt'].includes(key)) values[key] = value
  }
  if (Object.keys(values).length === 0) return
  await db
    .update(schema.projects)
    .set(values)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
}

export async function createEmployment(
  userId: string,
  input: Partial<Employment> & { employer: string; startDate: DateKey },
): Promise<string> {
  const id = randomUUID()
  await db.insert(schema.employments).values({
    id,
    userId,
    employer: input.employer,
    officeLocation: input.officeLocation ?? null,
    location: input.location ?? 'UK',
    category: input.category ?? 'i',
    role: input.role ?? null,
    supervisorName: input.supervisorName ?? null,
    supervisorRegBody: input.supervisorRegBody ?? 'ARB',
    supervisorRegNumber: input.supervisorRegNumber ?? null,
    mentorName: input.mentorName ?? null,
    mentorEmail: input.mentorEmail ?? null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    weeklyHours: Math.round((input.weeklyHours ?? 37.5) * 10),
    createdAt: now(),
  })
  return id
}

export async function updateUser(
  userId: string,
  patch: { name?: string; teamsName?: string | null; experienceStart?: DateKey | null; targetExamDate?: DateKey | null },
): Promise<void> {
  const values: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) values[key] = value
  }
  if (Object.keys(values).length === 0) return
  await db.update(schema.users).set(values).where(eq(schema.users.id, userId))
}

export async function findUserByCalendarToken(token: string) {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.calendarToken, token))
    .limit(1)
  return rows[0] ?? null
}
