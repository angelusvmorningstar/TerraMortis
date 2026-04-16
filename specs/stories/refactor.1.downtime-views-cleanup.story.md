# Story refactor.1: downtime-views.js Code Audit Cleanup

## Status: done

## Story

**As a** developer maintaining the downtime processing system,
**I want** the accumulated redundancy, dead code, and duplicate patterns in `downtime-views.js` removed,
**so that** the file is easier to navigate, cheaper to render, and safer to modify.

## Background

A full top-to-bottom audit of `downtime-views.js` (9,507 lines) identified dead imports, duplicate constant definitions, repeated inline patterns with no helper, and expensive operations called more often than needed. This story addresses all findings categorised as safe (dead code, constant deduplication, helper extraction) and medium-risk (duplicate HTML blocks, one extra `buildProcessingQueue` call). File splitting is deferred to a separate story.

## Acceptance Criteria

1. `DOWNTIME_SECTIONS` import is removed (unused)
2. `NARR_KEYS` is a single module-level `const` derived from `NARR_BLOCKS`; all 6 inline derivations replaced
3. Duplicate `COURT_KEYS`, `COURT_LABELS`, `MODE_LABELS` local consts collapsed to one module-level definition each
4. Duplicate `FEED_METHOD_LABELS` inline object inside `renderPlayerResponses` removed; `FEED_METHOD_LABELS_MAP` module-level map used instead
5. Local `FEED_METHODS` array (duplicate of imported `FEED_METHODS_DATA`) removed; all usages replaced with `FEED_METHODS_DATA`
6. `_fmtMod(val)` helper extracted at module level; all 10+ inline `val > 0 ? '+N' : String(val)` patterns replaced
7. `_buildSpecTogglesHtml(char, preSkill, procKey, activeSpecs, disabled)` helper extracted; both the feeding and project spec-toggle blocks in `renderActionPanel` replaced with calls to it
8. `renderFeedingMatrix` and `_buildFeedingMatrixHtml` share a common inner table builder `_buildMatrixTableHtml(chars, subByCharId, residentsByTerrKey)` — matrix-specific setup code stays in each caller, only the `<table>` generation is shared
9. `_computeRiteVitaeCost(sub, char)` and `_computeRiteWpCost(sub, char)` accept a pre-resolved char as a second parameter; all call sites updated; internal `findCharacter` calls removed
10. Orphaned JSDoc stub above `_mandragoraSharedPool` (the "Look up a rite's casting pool..." block with no function below it) removed
11. `buildGenericPool` discipline lookup updated from `char?.disciplines?.[discName]?.dots` (old schema) to use `_charDiscsArray(char).find(d => d.name === discName)?.dots`
12. All existing behaviour is unchanged — no functional regressions

## Out of Scope

- File splitting into modules (separate story)
- `renderProcessingMode` event delegation refactor
- `buildProcessingQueue` caching (depends on file-splitting architecture)
- `subByCharId` Map hoisting (needs broader render coordination)

## Tasks / Subtasks

---

### Task 1: Dead code removal (AC: 1, 10)

