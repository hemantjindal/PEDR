# What this is for

## The criticism, accepted

Everything built so far, a spreadsheet does.

Rows of entries: a table. Hours by work stage: a pivot. A weekly score:
`=IF(COUNTA(...))`. Coverage: conditional formatting. Missing weeks: a filter.
Even the quarterly sheet is a mail merge. The parser is the one thing Excel
cannot do, and a parser is a convenience, not a product — it makes data entry
faster for a thing whose value was never in the data entry.

So the honest verdict on version one: **a nicer spreadsheet with domain
constants baked in.** Worth something. Not worth a company, and not worth
anybody switching to.

The reason is that it answered the wrong question. It asked *have you recorded
your experience?* — and treated the record as the goal.

## The record is not the goal

Nobody wants a PEDR. What people want is:

1. To pass Part 3.
2. To not discover at month twenty-two that a year of it was unusable.
3. To have actually got the experience, not just written it down.

The PEDR is instrumental to all three, and it is instrumental in a specific
way that everyone forgets while filling it in:

> **Your PEDR is the question bank for your oral exam.**

Part 3 ends in a viva. The examiners have read your record. They ask you about
what is *on the page* — your projects, your stages, the things you wrote in the
reflective boxes. A candidate is not failed for a gap they declared. They are
failed for a claim they cannot defend.

That reframes everything:

- A vague entry is not untidy. It is a question you will be asked and cannot
  answer.
- A stage full of observed hours is not a small thing. It is an examiner
  saying "describe a valuation you ran" to somebody who has only watched one.
- A criterion tagged on thin evidence is *worse than an empty one*, because it
  invites the question while providing nothing to answer it with.

An empty cell in a spreadsheet is a missing value. An empty cell in a PEDR is
a question with no answer behind it. Nothing in Excel knows the difference.

## The thesis

**A tool that records is a spreadsheet. A tool that interrogates the record the
way an examiner will — and turns what you cannot answer into what to go and do
this month — is a product.**

That is a closed loop, and the loop is the thing:

```
   log  ──▶  interrogate  ──▶  exposure  ──▶  a specific ask  ──▶  log
              (the viva)      (what you        ("get on a
                               cannot          valuation")
                               defend)
```

Excel can hold step one. It cannot do steps two, three or four, because they
require knowing what a Part 3 examiner asks, what a good answer contains, and
what experience produces one.

## What follows from it

Ranked by how much of the thesis each carries.

**1. The examiner.** Generate the questions your own record invites — grounded
in what you actually wrote, quoting it back — and grade each one by whether you
could answer it: *answerable* (specific, participant evidence), *thin* (some
evidence, vague or observed), or **exposed** (you have claimed it and have
nothing behind it). Exposure is the number that matters, and no other tool in
this space produces it.

**2. Readiness, not completeness.** "You are 62% through the hours" is a
spreadsheet's answer. "You can defend eleven of the nineteen questions your
record invites, and four of the eight you cannot are PC5" is the answer that
changes what you do on Monday.

**3. Rehearsal.** The viva is unpractisable — nobody will sit and grill you
from your own record. A tool that will, and that critiques the answer against
what examiners look for, is worth more than every logging feature combined.

**4. The Case Study, pre-loaded.** Part 3 also demands a substantial case study
on one project. The record already knows which project has the hours, the
stages, the friction and the people. Nominating it and pre-populating it from
the entries turns a blank document into an edit.

**5. Multiplayer.** A PEDR has three signatures on it. Today the mentor gets an
emailed Word file. A mentor who can see the record, comment on a quarter and
sign it is a network; a spreadsheet emailed round is not.

**6. The benchmark.** "You are at fourteen months with nothing at Stage 6" is
useful. "…and four in five people at your stage have some" is a reason to have
the conversation this week. Needs users; the shape should anticipate it.

## What this is not

It is not the official record — RIBA's system at register.architecture.com/pedr
is, and that is where the signatures go. It is not a substitute for a PSA. And
it does not write your answers for you: a viva answer that is not yours is a
viva you fail, slowly, over about ninety seconds.

Its job is narrower and harder: to make sure that by the time you sit down in
front of two examiners, there is nothing in your record you cannot talk about.

---

*Source for the exam structure and what examiners ask: see*
[`RESEARCH.md`](RESEARCH.md).
