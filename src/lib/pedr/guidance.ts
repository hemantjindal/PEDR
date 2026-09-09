/**
 * The guidance layer.
 *
 * Written for someone on day one who has been told to "do their PEDRs" and has
 * no idea what that means. The research is clear that the people who most need
 * the official guidance are the ones who have not read the PDF, so the guidance
 * lives in the product, next to the thing it is about.
 *
 * Everything here is editorial, not regulatory. Where a number comes from the
 * rules it is pulled from constants.ts rather than retyped, so guidance cannot
 * drift away from the engine.
 */

import { PEDR_SYSTEM, REQUIREMENTS, SHEET_RULES } from './constants'

export interface GlossaryEntry {
  term: string
  short: string
  full: string
  /** Other terms worth reading straight after this one. */
  see?: string[]
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'PEDR',
    short: 'Professional Experience and Development Record',
    full:
      'RIBA’s record of the practical experience you need before you can sit Part 3. ' +
      `You need ${REQUIREMENTS.minTotalMonths} months of it, recorded across ` +
      `${SHEET_RULES.requiredSheets} quarterly sheets. It lives at ${PEDR_SYSTEM.shortUrl}. This tool ` +
      'feeds that system; it does not replace it.',
    see: ['Record sheet', 'PSA', 'Employment Mentor'],
  },
  {
    term: 'Record sheet',
    short: 'One quarter of your record',
    full:
      `A single sheet covers up to ${SHEET_RULES.maxPeriodMonths} months. It has to be ` +
      `completed within ${SHEET_RULES.submitWithinMonths} months of the end of that period, ` +
      'then signed by your mentor and your PSA. Eight of them add up to the two years you need.',
    see: ['PEDR', 'Late sheet'],
  },
  {
    term: 'Employment Mentor',
    short: 'The architect in your practice who signs your sheets',
    full:
      'Someone in your office with detailed knowledge of your work, who supervises you directly. ' +
      'They discuss each quarter with you, comment, and sign. They do not have to be the person ' +
      'who formally employs you, but they do have to actually know what you have been doing.',
    see: ['PSA', 'Direct supervision'],
  },
  {
    term: 'PSA',
    short: 'Professional Studies Advisor',
    full:
      'An advisor at a school of architecture who reviews your sheets every quarter and gives ' +
      'final approval after your mentor. Their job is to judge the breadth, scope and adequacy ' +
      'of your experience — not just that you turned up. They are the person who will tell ' +
      'you your record is thin, and the earlier they say it the better.',
    see: ['Employment Mentor', 'Record sheet'],
  },
  {
    term: 'Direct supervision',
    short: 'Your supervisor is responsible for your work',
    full:
      'The person supervising you has responsibility for and control over the work you do. ' +
      'It is the test that decides which category your experience falls into, and therefore ' +
      'whether it counts in full.',
    see: ['Category i'],
  },
  {
    term: 'Category i',
    short: 'The category most UK experience falls into',
    full:
      'Practice in the UK, EEA, Channel Islands or Isle of Man, under the direct supervision ' +
      'of an architect registered with ARB or registered in that territory. Category ii is the ' +
      'same thing anywhere else in the world. Category iii is other construction-industry ' +
      'experience without an architect supervising, and only limited amounts are accepted.',
    see: ['Direct supervision'],
  },
  {
    term: 'RIBA Plan of Work',
    short: 'Stages 0 to 7, from strategy to building in use',
    full:
      'The industry framework for the stages of a project. Your hours get recorded against ' +
      'these stages, and the PSA is looking for breadth across them. If you have never been ' +
      'near Stage 5, that is a hole in your record however good the rest of it is.',
    see: ['Professional Criteria'],
  },
  {
    term: 'Professional Criteria',
    short: 'PC1 to PC5, what Part 3 assesses you against',
    full:
      'ARB’s five criteria at Part 3: Professionalism, Clients and delivery of services, ' +
      'Legal framework and processes, Practice and management, and Building procurement. ' +
      'Use them as the frame for your reflection — it is what stops a PEDR being a diary.',
    see: ['RIBA Plan of Work'],
  },
  {
    term: 'Office Management',
    short: 'The section people forget exists',
    full:
      'A separate part of the sheet for non-project time: CPD, Part 3 lectures, office training, ' +
      'mentoring, marketing and bids, practice management, IT, and holiday. A lot of perfectly ' +
      'good PC4 evidence lives here and gets thrown away because people only log project work.',
    see: ['Professional Criteria'],
  },
  {
    term: 'Late sheet',
    short: `A sheet finished more than ${SHEET_RULES.submitWithinMonths} months after its period ended`,
    full:
      'Two things follow. Your PSA can no longer give you useful feedback on experience that ' +
      'is now half a year old. And a pattern of late sheets reads as poor time management at ' +
      'the exam, where it is a number someone can count.',
    see: ['Record sheet'],
  },
  {
    term: 'RES',
    short: 'Reflective Experience Summary',
    full:
      'The summary you write at the end of the whole qualifying period. It has to show breadth ' +
      'across the work stages, development over time, and specific examples against the criteria. ' +
      '"Development over time" is the one you cannot fake later — it has to be in the record ' +
      'as you go.',
    see: ['Professional Criteria'],
  },
  {
    term: 'Case study',
    short: 'The project you write up for the Part 3 exam',
    full:
      'A project you have followed in enough depth to write about and be questioned on, usually ' +
      'wanted at RIBA Stage 4 or 5 by the time you enrol on a Part 3 course. Flag yours early ' +
      'so its record is deeper than the rest.',
  },
]

