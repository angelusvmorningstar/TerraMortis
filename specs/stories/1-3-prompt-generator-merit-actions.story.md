# Story 1.3: Prompt Generator — Merit Actions

## Status: ready-for-dev

## Story

**As an** ST drafting a narrative response for an Allies, Status, Retainer, or Contacts action,
**I want** a Copy Context button that captures the merit's pool formula, roll result, and matrix interpretation,
**so that** the prompt correctly reflects what that success count means for that specific action type.

## Background

This story implements the action section cards in DT Story — Allies Actions, Status Actions, Retainer Actions, Contact Requests, and Resources/Skill Acquisitions — replacing the B1 section scaffolds. It closely mirrors the B2 project response card pattern but with merit-specific context (MERIT_MATRIX lookup, investigation matrix interpretation, ~50 word target).

Builds on B1 (tab shell, saveNarrativeField, isSectionComplete) and B2 (copyToClipboard, ACTION_TYPE_LABELS, buildUpdatedArray pattern).

### Data sources for merit actions in DT Story

Unlike B2 where all project data is in `sub.responses`, merit action data comes from three sources:

1. **`sub.merit_actions[idx]`** — player-submitted action (merit name/type, action type, desired outcome, description, pool expression)
2. **Character's merits** from `_allCharacters` — to get merit dots and qualifier  
3. **`sub.merit_actions_resolved[idx]`** — ST review data (pool_validated, roll, notes_thread, action_type_override, inv_secrecy, inv_has_lead, territory context)

### Deriving meritCategory

`meritCategory` is derived from the merit's type string using the same regex logic as `_parseMeritType` in `downtime-views.js` (lines 230–235):

```js
function deriveMeritCategory(meritTypeStr) {
  const s = (meritTypeStr || '').toLowerCase();
  if (/allies/.test(s))         return 'allies';
  if (/status/.test(s))         return 'status';
  if (/retainer/.test(s))       return 'retainer';
  if (/staff/.test(s))          return 'staff';
  if (/contacts?/.test(s))      return 'contacts';
  if (/resources?/.test(s))     return 'resources';
  return 'misc';
}
```

Call: `deriveMeritCategory(action.merit_type)` where `action = sub.merit_actions[idx]`.

### Grouping actions by category

```js
function groupActionsByCategory(sub, char) {
  const actions = sub.merit_actions || [];
  const resolved = sub.merit_actions_resolved || [];
  const groups = { allies: [], status: [], retainer: [], contacts: [], resources: [], misc: [] };
  actions.forEach((action, idx) => {
    const cat = deriveMeritCategory(action.merit_type);
    const rev = resolved[idx] || {};
    if (rev.pool_status === 'skipped') return; // suppress skipped
    groups[cat].push({ action, rev, idx, char });
  });
  return groups;
}
```

Sections to render, in order: allies → status → retainer → contacts → resources.
Suppress a section entirely if its group is empty.

### MERIT_MATRIX and INVESTIGATION_MATRIX (duplicated from downtime-views.js)

Both constants must be in `downtime-story.js`. Do not import from `downtime-views.js`.

**MERIT_MATRIX** (complete — copy exactly from downtime-views.js lines 136–186):

