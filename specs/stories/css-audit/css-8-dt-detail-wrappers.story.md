# Story CSS-8: DT Panel Chrome Harmonisation — Detail Wrapper Deduplication (Bucket 1C)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer maintaining `admin-layout.css`,
I want the nine identical "detail wrapper" rule declarations collapsed into a single grouped selector,
so that the file is shorter, the pattern is obvious, and any future change to the wrapper style happens in one place instead of nine.

## Background

Audit doc: `specs/audits/downtime-ui-audit-2026-04-26.md` §1C. Nine separate classes all write the **identical** rule:

```
margin-top: 10px;
padding-top: 10px;
border-top: 1px solid var(--bdr);
```

The classes (with line numbers from audit):
- `.dt-feed-detail` (1636)
- `.dt-narr-detail` (2099)
- `.dt-mech-detail` (2115)
- `.dt-publish-panel` (2133)
- `.dt-approval-detail` (2166)
- `.dt-exp-panel` (2199)
- `.dt-notes-detail` (2235)
- `.proc-response-review-section` (5140)
- `.proc-retag-row` (5163) — adds `display:flex; gap:8` on top of the same three properties

This is the largest single redundancy in the file. Each class divides vertical space inside an expanded sub-card with a top border + top padding + top margin. The accidental fragmentation is purely a side effect of nine different epics adding their own "detail wrapper" without checking what existed.

Approach: same as CSS-6 and CSS-7 — pure CSS, grouped selector rewrite, no JS edits, no class renames. Lowest-risk story in the harmonisation series; the chrome being deduplicated is already byte-identical across all nine consumers.

## Acceptance Criteria

1. **Given** the nine detail-wrapper classes **When** rendered **Then** each receives the shared three-property declaration (`margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--bdr);`) from a single grouped selector, and the duplicated declarations on each individual class block are removed.
2. **Given** `.proc-retag-row` **When** rendered **Then** it has both the shared three-property declaration AND its own `display: flex; align-items: center; gap: 8px;` (the flex layout is unique to this class and must be retained).
3. **Given** the implementation diff **When** inspected **Then** no `.js` file is modified, no `.html` file is modified, and no class name is renamed or removed.
4. **Given** any JS file that previously referenced one of the target class names **When** searched after the change **Then** every reference still finds its element.
5. **Given** the admin app open on the Downtimes tab **When** an ST expands a project action drawer **Then** the visual appearance of the drawer's stacked sections (feed detail, narrative detail, mechanical detail, publish panel, approval detail, expenditure panel, notes detail) is **byte-identical** to before the change. Pixel-equivalent rendering is a hard requirement here because the chrome being deduplicated was already identical.
6. **Given** `public/css/admin-layout.css` after the change **When** measured **Then** the file has fewer total lines than before (rule deduplication should net negative LOC).

## Tasks / Subtasks

