import Link from 'next/link'
import {
  EXPERIENCE_CATEGORIES, OFFICE_MANAGEMENT_CATEGORIES, PARTICIPATION, PARTICIPATION_RULES,
  PEDR_SYSTEM, PROFESSIONAL_CRITERIA, REQUIREMENTS, RIBA_STAGES, SHEET_RULES, SCORING,
} from '@/lib/pedr/constants'
import { WRITING_GUIDE } from '@/lib/pedr/guidance'
import { planSheetPeriods } from '@/lib/pedr/deadlines'
import { formatDate, todayKey } from '@/lib/pedr/week'

/**
 * The pages people actually search for.
 *
 * Nobody searches for a PEDR logging tool. They search, usually late at night
 * and usually in a mild panic, for "when is my pedr due", "what does a pedr
 * look like", "haven't done my pedr in a year". Those searches currently land
 * on a RIBA PDF, a 2016 forum thread, or nothing.
 *
 * Every number on these pages is pulled from constants.ts rather than typed
 * out, so a guide cannot quietly contradict the engine underneath it. The
 * writing is editorial; the facts are not.
 */

export interface GuideFaq {
  q: string
  /** Plain text — this is also emitted as FAQPage structured data. */
  a: string
}

export interface Guide {
  slug: string
  /** Roughly what somebody types into a search box. Shown on the index. */
  question: string
  /** The page heading. */
  title: string
  /** The <title>. Kept under 60 characters before the site suffix. */
  metaTitle: string
  /** The meta description. 110–158 characters, or search engines rewrite it. */
  description: string
  /** The answer, in one sentence, before any detail. */
  answer: string
  /** The numbers somebody came for, before any prose. */
  facts: Array<{ k: string; v: string }>
  /** Rendered as FAQPage structured data as well as on the page. */
  faq: GuideFaq[]
  /** Slugs of guides worth reading next. */
  related: string[]
  body: () => React.ReactNode
}

// ---------------------------------------------------------------------------
// Small shared pieces. Deliberately plain — these pages are read, not used.
// ---------------------------------------------------------------------------

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="stack">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Points({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="points">
      {items.map((item, i) => (
        <li key={i} className="small dim">{item}</li>
      ))}
    </ul>
  )
}

function Callout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="note note-pending">
      <span className="label">{label}</span>
      <span>{children}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------

