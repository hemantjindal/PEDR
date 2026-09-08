import { PROFESSIONAL_CRITERIA, RIBA_STAGES, type CriterionId, type StageId } from '../pedr/constants'

/**
 * Inferring RIBA stage, Professional Criteria and reflection from raw text.
 *
 * This is keyword scoring, not magic. Longer keyword phrases score higher than
 * short ones because they are more specific — "practical completion" is worth
 * more than "completion". Where the winner does not clear the runner-up by
 * enough, the result comes back with low confidence and the UI asks rather
 * than guessing, because a wrongly stage-tagged year is worse than an untagged
 * one.
 */

export interface Classification {
  stage: StageId | null
  stageConfidence: number
  stageScores: Record<string, number>
  criteria: CriterionId[]
  criteriaScores: Record<string, number>
  wentWrong: string | null
  learned: string | null
}

/** Words that signal friction. The reflective sections are built from these. */
const FRICTION_TRIGGERS = [
  'went wrong', 'go wrong', 'mistake', 'mistakes', 'got it wrong', 'wrong revision',
  'wrong', 'error', 'missed', 'miss', 'forgot', 'overlooked', 'should have', 'should have done',
  'had to redo', 'redo', 'reissue', 'reissued', 'rework', 'late', 'delay', 'delayed',
  'behind', 'over budget', 'problem', 'issue with', 'struggled', 'stuck', 'confused',
  'unclear', 'misunderstood', 'misread', 'pushed back', 'rejected', 'refused', 'knocked back',
  'clash', 'clashed', 'disagreed', 'argument', 'escalated', 'complaint', 'chased',
  'fell through', 'did not work', "didn't work", 'not able to', "couldn't", 'could not',
  'blocked', 'awkward', 'difficult', 'tricky', 'painful', 'out of my depth', 'panicked',
  'embarrassing', 'told off', 'corrected me', 'picked up on',
]

const LEARNING_TRIGGERS = [
  'learned', 'learnt', 'realised', 'realized', 'now understand', 'now know', 'found out',
  'first time', 'never done', 'never had to', 'taught me', 'showed me', 'takeaway',
  'next time', 'in future', 'i will', 'i would', 'note to self', 'lesson',
  'understand why', 'makes sense now', 'clicked',
]

/** "nothing went wrong" is not friction. */
const NEGATIONS = ['nothing', 'no ', 'not ', 'never ', "didn't go", 'without any']

export function classify(text: string): Classification {
  const haystack = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `

  const stageScores: Record<string, number> = {}
  for (const s of RIBA_STAGES) {
    stageScores[String(s.id)] = scoreKeywords(haystack, s.keywords as readonly string[])
  }

  const criteriaScores: Record<string, number> = {}
  for (const c of PROFESSIONAL_CRITERIA) {
    criteriaScores[c.id] = scoreKeywords(haystack, c.keywords as readonly string[])
  }

  const stageRanked = rank(stageScores)
  const top = stageRanked[0]
  const runnerUp = stageRanked[1]

  let stage: StageId | null = null
  let stageConfidence = 0
  if (top && top.score > 0) {
    stage = Number(top.id) as StageId
    // Confident when the winner is clear; hedged when two stages tie, which
    // happens a lot — "tender" is Stage 4 documentation and Stage 5 procurement.
    const margin = top.score - (runnerUp?.score ?? 0)
    stageConfidence = clamp(0.45 + Math.min(top.score, 4) * 0.1 + Math.min(margin, 3) * 0.08)
  }

  const criteria = rank(criteriaScores)
    .filter((c) => c.score > 0)
    .slice(0, 3)
    .map((c) => c.id as CriterionId)

  return {
    stage,
    stageConfidence,
    stageScores,
    criteria,
    criteriaScores,
    wentWrong: findSentence(text, FRICTION_TRIGGERS),
    learned: findSentence(text, LEARNING_TRIGGERS),
  }
}

/**
 * Score a keyword set against text. A phrase is worth its word count, so a
 * three-word match beats three unrelated single-word matches.
 */
function scoreKeywords(haystack: string, keywords: readonly string[]): number {
  let score = 0
  for (const keyword of keywords) {
    const needle = keyword.toLowerCase()
    // Word-boundary match so "ai" does not fire inside "detail".
    const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`, 'i')
    if (pattern.test(haystack)) {
      score += needle.split(/\s+/).length
    }
  }
  return score
}

function rank(scores: Record<string, number>): Array<{ id: string; score: number }> {
  return Object.entries(scores)
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}

/**
 * Return the sentence containing the first trigger, rather than the whole
 * paragraph — the reflective boxes want the specific thing, not everything.
 */
function findSentence(text: string, triggers: string[]): string | null {
  const sentences = splitSentences(text)
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase()
    for (const trigger of triggers) {
      const idx = lower.indexOf(trigger)
      if (idx === -1) continue
      // Skip a negated match: "nothing went wrong" is not a thing that went wrong.
      const before = lower.slice(Math.max(0, idx - 24), idx)
      if (NEGATIONS.some((n) => before.includes(n))) continue
      return sentence.trim()
    }
  }
  return null
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function clamp(n: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, n))
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export { FRICTION_TRIGGERS, LEARNING_TRIGGERS }
