import { PARTICIPATION_IDS } from './pedr/constants'
import type { Employment, Entry, Project, WeekNote } from './pedr/types'
import type {
  CriterionId, ExperienceCategory, ExperienceLocation, OfficeCategoryId,
  ParticipationId, StageId,
} from './pedr/constants'
import { addDays, addMonths, weekIdOf, weekRange, weekStartKey, type DateKey } from './pedr/week'

/**
 * A demo record, generated rather than stored.
 *
 * One function, used by two things that must not disagree: `npm run seed`,
 * which writes it into the database, and the standalone demo page, which
 * bundles it and runs the same domain code over it in a browser. A demo built
 * from its own separate fixture drifts into being a flattering mock-up of the
 * app, which is worse than no demo.
 *
 * Deliberately imperfect: gaps, thin weeks, uneven stage coverage, nothing at
 * all against one criterion, and observer hours that thin out over two years.
 * A demo where everything is green shows you none of the things this is for.
 */

const PROJECTS = [
  {
    code: '1042', name: 'Battersea Square Phase 2', client: 'BSQ Developments',
    sector: 'Residential', valueGbp: 48_000_000, procurement: 'Two stage design and build',
    contractForm: 'JCT D&B 2016', aliases: ['BSQ', 'Battersea'], isCaseStudy: true,
  },
  {
    code: '1088', name: 'Nine Elms Fit-Out', client: 'Argent Estates',
    sector: 'Commercial', valueGbp: 6_500_000, procurement: 'Traditional',
    contractForm: 'JCT SBC/Q 2016', aliases: ['Nine Elms', 'NEF'], isCaseStudy: false,
  },
  {
    code: '1103', name: 'Hackney Depot Refurbishment', client: 'LB Hackney',
    sector: 'Public', valueGbp: 2_100_000, procurement: 'Framework',
    contractForm: 'JCT IC 2016', aliases: ['Hackney', 'Depot'], isCaseStudy: false,
  },
]

/** Templates weighted toward the stages a concept-heavy team actually sees. */
const WORK = [
  { a: 'Worked up the Stage 3 planning submission drawings', s: 3, c: ['PC3'], p: 0 },
  { a: 'Coordinated the structural grid with the engineer against the architectural setting out', s: 3, c: ['PC2'], p: 0 },
  { a: 'Produced the balustrade and handrail details for the tender package', s: 4, c: ['PC5'], p: 0 },
  { a: 'Updated the NBS specification for the external envelope', s: 4, c: ['PC5'], p: 0 },
  { a: 'Marked up contractor shop drawings for the curtain wall head condition', s: 4, c: ['PC5'], p: 1 },
  { a: 'Chaired the design team meeting on the atrium roof build-up', s: 3, c: ['PC2', 'PC4'], p: 0 },
  { a: 'Drafted the fee proposal for the additional survey work', s: 1, c: ['PC2'], p: 2 },
  { a: 'Prepared the concept massing options for the client presentation', s: 2, c: ['PC2'], p: 2 },
  { a: 'Answered a technical query from the main contractor on the soffit detail', s: 5, c: ['PC5'], p: 1 },
  { a: 'Attended the site progress meeting and wrote up the inspection notes', s: 5, c: ['PC5', 'PC3'], p: 1 },
  { a: 'Submitted the building regulations application to building control', s: 4, c: ['PC3'], p: 2 },
  { a: 'Reviewed the CDM pre-construction information with the principal designer', s: 1, c: ['PC3'], p: 0 },
  { a: 'Sat in on the valuation meeting with the quantity surveyor', s: 5, c: ['PC5'], p: 1 },
  { a: 'Updated the drawing register and issued the revision sheet', s: 4, c: ['PC4'], p: 0 },
  { a: 'Ran the team resourcing review for the next two months', s: null, c: ['PC4'], p: null, office: 'strategy' },
  { a: 'CPD seminar on the Building Safety Act gateways', s: null, c: ['PC3', 'PC1'], p: null, office: 'cpd' },
  { a: 'Part 3 lecture on professional indemnity and duty of care', s: null, c: ['PC1'], p: null, office: 'part3' },
  { a: 'Annual leave', s: null, c: [], p: null, office: 'leave' },
]

const PEOPLE = [
  ['Tom Reilly'], ['Sarah Chen'], ['Priya Nair'], ['Tom Reilly', 'Sarah Chen'],
  ['James Okafor'], ['Sarah Chen', 'Priya Nair'], [],
]

const FRICTION = [
  'Issued the details against a superseded structural grid because I did not check the incoming revision first. Half a day to reissue and the contractor had already priced the old version.',
  'I assumed the contract administrator could agree a variation on the spot. Watching it happen, I understood a variation only exists once it is instructed in writing.',
  'Completely out of my depth in the fire strategy discussion. I could not follow the compartmentation argument and had to ask afterwards.',
  'The QS pushed back hard on my cost assumptions for the facade and was right to.',
  'Missed the drainage connection detail on the site walk entirely. Had to go back the following week.',
  'Sent the client a drawing set without the revision cloud. Small thing, but it made the comparison meeting much harder than it needed to be.',
  'Underestimated how long the planning drawings would take by about two days and had to ask for help.',
]

const LEARNED = [
  'A tender package is not finished when the drawings are; it is finished when the schedule of works agrees with them.',
  'Now understand why the drawing register has to be built before the package, not reconstructed at the end.',
  'First time chairing a design team meeting on my own.',
  'Learned that building control will accept a performance-based fire strategy but wants the assumptions written down.',
]