export interface OnboardingStep {
  id: string
  title: string
  why: string
  actions: string[]
  /** Roughly how long this takes, so it does not look like a mountain. */
  minutes: number
}

/**
 * The first hour. Deliberately short, and ordered so the thing that unblocks
 * everything else comes first.
 */
export const ONBOARDING: OnboardingStep[] = [
  {
    id: 'account',
    title: 'Get your PEDR account and your PSA',
    why:
      'This is the actual record. Everything here feeds it. If you are not registered on ' +
      `${PEDR_SYSTEM.shortUrl} with a PSA attached, nothing you write anywhere counts yet.`,
    actions: [
      `Register at ${PEDR_SYSTEM.shortUrl} if you have not already. ${PEDR_SYSTEM.movedNote}`,
      'Find out who your PSA is. If you do not have one, your school allocates them — ask now, not next quarter.',
      'Ask your practice who your Employment Mentor is, and check they are willing.',
    ],
    minutes: 20,
  },
  {
    id: 'employment',
    title: 'Record where you work and who supervises you',
    why:
      'Category and location decide whether your experience counts in full. Getting this wrong ' +
      'for a year is expensive to unpick.',
    actions: [
      'Add your employer, your start date and your contracted hours.',
      'Add your supervising architect and their registration body and number.',
      'Set the category — for most UK practice under an ARB-registered architect, that is Category i.',
    ],
    minutes: 5,
  },
  {
    id: 'projects',
    title: 'List the projects you are actually on',
    why:
      'Naming a project is worth points on every week you log, and it is what lets the parser ' +
      'file a dump correctly. Add the shorthand you actually say out loud, not just the formal name.',
    actions: [
      'Add each live project with the code or nickname the office uses.',
      'Add aliases — "Battersea", "BSQ" and "1042" might all be one job.',
      'Mark the one most likely to become your Part 3 case study.',
    ],
    minutes: 10,
  },
  {
    id: 'timesheets',
    title: 'Pull your practice timesheets, if you have them',
    why:
      'The sheet wants hours against work stages. Reconstructed from memory those numbers are ' +
      'fiction and everyone knows it. If your practice logs hours by project and phase, that is ' +
      'contemporaneous evidence already sitting in a system — and your mentor can sign it honestly.',
    actions: [
      'Export your hours by project and phase for as far back as it goes.',
      'Paste or upload the export into Dump. It will come out as dated entries.',
    ],
    minutes: 15,
  },
  {
    id: 'habit',
    title: 'Set up the weekly nudge',
    why:
      'This is the whole difference between a comfortable Part 3 and a miserable one. Everyone ' +
      'who got through it easily kept a diary; almost nobody manages it, because the tool is ' +
      'never where you are when the thing happens.',
    actions: [
      'Subscribe to the calendar feed so a reminder lands on your phone every Friday.',
      'Do one dump now, for this week, however rough. Rough is fine — it gets cleaned up.',
    ],
    minutes: 5,
  },
]

export interface WritingGuide {
  promptId: string
  heading: string
  aim: string
  /** Roughly how much to write. Examiners want less than people think. */
  words: [number, number]
  weak: string
  strong: string
  whyBetter: string
}

/**
 * What good looks like, per reflective box.
 *
 * The examples are the important part. "Be more reflective" is useless advice;
 * two paragraphs side by side is not.
 */
