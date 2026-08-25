# Adversarial review - dtui-23-feeding-territory-relocation (Feeding: territory, Blood Type and Method of Feeding grouped as consistent tickers), Terra Mortis TM Game

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
   `specs/stories/code-review/dtui-23-feeding-territory-relocation-codex-findings.md`, before you open
   anything the next pass allows. Do not revise an earlier pass's findings in light of what a later
   pass taught you - if a later pass contradicts an earlier one, say so as a new finding and leave the
   original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/dtui-23-feeding-territory-relocation-diff.txt` and is relative to that
  root, taken against base commit `361716b6`.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo (`TM Game`) sits in an umbrella workspace
  alongside sibling repos `TM Story`, `TM Herald`, `TM Admin`, and `TM Design System` at
  `D:\Terra Mortis\`. Do not read from or touch any of those siblings even to check something - stay
  entirely inside `TM Game`.
- **Environment hazard, disclose rather than skip**: this machine has a recurring issue where a
  sibling project's (TM Admin) dev server ends up bound to port 8080 (sometimes actively
  respawned by its own supervisor within a second of being killed), and this repo's
  `playwright.config.js` has `reuseExistingServer: true` on port 8080 - meaning Playwright may
  silently reuse the WRONG server (TM Admin's, not this repo's) and every test will then fail with
  `#app` never becoming visible. Before running any Playwright spec, check `curl -s
  http://localhost:8080/ | head -5` - if the title says "TM Admin", do not just kill it and reuse
  port 8080 (it may respawn faster than your test run). Instead run with an ad-hoc alternate-port
  config, e.g. create a throwaway config (not committed) that sets `use.baseURL` to
  `http://localhost:8099` and `webServer.command` to `npx http-server public -p 8099 -s` with
  `reuseExistingServer: false`, then `npx playwright test <spec> --config=<that file>`. Delete the
  throwaway config file when done. If you cannot get a clean server, disclose that explicitly rather
  than reporting a guessed pass/fail.
- **Blast radius**: `public/js/tabs/downtime-form.js`'s `collectResponses()` writes
  `_feed_blood_types` (JSON array), `feed_violence` (string), and `feeding_territories` (JSON object)
  into the submission's `responses` object. These exact field names and value shapes are read by
  several OTHER consumers this diff does not touch: `public/js/tabs/feeding-tab.js`,
  `public/js/admin/downtime-views.js`, and roughly two dozen Playwright/vitest fixtures across the
  repo. A shape change here (e.g. blood type becoming a bare string instead of a one-element array,
  or a value casing change) would silently break every one of those consumers, not just this diff's
  own new test.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `npx playwright test tests/dtui-23-feeding-territory-relocation.spec.js`,
  `npx playwright test tests/dt-form-35-feed-violence-default.spec.js`,
  `npx playwright test tests/fix-48-feed-card-violence-sync.spec.js` (each single-worker, isolated,
  against a clean port per the hazard note above). Report the real numbers even if they disagree with
  anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/dtui-23-feeding-territory-relocation-diff.txt` and
**nothing else**. No spec, no story file, no project context. Do not explore the repository. Do not
go looking for the spec. Read other files only to resolve an import path the diff itself leaves
ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A player-facing downtime form's "Feeding" section is restructured: a Territory picker that used to
render at the top of the feeding card now renders after the hunt-method cards and dice pool, grouped
with a Blood Type picker and a "Method of Feeding" (Kiss/Assault) picker. Blood Type and Method of
Feeding are rewritten from a hand-rolled button-toggle pattern (`.dt-feed-vi-btn` / manual class
juggling in click handlers) into native `<fieldset><input type="radio">` groups using an existing
shared `.dt-ticker` CSS component. The old button CSS and its two click handlers are deleted; two new
`change`-event branches are added to an existing delegated listener. `collectResponses()`'s handling
of the persisted `feed_violence` and `_feed_blood_types` fields is correspondingly rewritten. One
existing test file (`dt-form-35-feed-violence-default.spec.js`) is updated to match the new markup,
and one new test file is added.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **Self-contradiction on the `feed_violence` collection strategy.** Read every comment in the diff
   touching `collectResponses()`'s `feeding_method` branch closely - does the shipped code actually
   use ONE consistent strategy (JS-state merge vs. a DOM `:checked` read), or do the comments describe
   one approach while the code implements a stray mixture of both? A half-reverted change here is easy
   to miss on a skim.
2. **`.dt-ticker__pill` / `<input>` pairing correctness.** The new Blood Type and Method of Feeding
   markup relies on a `<label>` wrapping an `<input type="radio">` (native label-click-activates-input
   semantics, not an explicit `for`/`id` pairing). Check every new `<label class="dt-ticker__pill">`
   block for a typo that would break this (a stray closing tag, an input placed outside its label, a
   missing `type="radio"`).
3. **Dead code / incomplete deletion.** The diff claims to fully delete `.dt-feed-vi-btn`,
   `.dt-feed-violence-toggle`, and the `[data-blood-type]`/`[data-feed-violence]` click handlers.
   Grep the diff itself for any surviving reference to those four names outside of a comment
   explaining the historical rename.
4. **Casing/string-matching fragility.** Blood Type options are the literal strings `'Animal'`,
   `'Human'`, `'Kindred'` (capitalised). The render side compares `selectedBlood === bt` and sets
   `checked` accordingly; the collect side reads `checkedBlood.value` straight from the DOM. Confirm
   there is no path where a differently-cased or legacy-lowercase value (the diff's own removed code
   had a comment about "legacy multi-array reads first item" - check what that implies about historical
   data shapes) could silently fail to match and pre-select nothing, or produce an inconsistent
   `_feed_blood_types` value on the next save.
5. **New `change`-listener branch scoping.** Two new `if (e.target.matches('input[name="dt-feed_violence"]'))` /
   `if (e.target.matches('input[name="dt-feed_blood_type"]'))` branches are added inside a large
   existing delegated `change` handler with many sequential `if (...) { ...; return; }` blocks. Check
   whether an EARLIER branch in that same handler could intercept these radios first via a broader
   selector (e.g. a `.closest(...)` check with a class or attribute the new `<label class="dt-ticker__pill">`
   wrapper also happens to carry).
6. **The reordering itself.** The territory-picker block moved from before the hunt-method cards/pool
   to after them, inside the same render function. Check whether anything computed earlier in that
   function (e.g. a MINIMAL-mode pool calculation that reads a territory value) implicitly depended on
   territory's OWN markup being emitted first, as opposed to just the underlying data being available -
   these are not the same thing if any DOM query timing is involved.
7. Standard sweep: assertions/checks whose PASS condition is trivially satisfiable; a check whose label
   claims more than it tests; error paths and resource cleanup on a thrown path (there is none obvious
   here, but confirm); unused imports or now-orphaned helper functions the deletions may have left
   behind.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/dtui-23-feeding-territory-relocation-codex-findings.md` now, before reading
