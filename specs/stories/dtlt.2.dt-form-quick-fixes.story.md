---
title: 'DT form quick fixes — six bundled one-liners'
type: 'fix'
created: '2026-04-30'
status: review
recommended_model: 'sonnet — six independent localised edits, exact line numbers given, no architectural decisions, low blast radius'
context:
  - specs/epic-dtlt-dt2-live-form-triage.md
  - public/js/tabs/downtime-form.js
  - public/js/tabs/downtime-data.js
  - public/js/tabs/relationships-tab.js
---

## Intent

**Problem:** Six independent bugs and copy issues from the live DT 2 form review (2026-04-30). All trivial edits in the DT form code area; bundled into one story to avoid per-fix ceremony. None of these blocks any other DTLT story; ship first to unblock players in DT 2.

**Approach:** Six targeted changes. Each maps to a single file and a known line range. No design decisions to make — every fix has exactly one correct shape per the diagnostic findings (Tasks #7, #8, #9, #11, #19, #25). Done in one PR; can be committed as one or six commits at the dev's preference.

## Boundaries & Constraints

**Always:**
- One commit per fix is fine; one commit covering all six is fine. Both are within convention.
- British English in any new player-facing copy (`Defence`, `Behaviour`, `Recognise`).
- No em-dashes in player-facing copy strings (project convention).
- Do not break sphere/status action selectors that still rely on the legacy `ambience_increase` / `ambience_decrease` keys (T19 fix is for project actions only — sphere/status keep their split values).

**Ask First:**
- The Contacts placeholder rewrite (T8) needs a replacement example. Three drafts in the I/O Matrix; pick one or write your own. **Default if no preference: option A** (mortal name + mortal-context query), since it most clearly models "vampire asks mortal contact."

**Never:**
- Do not also update `PROJECT_ACTIONS` to remove `'maintenance'` (T7). Maintenance belongs there — it is selectable on project slots only, where the player picks PT/MCI to maintain.
- Do not modify `ACTION_FIELDS['ambience_change']` while doing T19. Field config is correct; only the icon/label maps are missing.
- Do not modify the sphere `setNpcMode` analogues (e.g. sphere chip handlers). T11 is one ternary in `relationships-tab.js`.

## I/O & Edge-Case Matrix

| ID | Symptom | Affected line | Fix |
|---|---|---|---|
| T7 | "Maintenance" appears as an option in the Allies/Status sphere action dropdown | `tabs/downtime-data.js:57` | Delete the `maintenance` entry from `SPHERE_ACTIONS`. PROJECT_ACTIONS unchanged. |
| T8 | Contacts request placeholder uses Kindred-style honorific ("Lord Vance") that breaks Masquerade for a mortal contact query | `tabs/downtime-form.js:5263` | Replace example with mortal name + mortal-context query. |
| T9 | DT form Personal Story copy says "Visit the Relationships tab" but the More-grid tile is labelled "NPCs" | `tabs/downtime-form.js:3580` and `:3586` | Replace "Relationships tab" → "NPCs tab" in both strings. |
| T11 | "Another PC" button in the Add Relationship panel does nothing — clicking it leaves npc_mode at "existing" | `tabs/relationships-tab.js:758` | Replace the ternary with one that handles the third value `'pc'`. |
| T19 | Project tab card shows "No Action" + empty-action icon for Ambience Change projects despite the action being selected | `tabs/downtime-form.js:107-118` (maps) and `:2856-2858` (lookup) | Add `ambience_change` entries to `ACTION_ICONS` and `ACTION_SHORT`. Make the lookup direction-aware so the card label reflects improve/degrade. |
| T25 | Grow action target dropdown lets a player with Allies 3 jump straight to 5 (rule: up to 3 in one move; single bumps thereafter) | `tabs/downtime-form.js:4908` | Replace the loop bound with a `maxTarget` formula matching the existing merit XP picker. |

## Code Map

**T7 — Remove maintenance from SPHERE_ACTIONS:**

`public/js/tabs/downtime-data.js:46-58` currently:
```js
export const SPHERE_ACTIONS = [
  { value: '', label: '— No Action Taken —' },
  { value: 'ambience_increase', label: 'Ambience Change (Increase): Make a Territory delicious' },
  { value: 'ambience_decrease', label: 'Ambience Change (Decrease): Make Territory not delicious' },
  { value: 'attack', label: 'Attack: Attempt to destroy merits, holdings, projects, or NPCs' },
  { value: 'block', label: 'Block: Prevent someone else from using a specific Social Merit' },
  { value: 'hide_protect', label: 'Hide/Protect: Attempt to secure actions, merits, holdings, or projects' },
  { value: 'investigate', label: 'Investigate: Begin or further an investigation' },
  { value: 'patrol_scout', label: 'Patrol/Scout: Attempt to monitor a given Territory or area' },
  { value: 'grow', label: 'Grow: Attempt to acquire Allies or Status 4 or 5' },
  { value: 'misc', label: 'Misc: For things that don\'t fit in other categories' },
  { value: 'maintenance', label: 'Maintenance: Upkeep of professional or cult relationships' },  // ← DELETE THIS LINE
];
```

The `'maintenance': ['maintenance_target']` entry in `SPHERE_ACTION_FIELDS` at `tabs/downtime-form.js:144` becomes unreachable but is harmless — leave it (touching it is out of scope for this story).

**Audit note:** check whether any existing DT 2 submissions have `sphere_<n>_action: 'maintenance'` or `status_<n>_action: 'maintenance'`. Such records were misdirected and the ST may want to flag them for review. Run a one-time count query on `downtime_submissions` and report in the dev notes; do NOT migrate the data without ST decision.

**T8 — Contacts placeholder rewrite:**

`public/js/tabs/downtime-form.js:5263` currently:
```js
h += `<textarea id="dt-contact_${n}_request" class="qf-textarea" rows="3" placeholder="e.g. “What does Lord Vance know about the missing shipment from March?”">${esc(savedReq)}</textarea>`;
```

The placeholder example is the problem ("Lord Vance" reads as a Kindred court title; vampires don't ask mortals about Kindred by court name without breaching Masquerade).

**Three replacement drafts (pick one or write your own):**
- A. Mortal name + mortal-context query: `What does Marcus Reilly know about the missing shipment from March?`
- B. Place / event: `What's the talk around the docks about the missing shipment from March?`
- C. Rumour: `Is anyone asking around about the warehouse fire?`

Default: A. Update the placeholder string only; the surrounding label and description copy stay.

**Sibling occurrence (out of scope for this story but worth noting):** `tabs/downtime-data.js:194` references "Lord Vance" in the game-highlights field example. That one is the player narrating to STs (meta channel, not in-fiction), so not a Masquerade issue. If the dev wants to update it for consistency it's a one-line touch; if not, leave it.

**T9 — Relationships tab → NPCs tab copy:**

`public/js/tabs/downtime-form.js:3580`:
```js
h += '<p class="qf-section-intro">Pick a relationship to focus this cycle's off-screen moment. Don't have one yet? Visit the Relationships tab to add one, or submit without a story moment.</p>';
```

`public/js/tabs/downtime-form.js:3586`:
```js
h += '<p class="dt-osl-empty">You have no active relationships yet. Visit the Relationships tab to create one, or submit this downtime without a story moment.</p>';
```

Replace `Relationships tab` → `NPCs tab` in both. Visible label in `MORE_APPS` at `app.js:1354` is `label: 'NPCs'` — this aligns the copy with what the player actually sees in the tile grid.

The word "relationship" elsewhere in the same strings ("Pick a relationship", "no active relationships") refers to the entity, not the tab name — leave those untouched.

**T11 — Another PC button ternary:**

`public/js/tabs/relationships-tab.js:757-761`:
```js
function setNpcMode(el, char, mode) {
  _tabState.npc_mode = mode === 'new' ? 'new' : 'existing';
  _tabState.error = null;
  renderAddPanel(el, char);
}
```

Three valid modes exist — `'existing'`, `'new'`, `'pc'` — as defined at lines 806-808 of the same file:
```js
<button ... data-npc-mode="existing">Existing NPC</button>
<button ... data-npc-mode="new">New NPC (pending)</button>
<button ... data-npc-mode="pc">Another PC</button>
```

The render branch at line 944 already handles `'pc'`. Only `setNpcMode` is broken.

Replace line 758 with:
```js
_tabState.npc_mode = (mode === 'new' || mode === 'pc') ? mode : 'existing';
```
or equivalent (`['new', 'pc'].includes(mode) ? mode : 'existing'`).

**T19 — Ambience Change tab card label and icon:**

`public/js/tabs/downtime-form.js:107-118`:
```js
const ACTION_ICONS = {
  '': '⊘', 'ambience_increase': '▲', 'ambience_decrease': '▼',
  'attack': '⚔', 'feed': '♦', 'hide_protect': '◆',
  'investigate': '◎', 'patrol_scout': '◈', 'support': '★',
  'xp_spend': '✦', 'misc': '●',
};
const ACTION_SHORT = {
  '': 'No Action', 'ambience_increase': 'Ambience +', 'ambience_decrease': 'Ambience −',
  'attack': 'Attack', 'feed': 'Feed (Rote)', 'hide_protect': 'Hide/Protect',
  'investigate': 'Investigate', 'patrol_scout': 'Patrol/Scout', 'support': 'Support',
  'xp_spend': 'XP Spend', 'misc': 'Misc',
};
```

These maps still only know about the legacy `ambience_increase` / `ambience_decrease` keys. Project actions were collapsed to `ambience_change` in dtui-10 but the maps weren't updated, so the project tab card (`:2856-2858`) falls through to the empty-key default. Sphere/status tabs still use the split keys (per `SPHERE_ACTIONS`) and continue working — don't break them.

The tab card lookup is at `:2856-2858`:
```js
const actionVal = saved[`project_${n}_action`] || '';
const icon = ACTION_ICONS[actionVal] || ACTION_ICONS[''];
const label = ACTION_SHORT[actionVal] || 'No Action';
```

**Direction-aware fix (preferred — matches legacy UX):**

Special-case `actionVal === 'ambience_change'` at the lookup site to read `saved[`project_${n}_ambience_dir`]` and choose the matching icon/label:
```js
const actionVal = saved[`project_${n}_action`] || '';
let icon, label;
if (actionVal === 'ambience_change') {
  const dir = saved[`project_${n}_ambience_dir`] || 'improve';
  icon = dir === 'improve' ? '▲' : '▼';
  label = dir === 'improve' ? 'Ambience +' : 'Ambience −';
} else {
  icon = ACTION_ICONS[actionVal] || ACTION_ICONS[''];
  label = ACTION_SHORT[actionVal] || 'No Action';
}
```

Maps stay unchanged. Sphere/status tabs unaffected.

**Static fallback (acceptable but loses up/down hint):** add `'ambience_change': '◇'` (◇) and `'ambience_change': 'Ambience'` to both maps. Simpler; loses direction info on the tab card. Default to the direction-aware version.

**T25 — Grow action target cap:**

`public/js/tabs/downtime-form.js:4908`:
```js
for (let d = currentDots + 1; d <= 5; d++) {
  const sel = savedTarget === d ? ' selected' : '';
  h += `<option value="${d}"${sel}>${d} dot${d !== 1 ? 's' : ''}</option>`;
}
```

Loop runs from `currentDots + 1` to `5`. At Allies 3, this offers 4 AND 5 as targets — letting the player jump 3→5 in one Grow action.

The same rule is correctly implemented in the merit XP picker at `:3417-3419`:
```js
const maxTarget = currentDots < 3
  ? Math.min(3, max)
  : Math.min(currentDots + 1, max);
```

For the Grow action (where max is 5), this becomes:
```js
const maxTarget = currentDots < 3 ? 3 : Math.min(currentDots + 1, 5);
for (let d = currentDots + 1; d <= maxTarget; d++) { ... }
```

Edge case: `currentDots >= 5` produces `maxTarget = 5`, inner loop body never runs (start > end). Dropdown shows only the placeholder option. Acceptable.

## Tasks & Acceptance

**Execution:**

- [ ] T7 — Delete `'maintenance'` row from `SPHERE_ACTIONS` at `public/js/tabs/downtime-data.js:57`. Run a one-time count query on `downtime_submissions` for `sphere_*_action === 'maintenance'` or `status_*_action === 'maintenance'` and report any hits in the dev notes.
- [ ] T8 — Replace the `placeholder` string at `public/js/tabs/downtime-form.js:5263`. Default to draft A.
- [ ] T9 — Replace `Relationships tab` → `NPCs tab` in the two strings at `public/js/tabs/downtime-form.js:3580` and `:3586`.
- [ ] T11 — Replace the ternary at `public/js/tabs/relationships-tab.js:758` to handle the `'pc'` mode value.
- [ ] T19 — Add direction-aware special-case at `public/js/tabs/downtime-form.js:2856-2858`. Maps unchanged.
- [ ] T25 — Replace the loop bound at `public/js/tabs/downtime-form.js:4908` with the `maxTarget` formula.
- [ ] Manual smoke: open the player DT form for a test character, exercise each fix path (see Verification).

**Acceptance Criteria:**

- **T7:** Given an Allies sphere slot, when the action selector renders, then "Maintenance" is not an option. Given a project slot, when the action selector renders, then "Maintenance" remains an option (PROJECT_ACTIONS unchanged).
- **T8:** Given the Contacts request textarea, when it renders empty, then the placeholder uses a non-Kindred name and a context a mortal contact could plausibly know. The example does NOT contain "Lord", "Lady", "Sire", or any other Kindred court title.
- **T9:** Given the Personal Story section renders for a character with no edges, when the empty-state copy displays, then it reads "Visit the NPCs tab to create one". Given the section renders for a character with edges, when the intro paragraph displays, then it reads "Visit the NPCs tab to add one".
- **T11:** Given the "+ Add Relationship" panel is open, when the player clicks "Another PC", then the panel re-renders with the PC-PC kind list (`playerPcPcKinds()`) and the PC selector. The button visually engages (selected style applied).
- **T19:** Given a project slot with `action: 'ambience_change'` and `ambience_dir: 'improve'`, when the project tab card renders, then it shows the up-arrow icon (▲) and label "Ambience +". Given the same slot with `ambience_dir: 'degrade'`, then it shows the down-arrow (▼) and "Ambience −". Given any other action type, then the existing icon/label lookup is unchanged. Given a sphere or status slot with `ambience_increase` or `ambience_decrease`, then those tabs render correctly (no regression).
- **T25:** Given a character with Allies 3, when they pick the Grow action, then the target dropdown offers only 4 (not 5). Given Allies 0, then the dropdown offers 1, 2, and 3. Given Allies 4, then the dropdown offers only 5. Given Allies 5, then the dropdown offers no selectable targets (placeholder only).

## Verification

**Commands:**
- No tests required (six trivial edits; logic covered by manual checks).

**Manual checks:**

1. **T7:** Open DT form for any character with Allies. In the Allies action picker, confirm "Maintenance" is gone. Open a project slot's action picker, confirm "Maintenance" is still there.
2. **T8:** Open DT form, navigate to Contacts section, view an empty Contacts request textarea. Confirm placeholder text. Type into it — placeholder disappears as expected.
3. **T9:** Open DT form for a character with no relationship edges. Confirm Personal Story empty-state reads "NPCs tab". Open for a character with edges; confirm intro reads "NPCs tab".
4. **T11:** Open the More-grid → NPCs tab → "+ Add Relationship". Click "Existing NPC" — Existing UI shows. Click "New NPC (pending)" — New UI shows. Click "Another PC" — PC-picker UI shows. All three buttons should engage visually and switch the panel content.
5. **T19:** Add a project slot, pick "Ambience Change", pick "Improve" direction. Confirm project tab card shows ▲ + "Ambience +". Switch to "Degrade". Confirm ▼ + "Ambience −". Switch to a different action type (e.g. Attack); confirm icon/label correct. Open Allies sphere section, configure an `ambience_increase` action; confirm sphere tab still works.
6. **T25:** Configure an Allies merit at rating 3. Open the Grow action picker for that merit. Confirm dropdown offers only "4 dots" (and the placeholder). Repeat for Allies 0 (offers 1/2/3), Allies 4 (offers 5), Allies 5 (placeholder only).

## Final consequence

Six paper cuts gone. Players in DT 2 can configure their submissions without hitting one of these bugs. No data shape changes; no API changes; no migration required. The fix shape for each is fully specified, so subsequent dev iteration on this code area (e.g. dtlt-3 Theme purge or dtlt-4 effective-rating sweep) doesn't trip over related issues.
