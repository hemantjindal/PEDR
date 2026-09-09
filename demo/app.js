/* ---------------------------------------------------------------------------
   The demo application.

   Vanilla, deliberately: the point of this page is that it is one file you can
   open on a phone with no server, no database and no build step at the other
   end. Everything below the rendering is the app's real engine, bundled above
   as `PEDR` — scoring, coverage, deadlines, sheet generation, the parser. This
   file only draws.

   State lives in localStorage so what you type survives a reload, and Reset
   puts the demo record back.
--------------------------------------------------------------------------- */

const E = PEDR
const STORE = 'pedr-demo-v1'

const SCREENS = [
  { id: 'record', label: 'Record', icon: 'M3 11.5 12 4l9 7.5M6 10v9h12v-9' },
  { id: 'dump', label: 'Write', icon: 'M12 5v14M5 12h14' },
  { id: 'calendar', label: 'Calendar', icon: 'M4 7h16v13H4zM4 11h16M8 3v4M16 3v4' },
  { id: 'coverage', label: 'Coverage', icon: 'M4 18h4V8H4zM10 18h4V4h-4zM16 18h4v-7h-4z' },
  { id: 'sheet', label: 'Sheet', icon: 'M7 3h7l5 5v13H7zM14 3v5h5' },
  { id: 'guide', label: 'Guide', icon: 'M12 6.5a5 5 0 1 1 3 9v2m-3 3h.01' },
]

// --- State -------------------------------------------------------------------

const today = E.todayKey()
let state = load()

function fresh() {
  const record = E.buildDemoRecord({ today })
  return {
    entries: record.entries,
    notes: record.notes,
    projects: record.projects,
    employment: record.employment,
    experienceStart: record.experienceStart,
    name: record.name,
    screen: 'record',
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORE)
    if (!raw) return fresh()
    const saved = JSON.parse(raw)
    // A record built on a different day would put "today" in the past.
    if (saved.today !== today || !Array.isArray(saved.entries)) return fresh()
    return { ...fresh(), ...saved }
  } catch {
    return fresh()
  }
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...state, today }))
  } catch {
    // A private window, or storage switched off. The page still works; it just
    // forgets on reload, which is a fair trade for not breaking.
  }
}

// --- Derived -----------------------------------------------------------------

/**
 * Everything the screens read, recomputed from the entries on every change.
 *
 * The app does exactly this on the server: nothing about a week, a quarter or
 * the coverage is stored, so there is only ever one place a fact can be wrong.
 */
function derive() {
  const entries = [...state.entries].sort((a, b) => a.date.localeCompare(b.date))
  const from = E.weekIdOf(state.experienceStart)
  const to = E.weekIdOf(today)
  const scores = E.scoreWeeks(from, to, entries, state.notes)
  const coverage = E.computeCoverage(entries, {
    recentFrom: E.addMonths(today, -E.REQUIREMENTS.recentWindowMonths),
  })
  const periods = E.planSheetPeriods(state.experienceStart, { today, sheets: [] })

  const progress = E.computeProgress(entries, scores, [state.employment], { today })
  const deadlines = E.summariseDeadlines(periods)
  const participation = E.participationTrend(entries)

  return {
    entries,
    scores,
    coverage,
    months: E.rollUpByMonth(scores),
    gaps: E.findGaps(scores),
    thin: E.findThinWeeks(scores),
    streak: E.currentStreak(scores),
    best: E.bestStreak(scores),
    progress,
    deadlines,
    periods,
    participation,
    coverageNote: E.coverageHeadline(coverage),
    missions: E.buildMissions({
      thisWeek: scores[scores.length - 1] ?? null,
      scores,
      coverage,
      deadlines,
      progress,
      participation,
      hasExperienceStart: true,
      hasEmployment: true,
      projectCount: state.projects.length,
    }),
  }
}

// --- Little helpers ----------------------------------------------------------

const h = (html) => html
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))
const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
const pct = (value) => `${Math.round(value * 100)}%`

function density(score) {
  if (score <= 0) return 0
  if (score < 40) return 1
  if (score < 60) return 2
  if (score < 80) return 3
  if (score < 95) return 4
  return 5
}

function titleblock(cells) {
  return h(`<div class="titleblock">${cells.map(([label, value]) => `
    <div><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>
  `).join('')}</div>`)
}

// --- The record (dashboard) --------------------------------------------------

