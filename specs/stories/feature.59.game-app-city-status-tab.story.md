# Story: Game App City Status Tab

**Story ID:** feature.59  
**Epic:** Game App Quality of Life  
**Status:** ready-for-dev  
**Date:** 2026-04-17

---

## User Story

As a player or ST using the game app at the live table, I want a City Status tab that shows city ranking, then covenant standings, then clan standings in a single-column mobile-friendly layout, so I can quickly check where everyone sits in the hierarchy without switching to the player portal.

---

## Acceptance Criteria

1. **New tab** — A "Status" tab (`t-status` / `n-status`) appears in the bottom nav for all logged-in users (both `st` and player roles).
2. **Section order** — City Status first (full width), then Covenant(s) (full width), then Clan(s) (full width), all stacked vertically. No horizontal split.
3. **City section** — Tier rows 10, 9, 8 always rendered (vacant if empty); all lower tiers below as compact bracket rows.
4. **Covenant / Clan sections** — Tier rows 5, 4 always rendered (vacant if empty); lower tiers as bracket rows.
   - **Player role**: one covenant section (their covenant only) + one clan section (their clan only).
   - **ST role**: all covenants as separate sections + all clans as separate sections (each full-width, stacked).
5. **Active character highlighting** — If `suiteState.rollChar` is set, that character's row gets the gold accent highlight (`status-slot-me` class equivalent). If no character is selected, no highlighting.
6. **Data source** — Tab calls `/api/characters/status` fresh each time it opens (same endpoint as player portal status tab). Do not reuse `suiteState.chars` — the status endpoint returns `_player_info` (avatar data) which the standard chars endpoint does not.
7. **CSS self-contained** — All `.status-*` classes needed are ported into `suite.css`. The game app does not load `player-layout.css`. Do not add `player-layout.css` to `index.html`.
8. **No overflow split** — Do not use `.status-split` (two-column flex). All sections are single-column, full width.
9. **Loading / error states** — Show a `placeholder-msg` "Loading…" while fetching, and a readable error message if the API call fails.
10. **Nav icon** — Use a diamond/city SVG (see existing `OTHER_SVG` or compose a simple icon inline; match the style of existing `#bnav` buttons).

---

## Implementation Plan

### 1. New JS module: `public/js/suite/status.js`

Port `public/js/player/status-tab.js` with these changes:

**Keep unchanged:**
- `avatarUrl(c)` helper
- `statusDots(n, max)` / `cityStatusDots(c)`
- `renderChip(c, isMe)`
- `renderTierRow(val, chars, activeId, dotsFn)` — renders one bracket row (fixed tier, always shown)
- `renderCitySection(chars, activeId)` — full city section (tiers 10/9/8 + floor)
- `renderStatusSection(heading, headingIcon, rows, activeId, placeholder)` — single col section

**Change:**
- Export a new function `renderSuiteStatusTab(el)` instead of `renderStatusTab(el, activeChar, isST)`:
  ```js
  export async function renderSuiteStatusTab(el) {
    if (!el) return;
    el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

    let chars;
    try {
      chars = await apiGet('/api/characters/status');
    } catch (err) {
      el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
      return;
    }

    const activeChar = suiteState.rollChar || null;
    const activeId   = activeChar ? String(activeChar._id) : '';
    const isST       = getRole() === 'st';

    let h = renderCitySection(chars, activeId);

    if (isST) {
      // All covenants, then all clans — each full-width
      const covenants = [...new Set(chars.map(c => c.covenant).filter(Boolean))].sort();
      for (const cov of covenants) {
        const rows = chars
          .filter(c => c.covenant === cov)
          .map(c => ({ c, val: c.status?.covenant || 0 }))
          .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));
        h += renderStatusSection(cov, covIcon(cov, 18), rows, activeId, '');
      }
      const clans = [...new Set(chars.map(c => c.clan).filter(Boolean))].sort();
      for (const clan of clans) {
        const rows = chars
          .filter(c => c.clan === clan)
          .map(c => ({ c, val: c.status?.clan || 0 }))
          .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));
        h += renderStatusSection(clan, clanIcon(clan, 18), rows, activeId, '');
      }
    } else {
      // Player: their covenant first, then their clan
      const covRows = activeChar
        ? chars.filter(c => c.covenant && c.covenant === activeChar.covenant)
              .map(c => ({ c, val: c.status?.covenant || 0 }))
              .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)))
        : [];
      const clanRows = activeChar
        ? chars.filter(c => c.clan && c.clan === activeChar.clan)
              .map(c => ({ c, val: c.status?.clan || 0 }))
              .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)))
        : [];
      h += renderStatusSection(
        activeChar?.covenant || 'No covenant',
        activeChar?.covenant ? covIcon(activeChar.covenant, 18) : '',
        covRows, activeId,
        activeChar?.covenant ? 'No other members in your covenant.' : 'No character selected.'
      );
      h += renderStatusSection(
        activeChar?.clan || 'No clan',
        activeChar?.clan ? clanIcon(activeChar.clan, 18) : '',
        clanRows, activeId,
        activeChar?.clan ? 'No other members in your clan.' : 'No character selected.'
      );
    }

    el.innerHTML = h;
  }
  ```

