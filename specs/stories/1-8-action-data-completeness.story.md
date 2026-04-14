# Story 1.8: Action Data Completeness

## Status: review

## Story

**As an** ST resolving merit actions in DT Processing,
**I want** B3's `buildActionContext` to have complete cross-action context without manual tracking,
**so that** the generated prompt accurately reflects contested, covered, and overlapping activity.

## Background

B3 (Story 1.3) specifies "cross-action context chips (Covered / Contested / Supported / Territory overlap)" in the `buildActionContext` prompt. This story establishes exactly where each piece of data comes from and how B3 should derive it — deciding upfront whether to store new fields or derive at render time.

**Decision: prefer derivation over storage.** The existing submission document already contains enough information to derive all cross-action context at render time. This story documents what to read and how.

No changes to `downtime-views.js` are required unless explicitly noted.

---

## What already exists

### Fields stored on merit_actions_resolved entries

| Field | Set by | Used for |
|-------|--------|----------|
| `inv_secrecy` | ST selects in DT Processing | Investigation Matrix tier |
| `inv_has_lead` | ST sets in DT Processing | Investigation Matrix modifier |
| `linked_merit_qualifier` | ST links in DT Processing | Territory override for allies/status |
| `pool_validated` | ST enters in DT Processing | Pool expression for prompt |
| `pool_status` | ST sets in DT Processing | Skipped/no_roll/resolved/etc. |
| `roll` | Roller result | Success count, dice string |
| `notes_thread` | ST notes panel | Context notes added during processing |

### Fields stored on projects_resolved entries

| Field | Set by | Used for |
|-------|--------|----------|
| `attack_target_char` | ST selects in DT Processing | Who is being attacked |
| `attack_target_merit` | ST selects in DT Processing | Which merit is targeted |
| `investigate_target_char` | ST selects in DT Processing | Who is being investigated |
| `inv_secrecy` | ST selects in DT Processing | Investigation Matrix tier |
| `inv_has_lead` | ST sets in DT Processing | Investigation Matrix modifier |
| `action_type` | Parsed from form | What kind of action |
| `roll` | Roller result | Success count, dice string |
| `pool_status` | ST sets | Skipped/validated/no_roll/etc. |

---

## Cross-action chip derivation spec

All four chips are derived at render time in `buildActionContext` (downtime-story.js). No new stored fields are needed.

### 1. Covered — hide/protect in same territory

A merit action is "covered" if the same character has a project action of type `hide_protect` that shares the same territory this cycle.

```js
function getHideProtectCover(sub, terrId) {
  // Scan this character's own projects_resolved for hide_protect actions in terrId
  const resolved = sub.projects_resolved || [];
  return resolved
    .filter((rev, idx) => {
      if (!rev || rev.action_type !== 'hide_protect') return false;
      if (rev.pool_status === 'skipped') return false;
      const slot = idx + 1;
      const rawTerr = sub.responses?.[`project_${slot}_territory`] || '';
      return resolveTerrId(rawTerr) === terrId;
    })
    .map((rev) => ({
      successes: rev.roll?.successes ?? null,
    }));
}
```

If any results are returned, emit chip: `Covered (Hide/Protect — N successes)` or `Covered (Hide/Protect — unresolved)` if roll is null.

If the merit action itself has no territory (e.g. contacts/retainer actions), skip this chip.

### 2. Contested — under attack or investigation

A merit action is "contested" if another character has stored `attack_target_char` or `investigate_target_char` pointing at this character.

```js
function getContestingActions(sub, char, allSubmissions) {
  const contesters = [];
  const charName = displayName(char);
  for (const s of allSubmissions) {
    if (s._id === sub._id) continue;
    // Check project actions that target this character
    (s.projects_resolved || []).forEach((rev, idx) => {
      if (!rev || rev.pool_status === 'skipped') return;
      const isAttack = rev.action_type === 'attack' && rev.attack_target_char === charName;
      const isInvest = rev.action_type === 'investigate' && rev.investigate_target_char === charName;
      if (!isAttack && !isInvest) return;
      contesters.push({
        type: isAttack ? 'attack' : 'investigate',
        characterName: s.character_name || 'Unknown',
        successes: rev.roll?.successes ?? null,
      });
    });
    // Check merit actions that target this character (attack/investigate on merit actions)
    (s.merit_actions_resolved || []).forEach((rev) => {
      if (!rev || rev.pool_status === 'skipped') return;
      const isAttack = rev.action_type === 'attack' && rev.attack_target_char === charName;
      const isInvest = rev.action_type === 'investigate' && rev.investigate_target_char === charName;
      if (!isAttack && !isInvest) return;
      contesters.push({
        type: isAttack ? 'attack' : 'investigate',
        characterName: s.character_name || 'Unknown',
        successes: rev.roll?.successes ?? null,
      });
    });
  }
  return contesters;
}
```

For each contester, emit chip: `Under Attack by {name} (N successes)` or `Under Investigation by {name} (N successes)`.

