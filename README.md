# PEDR

A logging tool for the RIBA Professional Experience and Development Record — the
record of practical experience you need before you can sit the Part 3 exam and
register as an architect in the UK.

**This is not the official record.** RIBA's system at
[register.architecture.com/pedr](https://register.architecture.com/pedr) is, and
that is where your Employment Mentor and PSA sign. This is the diary that makes
filling that in take twenty minutes instead of a weekend.

> PEDR moved off `pedr.co.uk` and onto RIBA's own registration system. Sign in
> with the same email address you used on the old one or your existing sheets
> will not be there.

---

## The problem it solves

Everyone doing Part 3 is told to keep a daily diary. Almost nobody does, because
the tool is never where you are when the thing happens. So the sheet gets
written from memory two months later, the hours against work stages become
fiction, the reflective boxes say "I learned a lot about contract
administration", and nobody finds out that Stage 5 is empty until month 22.

There is also a deadline almost nobody knows about: a record sheet covers up to
three months and must be **completed within two months of the end of the period
it covers**. Miss it and the sheet is late — your PSA can no longer give useful
feedback, and a run of late sheets is a number an examiner can count against
your time management. Nothing in the official system makes that visible.

The research behind all of this, with sources, is in
[`docs/RESEARCH.md`](docs/RESEARCH.md).

## What it does

**Dump.** One box on your phone. Type it badly — days, half-sentences, no
punctuation. It comes out as dated, structured entries with projects matched,
durations read, people found, RIBA stages and Professional Criteria inferred,
and anything that went wrong captured.

It also reads **Microsoft Teams conversations** (four paste formats plus meeting
transcripts) and **practice timesheet exports** (CSV/TSV, columns matched by
name), and works out which it has been given.

**Score.** Each week is marked out of 100: logging at all is 40, naming a
project 15, two or more specific activities 15, naming who you dealt with 10,
and recording something that went wrong 20. That last weighting is the
opinionated part — the reflective boxes are what examiners actually read, and a
week where everything went smoothly gives you nothing to write in them. A
frictionless week caps at 80.

**Find the holes.** Missing weeks as runs, not a wall of dates. Coverage across
RIBA stages 0–7 and PC1–PC5, so a specialised role shows up as a gap at month 6
when it is a conversation, rather than month 22 when it is a crisis.

**Watching, and then doing.** The record sheet has *two* hour columns against
every work stage — participant and observer — and almost nobody fills in the
second one. Both count: sitting in on your first valuation is how you learn
what a valuation is. What matters is the balance. A record still mostly
observed at month 20 is a problem; one that starts half observed and ends
almost entirely participant is exactly the "development over time" the final
summary has to demonstrate, and it is the hardest thing to evidence from
memory. So participation is a field on every entry, read from how you write it
("sat in on", "shadowed", "was shown"), and the shift out of watching gets its
own view.

**Deadlines.** Every quarter gets a due date, a countdown, and a late count.
The sign-off chain shows how long a sheet has been sitting with your mentor and
with your PSA.

**Calendar.** Link your Outlook or Teams calendar — a published `.ics` link
that syncs, or a one-off file — and a quarter of meetings becomes a quarter of
dated entries, with the attendees as the people you dealt with. That last part
is the one thing no timesheet records and nobody reconstructs from memory. The
import is mostly filtering: cancelled meetings, anything you declined, anything
marked free, all-day blocks that are not leave, and the standing furniture of a
week all go, and everything dropped is listed with a reason. Be clear-eyed
about the limit, which the screen states too: **a calendar records meetings,
not work.** Six hours on a package appears in no calendar. What comes in is the
skeleton of a week.

**Sheets.** A draft of each quarterly record sheet, laid out in the order of the
real one — as **PDF** (what Part 3 uploads want), **Word** (what a mentor
comments in), **plain text** (easiest to paste into RIBA's form) or **CSV**.
The choice is yours; guessing on your behalf just means you convert it
yourself.

**Appraisal templates.** The part of the process nobody warns you about: the
appraisal is *not* completed online — RIBA generates a template when you print,
or hands you a Word file to fill in and upload. So a mentor's half of the
quarter happens in an attachment, usually with no context in it beyond a blank
box. This generates that file with the quarter printed above the boxes: the
projects, the hours, the stages covered, the criteria that were *not* touched,
and your own words. One for your PSA, one for your employment supervisor.

**Reminders.** An iCalendar feed you subscribe to once: a nudge every Friday and
every sheet deadline, with a fortnight's warning. Plus a cron endpoint for a
scheduled digest.

**Guidance.** A glossary, a first-hour checklist, an FAQ, and worked examples of
weak-versus-strong writing for each reflective box — because "be more
reflective" is useless advice and two paragraphs side by side is not.

## On a phone

It installs to the home screen: its own icon, its own window, no browser bar.
Settings has the steps, and on Android and desktop it offers the install
directly.

Worth being straight about what that is. **It is a web app you install, not an
App Store download.** There is nothing to search for in the App Store, and
Apple gives web apps no install prompt at all — on iOS somebody has to go
through the Share menu themselves, which is why the app tells you how. What you
get is an icon, a standalone window, and the offline behaviour below. What you
do not get is anything only a native app can do. For what a PEDR needs, that is
the whole list.

**With no signal**, which is the actual point:

- Pages you have opened before still open, and a red banner says everything on
  screen is as old as the last time it loaded — because a dashboard quietly
  showing last week's figures, with a deadline that has since passed, is worse
  than no dashboard.
- The box still takes text. A note written on a site visit is kept on the phone
  and appears on the dump screen the moment you are back.
- It is **not** posted to your record automatically. Nothing reaches a record a
  mentor signs without a human reading it first, and that rule does not get an
  exception for being offline. A queued note comes back as a note, to be parsed
  and reviewed like any other.

## Two rules the code enforces

1. **Hours are never invented.** No stated duration means zero, not a guess.
   Filling blanks is a separate, explicit action that marks every minute it
   estimated. A mentor signs these records, and a plausible fabricated number is
   worse than an obvious blank.
2. **The model can never set hours.** The optional Anthropic pass may improve
   wording and tagging, and may only choose values that exist — a project on
   your own list, a stage in 0–7, a criterion in PC1–PC5. Everything else is
   discarded in code, not merely discouraged in the prompt. Without an API key
   the deterministic parser does the whole job.

## Try it without installing anything

The whole domain is pure, dependency-free code, so the app runs in a browser on
its own:

```bash
npm install && npm run demo      # -> demo/dist/pedr-demo.html
```

Open that file on a phone or a laptop. One HTML page, no server, no database:
the dashboard, the register, the dump box, coverage, and a generated record
sheet, over a demo record of a Part 2 assistant sixteen months in — with the
gaps and thin weeks a real record has. What you type stays in the tab.

Nothing in it is a copy. The engine is bundled from `src/lib`, the stylesheet
is the app's own `globals.css` read verbatim, and the demo record is generated
by `src/lib/demo-record.ts` — the same function `npm run seed` writes into the
database. A demo built from its own fixture drifts into being a flattering
mock-up, which is worse than no demo.

## Running it

```bash
npm install
cp .env.example .env        # the defaults work as-is for local development
npm run db:push             # creates the SQLite file and its tables
npm run seed                # optional: a demo account with a realistic record
npm run dev
```

Then sign up, or sign in as `demo@pedr.local` / `demo-password-2026` if you
seeded.

```bash
npm test        # 435 tests
npm run build
```

### Configuration

| Variable | Needed | What it does |
|---|---|---|
| `DATABASE_URL` | yes | `file:./data/pedr.db` locally; a `libsql://` URL in production |
| `DATABASE_AUTH_TOKEN` | remote DB only | Turso/libSQL auth |
| `SESSION_SECRET` | yes | Set it to something long and random |
| `APP_URL` | recommended | Used in calendar invitations and reminders |
| `ANTHROPIC_API_KEY` | optional | Switches on the model pass. Everything works without it |
| `CRON_SECRET` | optional | Protects `/api/cron/reminders` |
| `REMINDER_WEBHOOK_URL` | optional | Where the cron digest is POSTed |

### Deploying

Vercel plus a libSQL database (Turso) is the tested path: set `DATABASE_URL`
and `DATABASE_AUTH_TOKEN`, run `npm run db:push` once against it, and
`vercel.json` already registers the Friday cron.

No email provider is wired in. Forcing everyone who runs their own copy to sign
up for one is worse than the calendar feed they already have, so the cron
endpoint reports what it found and POSTs to `REMINDER_WEBHOOK_URL` if you set
one.

## The design

**Site Notice.** The app has one job — stop you drifting — so it behaves like
site signage. Hard 2px rules, flat colour blocks, no radius, no shadow, no
gradient. Archivo Black where something has to read across a room, Archivo
everywhere else, both self-hosted so there is no third-party font request.

Colour does exactly three jobs and nothing else:

| | |
|---|---|
| **Signal** yellow | the thing you are working towards |
| **Alarm** red | late, missing, wrong |
| **Ink** black | everything else, including every action |

If a fourth colour appears, something has gone wrong. Buttons are ink, not
yellow, because a yellow button would compete with the one thing yellow is for.
Dark mode keeps the yellow on black rather than inverting it — that is the
signage logic, not a departure from it.

The dashboard leads with two bands: the date you can sit the exam, and what is
overdue. Those are the only two facts that change what you do today.

## How it is put together

```
src/lib/pedr/       the domain — regulatory constants, week maths, scoring,
                    coverage, progress, deadlines, sheet generation, guidance
src/lib/ingest/     the parsers — dates, durations, people, classification,
                    project matching, Teams, timesheets, calendars, and the
                    optional model pass
src/lib/db/         schema and client
src/app/            Next.js App Router: pages and route handlers
src/lib/export/     one document model, three renderers (PDF, Word, Markdown)
tests/              435 tests, mostly against the domain and the parsers
```

Two decisions worth knowing:

- **A calendar date is a `'YYYY-MM-DD'` string, never a `Date`.** Dates get
  compared, sorted and shown to people in different timezones; a JS `Date` will
  silently move a Friday site visit onto Thursday for half the world.
- **Experience is counted in weeks logged, not hours.** The regulations are
  expressed in months served. Counting hours would let a run of 60-hour weeks
  buy months you did not serve, which is not how any PSA reads a record.

## Accuracy

Every regulatory value lives in one file, `src/lib/pedr/constants.ts`, with a
source and an `asOf` date, and each check is flagged as either a real rule or
this tool's own opinion so the interface can say which is which. They were
assembled from RIBA and ARB guidance in September 2026. **Check anything you are
going to rely on** — the authoritative sources are RIBA's own guidance and your own PSA.
