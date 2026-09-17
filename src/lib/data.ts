import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db, schema } from './db/client'
import type {
  CriterionId, ExperienceCategory, ExperienceLocation, OfficeCategoryId, ParticipationId, StageId,
} from './pedr/constants'
import { REQUIREMENTS } from './pedr/constants'
import { computeCoverage, coverageHeadline, participationTrend } from './pedr/coverage'
import { buildMissions } from './pedr/missions'
import { examine } from './pedr/examiner'
import { planSheetPeriods, summariseDeadlines } from './pedr/deadlines'
import { computeProgress } from './pedr/progress'
import {
  bestStreak, currentStreak, findGaps, findThinWeeks, rollUpByMonth, scoreWeeks,
} from './pedr/scoring'
import type {
  CalendarFeed, DraftEntry, Employment, Entry, EntrySource, Project, Sheet, SheetContent, WeekNote,
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
    participation: (row.participation ?? 'participant') as ParticipationId,
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
    provenance: row.provenance,
    externalId: row.externalId ?? null,
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
  participation: ReturnType<typeof participationTrend>
  missions: ReturnType<typeof buildMissions>
  exam: ReturnType<typeof examine>
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

  const coverageResult = coverage
  const progressResult = computeProgress(entries, scores, employments, { today })
  const deadlineResult = summariseDeadlines(periods)
  const participationResult = participationTrend(entries)

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
    participation: participationResult,
    progress: progressResult,
    deadlines: deadlineResult,
    exam: examine({ entries, projects }),
    missions: buildMissions({
      thisWeek: scores[scores.length - 1] ?? null,
      scores,
      coverage: coverageResult,
      deadlines: deadlineResult,
      progress: progressResult,
      participation: participationResult,
      hasExperienceStart: Boolean(opts.experienceStart),
      hasEmployment: employments.length > 0,
      projectCount: projects.filter((p) => !p.archived).length,
    }),
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

  // Rows carrying an external id may already be here from an earlier sync.
  // The unique index would reject them silently, and the count returned from
  // here becomes "14 meetings saved" on somebody's screen — so it has to be
  // the number that actually landed, not the number attempted.
  const externalIds = input.entries
    .map((e) => e.externalId)
    .filter((id): id is string => Boolean(id))
  const present = externalIds.length > 0
    ? await findImportedExternalIds(input.userId, externalIds)
    : new Set<string>()

  const rows = input.entries
    .filter((entry) => !entry.externalId || !present.has(entry.externalId))
    .map((entry) => ({
      id: randomUUID(),
      userId: input.userId,
      dumpId: input.dumpId,
      date: entry.date,
      minutes: Math.max(0, Math.round(entry.minutes)),
      minutesEstimated: entry.minutesEstimated,
      participation: entry.participation ?? 'participant',
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
      externalId: entry.externalId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))

  if (rows.length > 0) {
    // Chunked: SQLite has a bound-parameter ceiling and a big paste can exceed it.
    for (let i = 0; i < rows.length; i += 50) {
      // A row carrying an external id may already be here from an earlier sync.
      // Letting the unique index decide is the only way two syncs racing each
      // other cannot double-count a meeting.
      await db.insert(schema.entries).values(rows.slice(i, i + 50)).onConflictDoNothing()
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
  patch: {
    name?: string
    teamsName?: string | null
    experienceStart?: DateKey | null
    targetExamDate?: DateKey | null
    part2School?: string | null
    practiceSize?: string | null
    onboardedAt?: string | null
  },
): Promise<void> {
  const values: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) values[key] = value
  }
  if (Object.keys(values).length === 0) return
  await db.update(schema.users).set(values).where(eq(schema.users.id, userId))
}

/** The account a background job is working on behalf of. */
export async function findUserById(id: string) {
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findUserByCalendarToken(token: string) {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.calendarToken, token))
    .limit(1)
  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// Linked calendars
// ---------------------------------------------------------------------------

type FeedRow = typeof schema.calendarFeeds.$inferSelect

function toFeed(row: FeedRow): CalendarFeed {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    url: row.url,
    ignore: row.ignore ?? [],
    enabled: row.enabled,
    lastSyncedAt: row.lastSyncedAt,
    lastImported: row.lastImported,
    lastSkipped: row.lastSkipped,
    lastError: row.lastError,
    createdAt: row.createdAt,
  }
}

export async function getCalendarFeeds(userId: string): Promise<CalendarFeed[]> {
  const rows = await db
    .select()
    .from(schema.calendarFeeds)
    .where(eq(schema.calendarFeeds.userId, userId))
    .orderBy(asc(schema.calendarFeeds.createdAt))
  return rows.map(toFeed)
}

