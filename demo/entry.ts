/**
 * The browser entry point for the standalone demo.
 *
 * It re-exports the real engine unchanged — the demo page runs exactly the code
 * the app runs, so it cannot drift into being a flattering mock-up of it. The
 * whole graph below is pure: no database, no network, no Node built-ins, which
 * is why it can be bundled and dropped into a single HTML file.
 */
export { parseDump, detectDumpKind } from '@/lib/ingest'
export { scoreWeek, scoreWeeks, findGaps, currentStreak } from '@/lib/pedr/scoring'
export { computeCoverage } from '@/lib/pedr/coverage'
export {
  RIBA_STAGES, PROFESSIONAL_CRITERIA, OFFICE_MANAGEMENT_CATEGORIES, SCORING,
  REQUIREMENTS, SHEET_RULES, REFLECTION_PROMPTS, scoreBand, officeCategory, stage,
} from '@/lib/pedr/constants'
export { WRITING_GUIDE, GLOSSARY, FAQ } from '@/lib/pedr/guidance'
export {
  formatDate, formatWeek, formatWeekRange, formatDuration, todayKey, weekIdOf,
  weekStartKey, weekEndKey, weekRange, addWeeks, addDays,
} from '@/lib/pedr/week'
