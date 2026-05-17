# Story Feature.338: Territory Pulse — Prompt Structure and Filtering Redesign

## Status: review

## Metadata
- issue: 338
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/338
- branch: ms/issue-338-territory-pulse-prompt-redesign

---

## Story

**As an** ST generating Territory Pulses,
**I want** the prompt sent to the AI to contain correctly calibrated, pre-filtered data,
**so that** the output prose requires minimal rework and correctly reflects crowding pressure, covenant-level effort, and discipline residue.

---

## Background

Issue #332 (already shipped) added influence contributors and exceptional ambience project successes to `_buildTerritoryPulsePromptText`. The data is now present but the prompt structure has several problems identified after Cycle 2 processing:

1. **No feeder cap/count.** The crowding gap (feeders vs territory cap) is the primary prose calibration. Every territory reads identically without it.
2. **No discipline threshold.** All disciplines in `discsUsed` appear regardless of how many times they were used. Once-only uses are noise.
3. **No covenant aggregation.** Influence spend is a raw per-character list. The model is unreliable at suppressing names or computing totals on the fly.
4. **Negative contributors are named.** The current code puts `identity` (name + clan + covenant) into `infNeg`. Negative contributors must never be named — covenant total only.
5. **"Any rumours running through it" directive.** This phrase caused the model to invent specific characters and incidents not present in inputs.
6. **"Weave these into the prose where disciplines were recorded above."** Too prescriptive — pushed the model to include all listed disciplines including once-only uses.
7. **Exceptional ambience successes are undifferentiated.** Positive exceptional successes should name the character; negative exceptional successes should give a count only.

---

## Acceptance Criteria

- [x] `_buildTerritoryPulsePromptText` passes `feeder_cap`, `feeder_count`, and `crowding_gap` as explicit labelled lines in the prompt.
- [x] Disciplines are filtered to 2+ uses before prompt assembly; the discipline section is omitted entirely if none qualify.
- [x] Influence spend is aggregated by covenant with a weight label (Enormous/Significant/Modest/Light); raw per-character lists are not sent to the model.
- [x] Positive contributors below +10 are folded into their covenant aggregate without a name.
- [x] Negative contributor names are never present in the prompt — covenant total + weight only.
- [x] The "any rumours running through it" phrase is removed from the framing string.
- [x] The discipline weaving instruction is replaced with the threshold-only version.
- [x] Positive exceptional ambience successes are named in the prompt; negative exceptional successes appear as a count only with no names.
- [x] "Show prompt" output in the ST UI reflects all new fields correctly (no new UI work needed — same copy-to-clipboard path).

---

## Tasks

### Task 1 — Add `feeder_cap` to TERRITORY_DATA ✓

**File:** `public/js/tabs/downtime-data.js`

Current `TERRITORY_DATA` entries have `slug`, `name`, `ambience`, and `ambienceMod` only. Add a `feeder_cap` integer field to each entry. The ST will supply the actual values — use placeholders (e.g. `4`) and leave a comment asking the ST to confirm the per-territory cap.

```js
{ slug: 'academy',    name: 'The Academy',     ambience: 'Curated',  ambienceMod: +3, feeder_cap: 4 },
{ slug: 'dockyards',  name: 'The Dockyards',   ambience: 'Settled',  ambienceMod:  0, feeder_cap: 4 },
{ slug: 'harbour',    name: 'The Harbour',     ambience: 'Untended', ambienceMod: -2, feeder_cap: 3 },
{ slug: 'northshore', name: 'The North Shore', ambience: 'Tended',   ambienceMod: +2, feeder_cap: 4 },
{ slug: 'secondcity', name: 'The Second City', ambience: 'Tended',   ambienceMod: +2, feeder_cap: 4 },
```

Leave a `// TODO ST: confirm feeder_cap per territory` comment on the line after the array.

---

### Task 2 — Filter disciplines to threshold; fix weaving instruction

**File:** `public/js/admin/downtime-views.js`, inside `_buildTerritoryPulsePromptText`

**Current code (lines ~2330–2336):**
```js
const discsUsed = Object.entries(profile)
  .filter(([, c]) => c > 0)
  .sort(([a], [b]) => a.localeCompare(b));
```

**Change to:**
```js
const discsUsed = Object.entries(profile)
  .filter(([, c]) => c >= 2)
  .sort(([a], [b]) => a.localeCompare(b));
```

Also update the discipline weaving label in the `lines` array. **Locate:**
```js
'Territorial vibe effects of disciplines used (weave these into the prose where disciplines were recorded above):',
```

**Replace with:**
```js
discsUsed.length
  ? 'Territorial vibe effects (disciplines used twice or more — weave these into the prose; ignore disciplines used only once):'
  : null,
```

