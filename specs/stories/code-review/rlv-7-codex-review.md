# Adversarial review - rlv.7 (Persistent per-power modifier chips), TM Game

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
   `specs/stories/code-review/rlv-7-codex-findings.md`, before you open anything the next pass allows.
   Do not revise an earlier pass's findings in light of what a later pass taught you - if a later pass
   contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at `specs/stories/code-review/rlv-7-diff.txt` and
  is relative to that root, taken against base commit `66424fb2` (this repo's `origin/main`, just after
  PR #1203 merged - `git diff 66424fb2` will reproduce it exactly).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/rlv-7-persistent-per-power-mod-chips.md`, `specs/stories/sprint-status.yaml`,
  `specs/epic-rlv-roller-harmonisation.md`) are excluded from it on purpose, so the earlier passes stay
  genuinely blind to the author's own account. Do not treat their absence as an omission or go hunting
  for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo (`TM Game`) lives inside a larger "Terra
  Mortis" umbrella workspace alongside sibling repos `TM Story`, `TM Herald`, `TM Admin`, and
  `TM Design System` at `D:\Terra Mortis\<name>` - do not read from or touch any of them; this review
  is scoped entirely to `TM Game`.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards, disclose rather than skip:** the Playwright suite (`npx playwright test
  tests/rlv-7-persistent-mod-chips.spec.js` from repo root) needs port 8080 free or already serving
  `public/` (`playwright.config.js`'s `webServer` auto-starts `npx http-server public -p 8080 -s` with
  `reuseExistingServer: true` if nothing is listening) and a real Chromium browser
  (`npx playwright install chromium` if missing). The vitest suite
  (`cd server && npx vitest run tests/rlv-7-persistent-mod-chips.test.js`) needs no database - the
  module under test only touches `localStorage`/`crypto.randomUUID`, both real Node 20+ globals - but
  several *other* suites in this repo need a local `mongod` and SKIP rather than fail without one
  (documented, pre-existing, #1117); if you run the broader regression batch, read the summary line,
  not just the exit code.
- **Blast radius:** `roll-v2.js`'s `loadPool()`/`updPool()` and `suite/data.js`'s state object are the
  single shared spine for EVERY pool entry path in the player app - skill pools, discipline power
  pools, Common Actions, and the Custom Pool builder (rlv.4) all funnel through `loadPool()`. A mistake
  here doesn't just break chips; it can break the Roll tab for every pool type at once. Weight findings
  in this area accordingly.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `cd server && npx vitest run
  tests/rlv-7-persistent-mod-chips.test.js` (expect 28 tests) and `npx playwright test
  tests/rlv-7-persistent-mod-chips.spec.js` from repo root (expect 11 tests). Report the real numbers
  even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/rlv-7-diff.txt` and **nothing else**. No spec, no story
file, no project context. Do not explore the repository. Do not go looking for the spec. Read other
files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A player-facing dice-roller feature: a new module (`public/js/game/power-mod-chips.js`) persists
free-text label+value "modifier chips" per (character id, pool label) in `localStorage`. Three new
exported functions in `public/js/suite/roll-v2.js` (`addPowerChip`, `togPowerChip`, `removePowerChip`)
wire that module into the roller's existing `state.MOD` accumulator, alongside edits to `loadPool()`
(restores persisted chips on every pool load) and `updPool()` (renders them as toggleable badges and
paints an "add mod" row's enabled state). `public/js/suite/data.js` gains two new state fields.
`public/index.html`/`public/js/app.js`/`public/css/suite.css` wire up the new UI surface. Two new test
files are included in the diff.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **`addPowerChip`'s relationship with `addChip()`'s own validation.** `addChip()` (in
   `power-mod-chips.js`) independently rejects an empty/whitespace label or a 0 value by returning the
   input list unchanged. `addPowerChip()` (in `roll-v2.js`) has its own EARLIER guard on the value
   (`clampChipValue` + `if (!v) return`) before ever calling `addChip()`. Walk the exact sequence: does
   `addPowerChip` correctly detect when `addChip()` itself silently rejected the chip for a reason
   `addPowerChip`'s own earlier guard didn't already catch (specifically: a non-zero value paired with
   an empty/whitespace label)? If it doesn't detect that case, does it still apply the value to
   `state.MOD`? Trace this by hand, do not trust the surrounding comment.
2. **`togPowerChip`/`removePowerChip`'s MOD arithmetic vs. `toggleChip`/`removeChip`'s own return
   value.** Both roll-v2.js functions read `chip.on`/`chip.value` from the LOCAL `state.powerChips`
   array before calling into `power-mod-chips.js`, then separately call `toggleChip`/`removeChip` and
   reassign `state.powerChips` from the result. Could the local read and the module's own internal
   `loadChips()` re-read (inside `toggleChip`/`removeChip`) ever disagree - e.g. if `state.powerChips`
   is stale relative to what's actually in `localStorage` at call time? Is there any code path that
   mutates `localStorage`'s chip list for the current (charId, powerName) pair WITHOUT going through
   `state.powerChips` first?
3. **The composite localStorage key.** `key(charId, powerName)` in `power-mod-chips.js` is a plain
   template-literal concatenation (`` `tm-rlv7-chips-${charId}-${powerName}` ``) with no delimiter
   escaping. Can two DIFFERENT `(charId, powerName)` pairs produce the IDENTICAL key string? Construct
   a concrete example.
4. **Assertions whose PASS condition is weaker than the label claims**, in both new test files - a
   `toHaveCount`/`toBe`/`toContainText` that would also pass under a subtly wrong implementation.
5. **Error paths and thrown-path cleanup.** `addChip`/`toggleChip`/`removeChip`/`loadChips` in
   `power-mod-chips.js` each wrap `localStorage` calls in try/catch. Is every catch's fallback actually
   safe (never returns something the caller would misinterpret as success), or could a caught
   `QuotaExceededError` on `saveChips` leave the in-memory return value silently inconsistent with what
   was actually persisted?
6. **The HTML the diff injects.** `updPool()`'s new chip-rendering block builds an `onclick` attribute
   string containing `${safeId}` (escaped for `"` only) and separate label text (escaped for `<`/`>`
   only). Is escaping only those two characters in each position actually sufficient to prevent
   breaking out of the attribute or the surrounding markup, given a maximally adversarial chip label
   (client-only feature, but verify rather than assume "it's just the player's own data so it doesn't
   matter" - a shared browser/projector at the table is a real audience)?
7. **Dead code, unused imports, unreachable branches** introduced by this diff specifically.
8. **Self-contradiction WITHIN the diff** - does any comment claim a behaviour the code beside it does
   not actually implement?

**STOP. Write your Pass 1 findings to `specs/stories/code-review/rlv-7-codex-findings.md` now, before
reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need to
understand what this change is actually plugging into. You still do **not** have the story spec or any
account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1 above. Now you may read the real surrounding files: `public/js/suite/roll-v2.js`
in full, `public/js/suite/data.js` in full, `public/js/game/char-pools.js` in full (the pool-tile
builder that feeds `loadPool()`), and `public/js/app.js`'s `openPanel()` function and every
`loadPool(...)` call site inside it.

### What to hunt for

1. **Read `loadPool(total, name, pi)` in full** (`public/js/suite/roll-v2.js`). Walk the EXACT sequence
   it performs when called with a pool that has previously-persisted chips, some `on` and some `off`.
   Confirm, by tracing by hand, that `state.MOD`'s final value after `loadPool()` returns matches the
   sum of only the `on` chips' values, added exactly once (not double-counted by any later line in the
   same function, e.g. the `if (pi?.nineAgain) setAgain(9)` / `if (state.ROTE) togMod('rote')` calls
   immediately after - do either of those touch `state.MOD`, directly or indirectly via `updPool()`?).
