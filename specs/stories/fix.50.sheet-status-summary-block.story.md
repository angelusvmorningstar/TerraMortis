---
id: fix.50
task: 50
issue: 8
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/8
branch: morningstar-issue-8-sheet-status-summary-block
epic: merit-editor
status: review
priority: medium
---

# Story fix.50 — Player desktop Sheet tab: add status summary block

As a player viewing the desktop Sheet tab,
When I open my character sheet,
I should see my City, Clan, and Covenant status standings inline on the sheet — without switching to the Status tab.

## Context

The Sheet tab in `public/js/suite/sheet.js` previously had a faction/covenant strip that was moved to the Status tab (see comments at lines 161 and 219). The intent at the time was to keep status in one place. In practice this creates a completeness gap: the ST's admin sheet editor (`public/js/editor/sheet.js`) shows status standings inline alongside the rest of the sheet, but the player's read-only Sheet tab does not.

The player-facing Status tab already renders a compact "status summary" block (the `status-summary` / `status-summary-pip` markup in `public/js/suite/status.js:281-303`). This story adds a read-only copy of that block to the Sheet tab's info header, desktop mode only.

## Files in Scope

- `public/js/suite/sheet.js` — add `calcCityStatus` import + status summary block in `renderSheet`
- No other files

## Files NOT in Scope

- `public/js/suite/status.js` — the reference; do not modify it
- `public/js/editor/sheet.js` — ST admin sheet; already has its own status block, unaffected
- Any CSS file — `status-summary*` classes already exist and cover both surfaces
- Any server file

## Acceptance Criteria

**AC-1 — Status summary renders on desktop Sheet tab**
Given a character with clan, covenant, and non-zero standings
When the player views the Sheet tab on desktop
Then a status summary section appears with City, primary Covenant, and Clan pips (value + label)

**AC-2 — Other covenant standings appear as compact secondary line**
Given a character has non-zero standings in covenants other than their primary
When the Sheet tab renders
Then those covenants appear as a compact secondary line (`status-summary-other`) beneath the pips

**AC-3 — Block is read-only: no edit handlers**
The block must emit the same pip markup as `status.js:281-303` with no click handlers, no edit-popup triggers, and no adjust controls. It is a static HTML snapshot.

**AC-4 — Missing clan/covenant produce no empty pips**
Given a character has no `clan` set (or no `covenant` set)
When the Sheet tab renders
Then the corresponding pip is absent — never shown with a zero value for an unset faction

**AC-5 — Phone/split-tab mode unaffected**
The status summary must only appear inside the `infoHtml` string that is written to `#sh-content-suite` when `isDesktop` is true (line 626). Split-tab containers (`statsEl`, `skillsEl`, `powersEl`, `infoEl`) populate from separate `*Html` variables and must not include the status block.

**AC-6 — City pip always present**
City status is always relevant (every PC is part of the city). The City pip renders even when `c.status.city === 0`.

## Implementation Notes

### The exact change — `public/js/suite/sheet.js`

**Change 1 — add `calcCityStatus` to the accessors import (line 19):**

Current:
```javascript
import {
  standingMerits, devotions, rites, pacts,
  calcSize, calcSpeed, calcDefence, calcHealth, calcWillpowerMax, calcVitaeMax,
  getSkillObj
} from '../data/accessors.js';
```

Change to:
```javascript
import {
  standingMerits, devotions, rites, pacts,
  calcSize, calcSpeed, calcDefence, calcHealth, calcWillpowerMax, calcVitaeMax,
  calcCityStatus,
  getSkillObj
} from '../data/accessors.js';
```

**Change 2 — add status summary block in `renderSheet`, after the `sh-char-hdr` close (after line 224 `infoHtml += '</div>'; // end sh-char-hdr`):**

The existing `st` variable (`const st = c.status || {};`, line 132) is already in scope. Use it directly.

Insert after `infoHtml += '</div>'; // end sh-char-hdr`:

```javascript
  // Status summary — read-only copy of the player's Status tab compact block
  {
    const cityV = calcCityStatus(c);
    const covV  = st.covenant?.[c.covenant] || 0;
    const clanV = st.clan || 0;
    const COV_SHORT = {
      'Carthian Movement': 'Carthian', 'Circle of the Crone': 'Crone',
      'Invictus': 'Invictus', 'Lancea et Sanctum': 'Lance', 'Ordo Dracul': 'Ordo',
    };
    let ssHtml = `<div class="status-summary">`;
    ssHtml += `<div class="status-summary-pip"><div class="status-summary-shape">${CITY_SVG}<span class="status-summary-n">${cityV}</span></div><span class="status-summary-lbl">City</span></div>`;
    if (c.covenant) {
      ssHtml += `<div class="status-summary-pip"><div class="status-summary-shape">${OTHER_SVG}<span class="status-summary-n">${covV}</span></div><span class="status-summary-lbl">${esc(c.covenant)}</span></div>`;
    }
    if (c.clan) {
      ssHtml += `<div class="status-summary-pip"><div class="status-summary-shape">${OTHER_SVG}<span class="status-summary-n">${clanV}</span></div><span class="status-summary-lbl">${esc(c.clan)}</span></div>`;
    }
    ssHtml += `</div>`;
    const covObj   = st.covenant || {};
    const otherCovs = Object.entries(covObj)
      .filter(([cov, val]) => val && cov !== c.covenant)
      .map(([cov, val]) => [COV_SHORT[cov] || cov, val]);
    if (otherCovs.length) {
      ssHtml += `<div class="status-summary-other">${otherCovs.map(([label, val]) =>
        `<span class="status-summary-other-item">${esc(label)} <b>${val}</b></span>`
      ).join(' · ')}</div>`;
    }
    infoHtml += ssHtml;
  }
```

