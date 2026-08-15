# Adversarial review — gdx-6-structured-power-costs (structured vitae/willpower activation costs on purchasable_powers), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

## How to run this — read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. Do not open a file a later pass
   grants you until you reach that pass. In particular: **the story spec is deliberately NOT in the
   diff.** Do not go looking for it during the earlier passes. The final pass will hand you the path.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/gdx-6-codex-findings.md`, before you open anything the next pass allows.
   Do not revise an earlier pass's findings in light of what a later pass taught you — if a later pass
   contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap — see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/gdx-6-diff.txt` and is relative to that root, taken against base commit
  `eeffe158`.
- The diff is **deliberately scoped to source and tooling only** — exactly 4 files:
  `server/schemas/purchasable_power.schema.js`, `server/scripts/gdx-6-structured-power-costs.mjs` (new),
  `server/tests/gdx-6-structured-power-costs.test.js` (new), `public/js/suite/sheet-helpers.js`.
  Story-spec and tracking edits are excluded from it on purpose, so the earlier passes stay genuinely
  blind to the author's own account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This is an umbrella workspace — `D:\Terra Mortis\`
  contains three sibling repos (`TM Wiki`, `TM Cockpit`, `TM Herald`) alongside this one (`TM Suite`).
  Do not read, run, or modify anything in those sibling repos even for context; stay inside
  `D:\Terra Mortis\TM Suite`.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** — you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **The working tree contains substantial unrelated uncommitted work from a separate, concurrent
  session** — an archive-admin feature removal, several one-off tracker-repair scripts
  (`fix-ivana-duplicate-tracker-*`, `restore-tracker-state-*`, `zero-vitae-not-rolled-*`,
  `compute-*-influence-*`, etc.), and edits to files this diff does NOT touch (`public/js/admin.js`,
  `public/js/app.js`, `public/js/data/ws.js`, `server/ws.js`, `server/routes/app-settings.js`, and
  others — those are a DIFFERENT story, `gdx-5`, already reviewed separately). If your repo
  exploration in Pass 2 encounters any of this, it is not part of what you are reviewing — ignore it
  entirely and do not report on it. Everything you ARE reviewing is reachable from the 4 files named
  above.
- No live browser, no network dependency, no held port for this review — it's pure Node/Mongo. The
  test suite needs a reachable MongoDB (`tm_suite_test`); if `npx vitest run` reports suites SKIPPED
  rather than failed for a DB-unreachable reason, say so explicitly rather than treating skip as pass.
- **Blast radius**: `fmtRuleStats` (via the new `fmtCostLine`) is a single shared display function
  already documented as having been de-duplicated once from three separate copies
  (`editor/sheet.js`, `suite/sheet-helpers.js`, `editor/export-character.js`) — a mistake in
  `fmtCostLine`'s precedence logic renders wrong on every discipline/devotion/rite power display in
  the app, not just a narrow surface.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `cd server && npx vitest run tests/gdx-6-structured-power-costs.test.js`. Report the real numbers
  even if they disagree with anything the story claims — especially then.

---

## PASS 1 — BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/gdx-6-diff.txt` and **nothing else**. No spec, no
story file, no project context. Do not explore the repository. Do not go looking for the spec. Read
other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A JSON-Schema addition (`vitae_cost`/`willpower_cost`/`cost_note`, all nullable) to an existing
`purchasable_powers` document schema; a new standalone migration script
(`gdx-6-structured-power-costs.mjs`) with a pure regex-based classifier (`parseCostString`), a
plan/apply pair, and a `main()` CLI entry; a new test file exercising all three plus a client-side
display helper; and a small addition to an existing shared display-formatting function
(`fmtRuleStats` in `sheet-helpers.js`) via a new exported `fmtCostLine`.

**That is the shape it claims. Do not trust the shape — verify it.**

### What to hunt for

