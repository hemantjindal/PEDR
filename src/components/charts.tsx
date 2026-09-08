'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { formatDate, formatDuration, formatWeek, weekEndKey, weekStartKey, type WeekId } from '@/lib/pedr/week'

/**
 * Charts, hand-rolled in SVG and CSS grid.
 *
 * Colour follows the validated reference palette: sequential blue for magnitude,
 * one hue light to dark; categorical hues in fixed order, never cycled; status
 * colours reserved and never carrying meaning without a word beside them.
 *
 * Three light-mode categorical slots sit below 3:1 against the surface, so every
 * chart that uses them ships direct labels and a table view — that is the
 * documented relief, not an optional extra.
 */

// ---------------------------------------------------------------------------
// Week heatmap
// ---------------------------------------------------------------------------

export interface HeatWeek {
  weekId: WeekId
  score: number
  minutes: number
  entryCount: number
}

/**
 * Five sequential steps, plus a distinct state for "nothing recorded".
 *
 * Missing is not the bottom of the ramp — it is a different kind of thing, so
 * it gets a dashed outline and no fill. That also frees the lightest step to
 * mean "logged but thin", which has to stay visible.
 */
function band(score: number): string {
  if (score <= 0) return 'missing'
  if (score < 40) return '1'
  if (score < 60) return '2'
  if (score < 80) return '3'
  if (score < 95) return '4'
  return '5'
}

const COLUMNS = 13 // one row is one quarter, which is one record sheet

