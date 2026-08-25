# Adversarial review - gdx-4-mobile-css-cleanup (CSS standards cleanup: DOM-API/inline hex literals, dead !important grid overrides), TM Game (Terra Mortis TM Suite)

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
   `specs/stories/code-review/gdx-4-mobile-css-cleanup-codex-findings.md`, before you open anything
   the next pass allows. Do not revise an earlier pass's findings in light of what a later pass
   taught you - if a later pass contradicts an earlier one, say so as a new finding and leave the
   original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/gdx-4-mobile-css-cleanup-diff.txt` and is relative to that root, taken
  against base commit `53e55ea5` (the diff is `git diff 53e55ea5 eef2d743`, so `git show eef2d743`
  and `git show 53e55ea5:<path>` both reproduce it exactly).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **This is one repo inside a larger umbrella workspace** (`D:\Terra Mortis\`) with sibling repos
  (`TM Story`, `TM Herald`, `TM Admin`, `TM Design System`) living alongside it on disk. Stay inside
  `D:\Terra Mortis\TM Game` for everything - do not read, run, or modify anything in a sibling repo,
  even to check something.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards, disclose rather than skip:** this is a Windows machine; use whichever shell
  you have (PowerShell or Git Bash) and disclose which. Playwright serves on port 8080 with
  `reuseExistingServer` - if a server is already bound there, reuse it, and **never start a second
  concurrent Playwright invocation** against it. Several vitest suites require a local `mongod`; if
  none is running they SKIP rather than fail - a skip is not a pass, so report skips as skips, not as
  green. `npx playwright install chromium` first if Chromium is not already installed.
- **Blast radius:** `public/css/suite.css` and `public/css/components.css` are shared stylesheets
  loaded by the whole `index.html` app (Roll, Sheet, Territory, Downtime, Tracker tabs all share
  them). A mistake in `.story-split`, `.sh-attr-grid`, or `.skill-grid` here silently breaks every
  other consumer of those classes app-wide, not just the Downtime/Sheet views this diff's own tests
  probe. `public/css/admin-layout.css` is scoped to `admin.html` only.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `cd server && npm test` (vitest) and
  `npx playwright test tests/desktop-and-css.spec.js` (from repo root, Playwright). Report the real
  numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/gdx-4-mobile-css-cleanup-diff.txt` and **nothing
else**. No spec, no story file, no project context. Do not explore the repository. Do not go looking
for the spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

