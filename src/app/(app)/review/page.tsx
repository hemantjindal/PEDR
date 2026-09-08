import Link from 'next/link'
import { EntryRow } from '@/components/entry-row'
import { requireUser } from '@/lib/auth'
import { getEntries, getProjects } from '@/lib/data'
import { REVIEW_THRESHOLD } from '@/lib/pedr/types'

export const metadata = { title: 'Review · PEDR' }
export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  const user = await requireUser()
  const [all, projects] = await Promise.all([getEntries(user.id), getProjects(user.id)])

  const unverified = all.filter((e) => !e.verified)
  const unsure = unverified.filter((e) => e.confidence < REVIEW_THRESHOLD)
  const rest = unverified.filter((e) => e.confidence >= REVIEW_THRESHOLD)

  return (
    <div className="stack-l">
      <div className="stack-s">
        <h1>Review</h1>
        <p className="dim">
          Entries nobody has looked at yet. A record your mentor signs should not contain anything
          you have not read.
        </p>
      </div>

      {unverified.length === 0 ? (
        <div className="note">
          <span aria-hidden="true">✓</span>
          <span>
            Everything has been checked. <Link href="/dashboard" style={{ color: 'var(--ink)' }}>Back to the dashboard</Link>
          </span>
        </div>
      ) : (
        <>
          {unsure.length > 0 && (
            <section className="stack">
              <h2>We were not sure about these ({unsure.length})</h2>
              <p className="dim small">
                Usually a date we guessed or a project we could not match. Editing one marks it
                checked.
              </p>
              <div className="stack-s">
                {unsure.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} projects={projects} showDate />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section className="stack">
              <h2>Everything else ({rest.length})</h2>
              <div className="stack-s">
                {rest.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} projects={projects} showDate />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
