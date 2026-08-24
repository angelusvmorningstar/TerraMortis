# Adversarial review - rlv.4 (Port dice-engine.js's dropdown-picker UI in as an alternate ad-hoc entry path), Terra Mortis TM Game

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
   `specs/stories/code-review/rlv-4-codex-findings.md`, before you open anything the next pass allows.
   Do not revise an earlier pass's findings in light of what a later pass taught you - if a later pass
   contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at `specs/stories/code-review/rlv-4-diff.txt` and
  is relative to that root, taken against base commit `40be9e18`.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo (`TM Game`) is one of several sibling repos
  in an umbrella workspace (`TM Story`, `TM Herald`, `TM Admin`, `TM Design System`, all outside this
  repo root) - do not read or touch any of them even out of curiosity; they are unrelated to this diff.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards, specific to this repo:**
  - Playwright's `webServer` (port 8080, `npx http-server public -p 8080`) uses
    `reuseExistingServer: true` - if a server is already listening there, that's expected and correct,
    not a problem to fix. Never run two Playwright invocations concurrently; they share that port.
  - **This app registers a Service Worker (`public/sw.js`) that has been confirmed, during this
    story's own dev-story pass, to intercept `/api/characters` AHEAD of Playwright's `page.route()`
    stubs and serve real, cached PRODUCTION character data instead of a test's intended fixture** -
    with zero matching request even visible to `page.on('request')`. `test.use({ serviceWorkers:
    'block' })` did NOT fix it. If you run the new Playwright spec yourself and see character names
    you don't recognise from the fixtures in the test file (e.g. real campaign names rather than
    "Custom Pool Tester" / "Blank Slate" / "Fake Character"), that is this leak, not a new bug - do
    not spend time re-diagnosing it, and do not treat it as evidence the test is wrong. It is a
    disclosed, pre-existing, out-of-scope environment hazard. The new test file works around it by
    injecting the fixture character via the real `window.pickChar(c)` global instead of depending on
    `/api/characters` - if you want to verify the tests are real (not vacuous), that is the mechanism
    to check, not the network layer.
  - A local API server on port 3000 is NOT required for the new Playwright spec or the two existing
    specs named in Author Claims below - all of them run against the static frontend only.
