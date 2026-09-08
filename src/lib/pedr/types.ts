import type {
  CriterionId, ExperienceCategory, ExperienceLocation, OfficeCategoryId, ScoreBandId, StageId,
} from './constants'
import type { DateKey, MonthKey, WeekId } from './week'

/**
 * An Entry is the atom of this system: one thing you did, on one day, for some
 * number of minutes. Everything else — weeks, months, quarterly sheets,
 * coverage, scores — is derived from entries at read time, so there is exactly
 * one place a fact can be wrong.
 */
export interface Entry {
  id: string
  userId: string
  /** The dump this was extracted from, if it was not typed in directly. */
  dumpId: string | null
  date: DateKey
  minutes: number
  /**
   * True when we filled the number in rather than being told it. Mentors sign
   * these records, so an estimate must always look like an estimate.
   */
  minutesEstimated: boolean
  projectId: string | null
  /** Raw project text when we could not match it to a project record yet. */
  projectHint: string | null
  stage: StageId | null
  /**
   * Set instead of a project when this was non-project time — CPD, Part 3
   * lectures, practice management, holiday. A whole section of the real sheet.
   */
  officeCategory: OfficeCategoryId | null
  /** The headline: "Issued RFI response on the curtain wall head detail". */
  activity: string
  detail: string | null
  people: string[]
  criteria: CriterionId[]
  /** Friction, mistakes, surprises. The bit examiners read. */
  wentWrong: string | null
  learned: string | null
  /** 0–1. Below `REVIEW_THRESHOLD` the entry is held for confirmation. */
  confidence: number
  source: EntrySource
  /** True once a human has looked at it. Machine-made entries start false. */
  verified: boolean
  createdAt: string
  updatedAt: string
}

export type EntrySource = 'manual' | 'dump' | 'teams' | 'timesheet' | 'import'

/** Entries below this confidence are shown for review rather than accepted. */
export const REVIEW_THRESHOLD = 0.55

/** An entry as the parser produces it, before it has an id or an owner. */
export type DraftEntry = Omit<
  Entry,
  'id' | 'userId' | 'dumpId' | 'createdAt' | 'updatedAt' | 'verified'
> & {
  /** Which bit of the input this came from, so a user can check our working. */
  provenance?: string
}

/** The reflective writing for one week. Free text, written by you, not derived. */
export interface WeekNote {
  userId: string
  weekId: WeekId
  did: string
  learned: string
  wentWell: string
  wentWrong: string
  next: string
  updatedAt: string
}

export interface Project {
  id: string
  userId: string
  /** Short code you actually say out loud: "1042", "BSQ", "Battersea". */
  code: string
  name: string
  client: string | null
  sector: string | null
  /** Approximate contract value in GBP, for the sheet's project description. */
  valueGbp: number | null
  procurement: string | null
  contractForm: string | null
  isCaseStudy: boolean
  notes: string | null
  /** Extra strings that should match to this project when parsing dumps. */
  aliases: string[]
  archived: boolean
  createdAt: string
}

/** A period of employment. Drives the category/location rules and the sheets. */
export interface Employment {
  id: string
  userId: string
  employer: string
  officeLocation: string | null
  location: ExperienceLocation
  category: ExperienceCategory
  role: string | null
  supervisorName: string | null
  supervisorRegBody: string | null
  supervisorRegNumber: string | null
  mentorName: string | null
  mentorEmail: string | null
  startDate: DateKey
  endDate: DateKey | null
  weeklyHours: number
  createdAt: string
}

/** Raw pasted input, kept forever so a record can always be traced back. */
export interface Dump {
  id: string
  userId: string
  raw: string
  kind: DumpKind
  status: 'pending' | 'parsed' | 'applied' | 'failed'
  note: string | null
  parserVersion: string | null
  /** Whether the optional model pass ran on this dump. */
  enriched: boolean
  entryCount: number
  error: string | null
  createdAt: string
  processedAt: string | null
}

export type DumpKind = 'freeform' | 'teams' | 'timesheet' | 'email' | 'unknown'

