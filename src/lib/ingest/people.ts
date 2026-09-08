/**
 * Pulling names out of a dump.
 *
 * Who you dealt with is what shows the level you were operating at — "issued
 * the RFI" and "issued the RFI to the contractor's PM after the client pushed
 * back" are different weeks. But a naive "capitalised word" rule produces
 * garbage: it happily reports that you met a Mr Building Control on Monday.
 *
 * So: names come from three places, in descending order of trust — people you
 * have named before, names introduced by a cue verb ("with Tom", "chased
 * Sarah"), and full Firstname Lastname pairs. Everything is filtered against a
 * list of things that look like names and are not.
 */

export interface PeopleResult {
  people: string[]
  organisations: string[]
  /** Role phrases like "the QS" — evidence of who, without a name. */
  roles: string[]
}

const CUES = [
  'with', 'from', 'to', 'for', 'met', 'meeting with', 'spoke to', 'spoke with', 'called',
  'emailed', 'e-mailed', 'phoned', 'rang', 'asked', 'chased', 'told', 'sent to', 'copied',
  'cc', 'cc\'d', 'briefed', 'sat with', 'shadowed', 'joined', 'and', 'alongside', 'under',
]

/** Tokens that make a capitalised phrase an organisation or a thing, not a person. */
const ORG_TOKENS = new Set([
  'ltd', 'limited', 'llp', 'plc', 'inc', 'group', 'partners', 'partnership', 'associates',
  'architects', 'architecture', 'engineers', 'engineering', 'consultants', 'consulting',
  'surveyors', 'construction', 'contractors', 'developments', 'properties', 'council',
  'borough', 'authority', 'control', 'regs', 'regulations', 'board', 'committee', 'panel',
  'team', 'department', 'office', 'studio', 'practice', 'services', 'solutions', 'design',
  'company', 'corporation', 'holdings', 'estates', 'homes', 'trust', 'university',
  'college', 'school', 'hospital', 'university', 'works', 'building', 'buildings',
])

/**
 * Capitalised phrases that read like names and are not. Mostly the vocabulary
 * of UK practice, which is full of Title Case Nouns.
 */
const NOT_PEOPLE = new Set([
  'building control', 'building regs', 'building regulations', 'building safety',
  'design team', 'design team meeting', 'practical completion', 'plan of work',
  'health and safety', 'party wall', 'final account', 'final certificate',
  'planning permission', 'planning committee', 'planning officer', 'contract administrator',
  'principal designer', 'principal contractor', 'employers requirements',
  'contractor proposals', 'value engineering', 'quantity surveyor', 'structural engineer',
  'services engineer', 'fire engineer', 'site meeting', 'progress meeting',
  'stage 0', 'stage 1', 'stage 2', 'stage 3', 'stage 4', 'stage 5', 'stage 6', 'stage 7',
  'good friday', 'bank holiday', 'new year', 'christmas eve', 'boxing day',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'north', 'south', 'east', 'west', 'ground floor', 'first floor', 'second floor',
  'the client', 'the contractor', 'the architect', 'the engineer', 'the team',
])

/**
 * Verbs that start a sentence and then capture the following capitalised word.
 * "Chased Priya" is a verb and a person, not a person called Chased.
 */
const LEADING_VERBS = new Set([
  ...['met', 'called', 'emailed', 'phoned', 'rang', 'asked', 'chased', 'told', 'briefed',
      'joined', 'shadowed', 'copied', 'issued', 'sent', 'drew', 'reviewed', 'attended',
      'spoke', 'checked', 'marked', 'updated', 'drafted', 'chaired', 'ran', 'worked',
      'submitted', 'prepared', 'coordinated', 'discussed', 'agreed', 'helped', 'visited',
      'produced', 'presented', 'started', 'finished', 'received', 'answered', 'raised'],
])

/** Single capitalised words that are never a person on their own. */
const NOT_FIRST_NAMES = new Set([
  'i', 'we', 'the', 'a', 'an', 'this', 'that', 'it', 'my', 'our', 'their', 'his', 'her',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'mon', 'tue', 'tues', 'wed', 'weds', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug',
  'sep', 'sept', 'oct', 'nov', 'dec',
  'stage', 'site', 'client', 'contractor', 'architect', 'engineer', 'planning', 'building',
  'design', 'tender', 'meeting', 'drawing', 'drawings', 'project', 'today', 'yesterday',
  'am', 'pm', 'rfi', 'rfis', 'ai', 'tq', 'dtm', 'qs', 'cdm', 'jct', 'nec', 'nbs', 'bim',
  'arb', 'riba', 'uk', 'london', 'zoom', 'teams', 'revit', 'autocad', 'rhino',
])

