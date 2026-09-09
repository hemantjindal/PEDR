import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * One dialect everywhere: SQLite locally (`file:./data/pedr.db`) and libSQL in
 * production (`libsql://...`). Same SQL, same schema, no dual-dialect bugs and
 * nothing to sign up for before the app runs.
 *
 * Dates are stored as 'YYYY-MM-DD' text and timestamps as ISO-8601 text. That
 * sorts and compares correctly in SQL, survives a copy between environments,
 * and cannot drift a Friday site visit onto Thursday for a user in Brisbane.
 */

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** Their Teams display name, so we know which messages are theirs. */
    teamsName: text('teams_name'),
    /** Secret path segment for their private calendar feed. */
    calendarToken: text('calendar_token').notNull(),
    /** When their qualifying experience began. Anchors the sheet periods. */
    experienceStart: text('experience_start'),
    /** Planned Part 3 exam date, for the recency countdown. */
    targetExamDate: text('target_exam_date'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

export const employments = sqliteTable(
  'employments',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    employer: text('employer').notNull(),
    officeLocation: text('office_location'),
    location: text('location').notNull().default('UK'),
    category: text('category').notNull().default('i'),
    role: text('role'),
    supervisorName: text('supervisor_name'),
    supervisorRegBody: text('supervisor_reg_body'),
    supervisorRegNumber: text('supervisor_reg_number'),
    mentorName: text('mentor_name'),
    mentorEmail: text('mentor_email'),
    startDate: text('start_date').notNull(),
    endDate: text('end_date'),
    weeklyHours: integer('weekly_hours').notNull().default(375), // tenths of an hour
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('employments_user_idx').on(t.userId, t.startDate)],
)

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull().default(''),
    name: text('name').notNull(),
    client: text('client'),
    sector: text('sector'),
    valueGbp: integer('value_gbp'),
    procurement: text('procurement'),
    contractForm: text('contract_form'),
    isCaseStudy: integer('is_case_study', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull().default([]),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('projects_user_idx').on(t.userId)],
)

export const dumps = sqliteTable(
  'dumps',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** Kept forever, so any record can be traced back to what was typed. */
    raw: text('raw').notNull(),
    kind: text('kind').notNull().default('freeform'),
    status: text('status').notNull().default('pending'),
    note: text('note'),
    parserVersion: text('parser_version'),
    enriched: integer('enriched', { mode: 'boolean' }).notNull().default(false),
    entryCount: integer('entry_count').notNull().default(0),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    processedAt: text('processed_at'),
  },
  (t) => [index('dumps_user_idx').on(t.userId, t.createdAt)],
)

export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    dumpId: text('dump_id').references(() => dumps.id, { onDelete: 'set null' }),
    date: text('date').notNull(),
    minutes: integer('minutes').notNull().default(0),
    minutesEstimated: integer('minutes_estimated', { mode: 'boolean' }).notNull().default(false),
    /** 'participant' or 'observer' — the sheet's two hour columns. */
    participation: text('participation').notNull().default('participant'),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    projectHint: text('project_hint'),
    stage: integer('stage'),
    officeCategory: text('office_category'),
    activity: text('activity').notNull(),
    detail: text('detail'),
    people: text('people', { mode: 'json' }).$type<string[]>().notNull().default([]),
    criteria: text('criteria', { mode: 'json' }).$type<string[]>().notNull().default([]),
    wentWrong: text('went_wrong'),
    learned: text('learned'),
    confidence: integer('confidence').notNull().default(100), // percent, 0-100
    source: text('source').notNull().default('manual'),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    provenance: text('provenance'),
    /**
     * The id this row had in the system it came from — a calendar event's UID
     * plus its date. Unique per user, so syncing the same calendar twice
     * cannot double-count a meeting. NULLs do not collide in SQLite, so
     * hand-typed entries are unaffected.
     */
    externalId: text('external_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('entries_user_date_idx').on(t.userId, t.date),
    index('entries_dump_idx').on(t.dumpId),
    index('entries_verified_idx').on(t.userId, t.verified),
    uniqueIndex('entries_external_idx').on(t.userId, t.externalId),
  ],
)

/**
 * A linked calendar.
 *
 * Outlook and Teams both publish a private .ics URL. Storing it is what turns
 * a one-off import into a sync, and it is a credential — anyone holding the
 * URL can read the calendar — so it is only ever shown back to its owner.
 */
export const calendarFeeds = sqliteTable(
  'calendar_feeds',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default('My calendar'),
    /** Null for a one-off file upload, which has nothing to come back to. */
    url: text('url'),
    /** Title fragments this user wants ignored, on top of the defaults. */
    ignore: text('ignore', { mode: 'json' }).$type<string[]>().notNull().default([]),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastSyncedAt: text('last_synced_at'),
    lastImported: integer('last_imported').notNull().default(0),
    lastSkipped: integer('last_skipped').notNull().default(0),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('calendar_feeds_user_idx').on(t.userId)],
)

