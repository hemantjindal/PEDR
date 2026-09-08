import { isNotNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getEntries, getSheets, getWeekNotes } from '@/lib/data'
import { planSheetPeriods, summariseDeadlines } from '@/lib/pedr/deadlines'
import { scoreWeeks } from '@/lib/pedr/scoring'
import { addWeeks, todayKey, weekIdOf } from '@/lib/pedr/week'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The scheduled nudge.
 *
 * Point a scheduler at this — Vercel Cron, a GitHub Action, anything that can
 * make an authenticated GET once a day. It works out who is behind and returns
 * what it found.
 *
 * Delivery is deliberately pluggable and, by default, absent. There is no email
 * provider wired in, because forcing everyone to sign up for one to run their
 * own copy is worse than the calendar feed they already have. Set
 * `REMINDER_WEBHOOK_URL` and each digest is POSTed there; otherwise the run
 * reports what it would have sent.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const header = request.headers.get('authorization')
    if (header !== `Bearer ${secret}`) {
      return Response.json({ error: 'Not authorised.' }, { status: 401 })
    }
  }

  const today = todayKey()
  const users = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      experienceStart: schema.users.experienceStart,
    })
    .from(schema.users)
    .where(isNotNull(schema.users.experienceStart))

  const digests: Digest[] = []

  for (const user of users) {
    if (!user.experienceStart) continue
    const [entries, notes, sheets] = await Promise.all([
      getEntries(user.id),
      getWeekNotes(user.id),
      getSheets(user.id),
    ])

    const scores = scoreWeeks(weekIdOf(user.experienceStart), weekIdOf(today), entries, notes)
    const deadlines = summariseDeadlines(
      planSheetPeriods(user.experienceStart, { today, sheets }),
    )

    // The week just gone, not the one in progress — nobody is late on today.
    const lastWeek = addWeeks(weekIdOf(today), -1)
    const lastWeekScore = scores.find((s) => s.weekId === lastWeek)?.score ?? 0

    const reasons: string[] = []
    if (deadlines.lateCount > 0) {
      reasons.push(
        `${deadlines.lateCount} record sheet${deadlines.lateCount === 1 ? '' : 's'} past the two-month deadline.`,
      )
    }
    if (deadlines.nextDue && deadlines.nextDue.daysUntilDue <= 14 && !deadlines.nextDue.inProgress) {
      reasons.push(`Sheet ${deadlines.nextDue.index} is due in ${deadlines.nextDue.daysUntilDue} days.`)
    }
    if (lastWeekScore === 0) {
      reasons.push('Last week has nothing recorded against it.')
    }

    if (reasons.length === 0) continue

    digests.push({
      userId: user.id,
      name: user.name,
      email: user.email,
      reasons,
      lateSheets: deadlines.lateCount,
      lastWeek,
      lastWeekScore,
    })
  }

  const webhook = process.env.REMINDER_WEBHOOK_URL
  let delivered = 0
  const failures: string[] = []

  if (webhook) {
    for (const digest of digests) {
      try {
        const response = await fetch(webhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(digest),
        })
        if (response.ok) delivered++
        else failures.push(`${digest.email}: HTTP ${response.status}`)
      } catch {
        failures.push(`${digest.email}: could not reach the webhook`)
      }
    }
  }

  return Response.json({
    ran: today,
    checked: users.length,
    needNudging: digests.length,
    delivered,
    failures,
    // Without a webhook the run still reports what it found, so the endpoint is
    // useful on its own and honest about not having sent anything.
    digests: webhook ? undefined : digests,
  })
}

interface Digest {
  userId: string
  name: string
  email: string
  reasons: string[]
  lateSheets: number
  lastWeek: string
  lastWeekScore: number
}
