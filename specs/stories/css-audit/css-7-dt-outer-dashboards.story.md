# Story CSS-7: DT Panel Chrome Harmonisation — Outer Dashboard Panels (Bucket 1A)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an ST processing downtimes,
I want every collapsible dashboard panel at the top of the Downtimes tab (Snapshot, Feeding Scene, Feeding Matrix, Conflicts, Submission Checklist, Investigation Tracker, Ambience Dashboard, Phase Sections, Attach Reminder) to share one consistent outer chrome and one consistent header bar style,
so that the page reads as a coherent set of dashboards rather than nine differently-shaped boxes.

## Background

Audit doc: `specs/audits/downtime-ui-audit-2026-04-26.md`. Bucket 1A documents nine outer dashboard panels with three concrete divergences:

1. **Radius drift.** Most use 6px; `.dt-chk-panel` uses 4px.
2. **Outer-background drift.** Most are transparent (body owns the bg); `.proc-amb-dashboard` and `.proc-phase-section` add a `--surf1`/`--surf` background to the outer wrapper; `.proc-attach-panel` puts padding directly on the outer wrapper instead of an inner body.
3. **Header weight split.** Collapsible toggle bars split into a "quiet" tier (`.dt-snapshot-toggle`, `.dt-scene-toggle`, `.dt-chk-toggle`: 8/12 padding, regular weight, `--txt2` text) and a "loud" tier (`.dt-matrix-toggle`, `.proc-phase-header`, `.proc-amb-header`/`.proc-disc-header`: 10–12/16 padding, 600 weight, `--accent` text, border-bottom). The split is incidental, not principled.

Approach decided in pre-work conversation:
- **Pure CSS only.** No JS edits, no markup edits, no class renames.
- **Grouped selector rewrites.** Existing class names stay (heavy JS coupling makes renames unsafe).
- **One canonical outer-panel chrome:** `border: 1px solid var(--bdr); border-radius: 6px; overflow: hidden; margin-bottom: 12px;` with body padding owned by an inner `*-body` element.
- **One canonical loud-header chrome** for collapsible toggle bars (the "loud" pattern wins because it reads as a major section, which all of these are): 10/16 padding, `--surf2` background, `--fl` 13px / 600 weight, `--accent` colour, `border-bottom: 1px solid var(--bdr)`.

This story is bucket 1A only. CSS-6 already addresses bucket 1B (inline detail panels). Buckets 1C, 1D, and §2 are separate stories (CSS-8, CSS-9, CSS-10).

## Acceptance Criteria

1. **Given** the eight outer dashboard classes (`.dt-snapshot-panel`, `.dt-scene-panel`, `.dt-matrix-panel`, `.dt-conflict-panel`, `.dt-chk-panel`, `.dt-inv-panel`, `.proc-amb-dashboard`, `.proc-phase-section`) **When** rendered **Then** each has the canonical outer chrome from a single shared rule block, and any duplicated border/radius/overflow declarations on the individual class blocks are removed.
2. **Given** `.proc-attach-panel` **When** rendered **Then** it adopts the canonical outer chrome with body padding moved off the outer wrapper into either a new `.proc-attach-body` inner element or, if the markup cannot be changed (per the no-markup-edits constraint), the panel is allowed to retain its outer padding as a documented exception. Decision made during implementation; if exception is required, captured in Completion Notes and the audit doc.
3. **Given** all collapsible toggle headers (`.dt-snapshot-toggle`, `.dt-scene-toggle`, `.dt-chk-toggle`, `.dt-matrix-toggle`, `.proc-phase-header`, `.proc-amb-header`, `.proc-disc-header`) **When** rendered **Then** each has the canonical loud-header chrome from a single shared rule block: 10/16 padding, `--surf2` background, `--fl` 13px / 600 weight, `--accent` colour, `border-bottom: 1px solid var(--bdr)`. The "quiet" tier is retired.
4. **Given** the implementation diff **When** inspected **Then** no `.js` file is modified, no `.html` file is modified, and no class name is renamed or removed.
5. **Given** any JS file in `public/js/` that previously referenced a target class via `querySelector`, `closest`, `classList`, or string concatenation **When** searched after the change **Then** every reference still finds its element.
6. **Given** the admin app open on the Downtimes tab **When** an ST scrolls top-to-bottom past every dashboard panel (Snapshot, Feeding Scene Summary, Feeding Matrix, Conflicts, Submission Checklist, Investigation Tracker, Ambience Dashboard, the per-phase processing sections, Attach Reminder if visible) **Then** every outer wrapper reads as visually consistent in radius, border, and outer chrome; every collapsible header bar reads as visually consistent in padding, weight, colour, and the divider line beneath.
7. **Given** `public/css/admin-layout.css` after the change **When** measured **Then** the file has the same or fewer total lines than before.

