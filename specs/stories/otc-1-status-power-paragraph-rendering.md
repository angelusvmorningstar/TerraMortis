# Story otc.1: Status Power text — paragraph rendering

Status: done

## Story

As a player reading my Court Position's Status Power on the Office tab,
I want the text broken into readable paragraphs instead of one dense block,
so that I can actually find the specific rule I'm looking for at a glance.

## Why this story exists

Found during the 2026-08-12 party-mode scoping session reviewing the Office tab, part of Epic OTC
(`specs/epic-otc-office-tab-correctness.md`). The Status Power block renders as a single
undifferentiated wall of text (screenshot review, live scoping session).

**Resolved during this story's own research, not left as an open question**: this is NOT a
renderer-ignoring-existing-breaks bug. `public/js/tabs/office-data.js`'s four `statusPower` fields
are genuinely flat strings with zero paragraph structure in the source data — confirmed by reading
all four verbatim. Dana's/Sally's earlier question ("does the renderer ignore `\n\n`, or is the
field flat?") is answered: the field is flat. This is a content-authoring decision (where the
breaks go) as much as a render change, so this story makes that decision explicitly rather than
leaving it for the dev agent to guess.

## What this story is NOT

- NOT a change to any Status Power's actual wording — every sentence is preserved verbatim, only
  regrouped into paragraphs.
- NOT a change to the manoeuvre or merit sections — only the Status Power block.
- NOT a new authoring UI for Status Power text (there is no admin editor for `OFFICE_DATA` at all
  today; it's a static JS module, out of scope here per the project's own convention that any
  eventual migration off static JS belongs to Epic OXP, not this story).

## Acceptance Criteria

1. Each of the four `OFFICE_DATA` categories' `statusPower` renders as multiple `<p>` elements
   inside `.office-status-power`, not one undifferentiated text node.
2. The exact wording of every sentence is unchanged — this is a structural change only, byte-level
   content is preserved (verify by joining the paragraphs back together and comparing against the
   original flat string, sentence-for-sentence).
3. Paragraph boundaries follow the exact sentence groupings specified in Task 1 below for all four
   categories — not an arbitrary or per-implementation choice. (Correction, found at code review:
   this AC originally said "Dev Notes below," but the groupings were always written into the Task 1
   checklist, not Dev Notes — the content was right, the cross-reference was wrong.)
4. Visual spacing between paragraphs uses an explicit CSS rule (a design-system token-based value,
   not relying on unstyled browser-default `<p>` margins) — per `specs/project-context.md`'s
   normalised-CSS convention.
5. `server/tests/issue-1141-office-data-sync.test.js`'s AC8 test (`statusPower` byte-identical to
   what shipped in #691) is updated to match the new array shape and still proves the content is
   unchanged — not weakened or deleted.

## Tasks / Subtasks

- [x] Task 1 — Convert `statusPower` from a flat string to an array of paragraph strings (AC: 2, 3)
  - [x] All four categories converted, split exactly at the sentence boundaries specified, wording
        copied verbatim (verified byte-for-byte via the `join(' ')` reconstruction test in Task 4).
  - [x] **Head of State** — 3 paragraphs, as specified.
  - [x] **Primogen** — 2 paragraphs, as specified.
  - [x] **Socialite** — 2 paragraphs, as specified.
  - [x] **Enforcer** — 2 paragraphs, as specified.
- [x] Task 2 — Render each paragraph as its own `<p>` (AC: 1)
  - [x] `office-tab.js`'s Status Power section now loops `data.statusPower`, one `esc()`-escaped
        `<p>` per entry, inside the unchanged `.office-status-power` wrapper. Verified with a
        direct Node render (not just tests): `renderOfficeTab` against a Primogen character
        produced `<div class="office-status-power"><p>...</p><p>...</p></div>` with two distinct
        paragraphs, content verbatim.
- [x] Task 3 — Paragraph spacing (AC: 4)
  - [x] Added `.office-status-power p { margin: 0 0 10px; }` and
        `.office-status-power p:last-child { margin-bottom: 0; }` to `public/css/suite.css`,
        reusing the `10px` value from the adjacent `.office-manoeuvre-list`'s `gap`. No bare
        hex/inline styles; token-based sizing only (10px is a spacing literal, not a colour —
        matches this file's own existing convention of numeric px values for layout, tokens for
        colour/font).
- [x] Task 4 — Update the existing byte-identical test (AC: 5)
  - [x] `STATUS_POWER_UNCHANGED` in `issue-1141-office-data-sync.test.js` converted to four
        paragraph arrays matching Task 1 exactly. The AC8 test's `.toBe()` changed to `.toEqual()`.
        Added a second, independent test per category — `statusPower.join(' ')` reconstructs a
        `STATUS_POWER_FLAT` original-string constant — so a future edit that silently drops or
        reorders a sentence is caught by content, not just shape.
  - [x] Confirmed RED before the fix: ran the unmodified AC8 test against the new array data first
        (before touching the test file) — 4 failures, one per category, each showing the array vs.
        the old flat-string expectation. Confirmed GREEN after: 59/59 (55 original + 4 new
        reconstruction tests).
