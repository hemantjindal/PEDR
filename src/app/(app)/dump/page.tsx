import Link from 'next/link'
import { DumpComposer } from '@/components/dump-composer'
import { requireUser } from '@/lib/auth'
import { getDumps, getEntries, getProjects } from '@/lib/data'
import { isEnrichmentAvailable } from '@/lib/ingest/enrich'
import { formatDate, formatWeek, todayKey, weekIdOf } from '@/lib/pedr/week'

export const metadata = { title: 'Dump · PEDR' }
export const dynamic = 'force-dynamic'

export default async function DumpPage() {
  const user = await requireUser()
  const [projects, entries, dumps] = await Promise.all([
    getProjects(user.id),
    getEntries(user.id),
    getDumps(user.id, 5),
  ])

  const today = todayKey()
  const last = entries[entries.length - 1] ?? null
  const live = projects.filter((p) => !p.archived)

  return (
    <div className="stack-l">
      <div className="titleblock no-print">
        <div>
          <span className="label">Week</span>
          <span className="value">{formatWeek(weekIdOf(today))}</span>
        </div>
        <div>
          <span className="label">Today</span>
          <span className="value">{formatDate(today, { weekday: true })}</span>
        </div>
        <div>
          <span className="label">Last logged</span>
          <span className="value">{last ? formatDate(last.date) : 'never'}</span>
        </div>
        <div>
          <span className="label">Projects</span>
          <span className="value">{live.length}</span>
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
        <DumpComposer
          projects={projects}
          today={today}
          modelAvailable={isEnrichmentAvailable()}
        />

        <aside className="stack no-print">
          <section className="sheet">
            <div className="sheet-head">
              <div>
                <span className="label">Four things</span>
                <h2 style={{ marginTop: 3 }}>Worth putting in</h2>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                ['Which job', 'A name or a number. Worth points on every week it appears in.'],
                ['What exactly', 'Not “drawings” — which drawings, and what changed.'],
                ['Who', 'Client, contractor, engineer, your own team. It shows the level you were working at.'],
                ['What went wrong', 'The box examiners actually read. A smooth week gives you nothing to write, and scores lower here for exactly that reason.'],
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

          {live.length > 0 && (
            <section className="sheet">
              <div className="sheet-head">
                <div>
                  <span className="label">Matched automatically</span>
                  <h2 style={{ marginTop: 3 }}>Your projects</h2>
                </div>
              </div>
              <div className="row-wrap" style={{ gap: 5 }}>
                {live.map((p) => (
                  <span className="chip" key={p.id} title={p.aliases.join(', ')}>
                    {p.code || p.name}
                  </span>
                ))}
              </div>
              <p className="tiny faint" style={{ marginTop: 10 }}>
                Write any of these, or the nicknames you set, and the entry files itself.{' '}
                <Link href="/projects" style={{ fontWeight: 500 }}>Add one →</Link>
              </p>
            </section>
          )}

          {dumps.length > 0 && (
            <section className="sheet">
              <div className="sheet-head">
                <div>
                  <span className="label">Kept verbatim</span>
                  <h2 style={{ marginTop: 3 }}>Recent dumps</h2>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {dumps.map((dump, i) => (
                  <div
                    key={dump.id}
                    style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid var(--hair)' }}
                  >
                    <div className="row" style={{ gap: 8 }}>
                      <span className="ref">{dump.createdAt.slice(0, 10)}</span>
                      <span className="spacer" />
                      <span className="label">{dump.entryCount} entries</span>
                    </div>
                    <p className="tiny faint" style={{ marginTop: 3 }}>
                      {dump.raw.replace(/\s+/g, ' ').slice(0, 68)}
                      {dump.raw.length > 68 ? '…' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
