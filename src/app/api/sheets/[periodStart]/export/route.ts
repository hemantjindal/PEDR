import { requireUser } from '@/lib/auth'
import { fail, handler } from '@/lib/api'
import { getEmployments, getEntries, getProjects, getWeekNotes } from '@/lib/data'
import {
  buildAppraisalDocument, buildSheetDocument, fileResponse, isFormat, renderDocument,
  type AppraisalRole, type Format,
} from '@/lib/export'
import { SHEET_RULES } from '@/lib/pedr/constants'
import { employmentForWeek } from '@/lib/pedr/progress'
import { buildSheet, entriesToCsv } from '@/lib/pedr/sheet'
import { addDays, addMonths, isDateKey, weekIdOf } from '@/lib/pedr/week'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Which document, not just which format. */
const DOCUMENTS = ['sheet', 'mentor-appraisal', 'supervisor-appraisal'] as const
type DocumentKind = (typeof DOCUMENTS)[number]

function isDocumentKind(value: string): value is DocumentKind {
  return (DOCUMENTS as readonly string[]).includes(value)
}

/**
 * Everything the quarter can be turned into.
 *
 * The format is the caller's choice rather than ours: a PSA who wants to
 * comment needs Word, a Part 3 upload wants PDF, and somebody copying section
 * by section into RIBA's form wants plain text. Picking one on their behalf
 * only means they convert it themselves.
 */
export const GET = handler(async (
  request: Request,
  { params }: { params: Promise<{ periodStart: string }> },
) => {
  const user = await requireUser()
  const { periodStart } = await params
  if (!isDateKey(periodStart)) return fail('Not a valid period.')

  const url = new URL(request.url)
  const format = (url.searchParams.get('format') ?? 'pdf') as Format
  if (!isFormat(format)) return fail('That is not a format we can produce.')

  const kind = url.searchParams.get('document') ?? 'sheet'
  if (!isDocumentKind(kind)) return fail('That is not a document we can produce.')

  const periodEnd = addDays(addMonths(periodStart, SHEET_RULES.maxPeriodMonths), -1)

  const [entries, notes, projects, employments] = await Promise.all([
    getEntries(user.id, { from: periodStart, to: periodEnd }),
    getWeekNotes(user.id),
    getProjects(user.id),
    getEmployments(user.id),
  ])

  // A spreadsheet is a row per entry, not a document, so it never goes through
  // the renderers — and an appraisal has no meaningful CSV form at all.
  if (format === 'csv') {
    if (kind !== 'sheet') return fail('An appraisal is a document, not a spreadsheet.')
    return new Response(entriesToCsv(entries, projects), {
      headers: {
        // A BOM so Excel opens it as UTF-8 rather than mangling names.
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="pedr-${periodStart}-to-${periodEnd}.csv"`,
      },
    })
  }

  const employment = employmentForWeek(weekIdOf(periodStart), employments)
  const content = buildSheet({ periodStart, periodEnd, entries, notes, projects, employment })

  const doc = kind === 'sheet'
    ? buildSheetDocument({
        content,
        periodStart,
        periodEnd,
        candidateName: user.name,
        employment,
        entries,
        projects,
        includeEntries: url.searchParams.get('appendix') === '1',
      })
    : buildAppraisalDocument({
        content,
        periodStart,
        periodEnd,
        candidateName: user.name,
        employment,
        role: (kind === 'mentor-appraisal' ? 'mentor' : 'supervisor') as AppraisalRole,
      })

  return fileResponse(await renderDocument(doc, format))
})
