# Adversarial review - gdx-3-mobile-touch-targets (44px effective hit areas on the player game-night surfaces), TM Suite

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
   `specs/stories/code-review/gdx-3-mobile-touch-targets-codex-findings.md`, before you open anything
   the next pass allows. Do not revise an earlier pass's findings in light of what a later pass taught
   you - if a later pass contradicts an earlier one, say so as a new finding and leave the original
   standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/gdx-3-mobile-touch-targets-diff.txt` and is relative to that root, taken
  against base commit `3f4b2f2a`.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/gdx-3-mobile-touch-targets.md`, `specs/stories/sprint-status.yaml`,
  `specs/deferred-work.md`) are excluded from it on purpose, so the earlier passes stay genuinely
  blind to the author's own account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo (`TM Game`) is one of several sibling repos
  in a larger umbrella workspace (`TM Story`, `TM Herald`, `TM Admin`, `TM Design System`) - do not
  read, open, or touch any of those sibling directories even for context; everything you need is
  inside `TM Game`.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards**: the Playwright suite (`npx playwright test tests/desktop-and-css.spec.js`)
  serves the app on port 8080 with `reuseExistingServer`. Never run two Playwright invocations
  concurrently against this repo - if a run appears to hang or a port conflict occurs, disclose it
  rather than silently retrying in a way that could produce a false pass. In past sessions an
  unrelated `python -m http.server 8080` process has intermittently squatted this port and produced a
  false-positive green run - if your own measurements look suspiciously clean or suspiciously wrong,
  check what's actually listening on 8080 before trusting the result.
- **Blast radius**: `public/css/components.css` is loaded by both `public/index.html` (the player app)
  and `public/admin.html` (the ST-only admin app). A mistake in a rule this diff added to
  `components.css` - not just `suite.css` - can silently affect the admin editor too, not just the
  surfaces this story was actually aimed at.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `npx playwright test tests/desktop-and-css.spec.js`. Report the real numbers even if they disagree
  with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/gdx-3-mobile-touch-targets-diff.txt` and **nothing
else**. No spec, no story file, no project context. Do not explore the repository. Do not go looking
for the spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A CSS-only change giving small tappable UI controls in a browser-based character-sheet app a real
minimum touch-target size (44 CSS pixels, a WCAG 2.5.5/2.5.8-shaped figure) without changing their
*visible* size. It adds one new CSS custom property token, then applies one of three named techniques
per element: growing an already-invisible box directly, adding a transparent `::after`/`::before`
pseudo-element overlay sized to cover the required area while the real box stays small, or (only at a
narrow-viewport media-query tier) growing the visible box itself where the other two techniques would
overlap a neighbouring element or hit a clipping ancestor. It also adds new Playwright end-to-end
tests that measure the real rendered hit area (not just read the CSS rule) via `elementFromPoint` at
the edges of the claimed tappable region.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **Every `::after`/`::before` overlay actually painted vs. actually clickable.** A transparent
   pseudo-element only receives clicks if it is positioned over the parent (`position:absolute` or
   similar) AND the parent doesn't have `overflow:hidden`/`clip`/`clip-path` clipping it, AND nothing
   else with a higher stacking context sits on top intercepting the pointer event. For every new
   `::after{content:''}` / `::before{content:''}` rule in the diff, check the *actual* selector chain
   for a sibling or ancestor rule (in either changed file, or already present in the unchanged parts of
   the stylesheet) that could clip, cover, or set `pointer-events:none` on it.
2. **Elements that already had their own `::after` or `::before` for a different purpose** (an icon, a
   focus ring, a decorative element) before this diff. Adding a *second* pseudo-element position isn't
   possible in plain CSS (an element only has one `::before` and one `::after`) - if the diff adds a
   touch-target overlay to an element that already used one of those two pseudo-element slots for
   something else, either the new rule silently replaced/broke the old visual, or the diff must be
   doing something else (a wrapper, a different technique) - check which, and flag if it looks like a
   silent collision.
3. **Overlapping hit areas between adjacent enlarged elements.** Any set of same-row or same-list
   elements that each got an enlarged hit area - check whether two neighbours' 44px zones now overlap
   each other, which would make one element intercept taps intended for the other (the opposite of the
   story's own goal).
4. **`<select>` elements.** Browsers render native form controls without generating CSS pseudo-element
   boxes reliably - if the diff applies a `::after`-overlay technique to any `<select>`, check whether
   that technique can possibly work on that element type, or whether it's dead CSS.
5. **The new custom property token's placement.** Is it declared once, in a sensible single location,
   and consistently referenced via `var(...)` everywhere the diff applies the 44px figure - or does a
   literal `44px` appear hardcoded anywhere alongside the token (which would make the token
   ornamental, not load-bearing, for future maintenance)?
6. **Media-query-gated rules ("T3" in the diff's own comments).** For each one, check it is scoped to
   a narrow-width breakpoint only and does not leak into the desktop cascade - and check for
   specificity conflicts with any *other* existing rule for the same selector (an existing
   higher-specificity rule elsewhere in the file could silently defeat a newly added narrow-width
   override, the same shape of bug this project's own prior story found and fixed with a
   `body.desktop-mode` selector).
7. **The new Playwright tests' actual pass condition.** For each new `elementFromPoint`-based
   assertion: does it truly fail when the hit area is smaller than claimed, or could it pass
   vacuously (e.g. testing a point that happens to land inside the *visible* box regardless of whether
   the invisible overlay technique works at all, or using `toBeGreaterThanOrEqual(0)`-shaped tautologies)?
   Is there a `.length > 0`/truthy check anywhere that would pass on an empty locator?
8. **Self-contradiction within the diff.** Does any comment describe an intent (e.g. "leaves the
   visible box unchanged") that the accompanying rule doesn't actually achieve (e.g. a `padding`
   change that DOES visually grow the box, mislabelled as hit-area-only)?
9. Dead code: any newly added CSS selector that doesn't match anything live, any newly added test
   helper function that's never called.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/gdx-3-mobile-touch-targets-codex-findings.md` now, before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need to
understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1: a CSS-only 44px minimum-touch-target pass across `public/css/suite.css` and
`public/css/components.css`, using three named techniques (direct box growth, transparent overlay,
narrow-viewport-only box growth), plus new Playwright tests in `tests/desktop-and-css.spec.js`.
`components.css` is shared between `public/index.html` (player) and `public/admin.html` (ST admin).

### What to hunt for

1. **Trace every changed selector to its real DOM context by reading the JS that renders it.** For
   each selector this diff adds a rule for, find where it's actually emitted in `public/js/` (grep for
   the class name) and confirm: (a) it genuinely renders on a player-facing surface as the diff's
   comments claim, not an ST-only or admin-only one; (b) the element's real parent chain matches what
   the new CSS rule assumes (e.g. if a rule assumes `position:relative` on the immediate parent for an
   absolutely-positioned overlay to anchor against, confirm that parent really has it, in the real
   unchanged CSS, not just assumed).
2. **`components.css` is shared with `admin.html`.** For every rule this diff added or changed in
   `components.css`, check whether the same selector also renders inside the admin editor
   (`public/js/editor/*.js`, `public/js/admin/*.js`) with a DIFFERENT layout context (a denser grid, a
   smaller container) where a 44px hit area could now overlap an admin-only neighbour that doesn't
   exist on the player surface. This project's own immediately-preceding story (a different one, not
   this diff) found and had to specifically reason about exactly this kind of player/admin surface
   leakage in this same pair of files - it is a known real risk category here, not a hypothetical one.
3. **Read the full, current `tests/desktop-and-css.spec.js` file.** Confirm the new tests actually
   mount their fixtures inside a realistic DOM position (not a bare `document.body`-appended element
   detached from the real tab/ancestor structure) - if any new test uses a synthetic/detached fixture,
   determine whether that undermines what it's claiming to prove (a prior story's own code review
   flagged exactly this pattern as a real weakness in this same test file).
4. **Walk the T2 (`::after`/`::before` overlay) technique's clipping-ancestor risk by hand for at
   least 3 different selectors it's applied to**: read every ancestor rule up the DOM chain for each,
   by hand, checking for `overflow:hidden`, `overflow:clip`, `clip-path`, or `contain:layout|paint`
   anywhere in that chain (in the FULL current stylesheets, not just the diff) that could silently
   clip the enlarged pseudo-element's paint/hit area even though the CSS declaration itself looks
   correct in isolation.
