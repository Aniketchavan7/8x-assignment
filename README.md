# 8x Engineering Assignment

Welcome, and thanks for taking the time. **This README is the only file you need
to read to do the assignment.** It has everything: what to build, how to set up,
how you're graded, and how to submit. The specific problems for the bigger task
live in [`TICKETS.md`](./TICKETS.md), and your write-up goes in
[`FINDINGS.md`](./FINDINGS.md).

> **Read this entire file before you start the clock.** It's short, and it's
> deliberately complete — skipping ahead will make you miss crucial details
> (machine setup, how session logging works, the two parts, and how to submit).
> Five minutes here saves you time later.

> This repository is a slice of a real production codebase. You'll be pushing
> your work to a public repo, so don't add anything to it we haven't given you —
> no credentials, and nothing from another employer.

---

## What this is

A **timed, single-sitting** assignment on a real, unfamiliar codebase. Plan for
about **2 hours** once you start.

We are not testing trivia or whether you can write a regex from memory. We are
testing **how you work with AI coding tools** under a real clock: how you
navigate a large codebase you've never seen, how you direct agents, how you
verify what they give you, and how you reason about a genuinely messy data
model. **Use AI aggressively — Claude Code, Codex, Cursor, whatever you reach
for. We expect it.**

There are two parts, plus a short video at the end:

- **Part 1 — Bugs (~30 min):** a few small, self-contained backend bugs, each
  caught by a failing unit test. Pure warm-up and speed.
- **Part 2 — Investigation (~90 min):** a real, tangled payments problem. The
  hard one. You are **not** expected to fully fix it — we want to see how much of
  it you can understand and how you'd approach it.
