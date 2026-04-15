# Story DT-Fix-8: Validator Chip Redesign

## Status: ready-for-dev

## Story

**As an** ST reviewing a processed action,
**I want** the validator chip to show the validator's name inside the chip in `[Validated · name]` format,
**so that** I can see at a glance who validated the pool without the external label breaking line height.

## Background

When an action's pool has been validated, a chip or label currently renders in the format `[Validated] vonvagabond` — the badge and name are visually separate, and the name (currently the drafter, not the pool validator) sits outside the chip element. This is both visually inconsistent and semantically wrong (it shows the drafter name; what we want is who validated the pool).

The fix: consolidate into a single `[Validated · name]` chip with the validator's name inside.

---

## Investigation Required

The exact chip rendering location needs to be confirmed. Search `downtime-views.js` for:

```
proc-response-reviewed-label
Reviewed by
validated.*by
validator
pool_validated_by
```

There are two possible locations:
1. **Right panel validation section** — after `_renderValStatusButtons`, when status is `validated`, a chip may render the last ST who set the status
2. **ST Response review section** — `proc-response-reviewed-label` shows `"Reviewed by {name}"` in `_renderProjRightPanel` and `_renderFeedRightPanel`

**Note:** If the chip is part of the ST Response review section, it will be removed by DT-Fix-7. Confirm with SM before implementing.

If the chip is in the pool validation area (separate from the ST Response block), proceed with the redesign below.

---

## Current HTML (once located)

Expected current pattern:
```html
<div class="proc-response-reviewed-label">Reviewed by vonvagabond</div>
```
or:
```html
<span class="some-badge">Validated</span> vonvagabond
```

---

## Target HTML

```html
<div class="proc-validated-chip">[Validated · vonvagabond]</div>
```

or using a styled span for the name:
```html
<div class="proc-validated-chip">Validated · <span class="proc-chip-name">vonvagabond</span></div>
```

---

## Data Field

The name shown should be whoever validated the pool — check for a `pool_validated_by` field on the review object, or the ST who last changed `pool_status` to `validated`. If no such field exists:

1. Add `pool_validated_by: currentUser` to the `saveEntryReview` patch when `pool_status === 'validated'`
2. Read it back for chip rendering

If the current chip already reads from `response_reviewed_by` and that's the drafter — this is the bug. Switch to `pool_validated_by` (add to data model if needed).

---

## CSS

Add to `admin-layout.css`:

```css
.proc-validated-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--surf3);
  color: var(--txt2);
  line-height: 1.4;
}
```

Chip must be left-aligned (no `margin: auto` or `justify-content: center` on parent).

---

## Acceptance Criteria

1. Validated actions show a chip reading `[Validated · {validator_name}]`.
2. The validator name is the ST who set pool_status to validated (not the drafter).
3. The chip is left-aligned in the panel.
4. The chip does not break adjacent line heights.
5. If DT-Fix-7 has shipped, the `proc-response-reviewed-label` / "Mark reviewed" elements are already gone — confirm no orphan.

---

## Tasks / Subtasks

- [ ] Task 1: Locate the chip rendering in `downtime-views.js` (search terms above)
- [ ] Task 2: Confirm it is in the pool validation section (not ST Response section)
- [ ] Task 3: Check if `pool_validated_by` field exists; add to save patch if missing
- [ ] Task 4: Redesign chip HTML to `[Validated · name]` format
- [ ] Task 5: Add `.proc-validated-chip` CSS
- [ ] Task 6: Verify chip renders correctly, left-aligned, correct name

---

## Dev Notes

### Dependency

This story may partially overlap with DT-Fix-7 (Remove ST Response). Implement DT-Fix-7 first if possible to avoid touching the same blocks.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Locate + redesign chip HTML; add `pool_validated_by` to save patch |
| `public/css/admin-layout.css` | Add `.proc-validated-chip` styles |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
