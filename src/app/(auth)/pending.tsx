'use client'

import { useEffect, useState } from 'react'
import { readPending, type PendingImport } from '@/lib/pending-import'

/**
 * What is waiting to go into the account, shown above the form that creates it.
 *
 * Somebody who has just watched eighteen months come back should not meet a
 * bare email field. They should see the thing they are about to keep.
 */
export function PendingSummary() {
  const [pending, setPending] = useState<PendingImport | null>(null)
  useEffect(() => setPending(readPending()), [])

  if (!pending || pending.entries.length === 0) return null

  return (
    <dl className="facts">
      <div>
        <dt>Ready to import</dt>
        <dd>{pending.entries.length} entries</dd>
      </div>
      <div>
        <dt>Weeks covered</dt>
        <dd>{pending.weeks}</dd>
      </div>
      <div>
        <dt>Months of experience</dt>
        <dd>{pending.months}</dd>
      </div>
    </dl>
  )
}
