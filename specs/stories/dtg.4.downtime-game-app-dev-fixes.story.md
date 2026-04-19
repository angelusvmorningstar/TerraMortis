---
id: dtg.4
epic: downtime-game-app
group: A
status: complete
priority: high
---

# Story dtg.4: Downtime Game App — Dev Bypass, Single-Column Layout, BigInt Fix

As a developer iterating on the downtime form in the game app,
I want the form to render unconditionally on localhost without requiring a live game cycle,
And I want the game app layout to match the nav.7 single-column design,
So that I can inspect and iterate the form design without production data dependencies.

## Background

Three issues were found and fixed during the 2026-04-20 session as part of integrating the downtime form into the game app (`index.html`). None of these were captured in dtg.1 or dtg.2. This story documents what was done.

### Issue 1: Form gated behind active cycle

`renderDowntimeTab` in `downtime-form.js` gate-checks `currentCycle.status !== 'active'` before rendering the form. In production, the most recent cycle (DT2) is `closed`, not `active`. This meant the form never rendered during development.

**Fix applied:** After cycle loading, inject a stub cycle on localhost:
```js
if (!currentCycle && location.hostname === 'localhost') {
  currentCycle = { _id: 'dev-stub', status: 'active', label: '[Dev Preview]' };
}
```
The inner gate in `renderDowntimeTab` also bypassed on localhost:
```js
const devPreview = location.hostname === 'localhost';
if (options.singleColumn) {
  if (!devPreview && (!currentCycle || currentCycle.status !== 'active')) {
    targetEl.innerHTML = renderCycleGatePage();
  } else { ... }
}
```
Save function guards against stub: when `currentCycle._id === 'dev-stub'`, saves are silently skipped with `[Dev] Save skipped` message.

### Issue 2: "Already submitted" gate in downtime-tab.js

`downtime-tab.js` checks `if (!myActiveSub)` before calling `renderDowntimeTab`. Since DT2 had an existing submission, this showed the "submitted" state card instead of the form.

**Fix applied:** `forceForm` flag bypasses this gate on localhost:
```js
const forceForm = location.hostname === 'localhost';
if (!myActiveSub || forceForm) {
  if (!forceForm && window.innerWidth <= 600) { /* mobile notice */ }
  else { renderDowntimeTab(currentZone, char, territories, { singleColumn: true }); }
}
```

### Issue 3: BigInt crash on dev login avatar

`renderUserHeader` in `app.js` computes a Discord default avatar using `BigInt(user.id)`. The dev login user has `id: 'local-test-st'` (a string), causing `SyntaxError: Cannot convert local-test-st to a BigInt`.

**Fix applied:** Guard before the BigInt call:
```js
: (user._localTest || String(user.id).startsWith('local-')) ? discordAvatarUrl(null, null)
: `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`;
```

### Issue 4: Split layout in game app (nav.7 design debt)

Nav.7 specified a single-column layout (form top, history accordion below). The `renderDowntimeTab` function always created a `.dt-split` two-pane layout (form left, history right), which is correct for `player.html` but wrong for the game app.

**Fix applied:** `singleColumn` option added to `renderDowntimeTab(targetEl, char, territories, options = {})`. When `options.singleColumn === true`:
- No `.dt-split` wrapper created
- No right-panel history rendered (game app tab wrapper handles this separately)
- Form renders directly into `targetEl`

`downtime-tab.js` passes `{ singleColumn: true }` on all game app calls. `player.html` calls `renderDowntimeTab` without options — two-pane behaviour unchanged.

## Files Changed

- `public/js/player/downtime-form.js` — stub cycle injection, `singleColumn` option, save guard, devPreview gate bypass
- `public/js/player/downtime-tab.js` — `forceForm` bypass, `singleColumn: true` passed, `territories` arg forwarded
- `public/js/app.js` — BigInt guard in `renderUserHeader`

## Acceptance Criteria (verified in session)

**Given** dev login on localhost with no active game cycle  
**When** the Downtime tab opens  
**Then** the form renders with `[Dev Preview]` label — not the gate page

**Given** a character who has already submitted DT2  
**When** the Downtime tab opens on localhost  
**Then** the form renders — not the "Submitted" state card

**Given** dev login user (`id: 'local-test-st'`)  
**When** the app boots  
**Then** no BigInt error — a placeholder avatar renders instead

**Given** the game app Downtime tab  
**When** the form renders  
**Then** single-column layout — no horizontal split, no right history pane

**Given** `player.html` Downtime tab  
**When** the form renders  
**Then** two-pane split layout unchanged — no regression

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
All four fixes implemented 2026-04-20 during dtg.1/dtg.2 integration session. Verified visually in browser on localhost:8080. No automated tests — manual verification only per project conventions.
### File List
- public/js/player/downtime-form.js
- public/js/player/downtime-tab.js
- public/js/app.js
