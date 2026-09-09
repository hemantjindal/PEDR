import {
  OFFICE_MANAGEMENT_CATEGORIES, PROFESSIONAL_CRITERIA, RIBA_STAGES,
  officeCategory, stage as stageInfo,
  type CriterionId, type StageId,
} from './constants'
import { hasSubstance, isSpecificActivity } from './scoring'
import type {
  Employment, Entry, Project, SheetContent, SheetProject, WeekNote,
} from './types'
import { daysBetween, formatDate, formatDuration, weekIdOf, type DateKey } from './week'

/**
 * Turning the record into a quarterly PEDR sheet.
 *
 * The sheet mirrors the sections of the real thing — General Information,
 * Describe Projects, Record Activities with hours against work stages, Office
 * Management, and the reflective boxes. What comes out is a draft to edit and
 * paste, not a submission: RIBA's system at register.architecture.com/pedr is the record, and your
 * mentor and PSA sign there.
 *
 * The house style is short. Examiners are explicit that less is more, with
 * around six pages as the target, so this summarises rather than transcribes —
 * the raw entries are always there underneath if more detail is wanted.
 */

export interface BuildSheetInput {
  periodStart: DateKey
  periodEnd: DateKey
  entries: Entry[]
  notes: WeekNote[]
  projects: Project[]
  employment: Employment | null
}

export function buildSheet(input: BuildSheetInput): SheetContent {
  const { periodStart, periodEnd, projects, employment } = input

  const entries = input.entries.filter((e) => e.date >= periodStart && e.date <= periodEnd)
  const firstWeek = weekIdOf(periodStart)
  const lastWeek = weekIdOf(periodEnd)
  const notes = input.notes.filter((n) => n.weekId >= firstWeek && n.weekId <= lastWeek)

  const projectById = new Map(projects.map((p) => [p.id, p]))

  // Holiday is recorded on the sheet but is absence, not experience, so it is
  // kept out of the hours that evidence practical experience.
  const countable = entries.filter((e) => {
    if (!e.officeCategory) return true
    return officeCategory(e.officeCategory)?.countsAsExperience !== false
  })

  const totalMinutes = countable.reduce((sum, e) => sum + e.minutes, 0)
  const daysWorked = new Set(countable.filter((e) => e.minutes > 0).map((e) => e.date)).size

  // --- Projects -----------------------------------------------------------

  const byProject = new Map<string, Entry[]>()
  for (const entry of entries) {
    const key = entry.projectId ?? (entry.projectHint ? `hint:${entry.projectHint}` : '')
    if (!key) continue
    const bucket = byProject.get(key)
    if (bucket) bucket.push(entry)
    else byProject.set(key, [entry])
  }

  const sheetProjects: SheetProject[] = [...byProject.entries()]
    .map(([key, group]) => {
      const project = projectById.get(key)
      const minutes = group.reduce((sum, e) => sum + e.minutes, 0)
      const stages = [...new Set(group.map((e) => e.stage).filter((s): s is StageId => s !== null))]
        .sort((a, b) => a - b)
      return {
        projectId: project?.id ?? null,
        code: project?.code ?? '',
        name: project?.name ?? key.replace(/^hint:/, ''),
        client: project?.client ?? null,
        valueGbp: project?.valueGbp ?? null,
        procurement: project?.procurement ?? null,
        stages,
        minutes,
        summary: summariseActivities(group),
      }
    })
    .sort((a, b) => b.minutes - a.minutes)

  // --- Stages -------------------------------------------------------------

  const stageMinutes: Record<string, number> = {}
  for (const s of RIBA_STAGES) stageMinutes[String(s.id)] = 0
  for (const entry of entries) {
    if (entry.stage === null) continue
    stageMinutes[String(entry.stage)] += entry.minutes
  }

  // --- Criteria -----------------------------------------------------------

  const criteria: SheetContent['criteria'] = {}
  for (const c of PROFESSIONAL_CRITERIA) {
    const matches = entries.filter((e) => e.criteria.includes(c.id as CriterionId))
    criteria[c.id] = {
      entries: matches.length,
      minutes: matches.reduce((sum, e) => sum + e.minutes, 0),
      // A handful of concrete examples beats a list of forty.
      examples: matches
        .filter((e) => isSpecificActivity(e.activity))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 3)
        .map((e) => e.activity),
    }
  }

  return {
    general: {
      employer: employment?.employer ?? '',
      location: employment?.location ?? 'UK',
      category: employment?.category ?? 'i',
      supervisorName: employment?.supervisorName ?? '',
      role: employment?.role ?? '',
      daysWorked,
      hoursWorked: Math.round((totalMinutes / 60) * 10) / 10,
    },
    projects: sheetProjects,
    stageMinutes,
    criteria,
    reflection: buildReflection(entries, notes),
  }
}