/** A quarterly PEDR record sheet, generated then edited then signed off. */
export interface Sheet {
  id: string
  userId: string
  employmentId: string | null
  periodStart: DateKey
  periodEnd: DateKey
  status: SheetStatus
  /** The generated + edited body, shaped like the real sheet's sections. */
  content: SheetContent
  mentorComment: string | null
  mentorSignedAt: string | null
  psaComment: string | null
  psaSignedAt: string | null
  createdAt: string
  updatedAt: string
}

export type SheetStatus = 'draft' | 'submitted' | 'mentor_signed' | 'psa_signed'

/**
 * Mirrors the sections of a PEDR quarterly record sheet: General Information,
 * Describe Projects, Record Activities, Reflect on Experience, then the
 * appraisal and PSA sections. Wording on the live sheet shifts between
 * revisions, so we keep stable field names and map at export time.
 */
export interface SheetContent {
  general: {
    employer: string
    location: ExperienceLocation
    category: ExperienceCategory
    supervisorName: string
    role: string
    daysWorked: number
    hoursWorked: number
  }
  projects: SheetProject[]
  /** Minutes per RIBA stage across the period. */
  stageMinutes: Record<string, number>
  criteria: Record<string, { entries: number; minutes: number; examples: string[] }>
  reflection: {
    did: string
    learned: string
    wentWell: string
    wentWrong: string
    next: string
  }
}

export interface SheetProject {
  projectId: string | null
  code: string
  name: string
  client: string | null
  valueGbp: number | null
  procurement: string | null
  stages: StageId[]
  minutes: number
  summary: string
}

// ---------------------------------------------------------------------------
// Derived shapes
// ---------------------------------------------------------------------------

export interface ScoreComponent {
  id: string
  label: string
  points: number
  earned: number
  why: string
  /** What to do about it, when it was not earned. */
  fix: string | null
}

export interface WeekScore {
  weekId: WeekId
  score: number
  band: ScoreBandId
  bandLabel: string
  components: ScoreComponent[]
  minutes: number
  entryCount: number
  projectKeys: string[]
  stages: StageId[]
  criteria: CriterionId[]
  /** The single highest-value thing missing from this week. */
  nextBestAction: string | null
}

export interface PeriodScore {
  key: string
  label: string
  weeks: WeekId[]
  weeksLogged: number
  weeksMissing: number
  averageScore: number
  minutes: number
  entryCount: number
}

export interface MonthScore extends PeriodScore {
  monthKey: MonthKey
}

export interface Gap {
  from: WeekId
  to: WeekId
  weeks: WeekId[]
  count: number
}

export interface WeekStatus {
  weekId: WeekId
  startDate: DateKey
  endDate: DateKey
  score: number
  band: ScoreBandId
  minutes: number
  entryCount: number
  /** False when the week falls outside any recorded employment. */
  inScope: boolean
}

export interface CoverageCell {
  id: string
  label: string
  minutes: number
  entries: number
  weeks: number
  /** Share of total recorded minutes, 0–1. */
  share: number
  lastSeen: DateKey | null
  /** Minutes inside the recency window that matters for the exam. */
  recentMinutes: number
}

export interface Coverage {
  stages: CoverageCell[]
  criteria: CoverageCell[]
  totalMinutes: number
  /** Stages and criteria with nothing, or almost nothing, against them. */
  thinStages: CoverageCell[]
  thinCriteria: CoverageCell[]
}

export interface RequirementCheck {
  id: string
  label: string
  detail: string
  met: boolean
  value: number
  target: number
  unit: string
  /**
   * True when the rule comes from RIBA/ARB. False when it is this tool's own
   * opinion about what makes a defensible record — so the UI can say which is
   * which and you never mistake our advice for a regulation.
   */
  regulatory: boolean
}

export interface Progress {
  firstDate: DateKey | null
  lastDate: DateKey | null
  weeksLogged: number
  totalMinutes: number
  /** Months of experience, from weeks logged rather than from hours. */
  monthsLogged: number
  monthsRecent: number
  byCategory: Record<ExperienceCategory, number>
  checks: RequirementCheck[]
  ready: boolean
  /** Weeks still to log to satisfy every check, at the current logging rate. */
  weeksRemaining: number
  projectedReadyDate: DateKey | null
  loggingRate: number
}