### 3. Territory Overlap — other chars in same territory

A merit action has "territory overlap" if another character has an allies/status/retainer merit action in the same territory this cycle.

Territory for a merit action comes from the ST-set territory override:

```js
// For merit actions, territory is stored in:
// sub.st_review?.territory_overrides?.[`allies_${meritFlatIdx}`]
// (set during DT Processing via the territory link dropdown)
// Resolve with resolveTerrId() to get a territory ID
```

```js
function getTerritoryOverlap(sub, meritFlatIdx, allSubmissions, allChars) {
  const rawOverride = sub.st_review?.territory_overrides?.[`allies_${meritFlatIdx}`] || '';
  const terrId = resolveTerrId(rawOverride);
  if (!terrId) return []; // no territory linked — skip chip
  const overlaps = [];
  for (const s of allSubmissions) {
    if (s._id === sub._id) continue;
    (s.merit_actions_resolved || []).forEach((rev, idx) => {
      if (!rev || rev.pool_status === 'skipped') return;
      const cat = deriveMeritCategory(rev.merit_type || '');
      if (!['allies', 'status', 'retainer'].includes(cat)) return;
      // Check if this action is in the same territory
      const otherTerr = resolveTerrId(s.st_review?.territory_overrides?.[`allies_${idx}`] || '');
      if (otherTerr !== terrId) return;
      overlaps.push({ characterName: s.character_name || 'Unknown', meritType: rev.merit_type || '' });
    });
  }
  return overlaps;
}
```

For each overlap, emit chip: `Territory Overlap: {name} ({meritType})`.

### 4. Supported — heuristic only

There is no structured `support_target` field. Support actions are project actions with `action_type === 'support'`; the ST declares the target in the description or outcome text only.

**Decision: do not emit a "Supported" chip in B3.** Instead, the ST's own `notes_thread` entries on the merit action capture support context when the ST notes it manually during DT Processing. B3 already includes `notes_thread` in the prompt, which covers this.

If future development adds a structured `support_target_char` field to projects_resolved for support actions, revisit and add the chip then.

---

## Investigation Matrix interpretation — derivation spec

B3's `getInvestigateInterpretation` derives the matrix result at render time. This is correct and requires no stored notes. The required inputs already exist:

```js
function getInvestigateInterpretation(rev, INVESTIGATION_MATRIX) {
  if (!rev.roll || !rev.inv_secrecy) return null;
  const tier = INVESTIGATION_MATRIX.find(t => t.type === rev.inv_secrecy);
  if (!tier) return null;
  let modifier = tier.innate;
  if (rev.inv_has_lead === false) modifier += tier.noLead;
  const netSuccesses = (rev.roll.successes || 0) + modifier;
  if (netSuccesses < 1) return `Matrix result (${tier.type}, net ${netSuccesses}): insufficient successes`;
  const resultIdx = Math.min(Math.max(netSuccesses - 1, 0), tier.results.length - 1);
  return `Matrix result (${tier.type}, net ${netSuccesses}): ${tier.results[resultIdx]}`;
}
```

The INVESTIGATION_MATRIX is already duplicated in downtime-story.js per B3. `inv_secrecy` and `inv_has_lead` are stored on `merit_actions_resolved` entries. No new stored fields needed.

---

## meritFlatIdx — index used for territory_overrides key

The territory override key for merit actions uses `allies_${meritFlatIdx}`, where `meritFlatIdx` is the flat index of the action in `sub.merit_actions_resolved`. This matches what DT Processing uses when setting overrides.

B3 already receives `idx` (the merit action index) as a parameter to `buildActionContext(char, sub, idx)`. Use `idx` as `meritFlatIdx` directly:

```js
const terrOverrideKey = `allies_${idx}`;
const terrId = resolveTerrId(sub.st_review?.territory_overrides?.[terrOverrideKey] || '');
```

---

## What B3 needs to call

B3's `buildActionContext` should call:

```js
const terrId = resolveTerrId(sub.st_review?.territory_overrides?.[`allies_${idx}`] || '');
const covered   = terrId ? getHideProtectCover(sub, terrId) : [];
const contested = getContestingActions(sub, char, allSubmissions);
const overlaps  = terrId ? getTerritoryOverlap(sub, idx, allSubmissions, allChars) : [];
const matrixNote = getInvestigateInterpretation(rev, INVESTIGATION_MATRIX);
```

These functions are defined in downtime-story.js alongside the rest of the merit action context code from B3.

---

## Acceptance Criteria

