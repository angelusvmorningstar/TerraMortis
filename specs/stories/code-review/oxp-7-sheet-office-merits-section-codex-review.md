# Adversarial review - oxp-7-sheet-office-merits-section (Sheet Office Merits section, read-only), TM Suite

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
   `specs/stories/code-review/oxp-7-sheet-office-merits-section-codex-findings.md`, before you open
   anything the next pass allows. Do not revise an earlier pass's findings in light of what a later
   pass taught you - if a later pass contradicts an earlier one, say so as a new finding and leave
   the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/oxp-7-sheet-office-merits-section-diff.txt` and is relative to that
  root, taken against base commit `a358d180` (the oxp-6 merge, immediately before this story's work
  began - `git diff a358d180 -- <paths>` reproduces the tracked half of it yourself if you want to
  check).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits (the
  story markdown file, `specs/stories/sprint-status.yaml`) are excluded from it on purpose, so the
  earlier passes stay genuinely blind to the author's own account. Do not treat their absence as an
  omission or go hunting for them.
- **This is an umbrella workspace.** `D:\Terra Mortis` also contains sibling repos - `TM Cockpit`,
  `TM Wiki`, `TM Herald` - each an independent git repo with its own remote and deploy pipeline. Stay
  entirely inside `D:\Terra Mortis\TM Suite` for this review; do not read, run, or modify anything in
  a sibling repo even to cross-check.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- This project has **no jsdom** - all client-side tests use a hand-rolled browser-shim + fake-DOM
  technique (stub `globalThis.location`/`window`/`localStorage`/`fetch`/`CSS`, dynamic `import()` the
  real module). This is normal for this codebase, not a smell.
- Tests run via `cd server && npx vitest run tests/<name>.test.js`. Some suites need a local `mongod`
  and SKIP rather than fail without one (read the summary line, not just the exit code) - this
  particular diff's own test file needs no database at all, so that caveat should not apply to it,
  but confirm rather than assume.
- **Blast radius note**: `resolveHeldSeat` (in the new `public/js/data/office-seat-resolve.js`) is
  now called from TWO sites - this story's own new sheet section, and `office-tab.js`'s existing
  `_wirePurchaseState` (a live, previously-shipped admin/reference view). A mistake in this function
  silently breaks BOTH consumers, not just the new one - `office-tab.js`'s own existing test suite
  (`server/tests/issue-1141-office-tab-render.test.js`) is the regression gate for the half of the
  blast radius this diff does not itself add tests for.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `cd server && npx vitest run
  tests/oxp-7-sheet-office-merits-section.test.js tests/issue-1141-office-tab-render.test.js`. Report
  the real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/oxp-7-sheet-office-merits-section-diff.txt` and
**nothing else**. No spec, no story file, no project context. Do not explore the repository. Do not
go looking for the spec. Read other files only to resolve an import path the diff itself leaves
ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A new read-only "Office Merits" section on a character sheet (`public/js/editor/sheet.js` +
`public/js/suite/sheet.js`), showing a character's permanent office-merit dots if and only if they
are the CONFIRMED current holder of a court office seat. It adds a new shared, exported
`resolveHeldSeat(char, seats)` function (`public/js/data/office-seat-resolve.js`) that returns the
confirmed seat or `null` - never a fallback guess - and rewires an existing consumer
(`public/js/tabs/office-tab.js`) to call this same function instead of its own previously-inline
holder-match logic. The new sheet section fetches two endpoints, resolves the seat, and if (and only
if) resolution succeeds, writes merit-dot rows into a DOM slot reserved earlier in a separate
synchronous render pass.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **`patchOfficeMerits`'s bare `catch { return; }`** (`sheet.js`, around the `Promise.all` fetch) -
   swallows EVERY failure mode identically: a genuine network failure, a malformed JSON response, a
   401/403, a thrown error from `apiGet` itself. Is silently rendering nothing really the right
   response to ALL of those, or does this quietly hide a bug class (e.g. an auth failure that should
   surface differently) behind an intentionally-quiet UI contract? Flag what you can judge from the
   diff alone; flag the rest as "worth checking against the spec" for Pass 3.
