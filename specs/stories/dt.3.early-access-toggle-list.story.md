# Story: dt.3 — DT Prep Early Access: Toggle Per Player

## Status: review

## Summary

The DT Prep panel currently shows early access players as a dropdown-plus-add workflow: you have to pick a player from a dropdown, click Add, and then a "Remove" button appears next to each granted entry. This is awkward for selecting many players.

Replace with a full list of all active players, each with a toggle control indicating their early access state. Clicking a toggle flips the player's early access on/off and persists immediately.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/admin/downtime-views.js` | Replace the current `renderPrepPanel()` early access section with a toggle list; update event wiring |
| `public/css/admin-layout.css` | Styles for the toggle-row layout |

---

## Acceptance Criteria

1. The Early Access Players section shows every active player as a row with their name and a toggle
2. A player is considered "active" if they have at least one non-retired linked character
3. The toggle reflects current state — ON for players in `early_access_player_ids`, OFF for the rest
4. Clicking a toggle flips state, persists to MongoDB via the existing `updateCycle()` call, and updates the local cycle cache
5. No "Add player" dropdown and no separate "Remove" button — a single toggle per row does everything
6. Rows sort alphabetically by player name for predictable ordering
7. Empty state ("No active players") shown only if there genuinely are no active players in the system

---

## Tasks / Subtasks

- [x] Identify active players (AC: #2)
  - [x] Player considered active if they have at least one non-retired linked character via `character_ids`
- [x] Replace early access section HTML (AC: #1, #3, #5, #6)
  - [x] Removed `earlyHtml`, `addOpts`, dropdown, and Add button
  - [x] Render sorted toggle-row list wrapped in `.dt-early-list` container with scroll
- [x] Wire toggle change handler (AC: #4)
  - [x] Single delegated handler on `.dt-early-toggle` — checkbox change updates Set, writes via `updateCycle()`, syncs local cache
  - [x] No full re-render — the checkbox state is the UI state
- [x] CSS for toggle row (AC: #1)
  - [x] `.dt-early-list` is scrollable; `.dt-early-toggle-row` flex space-between with hover highlight
  - [x] Native checkbox with `accent-color: var(--accent)` for theme-aware styling

---

## Dev Notes

### Current implementation (`downtime-views.js:1408-1434`)

```js
const earlyIds = cycle.early_access_player_ids || [];
const earlyPlayers = (players || []).filter(p => earlyIds.includes(String(p._id)));
const otherPlayers = (players || []).filter(p => !earlyIds.includes(String(p._id)));
// ... earlyHtml: rows with Remove button
// ... addOpts: dropdown of otherPlayers + Add button
```

### Target implementation

```js
const earlyIds = new Set((cycle.early_access_player_ids || []).map(String));

// Only players with at least one non-retired linked character
const activePlayers = (players || [])
  .filter(p => {
    const charIds = (p.character_ids || []).map(String);
    return characters.some(c => !c.retired && charIds.includes(String(c._id)));
  })
  .sort((a, b) => (a.player_name || a.username || '').localeCompare(b.player_name || b.username || ''));

const toggleHtml = activePlayers.map(p => {
  const id = String(p._id);
  const checked = earlyIds.has(id) ? 'checked' : '';
  const name = esc(p.player_name || p.username || id);
  return `<label class="dt-early-toggle-row" data-player-id="${esc(id)}">
    <span class="dt-early-name">${name}</span>
    <input type="checkbox" class="dt-early-toggle" ${checked}>
  </label>`;
}).join('');

const earlyContent = activePlayers.length
  ? toggleHtml
  : `<p class="placeholder">No active players.</p>`;
```

### Handler (replaces current add/remove handlers)

```js
panel.querySelectorAll('.dt-early-toggle').forEach(cb => {
  cb.addEventListener('change', async () => {
    const row = cb.closest('.dt-early-toggle-row');
    const pid = row.dataset.playerId;
    const current = new Set((cycle.early_access_player_ids || []).map(String));
    if (cb.checked) current.add(pid); else current.delete(pid);
    const updated = [...current];
    await updateCycle(cycle._id, { early_access_player_ids: updated });
    const idx = allCycles.findIndex(c => c._id === cycle._id);
    if (idx >= 0) allCycles[idx].early_access_player_ids = updated;
  });
});
```

### CSS

```css
.dt-early-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--bdr);
  cursor: pointer;
}
.dt-early-toggle-row:hover { background: var(--surf2); }
.dt-early-toggle-row:last-child { border-bottom: none; }
.dt-early-name { font-size: 13px; color: var(--txt); }
.dt-early-toggle { width: 18px; height: 18px; accent-color: var(--accent); }
```

Using native checkbox with `accent-color` keeps the styling minimal and theme-aware. A fancier slider component can be added later if desired.

### No re-render required

Since the toggle state is directly mutated and persisted, the panel doesn't need to re-render on each click. This is better UX than the current flow (which re-rendered the whole panel on every add/remove).

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-7

### Debug Log

### Completion Notes

- Replaced dropdown+add/remove with a sorted list of active players, each with a native checkbox toggle
- "Active player" = has at least one non-retired linked character
- Toggle change persists immediately; no full re-render
- Scrollable list (max-height 360px) for campaigns with many players

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`

### Change Log

- 2026-04-23: Implemented dt.3 — early access toggle-per-player list