1. `getHideProtectCover(sub, terrId)` returns an array of hide/protect actions by the same character in the same territory. Returns empty array if terrId is null or no hide/protect actions exist.
2. `getContestingActions(sub, char, allSubmissions)` returns an array of attack/investigate actions from other characters that store this character's name in `attack_target_char` or `investigate_target_char`. Returns empty array if none found.
3. `getTerritoryOverlap(sub, meritFlatIdx, allSubmissions, allChars)` returns an array of other characters' allies/status/retainer actions in the same territory. Returns empty array if the merit action has no territory override set, or if no overlaps exist.
4. `getInvestigateInterpretation(rev, INVESTIGATION_MATRIX)` returns a readable string describing the matrix result given `inv_secrecy` and `inv_has_lead`. Returns null if either field is absent.
5. B3's `buildActionContext` calls all four functions and includes results in the prompt as cross-action context chips. Absent/empty results produce no chip lines (graceful omission).
6. No new fields are added to `merit_actions_resolved` or `projects_resolved` schema.
7. No changes to `downtime-views.js`.
8. The "Supported" chip is not implemented — support context is surfaced via `notes_thread` entries which B3 already includes.

---

## Tasks / Subtasks

- [x] Task 1: getHideProtectCover(sub, terrId) pure function
  - [x] Scans sub.projects_resolved for hide_protect actions in terrId
  - [x] Excludes skipped entries
  - [x] Returns array of { successes }

- [x] Task 2: getContestingActions(sub, char, allSubmissions) pure function
  - [x] Scans all other submissions' projects_resolved and merit_actions_resolved
  - [x] Checks attack_target_char and investigate_target_char fields
  - [x] Returns array of { type, characterName, successes }

- [x] Task 3: getTerritoryOverlap(sub, meritFlatIdx, allSubmissions, allChars) pure function
  - [x] Reads territory from sub.st_review.territory_overrides[`allies_${meritFlatIdx}`]
  - [x] Returns early (empty array) if no territory linked
  - [x] Scans all other submissions' merit_actions_resolved for same-territory allies/status/retainer actions
  - [x] Returns array of { characterName, meritType }

- [x] Task 4: getInvestigateInterpretation(rev, INVESTIGATION_MATRIX) pure function
  - [x] Reads rev.inv_secrecy, rev.inv_has_lead, rev.roll.successes
  - [x] Returns null if inputs absent
  - [x] Returns readable interpretation string from INVESTIGATION_MATRIX

- [x] Task 5: Wire cross-action functions into buildActionContext (B3)
  - [x] All four functions called with correct parameters
  - [x] Cross-action chip lines appended to prompt if non-empty
  - [x] No chip lines emitted if arrays are empty or function returns null

- [x] Task 6: Document the "Supported" chip decision in a code comment in downtime-story.js
  - [x] Comment added in A1 section header in downtime-story.js

---

## Dev Notes

### Function placement in downtime-story.js

These four functions are merit-action utilities. Place them near `buildActionContext` and `deriveMeritCategory` in the downtime-story.js file, not in the general utility section.

### deriveMeritCategory is already defined in B3

`getTerritoryOverlap` uses `deriveMeritCategory` to filter for allies/status/retainer categories. This function is already defined in B3's implementation. A1 tasks depend on B3 being present or in the same commit.

### resolveTerrId in downtime-story.js

B6 adds `resolveTerrId` to downtime-story.js. A1 functions use it. If B6 has not yet shipped, A1 must either implement `resolveTerrId` itself or be implemented alongside B6.

### Chip format in prompt

Cross-action context chips appear in the prompt as a bullet list block:

```
Cross-action context:
- Covered by Hide/Protect (3 successes)
- Under Investigation by Rene St. Dominique (2 successes)
- Territory Overlap: Reed Justice (Allies 3 Finance)
```

If no chips apply, omit the section entirely.

### attack_target_char — name vs ID

`attack_target_char` stores the character's display name as a string (not a MongoDB ID). Match against `displayName(char)` for the current character. Same for `investigate_target_char`.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-story.js` | Modify: add getHideProtectCover, getContestingActions, getTerritoryOverlap, getInvestigateInterpretation; wire into buildActionContext |

No CSS changes. No schema changes. No changes to downtime-views.js.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |
| 2026-04-15 | 1.1 | Implementation complete (with B3) | claude-sonnet-4-6 |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- Implemented together with B3 (Story 1.3) in a single session per sprint-status dependency note

### Completion Notes List
- getHideProtectCover: uses resolveTerrId (added by B6) to match project territory
- getContestingActions: checks both projects_resolved and merit_actions_resolved on other subs; matches by displayName(char)
- getTerritoryOverlap: reads territory_overrides[allies_${meritFlatIdx}]; uses deriveMeritCategory (B3) to filter allies/status/retainer
- getInvestigateInterpretation: uses INVESTIGATION_MATRIX (B3 constant); applies innate + conditional noLead modifier
- All four functions wired into buildActionContext; cross-action chips section omitted gracefully when empty
- "Supported" chip intentionally not implemented — comment in A1 section header in downtime-story.js

### File List
- `public/js/admin/downtime-story.js` — modified: getHideProtectCover, getContestingActions, getTerritoryOverlap, getInvestigateInterpretation; wired into buildActionContext (B3)