further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need to
understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1 above - re-read it, but now verify every claim against the real repository
rather than taking the diff's own framing at face value.

### What to hunt for

1. **Hand-trace `collectResponses()`'s `feeding_method` branch** in
   `public/js/tabs/downtime-form.js` end to end for THREE scenarios, by reading the real function, not
   the diff snippet: (a) a fresh character with no method ever picked (`feedMethodId` empty), (b) a
   character whose saved submission has `_feed_method` set but no `feed_violence` key at all, (c) a
   character whose saved submission has BOTH `_feed_method` and an explicit `feed_violence` that
   contradicts that method's own default. For each, state exactly what `_feed_method`, `feed_violence`,
   and `_feed_blood_types` end up as, and whether an explicit prior save is ever silently overwritten by
   a default.
2. **Hydration interaction.** `downtime-form.js` has an existing (NOT part of this diff) hydration step
   around line 1607-1623 that backfills `responseDoc.responses.feed_violence` from the method's default
   BEFORE the first render, when absent. Read it, and trace how it interacts with the render case's own
   `preselect` computation and with `collectResponses()`'s own merge. Is there any scenario where these
   two independent pieces of "fill in a violence default" logic disagree with each other or double-apply
   in a way that produces a different result than either alone?
3. **Click-then-immediate-collect ordering.** Find the `[data-feed-method]` click handler (search for
   `feedMethodId = feedCard.dataset.feedMethod`). It calls `collectResponses()` and THEN `renderForm()`.
   Trace precisely what DOM state exists at the moment `collectResponses()` runs relative to what the
   NEXT `renderForm()` call will paint. Does anything in the new Blood Type / Method of Feeding
   collection logic read DOM state that has not yet been updated to reflect the just-changed method,
   the way an earlier version of this exact code apparently did wrong (there is a comment in the diff
   admitting a real regression was found and fixed here - verify the FIX actually holds for every
   method, not just the one case a test might cover)?
4. **Rapid interaction / debounce race.** `scheduleSave()` debounces a server save at 2000ms and a
   localStorage mirror at 800ms. If a player clicks Blood Type, then Method of Feeding, then a different
   Blood Type option again, all within under 800ms, trace whether `_feed_blood_types`/`feed_violence`
   ever end up reflecting a STALE intermediate state rather than the final one when the debounced save
   eventually fires and calls `collectResponses()`.
5. **Malformed/absent input.** What does the new Blood Type and Method of Feeding rendering produce
   when `responseDoc` is `null` (a genuinely fresh, never-saved submission)? Trace `selectedBlood`,
   `persistedViolence`, and `preselect` for this case and confirm no exception and no `checked` attribute
   ends up on an unintended option.