export const GUIDES: Guide[] = [
  {
    slug: 'pedr-deadlines',
    question: 'When is my PEDR due?',
    title: 'When is your PEDR actually due?',
    metaTitle: 'When is your PEDR due? The two-month rule',
    description:
      `Each PEDR record sheet is due ${SHEET_RULES.submitWithinMonths} months after the quarter ` +
      'it covers ends — not at your Part 3 exam. The deadline almost everybody finds out about ' +
      'by missing it.',
    answer:
      `Two months after the end of the quarter it covers. There are ${SHEET_RULES.requiredSheets} ` +
      `sheets across ${REQUIREMENTS.minTotalMonths} months, so there are ` +
      `${SHEET_RULES.requiredSheets} of those deadlines, and the first one arrives about five ` +
      'months into your job.',
    facts: [
      { k: 'Deadline', v: `${SHEET_RULES.submitWithinMonths} months after the quarter ends` },
      { k: 'Sheets', v: `${SHEET_RULES.requiredSheets}` },
      { k: 'Covering', v: `${REQUIREMENTS.minTotalMonths} months` },
      { k: 'First one lands', v: 'Month 5' },
    ],
    faq: [
      {
        q: 'When is a PEDR record sheet due?',
        a:
          `Within ${SHEET_RULES.submitWithinMonths} months of the end of the period it covers. A ` +
          `sheet covers up to ${SHEET_RULES.maxPeriodMonths} months, so a sheet running January ` +
          'to March is due at the end of May.',
      },
      {
        q: 'What happens if my PEDR is late?',
        a:
          'The experience still counts — a late sheet is not void. What you lose is your ' +
          'Professional Studies Advisor’s feedback while it is still useful, and a run of late ' +
          'sheets is a countable fact about your time management that sits in front of an ' +
          'examiner. Nobody rejects you for it, and nobody chases you either.',
      },
      {
        q: 'How many PEDR sheets do I need?',
        a:
          `${SHEET_RULES.requiredSheets}. Each covers a quarter, and together they record the ` +
          `${REQUIREMENTS.minTotalMonths} months of practical experience required before Part 3. ` +
          `At least ${REQUIREMENTS.minRecentMonths} of those months must fall in the ` +
          `${REQUIREMENTS.recentWindowMonths} months immediately before the exam.`,
      },
    ],
    related: ['behind-on-your-pedr', 'who-signs-your-pedr'],
    body: () => {
      // A timetable for somebody starting at the beginning of this month. It
      // is an illustration, so it is anchored to today rather than to a year
      // that would quietly go stale.
      const today = todayKey()
      const start = `${today.slice(0, 8)}01`
      const periods = planSheetPeriods(start, { today: start, count: SHEET_RULES.requiredSheets })

      return (
        <>
          <Part title="There are two clocks, and people only watch the slow one">
            <p className="dim small">
              The clock everybody watches is the long one: {REQUIREMENTS.minTotalMonths} months of
              practical experience before you can sit Part 3, with at least{' '}
              {REQUIREMENTS.minRecentMonths} of them in the{' '}
              {REQUIREMENTS.recentWindowMonths} months immediately before the exam. That one is
              years away and feels like it can be dealt with later.
            </p>
            <p className="dim small">
              The clock that actually catches people is the short one. Each record sheet covers up
              to {SHEET_RULES.maxPeriodMonths} months, and it has to be{' '}
              <strong>completed within {SHEET_RULES.submitWithinMonths} months of the end of that
              period</strong>. Not by the exam. Not by the end of the year. Two months. Your first
              deadline lands about five months after you start work, which is normally before
              anybody has told you the rule exists.
            </p>
          </Part>

          <Part title={`Your ${SHEET_RULES.requiredSheets} deadlines`}>
            <p className="dim small">
              If you started at the beginning of this month, these are the dates. Periods run from
              the day your experience started, not from calendar quarters.
            </p>
            <div className="table-scroll">
              <table className="schedule schedule-wide">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Sheet</th>
                    <th>Period it covers</th>
                    <th>Completed by</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.index}>
                      <td className="num">{p.index}</td>
                      <td>
                        {formatDate(p.periodStart, { year: false })} – {formatDate(p.periodEnd)}
                      </td>
                      <td><strong>{formatDate(p.dueDate)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny faint">
              Then your Employment Mentor signs, and your Professional Studies Advisor approves —
              typically {SHEET_RULES.mentorTargetDays} and {SHEET_RULES.psaTargetDays} days
              respectively, and both of those sit <em>after</em> your deadline, not inside it.
            </p>
          </Part>

          <Part title="What actually happens when you miss it">
            <Points
              items={[
                <>
                  <strong>Nothing, immediately.</strong> No email, no flag, no penalty. This is the
                  problem: the deadline has no enforcement, so it has no weight, so it slides.
                </>,
                <>
                  <strong>The experience still counts.</strong> A late sheet is not a void sheet.
                  You do not lose the months. Write it anyway.
                </>,
                <>
                  <strong>You lose the feedback.</strong> Your PSA&rsquo;s job is to judge whether
                  your experience is broad enough — and to tell you while you can still do
                  something about it. Feedback on a quarter that ended eight months ago is a
                  post-mortem.
                </>,
                <>
                  <strong>It becomes a number.</strong> &ldquo;Six of my eight sheets were
                  submitted late&rdquo; is a fact anybody can count off your record, and it is a
                  fact about time management in a profession that is largely about managing time.
                </>,
              ]}
            />
          </Part>

          <Callout label="If you are already past it">
            Being months behind is the normal case, not the emergency. Read{' '}
            <Link href="/guides/behind-on-your-pedr">what to do when you are behind</Link>, or get
            a straight answer in about a minute with no account at{' '}
            <Link href="/behind">how bad is it</Link>.
          </Callout>
        </>
      )
    },
  },

  {
    slug: 'behind-on-your-pedr',
    question: 'I have not done my PEDR in a year. What now?',
    title: 'Behind on your PEDR',
    metaTitle: 'Behind on your PEDR? Start here',
    description:
      'Months of blank sheets is the normal case, not an emergency. What still counts, where the ' +
      'record already exists without you writing it, and the order to dig yourself out in.',
    answer:
      'Nothing is lost. The experience counts whether or not you wrote it down at the time, and ' +
      'most of what you did is already recorded — in your calendar, your practice timesheet and ' +
      'your sent mail. You are reconstructing a record, not inventing one.',
    facts: [
      { k: 'Late sheets still count', v: 'Yes' },
      { k: 'What you lose', v: 'PSA feedback' },
      { k: 'Where the record is', v: 'Calendar, timesheet' },
      { k: 'Do first', v: 'This week' },
    ],
    faq: [
      {
        q: 'Is it too late to do my PEDR?',
        a:
          'No. Late sheets still count as practical experience. What a late sheet costs you is ' +
          'your Professional Studies Advisor’s feedback while it is still useful, not the months ' +
          'themselves. Write the sheets, oldest deadline first, and log the current week today so ' +
          'the gap stops growing while you work backwards.',
      },
      {
        q: 'How do I remember what I did a year ago?',
        a:
          'You do not have to. Your Outlook or Google calendar has every meeting, site visit and ' +
          'client presentation with dates and attendees. Your practice timesheet has hours by ' +
          'project and phase. Your sent mail, the drawing issue register and your phone’s photo ' +
          'roll fill most of the rest. Reconstruct from those, and mark what you cannot reach as ' +
          'a gap rather than guessing.',
      },
      {
        q: 'Should I tell my mentor I am behind?',
        a:
          'Yes, and sooner is much better. A mentor signing four quarters at once is being asked ' +
          'to certify from memory, which is uncomfortable for them and obvious to a PSA. Telling ' +
          'them you are catching up and showing them what you have rebuilt is a normal ' +
          'conversation; a silent pile landing in month twenty-two is not.',
      },
    ],
    related: ['pedr-deadlines', 'pedr-entry-examples'],
    body: () => (
      <>
        <Part title="First, the honest bit">
          <p className="dim small">
            Almost nobody keeps a PEDR up to date. The people who tell you they did it every
            Friday are a small and unusually organised minority, and the rest of the profession
            sat down at some point and wrote a year of it in a weekend. You are not in unusual
            trouble. You are in the normal amount of trouble, which is recoverable.
          </p>
          <p className="dim small">
            The reason it slides is not laziness. It is that the record asks you to write about a
            week on the Friday of that week, and on Friday you are finishing something else. Then
            the gap gets big enough to be frightening, and a frightening task gets avoided, and
            avoidance makes it bigger. That loop is the whole problem.
          </p>
        </Part>

        <Part title="Most of it is already written down">
          <p className="dim small">
            This is the part people do not realise. You have been generating a contemporaneous
            record of your own work for the entire time you were not writing your PEDR:
          </p>
          <Points
            items={[
              <>
                <strong>Your calendar.</strong> Every design team meeting, site visit, client
                presentation and CPD talk, with the date, the length and who else was in the room.
                Attendee lists are the single best source of the names a PEDR entry wants.
              </>,
              <>
                <strong>Your practice timesheet.</strong> Hours against project and phase, which
                is very nearly the shape the record sheet asks for. If your office runs timesheets,
                this is contemporaneous evidence your mentor can sign honestly.
              </>,
              <>
                <strong>Your sent mail.</strong> What you issued, what you asked, what you were
                told — dated, in order, in your own words.
              </>,
              <>
                <strong>The drawing issue register.</strong> Exactly what you produced and exactly
                when it went out.
              </>,
              <>
                <strong>Your phone.</strong> Photos have dates and locations on them. A camera roll
                is a surprisingly precise site-visit log.
              </>,
            ]}
          />
          <Callout label="The rule">
            Recover, never invent. A reconstructed week built from a calendar and a timesheet is
            honest and your mentor can sign it. A plausible week you made up is a fabrication you
            will be questioned on at an oral exam by somebody who has read thousands of these.
          </Callout>
        </Part>

        <Part title="The order to do it in">
          <Points
            items={[
              <>
                <strong>Log this week first.</strong> Badly is fine. It takes four minutes and it
                stops the hole growing while you dig.
              </>,
              <>
                <strong>Pull the bulk sources before writing anything.</strong> Export your
                calendar and your timesheet for the whole missing period in one go. Reconstructing
                a quarter by hand and then discovering the calendar had it all is demoralising.
              </>,
              <>
                <strong>Work oldest deadline first.</strong> The sheet closest to being
                irretrievable is the one to finish, and finishing one sheet feels different from
                being &ldquo;a bit behind on everything&rdquo;.
              </>,
              <>
                <strong>Mark the weeks you genuinely cannot reach.</strong> A gap you have
                identified is a small honest note. A gap you papered over is a question you cannot
                answer later.
              </>,
              <>
                <strong>Then tell your mentor.</strong> With something to show, not as an apology.
              </>,
            ]}
          />
        </Part>

        <Part title="What the reflection boxes need, once the dates are back">
          <p className="dim small">
            Reconstructed facts are the easy half. The half that decides your sheet is what you
            write next to them, and the box that carries the most weight is the one people leave
            blank — {SCORING.wentWrong.points} points out of 100 in this tool&rsquo;s scoring,
            more than anything except logging at all. What went wrong, what surprised you, where
            you were out of your depth. A quarter in which nothing went wrong reads as a quarter
            in which you were not given anything difficult.
          </p>
          <div className="row-wrap">
            <Link href="/guides/pedr-entry-examples" className="btn">What a good entry looks like</Link>
            <Link href="/behind" className="btn btn-primary">How far behind am I, really?</Link>
          </div>
        </Part>
      </>
    ),
  },

  {
    slug: 'what-counts-as-pedr-experience',
    question: 'What counts as PEDR experience?',
    title: 'What counts as PEDR experience',
    metaTitle: 'What counts as PEDR experience?',
    description:
      'Categories i, ii and iii explained, what Office Management is for, why holiday is recorded ' +
      'but not counted, and the everyday work people throw away because they think it does not count.',
    answer:
      'Almost everything you are paid to do in an architect’s office counts, as long as somebody ' +
      'is properly supervising you. What decides how much it counts is the category — and most ' +
      'UK practice under an ARB-registered architect is Category i, which counts in full.',
    facts: [
      { k: 'Category i', v: 'Counts in full' },
      { k: 'Category iii', v: 'Limited amounts' },
      { k: 'CPD and bids', v: 'Count' },
      { k: 'Holiday', v: 'Recorded, not counted' },
    ],
    faq: [
      {
        q: 'What is Category i experience?',
        a:
          EXPERIENCE_CATEGORIES[0].blurb +
          ' It counts in full towards the ' + REQUIREMENTS.minTotalMonths +
          ' months you need before Part 3.',
      },
      {
        q: 'Does CPD count towards a PEDR?',
        a:
          'Yes. CPD, Part 3 lectures, office training, mentoring, bids and practice management are ' +
          'all recorded in the Office Management section of the record sheet and count as ' +
          'experience. It is also where a lot of good evidence for the practice and management ' +
          'criterion lives, which is why leaving the section blank is expensive.',
      },
      {
        q: 'Does holiday count towards a PEDR?',
        a:
          'No. Annual leave, sickness and other absence are recorded on the sheet under Office ' +
          'Management so the timeline adds up, but they are absence rather than experience and do ' +
          'not count towards the ' + REQUIREMENTS.minTotalMonths + ' months.',
      },
    ],
    related: ['pedr-hours-and-stages', 'pedr-professional-criteria'],
    body: () => (
      <>
        <Part title="The category decides everything">
          <p className="dim small">
            Before anything else, your experience is filed into one of three categories, and the
            test is who is supervising you — meaning who carries responsibility for and control
            over the work you do, not who signs your payslip.
          </p>
          <div className="table-scroll">
            <table className="schedule schedule-wide">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Category</th>
                  <th>What it is</th>
                  <th style={{ width: 130 }}>Counts</th>
                </tr>
              </thead>
              <tbody>
                {EXPERIENCE_CATEGORIES.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong></td>
                    <td className="small">{c.blurb}</td>
                    <td>
                      <span className={c.countsFully ? 'mark mark-signed' : 'mark mark-revision'}>
                        {c.countsFully ? 'In full' : 'Limited'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny faint">
            Getting this wrong for a year is expensive to unpick, so check it on day one rather
            than at the point of submitting. If you are unsure which category applies to a job —
            an overseas office, a contractor, a local authority, a stint at an engineer — that is
            a question for your Professional Studies Advisor, and it is a five-minute email.
          </p>
        </Part>

        <Part title="The section everybody forgets exists">
          <p className="dim small">
            The record sheet has a whole area for time that is not on a project, and it is
            routinely left empty by people who assume only drawing counts. It does not just count
            — it is often the only place your evidence for practice and management lives.
          </p>
          <div className="table-scroll">
            <table className="schedule schedule-wide">
              <thead>
                <tr>
                  <th style={{ width: 200 }}>Office Management</th>
                  <th>What goes in it</th>
                  <th style={{ width: 110 }}>Experience</th>
                </tr>
              </thead>
              <tbody>
                {OFFICE_MANAGEMENT_CATEGORIES.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong></td>
                    <td className="small">{c.blurb}</td>
                    <td>
                      <span className={c.countsAsExperience ? 'mark mark-signed' : 'mark mark-none'}>
                        {c.countsAsExperience ? 'Counts' : 'Recorded only'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Part>

        <Part title="Things people throw away because they assume they do not count">
          <Points
            items={[
              <>
                <strong>The bid you lost.</strong> Fee proposals, competitions and pitches are
                practice management evidence whether or not you won.
              </>,
              <>
                <strong>The meeting you only sat in on.</strong> Observing counts, and the sheet
                has a separate column for it. Watching a director handle a difficult client is
                exactly the sort of thing an examiner wants you to have seen.
              </>,
              <>
                <strong>Your Part 3 lectures.</strong> They go in Office Management.
              </>,
              <>
                <strong>Answering the contractor&rsquo;s emails.</strong> Six technical queries
                resolved is more concrete evidence than a week of drawing.
              </>,
              <>
                <strong>The thing that went wrong.</strong> Not only does it count, it is worth
                more than the work that went smoothly, because it is the only material the
                reflective sections can be written from.
              </>,
            ]}
          />
        </Part>

        <Callout label="Where this is recorded">
          The official record is {PEDR_SYSTEM.name}, at{' '}
          <a href={PEDR_SYSTEM.url} rel="noreferrer">{PEDR_SYSTEM.shortUrl}</a>.{' '}
          {PEDR_SYSTEM.movedNote}
        </Callout>
      </>
    ),
  },

  {
    slug: 'pedr-entry-examples',
    question: 'What does a good PEDR entry look like?',
    title: 'What a good PEDR entry looks like',
    metaTitle: 'PEDR entry examples: weak vs strong',
    description:
      'The weak version and the strong version of every reflective box on a PEDR record sheet, ' +
      'side by side, with why the second one survives a question and the first one does not.',
    answer:
      '“Be more reflective” is useless advice. A strong entry names something specific enough ' +
      'that somebody could ask you a follow-up question about it; a weak one is true of every ' +
      'week of everybody’s training, which makes it evidence of nothing.',
    facts: [
      { k: 'Whole sheet', v: `~${SHEET_RULES.targetPages} pages` },
      { k: 'What you did', v: 'Bullets' },
      { k: 'Reflection', v: 'Prose, short' },
      { k: 'The test', v: 'Could you be asked about it?' },
    ],
    faq: [
      {
        q: 'How much should I write in a PEDR?',
        a:
          `Less than most people think. Around ${SHEET_RULES.targetPages} pages is the target for ` +
          'a whole sheet. Bullet points for what you did, short prose for reflection. Unclear ' +
          'writing gets in the way of somebody understanding your experience, and understanding ' +
          'your experience is the thing being assessed.',
      },
      {
        q: 'What do I write in the “what went wrong” box?',
        a:
          'Something real. State the error or the friction, what it cost, why it happened, and ' +
          'what you do differently now. Nobody marks you down for a mistake you can explain — ' +
          'they mark you down for having nothing to say, because a quarter with no friction in it ' +
          'reads as a quarter where you were not trusted with anything difficult.',
      },
      {
        q: 'Can I copy the same text into every PEDR sheet?',
        a:
          'People do, and it is visible. A sentence like “continue to develop my experience across ' +
          'the work stages” can be pasted into all eight sheets, which is exactly why it carries no ' +
          'weight. Name the actual gap, the actual project and the actual person you asked.',
      },
    ],
    related: ['what-is-a-pedr', 'pedr-professional-criteria'],
    body: () => (
      <>
        <Part title="The five boxes">
          <p className="dim small">
            Every quarter you write against the same prompts. This is the only part of the sheet
            an examiner reads closely, and it is where a PEDR is won or lost. Aim for roughly{' '}
            {SHEET_RULES.targetPages} pages across the whole sheet — examiners are explicit that
            less is more.
          </p>
          <div className="stack">
            {WRITING_GUIDE.map((guide) => (
              <div className="sheet sheet-tight stack-s" key={guide.promptId}>
                <div className="row-wrap">
                  <h3>{guide.heading}</h3>
                  <span className="spacer" />
                  <span className="chip">{guide.words[0]}–{guide.words[1]} words</span>
                </div>
                <p className="tiny faint">{guide.aim}</p>
                <div className="grid grid-2">
                  <div className="stack-s">
                    <span className="mark mark-revision">what most people write</span>
                    <p className="small dim">{guide.weak}</p>
                  </div>
                  <div className="stack-s">
                    <span className="mark mark-signed">what gets you through</span>
                    <p className="small">{guide.strong}</p>
                  </div>
                </div>
                <p className="tiny faint">{guide.whyBetter}</p>
              </div>
            ))}
          </div>
        </Part>

        <Part title="The test to apply to your own writing">
          <p className="dim small">
            Read a sentence you have written and ask: could an examiner ask me a follow-up
            question about this? If the honest answer is no — because there is nothing in it to
            ask about — it is filler, however professional it sounds. Every clause in a strong
            entry gives somebody a handle: a named project, a named stage, a decision, a
            consequence, a change in what you do.
          </p>
          <p className="dim small">
            The corollary is uncomfortable and worth sitting with. A record made entirely of
            answerable claims takes you into an oral exam knowing what you will be asked. A record
            made of safe generalities takes you in with nothing to defend and nothing to say.
          </p>
          <div className="row-wrap">
            <Link href="/what-is-a-pedr" className="btn btn-primary">See a whole filled-in sheet</Link>
          </div>
        </Part>
      </>
    ),
  },

  {
    slug: 'who-signs-your-pedr',
    question: 'Who signs off my PEDR?',
    title: 'Who signs your PEDR, and how to get them to',
    metaTitle: 'Who signs your PEDR? Mentor and PSA',
    description:
      'Your Employment Mentor signs each sheet, then your Professional Studies Advisor approves ' +
      'it. Who they are, how long each realistically takes, and how to chase without being a pest.',
    answer:
      'Two people, in order: your Employment Mentor — an architect in your practice who actually ' +
      'knows what you have been doing — and then your Professional Studies Advisor at a school of ' +
      'architecture, who gives final approval.',
    facts: [
      { k: 'First', v: 'Employment Mentor' },
      { k: 'Then', v: 'Professional Studies Advisor' },
      { k: 'Mentor takes', v: `~${SHEET_RULES.mentorTargetDays} days` },
      { k: 'PSA takes', v: `~${SHEET_RULES.psaTargetDays} days` },
    ],
    faq: [
      {
        q: 'Who is my Employment Mentor?',
        a:
          'Somebody in your office with detailed knowledge of your work who supervises you ' +
          'directly. They do not have to be the person who formally employs you, but they do have ' +
          'to actually know what you have been doing, because they discuss each quarter with you, ' +
          'comment on it and sign it.',
      },
      {
        q: 'What does a Professional Studies Advisor do?',
        a:
          'A PSA is an advisor at a school of architecture who reviews your record sheets each ' +
          'quarter and gives final approval after your mentor has signed. Their job is to judge ' +
          'the breadth, scope and adequacy of your experience — they are the person who will tell ' +
          'you your record is thin, which is only useful if they see it while you can still fix it.',
      },
      {
        q: 'My mentor has had my PEDR sheet for weeks. What do I do?',
        a:
          `Chase, politely and in writing. A mentor realistically takes about ` +
          `${SHEET_RULES.mentorTargetDays} days and a PSA aims for around ` +
          `${SHEET_RULES.psaTargetDays} days once it reaches them, but waits of three months are ` +
          'common and nothing chases your mentor for you. Ask for fifteen minutes in their diary ' +
          'rather than sending a fourth email.',
      },
    ],
    related: ['pedr-deadlines', 'behind-on-your-pedr'],
    body: () => (
      <>
        <Part title="The order, and roughly how long each step takes">
          <div className="table-scroll">
            <table className="schedule schedule-wide">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Who</th>
                  <th>What they do</th>
                  <th style={{ width: 120 }}>Realistic wait</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>You</strong></td>
                  <td className="small">
                    Complete the sheet within {SHEET_RULES.submitWithinMonths} months of the end of
                    the period.
                  </td>
                  <td className="small">Your deadline</td>
                </tr>
                <tr>
                  <td><strong>Employment Mentor</strong></td>
                  <td className="small">
                    Discusses the quarter with you, writes a short appraisal, signs. This is a
                    conversation, not a rubber stamp — the discussion is the point of it.
                  </td>
                  <td className="small">~{SHEET_RULES.mentorTargetDays} days</td>
                </tr>
                <tr>
                  <td><strong>Professional Studies Advisor</strong></td>
                  <td className="small">
                    Reviews breadth, scope and adequacy. Approves, or sends it back for revision
                    with comments you should treat as free exam preparation.
                  </td>
                  <td className="small">~{SHEET_RULES.psaTargetDays} days</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="tiny faint">
            Both of those waits sit after your own deadline, which is the arithmetic people miss:
            submitting on the last possible day still leaves the sheet unsigned for another month
            or two, and that is fine — the deadline is on you completing it, not on them signing.
          </p>
        </Part>

        <Part title="How to make the appraisal easy to write">
          <p className="dim small">
            The single most common failure here is a mentor being handed four quarters at once and
            asked to certify, from memory, work they last saw a year ago. They will do it, and it
            will be two vague sentences, and a PSA reading two vague sentences knows exactly what
            happened.
          </p>
          <Points
            items={[
              <>
                Give them the sheet <em>before</em> the meeting, not in it. Fifteen minutes to
                read beats forty minutes of you narrating.
              </>,
              <>
                Bring the specifics: the named projects, the stages, the thing that went wrong.
                Their appraisal is written from your record — a thin record produces a thin
                appraisal.
              </>,
              <>
                Ask them directly what you are short of. They can see your record against everyone
                else&rsquo;s in the office, which is a view you do not have.
              </>,
              <>
                Book the next one before you leave the room. A recurring diary entry is the only
                thing that reliably survives a busy quarter.
              </>,
            ]}
          />
        </Part>

        <Part title="When the people change">
          <Points
            items={[
              <>
                <strong>Your mentor leaves.</strong> Get the outstanding sheets signed before their
                last day. An unsigned quarter whose only witness has left the practice is a
                genuinely difficult thing to fix.
              </>,
              <>
                <strong>You change jobs.</strong> Close off the period cleanly with the old mentor
                rather than carrying it across. Your category, supervisor and registration details
                all change with the job.
              </>,
              <>
                <strong>You have no PSA yet.</strong> Your school allocates one. Ask now rather
                than next quarter — nothing you write counts as an approved record until there is
                somebody to approve it.
              </>,
            ]}
          />
        </Part>
      </>
    ),
  },

  {
    slug: 'pedr-hours-and-stages',
    question: 'How do I record hours on a PEDR?',
    title: 'Recording hours, stages and the two columns',
    metaTitle: 'PEDR hours: RIBA stages and the two columns',
    description:
      'How hours are recorded against RIBA Plan of Work stages 0 to 7, why there are two columns ' +
      'for every stage, and where to get honest numbers instead of inventing them.',
    answer:
      'Hours go against RIBA Plan of Work stages 0 to 7, and every stage has two columns: hours ' +
      'where you did the work, and hours where you watched. Both count. Only recording one of ' +
      'them throws away the most valuable thing your record can show.',
    facts: [
      { k: 'Stages', v: '0 to 7' },
      { k: 'Columns', v: 'Participant, observer' },
      { k: 'A full week', v: `${REQUIREMENTS.standardWeekHours} hours` },
      { k: 'Usually missing', v: 'Stages 5, 6, 7' },
    ],
    faq: [
      {
        q: 'What are the two columns on a PEDR record sheet?',
        a:
          'Participant and observer. Participant hours are work you produced, ran, wrote or ' +
          'issued yourself. Observer hours are time spent watching or being taught — sitting in ' +
          'on a valuation, being shown a detail, shadowing somebody. Both are real experience and ' +
          'both are recorded, separately.',
      },
      {
        q: 'Do I have to record hours against RIBA stages?',
        a:
          'Yes, and it is the part people fabricate. If your practice runs timesheets, export ' +
          'them: hours by project and phase are already very close to the shape the sheet wants, ' +
          'they are contemporaneous, and your mentor can sign them honestly.',
      },
      {
        q: 'What if I have no hours at some stages?',
        a:
          'That is a real gap and it is worth finding early. A record with nothing at Stage 5 or ' +
          '6 is a narrow record, however good the rest of it is. Discovering it at month six is a ' +
          'conversation with your team leader; discovering it at month twenty-two is a problem.',
      },
    ],
    related: ['what-counts-as-pedr-experience', 'pedr-professional-criteria'],
    body: () => (
      <>
        <Part title="The stages">
          <p className="dim small">
            The RIBA Plan of Work splits a project into eight stages, and your hours are recorded
            against them. What a Professional Studies Advisor is looking for is breadth: not equal
            hours everywhere, but nothing conspicuously empty.
          </p>
          <div className="table-scroll">
            <table className="schedule schedule-wide">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Stage</th>
                  <th style={{ width: 200 }}>Name</th>
                  <th>What lands here</th>
                </tr>
              </thead>
              <tbody>
                {RIBA_STAGES.map((s) => (
                  <tr key={s.id}>
                    <td className="num"><strong>{s.code}</strong></td>
                    <td>{s.name}</td>
                    <td className="small">{s.blurb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny faint">
            Stages 5, 6 and 7 — construction, handover and use — are the ones missing from most
            records, because they happen on site and juniors in large practices are often kept in
            the studio. They are also the ones an examiner asks about.
          </p>
        </Part>

        <Part title="Two columns, and why the second one matters">
          <div className="grid grid-2">
            {PARTICIPATION.map((p) => (
              <div className="sheet sheet-tight stack-s" key={p.id}>
                <h3>{p.name}</h3>
                <p className="small dim">{p.plainly}</p>
              </div>
            ))}
          </div>
          <p className="dim small">
            Most people fill in one column. That is a shame, because the thing everybody is
            looking for and almost nobody can show on demand is the <strong>shift</strong> between
            them: stage by stage, over two years, from watching to doing. That is precisely the
            &ldquo;development over time&rdquo; a Reflective Experience Summary has to
            demonstrate, and it is invisible unless the two were recorded apart as you went.
          </p>
          <Callout label="Worth watching">
            A record still more than {Math.round(PARTICIPATION_RULES.observerConcernShare * 100)}%
            observer hours by month {PARTICIPATION_RULES.observerConcernFromMonth} is not a logging
            problem — it is a conversation to have with whoever resources your team, and one that
            gets much harder to have at month twenty-two.
          </Callout>
        </Part>

        <Part title="Where to get numbers you can defend">
          <Points
            items={[
              <>
                <strong>Your practice timesheet, first.</strong> Hours by project and phase,
                recorded at the time, by you. Nothing else is as defensible.
              </>,
              <>
                <strong>Your calendar, second.</strong> Meetings and site visits have real start
                and end times attached to them.
              </>,
              <>
                <strong>Estimates, marked as estimates.</strong> A working week is taken as{' '}
                {REQUIREMENTS.standardWeekHours} hours here. An estimate you have labelled is
                honest; an estimate presented as a measurement is not.
              </>,
              <>
                <strong>Never round numbers.</strong> Eight sheets of tidy 35-hour weeks split
                neatly across three stages is the most obvious tell there is.
              </>,
            ]}
          />
        </Part>
      </>
    ),
  },

  {
    slug: 'pedr-professional-criteria',
    question: 'What are the Part 3 professional criteria?',
    title: 'The professional criteria, and how to evidence them',
    metaTitle: 'Part 3 professional criteria PC1–PC5',
    description:
      'PC1 to PC5 in plain English, what each one is really asking for, and the everyday work ' +
      'that evidences it — used as the frame that stops a PEDR being a diary.',
    answer:
      'Five criteria: professionalism, clients and delivery, the legal framework, practice and ' +
      'management, and building procurement. They are what Part 3 assesses you against, and using ' +
      'them as the frame for your reflection is what turns a diary into a record.',
    facts: [
      { k: 'Criteria', v: 'PC1 to PC5' },
      { k: 'Set by', v: 'ARB' },
      { k: 'Evidenced by', v: 'Incidents, not assertions' },
      { k: 'Cannot be fixed later', v: 'An empty one' },
    ],
    faq: [
      {
        q: 'What are the ARB professional criteria at Part 3?',
        a: PROFESSIONAL_CRITERIA.map((c) => `${c.id} ${c.name}`).join('; ') + '.',
      },
      {
        q: 'How do I evidence the professional criteria in my PEDR?',
        a:
          'By naming them next to specific things that happened. A criterion is evidenced by an ' +
          'incident you can be questioned about — a variation you watched being instructed, a ' +
          'planning condition you discharged — not by asserting that you have covered it.',
      },
      {
        q: 'What if a criterion is empty in my record?',
        a:
          'Find out early and ask for the exposure. An empty criterion at month six is a request ' +
          'to your team leader. At month twenty-two it is a hole you cannot fill, and the one ' +
          'thing you cannot reconstruct after the fact is experience you never had.',
      },
    ],
    related: ['pedr-entry-examples', 'pedr-hours-and-stages'],
    body: () => (
      <>
        <Part title="The five">
          <div className="stack">
            {PROFESSIONAL_CRITERIA.map((c) => (
              <div className="sheet sheet-tight stack-s" key={c.id}>
                <h3>{c.id} — {c.name}</h3>
                {/* Not a chip: chips do not wrap, and this is a whole sentence. */}
                <p className="small">{c.plainly}</p>
                <p className="small dim">{c.blurb}</p>
              </div>
            ))}
          </div>
        </Part>

        <Part title="Why they are the frame, not a checklist">
          <p className="dim small">
            A PEDR written without them is a diary: a list of what happened, in order, with no
            argument. A PEDR written as a checklist is worse — a set of assertions that you have
            &ldquo;covered PC3&rdquo; with nothing underneath them.
          </p>
          <p className="dim small">
            What works is naming the criterion next to a specific thing that happened, in the same
            sentence, so the claim and its evidence are inseparable. &ldquo;I understood that a
            variation only exists once it is instructed in writing (PC5)&rdquo; is a claim with a
            handle on it. &ldquo;This quarter covered PC5&rdquo; is not.
          </p>
        </Part>

        <Part title="The thing to check every few months">
          <p className="dim small">
            Which of the five is thinnest, and what would fix it. Coverage is the one problem in a
            PEDR that writing cannot solve: you cannot type your way to experience you have not
            had. Everything else on a record can be reconstructed later from a calendar and a
            timesheet — a criterion you were never exposed to cannot.
          </p>
          <div className="row-wrap">
            <Link href="/guides/pedr-entry-examples" className="btn">How to write it up</Link>
            <Link href="/what-is-a-pedr" className="btn">See it on a real sheet</Link>
          </div>
        </Part>
      </>
    ),
  },
]

// ---------------------------------------------------------------------------

export const GUIDE_SLUGS = GUIDES.map((g) => g.slug)

export function guide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug)
}

/**
 * Pages that are not generated guides but belong in the same index and the
 * same sitemap — they answer the same searches.
 */
export const STANDALONE_PAGES = [
  {
    slug: 'what-is-a-pedr',
    href: '/what-is-a-pedr',
    question: 'What does a PEDR actually look like?',
    title: 'What a PEDR actually looks like',
    description:
      'A whole quarterly record sheet, filled in, with every section explained. Nobody shows you ' +
      'one until you have to write it.',
  },
  {
    slug: 'behind',
    href: '/behind',
    question: 'How far behind am I?',
    title: 'Am I in trouble?',
    description:
      'Three questions and a straight answer about how late your sheets really are and whether ' +
      'the time is recoverable. About a minute, no account.',
  },
] as const
