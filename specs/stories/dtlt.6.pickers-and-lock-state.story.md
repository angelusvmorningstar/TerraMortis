---
title: 'Pickers and lock state — Safe Word resilience, Touchstone hint, Hide/Protect merit picker, sphere support lock'
type: 'fix'
created: '2026-04-30'
status: review
recommended_model: 'sonnet — four bounded UX/render fixes, each mirroring an existing pattern in the codebase; no schema or architectural decisions'
context:
  - specs/epic-dtlt-dt2-live-form-triage.md
  - public/js/editor/rule_engine/safe-word-evaluator.js
  - public/js/editor/mci.js
  - public/js/tabs/relationships-tab.js
  - public/js/tabs/downtime-form.js
  - C:/Users/angel/.claude/projects/D--Terra-Mortis-TM-Suite/memory/feedback_player_natural_language.md
---

## Intent

**Problem:** Four bounded UX/render fixes from the live DT 2 form review (2026-04-30). Each is independent; bundled because all four mirror established patterns in the codebase and the dev cost is dominated by the (small) per-fix discovery work, not the implementation itself.

1. **T6 — Safe Word merit stripped on player side.** `applySafeWordRulesFromDb` (`public/js/editor/rule_engine/safe-word-evaluator.js:17`) accepts an `allChars` argument; when empty, the partner-presence check at line 30 returns `isActive = false` and `_removeStaleSwMerit(c)` deletes the auto-created merit from the in-memory character. Eight call sites pass single-arg `applyDerivedMerits(c)` (no `allChars`), so the merit silently disappears every time the form, sheet, or DT view renders on the player side. ST main sheet works because `admin.js:380` passes `chars`. Symptom: player can't see Allies (Underworld) granted by Safe Word in DT form or app sheet, but ST sees it on the main sheet.

