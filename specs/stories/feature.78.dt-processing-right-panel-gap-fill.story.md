# Story feature.78: Right-Panel Gap Fill (D3)

## Status: ready-for-dev

## Story

**As an** ST processing downtimes,
**I want** the merit, sorcery, and feeding right-panels to have the same completeness as the project right-panel,
**so that** the coding interface is consistent across all action types.

## Background

Audit result — right-panel section inventory:

| Section | Merit | Project | Sorcery | Feeding |
|---------|:-----:|:-------:|:-------:|:-------:|
| Pool modifiers | ✅ | ✅ | ✅ | ✅ |
| Success modifier ticker | — | ✅ | — | — |
| Roll toggles (Rote/9A/8A) | — | ✅ | — | — |
| Committed pool display | — | ✅ | — | (in builder) |
| Response review (mark reviewed) | — | ✅ | — | — |

This story fills the gaps using shared zone renderers from feature.77 (D2). Depends on feature.77 being merged.

---

## Acceptance Criteria

1. **Merit right-panel** — adds:
   - Success modifier ticker (same as project: `_renderTickerRow` for `proc-succmod`, saves to `rev.succ_mod_manual`)
   - Committed pool display (shows `rev.pool_validated` when set, with a Clear Pool button)
2. **Sorcery right-panel** — adds:
   - Committed pool display (shows base pool + modifiers total when a rite is selected)
3. **Feeding right-panel** — adds:
   - Response review section (Mark reviewed button matching project panel pattern, saves `rev.response_status: 'reviewed'`)
4. All new sections use the same CSS classes as the corresponding project panel sections — no new class names introduced unless genuinely necessary.
5. All new fields save via `saveEntryReview` to the appropriate review object.
6. No existing sections are removed or reordered.

---

## Tasks / Subtasks

- [ ] Task 1: Merit right-panel — success modifier + committed pool
  - [ ] Add `_renderTickerRow(key, 'Success adj.', 'proc-succmod', succStr, succMod)` after equipment modifier
  - [ ] Add committed pool display block (copy from `_renderProjRightPanel`, adapting to merit's `pool_validated`)
  - [ ] Wire success modifier ticker events (follow project panel pattern: `proc-succmod-dec`, `proc-succmod-inc`)

- [ ] Task 2: Sorcery right-panel — committed pool display
  - [ ] After the roll card, add a committed pool display: `Pool: [attr] + [skill] + [disc] + modifiers = [total] dice`
  - [ ] Only show when a rite is selected and pool is calculable

- [ ] Task 3: Feeding right-panel — response review section
  - [ ] After the vitae tally panel, add response review section matching `_renderProjRightPanel`:
    ```html
    <div class="proc-response-review-section">
      <button class="dt-btn proc-response-review-btn" ...>Mark reviewed</button>
    </div>
    ```
  - [ ] Wire `proc-response-review-btn` for feeding entries: saves `rev.response_status: 'reviewed'`

- [ ] Task 4: Manual verification
  - [ ] Merit: set success modifier — confirm ticker works, value persists
  - [ ] Merit: validate pool — confirm committed pool display appears
  - [ ] Sorcery: select rite — confirm committed pool shows
  - [ ] Feeding: click Mark reviewed — confirm status saves

---

## Dev Notes

### Success modifier events (reference — project panel)

Search `proc-succmod-dec` and `proc-succmod-inc` in event delegation for the existing pattern. The merit panel must wire the same events to the same handlers, or the handlers need to be generalised to detect source from `entry.source`.

### Feeding response_status

Feeding uses `feeding_review.response_status`. The mark-reviewed button saves:
```js
saveEntryReview(entry, { response_status: 'reviewed', response_reviewed_by: currentUserName() })
```

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Modify `_renderMeritRightPanel`, `_renderSorceryRightPanel`, `_renderFeedRightPanel` |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (bmad-agent-sm) |
