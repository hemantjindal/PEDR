import { CalendarImport } from '@/components/calendar-import'
import { requireUser } from '@/lib/auth'
import { getCalendarFeeds, getEntries, getProjects } from '@/lib/data'
import { defaultWindow } from '@/lib/ingest/calendar'
import { formatDate, todayKey } from '@/lib/pedr/week'

export const metadata = { title: 'Calendar · PEDR' }
export const dynamic = 'force-dynamic'

export default async function CalendarPage() {
  const user = await requireUser()
  const [projects, feeds, entries] = await Promise.all([
    getProjects(user.id),
    getCalendarFeeds(user.id),
    getEntries(user.id),
  ])

  const today = todayKey()
  const window = defaultWindow(today, 3)
  const fromCalendar = entries.filter((e) => e.source === 'calendar')
  const lastSync = feeds
    .map((f) => f.lastSyncedAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1)

  return (
    <div className="stack-l">
      <div className="titleblock no-print">
        <div>
          <span className="label">Linked</span>
          <span className="value">{feeds.length}</span>
        </div>
        <div>
          <span className="label">From calendars</span>
          <span className="value">{fromCalendar.length}</span>
        </div>
        <div>
          <span className="label">Last synced</span>
          <span className="value">{lastSync ? formatDate(lastSync.slice(0, 10)) : 'never'}</span>
        </div>
        <div>
          <span className="label">Today</span>
          <span className="value">{formatDate(today, { weekday: true })}</span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.9fr) minmax(0, 1fr)',
          gap: 18,
          alignItems: 'start',
        }}
        className="dump-layout"
      >
        <CalendarImport
          projects={projects}
          feeds={feeds}
          today={today}
          defaultFrom={window.from}
        />

        <aside className="stack no-print">
          <section className="sheet">
            <div className="sheet-head">
              <div>
                <span className="label">What it can and cannot do</span>
                <h2 style={{ marginTop: 3 }}>Read this first</h2>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                [
                  'It fixes the dates',
                  'A calendar was written at the time. Nothing else you have was — which is exactly why a quarter reconstructed from memory has holes in it.',
                ],
                [
                  'It fixes the people',
                  'Who was in the room is on every invite and in nobody’s memory. It is also the thing that shows an examiner the level you were working at.',
                ],
                [
                  'It does not know the work',
                  'Six hours on a package appears in no calendar. What comes in is a skeleton of the week — the meetings — and you fill in the rest.',
                ],
                [
                  'It never guesses hours',
                  'The length of a meeting is a fact and gets used as one. All-day leave is the one assumption made, and it is marked as an estimate.',
                ],
              ].map(([term, note], i) => (
                <div
                  key={term}
                  style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--hair)' }}
                >
                  <div className="label label-ink" style={{ marginBottom: 4 }}>{term}</div>
                  <p className="small dim">{note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="sheet">
            <div className="sheet-head">
              <div>
                <span className="label">Thrown away automatically</span>
                <h2 style={{ marginTop: 3 }}>The noise</h2>
              </div>
            </div>
            <p className="small dim" style={{ marginBottom: 8 }}>
              Cancelled meetings, anything you declined, anything marked free, all-day blocks that
              are not leave, and the standing furniture of a week:
            </p>
            <div className="row-wrap" style={{ gap: 5 }}>
              {['Lunch', 'Focus time', 'Standup', 'Holds', 'Commute', 'Dentist', 'Birthdays', 'Under 15 min'].map((word) => (
                <span className="chip" key={word}>{word}</span>
              ))}
            </div>
            <p className="tiny faint" style={{ marginTop: 10 }}>
              Every one is listed on the review screen with the reason, so nothing disappears
              quietly.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
