---
issue: 468
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/468
branch: ms/issue-468-dt-report-st-notes-heading
status: review
date: 2026-05-22
---

# fix.468 — DT player report: ST Notes rendered under last project heading

## Story

As a player viewing my downtime report,
I want the ST Notes section to appear under its own "ST Notes and Extra Story" heading,
so that it is clearly separate from my project narratives.

## Background

`compilePushOutcome` in `downtime-story.js` assembles the `published_outcome` string
by joining a `parts` array of `## heading\n\nbody` strings. At line 3716, the
`general_notes` field (the "ST NOTES" free-text textarea in the DT Story admin panel)
is pushed to `parts` with **no `## ` heading**:

```js
if (generalNotes) { parts.push(generalNotes); hasContent = true; }
```

When `parts.join('\n\n')` runs, the general_notes text is concatenated directly after
the last project section's body text. `parseOutcomeSections` (helpers.js:287) splits
only on `## ` lines, so the ST notes fall inside the last project section. On the
player-facing report, they render as body paragraphs under the last project heading
with no visual or structural boundary.

Confirmed: Keeper's DT 3 — "Music on the Wind" (Project 4 narrative) and the Cruac
rite ST notes both appear under "MUSIC ON THE WIND" in the player view.

## Acceptance Criteria

- [ ] AC1: A submission with `st_narrative.general_notes` set renders a distinct
  "ST NOTES AND EXTRA STORY" section heading in `renderOutcomeWithCards` output,
  separated from the last project section.
- [ ] AC2: A submission with no `general_notes` (or empty string) renders identically
  to before — no empty section heading appears.
- [ ] AC3: Project sections are unaffected — their headings and body text render as
  before.

---

## Dev Notes

### File to modify — ONE file

**`public/js/admin/downtime-story.js`** — function `compilePushOutcome`, line 3716.

Do NOT touch: `parseOutcomeSections`, `renderOutcomeWithCards`, `story-tab.js`,
`helpers.js`, or any CSS. This fix is entirely in the assembly layer.

### Exact fix — one line

**Current (line 3716):**
```js
if (generalNotes) { parts.push(generalNotes); hasContent = true; }
```

**Replacement:**
```js
if (generalNotes) { parts.push(`## ST Notes and Extra Story\n\n${generalNotes}`); hasContent = true; }
```

The `## ` prefix causes `parseOutcomeSections` to treat this as a new section. The
player-facing render loop in `renderOutcomeWithCards` will automatically produce:
```html
<div class="story-section">
  <div class="story-section-header">
    <h4 class="story-section-head">ST Notes and Extra Story</h4>
  </div>
  <div class="story-section-body">
    <p>…general notes text…</p>
  </div>
</div>
```

No CSS changes needed — the `.story-section-head` style already covers this.

### Why no other files need changing

`compilePushOutcome` writes to `st_review.outcome_text` (stored as `published_outcome`
on the submission document). `parseOutcomeSections` reads that string and splits on
`## `. `renderOutcomeWithCards` loops the sections and renders each heading + body.
All three are already wired correctly — the only missing piece is the `## ` prefix on
the general_notes block.

### Impact on existing published outcomes

Existing `published_outcome` strings already stored in MongoDB will **not** be
changed — this fix only affects future publish operations. Characters who have already
had their DT3 outcomes published (Keeper, Anichka, etc.) will continue to see the
merged rendering until their outcomes are republished by the ST. That is acceptable
and out of scope for this story.

### Context: where `general_notes` lives in the DT Story admin

The "ST NOTES" textarea is rendered in the DT Story admin panel. It saves to
`st_narrative.general_notes` via `saveNarrativeField` at line 345. It has no
`status` field — it is always included when non-empty (no completion gate, unlike
project_responses which require `status === 'complete'`). The empty-string guard
(`if (generalNotes)`) at line 3716 is already correct and must be preserved.

### Parse check (required)

```
node --check --input-type=module < public/js/admin/downtime-story.js
```

Must exit 0.

---

## Tasks / Subtasks

- [x] T1: Update `compilePushOutcome` at line 3716 in `downtime-story.js` — add
  `` `## ST Notes and Extra Story\n\n` `` prefix to the `generalNotes` push
- [x] T2: Parse check: `node --check --input-type=module < public/js/admin/downtime-story.js`

---

## Testing Approach

Playwright test via the Archive tab — same pattern as fix-464 and fix-466.

Stub a submission with `st_narrative.general_notes` set. Navigate to the Archive tab,
open the submission, and assert:
- A `.story-section-head` containing "ST Notes and Extra Story" is present
- The general_notes text appears in the section body
- No `.story-section-head` containing "ST Notes and Extra Story" appears when
  `general_notes` is absent

**Test file:** `tests/fix-468-dt-report-st-notes-heading.spec.js`

---

## File List

- `public/js/admin/downtime-story.js` — UPDATE (line 3716)
- `tests/fix-468-dt-report-st-notes-heading.spec.js` — CREATE

---

## Dev Agent Record

**Completed:** 2026-05-22

**Implementation:** Single-line change at `downtime-story.js:3717` — added `` `## ST Notes and Extra Story\n\n` `` prefix to the `generalNotes` push in `compilePushOutcome`. Parse check passed (exit 0).

**Tests:** 5 Playwright tests in `tests/fix-468-dt-report-st-notes-heading.spec.js` — all passed on first run. Covers: heading present when notes set, notes text in correct section body, no heading when notes absent, project heading unaffected, project body not contaminated.

**Note:** Existing published outcomes in MongoDB (Keeper, Anichka DT3) are unaffected until STs republish — out of scope per story.
