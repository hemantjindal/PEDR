'use client'

import { useState } from 'react'
import { EXPERIENCE_CATEGORIES, REQUIREMENTS, SHEET_RULES } from '@/lib/pedr/constants'

/**
 * The twenty minutes that make everything else work.
 *
 * Two jobs at once. It collects the handful of facts the app genuinely cannot
 * compute — when the experience started, who signs it, what the jobs are
 * called — and while it does that it explains why each one matters, because
 * a form that asks for an ARB registration number without saying it goes on
 * every sheet is a form people abandon.
 *
 * One step at a time, on purpose. All of it on one screen is a wall, and a
 * wall on the first run is where people leave. Nothing is required except the
 * start date, and Skip is always there — a record with three of five fields
 * beats no record.
 */

const STEPS = ['start', 'work', 'projects', 'goal'] as const
type Step = (typeof STEPS)[number]

const PRACTICE_SIZES = [
  { id: 'sole', label: 'Just me, or a handful' },
  { id: 'small', label: 'Under 20' },
  { id: 'medium', label: '20 to 100' },
  { id: 'large', label: 'Over 100' },
]

interface Project { code: string; name: string }

export function Onboarding({
  name,
  today,
  action,
  skipAction,
}: {
  name: string
  today: string
  action: (formData: FormData) => void
  skipAction: () => void
}) {
  const [step, setStep] = useState<Step>('start')
  const [projects, setProjects] = useState<Project[]>([{ code: '', name: '' }])
  const [experienceStart, setExperienceStart] = useState('')
  const [practiceSize, setPracticeSize] = useState('')
  const [category, setCategory] = useState('i')

  const index = STEPS.indexOf(step)
  const first = name.trim().split(/\s+/)[0]

  return (
    <form action={action} className="stack-l" style={{ maxWidth: 640 }}>
      {/* Progress as a set of blocks, not a percentage: four things, and you
          can see which one you are on. */}
      <div className="row" style={{ gap: 4 }} aria-hidden="true">
        {STEPS.map((s, i) => (
          <span
            key={s}
            style={{
              height: 6,
              flex: 1,
              background: i <= index ? 'var(--signal)' : 'var(--hair)',
              border: '1px solid var(--ink)',
            }}
          />
        ))}
      </div>

      {/* Every step's fields stay in the DOM so the form posts them all at the
          end, whichever step you happen to be looking at. */}
      <section className="sheet stack" hidden={step !== 'start'}>
        <div className="stack-s">
          <span className="label">Step 1 of 4</span>
          <h1>When did it start, {first}?</h1>
          <p className="dim small">
            The date your qualifying practical experience began. Every figure on this app is
            counted from it — when you can sit the exam, which quarter you are in, what is already
            overdue. It is the one thing nothing else can be worked out without.
          </p>
        </div>

        <div className="field">
          <label htmlFor="experienceStart">First day of qualifying experience</label>
          <input
            id="experienceStart"
            name="experienceStart"
            type="date"
            max={today}
            required
            value={experienceStart}
            onChange={(e) => setExperienceStart(e.target.value)}
          />
          <span className="hint">
            Best guess is fine — you can change it in Settings. If you are not sure, use your
            first day at the practice you are in now.
          </span>
        </div>

        <div className="field">
          <label htmlFor="part2School">Where did you do Part 2?</label>
          <input id="part2School" name="part2School" type="text" placeholder="e.g. UCL Bartlett" />
          <span className="hint">
            Your Professional Studies Advisor is usually attached to your school, so this is the
            quickest answer to &ldquo;who signs this&rdquo;.
          </span>
        </div>

        <input type="hidden" name="name" value={name} />

        <div className="note note-ink">
          <span aria-hidden="true">→</span>
          <span>
            You are working towards <strong>{REQUIREMENTS.minTotalMonths} months</strong> of
            experience across <strong>{SHEET_RULES.requiredSheets} quarterly sheets</strong>. Each
            sheet is due {SHEET_RULES.submitWithinMonths} months after the quarter it covers ends —
            the deadline that quietly catches people out.
          </span>
        </div>
      </section>

      <section className="sheet stack" hidden={step !== 'work'}>
        <div className="stack-s">
          <span className="label">Step 2 of 4</span>
          <h1>Who signs it?</h1>
          <p className="dim small">
            Every sheet is signed by somebody in your practice and approved by your PSA. Their
            names and your supervisor&rsquo;s registration number go on all eight of them, so they
            are worth typing once rather than eight times.
          </p>
        </div>

        <div className="field">
          <label htmlFor="employer">Practice</label>
          <input id="employer" name="employer" type="text" placeholder="Where you work now" />
        </div>

        <div className="field">
          <label htmlFor="role">Your job title</label>
          <input id="role" name="role" type="text" placeholder="e.g. Architectural Assistant Part 2" />
        </div>

        <div className="field">
          <label htmlFor="supervisorName">Employment supervisor</label>
          <input id="supervisorName" name="supervisorName" type="text" placeholder="The architect you report to" />
          <span className="hint">
            For category i experience they have to be a registered architect. It is the first thing
            a PSA checks.
          </span>
        </div>

        <div className="row-wrap" style={{ gap: 10 }}>
          <div className="field" style={{ flex: '0 0 110px' }}>
            <label htmlFor="supervisorRegBody">Register</label>
            <select id="supervisorRegBody" name="supervisorRegBody" defaultValue="ARB">
              <option value="ARB">ARB</option>
              <option value="RIBA">RIBA</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 180px' }}>
            <label htmlFor="supervisorRegNumber">Their registration number</label>
            <input id="supervisorRegNumber" name="supervisorRegNumber" type="text" placeholder="e.g. 084112B" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="mentorName">Professional Studies Advisor</label>
          <input id="mentorName" name="mentorName" type="text" placeholder="Your PSA at your school" />
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>Category of experience</legend>
          <div className="stack-s">
            {EXPERIENCE_CATEGORIES.map((c) => (
              <label key={c.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <input
                  type="radio"
                  name="category"
                  value={c.id}
                  checked={category === c.id}
                  onChange={() => setCategory(c.id)}
                  style={{ width: 'auto', marginTop: 3 }}
                />
                <span>
                  <span className="small" style={{ fontWeight: 600 }}>{c.name}</span>
                  <br />
                  <span className="tiny faint">{c.blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>How big is the practice?</legend>
          <div className="row-wrap" style={{ gap: 5 }}>
            {PRACTICE_SIZES.map((size) => (
              <button
                key={size.id}
                type="button"
                className={`chip ${practiceSize === size.id ? 'chip-ink' : ''}`}
                style={{ cursor: 'pointer' }}
                aria-pressed={practiceSize === size.id}
                onClick={() => setPracticeSize(size.id)}
              >
                {size.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="practiceSize" value={practiceSize} />
          <p className="tiny faint" style={{ marginTop: 8 }}>
            Not curiosity. Coverage gaps are a large-practice problem — specialised teams mean
            somebody can be three years in with nothing at Stage 5 — so the warnings fire earlier
            for a big office.
          </p>
        </fieldset>
      </section>

      <section className="sheet stack" hidden={step !== 'projects'}>
        <div className="stack-s">
          <span className="label">Step 3 of 4</span>
          <h1>What are you on?</h1>
          <p className="dim small">
            Add the jobs you are working on now. Once a number and a name are here, writing
            &ldquo;1042&rdquo; or &ldquo;Battersea&rdquo; in the box files the entry by itself —
            and sheets are assessed per project, so unattributed hours are hard to defend.
          </p>
        </div>

        <div className="stack-s">
          {projects.map((project, i) => (
            <div className="row-wrap" style={{ gap: 8 }} key={i}>
              <input
                type="text"
                name="projectCode"
                placeholder="Job no."
                value={project.code}
                onChange={(e) => setProjects((cur) =>
                  cur.map((p, j) => (j === i ? { ...p, code: e.target.value } : p)))}
                style={{ flex: '0 0 100px' }}
                aria-label={`Project ${i + 1} number`}
              />
              <input
                type="text"
                name="projectName"
                placeholder="What you call it"
                value={project.name}
                onChange={(e) => setProjects((cur) =>
                  cur.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))}
                style={{ flex: '1 1 180px' }}
                aria-label={`Project ${i + 1} name`}
              />
            </div>
          ))}
        </div>

        <div className="row-wrap">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setProjects((cur) => [...cur, { code: '', name: '' }])}
          >
            Another
          </button>
          <span className="tiny faint" style={{ alignSelf: 'center' }}>
            You can add the rest later, and archive them when they finish.
          </span>
        </div>
      </section>

      <section className="sheet stack" hidden={step !== 'goal'}>
        <div className="stack-s">
          <span className="label">Step 4 of 4</span>
          <h1>When do you want to sit it?</h1>
          <p className="dim small">
            The recency rule is the one that surprises people:{' '}
            {REQUIREMENTS.minRecentMonths} of your {REQUIREMENTS.minTotalMonths} months have to
            fall in the {REQUIREMENTS.recentWindowMonths} months immediately before the exam. A
            target date turns that from a rule into a countdown.
          </p>
        </div>

        <div className="field">
          <label htmlFor="targetExamDate">Target exam date</label>
          <input id="targetExamDate" name="targetExamDate" type="date" min={today} />
          <span className="hint">Rough is fine. Leave it blank if you have no idea yet.</span>
        </div>

        <div className="note note-pending">
          <span aria-hidden="true">→</span>
          <span>
            <strong>The one habit that matters:</strong> three lines on a Friday. What you did,
            which job it was on, and one thing that annoyed you. Everything on this app is built
            out of that.
          </span>
        </div>
      </section>

      <div className="row-wrap sticky-actions">
        {index > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() => setStep(STEPS[index - 1])}
          >
            Back
          </button>
        )}
        {/* Distinct keys, deliberately. Without them React reuses one DOM node
            for both and only swaps `type`, which it does during the click's own
            discrete update — the browser then evaluates the default action
            against the *new* type and submits the form a step early. */}
        {index < STEPS.length - 1 ? (
          <button
            key="next"
            type="button"
            className="btn btn-primary"
            disabled={step === 'start' && !experienceStart}
            onClick={() => setStep(STEPS[index + 1])}
          >
            Next
          </button>
        ) : (
          <button key="finish" type="submit" className="btn btn-primary">
            Start the record
          </button>
        )}
        <span className="spacer" />
        <button type="submit" className="btn btn-ghost btn-sm" formAction={skipAction}>
          Skip for now
        </button>
      </div>
    </form>
  )
}
