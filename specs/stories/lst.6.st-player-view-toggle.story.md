# Story: ST Player View Toggle

**Story ID:** lst.6
**Epic:** Live Session Toolkit — Game App QoL
**Status:** ready-for-dev
**Date:** 2026-04-18

---

## User Story

As an ST using the game app, I want a toggle button that switches between ST view and Player view, so I can experience the app exactly as a player does — and so STs like Kurtis and Symon can default to their player character without being forced to switch each time.

---

## Background & Design

### Current state

`applyRoleRestrictions()` in `app.js` reads `getRole()` directly and applies ST/player nav visibility. There is no concept of an effective role override.

ST view shows: Characters, Territory, Tracker, Rules, Status nav buttons.
Player view shows: Sheet, Submit DT, Rules, Status nav buttons.

### Desired behaviour

- STs see a toggle chip in the header: **ST View / Player View**.
- Tapping switches the entire game app nav to the other mode.
- Mode persists in `localStorage` — Kurtis and Symon can switch once and stay in Player mode.
- Only users with ST credentials (`getRole() === 'st'`) can see or use the toggle. Players never see it.
- When an ST is in Player view, they see exactly what a player sees: their linked character auto-opens, ST-only elements (Feeding Test, Contested Roll, Save All, ST Admin link, character list filters) are hidden.
- If the ST has no linked character: a "No character detected" placeholder is shown, player nav is still applied (clean fallback).

### Profile avatar — free up header space

The current `renderUserHeader()` renders: `[avatar] [name] [Log out button]` inline in the header. Move Log out into a compact dropdown triggered by clicking the avatar+name row. This frees horizontal space for the view toggle.

---

## Implementation Plan

### Task 1 — `effectiveRole()` helper + view mode state

In `public/js/app.js`:

Add at module level (near other state variables):
```js
const VIEW_MODE_KEY = 'tm_view_mode';
let _viewMode = localStorage.getItem(VIEW_MODE_KEY) || 'st';
```

Add helper (used everywhere `getRole()` is called for layout decisions):
```js
function effectiveRole() {
  return (getRole() === 'st' && _viewMode === 'player') ? 'player' : getRole();
}
```

### Task 2 — Make `applyRoleRestrictions()` bidirectional

Currently the function only hides things when `!isST`. On toggle back to ST, it needs to restore ST elements. Replace the one-way logic with explicit show/hide for both modes:

```js
function applyRoleRestrictions() {
  const role = effectiveRole();
  const isST = role === 'st';
  const isRealST = getRole() === 'st';

  // ST nav — Characters, Territory, Tracker
  ['n-chars', 'n-territory', 'n-tracker'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isST ? '' : 'none';
  });

  // Player nav — Sheet, Submit DT
  ['n-editor', 'n-dt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isST ? 'none' : '';
  });

  // Rules and Status — visible to all
  ['n-rules', 'n-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });

  // ST-only UI elements
  const feedSec = document.getElementById('feed-section');
  if (feedSec) feedSec.style.display = isST ? '' : 'none';
  const btnContested = document.getElementById('btn-contested');
  if (btnContested) btnContested.style.display = isST ? '' : 'none';
  const navAdmin = document.getElementById('nav-admin');
  if (navAdmin) navAdmin.style.display = isRealST ? '' : 'none'; // always visible to real STs
  const topbarRight = document.getElementById('topbar-right');
  if (topbarRight) topbarRight.style.display = isST ? '' : 'none';

  // Character list — restrict to player's own characters in player mode
  if (!isST) {
    const info = getPlayerInfo();
    setListLimit(info?.character_ids || []);
    const toolbar = document.querySelector('.list-toolbar');
    if (toolbar) toolbar.style.display = 'none';
  } else {
    setListLimit([]); // ST mode — no restriction
    const toolbar = document.querySelector('.list-toolbar');
    if (toolbar) toolbar.style.display = '';
  }

  // Sheet topbar — hide for players
  const topbar = document.querySelector('.sheet-topbar');
  if (topbar) topbar.style.display = isST ? '' : 'none';

  // Update toggle button label (if it exists)
  const toggleBtn = document.getElementById('btn-view-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = isST ? 'Player View' : 'ST View';
    toggleBtn.classList.toggle('view-toggle-active', !isST);
  }
}
```

**Note on `nav-admin`**: The ST Admin link always shows for real STs regardless of view mode — they should still be able to reach admin even in player mode.

### Task 3 — `toggleViewMode()` function

```js
function toggleViewMode() {
  _viewMode = _viewMode === 'st' ? 'player' : 'st';
  localStorage.setItem(VIEW_MODE_KEY, _viewMode);
  applyRoleRestrictions();

  if (_viewMode === 'player') {
    _enterPlayerView();
  } else {
    _enterSTView();
  }
}

function _enterPlayerView() {
  const info = getPlayerInfo();
  const ids = info?.character_ids || [];
  if (!ids.length) {
    // No character linked — show placeholder
    goTab('editor');
    const shContent = document.getElementById('sh-content');
    if (shContent) shContent.innerHTML = '<div class="dtl-empty">No character detected — ask your Storyteller to link your Discord account.</div>';
    return;
  }
  const idx = editorState.chars.findIndex(c => String(c._id) === ids[0]);
  if (idx >= 0) openChar(idx);
  else goTab('roll');
}

function _enterSTView() {
  goTab('chars');
}
```

### Task 4 — Add toggle button to `index.html` header

In the `hdr-nav` div (alongside the existing Player/ST Admin links), add:

```html
<button id="btn-view-toggle" class="app-nav-btn view-toggle-btn" onclick="toggleViewMode()" style="display:none">Player View</button>
```

