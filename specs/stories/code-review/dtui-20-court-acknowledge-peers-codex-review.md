# Adversarial review - dtui-20-court-acknowledge-peers (Court — Acknowledge Peers chip grid greys out non-attendees), Terra Mortis TM Game

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
   `specs/stories/code-review/dtui-20-court-acknowledge-peers-codex-findings.md`, before you open
   anything the next pass allows. Do not revise an earlier pass's findings in light of what a later
   pass taught you - if a later pass contradicts an earlier one, say so as a new finding and leave
   the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/dtui-20-court-acknowledge-peers-diff.txt` and is relative to that root,
  taken against base commit `b95f368a`.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo is one of several sibling repos in a Terra
  Mortis umbrella workspace (`TM Story`, `TM Herald`, `TM Admin`, `TM Design System` live as sibling
  directories one level up from this repo root) - do not read or touch any of them, this review is
  scoped to `TM Game` only.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Port 8080 is a shared, known hazard in this environment.** A sibling project's (TM Admin) own dev
  server has been observed squatting/respawning on port 8080 during this same session, which causes
  Playwright's `webServer` reuse setting to load the WRONG app (TM Admin's shell, not TM Game's) and
  fail at "`#app` never visible" - a false failure that looks like a code regression but isn't. Before
  trusting any Playwright failure, run `curl -s http://localhost:8080/ | grep -i "<title>"` and confirm
  it says `TM Admin` (wrong app - the hazard is live) vs TM Game's own title. If you hit this, say so
  plainly rather than reporting a false regression; do not spend excessive effort fighting a respawning
  process you do not control - one clean isolated run of the new spec (`npx playwright test
  tests/dtui-20-court-acknowledge-peers.spec.js`) is the target, not a multi-file combined run.
- **Blast radius**: `_makeCharPickerOnChange()` and the delegated click-handler function this diff
  edits are shared infrastructure. Five OTHER sites (`target-flex-multi`, `target-flex-single`,
  `project-target-char`, `mentor-target`, `staff-target`) mount through the same generic
  `[data-cp-mount]` system and the same `_makeCharPickerOnChange()` helper this diff trims a branch
  from. A mistake in the shared function silently breaks those too, not just the `shoutout` site this
  diff names - check the other five sites still work after the `site === 'shoutout'` branch removal.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `cd server && npx vitest run tests/dt-form-territory-fresh-fetch.test.js
  tests/bl3a-one-inclan-implementation.test.js tests/cm-3-derived-maintenance.test.js` (vitest suites
  that already touch `downtime-form.js`) and `npx playwright test
  tests/dtui-20-court-acknowledge-peers.spec.js` (the new spec, from the repo root, after checking the
  port-8080 hazard above). Report the real numbers even if they disagree with anything the story
  claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/dtui-20-court-acknowledge-peers-diff.txt` and
**nothing else**. No spec, no story file, no project context. Do not explore the repository. Do not
go looking for the spec. Read other files only to resolve an import path the diff itself leaves
ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

Replaces a form question's "acknowledge up to 3 peers" picker - previously a searchable combobox
whose dropdown source silently excluded non-eligible people entirely - with a chip grid showing
every eligible-or-not person, where ineligible ones are visibly disabled (not hidden) with a tooltip
explaining why. Adds a new delegated click handler implementing the grid's own multi-select-with-a-
3-pick-cap toggle logic from scratch (no existing handler in this file did multi-select), and deletes
two functions (`_remountShoutoutPicker()`, part of `_makeCharPickerOnChange()`) that only existed to
support the old combobox's own cap-enforcement mechanism. Adds a new Playwright spec.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. The click handler's `!shoutoutChip.disabled` guard - a real `<button disabled>` never fires a
   native `click` event in the first place, so is this guard reachable at all, or vestigial? If
   vestigial, is that a problem (dead defensive code) or genuinely load-bearing for some path (e.g. a
   programmatic `.click()` call, or the element losing its `disabled` attribute mid-session without a
   re-render)?
2. The 3-pick-cap check: `if (!alreadySelected && selectedCount >= 3) return;`. Hand-verify this does
   NOT block **deselecting** an already-selected chip when exactly 3 are currently selected (i.e.
   clicking a chip that is itself one of the 3 selected, while the count is at 3, must still toggle it
   off). Trace the boolean logic precisely rather than trusting the inline comment.
3. `const grid = shoutoutChip.closest('[data-shoutout-grid]');` followed by `grid?.dataset...` and
   `grid.querySelectorAll(...)` later **without** the same optional-chaining safety - if `grid` can
   ever be null (chip somehow rendered outside its own grid container), does the code throw partway
   through instead of failing gracefully?
4. The hidden input's initial render value: `esc(JSON.stringify([...selectedIds]))`. Verify `esc()`
   (imported from `../data/helpers.js`) does not mangle the JSON string in a way that makes the
   initial DOM value diverge from what `JSON.parse()` on the client would expect back out - check
   what `esc()` actually escapes and whether a JSON array of plain id strings could ever contain a
   character that trips it.
5. `_makeCharPickerOnChange(site, hiddenId, cardinality)` keeps its `site` parameter in the signature
   after the diff deletes the only branch that read it. Check every real call site of this function -
   does any of them now pass an argument that's silently unused, and is that itself evidence a caller
   was expecting different behaviour that quietly stopped happening?
6. The disabled-chip markup is built as a single interpolated string:
   `isAttendee ? '' : ' disabled aria-disabled="true" title="Wasn\'t at last game session"'`. Verify
   the escaped apostrophe renders as valid HTML (a literal `'` inside a double-quoted attribute,
   correctly un-escaped by the JS string literal) rather than producing broken/truncated markup.
