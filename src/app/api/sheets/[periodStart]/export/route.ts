import { requireUser } from '@/lib/auth'
import { fail, handler } from '@/lib/api'
import { getEmployments, getEntries, getProjects, getWeekNotes } from '@/lib/data'
import { SHEET_RULES } from '@/lib/pedr/constants'
import { employmentForWeek } from '@/lib/pedr/progress'
import { buildSheet, entriesToCsv, sheetToMarkdown } from '@/lib/pedr/sheet'
import { addDays, addMonths, isDateKey, weekIdOf } from '@/lib/pedr/week'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = handler(async (
  request: Request,
  { params }: { params: Promise<{ periodStart: string }> },
) => {
  const user = await requireUser()
  const { periodStart } = await params
  if (!isDateKey(periodStart)) return fail('Not a valid period.')

  const format = new URL(request.url).searchParams.get('format') ?? 'md'
  const periodEnd = addDays(addMonths(periodStart, SHEET_RULES.maxPeriodMonths), -1)

  const [entries, notes, projects, employments] = await Promise.all([
    getEntries(user.id, { from: periodStart, to: periodEnd }),
    getWeekNotes(user.id),
    getProjects(user.id),
    getEmployments(user.id),
  ])

  const filename = `pedr-${periodStart}-to-${periodEnd}`

  if (format === 'csv') {
    return new Response(entriesToCsv(entries, projects), {
      headers: {
        // A BOM so Excel opens it as UTF-8 rather than mangling names.
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}.csv"`,
      },
    })
  }

  const employment = employmentForWeek(weekIdOf(periodStart), employments)
  const content = buildSheet({ periodStart, periodEnd, entries, notes, projects, employment })
  const markdown = sheetToMarkdown(content, {
    candidateName: user.name,
    periodStart,
    periodEnd,
  })

  return new Response(markdown, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}.md"`,
    },
  })
})
