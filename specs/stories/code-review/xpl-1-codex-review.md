# Adversarial review — xpl.1 (XP ledger — write hook + ST read view), Terra Mortis TM Suite

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
   `specs/stories/code-review/xpl-1-codex-findings.md`, before you open anything the next pass
   allows. Do not revise an earlier pass's findings in light of what a later pass taught you — if a
   later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap — see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at `specs/stories/code-review/xpl-1-diff.txt`
  and is relative to that root, taken as `git diff 77ba0866 4452e617`.
- **`77ba0866` is the correct base commit, NOT `origin/main`.** The branch also carries commit
  `77ba0866` itself ("fix(devotions): enforce cult-membership gating on the downtime devotion
  picker") from an unrelated story/session — it is deliberately excluded from this review's scope.
  If you inspect `git log` on this branch you will see it sitting below this story's commit
  (`4452e617`); do not review it, do not flag it, it is not part of this change.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/xpl-1-xp-ledger-write-hook.md`, `specs/stories/sprint-status.yaml`,
  `specs/epic-xpl-xp-ledger.md`) are excluded from it on purpose, so the earlier passes stay
  genuinely blind to the author's own account. Do not treat their absence as an omission or go
  hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) **is allowed and encouraged** — you MUST restore it exactly, confirm
  the restore with `git diff`, and say so in your output.
- This repo needs a reachable MongoDB (`tm_suite_test`) for the two new DB-backed integration tests
  in `server/tests/xpl-1-xp-ledger-api.test.js` and for most of `server/tests/`. If Mongo is
  unreachable in your sandbox, the test-DB-backed suites should report a clean `describe.skipIf`
  skip, not a failure — if you instead see connection errors or a different skip/failure shape,
  disclose the exact output rather than treating it as "tests pass."
- This diff touches `server/routes/characters.js`'s `PUT /:id` handler — the single write path
  EVERY character sheet edit in this app goes through (ST admin editor, equipment writes,
  touchstones, everything). A mistake in the new code here has a blast radius across the whole app,
  not just XP-ledger functionality — check carefully that the new pre-fetch/diff/insert logic cannot
  throw, hang, or otherwise break a save that has nothing to do with XP.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed
  gap is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `cd server && npx vitest run tests/xpl-1-xp-ledger-diff.test.js tests/xpl-1-xp-ledger-api.test.js
  tests/equipment.test.js tests/api-touchstone-edges.test.js tests/n5-trap-door-anchor.test.js
  tests/n4-white-ants-territory.test.js tests/api-characters-crud.test.js
  tests/oath-b-d6-api-roundtrip.test.js`. Report the real numbers even if they disagree with
  anything the story claims — especially then.

---

## PASS 1 — BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/xpl-1-diff.txt` and **nothing else**. No spec, no
story file, no project context. Do not explore the repository. Do not go looking for the spec. Read
other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A new append-only `xp_ledger` MongoDB collection that records dated, attributable XP-spend events.
A new pure function `diffXpLedgerRows(before, after)` compares an existing character document's
`attributes`/`skills`/`disciplines`/`merits` `.xp` sub-fields against an incoming update body and
returns one row per non-zero delta. `server/routes/characters.js`'s existing `PUT /:id` handler is
extended to pre-fetch the character's prior trait state, run the diff, and (after the character
write itself succeeds) best-effort-insert the resulting rows — never blocking or failing the
character save if the ledger insert itself errors. A new `GET /:id/xp_ledger` route reads them back,
ST-only, newest-first. A client-side read-only history view is added to the admin sheet editor.

**That is the shape it claims. Do not trust the shape — verify it.**

### What to hunt for

1. **TOCTOU / lost-update on the pre-fetch.** The handler pre-fetches the character's prior
   `attributes`/`skills`/`disciplines`/`merits` state, then LATER calls `findOneAndUpdate` to write.
   Nothing locks or re-checks between the two. Trace what happens if two `PUT` requests for the SAME
   character race: can both pre-fetch the identical prior state, both compute a delta against it,
   both insert a ledger row, while the character document itself ends up reflecting only the
   last-writer-wins `$set`? Would the two ledger rows, summed, misrepresent what the character
   document actually ended up holding?
