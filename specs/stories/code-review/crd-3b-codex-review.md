# Adversarial review - crd.3b (Client resolution screen), TM Game

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
   `specs/stories/code-review/crd-3b-codex-findings.md`, before you open anything the next pass
   allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if a
   later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at `specs/stories/code-review/crd-3b-diff.txt`,
  relative to that root, taken against base commit `3f3e739d` (crd.3a's final committed state, the
  tip of the parent branch). This story's own changes are **NOT YET COMMITTED** - the diff reflects
  the current working tree on branch `ms/crd-3b-client-resolution-screen`, not a commit range.
- The diff is **deliberately scoped to source and tooling only** (`public/css/suite.css`,
  `public/js/app.js`, `public/js/game/contested-resolve.js`, `server/tests/crd-2-pending-queue.test.js`,
  `server/tests/crd-3b-resolution-screen.test.js`). Story-spec and tracking edits (the story file,
  `sprint-status.yaml`, `deferred-work.md`) are excluded on purpose, as is the standalone design-lock
  mockup at `public/mockups/crd-3b-resolve-screen-mockup.html` (a disposable static reference, not
  shipped code, imported by nothing). Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo sits in an umbrella workspace alongside
  sibling repos (`TM Story`, `TM Admin`, `TM Herald`, `TM Design System`) at `D:\Terra Mortis\`. Do
  not read or touch anything outside `D:\Terra Mortis\TM Game` even to cross-reference.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazard**: this diff is CLIENT-side code with a Node-based test suite that mocks every
  browser-only dependency (`api.js`, `helpers.js`, `tracker.js`, `roll-v2.js`) rather than loading
  them for real - there is no jsdom in this project (adding one is a HALT condition, per this
  project's own established convention). `server/tests/crd-2-pending-queue.test.js` is a DB-backed
  suite for its OTHER describe blocks but the ones relevant to this diff do not need MongoDB; if a
  suite reports far fewer tests than its own file's test count, that is almost certainly an unrelated
  DB-skip, not a regression from this diff - disclose which is which.
- **Blast radius note**: `contested-resolve.js` is imported directly by
  `server/tests/crd-2-pending-queue.test.js` (a DIFFERENT story's own test file, for its own routing-
  contract assertions) - a change to this module's exports or side effects at import time can break
  that unrelated file's suite. Separately, `app.js`'s call site for `initContestedResolve` was
  changed to pass a third argument; confirm no other call site of this same function exists anywhere
  in the client that was missed.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `cd server && npx vitest run
  tests/crd-3b-resolution-screen.test.js` (expect 19), and `cd server && npx vitest run
  tests/crd-1-contested-roll-request-shape.test.js tests/crd-2-pending-queue.test.js
  tests/crd-3a-resolve-endpoint.test.js tests/crd-3b-resolution-screen.test.js
  tests/api-tracker-state.test.js tests/oaq-2-pending-status-actions.test.js
  tests/oaq-3-approval-queue.test.js tests/gdx-7-apply-costs-on-roll.test.js` (expect 229). Report the
  real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/crd-3b-diff.txt` and **nothing else**. No spec, no
story file, no project context. Do not explore the repository. Do not go looking for the spec. Read
other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A client-side screen where a defending player builds a dice pool for a contested roll: picking a
Mental/Social/Physical aspect, optionally spending Willpower, and toggling qualifying merits. Every
change calls a server endpoint (`PUT .../resolve`) and displays whatever pool number comes back - the
module never computes that number itself. A final action calls a different, pre-existing server
endpoint (`PUT .../accept`) and renders the dice result the server already rolled, using two small
imported rendering helpers rather than rolling anything itself. The whole screen re-renders its
`innerHTML` from a single module-level state object on every change, with one delegated click
listener bound once.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **Does the single delegated click listener survive repeated `innerHTML` overwrites?** The listener
   is attached once to the root element, and `_render()` overwrites `rootEl.innerHTML` on every state
   change. Confirm by reading the code that this pattern is actually safe (event delegation on a
   stable ancestor, not on the replaced children) rather than assuming it from the comment.
2. **The generation-counter race guard.** A module-level counter is incremented on each resolve call
   and compared after the await returns. Trace exactly what happens if THREE overlapping calls fire
   in quick succession, not just two - does the guard generalize correctly, or was it only proven
   against the two-call case?
3. **Cross-mount state bleed.** State is a single module-level object, reset at the top of the
   init function on every mount. If the init function is called a SECOND time (a new challenge)
   before an in-flight async callback from the FIRST mount (e.g. a `.then()` on a load call) has
   fired, could that stale callback write into the state object now describing the second challenge?
   There is a guard comparing an id captured in a closure against the current state - determine
   whether it actually closes this gap for every async callback in the file, or only some of them.
