'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EntryCard } from './entry-card'
import type { DraftEntry, Project } from '@/lib/pedr/types'
import { formatDate, formatDuration, formatWeekRange } from '@/lib/pedr/week'

/**
 * Catching up.
 *
 * The screen the product is actually for. Everything else assumes you are
 * keeping up; nobody is. This assumes the opposite — that there are eight
 * months of blank weeks behind you and you have been avoiding it — and its
 * first move is to say that most of those months are already written down
 * somewhere else.
 *
 * Order matters. Ask for the calendar first, because it is the richest and the
 * easiest to export; ask for memory last, because trying to remember February
 * before you have looked at February's calendar is exactly the wall people hit
 * and give up at.
 */

interface RecoveredWeek {
  weekId: string
  start: string
  entries: DraftEntry[]
  minutes: number
  sources: string[]
  blank: boolean
  thin: boolean
}

interface Prompt {
  weekId: string
  label: string
  context: string
  ask: string
}

interface Report {
  from: string
  to: string
  weeks: RecoveredWeek[]
  entries: DraftEntry[]
  recovered: number
  total: number
  blank: string[]
  thin: string[]
  bySource: Array<{ source: string; label: string; kept: number; duplicates: number }>
  prompts: Prompt[]
  monthsRecovered: number
  headline: string
  warnings: string[]
}

const SOURCES = [
  {
    id: 'calendar' as const,
    name: 'Your calendar',
    worth: 'Usually recovers the most',
    blurb:
      'Every meeting you sat in, on the right day, for the right length, with everybody who was ' +
      'in it. Outlook: Settings → Calendar → Shared calendars → Publish, or File → Save Calendar ' +
      'on Windows.',
    file: true,
  },
  {
    id: 'timesheet' as const,
    name: 'Your practice timesheet',
    worth: 'The hours, exactly',
    blurb:
      'Export the period from whatever your practice uses and paste it. Columns are matched by ' +
      'name — date, project, hours, description, in any order.',
    file: false,
  },
  {
    id: 'teams' as const,
    name: 'A Teams or Slack export',
    worth: 'Loose, but it dates things',
    blurb:
      'Paste a conversation. Only your own messages become entries; everybody else in the thread ' +
      'becomes somebody you dealt with, which is the part nobody can reconstruct later.',
    file: false,
  },
  {
    id: 'notes' as const,
    name: 'What you remember',
    worth: 'Last, not first',
    blurb:
      'Anything you can write down, badly. Do this after the others — it is much easier to ' +
      'remember a week when you can see what was in your calendar that week.',
    file: false,
  },
]