2. **`xp_ledger_reason` validation.** A non-string value (a number, an array, `null`, `true`) sent
   as `xp_ledger_reason`: trace exactly what happens to it through the diff's blank-check
   (`typeof ... === 'string' && ... .trim() === ''`) and through the later insert-time reason
   assignment. Does a non-string, non-blank-looking value silently bypass the "reason required on a
   real delta" intent entirely?
3. **`st_username` on the inserted row.** What is written to `st_username` if `req.user.username` is
   `undefined` (trace what `requireRole`/the auth middleware guarantees is actually present on
   `req.user` — is `username` truly always populated, or assumed?). The new schema
   (`xp_ledger.schema.js`) declares `st_username` as `required`, `minLength: 1` — but is that schema
   actually wired to validate the insert anywhere, or does the insert bypass it entirely? If it
   bypasses it, what actually lands in Mongo when the assumption is wrong?
4. **Silent failure of the ledger insert itself.** The insert is wrapped in try/catch, logs and
   swallows. Is there ANY test anywhere in this diff that actually exercises the insert throwing
   (e.g. a malformed row, a disconnected collection) and confirms the character write still returns
   200? Or is this guarantee (stated as a design decision) asserted only by the happy-path tests
   never hitting the catch block?
5. **Merit matching by `.name`.** `diffXpLedgerRows` matches merits between `before`/`after` by exact
   string `.name`. What happens with two merit entries sharing the identical name in the SAME
   `after.merits` array — could either or both match the same `before` entry, double-counting or
   mis-attributing a delta?
6. **Dead/unreachable code, unused imports, self-contradiction.** Does the diff's own comments match
   what the code actually does anywhere (e.g. does a comment claim "never throws" where a code path
   plainly could)?
