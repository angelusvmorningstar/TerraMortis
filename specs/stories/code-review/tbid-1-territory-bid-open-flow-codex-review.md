# Adversarial review - TBID.1 (Territory Bids - open-flow board, resolved-collapse, wipe, CSS/token cleanup), Terra Mortis TM Game

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
   `specs/stories/code-review/tbid-1-territory-bid-open-flow-codex-findings.md`, before you open
   anything the next pass allows. Do not revise an earlier pass's findings in light of what a later
   pass taught you - if a later pass contradicts an earlier one, say so as a new finding and leave
   the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/tbid-1-territory-bid-open-flow-diff.txt` and is relative to that root,
  taken against base commit `34759457dc94f53d19ffa4f922f4b488e911e665` (current HEAD is `193aa254`,
  one commit ahead, on branch `ms/tbid-1-territory-bid-open-flow`).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo lives inside an umbrella workspace
  alongside sibling repos (`TM Story`, `TM Admin`, `TM Herald`, `TM Design System`) at
  `D:\Terra Mortis\`. Do not read or touch anything outside `D:\Terra Mortis\TM Game`.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards, disclose rather than skip:** Playwright and this session's own dev-server
  share port 8080 with `reuseExistingServer` - if a Playwright run is already active on this machine
  when you run `npx playwright test tests/tbid-1-territory-bid-open-flow.spec.js`, it will conflict;
  if Chromium isn't installed, run `npx playwright install chromium` first. If any command hangs
  (one of this repo's own suites, `tests/suite.spec.js`, is known to wedge with no output for
  ~30 minutes even outside this diff), do not wait it out silently - kill it, say so, and try a
  narrower `-g` filter instead.
- **Blast radius:** `public/js/suite/territory.js` is a standalone, client-only, localStorage-backed
  module (`tm_bids_v2`) with no server route and no other file's runtime behaviour depending on its
  exports beyond the tab-mount wiring that calls it. It makes zero network calls. A mistake here is
  contained to this one ST-facing tab, not silently breaking anything else - but do check whether
  the two functions this diff deletes (`terrResetAll`, `terrUnres`) are truly unreferenced anywhere
  else in the repo (`public/`, `tests/`), since a dangling `onclick="terrResetAll()"` left in markup
  outside this diff would silently no-op in production.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `cd server && npx vitest run tests/tbid-1-territory-bid-open-flow.test.js` and
  `npx playwright test tests/tbid-1-territory-bid-open-flow.spec.js`. Report the real numbers even if
  they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/tbid-1-territory-bid-open-flow-diff.txt` and
**nothing else**. No spec, no story file, no project context. Do not explore the repository. Do not
go looking for the spec. Read other files only to resolve an import path the diff itself leaves
ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A client-only "Territory Bids" ST tool (`public/js/suite/territory.js` + its `#t-territory` styles in
`public/css/suite.css`) is reworked from an always-five-territory board to one that starts empty and
adds territories one at a time through a two-step "pick territory, then confirm Regent" modal flow.
Resolved territories collapse to a compact row instead of clearing. `terrResetAll` is deleted and
replaced by a `confirm()`-gated `terrWipeBoard`. A `schemaVersion` field is added to the persisted
`localStorage` payload. Two new test files are added (one vitest, driving the module's real exported
functions against a hand-built `document`/`localStorage` stand-in; one Playwright, driving a real
browser).

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **`renderRegentStep(m)`'s fallback lookup.** `const def = TERRS.find(t => t.id === m.tid) ||
   state.territories.find(t => t.id === m.tid);` - `TERRS` is a static five-entry catalogue and every
   `tid` this function is ever called with originates from one of those five ids. Is the
   `|| state.territories.find(...)` half ever reachable, or is it dead code masking a design the
   author wasn't sure of?
2. **`terrConfirmRegent(tid, regentName)` branches on existence, not on the modal's own `mode`
   field.** It decides "is this a reopen" purely from `state.territories.some(t => t.id === tid)`,
   ignoring whatever `mode: 'open'` / `mode: 'reopen'` the modal object actually carries. Trace every
   caller that can reach this function with a `tid` and ask whether existence-based branching can
   ever diverge from mode-based branching - and if a future caller could set `modal = {type:
   'regent', tid, mode: 'open', ...}` for a `tid` already in `state.territories`, what actually
   happens (does it silently overwrite an in-progress territory as if reopening it, discarding its
   live bids, with zero user-facing signal that happened)?
3. **`esc()` used inside an HTML *attribute* context, not just text content.** `regentOpts(sel)`
   builds `<option value="${esc(sel)}" selected>...` from `sel`, which can be a free-text
   `defaultRegent` or a prior bid's `claimant` name. Find `esc()`'s actual implementation and
   determine exactly which characters it escapes. If it escapes `&`/`<`/`>` but not `"`, a name
   containing a double quote breaks out of the `value="..."` attribute in a real browser - check
   whether that is actually possible given how names reach this list (character names from
   `window._charNames`, i.e. player character names entered elsewhere in this app - is a `"` in a
   character name actually preventable upstream, or does this diff introduce a live attribute-breakout
   surface for ST-authored data?).
