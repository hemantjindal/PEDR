import { CatchUp } from '@/components/catch-up'
import { requireUser } from '@/lib/auth'
import { getDashboard, getProjects } from '@/lib/data'
import { recoveryWindow, triage } from '@/lib/pedr/recover'
import { todayKey } from '@/lib/pedr/week'

export const metadata = { title: 'Catch up · PEDR' }
export const dynamic = 'force-dynamic'

export default async function CatchUpPage() {
  const user = await requireUser()
  const today = todayKey()
  const [projects, d] = await Promise.all([
    getProjects(user.id),
    getDashboard(user.id, { experienceStart: user.experienceStart }),
  ])

  const start = user.experienceStart ?? d.progress.firstDate ?? today
  const window = recoveryWindow(start, today)
  const state = triage({
    experienceStart: start,
    sheetsDone: d.deadlines.completeCount,
    weeksLogged: d.scores.filter((s) => s.score > 0).length,
    today,
  })

  return (
    <div className="stack-l" style={{ maxWidth: 720 }}>
      <div className="stack-s">
        <span className="label">You do not have to remember it</span>
        <h1>Catch up</h1>
        <p className="dim">
          {state.weeksMissing > 4
            ? `${state.weeksMissing} weeks with nothing in them. Most of them are already written ` +
              'down — in your calendar, in the practice timesheet — and this pulls them back out ' +
              'rather than asking you to remember them.'
            : 'Point this at your calendar and your timesheet for any period and it reconstructs ' +
              'what you were doing, week by week.'}
        </p>
      </div>

      {state.trouble !== 'fine' && (
        <div className={`band ${state.trouble === 'serious' ? 'band-alarm' : 'band-signal'}`}>
          <span className="label">Where you are</span>
          <strong>
            {state.sheetsLate === 0
              ? `${state.weeksMissing} weeks blank`
              : `${state.sheetsLate} ${state.sheetsLate === 1 ? 'sheet' : 'sheets'} past the deadline`}
          </strong>
          <span className="small">{state.verdict}</span>
        </div>
      )}

      <CatchUp projects={projects} defaultFrom={window.from} today={today} />

      <p className="tiny faint">
        Nothing is saved until you have read it. Everything recovered lands unverified, so a wrong
        line is one you delete rather than one your mentor signs.
      </p>
    </div>
  )
}
