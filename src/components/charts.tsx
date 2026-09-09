'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import {
  formatDate, formatDuration, formatWeek, weekEndKey, weekStartKey, type WeekId,
} from '@/lib/pedr/week'

/**
 * The drawn parts of the record.
 *
 * Everything here is hairlines and ink. The one place colour encodes anything
 * is the register's density ramp — five ordinal steps validated for monotone
 * lightness, adjacent step separation and contrast against both surfaces.
 * Elsewhere colour means status, and status always carries a mark and a word so
 * it never rests on hue alone.
 */

// ---------------------------------------------------------------------------
// The register
// ---------------------------------------------------------------------------

export interface RegisterWeek {
  weekId: WeekId
  score: number
  minutes: number
  entryCount: number
}

export interface RegisterRow {
  ref: string
  status: 'signed' | 'pending' | 'revision' | 'none'
  statusLabel: string
  href?: string
}

/** Five density steps. Nothing recorded is not step zero — it is a hollow cell. */
function density(score: number): number {
  if (score <= 0) return 0
  if (score < 40) return 1
  if (score < 60) return 2
  if (score < 80) return 3
  if (score < 95) return 4
  return 5
}

const PER_ROW = 13 // one row is one record sheet

export function Register({
  weeks,
  today,
  rows: rowInfo,
  href = (w: WeekId) => `/weeks/${w}`,
}: {
  weeks: RegisterWeek[]
  today: WeekId
  rows?: RegisterRow[]
  href?: (weekId: WeekId) => string
}) {
  const [hover, setHover] = useState<RegisterWeek | null>(null)

  if (weeks.length === 0) {
    return (
      <p className="small faint">
        Nothing drawn yet. The first week you log appears here.
      </p>
    )
  }

  const chunks: RegisterWeek[][] = []
  for (let i = 0; i < weeks.length; i += PER_ROW) chunks.push(weeks.slice(i, i + PER_ROW))

  return (
    <div className="stack-s">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {chunks.map((chunk, index) => {
          const info = rowInfo?.[index]
          const logged = chunk.filter((w) => w.score > 0)
          const first = chunk[0]
          const last = chunk[chunk.length - 1]

          return (
            <div key={first.weekId} className="row" style={{ gap: 12, alignItems: 'center' }}>
              <div style={{ width: 82, flex: 'none', textAlign: 'right' }}>
                {info ? (
                  info.href ? (
                    <Link href={info.href} className="ref" style={{ textDecoration: 'none' }}>
                      {info.ref}
                    </Link>
                  ) : (
                    <span className="ref">{info.ref}</span>
                  )
                ) : (
                  <span className="ref">{formatDate(weekStartKey(first.weekId), { year: false })}</span>
                )}
              </div>

              <div
                className="register"
                style={{
                  gridTemplateColumns: `repeat(${PER_ROW}, minmax(0, 1fr))`,
                  flex: '1 1 auto',
                  maxWidth: PER_ROW * 22 + (PER_ROW - 1) * 2,
                }}
                title={`${formatDate(weekStartKey(first.weekId))} – ${formatDate(weekEndKey(last.weekId))}`}
              >
                {chunk.map((week) => (
                  <Link
                    key={week.weekId}
                    href={href(week.weekId)}
                    className="reg-cell"
                    data-d={density(week.score)}
                    data-now={week.weekId === today}
                    onMouseEnter={() => setHover(week)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(week)}
                    onBlur={() => setHover(null)}
                    aria-label={`${formatWeek(week.weekId)}: ${
                      week.score === 0 ? 'nothing recorded' : `${week.score} out of 100`
                    }`}
                  />
                ))}
                {chunk.length < PER_ROW &&
                  Array.from({ length: PER_ROW - chunk.length }, (_, i) => (
                    <span key={`pad-${i}`} aria-hidden="true" />
                  ))}
              </div>

              <div className="row" style={{ gap: 10, flex: '1 1 auto', minWidth: 0 }}>
                <span className="ref faint">{logged.length}/{chunk.length}</span>
                {info && <span className={`mark mark-${info.status}`}>{info.statusLabel}</span>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="row-wrap" style={{ justifyContent: 'space-between', gap: 14, marginTop: 6 }}>
        <p className="tiny faint" style={{ minHeight: '1.3em' }} aria-live="polite">
          {hover ? (
            <>
              <span className="ref" style={{ color: 'var(--ink-2)' }}>{formatWeek(hover.weekId)}</span>
              {' — '}
              {hover.score === 0
                ? 'nothing recorded'
                : `${hover.score}/100 · ${hover.entryCount} ${hover.entryCount === 1 ? 'entry' : 'entries'} · ${formatDuration(hover.minutes)}`}
            </>
          ) : (
            'One row is thirteen weeks — one record sheet.'
          )}
        </p>
        <div className="row" style={{ gap: 8 }}>
          <span className="label">thin</span>
          {[1, 2, 3, 4, 5].map((d) => (
            <span
              key={d}
              aria-hidden="true"
              style={{ width: 12, height: 12, background: `var(--d${d})`, display: 'block' }}
            />
          ))}
          <span className="label">full</span>
          <span
            aria-hidden="true"
            style={{ width: 12, height: 12, border: '2px solid var(--hair)', display: 'block', marginLeft: 8 }}
          />
          <span className="label">none</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scale bar
// ---------------------------------------------------------------------------

/**
 * Progress drawn as a scale rather than a pill: ticks, a filled run, and the
 * recency window marked on the same rule — because the two rules interact and
 * showing them apart is what lets people miss the second one.
 */
export function ScaleBar({
  value,
  total,
  ticks,
  unit = 'months',
}: {
  value: number
  total: number
  ticks: number[]
  unit?: string
}) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`

  return (
    <div className="scale" role="img" aria-label={`${value} of ${total} ${unit}`}>
      <div className="scale-track">
        <div className="scale-fill" style={{ width: pct(value) }} />
      </div>
      <div className="scale-ticks">
        {ticks.map((t) => (
          <span key={t} className="scale-tick" style={{ left: pct(t) }}>
            <span>{t}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Coverage, as a schedule
// ---------------------------------------------------------------------------

export interface CoverageRow {
  id: string
  code: string
  label: string
  value: number
  weeks: number
  share: number
  meta?: string | null
}

/**
 * A schedule, not a bar chart. Every row carries its own number in the margin,
 * which is both how a drawing schedule reads and the documented relief for a
 * colour that cannot be relied on alone.
 */
export function CoverageSchedule({
  rows,
  emptyLabel = 'never',
}: {
  rows: CoverageRow[]
  emptyLabel?: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((row, i) => {
        const empty = row.value <= 0
        return (
          <div
            key={row.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: '0 12px',
              alignItems: 'center',
              padding: '9px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--hair)',
            }}
          >
            <span className="ref" style={{ color: empty ? 'var(--revision-ink)' : 'var(--ink-2)', width: 30 }}>
              {row.code}
            </span>

            <div style={{ minWidth: 0 }}>
              <div className="small" style={{ marginBottom: 5, color: 'var(--ink)' }}>{row.label}</div>
              {/* An empty row shows an empty track. Filling it with a hatch
                  to mean "nothing" reads as "full" at a glance. */}
              <div className={empty ? 'bar-track bar-track-empty' : 'bar-track'}>
                {!empty && (
                  <div className="bar-fill" style={{ width: `${Math.max(1.5, (row.value / max) * 100)}%` }} />
                )}
              </div>
            </div>

            <div style={{ textAlign: 'right', minWidth: 96 }}>
              {empty ? (
                <span className="mark mark-revision">{emptyLabel}</span>
              ) : (
                <>
                  <div className="ref" style={{ color: 'var(--ink)' }}>{hours(row.value)}h</div>
                  <div className="label">{Math.round(row.share * 100)}% · {row.weeks} wk</div>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function hours(minutes: number): string {
  const h = minutes / 60
  return h >= 100 ? String(Math.round(h)) : h.toFixed(1).replace(/\.0$/, '')
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

export interface TrendPoint {
  key: string
  label: string
  value: number
}

export function Trend({ points, max = 100 }: { points: TrendPoint[]; max?: number }) {
  const [active, setActive] = useState<number | null>(null)
  const clipId = useId()

  if (points.length < 2) {
    return <p className="small faint">Two months of records and the line appears here.</p>
  }

  const w = 640
  const h = 150
  const pad = { top: 10, right: 12, bottom: 20, left: 26 }
  const pw = w - pad.left - pad.right
  const ph = h - pad.top - pad.bottom

  const x = (i: number) => pad.left + (i / (points.length - 1)) * pw
  const y = (v: number) => pad.top + ph - (Math.min(v, max) / max) * ph
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  const shown = active !== null ? points[active] : last

  return (
    <div className="stack-s">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: '100%', display: 'block' }}
        role="img"
        aria-label={`Average week score by month, ${points[0].label} to ${last.label}`}
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          <clipPath id={clipId}><rect x={pad.left} y={0} width={pw} height={h} /></clipPath>
        </defs>

        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={pad.left} x2={w - pad.right} y1={y(max * f)} y2={y(max * f)}
              stroke="var(--hair)" strokeWidth="1"
            />
            <text
              x={pad.left - 6} y={y(max * f) + 3} textAnchor="end"
              fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)"
            >
              {Math.round(max * f)}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" clipPath={`url(#${clipId})`} />

        {points.map((p, i) => (
          <g key={p.key}>
            <rect
              x={x(i) - pw / (points.length - 1) / 2} y={pad.top}
              width={pw / (points.length - 1)} height={ph}
              fill="transparent" onMouseEnter={() => setActive(i)}
            />
            <rect
              x={x(i) - (active === i ? 3.5 : 2)} y={y(p.value) - (active === i ? 3.5 : 2)}
              width={active === i ? 7 : 4} height={active === i ? 7 : 4}
              fill={active === i ? 'var(--ink)' : 'var(--sheet)'}
              stroke="var(--ink)" strokeWidth="1.5"
            />
          </g>
        ))}

        <line x1={pad.left} x2={w - pad.right} y1={pad.top + ph} y2={pad.top + ph} stroke="var(--hair-2)" strokeWidth="1" />
      </svg>
      <p className="tiny faint" aria-live="polite">
        <span className="ref" style={{ color: 'var(--ink-2)' }}>{shown.label}</span>
        {' — '}{shown.value} average
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

export function Stat({
  label,
  value,
  sub,
  tone = 'ink',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'ink' | 'revision' | 'signed'
}) {
  const colour =
    tone === 'revision' ? 'var(--revision-ink)'
      : tone === 'signed' ? 'var(--signed-ink)'
      : 'var(--ink)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="label">{label}</span>
      <span className="figure-sm" style={{ color: colour }}>{value}</span>
      {sub && <span className="tiny faint">{sub}</span>}
    </div>
  )
}