4. **Silent no-op returns with no user-facing feedback.** `terrPickTerritory` (already-open territory),
   `terrReopen` (territory not found), and `terrConfirmRegent`'s `if (!def) return;` (invalid `tid`)
   all fail silently - no error, no `#modal-err` text, nothing. Under the real UI these paths should
   be unreachable (disabled tiles, valid ids only) - is that actually guaranteed by every code path
   that can reach them, or is there a sequence (e.g. a stale modal object left in `modal` across a
   `render()`) where one of these fires visibly with nothing happening and no explanation to the ST?
5. **`terrWipeBoard`'s ordering.** It calls `clearTimeout(_saveTimer)`, then `state = dflt()`, then
   writes `localStorage` directly via `payload()`, then `render()` - bypassing `persist()` entirely
   (which itself calls `render()` before its own debounced write). Confirm there is no window where a
   previously-scheduled `persist()` timer could still fire after `terrWipeBoard` runs and clobber the
   fresh empty state back with stale data, or vice versa.
6. **The `load()` migration function's three-way branch on `schemaVersion` and `territories.length`.**
   Read it exactly as written (not as the diff's own comments summarise it) and check: what happens
   for a payload where `schemaVersion` is present but falsy in an unexpected way (e.g. `0`), or where
   `territories` is present but not an array, or where the whole `JSON.parse` throws on a corrupted
   value - does every path actually degrade to `dflt()` the way the comments claim, or does any
   combination silently return something half-migrated?
7. Standard sweep: assertions/checks whose PASS condition is trivially satisfiable; a check whose
   label claims more than it tests; error paths and resource cleanup on the thrown/cancelled path,
   not just the happy path; dead code and unreachable branches beyond #1 above; self-contradiction
   within the diff itself (does a comment claim one thing while the code a line later does another -
   e.g. re-check the `load()` comment against the actual conditional order).

Flag anything you cannot judge without the spec as "worth checking" rather than asserting it.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/tbid-1-territory-bid-open-flow-codex-findings.md` now, before reading
further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1 above - re-derive it from the real files now that you can read them, and
correct anything Pass 1 had to guess at.

### What to hunt for

1. **Trace the exact sequence: open picker -> pick a territory -> confirm Regent -> Open Bid -> the
   Regent's automatic defence bid -> Resolve -> Reopen -> confirm a different Regent.** At each step,
   hand-trace what `state.territories` actually contains and confirm it matches what the next step's
   code assumes it received. Pay particular attention to whether the *position* of a reopened
   territory in the array is genuinely preserved (`.map()` in place) versus whether any path could
   append a duplicate or reorder it.
2. **`terrResetAll` and `terrUnres` deletion - are they truly dead?** Grep the *entire* repo (not just
   `public/js/suite/`) for `terrResetAll` and `terrUnres`, including `public/*.html`,
   any other `public/js/**`, and the two new test files. A leftover `onclick="terrResetAll()"` in
   markup outside this diff would now throw or silently no-op in production - confirm which, if any
   exist.
3. **`window._charNames`** - where is this global actually populated in the real app (not the test
   harness), and what happens to `regentOpts()`/`nameOpts()` if it is unset (`undefined`) rather than
   an empty array, at the moment the Territory tab is first mounted relative to when character data
   loads elsewhere in the app? Is there a mount-order race?
4. **`components.css`'s `.form-select`/`.form-input`** - read their real declarations. Do they
   genuinely produce equivalent visual sizing/spacing to the inline `style="width:100%;background:...
   "` block this diff deletes, or does reusing the shared classes silently change the modal's layout
   (e.g. a different `font-family` - the deleted inline style hardcoded `var(--fh)` while the field
   labelled "Regent" now uses whatever `.form-select` declares)?
5. **CSS specificity / cascade** - `#t-territory .field .form-select,#t-territory .field
   .form-input{width:100%;}` is scoped under `#t-territory .field`. Confirm `.form-select`'s own rule
   in `components.css` doesn't already declare a conflicting `width` at equal-or-higher specificity
   that would silently win depending on source order.
6. **Malformed/absent input at the new entry points** - `terrConfirmRegent(tid, regentName)` is
   assigned to `window.terrConfirmRegent`, meaning it is reachable from the browser console or any
   other future caller, not just `terrModalSubmit`. What happens if it's called with a `tid` that
   matches nothing in either `TERRS` or `state.territories`? With `regentName` as `null`/`undefined`
   rather than a string?
7. **Fixture/mock shape vs what the real consumer reads, field for field** - compare the vitest
   harness's fake `document`/`localStorage` stand-in against what the real `esc()`,
   `document.getElementById`, and `localStorage` calls in `territory.js` actually need. Does the mock
   under-model anything `territory.js` relies on (e.g. does the real `esc()` implementation depend on
   a DOM API the fake `document.createElement` doesn't actually replicate faithfully - see Pass 1
   item 3)?

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/tbid-1-territory-bid-open-flow-codex-findings.md` now, before reading
further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/tbid-1-territory-bid-open-flow.md` - the **Story**, **Acceptance Criteria**,
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

Explicitly NOT in scope, and deliberate - do not flag these as gaps: any change to
`server/routes/territories.js` or the DB-backed regent/lieutenant/feeding-rights API (this story is
entirely about the standalone client-only `territory.js` tool and never touches that route); any
change to `state.phase`'s gating behaviour (the story confirmed it is a single global field with no
functional gating anywhere in the file today, and made a deliberate no-op call there); the pre-existing
em-dash idiom already in `regentOpts`'s neighbouring code (the author added a new `(none)` option
without an em-dash specifically to avoid introducing a new em-dashed string, while leaving other
pre-existing em-dashes in the file untouched as out of scope for this story).

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims - among them:
   - An exact pass count for the new vitest suite (`server/tests/tbid-1-territory-bid-open-flow.test.js`)
     and for the new Playwright spec (`tests/tbid-1-territory-bid-open-flow.spec.js`).
   - A changed-area vitest regression count, with a specific number of pre-existing (not
     newly-caused) failures, claimed proven via `git stash` A/B against the base commit.
   - That `terrResetAll` and `terrUnres` have no callers anywhere outside `territory.js` (grep-verified).
   - That every inline `style="..."` attribute was removed from `territory.js`.
   - That every `var(--token)` used inside the `#t-territory` CSS block in `suite.css` is actually
     defined somewhere in `theme.css` (the exact class of bug the `--text3` -> `--txt3` fix addresses).
   - That real Playwright screenshots were captured and inspected in both themes, including a
     computed-style assertion that the Reopen button's rendered colour/border literally equals the
     browser-resolved `--txt3` value.
   - That an empty Regent submission is refused with a `#modal-err` message rather than silently
     creating a regent-less card.
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

Write everything to `specs/stories/code-review/tbid-1-territory-bid-open-flow-codex-findings.md`,
grouped `## High` / `## Medium` / `## Low`, each finding tagged with the pass that produced it
(`[Pass 1]`, `[Pass 2]`, `[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading
rather than dropping it.

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
  `cd server && npx vitest run tests/tbid-1-territory-bid-open-flow.test.js` and
  `npx playwright test tests/tbid-1-territory-bid-open-flow.spec.js`.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