5. **Dark theme / `[data-theme="dark"]` and Parchment default theme.** Is the new `--tap-min` token (or
   whatever the diff actually named it) declared in a theme-invariant way (bare `:root`, not nested
   under a theme selector)? Confirm by reading the token's actual location.
6. **Malformed/edge states**: what happens to an enlarged hit area when the underlying element is
   `disabled`, hidden (`display:none`), or its container is mid-animation/transition - does the
   overlay ever remain interactive/hit-testable after the element it's attached to should no longer be?
7. **State mutated by one measurement leaking into a later one in the same test run** - if the new
   tests share any module-level fixture-building helper with pre-existing tests in the same file,
   check for interference (e.g. a DOM element left mounted from a previous test still present and
   intercepting `elementFromPoint` in a later test).

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/gdx-3-mobile-touch-targets-codex-findings.md` now, before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/gdx-3-mobile-touch-targets.md` - the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Explicitly NOT in scope, and deliberate - do not flag these as gaps:**
- `.dot` (`components.css:48`, the ST-editor-only rating dot, ~18px) - deliberately left untouched;
  the story's own reasoning is that raising it to 44px would overlap the tight row/dot pitch it sits
  in and make mis-taps *more* likely, not less. The real player-facing rating dot is a DIFFERENT
  selector, `.pref-dot`, which IS in scope.
- The downtime-form `.dt-` controls - a different epic already ratified a different (32/36px) target
  for that surface; explicitly deferred, not this story's to touch.
- Other ST-only surfaces, and the ST editor section generally, EXCEPT `.edit-tab` specifically, which
  the story deliberately pulled INTO scope with its own stated reasoning (check that reasoning against
  the actual diff, don't just accept the exclusion of "the editor" as blanket).
- `.svt-toggle{overflow:hidden}` clipping `.svt-btn` is a KNOWN, already-diagnosed cause (not a new
  finding) for why `.svt-btn` uses the narrow-viewport box-growth technique instead of an overlay -
  don't re-report discovering this same fact as if it were new, but DO verify the diff's own claimed
  fix for it actually works.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims:
   - Exact counts: 1 element using direct box growth, 57 using the transparent-overlay technique (55
     `::after` + 2 `::before`), 18 using the narrow-viewport-only box-growth technique.
   - A claim that 11 of the 18 narrow-viewport-technique elements were *moved there from* the overlay
     technique specifically because a failing test caught a real problem (6 `<select>` elements where
     no pseudo-element box is generated at all; 4 stacked rows where the overlay reached into a
     neighbour; 5 elements clipped by 5 different ancestors) - verify this is really what happened by
     reading the actual current CSS for at least 3 of these specific elements and confirming they use
     the narrow-viewport technique, not an overlay, and that the reason given is consistent with what
     you can observe.
   - A claim that `tests/desktop-and-css.spec.js`'s full run went from a 29-passed/12-failed baseline
     (before this story) to 35 passed / 12 failed (after), with the same 12 failures by name in both
     runs (i.e. zero regressions, 6 net new passing tests).
   - A claim that a `git stash`-based visual-diff sweep at 1280px in both themes found EXACTLY ONE
     element with a different rendered size (`.pref-dot`, described as a deliberate, documented
     exception where a compensating negative margin was used so the *rendered layout* stays identical
     even though the element's own bounding box grew) - and that the same sweep at 360px found 20
     elements differing, all named, including two claimed "indirect" knock-on effects.
   - A claim that each of "six technique groups" was prove-discriminated separately (i.e., reverting
     just that group's CSS causes a specific, predicted subset of the new tests to fail, and restoring
     it makes them pass again) - pick at least 2 of the six groups and personally verify this by
     reverting just that group's rule(s), running the tests, confirming the predicted failure, then
     restoring and confirming green again. Use `git diff` to confirm your restore left the tree byte
     -identical to before you started.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Run
   the drivers yourself. Grep the files yourself. If a first run is inconsistent, run it twice and
   say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/gdx-3-mobile-touch-targets-codex-findings.md`, grouped
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
  `npx playwright test tests/desktop-and-css.spec.js`.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
