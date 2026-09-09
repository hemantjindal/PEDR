'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EntryCard } from './entry-card'
import { REVIEW_THRESHOLD, type CalendarFeed, type DraftEntry, type Project } from '@/lib/pedr/types'
import { formatDate, formatDuration, formatWeekRange, weekIdOf } from '@/lib/pedr/week'

/**
 * Linking a calendar.
 *
 * The pitch is simple enough to say in a sentence: your calendar already knows
 * what you did every day for the last two years, including who was in the
 * room, which is the one thing nobody can reconstruct from memory and the one
 * thing a PEDR keeps asking for.
 *
 * The risk is equally simple. Import a calendar raw and you get three hundred
 * rows of lunch, and the record becomes worse than the blank one. So the whole
 * screen is built around showing what was thrown away and why, and around
 * never letting anything reach the record without being read first.
 */

interface Skip {
  summary: string
  date: string | null
  reason: string
}

interface Preview {
  source: string
  url: string | null
  from: string
  to: string
  entries: DraftEntry[]
  warnings: string[]
  skipped: Skip[]
  stats: {
    found: number
    alreadyImported: number
    filtered: number
    days: number
    totalMinutes: number
    people: number
  }
}

export function CalendarImport({
  projects,
  feeds,
  today,
  defaultFrom,
}: {
  projects: Project[]
  feeds: CalendarFeed[]
  today: string
  defaultFrom: string
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)

  const [url, setUrl] = useState('')
  const [name, setName] = useState('Work calendar')
  const [ics, setIcs] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(today)
  const [remember, setRemember] = useState(true)

  const [preview, setPreview] = useState<Preview | null>(null)
  const [entries, setEntries] = useState<DraftEntry[]>([])
  const [feedId, setFeedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ count: number; days: number; duplicates: number } | null>(null)

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const totals = useMemo(() => ({
    days: new Set(entries.map((e) => e.date)).size,
    minutes: entries.reduce((sum, e) => sum + e.minutes, 0),
    people: new Set(entries.flatMap((e) => e.people)).size,
  }), [entries])

  async function read(body: Record<string, unknown>, label: string, sourceFeed: string | null) {
    setBusy(label)
    setError(null)
    try {
      const response = await fetch('/api/calendar/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from, to, ...body }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not read that calendar.')
      setPreview(data)
      setEntries(data.entries)
      setFeedId(sourceFeed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that calendar.')
    } finally {
      setBusy(null)
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (file.size > 8_000_000) {
      setError('That file is very large. Export a shorter date range from your calendar.')
      return
    }
    const text = await file.text()
    setIcs(text)
    setFileName(file.name)
    await read({ ics: text }, 'file', null)
  }

  async function save() {
    if (!preview) return
    setBusy('save')
    setError(null)
    try {
      const response = await fetch('/api/calendar/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entries,
          source: preview.source,
          from: preview.from,
          to: preview.to,
          feedId,
          link: !feedId && remember && preview.url ? { name, url: preview.url } : null,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not save that.')
      setSaved({ count: data.saved, days: totals.days, duplicates: data.duplicates ?? 0 })
      if (data.feedError) setError(data.feedError)
      setPreview(null)
      setEntries([])
      setIcs(null)
      setFileName(null)
      setUrl('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setBusy(null)
    }
  }

  async function unlink(feed: CalendarFeed) {
    setBusy(`unlink-${feed.id}`)
    try {
      await fetch(`/api/calendar/feeds/${feed.id}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  // ---- Saved -------------------------------------------------------------

  if (saved) {
    return (
      <section className="sheet stack">
        <h2>
          {saved.count === 0
            ? 'Nothing new to add — those were all already on your record.'
            : `${saved.count} ${saved.count === 1 ? 'meeting' : 'meetings'} on the record, across ${saved.days} ${saved.days === 1 ? 'day' : 'days'}.`}
        </h2>
        {saved.duplicates > 0 && saved.count > 0 && (
          <p className="small dim">
            {saved.duplicates} of them were already there and were left alone.
          </p>
        )}
        <p className="dim small">
          That is the skeleton of those weeks — the dates, the meetings and the people. The desk
          work between them is not in any calendar, so it still has to be written down. The quickest
          way is to open each week and add a line or two.
        </p>
        {error && (
          <p className="note note-pending small"><span aria-hidden="true">⚠</span> {error}</p>
        )}
        <div className="row-wrap">
          <a className="btn btn-primary" href="/weeks">Fill in the weeks</a>
          <button type="button" className="btn" onClick={() => setSaved(null)}>
            Import another range
          </button>
        </div>
      </section>
    )
  }

  // ---- Review ------------------------------------------------------------

  if (preview) {
    const { stats } = preview
    return (
      <div className="stack">
        <section className="sheet stack-s">
          <div className="row-wrap" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2>Check this before it goes on the record</h2>
            <span className="chip">{preview.source}</span>
          </div>

          <div className="titleblock">
            <div>
              <span className="label">To import</span>
              <span className="value">{entries.length}</span>
            </div>
            <div>
              <span className="label">Days</span>
              <span className="value">{totals.days}</span>
            </div>
            <div>
              <span className="label">Meeting time</span>
              <span className="value">{formatDuration(totals.minutes)}</span>
            </div>
            <div>
              <span className="label">People</span>
              <span className="value">{totals.people}</span>
            </div>
          </div>

          <p className="small dim">
            {formatDate(preview.from)} to {formatDate(preview.to)}. {stats.found} events read
            {stats.alreadyImported > 0 && <>, {stats.alreadyImported} already on your record</>}
            {stats.filtered > 0 && <>, {stats.filtered} filtered out</>}.
          </p>

          {preview.warnings.map((warning) => (
            <p className="note note-pending small" key={warning}>
              <span aria-hidden="true">⚠</span> {warning}
            </p>
          ))}

          {preview.skipped.length > 0 && (
            <details>
              <summary className="small dim" style={{ cursor: 'pointer' }}>
                What was left out ({preview.skipped.length})
              </summary>
              <div className="table-scroll" style={{ marginTop: 10 }}>
                <table className="schedule">
                  <thead>
                    <tr><th>Event</th><th>Date</th><th>Why</th></tr>
                  </thead>
                  <tbody>
                    {preview.skipped.map((skip, i) => (
                      <tr key={`${skip.summary}-${i}`}>
                        <td>{skip.summary}</td>
                        <td className="mono tiny">{skip.date ?? '—'}</td>
                        <td className="dim">{skip.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="tiny faint" style={{ marginTop: 8 }}>
                Anything here that should have counted? Add its title to the ignore list in
                reverse — or just type it into the dump box, which is faster than arguing with a
                filter.
              </p>
            </details>
          )}
        </section>

        <ReviewList
          entries={entries}
          projects={projects}
          projectById={projectById}
          onChange={(index, changes) =>
            setEntries((cur) => cur.map((e, i) => (i === index ? { ...e, ...changes } : e)))
          }
          onRemove={(indexes) => {
            const drop = new Set(indexes)
            setEntries((cur) => cur.filter((_, i) => !drop.has(i)))
          }}
          onApplyToMatching={(index) => {
            setEntries((cur) => {
              const source = cur[index]
              if (!source) return cur
              return cur.map((e) =>
                e.activity !== source.activity
                  ? e
                  : {
                      ...e,
                      projectId: source.projectId,
                      projectHint: source.projectHint,
                      stage: source.stage,
                      officeCategory: source.officeCategory,
                      criteria: source.criteria,
                      // Filing it by hand is the confirmation; it should stop
                      // being flagged as unsure everywhere, not just here.
                      confidence: Math.max(e.confidence, source.confidence),
                    },
              )
            })
          }}
        />

        {error && (
          <p className="note note-revision small" role="alert">
            <span aria-hidden="true">⚠</span> {error}
          </p>
        )}

        <div className="sheet stack-s sticky-actions">
          {!feedId && preview.url && (
            <label className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ width: 'auto', marginTop: 3 }}
              />
              <span>
                Remember this calendar so I can sync it again.
                <br />
                <span className="tiny faint">
                  The link is stored as it is — anyone holding it can read that calendar, so it is
                  never shown in full, and unpublishing the calendar kills it.
                </span>
              </span>
            </label>
          )}
          <div className="row-wrap">
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={busy !== null || entries.length === 0}
            >
              {busy === 'save' ? 'Saving…' : `Save ${entries.length} to the record`}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => { setPreview(null); setEntries([]) }}
              disabled={busy !== null}
            >
              Start again
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Connect -----------------------------------------------------------

  return (
    <div className="stack">
      {feeds.length > 0 && (
        <section className="sheet stack-s">
          <div className="sheet-head">
            <div>
              <span className="label">Linked</span>
              <h2 style={{ marginTop: 3 }}>Your calendars</h2>
            </div>
          </div>
          {feeds.map((feed, i) => (
            <div
              key={feed.id}
              className="row-wrap"
              style={{
                gap: 10,
                alignItems: 'baseline',
                paddingTop: i === 0 ? 0 : 10,
                borderTop: i === 0 ? 'none' : '1px solid var(--hair)',
              }}
            >
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div className="label label-ink">{feed.name}</div>
                <p className="tiny faint">
                  {feed.lastSyncedAt
                    ? `Last synced ${formatDate(feed.lastSyncedAt.slice(0, 10))} · ${feed.lastImported} imported`
                    : 'Never synced'}
                  {feed.lastError && ` · ${feed.lastError}`}
                </p>
              </div>
              <span className="row" style={{ gap: 4, flex: 'none' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy !== null}
                  onClick={() => read({ feedId: feed.id }, `sync-${feed.id}`, feed.id)}
                >
                  {busy === `sync-${feed.id}` ? 'Reading…' : 'Sync'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-danger"
                  disabled={busy !== null}
                  onClick={() => unlink(feed)}
                >
                  Unlink
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="sheet stack">
        <div className="sheet-head">
          <div>
            <span className="label">Two ways in</span>
            <h2 style={{ marginTop: 3 }}>
              {feeds.length > 0 ? 'Link another calendar' : 'Link your calendar'}
            </h2>
          </div>
        </div>

        <p className="small dim">
          Your calendar knows what you did every working day, and — uniquely — who was in the room
          with you. That is the part of a PEDR nobody can reconstruct in a Sunday-night panic.
        </p>

        <div className="field">
          <label htmlFor="range-from">Import which period</label>
          <div className="row-wrap" style={{ gap: 8 }}>
            <input
              id="range-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              style={{ width: 'auto' }}
            />
            <span className="small dim">to</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To"
              style={{ width: 'auto' }}
            />
          </div>
          <span className="hint">
            Start with three months. It is easier to check a hundred rows than a thousand, and you
            can come back for the rest.
          </span>
        </div>

        <div className="import-choices">
          <div className="sheet sheet-tight stack-s">
            <span className="label label-ink">A published link</span>
            <p className="tiny faint">
              Syncs. Come back next month and it picks up where it left off.
            </p>
            <input
              type="url"
              inputMode="url"
              value={url}
              placeholder="https://outlook.office365.com/owa/calendar/…/reachcalendar.ics"
              onChange={(e) => setUrl(e.target.value)}
              aria-label="Calendar address"
              style={{ fontSize: '16px' }}
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="What to call it"
              placeholder="What to call it"
              style={{ fontSize: '16px' }}
            />
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy !== null || url.trim().length === 0}
              onClick={() => read({ url }, 'url', null)}
            >
              {busy === 'url' ? 'Reading…' : 'Read it'}
            </button>
          </div>

          <div className="sheet sheet-tight stack-s">
            <span className="label label-ink">An .ics file</span>
            <p className="tiny faint">
              One-off, and nothing is stored but the entries you keep. Good if your practice will
              not let you publish a calendar.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".ics,text/calendar"
              onChange={(e) => onFile(e.target.files?.[0])}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="btn btn-block"
              disabled={busy !== null}
              onClick={() => fileInput.current?.click()}
            >
              {busy === 'file' ? 'Reading…' : fileName ?? 'Choose a file'}
            </button>
            {ics && !busy && (
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => read({ ics }, 'file', null)}
              >
                Read it again for this range
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="note note-revision small" role="alert">
            <span aria-hidden="true">⚠</span> {error}
          </p>
        )}
      </section>

      <HowToPublish />
    </div>
  )
}

// ---------------------------------------------------------------------------

type Filter = 'all' | 'unmatched' | 'leave' | 'unsure'

const FILTERS: Array<{ id: Filter; label: string; test: (e: DraftEntry) => boolean }> = [
  { id: 'all', label: 'Everything', test: () => true },
  { id: 'unmatched', label: 'No project', test: (e) => !e.projectId && !e.officeCategory },
  { id: 'leave', label: 'Leave', test: (e) => e.officeCategory === 'leave' },
  { id: 'unsure', label: 'Unsure', test: (e) => e.confidence < REVIEW_THRESHOLD },
]

/**
 * A quarter of calendar is a hundred rows or more, and asking someone to read
 * a hundred expanded cards is how a review screen turns into a rubber stamp.
 *
 * So: grouped by week, one dense line each, opened only when something needs
 * changing, with the whole week removable in one go. The filters exist because
 * the rows that actually need attention — no project matched, or a title too
 * thin to mean anything — are a small fraction of the total, and finding them
 * by scrolling is the work this is supposed to remove.
 */
function ReviewList({
  entries,
  projects,
  projectById,
  onChange,
  onRemove,
  onApplyToMatching,
}: {
  entries: DraftEntry[]
  projects: Project[]
  projectById: Map<string, Project>
  onChange: (index: number, changes: Partial<DraftEntry>) => void
  onRemove: (indexes: number[]) => void
  onApplyToMatching: (index: number) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Set<number>>(new Set())

  // A weekly meeting arrives thirteen times with the same title. Filing it
  // thirteen times is the kind of work this is meant to remove.
  const titleCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const entry of entries) map.set(entry.activity, (map.get(entry.activity) ?? 0) + 1)
    return map
  }, [entries])

  const counts = useMemo(() => {
    const map = new Map<Filter, number>()
    for (const f of FILTERS) map.set(f.id, entries.filter(f.test).length)
    return map
  }, [entries])

  const weeks = useMemo(() => {
    const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0]
    const groups = new Map<string, Array<{ entry: DraftEntry; index: number }>>()
    entries.forEach((entry, index) => {
      // A row being edited stays put. Under the "no project" filter, choosing
      // a project would otherwise make the card you are working in disappear
      // from under the cursor the moment you fixed it.
      if (!active.test(entry) && !open.has(index)) return
      const weekId = weekIdOf(entry.date)
      const bucket = groups.get(weekId)
      if (bucket) bucket.push({ entry, index })
      else groups.set(weekId, [{ entry, index }])
    })
    return [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekId, rows]) => ({
        weekId,
        rows,
        minutes: rows.reduce((sum, r) => sum + r.entry.minutes, 0),
      }))
  }, [entries, filter, open])

  function toggle(index: number) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  if (entries.length === 0) {
    return (
      <p className="note small">
        Nothing new in that range — every meeting in it is already on your record.
      </p>
    )
  }

  return (
    <div className="stack-s">
      <div className="row-wrap" style={{ gap: 5 }}>
        {FILTERS.map((f) => {
          const count = counts.get(f.id) ?? 0
          return (
            <button
              key={f.id}
              type="button"
              className={`chip ${filter === f.id ? 'chip-ink' : ''}`}
              style={{ cursor: 'pointer' }}
              aria-pressed={filter === f.id}
              disabled={count === 0 && f.id !== 'all'}
              onClick={() => setFilter(f.id)}
            >
              {f.label} {count}
            </button>
          )
        })}
      </div>

      {weeks.length === 0 && (
        <p className="note small">Nothing matches that filter — which is good news.</p>
      )}

      {weeks.map((week) => (
        <section className="sheet sheet-tight stack-s" key={week.weekId}>
          <div className="row-wrap" style={{ gap: 8, alignItems: 'baseline' }}>
            <span className="label label-ink">{formatWeekRange(week.weekId)}</span>
            <span className="tiny faint">
              {week.rows.length} {week.rows.length === 1 ? 'entry' : 'entries'} ·{' '}
              {formatDuration(week.minutes)}
            </span>
            <span className="spacer" />
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-danger"
              onClick={() => onRemove(week.rows.map((r) => r.index))}
            >
              Drop the week
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {week.rows.map(({ entry, index }, i) =>
              open.has(index) ? (
                <div key={index} style={{ paddingTop: i === 0 ? 0 : 10 }}>
                  <EntryCard
                    entry={entry}
                    projects={projects}
                    projectById={projectById}
                    onChange={(changes) => onChange(index, changes)}
                    onRemove={() => { toggle(index); onRemove([index]) }}
                  />
                  <div className="row-wrap" style={{ marginTop: 6, gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggle(index)}
                    >
                      Done
                    </button>
                    {(titleCounts.get(entry.activity) ?? 0) > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          onApplyToMatching(index)
                          setApplied((cur) => new Set(cur).add(entry.activity))
                        }}
                      >
                        {applied.has(entry.activity)
                          ? 'Applied to the rest'
                          : `File the other ${(titleCounts.get(entry.activity) ?? 1) - 1} the same way`}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <CompactRow
                  key={index}
                  entry={entry}
                  first={i === 0}
                  project={entry.projectId ? projectById.get(entry.projectId) ?? null : null}
                  onOpen={() => toggle(index)}
                  onRemove={() => onRemove([index])}
                />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

/** One entry as a single line: enough to judge it, not enough to edit it. */
function CompactRow({
  entry,
  first,
  project,
  onOpen,
  onRemove,
}: {
  entry: DraftEntry
  first: boolean
  project: Project | null
  onOpen: () => void
  onRemove: () => void
}) {
  const unsure = entry.confidence < REVIEW_THRESHOLD
  return (
    <div
      className="row-wrap"
      style={{
        gap: 8,
        alignItems: 'baseline',
        padding: '8px 0',
        borderTop: first ? 'none' : '1px solid var(--hair)',
      }}
    >
      <span className="ref" style={{ flex: 'none', minWidth: 52 }}>
        {formatDate(entry.date, { weekday: true }).split(' ').slice(0, 2).join(' ')}
      </span>
      <span className="mono tiny dim" style={{ flex: 'none', minWidth: 44 }}>
        {entry.minutes > 0 ? formatDuration(entry.minutes) : '—'}
      </span>
      <span style={{ flex: '1 1 180px', minWidth: 0 }}>
        <span className="small">{entry.activity}</span>
        {entry.people.length > 0 && (
          <span className="tiny faint"> · {entry.people.join(', ')}</span>
        )}
      </span>
      <span className="row" style={{ gap: 5, flex: 'none' }}>
        {project ? (
          <span className="chip">{project.code || project.name}</span>
        ) : entry.officeCategory ? (
          <span className="chip">{entry.officeCategory}</span>
        ) : (
          <span className="mark mark-none">no project</span>
        )}
        {unsure && <span className="mark mark-pending"><span aria-hidden="true">?</span> unsure</span>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpen}>Edit</button>
        <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={onRemove}>
          Drop
        </button>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * Finding the .ics address is genuinely the hard part — it is buried three
 * menus deep in every calendar there is, and it is where people give up. So it
 * is written out rather than linked to.
 */
function HowToPublish() {
  const guides: Array<{ name: string; steps: string[]; note?: string }> = [
    {
      name: 'Outlook on the web, and Teams',
      steps: [
        'Open Outlook in a browser and go to Settings → Calendar → Shared calendars.',
        'Under “Publish a calendar”, pick your calendar and choose “Can view all details”.',
        'Press Publish, then copy the ICS link — the second one, not the HTML one.',
      ],
      note: 'Teams uses the same calendar as Outlook, so this covers both. Some practices switch publishing off; if the option is missing, use the .ics export instead.',
    },
    {
      name: 'Outlook on Windows',
      steps: [
        'File → Save Calendar, set the date range and set Detail to “Full details”.',
        'Save it as an .ics file and upload it here.',
      ],
      note: 'The desktop app cannot publish a syncing link, only export a file.',
    },
    {
      name: 'Google Calendar',
      steps: [
        'Settings → your calendar → Integrate calendar.',
        'Copy the “Secret address in iCal format”.',
      ],
    },
    {
      name: 'Apple Calendar',
      steps: [
        'Right-click the calendar → Share Calendar → tick Public Calendar.',
        'Copy the webcal:// address — pasting it here works, it gets rewritten.',
      ],
    },
  ]

  return (
    <section className="sheet stack-s">
      <div className="sheet-head">
        <div>
          <span className="label">Buried three menus deep</span>
          <h2 style={{ marginTop: 3 }}>Where the link is</h2>
        </div>
      </div>
      {guides.map((guide, i) => (
        <div
          key={guide.name}
          style={{ paddingTop: i === 0 ? 0 : 12, borderTop: i === 0 ? 'none' : '1px solid var(--hair)' }}
        >
          <div className="label label-ink" style={{ marginBottom: 6 }}>{guide.name}</div>
          {/* Tailwind's reset strips list markers; these steps are a sequence
              and read wrong without their numbers. */}
          <ol
            className="small dim"
            style={{ paddingLeft: 20, margin: 0, display: 'grid', gap: 4, listStyleType: 'decimal' }}
          >
            {guide.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          {guide.note && <p className="tiny faint" style={{ marginTop: 6 }}>{guide.note}</p>}
        </div>
      ))}
      <p className="tiny faint">
        A published link is a password in disguise: anyone who has it can read that calendar. If you
        are on a practice account, check whether you are allowed to publish before you do — and use
        the file upload if you are not.
      </p>
    </section>
  )
}
