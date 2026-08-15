# Adversarial review - dbo-2-character-dossier-schema-and-reveal (`character_dossier` schema, and the `fact_key` mint TM Wiki's reveal path is waiting on), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. Do not open a file a later pass
   grants you until you reach that pass. In particular: **the story spec is deliberately NOT in the
   diff.** Do not go looking for it during the earlier passes. The final pass will hand you the path.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/dbo-2-character-dossier-schema-and-reveal-codex-findings.md`, before you
   open anything the next pass allows. Do not revise an earlier pass's findings in light of what a
   later pass taught you - if a later pass contradicts an earlier one, say so as a new finding and
   leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/dbo-2-character-dossier-schema-and-reveal-diff.txt` and is relative to
  that root, taken against base commit `a926f7bc` (so `git diff a926f7bc <this-branch-tip>` reproduces
  it - the actual commit under review is `2b187a7d` on branch
  `ms/dbo-2-character-dossier-schema-and-reveal`).
- The diff is **deliberately scoped to source and tooling only** (the three new files under
  `server/schemas/`, `server/scripts/`, `server/tests/`). Story-spec and tracking edits
  (`specs/stories/dbo-2-character-dossier-schema-and-reveal.md`, `specs/stories/sprint-status.yaml`,
  `specs/epic-dbo-database-ownership.md`, `specs/deferred-work.md`) are excluded from it on purpose,
  so the earlier passes stay genuinely blind to the author's own account. Do not treat their absence
  as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This is one repo in a multi-repo umbrella workspace
  (`D:\Terra Mortis\`). Sibling repos `..\TM Wiki`, `..\TM Cockpit`, `..\TM Herald` are present on disk
  - you MAY **read** `..\TM Wiki\server\routes\characters.js` and
  `..\TM Wiki\specs\tm-wiki-schema.md` if you need to verify a specific claim this diff's comments make
  about TM Wiki's own code (see Pass 3b below), but do not modify anything in any sibling repo, and do
  not explore them beyond what a specific claim requires.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards**: the DB-backed half of the test suite (`describe.skipIf(!dbAvailable)`)
  needs a reachable MongoDB - either a local `mongod` or genuine Atlas connectivity via this repo's
  `server/.env`. If it skips rather than runs, **say so explicitly and do not report those assertions
  as verified** - a skip is not a pass. Try running it; if it skips, name that as an environment gap in
  your Validation notes rather than reasoning about the DB-backed tests statically.
- **Blast radius note**: nothing in `server/routes/` reads or writes `character_dossier` today (this
  diff's own header comments assert that - verify it with a grep rather than trusting it), so this
  diff's only live blast radius is `server/scripts/dbo-2-dossier-fact-key-backfill.mjs` being run with
  `--apply` by a human later, against live production data (`tm_suite`). A mistake in that script's
  write path does not break a running server today, but it corrupts real character data if it is ever
  run for real. Weight the script review accordingly.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `cd server && npx vitest run tests/dbo-2-dossier-fact-key.test.js` (25 tests expected: 14 Ajv, 3
  export/import-contract, 8 DB-backed - report the real total, and whether the DB-backed 8 ran or
  skipped). Report the real numbers even if they disagree with anything the story claims - especially
  then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/dbo-2-character-dossier-schema-and-reveal-diff.txt` and
**nothing else**. No spec, no story file, no project context. Do not explore the repository. Do not go
looking for the spec. Read other files only to resolve an import path the diff itself leaves
ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

Three new files. A JSON-Schema (draft-07) module (`server/schemas/character_dossier.schema.js`)
describing a MongoDB collection's document shape, including a newly-required `fact_key` field on every
array-embedded "fact" sub-document and three exported string arrays (`DOSSIER_TAGS`,
`DOSSIER_FACT_SOURCES`, `DOSSIER_SEVERITIES`). A one-off, manually-invoked migration script
(`server/scripts/dbo-2-dossier-fact-key-backfill.mjs`) that stamps a fresh `crypto.randomUUID()` onto
every fact in the collection that lacks a `fact_key`, with a dry-run default, a JSON backup before any
write, and a `--apply` flag gate. And a vitest suite exercising both.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The write-path index mapping under array reordering.** `applyBackfill` receives `rows`, each
   `{ _id, character_id, indices: number[] }` where `indices` are POSITIONS in `facts[]` computed at
   plan time. At apply time it re-fetches the document fresh (`originals`), then for each `i` in
   `row.indices` does `facts[i]` against the FRESH array and writes
   `updateOne({_id, 'facts.<i>.fact_key':{$exists:false}}, {$set:{'facts.<i>.fact_key': mint()}})`.
   **If the `facts[]` array was reordered (an element inserted, removed, or moved) between the plan
   read and the apply read - not just mutated in place - index `i` in the fresh array may now refer to
   a DIFFERENT fact than the one that was actually missing a key at plan time.** Walk this by hand: if
   that different fact ALREADY has a `fact_key`, the `$exists:false` filter correctly no-ops. But if it
   does NOT (e.g. it's also unkeyed, just at a different original position), does the code stamp a
   *fresh* key onto a fact that a *different* concurrent process might also be about to stamp, or does
   it simply stamp the right kind of fact at the wrong logical identity with no way to tell after the
   fact which fact "should" have gotten which key? Is there any code anywhere that ties the plan's
   `indices` back to something identity-stable (there should not be, since fixing exactly this
   positional-addressing problem is the stated purpose of `fact_key` itself) - if there is not, is that
   a real, live hazard for THIS script specifically, given how it is actually invoked?
2. **`Object.prototype.hasOwnProperty.call(fact, 'fact_key')` as the sole "already keyed" test in
   `planBackfill`.** Does a fact object ever legitimately carry `fact_key: null` or `fact_key: ''` from
   any live-data shape or any other code path touching this collection? If so, `hasOwnProperty` would
   treat it as "already keyed" and skip it forever, even though the schema declares `fact_key` as
   `minLength: 1` (so an empty string is invalid per the schema this same story ships). Is that
   inconsistency real, and does anything in this diff catch it?
3. **`additionalProperties: false` at both the document and fact level, paired with `type: ['string',
   'object']` on `character_id` and `_id`.** Ajv's `'object'` branch of a type union matches **any**
   object shape, since there is no `properties`/`required` constraint attached to the `'object'` arm.
   Does that mean `character_id: {}` or `character_id: { anything: 'at all' }` validates? Check by
   running it, not by reasoning about it. If so, is that the "honest declaration, not a shrug" the
   file's own header comment claims it is, or does it validate more than intended?
4. **Backup-then-write ordering and partial-failure behaviour.** `applyBackfill` writes the JSON backup
   file, THEN loops issuing one `updateOne` per fact. If the process crashes or throws partway through
   that loop (after some documents are stamped, before others), what state is the collection left in,
   and does a re-run genuinely recover cleanly? Trace it - the code's own comments claim idempotency,
   verify the claim covers a partial-failure mid-run, not just a clean full re-run.
5. **`mkdirSync(BACKUP_DIR, { recursive: true })` and `writeFileSync` - both synchronous, inside an
   otherwise fully async function.** Any reason that matters here (it probably does not - say so either
   way rather than skipping it).
6. **Self-contradiction within the diff**: does any comment assert a property this same file's code
   does not actually enforce, or vice versa? (E.g. a comment claiming a field is "never overwritten"
   somewhere the code path does not actually guarantee that under every branch.)
7. Standard sweep: assertions whose PASS condition is trivially satisfiable; a check whose label claims
   more than it tests; error paths and unhandled rejections (note `applyBackfill` and `planBackfill`
   have no try/catch of their own - is that a gap, or intentional let-it-throw given `main()`'s own
   `.catch`?); resource cleanup on the thrown path (if `writeFileSync` throws, does anything already
   open or allocated leak?); dead code, unused imports, unreachable branches.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/dbo-2-character-dossier-schema-and-reveal-codex-findings.md` now, before
reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same three files as Pass 1. This migration script is the only writer of `fact_key` this repo ships;
read `server/db.js` to understand `connectDb`/`getCollection`/`closeDb`'s real connection lifecycle,
and read the two sibling scripts this one's own comments claim to mirror -
`server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs` and
`server/scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs` - to check whether the mirroring claim is
actually true structurally, or just claimed.

### What to hunt for

1. **Concurrent invocation.** Nothing in `main()` or `applyBackfill` takes any kind of lock. If someone
   ran this script twice in close succession against the same live database (e.g. two terminals, or a
   retry after what looked like a hang), walk exactly what happens: does the second run's plan
   (computed from a read that may race the first run's writes) ever produce a double-mint on the same
   fact, or does the `$exists:false` filter make that structurally impossible regardless of timing? Be
   concrete about why, not just confident.
2. **`getCollection('character_dossier')` and `MONGODB_DB` override.** Read `server/db.js` in full.
   Confirm exactly how the target database is selected, and what happens if `MONGODB_DB` is set to
   something that does not exist, or is misspelled - does the script silently operate against an empty
   database and report "0 documents need a fact_key" in a way indistinguishable from "already fully
   backfilled", with no warning either way?
3. **The `indices` array and an out-of-bounds fact.** If a document's `facts` array shrinks between
   `planBackfill`'s read and `applyBackfill`'s fresh read (not reordered, just shorter - a fact
   deleted), `facts[i]` for the highest planned `i` could now be `undefined`. Trace the exact guard:
   `if (!fact || typeof fact !== 'object') continue;` - confirm this actually catches `undefined` at
   that array index cleanly with no earlier line touching `fact` unsafely first.
4. **Fixture realism vs the real collection.** Read the test file's `fixtures()` function in full and
   compare it field-for-field against what the schema (`character_dossier.schema.js`) actually declares
   as optional/required. Does the fixture set genuinely exercise every declared field, or does it skip
   any (e.g. `source_note`, `updated_at` variance, a fact with `revealed_to` already present going
   through the backfill path)? A backfill running against a fact that ALREADY has `revealed_to` set is
   a real, plausible future case (once TM Wiki's reveal mechanism is live) - does the write path handle
   that fact correctly (untouched, only `fact_key` added), and is there a test for it?
5. **`setupDb()` / `isDbAvailable()` from `./helpers/db-setup.js`.** Read that helper. Confirm it
   genuinely forces `tm_suite_test` (or equivalent) and cannot silently point at live `tm_suite` under
   any environment-variable combination - this is exactly the class of mistake that would make an
   `--apply`-mode test in this suite a live-data incident instead of a safe one.
6. **The `ownRows` fixture-scoping filter in the test file, and whether it is airtight.** The tests
   filter `planBackfill`'s output to this suite's own `_id`s before ever calling `applyBackfill(...,
   {apply:true})` - except check: does EVERY apply-mode call in the file actually go through `ownRows`
   first, with no exception? A single unfiltered apply-mode call in a shared test database would stamp
   every other suite's leftover fixtures too. Enumerate every `applyBackfill(...,{apply:true})` call
   site in the test file and confirm each one's `rows` argument was filtered.
7. Route/matcher order is not applicable here (no routes), but the equivalent question is: could this
   script's `main()` ever be reached with `--apply` and a MISSING `server/.env` (no `MONGODB_URI`),
   and if so what actually happens - a clear error, or a confusing one?

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/dbo-2-character-dossier-schema-and-reveal-codex-findings.md` now, before
reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/dbo-2-character-dossier-schema-and-reveal.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written. In particular, AC1 specifies exact enum-vs-plain-
     string choices per field (`severity` enumed; `tag`, `source`, `status` deliberately not) - confirm
     the shipped schema matches AC1's table exactly, field by field, not just "roughly the same fields."
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (does it touch `st_hidden` or `revealed_to`
     on any existing fact anywhere? does it add a MongoDB `$jsonSchema` collection validator anywhere?
     does it touch any file under `server/scripts/_*.js` other than confirming `_dossier-audit.js`
     needs no edit? does it add any npm dependency to `server/package.json`?).
   - Specified behaviour that is missing, or present only in appearance. AC5 specifies an exact write
     shape (`{'facts.N.fact_key':{$exists:false}}` per-index, single-field `$set`, never the whole
     array) - confirm the shipped code matches that exactly, not an approximation of it.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Settled decisions - do not re-litigate these, they are deliberate:** no reveal writer, admin UI,
Cockpit UI, or API route (TM Wiki's own future story); no MongoDB `$jsonSchema` collection validator
(documentation-only schema, matches this repo's existing convention for pre-route-validation schemas);
`randomUUID()` from `node:crypto` rather than adding `nanoid`/`ulid` as a dependency; `tag`/`source`/
`status` deliberately left as plain strings rather than enums (each has a stated live-data reason in
the schema's own comments - check the reason is accurate, but do not flag the choice itself as wrong
without evidence the reason is false); the migration is not run with `--apply` against live data as
part of this change.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims:
   - The exact live-data inventory figures (30 documents, 442 facts, 26 tags, specific per-field
     counts, `character_id`/`_id` being BSON ObjectId on all 30 documents, `npc_id` string:18/null:6,
     `severity` major:10/life_threatening:2/minor:1).
   - "25 passed, 0 failed, 0 skipped" for the new suite, and specific pass/fail/skip counts for a wider
     targeted gate.
   - That `_dossier-audit.js` needed no edit and is byte-identical to before this diff.
   - That Mongo/Atlas was genuinely reachable in this session (not skipped) for the DB-backed half.
   - Specific prove-discrimination claims: removing `fact_key` from the schema's `required` fails
     exactly 1 test; removing the write-path never-re-stamp guard requires inverting BOTH the in-memory
     `hasOwnProperty` skip AND the DB-level `$exists:false` filter together to fail anything (2 tests),
     because either alone is redundant defence-in-depth.
6. **Verify each claim by running it, not by reading it.** Run
   `cd server && npx vitest run tests/dbo-2-dossier-fact-key.test.js` yourself, right now. If the
   DB-backed describe block skips, say so and do not treat those 8 tests as verified either way. Grep
   the live counts' arithmetic against the schema file's own header comment. If a first run is
   inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it. In particular, actually attempt the
   prove-discrimination claims yourself (revert the guard, run the suite, restore, re-verify) rather
   than trusting that they were done correctly the first time.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem. Remember this migration script's `--apply` mode will one day run against real
   character data for a live tabletop game - weight your confidence accordingly.

---

## Output

Write everything to
`specs/stories/code-review/dbo-2-character-dossier-schema-and-reveal-codex-findings.md`, grouped
`## High` / `## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`,
`[Pass 2]`, `[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than
dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including
  `cd server && npx vitest run tests/dbo-2-dossier-fact-key.test.js`.
- **Anything you could not run, and why.** Name it specifically (e.g. if MongoDB was unreachable and
  the DB-backed 8 tests skipped).
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
