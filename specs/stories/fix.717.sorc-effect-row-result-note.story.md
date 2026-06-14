---
title: 'Sorcery Details card: Effect row wrongly shows ST Mechanical Result note'
type: 'fix'
issue: 717
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/717
branch: ms/issue-717-sorc-effect-row-result-note
created: '2026-06-14'
status: done
recommended_model: 'sonnet — single-line logic inversion in one file; small scope'
context:
  - public/js/admin/downtime-views.js
---

## Intent

**Problem:** When an ST types anything into the Mechanical Result textarea on a sorcery
action card, that text bleeds into two additional places it should not appear:
1. The **Details card > Effect row** (meant to show the rite's canonical rules description)
2. The **red banner** at the top of the card (intended — this one is correct)

The Effect row and the Mechanical Result textarea both display the same `ritual_result_note`
value. That field is the ST's working outcome note for *this casting* and should only appear
in the textarea and banner — not in the rite description area.

**Root cause:** `_effectVal` (line 9481) prioritises `ritual_result_note` over the rite's
canonical description from `_getRulesDB()`:

```js
// CURRENT (wrong priority):
const _effectVal = rev.ritual_result_note
  || (_getRulesDB() || []).find(r => r.category === 'rite' && r.name === riteVal)?.description
  || '';
```

The intent was "show rite description, fall back gracefully when DB has no description."
Instead `ritual_result_note` — a mutable ST working note — overwrites the DB description.

---

## Root cause file

| File | Lines | Role |
|------|-------|------|
| `public/js/admin/downtime-views.js` | 9481–9485 | `_effectVal` priority; Effect row in Details card |
| `public/js/admin/downtime-views.js` | 9251 | Banner (reads `ritual_result_note` — correct, no change) |
| `public/js/admin/downtime-views.js` | 9855–9858 | Mechanical Result textarea (reads `ritual_result_note` — correct, no change) |

---

## Tasks

### T1 — Fix `_effectVal` priority [x]

In `public/js/admin/downtime-views.js` at line 9481, replace:

```js
const _effectVal = rev.ritual_result_note
  || (riteVal ? (_getRulesDB() || []).find(r => r.category === 'rite' && r.name === riteVal)?.description : '')
  || '';
```

with:

```js
const _effectVal =
  (riteVal ? (_getRulesDB() || []).find(r => r.category === 'rite' && r.name === riteVal)?.description : '')
  || '';
```

`ritual_result_note` is removed entirely from `_effectVal`. The Effect row now shows the
rite's canonical DB description when one exists, and is absent when no DB description is
found. The banner (line 9251) and Mechanical Result textarea (line 9858) are **not touched**
— they continue to read `rev.ritual_result_note` directly.

### T2 — Verify both traditions

After the fix, open a sorcery action in DT processing for:
- A Cruac rite that has a description in `_getRulesDB()` → Effect row shows DB description
- A Theban rite that has a description in `_getRulesDB()` → Effect row shows DB description
- A rite with no DB description → Effect row absent (no empty label rendered)
- Type text into Mechanical Result → text does NOT appear in Effect row; banner and textarea still show it

---

## Acceptance criteria

- [x] Typing text into the Mechanical Result textarea does NOT cause that text to appear in the Details > Effect row
- [x] The Details > Effect row shows the rite's canonical description from the rules DB when one exists
- [x] The Details > Effect row is absent (not rendered) when the rules DB has no description for that rite
- [x] The red banner at top still shows `ritual_result_note` when set
- [x] Existing complete sorcery actions are visually unaffected

---

## Dev Agent Record

### Files changed
- `public/js/admin/downtime-views.js` — lines 9481-9483: removed `rev.ritual_result_note` from `_effectVal`; now reads only from rules DB description

### Completion notes
Removed `ritual_result_note` from `_effectVal` priority chain. `_effectVal` now derives solely from the rite's canonical `description` field in `_getRulesDB()`. The banner (line 9251) and Mechanical Result textarea (line 9858) are unchanged — they still read `rev.ritual_result_note` directly. Change is 3 lines, no new logic.

---

## Guardrails

- **Only `_effectVal` changes** — do not touch lines 9251 or 9858. The banner and textarea behaviour is correct.
- This is a three-line deletion; no new logic, no new fields, no DB writes.
- The open question from the issue ("should `_effectVal` fall back to `sorc_notes` or player description?") is **out of scope** — leave it as empty-string fallback for now.