/** Role phrases worth capturing even when no name is attached. */
const ROLE_PATTERNS: Array<[RegExp, string]> = [
  [/\bthe\s+(?:client|client's\s+rep(?:resentative)?)\b/i, 'client'],
  [/\b(?:main\s+)?contractor(?:'s)?(?:\s+(?:PM|project\s+manager|site\s+manager|foreman))?\b/i, 'contractor'],
  [/\bsub[- ]?contractor\b/i, 'subcontractor'],
  [/\b(?:the\s+)?QS\b|\bquantity\s+surveyor\b|\bcost\s+consultant\b/i, 'quantity surveyor'],
  [/\bstructural\s+engineer\b|\bSE\b(?!\w)/i, 'structural engineer'],
  [/\b(?:M&E|MEP|services)\s+engineer\b|\bbuilding\s+services\b/i, 'services engineer'],
  [/\bfire\s+(?:engineer|consultant)\b/i, 'fire engineer'],
  [/\bplanning\s+(?:officer|consultant)\b/i, 'planning officer'],
  [/\bbuilding\s+control\b|\bapproved\s+inspector\b/i, 'building control'],
  [/\bprincipal\s+designer\b/i, 'principal designer'],
  [/\bproject\s+manager\b|\bthe\s+PM\b/i, 'project manager'],
  [/\bpartner\b|\bassociate\b|\bdirector\b/i, 'senior colleague'],
  [/\bmy\s+(?:line\s+)?manager\b|\bmy\s+mentor\b|\bsupervisor\b/i, 'supervisor'],
]

export function extractPeople(text: string, known: string[] = []): PeopleResult {
  const people = new Set<string>()
  const organisations = new Set<string>()
  const roles = new Set<string>()

  // 1. Names we have already been told about. Highest confidence, so first.
  for (const name of known) {
    if (!name.trim()) continue
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text)) people.add(name)
    else {
      // "Sarah Chen" known, text says "Sarah" — accept the first name alone.
      const first = name.split(/\s+/)[0]
      if (first.length > 2 && new RegExp(`\\b${escapeRegExp(first)}\\b`).test(text)) {
        people.add(name)
      }
    }
  }

  // 2. Names introduced by a cue.
  // The cue words are matched case-insensitively but the name capture is not:
  // an /i/ flag on the whole pattern would make [A-Z] match lowercase and turn
  // "with Tom and Sarah" into a person called "Tom and".
  const cueAlternation = CUES.flatMap((c) => [c, capitalise(c)]).map(escapeRegExp).join('|')
  const cuePattern = new RegExp(
    String.raw`\b(?:${cueAlternation})\s+((?:[A-Z][\w'’-]+)(?:\s+[A-Z][\w'’-]+)?)`,
    'g',
  )
  for (const m of text.matchAll(cuePattern)) {
    classify(m[1], people, organisations)
  }

  // 3. Bare Firstname Lastname pairs.
  const pairPattern = /\b([A-Z][a-z'’-]{1,})\s+([A-Z][a-z'’-]{1,})\b/g
  for (const m of text.matchAll(pairPattern)) {
    classify(`${m[1]} ${m[2]}`, people, organisations)
  }

  for (const [pattern, label] of ROLE_PATTERNS) {
    if (pattern.test(text)) roles.add(label)
  }

  return {
    people: dedupeNames([...people]),
    organisations: [...organisations],
    roles: [...roles],
  }
}

function classify(candidate: string, people: Set<string>, organisations: Set<string>) {
  const cleaned = candidate.trim().replace(/[.,;:]$/, '')
  if (!cleaned) return
  const lower = cleaned.toLowerCase()
  const tokens = lower.split(/\s+/)

  if (NOT_PEOPLE.has(lower)) return
  if (tokens.length > 1 && LEADING_VERBS.has(tokens[0])) {
    classify(cleaned.split(/\s+/).slice(1).join(' '), people, organisations)
    return
  }
  if (tokens.some((t) => ORG_TOKENS.has(t))) {
    organisations.add(cleaned)
    return
  }
  if (tokens.length === 1) {
    if (NOT_FIRST_NAMES.has(lower)) return
    if (cleaned.length < 3) return
    // A single capitalised word that is entirely upper case is an acronym.
    if (cleaned === cleaned.toUpperCase()) return
    people.add(cleaned)
    return
  }
  if (tokens.some((t) => NOT_FIRST_NAMES.has(t))) return
  people.add(cleaned)
}

/**
 * Collapse "Sarah" into "Sarah Chen" when both were found, so one person does
 * not appear twice in a record.
 */
function dedupeNames(names: string[]): string[] {
  const sorted = [...new Set(names)].sort((a, b) => b.length - a.length)
  const kept: string[] = []
  for (const name of sorted) {
    const isPrefixOfKept = kept.some((k) => {
      const kl = k.toLowerCase()
      const nl = name.toLowerCase()
      return kl === nl || kl.startsWith(`${nl} `) || kl.endsWith(` ${nl}`)
    })
    if (!isPrefixOfKept) kept.push(name)
  }
  return kept.sort((a, b) => a.localeCompare(b))
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
