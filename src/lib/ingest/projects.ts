import { OFFICE_MANAGEMENT_CATEGORIES, type OfficeCategoryId } from '../pedr/constants'
import type { Project } from '../pedr/types'

/**
 * Working out which job a line of a dump is about.
 *
 * People do not write project names the way the project register spells them.
 * They write "Battersea", "BSQ", "1042" and "the Battersea job" for the same
 * building. So matching runs from most to least certain, and when nothing
 * matches we keep the raw text as a hint rather than dropping it — an
 * unattributed project name is still worth points, and the user can bind it to
 * a real project later in one click.
 */

export interface ProjectMatch {
  projectId: string | null
  /** Raw text worth keeping when we could not resolve it to a project. */
  hint: string | null
  confidence: number
  matchedText: string | null
  officeCategory: OfficeCategoryId | null
}

const NO_MATCH: ProjectMatch = {
  projectId: null, hint: null, confidence: 0, matchedText: null, officeCategory: null,
}

export function matchProject(text: string, projects: Project[]): ProjectMatch {
  const office = matchOfficeCategory(text)
  const live = projects.filter((p) => !p.archived)

  // 1. An exact code. "1042", "BSQ". Codes are short, so require a boundary
  //    that is not another digit or letter, or "1042" matches inside "10420".
  for (const project of live) {
    if (!project.code) continue
    if (boundaryTest(project.code).test(text)) {
      return { projectId: project.id, hint: null, confidence: 0.95, matchedText: project.code, officeCategory: null }
    }
  }

  // 2. The full name.
  for (const project of live) {
    if (project.name && boundaryTest(project.name).test(text)) {
      return { projectId: project.id, hint: null, confidence: 0.95, matchedText: project.name, officeCategory: null }
    }
  }

  // 3. An alias the user has told us about.
  for (const project of live) {
    for (const alias of project.aliases ?? []) {
      if (alias && boundaryTest(alias).test(text)) {
        return { projectId: project.id, hint: null, confidence: 0.9, matchedText: alias, officeCategory: null }
      }
    }
  }

  // 4. A distinctive word out of the name. "Battersea" for "Battersea Square
  //    Phase 2" — but never a generic word like "House" or "Phase".
  for (const project of live) {
    for (const token of distinctiveTokens(project.name)) {
      if (boundaryTest(token).test(text)) {
        return { projectId: project.id, hint: null, confidence: 0.75, matchedText: token, officeCategory: null }
      }
    }
  }

  // 5. A near miss — a typo, or a different ending. Only for longer words,
  //    where an edit-distance match is unlikely to be a coincidence.
  const fuzzy = fuzzyMatch(text, live)
  if (fuzzy) return fuzzy

  // 6. Office management time is not a project, and it belongs on the sheet.
  if (office) {
    return { projectId: null, hint: null, confidence: 0.8, matchedText: null, officeCategory: office }
  }

  // 7. Nothing matched. Keep whatever looks like a project name anyway.
  const hint = extractHint(text)
  return hint ? { ...NO_MATCH, hint, confidence: 0.3, matchedText: hint } : NO_MATCH
}

export function matchOfficeCategory(text: string): OfficeCategoryId | null {
  const lower = ` ${text.toLowerCase()} `
  let best: { id: OfficeCategoryId; score: number } | null = null
  for (const category of OFFICE_MANAGEMENT_CATEGORIES) {
    for (const keyword of category.keywords) {
      if (new RegExp(`(?<![a-z0-9])${escapeRegExp(keyword)}(?![a-z0-9])`, 'i').test(lower)) {
        const score = keyword.split(/\s+/).length
        if (!best || score > best.score) best = { id: category.id, score }
      }
    }
  }
  return best?.id ?? null
}

/** Words in a project name specific enough to identify it on their own. */
const GENERIC_NAME_WORDS = new Set([
  'the', 'and', 'of', 'at', 'phase', 'house', 'building', 'project', 'site', 'street',
  'road', 'lane', 'court', 'square', 'park', 'centre', 'center', 'tower', 'block',
  'north', 'south', 'east', 'west', 'new', 'old', 'works', 'development', 'scheme',
  'residential', 'commercial', 'office', 'school', 'hospital', 'hotel', 'refurbishment',
  'extension', 'one', 'two', 'three', 'four', 'five',
])

function distinctiveTokens(name: string): string[] {
  return (name ?? '')
    .split(/[\s,\-–—/()]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !GENERIC_NAME_WORDS.has(t.toLowerCase()))
}

function fuzzyMatch(text: string, projects: Project[]): ProjectMatch | null {
  const words = text.split(/[\s,.;:()[\]]+/).filter((w) => w.length >= 5)
  for (const project of projects) {
    const candidates = [project.name, ...distinctiveTokens(project.name), ...(project.aliases ?? [])]
      .filter((c) => c && c.length >= 5)
    for (const candidate of candidates) {
      for (const word of words) {
        if (similarity(word.toLowerCase(), candidate.toLowerCase()) >= 0.85) {
          return {
            projectId: project.id, hint: null, confidence: 0.6,
            matchedText: word, officeCategory: null,
          }
        }
      }
    }
  }
  return null
}

/**
 * When nothing matches, look for text shaped like a project reference.
 *
 * This has to be strict. A hint counts as "named a project" when a week is
 * scored, so a sloppy rule here quietly awards points for nothing: "Just
 * issued it — RFI 042 response" would otherwise yield a project called
 * "Just issued it". A hint must therefore either carry a job number or read
 * like a name.
 */
function extractHint(text: string): string | null {
  const bracketed = /\[([^\]]{2,30})\]/.exec(text)
  if (bracketed) return bracketed[1].trim()

  const prefix = /^\s*([A-Z0-9][\w&'’.\- ]{1,28}?)\s*[-–—:]\s+\S/.exec(text)
  if (prefix) {
    const candidate = prefix[1].trim()
    const words = candidate.split(/\s+/)
    const looksLikeName = words.length <= 4 && words.every((w) => /^[A-Z0-9]/.test(w))
    const hasNumber = /\d/.test(candidate)
    const isWeekday = /^(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)/i.test(candidate)
    if (!isWeekday && (hasNumber || looksLikeName)) return candidate
  }

  // A bare job number. Four digits and up, and never a reference number that
  // happens to follow a document prefix — "RFI 042" is not a project.
  const jobNumber = /(?<!\b(?:rfi|ai|tq|cvi|eot|rev|no|doc|drawing|dwg|sk|ref)\s)(?<![\w.])(\d{4,6}[A-Z]?)(?![\w.])/i.exec(text)
  if (jobNumber) return jobNumber[1]

  return null
}

function boundaryTest(needle: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`, 'i')
}

/** Normalised Levenshtein similarity, 0–1. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  const max = Math.max(a.length, b.length)
  if (max === 0) return 1
  return 1 - levenshtein(a, b) / max
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = curr
  }
  return prev[b.length]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
