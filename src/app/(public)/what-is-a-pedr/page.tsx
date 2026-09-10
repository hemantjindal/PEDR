import type { Metadata } from 'next'
import Link from 'next/link'
import { REQUIREMENTS, SHEET_RULES } from '@/lib/pedr/constants'
import { Dimension } from '@/components/dimension'
import { absolute } from '@/lib/site'

export const metadata: Metadata = {
  title: 'What a PEDR actually is · PEDR',
  description:
    'Eight record sheets over two years. One sheet, four parts, explained in under a minute — ' +
    'without the handbook.',
  alternates: { canonical: absolute('/what-is-a-pedr') },
  openGraph: {
    type: 'article',
    url: absolute('/what-is-a-pedr'),
    title: 'What a PEDR actually is',
    description: 'Eight sheets over two years. One sheet, four parts. Under a minute.',
  },
}

/**
 * The shape of the thing, and nothing else.
 *
 * This page used to be a whole filled-in record sheet: six sections, four
 * tables, ten worked examples. Everything on it was true and all of it landed
 * at once on somebody who came here because they did not know what a PEDR was.
 * Being shown the entire document is how you learn it is bigger than you
 * thought, which is the opposite of the job.
 *
 * Four parts, one line each. The detail lives in the answers, where somebody
 * can go and get one piece of it when they want it.
 */

const PARTS = [
  {
    n: 'Where you worked',
    what: 'Your practice, your job, and the architect responsible for you.',
    time: 'Two minutes, once.',
  },
  {
    n: 'What you did',
    what: 'Hours against the RIBA work stages — the design, the drawings, the site visits.',
    time: 'Comes out of your timesheet.',
  },
  {
    n: 'What you made of it',
    what: 'Five short boxes: what you did, what you learned, what went well, what went wrong, what next.',
    time: 'The part that actually counts.',
  },
  {
    n: 'Two signatures',
    what: 'Your mentor in the practice signs, then your advisor at a school approves.',
    time: 'Not your job — just ask early.',
  },
]

export default function WhatIsAPedrPage() {
  return (
    <div className="column explain">
      <div className="explain-head">
        <h1>What a PEDR actually is</h1>
        <p className="answer">
          {SHEET_RULES.requiredSheets} record sheets, over {REQUIREMENTS.minTotalMonths} months.
          That is the whole thing.
        </p>
      </div>

      {/* The whole qualification, at a glance and at a size nobody panics at. */}
      <div className="sheets" aria-label={`${SHEET_RULES.requiredSheets} record sheets`}>
        {Array.from({ length: SHEET_RULES.requiredSheets }).map((_, i) => (
          <span className="sheet-chip" key={i} data-first={i === 0 ? 'true' : undefined}>
            {i + 1}
          </span>
        ))}
      </div>
      {/* The same measurement the tool takes, so the device means one thing
          wherever it appears: this is the length of the whole thing. */}
      <Dimension value={REQUIREMENTS.minTotalMonths} max={REQUIREMENTS.minTotalMonths}
        label="months, end to end" animate={false} />

      <p className="hint">
        One sheet every {SHEET_RULES.maxPeriodMonths} months. Each is due{' '}
        {SHEET_RULES.submitWithinMonths} months after the quarter it covers.
      </p>

      <div className="explain-parts">
        <h2>One sheet has four parts</h2>
        <ol className="parts">
          {PARTS.map((part, i) => (
            <li key={part.n}>
              <span className="parts-n">{i + 1}</span>
              <span className="parts-body">
                <strong>{part.n}</strong>
                <span className="parts-what">{part.what}</span>
                <span className="parts-time">{part.time}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="row-wrap">
        <Link href="/" className="btn btn-primary">See what yours looks like</Link>
        <Link href="/guides" className="btn">Ask a question</Link>
      </div>
    </div>
  )
}