- [x] **1a.** In the import block (~line 1), remove `DOWNTIME_SECTIONS` from the `downtime-data.js` import. Verify `DOWNTIME_SECTIONS` has no other references in the file (`grep` to confirm).
- [x] **1b.** Remove the orphaned JSDoc block at ~line 7034-7040 (the comment beginning "Look up a rite's casting pool and target successes..." that has no function directly below it — `_mandragoraSharedPool`'s own JSDoc immediately follows). The `_getRiteInfo` function below still has its own correct documentation.

---

### Task 2: Module-level constants (AC: 2, 3)

- [x] **2a. `NARR_KEYS`** — add after the `NARR_BLOCKS` definition (~line 7201):
  ```js
  const NARR_KEYS = NARR_BLOCKS.map(b => b.key);
  ```
  Then replace all 6 occurrences of `NARR_BLOCKS.map(b => b.key)` (in `renderNarrativePanel` ~line 7213, `renderPublishPanel` ~line 7560, `handlePublish` ~line 7577, and any others) with `NARR_KEYS`.

- [x] **2b. `COURT_KEYS` / `COURT_LABELS`** — locate the two sets of local `const COURT_KEYS` and `const COURT_LABELS` definitions in the file. Move one definition to module level (after other processing constants, ~line 280). Remove the duplicate. Both usages will resolve to the module-level const.

- [x] **2c. `MODE_LABELS`** — same as 2b: locate both local `const MODE_LABELS` definitions, move one to module level, remove the duplicate.

---

### Task 3: Duplicate data references (AC: 4, 5)

- [x] **3a. `FEED_METHOD_LABELS` inline object in `renderPlayerResponses`** (~line 880) — this is a local `const FEED_METHOD_LABELS = { seduction: 'Seduction', ... }` object. Remove it. Replace all usages in that function with lookups from the module-level `FEED_METHOD_LABELS_MAP`:
  ```js
  FEED_METHOD_LABELS_MAP[methodId] ?? methodId
  ```

- [x] **3b. Local `FEED_METHODS` array** (~line 467) — this is a local duplicate of the imported `FEED_METHODS_DATA`. Remove the local definition. Replace all usages in `buildFeedingPool` and `renderFeedingScene` with `FEED_METHODS_DATA`.

---

### Task 4: Extract `_fmtMod` helper (AC: 6)

Add at module level near the other small rendering helpers (~line 2640):

```js
/** Format a signed integer as '+N', '−N', or '±0'. */
function _fmtMod(val) {
  if (val === 0) return '\u00B10';
  return val > 0 ? `+${val}` : String(val);
}
```

Then replace all 10+ inline occurrences of the pattern:
- `val === 0 ? '±0' : val > 0 ? '+N' : String(val)` 
- `val > 0 ? '+N' : String(val)` (without the ±0 guard)
- `net > 0 ? \`+${net}\` : String(net)`

with `_fmtMod(val)`. Key locations:
- `_buildAmbienceHtml` (~lines 8579–8594): six occurrences for `netStr`, `gapStr`, `infNetStr`, `projNetStr`, `alliesNetStr`, and the column sign formatting
- `renderFeedingScene` (~line 8261): `ambModStr`
- Event wiring in `renderProcessingMode` (~lines 3200–4750): pool mod displays
- Any remaining inline occurrences found by search

---

### Task 5: Extract `_buildSpecTogglesHtml` helper (AC: 7)

The feeding pool builder (~lines 6668–6681) and the project pool builder (~lines 6764–6777) contain near-identical spec toggle blocks. Extract to a helper:

```js
/**
 * Render spec-toggle checkboxes for a pool builder row.
 * Covers native specs on the selected skill + IS specs from all skills.
 * @param {object|null} char
 * @param {string} preSkill  — currently selected skill name
 * @param {string} procKey   — entry key for data-proc-key attributes
 * @param {string[]} activeSpecs — already-checked specs from review
 * @param {string} disabled  — ' disabled' or ''
 * @returns {string} HTML string
 */
function _buildSpecTogglesHtml(char, preSkill, procKey, activeSpecs, disabled) {
  if (!char || !preSkill) return '';
  let h = '';
  for (const sp of skSpecs(char, preSkill)) {
    const checked = activeSpecs.includes(sp) ? ' checked' : '';
    const aoe = hasAoE(char, sp);
    h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${esc(procKey)}" data-spec="${esc(sp)}"${checked}${disabled}>${esc(sp)} ${aoe ? '+2' : '+1'}</label>`;
  }
  for (const { spec: isSp, fromSkill } of isSpecs(char)) {
    if (fromSkill === preSkill) continue;
    const checked = activeSpecs.includes(isSp) ? ' checked' : '';
    const aoe = hasAoE(char, isSp);
    h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${esc(procKey)}" data-spec="${esc(isSp)}"${checked}${disabled}>${esc(isSp)} (${esc(fromSkill)}) ${aoe ? '+2' : '+1'}</label>`;
  }
  return h;
}
```

Replace the two spec-toggle blocks in `renderActionPanel` (feeding path ~6668–6681, project path ~6764–6777) with calls:
```js
h += _buildSpecTogglesHtml(char, preSkill, entry.key, rev.active_feed_specs || [], _feedDis);
```

---

### Task 6: Shared feeding matrix table builder (AC: 8)

Both `renderFeedingMatrix` (~line 8433) and `_buildFeedingMatrixHtml` (~line 8618) generate an identical `<table>` with the same O/X/— cell logic. The only differences are:

- `_buildFeedingMatrixHtml` is called from `renderCityOverview` and uses `_computeMatrixFeederCounts()` for feeder count sharing; `renderFeedingMatrix` builds its own feeder count separately.
- Both use the same `MATRIX_TERRS`, `_getSubFedTerrs`, residency lookup pattern.

Extract the table HTML generation into a private helper:

```js
/**
 * Build the feeding matrix <table> HTML only.
 * Callers handle the outer wrapper, toggle, and feeder-count footer.
 * @param {object[]} chars — sorted active characters
 * @param {Map<string,object>} subByCharId — charId → submission
 * @param {Object<string,Set<string>>} residentsByTerrKey — csvKey → Set<charId>
 * @returns {string} HTML string (<table>…</table> + note)
 */
