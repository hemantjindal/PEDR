/**
 * The browser entry point for the standalone demo.
 *
 * It re-exports the real engine unchanged — the demo page runs exactly the
 * code the app runs, over exactly the record the seeded account gets — so it
 * cannot drift into being a flattering mock-up of the app. The whole graph
 * below is pure: no database, no network, no Node built-ins, which is why it
 * can be bundled and dropped into a single HTML file.
 */
export { parseDump, detectDumpKind } from '@/lib/ingest'
export { parseCalendar, defaultWindow, calendarToEntries } from '@/lib/ingest'
export {
  scoreWeek, scoreWeeks, findGaps, findThinWeeks, currentStreak, bestStreak,
  rollUpByMonth, rollUpByQuarter, groupEntriesByWeek, weekStatuses,
} from '@/lib/pedr/scoring'
export { computeCoverage, coverageHeadline, participationTrend } from '@/lib/pedr/coverage'
export { computeProgress, employmentForWeek } from '@/lib/pedr/progress'
export { planSheetPeriods, summariseDeadlines, describeWindow } from '@/lib/pedr/deadlines'
export { buildSheet, officeSummary, entriesToCsv } from '@/lib/pedr/sheet'
// The leaf modules, not the index: the index pulls in pdf-lib and docx, which
// would put a megabyte and a half of PDF machinery into a page whose whole
// point is that it opens instantly on a phone.
export { buildSheetDocument } from '@/lib/export/sheet-document'
export { buildAppraisalDocument } from '@/lib/export/appraisal'
export { renderMarkdown } from '@/lib/export/markdown'
export {
  RIBA_STAGES, PROFESSIONAL_CRITERIA, OFFICE_MANAGEMENT_CATEGORIES, PARTICIPATION,
  SCORING, REQUIREMENTS, SHEET_RULES, REFLECTION_PROMPTS, PEDR_SYSTEM,
  scoreBand, officeCategory, stage, criterion,
} from '@/lib/pedr/constants'
export { WRITING_GUIDE, GLOSSARY, FAQ } from '@/lib/pedr/guidance'
export {
  formatDate, formatWeek, formatWeekRange, formatMonth, formatDuration, todayKey,
  weekIdOf, weekStartKey, weekEndKey, weekRange, addWeeks, addDays, addMonths,
  monthKeyOf, daysBetween,
} from '@/lib/pedr/week'
export { buildDemoRecord } from '@/lib/demo-record'
export { REVIEW_THRESHOLD } from '@/lib/pedr/types'
