/**
 * The single source of truth for everything PEDR-shaped.
 *
 * Regulatory values live here and nowhere else, because they change and
 * because you should be able to check every one of them in one sitting.
 * Each rule carries a `source` and an `asOf`. The app surfaces `asOf` in the
 * UI so nobody quietly trusts a number that went stale.
 *
 * VERIFY BEFORE YOU RELY ON THIS. These were assembled from RIBA/ARB guidance
 * in September 2026. They are a good default, not legal advice, and the RIBA
 * PEDR system is the authoritative record — this tool feeds it, it does not
 * replace it.
 */

// ---------------------------------------------------------------------------
// RIBA Plan of Work 2020 — work stages
// ---------------------------------------------------------------------------

export const RIBA_STAGES = [
  {
    id: 0,
    code: '0',
    name: 'Strategic Definition',
    short: 'Strategic',
    blurb: 'Business case, strategic brief, site options, feasibility at the client-strategy level.',
    keywords: [
      'strategic definition', 'business case', 'strategic brief', 'client brief workshop',
      'feasibility study', 'site search', 'options appraisal', 'stage 0',
    ],
  },
  {
    id: 1,
    code: '1',
    name: 'Preparation and Briefing',
    short: 'Briefing',
    blurb: 'Project brief, site surveys, project budget, programme, assembling the team.',
    keywords: [
      'preparation and brief', 'project brief', 'briefing', 'site survey', 'measured survey',
      'site appraisal', 'feasibility', 'pre-application', 'pre-app', 'project execution plan',
      'consultant appointment', 'fee proposal', 'stage 1',
    ],
  },
  {
    id: 2,
    code: '2',
    name: 'Concept Design',
    short: 'Concept',
    blurb: 'Architectural concept, outline proposals, initial cost plan, design options.',
    keywords: [
      'concept design', 'concept', 'sketch design', 'massing', 'design option', 'options study',
      'outline proposal', 'design review', 'sketch scheme', 'stage 2',
    ],
  },
  {
    id: 3,
    code: '3',
    name: 'Spatial Coordination',
    short: 'Spatial Coord.',
    blurb: 'Coordinating the design, testing it against the brief, planning application.',
    keywords: [
      'spatial coordination', 'developed design', 'design development', 'coordination',
      'planning application', 'planning submission', 'planning consultant', 'validated',
      'clash detection', 'coordination model', 'stage 3',
    ],
  },
  {
    id: 4,
    code: '4',
    name: 'Technical Design',
    short: 'Technical',
    blurb: 'Technical design, specification, building regs, tender documentation.',
    keywords: [
      'technical design', 'production information', 'construction drawings', 'detail design',
      'details', 'specification', 'nbs', 'building regulations', 'building regs', 'building control',
      'tender documentation', 'tender package', 'tender issue', 'schedule of works',
      'subcontractor design', 'stage 4',
    ],
  },
  {
    id: 5,
    code: '5',
    name: 'Manufacturing and Construction',
    short: 'Construction',
    blurb: 'On site. Site inspections, RFIs, instructions, valuations, contract administration.',
    keywords: [
      'manufacturing and construction', 'construction', 'on site', 'site visit', 'site inspection',
      'site meeting', 'progress meeting', 'rfi', 'request for information', 'technical query', 'tq',
      'architect’s instruction', "architect's instruction", 'contract instruction',
      'interim certificate', 'valuation', 'payment notice', 'snagging', 'mock-up', 'benchmark',
      'shop drawing', 'contractor proposal', 'stage 5',
    ],
  },
  {
    id: 6,
    code: '6',
    name: 'Handover',
    short: 'Handover',
    blurb: 'Practical completion, handover, aftercare, defects, final certificate.',
    keywords: [
      'handover', 'practical completion', 'pc certificate', 'making good', 'defects',
      'rectification period', 'o&m manual', 'health and safety file', 'as-built',
      'final certificate', 'final account', 'stage 6',
    ],
  },
  {
    id: 7,
    code: '7',
    name: 'Use',
    short: 'Use',
    blurb: 'Building in use. Post-occupancy evaluation, aftercare, feedback.',
    keywords: [
      'in use', 'post occupancy', 'post-occupancy', 'poe', 'aftercare', 'building performance',
      'feedback', 'soft landings', 'stage 7',
    ],
  },
] as const

