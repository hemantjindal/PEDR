'use client'

import { weekRange, weekIdOf, type DateKey, type WeekId } from '@/lib/pedr/week'

/**
 * The time you have served, one square a week.
 *
 * Drawn as a thing filling up rather than a thing full of holes. That is not
 * decoration: a wall of outlined empty cells reads as an audit, and the person
 * looking at this has been avoiding an audit for months. Weeks that are covered
 * are green and present; weeks that are not are quiet grey, not accusing.
 */

const PER_ROW = 13

export function RecoveryGrid({
  from,
  to,
  recovered,
}: {
  from: DateKey
  to: DateKey
  /** weekId → entries recovered. Absent weeks are simply not filled yet. */
  recovered?: Map<WeekId, number>
}) {
  const weeks = weekRange(from, to)
  const today = weekIdOf(to)

  const rows: WeekId[][] = []
  for (let i = 0; i < weeks.length; i += PER_ROW) rows.push(weeks.slice(i, i + PER_ROW))
  const pad = rows.length > 0 ? PER_ROW - rows[rows.length - 1].length : 0

  return (
    <div className="weeks" role="img" aria-label={
      `${weeks.filter((w) => (recovered?.get(w) ?? 0) > 0).length} of ${weeks.length} weeks covered`
    }>
      {rows.map((row, index) => (
        <div className="weeks-row" key={row[0]}>
          {row.map((weekId, i) => {
            const entries = recovered?.get(weekId) ?? 0
            return (
              <span
                key={weekId}
                className="week"
                data-state={entries === 0 ? 'empty' : entries <= 2 ? 'some' : 'full'}
                data-now={weekId === today ? 'true' : undefined}
                style={{ transitionDelay: `${(index * PER_ROW + i) * 8}ms` }}
              />
            )
          })}
          {index === rows.length - 1 &&
            Array.from({ length: pad }).map((_, i) => (
              <span key={`pad-${i}`} className="week" data-state="none" />
            ))}
        </div>
      ))}
    </div>
  )
}
