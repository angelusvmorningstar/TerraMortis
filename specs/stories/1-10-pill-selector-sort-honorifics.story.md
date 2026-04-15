# Story 1.10: Pill Selector — Alphabetical Sort + No Honorifics

## Status: ready-for-dev

## Story

**As an** ST working in the DT Story tab,
**I want** the character pill selector to be sorted alphabetically by player name and to show no honorific prefix,
**so that** I can find characters quickly by name without scanning through titles.

## Background

The DT Story nav rail (`renderNavRail()` in `downtime-story.js`) currently:
- Renders pills in the order `_allSubmissions` is returned from the API — effectively arbitrary
- Uses `displayName(char)` for each pill label, which prepends the honorific (e.g. "Regent Alice Vunder", "Sir Knight Charlie Ballsack", "Hierophant Anichka")

The fix is two lines in `renderNavRail()`:
1. Sort by `char.name` (the legal name field, ignoring moniker) before iterating
2. Change the label to `char.moniker || char.name` — no honorific, same as `sortName()` but with original case preserved

---

## Current Code

**File:** `public/js/admin/downtime-story.js`
**Function:** `renderNavRail()` (~line 580)

```js
function renderNavRail() {
  if (!_allSubmissions.length) {
    return '<div class="dt-story-empty">No submissions for this cycle.</div>';
  }

  let h = '';
  for (const sub of _allSubmissions) {           // ← no sort
    const char = getCharForSub(sub);
    const name = char ? displayName(char) : 'Unknown';  // ← includes honorific
    const state = getNavPillState(sub);
    const stateClass = state ? ` ${state}` : '';
    const charId = sub.character_id || sub._id;
    h += `<button class="dt-story-pill${stateClass}" data-char-id="${charId}" data-sub-id="${sub._id}">`;
    h += name;
    if (state) h += `<span class="dt-story-pill-dot"></span>`;
    h += `</button>`;
  }
  return h;
}
```

**Character lookup** (`getCharForSub`, line ~517):
```js
function getCharForSub(sub) {
  if (!sub) return null;
  return _allCharacters.find(c => c._id === sub.character_id) || null;
}
```

---

## Required Changes

### `public/js/admin/downtime-story.js` — `renderNavRail()`

```js
function renderNavRail() {
  if (!_allSubmissions.length) {
    return '<div class="dt-story-empty">No submissions for this cycle.</div>';
  }

  // Sort by legal name (c.name), ignoring moniker and honorific
  const sorted = [..._allSubmissions].sort((a, b) => {
    const ca = getCharForSub(a);
    const cb = getCharForSub(b);
    const na = ca ? ca.name.toLowerCase() : '';
    const nb = cb ? cb.name.toLowerCase() : '';
    return na.localeCompare(nb);
  });

  let h = '';
  for (const sub of sorted) {
    const char = getCharForSub(sub);
    const name = char ? (char.moniker || char.name) : 'Unknown';  // no honorific
    const state = getNavPillState(sub);
    const stateClass = state ? ` ${state}` : '';
    const charId = sub.character_id || sub._id;
    h += `<button class="dt-story-pill${stateClass}" data-char-id="${charId}" data-sub-id="${sub._id}">`;
    h += name;
    if (state) h += `<span class="dt-story-pill-dot"></span>`;
    h += `</button>`;
  }
  return h;
}
```

**Changes:**
- `[..._allSubmissions].sort(...)` — shallow copy sorted by `char.name.toLowerCase()`; `localeCompare` handles diacritics (René, Dominique) correctly
- `char.moniker || char.name` — strips honorific; uses moniker if set, otherwise legal name; matches what the player would recognise as their character's name
- `displayName` import is still used elsewhere in the file — do not remove it

---

## Sort key rationale

| Option | Behaviour | Problem |
|---|---|---|
| `displayName(c)` | Sorts by "Regent Alice…", "Sir Knight…" | Honorifics dominate the sort |
| `sortName(c)` = `moniker \|\| name` | Sorts by "Mac", "Wan Yelong" | Monikers inconsistently set; harder to find by legal name |
| `c.name` | Sorts by "Alice Vunder", "Wan Yelong" | **Chosen** — predictable, matches how STs think of players |

---

## Acceptance Criteria

1. Character pills render in alphabetical order by `c.name` (case-insensitive).
2. Pill labels show no honorific — display is `char.moniker || char.name`.
3. Characters without a moniker show their legal `name`.
4. Characters with diacritics in their name (René, Dominique) sort correctly relative to non-accented names.
5. The sort does not mutate `_allSubmissions` — a copy is sorted, the original array is unchanged.
6. State classes (green/amber dot) still render correctly on sorted pills.
7. Clicking a pill still selects the correct character (data-char-id remains correct).

---

## Tasks / Subtasks

- [ ] Task 1: Update `renderNavRail()` in `downtime-story.js`
  - [ ] Replace `for (const sub of _allSubmissions)` with sorted copy iteration
  - [ ] Replace `displayName(char)` label with `char.moniker || char.name`

- [ ] Task 2: Manual verification
  - [ ] Open DT Story tab with an active cycle
  - [ ] Confirm pills are alphabetically sorted by legal name (not moniker, not honorific)
  - [ ] Confirm no honorific appears on any pill
  - [ ] Confirm clicking each pill loads the correct character's sections
  - [ ] Confirm green/amber state dots still appear correctly

---

## Dev Notes

### Do not remove the `displayName` import

`displayName` is imported at the top of `downtime-story.js` and used elsewhere in the module (character section headers, etc.). Only the pill label call site changes.

### `_allSubmissions` must not be mutated

The sort uses `[..._allSubmissions]` (spread copy). `_allSubmissions` is referenced by other functions (e.g. `selectCharacter`) and must remain in its original API-returned order.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-story.js` | Modify `renderNavRail()` — sort copy, change label |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Debug Log References
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-story.js`