And filter the `null` out of `lines` before joining: change `lines.join('\n')` to `lines.filter(l => l != null).join('\n')`.

When `discsUsed` is empty, the discipline section should be omitted entirely. Wrap both the "Disciplines used" and "Territorial vibe effects" sections in a conditional so they are absent when `discsUsed.length === 0`.

---

### Task 3 — Add feeder cap / count / crowding gap to prompt

**File:** `public/js/admin/downtime-views.js`, inside `_buildTerritoryPulsePromptText`

After `feeders` is sorted, compute:
```js
const feederCap   = territory.feeder_cap ?? '?';
const feederCount = feeders.length;
const crowdingGap = typeof feederCap === 'number' ? feederCount - feederCap : '?';
const crowdingStr = typeof crowdingGap === 'number'
  ? (crowdingGap > 0 ? `+${crowdingGap}` : String(crowdingGap))
  : '?';
```

Add these lines to the prompt immediately after the `Current ambience:` line:
```
Feeder cap:    ${feederCap}
Feeder count:  ${feederCount}
Crowding gap:  ${crowdingStr} (positive = overcrowded, negative = underfed, zero = at capacity)
```

---

### Task 4 — Update the framing string

**File:** `public/js/admin/downtime-views.js`, inside `_buildTerritoryPulsePromptText`

**Current framing:**
```js
const framing = `You are writing a Territory Pulse for ${territory.name} in a Vampire: The Requiem 2nd Edition LARP. The pulse describes the current atmosphere of the territory after a cycle of activity. Write 100 to 200 words of atmospheric prose covering what the place feels like right now, any rumours running through it, and how the recent activity has shaped its mood. Use British English. Do not invent specific characters or events not present in the inputs.`;
```

**Replace with:**
```js
const framing = `You are writing a Territory Pulse for ${territory.name} in a Vampire: The Requiem 2e LARP.\n\nThe pulse is written to the vampires who fed in this territory this cycle. It gives them the lived sense of the place after a month of activity. Use British English. Do not use em-dashes. Do not invent specific characters or events not present in the inputs. 100 to 200 words.\n\nCover, in order:\n1. Blood quality and feeding pressure. Use the ambience state and the crowding gap to calibrate how the blood tastes and how crowded the hunting felt.\n2. Discipline residue in mortal behaviour, only for disciplines that crossed the threshold (used twice or more). If none crossed, skip this beat entirely.\n3. Covenant fingerprints and direct hands. Describe each contributing covenant by overall weight (enormous, significant, modest, light). Name named-positive-individuals directly as visible points of their covenant's effort. The negative side is described by covenant only, never named. Direct hands (exceptional ambience project successes) on the positive side are named openly as seen doing the work. Direct hands on the negative side are not named; the territory feels the damage without knowing the hand.`;
```

---

### Task 5 — Covenant aggregation for influence

**File:** `public/js/admin/downtime-views.js`, inside `_buildTerritoryPulsePromptText`

Replace the current `infPos`/`infNeg` per-character arrays with covenant aggregation.

**Current code to replace (the influence contributors block):**
```js
const infPos = [], infNeg = [];
for (const sub of subs || []) {
  let infObj = {};
  try { infObj = JSON.parse(sub.responses?.influence_spend || '{}'); } catch { infObj = {}; }
  for (const [k, v] of Object.entries(infObj)) {
    if (resolveTerrId(k) !== territory.slug) continue;
    const val = Number(v) || 0;
    if (!val) continue;
    const char = charById.get(String(sub.character_id));
    const name = (char ? dropdownName(char) : null) || sub.character_name || 'Unknown';
    const identity = [name, char?.clan, char?.covenant].filter(Boolean).join(', ');
    if (val > 0) infPos.push(`  - ${identity} (+${val})`);
    else         infNeg.push(`  - ${identity} (${val})`);
  }
}
```

**Replace with:**
```js
// Aggregate influence by covenant for prompt assembly
// Per-character breakdown is computed first, then folded into covenant totals.
const covenantPos = {}, covenantNeg = {};  // covenant → { total, named: [{name, clan, amount}] }
for (const sub of subs || []) {
  let infObj = {};
  try { infObj = JSON.parse(sub.responses?.influence_spend || '{}'); } catch { infObj = {}; }
  for (const [k, v] of Object.entries(infObj)) {
    if (resolveTerrId(k) !== territory.slug) continue;
    const val = Number(v) || 0;
    if (!val) continue;
    const char = charById.get(String(sub.character_id));
    const cov = char?.covenant || 'Unknown';
    if (val > 0) {
      if (!covenantPos[cov]) covenantPos[cov] = { total: 0, named: [] };
      covenantPos[cov].total += val;
      if (val >= 10) {
        const name = (char ? dropdownName(char) : null) || sub.character_name || 'Unknown';
        covenantPos[cov].named.push(`${name}${char?.clan ? ', ' + char.clan : ''} (+${val})`);
      }
    } else {
      if (!covenantNeg[cov]) covenantNeg[cov] = { total: 0 };
      covenantNeg[cov].total += val; // stays negative
    }
  }
}