export type StageId = (typeof RIBA_STAGES)[number]['id']
export const STAGE_IDS: StageId[] = RIBA_STAGES.map((s) => s.id)

export function stage(id: number) {
  return RIBA_STAGES.find((s) => s.id === id)
}

// ---------------------------------------------------------------------------
// ARB Criteria at Part 3 — the Professional Criteria, PC1–PC5.
// These are what the Part 3 examiners assess you against, and what the
// reflective sections of a PEDR sheet should evidence.
// Source: ARB, Prescription of qualifications: ARB Criteria at Part 3.
// ---------------------------------------------------------------------------

export const PROFESSIONAL_CRITERIA = [
  {
    id: 'PC1',
    name: 'Professionalism',
    blurb:
      'Ethics, integrity, impartiality and reliability. Codes of conduct, regulation, ' +
      'institutional membership, conflicts of interest, professional judgement.',
    plainly: 'How you behave as a professional.',
    keywords: [
      'code of conduct', 'ethics', 'ethical', 'conflict of interest', 'arb', 'riba',
      'professional indemnity', 'pii', 'integrity', 'impartial', 'whistleblow',
      'anti-bribery', 'gdpr', 'data protection', 'cpd', 'continuing professional development',
      'duty of care', 'complaint', 'disciplinary', 'equality', 'edi', 'safeguarding',
    ],
  },
  {
    id: 'PC2',
    name: 'Clients, users and delivery of services',
    blurb:
      'The services architects offer and delivering them well: client needs, briefing, ' +
      'communication, programming, coordination, working singly and in a team.',
    plainly: 'How you deal with clients and actually deliver.',
    keywords: [
      'client meeting', 'client', 'brief', 'briefing', 'appointment', 'scope of services',
      'fee', 'fee proposal', 'fee bid', 'schedule of services', 'programme', 'presentation',
      'stakeholder', 'end user', 'user group', 'consultation', 'workshop', 'design team meeting',
      'dtm', 'coordination', 'report to client', 'client report', 'sign off', 'sign-off',
    ],
  },
  {
    id: 'PC3',
    name: 'Legal framework and processes',
    blurb:
      'The statutory and legal context: planning, building regulations, health and safety, ' +
      'construction law, land law, party walls, contract law.',
    plainly: 'How you deal with the authorities and the law.',
    keywords: [
      'planning', 'planning permission', 'planning condition', 'listed building', 'conservation',
      'appeal', 'section 106', 's106', 'cil', 'building regulations', 'building regs',
      'building control', 'approved document', 'building safety act', 'gateway',
      'golden thread', 'principal designer', 'cdm', 'health and safety', 'fire strategy',
      'party wall', 'rights of light', 'easement', 'boundary', 'lease', 'licence',
      'statutory', 'legislation', 'case law', 'adjudication', 'dispute',
    ],
  },
  {
    id: 'PC4',
    name: 'Practice and management',
    blurb:
      'Running a practice and a team: business structures, resourcing, finance, quality ' +
      'management, risk, staff, marketing, office systems.',
    plainly: 'How you deal with the people who work with and for you.',
    keywords: [
      'resourcing', 'resource', 'workload', 'staffing', 'appraisal', 'line manage',
      'delegat', 'mentoring', 'quality management', 'qa', 'iso 9001', 'office standard',
      'bim execution plan', 'bep', 'template', 'business plan', 'marketing', 'bid',
      'invoice', 'cash flow', 'profit', 'timesheet', 'insurance', 'risk register',
      'practice meeting', 'recruitment', 'interview', 'onboarding',
    ],
  },
  {
    id: 'PC5',
    name: 'Building procurement',
    blurb:
      'How buildings get bought and built: procurement routes, tendering, building contracts, ' +
      'contract administration, cost control, the roles of the parties.',
    plainly: 'How you deal with the people who build the building.',
    keywords: [
      'procurement', 'procurement route', 'traditional', 'design and build', 'd&b',
      'construction management', 'management contracting', 'two stage', 'tender',
      'tender return', 'tender analysis', 'contractor', 'subcontractor', 'jct', 'nec',
      'contract administration', 'contract administrator', 'employer’s requirements',
      "employer's requirements", 'contractor proposals', 'novation', 'collateral warranty',
      'bond', 'retention', 'valuation', 'interim certificate', 'payment notice',
      'variation', 'extension of time', 'eot', 'loss and expense', 'liquidated damages',
      'practical completion', 'final account', 'cost plan', 'quantity surveyor', 'qs',
      'value engineering', 've',
    ],
  },
] as const

