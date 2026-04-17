# Story feature.58: Sphere Card Pyramid Redesign

## Status: review

## Story

**As an** ST viewing the Spheres domain in the admin app,
**I want** each sphere card to display Status and Allies holders as two side-by-side pyramids,
**so that** I can see at a glance who dominates each sphere, who is contending, and who holds contacts there.

## Background

The current Spheres view renders each sphere card as a flat ranked list (e.g. "1. Harpy Brandy LaRoux A3"). This obscures the **competitive hierarchy** — you can't see who holds the apex (5 dots), who is contending (4 dots), and who is on the floor. The redesign applies the same slot architecture already built for the Status tab: one apex slot (rank 5, always shown even vacant), two high-seat slots (rank 4, always shown), and a bracket floor for rank 3 and below — but applied independently to the **Status** and **Allies** dimensions side-by-side within each sphere card. Below both pyramids, a chip row shows all characters with Contacts in that sphere.

## Acceptance Criteria

1. Each sphere card body contains two equal-width columns: **Status** (left) and **Allies** (right).
2. Each column shows:
   - **Apex slot** (rank 5): compact card with 28 px avatar, name, filled dots, value badge. If no holder: dashed vacant placeholder.
   - **High-seat row** (rank 4): two side-by-side compact cards with 20 px avatar, name, value badge. If fewer than 2 holders, vacant slot(s) shown as dashed with "–".
   - **Floor brackets** (rank 1–3): grouped by value, each group shows dot string + name(s) in a wrap row. Only rendered if floor holders exist.
3. A character appearing in both Status and Allies columns (e.g. Status 3 + Allies 3) renders independently in both — they are separate pyramids.
4. Below the two pyramid columns, a **Contacts chip row** renders if any characters hold Contacts in this sphere. Each chip: 18 px avatar + name, pill shape. Row has "Contacts" label above it.
5. Vacant spheres (no holders in either dimension, no contacts) continue to render the existing `.sphere-card-vacant` + "No current holders" message — no pyramids shown.
6. The sphere grid increases minimum card width from 260 px to 380 px to accommodate two columns.
7. Avatar fallback: hash-based Discord default avatar when `_player_info.discord_id` is absent (same pattern as `status-tab.js`).

## Tasks / Subtasks

- [x] Task 1: Update imports in `spheres-view.js` (AC: 7)
  - [x] Add `sortName`, `discordAvatarUrl`, `isRedactMode` to the `helpers.js` import
  - [x] Remove the local `esc()` function; import `esc` from helpers instead
  - [x] Add `avatarUrl(c)` helper (copy from `status-tab.js` lines 19–29 — identical pattern)

- [x] Task 2: Fix `getSpheresData()` row shape to preserve char object (AC: 3, 4, 7)
  - [x] Change `ensureRow` to store `c` (full char object) instead of `name: displayName(c)`
  - [x] New: `spheres[key][cid] = { c, allies: 0, status: 0, hasContacts: false }`
  - [x] Update `renderSpheres()` sort: `sortName(a.c).localeCompare(sortName(b.c))`

- [x] Task 3: Add `renderSpherePyramid(rows, dimension)` function (AC: 1–3)
  - [x] Filters, sorts, slices apex/high/floor per dimension
  - [x] Apex: compact card with avatar, name, dots, val; vacant: dashed placeholder
  - [x] High seats: two slots, vacant dashed with "–"
  - [x] Floor: grouped dot brackets with names

- [x] Task 4: Replace `renderSphereCard()` (AC: 1–6)
  - [x] Header unchanged; vacant path unchanged
  - [x] Body: `sph-pyramid-split` with status + allies pyramids
  - [x] Contacts chip row below pyramids
  - [x] Vacancy check updated: `rows.filter(r => r.total > 0 || r.hasContacts).length === 0`

- [x] Task 5: CSS additions in `admin-layout.css` (AC: 1–6)
  - [x] `.spheres-grid` minmax updated to 380px
  - [x] All `.sph-*` classes added after `.sphere-dominant` block

## Dev Notes

### Exact CSS to add

Append after `.sphere-dominant .sphere-char-name { ... }` block in `admin-layout.css`:

```css
/* ── Sphere pyramid redesign ── */

/* Override grid min-width */
.spheres-grid { grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); }

.sph-pyramid-split {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.sph-pyramid-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sph-pyramid-col-head {
  font-size: 10px;
  color: var(--txt3);
  text-transform: uppercase;
  letter-spacing: .08em;
  text-align: center;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--bdr);
  margin-bottom: 2px;
}

.sph-apex {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--surf2);
  border: 1px solid var(--gold2);
  border-radius: 4px;
  min-height: 44px;
}

.sph-apex.sph-vacant {
  justify-content: center;
  border-style: dashed;
  border-color: var(--bdr);
  opacity: .5;
}

.sph-apex-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--surf3);
  object-fit: cover;
}

.sph-apex-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sph-apex-name {
  font-size: 11px;
  color: var(--txt);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sph-apex-dots {
  font-size: 9px;
  letter-spacing: 1px;
  color: var(--gold2);
}

.sph-apex-val {
  font-family: var(--fl);
  font-size: 16px;
  color: var(--accent);
  flex-shrink: 0;
}

.sph-high-row {
  display: flex;
  gap: 4px;
}

.sph-high {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 5px 4px;
  background: var(--surf2);
  border: 1px solid var(--bdr);
  border-radius: 4px;
  min-height: 44px;
  text-align: center;
}

.sph-high.sph-vacant {
  justify-content: center;
  border-style: dashed;
  opacity: .45;
}

.sph-high-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--surf3);
  object-fit: cover;
}

.sph-high-name {
  font-size: 10px;
  color: var(--txt1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.sph-high-val {
  font-size: 10px;
  color: var(--gold2);
  font-weight: 600;
}

.sph-vacant-label {
  font-size: 10px;
  color: var(--txt3);
}

.sph-floor {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 2px;
}

.sph-floor-bracket {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-wrap: wrap;
}

.sph-floor-dots {
  font-size: 8px;
  letter-spacing: 1px;
  color: var(--gold2);
  flex-shrink: 0;
}

.sph-floor-name {
  font-size: 11px;
  color: var(--txt1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sph-contacts-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--bdr);
}

.sph-contacts-label {
  font-size: 10px;
  color: var(--txt3);
  text-transform: uppercase;
  letter-spacing: .08em;
  margin-bottom: 5px;
}

.sph-contacts-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.sph-contact-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--surf2);
  border: 1px solid var(--bdr);
  border-radius: 12px;
  padding: 2px 8px 2px 3px;
}

.sph-contact-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surf3);
  object-fit: cover;
}

.sph-contact-name {
  font-size: 11px;
  color: var(--txt1);
  white-space: nowrap;
}
```

### Dot string helper

Floor dots use filled/open circles out of 5: `'●'.repeat(val) + '○'.repeat(5 - val)`. Use `\u25CF` and `\u25CB` directly (no helper import needed — same pattern used throughout the codebase).

### avatarUrl — exact copy from status-tab.js

```js
function avatarUrl(c) {
  const pi = c._player_info || {};
  if (isRedactMode() || !pi.discord_id || !pi.discord_avatar) {
    if (isRedactMode()) return discordAvatarUrl(null, null);
    let h = 0;
    const s = String(c._id || c.name || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return `https://cdn.discordapp.com/embed/avatars/${Math.abs(h) % 6}.png`;
  }
  return discordAvatarUrl(pi.discord_id, pi.discord_avatar, 64);
}
```

### helpers.js exports to confirm

`esc`, `displayName`, `sortName`, `discordAvatarUrl`, `isRedactMode` are all exported from `public/js/data/helpers.js`. Confirm the import line before writing.

### Vacant sphere detection

The existing `vacant` check is `rows.length === 0`. With the new row shape, `rows` will contain char objects only when at least one merit exists. A sphere with only Contacts holders (no Allies or Status dots) is **not vacant** — it has contacts chips to show. The vacancy check should be: `rows.filter(r => r.total > 0 || r.hasContacts).length === 0`.

### Key files

| File | Change |
|------|--------|
| `public/js/admin/spheres-view.js` | imports, `avatarUrl`, `getSpheresData` row shape, `renderSpherePyramid`, `renderSphereCard` |
| `public/css/admin-layout.css` | `.spheres-grid` override + all `.sph-*` classes |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-17 | 1.0 | Initial draft | Bob + Mary (claude-sonnet-4-6) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- Replaced local `esc()` with imported version from helpers.js
- Added `avatarUrl()` helper (hash fallback pattern from status-tab.js)
- `getSpheresData()` now stores full char object in each row; sort uses `sortName`
- `renderSpherePyramid(rows, dimension)` renders apex/high/floor with avatars
- `renderSphereCard()` uses pyramid split + contacts chips; vacant check updated
- CSS: `.spheres-grid` min 380px; all `.sph-*` classes added to admin-layout.css

### File List
- public/js/admin/spheres-view.js
- public/css/admin-layout.css
- specs/stories/feature.58.sphere-card-pyramid.story.md