2. **The `MERIT_DOT_CAPS[merit] || 5` fallback** (`sheet.js`, inside the `.map` building `rowsHtml`) -
   if `merit` is a name not present in `MERIT_DOT_CAPS` at all, the cap silently defaults to `5`
   rather than erroring or omitting the row. Is `5` a real, deliberate universal default, or a magic
   number that will silently under- or over-cap an office merit nobody has audited?
3. **`resolveHeldSeat`'s new signature vs. its call site in `office-tab.js`** - the diff shows the old
   inline code filtered `forCategory` first, then matched `holder_id`; the new call passes the FULL
   `seats` array, relying on `resolveHeldSeat`'s own internal `char.court_category` filter to be
   equivalent. Trace this by hand: is `char.court_category` at that call site ALWAYS identical to the
   `category` parameter `_wirePurchaseState` filtered `forCategory` on, for every code path that
   reaches this line with `isOwnOffice` true? If there is any path where they can diverge, this is a
   silent behaviour change dressed as a pure refactor.
4. **`String(c._id)` used inconsistently as a DOM-selector value AND as an object literal string key**
   - `shRenderOfficeMerits` writes `data-office-merits-char="<esc'd id>"`; `patchOfficeMerits` later
   builds a *raw* (non-escaped) CSS attribute-selector string via `CSS.escape(String(c._id))` to find
   it again. Confirm both sides really do agree on the same character for every legal `_id` shape this
   codebase uses (are Mongo ObjectIds ever passed as objects rather than pre-stringified anywhere
   upstream of this call?).