7. Standard hygiene: assertions whose PASS condition is trivially satisfiable, checks whose label
   claims more than they test, resource cleanup on the thrown path (not just happy path), error
   paths and unhandled rejections generally.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/xpl-1-codex-findings.md` now,
before reading further.**

---

## PASS 2 — EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec
or any account of the author's intent — work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth — verify against the code)

Same summary as Pass 1. Verify it against the real files this time: `server/routes/characters.js`
(read the WHOLE `PUT /:id` handler, not just the new lines — what else does it do, in what order,
and could the new pre-fetch/diff/insert code interact badly with the equipment hydration, touchstones
validation, or `validateWhiteAntsTerritoriesMiddleware`/`validateTrapDoorAnchorMiddleware` steps that
already run in this same handler?), `server/lib/xp-ledger-diff.js`, `server/schemas/
xp_ledger.schema.js`, `public/js/editor/sheet.js` (read `renderSheet` in full — where exactly does
`patchXpLedger` get called relative to the rest of the render, and under what conditions).

### What to hunt for

1. **Read `diffXpLedgerRows` in full and hand-trace it** against a case NOT in its own test file: a
   character whose `before.attributes.Strength` is `{dots: 3, xp: 4}` and whose incoming
   `after.attributes` OMITS `Strength` entirely (present for other attributes, but not this one —
   e.g. a client sending a partial/malformed `attributes` object). Does the function correctly
   produce NO row (nothing to diff, key absent from `after`), or does it do something else? Is that
   the right behaviour given how `buildSaveBody` actually assembles the PUT body client-side (grep
   for it — does it EVER send a partial `attributes` object, or always the full one)?
2. **Route middleware order.** Read the full middleware chain on `PUT /:id`
   (`requireRole('st')` → `stripEphemeral` → `validateCharacterPartial` →
   `normalizeMeritsMiddleware` → `validateWhiteAntsTerritoriesMiddleware` →
   `validateTrapDoorAnchorMiddleware` → handler). `stripEphemeral` was modified by this diff to pull
   `xp_ledger_reason` off `req.body` onto `req.xpLedgerReason` BEFORE validation runs. Confirm this
   really does happen before `validateCharacterPartial`, and confirm no other middleware in that
   chain re-reads or re-validates `req.body` in a way that could still choke on, or silently drop,
   something related to this change.
3. **The GET route's auth.** `GET /:id/xp_ledger` uses `requireRole('st')` — is that the SAME
   effective role gate as the PUT route (check `requireRole`'s `dev`-treated-as-`st` behaviour), or
   could a `dev`-role user hit one but not the other?
4. **What happens on an invalid `:id`** for the new GET route — does `parseId` failure 400 cleanly,
   matching the PUT route's own behaviour, or does it differ?
5. **Client-side `patchXpLedger` race.** Read its module-scoped `_xpLedgerGen` guard. Construct the
   exact interleaving that would let a STALE fetch (for a previously-open character) paint into the
   slot for a DIFFERENT character now on screen — is the guard actually sufficient, the same way
   `patchOfficeMerits`'s own comment claims its guard is? Is there any scenario (e.g. `renderSheet`
   called twice in quick succession for the SAME character) the guard does NOT cover?
6. **`GET /:id/xp_ledger` is called via `apiGet('/api/characters/' + c._id + '/xp_ledger')`** from
   `patchXpLedger` — confirm this exact URL shape is what the new Express route actually registers
   (path concatenation / route-order collision with any OTHER `:id`-prefixed route already mounted
   under `/api/characters`).
7. **Fixture/mock shape vs. real consumer.** Do the new tests' fixtures (attribute/skill/discipline/
   merit shapes sent in test PUT bodies) match, field-for-field, what a REAL admin-editor save
   (`buildSaveBody`) actually sends? Or do the tests use a simplified shape that could hide a bug
   only the real shape would trigger?

**STOP. Write your Pass 2 findings to `specs/stories/code-review/xpl-1-codex-findings.md` now,
before reading further.**

---

## PASS 3 — ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a — form findings BEFORE reading the author's own account

1. Read `specs/stories/xpl-1-xp-ledger-write-hook.md` — the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative — an
     AC's exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing**
     — check the change did not quietly do an excluded thing.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Explicitly NOT in scope, and deliberate — do not flag these as gaps:**
- `bp_creation.xp` (Blood Potency), `humanity_xp`, `xp_log.spent.willpower`/`.special` are real
  XP-spend categories the story explicitly excludes (named in "What this story is NOT").
- The four client-side editor mutators (`shEditAttrPt`/`shEditSkillPt`/`shEditDiscPt`/
  `shEditMeritPt`) and the downtime form's `project_N_xp_rows`/`responses.xp_spend` fields are
  explicitly untouched by design.
- No transaction between the character write and the ledger insert — a deliberate, documented
  design decision (best-effort audit trail, not a guarantee), not an oversight.
- A removed merit (present in `before.merits`, absent from `after.merits`) produces no ledger row —
  deliberate; deletion is not treated as an XP-spend event by this story.
- No player-facing surface of any kind, no historic reconciliation (DT1-DT6 backfill — that is a
  separate future story, xpl.2) — both explicitly out of scope here.
- Duplicate-named merits on one character producing a possible mis-attributed diff is a KNOWN,
  documented, accepted limitation (see the diff's own comment in `xp-ledger-diff.js`) — you may
  still flag it if you find a concretely worse consequence than "wrong row attributed", but do not
  flag its mere existence as a fresh finding; it is already recorded.

### Pass 3b — now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes these specific, checkable claims — verify
   each by running it, not by reading it:
   - "17 new tests (10 unit + 7 live-integration), all passing."
   - "128/128 across the full changed-area regression (8 files)" — the exact command is in the Gate
     Commands note above; re-run it yourself.
   - A specific bug-and-fix narrative: `xp_ledger_reason` initially caused a 400 because
     `validateCharacterPartial` runs before the handler's own destructure could strip it; fixed by
     moving the strip into `stripEphemeral`. Confirm this is a coherent, real explanation by reading
     `stripEphemeral`'s current code and confirming it really does run before `validateCharacterPartial`
     in the middleware chain declared on the route.
   - "A second PUT changing `Strength.xp` from 4 to 6 correctly logs a `delta: 2` row against the
     already-updated total, not a fresh `delta: 6` against zero" — this is the core diff-against-
     pre-fetch claim; verify it is what the code (and the test asserting it) actually shows.
   - "Live `tm_suite` (production) was never touched" — confirm the test DB safety chain
     (`vitest.config` → `setup-env.js` → `assertTestDbSafety`) is genuinely what gates the DB-backed
     tests in this diff, the same as it does elsewhere in this project.
   - The Completion Notes' own admission that Task 4's UI was NOT visually verified in a browser —
     confirm this is accurately disclosed, not glossed over.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Grep
   the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong — re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/xpl-1-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including the gate commands named above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