- **The video (~10 min):** a screen recording where you introduce yourself and
  walk us through what you built. See [The video](#the-video-required) below —
  read it now so you know what to capture, and leave time for it.

### Two ground rules

- **One sitting.** Start when you're ready and run straight through. The
  countdown on the assignment page is the source of truth.
- **You will not finish everything. That's intended.** Part 2 is bigger than the
  time allows. We care more about how far you get and how you think than about a
  complete fix.

### A suggestion

Part 1 is a set of mostly independent bugs, and Part 2 is a separate
investigation. There is more here than one agent working serially gets through
comfortably. If you have a way to run **multiple agents in parallel** (git
worktrees, [Conductor](https://conductor.build),
[Superset](https://superset.sh)), this is a good time to use it. Not required —
just how we'd approach it.

---

## Setup

You need **Docker** and **Node + pnpm**. You do **not** need Supabase or any
cloud credentials. Nothing here talks to a real server.

```bash
pnpm install                              # install dependencies
cd ASSIGNMENT && docker compose up -d      # local Postgres for Part 2, then: cd ..
```

That's it. The Next.js app is here for you to **read and navigate** — you don't
need to (and can't) boot the full web server, since it depends on services we
haven't given you. Part 1 is verified with unit tests; Part 2 is verified
against the local database.

---

## Part 1 — Bugs (~30 minutes)

A few small backend bugs, each with a **failing unit test**. Run the suite,
make it green, keep the tests honest (don't just hard-code the expected value).

```bash
pnpm test
```

You'll see **three failing test files** — these are the three bugs. All are
backend logic under `lib/`; you won't touch any frontend code:

1. **Rate limiter** — `lib/modules/phone-verification/rate-limit.ts`

   This module caps how many times something can happen inside a time window
   (it backs things like SMS verification attempts, so a user can't spam codes).
   The bug: it allows **one more attempt than the configured maximum** before it
   starts blocking — so a limit of 3 actually lets through 4. The failing test
   sets a small limit, makes that many calls, and expects the next one to be
   rejected.

2. **Lookup classifier** — `lib/admin/lookup/classify.ts`

   An internal admin tool takes whatever an operator pastes into a search box
   and classifies it — a post ID, a profile URL, an ad code, a username, and so
   on — so the rest of the system knows how to resolve it. The bug: some **valid
   ad codes are being classified as the wrong kind**, so those lookups would go
   down the wrong path. The failing test feeds known ad codes and expects them
   to come back as `kind: 'ad-code'`.

3. **CPM earnings** — `lib/modules/cpm/utils.ts`

   This calculates how much a creator earns on a CPM (pay-per-1,000-views)
   campaign, given a view count and a rate. The bug: the result is **off by an
   order of magnitude** — earnings come out far lower than they should for the
   same views and rate. The failing tests check known view/rate combinations
   against the dollar amounts they should produce.

Run `pnpm test:watch` to re-run as you edit. Each failure shows the input, what
the test expected, and what the code actually returned — that diff points you
at the wrong behaviour. Open the named module, read the failing test for the
intended contract, then fix the logic (not the test).

> We run a larger hidden test suite over the same modules when grading, so
> hard-coding expected values won't hold up — fix the actual logic.

---

## Part 2 — The payment investigation (~90 minutes)

This is the real one. Open **[`TICKETS.md`](./TICKETS.md)**: three support
tickets that are all symptoms of the same underlying problem in how this product
calculates creator pay. Reproduce them against the local database (the tickets
file shows you the exact queries), then figure out what's going on.

**We do not expect you to fully fix this.** A clear, correct *understanding* is
worth more here than a half-finished patch.

### How to dig in

You have two views of the same system — use both:

- **As code:** `ASSIGNMENT/db/init.sql` defines every table *and* the triggers
  and functions that actually compute a post's pay. Reading it top to bottom
  tells you exactly how each number gets produced.
- **As a live database:** once `cd ASSIGNMENT && docker compose up -d` is
  running, the schema and seed are loaded. Connect and poke at the data:

  ```bash
  psql postgresql://postgres:postgres@localhost:5433/assignment
  ```

  Inside psql: `\dt` lists the tables, `\d managed_creator_posts` shows a
  table's columns and constraints, `\df` lists the functions/triggers, and any
  `SELECT` reads the seeded rows. Prefer a GUI? Point TablePlus / DBeaver /
  DataGrip at `localhost:5433` (user `postgres`, password `postgres`, database
  `assignment`).

A productive loop: reproduce a ticket with a query, find the trigger or function
in `init.sql` that produced that number, then compare it against what the
brand's campaign config says the creator *should* be paid. The gap between those
two is where the problem lives — the rest is figuring out *why*.

### Where the money lives

Pay for a single post is derived from values spread across several tables —
`jobs`, `managed_creators`, `brand_campaigns`, `managed_creator_posts`, and the
`creator_transactions` ledger. The logic that freezes and recalculates a post's
pay lives in **database triggers**, defined in `ASSIGNMENT/db/init.sql`, and the
app code reads those values back in several different places. Start from the
tickets, reproduce against the database, and trace where each number comes from.

### Your deliverable: `FINDINGS.md`

Fill in [`FINDINGS.md`](./FINDINGS.md). At minimum:

1. **Where the money lives** — which table/column is the real source of truth
   for each value, and which copies are redundant or go stale?
2. **Root cause of each ticket** — why $1? why no bonus? why three different
   totals?
3. **How you'd fix it** — the direction, not necessarily code. What becomes the
   single source of truth, what stops being written, what needs a one-time data
   migration?

Fix whatever you have time for, but the write-up is what we read most closely.

---

## The video (required)

At the end, record a **~10 minute screen recording** and upload it on the
assignment page alongside your repo link. Two things, in this order:

1. **Introduce yourself (~2 min).** Who you are, what you've built before, and
   how you normally work with AI coding tools.
2. **Walk us through the technical work (~8 min).** Share your screen and go
   through what you actually did: the Part 1 fixes and why each one was the right
   fix, then your Part 2 investigation — how you traced the payment numbers, what
   you concluded in `FINDINGS.md`, and what you'd do next. Show the code and the
   queries; don't just narrate from memory.

Keep it unedited and unscripted — we're not grading production value, and a rough
recording of you thinking out loud is worth far more than a polished one. Any
screen recorder works (QuickTime, Loom, OBS, macOS `Cmd+Shift+5`). Export as
**MP4, MOV, or WebM**, up to 2 GB.

> Leave yourself ~10 minutes at the end for this. It is part of the assignment,
> not an optional extra — submissions without a video can't be reviewed.

---

## Logging (required)

We read your AI session logs as part of grading, so we need your Claude Code and
Codex transcripts. Capturing is already wired into this repo. It captures only
**this repository's sessions** — this folder and any git worktrees of it, so
parallel agents are included, but nothing from your other projects:

- **Claude Code** auto-saves each session when it ends.
- **Before you submit, run this once** to capture everything (Claude + Codex):

  ```bash
  pnpm logs:capture
  ```

- Then **commit the folder**:

  ```bash
  git add .claude-logs && git commit -m "session logs"
  ```

If you use a different AI tool, export its transcript into `.claude-logs/`
before committing. We're looking at how you prompted and how you reacted to what
the AI returned.

> **Verify your logs before you submit.** The capture script reads from your
> local Claude Code / Codex storage, and on some machines that can misbehave
> (different config, a custom log path, permissions). After running
> `pnpm logs:capture`, open the `.claude-logs/` folder and confirm your sessions
> are actually there and readable. If anything is missing or looks wrong, just
> ask Claude or Codex to debug `scripts/capture-logs.mjs` and fix it for your
> setup — making sure every session from your assignment ends up captured is
> part of the task.

---

## Submitting

1. Push your work to a **public** GitHub repo. Keep it public — that's how we
   read it, and it saves you an access dance at the end of a timed exercise.
2. Make sure you've committed:
   - your code changes (ideally a commit or PR per piece of work),
   - `FINDINGS.md`,
   - your `.claude-logs/`,
   - a short **`SUMMARY.md`** answering:
     - What did you get done, and what did you not get to?
     - For Part 2: how did you spot the cause, and where did you get to?
     - With one more hour, what would you do next?
3. Record your **~10 minute video** (see [The video](#the-video-required)).
4. Go back to the assignment page and submit **both**: your repo URL and your
   video file. The submission isn't complete until both are in — upload the
   video before the clock runs out.

Don't rewrite git history or backdate commits — we read the real timeline, and
an honest messy history beats a suspiciously clean one.

---

## How you're graded

- **Part 1:** how many bugs are correctly fixed (hidden tests), and whether your
  fixes are clean and targeted rather than papering over the symptom.
- **Part 2:** the depth and correctness of your understanding in `FINDINGS.md`.
- **How you worked:** your session logs and commit history — prompt quality,
  whether you verified the AI's output, how you prioritized, and (bonus) whether
  you ran agents in parallel.
- **Your video:** how clearly you can explain the work and the reasoning behind
  it. We're checking that you actually understand what you shipped.

Good luck. Move fast, but read before you trust.