```js
const MERIT_MATRIX = {
  allies: {
    ambience_increase: { poolFormula: 'none', mode: 'auto',      effect: 'Lvl 3–4: +1 ambience; Lvl 5: +2 ambience' },
    ambience_decrease: { poolFormula: 'none', mode: 'auto',      effect: 'Lvl 3–4: −1 ambience; Lvl 5: −2 ambience' },
    attack:            { poolFormula: 'dots2plus2', mode: 'contested', effect: '(Atk − Hide/Protect) halved (round up) removed from target merit level', effectAuto: '(Level − Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes subtracted from any Attack, Scout, or Investigate targeting this merit', effectAuto: 'Level subtracted from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes added as uncapped Teamwork bonus to supported action pool', effectAuto: 'Dots added as uncapped Teamwork bonus' },
    patrol_scout:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 action revealed per success (priority: Attack > Scout > Investigate > Ambience > Support; detail scales 1–5+)', effectAuto: '(Level − Hide/Protect) successes; same info return' },
    investigate:       { poolFormula: 'dots2plus2', mode: 'contested', effect: 'See Investigation Matrix (Investigate − Hide/Protect = net successes)', effectAuto: 'See Investigation Matrix (Level − Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 similar-merit action revealed per success (priority order; detail 1–5+)', effectAuto: 'Merit Level = successes' },
    block:             { poolFormula: 'none',       mode: 'auto',      effect: 'Auto blocks merit of same level or lower' },
  },
  status: { /* same structure as allies */ },
  retainer: {
    /* same as allies except block: */
    block: { poolFormula: 'none', mode: 'blocked', effect: 'Cannot perform Block' },
  },
  staff: {
    ambience_increase: { poolFormula: 'none', mode: 'auto',      effect: '+1 ambience' },
    ambience_decrease: { poolFormula: 'none', mode: 'auto',      effect: '−1 ambience' },
    attack:            { poolFormula: 'none', mode: 'contested', effect: '(1 − Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'none', mode: 'instant',   effect: '−1 success from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'none', mode: 'instant',   effect: '+1 success to supported action' },
    patrol_scout:      { poolFormula: 'none', mode: 'contested', effect: '1 action revealed (1 − Hide/Protect = net successes; detail scales 1–5+)' },
    investigate:       { poolFormula: 'none', mode: 'contested', effect: 'See Investigation Matrix (1 − Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'none', mode: 'instant',   effect: '1 similar-merit action revealed (1 success)' },
    block:             { poolFormula: 'none', mode: 'blocked',   effect: 'Cannot perform Block' },
  },
  contacts: {
    investigate:  { poolFormula: 'contacts', mode: 'contested', effect: 'If ≥1 success: information appropriate to sphere/theme asked' },
    patrol_scout: { poolFormula: 'contacts', mode: 'contested', effect: 'If ≥1 success: information appropriate to sphere/theme asked' },
    rumour:       { poolFormula: 'contacts', mode: 'contested', effect: 'If ≥1 success: information appropriate to sphere/theme asked' },
  },
};
```

**INVESTIGATION_MATRIX** (complete — copy exactly from downtime-views.js lines 189–198):

```js
const INVESTIGATION_MATRIX = [
  { type: 'Public',       innate: +3, noLead: -1,
    results: ['Gain all publicly available information', 'Also gain lead on Internal information', 'Also gain lead on Confidential information', 'Also gain lead on Restricted information', 'Also one Rumour'] },
  { type: 'Internal',     innate: -1, noLead: -2,
    results: ['Gain lead on Internal information', 'Learn whether the information you seek exists', 'Gain vague Internal information', 'Gain basic Internal information', 'Gain detailed Internal information'] },
  { type: 'Confidential', innate: -2, noLead: -4,
    results: ['Gain lead on Confidential information', 'Learn whether the information you seek exists', 'Gain vague Confidential information', 'Gain basic Confidential information', 'Gain detailed Confidential information'] },
  { type: 'Restricted',   innate: -3, noLead: -5,
    results: ['Gain lead on Restricted information', 'Learn whether the information you seek exists', 'Gain vague Restricted information', 'Gain basic Restricted information', 'Gain detailed Restricted information'] },
];
```

### Matrix interpretation for the prompt

For investigate actions, compute the matrix outcome and include it in the prompt context:

```js
function getInvestigateInterpretation(rev) {
  if (!rev.roll || !rev.inv_secrecy) return null;
  const tier = INVESTIGATION_MATRIX.find(t => t.type === rev.inv_secrecy);
  if (!tier) return null;
  let modifier = tier.innate;
  if (!rev.inv_has_lead) modifier += tier.noLead;
  const netSuccesses = (rev.roll.successes || 0) + modifier;
  const resultIdx = Math.min(Math.max(netSuccesses - 1, 0), tier.results.length - 1);
  return netSuccesses >= 1
    ? `Matrix result (${tier.type}, ${netSuccesses} net): ${tier.results[resultIdx]}`
    : `Matrix result: insufficient successes`;
}
```

### Prompt structure for merit actions