function _buildMatrixTableHtml(chars, subByCharId, residentsByTerrKey) {
  const cols = MATRIX_TERRS;
  let h = '<table class="dt-matrix-table"><thead><tr><th>Character</th>';
  for (const t of cols) {
    const amb = getTerritoryAmbience(t.ambienceKey);
    h += `<th title="${esc(amb || 'No cap')}">${esc(t.label)}<br><span class="dt-matrix-amb">${esc(amb || 'N/A')}</span></th>`;
  }
  h += '</tr></thead><tbody>';
  for (const char of chars) {
    const charId = String(char._id);
    const sub = subByCharId.get(charId) || null;
    const hasSub = !!sub;
    const fedTerrs = hasSub ? _getSubFedTerrs(sub) : new Set();
    h += `<tr class="dt-matrix-row${hasSub ? '' : ' dt-matrix-nosub'}">`;
    h += `<td class="dt-matrix-char">${esc(displayName(char))}${!hasSub ? ' <span class="dt-matrix-nosub-badge">No submission</span>' : ''}</td>`;
    for (const t of cols) {
      const isBarrens = t.ambienceKey === null;
      const fed = fedTerrs.has(t.csvKey);
      if (!fed) {
        h += '<td class="dt-matrix-empty">\u2014</td>';
      } else if (!isBarrens && residentsByTerrKey[t.csvKey].has(charId)) {
        h += '<td class="dt-matrix-resident">O</td>';
      } else {
        h += '<td class="dt-matrix-poach">X</td>';
      }
    }
    h += '</tr>';
  }
  h += '</tbody></table>';
  h += '<p class="dt-matrix-note">O = resident feeding. X = poaching (non-resident). Residents set via City tab.</p>';
  return h;
}
```

Update both callers to build their own `chars`, `subByCharId`, and `residentsByTerrKey` (as they already do) and then call `_buildMatrixTableHtml(chars, subByCharId, residentsByTerrKey)` instead of the inline loop.

---

### Task 7: Fix `_computeRiteVitaeCost` / `_computeRiteWpCost` signatures (AC: 9)

- [x] Change both function signatures to accept an optional `char` parameter:
  ```js
  function _computeRiteVitaeCost(sub, char) {
    const subChar = char || findCharacter(sub.character_name, sub.player_name);
    ...
  }
  function _computeRiteWpCost(sub, char) {
    const subChar = char || findCharacter(sub.character_name, sub.player_name);
    ...
  }
  ```
- [x] Update the call sites in `_renderFeedRightPanel` (which already has the resolved `char` reference) to pass the char.
- [x] The fallback `|| findCharacter(...)` preserves backward compatibility if called without the second argument.

---

### Task 8: Fix `buildGenericPool` discipline lookup (AC: 11)

`buildGenericPool` (~line 9188) accesses `char?.disciplines?.[discName]?.dots` which is the old v1 schema (disciplines as a keyed object). In v2 schema, disciplines are on the character as an array-based structure accessed via `_charDiscsArray`.

Change:
```js
const discVal = (discName && char?.disciplines?.[discName]?.dots) || 0;
```
To:
```js
const discVal = discName ? (_charDiscsArray(char).find(d => d.name === discName)?.dots || 0) : 0;
```

Note: `buildGenericPool` is only called from the legacy `renderProjectsPanel` and `renderMeritActionsPanel` panels (DT-1 era). This fix ensures it works correctly if DT-1 format submissions are ever viewed for v2 characters.

---

## Dev Notes

### Search patterns for inline `_fmtMod` occurrences

```
val > 0 \? [`']\+
net > 0 \? [`']\+
\u00B10
±0
```

Run a grep for `? '+'` and `? \`+` to find all sign-formatting patterns in the file before replacing.

### `_buildSpecTogglesHtml` — IS spec loop

`isSpecs(char)` returns `{ spec, fromSkill }` entries for merits that grant specialties via `benefit_grants`. These appear as additional spec toggles below the native skill specs. The `fromSkill !== preSkill` guard prevents double-listing a spec that's both native and IS-granted for the same skill.

### `FEED_METHOD_LABELS_MAP` location

Defined at ~line 92 (module level) as:
```js
const FEED_METHOD_LABELS_MAP = Object.fromEntries(FEED_METHODS_DATA.map(m => [m.id, m.name]));
```
Or similar. Verify the exact name before replacing the inline object in `renderPlayerResponses`.

### `_buildMatrixTableHtml` feeder counts

Neither `renderFeedingMatrix` nor `_buildFeedingMatrixHtml` currently render a feeder-count footer row (it was removed in feature.54). The shared helper therefore only needs to produce the character rows. `_buildFeedingMatrixHtml` calls `_computeMatrixFeederCounts()` to share data with the ambience table — that call stays in `_buildFeedingMatrixHtml` and is unaffected by the table extraction.

### Regression risk

Tasks 1–4 are zero-risk (dead code and constant deduplication). Tasks 5–8 touch rendering paths and should be verified in-browser:
- Task 5: Open any feeding and project action in processing mode; confirm spec toggles render correctly and are checked/unchecked on load.
- Task 6: Open City tab; confirm Feeding Matrix renders correctly in both the feeding section and the City Overview section.
- Task 7: No visible change; verify console has no errors on sorcery entry open.
- Task 8: No visible change for DT-2 subs; verify legacy project panels (DT-1 format) still render without errors.

### Key file

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | All tasks |

No CSS or server changes required.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-16 | 1.0 | Initial draft | Amelia (claude-sonnet-4-6) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- Task 1a: Removed `DOWNTIME_SECTIONS` from import at line 9; confirmed zero usages in file.
- Task 1b: Removed orphaned JSDoc stub "Look up a rite's casting pool..." above `_mandragoraSharedPool`.
- Task 2a: Added `const NARR_KEYS = NARR_BLOCKS.map(b => b.key)` after `NARR_BLOCKS` definition. Removed all 7 local `NARR_KEYS` declarations (mix of literal array and `NARR_BLOCKS.map` forms).
- Task 2b: Hoisted `COURT_KEYS`/`COURT_LABELS` from inside `renderPreReadSection` to module level; removed duplicate local declarations.
- Task 2c: Added `const MODE_LABELS` at module level before `_renderCompactMeritPanel`; removed both local declarations at lines ~5289 and ~5360.
- Task 3a: Removed inline `FEED_METHOD_LABELS` object in `renderPlayerResponses`; replaced lookups with `FEED_METHOD_LABELS_MAP[methodId] ?? methodId`.
- Task 3b: Removed local `FEED_METHODS` array (line ~581, missing `discs` field); replaced 3 usages in `buildFeedingPool` and `renderFeedingScene` with `FEED_METHODS_DATA`.
- Task 4: Added `_fmtMod(val)` helper near other small helpers after `DONE_STATUSES`. Replaced 15+ inline sign-format patterns across `renderProcessingMode`, `_renderCompactMeritPanel`, `_renderFeedRightPanel`, `renderFeedingScene`, `_buildAmbienceHtml`. Left line 8581 (`gap >= 0 ? \`+${gap}\``) intentionally unchanged — zero gap means exactly at cap, so `+0` is correct (not `±0`).
- Task 5: Extracted `_buildSpecTogglesHtml(char, preSkill, procKey, activeSpecs, disabled)` before `_unskilledPenalty`. Replaced 15-line duplicate spec-toggle loops in both feeding (~6668) and project (~6764) paths of `renderActionPanel`.
- Task 6: Added `_buildMatrixTableHtml(chars, subByCharId, residentsByTerrKey)` before `renderFeedingMatrix`. Both `renderFeedingMatrix` and `_buildFeedingMatrixHtml` now call the shared helper; added `data-sub-id` attribute to rows for click-handler compatibility.
- Task 7: Updated `_computeRiteVitaeCost(sub, char)` and `_computeRiteWpCost(sub, char)` to accept pre-resolved char; call sites in `_renderFeedRightPanel` now pass the already-available `char` argument.
- Task 8: Fixed `buildGenericPool` discipline lookup from `char?.disciplines?.[discName]?.dots` (v1 schema) to `_charDiscsArray(char).find(d => d.name === discName)?.dots` (v2 schema).

### File List
- `public/js/admin/downtime-views.js`
- `specs/stories/refactor.1.downtime-views-cleanup.story.md`
