# Adversarial review — otc-3-office-tab-browsable-reference (Office tab browsable reference mode), TM Suite

## PASS 2 of 3 — EDGE CASE HUNTER (the diff, plus the repository)

You have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec
or any account of the author's intent — work from the code itself. This is pass 2 of 3, each in its
own file; a separate Pass 1 file already ran blind against the diff alone — do not read it, work
independently.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/otc-3-diff.txt`, relative to that root, taken against base commit
  `284882ca`.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and
  `sprint-status.yaml` edits are excluded on purpose. You may read the real spec at
  `specs/stories/otc-3-office-tab-browsable-reference.md` if useful for intent — this pass is not
  required to stay blind to it — but your primary judgement should come from tracing the code.
- This repo sits inside an umbrella workspace (`D:\Terra Mortis`) with sibling repos `TM Wiki`,
  `TM Cockpit`, `TM Herald`. **Do not read or touch anything outside `D:\Terra Mortis\TM Suite`.**
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) is allowed and encouraged — you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Blast radius**: opening the Office tab to every player, plus the own-office-vs-browsing
  boundary around a City-Status-mutating panel, is a real access-control surface, not cosmetic.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing at a severity, say that explicitly rather than omitting the section.
- Report the exact current gate numbers:
  `cd server && npx vitest run tests/issue-1141-office-tab-render.test.js tests/feature.691.hos-city-status-power.test.js tests/otc-3-office-nav-unconditional.test.js`.

---

### Orientation (not ground truth — verify against the code)

`office-tab.js`'s `renderOfficeTab(el, char, chars, viewCategory)` now computes `category` (the
office being viewed) and `isOwnOffice` (whether the viewer actually holds that category), and gates
the interactive "Status Actions" panel — which lets a Head of State raise/lower another
character's City Status via `server/routes/office-actions.js` — on `isOwnOffice`, not just the
category match. `app.js` no longer conditions the Office tab's visibility on holding any office.

### What to hunt for

1. **Walk the FULL chain from tab-open to a real POST.** Starting at `app.js`'s office-tab render
   call site through to `_wireHosActions`'s `doAction()` in `office-tab.js`, which POSTs to
   `/api/office_actions`. Confirm there is no code path where a player browsing (not holding) an
   office can reach `doAction()` at all — not just that the panel's HTML doesn't render, but that
   the WIRING (`_wireHosActions`) is never even invoked for a non-owner. Trace the exact boolean
   expression gating the `_wireHosActions(el, char, chars)` call site.
2. **Stale `selectedChar`/`liveCycle` closures across a category switch.** The picker's `onchange`
   handler re-invokes `renderOfficeTab` with a new category, replacing `el.innerHTML` and
   re-running the whole function fresh. Confirm there's no way a PREVIOUS render's async callback
   (e.g. `_wireHosActions`'s `apiGet` calls, which resolve after some delay) could still fire and
   mutate stale DOM/state after the viewer has already switched category via the picker — a
   classic stale-closure race. Trace whether anything in `_wireHosActions` checks that its own
   `el`/`budgetLine`/etc. references are still the CURRENT render's elements before acting on them.
3. **The default-category branch for a non-officeholder.** When `char.court_category` is falsy and
   no `viewCategory` was passed, `category` defaults to `'Head of State'`. Confirm `isOwnOffice`
   correctly evaluates to `false` in this exact case (not `true` via some coincidental match), by
   tracing the literal comparison `category === char.court_category` with `char.court_category`
   actually `undefined`/`null`/`''` and `category` the string `'Head of State'`.
4. **`OFFICE_CATEGORIES` vs `OFFICE_DATA`'s real keys.** Grep `OFFICE_DATA` in `office-data.js` and
   confirm the four real keys plus `'Administrator'` exactly match what `OFFICE_CATEGORIES` lists,
   in existence and spelling — a typo'd category name in the picker would silently show "pending"
   or crash for a real office.
5. **`app.js`'s TWO nav registrations** (`NAV_ITEMS` and `MORE_APPS`) — confirm BOTH were actually
   edited, not just one, by finding every string occurrence of `'hasOffice'` in the current
   (post-diff) `app.js` and confirming zero remain, AND that removing the condition didn't
   accidentally also remove or alter an unrelated sibling property on the same object literal line
   (a common one-line-edit slip).
6. **`_moreGridCondition`'s ST short-circuit** — confirm STs still see the tab (unaffected, since
   they already bypassed every condition), and separately confirm a PLAYER with no office now also
   sees it, by tracing the function for a player role with no matching condition branch left at all
   (does it correctly fall through to `return true`, or is there now an unreachable/dead branch
   that changes nothing but should be flagged for cleanup?).
7. **CSS**: does `.office-reference-banner`/`.office-category-picker` collide with any existing
   rule scoped to `.office-tab`'s children, or with the `.office-status-power` styling that
   already lives in the same file?
8. **Malformed/absent input**: what happens if `viewCategory` is passed as a string that matches
   NEITHER a real `OFFICE_DATA` key NOR `'Administrator'` (e.g. a stale/tampered `<select>` value)?
   Trace through to `OFFICE_DATA[category]` being `undefined` and confirm the existing
   pending-fallback branch handles this gracefully rather than crashing.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/otc-3-codex-findings.md` now,
before reading further or opening any other pass's file.**

## Output (append this pass's findings, do not overwrite Pass 1's)

Append to `specs/stories/code-review/otc-3-codex-findings.md`, under a `## Pass 2 — Edge Case
Hunter` heading, grouped `### High` / `### Medium` / `### Low`, each finding tagged `[Pass 2]`.
Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened.
- Every command you ran, with its real result, including the vitest command named above.
- Anything you could not run, and why.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
