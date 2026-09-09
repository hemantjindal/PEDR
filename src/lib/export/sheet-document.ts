import {
  OFFICE_MANAGEMENT_CATEGORIES, PROFESSIONAL_CRITERIA, RIBA_STAGES, SHEET_RULES,
} from '../pedr/constants'
import type { Employment, Entry, Project, SheetContent } from '../pedr/types'
import { daysBetween, formatDate, formatDuration, type DateKey } from '../pedr/week'
import { officeSummary } from '../pedr/sheet'
import type { Block, ExportDocument } from './blocks'

/**
 * The quarterly record sheet, as blocks.
 *
 * The order is the order of the real sheet, so it can be worked through top to
 * bottom with RIBA's form open beside it. What comes out is a draft to check
 * and paste: the record lives in RIBA's system, and it is there that a mentor
 * and PSA sign it.
 *
 * The house style is short. Examiners say so explicitly — around six pages —
 * so this summarises rather than transcribes, and the entries are always
 * underneath if more detail is wanted.
 */

export interface SheetDocumentInput {
  content: SheetContent
  periodStart: DateKey
  periodEnd: DateKey
  candidateName: string
  employment: Employment | null
  /** Included as an appendix when asked for. Off by default: it is long. */
  entries?: Entry[]
  projects?: Project[]
  includeEntries?: boolean
}