6. **Mode-toggle state retention.** `feedMethodId` and its siblings are module-level variables, not
   re-derived per render. Toggling between MINIMAL and ADVANCED mode triggers a full `renderForm()`.
   Trace whether the Blood Type/Method of Feeding selections (and the newly-repositioned Territory
   picker) survive a mode toggle correctly, or whether anything resets unexpectedly given their new
   position in the render sequence.
7. **New test file fixture fidelity.** Open `tests/dtui-23-feeding-territory-relocation.spec.js` and
   compare its mocked API routes and character/cycle fixtures against what `renderDowntimeTab()` in
   `downtime-form.js` actually fetches and expects (character shape, `/api/attendance` shape,
   `/api/characters/names` shape, `/api/chapters` shape). Flag any place the test's mock is looser or
   different in shape from what the real API would return, in a way that could make a test pass for the
   wrong reason.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/dtui-23-feeding-territory-relocation-codex-findings.md` now, before reading
further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/dtui-23-feeding-territory-relocation.story.md` - the **Story** (top), **Context**,
   **Files in scope**, **Out of scope**, and **Acceptance Criteria** sections ONLY.
2. **Do NOT read the "Dev Agent Record" or "Senior Developer Review (AI)" sections yet.** Skip past
   them entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "Out of scope" section is equally load-bearing** - check the
     change did not quietly do an excluded thing.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Explicitly settled decisions - do not flag these as gaps, re-litigate them only if you find concrete
evidence they are wrong, not just because the choice is debatable:**

- Territory is deliberately NOT converted to literal `.dt-ticker` markup (kept as its existing
  `renderFeedingTerritoryPills()` rendering) - a documented decision to avoid regressing ambience/
  feeding-rights/poaching/Barrens colour-coding and rote-territory locking that `.dt-ticker` has no
  equivalent for.
- `dtui-24` (a Method-of-Feeding label rename to "The Kiss (subtle)"/"The Assault (violent)") is
  confirmed already satisfied by pre-existing code, not this story's own work - this story does not
  claim credit for it and does not touch the label copy.
- `dtui-25` (Rote panel ordering + its own three feeding selectors) is explicitly out of scope - the
  Rote panel's own separate rendering path (search for `renderFeedingTerritoryPills(roteTerrGridVals, true, ...)`)
  is deliberately untouched.
- `_feed_blood_types` stays array-shaped (0 or 1 elements) even though the UI has been single-select
  for a while before this diff - deliberately NOT migrated to a bare string, since downstream consumers
  expect the array shape.
- Neither Blood Type nor Method of Feeding gained multi-select - both are deliberately single-select
  radiogroups, matching prior behaviour.
- The "Pre-selected based on your method. Click to confirm or change." hint text is claimed to be
  unreachable dead code predating this story (caused by an existing hydration step, not this diff) -
  verify this specific factual claim for real in Pass 3b below rather than accepting it here, but do
  not treat "the hint never shows" as itself a defect this story introduced if the claim holds up.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes these specific, checkable claims - attack each
   one:
   - "confirmed via grep: zero matches for `dt-feed-vi-btn`, `dt-feed-violence-toggle`,
     `data-blood-type`, or `data-feed-violence` anywhere in `downtime-form.js` or `components.css`
     post-change" (comments referencing the old names for historical context are claimed to be the only
     remaining hits).
   - "`tests/dtui-23-feeding-territory-relocation.spec.js` (7 tests, AC1-AC5c) ... All 7 passed clean in
     isolation."
   - "`tests/dt-form-35-feed-violence-default.spec.js` updated ... all 6 tests pass."
   - A specific claimed regression-and-fix: an initial DOM-`:checked`-read implementation of the
     `feed_violence` collection broke `fix-48-feed-card-violence-sync.spec.js`'s own AC-3 (verified via
     `git stash` A/B against the unmodified base commit), was fixed by reverting to a JS-state merge,
     and all 4 fix-48 tests pass with the fix in place.
   - A claimed pre-existing, out-of-scope finding: the Method of Feeding "pre-selected" hint text has
     been unreachable since an earlier fix (search the codebase for "fix.48" near line ~1614-1620 of
     `downtime-form.js`) added an eager load-time backfill, independent of this diff.
   - "Broader regression batch ... 11 of these failed on the first pass; `git stash` A/B against
     unmodified base code reproduced the identical 10 `fix-473`/`fix-475` failures ... confirmed
     pre-existing, unrelated" (both of those specs are claimed to mount a different module,
     `feeding-tab.js`, never touched by this diff).
   - "No server-side (vitest) suite references the changed client markup or field shapes."
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now (see the
   port-8080 hazard note above for how to get a clean server). Grep the files yourself for the claimed
   zero-remaining-references. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to
`specs/stories/code-review/dtui-23-feeding-territory-relocation-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including the three Playwright gate commands named
  above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
