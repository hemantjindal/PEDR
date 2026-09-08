import Link from 'next/link'
import { saveEmploymentAction, saveSettingsAction } from '../actions'
import { requireUser } from '@/lib/auth'
import { getEmployments } from '@/lib/data'
import { EXPERIENCE_CATEGORIES, EXPERIENCE_LOCATIONS, REQUIREMENTS } from '@/lib/pedr/constants'
import { isEnrichmentAvailable } from '@/lib/ingest/enrich'
import { formatDate } from '@/lib/pedr/week'
import { CopyBlock } from '@/components/copy-block'

export const metadata = { title: 'Settings · PEDR' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await requireUser()
  const employments = await getEmployments(user.id)

  return (
    <div className="stack-l">
      <div className="stack-s">
        <h1>Settings</h1>
        <p className="dim">Five minutes here makes everything else more accurate.</p>
      </div>

      <section className="sheet stack">
        <h2>You</h2>
        <form action={saveSettingsAction} className="stack">
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" defaultValue={user.name} />
            </div>
            <div className="field">
              <label htmlFor="teamsName">Teams display name</label>
              <input id="teamsName" name="teamsName" defaultValue={user.teamsName ?? ''} />
              <span className="hint">
                So a pasted conversation knows which messages are yours. Must match Teams exactly.
              </span>
            </div>
            <div className="field">
              <label htmlFor="experienceStart">Practical experience started</label>
              <input id="experienceStart" name="experienceStart" type="date" defaultValue={user.experienceStart ?? ''} />
              <span className="hint">
                Anchors the {REQUIREMENTS.minTotalMonths}-month count and the quarterly deadlines.
              </span>
            </div>
            <div className="field">
              <label htmlFor="targetExamDate">Part 3 exam, if you have a date</label>
              <input id="targetExamDate" name="targetExamDate" type="date" defaultValue={user.targetExamDate ?? ''} />
              <span className="hint">
                Used for the {REQUIREMENTS.minRecentMonths}-in-{REQUIREMENTS.recentWindowMonths}
                {' '}recency rule.
              </span>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
            Save
          </button>
        </form>
      </section>

      <section className="sheet stack">
        <div className="sheet-head">
          <div className="stack-s" style={{ gap: 2 }}>
            <h2>Where you work</h2>
            <p className="tiny faint">
              Category and location decide whether your experience counts in full.
            </p>
          </div>
        </div>

        {employments.length > 0 && (
          <div className="table-scroll">
            <table className="schedule">
              <thead>
                <tr><th>Employer</th><th>Role</th><th>From</th><th>Category</th><th>Supervisor</th></tr>
              </thead>
              <tbody>
                {employments.map((e) => (
                  <tr key={e.id}>
                    <td>{e.employer}</td>
                    <td className="faint">{e.role ?? '—'}</td>
                    <td className="small faint">
                      {formatDate(e.startDate)}{e.endDate ? ` – ${formatDate(e.endDate)}` : ' – now'}
                    </td>
                    <td><span className="chip">Category {e.category}</span></td>
                    <td className="small faint">{e.supervisorName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details>
          <summary className="small dim" style={{ cursor: 'pointer' }}>Add a period of employment</summary>
          <form action={saveEmploymentAction} className="stack" style={{ marginTop: 14 }}>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="employer">Employer</label>
                <input id="employer" name="employer" required />
              </div>
              <div className="field">
                <label htmlFor="role">Your role</label>
                <input id="role" name="role" placeholder="Architectural Assistant" />
              </div>
              <div className="field">
                <label htmlFor="startDate">Started</label>
                <input id="startDate" name="startDate" type="date" required />
              </div>
              <div className="field">
                <label htmlFor="endDate">Ended, if it has</label>
                <input id="endDate" name="endDate" type="date" />
              </div>
              <div className="field">
                <label htmlFor="location">Location</label>
                <select id="location" name="location" defaultValue="UK">
                  {EXPERIENCE_LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="category">Category of experience</label>
                <select id="category" name="category" defaultValue="i">
                  {EXPERIENCE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span className="hint">
                  Most UK practice under an ARB-registered architect is Category i.
                </span>
              </div>
              <div className="field">
                <label htmlFor="supervisorName">Supervising architect</label>
                <input id="supervisorName" name="supervisorName" />
              </div>
              <div className="field">
                <label htmlFor="supervisorRegNumber">Their ARB number</label>
                <input id="supervisorRegNumber" name="supervisorRegNumber" />
              </div>
              <div className="field">
                <label htmlFor="mentorName">Employment Mentor</label>
                <input id="mentorName" name="mentorName" />
              </div>
              <div className="field">
                <label htmlFor="weeklyHours">Contracted hours a week</label>
                <input id="weeklyHours" name="weeklyHours" type="number" step="0.5" min="1" max="80" defaultValue="37.5" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
              Add
            </button>
          </form>
        </details>
      </section>

      <section className="sheet stack">
        <div className="sheet-head">
          <div className="stack-s" style={{ gap: 2 }}>
            <h2>Reminders in your calendar</h2>
            <p className="tiny faint">
              Subscribe once and a nudge appears every Friday, with every sheet deadline alongside it.
            </p>
          </div>
        </div>
        <p className="small dim">
          Add this as a subscribed calendar on your phone. On iPhone: Settings → Calendar → Accounts
          → Add Account → Other → Add Subscribed Calendar. On Android, add it in Google Calendar
          under Other calendars → From URL.
        </p>
        <CopyBlock text={`${process.env.APP_URL ?? ''}/api/ics/${user.calendarToken}`} />
        <p className="tiny faint">
          Anyone with this link can see your deadlines, so treat it as private. It does not give
          access to your account.
        </p>
      </section>

      <section className="sheet stack">
        <h2>Projects</h2>
        <p className="small dim">
          Naming a project is worth points on every week it appears in, and it is what lets a dump
          be filed correctly. Add the shorthand you actually say out loud.
        </p>
        <Link href="/projects" className="btn" style={{ alignSelf: 'flex-start' }}>Manage projects</Link>
      </section>

      <section className="sheet stack">
        <h2>The model pass</h2>
        <p className="small dim">
          {isEnrichmentAvailable()
            ? 'Configured. Messy dumps get a second, smarter pass. It can improve wording and tagging but can never set your hours — those come from what you wrote or from a timesheet.'
            : 'Not configured. Everything works without it: the parser is deterministic and the model pass is only ever a refinement. Set ANTHROPIC_API_KEY to switch it on.'}
        </p>
      </section>
    </div>
  )
}