This diff removes DOM-API and inline-style bare-hex colour literals from `public/js` (`admin.js`,
`feeding-tab.js`, `downtime-form.js`, `print.js`), tokenises three bare-hex declarations in
`suite.css`, migrates one inline `grid-template-columns` style to a CSS class
(`admin/next-session.js`), removes `!important` from two grid rules and merges a duplicated
`.story-split` declaration block in `suite.css`, updates `coding-standards.md` and
`project-context.md` with a DOM-API-literal prohibition and a named exemption register, and adds a
new vitest source-scan test (`server/tests/gdx-4-css-standards-grep.test.js`) plus 8 new Playwright
computed-style assertions in `tests/desktop-and-css.spec.js`.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The new vitest test's own regexes may not close the gap they claim to close.** Read
   `server/tests/gdx-4-css-standards-grep.test.js` in full. `DOM_API` matches
   `\.style\.[a-zA-Z]+\s*=\s*['"`][^'"`]*(?:#[0-9A-Fa-f]{3,8}|rgba?\()`. Does this actually catch
   every way a real author would set an inline colour via the DOM API - e.g. bracket-notation
   property access (`el.style['color'] = '#fff'`), `setAttribute('style', '...')`,
   `+=`-style mutation of `cssText`, or a colour built from concatenated string pieces so no single
   token contains a full hex? Is this a gap worth flagging even if outside this diff's own stated
   scope?
2. **A published grep in the diff's own doc changes vs the enforced test regex.** The
   `coding-standards.md` hunk publishes two shell `grep -rnoE` commands for a human to run by hand.
   Compare their hex-digit quantifiers character-for-character against the quantifiers actually used
   in `server/tests/gdx-4-css-standards-grep.test.js`'s `DOM_API` and `ATTR` regexes. If they differ,
   a human copy-pasting the documented command gets a different (weaker or stronger) result than the
   checked-in ratchet actually enforces - say precisely how they differ if they do.
3. **`declarationValues()` in the AC3 describe block** (the function that strips comments, then
   repeatedly strips `var(...)` "from the inside out", then extracts `prop: value` pairs via
   `/(?:^|[{;])([^{};:]*):([^;{}]*)/g`). Walk this regex by hand against a CSS selector that itself
   contains a colon (e.g. a pseudo-class like `:hover` or `:not(...)` immediately following a `}`) and
   confirm it cannot mistake part of a selector for a declaration value, or vice versa, in a way that
   would let a real bare hex slip past silently or produce a false failure.
4. **The `.story-split` merge silently changes the shipped gap.** The diff's own comment states the
   pre-existing duplicate declared `gap: 20px` in one block and `gap: 16px !important` in the second,
   thirty lines apart, and that the merge kept `16px` "because that is the value the second block was
   actually winning with." CSS cascade order and specificity determine which of two rules with equal
   selector wins; `!important` is a tie-breaker that beats non-important regardless of source order.
   Is the reasoning in the comment actually sound for THIS pair (verify by reasoning about the
   cascade, then re-verify empirically in Pass 3b) - or could the diff have just merged into the
   losing value?
5. **`.sh-attr-grid`/`.skill-grid` lost their `!important`** on the claim that a `components.css` rule
   of "identical specificity" is beaten by source order alone (suite.css loading after
   components.css). Specificity equality is a strong, checkable claim - a single extra class,
   attribute, or ID anywhere in either selector breaks it. Is there anything in the diff itself (or
   its surrounding untouched lines) that casts doubt on the "identical specificity" claim?
6. **Newly-declared classes might collide with an existing declaration of the same name elsewhere in
   the same stylesheet**, silently changing which rule wins depending on source order rather than the
   diff's own intent. Specifically: `.dev-preview-btn`, `.ns-field-grid`, `.dt-equipment-tweak-warn`,
   `.feed-confirm-btn.is-error`, `.print-muted`, `.print-normal`, `.print-note`, `.xp-row-total`. The
   diff itself will not show you a pre-existing duplicate elsewhere in the file (that needs the whole
   file, so flag as "worth checking in Pass 2" rather than asserting).
7. **`admin.js`'s `devBtn.style.cssText = '...'` became `devBtn.className = 'dev-preview-btn'`.**
   `className =` (not `classList.add`) is a full overwrite, not additive. Does the diff's context show
   `devBtn` ever carrying another class before this assignment that would now be silently dropped?
8. **`print.js`'s embedded `<style>` block picked up 4 new classes** (`.print-muted`, `.print-normal`,
   `.print-note`, `.xp-row-total`) replacing 5 inline-style call sites. Count the replacements against
   the removals precisely: 5 inline sites removed, 4 classes added, one of them (`.print-muted`) used
   at two call sites with different combined classes (`print-muted` alone vs `print-muted print-normal`
   together). Does every removed inline style have a class replacement that reproduces the exact same
   computed styling (colour AND `font-weight:normal` where it applied)?
9. **Self-contradiction check**: the new vitest file's own AC2 test comment says "has zero offenders,
   with no allowlist at all" for the `style="..."` attribute check, but AC1's DOM-API check has a
   one-entry `ALLOWED` list. Is this inconsistency in enforcement strictness (one AC has an escape
   hatch, the sibling AC does not) justified by anything visible in the diff, or does it look like an
   arbitrary asymmetry?