export function WeekHeatmap({
  weeks,
  today,
  href = (w: WeekId) => `/weeks/${w}`,
}: {
  weeks: HeatWeek[]
  today: WeekId
  href?: (weekId: WeekId) => string
}) {
  const [hover, setHover] = useState<HeatWeek | null>(null)

  const rows: HeatWeek[][] = []
  for (let i = 0; i < weeks.length; i += COLUMNS) rows.push(weeks.slice(i, i + COLUMNS))

  if (weeks.length === 0) {
    return <p className="muted small">Nothing to show yet. Log a week and this fills in.</p>
  }

  return (
    <div className="stack-s">
      <div className="stack-s" style={{ gap: 4 }}>
        {rows.map((row) => {
          const first = row[0]
          const last = row[row.length - 1]
          const logged = row.filter((w) => w.score > 0)
          const average = logged.length > 0
            ? Math.round(logged.reduce((sum, w) => sum + w.score, 0) / row.length)
            : 0
          return (
            <div key={first.weekId} className="row" style={{ gap: 12, alignItems: 'center' }}>
              <div
                className="tiny muted tabular"
                style={{ width: 96, flex: 'none', textAlign: 'right' }}
                title={`${formatDate(weekStartKey(first.weekId))} to ${formatDate(weekEndKey(last.weekId))}`}
              >
                {formatDate(weekStartKey(first.weekId), { year: false })}
              </div>
              {/* Capped rather than stretched: a contribution grid reads as a
                  grid at 24px and as a wall of tiles at 60. */}
              <div
                className="heat"
                style={{
                  gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
                  flex: '1 1 auto',
                  maxWidth: COLUMNS * 24 + (COLUMNS - 1) * 3,
                }}
              >
                {row.map((week) => (
                  <Link
                    key={week.weekId}
                    href={href(week.weekId)}
                    className="heat-cell"
                    data-band={band(week.score)}
                    data-today={week.weekId === today}
                    onMouseEnter={() => setHover(week)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(week)}
                    onBlur={() => setHover(null)}
                    aria-label={`${formatWeek(week.weekId)}: ${week.score === 0 ? 'nothing recorded' : `scored ${week.score} out of 100`}`}
                  />
                ))}
                {/* Pad the final row so cells stay the same size as the rows above. */}
                {row.length < COLUMNS &&
                  Array.from({ length: COLUMNS - row.length }, (_, i) => (
                    <span key={`pad-${i}`} aria-hidden="true" />
                  ))}
              </div>
              <div className="tiny muted tabular" style={{ flex: '1 1 auto', minWidth: 0 }}>
                {logged.length}/{row.length} logged
                {average > 0 && <span> · avg {average}</span>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="row-wrap" style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <p className="tiny muted" style={{ minHeight: '1.2em' }} aria-live="polite">
          {hover ? (
            <>
              <strong style={{ color: 'var(--ink-2)' }}>{formatWeek(hover.weekId)}</strong>
              {' · '}
              {hover.score === 0
                ? 'nothing recorded'
                : `${hover.score}/100 · ${hover.entryCount} ${hover.entryCount === 1 ? 'entry' : 'entries'} · ${formatDuration(hover.minutes)}`}
            </>
          ) : (
            'Each row is 13 weeks — one record sheet. Hover a week, or click to open it.'
          )}
        </p>
        {/* The ramp runs light-to-dark on a light surface and dark-to-light on
            a dark one, so the key names the ends rather than the direction. */}
        <div className="legend">
          <span className="legend-item">
            <span className="swatch" style={{ border: '1px dashed var(--line-strong)' }} />
            none
          </span>
          <span className="legend-item">
            <span className="swatch" style={{ background: 'var(--seq-1)' }} />
            thin
          </span>
          {['2', '3', '4'].map((b) => (
            <span className="swatch" key={b} style={{ background: `var(--seq-${b})` }} aria-hidden="true" />
          ))}
          <span className="legend-item">
            <span className="swatch" style={{ background: 'var(--seq-5)' }} />
            strong
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Coverage bars
// ---------------------------------------------------------------------------

export interface CoverageRow {
  id: string
  label: string
  value: number
  weeks: number
  share: number
  /** Rendered under the label — e.g. "last seen 12 Mar". */
  meta?: string | null
}

export function CoverageBars({
  rows,
  unit = 'h',
  emptyLabel = 'nothing recorded',
}: {
  rows: CoverageRow[]
  unit?: string
  emptyLabel?: string
}) {
  const [showTable, setShowTable] = useState(false)
  const max = Math.max(1, ...rows.map((r) => r.value))
  const tableId = useId()

  return (
    <div className="stack-s">
      {!showTable && (
        <div className="stack-s" style={{ gap: 12 }}>
          {rows.map((row) => {
            const empty = row.value <= 0
            return (
              <div key={row.id} className="stack-s" style={{ gap: 5 }}>
                <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                  <span className="small" style={{ fontWeight: 500 }}>{row.label}</span>
                  <span className="spacer" />
                  {/* Direct labels: the documented relief for the light-mode
                      contrast warning, and better than a tooltip regardless. */}
                  <span className={empty ? 'small' : 'small tabular'} style={{ color: empty ? 'var(--critical-ink)' : 'var(--ink-2)' }}>
                    {empty ? `⚠ ${emptyLabel}` : `${formatValue(row.value)}${unit} · ${Math.round(row.share * 100)}%`}
                  </span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: empty ? 0 : `${Math.max(2, (row.value / max) * 100)}%`,
                      background: empty ? 'transparent' : 'var(--accent)',
                    }}
                  />
                </div>
                {row.meta && <span className="tiny muted">{row.meta}</span>}
              </div>
            )
          })}
        </div>
      )}

      {showTable && (
        <div className="table-scroll" id={tableId}>
          <table className="data">
            <thead>
              <tr>
                <th>Area</th>
                <th style={{ textAlign: 'right' }}>Time</th>
                <th style={{ textAlign: 'right' }}>Weeks</th>
                <th style={{ textAlign: 'right' }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td className="num">{row.value > 0 ? `${formatValue(row.value)}${unit}` : '—'}</td>
                  <td className="num">{row.weeks}</td>
                  <td className="num">{Math.round(row.share * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        className="btn btn-ghost btn-sm no-print"
        style={{ alignSelf: 'flex-start' }}
        aria-expanded={showTable}
        aria-controls={tableId}
        onClick={() => setShowTable((v) => !v)}
      >
        {showTable ? 'Show chart' : 'Show as table'}
      </button>
    </div>
  )
}

function formatValue(minutes: number): string {
  const hours = minutes / 60
  return hours >= 100 ? String(Math.round(hours)) : hours.toFixed(1).replace(/\.0$/, '')
}

// ---------------------------------------------------------------------------
// Score trend
// ---------------------------------------------------------------------------

export interface TrendPoint {
  key: string
  label: string
  value: number
}

export function ScoreTrend({
  points,
  max = 100,
  suffix = '',
}: {
  points: TrendPoint[]
  max?: number
  suffix?: string
}) {
  const [active, setActive] = useState<number | null>(null)

  if (points.length < 2) {
    return <p className="muted small">Two months of records and a trend appears here.</p>
  }

  const w = 640
  const h = 170
  const pad = { top: 12, right: 16, bottom: 24, left: 30 }
  const plotW = w - pad.left - pad.right
  const plotH = h - pad.top - pad.bottom

  const x = (i: number) => pad.left + (i / (points.length - 1)) * plotW
  const y = (v: number) => pad.top + plotH - (Math.min(v, max) / max) * plotH

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  const shown = active !== null ? points[active] : last

  return (
    <div className="stack-s">
      <svg
        className="chart"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Average week score by month, ${points[0].label} to ${last.label}`}
        onMouseLeave={() => setActive(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="grid-line" x1={pad.left} x2={w - pad.right} y1={y(max * f)} y2={y(max * f)} />
            <text className="axis-label" x={pad.left - 6} y={y(max * f) + 3} textAnchor="end">
              {Math.round(max * f)}
            </text>
          </g>
        ))}

        {/* 2px line, single series, so no legend — the title names it. */}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => (
          <g key={p.key}>
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={active === i ? 5 : 3.5}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
            {/* Hit target larger than the mark. */}
            <rect
              x={x(i) - plotW / (points.length - 1) / 2}
              y={pad.top}
              width={plotW / (points.length - 1)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
            />
          </g>
        ))}

        <line className="baseline" x1={pad.left} x2={w - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} />
        <text className="axis-label" x={pad.left} y={h - 6}>{points[0].label}</text>
        <text className="axis-label" x={w - pad.right} y={h - 6} textAnchor="end">{last.label}</text>
      </svg>
      <p className="tiny muted tabular" aria-live="polite">
        <strong style={{ color: 'var(--ink-2)' }}>{shown.label}</strong>
        {' · '}
        {shown.value}
        {suffix}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Simple pieces
// ---------------------------------------------------------------------------

export function StatTile({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'good' | 'warning' | 'critical'
}) {
  const colour =
    tone === 'good' ? 'var(--good-ink)'
      : tone === 'warning' ? 'var(--warning-ink)'
      : tone === 'critical' ? 'var(--critical-ink)'
      : 'var(--ink)'
  return (
    <div className="card card-tight stack-s" style={{ gap: 4 }}>
      <span className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span className="hero-sm tabular" style={{ color: colour }}>{value}</span>
      {sub && <span className="tiny muted">{sub}</span>}
    </div>
  )
}

export function Meter({
  segments,
  total,
}: {
  segments: Array<{ id: string; value: number; colour: string; label: string }>
  total: number
}) {
  return (
    <div className="stack-s" style={{ gap: 6 }}>
      <div className="meter">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span
              key={s.id}
              style={{ width: `${Math.min(100, (s.value / total) * 100)}%`, background: s.colour }}
              title={`${s.label}: ${s.value}`}
            />
          ))}
      </div>
      {segments.length > 1 && (
        <div className="legend">
          {segments.filter((s) => s.value > 0).map((s) => (
            <span className="legend-item" key={s.id}>
              <span className="swatch" style={{ background: s.colour }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
