# Story DT-Fix-6: Feeding Action Row Labels — Expand Shorthand

## Status: ready-for-dev

## Story

**As an** ST scanning the action queue,
**I want** feeding action collapsed rows to show an expanded, meaningful label,
**so that** I can identify each character's feeding method at a glance without expanding the row.

## Background

Collapsed feeding queue rows currently display the terse `FEED_METHOD_LABELS_MAP` label: "Other", "Intimidation", "Stalking". These are single-word shorthand values. For "Other" especially, the method is meaningless without the player's actual description.

The player's feeding method description is stored in the submission and should be used to enrich the collapsed row label.

---

## Relevant Code

**File:** `public/js/admin/downtime-views.js`

**Label map** (~lines 118–121 and ~976):
```js
const FEED_METHOD_LABELS_MAP = {
  seduction: 'Seduction', stalking: 'Stalking', force: 'By Force',
  familiar: 'Familiar Face', intimidation: 'Intimidation', other: 'Other',
};
```

**Where used in queue row** (~line 1856):
```js
const methodLabel = feedMethod ? (FEED_METHOD_LABELS_MAP[feedMethod] || feedMethod) : '';
```

**Player's description** (~line 1848):
```js
const feedDesc = sub._raw?.feeding?.method || resp['feeding_description'] || '';
```

---

## Required Change

In the queue row builder, build the feeding label as:

```js
let methodLabel = '';
if (feedMethod) {
  const baseLabel = FEED_METHOD_LABELS_MAP[feedMethod] || feedMethod;
  if (feedMethod === 'other' && feedDesc) {
    methodLabel = feedDesc;                         // show player's description for "other"
  } else if (feedDesc && feedDesc !== baseLabel) {
    methodLabel = `${baseLabel} — ${feedDesc}`;     // append description for known methods
  } else {
    methodLabel = baseLabel;                        // fall back to map label
  }
}
```

**Truncation guard:** The collapsed row has limited width. Truncate `feedDesc` at 40 characters with `…`:

```js
const truncDesc = feedDesc.length > 40 ? feedDesc.slice(0, 40) + '…' : feedDesc;
```

Apply `truncDesc` in the label construction above instead of raw `feedDesc`.

---

## Data field precedence

Check both `sub._raw?.feeding?.method` and `resp['feeding_description']` — use whichever is non-empty. The submission shape differs between DT1 (CSV) and DT2+ (app form):
- DT1: method description is in `proj.detail` blob, not directly accessible here — fall back to base label
- DT2+: description in `feeding_description` response field

---

## Acceptance Criteria

1. Feeding rows where method is "other" show the player's description (truncated at 40 chars) instead of "Other".
2. Feeding rows where method is a known type (seduction, stalking, etc.) show `{Type} — {description}` if a description is present, or just `{Type}` if not.
3. Feeding rows without any description show the existing base label unchanged.
4. Label does not overflow the collapsed row width (truncation at 40 chars).
5. No regression on non-feeding action row labels.

---

## Tasks / Subtasks

- [ ] Task 1: Confirm where `feedDesc` is read in the queue builder (~line 1848)
- [ ] Task 2: Update `methodLabel` construction logic
- [ ] Task 3: Add truncation guard
- [ ] Task 4: Verify with a real cycle — feeding rows show enriched labels
- [ ] Task 5: Verify non-feeding rows unchanged

---

## Dev Notes

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Update `methodLabel` construction in queue row builder (~line 1856) |

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
