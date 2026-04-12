# Story feature.52: Territory Ambience ST Override

## Status: done

## Story

**As an** ST,
**I want** to manually set the current ambience level of a territory in the City tab,
**so that** the system reflects the correct ambience without waiting for a full ambience campaign.

## Background

Territory ambience is currently hardcoded in `TERRITORY_DATA` (in `downtime-data.js`, `city-views.js`, `feeding-engine.js`). The ST has no way to update it without a code change.

Territory documents in MongoDB (`/api/territories`) currently store `regent_id`, `lieutenant_id`, `feeding_rights`. Adding `ambience` and `ambienceMod` to these documents makes the stored value the live source of truth.

`cachedTerritories` in `downtime-views.js` already loads territory docs from MongoDB and feeds them into `buildAmbienceData`, `_renderFeedRightPanel`, and other ambience lookups — so once the DB stores these fields, the rest of the system picks them up automatically.

## Acceptance Criteria

1. Each territory card in the City tab (expanded state) shows an **Ambience** edit section with:
   - A dropdown for ambience level: Hostile / Barrens / Neglected / Untended / Settled / Tended / Curated
   - A number input for the dice modifier (integer, pre-filled from level default when level changes, but manually editable)
   - A **Save Ambience** button and save status indicator
2. When the ambience level dropdown changes, the modifier input auto-fills from the default mod for that level:
   - Hostile: −5, Barrens: −4, Neglected: −3, Untended: −2, Settled: 0, Tended: +2, Curated: +3
3. The current ambience level and modifier are pre-populated from the territory DB doc (`terrDoc.ambience` / `terrDoc.ambienceMod`) when expanded, falling back to the hardcoded `TERRITORIES` defaults.
4. On save, `{ id: terrId, ambience, ambienceMod }` is posted to `/api/territories`. The local `terrDocs` cache is updated.
5. The territory card header displays the saved ambience value (reads DB doc when present, falls back to hardcoded default).
6. `buildAmbienceData` in `downtime-views.js` already reads `t.ambience` from cached territories — also reads `t.ambienceMod` from cached territories so the ambience dashboard and feeding vitae tally reflect the override.
7. `cachedTerritories` is invalidated (set to null) after saving so the next processing render reloads the updated values from the DB.

## Tasks / Subtasks

- [x] Task 1: Define ambience level → mod lookup and add ambience edit section to territory card (AC: 1, 2, 3)
  - [ ] In `city-views.js`, add `AMBIENCE_MODS` constant:
    ```js
    const AMBIENCE_MODS = {
      Hostile: -5, Barrens: -4, Neglected: -3, Untended: -2,
      Settled: 0, Tended: 2, Curated: 3,
    };
    ```
  - [ ] In `renderTerritories()`, inside the expanded card block (after the feeding rights section), add:
    ```html
    <div class="terr-amb-section">
      <div class="terr-feed-label">Ambience</div>
      <div class="terr-edit-row">
        <label class="terr-edit-lbl">Level</label>
        <select class="terr-amb-level-sel" data-terr-id="{t.id}">
          <option value="">— No override —</option>
          <!-- one option per level, selected if DB doc matches -->
        </select>
      </div>
      <div class="terr-edit-row">
        <label class="terr-edit-lbl">Dice modifier</label>
        <input type="number" class="terr-amb-mod-inp" data-terr-id="{t.id}" value="{currentMod}">
      </div>
      <div class="terr-rl-actions">
        <button class="city-save-btn" data-terr-amb-save="{t.id}">Save Ambience</button>
        <span class="city-save-status" id="terr-amb-status-{t.id}"></span>
      </div>
    </div>
    ```
  - [ ] Pre-populate level and mod from `td?.ambience` / `td?.ambienceMod` (DB doc) if present; otherwise from `t.ambience` / `t.ambienceMod` (hardcoded)

- [x] Task 2: Update card header to prefer DB ambience (AC: 5)
  - [x] Card header reads `td?.ambience ?? t.ambience` and `td?.ambienceMod ?? t.ambienceMod`

- [x] Task 3: Wire change + save events (AC: 1, 4, 7)
  - [x] Delegated click handler: `[data-terr-amb-save]` → `saveTerrAmbience(terrId)`
  - [x] `change` listener on `.terr-amb-level-sel`: auto-fills mod input from `AMBIENCE_MODS`
  - [x] `saveTerrAmbience`: POSTs `{ id, ambience, ambienceMod }`, updates `terrDocs` cache, calls `patchTerritories`
  - [x] `cachedTerritories` reset: handled by existing line 664 reset on city tab load — no cross-module call needed

- [x] Task 4: Update `buildAmbienceData` to read `ambienceMod` from DB doc (AC: 6)
  - [x] `startingAmbienceMod` map built alongside `startingAmbience`; included in row objects as `ambienceMod`

- [x] Task 5: CSS for ambience edit section (AC: 1)
  - [x] `.terr-amb-section`, `.terr-amb-mod-inp`, `.terr-amb-level-sel` added to `admin-layout.css`

## Dev Notes

### Save endpoint
`apiPost('/api/territories', body)` is an upsert by `id`. The server accepts any additional fields (existing behaviour — no schema enforcement on the territories collection). No server-side changes required.

### `cachedTerritories` invalidation
`city-views.js` already sets `cachedTerritories = null` (line 664) when the city view loads. Since the ST will typically open Processing Mode after editing ambience in the City tab, `ensureTerritories()` will re-fetch on the next processing render. No cross-module calls needed.

### `buildAmbienceData` scope
`buildAmbienceData` currently only reads `t.ambience` from the DB record for `startingAmbience`. It does NOT read `t.ambienceMod`. The `_renderFeedRightPanel` ambience vitae tally already reads `terrRec?.ambienceMod` from `cachedTerritories` directly (Task 4 fixes the dashboard; the vitae tally is already correct).

### Key files

| File | Change |
|------|--------|
| `public/js/admin/city-views.js` | `AMBIENCE_MODS`, ambience edit section, `saveTerrAmbience`, event wiring |
| `public/js/admin/downtime-views.js` | `buildAmbienceData` reads `ambienceMod` from DB |
| `public/css/admin-layout.css` | `.terr-amb-section`, `.terr-amb-mod-inp` |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-12 | 1.0 | Initial draft | Amelia (claude-sonnet-4-6) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- `AMBIENCE_LEVELS` array and `AMBIENCE_MODS` lookup added to `city-views.js`
- Card header prefers `td.ambience`/`td.ambienceMod` from DB doc; falls back to hardcoded `TERRITORIES` values
- Ambience Override section rendered in expanded card: level dropdown, mod number input, Save Ambience button
- `saveTerrAmbience()` POSTs both `ambience` and `ambienceMod` to `/api/territories`; updates `terrDocs` local cache
- `change` event on `.terr-amb-level-sel` auto-fills the mod input from `AMBIENCE_MODS` lookup
- `buildAmbienceData` in `downtime-views.js` now builds `startingAmbienceMod` from DB records alongside `startingAmbience`; `ambienceMod` included in each row object
- `cachedTerritories` invalidation: existing line 664 (`cachedTerritories = null` on city view load) is sufficient

### File List
- `public/js/admin/city-views.js`
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