10. **Dead code / unreachable branches**: in `next-session.js`, confirm the removed inline `style="..."`
    attribute's grid properties (`display:grid;grid-template-columns:...;gap:1rem;margin-bottom:1rem;`)
    are ALL present, with the same values, in the new `.ns-field-grid` class added to
    `admin-layout.css` - not a subset.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/gdx-4-mobile-css-cleanup-codex-findings.md` now, before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

This diff removes DOM-API and inline-style bare-hex colour literals from `public/js` (`admin.js`,
`feeding-tab.js`, `downtime-form.js`, `print.js`), tokenises three bare-hex declarations in
`suite.css`, migrates one inline `grid-template-columns` style to a CSS class
(`admin/next-session.js`), removes `!important` from two grid rules and merges a duplicated
`.story-split` declaration block in `suite.css`, updates `coding-standards.md` and
`project-context.md` with a DOM-API-literal prohibition and a named exemption register, and adds a
new vitest source-scan test (`server/tests/gdx-4-css-standards-grep.test.js`) plus 8 new Playwright
computed-style assertions in `tests/desktop-and-css.spec.js`.

### What to hunt for

1. **Resolve Pass 1 item 6 for real.** Grep the whole of `public/css/` (all six stylesheets:
   `theme.css`, `suite.css`, `components.css`, `admin-layout.css`, and any others present) for each of
   `.dev-preview-btn`, `.ns-field-grid`, `.dt-equipment-tweak-warn`, `.feed-confirm-btn.is-error`,
   `.print-muted`, `.print-normal`, `.print-note`, `.xp-row-total`. Confirm each is declared exactly
   once, in the file the diff put it in, with no pre-existing duplicate anywhere that could shadow or
   be shadowed by it depending on `<link>` order in `index.html`/`admin.html`.
2. **Confirm the `index.html`/`admin.html` stylesheet load order actually supports the specificity/
   source-order claims made in the diff's own comments** (item 4 and item 5 from Pass 1). Read the
   `<link>` tags in both HTML entry points in the order they appear. Does `components.css` genuinely
   load before `suite.css` in every document that loads both? Is there a third stylesheet
   (`player-layout.css` is mentioned in a nearby comment, `admin-layout.css`) that also declares
   `.sh-attr-grid`, `.skill-grid`, or `.story-split` and could interact?
3. **Walk `.story-split`'s full selector surface, not just the two blocks the diff touched.** Grep
   `suite.css` for every remaining occurrence of `story-split` (base rule, the `min-width:900px`
   media-query rule, and any selector that qualifies it further, e.g. `#t-downtime .story-split` or
   similar) to confirm no third declaration of the same class survives elsewhere in the file that the
   diff's "declared exactly once" framing missed.
4. **Trace `renderEquipmentRow` in `downtime-form.js`** (the function containing the
   `.dt-equipment-tweak-warn` change) far enough to confirm the class is applied under the exact same
   condition as before (`isChecked && tweakCost > rawMax`) and that nothing else in the file sets
   `.dt-equipment-tweak-warn` inline elsewhere (grep the whole file for the class name and for `#b23`
   or `tweak-warn` to be sure no second call site was missed).
5. **Trace `wireEvents()` in `feeding-tab.js`** far enough to see the full lifecycle of the button whose
   `style.background`/`style.color` became `classList.add('is-error')`: is there a corresponding
   success/reset path elsewhere in the same function (or a sibling function) that still expects to
   clear an inline `style.background`/`style.color` it no longer needs to, or that would need to
   `classList.remove('is-error')` and does not?
6. **`admin.js`'s `boot()` function** - read enough context around the `devBtn` creation to confirm no
   earlier line in the same function sets a class on `devBtn` before the `className = 'dev-preview-btn'`
   assignment (which would be silently overwritten), and that no CSS elsewhere in `admin-layout.css`
   already has rules keyed to a different expected class name for this button.
7. **`print.js`'s embedded stylesheet vs the coding-standards.md exemption text.** The exemption in
   `coding-standards.md` says the exemption covers print.js's *embedded stylesheet only* and that "a
   colour in a `style=\"...\"` attribute inside the same file is still a violation." Read the whole of
   `print.js` (not just the diff hunks) to confirm no `style="..."` attribute with a colour literal
   remains anywhere in the file outside the embedded `<style>` block - the diff only shows 5 converted
   sites; confirm there wasn't a 6th the diff missed.
8. **Malformed/absent input**: for the new `gdx4Probe`/`gdx4Resolve` Playwright helpers in
   `tests/desktop-and-css.spec.js`, what happens if a probed selector genuinely does not exist on the
   page (e.g. `#bnav` is absent because the app failed to boot, or `admin.html`'s login gate changed
   shape)? Do the relevant tests fail with a clear, actionable message, or with a confusing
   `null`/`undefined`-shaped error?