/**
 * Whether this entry was watched rather than done.
 *
 * Front-loaded on purpose: a real record starts with a lot of sitting in on
 * things and ends with almost none, and demo data that does not show that
 * would make the whole participation view look broken.
 */
function observed(index: number, i: number, total: number): boolean {
  const through = total > 1 ? index / (total - 1) : 1
  // Roughly 45% of entries observed at the start, under 5% by the end.
  const share = 0.45 * (1 - through) ** 1.6 + 0.03
  return ((index * 7 + i * 3) % 100) / 100 < share
}

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(Math.floor(Math.sin(seed) * 10_000)) % list.length]
}

export const DEMO_EMAIL = 'demo@pedr.local'
export const DEMO_PASSWORD = 'demo-password-2026'
export const DEMO_NAME = 'Alex Demo'

export interface DemoRecord {
  today: DateKey
  experienceStart: DateKey
  targetExamDate: DateKey
  name: string
  employment: Employment
  projects: Project[]
  entries: Entry[]
  notes: WeekNote[]
}

export interface DemoOptions {
  today: DateKey
  userId?: string
  /** Ids have to be stable in the browser build so the page can be cached. */
  id?: (prefix: string, index: number) => string
}

export function buildDemoRecord(opts: DemoOptions): DemoRecord {
  const { today } = opts
  const userId = opts.userId ?? 'demo-user'
  const makeId = opts.id ?? ((prefix, index) => `${prefix}-${index}`)
  const stamp = `${today}T09:00:00.000Z`
  const start = addMonths(today, -16)

  const employment: Employment = {
    id: makeId('emp', 0),
    userId,
    employer: 'Fielden Clegg Rowe',
    officeLocation: 'London',
    location: 'UK' as ExperienceLocation,
    category: 'i' as ExperienceCategory,
    role: 'Architectural Assistant Part 2',
    supervisorName: 'Helen Marchetti',
    supervisorRegBody: 'ARB',
    supervisorRegNumber: '084112B',
    mentorName: 'Helen Marchetti',
    mentorEmail: 'helen@example.test',
    startDate: start,
    endDate: null,
    weeklyHours: 375,
    createdAt: stamp,
  }

  const projects: Project[] = PROJECTS.map((project, index) => ({
    id: makeId('prj', index),
    userId,
    code: project.code,
    name: project.name,
    client: project.client,
    sector: project.sector,
    valueGbp: project.valueGbp,
    procurement: project.procurement,
    contractForm: project.contractForm,
    isCaseStudy: project.isCaseStudy,
    notes: null,
    aliases: [...project.aliases],
    archived: false,
    createdAt: stamp,
  }))

  const weeks = weekRange(weekIdOf(start), weekIdOf(today))
  const entries: Entry[] = []
  const notes: WeekNote[] = []
  let n = 0

  weeks.forEach((weekId, index) => {
    // A deliberate hole: eight weeks with nothing, the way it really goes.
    if (index >= 22 && index < 30) return
    // And a scattering of single missed weeks.
    if (index % 11 === 7) return

    const thin = index % 9 === 3
    const monday = weekStartKey(weekId)
    const perWeek = thin ? 1 : 3 + (index % 3)

    for (let i = 0; i < perWeek; i++) {
      const template = pick(WORK, index * 31 + i * 7)
      const date = addDays(monday, i % 5)
      // The current week is only part-served; writing Thursday's entry on a
      // Tuesday makes "last logged" sit in the future.
      if (date > today) continue
      const office = ('office' in template ? template.office : null) as OfficeCategoryId | null
      const isFriction = !thin && (index + i) % 5 === 0

      entries.push({
        id: makeId('ent', n++),
        userId,
        dumpId: null,
        date,
        minutes: office === 'leave' ? 450 : [120, 180, 240, 450][(index + i) % 4],
        minutesEstimated: (index + i) % 13 === 0,
        participation: (observed(index, i, weeks.length)
          ? PARTICIPATION_IDS[1]
          : PARTICIPATION_IDS[0]) as ParticipationId,
        projectId: template.p === null ? null : projects[template.p].id,
        projectHint: null,
        stage: template.s as StageId | null,
        officeCategory: office,
        activity: thin ? 'worked on drawings' : template.a,
        detail: null,
        people: thin ? [] : pick(PEOPLE, index * 13 + i),
        criteria: (thin ? [] : template.c) as CriterionId[],
        wentWrong: isFriction ? pick(FRICTION, index * 17 + i) : null,
        learned: isFriction && index % 3 === 0 ? pick(LEARNED, index * 5) : null,
        confidence: 1,
        source: index % 6 === 0 ? 'timesheet' : 'dump',
        verified: index % 17 !== 4,
        externalId: null,
        provenance: `seed week ${index}`,
        createdAt: stamp,
        updatedAt: stamp,
      })
    }

    if (index % 4 === 0 && !thin) {
      notes.push({
        userId,
        weekId,
        did: 'Tender package coordination and two design team meetings.',
        learned: pick(LEARNED, index),
        wentWell: 'Setting up the drawing register before starting the package meant the issue sheet built itself.',
        wentWrong: pick(FRICTION, index * 3),
        next: 'I have nothing at Stage 6. Asked to be put on the Nine Elms handover when it completes.',
        updatedAt: stamp,
      })
    }
  })

  return {
    today,
    experienceStart: start,
    targetExamDate: addMonths(today, 14),
    name: DEMO_NAME,
    employment,
    projects,
    entries,
    notes,
  }
}
