---
issue: 536
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/536
branch: morningstar-issue-535-536-dt-gate-autoopen
depends_on: fix.535
---

# Story fix.536: Auto-Open Date field broken end-to-end (persist, gate, countdown)

## Status: review

## Issue
[#536](https://github.com/angelusvmorningstar/TerraMortis/issues/536) — Auto-open date field broken: doesn't persist, form ignores it, no countdown shown

## Branch
`morningstar-issue-535-536-dt-gate-autoopen` (combined with [fix.535](fix.535.dt4-player-sees-closed.story.md) — both edit `renderCycleGatePage()`)

---

## Story

**As an** ST preparing a downtime cycle,
**I want** the Auto-Open Date/Time field to persist, to actually open the form for players when it passes, and to show players a countdown beforehand,
**so that** I can schedule a downtime to open without having to be online to click the manual override at the exact moment.

---

## Background

The DT Prep panel has an **Auto-Open Date/Time** field (`auto_open_at` on the cycle document) intended to let the ST schedule when player submissions open, without needing to manually click the override button. `downtime-tab.js` already consumes it correctly (`autoOpenPassed` feeds `canAccess` at line 51, and a countdown card renders at lines 67–83). But the feature is broken end-to-end in **three** ways. All three were verified against live code on this branch.

This story stacks on **fix.535** (same branch, same `renderCycleGatePage()` function). fix.535 ships first or together; this story layers the auto-open countdown precedence on top of fix.535's prep message.

### DEFECT 1 — Field doesn't persist after save (stale closure)

`public/js/admin/downtime-views.js:2671-2677`:

```js
document.getElementById('dt-auto-open-input')?.addEventListener('change', async e => {
  const val = e.target.value;
  await updateCycle(cycle._id, { auto_open_at: val ? new Date(val).toISOString() : null });
  const idx = allCycles.findIndex(c => c._id === cycle._id);
  if (idx >= 0) allCycles[idx].auto_open_at = val ? new Date(val).toISOString() : null;
  renderPhaseRibbon(allCycles[idx] || cycle, []);
});
```

The handler writes to the DB and updates `allCycles[idx].auto_open_at`, but **never mutates the `cycle` closure object** passed into `renderPrepPanel`. The input value is derived from that closure object at `downtime-views.js:2621`:

```js
const autoVal = cycle.auto_open_at ? isoToLocalInput(cycle.auto_open_at) : '';
// ... rendered at :2649
`<input type="datetime-local" id="dt-auto-open-input" ... value="${esc(autoVal)}">`
```

So on any subsequent `renderPrepPanel(cycle)` re-render, the stale `cycle.auto_open_at` (still undefined/old) produces an empty `autoVal` and the field reverts to blank.

**Reference fix pattern** — the chapter-finale handler immediately below (`downtime-views.js:2686-2693`) does it correctly:

```js
document.getElementById('dt-chapter-finale-input')?.addEventListener('change', async e => {
  const val = e.target.checked;
  await updateCycle(cycle._id, { is_chapter_finale: val });
  const idx = allCycles.findIndex(c => c._id === cycle._id);
  if (idx >= 0) allCycles[idx].is_chapter_finale = val;
  cycle.is_chapter_finale = val;   // <-- mutates the closure ref
  renderPrepPanel(cycle);
});
```

### DEFECT 2 — `downtime-form.js` `_gateBlocks` ignores `auto_open_at`

`public/js/tabs/downtime-form.js:1559-1565`:

```js
const _formStatuses = _isST ? ['active', 'prep'] : ['active'];
const _hasWindowAccess = (currentCycle?.out_of_window_player_ids || [])
  .map(String).includes(String(currentChar._id));
const _deadlinePast = !!(currentCycle?.deadline_at && new Date(currentCycle.deadline_at) < new Date());
const _gateBlocks = !currentCycle
  || (!_formStatuses.includes(currentCycle.status) && !_hasWindowAccess)
  || (_deadlinePast && !_hasWindowAccess);
```

There is no `autoOpenPassed` term, so even after `auto_open_at` has passed, a `'prep'` cycle still blocks players (players only get `['active']` in `_formStatuses`). The ST has to click manual override anyway, defeating the feature.

**Reference pattern to mirror** — `public/js/tabs/downtime-tab.js:49`:

```js
const autoOpenPassed = activeCycle?.auto_open_at && new Date(activeCycle.auto_open_at) <= new Date();
// ... used in canAccess at :51
const canAccess = isST || hasWindowAccess || autoOpenPassed || cycleIsOpen;
```

### DEFECT 3 — No countdown in the player gate page

`renderCycleGatePage()` (`downtime-form.js:1674-1709`) has no branch for "`auto_open_at` set and not yet passed" — it falls through to the generic "currently closed" fallback (or, after fix.535, the "being prepared" prep message). Even when the open date is minutes away, the player sees no countdown.

**Reference card to mirror** — `downtime-tab.js:69-77`:

```js
if (activeCycle.auto_open_at) {
  const openDate = new Date(activeCycle.auto_open_at);
  const label = openDate.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  currentZone.innerHTML = `<div class="dt-state-card">
    <p class="dt-state-title">Downtimes opening soon</p>
    <p class="dt-state-body">Opens <strong>${esc(label)}</strong></p>
    <p class="dt-countdown" data-open-at="${esc(activeCycle.auto_open_at)}"></p>
  </div>`;
  _startCountdown(currentZone.querySelector('.dt-countdown'), openDate);
}
```

Note `renderCycleGatePage()` returns an HTML string (no live element to call `_startCountdown` on at build time). Two options for the countdown:
- **A (simplest, recommended):** render a static "Opens \<date\>" card with no ticking timer. The gate page is re-evaluated on page load / tab switch, which is sufficient per the issue's "client-side check on page load" scope. Emit the `data-open-at` attribute so a ticking timer can be wired later without markup change.
- **B:** if a live ticker is wanted, the gate string is injected by a caller that has the container; that caller would need to call `_startCountdown` post-injection. Heavier; only do this if the static card reads poorly. Confirm with the PO before taking B.

---

## Critical interaction with fix.535

Both stories edit the **same prep branch** of `renderCycleGatePage()`. fix.535 adds:

```js
} else if (isPrep) {
  h += `<p class="qf-gate-msg">Downtime is being prepared — your ST will open submissions shortly.</p>`;
}
```

fix.536's countdown must take **precedence** over that prep message when `auto_open_at` is set and still in the future. Combined prep handling:

```js
} else if (isPrep) {
  const ao = currentCycle.auto_open_at ? new Date(currentCycle.auto_open_at) : null;
  if (ao && ao > new Date()) {
    // DEFECT 3 countdown card — "Downtimes opening soon / Opens <date>"
  } else {
    // fix.535 message — "Downtime is being prepared — your ST will open submissions shortly."
  }
}
```

(When `auto_open_at` has already passed, DEFECT 2's `_gateBlocks` change means the player no longer reaches the gate page at all for a prep cycle — they get the form — so the `else` branch only fires for prep cycles with no auto-open set, exactly as fix.535 intends.)

---

## Acceptance Criteria

- [ ] **Persist:** Setting Auto-Open Date/Time, then switching tabs or reloading the Prep panel, shows the saved value (not empty). `cycle.auto_open_at` closure ref is mutated in the change handler.
- [ ] **Open on pass:** When `auto_open_at` has passed and the cycle is still `'prep'`, players reach the full submission form (not the gate page). `_autoOpenPassed` is included on the access-granting side of `_gateBlocks`.
- [ ] **Countdown:** When `auto_open_at` is set but in the future (cycle `'prep'`), the player gate page shows "Downtimes opening soon — Opens \<date\>".
- [ ] **fix.535 fallback intact:** When `auto_open_at` is not set and the cycle is `'prep'`, the fix.535 message shows ("Downtime is being prepared — your ST will open submissions shortly.").
- [ ] **Override preserved:** The "OPEN DOWNTIMES (OVERRIDE)" manual button continues to work as the immediate-open path (no change to `setManualOpen`).
- [ ] Existing gate messages for `'game'`, `'closed'`, published, and past-deadline states are unchanged.

---

## Scope

**In scope:**
- DEFECT 1: mutate `cycle.auto_open_at` closure ref in the change handler (`downtime-views.js:2671-2677`).
- DEFECT 2: add `_autoOpenPassed` to `_gateBlocks` (`downtime-form.js:1559-1565`).
- DEFECT 3: add the auto-open countdown case to `renderCycleGatePage()` (`downtime-form.js`), with precedence over the fix.535 prep message.

**Out of scope:**
- Server-side cron to auto-advance `cycle.status` — the issue explicitly states a client-side page-load check is sufficient. No cron, no server route change.
- The validation banner firing on a fresh draft (separate UX item, see #535 scope).
- Live ticking timer in the gate page (Option B above) unless the PO requests it.

**Depends on:** fix.535 (same branch, same function — land 535's `isPrep` branch first, then nest 536's precedence).

---

## Dev Notes

### Files to change

1. **`public/js/admin/downtime-views.js`** — `renderPrepPanel` auto-open change handler, lines 2671–2677. One-line addition: `cycle.auto_open_at = val ? new Date(val).toISOString() : null;` (mirror the chapter-finale handler). Re-rendering the ribbon is fine; the closure mutation is the actual fix. Do **not** add a `renderPrepPanel(cycle)` call inside the change handler unless a full panel repaint on every keystroke-commit is desired — mutating the closure ref is sufficient for the field to survive whatever re-render fires next. Match the existing pattern; do not introduce a new render trigger.

2. **`public/js/tabs/downtime-form.js`** — `_gateBlocks` (lines 1559–1565):
   ```js
   const _autoOpenPassed = !!(currentCycle?.auto_open_at && new Date(currentCycle.auto_open_at) <= new Date());
   const _gateBlocks = !currentCycle
     || (!_formStatuses.includes(currentCycle.status) && !_hasWindowAccess && !_autoOpenPassed)
     || (_deadlinePast && !_hasWindowAccess);
   ```
   Note: keep `_autoOpenPassed` OUT of the deadline clause — an auto-open that passed must not override a passed deadline (a closed window stays closed).

3. **`public/js/tabs/downtime-form.js`** — `renderCycleGatePage()` (lines 1674–1709): add the combined `isPrep` handling shown in "Critical interaction with fix.535" above. Reuse the `downtime-tab.js:69-77` card markup and the `en-GB` date format for visual parity. The `responseDoc` sub-status block (lines 1701–1705) stays unchanged and still renders below the countdown.

### What NOT to change

- `_formStatuses` membership logic — players correctly stay `['active']`; access for a passed auto-open comes through the new `_autoOpenPassed` term, not by widening `_formStatuses`.
- `setManualOpen` / the override button path (`downtime/db.js`) — untouched.
- Server routes and `downtime_submission.schema.js` `auto_open_at` field — untouched (field already exists).
- `downtime-tab.js` — it is already correct; this story brings `downtime-form.js` to parity, it does not refactor the tab.

### Helpers to reuse (do not reinvent)

- `isoToLocalInput()` / `isoToLocalInput`-paired formatter already used at `downtime-views.js:2621` for the input value.
- `esc()` for all interpolated values in the gate string.
- `en-GB` `toLocaleString` options exactly as `downtime-tab.js:71` (British format per project convention: "Opens 11 Jun, 01:00").

### Testing constraint

Angelus cannot test locally, and the dev frontend proxies `/api/*` to the prod API — but **all three changes are client-side** (`downtime-views.js`, `downtime-form.js`), so they ARE verifiable on `dev` (terramortis-dev.netlify.app) once merged there. No server change means no wait-for-main.

### Manual verification (on dev, after merge)

1. **Persist (DEFECT 1):** In Admin > Downtime > Prep, set an Auto-Open Date/Time on a prep cycle. Switch to another tab and back (or reload). The field still shows the value.
2. **Countdown (DEFECT 3):** Set `auto_open_at` to ~10 min in the future. As a player (or ST previewing player view), open the Downtime tab → gate page shows "Downtimes opening soon — Opens \<date\>".
3. **Open on pass (DEFECT 2):** Set `auto_open_at` to a past time on a still-`'prep'` cycle. Reload as a player → the full submission form renders, no override click needed.
4. **fix.535 fallback:** Clear `auto_open_at` on a `'prep'` cycle → player sees "Downtime is being prepared — your ST will open submissions shortly."
5. **Override still works:** Click "OPEN DOWNTIMES (OVERRIDE)" → cycle goes `active`, player sees the form.

### Suggested commit sequence (same branch)

1. fix.535 first: `fix(#535): prep-cycle gate message in renderCycleGatePage()`
2. fix.536 next: `fix(#536): auto-open persist + gate access + countdown`

One PR for the branch covering both issues (cross-references #535 and #536).

---

## Dev Agent Record

### Implementation (2026-06-03)

**DEFECT 1 — persist (stale closure).** `public/js/admin/downtime-views.js`, `renderPrepPanel` auto-open `change` handler (~line 2671). Hoisted the ISO value into a local `iso`, then added `cycle.auto_open_at = iso;` to mutate the closure ref (mirroring the chapter-finale handler at ~2691). Did **not** add a `renderPrepPanel(cycle)` call — the closure mutation is sufficient for the field to survive the next re-render, and a per-change full repaint is unwanted. `allCycles[idx]` and the DB write are unchanged in effect.

**DEFECT 2 — gate access.** `public/js/tabs/downtime-form.js`, `_gateBlocks` block (~line 1562). Added `const _autoOpenPassed = !!(currentCycle?.auto_open_at && new Date(currentCycle.auto_open_at) <= new Date());` and included `&& !_autoOpenPassed` in the status-membership clause only. Deliberately kept out of the `_deadlinePast` clause so a passed auto-open can never reopen a window past its deadline (comment added inline).

**DEFECT 3 — countdown.** `public/js/tabs/downtime-form.js`, `renderCycleGatePage()` `isPrep` branch (~line 1690). Nested an auto-open check inside fix.535's `isPrep` branch: when `auto_open_at` is set and `> now`, render "Downtimes opening soon. Opens **\<date\>**." using the same `en-GB` `toLocaleString` options as `downtime-tab.js:71`; otherwise fall back to fix.535's "being prepared" message. Took **Option A** (static card, no live ticker) per the story — emitted `data-open-at` on the message so a ticker can be wired later without markup change. `esc()` applied to both the formatted label and the raw ISO attribute.

**Interaction confirmed:** the `_gateBlocks` change (DEFECT 2) means a prep cycle with a *passed* auto-open renders the form, so `renderCycleGatePage()`'s `isPrep` `else` branch only fires for prep cycles with no/future auto-open — the countdown (future) and fix.535 message (unset) are the only two reachable states, exactly as intended.

### Validation

- ES-module parse check passed for both files (`node --input-type=module --check`, the `.githooks/pre-commit` mechanism).
- No automated tests: all three changes are client-side and the repo has no client JS test framework (per CLAUDE.md). No server change, so the server vitest suite is unaffected. Verified by the manual steps above, runnable on `dev` after merge.

### Acceptance criteria status

- [x] Setting Auto-Open Date/Time and re-rendering the Prep panel shows the saved value (DEFECT 1)
- [x] Passed `auto_open_at` on a `'prep'` cycle lets players reach the full form (DEFECT 2)
- [x] Future `auto_open_at` shows the countdown card on the gate page (DEFECT 3)
- [x] Unset `auto_open_at` on `'prep'` shows the fix.535 "being prepared" message
- [x] "OPEN DOWNTIMES (OVERRIDE)" path unchanged (`setManualOpen` untouched)
- [x] `'game'`/`'closed'`/published/past-deadline gate messages unchanged

### Files changed (this story)

- `public/js/admin/downtime-views.js` — DEFECT 1
- `public/js/tabs/downtime-form.js` — DEFECT 2 + DEFECT 3

### QA review (2026-06-03)

**Verdict: APPROVE.** Combined-branch review of fix.535 + fix.536. Code is correct, surgical, low-risk. No automated tests (no client-JS framework in this repo; client-side changes verifiable on dev after merge — not locally).

**Focus-area findings:**

1. **`_gateBlocks` (DEFECT 2) — correct.** Passed auto-open admits a prep player; `_autoOpenPassed` deliberately excluded from the `_deadlinePast` clause, so a passed auto-open cannot reopen a past-deadline window. Verified across all four state combos.
2. **`isPrep` precedence (DEFECT 3) — correct, no dead branch.** Gate renders only when `_gateBlocks` is true, which for prep means auto-open is future or unset → exactly two reachable states (future→countdown, unset→fix.535 message). Passed auto-open renders the form instead.
3. **Closure-ref fix (DEFECT 1) — sufficient.** Mutating both `cycle.auto_open_at` and `allCycles[idx]` covers both re-render sources; not calling `renderPrepPanel()` leaves no stale UI (the `datetime-local` already holds the typed value; phase ribbon re-renders with fresh data).
4. **Two player surfaces — both fixed.** Statically traced: `player.js:385` → `renderDowntimeTab` (no `singleColumn`) → `downtime-form.js:1594` gate → the legacy portal reaches the modified gate. In the Game App, `downtime-tab.js initDowntimeTab` has its own outer gate; `activeCycle` includes prep (`LIVE_STATUSES:33`).
5. **Conventions — clean.** `esc()` on label and ISO attribute; em-dash matches sibling messages; British English; other gate states untouched.

**Key insight — the auto-open contradiction fix.536 resolves (likely Luca's actual root cause):**
In the Game App, `downtime-tab.js` grants access on `autoOpenPassed` (`canAccess` true → renders the form), but **pre-fix** `downtime-form.js` `_gateBlocks` had no `_autoOpenPassed` term — so it would then **block inside the form and show "currently closed"**: the tab admits, the form slams the door. If DT4 had an `auto_open_at` that had passed, a Game-App player would see exactly the reported "currently closed". DEFECT 2 fixes this, tying #535 and #536 together. (Without auto-open set, a Game-App prep player instead sees `downtime-tab.js`'s "not yet open" card — so the "currently closed" symptom specifically implicates the auto-open path or the legacy portal.)

**LOW / notes:**
- UI divergence: `downtime-tab.js` shows a live-ticking `.dt-state-card`; `downtime-form.js` shows a static "Opens \<date\>" line (accepted per Option A).
- `data-open-at` is inert in `downtime-form.js` (no `_startCountdown` wired) — future-proofing only.
- Edge nit: a prep cycle with a past deadline and no auto-open shows "being prepared" (harmless ST-misconfiguration case).

**Pre-merge action:** none blocking. Post-merge, smoke check on terramortis-dev.netlify.app (commit → PR → merge to dev → smoke check); optionally confirm whether DT4 had an `auto_open_at` set to pin Luca's exact scenario.
