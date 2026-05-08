# Story issue-230: DT form shows wrong character's regency on hard refresh

Status: ready-for-dev

issue: 230
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/230
branch: morningstar-issue-230-dt-form-init-char-mismatch

---

## Story

As a player or ST opening the suite app after a hard refresh,
When I navigate to the Downtime tab,
I should see the DT form for the character shown selected in the sidebar dropdown,
so that the visual dropdown selection and the rendered DT content are always in sync.

---

## Acceptance Criteria

**AC-1 — Sidebar dropdown and DT form show the same character after hard refresh**
Given a user hard-refreshes the suite app with a previously saved active character (stored in `localStorage.tm_active_char`),
When they navigate to the Downtime tab,
Then the DT form renders for the character that is visually selected in the sidebar dropdown.

**AC-2 — DT form shows the correct character's regent territory after refresh**
Given Alice is the regent of North Shore and Jack was the last-viewed character before the previous session ended,
When the user hard-refreshes and navigates to the Downtime tab without re-selecting a character,
Then the DT form shows Alice's regent territory (North Shore), not Jack's.

**AC-3 — Re-selecting the same character is not required to see correct data**
Given the user has just hard-refreshed (no manual character re-selection),
When they open the Downtime tab,
Then the rendered DT form matches the dropdown selection without any extra interaction.

---

## Tasks

- [ ] **Task 1 — Call `_buildCharMenu()` after `openChar` in the boot sequence**
  - [ ] In `public/js/app.js`, add a `_buildCharMenu()` call inside the `if (charIdx >= 0)` block (lines 1261-1265), immediately after `openChar(charIdx)` and `pickChar(...)`, so the sidebar dropdown selection reflects the now-active `sheetChar`
  - [ ] Verify the call is inside the guard (`if (charIdx >= 0)`) — no change needed for the no-saved-char path

- [ ] **Task 2 — Manual verification**
  - [ ] Hard-refresh the suite app while Jack is in `localStorage.tm_active_char`
  - [ ] Confirm sidebar dropdown shows Jack (not Alice)
  - [ ] Navigate to Downtime tab — confirm DT form renders for Jack
  - [ ] Switch to a different character via dropdown — confirm DT form updates correctly

---

## Dev Notes

### Root cause

`_buildCharMenu()` is called at `app.js:1243`, **before** the saved-character boot sequence at lines 1256-1265. At the point `_buildCharMenu()` runs, `suiteState.sheetChar` is still `null`, so the sidebar dropdown renders with `activeId = ''` and no `<option>` gets the `selected` attribute.

The browser then defaults to the **first option** — Alice, alphabetically first — as the visual selection.

```js
// app.js:892 inside _buildCharMenu():
const activeId = String(suiteState.sheetChar?._id || '');  // '' because sheetChar is null
// String(c._id) === '' is never true → no option selected → browser picks first
const sel = String(c._id) === activeId ? ' selected' : '';
```

Shortly after, `openChar(charIdx)` at L1263 runs. For a user whose last session viewed Jack, `charIdx` is Jack's index in `editorState.chars` (retrieved from `localStorage.tm_active_char`). `openChar` sets `suiteState.sheetChar = Jack` at its L194.

The dropdown was already rendered. It still shows Alice visually. But `sheetChar` is now Jack.

When the user navigates to the Downtime tab, `goTab('downtime')` at `app.js:426-430` calls `initDowntimeTab(el, _activeMoreChar(), ...)`. `_activeMoreChar()` for STs returns `suiteState.sheetChar || ...`, which is Jack. The DT form renders for Jack, showing Jack's regent territory — while the sidebar dropdown displays Alice as "selected".

Re-selecting Alice from the dropdown triggers `_switchChar(aliceIdx)` which calls `openChar(aliceIdx)` → `sheetChar = Alice`. The DT form then correctly shows Alice's regency (North Shore).

### Fix

Add a single `_buildCharMenu()` call immediately after `openChar` / `pickChar` in the boot sequence, inside the `if (charIdx >= 0)` guard:

```js
// app.js:1261-1265 — CURRENT
if (charIdx >= 0) {
  await ensureTrackerLoaded(editorState.chars[charIdx]);
  openChar(charIdx);
  pickChar(editorState.chars[charIdx]);
}

// AFTER FIX
if (charIdx >= 0) {
  await ensureTrackerLoaded(editorState.chars[charIdx]);
  openChar(charIdx);
  pickChar(editorState.chars[charIdx]);
  _buildCharMenu();  // ← ADD: refresh sidebar to reflect the now-active sheetChar
}
```

`openChar` sets `suiteState.sheetChar` at its line 194 before returning. The second `_buildCharMenu()` call therefore runs with `activeId = Jack._id`, correctly marking Jack's option as `selected`.

The first `_buildCharMenu()` call at L1243 is still needed for two reasons:
1. It sets up the phone-header icon dropdown click handler (`wrap.onclick`) — that part doesn't depend on `activeId`
2. Players with no `localStorage` entry (`charIdx < 0`) still get the correct no-selection state

Do **not** remove the first call at L1243.

### Key code locations

| Location | What | Action |
|----------|------|--------|
| `app.js:1243` | First `_buildCharMenu()` call (sheetChar still null) | Keep — phone icon handler setup |
| `app.js:1261-1265` | `if (charIdx >= 0)` boot block | ADD `_buildCharMenu()` after `openChar` / `pickChar` |
| `app.js:892` | `activeId` computed inside `_buildCharMenu` | No change — reads `suiteState.sheetChar?._id` |
| `app.js:194` | `suiteState.sheetChar = c` inside `openChar` | No change |
| `app.js:426-430` | DT tab handler (`goTab('downtime')`) | No change |

### No test required

This is a DOM ordering / render-sequence fix with no business logic. Manual verification (Task 2) is the appropriate coverage. No Vitest test is warranted.

---

## Dev Agent Record

### Debug Log

### Completion Notes

### File List

### Change Log
