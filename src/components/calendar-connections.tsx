'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export interface ConnectionView {
  id: string
  provider: string
  providerLabel: string
  accountEmail: string
  calendarName: string
  enabled: boolean
  live: boolean
  lastSyncedAt: string | null
  lastImported: number
  lastError: string | null
}

export interface ProviderView {
  id: string
  label: string
  blurb: string
  permission: string
}

/**
 * The connected accounts, and what to do about them.
 *
 * Deliberately few controls. A calendar is either reading or it is not, and the
 * only three things anyone wants are: read it now, stop reading it for a bit,
 * and forget it entirely.
 */
export function CalendarConnections({
  connections,
  providers,
}: {
  connections: ConnectionView[]
  providers: ProviderView[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  async function act(id: string, what: 'sync' | 'pause' | 'resume' | 'forget') {
    if (what === 'forget' && !confirm('Disconnect this calendar? Entries already on your record stay.')) {
      return
    }
    setBusy(`${id}:${what}`)
    setSaid(null)
    try {
      const response = await fetch(`/api/connect/connections/${id}`, {
        method: what === 'sync' ? 'POST' : what === 'forget' ? 'DELETE' : 'PATCH',
        ...(what === 'pause' || what === 'resume'
          ? {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ enabled: what === 'resume' }),
            }
          : {}),
      })
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
        imported?: number
        removed?: number
      }
      if (!response.ok) {
        setSaid(body.error ?? 'That did not work.')
      } else if (what === 'sync') {
        setSaid(describeSync(body.imported ?? 0, body.removed ?? 0))
      }
      router.refresh()
    } catch {
      setSaid('Could not reach the server.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="stack">
      {connections.map((connection) => (
        <section className="sheet stack-s" key={connection.id}>
          <div className="row-wrap">
            <div style={{ minWidth: 0 }}>
              <span className="label">{connection.providerLabel}</span>
              <h3 style={{ marginTop: 4 }}>{connection.accountEmail}</h3>
            </div>
            <span className="spacer" />
            <span className={connection.enabled ? 'chip chip-signal' : 'chip'}>
              {!connection.enabled ? 'paused' : connection.live ? 'live' : 'checking hourly'}
            </span>
          </div>

          <dl className="facts-rows">
            <div>
              <dt>Last read</dt>
              <dd>{connection.lastSyncedAt ? ago(connection.lastSyncedAt) : 'not yet'}</dd>
            </div>
            <div>
              <dt>Added last time</dt>
              <dd>{connection.lastImported}</dd>
            </div>
          </dl>

          {connection.lastError ? (
            <p className="note note-revision">
              <span className="label">Problem</span>
              <span>{connection.lastError}</span>
            </p>
          ) : null}

          <div className="row-wrap">
            <button
              className="btn btn-sm"
              onClick={() => act(connection.id, 'sync')}
              disabled={busy !== null}
            >
              {busy === `${connection.id}:sync` ? 'Reading…' : 'Read it now'}
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => act(connection.id, connection.enabled ? 'pause' : 'resume')}
              disabled={busy !== null}
            >
              {connection.enabled ? 'Pause' : 'Resume'}
            </button>
            <span className="spacer" />
            <button
              className="btn btn-sm btn-ghost btn-danger"
              onClick={() => act(connection.id, 'forget')}
              disabled={busy !== null}
            >
              Disconnect
            </button>
          </div>
        </section>
      ))}

      {said ? <p className="note"><span>{said}</span></p> : null}

      {providers.map((provider) => (
        <section className="sheet stack-s" key={provider.id}>
          <div>
            <span className="label">Connect</span>
            <h3 style={{ marginTop: 4 }}>{provider.label}</h3>
          </div>
          <p className="small dim">{provider.blurb}</p>
          <p className="tiny faint">{provider.permission}</p>
          <div className="row-wrap">
            {/* A plain link, not fetch: this has to be a top-level navigation
                to the provider's own sign-in page. */}
            <a className="btn btn-primary btn-sm" href={`/api/connect/${provider.id}/start`}>
              Connect {provider.label}
            </a>
          </div>
        </section>
      ))}
    </div>
  )
}

function describeSync(imported: number, removed: number): string {
  if (imported === 0 && removed === 0) return 'Read it. Nothing new since last time.'
  const parts: string[] = []
  if (imported > 0) parts.push(`${imported} new ${imported === 1 ? 'entry' : 'entries'} waiting in Review`)
  if (removed > 0) parts.push(`${removed} removed because the meeting was cancelled`)
  return `${parts.join(', ')}.`
}

function ago(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return 'unknown'
  const minutes = Math.round((Date.now() - then) / 60_000)
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
