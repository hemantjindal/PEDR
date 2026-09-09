import Link from 'next/link'
import type { Mission, MissionBoard } from '@/lib/pedr/missions'

/**
 * What to do next, ranked.
 *
 * The reason a PEDR goes wrong is not that it is hard. It is that skipping a
 * week costs nothing today and everything at month twenty-two, so anything
 * that makes that cost visible now is doing real work. Hence a board, a score,
 * a streak.
 *
 * What keeps it from being a gimmick is that none of the numbers are invented.
 * The points on a mission are the points that thing is worth in the weekly
 * score, which is itself weighted by what examiners read. A mission with no
 * points is a mission you cannot type your way out of — an empty work stage is
 * a conversation with your team leader, not a form to fill in — and saying so
 * is more useful than pretending a button would fix it.
 */

const URGENCY: Record<Mission['urgency'], { mark: string; label: string }> = {
  now: { mark: 'mark-revision', label: 'now' },
  soon: { mark: 'mark-pending', label: 'this week' },
  whenever: { mark: 'mark-none', label: 'when you can' },
}

const KIND_LABEL: Record<Mission['kind'], string> = {
  setup: 'Setup',
  deadline: 'Deadline',
  week: 'This week',
  balance: 'Balance',
  coverage: 'Coverage',
}

export function MissionPanel({ board }: { board: MissionBoard }) {
  const shown = board.missions.slice(0, 6)
  const weekPct = Math.min(100, Math.round((board.weekScore / board.weekTarget) * 100))

  return (
    <section className="sheet stack">
      <div className="sheet-head">
        <div>
          <span className="label">
            {board.missions.length === 0
              ? 'Nothing outstanding'
              : `${board.missions.length} ${board.missions.length === 1 ? 'thing' : 'things'} to do`}
          </span>
          <h2 style={{ marginTop: 3 }}>Next</h2>
        </div>
        <span className="spacer" />
        <span className="chip chip-signal">{board.rank.name}</span>
      </div>

      {/* The week, as a target rather than a percentage of a hundred: a week
          where nothing went wrong has nothing to write in the box that matters,
          and demanding it would teach people to invent friction. */}
      <div className="check-row">
        <span className="check-label small dim">
          {board.weekScore >= board.weekTarget ? (
            <>
              This week is <strong style={{ color: 'var(--ink)' }}>done</strong> — {board.weekScore}
              {board.weekScore < 100 && <> of a possible 100, and the rest is friction you cannot invent</>}
            </>
          ) : (
            <>
              This week scores <strong style={{ color: 'var(--ink)' }}>{board.weekScore}</strong> of
              the {board.weekTarget} that are yours to take
              {board.availableThisWeek > 0 && <> · {board.availableThisWeek} still on the table</>}
            </>
          )}
        </span>
        <span className="check-value">
          <span className="ref">
            {board.streak} week{board.streak === 1 ? '' : 's'} in a row
          </span>
        </span>
      </div>
      <span className="bar-track" aria-hidden="true">
        <span className="bar-fill" style={{ width: `${weekPct}%` }} />
      </span>

      {shown.length === 0 ? (
        <p className="small dim">
          Nothing missing from this week, nothing overdue, and no empty stages. That is as good as
          this screen gets — come back on Monday.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shown.map((mission, i) => (
            <MissionRow key={mission.id} mission={mission} first={i === 0} />
          ))}
        </div>
      )}

      {board.nextRank && (
        <p className="tiny faint">
          {board.monthsToNextRank} more {board.monthsToNextRank === 1 ? 'month' : 'months'} of logged
          experience to “{board.nextRank.name}” — {board.nextRank.blurb.toLowerCase()}
        </p>
      )}
    </section>
  )
}

function MissionRow({ mission, first }: { mission: Mission; first: boolean }) {
  const urgency = URGENCY[mission.urgency]
  return (
    <div
      style={{
        padding: '11px 0',
        borderTop: first ? 'none' : '1px solid var(--hair)',
      }}
    >
      <div className="row-wrap" style={{ gap: 8, alignItems: 'baseline' }}>
        <span className={`mark ${urgency.mark}`}>{urgency.label}</span>
        <Link
          href={mission.href}
          className="small"
          style={{ fontWeight: 600, flex: '1 1 200px', minWidth: 0 }}
        >
          {mission.title}
        </Link>
        {mission.points > 0 && (
          <span className="chip" title="What this is worth in this week's score">
            +{mission.points}
          </span>
        )}
        <span className="label" style={{ flex: 'none' }}>{KIND_LABEL[mission.kind]}</span>
      </div>
      <p className="tiny faint" style={{ marginTop: 3 }}>{mission.why}</p>
      {mission.progress && (
        <span className="bar-track" style={{ marginTop: 6 }} aria-hidden="true">
          <span
            className="bar-fill"
            style={{ width: `${Math.round((mission.progress.done / mission.progress.target) * 100)}%` }}
          />
        </span>
      )}
    </div>
  )
}