```
You are helping a Storyteller draft a narrative response for a Vampire: The Requiem 2nd Edition LARP downtime action.

Character: {displayName(char)}
Action: {meritLabel} — {ACTION_TYPE_LABELS[actionType]}
Mode: {Rolled / Auto (no roll)}
Merit: {meritLabel} {dots}● ({qualifier})
Desired Outcome: {desired_outcome || '—'}
Description: {description || '—'}
Territory: {territory || '—'}               ← for allies/status (from st_review.territory_overrides)
Validated Pool: {pool_validated || pool_player || '—'}
Roll Result: {successes} success{es}{, Exceptional} — Dice: {dice_string}
Matrix Outcome: {getInvestigateInterpretation(rev)}   ← for investigate only
Effect (what this success count means): {matrixEntry.effect}

[ST Notes:]
- {note.author_name}: {note.text}

Write a brief narrative note (1–2 sentences, ~50 words) from the Storyteller's perspective describing the outcome of this action through the merit/contact/ally.

Style rules:
- Third person (the action is by an NPC merit, not the player character directly)
- British English
- No mechanical terms — no dot ratings, pool numbers, or success counts
- No em dashes
- Do not name game-mechanical concepts (no "Investigate", "Patrol/Scout", etc.)
- Focus on what the ally/contact/retainer actually did
```

Omit Territory line for retainer/contacts/resources sections. Omit Matrix Outcome line for non-investigate actions. Omit Roll Result if `rev.roll` is null. Omit ST Notes if empty. Omit Description/Desired Outcome if blank.

**Note on third person:** Merit actions are performed by NPCs (allies, contacts, retainers), not by the PC directly. The narrative describes what the NPC did, not what the PC did. This is the key difference from project prompts (~100 words, second person).

### Territory for allies/status actions

```js
const territory = sub.st_review?.territory_overrides?.[`allies_${idx}`] || '';
```

### Getting merit dots and qualifier from character sheet

```js
function getMeritDetails(char, action) {
  const meritName = (action.merit_type || '').replace(/\s*\d+\s*$/, '').trim();
  const merit = char.merits?.find(m =>
    m.name?.toLowerCase().includes(meritName.toLowerCase()) ||
    meritName.toLowerCase().includes(m.name?.toLowerCase())
  );
  return {
    dots: merit ? (merit.dots || 0) : 0,
    qualifier: merit?.qualifier || action.qualifier || '',
    label: merit?.name || meritName,
  };
}
```

### Pool display for auto-mode actions

If `poolFormula === 'none'` (mode: 'auto'), the pool display shows "Auto — no roll" instead of a dice count. No Roll button exists for these. No roll result shown.

If `poolFormula === 'dots2plus2'`, pool = `(dots × 2) + 2`.

### No Roll Needed actions

`pool_status === 'no_roll'` — render card and Copy Context button, but omit Roll Result line from prompt. The textarea and save/complete pattern is unchanged.

### Resources/Skill Acquisitions section

This section has **no narrative textarea** and **no Copy Context button**. It renders as a list of approval cards: merit/skill name, dots requested, an Approve/Flag toggle, and a notes field if flagging. Saves to `st_narrative.resource_approvals[idx]`.

```js
async function saveResourceApproval(submissionId, idx, approved, flagNote) {
  const arr = buildUpdatedArray(sub.st_narrative?.resource_approvals || [], idx, {
    action_index: idx,
    approved,
    flag_note: flagNote || '',
    reviewed_by: getUser()?.global_name || getUser()?.username || 'ST'
  });
  await saveNarrativeField(submissionId, { 'st_narrative.resource_approvals': arr });
}
```

### Action_responses save pattern

Follows the same `buildUpdatedArray` pattern from B2:

```js
function buildUpdatedArray(arr, idx, patch) {
  const updated = [...arr];
  while (updated.length <= idx) updated.push(null);
  updated[idx] = { ...(updated[idx] || {}), ...patch };
  return updated;
}
```

Save to `st_narrative.action_responses`:
```js
await saveNarrativeField(sub._id, {
  'st_narrative.action_responses': buildUpdatedArray(
    sub.st_narrative?.action_responses || [], idx,
    { action_index: idx, response: text, author, status: 'draft' }
  )
});
```

### Section completion for array sections

Use `actionResponsesComplete(sub, category)` — same pattern as `projectResponsesComplete` from B2:

```js
function actionResponsesComplete(sub, category) {
  const actions = (sub.merit_actions || []).filter((a, i) => {
    const cat = deriveMeritCategory(a.merit_type);
    const rev = sub.merit_actions_resolved?.[i] || {};
    return cat === category && rev.pool_status !== 'skipped';
  });
  if (actions.length === 0) return true; // suppressed section = complete
  return actions.every((_, i) => {
    const responses = sub.st_narrative?.action_responses || [];
    return responses[i]?.status === 'complete';
  });
}
```

---

## Acceptance Criteria

1. The Allies Actions, Status Actions, Retainer Actions, and Contact Requests sections render cards for each non-skipped merit action in the respective category. Empty categories are suppressed.
2. The Resources/Skill Acquisitions section renders approval cards (no textarea, no Copy Context) for resources-category actions.
3. Each narrative card shows: mode chip (Rolled / Auto), merit name + dots + qualifier, action type label, desired outcome, pool expression, roll result summary if applicable.
4. ST notes from `rev.notes_thread` are displayed read-only above the textarea if non-empty.
5. Copy Context assembles `buildActionContext(char, sub, idx)` — includes merit details, action mode, matrix effect text, investigation matrix interpretation (for investigate actions only), roll result (omitted if no roll), ST notes (omitted if empty), ~50 word house style rules.
6. For investigate actions, the prompt includes the computed matrix outcome based on `rev.inv_secrecy`, `rev.inv_has_lead`, and the roll's net successes.
7. The prompt uses third person ("your ally", "the contact") not second person (distinction from project prompts).
8. Territory line included for allies/status actions (read from `sub.st_review?.territory_overrides?.[allies_{idx}]`); omitted for retainer/contacts/resources.
9. Save Draft saves `{ response, author, status: 'draft' }` to `st_narrative.action_responses[idx]`. Mark Complete saves `status: 'complete'`. Both use `buildUpdatedArray` and `saveNarrativeField`.
10. Resources approval: Approve/Flag toggle saves to `st_narrative.resource_approvals[idx]`. No textarea rendered.
11. Skipped actions (`pool_status === 'skipped'`) are not rendered in any section.
12. No Roll Needed actions (`pool_status === 'no_roll'`) get a card and Copy Context, but no roll result line in the prompt.
13. MERIT_MATRIX and INVESTIGATION_MATRIX are duplicated in `downtime-story.js`. No import from `downtime-views.js`.

---

## Tasks / Subtasks

- [ ] Task 1: Add constants to downtime-story.js
  - [ ] MERIT_MATRIX — copy exactly from downtime-views.js lines 136–186
  - [ ] INVESTIGATION_MATRIX — copy exactly from downtime-views.js lines 189–198

- [ ] Task 2: Helper functions
  - [ ] `deriveMeritCategory(meritTypeStr)` — regex-based category detection
  - [ ] `groupActionsByCategory(sub, char)` — splits merit_actions into category buckets, filters skipped
  - [ ] `getMeritDetails(char, action)` — looks up dots and qualifier from char.merits
  - [ ] `getInvestigateInterpretation(rev)` — computes matrix outcome string
  - [ ] `actionResponsesComplete(sub, category)` — completion check for array sections
  - [ ] `buildUpdatedArray(arr, idx, patch)` — already in module from B2; confirm shared

- [ ] Task 3: buildActionContext(char, sub, idx) pure function
  - [ ] Reads merit action from `sub.merit_actions[idx]`
  - [ ] Reads resolved data from `sub.merit_actions_resolved[idx]`
  - [ ] Calls getMeritDetails, deriveMeritCategory, MERIT_MATRIX lookup
  - [ ] Calls getInvestigateInterpretation for investigate actions
  - [ ] Reads territory from `sub.st_review?.territory_overrides?.[allies_${idx}]`
  - [ ] Omits empty lines, omits roll result if no roll, omits investigation if not investigate
  - [ ] Returns prompt string

- [ ] Task 4: renderAlliesSection, renderStatusSection, renderRetainerSection, renderContactsSection
  - [ ] Each calls groupActionsByCategory and renders cards for its category
  - [ ] Card: mode chip, merit label + dots + qualifier, action type, outcome, pool, roll summary, notes (read-only), context block, Copy Context, textarea (pre-filled), Save Draft, Mark Complete
  - [ ] Context block collapsed if textarea has content
  - [ ] Completion indicators per card

