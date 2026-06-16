# Story fix.668: Tracker Should Apply DT influence_spend Deduction at Load Time

## Status: done

---
issue: 668
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/668
branch: ms/issue-668-tracker-dt-influence-spend
---

## Story

**As an** ST opening the game tracker at the start of a new cycle,
**I want** each character's influence current value to reflect their downtime spend,
**so that** the tracker shows realistic starting influence without manual correction.

## Background

`signin-tab.js` already does the right thing: `loadLastCycleData()` fetches the last closed cycle, sums `influence_spend` per character from their DT submission, and computes `infRemaining = infMax - infSpent` for the check-in display. But it only uses this for the check-in row — it never writes to `tracker_state`. When the tracker tab opens, `ensureLoaded()` reads `tracker_state.influence` from MongoDB (which still holds the pre-game max) and ignores what DT said was spent. The fix adds the same reconciliation step to `initTracker`, writing the deducted value back to `tracker_state` via the existing PUT endpoint.

The issue raised the open question: client-side reconcile at tracker load vs. server-side at cycle close. **This story uses the client-side approach**, matching `signin-tab.js`'s existing pattern. Double-apply is prevented by two orthogonal guards (see Dev Notes). No server changes are required.

## Acceptance Criteria

- [ ] Given a character has `responses.influence_spend` totalling N in the most recently closed DT cycle submission, when the ST opens the tracker tab, the character's influence current value is `max − N` (floored at 0)
- [ ] Characters with no DT submission (or zero spend) show influence at their max
- [ ] If the tracker tab is re-opened within the same browser session (or the page is refreshed), the deduction is not applied a second time — influence stays at `max − N`, not `max − 2N`

## Tasks / Subtasks

- [x] Task 1: Add `reconcileInfluenceDT()` to `public/js/game/tracker.js`
  - [x] Declare module-level `const _reconciledCycles = new Set()` alongside the other module-level sets (`_cache`, `_confirmed`, `_expanded`)
  - [x] Implement `async function reconcileInfluenceDT()` — see exact code in Dev Notes
  - [x] Call `await reconcileInfluenceDT()` at the end of `initTracker`, after the `Promise.all(ensureLoaded)` line and before `renderAll()`

- [x] Task 2: Add Playwright tests in `tests/feat-16-17-fix44-tracker-feeding.spec.js`
  - [x] `'tracker reconciles DT influence_spend on load'` — PUT body captured; `trackerPutBody.influence` equals `infMax - spent`
  - [x] `'tracker shows max influence when character has no DT submission'` — no PUT to tracker_state fired for that character
  - [x] `'tracker does not double-apply influence deduction on second tab open'` — reconcile fires once; second `initTracker` call does not fire a second PUT

---

## Dev Notes

### Approach — mirror signin-tab.js

`public/js/game/signin-tab.js:78-122` (`loadLastCycleData`) is the canonical reference. The cycle/submission fetch pattern is identical; only the output destination changes (tracker cache + API write vs. display-only).

### Exact implementation — Task 1

**Add at module level** (alongside `const _cache`, `_confirmed`, `_expanded`):
```js
// Guards against re-applying DT reconciliation for a cycle already processed this session
const _reconciledCycles = new Set();
```

**New function — add before `initTracker`:**
```js
async function reconcileInfluenceDT() {
  try {
    const res = await fetch(`${API_BASE}/api/downtime_cycles`, { headers: authHeaders() });
    if (!res.ok) return;
    const allCycles = await res.json();
    // Match signin-tab.js pattern: sort by game_number, not _id, to handle re-imported cycles
    const lastClosed = (allCycles || [])
      .filter(c => c.status && c.status !== 'open')
      .sort((a, b) => (b.game_number || 0) - (a.game_number || 0))[0] || null;
    if (!lastClosed) return;

    const cycleId = String(lastClosed._id);
    if (_reconciledCycles.has(cycleId)) return;   // already run this session

    const subRes = await fetch(`${API_BASE}/api/downtime_submissions?cycle_id=${cycleId}`, { headers: authHeaders() });
    if (!subRes.ok) { _reconciledCycles.add(cycleId); return; }
    const subs = await subRes.json();

    // Build per-character spend totals (mirrors signin-tab.js:96-104)
    const infSpent = new Map();
    for (const sub of (subs || [])) {
      const charId = String(sub.character_id);
      const raw = sub.responses?.influence_spend;
      if (!raw) continue;
      let obj = null;
      try { obj = JSON.parse(raw); } catch { continue; }
      const total = Object.values(obj).reduce((s, v) => s + Math.abs(Number(v) || 0), 0);
      if (total > 0) infSpent.set(charId, total);
    }

    if (!infSpent.size) { _reconciledCycles.add(cycleId); return; }

    const chars = (suiteState.chars || []).filter(c => !c.retired);
    for (const c of chars) {
      const charId = String(c._id);
      const spent = infSpent.get(charId) || 0;
      if (spent === 0) continue;
      const infMax = calcTotalInfluence(c);
      if (infMax === 0) continue;
      const cs = _cache[charId];
      if (!cs) continue;
      // Between-session guard: if already below max, reconciliation already ran
      // (or ST manually adjusted) — do not overwrite
      if (cs.inf < infMax) continue;
      cs.inf = Math.max(0, infMax - spent);
      saveToApi(charId, { influence: cs.inf });
    }

    _reconciledCycles.add(cycleId);
  } catch (err) {
    console.warn('[tracker] DT influence reconcile failed', err);
  }
}
```

