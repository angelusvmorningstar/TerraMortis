---
id: hotfix.47
issue: 47
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/47
branch: angelus/issue-47-save-draft-indicator
status: done
priority: critical
depends_on: []
labels: [bug, cycle-blocker, dt-form]
---

# Story hotfix.47 — Remove redundant Save Draft button; surface live auto-save indicator

As a player filling in the DT form,
I should see continuous feedback on whether my responses are saving,
So that I don't experience data-loss anxiety during a live cycle.

---

## Context

`saveDraft()` in `public/js/tabs/downtime-form.js` is the backbone — it POSTs/PUTs to `/api/downtime_submissions` and writes status text to `#dt-save-status`. Auto-save runs on a 2s debounce via `scheduleSave()`. The explicit Save Draft button (`#dt-btn-save`) is therefore redundant.

The status indicator (`#dt-save-status`) already exists at line 1810, next to the submission badge. The current writes to it are:

| State | Current text | Gap |
|-------|-------------|-----|
| In-flight | *(nothing)* | Missing "Saving…" |
| Success | `"Saved"` — clears after 2s | Should show timestamp and persist |
| Error | `"Save failed: <reason>"` | Fine |
| Cycle closed | `"Cycle closed; submission locked"` | Fine |
| No active cycle | `"No active cycle — contact your ST"` | Fine |

ADR-003 Q12 specifies option (a): remove the button, keep the indicator.

### Files in scope

- `public/js/tabs/downtime-form.js` only:
  - Line 1947: remove the Save Draft button from the render
  - Line 1812: remove the static "Your responses auto-save as you type." text (replaced by live indicator)
  - Line 818: add `statusEl.textContent = 'Saving…'` before the try block
  - Line 856-857: change success write from `'Saved'` (clears after 2s) to `'Saved ' + HH:MM` (persists)

### Files NOT in scope

- `scheduleSave()` — behaviour unchanged
- localStorage mirror (`_clearLocalSnapshot`) — DTU-2 safety net, do not touch
- Any other file — this is a render + status-text change only

---

## Acceptance Criteria

**Given** the form renders
**When** a player views the actions area
**Then** no Save Draft button is visible.

**Given** a player makes a change (triggering auto-save)
**When** `saveDraft()` begins its API call
**Then** `#dt-save-status` shows `"Saving…"`.

**Given** the save completes successfully
**When** `saveDraft()` resolves
**Then** `#dt-save-status` shows `"Saved HH:MM"` (local time, 24h, e.g. `"Saved 14:23"`) and does not clear automatically.

**Given** the save fails
**When** `saveDraft()` rejects
**Then** `#dt-save-status` shows `"Save failed: <reason>"` and persists until the next save attempt.

**Given** the cycle is closed (423)
**When** `saveDraft()` catches the error
**Then** `#dt-save-status` shows `"Cycle closed; submission locked"` (unchanged).

**Given** the static "Your responses auto-save as you type." text
**When** the form renders
**Then** it is removed (the live indicator replaces it).

**Given** the localStorage mirror (DTU-2)
**When** any save occurs
**Then** the mirror behaviour is unchanged.

---

## Implementation Notes

### Timestamp helper

```js
function _saveTimestamp() {
  const now = new Date();
  return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
}
```

Place near the top of `saveDraft()` or as a module-level helper.

### saveDraft() changes (line 817 area)

```js
async function saveDraft() {
  const statusEl = document.getElementById('dt-save-status');
  if (!currentCycle) {
    if (statusEl) statusEl.textContent = 'No active cycle — contact your ST';
    return;
  }
  if (currentCycle._id === 'dev-stub') {
    if (statusEl) statusEl.textContent = '[Dev] Save skipped';
    return;
  }
  if (statusEl) statusEl.textContent = 'Saving…';   // ← ADD THIS
  // ... rest of function unchanged ...
  // success:
  if (statusEl) statusEl.textContent = 'Saved ' + _saveTimestamp();  // ← CHANGE (remove the setTimeout clear)
```

Remove the `setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000)` line entirely.

### Render changes

- Line 1947: delete `h += '<button class="qf-btn qf-btn-save" id="dt-btn-save">Save Draft</button>';`
- Line 1812: delete `h += '<p class="qf-intro">Your responses auto-save as you type.</p>';`

### Button event listener

After removing the render, search for the click handler wired to `#dt-btn-save` and remove it too. Check around line 2804 (referenced in issue body).

---

## Test Plan

- Static review: button render line deleted, "Saving…" added, timestamp format correct, setTimeout clear removed
- Browser smoke:
  - Open any character's DT form
  - Make a field change — confirm "Saving…" appears then "Saved HH:MM"
  - Confirm no Save Draft button visible
  - Confirm no "Your responses auto-save as you type." text

---

## Definition of Done

- [x] Save Draft button removed from render
- [x] Static auto-save text removed
- [x] `#dt-save-status` shows "Saving…" during in-flight save
- [x] `#dt-save-status` shows "Saved HH:MM" on success (persists)
- [x] Error and cycle-closed states unchanged
- [x] localStorage mirror unaffected
- [x] Button click listener removed
- [ ] PR opened from `angelus/issue-47-save-draft-indicator` into `dev`