export function CatchUp({
  projects,
  defaultFrom,
  today,
}: {
  projects: Project[]
  defaultFrom: string
  today: string
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)

  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(today)
  const [input, setInput] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<string | null>('calendar')
  const [report, setReport] = useState<Report | null>(null)
  const [entries, setEntries] = useState<DraftEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ count: number; weeks: number } | null>(null)

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const ready = SOURCES.some((s) => (input[s.id] ?? '').trim().length > 0)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/catch-up', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from, to, ...input }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not read that.')
      setReport(data)
      setEntries(data.entries)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that.')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!report) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/dumps', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          raw: `Catch-up from ${report.from} to ${report.to}\n` +
            report.bySource.map((s) => `${s.label}: ${s.kept} kept, ${s.duplicates} duplicates`).join('\n'),
          kind: 'freeform',
          entries,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not save that.')
      setSaved({
        count: data.saved,
        weeks: new Set(entries.map((e) => e.date.slice(0, 7))).size,
      })
      setReport(null)
      setEntries([])
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  // ---- Done ---------------------------------------------------------------

  if (saved) {
    return (
      <section className="sheet stack">
        <h2>{saved.count} entries on the record.</h2>
        <p className="dim small">
          That is the part that was already written down. What is left is the weeks nothing could
          reach — and those are much easier now, because the weeks either side of them have
          something in them to remember from.
        </p>
        <div className="row-wrap">
          <a className="btn btn-primary" href="/weeks">Fill in the blanks</a>
          <a className="btn" href="/dashboard">See where that leaves me</a>
        </div>
      </section>
    )
  }

  // ---- The result ---------------------------------------------------------

  if (report) {
    const pct = report.total > 0 ? Math.round((report.recovered / report.total) * 100) : 0
    return (
      <div className="stack">
        <section className="sheet stack-s">
          <div className="sheet-head">
            <div>
              <span className="label">
                {formatDate(report.from)} to {formatDate(report.to)}
              </span>
              <h2 style={{ marginTop: 3 }}>
                {report.recovered} of {report.total} weeks came back
              </h2>
            </div>
            <span className="spacer" />
            <span className="chip chip-signal">{report.monthsRecovered} months</span>
          </div>

          <p className="small dim">{report.headline}</p>

          <span className="bar-track" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${pct}%` }} />
          </span>

          {/* One cell per week, so the shape of the recovery is visible at a
              glance — solid runs, and the holes nothing reached. */}
          <div
            className="register"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(14px, 1fr))', marginTop: 6 }}
          >
            {report.weeks.map((week) => (
              <span
                key={week.weekId}
                className="reg-cell"
                data-d={week.blank ? 0 : week.thin ? 2 : 5}
                title={`${formatWeekRange(week.weekId)} — ${
                  week.blank ? 'nothing recovered'
                    : `${week.entries.length} entries, ${formatDuration(week.minutes)}`
                }`}
              />
            ))}
          </div>

          <div className="row-wrap" style={{ gap: 10, marginTop: 4 }}>
            {report.bySource.map((source) => (
              <span className="tiny faint" key={source.source}>
                <strong style={{ color: 'var(--ink)' }}>{source.kept}</strong> from{' '}
                {source.label.toLowerCase()}
                {source.duplicates > 0 && ` (${source.duplicates} already covered)`}
              </span>
            ))}
          </div>

          {report.warnings.map((warning) => (
            <p className="note note-pending small" key={warning}>
              <span aria-hidden="true">⚠</span> {warning}
            </p>
          ))}
        </section>

        {report.prompts.length > 0 && (
          <section className="sheet stack-s">
            <div className="sheet-head">
              <div>
                <span className="label">Nothing reached these</span>
                <h2 style={{ marginTop: 3 }}>
                  {report.prompts.length} {report.prompts.length === 1 ? 'week' : 'weeks'} still blank
                </h2>
              </div>
            </div>
            <p className="small dim">
              Save what came back first — then these are much easier, because the weeks around them
              will have something in them.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {report.prompts.slice(0, 8).map((prompt, i) => (
                <div
                  key={prompt.weekId}
                  style={{ padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid var(--hair)' }}
                >
                  <div className="label label-ink">{prompt.label}</div>
                  <p className="tiny faint" style={{ marginTop: 2 }}>{prompt.context}</p>
                </div>
              ))}
            </div>
            {report.prompts.length > 8 && (
              <p className="tiny faint">…and {report.prompts.length - 8} more.</p>
            )}
          </section>
        )}

        <div className="stack-s">
          <p className="label">Everything recovered — read it before you keep it</p>
          {entries.slice(0, 60).map((entry, index) => (
            <EntryCard
              key={`${entry.date}-${index}`}
              entry={entry}
              projects={projects}
              projectById={projectById}
              onChange={(changes) =>
                setEntries((cur) => cur.map((e, i) => (i === index ? { ...e, ...changes } : e)))
              }
              onRemove={() => setEntries((cur) => cur.filter((_, i) => i !== index))}
            />
          ))}
          {entries.length > 60 && (
            <p className="note small">
              Showing the first 60 of {entries.length}. Saving keeps all of them — they land as
              unverified so you can work through the rest a week at a time.
            </p>
          )}
        </div>

        {error && (
          <p className="note note-revision small" role="alert">
            <span aria-hidden="true">⚠</span> {error}
          </p>
        )}

        <div className="sheet stack-s sticky-actions">
          <div className="row-wrap">
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={busy || entries.length === 0}
            >
              {busy ? 'Saving…' : `Keep ${entries.length} entries`}
            </button>
            <button type="button" className="btn" onClick={() => setReport(null)} disabled={busy}>
              Add another source
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Feeding it ---------------------------------------------------------

  return (
    <div className="stack">
      <section className="sheet stack">
        <div className="field">
          <label htmlFor="from">How far back do you need to go?</label>
          <div className="row-wrap" style={{ gap: 8 }}>
            <input
              id="from"
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
              max={today}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To"
              style={{ width: 'auto' }}
            />
          </div>
          <span className="hint">
            Go back as far as you have blank. Nothing older than about two years is usually still
            sitting in a calendar.
          </span>
        </div>
      </section>

      <div className="stack-s">
        {SOURCES.map((source) => {
          const filled = (input[source.id] ?? '').trim().length > 0
          const isOpen = open === source.id
          return (
            <section className="sheet stack-s" key={source.id}>
              <div className="row-wrap" style={{ gap: 8, alignItems: 'baseline' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <h2 style={{ fontSize: '1rem' }}>{source.name}</h2>
                  <p className="tiny faint">{source.worth}</p>
                </div>
                {filled && <span className="mark mark-signed">added</span>}
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setOpen(isOpen ? null : source.id)}
                  aria-expanded={isOpen}
                >
                  {isOpen ? 'Close' : filled ? 'Change' : 'Add'}
                </button>
              </div>

              {isOpen && (
                <div className="stack-s">
                  <p className="small dim">{source.blurb}</p>
                  {source.file && (
                    <>
                      <input
                        ref={fileInput}
                        type="file"
                        accept=".ics,text/calendar"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          // Read it out here: the updater callback is not async,
                          // and awaiting inside it is a syntax error, not a race.
                          const text = await file.text()
                          setInput((cur) => ({ ...cur, [source.id]: text }))
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => fileInput.current?.click()}
                      >
                        Choose an .ics file
                      </button>
                    </>
                  )}
                  {!source.file && (
                    <textarea
                      rows={source.id === 'notes' ? 8 : 6}
                      value={input[source.id] ?? ''}
                      onChange={(e) => setInput((cur) => ({ ...cur, [source.id]: e.target.value }))}
                      placeholder={
                        source.id === 'timesheet'
                          ? 'Date,Project,Hours,Description\n06/01/2026,1042,7.5,Tender package coordination'
                          : source.id === 'teams'
                            ? 'Paste the conversation'
                            : 'w/c 12 Jan — mostly 1042 tender package, site visit on the Thursday…'
                      }
                      style={{ fontSize: '16px' }}
                      aria-label={source.name}
                    />
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {error && (
        <p className="note note-revision small" role="alert">
          <span aria-hidden="true">⚠</span> {error}
        </p>
      )}

      <div className="row-wrap sticky-actions">
        <button type="button" className="btn btn-primary" onClick={run} disabled={busy || !ready}>
          {busy ? 'Reading it all…' : 'Reconstruct the period'}
        </button>
        {!ready && (
          <span className="small dim" style={{ alignSelf: 'center' }}>
            Add at least one source — the calendar is the one that recovers most.
          </span>
        )}
      </div>
    </div>
  )
}