1. **`parseCostString`'s regex ordering and anchoring.** Every pattern (`RE_ZERO_SENTINEL`,
   `RE_COMBO`, `RE_PER_EFFECT`, `RE_PER_TURN`, `RE_QUALIFIED`, `RE_VITAE_ONLY`, `RE_WP_ONLY`) is
   checked in a fixed sequence with `^...$` full-string anchors. Confirm by hand-tracing at least
   three inputs that a change in check order would misclassify: does anything match more than one
   pattern? Could a range like `"3–9 V & 1 WP"` (en-dash) accidentally satisfy `RE_COMBO`'s
   `(\d+)\s*V...` prefix rather than falling through to `unparsed`?
2. **`RE_QUALIFIED`'s parenthetical capture** — `\(([^)]+)\)$` requires the string to END at the
   closing paren. What happens to a hypothetical cost string with trailing text after a parenthetical
   (not present in the diff's own test fixtures, but the regex should still be judged on its own
   terms, not just against the cases it was tested with)?
3. **`applyCostMigration` writes ALL three buckets, not just `parsed`** — `zero` and `unparsed` rows
   both get a real `updateOne` too. Is that actually correct per the code's own stated design, or is
   there a mismatch between what the dry-run log claims it "would set" and what `--apply` actually
   writes for an `unparsed` row?
4. **`fmtCostLine`'s `!v && !w && !note` early-return** — `v`/`w` can be `0`, `null`, or `undefined`,
   and `!0 === true` in JS. Walk every combination (0/0, 0/positive, positive/0, null/null, both
   undefined) by hand against this one line and confirm each produces the documented outcome, not an
   assumed one.
5. **`applyCostMigration`'s `updateOne({ _id: row._id }, ...)` has no `matchedCount`/`modifiedCount`
   check** — if a document is deleted between `planCostMigration` and `applyCostMigration` (or the
   `_id` is simply wrong), does anything surface that, or does it silently no-op?
6. Standard checks: assertions whose PASS condition is trivially satisfiable; a check whose label
   claims more than it tests; unhandled rejections or async/await misuse in the new script or test
   file; dead code, unused imports, unreachable branches; self-contradiction within the diff itself
   (does any comment claim behaviour the adjacent code doesn't actually have?).

**STOP. Write your Pass 1 findings to `specs/stories/code-review/gdx-6-codex-findings.md` now, before
reading further.**

---

## PASS 2 — EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite` (subject to the sibling-repo and
unrelated-concurrent-work exclusions in Ground rules above). Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent — work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth — verify against the code)

Same summary as Pass 1. Additionally: `fmtRuleStats` is called live, every render, by `powersForDisc`
(same file) for disciplines, and by `editor/export-character.js` for character sheet export. Neither
consumer's own call site changed in this diff — only what feeds `fmtRuleStats` did.

### What to hunt for

1. **Trace `fmtCostLine`'s full four-branch precedence exactly as written**, by hand, against these
   four real shapes: `{vitae_cost:0, willpower_cost:0, cost_note:null}`,
   `{vitae_cost:1, willpower_cost:0, cost_note:'per effect'}`,
   `{vitae_cost:null, willpower_cost:null, cost_note:'Free / 1 V'}`, and `{cost:'2 V'}` (fields
   entirely absent — the shape every untouched category, attribute/skill/manoeuvre/merit, actually
   has). Confirm the real output string for each, not the comment's claimed output.