`style="display:none"` — the button is shown only after `renderUserHeader()` confirms the user is an ST (see Task 5).

### Task 5 — Show toggle for ST users in `renderUserHeader()`

In `renderUserHeader()`, after confirming the user is an ST, show the toggle button:

```js
const toggleBtn = document.getElementById('btn-view-toggle');
if (toggleBtn && getRole() === 'st') {
  toggleBtn.style.display = '';
  // Restore saved view mode label
  toggleBtn.textContent = _viewMode === 'st' ? 'Player View' : 'ST View';
  toggleBtn.classList.toggle('view-toggle-active', _viewMode === 'player');
}
```

Also: if `_viewMode === 'player'` on load (returning ST), immediately apply player restrictions after render:
```js
if (getRole() === 'st' && _viewMode === 'player') {
  applyRoleRestrictions();
  _enterPlayerView();
}
```

### Task 6 — Move Log Out into avatar dropdown

Modify `renderUserHeader()` to replace the inline logout button with a clickable avatar area that reveals a dropdown:

```js
userEl.innerHTML = `
  <div class="hdr-profile" id="hdr-profile" onclick="toggleProfileMenu()">
    <img src="${avatarUrl}" class="hdr-avatar" alt="">
    <span class="hdr-name">${esc(name)}</span>
    <span class="hdr-caret">&#9662;</span>
  </div>
  <div class="hdr-profile-menu" id="hdr-profile-menu" style="display:none">
    <button onclick="logout()" class="hdr-menu-item">Log out</button>
  </div>
`;
```

Add to `window` assignments:
```js
window.toggleProfileMenu = function() {
  const menu = document.getElementById('hdr-profile-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
};
```

Close the menu on outside click (add to `boot()` or document click handler):
```js
document.addEventListener('click', e => {
  if (!e.target.closest('#hdr-profile') && !e.target.closest('#hdr-profile-menu')) {
    const menu = document.getElementById('hdr-profile-menu');
    if (menu) menu.style.display = 'none';
  }
});
```

### Task 7 — CSS for toggle button and profile dropdown

In `public/css/suite.css`:

```css
.view-toggle-btn { background: var(--surf2); border: 1px solid var(--bdr); color: var(--txt2); }
.view-toggle-btn.view-toggle-active { background: rgba(224,196,122,.15); border-color: var(--gold2); color: var(--gold2); }
.hdr-profile { display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
.hdr-profile:hover { background: var(--surf2); }
.hdr-avatar { width: 24px; height: 24px; border-radius: 50%; }
.hdr-name { font-size: 12px; color: var(--txt3); }
.hdr-caret { font-size: 10px; color: var(--txt3); }
.hdr-profile-menu { position: absolute; top: 100%; right: 0; background: var(--surf2); border: 1px solid var(--bdr); border-radius: 6px; padding: 4px; z-index: 200; min-width: 100px; }
.hdr-menu-item { display: block; width: 100%; padding: 8px 12px; background: none; border: none; color: var(--txt2); font-size: 13px; text-align: left; cursor: pointer; border-radius: 4px; }
.hdr-menu-item:hover { background: var(--surf3); color: var(--txt); }
```

The `hdr-user` element needs `position: relative` for the dropdown to anchor correctly.

---

## Acceptance Criteria

- [ ] ST users see a "Player View" toggle button in the header; it is invisible to non-ST users
- [ ] Clicking the toggle switches the game app nav: ST tabs hide, player tabs show (and vice versa)
- [ ] In Player view, the ST's linked character is automatically opened
- [ ] If no character is linked, "No character detected" placeholder is shown; nav still switches cleanly
- [ ] The toggle state persists in localStorage — Kurtis/Symon stay in Player mode after switching once
- [ ] Log out is moved into an avatar dropdown; clicking the avatar/name reveals it
- [ ] In Player view, all ST-only elements are hidden: Feeding Test, Contested Roll, Save All, character list filters
- [ ] The "ST Admin" header link remains visible to real STs regardless of view mode
- [ ] Switching back to ST view restores all ST tabs and elements
- [ ] No regression in the existing player-only auth path (players never see the toggle; their nav is unchanged)

---

## Files to Change

| File | Change |
|---|---|
| `public/js/app.js` | Add `_viewMode`, `effectiveRole()`, `toggleViewMode()`, `_enterPlayerView()`, `_enterSTView()`; update `applyRoleRestrictions()` to be bidirectional; update `renderUserHeader()` for avatar dropdown + toggle reveal; expose `toggleViewMode`, `toggleProfileMenu` on `window` |
| `public/index.html` | Add `btn-view-toggle` button in `hdr-nav` |
| `public/css/suite.css` | Add toggle and profile dropdown styles |

---

## Critical Constraints

- **`getRole()` is never spoofed** — `effectiveRole()` is a local override only, used for layout decisions. The real role stays unchanged; API calls still use the real Discord token.
- **Players never see the toggle** — `btn-view-toggle` only becomes visible after `renderUserHeader()` confirms `getRole() === 'st'`.
- **ST Admin link always visible to real STs** — the admin link is not affected by view mode.
- **`applyRoleRestrictions()` must be idempotent** — calling it twice should not break layout.
- **No regression on player-only path** — players who log in with `role === 'player'` go through the same `applyRoleRestrictions()` call; `effectiveRole()` returns their real role, no change.

---

## Reference

- SSOT: `specs/reference-data-ssot.md`
- Role system: `getRole()`, `getPlayerInfo()` from `public/js/auth/discord.js`
- `applyRoleRestrictions()`: `public/js/app.js` line 766
- `renderUserHeader()`: `public/js/app.js` line 810
