'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clearPending, readPending } from '@/lib/pending-import'

/**
 * Carry the work across.
 *
 * The account now exists, and the entries recovered before it existed are
 * still in the tab. This puts them in, once, and gets out of the way.
 */
type State =
  | { at: 'none' }
  | { at: 'saving'; count: number }
  | { at: 'saved'; saved: number }
  | { at: 'failed'; message: string }

export function FirstImport() {
  const router = useRouter()
  const [state, setState] = useState<State>({ at: 'none' })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const pending = readPending()
    if (!pending) return
    // A date on its own still has to reach the account, but there is nothing
    // worth narrating about it.
    if (pending.entries.length > 0) setState({ at: 'saving', count: pending.entries.length })

    void (async () => {
      try {
        const res = await fetch('/api/account/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            experienceStart: pending.experienceStart,
            entries: pending.entries,
          }),
        })
        const body = (await res.json()) as { saved?: number; error?: string }
        if (!res.ok || typeof body.saved !== 'number') {
          setState({ at: 'failed', message: body.error ?? 'Those entries could not be saved.' })
          return
        }
        clearPending()
        setState(body.saved > 0 ? { at: 'saved', saved: body.saved } : { at: 'none' })
        router.refresh()
      } catch {
        setState({ at: 'failed', message: 'Those entries could not be saved. Try the import again.' })
      }
    })()
  }, [router])

  if (state.at === 'none') return null

  if (state.at === 'saving') {
    return (
      <div className="note">
        <span className="label">Importing</span>
        <span>Adding {state.count} entries to your record.</span>
      </div>
    )
  }

  if (state.at === 'failed') {
    return (
      <div className="note note-revision">
        <span className="label">Not saved</span>
        <span>{state.message}</span>
      </div>
    )
  }

  return (
    <div className="note note-pending">
      <span className="label">Imported</span>
      <span>
        <strong>{state.saved} entries are on your record.</strong> They are drafts until you check
        them, which is the next thing to do.
      </span>
    </div>
  )
}