export type CriterionId = (typeof PROFESSIONAL_CRITERIA)[number]['id']
export const CRITERION_IDS: CriterionId[] = PROFESSIONAL_CRITERIA.map((c) => c.id)

export function criterion(id: string) {
  return PROFESSIONAL_CRITERIA.find((c) => c.id === id)
}

// ---------------------------------------------------------------------------
// Categories of experience.
// The PEDR system classifies each period of experience i / ii / iii, and the
// category governs how much of it counts. Category labels were formerly A–K.
// Source: RIBA PEDR guidance / PSA guide, as at 2026-09.
// ---------------------------------------------------------------------------

export const EXPERIENCE_CATEGORIES = [
  {
    id: 'i',
    name: 'Category i',
    blurb:
      'Architectural practice in the UK, EEA, Channel Islands or Isle of Man, under the ' +
      'direct supervision of an architect registered with ARB or registered in that territory.',
    countsFully: true,
  },
  {
    id: 'ii',
    name: 'Category ii',
    blurb:
      'Architectural practice anywhere else in the world, under the direct supervision of an ' +
      'architect registered in that territory.',
    countsFully: true,
  },
  {
    id: 'iii',
    name: 'Category iii',
    blurb:
      'Other relevant experience in the construction industry, not under the direct supervision ' +
      'of a registered architect. Accepted only in limited amounts — check with your PSA.',
    countsFully: false,
  },
] as const

export type ExperienceCategory = (typeof EXPERIENCE_CATEGORIES)[number]['id']

export const EXPERIENCE_LOCATIONS = [
  { id: 'UK', name: 'UK' },
  { id: 'EEA_CI_IOM', name: 'EEA / Channel Islands / Isle of Man' },
  { id: 'OVERSEAS', name: 'Overseas' },
] as const

export type ExperienceLocation = (typeof EXPERIENCE_LOCATIONS)[number]['id']

// ---------------------------------------------------------------------------
// The rules that decide whether you are allowed to sit Part 3.
// Every one of these is checked in progress.ts and shown on the dashboard.
// ---------------------------------------------------------------------------

export const OFFICE_MANAGEMENT_CATEGORIES = [
  {
    id: 'cpd',
    name: 'CPD',
    blurb: 'Structured and informal continuing professional development.',
    countsAsExperience: true,
    keywords: ['cpd', 'lunchtime talk', 'seminar', 'webinar', 'conference', 'lecture series'],
  },
  {
    id: 'part3',
    name: 'Part 3 course',
    blurb: 'Lectures, tutorials and coursework for your Part 3.',
    countsAsExperience: true,
    keywords: ['part 3', 'part iii', 'professional practice course', 'psa tutorial'],
  },
  {
    id: 'training',
    name: 'Office training',
    blurb: 'Software, standards, induction, health and safety training.',
    countsAsExperience: true,
    keywords: ['training', 'induction', 'onboarding', 'software training', 'revit training'],
  },
  {
    id: 'mentoring',
    name: 'Mentoring and supervision',
    blurb: 'Time with your mentor, appraisals, and mentoring others.',
    countsAsExperience: true,
    keywords: ['mentor', 'mentoring', 'appraisal', 'one to one', '1:1', 'review meeting'],
  },
  {
    id: 'marketing',
    name: 'Marketing and bids',
    blurb: 'Competitions, bids, fee proposals, portfolio and award submissions.',
    countsAsExperience: true,
    keywords: ['bid', 'competition', 'pitch', 'award submission', 'marketing', 'portfolio'],
  },
  {
    id: 'strategy',
    name: 'Practice management',
    blurb: 'Resourcing, quality systems, office standards, practice meetings.',
    countsAsExperience: true,
    keywords: ['practice meeting', 'resourcing', 'office standard', 'quality management', 'qa'],
  },
  {
    id: 'it',
    name: 'IT and office systems',
    blurb: 'Templates, BIM standards, document control, software setup.',
    countsAsExperience: true,
    keywords: ['bim standard', 'template', 'document control', 'file naming', 'it support'],
  },
  {
    id: 'admin',
    name: 'Admin',
    blurb: 'Timesheets, expenses, general office administration.',
    countsAsExperience: true,
    keywords: ['timesheet', 'expenses', 'admin'],
  },
  {
    id: 'leave',
    name: 'Holiday and absence',
    blurb: 'Annual leave, sickness, and other absence. Recorded, but not experience.',
    countsAsExperience: false,
    keywords: ['annual leave', 'holiday', 'off sick', 'sick leave', 'bank holiday', 'day off'],
  },
] as const

