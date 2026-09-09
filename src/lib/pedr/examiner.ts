import {
  PROFESSIONAL_CRITERIA, RIBA_STAGES, officeCategory,
  type CriterionId, type StageId,
} from './constants'
import { isSpecificActivity, normaliseActivity } from './scoring'
import type { Entry, Project } from './types'
import { formatDate, formatDuration, type DateKey } from './week'

/**
 * The viva, run against your own record.
 *
 * Part 3 ends in an oral exam. The examiners have read your PEDR and they ask
 * you about what is on the page — your projects, your stages, the things you
 * wrote in the reflective boxes. Nobody fails for a gap they declared. People
 * fail for a claim they cannot defend.
 *
 * That is the whole reason this module exists, and the reason a spreadsheet
 * cannot replace it. A spreadsheet can tell you a cell is empty. It cannot
 * tell you that the cell you *filled in* is the dangerous one, because it does
 * not know that "attended site meeting" logged eleven times invites the
 * question "tell me about a decision you made on site" and answers none of it.
 *
 * Three verdicts, and the third is the product:
 *
 *   answerable — specific, participant evidence sits behind it
 *   thin       — something is there, but vague, or you only watched
 *   exposed    — the record claims it and has nothing to back it
 *
 * Exposure is worse than absence. An empty criterion is a gap you can explain.
 * A tagged one with nothing behind it is an invitation.
 *
 * Nothing here writes an answer. A viva answer that is not yours is a viva you
 * fail slowly, over about ninety seconds.
 */

export type Verdict = 'answerable' | 'thin' | 'exposed'

export type QuestionSource =
  /** Something you wrote went wrong. Examiners open with these. */
  | 'friction'
  /** The same vague line, many times over. */
  | 'vague'
  /** Hours at a stage, all of them watched. */
  | 'observed'
  /** A criterion with nothing at all against it. */
  | 'absent'
  /** A criterion you have tagged but cannot evidence. */
  | 'claimed'
  /** Your biggest project — they will start here. */
  | 'project'
  /** The contract on that project. */
  | 'contract'
  /** A stage you have touched for an hour and a half. */
  | 'token'
  /** Who you have dealt with, or have not. */
  | 'people'

export interface Evidence {
  /** Your own words, quoted back, because that is how it will happen. */
  quote: string | null
  date: DateKey | null
  /** How many entries in the record could support an answer. */
  supporting: number
}

export interface ExamQuestion {
  id: string
  question: string
  /** Why this record invites this question. Always specific to the record. */
  because: string
  /** What a passable answer contains. Not the answer. */
  looksFor: string[]
  criterion: CriterionId | null
  stage: StageId | null
  source: QuestionSource
  verdict: Verdict
  evidence: Evidence
  /** What to go and do, when the answer is not in the record. */
  fix: string | null
}

export interface ExamReport {
  questions: ExamQuestion[]
  /** Questions you could answer, over questions the record invites. */
  answerable: number
  thin: number
  exposed: number
  /** 0–1. Not completeness — defensibility. */
  readiness: number
  /** The single most dangerous thing on the page. */
  worst: ExamQuestion | null
  /** One sentence, honest. */
  headline: string
  byCriterion: Record<string, { answerable: number; thin: number; exposed: number }>
}

export interface ExaminerInput {
  entries: Entry[]
  projects: Project[]
  /** Only ask about the period being examined. Defaults to everything. */
  from?: DateKey
  to?: DateKey
}

// ---------------------------------------------------------------------------