export async function getCalendarFeed(userId: string, id: string): Promise<CalendarFeed | null> {
  const rows = await db
    .select()
    .from(schema.calendarFeeds)
    .where(and(eq(schema.calendarFeeds.userId, userId), eq(schema.calendarFeeds.id, id)))
    .limit(1)
  return rows[0] ? toFeed(rows[0]) : null
}

export async function createCalendarFeed(input: {
  userId: string
  name: string
  url: string | null
  ignore?: string[]
}): Promise<CalendarFeed> {
  const id = randomUUID()
  const row = {
    id,
    userId: input.userId,
    name: input.name.slice(0, 120) || 'My calendar',
    url: input.url,
    ignore: input.ignore ?? [],
    enabled: true,
    lastSyncedAt: null,
    lastImported: 0,
    lastSkipped: 0,
    lastError: null,
    createdAt: now(),
  }
  await db.insert(schema.calendarFeeds).values(row)
  return toFeed(row)
}

export async function updateCalendarFeed(
  userId: string,
  id: string,
  patch: Partial<Pick<CalendarFeed,
    'name' | 'url' | 'ignore' | 'enabled' | 'lastSyncedAt' | 'lastImported' | 'lastSkipped' | 'lastError'
  >>,
): Promise<void> {
  await db
    .update(schema.calendarFeeds)
    .set(patch)
    .where(and(eq(schema.calendarFeeds.userId, userId), eq(schema.calendarFeeds.id, id)))
}

export async function deleteCalendarFeed(userId: string, id: string): Promise<void> {
  await db
    .delete(schema.calendarFeeds)
    .where(and(eq(schema.calendarFeeds.userId, userId), eq(schema.calendarFeeds.id, id)))
}

/**
 * Which of these external ids are already on the record.
 *
 * The unique index is what actually guarantees a meeting is never counted
 * twice; this is so the review screen can say "14 new, 62 already imported"
 * rather than showing somebody a list they have seen before.
 */
export async function findImportedExternalIds(
  userId: string,
  ids: string[],
): Promise<Set<string>> {
  const found = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    if (chunk.length === 0) continue
    const rows = await db
      .select({ externalId: schema.entries.externalId })
      .from(schema.entries)
      .where(and(
        eq(schema.entries.userId, userId),
        inArray(schema.entries.externalId, chunk),
      ))
    for (const row of rows) if (row.externalId) found.add(row.externalId)
  }
  return found
}

/* --- Connected calendars ---------------------------------------------------
   A connection is an account this app is authorised against, as opposed to a
   feed, which is a URL somebody pasted. The tokens on these rows are encrypted
   before they get here; this layer only stores what it is handed.
--------------------------------------------------------------------------- */

export type CalendarConnection = typeof schema.calendarConnections.$inferSelect

export async function getConnections(userId: string): Promise<CalendarConnection[]> {
  return db
    .select()
    .from(schema.calendarConnections)
    .where(eq(schema.calendarConnections.userId, userId))
    .orderBy(asc(schema.calendarConnections.createdAt))
}

export async function getConnection(userId: string, id: string): Promise<CalendarConnection | null> {
  const rows = await db
    .select()
    .from(schema.calendarConnections)
    .where(and(
      eq(schema.calendarConnections.userId, userId),
      eq(schema.calendarConnections.id, id),
    ))
    .limit(1)
  return rows[0] ?? null
}

/**
 * The connection a push notification belongs to.
 *
 * A webhook arrives with no session and no user — the channel id is the only
 * thing tying it to an account, which is why it is indexed and why the stored
 * channel secret is checked before anything is done with it.
 */
export async function findConnectionByChannel(channelId: string): Promise<CalendarConnection | null> {
  const rows = await db
    .select()
    .from(schema.calendarConnections)
    .where(eq(schema.calendarConnections.channelId, channelId))
    .limit(1)
  return rows[0] ?? null
}

/** By id alone: the webhook and cron paths have no session to scope by. */
export async function getConnectionById(id: string): Promise<CalendarConnection | null> {
  const rows = await db
    .select()
    .from(schema.calendarConnections)
    .where(eq(schema.calendarConnections.id, id))
    .limit(1)
  return rows[0] ?? null
}

/** Connections due a sync, oldest first. Used by the scheduled safety net. */
export async function getStaleConnections(before: string, limit = 50): Promise<CalendarConnection[]> {
  return db
    .select()
    .from(schema.calendarConnections)
    .where(eq(schema.calendarConnections.enabled, true))
    .orderBy(asc(sql`coalesce(${schema.calendarConnections.lastSyncedAt}, '')`))
    .limit(limit)
    .then((rows) => rows.filter((row) => !row.lastSyncedAt || row.lastSyncedAt < before))
}