- **Blast radius**: this diff touches `char-pools.js`'s `renderCharPools()` (called from THREE
  separate sites in `app.js` - `openChar`, `pickChar`, `_switchChar`) and `app.js`'s shared
  `openPanel()` dispatcher, both genuinely shared infrastructure. A mistake here can silently affect
  every OTHER existing pool button (Discipline panel, Common Actions panel, every skill/discipline
  pool tile), not just the new "+ Custom Pool" tile this diff adds.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe (see Author Claims below for the exact
  commands). Report the real numbers even if they disagree with anything the story claims -
  especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/rlv-4-diff.txt` and **nothing else**. No spec, no
story file, no project context. Do not explore the repository. Do not go looking for the spec. Read
other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A free-form "Custom Pool" builder added to a dice-roller app's character panel: a new tile opens a
picker with three chip groups (Attribute, Skill, Discipline), computes a live dice-pool total as
chips are toggled, and a "Load Pool" button commits the total into the app's existing roll
calculator. Touches four files: a one-word export change in a shared pool-math module, a new tile
+ helper in the character-pools renderer, a new panel-mode branch plus three call-site edits in the
main app controller, and ~13 new lines of CSS. A new Playwright test file is included.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. In the new `mode === 'custom'` branch (`app.js`): `bits.push(skill + ' ' + (unskilled ? unskilled
   : skillV) + ...)`. Verify the function this depends on (exported from the shared pool-math module
   in this same diff) can never return `0` for a real, meaningful penalty - a falsy-zero would
   silently fall through to displaying `skillV` instead of a real (zero) penalty in the breakdown
   text, misrepresenting the actual pool the user is about to load.
2. `const total = Math.max(0, attrV + skillV + unskilled + discDots);` - verify this floor cannot mask
   a case the UI ought to represent differently (e.g. silently converting a large negative total into
   an indistinguishable "0" the same as a genuinely-zero pool).
3. The `pi` object built at "Load Pool" time (`{ total, attr, attrV, skill, skillV, unskilled, discName,
   discV, resistance: null }`) is handed to an existing `loadPool(total, label, pi)` function this
   diff does not modify. Check the diff's own comments/naming for every field that function's
   downstream breakdown-rendering code is claimed to read, and flag anything you cannot confirm is a
   field-for-field match without seeing that function's real source (which is legitimately outside
   this diff - flag as "worth checking in Pass 2", don't assert it's wrong).
4. The new tile-push code (`char-pools.js`) adds an entry to a shared array with NO `total` field on
   it (`{ opensPanel: 'custom', label: '+ Custom Pool' }`), alongside pre-existing entries in the same
   array that DO always carry `total`. Confirm nothing in the diff's own click-wiring code reads
   `.total` off an array entry unconditionally before checking for `.opensPanel` first - that ordering
   is exactly the kind of thing a partial fix gets backwards.
5. Three separate call sites in `app.js` were each edited to add the same one-line guard
   (`if (p.opensPanel) { openPanel(p.opensPanel); return; }`) ahead of an existing `loadPool(...)`
   call. Confirm all three edits are genuinely present and consistent with each other - not just two
   of three, and not one with a subtly different condition.
6. Two of those three edits also **reorder** an existing `goTab('roll')` call to run BEFORE the new
   guard/loadPool, where it previously ran AFTER. Flag this reordering as worth Pass 2 attention -
   it changes execution order for the PRE-EXISTING (non-custom) pool-tap path too, not just the new
   one.
7. Self-contradiction check: does anything in the diff's own comments claim a file was NOT touched
   (e.g. a roller/dice-math module, a resistance-parsing module, an equipment module, a tracker
   module) while the diff itself actually touches it? Check the diff's file list against its own
   inline claims.
8. Standard sweep: dead code, unused imports, unreachable branches, unhandled promise rejections,
   resource cleanup on a thrown path (none expected here, this diff has no async I/O - confirm that
   assumption rather than assuming it), and any check whose PASS condition is trivially satisfiable
   (e.g. a Playwright locator that would also pass by matching zero elements).

**STOP. Write your Pass 1 findings to `specs/stories/code-review/rlv-4-codex-findings.md` now, before
reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1 above.

### What to hunt for

1. Read `public/js/game/char-pools.js`'s `renderCharPools()` in full. Walk it for a character whose
   `disciplines` and `skills` are both empty objects (or absent). Confirm the pools array ends up with
   exactly one entry (the new tile), the section-visibility gate is `true`, and the "Skill Pools" /
   "Discipline Pools" section headers are correctly OMITTED while the collapse toggle still renders
   around just the one tile - not a broken partial render.
2. The pools array this file builds is a **module-level mutable variable**, reset and rebuilt at the
   top of every `renderCharPools()` call; the DOM click handlers read an index into it **at click
   time**, not at render time. Walk what happens across two successive calls in one page session
   (e.g. switching from character A to character B): can a button still attached to the DOM from
   character A's render resolve its index against character B's freshly-rebuilt array and open the
   wrong panel, or load a different character's pool than the tile visually shows? State whether this
   is reachable in the real call sequence you find, not just in the abstract.
3. In `app.js`'s new custom-mode render closure: hand-trace this exact click sequence - Attribute
   chip A -> Skill chip S -> Discipline chip D -> click chip A again (deselect). Confirm `skill`/`disc`
   correctly survive the re-render, the live total recomputes with `attrV` dropped to 0, and - per the
   diff's own gating logic - the entire total/Load-Pool line correctly disappears when Attribute is
   unselected even though Skill and Discipline are still selected (i.e. Attribute is treated as the
   one mandatory chip, not "at least one of the three").
4. The default-shown skill list is filtered by a shared skill-total accessor function that (per its
   own file, read it) folds in bonus dots from two character-object Set fields populated by some
   OTHER, earlier part of the boot sequence not in this diff. Trace whether `renderCharPools()`/
   `openPanel('custom')` could plausibly run before those Sets are populated on a freshly-loaded
   character object, and if so what the user would see (an understated skill list/total, or a
   crash on `.has()` against `undefined`).
5. Read the Attribute-value accessor function this diff calls (`getAttrEffective` or equivalent) in
   full. It composes a base value with a discipline-boosts-attribute rule read from a rules cache.
   Confirm the SAME function (not a re-implementation) is what both (a) the new Custom Pool builder's
   live-total display and (b) the pre-existing `loadPool()`/breakdown-line code downstream both call -
   a divergence here would show the user one number while loading a different one.
6. Route/matcher order check: the new `else if (mode === 'custom')` branch was appended to an existing
   if/else chain of panel modes in `openPanel()`. Confirm it cannot shadow, or be shadowed by, any
   existing mode string, and that the chain's final `else` (if any) still behaves correctly with one
   more branch ahead of it.
7. Malformed/absent input: what does the new custom-mode panel render for a character object missing
   `disciplines` entirely (not just empty), or whose `disciplines` values are missing a `dots` field?
   Trace the actual property accesses, don't assume the optional-chaining/fallback is complete just
   because it appears in most of the surrounding lines.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/rlv-4-codex-findings.md` now, before
reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/rlv-4-port-builder-ux-into-unified-roller.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record section yet.** Skip past it entirely. Reading the author's own
   record first anchors you on their framing and turns a review into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an
     AC's exception is exactly as narrow as it is written.
   - Deviations from stated intent. The spec's own scope-boundary section (near the top, before the
     numbered ACs) is equally load-bearing - check the change did not quietly do an excluded thing.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Already ruled on - do not re-litigate these, and do not flag their absence as a gap:**
- The choice to standardise the unified roller on `char-pools.js`/`shared/pools.js`'s pool model
  rather than the admin app's `dice-engine.js` model is a settled, prior architectural decision
  (documented in the epic file this story belongs to) - do not question which model should have won.
- The decision to adapt an already-built, already-reviewed prior-art implementation (named and cited
  in the spec's own "CRITICAL" section at the top) rather than build the picker UI from scratch is
  deliberate and explained there - do not flag "why didn't the author design this fresh" as a finding.
- Explicitly OUT of scope, confirmed deliberate (the spec's own scope-boundary section names these):
  any Vampire-Mechanics-style quick-action tiles, any Staking/Torpor flow, any change to the shared
  resistance-parsing module's exports, any change to an equipment-derivation "is this a stake weapon"
  helper, any change to a tracker persistence allowlist, and any "no-WP-bonus" guard in the roll
  calculator's effective-pool function. None of these belong in this diff - do not flag their absence.
- The new tile is intentionally NOT gated behind any feature flag - deliberate, not an oversight.
- The character-pools section now ALWAYS renders (even for a character with zero skills and zero
  disciplines) because the new tile alone is reason enough - this is the spec's own literal wording,
  not an accidental behaviour change to flag.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes these specific, checkable claims:
   - `tests/rlv-4-custom-pool-builder.spec.js` passes 10/10. Run it yourself:
     `cd "D:\Terra Mortis\TM Game" && npx playwright test tests/rlv-4-custom-pool-builder.spec.js --reporter=line`
   - A 9-file vitest batch (`server/tests/bl2-boot-priming.test.js`,
     `bl4-bloodlines-admin-view.test.js`, `bl5-lineage-lock-client.test.js`,
     `crd-2-pending-queue.test.js`, `gdx-7-apply-costs-on-roll.test.js`,
     `issue-871-876-ecm-4-9-bundle.test.js`, `issue-879-defence-penalty-wirein.test.js`,
     `oaq-3-approval-queue.test.js`, `otc-3-office-nav-unconditional.test.js`) passes 316/316. Run it
     yourself: `cd "D:\Terra Mortis\TM Game\server" && npx vitest run tests/bl2-boot-priming.test.js tests/bl4-bloodlines-admin-view.test.js tests/bl5-lineage-lock-client.test.js tests/crd-2-pending-queue.test.js tests/gdx-7-apply-costs-on-roll.test.js tests/issue-871-876-ecm-4-9-bundle.test.js tests/issue-879-defence-penalty-wirein.test.js tests/oaq-3-approval-queue.test.js tests/otc-3-office-nav-unconditional.test.js`
   - Two pre-existing Playwright specs touching the same Roll-tab/`app.js` surface still pass 13/13
     after this diff (no regression from the import/onTap-callback edits). Run it yourself:
     `cd "D:\Terra Mortis\TM Game" && npx playwright test tests/rlv-2-single-roller-retirement.spec.js tests/issue-1024-roll-v2-anchor-and-again-seg.spec.js --reporter=line`
   - The claim that a Service Worker leak (see Ground Rules above) was diagnosed and worked around by
     injecting the fixture character via `window.pickChar(c)`, and that `test.use({ serviceWorkers:
     'block' })` alone did NOT fix it. You do not need to re-diagnose the leak itself (disclosed
     hazard) - just confirm the new test file's actual technique matches what's claimed, by reading
     it.
   - The claim that all three `renderCharPools()` onTap call sites in `app.js` were updated
     consistently (see Pass 1, item 5).
   - The claim that `public/js/suite/roll-v2.js` was not modified by this diff at all.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. If a
   first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed"/"verified" label can itself be wrong -
   re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/rlv-4-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including the three gate commands in Pass 3b step 5.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
