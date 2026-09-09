import { PROFESSIONAL_CRITERIA, RIBA_STAGES } from '../pedr/constants'
import type { Employment, SheetContent } from '../pedr/types'
import { formatDate, formatDuration, type DateKey } from '../pedr/week'
import type { Block, ExportDocument } from './blocks'

/**
 * The appraisal, as a document somebody else fills in.
 *
 * This exists because of a specific gap in the real process: the appraisal
 * section of a PEDR is not completed online. RIBA generates a template when
 * you print, or hands you a Word file to complete and upload. So the mentor's
 * half of the quarter happens in an attachment, usually with no context in it
 * beyond a blank box.
 *
 * What this adds is the context. A mentor opening it sees what the quarter
 * actually contained — the projects, the hours, the stages covered, the
 * candidate's own reflection — above the boxes they have to fill in. That is
 * the difference between "you're doing fine, keep going" and an appraisal an
 * examiner can read.
 */

export interface AppraisalInput {
  content: SheetContent
  periodStart: DateKey
  periodEnd: DateKey
  candidateName: string
  employment: Employment | null
  /** Who is filling it in: 'mentor' is the PSA, 'supervisor' is the employer. */
  role: AppraisalRole
}

export type AppraisalRole = 'mentor' | 'supervisor'

const ROLES: Record<AppraisalRole, { title: string; who: string; blurb: string }> = {
  mentor: {
    title: 'Professional Studies Advisor appraisal',
    who: 'Professional Studies Advisor',
    blurb:
      'Your PSA is the academic side of the record: they read the reflection and judge whether the ' +
      'experience is adding up to a Part 3 candidate.',
  },
  supervisor: {
    title: 'Employment supervisor appraisal',
    who: 'Employment supervisor',
    blurb:
      'Your supervisor is the practice side of the record: they confirm what you did and at what ' +
      'level, and they have to be a registered architect for category i experience to count.',
  },
}

