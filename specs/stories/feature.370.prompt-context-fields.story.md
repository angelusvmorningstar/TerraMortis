# Story feature.370: DT Story — add missing context fields to project and story moment prompts

**Story ID:** feature.370
**Epic:** DT Story tab improvements
**Status:** done
**Date:** 2026-05-18
**Issue:** [#370](https://github.com/angelusvmorningstar/TerraMortis/issues/370)
**Branch:** ms/issue-370-prompt-context-fields

---

## User Story

As an ST using the DT Story tab, I want the generated prompts to include the fields I actually need to write good narratives — the correspondent's name for letter prompts, the discipline used in investigation, the feed method for patrol territory context, and the XP story note when the player bought something — so that I am not missing context that is already in the system.

---

## Background

### Four missing context fields identified in DT3 processing

**1. Correspondent name absent from letter prompts**

`buildLetterContext` outputs the player's letter and aspirations but never states who is writing back to the character. The ST writes the correspondent's voice — but must remember or look up who that is. The correspondent's name is stored in `sub.responses?.story_moment_relationship_id`, which the handler resolves to a name (stored in `storyMomentTarget`). This name is already passed to `buildLetterContext` as `opts.storyMomentTarget`. The prompt includes `Story-moment target:` only when `storyMomentTarget?.name` is populated. But it does not include the label "Correspondent:" prominently near the top, where the AI would weight it most.

Currently the correspondent is buried after touchstones and aspirations. The target should appear immediately after the character header so the AI's persona is set before reading the player's letter.

**2. Discipline used absent from investigation branch**

Investigation actions have a specific discipline driving the roll (Auspex, Dominate, etc.). The validated pool string (`rev.pool_validated`) contains this but only as part of the pool expression (e.g. `"Wits + Empathy + Auspex (7)"`). The prompt doesn't isolate the discipline. For investigation narratives the AI needs to know which power is being used to frame the scene correctly.

Extract the discipline from the pool string or from the player's submitted merits field for investigation actions.

**3. Feed method absent from patrol territory block**

`buildPatrolContext` shows who is feeding in the territory (feeder list) and their feeding method (extracted from pool discipline or territory value). However the patrol character's own feeding method is not shown. An ST writing a patrol response often needs to know whether the patrolling character also feeds in this territory and by what method — that affects whether the patrol is personal-stake or detached observation.

The patrol character's feeding territory and method can be read from `sub.responses?.feeding_territories` (the same structure scanned for other feeders).

**4. XP purchase story-note absent from project prompts**

When a player buys XP during downtime (XP spend submitted with the downtime form), they often write a justification or story note (`sub.responses?.xp_story_note` or equivalent). This note sometimes describes events the ST should acknowledge in the project narrative (e.g. "I'm spending on Auspex because of what I saw at the warehouse"). The current project prompt has no XP spend field.

The relevant fields are `sub.responses?.xp_rows` (array of XP items) and `sub.responses?.xp_item` or `sub.responses?.xp_spend_note`. Confirmed from issue #362: the DT3 processing session found `xp_rows` and `xp_item` as the relevant keys.

---

## Acceptance Criteria

- [x] `buildLetterContext`: the correspondent's name appears immediately after the character header, before touchstones and aspirations, as `Correspondent: <name> (<kind>)` — or is absent if `storyMomentTarget` was not resolved
- [x] `buildProjectContext` investigation branch: when `actionType === 'investigate'`, include `Discipline used: <disc>` extracted from the pool validated string if a discipline name is present, or from the merits field
- [x] `buildPatrolContext` territory block: include the patrolling character's own feed status in the territory (`Self: Resident`, `Self: Poacher`, or `Self: Not feeding here`) immediately before the feeder list
- [x] `buildProjectContext` and `buildPatrolContext`: when `sub.responses?.xp_rows` or `sub.responses?.xp_item` is populated, include a `XP spend this cycle:` block immediately after the character ident line

---

## Implementation

### `public/js/admin/downtime-story.js`

#### 1. `buildLetterContext` — correspondent placement (line ~1418)

Move the `storyMomentTarget` block to immediately after the `_charIdentLine` push, before touchstones:

```js
const lines = ['Draft a Letter from Home for:', '', _compactCharHeader(char)];
const identLine = _charIdentLine(char);
if (identLine) lines.push(identLine);

// NEW: correspondent near top, before touchstones
if (storyMomentTarget?.name) {
  const kindLabel = storyMomentTarget.custom_label || storyMomentTarget.kind || '';
  lines.push('');
  lines.push(`Correspondent: ${storyMomentTarget.name}${kindLabel ? ` (${kindLabel})` : ''}`);
  lines.push('Write in this correspondent\'s voice. Do not address the character directly by name in the greeting.');
}

if (touchstones.length) { ... }
// ... rest of function ...

// REMOVE the existing storyMomentTarget block further down (currently after aspirations)
```

#### 2. `buildProjectContext` — discipline extraction for investigation (line ~612)

Add the discipline field in the investigation branch, after the roll result line:

```js
// Add after roll result block, before territory context:
if (isInvestigation && pool) {
  // Extract discipline name from pool expression, e.g. "Wits + Empathy + Auspex (7)" → "Auspex"
  const DISC_NAMES = ['Animalism','Auspex','Celerity','Dominate','Majesty','Nightmare','Obfuscate','Resilience','Vigour','Protean','Cruac','Theban Sorcery'];
  const foundDisc = DISC_NAMES.find(d => pool.includes(d));
  if (foundDisc) lines.push(`Discipline: ${foundDisc}`);
}
```

#### 3. `buildPatrolContext` — self feed status in territory block (line ~788)

After the feeder list is built, before `feeders.length` check, add the patrolling character's own status:

```js
// Determine patrol character's own feed status in this territory
let selfFeedStatus = 'Not feeding here';
if (terrSlug) {
  let selfTerrs = {};
  try { selfTerrs = JSON.parse(sub.responses?.feeding_territories || '{}'); } catch { /* ok */ }
  const selfVal = selfTerrs[terrSlug];
  if (selfVal === 'resident') selfFeedStatus = 'Resident';
  else if (selfVal && selfVal !== 'none') selfFeedStatus = 'Poacher';
}

// In the territory block, before feeder list:
lines.push(`Self: ${selfFeedStatus}`);
```

#### 4. XP spend note — both `buildProjectContext` and `buildPatrolContext`

Add the XP block immediately after the ident line push:

```js
// XP spend this cycle (player-written justification)
const xpRows   = sub.responses?.xp_rows;
const xpItem   = sub.responses?.xp_item;
const xpNote   = sub.responses?.xp_spend_note || sub.responses?.xp_note || '';

let xpSummary = '';
if (xpRows) {
  try {
    const rows = typeof xpRows === 'string' ? JSON.parse(xpRows) : xpRows;
    if (Array.isArray(rows) && rows.length) {
      xpSummary = rows.map(r => `${r.item || r.name || '?'} (${r.cost || r.xp || '?'} XP)`).join(', ');
    }
  } catch { /* skip */ }
} else if (xpItem) {
  xpSummary = xpItem;
}

if (xpSummary) {
  lines.push('');
  lines.push(`XP spend this cycle: ${xpSummary}`);
  if (xpNote) lines.push(`Player note: ${xpNote}`);
}
```

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-story.js` | Move correspondent block in `buildLetterContext`; add discipline extraction in `buildProjectContext`; add self feed status in `buildPatrolContext`; add XP spend block in `buildProjectContext` and `buildPatrolContext` |

No schema changes. No API changes. No CSS changes.

---

## Dev Notes

- The XP field names (`xp_rows`, `xp_item`) were confirmed from the DT3 MongoDB audit in issue #362. If both are absent, no XP block appears — the field is entirely conditional and gracefully absent.
- The discipline extraction uses a hardcoded list of discipline names (`_PATROL_DISCS` already exists in the file at line 671). Use that constant rather than duplicating the list. Extend it to include `'Theban Sorcery'` if missing.
- The correspondent block in `buildLetterContext` currently appears conditionally after aspirations. After the move, remove the old conditional block to avoid duplication. The new placement is unconditional on the correspondent being resolved (same condition: `storyMomentTarget?.name`).
- For the self-feed-status, `terrSlug` is already derived earlier in `buildPatrolContext` — use the same variable, not a re-derivation.

---

## Dev Agent Record

### Completion Notes

All four context field additions were already implemented in `downtime-story.js` from a prior session. Verified at:
- Correspondent placement: lines 1741-1747 (buildLetterContext) — before touchstones, after calibrationBlock; includes "Write in this correspondent's voice." extra line
- Discipline extraction: line 757-758 (buildProjectContext) — uses _PATROL_DISCS, label is "Discipline:" not "Discipline used:" (matches implementation spec); investigation guard correct
- Self feed status: lines 1052-1061 (buildPatrolContext) — inline on Residents/Poachers line as `| Self: ${selfFeedStatus}`; uses _terrGridVal tolerant read matching 496.2 audit
- XP spend: lines 694-713 (buildProjectContext) and 936-954 (buildPatrolContext) — both use xp_rows/xp_item/xp_spend_note/xp_note chain; project-slot-keyed XP also reads `project_N_xp_rows` at line 722

No code changes needed. Story closed.

### Change Log

- 2026-06-07: Verified all ACs satisfied in downtime-story.js from prior session. No code changes. Story closed.
