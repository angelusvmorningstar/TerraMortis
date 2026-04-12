# Story feature.55: Downtime Submission Overview & Checklist

## Status: done

## Story

**As an** ST processing downtime submissions,
**I want** a single-glance checklist showing which parts of each character's submission have been reviewed,
**so that** I can track my processing progress and catch any sections I've missed.

## Background

The existing "Feeding Scene Summary" panel shows a summary focused on feeding. We need a broader overview that covers all sections of a downtime submission — not just feeding — and lets the ST mark sections as "sighted" (reviewed but not formally validated).

Only feeding currently has a validated state (feeding_roll present on the submission). All other sections require a manual "sight" toggle to mark as reviewed. The checklist column definitions below are fixed and always shown, regardless of whether the character submitted anything for that section.

## Acceptance Criteria

1. A new "Submission Checklist" panel replaces (or is positioned above) the "Feeding Scene Summary" panel in the processing view (`#dt-feeding-scene` element).
2. One row per active character, sorted alphabetically by character name. Characters without submissions get a faded row with all `—` cells and a "No submission" badge.
3. Columns (in order):
   - **Character** — character name
   - **Travel** — whether `_raw.submission.narrative.travel_description` is non-empty (has content)
   - **Feeding** — whether `_raw.feeding.method` is set (has feeding declared)
   - **P1–P4** — four project columns; each shows whether `responses.project_${n}_action` is set (or `_raw.projects[n-1]` exists)
   - **Influence** — whether `_raw.sphere_actions` has entries
   - **Allies** — same as Influence (sphere_actions include ally/status actions; any sphere_actions.length > 0 counts)
   - **Contacts** — whether `_raw.contact_actions.requests` has entries
   - **Resources** — whether `_raw.retainer_actions.actions` has entries
   - **XP** — whether `_raw.meta.xp_spend` is non-empty
4. Each cell with content shows one of three states:
   - **`—`** (`dt-chk-empty`) — no content in this section
   - **`?`** (`dt-chk-unsighted`) — has content, not yet sighted (amber)
   - **`✓`** (`dt-chk-sighted`) — sighted by ST (green, or gold for feeding when roll is also present)
   - Feeding column additionally shows **`★`** (`dt-chk-validated`) when `sub.feeding_roll` is set (green, bold)
5. Clicking a `?` or `✓` cell toggles the "sighted" state for that section. Sighted state is persisted to `st_review.sighted.${sectionKey}` on the submission via `updateSubmission`.
6. Section keys for `st_review.sighted`: `travel`, `feeding`, `project_1`, `project_2`, `project_3`, `project_4`, `influence`, `allies`, `contacts`, `resources`, `xp`.
7. The panel is collapsible (same toggle pattern as other panels). Default open.
8. A header row shows column labels. The panel header count shows total characters / number fully processed (all present sections sighted or validated).

## Tasks / Subtasks

- [x] Task 1: Add `renderSubmissionChecklist` function (AC: 1–8)
  - [x] Replace the existing `renderFeedingScene` call in the processing render flow with `renderSubmissionChecklist` — keep `renderFeedingScene` intact for now (it may be removed in a follow-up story)
  - [x] Iterate `activeChars` sorted by name; look up submission via `subByCharId`
  - [x] For each char/sub, compute section states:
    ```js
    function _chkState(sub, sectionKey, hasContent) {
      if (!hasContent) return 'empty';
      if (sectionKey === 'feeding' && sub?.feeding_roll) return 'validated';
      if (sub?.st_review?.sighted?.[sectionKey]) return 'sighted';
      return 'unsighted';
    }
    ```
  - [x] Render table with fixed columns: Character | Travel | Feeding | P1 | P2 | P3 | P4 | Infl/Allies | Contacts | Resources | XP
  - [x] Each content cell: `empty` → `—` (.dt-chk-empty); `unsighted` → `?` (.dt-chk-unsighted, clickable); `sighted` → `✓` (.dt-chk-sighted, clickable); `validated` → `★` (.dt-chk-validated, not clickable)
  - [x] Clickable cells have `data-sub-id` and `data-section` attributes; click handler toggles sighted state
  - [x] Characters without submissions: faded row (`dt-chk-nosub`), all cells `—`

- [x] Task 2: Click handler — toggle sighted (AC: 5, 6)
  - [x] On `.dt-chk-cell[data-sub-id]` click: read current sighted state, toggle, call `updateSubmission(subId, { ['st_review.sighted.' + section]: newVal })`
  - [x] Update `sub.st_review.sighted[section]` in memory, re-render checklist only (not full `renderSubmissions`)

- [x] Task 3: CSS (AC: 2–4)
  - [x] `.dt-chk-panel`, `.dt-chk-toggle`, `.dt-chk-wrap`, `.dt-chk-table` — same structure as `.dt-matrix-*`
  - [x] `.dt-chk-empty` — muted, opacity .4
  - [x] `.dt-chk-unsighted` — amber (`#d4902a`), cursor pointer
  - [x] `.dt-chk-sighted` — green (`#3a8a3a`), cursor pointer
  - [x] `.dt-chk-validated` — green bold, cursor default (not toggleable)
  - [x] `.dt-chk-nosub td` — opacity .45

## Dev Notes

### Influence vs Allies columns

Both map to `_raw.sphere_actions`. The distinction in the user's mental model is that sphere_actions cover both influence and allies/status merit actions — they come from the same array in the parser. Combine them into a single **Influence & Allies** column: show content if `raw.sphere_actions.length > 0`.

Revised columns (drop separate Allies column): Character | Travel | Feeding | P1 | P2 | P3 | P4 | Influence/Allies | Contacts | Resources | XP

### Project content detection

Check `s.responses?.[`project_${n}_action`]` first. If absent, check `(raw.projects || [])[n-1]` exists. Either is sufficient to count as "has content".

### `subByCharId` availability

`renderFeedingMatrix` builds its own local char→sub map. Reuse the same approach for the checklist: build `const subByChar = {}; for (const sub of submissions) { subByChar[String(findCharacter(sub.character_name, sub.player_name)?._id || '')] = sub; }` at the top of `renderSubmissionChecklist`.

### Where to inject

`renderFeedingScene()` is called from `renderProcessingMode`. Replace that call with `renderSubmissionChecklist()` and leave `renderFeedingScene` defined but un-called (future removal story).

The `#dt-feeding-scene` element is already in the DOM template — reuse it for the checklist panel.

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | Add `renderSubmissionChecklist`; replace `renderFeedingScene` call |
| `public/css/admin-layout.css` | `.dt-chk-*` styles |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-12 | 1.0 | Initial draft | Amelia (claude-sonnet-4-6) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- `renderSubmissionChecklist` added: fixed 10-column table per active character with sighted/empty/validated states
- `_chkHasContent(sub, key)` + `_chkState(sub, key)` helpers drive cell state logic
- Influence and Allies merged into single `influence_allies` column (both read from `sphere_actions`)
- Toggle click handler persists to `st_review.sighted.${section}` via `updateSubmission`, updates memory, re-renders checklist
- Feeding column shows ★ (validated) when `feeding_roll` is present; other sections use ?/✓/—
- `renderFeedingScene()` call replaced at both sites (processing mode + dev preview) with `renderSubmissionChecklist()`
- `renderFeedingScene` retained in code but uncalled

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `specs/stories/feature.55.downtime-submission-checklist.story.md`