7. Self-contradiction check: is there more than one code path that decides whether a chip is enabled
   (e.g. one check at render time, a second implicit assumption baked into the click handler)? If the
   attendee-list ever comes back empty, does EVERY code path that gates "is this chip clickable"
   agree, or could render-time and click-time disagree?
8. Confirm the diff's own claim that `_remountShoutoutPicker` and the `site === 'shoutout'` branch are
   fully deleted, not just unreferenced from one call site - grep the whole diff (and, if you have
   repo access already from resolving an import, the one file it touches) for any remaining reference.
9. Any assertion or check in the new Playwright spec whose PASS condition is weaker than its own test
   name claims (e.g. a locator that would also pass on zero matched elements, a `toBeVisible()` that
   doesn't actually confirm content, an assertion order that couldn't catch the bug it's named for).

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/dtui-20-court-acknowledge-peers-codex-findings.md` now, before reading
further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1 - re-read it there. Now verify it against the real file
(`public/js/tabs/downtime-form.js`) rather than trusting the diff's framing.

### What to hunt for

1. **Hand-trace the exact click sequence** a real player would perform: tap Alice (attendee) -> tap
   Bob (attendee) -> tap Dana (attendee) -> tap Eve (attendee, 4th). Walk the delegated handler call
   by call for each tap, including what `grid.querySelectorAll('.dt-chip--selected').length` actually
   returns at the moment of the 4th tap (before or after any DOM mutation from the 3rd tap has
   settled) - confirm by tracing, not by re-stating the code's own comment, that Eve's tap is truly a
   no-op and the first three stay selected.
2. **Full form re-render interaction**: find every call site of `renderForm(container)` elsewhere in
   this file. If one fires while the shoutout grid has a live selection (e.g. from an unrelated field
   changing on the same section), does `renderQuestion()` re-derive the grid from the CURRENT hidden
   input `value`, or could a re-render silently reset/lose an in-progress selection because `value` is
   threaded through a stale closure or a different code path than the initial mount?
3. **Delegated-listener ORDER**: this diff's new `[data-shoutout-chip]` check runs before the existing
   `[data-sphere-char-target]` check in the same click-handler function. Could any real element in this
   file's rendered output ever carry both `data-shoutout-chip` and `data-sphere-char-target`
   (or otherwise be matched by `e.target.closest()` for both selectors on the same click), causing a
   double-handle or the wrong branch winning?
4. **ID type coercion symmetry**: `attendeeIds = new Set(lastGameAttendees.map(a => String(a.id)))`
   compared against `allCharacters`' own `String(c.id)`. Read where `lastGameAttendees` and
   `allCharacters` are actually populated (search the file) - do their `id` fields come from the same
   real source shape (both raw Mongo ObjectIds, both already-stringified, or a MISMATCH where one side
   is an object and needs `.toString()` rather than `String()` coercion, which for a Mongo ObjectId
   instance can both "work" via its own `toString` AND silently produce `"[object Object]"` for some
   other unexpected shape)? Is there a real, reachable case where `String()` on one side doesn't match
   `String()` on the other for the SAME underlying character?
5. **Empty roster**: trace what renders if `allCharacters` is empty (e.g. the character-names fetch
   failed). Does the `.dt-chip-grid` render with zero `.dt-chip` children gracefully, and does the "Up
   to 3 picks" hint text below it read sensibly with nothing above it, or does anything downstream
   (the click handler, the hidden-input sync) assume at least one chip exists?
6. **New Playwright spec's own mock fidelity**: compare the `/api/attendance` mock shape in
   `tests/dtui-20-court-acknowledge-peers.spec.js`'s `setupSuite()` against the REAL fetch call in
   `downtime-form.js` (search for where `/api/attendance` is actually called and what fields of the
   response it reads). Confirm the mock's `attended`/`attendees`/`session_id` fields match the real
   consumer field-for-field - not just enough to make the test pass, but genuinely representative of
   what the real API returns (check `server/routes/attendance.js` or equivalent if it exists).
7. Confirm the other five `[data-cp-mount]` sites (`target-flex-multi`, `target-flex-single`,
   `project-target-char`, `mentor-target`, `staff-target`) still resolve through
   `_makeCharPickerOnChange()` correctly with the `shoutout` branch gone - read at least one of their
   own call sites and confirm the remaining `cardinality === 'multi'` / single-select branches still
   cover them exactly as before.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/dtui-20-court-acknowledge-peers-codex-findings.md` now, before reading
further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/dtui-20-court-acknowledge-peers.story.md` - the **user story statement**,
   **Context**, **Acceptance Criteria (AC1-AC7)**, and **Implementation Notes** sections ONLY.
2. **Do NOT read the "Dev Agent Record" section yet.** Skip past it entirely. Reading the author's own
   record first anchors you on their framing and turns a review into grading homework.
3. Against AC1-AC7, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an
     AC's exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "Out of scope" section is equally load-bearing** - check the
     change did not quietly do one of the excluded things.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate - do not flag these as gaps:
- Removing `scope: 'attendees'` support from `character-picker.js` itself (confirmed its only real
  consumer, but the component is shared/general-purpose; deleting scope support is a separate,
  later decision).
- Changing the 3-pick cap itself, or the "Up to 3 picks. A 4th will be ignored." hint copy.
- dtui-21 (Personal Story NPC chips), dtui-22 (Mandragora), dtui-23 (Feeding restructure) - the
  epic's own other Wave 4 stories. Do not flag missing work on any of them.
- Changing what counts as "attended" - the attendance computation itself
  (`GET /api/attendance`, the empty-list-means-everyone fallback) is untouched by design.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims:
   - "All 6 tests passed clean on an isolated run" (the new Playwright spec)
   - "Full vitest regression 4226 passed/13 failed, all 13 pre-existing and unrelated" - you will not
     be able to reproduce the full 4226-test run in this session; instead run the three named vitest
     files above and confirm they are clean, and treat the broader claim as UNVERIFIABLE-AS-STATED
     rather than either confirmed or refuted, saying so plainly.
   - "AC7 verified by direct grep - zero matches for `_remountShoutoutPicker` or
     `site === 'shoutout'`" anywhere in `downtime-form.js`
   - "No new API call added - reuses `allCharacters`/`lastGameAttendees` already computed for this
     render"
   - "`character-picker.js` itself untouched" by this diff
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Run the
   new spec yourself (checking the port-8080 hazard first). Grep the files yourself.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to
`specs/stories/code-review/dtui-20-court-acknowledge-peers-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including the vitest and Playwright gate commands
  above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