export type OfficeCategoryId = (typeof OFFICE_MANAGEMENT_CATEGORIES)[number]['id']

export function officeCategory(id: string) {
  return OFFICE_MANAGEMENT_CATEGORIES.find((c) => c.id === id)
}

/**
 * Sheet timing. These are the rules almost nobody knows, buried in guidance
 * PDFs, and they are the reason people end up with "late" on their record.
 *
 * A sheet covers at most three months and must be completed within two months
 * of the end of the period it covers. Your PSA then aims to sign within a
 * month. Miss the two-month window and the sheet is late: the PSA cannot give
 * you useful feedback, and a run of late sheets reads as poor time management
 * at the Part 3 exam.
 */
export const SHEET_RULES = {
  /** A record sheet covers up to this many months. */
  maxPeriodMonths: 3,
  /** Deadline for completing a sheet, counted from the end of its period. */
  submitWithinMonths: 2,
  /** What a PSA aims for once you submit. Used to decide when to chase. */
  psaTargetDays: 30,
  /** What a mentor realistically takes. Used to decide when to chase. */
  mentorTargetDays: 14,
  /** 24 months of experience at 3 months a sheet. */
  requiredSheets: 8,
  /** Examiners want around this many pages. Less is more. */
  targetPages: 6,
  source: 'RIBA PEDR student guidance; university PSA handbooks',
  asOf: '2026-09',
} as const

export const REQUIREMENTS = {
  /** Total practical experience needed before the Part 3 exam. */
  minTotalMonths: 24,
  /**
   * Of that total, this much must fall inside `recentWindowMonths` immediately
   * before the exam — the rule that catches people who logged everything years
   * ago and then stopped.
   */
  minRecentMonths: 12,
  recentWindowMonths: 24,
  /** A PEDR record sheet covers a quarter. */
  sheetPeriodWeeks: 13,
  /** What a full week of recorded experience is worth, for month conversion. */
  standardWeekHours: 35,
  /**
   * Months are counted as 4.345 weeks (52.18 / 12) so a run of logged weeks
   * converts to months the same way every time.
   */
  weeksPerMonth: 52.1775 / 12,
  source: 'RIBA PEDR student guidance; RIBA practical experience regulations',
  asOf: '2026-09',
} as const

// ---------------------------------------------------------------------------
// Participant or observer.
// ---------------------------------------------------------------------------

/**
 * The record sheet has two hour columns against every work stage, and most
 * people fill in one of them.
 *
 * Observer hours are real experience — being taught a detail you have never
 * drawn, sitting in on a valuation, watching a director handle a difficult
 * client. They count. What they are not is evidence that you can do the thing
 * yourself, and a PSA reading a record that is still mostly observer hours at
 * month twenty is reading a problem.
 *
 * The reverse is what everyone is looking for and almost nobody can show on
 * demand: the shift from watching to doing, over two years, stage by stage.
 * That is the "development over time" a Reflective Experience Summary has to
 * demonstrate, and it is invisible unless the two are recorded apart.
 */
export const PARTICIPATION = [
  {
    id: 'participant',
    name: 'Participant',
    short: 'Did it',
    blurb: 'You did the work.',
    plainly: 'You produced it, ran it, wrote it or issued it yourself.',
  },
  {
    id: 'observer',
    name: 'Observer',
    short: 'Watched',
    blurb: 'You watched, or were taught.',
    plainly:
      'Sitting in on a meeting you were not running, being shown how something is done, ' +
      'shadowing somebody. It counts, and it is worth recording honestly.',
  },
] as const

export type ParticipationId = (typeof PARTICIPATION)[number]['id']

export const PARTICIPATION_IDS = PARTICIPATION.map((p) => p.id)

export function participation(id: string): (typeof PARTICIPATION)[number] | undefined {
  return PARTICIPATION.find((p) => p.id === id)
}

