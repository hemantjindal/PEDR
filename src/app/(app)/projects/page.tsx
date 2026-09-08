import { archiveProjectAction, saveProjectAction } from '../actions'
import { requireUser } from '@/lib/auth'
import { getEntries, getProjects } from '@/lib/data'
import { formatDuration } from '@/lib/pedr/week'

export const metadata = { title: 'Projects · PEDR' }
export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const user = await requireUser()
  const [projects, entries] = await Promise.all([getProjects(user.id), getEntries(user.id)])

  const minutesByProject = new Map<string, number>()
  for (const entry of entries) {
    if (!entry.projectId) continue
    minutesByProject.set(entry.projectId, (minutesByProject.get(entry.projectId) ?? 0) + entry.minutes)
  }

  // Project names the parser saw but could not match, so they can be adopted.
  const unmatched = new Map<string, number>()
  for (const entry of entries) {
    if (entry.projectId || !entry.projectHint) continue
    unmatched.set(entry.projectHint, (unmatched.get(entry.projectHint) ?? 0) + 1)
  }

  return (
    <div className="stack-l">
      <div className="stack-s">
        <h1>Projects</h1>
        <p className="dim">
          Add the code or nickname the office uses, plus every other name the same job goes by.
        </p>
      </div>

      {unmatched.size > 0 && (
        <div className="note note-pending">
          <span aria-hidden="true">◷</span>
          <span>
            Seen in your dumps but not on this list:{' '}
            <strong>{[...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, c]) => `${n} (${c})`).join(', ')}</strong>.
            Add them, or add them as an alias of a project you already have.
          </span>
        </div>
      )}

      <div className="stack-s">
        {projects.map((project) => (
          <details className="sheet" key={project.id} style={project.archived ? { opacity: 0.6 } : undefined}>
            <summary style={{ cursor: 'pointer' }}>
              <span className="row-wrap" style={{ display: 'inline-flex', gap: 8 }}>
                <strong>{project.code ? `${project.code} · ` : ''}{project.name}</strong>
                {project.isCaseStudy && <span className="chip chip-ink">case study</span>}
                {project.archived && <span className="chip">archived</span>}
                <span className="small faint">
                  {formatDuration(minutesByProject.get(project.id) ?? 0)}
                </span>
              </span>
            </summary>
            <ProjectForm project={project} />
          </details>
        ))}
      </div>

      <details className="sheet" open={projects.length === 0}>
        <summary style={{ cursor: 'pointer', fontWeight: 550 }}>Add a project</summary>
        <ProjectForm project={null} />
      </details>
    </div>
  )
}

function ProjectForm({ project }: { project: Awaited<ReturnType<typeof getProjects>>[number] | null }) {
  return (
    <form action={saveProjectAction} className="stack" style={{ marginTop: 14 }}>
      {project && <input type="hidden" name="projectId" value={project.id} />}
      <div className="grid grid-2">
        <div className="field">
          <label>Code or job number</label>
          <input name="code" defaultValue={project?.code ?? ''} placeholder="1042" />
        </div>
        <div className="field">
          <label>Name</label>
          <input name="name" required defaultValue={project?.name ?? ''} />
        </div>
        <div className="field">
          <label>Other names it goes by</label>
          <input name="aliases" defaultValue={project?.aliases.join(', ') ?? ''} placeholder="BSQ, Battersea" />
          <span className="hint">Comma separated. This is what makes a rough dump file itself correctly.</span>
        </div>
        <div className="field">
          <label>Client</label>
          <input name="client" defaultValue={project?.client ?? ''} />
        </div>
        <div className="field">
          <label>Sector</label>
          <input name="sector" defaultValue={project?.sector ?? ''} placeholder="Residential" />
        </div>
        <div className="field">
          <label>Value (£)</label>
          <input name="valueGbp" type="number" min="0" defaultValue={project?.valueGbp ?? ''} />
        </div>
        <div className="field">
          <label>Procurement route</label>
          <input name="procurement" defaultValue={project?.procurement ?? ''} placeholder="Two stage design and build" />
        </div>
        <div className="field">
          <label>Contract form</label>
          <input name="contractForm" defaultValue={project?.contractForm ?? ''} placeholder="JCT D&B 2016" />
        </div>
      </div>

      <label className="row small" style={{ gap: 8 }}>
        <input type="checkbox" name="isCaseStudy" defaultChecked={project?.isCaseStudy} style={{ width: 'auto' }} />
        <span>
          This is my Part 3 case study
          <span className="faint"> — worth recording in more depth than the rest.</span>
        </span>
      </label>

      <div className="row-wrap">
        <button type="submit" className="btn btn-primary btn-sm">Save</button>
        {project && (
          <button
            type="submit"
            formAction={archiveProjectAction}
            name="archived"
            value={project.archived ? 'false' : 'true'}
            className="btn btn-ghost btn-sm"
          >
            {project.archived ? 'Unarchive' : 'Archive'}
          </button>
        )}
      </div>
      {project && <input type="hidden" name="projectId" value={project.id} />}
    </form>
  )
}