/** A short paragraph of what was actually done on a project. */
function summariseActivities(entries: Entry[]): string {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const entry of entries.sort((a, b) => b.minutes - a.minutes)) {
    if (!isSpecificActivity(entry.activity)) continue
    const key = entry.activity.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(entry.activity.replace(/\.$/, ''))
    if (lines.length >= 8) break
  }
  return lines.join('. ') + (lines.length > 0 ? '.' : '')
}

/**
 * Draft the five reflective boxes from what was captured week by week.
 *
 * The writing is left in the user's own words wherever possible — a PSA can
 * tell the difference, and the point of capturing friction as it happens is
 * that the sentence written on the Tuesday is better than anything
 * reconstructed in March.
 */
function buildReflection(entries: Entry[], notes: WeekNote[]): SheetContent['reflection'] {
  const fromNotes = (key: keyof Pick<WeekNote, 'did' | 'learned' | 'wentWell' | 'wentWrong' | 'next'>) =>
    notes.map((n) => n[key]).filter((t) => hasSubstance(t, 4))

  const entryWentWrong = entries
    .map((e) => e.wentWrong)
    .filter((t): t is string => hasSubstance(t, 4))
  const entryLearned = entries
    .map((e) => e.learned)
    .filter((t): t is string => hasSubstance(t, 4))

  return {
    did: dedupe([
      ...fromNotes('did'),
      ...entries
        .filter((e) => isSpecificActivity(e.activity))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10)
        .map((e) => e.activity),
    ]).join('\n'),
    learned: dedupe([...fromNotes('learned'), ...entryLearned]).slice(0, 8).join('\n'),
    wentWell: dedupe(fromNotes('wentWell')).slice(0, 6).join('\n'),
    // The box that carries the most weight, so it gets the most room.
    wentWrong: dedupe([...fromNotes('wentWrong'), ...entryWentWrong]).slice(0, 10).join('\n'),
    next: dedupe(fromNotes('next')).slice(0, 6).join('\n'),
  }
}

function dedupe(lines: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const trimmed = line.trim().replace(/\s+/g, ' ')
    const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** A row per entry, for a spreadsheet or for pasting into a timesheet. */
export function entriesToCsv(entries: Entry[], projects: Project[]): string {
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const header = [
    'Date', 'Project code', 'Project', 'RIBA stage', 'Stage name', 'Office category',
    'Hours', 'Estimated', 'Activity', 'People', 'Criteria', 'What went wrong', 'What I learned',
  ]

  const rows = entries.map((entry) => {
    const project = entry.projectId ? projectById.get(entry.projectId) : null
    const office = entry.officeCategory ? officeCategory(entry.officeCategory) : null
    return [
      entry.date,
      project?.code ?? '',
      project?.name ?? entry.projectHint ?? '',
      entry.stage !== null ? String(entry.stage) : '',
      entry.stage !== null ? (stageInfo(entry.stage)?.name ?? '') : '',
      office?.name ?? '',
      (entry.minutes / 60).toFixed(2),
      entry.minutesEstimated ? 'yes' : 'no',
      entry.activity,
      entry.people.join('; '),
      entry.criteria.join('; '),
      entry.wentWrong ?? '',
      entry.learned ?? '',
    ]
  })

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Office management time, which is its own section of the real sheet. */
export function officeSummary(entries: Entry[]): Array<{ id: string; name: string; minutes: number; counts: boolean }> {
  return OFFICE_MANAGEMENT_CATEGORIES.map((category) => {
    const matches = entries.filter((e) => e.officeCategory === category.id)
    return {
      id: category.id,
      name: category.name,
      minutes: matches.reduce((sum, e) => sum + e.minutes, 0),
      counts: category.countsAsExperience,
    }
  }).filter((row) => row.minutes > 0)
}
