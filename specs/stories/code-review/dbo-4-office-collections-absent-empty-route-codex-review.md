# Adversarial fact-check — dbo-4-office-collections-absent-empty-route, TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written.

## Read this before anything else — this is NOT a normal code-diff review

DBO-4 was a **read-only investigation story**: no source code changed. The diff at
`specs/stories/code-review/dbo-4-office-collections-absent-empty-route-diff.txt` (repo root
`D:\Terra Mortis\TM Suite`) touches only documentation/spec/tracking files: the story file itself,
`specs/epic-dbo-database-ownership.md`, `specs/reference-data-ssot.md`, `specs/deferred-work.md`, and
`specs/stories/sprint-status.yaml`. There is no separate "spec" to keep this review blind from —
the deliverable IS a set of factual claims about the live codebase and live production database,
written down for the first time. Your job is to **fact-check those claims against the real code**,
not to review an implementation against acceptance criteria written elsewhere.

**Ground rules:**
- You have full repository read access from the start. There is no blinding phase in this review.
- **Do NOT modify, commit, or push anything.**
- **NEVER connect to or query live `tm_suite` (MongoDB Atlas) yourself, under any circumstances.**
  This story's own claims about live data (document counts, specific document shapes) were gathered
  by a prior session with direct database access, which you do not have and must not attempt. Verify
  everything else — code paths, git history, the migration script's logic — but treat the live-data
  claims (exact counts, the two document `_id` values, their `dots` contents) as **reported, not
  independently verifiable by you** and say so explicitly rather than either accepting or rejecting
  them.
- **NEVER invoke `server/scripts/migrate-office-purchases-to-seats.mjs` directly** (with or without
  `--apply`) — it connects to whatever `MONGODB_URI`/`MONGODB_DB` is configured, which defaults to
  live `tm_suite`. You may read the script in full and reason about its `planMigration`/
  `applyMigration` logic statically.
- This repo sits inside an umbrella workspace (`D:\Terra Mortis\`) alongside sibling repos (`TM
  Wiki`, `TM Cockpit`, `TM Herald`). Do not open, read, or reference any of them.
- Report the exact commands you ran and their real output, including anything you could not run.

## What this story claims — verify every one of these against the real code

The story (`specs/stories/dbo-4-office-collections-absent-empty-route.md`) makes these specific,
checkable claims. Read the actual cited files yourself and confirm or refute each one:

1. **"No document = 0" convention claim.** `server/routes/office-manoeuvre-rank.js`'s two `PUT`
   routes both use `upsert: true`; `server/routes/office-merit-dots.js`'s one `PUT` route uses
   `upsert: true`; `server/routes/office-seats.js`'s `resetManoeuvreRank` function (around line
   501-544) uses `upsert: false` with an inline comment naming this exact convention. Both
   collections' `GET /` handlers default a missing key to `0`/`{}`. **Read all four call sites and
   confirm this is accurate, not paraphrased-generously.**
2. **`office_actions` has no silent-failure write path.** The story claims the `insertOne` into
   `office_actions` inside `PUT /:id/accept` (`server/routes/office-actions.js`) happens inside a
   MongoDB transaction (`dbSession.withTransaction`), and that the surrounding `catch` block
   re-throws any error that is not an instance of the file's own `RouteResponse` class rather than
   swallowing it. **Read the full `accept` handler and its catch block and confirm this holds** — is
   there truly no path where a write failure is silently absorbed?
3. **The migration-gap claim's LOGIC (not the live counts).** The story claims
   `server/scripts/migrate-office-purchases-to-seats.mjs`'s `planMigration` function would classify a
   document keyed by an office category name (e.g. `"Enforcer"`) by looking it up against
   `office_seats.office_category`, and would refuse (not guess) if zero or more-than-one seat matches
   that category. Read `planMigration` and confirm this logic is real and matches the story's
   description — and separately assess: **is the story's reasoning about the compounding hazard
   correct?** (An ST setting a merit dot on an affected seat through the CURRENT, seat-keyed
   `office-merit-dots.js` route before the migration runs would create a new seat-keyed document;
   trace whether `planMigration`, run afterward, would then genuinely treat that seat as
   "already-migrated" and leave the old category-keyed document untouched — read the
   `already-seat-keyed` branch and confirm.)
4. **The OXP merge-status correction.** The story and its sprint-status/epic-doc corrections claim
   `oxp-1` through `oxp-6` and `oxp-11` are already reachable from `origin/main` (fetch first,
   `git log origin/main` — do not trust a local branch that may be stale). Confirm or refute.
5. **`reference-data-ssot.md`'s new "Office" section.** Check the new section's auth-boundary claims
   (which routes are open-read vs ST-only) against the real `requireRole('st')` placement in
   `server/routes/office-manoeuvre-rank.js`, `office-merit-dots.js`, `office-actions.js`,
   `office-seats.js`. Flag anything overstated, understated, or simply wrong.
6. **The "no code defect, Task 6 N/A" conclusion.** This is the highest-value thing to challenge.
   The story concludes no code fix was needed anywhere in the three office route files or the
   migration script. **Actively hunt for a counter-example**: read all four route files
   (`office-manoeuvre-rank.js`, `office-merit-dots.js`, `office-actions.js`, `office-seats.js`) and
   the migration script in full, looking specifically for anything the story's own narrow
   investigation (framed around "does absent/empty degrade gracefully" and "is there a silent
   failure") might have missed — validation gaps, auth gaps, a route that assumes a document exists
   when it does not, an unhandled error path, anything at all. If you find something, name it
   precisely: file, line, triggering input, observable consequence.

## Output

Write findings to
`specs/stories/code-review/dbo-4-office-collections-absent-empty-route-codex-findings.md`, grouped
`## High` / `## Medium` / `## Low`. For each of the 6 claims above, state plainly: **CONFIRMED**,
**REFUTED**, or **PARTIALLY CONFIRMED** (with the discrepancy named), plus any additional finding from
claim 6's active hunt as its own entry with:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence**
- **The observable consequence**
- **Confidence**

Close with a **Validation notes** section: every command you ran and its real result, anything you
could not run and why (the live-DB claims should appear here as deliberately unverified, not
accepted), and confirmation you modified nothing.
