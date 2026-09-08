import Link from 'next/link'
import { notFound } from 'next/navigation'
import { saveWeekNoteAction } from '../../actions'
import { EntryRow } from '@/components/entry-row'
import { requireUser } from '@/lib/auth'
import { getEntriesForWeek, getProjects, getWeekNote } from '@/lib/data'
import { REFLECTION_PROMPTS } from '@/lib/pedr/constants'
import { WRITING_GUIDE } from '@/lib/pedr/guidance'
import { scoreWeek } from '@/lib/pedr/scoring'
import {
  addWeeks, formatDuration, formatWeek, formatWeekRange, isWeekId, weekEndKey, weekStartKey,
} from '@/lib/pedr/week'

export const dynamic = 'force-dynamic'

export default async function WeekPage({ params }: { params: Promise<{ weekId: string }> }) {
  const { weekId } = await params
  if (!isWeekId(weekId)) notFound()

  const user = await requireUser()
  const [entries, note, projects] = await Promise.all([
    getEntriesForWeek(user.id, weekId),
    getWeekNote(user.id, weekId),
    getProjects(user.id),
  ])

  const score = scoreWeek(weekId, entries, note)

  return (
    <div className="stack-l">
      <div className="row-wrap" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div className="stack-s">
          <div className="row-wrap" style={{ gap: 8 }}>
            <Link href={`/weeks/${addWeeks(weekId, -1)}`} className="btn btn-ghost btn-sm">←</Link>
            <h1>{formatWeek(weekId)}</h1>
            <Link href={`/weeks/${addWeeks(weekId, 1)}`} className="btn btn-ghost btn-sm">→</Link>
          </div>
          <p className="dim small">
            {formatWeekRange(weekId)} · {entries.length} {entries.length === 1 ? 'entry' : 'entries'} ·{' '}
            {formatDuration(score.minutes)}
          </p>
        </div>
        <Link href="/dump" className="btn btn-primary">Add to this week</Link>
      </div>

      {/* The score, with its working shown — a number nobody can interrogate
          is a number nobody trusts. */}
      <section className="sheet stack">
        <div className="sheet-head">
          <h2>{score.score} out of 100 · {score.bandLabel}</h2>
          {score.nextBestAction && (
            <span className="mark mark-pending"><span aria-hidden="true">→</span> one thing to fix</span>
          )}
        </div>
        <div className="stack-s">
          {score.components.map((component) => (
            <div key={component.id} className="row-wrap" style={{ gap: 10, alignItems: 'baseline' }}>
              <span aria-hidden="true" style={{ width: 14, color: component.earned > 0 ? 'var(--signed-ink)' : 'var(--ink-3)' }}>
                {component.earned > 0 ? '✓' : '○'}
              </span>
              <span className="small" style={{ fontWeight: 500 }}>{component.label}</span>
              <span className="spacer" />
              <span className="ref">{component.earned}/{component.points}</span>
            </div>
          ))}
        </div>
        {score.nextBestAction && (
          <p className="note note-ink small">
            <span aria-hidden="true">→</span> {score.nextBestAction}
          </p>
        )}
      </section>

      <section className="stack">
        <h2>What you did</h2>
        {entries.length === 0 ? (
          <p className="note small">
            Nothing recorded for this week. <Link href="/dump" style={{ color: 'var(--ink)' }}>Dump it</Link> —
            even three lines is worth 40 points and, more to the point, is evidence.
          </p>
        ) : (
          <div className="stack-s">
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} projects={projects} />
            ))}
          </div>
        )}
      </section>

      {/* The reflective boxes, with what good looks like beside each. */}
      <section className="sheet stack">
        <div className="sheet-head">
          <div className="stack-s" style={{ gap: 2 }}>
            <h2>Reflection</h2>
            <p className="tiny faint">
              This is what the quarterly sheet is built from, and it is what examiners read.
            </p>
          </div>
        </div>

        <form action={saveWeekNoteAction} className="stack">
          <input type="hidden" name="weekId" value={weekId} />
          {REFLECTION_PROMPTS.map((prompt) => {
            const guide = WRITING_GUIDE.find((g) => g.promptId === prompt.id)
            return (
              <div className="field" key={prompt.id}>
                <label htmlFor={prompt.id}>{prompt.label}</label>
                <textarea
                  id={prompt.id}
                  name={prompt.id}
                  rows={prompt.id === 'wentWrong' ? 4 : 3}
                  defaultValue={note?.[prompt.id] ?? ''}
                  placeholder={prompt.hint}
                />
                {guide && (
                  <details className="hint">
                    <summary style={{ cursor: 'pointer' }}>What good looks like</summary>
                    <div className="stack-s" style={{ marginTop: 8 }}>
                      <p className="tiny"><strong>Weak:</strong> <span className="faint">{guide.weak}</span></p>
                      <p className="tiny"><strong>Strong:</strong> <span className="dim">{guide.strong}</span></p>
                      <p className="tiny faint">{guide.whyBetter}</p>
                    </div>
                  </details>
                )}
              </div>
            )
          })}
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
            Save reflection
          </button>
        </form>
      </section>

      <p className="tiny faint">
        Week runs {weekStartKey(weekId)} to {weekEndKey(weekId)}.
      </p>
    </div>
  )
}
