---
issue: 356
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/356
also_closes: 357
also_closes_url: https://github.com/angelusvmorningstar/TerraMortis/issues/357
branch: ms/issue-356-357-spheres-allies-contacts
status: review
---

# Story: Spheres View — Allies Tier Containers + Contacts Section Fixes

Closes #356 and #357.

## What We're Building

Two improvements to `public/js/admin/spheres-view.js`:

1. **#356 — Allies column:** Restructure the "floor" tiers (ratings 1–3, and also audit 4) so that each dot-rating gets its own visual container. Rank number is prominent at the top, one name per row beneath it, no honorifics, alphabetical, row-banded. No Discord avatars anywhere in the Allies column.

2. **#357 — Contacts section:** Fix a data aggregation bug where Contacts merits that use the modern `spheres` array are not wiring up. Also remove the Discord avatar from each contact chip; use bare name (no honorific).

---

## Files

| File | Change |
|------|--------|
| `public/js/admin/spheres-view.js` | Logic fixes — data aggregation + floor render + chip render |
| `public/css/admin-layout.css` | New `.sph-tier-*` classes; adjust `.sph-contact-chip` padding |

---

## Issue #356 — Allies Tier Containers

### What changes and why

Currently `renderSpherePyramid()` (line 124) handles ratings like this:

- **Rating 5 (apex):** own box with Discord avatar, name, "5" label — fine layout.
- **Rating 4 (high seats):** own box with Discord avatar, name, "4" label — fine layout.
- **Rating <4 (floor, lines 168–184):** ALL lower tiers grouped in a single `.sph-floor` block. Each group renders `●●●○○` dot symbols followed by name(s) on the **same line** via `flex-wrap`. Names include full `displayName()` (with honorific).

The request is to extend the "own container per tier" treatment down through all ratings, and strip Discord icons from the whole Allies column.

### Implementation

#### spheres-view.js — replace the floor block and remove avatars

**Remove Discord avatar from apex** (lines 142–143). Current:
```js
h += `<img class="sph-apex-avatar" src="${esc(avatarUrl(apex.c))}" alt="" loading="lazy">`;
h += `<div class="sph-apex-info">`;
h += `<span class="sph-apex-name">${esc(displayName(apex.c))}</span>`;
h += `<span class="sph-apex-dots">●●●●●</span>`;
h += `</div>`;
h += `<span class="sph-apex-val">5</span>`;
```
Replace with (no img, no dot-symbol line, name uses no-honorific pattern):
```js
h += `<div class="sph-apex-info">`;
h += `<span class="sph-apex-name">${esc(apex.c.moniker || apex.c.name)}</span>`;
h += `</div>`;
h += `<span class="sph-apex-val">5</span>`;
```

**Remove Discord avatar from high seats** (lines 157–159). Current:
```js
h += `<img class="sph-high-avatar" src="${esc(avatarUrl(r.c))}" alt="" loading="lazy">`;
h += `<span class="sph-high-name">${esc(displayName(r.c))}</span>`;
h += `<span class="sph-high-val">4</span>`;
```
Replace with:
```js
h += `<span class="sph-high-val">4</span>`;
h += `<span class="sph-high-name">${esc(r.c.moniker || r.c.name)}</span>`;
```
(Val first so the number anchors top-left of the column card, name beneath.)

**Replace the entire floor block** (lines 168–184). Current:
```js
if (floor.length) {
  h += `<div class="sph-floor">`;
  const groups = [];
  for (const r of floor) {
    const last = groups[groups.length - 1];
    if (last && last.val === r[dimension]) last.items.push(r);
    else groups.push({ val: r[dimension], items: [r] });
  }
  for (const g of groups) {
    h += `<div class="sph-floor-bracket">`;
    h += `<span class="sph-floor-dots">${'●'.repeat(g.val)}${'○'.repeat(5 - g.val)}</span>`;
    for (const r of g.items) h += `<span class="sph-floor-name">${esc(displayName(r.c))}</span>`;
    h += `</div>`;
  }
  h += `</div>`;
}
```
Replace with tier-container approach:
```js
if (floor.length) {
  // Group by dot value descending (floor is already sorted desc by holders filter)
  const groups = [];
  for (const r of floor) {
    const last = groups[groups.length - 1];
    if (last && last.val === r[dimension]) last.items.push(r);
    else groups.push({ val: r[dimension], items: [r] });
  }
  for (const g of groups) {
    // Sort names alphabetically within each tier
    g.items.sort((a, b) => (a.c.moniker || a.c.name).localeCompare(b.c.moniker || b.c.name));
    h += `<div class="sph-tier-block">`;
    h += `<div class="sph-tier-num">${g.val}</div>`;
    for (const r of g.items) {
      h += `<div class="sph-tier-row">${esc(r.c.moniker || r.c.name)}</div>`;
    }
    h += `</div>`;
  }
}
```

Note: the existing `holders` sort at line 127 sorts by dot-count desc, then sortName. That means groups are already in descending order. The per-group alpha sort above overrides the within-group sort to be alphabetical (not dot-count, since all items in a group share the same dot value).

#### admin-layout.css — new tier classes

Add after the existing `.sph-floor-name` rule (currently line 1135), before `.sph-contacts-section`:

```css
.sph-tier-block {
  background: var(--surf2);
  border: 1px solid var(--bdr);
  border-radius: 4px;
  overflow: hidden;
}
.sph-tier-num {
  font-family: var(--fl);
  font-size: 18px;
  font-weight: 600;
  color: var(--accent);
  padding: 4px 8px 2px;
  line-height: 1;
}
.sph-tier-row {
  font-size: 11px;
  color: var(--txt1);
  padding: 3px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sph-tier-row:nth-child(even) { background: var(--surf3); }
```