2. **`updPool()`'s early-return branch** (`if (!pi || !pi.attr) { ...; return; }`, near the top of the
   function). Confirm: after this story's changes, is there ANY real call path where `state.POOL_INFO`
   becomes falsy or loses its `.attr` field AFTER a pool has already been successfully loaded once (not
   just the initial pre-any-load state)? If such a path exists, does the add-mod row's enabled/disabled
   state (painted only in the non-early-return branch) go stale?
3. **Every real `loadPool(...)` call site in `app.js`** (skill/discipline pool tiles, Common Actions,
   Custom Pool, the discipline-panel items). For each, confirm the `pi` argument actually passed always
   has a truthy `.attr` - if any site can pass a `pi` that's falsy or missing `.attr`, does
   `state.powerChips` still get populated correctly regardless (since chip restoration in `loadPool()`
   is keyed on the `name` argument alone, independent of `pi`)?
4. **Route/matcher-shadowing analogue**: `char-pools.js`'s skill-pool tiles set `pi: null` on the pool
   object it pushes; `app.js`'s `onTap` callback then does `p.pi || {...synthesized...}` before calling
   `loadPool`. Confirm the synthesized fallback object always includes every field `updPool()`'s
   rendering code reads (`attr`, `attrV`, `skill`, `skillV`, `unskilled`, `discName`, `discV`,
   `meritBonus`, `meritLabel`, `roteEligible`) - is anything silently `undefined` there that a discipline
   or Custom Pool `pi` object would have populated?
