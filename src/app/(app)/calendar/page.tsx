import { CalendarImport } from '@/components/calendar-import'
import { CalendarConnections } from '@/components/calendar-connections'
import type { ConnectionView, ProviderView } from '@/components/calendar-connections'
import { requireUser } from '@/lib/auth'
import { availableProviders, getProvider, unavailableReason } from '@/lib/connectors'
import { getCalendarFeeds, getConnections, getEntries, getProjects } from '@/lib/data'
import { defaultWindow } from '@/lib/ingest/calendar'
import { formatDate, todayKey } from '@/lib/pedr/week'

export const metadata = { title: 'Calendar · PEDR' }
export const dynamic = 'force-dynamic'

/** What to say when somebody comes back from a provider's consent screen. */
const RESULTS: Record<string, { tone: 'ok' | 'bad'; text: string }> = {
  connected: {
    tone: 'ok',
    text: 'Connected. It read your calendar straight away — anything it found is waiting in Review.',
  },
  'sync-failed': {
    tone: 'bad',
    text: 'Connected, but the first read did not work. Try "Read it now" below.',
  },
  declined: { tone: 'bad', text: 'You cancelled on the sign-in screen. Nothing was connected.' },
  expired: { tone: 'bad', text: 'That took too long and the request expired. Start again.' },
  state: { tone: 'bad', text: 'That did not come back the way it went out. Start again.' },
  failed: { tone: 'bad', text: 'That did not work. Nothing was connected.' },
  'not-configured': { tone: 'bad', text: 'That provider is not set up on this deployment.' },
  'no-key': {
    tone: 'bad',
    text: 'Connecting is switched off here: there is no encryption key, and calendar credentials are not stored without one.',
  },
  'unknown-provider': { tone: 'bad', text: 'No such provider.' },
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string }>
}) {
  const user = await requireUser()
  const { connect } = await searchParams

  const [projects, feeds, entries, connections] = await Promise.all([
    getProjects(user.id),
    getCalendarFeeds(user.id),
    getEntries(user.id),
    getConnections(user.id),
  ])

  const today = todayKey()
  const window = defaultWindow(today, 3)
  const fromCalendar = entries.filter((e) => e.source === 'calendar')

  const views: ConnectionView[] = connections.map((c) => ({
    id: c.id,
    provider: c.provider,
    providerLabel: getProvider(c.provider)?.label ?? c.provider,
    accountEmail: c.accountEmail,
    calendarName: c.calendarName,
    enabled: c.enabled,
    // A live subscription means a change lands in seconds. Without one it still
    // syncs, just on the hourly pass — and the screen should say which.
    live: Boolean(c.channelId) && !isPast(c.channelExpiresAt),
    lastSyncedAt: c.lastSyncedAt,
    lastImported: c.lastImported,
    lastError: c.lastError,
  }))

  const connected = new Set(connections.map((c) => c.provider))
  const offer: ProviderView[] = availableProviders()
    .filter((p) => !connected.has(p.id))
    .map((p) => ({ id: p.id, label: p.label, blurb: p.blurb, permission: p.permission }))

  const unavailable = unavailableReason()
  const lastSync = [
    ...connections.map((c) => c.lastSyncedAt),
    ...feeds.map((f) => f.lastSyncedAt),
  ].filter((v): v is string => Boolean(v)).sort().at(-1)

  const result = connect ? RESULTS[connect] : undefined

  return (
    <div className="stack-l">
      <div className="page-head">
        <div>
          <span className="label">Calendar</span>
          <h1>What you already wrote down</h1>
          <p>
            Your calendar recorded every working day as it happened — what, when, how long, and who
            was in the room. Connect it once and it keeps feeding your record.
          </p>
        </div>
      </div>

      {result ? (
        <p className={result.tone === 'ok' ? 'note note-pending' : 'note note-revision'}>
          <span className="label">{result.tone === 'ok' ? 'Done' : 'Not done'}</span>
          <span>{result.text}</span>
        </p>
      ) : null}

      <div className="titleblock no-print">
        <div>
          <span className="label">Connected</span>
          <span className="value">{connections.length}</span>
        </div>
        <div>
          <span className="label">From calendars</span>
          <span className="value">{fromCalendar.length}</span>
        </div>
        <div>
          <span className="label">Last read</span>
          <span className="value">{lastSync ? formatDate(lastSync.slice(0, 10)) : 'never'}</span>
        </div>
        <div>
          <span className="label">Today</span>
          <span className="value">{formatDate(today, { weekday: true })}</span>
        </div>
      </div>

      <div className="split">
        <div className="stack-l">
          <section className="stack">
            <div className="stack-s">
              <span className="label">Once, and then never again</span>
              <h2>Connect your calendar</h2>
            </div>

            {unavailable ? (
              <p className="note">
                <span className="label">Not yet</span>
                <span>{unavailable}</span>
              </p>
            ) : (
              <CalendarConnections connections={views} providers={offer} />
            )}
          </section>

          <section className="stack">
            <div className="stack-s">
              <span className="label">If your practice will not allow it</span>
              <h2>Import a file instead</h2>
              <p className="small dim" style={{ maxWidth: '58ch' }}>
                Some tenants block third-party apps outright. A published link or an exported .ics
                file does the same job — it just will not keep itself up to date.
              </p>
            </div>
            <CalendarImport
              projects={projects}
              feeds={feeds}
              today={today}
              defaultFrom={window.from}
            />
          </section>
        </div>

        <aside className="stack no-print">
          <section className="sheet stack">
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
                [
                  'Nothing lands unchecked',
                  'Everything a connected calendar brings in waits in Review until you have looked at it. It is your record; nothing writes to it behind your back.',
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

          <section className="sheet stack">
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

function isPast(iso: string | null): boolean {
  if (!iso) return true
  const at = Date.parse(iso)
  return Number.isNaN(at) || at < Date.now()
}