**Imports required in `status.js`:**
```js
import { apiGet } from '../data/api.js';
import { esc, displayName, sortName, clanIcon, covIcon, redactPlayer, discordAvatarUrl, isRedactMode } from '../data/helpers.js';
import { calcCityStatus } from '../data/accessors.js';
import suiteState from './data.js';
import { getRole } from '../auth/discord.js';
```

---

### 2. `public/index.html` changes

**Add tab div** inside `.tab-wrap`, before the closing `</div><!-- /tab-wrap -->`:
```html
<!-- ═══ STATUS TAB ═══ -->
<div id="t-status" class="tab"></div>
```

**Add nav button** inside `#bnav`, after `#n-rules` (or position as desired — suggested: after `#n-tracker` for STs, visible to all):
```html
<button class="nbtn" id="n-status" onclick="goTab('status')">
  <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
  Status
</button>
```

---

### 3. `public/js/app.js` changes

**Import at top** (in the SUITE IMPORTS section):
```js
import { renderSuiteStatusTab } from './suite/status.js';
```

**Wire in `goTab()`** — add a new branch in the tab-specific init block:
```js
if (t === 'status') renderSuiteStatusTab(document.getElementById('t-status'));
```

Place this alongside the other tab-specific `if` blocks (after `if (t === 'rules')`).

**`applyRoleRestrictions()`** — no changes needed. The status tab is visible to all roles. The rendering function itself uses `getRole()` to switch between ST and player views.

---

### 4. `public/css/suite.css` — Port status CSS

Copy the `.status-*` CSS block from `player-layout.css` into `suite.css`. The full block to copy spans from `.status-split` through to the end of the status section (search for `/* END status */` or use the `.status-city-section` block as a boundary). Key classes needed:

- Layout wrappers: `.status-city-section`, `.status-section-head`, `.status-section-title`, `.status-section-caps`
- Column: `.status-col`, `.status-col-head`
- Brackets: `.status-brackets`, `.status-bracket`, `.status-bracket-fixed`, `.status-bracket-head`, `.status-bracket-dots`, `.status-bracket-val`, `.status-bracket-chips`
- Chips: `.status-chip`, `.status-chip-avatar`, `.status-chip-name`, `.status-chip-me`, `.status-vacant-chip`
- Apex/high cards: `.status-apex`, `.status-apex-avatar`, `.status-apex-info`, `.status-apex-name`, `.status-apex-title`, `.status-apex-player`, `.status-apex-score`, `.status-apex-dots`, `.status-apex-val`, `.status-high` and all its children, `.status-vacant`, `.status-vacant-label`, `.status-slot-me`

**Override for mobile**: Add this after the ported block so sections never go side-by-side:
```css
/* Suite status — single column, no horizontal split */
#t-status .status-col   { min-width: 0; width: 100%; }
#t-status .status-split { flex-direction: column; gap: 8px; padding: 8px; }
```

The city section and each clan/covenant section renders as individual `.status-col` blocks — no wrapper needed; they just stack naturally in the `#t-status` tab's vertical flow.

---

## Files to Change

| File | Change |
|---|---|
| `public/js/suite/status.js` | **NEW** — ported + adapted from `status-tab.js` |
| `public/index.html` | Add `t-status` tab div + `n-status` nav button |
| `public/js/app.js` | Import `renderSuiteStatusTab`; wire into `goTab()` |
| `public/css/suite.css` | Port `.status-*` CSS block; add single-column overrides |

---

## Critical Constraints

- **Do not load `player-layout.css` in `index.html`** — it is the player portal stylesheet, not the game app stylesheet. Copy only the needed CSS blocks into `suite.css`.
- **Do not use `.status-split` as a two-column flex** in the game app — all sections stack vertically. The class may exist in the ported CSS but should be overridden or not used in the rendered HTML.
- **Do not reuse `suiteState.chars`** for the status render — the `/api/characters/status` endpoint returns `_player_info` with Discord avatar data that the standard character endpoint does not include.
- **`status.js` must not import from `player-layout.css`** — CSS is separate concern. Just produce the HTML; CSS is handled in `suite.css`.
- **`renderSuiteStatusTab` is called fresh on every tab open** — no caching. The tab div starts empty; `goTab('status')` triggers a fresh API fetch each time.
- **Dot display**: `statusDots(n, max)` in the existing code uses `●` for filled and `○` for empty (to show rank context). This is intentional for the status context where you want to see the maximum (10 for city, 5 for clan/cov) — it is NOT the same as the merit/attribute dot display where `○` means bonus only. Preserve this behaviour exactly as-is from the original.
- **British English** — "Vacant", "Loading", "No character selected." — all already match. No changes needed.

---

## Reference

- Existing implementation: `public/js/player/status-tab.js` — this is the canonical reference. Port it faithfully; the rendering logic is already correct.
- Status CSS: `public/css/player-layout.css` lines 3490–3850 approx — copy these classes into `suite.css`.
- Game app tab pattern: look at how `t-tracker` and `t-rules` are wired in `index.html` + `app.js` — `status` follows the exact same pattern.
- `goTab()` tab-specific init block: `public/js/app.js` lines 199–217 — add `if (t === 'status')` here.