export const weekNotes = sqliteTable(
  'week_notes',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    weekId: text('week_id').notNull(),
    did: text('did').notNull().default(''),
    learned: text('learned').notNull().default(''),
    wentWell: text('went_well').notNull().default(''),
    wentWrong: text('went_wrong').notNull().default(''),
    next: text('next').notNull().default(''),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.weekId] })],
)

export const sheets = sqliteTable(
  'sheets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    employmentId: text('employment_id').references(() => employments.id, { onDelete: 'set null' }),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    status: text('status').notNull().default('draft'),
    content: text('content', { mode: 'json' }).$type<unknown>().notNull(),
    mentorComment: text('mentor_comment'),
    mentorSignedAt: text('mentor_signed_at'),
    psaComment: text('psa_comment'),
    psaSignedAt: text('psa_signed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('sheets_user_period_idx').on(t.userId, t.periodStart)],
)

/**
 * Idempotent DDL. Small enough to read in one sitting, and it means a new
 * install is `npm run db:push` with no migration tooling to learn.
 */
export const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  teams_name TEXT,
  calendar_token TEXT NOT NULL,
  experience_start TEXT,
  target_exam_date TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS employments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employer TEXT NOT NULL,
  office_location TEXT,
  location TEXT NOT NULL DEFAULT 'UK',
  category TEXT NOT NULL DEFAULT 'i',
  role TEXT,
  supervisor_name TEXT,
  supervisor_reg_body TEXT,
  supervisor_reg_number TEXT,
  mentor_name TEXT,
  mentor_email TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  weekly_hours INTEGER NOT NULL DEFAULT 375,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS employments_user_idx ON employments (user_id, start_date);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  client TEXT,
  sector TEXT,
  value_gbp INTEGER,
  procurement TEXT,
  contract_form TEXT,
  is_case_study INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  aliases TEXT NOT NULL DEFAULT '[]',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects (user_id);

CREATE TABLE IF NOT EXISTS dumps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'freeform',
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  parser_version TEXT,
  enriched INTEGER NOT NULL DEFAULT 0,
  entry_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS dumps_user_idx ON dumps (user_id, created_at);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dump_id TEXT REFERENCES dumps(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  minutes_estimated INTEGER NOT NULL DEFAULT 0,
  participation TEXT NOT NULL DEFAULT 'participant',
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  project_hint TEXT,
  stage INTEGER,
  office_category TEXT,
  activity TEXT NOT NULL,
  detail TEXT,
  people TEXT NOT NULL DEFAULT '[]',
  criteria TEXT NOT NULL DEFAULT '[]',
  went_wrong TEXT,
  learned TEXT,
  confidence INTEGER NOT NULL DEFAULT 100,
  source TEXT NOT NULL DEFAULT 'manual',
  verified INTEGER NOT NULL DEFAULT 0,
  provenance TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entries_user_date_idx ON entries (user_id, date);
CREATE INDEX IF NOT EXISTS entries_dump_idx ON entries (dump_id);
CREATE INDEX IF NOT EXISTS entries_verified_idx ON entries (user_id, verified);
CREATE UNIQUE INDEX IF NOT EXISTS entries_external_idx ON entries (user_id, external_id);

CREATE TABLE IF NOT EXISTS calendar_feeds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My calendar',
  url TEXT,
  ignore TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT,
  last_imported INTEGER NOT NULL DEFAULT 0,
  last_skipped INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS calendar_feeds_user_idx ON calendar_feeds (user_id);

CREATE TABLE IF NOT EXISTS week_notes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_id TEXT NOT NULL,
  did TEXT NOT NULL DEFAULT '',
  learned TEXT NOT NULL DEFAULT '',
  went_well TEXT NOT NULL DEFAULT '',
  went_wrong TEXT NOT NULL DEFAULT '',
  next TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, week_id)
);

CREATE TABLE IF NOT EXISTS sheets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employment_id TEXT REFERENCES employments(id) ON DELETE SET NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  content TEXT NOT NULL,
  mentor_comment TEXT,
  mentor_signed_at TEXT,
  psa_comment TEXT,
  psa_signed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sheets_user_period_idx ON sheets (user_id, period_start);
`

/**
 * Columns added after a database may already exist. `CREATE TABLE IF NOT
 * EXISTS` cannot add these, so they are applied separately and only when
 * missing — which keeps `npm run db:push` the one command anybody needs.
 */
export const ADDED_COLUMNS: Array<{ table: string; column: string; definition: string }> = [
  { table: 'entries', column: 'external_id', definition: 'TEXT' },
  {
    table: 'entries',
    column: 'participation',
    definition: "TEXT NOT NULL DEFAULT 'participant'",
  },
]