export const WRITING_GUIDE: WritingGuide[] = [
  {
    promptId: 'did',
    heading: 'What did you actually do?',
    aim:
      'Specific tasks, on named projects, at named stages. Bullet points are fine here — ' +
      'preferred, in fact. This is the only box where description is the point.',
    words: [80, 200],
    weak: 'Worked on drawings and attended meetings for various projects.',
    strong:
      'Produced the Stage 4 balustrade details for Battersea (1042) and issued them for ' +
      'contractor comment. Chaired two design team meetings on the atrium roof build-up. ' +
      'Answered six technical queries from the main contractor on the curtain wall interface.',
    whyBetter:
      'Every clause names something an examiner could ask a follow-up question about. The weak ' +
      'version is true of every week of every year of everyone’s training, which makes it ' +
      'evidence of nothing.',
  },
  {
    promptId: 'learned',
    heading: 'What did you learn?',
    aim:
      'New knowledge or judgement, and how you know you have it. Write in the first person. ' +
      'Tie it to a criterion where you can — that is what stops this being a diary.',
    words: [60, 150],
    weak: 'I learned a lot about contract administration this quarter.',
    strong:
      'I had assumed the contract administrator could agree a change on the spot. Watching the ' +
      'valuation meeting, I understood that a variation only exists once it is instructed in ' +
      'writing, and that agreeing something verbally on site creates exposure rather than ' +
      'resolving it (PC5).',
    whyBetter:
      'It names what you believed before, what changed it, and what you now think. "I learned a ' +
      'lot" tells an examiner only that you were present.',
  },
  {
    promptId: 'wentWell',
    heading: 'What went well?',
    aim: 'What you would do the same way again, and why it worked. Keep it short.',
    words: [40, 120],
    weak: 'The tender package went out on time and the client was happy.',
    strong:
      'Setting up the drawing register before starting the tender package meant the issue sheet ' +
      'built itself. I will do that first on the next package rather than reconstructing it at ' +
      'the end under time pressure.',
    whyBetter:
      'It identifies the decision that caused the good outcome, which is transferable. An ' +
      'outcome on its own is luck as far as an examiner can tell.',
  },
  {
    promptId: 'wentWrong',
    heading: 'What went wrong?',
    aim:
      'The box that carries the most weight and that people leave blank. Friction, mistakes, ' +
      'things that surprised you, moments you were out of your depth. Nobody is marking you down ' +
      'for a mistake you can explain — they are marking you down for having nothing to say.',
    words: [60, 150],
    weak: 'Nothing significant went wrong.',
    strong:
      'I issued the stair details against a superseded structural grid because I did not check ' +
      'the engineer’s revision before starting. It cost half a day to reissue and the ' +
      'contractor had already priced the wrong version. I now check the incoming revision ' +
      'register before opening a file, and I flagged it to my mentor rather than quietly fixing it.',
    whyBetter:
      'It states the error, the consequence, the cause and the change in behaviour — including ' +
      'the professional judgement about disclosing it, which is PC1 evidence you would not get ' +
      'from a smooth week.',
  },
  {
    promptId: 'next',
    heading: 'What next?',
    aim:
      'What you still need exposure to, and who you have to ask for it. This is where the PSA ' +
      'sees whether you are steering your own training.',
    words: [40, 120],
    weak: 'Continue to develop my experience across the RIBA work stages.',
    strong:
      'I have nothing at Stage 5 or 6 and no contract administration at all. I have asked my ' +
      'team leader to put me on the Nine Elms fit-out when it starts on site in November, and ' +
      'to sit in on the next set of valuations in the meantime.',
    whyBetter:
      'It names the actual gap, the actual project, and the actual person asked. The weak version ' +
      'is a sentence that could be pasted into all eight sheets, and often is.',
  },
]

export interface FaqEntry {
  q: string
  a: string
}

export const FAQ: FaqEntry[] = [
  {
    q: 'I have not logged anything for six months. Is it too late?',
    a:
      'No, and this is the most common situation there is. Write the sheets anyway — a late ' +
      'sheet still counts as experience, it just loses you the PSA’s feedback and looks ' +
      'untidy. Start with your practice timesheets if you have them, then work backwards a ' +
      'quarter at a time. Log this week first, so the hole stops growing while you dig.',
  },
  {
    q: 'How much detail is right?',
    a:
      `Less than you think. Examiners are explicit that less is more, with around ` +
      `${SHEET_RULES.targetPages} pages as a target for a sheet. Bullet points for tasks, prose ` +
      'for reflection, and no rambling — poor spelling and unclear writing get in the way of ' +
      'someone understanding your experience, and that is what they are marking.',
  },
  {
    q: 'Does holiday count?',
    a:
      'It gets recorded under Office Management, but it is absence, not experience. This tool ' +
      'records it and leaves it out of your experience totals.',
  },
  {
    q: 'Do I have to record hours against stages?',
    a:
      'Yes, and it is the part people fabricate. If your practice runs timesheets, export them ' +
      'and import them here — the numbers are then contemporaneous and your mentor can sign ' +
      'them honestly. Where this tool estimates a duration it marks it as estimated.',
  },
  {
    q: 'My mentor has had my sheet for a month. What do I do?',
    a:
      'Chase, politely and in writing. Your PSA aims to turn a sheet around in about ' +
      `${SHEET_RULES.psaTargetDays} days once it reaches them, but nothing chases your mentor for ` +
      'you, and waits of three months are common. This tool shows you how long a sheet has been ' +
      'sitting with each person so you have a fact to point at.',
  },
  {
    q: 'What if my job is very narrow?',
    a:
      'That is the single biggest risk in a large practice, and finding out at month 22 is a ' +
      'crisis where finding out at month 6 is a conversation. Watch the coverage view. If Stage 5, ' +
      'Stage 6 or PC5 are empty, ask to be put on something on site while there is still time.',
  },
  {
    q: 'Is this tool the official record?',
    a:
      `No. The official record is RIBA’s system at ${PEDR_SYSTEM.shortUrl}, and your PSA and mentor sign ` +
      'there. This is the diary that makes filling that in take twenty minutes instead of a ' +
      'weekend, plus the exports to paste across.',
  },
]

/** The one thing to say to someone who has just arrived and looks overwhelmed. */
export const FIRST_MESSAGE =
  'Log this week. Badly is fine — three lines about what you did and one about what ' +
  'annoyed you. Everything else here works off that, and nothing else matters until it exists.'