## Tasks / Subtasks

- [ ] Locate every target class in `public/css/admin-layout.css` (AC: #1, #2, #3)
  - [ ] Outer panel line numbers (per audit §1A): `.dt-snapshot-panel` 1361, `.dt-scene-panel` 1781, `.dt-matrix-panel` 1847 (grouped with `.dt-conflict-panel`), `.dt-chk-panel` 1922, `.dt-inv-panel` 2144, `.proc-amb-dashboard` 5865, `.proc-phase-section` 3960, `.proc-attach-panel` 5207
  - [ ] Toggle header line numbers (per audit §2A): `.dt-snapshot-toggle` 1367, `.dt-scene-toggle` 1787, `.dt-chk-toggle` 1923, `.dt-matrix-toggle` 1853, `.proc-phase-header` 4059, `.proc-amb-header`/`.proc-disc-header` 5873
  - [ ] Verify line numbers against current file before editing (audit was 2026-04-26)

- [ ] Write the canonical outer-panel rule block (AC: #1)
  - [ ] Suggested location: just before `.dt-snapshot-panel` (around line 1360) under a comment `/* ── Outer dashboard panels: canonical chrome (CSS-7) ── */`
  - [ ] Grouped selector covering all eight outer classes with: `border: 1px solid var(--bdr); border-radius: 6px; overflow: hidden; margin-bottom: 12px;`
  - [ ] Note: `margin-bottom` varies in current code (12 vs 16); standardise to 12 unless a dashboard demonstrably needs more space (none in audit do)

- [ ] Strip duplicated chrome from each outer-panel class declaration (AC: #1)
  - [ ] For each of the eight outer classes, remove `border`, `border-radius`, `overflow`, `margin-bottom` from its individual block, leaving only properties unique to that class
  - [ ] `.dt-chk-panel` 4px radius collapses to canonical 6px
  - [ ] `.proc-amb-dashboard` `background: var(--surf1)` removed (outer becomes transparent like its peers)
  - [ ] `.proc-phase-section` `background: var(--surf)` removed (same reason). Verify the per-phase headers + bodies still visually separate from the page bg without the wrapper bg; if not, the body element gets the bg, not the wrapper
  - [ ] `.dt-matrix-panel, .dt-conflict-panel` (currently grouped on line 1847) joins the larger shared block

- [ ] Handle `.proc-attach-panel` outer-padding exception (AC: #2)
  - [ ] Current state: padding 14px declared directly on outer wrapper. No inner body element exists in the markup.
  - [ ] Preferred path: leave the outer padding in place as a documented exception. Reasoning: the no-markup-edits constraint forbids adding an inner `.proc-attach-body` div, and refactoring the JS to render one would violate the no-JS-edits constraint.
  - [ ] Document the exception in a comment above `.proc-attach-panel` and in Completion Notes
  - [ ] If review of the rendered panel shows the exception is visually problematic (it shouldn't be — the inner content fills the same painted area), bring it back to user before completing

- [ ] Write the canonical loud-header rule block (AC: #3)
  - [ ] Suggested location: directly under the canonical outer-panel block, comment `/* ── Collapsible panel headers: canonical (CSS-7) ── */`
  - [ ] Grouped selector covering all seven toggle classes with: `padding: 10px 16px; background: var(--surf2); font-family: var(--fl); font-size: 13px; font-weight: 600; color: var(--accent); border-bottom: 1px solid var(--bdr); cursor: pointer; user-select: none; display: flex; align-items: center; gap: 10px;`
  - [ ] Hover state grouped: `background: var(--surf3, var(--surf2));` for all (matching the loud-tier pattern)

- [ ] Strip duplicated header chrome from each toggle class (AC: #3)
  - [ ] For each of the seven toggle classes, remove the now-shared properties from its individual block
  - [ ] Quiet-tier classes (`.dt-snapshot-toggle`, `.dt-scene-toggle`, `.dt-chk-toggle`) lose their previous `color: var(--txt2)` and font-weight regular; they inherit the canonical accent colour + 600 weight. **This is a visible visual change** — they will become more prominent. AC #6 verifies this is acceptable.
  - [ ] `.proc-disc-header` retains its mt:16 + border-top (it's a sub-header inside `.proc-amb-dashboard`, not a top-level toggle); verify the canonical block doesn't override these
  - [ ] `.dt-city-panel-head` (line 1868) is a wrapping element, not a toggle itself — it composes a `.dt-matrix-toggle` + `.dt-city-export-btn`. Leave it as-is; the inner toggle picks up the canonical via the grouped selector.

- [ ] Verify no JS coupling broken (AC: #4, #5)
  - [ ] Use Grep tool: pattern `dt-snapshot-panel|dt-scene-panel|dt-matrix-panel|dt-conflict-panel|dt-chk-panel|dt-inv-panel|proc-amb-dashboard|proc-phase-section|proc-attach-panel|dt-snapshot-toggle|dt-scene-toggle|dt-chk-toggle|dt-matrix-toggle|proc-phase-header|proc-amb-header|proc-disc-header` against `public/js/`
  - [ ] Confirm every JS reference still maps to a class name that exists post-change
  - [ ] Confirm `git diff --stat` shows only `public/css/admin-layout.css` modified (and optionally the audit doc)

- [ ] Visual verification in browser (AC: #6)
  - [ ] Start frontend: `npx http-server public -p 8080`
  - [ ] Open admin Downtimes tab in a cycle that has data
  - [ ] Scroll top-to-bottom: verify Snapshot → Feeding Scene → Feeding Matrix → Conflicts → Submission Checklist → Investigation Tracker → Ambience Dashboard → per-phase sections → Attach Reminder all read as a unified family
  - [ ] Click each collapsible toggle to confirm interaction state still works (open/close still triggers via JS)
  - [ ] Verify the previously-quiet headers now read as appropriately prominent and not overwhelming; if they do feel overwhelming, the canonical "loud" pattern may need to be tuned down (keep 600 weight, drop accent colour to `--txt`?). Bring tuning decision back to user.
  - [ ] Verify `.proc-attach-panel` (visible during late-cycle ST review when an action wants to attach to a target) still looks correct with its outer padding exception

- [ ] Update audit doc with implementation note (AC: #7)
  - [ ] Add `### Bucket 1A — Resolved` line at the bottom of audit §3 referencing this story key and date
  - [ ] If `.proc-attach-panel` exception was made, document it in the audit too

- [ ] Verify line count did not grow (AC: #7)
  - [ ] Before/after line count of `public/css/admin-layout.css` recorded in Dev Agent Record

## Dev Notes

**Single file in scope:** `public/css/admin-layout.css`.

**Hard constraint:** No JS edits, no markup edits, no class renames. Same as CSS-6 — heavy JS coupling makes renames unsafe.

**Visible behaviour change:** AC #3 retires the "quiet" toggle tier. Three previously-quiet headers (snapshot, scene, checklist) become accent-coloured and bolder. This is a deliberate visual change, not a regression. Verify in browser that the result reads as intentional rather than overwhelming.

**Token discipline:** All colour values via tokens (`--surf2`, `--bdr`, `--accent`). No bare hex.

**Order vs CSS-6:** CSS-6 (inline panels) and CSS-7 (outer panels) are independent. They can land in either order. If both are pending and one is committed first, the other does not need to be re-tested against the first; their target classes do not overlap.

**Body-padding location:** Most outer panels have a sibling `*-body` element (`.dt-snapshot-body`, `.dt-inv-body`) that owns the inner padding. `.proc-amb-dashboard` uses `.proc-amb-body`. `.proc-phase-section` does NOT have an explicit `*-body` — its phase header sits directly inside the wrapper, with `.proc-action-row` rows beneath. This is fine: each row owns its own padding.

**Stripe-accent on outer panels:** Not applicable. Outer panels do not currently use accent stripes; that pattern is exclusive to inline panels (CSS-6 scope).

**British English in any new comments.** Default to no comments unless a reader would be confused.

### Project Structure Notes

- All work in `public/css/admin-layout.css`. No file moves.

### References

- [Source: specs/audits/downtime-ui-audit-2026-04-26.md] — Sections 1A, 2A, 4A
- [Source: public/css/admin-layout.css:1361-5926] — primary edit range
- [Source: public/css/theme.css] — `--surf2`, `--bdr`, `--accent`
- [Source: CLAUDE.md] — branch policy, British English, no em-dashes
- Memory: `reference_css_token_system` — token discipline rules

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