export async function upsertConnection(input: {
  userId: string
  provider: string
  accountEmail: string
  accountName: string | null
  calendarId: string
  calendarName: string
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  scope: string | null
  windowFrom: string | null
}): Promise<CalendarConnection> {
  // Reconnecting the same calendar replaces the credentials rather than
  // stacking a second row that syncs the same events.
  const existing = await db
    .select()
    .from(schema.calendarConnections)
    .where(and(
      eq(schema.calendarConnections.userId, input.userId),
      eq(schema.calendarConnections.provider, input.provider),
      eq(schema.calendarConnections.calendarId, input.calendarId),
    ))
    .limit(1)

  if (existing[0]) {
    await db
      .update(schema.calendarConnections)
      .set({
        accountEmail: input.accountEmail,
        accountName: input.accountName,
        calendarName: input.calendarName,
        accessToken: input.accessToken,
        // A refresh grant is not always reissued; keep the one that works.
        ...(input.refreshToken ? { refreshToken: input.refreshToken } : {}),
        expiresAt: input.expiresAt,
        scope: input.scope,
        enabled: true,
        lastError: null,
      })
      .where(eq(schema.calendarConnections.id, existing[0].id))
    return (await db
      .select()
      .from(schema.calendarConnections)
      .where(eq(schema.calendarConnections.id, existing[0].id))
      .limit(1))[0]
  }

  const row = {
    id: randomUUID(),
    userId: input.userId,
    provider: input.provider,
    accountEmail: input.accountEmail,
    accountName: input.accountName,
    calendarId: input.calendarId,
    calendarName: input.calendarName,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: input.expiresAt,
    scope: input.scope,
    syncCursor: null,
    windowFrom: input.windowFrom,
    channelId: null,
    channelResourceId: null,
    channelExpiresAt: null,
    channelSecret: null,
    ignore: [] as string[],
    enabled: true,
    lastSyncedAt: null,
    lastImported: 0,
    lastSkipped: 0,
    lastError: null,
    createdAt: now(),
  }
  await db.insert(schema.calendarConnections).values(row)
  return row
}

/** Patch by id: the webhook and cron paths have a connection but no session. */
export async function updateConnection(
  id: string,
  patch: Partial<typeof schema.calendarConnections.$inferInsert>,
): Promise<void> {
  await db
    .update(schema.calendarConnections)
    .set(patch)
    .where(eq(schema.calendarConnections.id, id))
}

export async function deleteConnection(userId: string, id: string): Promise<void> {
  await db
    .delete(schema.calendarConnections)
    .where(and(
      eq(schema.calendarConnections.userId, userId),
      eq(schema.calendarConnections.id, id),
    ))
}

/**
 * Take entries off the record because the meeting they came from is gone.
 *
 * Only ever unverified ones. Once somebody has looked at an entry and confirmed
 * it, it is their record — a meeting deleted from a calendar months later does
 * not get to quietly rewrite what they said they did.
 */
export async function deleteImportedByExternalIds(
  userId: string,
  ids: string[],
): Promise<number> {
  let removed = 0
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    if (chunk.length === 0) continue
    const rows = await db
      .delete(schema.entries)
      .where(and(
        eq(schema.entries.userId, userId),
        eq(schema.entries.verified, false),
        inArray(schema.entries.externalId, chunk),
      ))
      .returning({ id: schema.entries.id })
    removed += rows.length
  }
  return removed
}

/**
 * Remove imported entries by the event they came from, across every date.
 *
 * An external id is `<provider>:<event id>:<date>`, and a provider reporting a
 * deletion gives only the event id, so the match is on the prefix. LIKE treats
 * `_` and `%` as wildcards and provider ids contain `_`, so they are escaped —
 * otherwise a cancelled meeting could take an unrelated one with it.
 */
export async function deleteImportedByEventIds(
  userId: string,
  prefixes: string[],
): Promise<number> {
  let removed = 0
  for (const prefix of prefixes.slice(0, 500)) {
    const pattern = `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const rows = await db
      .delete(schema.entries)
      .where(and(
        eq(schema.entries.userId, userId),
        eq(schema.entries.verified, false),
        sql`${schema.entries.externalId} LIKE ${pattern} ESCAPE '\\'`,
      ))
      .returning({ id: schema.entries.id })
    removed += rows.length
  }
  return removed
}
