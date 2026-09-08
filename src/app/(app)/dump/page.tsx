import { DumpComposer } from '@/components/dump-composer'
import { requireUser } from '@/lib/auth'
import { getProjects } from '@/lib/data'
import { isEnrichmentAvailable } from '@/lib/ingest/enrich'
import { todayKey } from '@/lib/pedr/week'

export const metadata = { title: 'Dump · PEDR' }
export const dynamic = 'force-dynamic'

export default async function DumpPage() {
  const user = await requireUser()
  const projects = await getProjects(user.id)

  return (
    <div className="stack-l">
      <div className="stack-s">
        <h1>Dump</h1>
        <p className="dim">
          Empty your head into the box. It comes out as a dated, structured record you can hand to
          a mentor.
        </p>
      </div>

      <DumpComposer
        projects={projects}
        today={todayKey()}
        modelAvailable={isEnrichmentAvailable()}
      />
    </div>
  )
}
