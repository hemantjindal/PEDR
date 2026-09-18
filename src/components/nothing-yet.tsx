import type { ReactNode } from 'react'

/**
 * What a screen says before there is anything to say.
 *
 * Every analysis page in this app compares a record against a requirement, and
 * with no record every one of them has the same answer: everything is missing.
 * Rendered literally that becomes thirteen criteria marked NEVER, or fourteen
 * viva questions you cannot answer, on the day somebody signs up. It reads as
 * broken, and for the people this is built for — the ones who have been putting
 * the PEDR off because it frightens them — it is actively discouraging.
 *
 * So the empty case is not the full case with zeroes in it. It is a short
 * explanation of what the page will do once there is something to do it with,
 * and the one or two actions that get them there.
 */
export function NothingYet({
  label,
  title,
  children,
  actions,
  aside,
}: {
  /** The mono eyebrow. Names the state, not the feature. */
  label: string
  title: string
  /** What this page will tell them, once it can. */
  children: ReactNode
  actions?: ReactNode
  /** Optional reassurance. Empty screens are where people decide to give up. */
  aside?: ReactNode
}) {
  return (
    <div className={aside ? 'split' : undefined}>
      <section className="sheet stack">
        <div className="stack-s">
          <span className="label">{label}</span>
          <h2>{title}</h2>
        </div>
        {children}
        {actions ? <div className="row-wrap">{actions}</div> : null}
      </section>

      {aside ? (
        <aside className="sheet stack-s">
          <span className="label">No rush</span>
          {aside}
        </aside>
      ) : null}
    </div>
  )
}