function _influenceWeight(absTotal) {
  if (absTotal >= 40) return 'enormous';
  if (absTotal >= 15) return 'significant';
  if (absTotal >= 5)  return 'modest';
  return 'light';
}

const infPosLines = Object.entries(covenantPos).map(([cov, { total, named }]) => {
  const weight = _influenceWeight(total);
  const base = `  - ${cov}: total +${total} (weight: ${weight})`;
  return named.length ? base + '\n    Named individuals (10+): ' + named.join('; ') : base;
});

const infNegLines = Object.entries(covenantNeg).map(([cov, { total }]) => {
  const weight = _influenceWeight(Math.abs(total));
  return `  - ${cov}: total ${total} (weight: ${weight})`;
});
```

Then update the prompt `lines` array to use `infPosLines` and `infNegLines`:
```js
'Covenant fingerprints — Positive:',
infPosLines.length ? infPosLines.join('\n') : '  None this cycle.',
'',
'Covenant fingerprints — Negative (no names — covenant only):',
infNegLines.length ? infNegLines.join('\n') : '  None this cycle.',
```

Remove the old `infPos`/`infNeg` lines from the `lines` array.

---

### Task 6 — Differentiate positive vs negative exceptional ambience successes

**File:** `public/js/admin/downtime-views.js`, inside `_buildTerritoryPulsePromptText`

**Current code:**
```js
const exceptionalAmb = [];
for (const sub of subs || []) {
  for (const [pIdx, proj] of (sub.projects_resolved || []).entries()) {
    if (proj?.pool_status !== 'validated') continue;
    if (!proj?.roll?.exceptional) continue;
    const actionType = proj.action_type_override || proj.action_type;
    if (!_isAmbienceAction(actionType)) continue;
    if (_resolveProjectTerritory(sub, pIdx) !== territory.slug) continue;
    const char = charById.get(String(sub.character_id));
    const name = (char ? dropdownName(char) : null) || sub.character_name || 'Unknown';
    const identity = [name, char?.clan, char?.covenant].filter(Boolean).join(', ');
    exceptionalAmb.push(`  - ${identity}`);
  }
}
```

**Replace with:**
```js
const exceptionalAmbPos = [], exceptionalAmbNegCount = { n: 0 };
for (const sub of subs || []) {
  for (const [pIdx, proj] of (sub.projects_resolved || []).entries()) {
    if (proj?.pool_status !== 'validated') continue;
    if (!proj?.roll?.exceptional) continue;
    const actionType = proj.action_type_override || proj.action_type;
    if (!_isAmbienceAction(actionType)) continue;
    if (_resolveProjectTerritory(sub, pIdx) !== territory.slug) continue;
    const direction = _ambienceDirection(actionType, pIdx + 1, sub.responses);
    if (direction === 'increase') {
      const char = charById.get(String(sub.character_id));
      const name = (char ? dropdownName(char) : null) || sub.character_name || 'Unknown';
      const identity = [name, char?.clan, char?.covenant].filter(Boolean).join(', ');
      exceptionalAmbPos.push(`  - ${identity}`);
    } else {
      exceptionalAmbNegCount.n++;
    }
  }
}
```

Update the prompt `lines` to use the split arrays:
```js
'Direct hands — Positive (named):',
exceptionalAmbPos.length ? exceptionalAmbPos.join('\n') : '  None this cycle.',
'',
'Direct hands — Negative (unnamed — count only):',
exceptionalAmbNegCount.n > 0
  ? `  ${exceptionalAmbNegCount.n} negative exceptional ambience success${exceptionalAmbNegCount.n === 1 ? '' : 'es'} — the territory carries the damage without a visible hand.`
  : '  None this cycle.',