- [x] Task 5 — Regression (AC: all)
  - [x] `issue-1141-office-data-sync.test.js`, `issue-1141-office-tab-render.test.js`,
        `feature.691.hos-city-status-power.test.js` — 59/59 passing (was 55/55 baseline, +4 new
        reconstruction tests, 0 regressions).

### Review Findings

Internal 3-layer review (Blind Hunter, Edge Case Hunter, Acceptance Auditor), 2026-08-12.

- [x] [Review][Patch] AC1 (renders as `<p>` elements) has no committed regression test — only a
      manual, unrepeatable Node check [public/js/tabs/office-tab.js:29-33] — found independently by
      both Blind Hunter and Acceptance Auditor. **Fixed**: added a real render-level test to
      `issue-1141-office-tab-render.test.js` (Primogen, non-HoS to avoid the async wiring issue the
      file's own existing tests already route around) — asserts exactly 2 `<p>` tags, correct
      content in each, and that the block is genuinely NOT one flat run of text.
- [x] [Review][Patch] AC3's own wording is wrong: it says paragraph groupings are "specified in
      Dev Notes below," but they're actually in Tasks/Subtasks (Dev Notes contains no such
      grouping) [specs/stories/otc-1-status-power-paragraph-rendering.md — AC3] — found by
      Acceptance Auditor, independently verified against the file's own section structure. **Fixed**:
      corrected AC3's cross-reference to point at Task 1, with a note recording the correction.
- [x] [Review][Patch] The test file's new header comment reads as self-contradictory: "neither does
      this story" immediately followed by "otc.1 split each flat string into paragraphs"
      [server/tests/issue-1141-office-data-sync.test.js:74-76] — found by Blind Hunter. **Fixed**:
      reworded to distinguish WORDING (unchanged) from CONTAINER (changed) explicitly.

**Dismissed (6), not written as action items — reasoning kept here for the record:**

- Unguarded `for...of data.statusPower` throwing on undefined/null, or silently per-character-
  iterating a stray plain string (Blind Hunter, 2 findings, both High as raised). Edge Case Hunter
  traced actual reachability: the Administrator category (the only gap in `OFFICE_DATA`) never
  reaches this loop at all — `renderOfficeTab`'s `if (!data)` guard returns first — and a
  repo-wide grep confirms all four real `statusPower` values are correctly array-shaped with no
  other consumer expecting a string. The identical unguarded pattern already exists one line below
  for `data.manoeuvres` and `data.merits` in the same file — adding a guard to only the newly-touched
  loop would be arbitrary, inconsistent hardening the story never asked for. Correct-but-wrong: a
  real theoretical gap, not a real reachable one, and not this story's to fix in isolation.
- "First test's claim isn't independently verified on its own" (Blind Hunter, labelling nitpick on
  which of two assertions provides which guarantee) — the reporter's own assessment: "Not a bug."
  The actual content protection (the `join(' ')` reconstruction test) exists and works.
- CSS cascade/specificity "unverifiable from diff alone" (Blind Hunter) — resolved by Edge Case
  Hunter's actual check of `suite.css`/`theme.css`: no global `p` reset, no other scoped rule
  targets the same container. No collision.
- No handling for an empty array/empty-string paragraph (Blind Hunter) — same reasoning as the
  first item: theoretical, not reachable with current data, matches the existing unguarded style
  of the sibling loops in this file.
- "Diff visibility limited to four categories" (Blind Hunter, could not confirm all `OFFICE_DATA`
  entries were migrated from a diff-only view) — resolved by Edge Case Hunter's repo-wide grep:
  exactly four categories exist, all migrated, confirmed via `git show HEAD`.
- AC4's parenthetical calling the spacing value "design-system token-based" (Acceptance Auditor) —
  the codebase's real convention (confirmed: no spacing custom properties exist anywhere in
  `suite.css`, only raw px literals for layout; tokens are reserved for colour/font) makes the
  10px literal correct as implemented. The AC's own wording was imprecise, not the code.

## Dev Notes

### Current state of the files this story touches

