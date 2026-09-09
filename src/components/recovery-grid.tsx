'use client'

import { formatWeekRange, weekRange, weekIdOf, type DateKey, type WeekId } from '@/lib/pedr/week'
import { REQUIREMENTS } from '@/lib/pedr/constants'

/**
 * Your two years, as a drawing register.
 *
 * Thirteen weeks to a row because thirteen weeks is one record sheet, so the
 * grid is not a decoration of the record — it is the shape of the record. An
 * empty week is a hollow cell you can count from across the room, which is the
 * whole argument of this product made without a paragraph of text.
 *
 * Deliberately inert: no links, no tooltips that need a router. It is a
 * picture, and the picture is the pitch.
 */

const PER_ROW = 13

export interface GridWeek {
  weekId: WeekId
  /** How much was recovered. 0 is a hole. */
  entries: number
}

/**
 * Three states, not five.
 *
 * A ramp of five greys turns a calendar import — which lands five to eight
 * entries on nearly every week — into one flat brown block. What the drawing
 * has to say is binary and it has to say it across a room: this week exists,
 * this one is a hole. The middle step is for a week held up by a single entry,
 * which is recovered but thin.
 */
function density(entries: number): number {
  if (entries <= 0) return 0
  if (entries <= 2) return 2
  return 5
}

export function RecoveryGrid({
  from,
  to,
  recovered,
  animate = false,
}: {
  from: DateKey
  to: DateKey
  /** weekId → entries recovered. Absent weeks are holes. */
  recovered?: Map<WeekId, number>
  animate?: boolean
}) {
  const weeks = weekRange(from, to)
  const today = weekIdOf(to)

  const rows: WeekId[][] = []
  for (let i = 0; i < weeks.length; i += PER_ROW) rows.push(weeks.slice(i, i + PER_ROW))
  // A short last row looks broken. Pad it with cells that draw as nothing.
  const pad = rows.length > 0 ? PER_ROW - rows[rows.length - 1].length : 0

  return (
    <div className="register-sheet">
      {rows.map((row, index) => {
        const filled = row.filter((w) => (recovered?.get(w) ?? 0) > 0).length
        return (
          <div className="register-row" key={row[0]}>
            <span className="register-ref">
              {index < REQUIREMENTS.minTotalMonths / 3 ? `Sheet ${index + 1}` : '—'}
            </span>
            <div
              className="register"
              style={{ gridTemplateColumns: `repeat(${PER_ROW}, minmax(0, 1fr))` }}
              title={`${formatWeekRange(row[0])} – ${formatWeekRange(row[row.length - 1])}`}
            >
              {row.map((weekId, i) => {
                const entries = recovered?.get(weekId) ?? 0
                return (
                  <span
                    key={weekId}
                    className="reg-cell"
                    data-d={density(entries)}
                    data-now={weekId === today}
                    style={
                      animate
                        ? { transitionDelay: `${(index * PER_ROW + i) * 6}ms` }
                        : undefined
                    }
                  />
                )
              })}
              {index === rows.length - 1 &&
                Array.from({ length: pad }).map((_, i) => (
                  <span key={`pad-${i}`} className="reg-cell" data-d="-1" />
                ))}
            </div>
            <span className="register-count num">{filled ? `${filled}/${row.length}` : ''}</span>
          </div>
        )
      })}
    </div>
  )
}
