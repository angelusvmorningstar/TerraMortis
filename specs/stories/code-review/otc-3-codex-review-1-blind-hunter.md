# Adversarial review — otc-3-office-tab-browsable-reference (Office tab browsable reference mode), TM Suite

## PASS 1 of 3 — BLIND HUNTER (the diff, and nothing else)

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

You get the diff at `specs/stories/code-review/otc-3-diff.txt` and **nothing else**. No spec, no
story file, no project context beyond what's below. Do not explore the repository beyond resolving
an import path the diff itself leaves ambiguous. Do not go looking for a spec file — one exists,
deliberately excluded from this diff. This is pass 1 of 3, each in its own file; work only this one.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/otc-3-diff.txt`, relative to that root, taken against base commit
  `284882ca` (the parent commit — a prior, already-reviewed story — is on the same branch
  immediately before this diff).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and
  `sprint-status.yaml` edits are excluded on purpose. Do not treat their absence as an omission.
- This repo sits inside an umbrella workspace (`D:\Terra Mortis`) with sibling repos `TM Wiki`,
  `TM Cockpit`, `TM Herald`. **Do not read or touch anything outside `D:\Terra Mortis\TM Suite`.**
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) is allowed and encouraged — you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Blast radius**: this diff opens a previously-conditional player tab (Office) to every player,
  and adds a mode boundary (own office vs. browsing another office) around an interactive panel
  that mutates another character's City Status. A mistake in that boundary is not cosmetic — it's
  the difference between "reference view" and "any player can trigger a real game-state change on
  an office they don't hold."

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing in a pass or at a severity, say that explicitly rather than omitting the
  section or padding with style opinions.
- Report the exact current gate numbers you observe:
  `cd server && npx vitest run tests/issue-1141-office-tab-render.test.js tests/feature.691.hos-city-status-power.test.js tests/otc-3-office-nav-unconditional.test.js`.
  Report the real numbers even if they disagree with anything a later pass's spec claims —
  especially then.

---

### What this diff claims to be

It opens a previously-conditional player tab (the "Office" tab, gated by `app.js`'s `hasOffice`
nav condition) to every player regardless of whether their character holds a court office, by
removing that condition from two nav-item registrations and a dead branch in the shared condition
function. The tab's own render function (`office-tab.js`'s `renderOfficeTab`) gains a category
picker (a `<select>`) letting the viewer browse any of five offices as reference, and a new
`isOwnOffice` boolean that must gate an existing interactive "Status Actions" panel (which lets a
Head of State raise/lower another character's City Status) so it only ever appears for the
category the viewer's own character actually holds — never for a category they're merely browsing.
A CSS rule adds a "reference view" banner. Test files are updated/added to match.

**That is the shape it claims. Do not trust the shape — verify it.**

### What to hunt for

1. **The core boundary, read literally.** `renderOfficeTab` now computes `isOwnOffice` and gates
   the Status Actions panel on it in two separate places in the function (an HTML-shell branch
   that emits the panel's markup, and a separate call that wires its interactivity). Check BOTH
   sites actually include the `isOwnOffice` condition, not just one — a half-applied gate would
   leave the panel's static HTML visible (even if non-functional) while browsing, or vice versa.
2. **`category` computation**: `category = viewCategory || char.court_category || 'Head of State'`.
   Trace what happens when `char.court_category` is falsy AND no `viewCategory` is passed (a
   player who holds no office opening the tab for the first time) — does `isOwnOffice` end up
   `true` or `false` for that default? If it ends up `true` by accident (e.g. because both sides of
   the comparison are coincidentally the same falsy/undefined value), a non-officeholder could see
   the interactive panel on first load before ever touching the picker.
3. **The picker's `<option>` values**: are they properly escaped/safe, or could a crafted
   `court_category` value (if ever attacker-influenced, e.g. from imported/legacy character data)
   break out of the `<option value="...">` attribute? Check the `esc()` usage around the picker
   markup specifically.
4. **Self-contradiction within the diff**: does anything claim the panel is gated one way in a
   comment but implement it another way in the actual condition?
5. **Dead code / unused imports/exports**: is the new `OFFICE_CATEGORIES` export actually used
   anywhere it's exported for, or only internally? Is anything left over from the old
   `char.court_category === 'Head of State'` single-condition gate that should have been fully
   replaced?
6. **The `_wireCategoryPicker` guard** (`typeof el.querySelector !== 'function'`) — is this purely
   a test-mock accommodation, or could it also silently swallow a REAL production failure (e.g. if
   `el` were ever something other than a real DOM node or a test's plain object)? Flag if the
   distinction matters.
7. **Assertions whose PASS condition is trivially satisfiable** in the new/modified test files —
   e.g. a check that would pass even with the boundary broken.
8. **Error paths and resource cleanup on thrown paths**, not just the happy path, throughout the
   modified code.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/otc-3-codex-findings.md` now,
before reading further or opening any other pass's file.**

## Output (append this pass's findings, do not overwrite a later pass's)

Write your findings to `specs/stories/code-review/otc-3-codex-findings.md`, under a `## Pass 1 —
Blind Hunter` heading, grouped `### High` / `### Medium` / `### Low`, each finding tagged
`[Pass 1]`. Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened, and confirmation you did not go looking for the spec.
- Every command you ran, with its real result, including the vitest command named above.
- Anything you could not run, and why.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