5. **State mutated by one step leaking into a later step in the same run**: `state.rollChar`,
   `state.POOL_NAME`, and `state.powerChips` are all plain mutable fields on a shared singleton
   (`suite/data.js`). If `addPowerChip`/`togPowerChip`/`removePowerChip` fire from a stale DOM node's
   `onclick` handler (rendered against an earlier pool, clicked after a newer pool has since loaded),
   does the `find(c => c.id === id)` guard in `togPowerChip`/`removePowerChip` correctly no-op rather
   than corrupting the newly-loaded pool's own chip list? Construct the concrete sequence and confirm.
6. **Malformed/absent input at the new entry points**: what does `addPowerChip(undefined, undefined)`
   do? `togPowerChip(undefined)`? Does either throw, or silently no-op as the surrounding code implies?
7. **Fixture/mock shape vs. what the real consumer reads, field for field**: in the new Playwright
   spec's `CHIP_CHAR` fixture and the vitest suite's stub `document`/`location`, confirm every field
   `roll-v2.js`/`char-pools.js` actually reads at runtime is present with a realistic value - anything
   the real app would read that the fixture leaves `undefined`?

**STOP. Write your Pass 2 findings to `specs/stories/code-review/rlv-7-codex-findings.md` now, before
reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/rlv-7-persistent-per-power-mod-chips.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review into
   grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written. In particular AC9 ("A chip's value is clamped to
     -10..+10 on entry") and AC7 (last-known on/off state restored, not just "the chip exists again").
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (e.g. does it retrofit the clamp onto
     `togSpec`/`togEquipChip`, which the story explicitly says is out of scope? Does it derive any
     chip automatically from character/merit data, which the story explicitly says it does not?).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint (e.g. "no --space-* scale exists in TM Game, use plain
     px") and the actual CSS in the diff.
4. **Write your Pass 3a findings down now, before moving on.**

**Explicitly NOT in scope, and deliberate - do not flag these as gaps:**
- rlv.8 (status-difference auto-mods for social manoeuvring) - a separate, still-backlog story.
- Retrofitting the -10..+10 clamp onto the pre-existing `togSpec`/`togEquipChip` functions, which
  bypass `chgMod()`'s own clamp entirely and are unrelated to this diff.
- Cross-device/cross-browser chip sync - `localStorage` is per-browser by design, matching this app's
  existing `tm_pools_collapsed` precedent.
- Deriving chips automatically from character sheet state (merits, disciplines, etc.) - chips are
  always player-typed free text; nothing in this diff should read character fields to suggest one.
- Expanding automated test coverage of the pre-existing `togSpec`/`chgMod`/`togEquipChip` functions,
  which have no dedicated unit tests today and are unrelated to this diff.
- The exact numeric definition of "pool caps enforced" (issue #1039's own AC text) beyond the ±10
  per-chip clamp this story implements - the story's own Dev Notes name this as an open interpretation
  flagged for the human maintainer, not a gap to re-litigate here.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims:
   - "23/23 [then 28/28 after a self-found fix] new vitest tests passing" -
     `server/tests/rlv-7-persistent-mod-chips.test.js`.
   - "11/11 new Playwright e2e tests passing" - `tests/rlv-7-persistent-mod-chips.spec.js`.
   - "214/214 combined vitest regression" across 7 named sibling suites plus this story's own test
     file.
   - "12/12 rlv-4's own e2e spec unaffected" - `tests/rlv-4-custom-pool-builder.spec.js`.
   - "6/6 rlv-2 baseline spec unaffected" - `tests/rlv-2-single-roller-retirement.spec.js`.
   - "feature-662's equipment-chip spec: 5 passed/7 failed, exact match against `CLAUDE.md`'s own
     documented pre-existing baseline (AC-1/2/3/4/7/8/10)" - re-run
     `tests/feature-662-eq3-roll-calc-equipment-chips.spec.js` and confirm the failing test names match
     that exact list, not merely the count.
   - The self-found-and-fixed `addPowerChip` MOD-inflation bug, and its claimed prove-discrimination
     (`git stash` the fix alone, confirm the two named regression tests fail, restore, re-confirm
     28/28) - reproduce this yourself: temporarily revert just that fix (the record names the exact
     mechanism), run the two named tests, confirm they fail the way claimed, then restore and confirm
     `git status --short` is clean of unintended change.
   - The Task 5 "--space-* scale doesn't exist in TM Game" claim - grep `public/css/theme.css` yourself
     to confirm.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Grep the
   files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/rlv-7-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`, `[Pass 2]`,
`[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the two gate commands above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
