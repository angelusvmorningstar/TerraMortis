# Story feature.54: Feeding Matrix Redesign

## Status: done

## Story

**As an** ST reviewing feeding submissions,
**I want** the Feeding Matrix to show where each character actually fed and whether they were a resident or poacher in that territory,
**so that** I can identify poaching and overfeeding at a glance.

## Background

The current matrix reads the player's self-reported residency status from their submission form. This is wrong — it shows where players *claimed* they live, not where they *fed*, and it doesn't cross-reference the authoritative residency list from the City section.

The redesigned matrix reads:
- **Where they fed** — from `responses.feeding_territories` (slug keys) or `_raw.feeding.territories` (display-name keys, legacy)
- **Whether they're a resident** — from `cachedTerritories[*].feeding_rights` (array of character `_id` strings)

Cells: **O** (fed here + resident, green) · **X** (fed here + non-resident/poacher, amber) · **—** (didn't feed here)

The Barrens column always shows X or — (never O — no residency possible there).

Territory name fixes from fix.42 are already in place. `MATRIX_TERRS` csvKeys already match the new canonical names. `LEGACY_TERR_KEY_MAP` and `_normTerrKeys()` are already in place for old submissions.

## Acceptance Criteria

1. Matrix columns: The Academy, The Harbour, The Dockyards, The Second City, The North Shore, The Barrens — in that order (no column hidden if no data; The Barrens always shown last)
2. Cell content:
   - **O** — character fed in this territory AND their `_id` is in `cachedTerritories` `feeding_rights` for that territory (green)
   - **X** — character fed in this territory AND their `_id` is NOT in `feeding_rights` (amber)
   - **—** — character did not feed in this territory (muted)
   - The Barrens column never shows O (no residents)
3. "Fed here" means: territory slug status is not `'none'`, `'Not feeding here'`, or absent
4. Residency is read from `cachedTerritories` loaded from MongoDB — the ST's feeding rights list is authoritative
5. Characters are found via `findCharacter(sub.character_name, sub.player_name)` to get their `_id`
6. Footer row shows resident count vs territory cap for the 5 real territories; Barrens footer shows `—`
7. All columns always rendered (no hiding columns with no data); rows sorted alphabetically by character name
8. Characters without submissions shown as a faded row with all `—` cells (retain existing behaviour)

## Tasks / Subtasks

- [x] Task 1: Rebuild `renderFeedingMatrix` (AC: 1–8)
  - [x] Replace the `activeCols` filter (currently hides empty columns) with the full fixed column set:
    ```js
    const cols = MATRIX_TERRS; // always all 6 columns
    ```
  - [x] Build a residency lookup from `cachedTerritories`: for each territory, map `terrId → Set<charId>`:
    ```js
    const residentsByTerrId = {};
    for (const mt of MATRIX_TERRS) {
      const terrId = TERRITORY_SLUG_MAP[mt.csvKey] ?? null;
      const td = (cachedTerritories || []).find(t => t.id === terrId);
      residentsByTerrId[mt.csvKey] = new Set(td?.feeding_rights || []);
    }
    ```
  - [x] For each submission, determine fed territories:
    - Parse `sub.responses?.feeding_territories` as JSON (slug keys) if present
    - Fall back to `_normTerrKeys(sub._raw?.feeding?.territories || {})` (display-name keys)
    - Normalise all values: status is "fed" if value is not `'none'`, `'Not feeding here'`, or empty
  - [x] For each character row, resolve `charId = String(findCharacter(sub.character_name, sub.player_name)?._id || '')`
  - [x] Render each cell:
    - Fed + resident (`residentsByTerrId[mt.csvKey].has(charId)`) + not Barrens → `O` with `dt-matrix-resident` class (green)
    - Fed + not resident (or Barrens) → `X` with `dt-matrix-poach` class (amber)
    - Not fed → `—` with `dt-matrix-empty` class
  - [x] Characters without submissions (active chars not in `submissions`) — show as faded row, all `—`
  - [x] Footer: resident count from `residentsByTerrId[mt.csvKey].size` for real territories; Barrens shows `—`
  - [x] Footer: cap from `AMBIENCE_CAP[getTerritoryAmbience(mt.ambienceKey)]`; show `count / cap`, red if over cap

- [x] Task 2: Update slug→csvKey resolution for fed-territory lookup (AC: 3)
  - [x] When reading `responses.feeding_territories` (slug keys like `the_harbour`), resolve to `MATRIX_TERRS[*].csvKey` (canonical display name) via `TERRITORY_SLUG_MAP` reverse lookup or a new `SLUG_TO_CSVKEY` map:
    ```js
    // Build once: slug → MATRIX_TERRS csvKey
    const slugToCsvKey = {};
    for (const mt of MATRIX_TERRS) {
      // Find slug(s) that map to this territory id
      const tid = TERRITORY_SLUG_MAP[mt.csvKey];
      for (const [slug, id] of Object.entries(TERRITORY_SLUG_MAP)) {
        if (id === tid && !slug.includes(' ')) slugToCsvKey[slug] = mt.csvKey;
      }
    }
    ```
  - [x] Use `slugToCsvKey[slug] ?? mt.csvKey` when mapping submission grid to column keys

- [x] Task 3: CSS updates (AC: 2)
  - [x] `.dt-matrix-resident` → green text/background
  - [x] `.dt-matrix-poach` → amber text/background  
  - [x] Update cell content: O for resident, X for poacher (replace old 'Resident'/'Poaching' text)

## Dev Notes

### `findCharacter` availability
`findCharacter(name, playerName)` is a module-level function in `downtime-views.js` that looks up in the `chars` array. Available at matrix render time.

### Slug→csvKey mapping approach
`responses.feeding_territories` stores slugs like `the_harbour`. `MATRIX_TERRS` uses canonical display names like `'The Harbour'` as csvKeys. The simplest join is: `TERRITORY_SLUG_MAP['the_harbour']` → `'harbour'` (territory id), then find `MATRIX_TERRS` entry where `TERRITORY_SLUG_MAP[mt.csvKey] === 'harbour'`.

### Active characters without submissions
`renderFeedingMatrix` currently only iterates `submissions`. For characters without submissions, add a second pass: iterate `activeChars` (already available as module-level or derivable from `chars.filter(c => !c.retired)`), find those not in `subByCharId`, render as faded `dt-matrix-nosub` rows.

### Resident count for footer
Resident count = `residentsByTerrId[mt.csvKey].size` (count of characters in the territory's `feeding_rights`, regardless of whether they submitted). This is the City section's authoritative count.

### The Barrens
`TERRITORY_SLUG_MAP['The Barrens (No Territory)']` → `null`. There is no territory doc for The Barrens, so `residentsByTerrId` for The Barrens will always be an empty Set. Cells always X or —.

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | `renderFeedingMatrix` rebuilt |
| `public/css/admin-layout.css` | Update `.dt-matrix-resident`, `.dt-matrix-poach` cell styles |

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
- `renderFeedingMatrix` fully rewritten: always renders all 6 columns, residency from `cachedTerritories.feeding_rights`, O/X/— cells
- `_getSubFedTerrs(sub)` helper added: parses slug-keyed JSON (`responses.feeding_territories`) with TERRITORY_SLUG_MAP reverse lookup; falls back to `_normTerrKeys(_raw.feeding.territories)` for legacy submissions
- Active characters without submissions rendered as faded `dt-matrix-nosub` rows (all — cells)
- Footer: resident count from `residentsByTerrKey[csvKey].size` (authoritative); Barrens always —; overcap shown in red
- The Barrens column always X or — (never O — empty Set from cachedTerritories since no territory doc)
- CSS: `.dt-matrix-resident` green (O), `.dt-matrix-poach` amber (X), `.dt-matrix-nosub` faded row, `.dt-matrix-nosub-badge` label

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `specs/stories/feature.54.feeding-matrix-redesign.story.md`
