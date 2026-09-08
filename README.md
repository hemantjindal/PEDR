# PEDR

A logging tool for the RIBA Professional Experience and Development Record — the
record of practical experience you need before you can sit the Part 3 exam and
register as an architect in the UK.

**This is not the official record.** RIBA's system at [pedr.co.uk](https://www.pedr.co.uk)
is, and that is where your Employment Mentor and PSA sign. This is the diary
that makes filling that in take twenty minutes instead of a weekend.

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

**Deadlines.** Every quarter gets a due date, a countdown, and a late count.
The sign-off chain shows how long a sheet has been sitting with your mentor and
with your PSA.

**Sheets.** A draft of each quarterly record sheet, laid out in the order of the
real one, exportable as Markdown or CSV.

**Reminders.** An iCalendar feed you subscribe to once: a nudge every Friday and
every sheet deadline, with a fortnight's warning. Plus a cron endpoint for a
scheduled digest.

**Guidance.** A glossary, a first-hour checklist, an FAQ, and worked examples of
weak-versus-strong writing for each reflective box — because "be more
reflective" is useless advice and two paragraphs side by side is not.

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

The parser is pure, dependency-free code, so it runs in a browser on its own:

```bash
npm install && npm run demo      # -> demo/dist/pedr-demo.html
```

Open that file. One HTML page, no server, no database, no network — paste a
rough week and watch it get filed. It bundles the real engine from `src/lib`
rather than a copy, so the demo cannot drift into being a flattering mock-up of
the app.

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
npm test        # 308 tests
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

The record *is* a drawing set, so the interface uses the grammar every
architect already reads: a title block, sheet references, drafting annotation,
hairlines instead of borders, and revision marks. Grammar, not skeuomorphism —
no paper texture, no fake pencil, no drop shadows.

Colour is rationed to make it mean something. The page is ink on paper.
**Red means one thing — late, missing, wrong** — and appears nowhere else.
Buttons are ink, because the subject is a document and the action on a document
is drawn in the same ink. Even the register's density ramp is ink rather than
blue: on a page that is otherwise entirely hairlines, a blue grid is the only
saturated thing on screen and it takes the page over.

Every ramp is validated rather than eyeballed — monotone lightness, adjacent
step separation, and a light end that clears 2:1 against the surface it
actually sits on, in both themes. Type is IBM Plex Sans and Mono, self-hosted,
picked because it was drawn for technical contexts and carries the slightly
mechanical warmth of drawing-office lettering without being a novelty face.

## How it is put together

```
src/lib/pedr/       the domain — regulatory constants, week maths, scoring,
                    coverage, progress, deadlines, sheet generation, guidance
src/lib/ingest/     the parsers — dates, durations, people, classification,
                    project matching, Teams, timesheets, and the optional model pass
src/lib/db/         schema and client
src/app/            Next.js App Router: pages and route handlers
tests/              308 tests, mostly against the domain and the parsers
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
going to rely on** — the authoritative sources are pedr.co.uk and your own PSA.