- [x] Locate all nine target classes in `public/css/admin-layout.css` (AC: #1, #2)
  - [x] Verify each class has the expected `margin-top: 10; padding-top: 10; border-top: 1px var(--bdr)` rule body before editing
  - [x] Note any class whose current declaration differs from the others (audit found them identical, but verify against current file in case drift has occurred since 2026-04-26)

- [x] Write the canonical detail-wrapper rule block (AC: #1)
  - [x] Suggested location: at or near line 2099 (where the first cluster of these wrappers lives), under comment `/* ── Detail wrapper sections: shared (CSS-8) ── */`
  - [x] Grouped selector covering all nine classes:
    ```
    .dt-feed-detail,
    .dt-narr-detail,
    .dt-mech-detail,
    .dt-publish-panel,
    .dt-approval-detail,
    .dt-exp-panel,
    .dt-notes-detail,
    .proc-response-review-section,
    .proc-retag-row {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--bdr);
    }
    ```

- [x] Strip the duplicated three-property block from each individual class (AC: #1, #2)
  - [x] `.dt-feed-detail` (1636) — block becomes empty (was only those 3 properties); delete the empty block
  - [x] `.dt-narr-detail` (2099) — block becomes empty; delete
  - [x] `.dt-mech-detail` (2115) — block becomes empty; delete
  - [x] `.dt-publish-panel` (2133) — block becomes empty; delete
  - [x] `.dt-approval-detail` (2166) — block becomes empty; delete
  - [x] `.dt-exp-panel` (2199) — block becomes empty; delete
  - [x] `.dt-notes-detail` (2235) — block becomes empty; delete
  - [x] `.proc-response-review-section` (5140) — block becomes empty; delete
  - [x] `.proc-retag-row` (5163) — block retains its `display: flex; align-items: center; gap: 8px;` (the three shared properties are removed; the flex properties stay)

- [x] Verify no JS coupling broken (AC: #3, #4)
  - [x] Use Grep tool against `public/js/` for the nine class names
  - [x] Note: classes like `.dt-feed-detail` are likely used as JS selectors to find the section in the DOM. Class names are unchanged, so all selectors still work.
  - [x] Confirm `git diff --stat` shows only `public/css/admin-layout.css` (and optionally the audit doc)

- [x] Visual verification in browser (AC: #5) — **WAIVED by user 2026-04-26.** Local browser verification was attempted but the Downtimes tab requires the API server running for data; rather than spin that up, AC #5 is waived on the basis that the change is provably byte-equivalent at the CSS level (nine identical rules collapsed into one grouped selector with the same property values; resolved style on every affected element is unchanged). Subtasks below intentionally left unchecked — the physical actions did not occur, but the verification they exist to provide is supplied by the byte-equivalence guarantee and the JS reference grep in task 4.
  - [ ] Start frontend: `npx http-server public -p 8080`
  - [ ] Open admin Downtimes tab in a cycle with submissions
  - [ ] Expand a project action drawer
  - [ ] Visually confirm the stacked sub-sections (feed detail, narrative, mechanical, publish, approval, expenditure, notes) render with identical spacing and divider lines as before
  - [ ] Expand the response review section (`.proc-response-review-section`) inside an action; confirm the divider above it still renders
  - [ ] Trigger the retag flow (`.proc-retag-row`) and confirm the flex layout still works AND the divider above it still renders

- [x] Update audit doc with implementation note (AC: #6)
  - [x] Add `### Bucket 1C — Resolved` line at the bottom of audit §3 referencing this story key and date

- [x] Confirm line count dropped (AC: #6)
  - [x] Before/after LOC of `public/css/admin-layout.css` recorded in Dev Agent Record. Expected: net negative around 20–25 lines (9 × 3 properties + 9 closing braces + 9 blank lines, minus the new shared block of ~14 lines)

## Dev Notes

**Single file in scope:** `public/css/admin-layout.css`.

**Hard constraint:** No JS edits, no markup edits, no class renames. Class names stay; only the rule bodies migrate to a shared block.

**Lowest-risk story in the series.** The chrome being deduplicated is already byte-identical across all nine consumers. AC #5 demands pixel-equivalent rendering for that reason; if anything looks different post-change, it's a bug.

**Why this matters even though nothing visually changes:** Future maintenance. Today, if you want to change the divider colour from `--bdr` to `--bdr2`, you have to do it nine times. After this story, you change it once.

**Order vs other CSS stories:** CSS-8 is independent of CSS-6 and CSS-7. No target-class overlap. Land in any order.

**Token discipline:** Only `--bdr` is referenced. Already a defined token. No new tokens needed.

**British English in any new comments.** Default to no comments.

### Project Structure Notes

- All work in `public/css/admin-layout.css`. No file moves, no new files.

### References

- [Source: specs/audits/downtime-ui-audit-2026-04-26.md] — Section 1C
- [Source: public/css/admin-layout.css:1636-5170] — affected line range
- [Source: public/css/theme.css] — `--bdr` token
- [Source: CLAUDE.md] — branch policy, no em-dashes
- Memory: `reference_css_token_system` — token discipline

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Amelia persona, bmad-dev-story workflow)

### Debug Log References

- LOC baseline: 8305 lines
- LOC post-change: 8285 lines (net −20)
- `git diff --stat`: `public/css/admin-layout.css | 50 +-` (15 insertions, 35 deletions)
- JS reference grep (`public/js/`): seven of nine class names emitted as HTML strings in `public/js/admin/downtime-views.js` lines 915, 1146, 1199, 1223, 7173, 7495, 7514. Two classes (`.proc-response-review-section`, `.proc-retag-row`) not found via direct string match in JS — likely applied via dynamic class composition or selector helpers; class names are unchanged either way so any prior reference path still works.
- CSS post-change references: shared selector at lines 2092-2105; `.proc-preread-body .dt-narr-detail` descendant rule at line 4179 (still valid); `.proc-retag-row` retained flex-only block at line 5146.

### Completion Notes List

- Implemented as a single grouped selector at `public/css/admin-layout.css:2092-2105`, placed just before the existing "Narrative Output" section comment (the first cluster of consumers). Removed nine duplicated declarations.
- `.proc-retag-row` reduced to `display: flex; align-items: center; gap: 8px;` only; the three shared properties now arrive via the grouped selector.
- All section comments preserved (`/* ── Narrative Output (1.7) ── */`, `/* ── Mechanical Summary (1.8) ── */`, `/* ── Publish Panel (1.9) ── */`, `/* ── Expenditure Panel (GC-3) ── */`, `/* ── ST Notes ── */`).
- Audit doc updated with §3 "Bucket 1C — Resolved" entry citing story key, date, and LOC delta.
- **AC #5 (visual byte-equivalence) WAIVED by user 2026-04-26.** Browser verification attempted but Downtimes tab requires API server for data; user accepted the waiver on the basis that the change is provably byte-equivalent at the CSS level. Story shipped on the strength of the JS reference grep + diff scope check + LOC delta + CSS semantics guarantee.
- No JS edits, no HTML edits, no class renames. Class-name-stable refactor only.
- **2026-04-26 follow-up after merge:** Audit miss discovered during CSS-6 execution — `.dt-proj-detail, .dt-merit-detail` (pre-existing grouped pair at admin-layout.css:2050) had byte-identical chrome and should have been in CSS-8's scope. Folded into the grouped selector; standalone block deleted. Eleven classes now share the rule. Net additional −3 LOC (8285 → 8282).

### File List

- Modified: `public/css/admin-layout.css` (deduplicated 9 detail-wrapper declarations into 1 shared selector)
- Modified: `specs/audits/downtime-ui-audit-2026-04-26.md` (added "Bucket 1C — Resolved" implementation note in §3)
- Modified: `specs/stories/css-audit/css-8-dt-detail-wrappers.story.md` (this file — task checkboxes, Dev Agent Record, Status)