/**
 * A record still mostly made of observer hours this late is worth flagging,
 * because it is a conversation with a team leader rather than a logging
 * problem — and one that gets much harder to have at month twenty-two.
 */
export const PARTICIPATION_RULES = {
  /** Above this share of observer hours, late on, something is wrong. */
  observerConcernShare: 0.4,
  /** The month from which that starts being worth saying out loud. */
  observerConcernFromMonth: 9,
  source: 'RIBA PEDR record sheet; PSA guidance',
  asOf: '2026-09',
} as const

// ---------------------------------------------------------------------------
// Where the official record actually lives.
// ---------------------------------------------------------------------------

/**
 * PEDR moved off pedr.co.uk and onto RIBA's own registration system. The old
 * address is the one every guide, every university handbook and every friend
 * who did this two years ago still says, so the move is worth stating rather
 * than silently linking past.
 *
 * One trap worth repeating: you have to sign in with the same email address
 * you used on the old system, or your existing sheets are not there.
 */
export const PEDR_SYSTEM = {
  name: 'RIBA PEDR',
  url: 'https://register.architecture.com/pedr',
  shortUrl: 'register.architecture.com/pedr',
  previousShortUrl: 'pedr.co.uk',
  movedNote:
    'PEDR has moved from pedr.co.uk to register.architecture.com/pedr. Sign in with the same ' +
    'email address you used on the old system or your existing sheets will not be there.',
  source: 'RIBA PEDR guidance',
  asOf: '2026-09',
} as const

// ---------------------------------------------------------------------------
// Scoring. A week is marked out of 100.
//
// The weighting is deliberate and it is the opinionated part of this tool:
// "went wrong" is worth more than anything except logging at all, because the
// reflective sections are what Part 3 examiners actually read, and a week where
// everything went smoothly gives you nothing to write in them. A week with no
// friction recorded caps at 80.
// ---------------------------------------------------------------------------

export const SCORING = {
  logged: { points: 40, label: 'Logged something', why: 'A week with no record is a week you cannot evidence.' },
  projects: { points: 15, label: 'Named a project', why: 'Sheets are assessed per project. Unattributed hours are hard to defend.' },
  activities: { points: 15, label: 'Two or more specific activities', why: '"Worked on drawings" is not evidence. What drawings, for what?' },
  people: { points: 10, label: 'Named who you dealt with', why: 'Who you dealt with is what shows the level you were operating at.' },
  wentWrong: { points: 20, label: 'Recorded friction or a mistake', why: 'The appraisal boxes are graded on reflection. Smooth weeks score badly.' },
} as const

export const SCORE_BANDS = [
  { min: 85, id: 'strong', label: 'Strong', blurb: 'Exam-ready. Reflection and detail both present.' },
  { min: 60, id: 'ok', label: 'Solid', blurb: 'Defensible, but thin on one dimension.' },
  { min: 1, id: 'thin', label: 'Thin', blurb: 'Logged, but an examiner would struggle to see what you did.' },
  { min: 0, id: 'missing', label: 'Missing', blurb: 'Nothing recorded.' },
] as const

export type ScoreBandId = (typeof SCORE_BANDS)[number]['id']

export function scoreBand(score: number) {
  return SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1]
}

/**
 * The five reflective boxes on a PEDR quarterly sheet.
 *
 * PEDR's own wording changes between revisions; these are the prompts this app
 * captures against and maps into whatever the live sheet asks for. Keeping our
 * own stable prompts means a year of dumps does not become worthless the next
 * time RIBA rewords a heading.
 */
export const REFLECTION_PROMPTS = [
  { id: 'did', label: 'What did you actually do?', hint: 'Specific tasks, on named projects, at named stages.' },
  { id: 'learned', label: 'What did you learn?', hint: 'New knowledge or skill — and how you know you have it.' },
  { id: 'wentWell', label: 'What went well?', hint: 'What you would do the same way again, and why it worked.' },
  { id: 'wentWrong', label: 'What went wrong?', hint: 'Friction, mistakes, things that surprised you. This is the box that scores.' },
  { id: 'next', label: 'What next?', hint: 'What you need exposure to, and who you have to ask for it.' },
] as const

export type ReflectionPromptId = (typeof REFLECTION_PROMPTS)[number]['id']