- [ ] Task 5: renderResourcesSection
  - [ ] Lists resources-category actions as approval cards
  - [ ] Each card: merit/skill name, dots, Approve toggle, flag note field
  - [ ] Saves to st_narrative.resource_approvals[idx]
  - [ ] No textarea, no Copy Context button

- [ ] Task 6: Event delegation for merit action cards
  - [ ] Copy Context → buildActionContext → copyToClipboard
  - [ ] Context block toggle
  - [ ] Save Draft / Mark Complete → saveNarrativeField with action_responses
  - [ ] Resources Approve/Flag → saveResourceApproval

- [ ] Task 7: Update pill rail and sign-off counter
  - [ ] Include all action category sections in completion calculation
  - [ ] Use actionResponsesComplete per category
  - [ ] Resources section complete when all resource_approvals have approved !== undefined

- [ ] Task 8: CSS for merit action cards
  - [ ] `.dt-story-merit-card` — action card container
  - [ ] `.dt-story-mode-chip` — "Rolled" / "Auto" chip
  - [ ] `.dt-story-merit-header` — header row: mode chip + merit name + copy button
  - [ ] `.dt-story-merit-meta` — dots, qualifier, action type, territory pill
  - [ ] `.dt-story-resources-card` — approval card (narrower, no textarea)
  - [ ] `.dt-story-approve-btn`, `.dt-story-flag-btn` — approve/flag toggles

---

## Dev Notes

### Reading merit_actions array

```js
const action = sub.merit_actions?.[idx] || {};
// action fields: merit_type, action_type, desired_outcome, description, primary_pool, qualifier
```

### Mode chip label

```js
const matrixEntry = MERIT_MATRIX[meritCat]?.[actionType];
const mode = matrixEntry?.poolFormula === 'none' ? 'Auto' : 'Rolled';
```

### Pool display for Rolled actions

```js
const { dots } = getMeritDetails(char, action);
const basePool = matrixEntry?.poolFormula === 'dots2plus2' ? (dots * 2) + 2 : null;
const poolDisplay = rev.pool_validated || rev.pool_player ||
  (basePool ? `${basePool} dice` : 'Auto');
```

### Contacts pool

Contacts actions use `poolFormula: 'contacts'` — the pool is character-specific (Manipulation + social skill). Display `rev.pool_validated || rev.pool_player || 'Contacts pool'`.

### Investigation matrix modifier application

The `innate` modifier is built into the pool (set during ST processing in DT Processing tab via `rev.inv_secrecy`). In the prompt, show the _net_ result:

```js
// net = roll.successes + innate + (noLead modifier if !inv_has_lead)
```

If `rev.inv_secrecy` is absent (investigation not yet configured in DT Processing), omit the Matrix Outcome line from the prompt.

### Building the action context — field read order

```js
const action = sub.merit_actions?.[idx] || {};
const rev = sub.merit_actions_resolved?.[idx] || {};
const actionType = rev.action_type_override || action.action_type || '';
const meritCat = deriveMeritCategory(action.merit_type);
const { dots, qualifier, label } = getMeritDetails(char, action);
const matrixEntry = MERIT_MATRIX[meritCat]?.[actionType] || {};
const territory = ['allies', 'status'].includes(meritCat)
  ? (sub.st_review?.territory_overrides?.[`allies_${idx}`] || '')
  : '';
```

### Note: cross-action markers (Covered / Contested / Supported) not yet available

Story A1 adds cross-action markers. B3 does not need to wait for A1 — simply omit the cross-action chip section from this story. A1 will add it in a follow-up story.

### buildUpdatedArray is shared from B2

If B2 was implemented correctly, `buildUpdatedArray` already exists in `downtime-story.js`. Confirm it is exported or accessible before using it here. Do not duplicate it.

### getUser() import

Already confirmed in B2: import from `../auth/discord.js`. Do not re-declare.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-story.js` | Modify: add MERIT_MATRIX, INVESTIGATION_MATRIX, helpers, renderers, event handlers |
| `public/css/admin-layout.css` | Modify: add merit action card CSS in dt-story-* block |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Debug Log References
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-story.js`
- `public/css/admin-layout.css`