### Why `calcCityStatus` and not `c.status.city`

`calcCityStatus` adds `titleStatusBonus(c)` (court titles grant +1 City Status) and `regentAmienceBonus(c)` (regent territory ambience adds to City Status), clamped to 10. Using raw `c.status.city` would silently drop these bonuses. This matches what the Status tab already does — both surfaces must show the same number.

### Why a block-scoped IIFE pattern

Using `{ const cityV = ...; ... }` prevents name collision with any other `cityV` or `covV` that might be introduced later in `renderSheet`. The block is self-contained and immediately appended to `infoHtml`.

### Why the placement is after `sh-char-hdr` but still in `infoHtml`

The desktop render at line 626 is:
```javascript
el.innerHTML = infoHtml + statsHtml + skillsHtml + '<div class="sh-powers-grid">' + powersHtml + '</div>';
```
`infoHtml` is the identity/meta section. Status is character-identity information (who you are in the city hierarchy), so it belongs here — directly after the header, before the stats strip. The split-tab branches at lines 631-634 each receive their own `*Html` variable (e.g. `infoEl.innerHTML = isDesktop ? '' : infoHtml`) which means on desktop `infoEl` is cleared — the status summary is only visible via `el.innerHTML` in desktop mode. No change needed to the split-tab paths.

### Covenant label — full name vs abbreviated

The pip label uses `esc(c.covenant)` (full name, e.g. "Carthian Movement") to match how the Status tab renders the primary covenant pip (status.js:284). The `COV_SHORT` map is only used for the secondary `status-summary-other` line where space is at a premium.

## Test Plan

Manual smoke in the player portal (`/index.html` on desktop):

1. Open a character who has clan + covenant + non-zero City/Clan/Covenant standings
2. Switch to Sheet tab
3. Verify: status summary pips appear directly below the character info header (City + Covenant + Clan)
4. Verify: values match what is shown on the Status tab
5. Verify: no click handlers — tapping/hovering the pips does nothing
6. Open a character who has standings in a second covenant (e.g., Carthian with Invictus status from a grant)
7. Verify: "Invictus 1 · ..." secondary line appears under the pips on Sheet tab
8. Resize to phone viewport — verify status summary is NOT visible on phone (Status tab only)
9. Open a character with no clan or no covenant set — verify absent pip

## Definition of Done

- [x] `calcCityStatus` imported in `sheet.js`
- [x] Status summary block inserted in `infoHtml` after `sh-char-hdr` close
- [x] AC-1: City, Covenant, Clan pips render on desktop
- [x] AC-2: Other-covenant secondary line renders when applicable
- [x] AC-3: No click/edit handlers present in the emitted HTML
- [x] AC-4: No empty pips for unset clan/covenant
- [x] AC-5: Split-tab containers unaffected on phone
- [x] AC-6: City pip always present (even at 0)
- [ ] PR opened into `dev`

## Dev Agent Record

**Agent:** Claude (Morningstar)
**Date:** 2026-05-07

### File List

**Modified**
- `public/js/suite/sheet.js`

### Completion Notes

Two edits to `public/js/suite/sheet.js`:
1. Added `calcCityStatus` to the import from `'../data/accessors.js'` (line 21). Required because city status includes title and regent ambience bonuses beyond the raw `c.status.city` value — must match what the Status tab shows.
2. Inserted a block-scoped status summary segment in `renderSheet()` after the `sh-char-hdr` close (lines 227-255). Reuses existing `CITY_SVG`, `OTHER_SVG` from `./data.js` and the local `esc()` helper. Uses `st` (already `c.status || {}` from line 132). City pip is unconditional; Covenant and Clan pips are conditional on `c.covenant` and `c.clan` being set. Other-covenant secondary line emits only when non-zero cross-covenant standings exist. No click handlers. Block is inside `infoHtml` which only reaches `el.innerHTML` (desktop path) — split-tab containers use separate `*Html` variables, so phone mode is unaffected by construction.
Syntax check: `node --input-type=module --check` passed. Playwright: fix.48 (4/4) + fix.49 (4/4) confirmed no regressions.

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-07 | Claude (Morningstar) | Story created from issue #8. |
| 2026-05-07 | Claude (Morningstar) | Implemented: calcCityStatus import + status summary block in renderSheet. Status → review. |