```

---

## Dev Notes

### Current function state (post-#332)

`_buildTerritoryPulsePromptText` is at `public/js/admin/downtime-views.js` ~line 2325. Its signature is:
```js
function _buildTerritoryPulsePromptText(cycle, territory, subs, charById)
```

- `cycle` — the downtime cycle object (contains `discipline_profile` keyed by territory OID)
- `territory` — a single TERRITORY_DATA entry (`{ slug, name, ambience, ambienceMod }`)
- `subs` — array of all submissions for the cycle
- `charById` — `Map<string, charObj>` (character ID → character)

It is called at ~line 2421 inside `renderTerritoryPulsePanel()`:
```js
const promptText = _buildTerritoryPulsePromptText(cycle, td, subs || [], charById);
```

No other callers. Safe to change the internal structure freely.

### `_ambienceDirection` — direction detection

`_ambienceDirection(actionType, projN, responses)` returns `'increase'` or `'decrease'`.

- Legacy action types (`'ambience_increase'`, `'ambience_decrease'`) return directly from the type.
- Modern `'ambience_change'` reads `responses['project_${projN}_ambience_direction']` which is `'improve'` or `'degrade'`.
- `projN` is **1-indexed** (the DT form uses `project_1_`, `project_2_`, etc.). Pass `pIdx + 1` where `pIdx` is the 0-based `entries()` index.

### `_influenceWeight` helper

Define this as a local function (or a `const` arrow function) inside `_buildTerritoryPulsePromptText`. It is only needed there. Do not export or hoist it.

### Feeder cap placeholder values

The cap values added to TERRITORY_DATA in Task 1 are placeholders. Leave a comment so the ST can confirm. The function guards against a missing cap with `?? '?'` so a missing field will render as `'?'` in the prompt rather than crashing.

### Lines array cleanup

After all changes, the `lines` array will have some entries that are `null` (when sections are conditionally absent). Use `.filter(l => l != null)` before `.join('\n')`. Do not use `Boolean` as the filter predicate — `Boolean` would also strip empty strings, which are used as blank separators between sections.

### No UI changes

`_buildTerritoryPulsePromptText` builds a string that is already displayed via "Show prompt" and copied to clipboard in `renderTerritoryPulsePanel`. No UI changes are required — the improved prompt text flows through the same display and clipboard path automatically.

### What NOT to touch

- `_gatherInfluence` at ~line 3809 — this is used by ST processing reports, not by the Territory Pulse. Do not modify it.
- `_isAmbienceAction`, `_ambienceDirection` — existing helpers, use as-is.
- `_DISCIPLINE_TERRITORIAL_EFFECTS` — the effects map is correct. Only the filtering and instruction change.
- `renderTerritoryPulsePanel` — caller only; no changes needed.
- Court Pulse — separate function, out of scope.
- Ambience Matrix calculations — out of scope.

### Calibration language (for manual testing reference)

The new framing string encodes the beat order but not the specific language. The ST uses calibration cues from the memory doc `reference_territory_pulse_prompt.md`. These do not need to be embedded in the prompt itself — the beat order instruction is sufficient.

---

## Dev Agent Record

### Completion Notes

All 6 tasks implemented in a single full replacement of `_buildTerritoryPulsePromptText`:

- **Task 1:** `feeder_cap` added to all 5 TERRITORY_DATA entries in `downtime-data.js` with placeholder values (4/4/3/4/4) and a TODO comment for ST to confirm.
- **Task 2:** Discipline threshold changed from `c > 0` to `c >= 2`; weaving instruction updated; discipline block conditionally omitted when no disciplines qualify.
- **Task 3:** `feederCap`, `feederCount`, `crowdingGap`, `crowdingStr` computed after feeder list is built; appended as labelled lines immediately after `Current ambience`.
- **Task 4:** Framing replaced in full — "any rumours" phrase removed; beat order (blood quality → discipline residue → covenant fingerprints/direct hands) encoded as numbered list.
- **Task 5:** `covenantPos`/`covenantNeg` objects replace flat `infPos`/`infNeg` arrays; `_influenceWeight` as local arrow function; individuals named only at +10 or more positive; negative side always covenant-only.
- **Task 6:** `exceptionalAmbPos` array and `exceptionalAmbNegCount` integer replace flat `exceptionalAmb`; `_ambienceDirection(actionType, pIdx + 1, sub.responses)` used for direction detection.

E2E tests: 21 tests in `tests/issue-338-territory-pulse-prompt-redesign.spec.js` + 22 tests in updated `tests/issue-332-territory-pulse-influence-exceptional.spec.js` — all 43 pass.

Note: `feeder_cap` values are placeholders. ST must confirm per-territory caps before the next cycle's pulses are generated.

## File List

- `public/js/tabs/downtime-data.js` (Task 1 — add `feeder_cap` to TERRITORY_DATA)
- `public/js/admin/downtime-views.js` (Tasks 2–6 — full replacement of `_buildTerritoryPulsePromptText`)
- `tests/issue-338-territory-pulse-prompt-redesign.spec.js` (21 E2E tests, new)
- `tests/issue-332-territory-pulse-influence-exceptional.spec.js` (22 E2E tests, updated to match new section headings)

## Change Log

- feat(#338): redesign Territory Pulse prompt structure and filtering rules (2026-05-17)
