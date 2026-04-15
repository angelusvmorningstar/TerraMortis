# Story DT-Fix-7: Remove ST Response Block from DT Processing

## Status: done

## Story

**As an** ST using DT Processing,
**I want** the ST Response textarea, Save button, and "Drafted by" badge removed from action panels,
**so that** narrative drafting lives exclusively in DT Story and DT Processing stays focused on mechanical resolution.

## Background

Feature.66 added an ST Response section to project and feeding action panels in DT Processing. That decision predates the DT Story tab, which now owns all narrative authoring. The textarea is dead UI in DT Processing — STs draft in DT Story, not here. Removing it simplifies the panel and eliminates a source of confusion.

The "Reviewed by" label / "Mark reviewed" button that sits beneath the ST Response section is also part of this response workflow and must be removed. The `st_response`, `response_author`, `response_status`, and `response_reviewed_by` fields can remain in the data model (DT Story still reads them in some transitions) — only the DT Processing UI is removed.

---

## Blocks to Remove

### 1. Project action panel — ST Response section

**File:** `public/js/admin/downtime-views.js`
**Approximate location:** ~line 6604, inside the action detail panel rendering block for `entry.source === 'project'`

```js
// REMOVE this entire block:
if (entry.source === 'project') {
  const stResponse     = rev.st_response       || '';
  const responseAuthor = rev.response_author   || '';
  const responseStatus = rev.response_status   || '';
  const reviewedBy     = rev.response_reviewed_by || '';
  h += '<div class="proc-st-response-section">';
  // ... full block through closing </div>
}
```

### 2. Project right panel — response review section

**File:** `public/js/admin/downtime-views.js`
**Function:** `_renderProjRightPanel()` (~lines 5456–5468)

```js
// REMOVE this block:
if (stResponse) {
  h += `<div class="proc-response-review-section">`;
  if (responseStatus === 'reviewed') {
    h += `<div class="proc-response-reviewed-label">Reviewed by ${esc(reviewedBy)}</div>`;
  } else {
    h += `<button class="dt-btn proc-response-review-btn" ...>Mark reviewed</button>`;
  }
  h += `</div>`;
}
```

Also remove the variable declarations for `stResponse`, `responseAuthor`, `responseStatus`, `reviewedBy` in `_renderProjRightPanel` if they are only used by the removed block.

### 3. Feeding right panel — response review section

**File:** `public/js/admin/downtime-views.js`
**Function:** `_renderFeedRightPanel()` (~lines 5698–5710)

```js
// REMOVE this block:
if (feedStResponse) {
  h += `<div class="proc-response-review-section">`;
  if (feedResponseStatus === 'reviewed') {
    h += `<div class="proc-response-reviewed-label">Reviewed by ${esc(feedReviewedBy)}</div>`;
  } else {
    h += `<button class="dt-btn proc-response-review-btn" ...>Mark reviewed</button>`;
  }
  h += `</div>`;
}
```

Also remove `feedReviewedBy`, `feedStResponse`, `feedResponseStatus` declarations if only used by this block.

### 4. Event wiring — "Mark reviewed" button handler

Search `downtime-views.js` for the `.proc-response-review-btn` click handler (likely in the `wireProcessingMode` or similar wiring function). Remove it.

### 5. Event wiring — "Copy context" button in ST Response header

The ST Response block had a "Copy context" button (`.proc-st-response-copy`). Find and remove its click handler.

### 6. Event wiring — ST Response textarea save

The ST Response textarea (`.proc-st-response-textarea`) has a save-on-blur or explicit save via `.proc-st-response-save` button. Remove both handlers.

---

## What to Preserve

- `st_response`, `response_author`, `response_status`, `response_reviewed_by` data fields — leave in the data model; DT Story may read them
- All other action panel content (pool, roll, status, ST notes, player feedback) — unchanged
- Merit and sorcery panels — they have no ST Response block; no changes needed there

---

## Acceptance Criteria

1. No ST Response textarea, Save button, or "Drafted by" badge appears in any DT Processing action panel.
2. No "Mark reviewed" / "Reviewed by" label appears in DT Processing.
3. Project and feeding action panels still show: pool, roll card, status buttons, ST notes, player feedback.
4. No JS errors from orphaned event handler references.
5. DT Story tab is unaffected.

---

## Tasks / Subtasks

- [x] Task 1: Remove ST Response HTML block from action detail panel (~line 6604)
- [x] Task 2: Remove response review section from `_renderProjRightPanel` (~line 5456)
- [x] Task 3: Remove response review section from `_renderFeedRightPanel` (~line 5698)
- [x] Task 4: Remove orphaned variable declarations in both right panel functions
- [x] Task 5: Remove `.proc-response-review-btn` click handler
- [x] Task 6: Remove `.proc-st-response-copy` click handler
- [x] Task 7: Remove `.proc-st-response-textarea` blur handler and `.proc-st-response-save` click handler
- [x] Task 8: Manual verification — open project action, confirm no ST Response block; confirm pool/status/notes remain

---

## Dev Notes

### Search terms to find all call sites

```
proc-st-response
proc-response-review
proc-st-response-copy
proc-st-response-save
proc-response-reviewed-label
response_reviewed_by    ← only remove UI references; keep data model usages
```

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Remove HTML blocks + event handlers (all changes in this file) |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |
| 2026-04-15 | 1.1 | Implemented — all ST Response UI removed from downtime-views.js | Dev agent |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- Removed ST Response block (textarea, Save, Copy context, Drafted by badge) from action detail panel renderActionPanel()
- Removed response review section (Mark reviewed / Reviewed by) from _renderProjRightPanel() and _renderFeedRightPanel()
- Removed all orphaned variable declarations: stResponse, responseStatus, reviewedBy (proj panel); feedResponseStatus, feedReviewedBy, feedStResponse (feed panel); responseAuthor, responseStatus, reviewedBy, stResponse (detail panel)
- Removed all event handlers: proc-st-response-textarea click-stop, proc-st-response-save, proc-st-response-copy (170-line copy-context function), proc-response-review-btn
- Also removed lastAuthor / proc-row-author from collapsed queue row (part of same feature.66 UI)
- Data model fields (response_author, response_status, response_reviewed_by) preserved — only UI references removed
- Grep confirms zero remaining class references; checklist use of response_status at line 7385 preserved correctly

### File List
- `public/js/admin/downtime-views.js`