**Modify `initTracker`** — add the call after `ensureLoaded` completes:
```js
export async function initTracker(el) {
  _el = el;
  el.innerHTML = '<div class="dtl-empty">Loading tracker…</div>';
  _confirmed.clear();
  await Promise.all((suiteState.chars || []).filter(c => !c.retired).map(c => ensureLoaded(c)));
  await reconcileInfluenceDT();   // ← ADD THIS LINE
  renderAll();
}
```

### Double-apply guards — why both are needed

**Guard 1 — within-session (module-level `_reconciledCycles` Set):**
`initTracker` is called every time the tracker tab opens (it clears `_confirmed` and re-fetches). Without this guard, opening the tab twice in one session would apply the deduction twice. `_reconciledCycles` is NOT cleared in `initTracker` — it persists until page refresh.

**Guard 2 — between-session (`if (cs.inf < infMax) continue`):**
After a page refresh `_reconciledCycles` is empty again. But `ensureLoaded` will have loaded `remote.influence = infMax - spent` from MongoDB (written by the previous session's reconcile). The `cs.inf < infMax` check sees the already-deducted value and skips — no second write.

The two guards together make all three scenarios safe:
- First session open → reconcile runs, writes `infMax - N`
- Second tab-open same session → `_reconciledCycles` guard fires, skipped
- Page refresh → `cs.inf < infMax` guard fires, skipped

### Why NOT server-side

The issue flags server-side reconciliation at cycle close as "safer against double-application". That was written before this analysis. The client-side approach achieves the same safety with two small guards and zero new API endpoints. Server-side would require: a new endpoint or cycle-close hook, additional auth handling, and a way to trigger it at the right time (currently cycle close is a manual PUT from the admin UI). Client-side is the right call here given `signin-tab.js` already does the same data fetch.

### influence_spend field shape

From `server/schemas/downtime_submission.schema.js:272`, `responses.influence_spend` is a JSON-encoded object: `{ territory_slug: integer }`. Values can be negative (moved, not refunded — still counts as spent). Total = `Object.values(obj).reduce((s, v) => s + Math.abs(Number(v) || 0), 0)`. This matches `signin-tab.js:101-103` exactly.

### API paths used (all already exist)

| Endpoint | Auth | Notes |
|----------|------|-------|
| `GET /api/downtime_cycles` | any authenticated | Returns all cycles |
| `GET /api/downtime_submissions?cycle_id=<id>` | ST gets all; player gets own | Tracker is ST-only context — full submissions visible |
| `PUT /api/tracker_state/:id` | ST | Already used by tracker for all other fields |

### saveToApi is the right write path

`saveToApi(charId, { influence: cs.inf })` is the established pattern for influence writes — matches `trackerAdj` line 224: `saveToApi(charId, { influence: cs.inf })`. It:
1. Updates `_cache[charId]` immediately (optimistic update)
2. Calls `markLocalWrite(charId, fields)` to suppress WS echo of own writes
3. Does the PUT in the background (silent fail — cache stays valid)

Do NOT use raw `fetch()` for the write — use `saveToApi`.

### Pre-existing pattern in signin-tab.js

`public/js/game/signin-tab.js:78-122` — the full `loadLastCycleData()` function. It uses the identical cycle + submission fetch pattern and identical spend calculation. The only difference is it stores to `_infSpentByCharId` Map for display; this story stores to `_cache` and writes to the API.

### Not in scope

- WP spend tracking (issue #669)
- Feeding vitae reconciliation (already handled in `signin-tab.js`, not needed in tracker)
- The `influence_reconciled_cycle_id` marker on `tracker_state` (not needed given the two guards above)

---

## File List

- `public/js/game/tracker.js` — MODIFY (add `_reconciledCycles` Set, `reconcileInfluenceDT()`, call in `initTracker`)
- `tests/feat-16-17-fix44-tracker-feeding.spec.js` — MODIFY (add 3 reconcile tests)

## Change Log

- 2026-06-10: Story created from issue #668 diagnostic
- 2026-06-10: Implemented — `reconcileInfluenceDT()` added to tracker.js; 3 Playwright tests added; 39/39 passing
