/**
 * Seed a demo account with a realistic, imperfect record.
 *
 * Deliberately imperfect: gaps, thin weeks, uneven stage coverage and nothing
 * at all against one criterion — because a demo where everything is green
 * shows you none of the things this tool is for.
 *
 * Run:  npm run seed
 */

import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, migrate, schema, sqlClient } from '../src/lib/db/client'
import { hashPassword } from '../src/lib/auth'
import { addDays, addMonths, todayKey, weekStartKey, weekIdOf, weekRange } from '../src/lib/pedr/week'

const EMAIL = 'demo@pedr.local'
const PASSWORD = 'demo-password-2026'

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

async function main() {
  await migrate()

  const existing = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL)).limit(1)
  if (existing[0]) {
    // Start clean, so re-running the seed is idempotent.
    await db.delete(schema.users).where(eq(schema.users.id, existing[0].id))
  }

  const today = todayKey()
  const start = addMonths(today, -16)
  const userId = randomUUID()

  await db.insert(schema.users).values({
    id: userId,
    email: EMAIL,
    name: 'Alex Demo',
    passwordHash: await hashPassword(PASSWORD),
    teamsName: 'Alex Demo',
    calendarToken: 'demo-calendar-token',
    experienceStart: start,
    targetExamDate: addMonths(today, 14),
    createdAt: new Date().toISOString(),
  })

  await db.insert(schema.employments).values({
    id: randomUUID(),
    userId,
    employer: 'Fielden Clegg Rowe',
    officeLocation: 'London',
    location: 'UK',
    category: 'i',
    role: 'Architectural Assistant Part 2',
    supervisorName: 'Helen Marchetti',
    supervisorRegBody: 'ARB',
    supervisorRegNumber: '084112B',
    mentorName: 'Helen Marchetti',
    mentorEmail: 'helen@example.test',
    startDate: start,
    endDate: null,
    weeklyHours: 375,
    createdAt: new Date().toISOString(),
  })

  const projectIds: string[] = []
  for (const project of PROJECTS) {
    const id = randomUUID()
    projectIds.push(id)
    await db.insert(schema.projects).values({
      id, userId, ...project, notes: null, archived: false,
      createdAt: new Date().toISOString(),
    })
  }

  const weeks = weekRange(weekIdOf(start), weekIdOf(today))
  const entries: (typeof schema.entries.$inferInsert)[] = []
  const notes: (typeof schema.weekNotes.$inferInsert)[] = []
  const stamp = new Date().toISOString()

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
      const office = 'office' in template ? (template.office as string) : null
      const isFriction = !thin && (index + i) % 5 === 0

      entries.push({
        id: randomUUID(),
        userId,
        dumpId: null,
        date,
        minutes: office === 'leave' ? 450 : [120, 180, 240, 450][(index + i) % 4],
        minutesEstimated: (index + i) % 13 === 0,
        // Observer hours that thin out over the two years: the shape a record
        // is supposed to have, and the one the coverage page is built to show.
        participation: observed(index, i, weeks.length) ? 'observer' : 'participant',
        projectId: template.p === null ? null : projectIds[template.p],
        projectHint: null,
        stage: template.s,
        officeCategory: office,
        activity: thin ? 'worked on drawings' : template.a,
        detail: null,
        people: thin ? [] : pick(PEOPLE, index * 13 + i),
        criteria: thin ? [] : template.c,
        wentWrong: isFriction ? pick(FRICTION, index * 17 + i) : null,
        learned: isFriction && index % 3 === 0 ? pick(LEARNED, index * 5) : null,
        confidence: 100,
        source: index % 6 === 0 ? 'timesheet' : 'dump',
        verified: index % 17 !== 4,
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

  for (let i = 0; i < entries.length; i += 50) {
    await db.insert(schema.entries).values(entries.slice(i, i + 50))
  }
  for (let i = 0; i < notes.length; i += 50) {
    await db.insert(schema.weekNotes).values(notes.slice(i, i + 50))
  }

  console.log(`Seeded ${EMAIL} / ${PASSWORD}`)
  console.log(`  ${weeks.length} weeks spanned, ${entries.length} entries, ${notes.length} week notes`)
  console.log(`  experience starts ${start}`)
}

main().then(
  async () => { sqlClient.close(); process.exit(0) },
  (error) => { console.error(error); process.exit(1) },
)