5. **Unused/dead branches** - is `data.merits` ever an object instead of an array in any other
   consumer of `OFFICE_DATA` in this diff's own `office-tab.js` hunk, making the `if (!meritNames.length)
   return;` guard behave differently than intended for some office category?
6. **Self-contradiction within the diff** - the new `office-seat-resolve.js` doc comment says it
   "mirrors the server-side `server/lib/office-seat-resolve.js`'s naming... but is NOT the same code".
   Is that claim actually true of the two functions' *behaviour*, or does the comment overstate a
   distinction that doesn't hold up (e.g. do both actually 400/null on the same input shapes)? You
   have the diff only in this pass, so flag this as "worth checking in Pass 2" if you can't resolve it
   from the diff text alone.
7. **Async error paths past the try/catch** - `patchOfficeMerits` has exactly one `try/catch`, around
   the `Promise.all`. Everything after it (`resolveHeldSeat`, the `.map`/`shRenderMeritRow` call,
   `document.querySelectorAll`, `CSS.escape`) runs OUTSIDE that catch. Since this function is called
   **un-awaited** from `suite/sheet.js` (`patchOfficeMerits(c);` with no `await`, no `.catch()`), any
   throw in that unprotected second half becomes an unhandled promise rejection. Is there a plausible
   input that reaches that code and throws (a merit name containing characters `CSS.escape` can't
   handle, a `seat._id` that isn't string-coercible cleanly, `shRenderMeritRow` given unexpected args)?
8. **Resource/state cleanup on the thrown path** - if `Promise.all` partially resolves then the other
   rejects, is there any dangling state (the module-scoped `_officeMeritsGen` counter, in particular)
   left inconsistent for the NEXT call?

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/oxp-7-sheet-office-merits-section-codex-findings.md` now, before reading
further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite` (but stay out of the sibling repos named
above). Read whatever surrounding code you need to understand what this change is actually plugging
into. You still do **not** have the story spec or any account of the author's intent - work from the
code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1. Now verify it against the real surrounding code rather than trusting the
diff's own comments.

### What to hunt for

1. **Read `public/js/tabs/office-tab.js`'s full `_wirePurchaseState` function.** Walk the EXACT
   sequence: `isOwnOffice` is computed - trace where, and confirm by hand whether it can ever be
   `true` while `char.court_category !== category`. This is the load-bearing equivalence claim from
   Pass 1 item 3 - resolve it here with the real code, not by re-reading the comment.
2. **Read `public/js/data/office-seat-resolve.js` and `server/lib/office-seat-resolve.js` side by
   side.** Confirm or refute the new file's own doc-comment claim that they are meaningfully
   different, not just similarly named. What happens on each when given an "Administrator" seat
   category? A `null` `seats`/no-seats-array input? A seat whose `office_category` doesn't match any
   known office?
3. **Read `public/js/data/api.js`'s `apiGet`.** What does it actually throw, and under what response
   shapes (non-2xx, malformed JSON, network failure, a 401)? Does `patchOfficeMerits`'s single
   `catch{}` genuinely cover every one of those, or is there a response shape `apiGet` does NOT throw
   on that would let `seats`/`dotsBySeat` end up `undefined`/malformed and crash later un-caught (see
   Pass 1 item 7)?
4. **Read `public/js/editor/sheet.js`'s `shRenderMeritRow` (used here) in full**, and compare its
   parameter contract against how `patchOfficeMerits` calls it:
   `shRenderMeritRow(merit, 'office', i, '<span class="trait-dots">' + shDots(n) + '</span>')`. Does
   `shRenderMeritRow` expect its first argument to be a bare string (the merit name), and does it do
   anything internally (lookups, escaping) that assumes that string came from `c.merits[].name` rather
   than a static `OFFICE_DATA` merit-name list? Any place this mismatch could produce wrong output
   rather than an outright crash is worth flagging even if nothing throws.
5. **Read `public/js/tabs/office-data.js`'s `OFFICE_DATA`/`MERIT_DOT_CAPS` in full.** For every office
   category present, is every merit name in that office's `merits` list also present as a key in
   `MERIT_DOT_CAPS`? If any aren't, Pass 1's `|| 5` fallback is live code, not defensive dead code -
   confirm which office/merit combination(s) actually hit it, if any.
6. **`suite/sheet.js`'s `renderSheet()` in full**, specifically the desktop-vs-mobile-split rendering
   the diff's own comments reference. Confirm by hand: can `shRenderOfficeMerits(c)`'s output really
   land in MORE than one DOM container for a single `renderSheet()` call (the multi-slot
   `querySelectorAll` in `patchOfficeMerits` implies yes), or does this codebase only ever populate one
   of desktop/mobile per call (making the multi-slot code defensive-but-dead)? Either finding is
   useful - state which one the real code does.
7. **The render-generation guard itself.** `_officeMeritsGen` is a single MODULE-scoped counter shared
   by every character's sheet render, unlike `office-tab.js`'s own PER-ELEMENT `el._officeManoeuvreGen`
   pattern this diff's comments say it "mirrors". Walk a concrete interleaving: character A's sheet
   renders, `patchOfficeMerits(A)` starts and is mid-fetch; the viewer navigates to character B's
   sheet in a DIFFERENT part of the app (a different route/tab) while A's fetch is still in flight,
   B's own `patchOfficeMerits(B)` completes and returns; does A's stale write get correctly suppressed
   in every UI flow this app has for switching "which sheet is showing", or only in the specific
   single-page-re-render scenario the diff's own test simulates? If this app has more than one way to
   change which character's sheet is visible (e.g. a full page navigation vs. an in-place swap), does
   the module-scoped counter behave correctly under both?
8. **`resolveHeldSeat`'s `String(s.holder_id) === String(char._id)` comparison** - read how `_id` and
   `holder_id` actually arrive at this function in both call sites (server response shapes: are they
   ever raw ObjectId-like objects vs. already-stringified before reaching client code?). Confirm the
   `String()` coercion is genuinely safe for every real shape these two fields take, not just the
   already-stringified test fixtures.
9. **Fixture/mock shape vs. real response shape** - compare the new test file's `jsonRes(OFFICE_SEATS)`
   / `jsonRes({[SEAT_P1._id]: {...}})` shapes against `server/routes/office-seats.js` and
   `server/routes/office-merit-dots.js`'s ACTUAL response bodies. Field-for-field: does the real API
   response for `GET /api/office_seats` and `GET /api/office_merit_dots` genuinely match what these
   tests assume, or could the tests be passing against a shape the real server doesn't produce?

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/oxp-7-sheet-office-merits-section-codex-findings.md` now, before reading
further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/oxp-7-sheet-office-merits-section.md` - the **Story**, **Acceptance Criteria**,
   **What this story is NOT**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the "Dev Agent Record" section yet.** Skip past it entirely. Reading the author's own
   record first anchors you on their framing and turns a review into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an
     AC's exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (in particular: does anything in this diff
     add editability, a balance/affordability display, manoeuvre content, or Administrator content -
     all four explicitly excluded?).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Already ruled on, by name - do not flag these as gaps, they are deliberate:**
- No `editMode` parameter on `shRenderOfficeMerits` - this section is never editable by design (AC1).
- No balance/affordability display, no per-dot "why can't I afford this" reasons, no
  `officeSeatXp`/`office-xp.js` involvement at all - `oxp.6` already shipped that on the Office tab;
  this section shows purchased dots only (AC5, "What this story is NOT").
- No manoeuvre content, no `office_manoeuvre_rank` fetch of any kind (AC scope, "What this story is
  NOT").
- Nothing renders for the `Administrator` office category - `OFFICE_DATA['Administrator']` does not
  exist yet (a FUTURE story, oxp.8, owns that content) - this is a deliberate `return ''`, not a bug.
- `resolveHeldSeat` deliberately returns `null` rather than falling back to a deterministic guess
  (unlike `office-tab.js`'s own `_fallbackSeat`) - this is the central design decision of AC2/AC3, not
  an oversight to "fix" by adding a fallback.
- The section is holder-only AND confirmed-only - a non-holder and an unconfirmed-match holder both
  see nothing, with no disclaimer text of any kind (AC3).

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** section in full. It makes specific, checkable claims, in
   particular:
   - "18 new tests... all passing for genuine reasons after the `localStorage`-shim fix" - verify this
     by actually running the suite yourself, not by reading the claim.
   - "Full targeted gate run: this file + `issue-1141-office-tab-render.test.js` (57 tests) - 75/75
     passing" - reproduce this exact number yourself, right now.
   - Three specific prove-discrimination claims (AC2's shared extraction failing exactly 6 tests in
     `issue-1141-office-tab-render.test.js`; AC7's render-generation guard test failing when
     neutralised; AC3's confirmed-only gate test failing via a `TypeError` on a null seat's `_id` when
     neutralised) - pick at least one and reproduce it yourself: make the same single-line change,
     confirm the exact test named fails the way claimed, then restore it and confirm green again.
   - The claim that the three OTHER test-file failures found during the broader 18-file sweep
     (`n7-n9-allocator-readers.test.js` #1115, `issue-836-legacy-tracker-cache-removed.test.js`,
     `n8-mandragora-prereq.test.js`) are pre-existing and unrelated to this diff, "confirmed present on
     the unmodified tree via `git stash`" - you do not need to re-run the stash experiment, but DO
     confirm independently that none of those three failing files import, reference, or otherwise
     depend on anything this diff touches (`office-seat-resolve.js`, the modified functions in
     `sheet.js`/`suite/sheet.js`/`office-tab.js`).
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Run the
   drivers yourself. Grep the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to
`specs/stories/code-review/oxp-7-sheet-office-merits-section-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including
  `cd server && npx vitest run tests/oxp-7-sheet-office-merits-section.test.js
  tests/issue-1141-office-tab-render.test.js`.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