export function buildSheetDocument(input: SheetDocumentInput): ExportDocument {
  const { content, periodStart, periodEnd, candidateName } = input
  const weeks = Math.round(daysBetween(periodStart, periodEnd) / 7)
  const blocks: Block[] = []

  blocks.push({
    kind: 'title',
    text: 'PEDR quarterly record sheet',
    subtitle: `${candidateName} · ${formatDate(periodStart)} to ${formatDate(periodEnd)} · ${weeks} weeks`,
  })
  blocks.push({
    kind: 'paragraph',
    tone: 'note',
    text:
      'A draft, generated from a logged record. Check every line, then enter it in your PEDR at ' +
      'register.architecture.com/pedr. Printing a sheet there as final locks it, so make the ' +
      'corrections here first.',
  })

  // --- General information ------------------------------------------------

  blocks.push({ kind: 'heading', level: 1, text: 'General information' })
  blocks.push({
    kind: 'facts',
    rows: [
      ['Candidate', candidateName],
      ['Period', `${formatDate(periodStart)} to ${formatDate(periodEnd)}`],
      ['Employer', content.general.employer || '—'],
      ['Role', content.general.role || '—'],
      ['Employment supervisor', content.general.supervisorName || '—'],
      ['Registration', registrationLine(input.employment)],
      ['Professional Studies Advisor', input.employment?.mentorName || '—'],
      ['Category of experience', categoryLine(content.general.category)],
      ['Location', content.general.location === 'UK' ? 'United Kingdom' : content.general.location],
      ['Days worked', String(content.general.daysWorked)],
      ['Hours recorded', `${content.general.hoursWorked}`],
    ],
  })

  // --- Projects -----------------------------------------------------------

  blocks.push({ kind: 'heading', level: 1, text: 'Describe your projects' })
  if (content.projects.length === 0) {
    blocks.push({
      kind: 'paragraph',
      tone: 'quiet',
      text: 'No project work recorded in this period.',
    })
  } else {
    for (const project of content.projects) {
      blocks.push({
        kind: 'heading',
        level: 2,
        text: [project.code, project.name].filter(Boolean).join(' · '),
      })
      const facts: Array<[string, string]> = []
      if (project.client) facts.push(['Client', project.client])
      if (project.valueGbp) facts.push(['Approximate value', `£${project.valueGbp.toLocaleString('en-GB')}`])
      if (project.procurement) facts.push(['Procurement', project.procurement])
      if (project.stages.length > 0) {
        facts.push(['RIBA stages', project.stages.map((s) => `Stage ${s}`).join(', ')])
      }
      facts.push(['Time on it', formatDuration(project.minutes)])
      blocks.push({ kind: 'facts', rows: facts })
      if (project.summary) blocks.push({ kind: 'paragraph', text: project.summary })
    }
  }

  // --- Stages -------------------------------------------------------------

  blocks.push({ kind: 'heading', level: 1, text: 'Record your activities' })
  blocks.push({
    kind: 'paragraph',
    tone: 'quiet',
    text:
      'Hours against each RIBA Plan of Work stage, in the record sheet\u2019s two columns. ' +
      'Participant is work you did; observer is work you watched or were taught.',
  })
  blocks.push({
    kind: 'table',
    head: ['Stage', 'Name', 'Participant', 'Observer', 'Total'],
    numeric: [2, 3, 4],
    rows: RIBA_STAGES.map((s) => {
      const split = content.stageParticipation?.[String(s.id)] ?? { participant: 0, observer: 0 }
      const minutes = content.stageMinutes[String(s.id)] ?? 0
      return [
        s.code,
        s.name,
        hours(split.participant),
        hours(split.observer),
        hours(minutes),
      ]
    }),
  })

  const totals = content.participation ?? { participant: 0, observer: 0 }
  if (totals.observer > 0) {
    const share = Math.round((totals.observer / (totals.participant + totals.observer)) * 100)
    blocks.push({
      kind: 'paragraph',
      tone: 'quiet',
      text:
        `${share}% of the hours in this period are observer hours. That is worth a sentence in ` +
        'the reflection either way \u2014 rising because you are being shown new territory, or ' +
        'falling because you are running the work yourself.',
    })
  }

  // --- Office management --------------------------------------------------

  const office = input.entries ? officeSummary(input.entries) : []
  if (office.length > 0) {
    blocks.push({ kind: 'heading', level: 2, text: 'Office management and professional development' })
    blocks.push({
      kind: 'table',
      head: ['Category', 'Hours', 'Counts as experience'],
      numeric: [1],
      rows: office.map((row) => [
        row.name,
        (row.minutes / 60).toFixed(1),
        row.counts ? 'Yes' : 'No — recorded as absence',
      ]),
    })
  } else if (OFFICE_MANAGEMENT_CATEGORIES.length > 0) {
    blocks.push({ kind: 'heading', level: 2, text: 'Office management and professional development' })
    blocks.push({
      kind: 'paragraph',
      tone: 'quiet',
      text: 'Nothing recorded outside project work in this period.',
    })
  }

  // --- Criteria -----------------------------------------------------------

  blocks.push({ kind: 'heading', level: 1, text: 'Professional Criteria' })
  blocks.push({
    kind: 'paragraph',
    tone: 'quiet',
    text:
      'The examples below are drawn from the record. A criterion with nothing against it is not a ' +
      'failure this quarter — it is a gap to close before you sit.',
  })
  for (const criterion of PROFESSIONAL_CRITERIA) {
    const row = content.criteria[criterion.id]
    blocks.push({ kind: 'heading', level: 2, text: `${criterion.id} — ${criterion.name}` })
    blocks.push({
      kind: 'paragraph',
      tone: 'quiet',
      text: `${row?.entries ?? 0} entries · ${formatDuration(row?.minutes ?? 0)}`,
    })
    blocks.push(
      row?.examples.length
        ? { kind: 'bullets', items: row.examples }
        : {
            kind: 'paragraph',
            tone: 'quiet',
            text: 'Nothing recorded against this criterion in this period.',
          },
    )
  }

  // --- Reflection ---------------------------------------------------------

  blocks.push({ kind: 'heading', level: 1, text: 'Reflect on your experience' })
  const boxes: Array<[string, string]> = [
    ['What did you actually do?', content.reflection.did],
    ['What did you learn?', content.reflection.learned],
    ['What went well?', content.reflection.wentWell],
    ['What went wrong?', content.reflection.wentWrong],
    ['What next?', content.reflection.next],
  ]
  for (const [heading, body] of boxes) {
    blocks.push({ kind: 'heading', level: 2, text: heading })
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
    blocks.push(
      lines.length > 0
        ? { kind: 'bullets', items: lines }
        : {
            kind: 'paragraph',
            tone: 'quiet',
            text: 'Nothing captured. Worth filling in before you submit — this is the section examiners read.',
          },
    )
  }

  // --- Appendix -----------------------------------------------------------

  if (input.includeEntries && input.entries && input.entries.length > 0) {
    blocks.push({ kind: 'pageBreak' })
    blocks.push({ kind: 'heading', level: 1, text: 'Appendix — the entries behind this sheet' })
    blocks.push({
      kind: 'paragraph',
      tone: 'quiet',
      text:
        'Not part of the submission. It is here so a mentor can check any line back to the day it ' +
        'was logged.',
    })
    const projectById = new Map((input.projects ?? []).map((p) => [p.id, p]))
    blocks.push({
      kind: 'table',
      head: ['Date', 'Hours', 'Project', 'What you did'],
      numeric: [1],
      rows: input.entries.map((entry) => [
        formatDate(entry.date),
        entry.minutes > 0 ? (entry.minutes / 60).toFixed(2) : '—',
        entry.projectId
          ? projectById.get(entry.projectId)?.code || projectById.get(entry.projectId)?.name || '—'
          : entry.officeCategory ?? entry.projectHint ?? '—',
        entry.activity,
      ]),
    })
  }

  blocks.push({ kind: 'rule' })
  blocks.push({
    kind: 'paragraph',
    tone: 'quiet',
    text:
      `Examiners want around ${SHEET_RULES.targetPages} pages. Cut anything here that does not name ` +
      'a project, a task, a person or a judgement.',
  })

  return {
    meta: {
      name: `pedr-${periodStart}-to-${periodEnd}`,
      title: `PEDR record sheet — ${formatDate(periodStart)} to ${formatDate(periodEnd)}`,
      author: candidateName,
      footer: `${candidateName} · PEDR ${formatDate(periodStart)} to ${formatDate(periodEnd)}`,
    },
    blocks,
  }
}

function registrationLine(employment: Employment | null): string {
  if (!employment) return '—'
  const parts = [employment.supervisorRegBody, employment.supervisorRegNumber].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : '—'
}

function categoryLine(category: string): string {
  return category === 'i' ? 'i — under the direct supervision of an architect'
    : category === 'ii' ? 'ii — in a construction-related field'
    : category === 'iii' ? 'iii — other relevant experience'
    : category
}

/** A stage with no time against it reads better as a dash than as 0.0. */
function hours(minutes: number): string {
  return minutes > 0 ? (minutes / 60).toFixed(1) : '\u2014'
}