9. **State leakage between the new Playwright tests.** `gdx4Probe` sets/restores `data-theme` on
   `document.documentElement` and appends/removes a probe element from `document.body`. If a test
   throws mid-probe (before the restore/removal lines execute), does a later test in the same file
   inherit a leftover `data-theme` or a leftover orphan DOM node? Is there evidence elsewhere in this
   file that such leakage has bitten a previous story (check the file's own comments/history for
   precedent)?

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/gdx-4-mobile-css-cleanup-codex-findings.md` now, before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/gdx-4-mobile-css-cleanup.md` - the **Story**, **Acceptance Criteria**,
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

**Settled decisions - do not re-litigate these, they are deliberate and already ruled on:**
- The four carve-outs (dead-CSS-selector retirement, the inline `font-size:Npx` sweep, the ~17 bare
  `rgba()` sites in `suite.css`, and the two undefined custom properties `--fh2`/`--muted` in
  `next-session.js`) are explicitly OUT of scope for this story and logged to `specs/deferred-work.md`
  with named follow-up story titles. Do not flag their absence as a gap in this story.
- `print.js`'s 3 remaining embedded-stylesheet hex literals are a documented, deliberate exemption
  (the print document links no stylesheet and must render dark-on-white regardless of app theme). Do
  not flag these as violations.
- The `.dev-preview-btn` visual change (dark greys becoming theme tokens) is a declared, accepted
  exception - it only renders when `location.hostname === 'localhost'`, so no deployed user sees
  either version. Do not flag it as an unintended visual regression.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims. Attack these by
   name:
   - **"Playwright `tests/desktop-and-css.spec.js`: 44 passed / 12 failed"**, with "the 12 are the
     documented `setupSuite()` set, confirmed by name." Run it yourself and get the real numbers AND
     the real names of the 12 failures. Do they match CLAUDE.md's documented pre-existing-failure list
     for this file exactly, with zero additions or omissions?
   - **"vitest full suite: 4127 passed / 12 failed / 3 skipped"**, with the new suite
     (`server/tests/gdx-4-css-standards-grep.test.js`) claimed at "20/20". Run
     `cd server && npm test` yourself. Do the totals match? Does the new file's own test count match
     20, and are all 20 green?
   - **"Two additional pre-existing vitest failures found and A/B-proven at base"** -
     `bl3a-one-inclan-implementation` and `issue-830-inherited-card-css`, both claimed to fail
     identically with the gdx-4-touched files swapped back to `HEAD` (i.e. pre-existing, not caused by
     this story). Reproduce this A/B check yourself: `git stash` (or an equivalent per-file revert) the
     gdx-4 changes, run those two specific test files, confirm they fail the same way, then restore.
   - **"Six `!important` tokens removed, not four"** - the claim that the duplicate `.story-split`
     base block also carried `display:flex !important` and `flex-direction:column !important` in
     addition to the two grid `!important`s the story counted. Count them yourself directly in the
     diff/pre-image at `53e55ea5:public/css/suite.css`.
   - **"print.js's 5 sites measured byte-identical across 18 computed properties in a real browser"** -
     if you have a way to render `print.js`'s generated document (it is opened via `window.open()` and
     `document.write()` from `printSheet()` - check whether it is reachable/testable at all in a
     headless run, and say so plainly if it is not testable in your environment rather than trusting
     the claim).
   - **"the DOM-API grep returns exactly one line, `app.js:2180`'s `var(--green2, #7EC8A0)` fallback"**
     - run the actual grep (both the coding-standards.md-published version AND the test file's own
     regex, since Pass 1 item 2 may have found they differ) against `public/js/` yourself and report
     the real line count and location.
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

Write everything to `specs/stories/code-review/gdx-4-mobile-css-cleanup-codex-findings.md`, grouped
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
- Every command you ran, with its real result, including `cd server && npm test` and
  `npx playwright test tests/desktop-and-css.spec.js`.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