2. **`purchasable_power.schema.js` is `additionalProperties: false`** (verify this yourself by reading
   the actual file, not trusting the diff's own comment) — confirm the three new properties are
   correctly declared inside the `properties` object, not accidentally placed somewhere `additionalProperties`
   doesn't reach, and that none of the three were accidentally added to the schema's `required` array
   (they should NOT be required — verify by reading the actual `required` array).
3. **Does anything else in the repo read `purchasable_powers.cost` and assume it is the ONLY cost
   signal** — i.e. a consumer that would now see a row with real `vitae_cost`/`willpower_cost` but
   still reads the old `cost` string exclusively, silently missing the new structured data? Search for
   other read sites of `.cost` on a rule/power object beyond `fmtRuleStats`/`fmtCostLine`.
4. **Malformed/absent input at the new entry points**: what does `parseCostString` do with an empty
   string `""`, a string that's only whitespace `"   "`, or a non-string value if one somehow reached
   it (the schema types `cost` as `['string','null']`, but verify the function's own runtime behaviour
   doesn't assume that guarantee blindly)?
5. **State leakage between test cases** — the new test file inserts fixture documents with a
   `GDX-6 Probe` name prefix and cleans up via `deleteMany` in `beforeAll`/`afterAll` only (no
   per-test cleanup). Trace whether any single test's fixture data could leak into and affect a LATER
   test's assertions within the same file (e.g. the `planCostMigration` category-scoping test and the
   bucket-counting test both insert real documents into the same live-during-test collection — do
   their counts/lookups ever cross-contaminate?).
6. **The `fmtCostLine` import-stub technique** (`globalThis.location`/`window`/`localStorage`) — read
   the actual `beforeAll`/`afterAll` in the new test file and confirm the conditional restore logic
   (`if (!hadLocation) delete globalThis.location`, etc.) genuinely leaves no stub behind for a
   DIFFERENT test file that runs later in the same vitest process (this project's `vitest.config.js`
   forces `fileParallelism: false` / `singleFork: true` — every test file shares ONE process, so a
   leaked global is a real cross-file risk, not a hypothetical one).

**STOP. Write your Pass 2 findings to `specs/stories/code-review/gdx-6-codex-findings.md` now, before
reading further.**

---

## PASS 3 — ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a — form findings BEFORE reading the author's own account

1. Read `specs/stories/gdx-6-structured-power-costs.md` — the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record section yet.** Skip past it entirely. Reading the author's own
   record first anchors you on their framing and turns a review into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative — an AC's
     exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** —
     check the change did not quietly do an excluded thing (e.g. touch `xp_fixed`, touch a merit/skill/
     attribute/manoeuvre row, retroactively rewrite an already-owned character's frozen devotion
     `stats` snapshot).
   - Specified behaviour that is missing, or present only in appearance. In particular: AC4 names an
     exhaustive, specific set of parse patterns — confirm every one is actually implemented, not just
     a plausible-looking subset.
   - Contradictions between a stated constraint and the actual code (e.g. AC5's "never touches,
     overwrites, or deletes the existing `cost` string field" — verify the apply function's own
     `$set` object literally cannot include `cost`).
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate — do not flag these as gaps: GDX-7's roll-spend feature
itself (reads these fields, doesn't build them — a separate story); a separate "devotions data"
migration (the story's own investigation found devotions already live in `purchasable_powers`, one
schema is correct); touching `attribute`/`skill`/`manoeuvre`/`merit` rows (confirmed live to never
carry a `cost` value — deliberately out of scope); retroactively refreshing an already-owned
character's frozen devotion `stats` snapshot (a documented, deliberate scope boundary, not an
oversight); fixing the duplicate `"Summoning"` devotion name found in live data (logged as deferred
work, explicitly not this story's job).

### Pass 3b — now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims:
   - "17/17 correct on the first pass" for a `node -e` smoke-test against real cited samples (not
     reproducible from the diff alone — but the SAME 17 cases now exist as real vitest assertions;
     verify those pass).
   - "194 tests across 10 files, all green (31 new + 88 schema/rules-adjacent + 75 further
     `purchasable_power`-referencing files found by grep)" — you cannot reproduce the full 194-file
     sweep without the file list, but you CAN and MUST verify the 31 tests in
     `gdx-6-structured-power-costs.test.js` itself.
   - "No signature change to `fmtRuleStats` itself" — verify by reading the function's before/after
     shape in the diff directly.
   - The claim that `sheet-helpers.js` cannot be imported under plain Node without stubbing
     `location`/`window`/`localStorage` — verify this yourself: try importing it with none, then some,
     then all three stubbed, and confirm which combination the diff's own test file actually uses is
     the minimum necessary (not stubbing more globals than required).
6. **Verify each claim by running it, not by reading it.** Run the suite yourself, right now:
   `cd server && npx vitest run tests/gdx-6-structured-power-costs.test.js`. If a first run is
   inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong — re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/gdx-6-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`, `[Pass 2]`,
`[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including
  `cd server && npx vitest run tests/gdx-6-structured-power-costs.test.js`.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