4. **XSS / escaping completeness.** Every dynamic value interpolated into the rendered HTML (names,
   labels, error messages, an enum-ish value that isn't schema-enforced client-side) needs to be
   escaped via the injected `esc()` before this data reaches the page. Find every interpolation and
   check whether esc() actually wraps it, not just whether esc() is imported.
5. **The "Back" button is unreachable while a async operation the code calls "accepting" is in
   flight** (a top-of-handler early return checks a flag and returns before any button-specific
   logic runs at all). Is this a deliberate "don't navigate away mid-roll" guard, or does an accept
   request that never resolves (no visible timeout anywhere in the diff) permanently trap the user
   with no way back? Flag as "worth checking" if the diff alone doesn't tell you which.
6. **A Willpower-available number is read once, asynchronously, right after mount, and never
   refreshed again for the lifetime of that screen.** If the real balance changes elsewhere while this
   screen stays open, could the displayed toggle state (enabled/disabled) go stale relative to reality?
7. **Self-contradiction within the diff.** Does any comment claim a behaviour the code beside it
   doesn't actually implement?
8. **Standard sweep**: dead code, unused imports/variables, unreachable branches, resource cleanup on
   the THROWN path (not just the happy path), assertions in the new test file whose PASS condition is
   trivially satisfiable.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/crd-3b-codex-findings.md` now,
before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1. Additionally: this module is the mount destination for a `goTab(t, ctx)`
navigation dispatch in `public/js/app.js`; a sibling module (`public/js/game/pending-queue.js`, NOT in
this diff) owns the list this screen is opened from and exposes a lookup function this diff's module
calls rather than re-fetching. Two OTHER server endpoints (`PUT .../resolve` and `PUT .../accept`, in
`server/routes/contested-rolls.js`, also NOT in this diff - both already reviewed and shipped in prior
stories) are what this screen actually calls.

### What to hunt for

1. **Read `public/js/game/pending-queue.js`'s `getPendingChallenge` and confirm the exact shape of
   what it returns** (which fields exist, whether `target_character_id` is a string or something
   else) against how this diff's module uses that return value. A shape mismatch here would be
   silent - nothing in this diff's own code would throw, it would just misbehave.
2. **Read `public/js/game/tracker.js`'s `ensureLoaded`/`trackerRead` in full** and confirm the
   sequencing this diff uses (await one, then call the other) is actually the ordering that avoids a
   documented real bug referenced elsewhere in this codebase's history (search this file's own
   comments and any nearby test files for the word "ensureLoaded" or "rollChar" for context) - or
   whether the diff's version of this sequencing has a subtle difference that reintroduces the same
   class of bug.
3. **Read `public/js/suite/roll-v2.js`'s exported dice-rendering functions this diff imports.**
   Confirm they are genuinely side-effect-free / independent of that file's own larger internal state,
   as the diff's own comments claim - trace what they actually touch.
4. **Malformed or partial character data.** If the defending character document is missing
   `attributes` entirely, or is missing one specific attribute, what does this diff's code compute and
   display? Does it match how the SERVER-SIDE version of this same computation (a different file,
   already shipped, not in this diff - find it) handles the identical gap?
5. **The narrow merit filter.** Confirm the set of merit keys this diff treats as relevant matches
   exactly what the SERVER's own equivalent lookup honours (again, a different already-shipped file,
   not in this diff) - a mismatch here would mean the UI shows a chip for something the server will
   silently ignore, or hides one the server would actually honour.
6. **Route/selector collision.** Does the new third parameter on the exported init function, or any
   new `data-cr-*` attribute this diff introduces, collide with anything else in the same HTML
   document this screen is ever mounted alongside?
7. **The two retired tests and the two new mocks in `crd-2-pending-queue.test.js`.** Read the whole
   file's remaining test suite and confirm removing those three tests and adding those two mocks did
   not silently weaken coverage of something that file's OTHER describe blocks still depend on.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/crd-3b-codex-findings.md` now,
before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/crd-3b-client-resolution-screen.md` - the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (touch `/accept`'s own logic, touch
     `roll-v2.js`'s pool-building state, fix the unrelated `.rv2-again-seg` contrast issue mentioned
     in its own Decisions section, add a new character-data GET, generalise the merit lookup).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate - do not flag these as gaps: fixing `.rv2-again-seg`'s own
light-theme contrast defect (a real, separately-logged finding from this story's own design-lock,
deliberately left for its own future story); a generic merit-bonus-value rule type (the narrow
2-merit lookup is intentional, matching the server's own documented scope); any change to
`/accept`'s or `/resolve`'s own server-side logic (both pre-existing, both reused as-is); a new
Playwright spec file (the story's own AC12 explicitly leaves this optional, and states a live
interactive/screenshot verification is an acceptable substitute).

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes these specific, checkable claims:
   - The new suite is 19/19 passing.
   - The six-... (actually eight-)file changed-area regression totals 229/229 on a clean run.
   - Several existing production CSS classes were substituted in place of the mockup's own standalone
     wrapper classes, and this was re-verified with a real screenshot against the actual shipped
     `suite.css` (not the mockup's own duplicate `<style>` block) in both light and dark themes.
   - An em-dash was found and removed from two rendered-output strings before shipping.
   - `ensureLoaded`/`trackerRead` are called in a specific order, citing a real prior bug elsewhere in
     this codebase as the reason.
   - Three tests in a sibling story's test file were "explicitly written to break" once this story
     landed, and were retired rather than patched around.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Grep
   the files yourself for the em-dash claim and the CSS-class claims.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/crd-3b-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including the two gate commands named above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