function renderRecord(d) {
  const sitting = d.progress.projectedReadyDate
  const late = d.deadlines.lateCount
  const remaining = d.progress.weeksRemaining

  const bands = [
    `<div class="band band-signal">
       <span class="label">Earliest you can sit</span>
       <strong>${d.progress.ready
         ? 'You have the experience now'
         : sitting ? esc(E.formatDate(sitting, { year: true })) : 'Not enough logged to project'}</strong>
       <span class="small">${d.progress.ready
         ? 'Every requirement met on what you have logged.'
         : remaining > 0
           ? `${remaining} more ${remaining === 1 ? 'week' : 'weeks'} to log, at your current rate.`
           : 'Log a few more weeks and this fills in.'}</span>
     </div>`,
    late > 0
      ? `<div class="band band-alarm">
           <span class="label">Overdue</span>
           <strong>${late} ${late === 1 ? 'sheet is' : 'sheets are'} late</strong>
           <span class="small">A sheet has to be finished within
             ${E.SHEET_RULES.submitWithinMonths} months of the period it covers.</span>
         </div>`
      : `<div class="band band-ink">
           <span class="label">Next deadline</span>
           <strong>${esc(d.deadlines.headline ?? 'Nothing due')}</strong>
         </div>`,
  ].join('')

  const weeks = d.scores.map((s) => ({ weekId: s.weekId, score: s.score }))
  const rows = []
  for (let i = 0; i < weeks.length; i += 13) rows.push(weeks.slice(i, i + 13))

  const register = rows.map((chunk, index) => {
    const logged = chunk.filter((w) => w.score > 0).length
    const cells = chunk.map((w) => `<span class="reg-cell" data-d="${
      w.weekId > E.weekIdOf(today) ? -1 : density(w.score)
    }" data-now="${w.weekId === E.weekIdOf(today)}" title="${esc(E.formatWeek(w.weekId))} — ${
      w.score === 0 ? 'nothing recorded' : `${w.score}/100`
    }"></span>`).join('')
    const pad = Array.from({ length: 13 - chunk.length }, () => '<span></span>').join('')
    return `<div class="row" style="gap:12px;align-items:center">
      <span class="ref" style="width:74px;flex:none;text-align:right">PEDR-${String(index + 1).padStart(2, '0')}</span>
      <div class="register" style="grid-template-columns:repeat(13,minmax(0,1fr));flex:1 1 auto;max-width:310px">${cells}${pad}</div>
      <span class="ref faint">${logged}/${chunk.length}</span>
    </div>`
  }).join('')

  // The single highest-value thing missing from the week in progress.
  const thisWeek = d.scores[d.scores.length - 1] ?? null
  const action = thisWeek?.nextBestAction ?? null
  const board = d.missions
  const weekPct = Math.min(100, Math.round((board.weekScore / board.weekTarget) * 100))
  const URGENCY = { now: ['mark-revision', 'now'], soon: ['mark-pending', 'this week'], whenever: ['mark-none', 'when you can'] }
  const KIND = { setup: 'Setup', deadline: 'Deadline', week: 'This week', balance: 'Balance', coverage: 'Coverage' }

  return h(`
    ${titleblock([
      ['Weeks logged', `${d.scores.filter((s) => s.score > 0).length}`],
      ['Streak', `${d.streak} ${d.streak === 1 ? 'week' : 'weeks'}`],
      ['Best', `${d.best}`],
      ['Months logged', d.progress.monthsLogged.toFixed(1)],
    ])}

    <div class="grid grid-2" style="margin-top:18px">${bands}</div>

    ${d.coverageNote ? `<p class="note note-revision" style="margin-top:14px">
      <span aria-hidden="true">⚠</span> <span>${esc(d.coverageNote)}</span></p>` : ''}

    <section class="sheet stack" style="margin-top:18px">
      <div class="sheet-head">
        <div>
          <span class="label">One row is one record sheet</span>
          <h2 style="margin-top:3px">The register</h2>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">${register}</div>
      <p class="tiny faint">
        Thirteen weeks to a row, because thirteen weeks is one sheet. Darker is a better week; a
        hollow cell is a week with nothing in it; a week that has not happened yet is nothing at all.
      </p>
    </section>

    <section class="sheet stack" style="margin-top:16px">
      <div class="sheet-head">
        <div>
          <span class="label">${board.missions.length === 0
            ? 'Nothing outstanding'
            : `${board.missions.length} ${board.missions.length === 1 ? 'thing' : 'things'} to do`}</span>
          <h2 style="margin-top:3px">Next</h2>
        </div>
        <span class="spacer"></span>
        <span class="chip chip-signal">${esc(board.rank.name)}</span>
      </div>

      <div class="check-row">
        <span class="check-label small dim">${board.weekScore >= board.weekTarget
          ? `This week is <strong style="color:var(--ink)">done</strong> — ${board.weekScore}${
              board.weekScore < 100 ? ' of a possible 100, and the rest is friction you cannot invent' : ''}`
          : `This week scores <strong style="color:var(--ink)">${board.weekScore}</strong> of the ${board.weekTarget} that are yours to take${
              board.availableThisWeek > 0 ? ` · ${board.availableThisWeek} still on the table` : ''}`}</span>
        <span class="check-value"><span class="ref">${board.streak} week${board.streak === 1 ? '' : 's'} in a row</span></span>
      </div>
      <span class="bar-track"><span class="bar-fill" style="width:${weekPct}%"></span></span>

      ${board.missions.length === 0
        ? '<p class="small dim">Nothing missing from this week, nothing overdue, and no empty stages. Come back on Monday.</p>'
        : `<div style="display:flex;flex-direction:column">${board.missions.slice(0, 6).map((m, i) => {
            const [mark, label] = URGENCY[m.urgency]
            const to = m.href.replace(/^\//, '').split('/')[0]
            const screen = to === 'weeks' || to === 'dump' ? 'dump'
              : to === 'sheets' ? 'sheet'
              : to === 'coverage' ? 'coverage' : 'record'
            return `<div style="padding:11px 0;border-top:${i === 0 ? 'none' : '1px solid var(--hair)'}">
              <div class="row-wrap" style="gap:8px;align-items:baseline">
                <span class="mark ${mark}">${label}</span>
                <button class="small" data-go="${screen}" style="font-weight:600;flex:1 1 200px;min-width:0;text-align:left;text-decoration:underline;text-underline-offset:3px">${esc(m.title)}</button>
                ${m.points > 0 ? `<span class="chip" title="What this is worth in this week's score">+${m.points}</span>` : ''}
                <span class="label" style="flex:none">${KIND[m.kind]}</span>
              </div>
              <p class="tiny faint" style="margin-top:3px">${esc(m.why)}</p>
              ${m.progress ? `<span class="bar-track" style="margin-top:6px"><span class="bar-fill" style="width:${
                Math.round((m.progress.done / m.progress.target) * 100)}%"></span></span>` : ''}
            </div>`
          }).join('')}</div>`}

      ${board.nextRank ? `<p class="tiny faint">${board.monthsToNextRank} more ${
        board.monthsToNextRank === 1 ? 'month' : 'months'} of logged experience to
        &ldquo;${esc(board.nextRank.name)}&rdquo; — ${esc(board.nextRank.blurb.toLowerCase())}</p>` : ''}
    </section>

    <div class="grid grid-2" style="margin-top:16px">
      <section class="sheet stack-s">
        <div class="sheet-head"><div>
          <span class="label">Do this next</span>
          <h2 style="margin-top:3px">${esc(action ?? 'This week is complete')}</h2>
        </div></div>
        <p class="small dim">${thisWeek
          ? `This week scores ${thisWeek.score} out of 100 — ${esc(thisWeek.bandLabel.toLowerCase())}.`
          : 'Nothing logged this week yet.'}</p>
        <div class="row-wrap">
          <button class="btn btn-primary" data-go="dump">Write something down</button>
        </div>
      </section>

      <section class="sheet stack-s">
        <div class="sheet-head"><div>
          <span class="label">Where it is thin</span>
          <h2 style="margin-top:3px">${d.gaps.length} ${d.gaps.length === 1 ? 'gap' : 'gaps'}</h2>
        </div></div>
        ${d.gaps.length === 0
          ? '<p class="small dim">No missing weeks. That is rare.</p>'
          : `<div style="display:flex;flex-direction:column">${d.gaps.slice(0, 5).map((gap, i) => `
              <div class="row-wrap" style="gap:8px;padding:7px 0;border-top:${i === 0 ? 'none' : '1px solid var(--hair)'}">
                <span class="ref">${esc(E.formatWeekRange(gap.from))}</span>
                <span class="spacer"></span>
                <span class="chip">${gap.count} ${gap.count === 1 ? 'week' : 'weeks'}</span>
              </div>`).join('')}</div>`}
        ${d.thin.length > 0 ? `<p class="tiny faint">
          And ${d.thin.length} thin ${d.thin.length === 1 ? 'week' : 'weeks'} — logged, but with
          nothing specific enough to put on a sheet.</p>` : ''}
      </section>
    </div>
  `)
}

// --- Write (the dump box) ----------------------------------------------------

const SAMPLES = {
  week: `w/c 7 Sep
mon - battersea, worked up the stair details with Tom. 4h. sent the wrong revision first, had to reissue
tue: all day on 1042 tender package
wed - site visit nine elms with Sarah Chen from Mace
thurs - sat in on the valuation meeting with the QS
fri half day, planning submission for BSQ`,
  teams: `Sarah Chen  09:12
Can you get the stair detail out today?

Alex Demo  09:20
Yes — issuing 1042 stair sections this morning, then onto the Hackney bregs pack

Tom Reilly  11:04
Contractor is asking about the soffit junction

Alex Demo  11:31
Answered the TQ on the soffit. Took about an hour, had to check the fire strategy first`,
  timesheet: `Date,Project,Hours,Description
07/09/2026,1042,3.5,Stair details for tender package
08/09/2026,1042,7.5,Tender package coordination
09/09/2026,1088,4,Site visit and inspection notes
10/09/2026,1103,2.5,Building regs submission`,
}

let draft = { raw: '', entries: null, kind: null, warnings: [] }

function renderDump(d) {
  if (draft.entries) return renderReview(d)

  return h(`
    ${titleblock([
      ['Week', E.formatWeek(E.weekIdOf(today))],
      ['Today', E.formatDate(today, { weekday: true })],
      ['Last logged', d.entries.length ? E.formatDate(d.entries[d.entries.length - 1].date) : 'never'],
      ['Projects', String(state.projects.length)],
    ])}

    <section class="sheet stack" style="margin-top:18px">
      <div class="field">
        <label for="raw">What happened?</label>
        <textarea id="raw" rows="9" spellcheck="true"
          placeholder="Type it badly. Days, half-sentences, no punctuation — all fine.">${esc(draft.raw)}</textarea>
        <span class="hint">
          You can also paste a Teams conversation or a timesheet export and it works out which it is.
        </span>
      </div>
      <div class="row-wrap">
        <button class="btn btn-primary" id="parse">Read it</button>
        <button class="btn btn-ghost btn-sm" data-sample="week">A rough week</button>
        <button class="btn btn-ghost btn-sm" data-sample="teams">A Teams chat</button>
        <button class="btn btn-ghost btn-sm" data-sample="timesheet">A timesheet</button>
      </div>
    </section>

    <section class="sheet stack-s" style="margin-top:16px">
      <div class="sheet-head"><div>
        <span class="label">Four things</span>
        <h2 style="margin-top:3px">Worth putting in</h2>
      </div></div>
      <div style="display:flex;flex-direction:column">
        ${[
          ['Which job', 'A name or a number. Worth points on every week it appears in.'],
          ['What exactly', 'Not “drawings” — which drawings, and what changed.'],
          ['Who', 'Client, contractor, engineer, your own team. It shows the level you were working at.'],
          ['What went wrong', 'The box examiners actually read. A smooth week scores lower for exactly that reason.'],
        ].map(([term, note], i) => `
          <div style="padding:9px 0;border-top:${i === 0 ? 'none' : '1px solid var(--hair)'}">
            <div class="label label-ink" style="margin-bottom:3px">${esc(term)}</div>
            <p class="small dim">${note}</p>
          </div>`).join('')}
      </div>
    </section>
  `)
}

function renderReview() {
  const entries = draft.entries
  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0)
  const days = new Set(entries.map((e) => e.date)).size
  const kindLabel = draft.kind === 'teams' ? 'Read as a Teams chat'
    : draft.kind === 'timesheet' ? 'Read as a timesheet' : 'Read as notes'

  return h(`
    <section class="sheet stack-s">
      <div class="row-wrap" style="justify-content:space-between;align-items:baseline">
        <h2>Check this before it goes on the record</h2>
        <span class="chip">${esc(kindLabel)}</span>
      </div>
      <p class="small dim">
        ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} across ${days}
        ${days === 1 ? 'day' : 'days'} · ${esc(E.formatDuration(totalMinutes))} total.
      </p>
      ${draft.warnings.map((w) => `<p class="note note-pending small">
        <span aria-hidden="true">⚠</span> ${esc(w)}</p>`).join('')}
    </section>

    <div class="stack-s" style="margin-top:12px">
      ${entries.map((entry, index) => {
        const unsure = entry.confidence < E.REVIEW_THRESHOLD
        const project = state.projects.find((p) => p.id === entry.projectId)
        return `<div class="sheet sheet-tight stack-s"${
          unsure ? ' style="border-color:color-mix(in srgb, var(--signal) 60%, var(--ink))"' : ''
        }>
          <div class="entry-head">
            <span class="ref">${esc(E.formatDate(entry.date, { weekday: true }))}</span>
            <span class="mono tiny dim">${entry.minutes > 0 ? esc(E.formatDuration(entry.minutes)) : 'no hours'}</span>
            ${entry.minutesEstimated ? '<span class="mark mark-pending">≈ estimated</span>' : ''}
            ${unsure ? '<span class="mark mark-pending">? unsure</span>' : ''}
            <span class="spacer"></span>
            <button class="btn btn-ghost btn-sm btn-danger" data-drop="${index}">Drop</button>
          </div>
          <p class="small">${esc(entry.activity)}</p>
          <div class="row-wrap" style="gap:5px">
            ${project ? `<span class="chip">${esc(project.code || project.name)}</span>`
              : entry.projectHint ? `<span class="mark mark-none">no match — “${esc(entry.projectHint)}”</span>`
              : entry.officeCategory ? `<span class="chip">${esc(entry.officeCategory)}</span>`
              : '<span class="mark mark-none">no project</span>'}
            ${entry.stage !== null ? `<span class="chip">Stage ${entry.stage}</span>` : ''}
            ${entry.criteria.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}
            <span class="chip${entry.participation === 'observer' ? '' : ' chip-ink'}">${
              entry.participation === 'observer' ? 'Watched' : 'Did it'}</span>
          </div>
          ${entry.people.length ? `<p class="tiny faint">With ${esc(entry.people.join(', '))}</p>` : ''}
          ${entry.wentWrong ? `<p class="tiny" style="color:var(--alarm-text)">Went wrong — ${esc(entry.wentWrong)}</p>` : ''}
        </div>`
      }).join('')}
    </div>

    <div class="sheet stack-s sticky-actions" style="margin-top:12px">
      <div class="row-wrap">
        <button class="btn btn-primary" id="commit"${entries.length === 0 ? ' disabled' : ''}>
          Save ${entries.length} to the record
        </button>
        <button class="btn" id="back">Back to the text</button>
      </div>
    </div>
  `)
}

// --- Calendar ----------------------------------------------------------------

const SAMPLE_ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Outlook//EN',
  ev('Design team meeting 1042', '0908', '1000', '1100', ['Sarah Chen', 'Tom Reilly'], 'Battersea studio'),
  ev('1042 Stage 4 technical design review', '0908', '1400', '1600', ['Sarah Chen', 'Priya Nair'], 'Teams'),
  ev('Site visit Nine Elms 1088', '0909', '0900', '1200', ['Tom Reilly'], 'Nine Elms, SW8'),
  ev('Lunch', '0909', '1230', '1330', [], ''),
  ev('Focus time', '0909', '1400', '1600', [], ''),
  ev('Sat in on the valuation with the QS', '0910', '1000', '1130', ['Dan Okafor'], 'Site'),
  ev('Planning submission review BSQ', '0910', '1400', '1530', ['Priya Nair'], 'Teams'),
  ev('Daily standup', '0911', '0900', '0915', [], ''),
  ev('Building Safety Act CPD', '0911', '1200', '1300', ['Priya Nair'], 'Teams'),
  'BEGIN:VEVENT', 'UID:cancelled-1', 'DTSTAMP:20260901T090000Z',
  'DTSTART:20260911T150000Z', 'DTEND:20260911T160000Z',
  'SUMMARY:Fee proposal workshop', 'STATUS:CANCELLED', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

/** One VEVENT, so the sample calendar reads like a real week rather than a fixture. */
function ev(summary, day, from, to, people, location) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${day}-${from}@practice.com`,
    'DTSTAMP:20260901T090000Z',
    `DTSTART:2026${day}T${from}00Z`,
    `DTEND:2026${day}T${to}00Z`,
    `SUMMARY:${summary}`,
    'ORGANIZER;CN=Sarah Chen:mailto:sarah.chen@practice.com',
    'ATTENDEE;CN=Alex Demo;PARTSTAT=ACCEPTED:mailto:alex@practice.com',
    'ATTENDEE;CUTYPE=ROOM;CN=Meeting Room 3:mailto:room3@practice.com',
  ]
  if (location) lines.push(`LOCATION:${location}`)
  for (const person of people) {
    lines.push(`ATTENDEE;CN=${person};PARTSTAT=ACCEPTED:mailto:${person.toLowerCase().replace(/ /g, '.')}@practice.com`)
  }
  lines.push('END:VEVENT')
  return lines.join('\r\n')
}

let calendarResult = null

function renderCalendar() {
  if (calendarResult) return renderCalendarReview()

  return h(`
    <div class="stack-s">
      <h1>Link your calendar</h1>
      <p class="dim">
        Your Outlook or Teams calendar already knows what you did every working day, and —
        uniquely — who was in the room with you. That is the part of a PEDR nobody can reconstruct
        in a Sunday-night panic.
      </p>
    </div>

    <section class="sheet stack" style="margin-top:16px">
      <div class="sheet-head"><div>
        <span class="label">Two ways in</span>
        <h2 style="margin-top:3px">An .ics file, or a published link</h2>
      </div></div>
      <p class="small dim">
        In the app a published link <strong>syncs</strong> — come back next month and it picks up
        where it left off, and a meeting already on your record is never counted twice. Here, try
        it with a file or with a week of a real-looking calendar.
      </p>
      <div class="row-wrap">
        <button class="btn btn-primary" id="cal-sample">Try a week of calendar</button>
        <input type="file" id="cal-file" accept=".ics,text/calendar" style="display:none">
        <button class="btn" id="cal-choose">Choose an .ics file</button>
      </div>
      <p class="tiny faint">
        Nothing leaves this tab. The file is read in your browser by the same parser the app runs.
      </p>
    </section>

    <section class="sheet stack-s" style="margin-top:16px">
      <div class="sheet-head"><div>
        <span class="label">Thrown away automatically</span>
        <h2 style="margin-top:3px">The noise</h2>
      </div></div>
      <p class="small dim">
        Cancelled meetings, anything you declined, anything marked free, all-day blocks that are
        not leave, and the standing furniture of a week:
      </p>
      <div class="row-wrap" style="gap:5px">
        ${['Lunch', 'Focus time', 'Standup', 'Holds', 'Commute', 'Dentist', 'Birthdays', 'Under 15 min']
          .map((w) => `<span class="chip">${w}</span>`).join('')}
      </div>
      <p class="tiny faint">
        Every one is listed on the review screen with its reason, so nothing disappears quietly.
      </p>
    </section>
  `)
}

function renderCalendarReview() {
  const { entries, parsed } = calendarResult
  const minutes = entries.reduce((sum, e) => sum + e.minutes, 0)
  const days = new Set(entries.map((e) => e.date)).size
  const people = new Set(entries.flatMap((e) => e.people)).size

  return h(`
    <section class="sheet stack-s">
      <div class="row-wrap" style="justify-content:space-between;align-items:baseline">
        <h2>Check this before it goes on the record</h2>
        <span class="chip">${esc(calendarResult.source)}</span>
      </div>
      ${titleblock([
        ['To import', String(entries.length)],
        ['Days', String(days)],
        ['Meeting time', E.formatDuration(minutes)],
        ['People', String(people)],
      ])}
      <p class="note note-pending small">
        <span aria-hidden="true">⚠</span> A calendar records meetings, not work. The hours here are
        the meetings only — the desk time still has to go in by hand.
      </p>
      ${parsed.skipped.length > 0 ? `<details>
        <summary class="small dim" style="cursor:pointer">What was left out (${parsed.skipped.length})</summary>
        <div class="table-scroll" style="margin-top:10px">
          <table class="schedule">
            <thead><tr><th>Event</th><th>Date</th><th>Why</th></tr></thead>
            <tbody>${parsed.skipped.map((sk) => `<tr>
              <td>${esc(sk.summary)}</td>
              <td class="mono tiny">${esc(sk.date ?? '—')}</td>
              <td class="dim">${esc(sk.reason)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </details>` : ''}
    </section>

    <div class="stack-s" style="margin-top:12px">
      ${entries.map((entry, index) => {
        const project = state.projects.find((p) => p.id === entry.projectId)
        return `<div class="sheet sheet-tight stack-s">
          <div class="entry-head">
            <span class="ref">${esc(E.formatDate(entry.date, { weekday: true }))}</span>
            <span class="mono tiny dim">${esc(E.formatDuration(entry.minutes))}</span>
            <span class="spacer"></span>
            <button class="btn btn-ghost btn-sm btn-danger" data-cal-drop="${index}">Drop</button>
          </div>
          <p class="small">${esc(entry.activity)}</p>
          <div class="row-wrap" style="gap:5px">
            ${project ? `<span class="chip">${esc(project.code || project.name)}</span>`
              : entry.officeCategory ? `<span class="chip">${esc(entry.officeCategory)}</span>`
              : '<span class="mark mark-none">no project</span>'}
            ${entry.stage !== null ? `<span class="chip">Stage ${entry.stage}</span>` : ''}
            <span class="chip${entry.participation === 'observer' ? '' : ' chip-ink'}">${
              entry.participation === 'observer' ? 'Watched' : 'Did it'}</span>
          </div>
          ${entry.people.length ? `<p class="tiny faint">With ${esc(entry.people.join(', '))}</p>` : ''}
        </div>`
      }).join('')}
    </div>

    <div class="sheet stack-s sticky-actions" style="margin-top:12px">
      <div class="row-wrap">
        <button class="btn btn-primary" id="cal-commit"${entries.length === 0 ? ' disabled' : ''}>
          Save ${entries.length} to the record
        </button>
        <button class="btn" id="cal-back">Start again</button>
      </div>
    </div>
  `)
}

function readCalendar(ics, source) {
  const window_ = E.defaultWindow(today, 12)
  const parsed = E.parseCalendar(ics, {
    from: window_.from,
    to: window_.to,
    email: 'alex@practice.com',
    name: state.name,
  })
  const entries = E.calendarToEntries(parsed, {
    reference: today,
    projects: state.projects,
    knownPeople: [...new Set(state.entries.flatMap((e) => e.people))],
  })
  calendarResult = { parsed, entries, source }
  render()
}

// --- Coverage ----------------------------------------------------------------

function renderCoverage(d) {
  const stages = d.coverage.stages
  const criteria = d.coverage.criteria
  const busiest = Math.max(...d.participation.months.map((m) => m.participant + m.observer), 1)

  const bar = (row) => `
    <div class="row-wrap" style="gap:10px;align-items:baseline;padding:8px 0;border-top:1px solid var(--hair)">
      <span class="ref" style="width:34px;flex:none">${esc(row.id)}</span>
      <span style="flex:1 1 160px;min-width:0">
        <span class="small">${esc(row.label.split(' · ')[1] ?? row.label)}</span>
        <span class="bar-track${row.minutes === 0 ? ' bar-track-empty' : ''}" style="margin-top:4px">
          <span class="bar-fill" style="width:${Math.round(row.share * 100)}%"></span>
        </span>
      </span>
      <span class="ref" style="flex:none">${row.minutes > 0
        ? esc(E.formatDuration(row.minutes))
        : '<span class="mark mark-revision">never</span>'}</span>
    </div>`

  return h(`
    <div class="stack-s">
      <h1>Coverage</h1>
      <p class="dim">
        Your PSA is judging breadth, not just attendance. This is the view that tells you what you
        have never been near — while there is still time to ask.
      </p>
    </div>

    ${d.coverageNote ? `<p class="note note-revision" style="margin-top:14px">
      <span aria-hidden="true">⚠</span> <span>${esc(d.coverageNote)}</span></p>` : ''}

    ${d.participation.months.length ? `
    <section class="sheet stack" style="margin-top:16px">
      <div class="sheet-head">
        <div class="stack-s" style="gap:2px">
          <h2>Watching, and then doing</h2>
          <p class="tiny faint">
            The record sheet's second hour column. Observer time is real experience — what
            examiners look for is the shift out of it.
          </p>
        </div>
        <span class="spacer"></span>
        <span class="chip">${esc(E.formatDuration(d.participation.participant))} did ·
          ${esc(E.formatDuration(d.participation.observer))} watched</span>
      </div>
      <div class="participation-track">
        ${d.participation.months.map((m) => {
          const total = m.participant + m.observer
          const height = Math.max(6, Math.round((total / busiest) * 100))
          const share = Math.round((m.observerShare ?? 0) * 100)
          return `<span class="participation-month" style="height:${height}%"
            title="${esc(E.formatMonth(m.monthKey))} — ${esc(E.formatDuration(total))}, ${share}% watched">
            <span class="participation-observer" style="height:${share}%"></span></span>`
        }).join('')}
      </div>
      <div class="row-wrap tiny faint" style="justify-content:space-between">
        <span>${esc(E.formatMonth(d.participation.months[0].monthKey))}</span>
        <span>height is hours logged · yellow is what you watched</span>
        <span>${esc(E.formatMonth(d.participation.months[d.participation.months.length - 1].monthKey))}</span>
      </div>
      ${d.participation.note ? `<p class="small dim">${esc(d.participation.note)}</p>` : ''}
    </section>` : ''}

    <div class="grid grid-2" style="margin-top:16px">
      <section class="sheet stack-s">
        <div class="sheet-head"><div class="stack-s" style="gap:2px">
          <h2>RIBA work stages</h2>
          <p class="tiny faint">Where your time has actually gone.</p>
        </div></div>
        <div>${stages.map(bar).join('')}</div>
      </section>
      <section class="sheet stack-s">
        <div class="sheet-head"><div class="stack-s" style="gap:2px">
          <h2>Professional Criteria</h2>
          <p class="tiny faint">PC1–PC5, the things the exam is actually about.</p>
        </div></div>
        <div>${criteria.map(bar).join('')}</div>
      </section>
    </div>
  `)
}

// --- The sheet ---------------------------------------------------------------

let sheetIndex = null
/** The quarter currently on screen, so the download button has something to render. */
let lastSheet = null

function renderSheet(d) {
  const periods = d.periods
  if (periods.length === 0) {
    return h('<p class="note small">No sheet periods yet — the record has to start somewhere.</p>')
  }
  const index = sheetIndex === null ? Math.max(0, periods.length - 2) : sheetIndex
  const period = periods[Math.min(index, periods.length - 1)]

  const entries = d.entries.filter((e) => e.date >= period.periodStart && e.date <= period.periodEnd)
  const content = E.buildSheet({
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    entries,
    notes: state.notes,
    projects: state.projects,
    employment: state.employment,
  })
  const doc = E.buildSheetDocument({
    content,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    candidateName: state.name,
    employment: state.employment,
    entries,
    projects: state.projects,
  })
  const markdown = E.renderMarkdown(doc)
  const activeDoc = DOCUMENTS.find((x) => x.id === exportDoc) ?? DOCUMENTS[0]
  const chosenFormat = exportFormat && activeDoc.formats.includes(exportFormat)
    ? exportFormat
    : activeDoc.formats[0]

  lastSheet = { content, period, entries }

  const tabs = periods.map((p, i) => `
    <button class="chip${i === index ? ' chip-ink' : ''}" data-period="${i}"
      style="cursor:pointer">PEDR-${String(i + 1).padStart(2, '0')}</button>`).join('')

  return h(`
    <div class="stack-s">
      <h1>${esc(E.formatDate(period.periodStart))} – ${esc(E.formatDate(period.periodEnd))}</h1>
      <p class="dim small">
        ${entries.length} entries · ${content.general.hoursWorked} hours ·
        ${content.general.daysWorked} days
      </p>
      <div class="row-wrap" style="gap:5px">${tabs}</div>
    </div>

    <p class="note note-ink" style="margin-top:14px">
      <span aria-hidden="true">→</span>
      <span>A draft built from what you logged. In the app this downloads as PDF, Word, plain text
      or a spreadsheet — your choice — plus an appraisal template for your PSA with the quarter
      already printed above the boxes they fill in.</span>
    </p>

    <section class="sheet stack" style="margin-top:16px">
      <h2>Record activities — hours by work stage</h2>
      <p class="tiny faint">
        The sheet has two hour columns. Participant is work you did; observer is work you watched
        or were taught. Both count — the shift between them is what shows development.
      </p>
      <div class="table-scroll">
        <table class="schedule">
          <thead><tr><th>Stage</th><th></th>
            <th style="text-align:right">Participant</th>
            <th style="text-align:right">Observer</th>
            <th style="text-align:right">Total</th></tr></thead>
          <tbody>${E.RIBA_STAGES.map((s) => {
            const total = content.stageMinutes[String(s.id)] ?? 0
            const split = content.stageParticipation[String(s.id)] ?? { participant: 0, observer: 0 }
            const cell = (m) => (m > 0 ? (m / 60).toFixed(1) : '—')
            return `<tr><td class="num">${s.code}</td><td>${esc(s.name)}</td>
              <td class="n">${cell(split.participant)}</td>
              <td class="n">${cell(split.observer)}</td>
              <td class="n">${cell(total)}</td></tr>`
          }).join('')}</tbody>
        </table>
      </div>
    </section>

    <section class="sheet stack" style="margin-top:16px">
      <div class="sheet-head"><div>
        <span class="label">Take it away</span>
        <h2 style="margin-top:3px">Download</h2>
      </div></div>

      <fieldset style="border:0;padding:0;margin:0">
        <legend class="label" style="margin-bottom:8px">Which document</legend>
        <div class="stack-s">
          ${DOCUMENTS.map((doc) => `
            <label class="row" style="gap:8px;align-items:flex-start">
              <input type="radio" name="doc" value="${doc.id}"${
                exportDoc === doc.id ? ' checked' : ''} style="width:auto;margin-top:3px">
              <span>
                <span class="small" style="font-weight:600">${esc(doc.name)}</span><br>
                <span class="tiny faint">${esc(doc.blurb)}</span>
              </span>
            </label>`).join('')}
        </div>
      </fieldset>

      <fieldset style="border:0;padding:0;margin:0">
        <legend class="label" style="margin-bottom:8px">Which format</legend>
        <div class="row-wrap" style="gap:5px">
          ${activeDoc.formats.map((f) => `<button class="chip${
            chosenFormat === f ? ' chip-ink' : ''}" data-format="${f}" style="cursor:pointer">${
            esc(E.FORMAT_LABELS[f].name)}</button>`).join('')}
        </div>
        <p class="tiny faint" style="margin-top:8px">${esc(E.FORMAT_LABELS[chosenFormat].note)}</p>
      </fieldset>

      <div class="row-wrap">
        <button class="btn btn-primary" id="download">Download the ${
          esc(E.FORMAT_LABELS[chosenFormat].noun)}</button>
        <span class="small dim" id="download-state"></span>
      </div>
      <p class="tiny faint">
        Generated here, in this tab, by the same code the app runs on a server. The PDF is drawn
        page by page; the Word file is a real .docx a mentor can type into.
      </p>
    </section>

    <section class="sheet stack" style="margin-top:16px">
      <div class="sheet-head"><div class="stack-s" style="gap:2px">
        <h2>Or copy it out</h2>
        <p class="tiny faint">
          Plain text, in the order of the real form — for pasting section by section into RIBA's
          own form, which is where the record actually lives.
        </p>
      </div>
      <span class="spacer"></span>
      <button class="btn btn-sm" id="copy">Copy</button></div>
      <div class="preview">${esc(markdown)}</div>
    </section>
  `)
}

const DOCUMENTS = [
  {
    id: 'sheet',
    name: 'The record sheet',
    blurb: 'The quarter, in the order of the real form.',
    formats: ['pdf', 'docx', 'md'],
  },
  {
    id: 'mentor-appraisal',
    name: 'PSA appraisal template',
    blurb: 'The quarter printed above the boxes your advisor fills in.',
    formats: ['docx', 'pdf'],
  },
  {
    id: 'supervisor-appraisal',
    name: 'Supervisor appraisal template',
    blurb: 'The same, for the architect who supervises you at work.',
    formats: ['docx', 'pdf'],
  },
]

let exportDoc = 'sheet'
let exportFormat = null

/**
 * Hand the viewer a file.
 *
 * Three surfaces, in order of how good the result is. Published on claude.ai
 * the page asks the host to save it, because a frame there cannot download on
 * its own. Opened from a file:// URL it is an ordinary blob download. If
 * neither works there is still the plain-text panel below, which is why that
 * panel exists rather than being a lesser duplicate of this one.
 */
async function offerFile(filename, bytes, mime) {
  const claude = globalThis.claude
  if (claude && typeof claude.use === 'function') {
    try {
      const downloads = await claude.use('downloads')
      if (downloads) {
        await downloads.save({ filename, data: new Blob([bytes], { type: mime }) })
        return 'saved'
      }
    } catch (error) {
      // "declined" is the viewer saying no, which is an answer, not a failure.
      return error && error.code === 'declined' ? 'declined' : 'failed'
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return 'saved'
  } catch {
    return 'failed'
  }
}

// --- Guide -------------------------------------------------------------------

function renderGuide() {
  const weak = E.WRITING_GUIDE ?? []
  return h(`
    <div class="stack-s">
      <h1>What good looks like</h1>
      <p class="dim">
        “Be more reflective” is useless advice. Two paragraphs side by side is not.
      </p>
    </div>

    <div class="stack" style="margin-top:16px">
      ${weak.slice(0, 4).map((item) => `
        <section class="sheet stack-s">
          <div class="sheet-head"><div>
            <span class="label">${esc(item.prompt ?? '')}</span>
            <h2 style="margin-top:3px">${esc(item.label ?? item.id ?? '')}</h2>
          </div></div>
          <div class="grid grid-2">
            <div class="stack-s">
              <span class="mark mark-revision">weak</span>
              <p class="small dim">${esc(item.weak ?? '')}</p>
            </div>
            <div class="stack-s">
              <span class="mark mark-signed">strong</span>
              <p class="small">${esc(item.strong ?? '')}</p>
            </div>
          </div>
          ${item.why ? `<p class="tiny faint">${esc(item.why)}</p>` : ''}
        </section>`).join('')}
    </div>

    <section class="sheet stack-s" style="margin-top:16px">
      <div class="sheet-head"><div>
        <span class="label">Where the real record lives</span>
        <h2 style="margin-top:3px">${esc(E.PEDR_SYSTEM.shortUrl)}</h2>
      </div></div>
      <p class="small dim">${esc(E.PEDR_SYSTEM.movedNote)}</p>
      <p class="tiny faint">
        This is a diary, not the record. Your mentor and PSA sign there, and printing a sheet there
        as final locks it — which is the whole argument for drafting somewhere else first.
      </p>
    </section>
  `)
}

// --- Wiring ------------------------------------------------------------------

function render() {
  const d = derive()

  $('#topnav').innerHTML = SCREENS.map((s) => `
    <a href="#${s.id}" ${state.screen === s.id ? 'aria-current="page"' : ''}>${s.label}</a>`).join('')

  $('#tabbar').innerHTML = SCREENS.map((s) => `
    <a href="#${s.id}" ${state.screen === s.id ? 'aria-current="page"' : ''}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${s.icon}"/></svg>
      ${s.label}</a>`).join('')

  const renderers = {
    record: renderRecord,
    dump: renderDump,
    calendar: renderCalendar,
    coverage: renderCoverage,
    sheet: renderSheet,
    guide: renderGuide,
  }

  for (const screen of SCREENS) {
    const node = $(`[data-screen="${screen.id}"]`)
    const active = screen.id === state.screen
    node.dataset.active = String(active)
    // Only the visible screen is drawn: building a quarter's sheet on every
    // keystroke of the dump box would be felt on a phone.
    node.innerHTML = active ? renderers[screen.id](d) : ''
  }

  window.scrollTo({ top: 0 })
}

function go(screen) {
  if (!SCREENS.some((s) => s.id === screen)) return
  state.screen = screen
  save()
  render()
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-go], [data-sample], [data-drop], [data-period], a[href^="#"], button')
  if (!target) return

  if (target.matches('a[href^="#"]')) {
    event.preventDefault()
    go(target.getAttribute('href').slice(1))
    return
  }
  if (target.dataset.go) return go(target.dataset.go)

  if (target.dataset.sample) {
    const box = $('#raw')
    if (box) { box.value = SAMPLES[target.dataset.sample]; box.focus() }
    return
  }

  if (target.id === 'parse') {
    const raw = ($('#raw')?.value ?? '').trim()
    if (!raw) return
    const result = E.parseDump(raw, {
      reference: today,
      projects: state.projects,
      knownPeople: [...new Set(state.entries.flatMap((e) => e.people))],
      me: state.name,
    })
    draft = { raw, entries: result.entries, kind: result.kind, warnings: result.warnings }
    render()
    return
  }

  if (target.id === 'back') {
    draft = { ...draft, entries: null }
    render()
    return
  }

  if (target.dataset.drop !== undefined) {
    const index = Number(target.dataset.drop)
    draft.entries = draft.entries.filter((_, i) => i !== index)
    render()
    return
  }

  if (target.id === 'commit') {
    const stamp = new Date().toISOString()
    state.entries = [...state.entries, ...draft.entries.map((entry, i) => ({
      ...entry,
      id: `new-${Date.now()}-${i}`,
      userId: 'demo-user',
      dumpId: null,
      verified: true,
      externalId: null,
      provenance: entry.provenance ?? null,
      createdAt: stamp,
      updatedAt: stamp,
    }))]
    draft = { raw: '', entries: null, kind: null, warnings: [] }
    save()
    go('record')
    return
  }

  if (target.dataset.period !== undefined) {
    sheetIndex = Number(target.dataset.period)
    render()
    return
  }

  if (target.dataset.format) {
    exportFormat = target.dataset.format
    render()
    return
  }

  if (target.id === 'cal-choose') {
    document.getElementById('cal-file')?.click()
    return
  }

  if (target.id === 'cal-sample') {
    readCalendar(SAMPLE_ICS, 'a week of calendar')
    return
  }

  if (target.id === 'cal-back') {
    calendarResult = null
    render()
    return
  }

  if (target.dataset.calDrop !== undefined) {
    const index = Number(target.dataset.calDrop)
    calendarResult.entries = calendarResult.entries.filter((_, i) => i !== index)
    render()
    return
  }

  if (target.id === 'cal-commit') {
    const stamp = new Date().toISOString()
    state.entries = [...state.entries, ...calendarResult.entries.map((entry, i) => ({
      ...entry,
      id: `cal-${Date.now()}-${i}`,
      userId: 'demo-user',
      dumpId: null,
      verified: true,
      provenance: entry.provenance ?? null,
      createdAt: stamp,
      updatedAt: stamp,
    }))]
    calendarResult = null
    save()
    go('record')
    return
  }

  if (target.id === 'download') {
    downloadCurrent(target)
    return
  }

  if (target.id === 'copy') {
    const text = $('.preview')?.textContent ?? ''
    navigator.clipboard?.writeText(text).then(
      () => { target.textContent = 'Copied'; setTimeout(() => { target.textContent = 'Copy' }, 1600) },
      () => { target.textContent = 'Select it instead' },
    )
    return
  }

  if (target.id === 'reset') {
    state = fresh()
    draft = { raw: '', entries: null, kind: null, warnings: [] }
    sheetIndex = null
    save()
    render()
  }
})

// Keep the box's text across a re-render triggered by something else.
document.addEventListener('input', (event) => {
  if (event.target.id === 'raw') draft.raw = event.target.value
})

document.addEventListener('change', async (event) => {
  if (event.target.name === 'doc') {
    exportDoc = event.target.value
    // A format the new document does not offer falls back to its first.
    exportFormat = null
    render()
    return
  }
  if (event.target.id === 'cal-file') {
    const file = event.target.files?.[0]
    if (!file) return
    readCalendar(await file.text(), file.name)
  }
})

/**
 * Build whichever document and format is selected, and hand it over.
 *
 * Rendering a PDF is a hundred milliseconds of work on a phone, which is long
 * enough to look broken, so the button says what it is doing.
 */
async function downloadCurrent(button) {
  if (!lastSheet) return
  const activeDoc = DOCUMENTS.find((x) => x.id === exportDoc) ?? DOCUMENTS[0]
  const format = exportFormat && activeDoc.formats.includes(exportFormat)
    ? exportFormat
    : activeDoc.formats[0]
  const label = document.getElementById('download-state')
  const say = (text) => { if (label) label.textContent = text }

  button.disabled = true
  say('Building it…')
  try {
    const shared = {
      content: lastSheet.content,
      periodStart: lastSheet.period.periodStart,
      periodEnd: lastSheet.period.periodEnd,
      candidateName: state.name,
      employment: state.employment,
    }
    const doc = activeDoc.id === 'sheet'
      ? E.buildSheetDocument({ ...shared, entries: lastSheet.entries, projects: state.projects })
      : E.buildAppraisalDocument({
          ...shared,
          role: activeDoc.id === 'mentor-appraisal' ? 'mentor' : 'supervisor',
        })

    const spec = E.FORMAT_LABELS[format]
    const filename = `${doc.meta.name}.${spec.extension}`
    const bytes = format === 'pdf' ? await E.renderPdf(doc)
      : format === 'docx' ? await E.renderDocx(doc)
      : E.renderMarkdown(doc)
    const mime = format === 'pdf' ? 'application/pdf'
      : format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'text/markdown;charset=utf-8'

    const outcome = await offerFile(filename, bytes, mime)
    say(outcome === 'saved' ? `${filename} — done.`
      : outcome === 'declined' ? 'No problem.'
      : 'This browser would not save it. Copy the text below instead.')
  } catch (error) {
    say('Could not build that one. The text below always works.')
    console.error(error)
  } finally {
    button.disabled = false
  }
}

if (location.hash) {
  const screen = location.hash.slice(1)
  if (SCREENS.some((s) => s.id === screen)) state.screen = screen
}

render()
