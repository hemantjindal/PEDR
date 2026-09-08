'use client'

import { useState } from 'react'

/** A block of generated text with a copy button that reports what happened. */
export function CopyBlock({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      // Clipboard access can be refused. Say so rather than pretending.
      setState('failed')
    }
  }

  return (
    <div className="stack-s">
      <div className="row-wrap">
        <button type="button" className="btn btn-primary btn-sm" onClick={copy}>
          {state === 'copied' ? 'Copied' : 'Copy to clipboard'}
        </button>
        {state === 'failed' && (
          <span className="small" style={{ color: 'var(--warning-ink)' }}>
            Your browser blocked that — select the text below instead.
          </span>
        )}
      </div>
      <textarea
        readOnly
        value={text}
        rows={18}
        className="mono"
        style={{ fontSize: '0.78rem', background: 'var(--surface-sunk)' }}
        aria-label="Generated record sheet"
      />
    </div>
  )
}
