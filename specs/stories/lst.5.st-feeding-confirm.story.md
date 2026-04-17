# Story: ST Feeding Confirm + Influence Spend Display

**Story ID:** lst.5
**Epic:** Live Session Toolkit — Game App QoL
**Status:** ready-for-dev
**Date:** 2026-04-18
**Blocked by:** lst.3 (tracker migration must be complete first)

---

## User Story

As an ST reviewing a player's feeding roll result, I want a "Confirm Feed" button that writes the vitae total to that player's tracker, and I want to see how much influence they spent last downtime, so I know their starting pool for this session.

---

## Background & Diagnosis

### The player.html feeding tab — DO NOT TOUCH

`public/js/player/feeding-tab.js` is tested and working. It reads the player's declared method from their downtime submission, builds the correct pool, rolls, and displays the result. **This file must not be modified except for the single additive change in Task 1.**

The feeding tab already has an ST/player role check (`isSTRole()` import from `public/js/auth/discord.js`). The new ST confirm button uses this same pattern — visible to STs, hidden from players.

### Tracker state after lst.3

After lst.3 ships, `trackerAdj` from `public/js/game/tracker.js` writes to MongoDB. The confirm button calls this function. If lst.3 is not complete, do not ship this story.

### Influence spend — derivation from downtime submissions

Influence spend is not a stored field on the character. It must be derived from the character's most recently resolved downtime submission.

**What counts as influence spend:** In downtime submissions, influence is spent through sphere/allies actions. The relevant resolved data is in `sub.merit_actions_resolved` — each entry has a `pool` and optional `inf_cost` or similar field.

**Investigation required as part of Task 2:** Query a real resolved submission and inspect `merit_actions_resolved` entries to find where influence spend is recorded. The specific field name must be confirmed before implementing.

Fallback: if no clean "influence spent" field exists, sum the `inf_cost` from all resolved merit actions for the character's last cycle. If that field doesn't exist either, display "N/A" and log the finding for a follow-up story.

---

## Tasks

### Task 1 — Add ST confirm button to feeding tab

In `public/js/player/feeding-tab.js`, in the section that renders the roll result (look for where `feedingState === 'rolled'` is handled and the result display is built):

Add an ST-only confirm panel after the result display. This should only render when `isSTRole()` returns true.

```js
// ST-only confirm section — renders after roll result
if (isSTRole()) {
  h += `<div class="feed-st-confirm">`;
  h += `<div class="feed-st-confirm-lbl">Confirm vitae gained:</div>`;
  h += `<div class="feed-confirm-controls">`;
  h += `<button class="feed-adj" onclick="feedConfirmAdj(-1)">−</button>`;
  h += `<span class="feed-confirm-val" id="feed-confirm-n">${safeVitae}</span>`;
  h += `<button class="feed-adj" onclick="feedConfirmAdj(1)">+</button>`;
  h += `</div>`;
  h += `<button class="feed-confirm-btn" onclick="feedConfirmApply()">Confirm Feed</button>`;
  h += `</div>`;
}
```

**Add `feedConfirmAdj()` and `feedConfirmApply()` functions** (ST-only, not exposed to players):

```js
function feedConfirmAdj(d) {
  const el = document.getElementById('feed-confirm-n');
  if (!el) return;
  el.textContent = Math.max(0, (parseInt(el.textContent) || 0) + d);
}

async function feedConfirmApply() {
  if (!currentChar) return;
  const n = parseInt(document.getElementById('feed-confirm-n').textContent) || 0;
  if (n === 0) return;
  const charId = String(currentChar._id);
  await trackerAdj(charId, 'vitae', n);
  // Visual feedback — disable button after confirm
  const btn = document.querySelector('.feed-confirm-btn');
  if (btn) { btn.textContent = 'Confirmed ✓'; btn.disabled = true; }
}
```

**Add import** for `trackerAdj` from `public/js/game/tracker.js`:
```js
import { trackerAdj } from '../game/tracker.js';
```