export function buildAppraisalDocument(input: AppraisalInput): ExportDocument {
  const { content, periodStart, periodEnd, candidateName, employment } = input
  const role = ROLES[input.role]
  const blocks: Block[] = []

  blocks.push({
    kind: 'title',
    text: role.title,
    subtitle: `${candidateName} · ${formatDate(periodStart)} to ${formatDate(periodEnd)}`,
  })
  blocks.push({
    kind: 'paragraph',
    tone: 'note',
    text:
      'The appraisal is not completed in the PEDR system itself — RIBA gives you a template to fill ' +
      'in and upload. This is that template, with the quarter it refers to printed above it, so ' +
      'nobody has to write an appraisal from memory. Complete it, then upload or paste it back.',
  })

  // --- What the quarter contained ----------------------------------------

  blocks.push({ kind: 'heading', level: 1, text: 'The quarter being appraised' })
  blocks.push({
    kind: 'facts',
    rows: [
      ['Candidate', candidateName],
      ['Period', `${formatDate(periodStart)} to ${formatDate(periodEnd)}`],
      ['Employer', content.general.employer || '—'],
      ['Role', content.general.role || '—'],
      [role.who, (input.role === 'mentor' ? employment?.mentorName : content.general.supervisorName) || '—'],
      ['Days worked', String(content.general.daysWorked)],
      ['Hours recorded', String(content.general.hoursWorked)],
    ],
  })

  if (content.projects.length > 0) {
    blocks.push({ kind: 'heading', level: 2, text: 'Projects' })
    blocks.push({
      kind: 'table',
      head: ['Project', 'Stages', 'Hours'],
      numeric: [2],
      rows: content.projects.map((p) => [
        [p.code, p.name].filter(Boolean).join(' · '),
        p.stages.length > 0 ? p.stages.join(', ') : '—',
        (p.minutes / 60).toFixed(1),
      ]),
    })
  }

  const coveredStages = RIBA_STAGES.filter((s) => (content.stageMinutes[String(s.id)] ?? 0) > 0)
  if (coveredStages.length > 0) {
    blocks.push({ kind: 'heading', level: 2, text: 'Stages covered' })
    blocks.push({
      kind: 'bullets',
      items: coveredStages.map((s) =>
        `Stage ${s.code} — ${s.name} · ${formatDuration(content.stageMinutes[String(s.id)] ?? 0)}`,
      ),
    })
  }

  const coveredCriteria = PROFESSIONAL_CRITERIA.filter((c) => (content.criteria[c.id]?.entries ?? 0) > 0)
  const missingCriteria = PROFESSIONAL_CRITERIA.filter((c) => (content.criteria[c.id]?.entries ?? 0) === 0)
  blocks.push({ kind: 'heading', level: 2, text: 'Professional Criteria this quarter' })
  blocks.push({
    kind: 'bullets',
    items: coveredCriteria.length > 0
      ? coveredCriteria.map((c) => `${c.id} — ${c.name} (${content.criteria[c.id]?.entries ?? 0} entries)`)
      : ['Nothing recorded against any criterion this quarter.'],
  })
  if (missingCriteria.length > 0) {
    blocks.push({
      kind: 'paragraph',
      tone: 'quiet',
      text:
        `Not touched this quarter: ${missingCriteria.map((c) => c.id).join(', ')}. ` +
        'Worth a sentence below on how and when they will be.',
    })
  }

  // --- What the candidate said -------------------------------------------

  blocks.push({ kind: 'heading', level: 1, text: 'What the candidate wrote' })
  const said: Array<[string, string]> = [
    ['What they did', content.reflection.did],
    ['What they learned', content.reflection.learned],
    ['What went well', content.reflection.wentWell],
    ['What went wrong', content.reflection.wentWrong],
    ['What next', content.reflection.next],
  ]
  for (const [heading, body] of said) {
    blocks.push({ kind: 'heading', level: 2, text: heading })
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
    blocks.push(
      lines.length > 0
        ? { kind: 'bullets', items: lines }
        : { kind: 'paragraph', tone: 'quiet', text: 'Left blank.' },
    )
  }

  // --- The bit to fill in -------------------------------------------------

  blocks.push({ kind: 'pageBreak' })
  blocks.push({ kind: 'heading', level: 1, text: 'Your appraisal' })
  blocks.push({ kind: 'paragraph', tone: 'quiet', text: role.blurb })

  const prompts: Array<{ label: string; hint: string; lines: number }> = [
    {
      label: 'Is the experience in this period appropriate, and at the right level?',
      hint: 'Whether the work is what a candidate at this point should be doing, not whether it was done well.',
      lines: 5,
    },
    {
      label: 'What is the candidate doing well?',
      hint: 'Name something specific. "Good progress" tells an examiner nothing.',
      lines: 5,
    },
    {
      label: 'Where do they need to develop, and how?',
      hint: 'The gap, and the concrete thing that would close it — a project, a stage, a person to sit with.',
      lines: 6,
    },
    {
      label: 'What experience should the next period aim at?',
      hint: 'Including any criteria above that have not been touched.',
      lines: 5,
    },
    {
      label: 'Anything else an examiner should know',
      hint: 'Optional.',
      lines: 4,
    },
  ]
  for (const prompt of prompts) {
    blocks.push({ kind: 'fill', label: prompt.label, hint: prompt.hint, lines: prompt.lines })
  }

  blocks.push({ kind: 'rule' })
  blocks.push({ kind: 'heading', level: 2, text: 'Signature' })
  blocks.push({ kind: 'fill', label: 'Name', lines: 1 })
  blocks.push({
    kind: 'fill',
    label: input.role === 'supervisor' ? 'ARB / RIBA registration number' : 'Institution',
    hint: input.role === 'supervisor'
      ? 'Category i experience requires supervision by a registered architect.'
      : undefined,
    lines: 1,
  })
  blocks.push({ kind: 'fill', label: 'Date', lines: 1 })

  return {
    meta: {
      name: `pedr-${input.role}-appraisal-${periodStart}-to-${periodEnd}`,
      title: `${role.title} — ${candidateName}`,
      author: candidateName,
      footer: `${candidateName} · ${role.title} · ${formatDate(periodStart)} to ${formatDate(periodEnd)}`,
    },
    blocks,
  }
}