**`public/js/tabs/office-data.js`**: `OFFICE_DATA` is a plain object literal, four keys
(`'Head of State'`, `'Primogen'`, `'Socialite'`, `'Enforcer'`; `'Administrator'` has no entry at
all — a known, separate gap, not this story's concern). Each entry's `statusPower` is a single
string, quoted with escaped apostrophes (`\'`) — preserve that escaping style when splitting into
array entries.

**`public/js/tabs/office-tab.js`**: the Status Power section (around the `// Status Power` comment)
is:
```js
h += `<div class="office-section">`;
h += `<div class="office-section-hd">Status Power</div>`;
h += `<div class="office-status-power">${esc(data.statusPower)}</div>`;
h += `</div>`;
```
`esc()` (from `public/js/data/helpers.js`) HTML-escapes a string — when `data.statusPower` becomes
an array, this single `esc()` call must become a loop, one `esc()` call per paragraph.

**`public/css/suite.css:2290`**: `.office-status-power` today only styles the outer block
(padding, background, border, `line-height: 1.7`) — no rule for its own `<p>` children exists yet
because there are none. `.office-manoeuvre-list` (line 2292, four lines below) uses `gap: 10px` for
its own item spacing — reuse that same value for consistency within this tab, per this project's
"reuse an existing component/spacing value before inventing one" convention
(`specs/project-context.md`).

**`server/tests/issue-1141-office-data-sync.test.js`**: `STATUS_POWER_UNCHANGED` (around line 69)
is a plain object of the same four flat strings, asserted byte-identical to `OFFICE_DATA[...]
.statusPower` via `.toBe()`. This is the test that will break the moment `statusPower` becomes an
array — Task 4 updates it in the same story, not as an afterthought.

### Testing standards summary

- vitest, `cd server && npx vitest run tests/<name>.test.js`. Run only the three files named in
  Task 5, not the full suite.
- `issue-1141-office-data-sync.test.js` and `issue-1141-office-tab-render.test.js` both import
  `office-data.js`/`office-tab.js` directly (the latter via a `globalThis.location` stub — see that
  file's own header comment for why). Neither needs a database.

### Project Structure Notes

- No new files. Two source files edited (`office-data.js`, `office-tab.js`), one CSS rule added,
  one existing test updated.
- British English throughout, no em-dashes (already true of the existing text — preserved, not
  introduced).

### References

- [Source: public/js/tabs/office-data.js] — all four `statusPower` strings, verbatim, quoted in
  Task 1.
- [Source: public/js/tabs/office-tab.js] — the render line this story changes.
- [Source: public/css/suite.css#L2286-2293] — `.office-status-power` and the sibling
  `.office-manoeuvre-list` spacing value this story reuses.
- [Source: server/tests/issue-1141-office-data-sync.test.js] — `STATUS_POWER_UNCHANGED` and the
  AC8 test this story must update, not break.
- [Source: specs/epic-otc-office-tab-correctness.md] — parent epic.
- [Source: 2026-08-12 party-mode scoping session] — Sally's original framing of this as
  potentially an authoring-surface gap, resolved during this story's own research (the field is
  flat, not un-rendered).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `node -e "..."` direct render check of `renderOfficeTab` against a Primogen character —
  confirmed real HTML output: `<div class="office-status-power"><p>...</p><p>...</p></div>`.
- Confirmed baseline green (55/55) before any change; confirmed RED (4 failures, one per category)
  immediately after the data-shape change and before updating the test file; confirmed GREEN
  (59/59) after Task 4.

### Completion Notes List

- All 5 ACs implemented and verified. No deviations from the story's specified paragraph
  boundaries — implemented exactly as decided during create-story.
- The `join(' ')` reconstruction test (Task 4) is a genuine second, independent check: the
  `.toEqual()` array-shape test alone would not catch a sentence silently dropped from one
  paragraph and not another if the two paragraph arrays still happened to match some OTHER
  expected array by coincidence — the flat-string reconstruction closes that gap.
- No new files. Four files touched: two source, one CSS, one existing test.

### File List

- `public/js/tabs/office-data.js` — MODIFIED. All four `statusPower` fields converted from flat
  strings to arrays of paragraph strings.
- `public/js/tabs/office-tab.js` — MODIFIED. Status Power render loop, one `<p>` per paragraph.
- `public/css/suite.css` — MODIFIED. Added `.office-status-power p` / `p:last-child` spacing rules.
- `server/tests/issue-1141-office-data-sync.test.js` — MODIFIED. `STATUS_POWER_UNCHANGED` converted
  to arrays; AC8 test uses `.toEqual()`; added a `STATUS_POWER_FLAT` reconstruction test per
  category. Review fix: reworded the header comment (was self-contradictory).
- `server/tests/issue-1141-office-tab-render.test.js` — MODIFIED (review fix). Added a real
  render-level test for AC1 — previously AC1 had no committed regression coverage.

## Senior Developer Review (AI)

**Reviewer:** Internal — 3 parallel subagent layers (Blind Hunter, Edge Case Hunter, Acceptance
Auditor), this session, 2026-08-12.

**Outcome:** All 3 patch findings fixed and verified. 6 findings dismissed with recorded reasoning
(see Review Findings above) — mostly Blind Hunter flags that Edge Case Hunter's grounded,
project-aware check resolved as non-issues (an unguarded `for...of` matching the file's own
pre-existing style for the sibling `manoeuvres`/`merits` loops, not newly introduced; no CSS
collision; all four `OFFICE_DATA` entries confirmed migrated). A clean case of the layered
blinding working as intended — Blind Hunter's context-free flags were correct to raise, Edge Case
Hunter's project access correctly downgraded them.

**Final regression:** 60/60 passing (was 59/59 before the review fixes; +1 new render test), 0
failures, 0 regressions.