### Task 2 — Investigate influence spend field in resolved submissions

Query `GET /api/downtime_submissions` and inspect a resolved submission's `merit_actions_resolved` array. Find what field (if any) records influence spent per action.

**Possible fields to check:**
- `rev.inf_spent`
- `rev.inf_cost`
- `rev.pool?.inf`
- A field in `action_responses` keyed to influence-category merits

Document the finding. If a clean field exists, proceed to Task 3. If not, render "N/A — see ST notes" and create a follow-up story.

### Task 3 — Display influence spend in ST confirm panel

Once the influence spend field is confirmed, add a read-only display to the ST confirm panel:

```js
// After the confirm button:
h += `<div class="feed-inf-display">`;
h += `<span class="feed-inf-lbl">Influence spent last cycle:</span>`;
h += `<span class="feed-inf-val" id="feed-inf-spent">Loading…</span>`;
h += `</div>`;
```

Load the value asynchronously after the panel renders:

```js
async function loadInfluenceSpend(charId) {
  try {
    const subs = await apiGet('/api/downtime_submissions');
    // Find most recently resolved submission for this character
    const resolved = subs
      .filter(s => String(s.character_id) === charId && s.merit_actions_resolved?.length)
      .sort((a, b) => String(b._id) > String(a._id) ? 1 : -1)[0];
    if (!resolved) { document.getElementById('feed-inf-spent').textContent = '0'; return; }
    // Sum influence spend across all resolved merit actions
    const total = (resolved.merit_actions_resolved || [])
      .reduce((sum, rev) => sum + (rev.inf_spent || rev.inf_cost || 0), 0);
    document.getElementById('feed-inf-spent').textContent = String(total);
  } catch {
    document.getElementById('feed-inf-spent').textContent = 'N/A';
  }
}
```

Call `loadInfluenceSpend(String(currentChar._id))` after the ST panel renders.

---

## Acceptance Criteria

- [ ] After a feeding roll, the ST sees a "Confirm Feed" panel with an adjustable vitae count defaulting to the safe vitae total
- [ ] Tapping "Confirm Feed" writes the vitae value to MongoDB via `trackerAdj` (requires lst.3 complete)
- [ ] The button shows "Confirmed ✓" and disables after confirming — prevents double-apply
- [ ] The confirm panel is invisible to players (hidden when `isSTRole()` returns false)
- [ ] The ST confirm panel shows "Influence spent last cycle: N" derived from the most recent resolved downtime submission
- [ ] If no resolved submission exists, shows "0" for influence spend
- [ ] The existing player-facing feeding flow (roll display, method display, pool expression) is completely unchanged

---

## Files to Change

| File | Change |
|---|---|
| `public/js/player/feeding-tab.js` | Add ST-only confirm panel + `feedConfirmAdj`/`feedConfirmApply` functions + `loadInfluenceSpend`; add `trackerAdj` import |

---

## Critical Constraints

- **`feeding-tab.js` existing logic is untouchable** — only add new ST-only code. Do not modify `feedingState` transitions, pool-building, roll logic, or player-facing HTML.
- **`isSTRole()` is already imported** in `feeding-tab.js` — use it as the guard for all new ST elements.
- **`trackerAdj` is async after lst.3** — `feedConfirmApply()` must be async and await the call.
- **lst.3 must be complete** — if tracker state is still localStorage, the confirm button will write to localStorage only (device-local). Do not ship this story until lst.3 is done.
- **Influence spend is read-only** — this story does not write influence anywhere. It only reads the last-cycle spend from downtime submissions for display purposes.
- **British English:** "Vitae", "Influence", "Confirm Feed", "Confirmed".

---

## Reference

- SSOT: `specs/reference-data-ssot.md`
- Tracker write: `trackerAdj` from `public/js/game/tracker.js` (after lst.3)
- Influence SSOT: derived from `downtime_submissions` collection — `merit_actions_resolved` array
- Blocked by: lst.3
- Auth guard: `isSTRole()` from `public/js/auth/discord.js`