The old `.sph-floor`, `.sph-floor-bracket`, `.sph-floor-dots`, `.sph-floor-name` classes become dead code. Leave them in CSS for now (safe to prune later).

---

## Issue #357 — Contacts Data Bug + Chip Fixes

### Root cause

`getSpheresData()` line 76:
```js
const raw = (m.area || m.qualifier || '').toString();
```

This reads `m.area` or `m.qualifier` for ALL merits before the `if (m.name === 'Contacts')` check. The modern Contacts merit schema stores sphere assignments in `m.spheres` array (e.g. `{ name: 'Contacts', rating: 2, spheres: ['Health', 'Politics'] }`). If a character's Contacts merit only has `m.spheres` — no `m.area`, no `m.qualifier` — then `raw` is `''`, nothing enters the loop, and the character never appears in that sphere's Contacts section. This is Keeper's situation.

### Data aggregation fix (spheres-view.js lines 79–84)

Replace:
```js
if (m.name === 'Contacts') {
  for (const part of raw.split(',')) {
    const key = normaliseSphere(part);
    if (!key) continue;
    ensureRow(key, c).hasContacts = true;
  }
}
```
With:
```js
if (m.name === 'Contacts') {
  const parts = [];
  if (raw) parts.push(...raw.split(','));
  if (Array.isArray(m.spheres)) parts.push(...m.spheres.filter(Boolean));
  for (const part of parts) {
    const key = normaliseSphere(part);
    if (!key) continue;
    ensureRow(key, c).hasContacts = true;
  }
}
```

This covers all three storage shapes:
- Legacy: `m.area = 'Health'` → raw = `'Health'`
- Legacy comma: `m.qualifier = 'Health, Politics'` → raw = `'Health, Politics'`
- Modern: `m.spheres = ['Health', 'Politics']`

Deduplication is not strictly needed here (adding the same hasContacts = true twice is harmless) but `normaliseSphere` will canonicalise any duplicates anyway.

### Chip render fix (spheres-view.js lines 212–216)

Remove the Discord avatar img and strip honorific from name. Current:
```js
h += `<div class="sph-contact-chip">`;
h += `<img class="sph-contact-avatar" src="${esc(avatarUrl(r.c))}" alt="" loading="lazy">`;
h += `<span class="sph-contact-name">${esc(displayName(r.c))}</span>`;
h += `</div>`;
```
Replace with:
```js
h += `<div class="sph-contact-chip">`;
h += `<span class="sph-contact-name">${esc(r.c.moniker || r.c.name)}</span>`;
h += `</div>`;
```

### CSS — adjust chip padding

The current chip padding `2px 8px 2px 3px` was designed for an avatar on the left. Without the avatar, make it symmetric:

In `admin-layout.css` at line 1147, change:
```css
padding: 2px 8px 2px 3px;
```
to:
```css
padding: 2px 8px;
```

---

## Name display pattern — no honorific

Throughout both fixes, the pattern for name display is:
```js
esc(r.c.moniker || r.c.name)
```

Do NOT use `displayName(r.c)` (adds honorific, e.g. "Regent Alice Vunder").
Do NOT use `sortName(r.c)` (returns lowercase — sort-order key only, not for rendering).

`displayName` and `sortName` are defined in `public/js/data/helpers.js:115` and `131` respectively.

---

## Dead code after this story

- `avatarUrl()` function (lines 14–24): no longer called from within this file. Check if used elsewhere before removing. If this is the only caller, it can be deleted.
- `.sph-apex-avatar`, `.sph-high-avatar` CSS classes: no longer referenced in HTML output.
- `.sph-floor`, `.sph-floor-bracket`, `.sph-floor-dots`, `.sph-floor-name` CSS classes: replaced by `.sph-tier-*`.
- `.sph-contact-avatar` CSS class: no longer referenced.

Leave removal of dead CSS/JS for a separate cleanup pass. Don't let it block this story.

---

## Acceptance Criteria

### #356 — Allies
- [x] Floor ratings 3, 2, 1 each render as a separate `.sph-tier-block` container.
- [x] The rank number is the first element in each tier container and is on its own row (does not share a row with any name).
- [x] Names use `moniker || name` (no honorific).
- [x] Names within each tier are sorted alphabetically (case-insensitive).
- [x] Alternating rows are visually banded (even rows lighter).
- [x] No Discord/avatar image appears anywhere in the Allies column (apex, high seats, floor).
- [x] Empty ratings produce no container (only tiers with ≥1 character appear).

### #357 — Contacts
- [x] Keeper appears in the Health sphere's CONTACTS section.
- [x] A character with multiple Contacts merits (or one Contacts merit with multiple spheres) gets a chip in each applicable sphere's CONTACTS section.
- [x] No Discord/avatar image appears on any contact chip.
- [x] Each character gets their own chip (no merging).
- [x] Names on chips use `moniker || name` (no honorific).

---

## Manual Test Plan

1. Open admin → City → Spheres tab.
2. Find a sphere where Keeper has Contacts (Health): verify Keeper chip appears.
3. Find any sphere with floor Allies (ratings 1–3): verify per-tier containers with prominent number and banded rows.
4. Verify no Discord icons appear in Allies or Contacts sections.
5. Confirm apex (5) and high seats (4) still show correctly (layout reflow, no broken boxes).
6. Check a vacant sphere card: "No current holders" still displays.
