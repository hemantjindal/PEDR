import { getEmployments, getSheets, findUserByCalendarToken } from '@/lib/data'
import { buildReminderCalendar } from '@/lib/ics'
import { planSheetPeriods } from '@/lib/pedr/deadlines'
import { addDays, isoDayOfWeek, todayKey } from '@/lib/pedr/week'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A private calendar feed.
 *
 * The token in the URL is the only credential, which is why it is long and
 * random and why this route returns nothing else about the account. It is a
 * read-only view of dates, not a way in.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const user = token ? await findUserByCalendarToken(token) : null

  // Same response either way, so the endpoint cannot be used to test tokens.
  if (!user) {
    return new Response('Not found', { status: 404 })
  }

  const [sheets, employments] = await Promise.all([
    getSheets(user.id),
    getEmployments(user.id),
  ])

  const today = todayKey()
  const start =
    user.experienceStart ??
    employments[employments.length - 1]?.startDate ??
    null

  const periods = start ? planSheetPeriods(start, { today, sheets }) : []

  // The next Friday, so the weekly series starts on one.
  const daysToFriday = (4 - isoDayOfWeek(today) + 7) % 7
  const weeklyFrom = addDays(today, daysToFriday)

  const ics = buildReminderCalendar({
    name: `PEDR — ${user.name}`,
    token,
    periods,
    weeklyFrom,
    appUrl: process.env.APP_URL,
  })

  return new Response(ics, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="pedr.ics"',
      // Calendar clients poll; let them, but do not let anything else cache it.
      'cache-control': 'private, max-age=3600',
    },
  })
}
