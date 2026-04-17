# Story: Feed Roller — Harmonise or Remove

**Story ID:** lst.2
**Epic:** Live Session Toolkit — Game App QoL
**Status:** ready-for-dev
**Date:** 2026-04-18

---

## User Story

As an ST running a game night, I want the feeding test in the game app Roll tab to use the same method definitions and pool-building logic as the player portal, so there is one consistent implementation of feeding rather than two that can drift.

---

## Background & Diagnosis

Two separate feeding implementations exist:

| Location | File | Format |
|---|---|---|
| Player portal | `public/js/player/feeding-tab.js` | **Canonical** — reads declared method from DT submission, falls back to picker. Tested and working. **DO NOT TOUCH.** |
| Game app Roll tab | `public/js/suite/tracker-feed.js` | Standalone ST tool — 5 method cards, territory selector, builds pool from character stats |

### Key finding: constants are already shared

`FEED_METHODS` and `TERRITORY_DATA` are defined once in `public/js/player/downtime-data.js` (lines 70 and 88).

`tracker-feed.js` has its own hardcoded duplicates:
- `FEED_METHODS` — identical structure, same 5 methods, different variable
- `FEED_TERRS` — same territory data as `TERRITORY_DATA`, different name

This duplication is the root problem. If territory ambience values change, they must be updated in two places.

### Tracker dependency

`tracker-feed.js` currently calls `stGetTracker`/`stSetTracker` from `public/js/suite/tracker.js` (legacy, name-keyed localStorage). Once **lst.3** (tracker migration) ships, `feedApplyVitae()` must use `trackerAdj` from the canonical `public/js/game/tracker.js` instead.

**This story does not implement that switch** — that happens in lst.3. This story only harmonises the constants and pool logic.

---

## Decision Gate

Attempt harmonisation. If the changes are clean and contained to `tracker-feed.js` with no risk to `player/feeding-tab.js`, ship it. If at any point the implementation requires touching `feeding-tab.js` or its imports, **stop and remove the game app feed roller instead**.

The player portal feeding tab is the canonical feed roll. It must not be touched.

---

## Tasks

### Task 1 — Replace duplicated constants

In `public/js/suite/tracker-feed.js`:

**Remove** the `FEED_METHODS` array (lines defining seduction, stalking, force, familiar, intimidation).
**Remove** the `FEED_TERRS` array.

**Add import** at the top of the file:
```js
import { FEED_METHODS, TERRITORY_DATA } from '../player/downtime-data.js';
```

**Update all references** to `FEED_TERRS` → `TERRITORY_DATA`. The structure is the same; only the variable name differs. Verify field names match — `downtime-data.js` uses `ambienceBonus` while `tracker-feed.js` uses `ambienceMod`. Align to whichever the shared file uses.

### Task 2 — Verify pool-building still works

After the import swap, test that:
- Method cards still render correctly in the Roll tab
- Territory dropdown still populates
- Pool calculation still produces correct totals (attr + skill + disc + ambience mod)
- Discipline selector still filters to disciplines the character has

No logic changes to pool building — only the data source changes.

### Task 3 — Update `feedApplyVitae` comment (not logic)

`feedApplyVitae()` currently calls `stSetTracker` from the legacy tracker. Add a `// TODO: lst.3 — replace with trackerAdj from game/tracker.js` comment so the migration point is explicit. Do not change the logic here — lst.3 owns that.

### Task 4 — Remove FEED_METHODS and FEED_TERRS from exports

`tracker-feed.js` currently exports `FEED_METHODS` and `FEED_TERRS`. After importing from `downtime-data.js`, these no longer need to be re-exported from this file. Remove them from the export block (they are already exported from `downtime-data.js` directly).

---

## Abort Condition

If at any point Task 1 or 2 requires:
- Importing from `feeding-tab.js`
- Modifying `feeding-tab.js` or `downtime-data.js`
- Changing the pool formula to match the player portal (which reads from DT submission)

**Stop. Delete the feed-section from `index.html` and remove `tracker-feed.js` imports from `app.js` instead.**

The game app Roll tab feeding test is a convenience tool. If it can't be harmonised cleanly, it is better removed than maintained as a divergent implementation.

---

## Acceptance Criteria

**If harmonised:**
- [ ] `tracker-feed.js` imports `FEED_METHODS` and `TERRITORY_DATA` from `public/js/player/downtime-data.js`
- [ ] No hardcoded `FEED_METHODS` or `FEED_TERRS` remain in `tracker-feed.js`
- [ ] All 5 method cards render correctly in the Roll tab
- [ ] Territory dropdown populates and ambience modifier applies correctly
- [ ] Pool totals match expected values for a test character
- [ ] `feeding-tab.js` is untouched

**If removed:**
- [ ] `feed-section` removed from `index.html`
- [ ] `tracker-feed.js` imports removed from `app.js`
- [ ] `feedToggle`, `feedInit`, `feedBuildPool`, `feedRoll`, `feedReset`, `feedAdjApply`, `feedApplyVitae`, `feedSelectMethod`, `feedClearState` no longer exposed on `window` or called anywhere

---

## Files Likely Involved

| File | Expected change |
|---|---|
| `public/js/suite/tracker-feed.js` | Remove hardcoded constants, add import from `downtime-data.js` |
| `public/js/player/downtime-data.js` | Read-only reference — do not modify |
| `public/js/app.js` | Only if removing: strip imports and window exposures |
| `public/index.html` | Only if removing: strip `feed-section` HTML |

---

## Critical Constraints

- **`public/js/player/feeding-tab.js` must not be touched at all** — not read, not imported from, not modified.
- **`public/js/player/downtime-data.js` must not be modified** — it is the shared source, treat it as read-only.
- The tracker write in `feedApplyVitae()` is intentionally left using legacy `stSetTracker` — that migration belongs to lst.3.
- British English in all UI strings: "Successes", "Vessels", "Vitae".

---

## Reference

- SSOT: `specs/reference-data-ssot.md` — feeding constants SSOT is `public/js/player/downtime-data.js`
- Tracker SSOT after lst.3: `public/js/game/tracker.js` + `/api/tracker_state`