export function examine(input: ExaminerInput): ExamReport {
  const entries = input.entries
    .filter((e) => (!input.from || e.date >= input.from) && (!input.to || e.date <= input.to))
    .sort((a, b) => a.date.localeCompare(b.date))

  const projectById = new Map(input.projects.map((p) => [p.id, p]))
  const questions: ExamQuestion[] = [
    ...fromFriction(entries),
    ...fromCriteria(entries),
    ...fromStages(entries),
    ...fromProjects(entries, input.projects),
    ...fromVagueness(entries),
    ...fromPeople(entries, projectById),
  ]

  // Worst first: an exposure is what loses marks, a thin answer is what makes
  // them uncomfortable, and an answerable one is only there to be reassuring.
  const rank: Record<Verdict, number> = { exposed: 0, thin: 1, answerable: 2 }
  questions.sort((a, b) => rank[a.verdict] - rank[b.verdict] || a.id.localeCompare(b.id))

  const answerable = questions.filter((q) => q.verdict === 'answerable').length
  const thin = questions.filter((q) => q.verdict === 'thin').length
  const exposed = questions.filter((q) => q.verdict === 'exposed').length

  const byCriterion: ExamReport['byCriterion'] = {}
  for (const c of PROFESSIONAL_CRITERIA) {
    byCriterion[c.id] = { answerable: 0, thin: 0, exposed: 0 }
  }
  for (const q of questions) {
    if (q.criterion) byCriterion[q.criterion][q.verdict]++
  }

  // A thin answer is worth half. An exposure is worth nothing and costs the
  // examiner's confidence in everything next to it.
  const readiness = questions.length === 0
    ? 0
    : Math.round(((answerable + thin * 0.5) / questions.length) * 100) / 100

  return {
    questions,
    answerable,
    thin,
    exposed,
    readiness,
    worst: questions.find((q) => q.verdict === 'exposed') ?? null,
    headline: headlineFor({ questions, answerable, thin, exposed, readiness }),
    byCriterion,
  }
}

function headlineFor(r: {
  questions: ExamQuestion[]
  answerable: number
  thin: number
  exposed: number
  readiness: number
}): string {
  if (r.questions.length === 0) {
    return 'Nothing logged yet, so there is nothing for an examiner to ask about.'
  }
  if (r.exposed > 0) {
    return `${r.exposed} ${r.exposed === 1 ? 'question' : 'questions'} your record invites and ` +
      'cannot answer. Those are the ones that lose marks — a gap you declare is fine, a claim ' +
      'you cannot back is not.'
  }
  if (r.thin > r.answerable) {
    return `You can answer ${r.answerable} of ${r.questions.length} properly. Most of the rest ` +
      'have something behind them, but vague or observed — enough to be asked, not enough to sound like you did it.'
  }
  return `${r.answerable} of ${r.questions.length} answerable from the record as it stands.`
}

// ---------------------------------------------------------------------------
// Where the questions come from
// ---------------------------------------------------------------------------

/**
 * Friction. This is where an examiner actually starts.
 *
 * A candidate who wrote "I issued the wrong revision" has handed over the best
 * question on the paper, and the follow-up is always the same: and then what?
 * These are always answerable — you lived it — which is exactly why the
 * reflective boxes are worth 20 points in the weekly score.
 */
function fromFriction(entries: Entry[]): ExamQuestion[] {
  const withFriction = entries.filter((e) => e.wentWrong && e.wentWrong.trim().length > 20)
  if (withFriction.length === 0) return []

  // Two, not one per entry: an examiner asks this twice at most, and three
  // identical questions in a list reads like a bug rather than a viva. The
  // unreflected one first, because that is the one that catches people, then
  // the most recent — a candidate is always asked about the current job.
  const unreflected = withFriction.filter((e) => !hasSubstantialLearning(e))
  const picked = [
    unreflected[unreflected.length - 1],
    [...withFriction].reverse().find((e) => e !== unreflected[unreflected.length - 1]),
  ].filter((e): e is Entry => Boolean(e))

  return picked.map((entry, i) => ({
    id: `friction-${i}`,
    // The question names the thing, so two of these are visibly different
    // questions about different weeks rather than the same line twice.
    question: `On ${formatDate(entry.date)} you wrote that this went wrong: "${
      truncate(entry.wentWrong ?? '', 90)}" Talk me through it — and what you do differently now.`,
    because: 'Your own words. Examiners open on these, because a candidate who can only describe ' +
      'success has not learned anything they can name.',
    looksFor: [
      'What actually happened, in sequence, without hedging',
      'What you did about it at the time',
      'What changed in your process afterwards — a checklist, a habit, a question you now ask',
      'What it cost: time, money, or somebody else’s trust',
    ],
    criterion: entry.criteria[0] ?? null,
    stage: entry.stage,
    source: 'friction',
    verdict: hasSubstantialLearning(entry) ? 'answerable' : 'thin',
    evidence: { quote: entry.wentWrong, date: entry.date, supporting: 1 },
    fix: hasSubstantialLearning(entry)
      ? null
      : 'You logged what went wrong but not what you took from it. Add a line to that entry now, '
        + 'while you still remember — it is the half an examiner is actually asking about.',
  }))
}

