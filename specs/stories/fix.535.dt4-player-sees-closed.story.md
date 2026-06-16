# Story fix.535: DT4 player gate shows wrong "currently closed" message during prep

## Status: review

## Issue
[#535](https://github.com/angelusvmorningstar/TerraMortis/issues/535) — DT4: some players see 'currently closed' after cycle opens

## Branch
`morningstar-issue-535-536-dt-gate-autoopen` (combined with #536 — both edit `renderCycleGatePage()`)

---

## Story

**As a** player opening the Downtime tab in the Game App,
**I want** to see an accurate message when a downtime cycle is being prepared but hasn't opened yet,
**so that** I'm not misled into thinking submissions closed after a window I missed.

---

## Background

### Root cause (confirmed by code trace)

When the ST creates a new downtime cycle via `handleNewCycle()`, it is inserted into MongoDB with `status: 'prep'`. The cycle can be advanced to `'active'` either by:

1. Completing the phase sign-off sequence in the DT Prep admin tab (prep → game → city → active), or
2. Clicking the **Manual Open** toggle (`setManualOpen(cycle, true, userId)` in `downtime/db.js:102`), which latches `manual_open: true` and writes `status: 'active'` to the DB immediately.

DT4 was opened as a new cycle but has not yet been advanced through either path. Its `status` in MongoDB is currently `'prep'`.

### Why Angelus sees the form, Luca does not

`public/js/tabs/downtime-form.js:1558`:
```js
const _formStatuses = _isST ? ['active', 'prep'] : ['active'];
const _gateBlocks   = !currentCycle
  || (!_formStatuses.includes(currentCycle.status) && !_hasWindowAccess)
  || (_deadlinePast && !_hasWindowAccess);
```

STs get `['active', 'prep']` — they can see prep cycles. Players get `['active']` only. DT4 in `'prep'` → `_gateBlocks = true` for players → `renderCycleGatePage()` fires.

### Why the gate message is wrong

`renderCycleGatePage()` (`downtime-form.js:1673`) has no case for `status === 'prep'`. The switch checks `isGame`, `isClosed`, `isDeadlinePast` in order, then falls through to:

```js
h += `<p class="qf-gate-msg">Downtime submissions are currently closed.</p>`;
```

"Currently closed" implies submissions were open and are now over. For a `'prep'` cycle, submissions haven't opened yet — a completely different user-facing situation.

### Secondary symptom: "feeding roll is ready" links to DT3

Because DT3 was never transitioned to `'closed'` when DT4 was created, it is still `'active'` in the DB. Queries that look for a cycle with `status: 'active'` (e.g. the server-side territories route at `server/routes/territories.js:115`) return DT3. The feeding roll notification resolves against DT3's submission data rather than DT4.

This is an **operational issue**, not a code bug — see the Operational Fix section below.

---

## Acceptance Criteria

- [ ] When the current cycle's status is `'prep'`, the player gate page displays: **"Downtime is being prepared — your ST will open submissions shortly."** (not "currently closed")
- [ ] Existing messages for `'game'`, `'closed'`, and past-deadline states are unchanged
- [ ] Angelus's own player view continues to show the full DT4 form (ST gate, `['active', 'prep']`, unchanged)
- [ ] The "Draft saved / Submitted — Your X submission is on file" sub-status line still renders when a `responseDoc` exists on a prep-gated view

---

## Scope

**In scope**: fix the misleading gate message for `status === 'prep'` in `renderCycleGatePage()`.

**Out of scope**:
- Advancing DT4 to `'active'` — operational, not code (see below)
- Transitioning DT3 to `'closed'` — operational
- The feeding roll notification resolving the wrong cycle — downstream of the operational state; resolves itself once DT4 is active and DT3 is closed
- The validation banner firing immediately on a fresh draft — separate UX story

---

## Operational Fix (do this now, before deploying code)

The code fix only improves the message. To actually unlock DT4 for players:

1. In the **Admin > Downtime** panel, select the DT4 cycle.
2. In the **Prep** tab, click **"OPEN DOWNTIMES (OVERRIDE)"**. This calls `setManualOpen(cycle, true, userId)`, which latches `manual_open: true` and writes `status: 'active'` to MongoDB immediately.
3. Confirm in the admin cycle status badge that DT4 now shows `active`.
4. Also confirm DT3 is in `closed` or `game` status — if it is still `active`, the feeding roll and other `{ status: 'active' }` queries will continue resolving to DT3.

**Note:** The **AUTO-OPEN DATE/TIME** field in the Prep panel has a separate bug (tracked in issue #536) — setting it does not appear to persist. The override button is the correct path until #536 is fixed.

---

## Dev Notes

### File to change

**`public/js/tabs/downtime-form.js`** — `renderCycleGatePage()` function, ~line 1680.

### Exact change

```js
// BEFORE (lines 1680–1698):
const isGame         = currentCycle.status === 'game';
const isClosed       = currentCycle.status === 'closed';
const isDeadlinePast = ...
// ...
if (isGame) {
  h += `...locked — the game is on...`;
} else if (isClosed) {
  h += `...ST is processing...`;
} else if (isDeadlinePast && isPublished) {
  h += `...results published...`;
} else if (isDeadlinePast) {
  h += `...submissions are closed...`;
} else {
  h += `<p class="qf-gate-msg">Downtime submissions are currently closed.</p>`;
}

// AFTER — add isPrep check before the else fallback:
const isPrep         = currentCycle.status === 'prep';
const isGame         = currentCycle.status === 'game';
const isClosed       = currentCycle.status === 'closed';
const isDeadlinePast = ...
// ...
if (isPrep) {
  h += `<p class="qf-gate-msg">Downtime is being prepared — your ST will open submissions shortly.</p>`;
} else if (isGame) {
  h += `...unchanged...`;
} else if (isClosed) {
  h += `...unchanged...`;
} else if (isDeadlinePast && isPublished) {
  h += `...unchanged...`;
} else if (isDeadlinePast) {
  h += `...unchanged...`;
} else {
  h += `<p class="qf-gate-msg">Downtime submissions are currently closed.</p>`;
}
```

### What NOT to change

- `_formStatuses` gate logic — correct as-is; players should not access prep cycles
- `LIVE_STATUSES` cycle selection (`['active', 'game', 'prep']`) — correct as-is; including 'prep' prevents falling back to a previous active cycle
- Server routes — no server change needed
- `deriveCycleStatus()` in `downtime/db.js` — not touched

### Test manually

**On `dev` after merge** (Angelus cannot smoke check locally — local frontend has no API; the only working front-end + API environment is terramortis-dev.netlify.app, which proxies `/api/*` to prod Render):

1. Confirm DT4 is in `'prep'` state (or set it back to prep temporarily in admin).
2. As a player-role user on dev, open the Downtime tab → should see "Downtime is being prepared — your ST will open submissions shortly."
3. If Luca has a draft, the "Draft saved — Your Downtime 4 submission is on file." sub-line should still appear below.
4. Switch DT4 to `'active'` (Manual Open in admin) → reload as player → should see the full form.

---

## Dev Agent Record

### Implementation (2026-06-03)

- **File changed:** `public/js/tabs/downtime-form.js`, `renderCycleGatePage()`.
  - Added `const isPrep = currentCycle.status === 'prep';` to the status-flag block (line 1681).
  - Prepended an `if (isPrep) { ... }` branch to the message if-chain (line 1690) emitting: "Downtime is being prepared — your ST will open submissions shortly." All five existing branches (`isGame`, `isClosed`, `isDeadlinePast && isPublished`, `isDeadlinePast`, `else`) shift down to `else if` / `else`, unchanged.
- **Convention note:** the new message uses the literal em-dash to match the five sibling gate messages in the same function (all use em-dash in their copy). This is intentional consistency within the function; the project-wide "no em-dash" rule is for assistant prose output, and the existing UI strings here predate it.
- **Not touched (per "What NOT to change"):** `_formStatuses`, `LIVE_STATUSES`, `setManualOpen`/`deriveCycleStatus` in `downtime/db.js`, server routes. The `responseDoc` sub-status block below the message is unchanged, so the "Draft saved / Submitted" line still renders on a prep-gated view (AC4).
- **Stacking:** this is the first of two stories on branch `morningstar-issue-535-536-dt-gate-autoopen`. fix.536 will nest an auto-open countdown inside this same `isPrep` branch (countdown takes precedence when `auto_open_at` is set and future).

### Validation

- ES-module parse check passed (`node --input-type=module --check`), matching the `.githooks/pre-commit` mechanism.
- No automated tests: client JS has no test framework in this repo (per CLAUDE.md); acceptance verified by the manual steps above. All changes are client-side, so they are testable on `dev` once merged there.

### Acceptance criteria status

- [x] Prep-status gate shows the "being prepared" message, not "currently closed"
- [x] `'game'`, `'closed'`, published, and past-deadline messages unchanged
- [x] ST own-view gate (`['active', 'prep']`) unchanged — still shows the full form
- [x] `responseDoc` "Draft saved / Submitted" sub-status line still renders on a prep-gated view

### Operational reminder (out of code scope)

The code only corrects the message. To actually unlock DT4 for players, the ST must click "OPEN DOWNTIMES (OVERRIDE)" in the Prep tab (or let fix.536's auto-open fire). See the Operational Fix section above.

### QA review (2026-06-03)

**Verdict: APPROVE.** Combined-branch review with fix.536; findings recorded in fix.536's Dev Agent Record. fix.535-specific notes:

- `_gateBlocks`/`renderCycleGatePage` gate logic verified correct; `'game'`/`'closed'`/published/deadline branches untouched, only shifted to `else if`.
- **Surface trace:** the modified `renderCycleGatePage()` is reached by the **legacy `player.js` portal** (`renderDowntimeTab` without `singleColumn` → `downtime-form.js:1594`) and, in the Game App, only in edge transitions — `downtime-tab.js`'s own gate (`:43-83`) intercepts a steady-state prep player first and already handled prep. The form-gate fix brings `downtime-form.js` to parity and is the active fix for the portal path. Confirm the affected player's surface on dev after merge (per smoke-check constraint — no local testing).