2. **T10 — Touchstone missing from Relationships tab Kind dropdown.** `playerCreatableKinds()` at `relationships-tab.js:51-57` correctly filters out touchstone (touchstones are created via the sheet's touchstone picker, not the relationships tab). But the absence is silent — STs (especially Symon) reasonably expect every kind to be reachable from the relationships tab and find no clue about where touchstones live. A small hint below the dropdown closes the discoverability gap.

3. **T20 — Project Hide/Protect missing merit picker.** Project hide_protect routes through `renderTargetCharOrOther` (`downtime-form.js:4765`) which only offers Character / Other target types. The PROJECT_ACTIONS label at `downtime-data.js:14` literally says "Hide/Protect: Attempt to secure actions, **merits**, holdings, or projects" — but merits aren't offered. The sphere-side hide_protect at `SPHERE_ACTION_FIELDS:139` correctly uses `target_own_merit` (rendered at `downtime-form.js:5000-5013` as a merit dropdown). Add an "Own Merit" option to the project-side target ticker and reuse the existing widget.

4. **T24 — Sphere slot doesn't lock when Ally is committed as project support.** Chip-click handler at `downtime-form.js:2313-2330` correctly sets `saved['sphere_${i}_action'] = 'support'` and updates `saved['project_${n}_joint_sphere_chips']`. But the sphere pane render at `:5129-5167` shows the standard action dropdown, and `SPHERE_ACTIONS` (`downtime-data.js:46-58`) has no `'support'` entry — so the dropdown shows "no action selected" with no badge, and the player can freely overwrite the support commitment by picking another sphere action. Mirror the rote-feeding lock pattern at `:2893-2904`.

**Approach:** Four targeted edits, each scoped to one bug:

1. Make Safe Word evaluator graceful when `allChars` is empty/missing — treat as "can't verify, skip this evaluator" instead of "pact is broken, delete the merit".
2. Add a hint paragraph below the Kind dropdown in the relationships add panel.
3. Add an "Own Merit" target type to `renderTargetCharOrOther` (gated by an `includeOwnMerit` flag passed from `renderTargetZone`) and render the existing merit dropdown when selected. Update the project hide_protect entry in `renderTargetZone` to pass `includeOwnMerit: true`.
4. Add a locked-state branch at the top of the sphere pane render that mirrors the rote-feeding lock pattern when `saved['sphere_${n}_action'] === 'support'`. Trigger an immediate re-render on chip-click so the lock appears the instant the player ticks the chip in another tab.

## Boundaries & Constraints

**Always:**
- The four fixes ship in one PR but can be split into separate commits if the dev prefers per-fix commits.
- T6 fix is the smallest behavioural change that restores parity — a guard at the top of the evaluator. Do NOT change all eight `applyDerivedMerits(c)` callers to pass `allChars`. The evaluator is the right place to be defensive.
- T20 reuses the existing merit dropdown rendered by `target_own_merit` field path (`downtime-form.js:5000-5013`). Do NOT reimplement the merit list — share the rendering by introducing a small helper or by inlining the same logic in `renderTargetCharOrOther` when `effectiveType === 'own_merit'`.
- T24's sphere lock badge text matches the project-tab joint badge convention — phrasing is "Committed to support of Project N" using the project number (no joint description needed because the sphere pane doesn't have access to the joint's title; project number suffices for player orientation).
- Re-render on chip-click (T24) uses the existing `renderForm(container)` pattern — add a single `renderForm(container)` call before the existing `scheduleSave()` at line 2328. The chip's `dt-chip--selected` class toggle at line 2319 still happens before re-render so the user sees instant feedback even if re-render is async.

**Ask First:**
- **T6 — graceful behaviour when partner exists in `allChars` but the partner pact is broken.** The current `_removeStaleSwMerit(c)` path at line 38 fires both for "no allChars" AND "allChars present but partner not mutual". The first case is the bug; the second is intentional cleanup. Default fix: only suppress the deletion when `allChars` is empty (length === 0); preserve the deletion when `allChars` has entries but the partner check fails. Confirm during implementation that this distinction is sound — the alternative (always preserve) leaves stale merits when a pact is genuinely broken.

**Never:**
- Do not change the `_removeStaleSwMerit` logic itself. Keep the dot-channel zero check intact (it's correct: only delete the auto-created merit if no purchased / derived dots remain). The fix is at the call site, not the helper.
- Do not modify the eight call sites that pass `applyDerivedMerits(c)` single-arg. The whole point of the T6 fix is that the evaluator becomes resilient to this rather than forcing every caller to thread `allChars`.
- Do not change `playerCreatableKinds()` or `playerPcPcKinds()` (T10). Touchstone exclusion is intentional architecture per the comment at `relationships-tab.js:48-50`. Story default: hint text only. (A separate follow-up could add ST-role touchstone creation; out of scope here.)
- Do not change the `target_own_merit` dropdown widget itself (T20). Only add the "Own Merit" target type as a routing option that delegates to the same widget.
- Do not modify the chip-click handler's `saved['sphere_${i}_action'] = 'support'` write (T24 line 2321). The data link is correct; only the render-side display and the absence of re-render are bugs.
- Do not collapse `SPHERE_ACTIONS` and the locked-state branch — keep them separate. The dropdown is for live action selection; the locked state replaces the dropdown entirely (mirroring rote-feeding pattern).

## I/O & Edge-Case Matrix

| Fix | Scenario | Pre-fix | Post-fix |
|---|---|---|---|
| **T6** | Player opens DT form, char has Safe Word pact + partner-mirrored Allies (Underworld) | `applyDerivedMerits(char)` runs without allChars; SW merit deleted from in-memory char; DT form sphere section shows no Allies (Underworld) | SW merit retained when allChars is empty; DT form shows Allies (Underworld) as expected |
| **T6** | ST opens admin sheet for the same char | `applyDerivedMerits(c, chars)` runs with allChars; partner found; merit retained (already works) | Unchanged (already works) |
| **T6** | Partner has broken pact (no longer mutual) AND allChars is passed | `_removeStaleSwMerit` runs; merit deleted (correct) | Same — deletion preserved when allChars is non-empty and partner check fails |
| **T6** | Partner has broken pact AND allChars is empty | Same as above (deletion fires) | Deletion suppressed (allChars empty → can't verify → skip) — partner pact will be re-checked on next render that does pass allChars |
| **T10** | ST opens "+ Add Relationship" panel and looks at the Kind dropdown | Touchstone is missing; no explanation | Hint text below the dropdown reads: "Touchstones are added on the character sheet." |
| **T10** | Player opens the same panel | Same — touchstone missing, no hint | Same hint shown to players (not role-gated) |
| **T20** | Player picks Hide/Protect on a project slot | Target ticker offers Character / Other; no merit option | Target ticker offers Own Merit / Character / Other |
| **T20** | Player picks "Own Merit" | n/a | Merit dropdown renders showing the character's merits (using the same widget as sphere hide_protect at `:5004-5012`) |
| **T20** | Player picks "Own Merit" then selects "Allies (Police)" | n/a | `project_N_target_value = 'Allies\|Police'` (matching the merit-key shape at line 5008); save persists |
| **T20** | Sphere/status hide_protect (separate from project) | Already uses `target_own_merit` field; works | Unchanged — only the project-side path gains the option |
| **T24** | Player ticks an Ally chip in Project 1's Support Assets panel | `sphere_1_action` set to `'support'` in saved state; sphere pane shows action dropdown with no selection (no `'support'` option in SPHERE_ACTIONS); player can overwrite | Sphere pane re-renders on chip-click; pane shows lock badge "Committed to support of Project 1" with no editable controls; overwriting requires un-ticking the chip first |
| **T24** | Player un-ticks the chip in Project 1 | `sphere_1_action` cleared to `''`; sphere pane still shows whatever the previous render was | Form re-renders; sphere pane returns to normal action dropdown with no selection |
| **T24** | Same Ally is used for Project 2's Support after un-tick from Project 1 | Same chip behaviour; sphere shows no useful state | Sphere pane shows "Committed to support of Project 2" |
| **T24** | Player navigates to sphere section without ticking any chips | Standard action dropdown | Standard action dropdown (no regression for the unlocked path) |

## Code Map

### T6 — Safe Word evaluator graceful

`public/js/editor/rule_engine/safe-word-evaluator.js:17`. Current signature:
```js
export function applySafeWordRulesFromDb(c, { grants = [] } = {}, allChars = []) {
```

Add a guard at the top of the for-loop body, before the `_removeStaleSwMerit(c)` call. The simplest implementation:

```js
export function applySafeWordRulesFromDb(c, { grants = [] } = {}, allChars = []) {
  const meritGrants = grants.filter(r => r.grant_type === 'merit' && r.condition === 'partner_pact_confirmation');
  if (!meritGrants.length) return;

  // T6 (DTLT-6): when allChars is empty/missing, the partner-presence check
  // can't run. Treat as "can't verify, skip this evaluator" rather than
  // "pact is broken, delete the merit". Eight call sites pass single-arg
  // applyDerivedMerits(c) (no allChars); without this guard, the merit gets
  // stripped on every player-side render. See specs/stories/dtlt.6.*.
  const canVerifyPartner = Array.isArray(allChars) && allChars.length > 0;

  for (const rule of meritGrants) {
    const sourceLower = rule.source.toLowerCase();
    const swPact = (c.powers || []).find(
      p => p.category === 'pact' && (p.name || '').toLowerCase() === sourceLower,
    );
    if (!swPact || !swPact.partner) continue;

    if (!canVerifyPartner) continue;  // skip this evaluator — partner check unavailable

    // ...rest unchanged from line 29 onward
```

The `continue` skips the `_removeStaleSwMerit` path (and the rest of the rule processing) when partner verification is impossible. The merit stays in `c.merits` from whatever the document state is. Once a render with `allChars` runs (e.g. on the ST sheet or on the next player-side path that has been updated to thread `allChars`), the evaluator runs the full check and either confirms or removes the merit per its current rules.

**Note for the dev:** verify the test fixtures in `server/tests/safe-word-parallel-write.test.js` still pass. The existing test cases all pass `allChars`; they should be unaffected. If a test asserts the "no allChars → merit removed" behaviour, that test was capturing the bug — the test needs updating to match the corrected semantics.

### T10 — Touchstone hint in relationships add panel

`public/js/tabs/relationships-tab.js` — the panel HTML is built at line 800-895 (the `panel.innerHTML = \`...\`` block). Find the Kind dropdown rendering (around line 870 area where `${kindGroups}` is interpolated). Below the `</select>` for Kind, before the next field, add:

```html
<p class="rel-add-hint rel-add-touchstone-hint">Touchstones are added on the character sheet.</p>
```

If `.rel-add-hint` already exists as a CSS class (it appears on line 817 and elsewhere), reuse it. The added `.rel-add-touchstone-hint` modifier is optional (allows targeted styling later) — the dev can drop it if they prefer minimal CSS surface.

The hint shows for both player and ST roles. Per memory `feedback_player_natural_language.md`, "tab" terminology is acceptable here because the hint references the *character sheet*, not the relationships UI itself. Don't say "go to the touchstones tab" — say "on the character sheet" because that's where the picker lives.

### T20 — Project Hide/Protect merit picker

Two changes in `public/js/tabs/downtime-form.js`:

**Change 1** — `renderTargetZone` (line 4737-4776). The `hide_protect` and `attack` branch at line 4765 currently:
```js
} else if (['attack', 'hide_protect'].includes(actionVal)) {
  h += renderTargetCharOrOther(n, savedType, savedCharId, savedTerrId, savedOther, chars, false);
}
```

Split `hide_protect` from `attack` and pass an `includeOwnMerit` flag. New shape:
```js
} else if (actionVal === 'attack') {
  h += renderTargetCharOrOther(n, savedType, savedCharId, savedTerrId, savedOther, chars, { includeTerritory: false });
} else if (actionVal === 'hide_protect') {
  h += renderTargetCharOrOther(n, savedType, savedCharId, savedTerrId, savedOther, chars, { includeTerritory: false, includeOwnMerit: true });
} else if (['investigate', 'misc'].includes(actionVal)) {
  h += renderTargetCharOrOther(n, savedType, savedCharId, savedTerrId, savedOther, chars, { includeTerritory: true });
}
```

(Migrating the trailing positional `includeTerritory` arg to an options object is cleaner than adding a positional `includeOwnMerit` after it. If the dev prefers minimum diff, keep the positional `includeTerritory` and add `includeOwnMerit` as a second positional — both shapes work; the options-object refactor is preferred for readability.)

**Change 2** — `renderTargetCharOrOther` (line 4778-4811). Adapt the signature and add the `'own_merit'` option:
```js
function renderTargetCharOrOther(n, savedType, savedCharId, savedTerrId, savedOther, chars, opts = {}) {
  const { includeTerritory = false, includeOwnMerit = false } = opts;
  const options = [];
  if (includeOwnMerit) options.push('own_merit');
  options.push('character');
  if (includeTerritory) options.push('territory');
  options.push('other');
  const labelMap = { own_merit: 'Own Merit', character: 'Character', territory: 'Territory', other: 'Other' };
  // Default to 'character' for two-way (attack) when no type saved; for hide_protect, default to 'own_merit'
  const effectiveType = savedType || (includeOwnMerit ? 'own_merit' : (includeTerritory ? '' : 'character'));

  let h = `<fieldset class="dt-ticker" aria-label="Target type">`;
  for (const opt of options) {
    const chk = effectiveType === opt ? ' checked' : '';
    h += `<label class="dt-ticker__pill"><input type="radio" name="dt-project_${n}_target_type" value="${esc(opt)}"${chk} data-flex-type="project_${n}_target"> ${esc(labelMap[opt])}</label>`;
  }
  h += '</fieldset>';

  if (effectiveType === 'own_merit') {
    // Reuse the merit dropdown from the sphere-side target_own_merit field path (downtime-form.js:5000-5013).
    h += `<select id="dt-project_${n}_target_value" class="qf-select">`;
    h += '<option value="">— Select Merit / Asset —</option>';
    for (const m of (currentChar.merits || [])) {
      const mLabel = m.area ? `${m.name} (${m.area})` : (m.qualifier ? `${m.name} (${m.qualifier})` : m.name);
      const mKey = `${m.name}|${m.area || m.qualifier || ''}`;
      const sel = mKey === savedCharId ? ' selected' : '';  // savedCharId carries the merit-key when type=own_merit
      h += `<option value="${esc(mKey)}"${sel}>${esc(mLabel)}</option>`;
    }
    h += '</select>';
  } else if (effectiveType === 'character') {
    // ...existing character chip grid...
  } else if (effectiveType === 'territory') {
    // ...existing territory pills...
  } else if (effectiveType === 'other') {
    // ...existing other text input...
  }
  return h;
}
```

Reuse note: rather than copying the merit dropdown, the dev can extract a small `renderOwnMeritDropdown(prefix, savedKey, charMerits)` helper used by both the project-side path here and the sphere-side `target_own_merit` field rendering at line 5000-5013. Either approach is acceptable; the extraction is the better long-term shape but the inline copy is acceptable for a bounded fix.

**Validation**: when target_type is `'own_merit'`, the saved value should be a merit-key string (matching the format `${m.name}|${m.area || m.qualifier || ''}` from line 5008). Existing collector at `:485-486` already captures `target_value` from the hidden input — works correctly with the merit dropdown's value attribute.

### T24 — Sphere slot lock when committed as support

Two changes in `public/js/tabs/downtime-form.js`:

**Change 1** — Sphere pane render at line 5128-5167. Insert a locked-state branch immediately after line 5135 (where the pane wrapper opens):

```js
for (let n = 1; n <= maxSpheres; n++) {
  const m = detectedMerits.spheres[n - 1];
  const actionVal = saved[`sphere_${n}_action`] || '';
  const visible = n === activeSphereTab;
  const fields = SPHERE_ACTION_FIELDS[actionVal] || [];

  h += `<div class="dt-proj-pane${visible ? '' : ' dt-proj-pane-hidden'}" data-sphere-pane="${n}">`;

  // Merit info header
  h += `<div class="dt-sphere-merit-info">${esc(meritLabel(m))}</div>`;

  // T24 (DTLT-6): if this sphere is committed as support to a project, lock
  // the pane (mirrors rote-feeding lock at downtime-form.js:2893-2904).
  // The chip in the project's Support Assets panel sets sphere_N_action='support'.
  if (actionVal === 'support') {
    // Find the owning project by scanning joint_sphere_chips arrays.
    const sphereSlotKey = `sphere_${n}`;
    let owningProject = null;
    for (let pn = 1; pn <= 4; pn++) {
      let chips = [];
      try { chips = JSON.parse(saved[`project_${pn}_joint_sphere_chips`] || '[]'); } catch { chips = []; }
      if (Array.isArray(chips) && chips.includes(sphereSlotKey)) {
        owningProject = pn;
        break;
      }
    }
    h += '<div class="dt-sphere-locked">';
    h += `<span class="dt-sphere-locked-badge">Committed to support of Project ${owningProject || '?'}</span>`;
    h += `<p class="dt-sphere-locked-help">Un-tick this Ally's chip in the project's Support Assets panel to free this slot.</p>`;
    h += '</div>';
    h += `<input type="hidden" id="dt-sphere_${n}_action" value="support">`;
    h += `<input type="hidden" id="dt-sphere_${n}_merit_key" value="${esc(meritKey(m))}">`;
    h += '</div>'; // close pane
    continue;
  }

  // Store which merit this slot references
  h += `<input type="hidden" id="dt-sphere_${n}_merit_key" value="${esc(meritKey(m))}">`;

  // ...existing action dropdown render (line 5143 onward)...
}
```

CSS class names follow the rote-feeding pattern: `.dt-sphere-locked` mirrors `.dt-proj-rote-locked`, `.dt-sphere-locked-badge` mirrors `.dt-proj-rote-badge`. If those CSS classes don't yet exist for the sphere variant, copy the rote rules into the same stylesheet under the new class names. The dev can also reuse the existing `.dt-proj-rote-locked` / `.dt-proj-rote-badge` classes if the styling is identical — pragmatic, less CSS surface.

**Change 2** — Chip-click handler at line 2313-2330. Add `renderForm(container)` before the existing `scheduleSave()`:

Currently:
```js
const sphereChip = e.target.closest('[data-joint-sphere-slot]');
if (sphereChip && !sphereChip.disabled) {
  const n = sphereChip.dataset.jointSphereSlot;
  const slotKey = sphereChip.dataset.sphereKey;
  const type = sphereChip.dataset.sphereType;
  const willSelect = !sphereChip.classList.contains('dt-chip--selected');
  sphereChip.classList.toggle('dt-chip--selected', willSelect);
  if (type === 'sphere') {
    saved[`${slotKey}_action`] = willSelect ? 'support' : '';
  }
  const allSphereChips = container.querySelectorAll(`[data-joint-sphere-slot="${n}"]`);
  const keys = [...allSphereChips]
    .filter(el => el.classList.contains('dt-chip--selected'))
    .map(el => el.dataset.sphereKey);
  saved[`project_${n}_joint_sphere_chips`] = JSON.stringify(keys);
  scheduleSave();
  return;
}
```

After:
```js
const sphereChip = e.target.closest('[data-joint-sphere-slot]');
if (sphereChip && !sphereChip.disabled) {
  const n = sphereChip.dataset.jointSphereSlot;
  const slotKey = sphereChip.dataset.sphereKey;
  const type = sphereChip.dataset.sphereType;
  const willSelect = !sphereChip.classList.contains('dt-chip--selected');
  sphereChip.classList.toggle('dt-chip--selected', willSelect);
  if (type === 'sphere') {
    saved[`${slotKey}_action`] = willSelect ? 'support' : '';
  }
  const allSphereChips = container.querySelectorAll(`[data-joint-sphere-slot="${n}"]`);
  const keys = [...allSphereChips]
    .filter(el => el.classList.contains('dt-chip--selected'))
    .map(el => el.dataset.sphereKey);
  saved[`project_${n}_joint_sphere_chips`] = JSON.stringify(keys);
  // T24 (DTLT-6): re-render so the sphere pane lock badge appears immediately
  // when a sphere chip is ticked (or disappears when un-ticked). Without this,
  // the lock state only updates on the next form re-render (e.g. after user
  // navigates to sphere section).
  const responses = collectResponses();
  if (responseDoc) responseDoc.responses = responses;
  else responseDoc = { responses };
  renderForm(container);
  return;  // skip scheduleSave() — renderForm path triggers save via its own mechanism
}
```

Note: `renderForm(container)` already triggers a save via the standard render-then-save pattern used elsewhere in the file (e.g. `:2103-2111` for sorcery rite selection). Replacing `scheduleSave()` with the render-form sequence is the established pattern.

## Tasks & Acceptance

**Execution:**

- [ ] T6 — `public/js/editor/rule_engine/safe-word-evaluator.js`: add the `canVerifyPartner` guard at the top of the for-loop body. Verify `server/tests/safe-word-parallel-write.test.js` still passes; update any test that asserts the buggy "no allChars → merit removed" behaviour.
- [ ] T10 — `public/js/tabs/relationships-tab.js`: add hint paragraph below the Kind dropdown in the add panel HTML.
- [ ] T20 — `public/js/tabs/downtime-form.js`:
  - `renderTargetZone` (line 4765): split hide_protect from attack, pass `{includeOwnMerit: true}` for hide_protect.
  - `renderTargetCharOrOther` (line 4778): adapt signature to options object; add `'own_merit'` option and merit dropdown render.
  - (Optional but preferred) extract `renderOwnMeritDropdown` helper shared with the existing sphere-side `target_own_merit` field path at line 5000-5013.
- [ ] T24 — `public/js/tabs/downtime-form.js`:
  - Sphere pane render (line 5128-5167): insert locked-state branch before the standard action dropdown.
  - Chip-click handler (line 2313-2330): replace `scheduleSave()` with the `collectResponses()` + `renderForm(container)` pattern so the lock state renders immediately.
  - Add CSS rules for `.dt-sphere-locked` / `.dt-sphere-locked-badge` / `.dt-sphere-locked-help` (mirror rote-feeding rules; OR reuse the rote classes if styling is identical — dev's call).
- [ ] Manual smoke per Verification.

**Acceptance Criteria:**

- **T6 — Safe Word resilience:**
  - Given a character with an active mutual Safe Word pact, when the DT form, app sheet, or any single-arg `applyDerivedMerits(c)` caller renders the character, then the SW-granted partner-mirrored merit is NOT stripped from `c.merits`.
  - Given the ST main sheet renders the same character (with `allChars` passed), when `applyDerivedMerits` runs, then partner verification proceeds and the merit's `free_sw` value reflects the partner's effective rating (existing behaviour, no regression).
  - Given the partner has broken the pact (no longer mutual) AND `allChars` is passed, when `applyDerivedMerits` runs, then `_removeStaleSwMerit` fires and the merit is deleted (existing intentional cleanup, preserved).
  - Given partner is genuinely absent AND `allChars` is empty (player-side render), when `applyDerivedMerits` runs, then the merit is preserved (deletion deferred to a render with `allChars`).
- **T10 — Touchstone hint:**
  - Given an ST or player opens the relationships tab and clicks "+ Add Relationship", when the panel renders, then a hint paragraph below the Kind dropdown reads "Touchstones are added on the character sheet."
  - Given the player switches between Existing NPC / New NPC / Another PC modes, when the panel re-renders, then the hint remains visible (it's a property of the Kind field, not of the mode).
- **T20 — Project Hide/Protect merit picker:**
  - Given a player picks "Hide/Protect" on a project slot, when the target zone renders, then the target type ticker offers Own Merit / Character / Other (in that order).
  - Given the target type defaults to "Own Merit" for a freshly-picked Hide/Protect (no saved type), when the form renders, then the merit dropdown is visible by default.
  - Given the player selects a merit from the dropdown, when the form saves, then `project_N_target_type === 'own_merit'` and `project_N_target_value === '<merit-name>|<area-or-qualifier>'`.
  - Given the player switches the target type to "Character" or "Other", when the form re-renders, then the corresponding sub-picker appears (existing behaviour preserved for the non-merit paths).
  - Given a sphere or status hide_protect (separate from project), when the form renders, then it continues to use `target_own_merit` directly (no regression for sphere/status side).
- **T24 — Sphere slot lock:**
  - Given a player ticks an Ally chip in a project's Support Assets panel, when the form re-renders, then the corresponding sphere pane shows a locked badge "Committed to support of Project N" (where N is the project number) and no editable action dropdown.
  - Given the same chip is un-ticked, when the form re-renders, then the sphere pane returns to the standard action dropdown with no selection.
  - Given the chip is ticked in Project 1, when the player navigates to the sphere section, then the lock badge is visible immediately (not deferred to next render).
  - Given a sphere with no support commitment (no chip ticked), when the sphere pane renders, then the standard action dropdown is shown (no regression for the unlocked path).
  - Given the chip is moved from Project 1 to Project 2 (un-tick + re-tick in different panel), when the form re-renders, then the sphere pane shows "Committed to support of Project 2".

## Verification

**Commands:**

- `cd server && npx vitest run safe-word-parallel-write` — green (T6 fix should not regress; updates may be needed if a test asserted the buggy semantics).
- No new tests required for T10, T20, T24 (manual UI checks are sufficient).
- Browser console clean during render and interaction for all four fixes.

**Manual checks:**

1. **T6:**
   - Pick a character with an active Safe Word pact (Ballsack per the original report). Open the DT form. Confirm the partner-mirrored merit (e.g. Allies (Underworld)) is visible in the relevant section.
   - Open the same character on the Game-app sheet (player surface). Confirm the merit is shown.
   - Open the ST main sheet for the same character. Confirm the merit is also shown (no regression).
   - Optional: simulate a broken pact by editing the partner's pact entry locally; confirm the merit is preserved on player-side renders (allChars empty path) but deleted on ST-side render (allChars passed).
2. **T10:**
   - Open the relationships tab on any character. Click "+ Add Relationship". Look at the Kind dropdown. Confirm the hint paragraph below it reads "Touchstones are added on the character sheet."
   - Switch through Existing NPC / New NPC / Another PC modes. Confirm the hint stays visible.
3. **T20:**
   - Open the DT form for a character with at least one merit (any kind). Add a project slot. Pick "Hide/Protect" as the action.
   - Confirm the target type ticker shows three pills: Own Merit / Character / Other.
   - Confirm Own Merit is selected by default (since no saved type for a fresh slot).
   - Confirm the merit dropdown lists the character's merits (e.g. "Allies (Police)", "Resources").
   - Switch to Character — confirm the character chip grid appears. Switch to Other — confirm the text input appears. Switch back to Own Merit — confirm the dropdown reappears.
   - Save the form. Reload. Confirm the chosen Own Merit + selected merit value persist.
4. **T24:**
   - Open the DT form for a character with at least one Allies merit. Add a project slot using a joint-eligible action (e.g. "Investigate"). Open the Support Assets panel within the project; find the Ally chip.
   - Tick the Ally chip. Watch the form re-render — the Ally sphere section should now show "Committed to support of Project 1".
   - Navigate to the sphere section directly. Confirm the lock badge is visible and no action dropdown is editable.
   - Return to Project 1's Support Assets panel. Un-tick the chip. Re-render. Navigate back to the sphere section — confirm the lock is gone and the standard action dropdown is back.
   - Add a second project slot (Project 2) with a joint-eligible action. Tick the same Ally chip in Project 2's Support Assets panel. Confirm the sphere lock now reads "Committed to support of Project 2".

## Final consequence

Four user-visible bugs closed:
- Safe Word merits stop disappearing on player-side renders.
- STs (and players) opening the relationships tab see where touchstones live.
- Project Hide/Protect lets the player pick which of their merits to protect, matching the action description's promise.
- Sphere slots commit visibly when used as a support, preventing accidental overwrite.

Patterns preserved or extended:
- Safe Word evaluator becomes resilient without forcing eight callers to thread `allChars`.
- Hint paragraph below a dropdown is a reusable pattern for any future "feature lives elsewhere" UX gap.
- `renderTargetCharOrOther` accepts an options object — easier to extend with future target types if needed (e.g. NPC-specific targeting in a later story).
- Rote-feeding lock pattern is now applied across project slots AND sphere slots; future "this slot is committed to X" scenarios can mirror the same shape.

After this story, six of the eight live-form findings related to pickers and target/lock UX are closed (T6, T10, T11, T14, T20, T24). T18 (Ambience Change supporting merits) remains parked outside the epic pending repro details. T9 (relationships tab label copy) is bundled into dtlt-2.