function hasSubstantialLearning(entry: Entry): boolean {
  return Boolean(entry.learned && entry.learned.trim().length > 15)
}

/** Holiday and sick leave are recorded but are not experience to be asked about. */
function countsAsExperience(entry: Entry): boolean {
  if (!entry.officeCategory) return true
  return officeCategory(entry.officeCategory)?.countsAsExperience !== false
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

/**
 * The Professional Criteria. All five are examinable whether or not you have
 * anything against them, which is what makes a thinly-evidenced one worse than
 * an empty one: an empty one you can be honest about.
 */
function fromCriteria(entries: Entry[]): ExamQuestion[] {
  return PROFESSIONAL_CRITERIA.map((criterion) => {
    const matches = entries.filter((e) => e.criteria.includes(criterion.id as CriterionId))
    const solid = matches.filter(
      (e) => isSpecificActivity(e.activity) && e.participation === 'participant',
    )
    // Quote project work over a CPD title: "CPD seminar on the Building Safety
    // Act" is technically tagged PC1 and is useless as the thing an examiner
    // would hold up while asking about professional judgement.
    const best =
      [...solid].sort((a, b) =>
        Number(Boolean(b.projectId)) - Number(Boolean(a.projectId)) || b.minutes - a.minutes,
      )[0] ?? matches[0] ?? null

    // Evidence that came from a lecture theatre is knowledge, not experience.
    // "Tell me about a time your judgement and the client's wishes did not
    // agree" cannot be answered with "I attended a CPD seminar on it", and a
    // criterion propped up entirely by CPD and Part 3 lectures is one of the
    // easiest places for a viva to go wrong.
    const fromWork = solid.filter((e) => e.projectId !== null || e.projectHint !== null)
    const cpdOnly = solid.length > 0 && fromWork.length === 0

    const verdict: Verdict =
      cpdOnly ? 'thin'
      : fromWork.length >= 2 ? 'answerable'
      : matches.length > 0 ? 'exposed'
      : 'thin'

    return {
      id: `criterion-${criterion.id}`,
      question: CRITERION_QUESTIONS[criterion.id as CriterionId],
      because: matches.length === 0
        ? `Nothing in your record is tagged ${criterion.id}. It is examinable anyway — all five ` +
          'are — so this gets asked and you answer it from memory or not at all.'
        : cpdOnly
          ? `Everything tagged ${criterion.id} is CPD or a Part 3 lecture — no project work at ` +
            'all. That is knowledge, and the question above asks for experience. It is a very ' +
            'common way to be caught out, because the sheet looks covered.'
          : fromWork.length >= 2
            ? `${matches.length} entries against ${criterion.id}, ${fromWork.length} of them ` +
              'specific project work you did yourself.'
            : `Your record claims ${criterion.id} on ${matches.length} ` +
              `${matches.length === 1 ? 'entry' : 'entries'}, but none of them is both specific and ` +
              'work you did rather than watched. The tag invites the question; the entries do not answer it.',
      looksFor: CRITERION_LOOKS_FOR[criterion.id as CriterionId],
      criterion: criterion.id as CriterionId,
      stage: null,
      source: matches.length === 0 ? 'absent' : 'claimed',
      verdict,
      evidence: {
        quote: best?.activity ?? null,
        date: best?.date ?? null,
        supporting: fromWork.length,
      },
      fix: verdict === 'answerable'
        ? null
        : matches.length === 0
          ? `Nothing tagged ${criterion.id} at all. ${CRITERION_FIX[criterion.id as CriterionId]}`
          : cpdOnly
            ? `You have the theory for ${criterion.id}. Now get it on a job: ` +
              CRITERION_FIX[criterion.id as CriterionId].toLowerCase()
            : `Go back over the entries tagged ${criterion.id} and make one of them specific — what ` +
              'exactly, on which job, and what you decided. Or get the experience: ' +
              CRITERION_FIX[criterion.id as CriterionId].toLowerCase(),
    }
  })
}

/**
 * Work stages. A stage with hours but no participation is the classic trap:
 * the sheet says you were there, and you were — in the corner, watching.
 */
function fromStages(entries: Entry[]): ExamQuestion[] {
  const out: ExamQuestion[] = []

  for (const stage of RIBA_STAGES) {
    const atStage = entries.filter((e) => e.stage === stage.id)

    // Nothing at all at this stage. It is still on the syllabus, so it still
    // gets asked — you would simply be answering it from a lecture. Thin
    // rather than exposed: a gap you can name is defensible, and pretending
    // otherwise would make every early record look like a disaster.
    if (atStage.length === 0) {
      out.push({
        id: `stage-${stage.id}`,
        question: STAGE_QUESTIONS[stage.id as StageId],
        because: `Nothing on your sheet at Stage ${stage.code} — ${stage.name.toLowerCase()}. ` +
          'Every stage is examinable whether or not you have been near it, so this gets asked and ' +
          'you answer it from what you have read rather than what you have done.',
        looksFor: STAGE_LOOKS_FOR[stage.id as StageId],
        criterion: null,
        stage: stage.id as StageId,
        source: 'absent',
        verdict: 'thin',
        evidence: { quote: null, date: null, supporting: 0 },
        fix: `Ask to be put on something at Stage ${stage.code}. At month eight that is one ` +
          'conversation with your team leader; at month twenty it is very hard to arrange.',
      })
      continue
    }

    const minutes = atStage.reduce((sum, e) => sum + e.minutes, 0)
    const participant = atStage.filter((e) => e.participation === 'participant')
    const participantMinutes = participant.reduce((sum, e) => sum + e.minutes, 0)
    const specific = participant.filter((e) => isSpecificActivity(e.activity))

    // Under a day at a stage is a line on a form, not experience.
    const token = minutes < 8 * 60
    const allWatched = participantMinutes === 0
    if (!token && !allWatched && specific.length >= 2) continue

    out.push({
      id: `stage-${stage.id}`,
      question: STAGE_QUESTIONS[stage.id as StageId],
      because: allWatched
        ? `${formatDuration(minutes)} at Stage ${stage.code}, every minute of it observed. Your ` +
          'sheet says you were there. It does not say you did anything, and that is the exact ' +
          'distinction the question above is testing.'
        : token
          ? `${formatDuration(minutes)} at Stage ${stage.code}. It is on your sheet, so it is ` +
            'fair game, and there is not much behind it.'
          : `${formatDuration(minutes)} at Stage ${stage.code}, but nothing specific enough that ` +
            'you could take a follow-up question on it.',
      looksFor: STAGE_LOOKS_FOR[stage.id as StageId],
      criterion: null,
      stage: stage.id as StageId,
      source: allWatched ? 'observed' : 'token',
      verdict: allWatched ? 'exposed' : 'thin',
      evidence: {
        quote: (specific[0] ?? participant[0] ?? atStage[0])?.activity ?? null,
        date: atStage[atStage.length - 1]?.date ?? null,
        supporting: specific.length,
      },
      fix: allWatched
        ? `Ask to run one thing at Stage ${stage.code} yourself, however small. One hour ` +
          'participating answers this question; forty hours watching does not.'
        : `Log the next thing you do at Stage ${stage.code} in enough detail to be asked about — ` +
          'what it was, what you decided, who it went to.',
    })
  }

  return out
}

/**
 * The project they will open on. Whichever one has the most hours is the one
 * an examiner reads first, and a case study almost always comes from it.
 */
function fromProjects(entries: Entry[], projects: Project[]): ExamQuestion[] {
  const minutesByProject = new Map<string, number>()
  for (const entry of entries) {
    if (!entry.projectId) continue
    minutesByProject.set(entry.projectId, (minutesByProject.get(entry.projectId) ?? 0) + entry.minutes)
  }
  const topId = [...minutesByProject.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const project = projects.find((p) => p.id === topId)
  if (!project) return []

  const mine = entries.filter((e) => e.projectId === project.id)
  const stages = [...new Set(mine.map((e) => e.stage).filter((s): s is StageId => s !== null))]
  const label = [project.code, project.name].filter(Boolean).join(' ')
  const out: ExamQuestion[] = []

  out.push({
    id: 'project-procurement',
    question: `Talk me through ${label}. How was it procured, and why that route?`,
    because: `Your biggest project — ${formatDuration(minutesByProject.get(project.id) ?? 0)} ` +
      `across ${stages.length} ${stages.length === 1 ? 'stage' : 'stages'}. It is the first thing ` +
      'an examiner reads and the most likely source of your case study.',
    looksFor: [
      'The route by name, and who carries the design risk under it',
      'Why it was chosen for this client and this programme — not a textbook definition',
      'What it meant for your day-to-day: who you sent information to, and when',
      'One thing it made harder',
    ],
    criterion: 'PC5' as CriterionId,
    stage: null,
    source: 'project',
    verdict: project.procurement ? 'answerable' : 'thin',
    evidence: {
      quote: project.procurement
        ? `${project.procurement}${project.contractForm ? ` · ${project.contractForm}` : ''}`
        : null,
      date: null,
      supporting: mine.length,
    },
    fix: project.procurement
      ? null
      : `Your record does not say how ${label} was procured. Find out this week — ask whoever ` +
        'runs the job. You will be asked, and "I am not sure" on your own biggest project is the ' +
        'worst ninety seconds of the exam.',
  })

  if (project.contractForm) {
    out.push({
      id: 'project-contract',
      question: `Under ${project.contractForm}, who is responsible if something on site does not ` +
        'match the drawings — and what do you actually do about it?',
      because: `${label} runs on ${project.contractForm}, and it is on your sheet. Contract ` +
        'questions are the ones candidates most often answer from a lecture rather than a job.',
      looksFor: [
        'The mechanism by name, and which clause family it sits in',
        'Who issues what, and to whom',
        'What you personally saw of it happening',
        'The commercial consequence — time, money, or both',
      ],
      criterion: 'PC5' as CriterionId,
      stage: null,
      source: 'contract',
      verdict: mine.some((e) => e.stage === 5 && e.participation === 'participant')
        ? 'answerable'
        : 'thin',
      evidence: { quote: project.contractForm, date: null, supporting: mine.length },
      fix: mine.some((e) => e.stage === 5 && e.participation === 'participant')
        ? null
        : 'You have the contract on your sheet but no construction-stage work you did yourself. ' +
          'Ask to be taken to a site meeting on this job and to write up the notes.',
    })
  }

  return out
}

/**
 * The same empty line, over and over. Fourteen weeks of "worked on drawings"
 * is not fourteen weeks of evidence; it is one question you cannot answer,
 * fourteen times.
 */
function fromVagueness(entries: Entry[]): ExamQuestion[] {
  const counts = new Map<string, { count: number; entry: Entry }>()
  for (const entry of entries) {
    if (isSpecificActivity(entry.activity)) continue
    // "Annual leave" thirteen times is not a vague record, it is thirteen
    // weeks off recorded correctly. Nobody is asked to elaborate on a holiday.
    if (!countsAsExperience(entry)) continue
    const key = normaliseActivity(entry.activity)
    if (!key) continue
    const found = counts.get(key)
    if (found) found.count++
    else counts.set(key, { count: 1, entry })
  }

  const worst = [...counts.values()].sort((a, b) => b.count - a.count)[0]
  if (!worst || worst.count < 3) return []

  return [{
    id: 'vague-repeat',
    question: `You have written "${worst.entry.activity}" ${worst.count} times. Pick one of those ` +
      'weeks. What were you actually doing, and what did you decide?',
    because: `${worst.count} entries say the same thing and none of them says anything. An ` +
      'examiner does not skip these — they are the easiest place to find out whether the record ' +
      'was written at the time or reconstructed afterwards.',
    looksFor: [
      'A specific week, a specific drawing or document, a specific job',
      'A decision you made, and what you weighed',
      'Who it went to and what came back',
    ],
    criterion: null,
    stage: worst.entry.stage,
    source: 'vague',
    verdict: 'exposed',
    evidence: { quote: worst.entry.activity, date: worst.entry.date, supporting: 0 },
    fix: `Go back through those ${worst.count} entries and make three of them specific. You will ` +
      'remember more than you expect, and it is the difference between a record and a timesheet.',
  }]
}

/**
 * Who you dealt with. A record where everyone named works at your practice
 * describes somebody who has not yet been let out of the building.
 */
function fromPeople(entries: Entry[], projectById: Map<string, Project>): ExamQuestion[] {
  const named = new Set(entries.flatMap((e) => e.people.map((p) => p.trim())).filter(Boolean))
  if (named.size === 0) {
    return [{
      id: 'people-none',
      question: 'Who have you dealt with outside your own office, and on what?',
      because: 'Your record names nobody. Who you deal with is the clearest evidence of the level ' +
        'you were operating at, and its absence reads as somebody who was kept indoors.',
      looksFor: [
        'A client, a contractor, a consultant or a statutory officer, by role',
        'What the exchange was actually about',
        'Where you disagreed, and how it resolved',
      ],
      criterion: 'PC2' as CriterionId,
      stage: null,
      source: 'people',
      verdict: 'exposed',
      evidence: { quote: null, date: null, supporting: 0 },
      fix: 'Start naming people in your entries — client, contractor, engineer, building control. ' +
        'It takes four words and it is 10 points a week.',
    }]
  }

  // External is a proxy, not a fact: somebody described as "the QS" or with an
  // affiliation is external, everyone else is assumed to be a colleague.
  const externalHints = /\b(client|contractor|qs|quantity surveyor|engineer|building control|planner|consultant|from )\b/i
  const external = entries.filter((e) =>
    e.people.length > 0 && (externalHints.test(e.activity) || externalHints.test(e.detail ?? '')),
  )

  const hasContractors = entries.some((e) => /contractor|site|valuation|tender/i.test(e.activity))
  return [{
    id: 'people-external',
    question: 'Tell me about a disagreement with somebody outside your practice, and how it ended.',
    because: `You name ${named.size} people across the record. What an examiner wants is not the ` +
      'names but the friction — where you had to hold a position with a client or a contractor.',
    looksFor: [
      'The other party and what they wanted',
      'What you thought and why',
      'What you conceded, and what you did not',
      'What it taught you about where an architect’s authority actually sits',
    ],
    criterion: 'PC2' as CriterionId,
    stage: null,
    source: 'people',
    verdict: external.length >= 2 && hasContractors ? 'answerable' : 'thin',
    evidence: {
      quote: external[external.length - 1]?.activity ?? null,
      date: external[external.length - 1]?.date ?? null,
      supporting: external.length,
    },
    fix: external.length >= 2 && hasContractors
      ? null
      : 'Almost everyone you name looks like a colleague. Ask to sit in on — better, to run — one ' +
        'exchange with a client or the contractor, and write down what was disputed.',
  }]
}

// ---------------------------------------------------------------------------
// The question bank
//
// One opening question per criterion and per stage, written the way an examiner
// asks rather than the way the criteria are worded. "Demonstrates an
// understanding of the legal context" is not a question anybody has ever been
// asked out loud.
// ---------------------------------------------------------------------------

const CRITERION_QUESTIONS: Record<CriterionId, string> = {
  PC1: 'Tell me about a time your professional judgement and what somebody wanted from you did not agree.',
  PC2: 'How did you find out what your client actually needed, as opposed to what they asked for?',
  PC3: 'Walk me through getting something through planning or building control. What went wrong?',
  PC4: 'How does your practice decide whether to take a job on, and what happens if it goes over?',
  PC5: 'Describe how one of your projects was procured, and what that meant for who carried the risk.',
}

const CRITERION_LOOKS_FOR: Record<CriterionId, string[]> = {
  PC1: [
    'A real conflict — a client wanting something you thought was wrong, or a shortcut you refused',
    'Which part of the ARB Code or your own judgement you were leaning on',
    'What you actually did, including who you escalated to',
  ],
  PC2: [
    'The brief as given, and how it changed',
    'A specific question you asked that changed the answer',
    'How you kept them informed when something slipped',
  ],
  PC3: [
    'The application, the officer, the objection or the condition',
    'What the legislation actually required, in your own words',
    'What you would do earlier next time',
  ],
  PC4: [
    'Fee, resource and risk — how the practice weighs them',
    'What you saw of a job going over, and who noticed first',
    'Your own place in the office structure and who signs what',
  ],
  PC5: [
    'The route by name and who carries design risk under it',
    'How information flowed, and what that did to your programme',
    'A variation, an instruction or a valuation you were near',
  ],
}

const CRITERION_FIX: Record<CriterionId, string> = {
  PC1: 'Ask to be in the room the next time a fee or a scope disagreement is being had.',
  PC2: 'Volunteer to write the next set of client meeting notes, and to send them yourself.',
  PC3: 'Ask to own the next building regulations or planning submission end to end.',
  PC4: 'Ask whoever runs your team to walk you through a fee proposal and a resourcing sheet.',
  PC5: 'Ask to be taken to a valuation or a site progress meeting, and to write it up.',
}

const STAGE_QUESTIONS: Record<StageId, string> = {
  0: 'How was it decided that building anything was the right answer on that project?',
  1: 'What was in the brief when you got it, and what was missing?',
  2: 'Talk me through an option you tested and rejected at concept, and why.',
  3: 'Where did the design and the engineering disagree, and how was it resolved?',
  4: 'Take me through a detail you drew. Why is it built that way and not another way?',
  5: 'Describe something that came out of the ground differently from the drawing.',
  6: 'What actually happens at practical completion, and what did you see of it?',
  7: 'What have you learned from a building in use that changed how you would design one?',
}

const STAGE_LOOKS_FOR: Record<StageId, string[]> = {
  0: ['The business case or the need', 'Who the decision-makers were', 'What the alternatives to building were'],
  1: ['Site constraints and the survey information', 'How the budget was arrived at', 'What you added to the brief'],
  2: ['Two options and the reason one lost', 'The client conversation that settled it', 'What it cost to test'],
  3: ['A specific clash and how it was found', 'Who you coordinated with and how', 'What changed as a result'],
  4: ['Performance, buildability and cost, in your own words', 'The standard or the manufacturer you relied on', 'What the contractor said about it'],
  5: ['The instruction, RFI or technical query by name', 'What you inspected and what you recorded', 'The time or cost consequence'],
  6: ['Defects, handover information, the O&M', 'Who signs what and when', 'What was still outstanding'],
  7: ['What you went back and looked at', 'A measurable difference between intent and performance', 'What you would draw differently'],
}

export { CRITERION_QUESTIONS, STAGE_QUESTIONS }
