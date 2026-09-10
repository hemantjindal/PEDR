/**
 * Work someone did before they had an account.
 *
 * Somebody points the tool at their calendar, watches eighteen months come
 * back, and then has to create an account. If that work is lost in the gap,
 * the account is worthless to them and they will not make one. So it is held
 * for the length of the tab and imported the moment there is somewhere to put
 * it.
 *
 * sessionStorage, not local: it belongs to this tab and this sitting, and it
 * should not outlive either.
 */
import type { DraftEntry } from '@/lib/pedr/types'
import type { DateKey } from '@/lib/pedr/week'

const KEY = 'pedr.pending-import'

/** Well under the 5MB storage ceiling, and far more than anyone recovers. */
const MAX_ENTRIES = 2000

export interface PendingImport {
  experienceStart: DateKey
  /** May be empty: the calendar is a shortcut, not a requirement. */
  entries: DraftEntry[]
  /** Shown before the account exists, so the form has a reason to be filled in. */
  weeks: number
  months: number
}

export function stashPending(pending: PendingImport): boolean {
  if (typeof window === 'undefined') return false
  if (!pending.experienceStart) return false
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...pending, entries: pending.entries.slice(0, MAX_ENTRIES) }),
    )
    return true
  } catch {
    // Private browsing, or a storage quota. Losing the hand-off is survivable;
    // throwing on the way to the sign-up form is not.
    return false
  }
}

export function readPending(): PendingImport | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as PendingImport
    if (!Array.isArray(value.entries)) return null
    return value
  } catch {
    return null
  }
}

export function clearPending(): void {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to do, and nothing depends on it having worked.
  }
}
