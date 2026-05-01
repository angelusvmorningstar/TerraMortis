---
title: 'ST processing skill acquisition parity — surface structured pool fields in queue + processing panel'
type: 'fix'
created: '2026-04-30'
status: review
recommended_model: 'sonnet — narrow ST-side surface; reads existing structured response keys and renders them in two existing render paths'
context:
  - specs/epic-dtlt-dt2-live-form-triage.md
  - specs/stories/dtlt.4.effective-rating-and-cap-sweep.story.md
  - public/js/admin/downtime-views.js
  - public/js/tabs/downtime-form.js
  - public/js/data/accessors.js
---

## Intent

**Problem:** The DT form correctly collects the player's declared skill-acquisition pool — `skill_acq_pool_attr`, `skill_acq_pool_skill`, `skill_acq_pool_spec` (`tabs/downtime-form.js:691-696`). The structured fields persist in MongoDB. But the ST processing pipeline reads only the legacy `skill_acquisitions` field (description blob, set at `tabs/downtime-form.js:704` to just `skill_acq_description`). The structured pool fields go unread downstream.

Two ST-side consequences:
1. **Queue construction** (`admin/downtime-views.js:2771-2785`) builds the queue entry with `poolPlayer: ''` (line 2784). When the ST opens the action queue, the row shows an empty player pool — the ST has to dig into raw responses to find what the player declared.
2. **Processing panel** (`admin/downtime-views.js:7812-7817`) renders skill acquisitions as "no pool needed" — same panel handles both Resources and Skill acquisitions. The comment at line 7813 ("no pool needed") is correct for Resources Acquisition (no roll happens) but wrong for Skill Acquisition (which is rolled).

Player and ST surfaces disagree about whether skill acquisitions have a pool. The data is collected; nothing reads it. From the ST's perspective, the player never declared an attribute — exactly the symptom reported in the live-form review.

**Approach:** Two coordinated changes, both ST-side, plus an optional player-side enrichment:

1. **Queue construction** — at the skill_acquisitions entry construction (`admin/downtime-views.js:2771-2785`), compute a `poolPlayer` expression string from the structured response keys + character traits. Use the canonical effective accessors from `public/js/data/accessors.js` (`getAttrEffective`, `skTotal`, plus `skNineAgain` / `hasAoE` for spec bonus). Format mirrors the existing pool-expression convention (e.g. `"Manipulation 3 + Persuasion 4 + Authoritative — 8"`).
2. **Processing panel** — split the acquisition render branch at line 7812 by `entry.actionType`. `resources_acquisitions` keeps the current "Player Notes only" treatment (no roll). `skill_acquisitions` gets the standard 2-column "Player's Submitted Pool / ST Validated Pool" treatment used by other rolled action types at `:7818-7829`.
3. **Optional player-side enrichment** — augment the legacy `responses['skill_acquisitions']` blob at `tabs/downtime-form.js:704` to include a structured pool line, matching how `resources_acquisitions` is built at `:681-686`. This makes any text-only consumer (e.g. published outcome compilation) also see the pool. The structured fields remain the canonical source; the blob enrichment is belt-and-braces.

**Dependency:** This story uses `skTotal` and the effective accessors. dtlt-4 either ships first (preferred — clean accessors guaranteed) or this story is implemented carefully enough that pre-dtlt-4 `skTotal` (which already exists at `accessors.js:104`) is sufficient. Either ordering works; dtlt-4 doesn't change `skTotal`'s contract — it just expands its caller surface.

## Boundaries & Constraints

**Always:**
- Use the canonical effective accessors from `public/js/data/accessors.js`: `getAttrEffective(c, name)`, `skTotal(c, skill)`, `skNineAgain(c, skill)`, `hasAoE(c, spec)`. Do not reimplement.
- The pool expression string format follows the existing convention used by sorcery and project pools: human-readable, components labelled by trait name + dot count, separated by ` + `, terminated with ` — N` for the total. Example: `"Manipulation 3 + Persuasion 4 + Authoritative — 8"`. For unknown spec names, omit the spec component (don't render `+ undefined`).
- The player form's structured response keys (`skill_acq_pool_attr`, `skill_acq_pool_skill`, `skill_acq_pool_spec`) are the canonical source. Do NOT migrate them; do NOT compute them server-side from the description blob.
- Backward compatibility: existing submissions without the structured fields (very early DT 1 records) render with `poolPlayer: ''` (current behaviour) — the fallback is graceful, not error-throwing. The processing panel for such records shows the standard 2-column layout with empty player pool, ST manually fills validated pool — this matches today's ST experience for those records.

**Ask First:**
- **Player-side blob enrichment scope.** Default: do the optional enrichment (item 3 above) so the structured pool surfaces in published outcomes too. Confirm: should the enrichment append the pool line below the description (like `resources_acquisitions` does), or replace the description-only blob entirely? Default: append, matching `resources_acquisitions:681-686` shape — keeps backward compat with any consumers that read the first line as description.

**Never:**
- Do not change the form's structured field collection at `tabs/downtime-form.js:691-696`. Already correct.
- Do not change the way ST acquisitions are submitted or stored — the database shape is right; the bug is purely on the read side.
- Do not modify the existing acquisition panel's `acqNotes` text rendering. The pool surfaces alongside it, not instead of it. Players still want to see their description; STs still want to see player notes.
- Do not couple `skill_acquisitions` and `resources_acquisitions` into a shared render branch. They behave differently (rolled vs. not). Keep them split.
- Do not introduce a new server-side route or schema field. Everything needed is already in `responses`.

## I/O & Edge-Case Matrix

| Scenario | Pre-fix | Post-fix |
|---|---|---|
| Player declares skill acq with attr=Manipulation, skill=Persuasion, spec=Authoritative on a char with effective Manip 3, Persuasion 4, Authoritative as a spec | Queue entry: `poolPlayer: ''`. Processing panel: "Player Notes" only, no pool, no validated-pool input. | Queue entry: `poolPlayer: 'Manipulation 3 + Persuasion 4 + Authoritative — 8'`. Processing panel: 2-column "Submitted Pool / Validated Pool" with the player's pool shown and the ST's validated input field present. |
| Player declares attr=Wits, skill=Investigation, no spec | poolPlayer empty | poolPlayer: `'Wits 3 + Investigation 2 — 5'` |
| Player declares attr only (skill not picked yet) — partial submission | poolPlayer empty | poolPlayer: `'Wits 3 — 3'` (single component, total = 3) |
| Player declares spec but not skill (impossible per UI but defensive) | poolPlayer empty | poolPlayer: `''` (silently skip the spec; no skill anchor) |
| Char with PT 4-dot Asset Skill bonus on the chosen skill (effective +1) | poolPlayer empty | poolPlayer reflects effective skill via `skTotal` (e.g. `'Strength 3 + Brawl 5 — 8'` where Brawl is 4 inherent + 1 PT bonus) |
| Char where the chosen attribute name is in `_DISC_ATTR` (Strength, Stamina) — currently inflated by Vigour/Resilience dots per RDE-14 | poolPlayer empty | poolPlayer reflects the current effective rating (post-dtlt-1, this stops including discipline dots; see dtlt-1 for the model migration). For now, use `getAttrEffective` and accept whatever the current model returns. |
| Resources acquisition (separate action type) | Processing panel: "Player Notes only" — correct (no roll for resources) | Unchanged. The split keeps `resources_acquisitions` on the existing path. |
| Legacy submission (DT 1 era) with `skill_acquisitions` set but no `skill_acq_pool_*` keys | Processing panel: "Player Notes only" | Queue entry: `poolPlayer: ''` (no structured fields available); processing panel: 2-column with empty submitted pool, ST manually fills validated pool. Graceful fallback. |
| Player blob enrichment (optional change 3): published outcome compilation reads `responses['skill_acquisitions']` to summarise | Reads description-only | Reads description + appended pool line (e.g. `"Persuade Marcus to introduce me to his contact at Mortlake.\nPool: Manipulation 3 + Persuasion 4 + Authoritative — 8\nAvailability: 3/5"`) |

## Code Map

### Change 1 — Queue construction at `admin/downtime-views.js:2771-2785`

Currently:
```js
if (skillAcq) {
  queue.push({
    key: `${sub._id}:acq:skills`,
    subId: sub._id,
    charName,
    phase: PHASE_NUM_TO_LABEL[7],
    phaseNum: 7,
    actionType: 'skill_acquisitions',
    label: 'Skill Acquisitions',
    description: _acqRowSummary(skillAcq),
    acqNotes: skillAcq,
    source: 'acquisition',
    actionIdx: 1,
    poolPlayer: '',     // ← always empty
  });
}
```

After:
```js
if (skillAcq) {
  // T27 (DTLT-7): build the player-declared pool expression from the
  // structured response keys. Falls back to empty string if any field
  // is missing (older submissions, partial drafts).
  const c = findCharacter(sub.character_name, sub.player_name);
  const poolPlayer = c ? _buildSkillAcqPoolStr(c, sub.responses || {}) : '';
  queue.push({
    key: `${sub._id}:acq:skills`,
    subId: sub._id,
    charName,
    phase: PHASE_NUM_TO_LABEL[7],
    phaseNum: 7,
    actionType: 'skill_acquisitions',
    label: 'Skill Acquisitions',
    description: _acqRowSummary(skillAcq),
    acqNotes: skillAcq,
    source: 'acquisition',
    actionIdx: 1,
    poolPlayer,
  });
}
```

Add a helper near `_acqRowSummary` (line 2748):
```js
/**
 * Build a human-readable pool expression from structured skill-acquisition
 * response keys + character. Returns empty string if structure is incomplete.
 * Format mirrors the sorcery/project pool-expression convention.
 */
function _buildSkillAcqPoolStr(c, resp) {
  const attr  = resp.skill_acq_pool_attr  || '';
  const skill = resp.skill_acq_pool_skill || '';
  const spec  = resp.skill_acq_pool_spec  || '';

  if (!attr && !skill) return '';

  const parts = [];
  let total = 0;

  if (attr) {
    const v = getAttrEffective(c, attr);
    parts.push(`${attr} ${v}`);
    total += v;
  }
  if (skill) {
    const v = skTotal(c, skill);
    parts.push(`${skill} ${v}`);
    total += v;
  }
  if (spec && skill) {
    const skillSpecs = c.skills?.[skill]?.specs || [];
    if (skillSpecs.includes(spec)) {
      const bonus = (skNineAgain(c, skill) || hasAoE(c, spec)) ? 2 : 1;
      parts.push(`${spec}`);
      total += bonus;
    }
  }
  return parts.length ? `${parts.join(' + ')} — ${total}` : '';
}
```

Add imports at the top of `admin/downtime-views.js` for `getAttrEffective`, `skTotal`, `skNineAgain`, `hasAoE` — these are exports from `public/js/data/accessors.js`. Check the existing import block; the file likely already imports several accessors. Just extend the destructured list.

### Change 2 — Processing panel at `admin/downtime-views.js:7812-7817`

Currently:
```js
} else if (entry.source === 'acquisition') {
  // Acquisitions: show full player-submitted text, no pool needed
  h += '<div class="proc-section">';
  h += '<div class="proc-detail-label">Player Notes</div>';
  h += `<div class="proc-acq-notes">${esc(entry.acqNotes || entry.description).replace(/\n/g, '<br>')}</div>`;
  h += '</div>';
}
```

After:
```js
} else if (entry.source === 'acquisition') {
  // Acquisitions: Resources has no roll (notes only). Skill has a roll —
  // show the standard 2-column Submitted/Validated pool layout alongside
  // the player notes.
  h += '<div class="proc-section">';
  h += '<div class="proc-detail-label">Player Notes</div>';
  h += `<div class="proc-acq-notes">${esc(entry.acqNotes || entry.description).replace(/\n/g, '<br>')}</div>';
  h += '</div>';

  // T27 (DTLT-7): skill acquisitions are rolled — render the standard
  // pool 2-column. Resources acquisitions stay notes-only.
  if (entry.actionType === 'skill_acquisitions') {
    h += '<div class="proc-detail-grid">';
    h += '<div class="proc-detail-col">';
    h += `<div class="proc-detail-label">Player's Submitted Pool</div>`;
    h += `<div class="proc-detail-value">${esc(poolPlayer || '—')}</div>`;
    h += '</div>';
    h += '<div class="proc-detail-col">';
    h += `<div class="proc-detail-label">ST Validated Pool</div>`;
    h += `<input class="proc-pool-input" type="text" data-proc-key="${esc(entry.key)}" value="${esc(poolValidated)}" placeholder="Enter validated pool...">`;
    h += '</div>';
    h += '</div>'; // proc-detail-grid
  }
}
```

(The variables `poolPlayer` and `poolValidated` are already in scope at this site — they're set earlier in the same function from `entry.poolPlayer` and the persisted `feeding_review` / similar review object. Verify by reading the surrounding 30-50 lines of context during implementation; if not yet in scope, derive `poolPlayer` from `entry.poolPlayer` and `poolValidated` from the review state for this entry.)

### Change 3 (optional) — Player-side blob enrichment at `tabs/downtime-form.js:704`

Currently:
```js
// Backwards compat
responses['skill_acquisitions'] = responses['skill_acq_description'];
```

After:
```js
// Backwards compat: legacy field. Build it from structured pieces so any
// text-only consumer (e.g. published outcome compilation) sees the pool too.
// Mirrors the resources_acquisitions blob shape at line 681-686.
const skPoolStr = _buildSkillAcqPoolStrForForm(currentChar, responses);
responses['skill_acquisitions'] = [
  responses['skill_acq_description'],
  skPoolStr ? `Pool: ${skPoolStr}` : '',
  responses['skill_acq_availability']
    ? `Availability: ${responses['skill_acq_availability'] === 'unknown' ? 'Unknown' : responses['skill_acq_availability'] + '/5'}`
    : '',
].filter(Boolean).join('\n');
```

Add `_buildSkillAcqPoolStrForForm` (or rename to a shared helper if both player and admin sides should use the same code — recommended; live in `public/js/data/accessors.js` next to `riteCost`):

```js
// (in public/js/data/accessors.js)
/**
 * Build a human-readable pool expression for a skill acquisition.
 * Used by both the player form's legacy blob and the ST queue construction.
 */
export function skillAcqPoolStr(c, { attr, skill, spec }) {
  if (!attr && !skill) return '';
  const parts = [];
  let total = 0;
  if (attr) {
    const v = getAttrEffective(c, attr);
    parts.push(`${attr} ${v}`);
    total += v;
  }
  if (skill) {
    const v = skTotal(c, skill);
    parts.push(`${skill} ${v}`);
    total += v;
  }
  if (spec && skill) {
    const skillSpecs = c.skills?.[skill]?.specs || [];
    if (skillSpecs.includes(spec)) {
      const bonus = (skNineAgain(c, skill) || hasAoE(c, spec)) ? 2 : 1;
      parts.push(spec);
      total += bonus;
    }
  }
  return parts.length ? `${parts.join(' + ')} — ${total}` : '';
}
```

Then both Change 1 and Change 3 call `skillAcqPoolStr(c, {attr, skill, spec})`. The local `_buildSkillAcqPoolStr` in `admin/downtime-views.js` becomes a thin wrapper or is replaced by the import.

**Recommendation: implement Change 3.** It's small, keeps the legacy blob useful, and ensures the helper is shared between the two consumers (preventing divergence). If scope is a concern, ship Change 1 + Change 2 only and defer Change 3 to a follow-up — both shapes work, and the player-side blob enrichment is purely additive.

## Tasks & Acceptance

**Execution:**

- [ ] Add `skillAcqPoolStr(c, {attr, skill, spec})` helper to `public/js/data/accessors.js` (alongside `riteCost`). Pure function. Returns empty string for incomplete input.
- [ ] Queue construction in `admin/downtime-views.js`:
  - At line 2771-2785: thread `findCharacter(sub.character_name, sub.player_name)` and call `skillAcqPoolStr` to populate `poolPlayer`.
  - Add accessor imports at the top of the file (`getAttrEffective`, `skTotal`, `skNineAgain`, `hasAoE`, plus the new `skillAcqPoolStr`).
- [ ] Processing panel in `admin/downtime-views.js:7812-7817`:
  - Split the acquisition branch by `entry.actionType`.
  - Add the standard 2-column Submitted/Validated pool layout for `skill_acquisitions`.
  - Resources acquisitions retain the existing notes-only render.
  - Verify `poolPlayer` and `poolValidated` are in scope; thread from `entry.poolPlayer` and review state if needed.
- [ ] (Recommended) Player-side blob enrichment at `tabs/downtime-form.js:704`: replace single-line description assignment with the multi-line shape mirroring `resources_acquisitions`.
- [ ] Manual smoke per Verification.

**Acceptance Criteria:**

- Given a player submits a skill acquisition with attr=Manipulation, skill=Persuasion, spec=Authoritative on a character with Manip 3 + Persuasion 4 + the spec listed, when the ST opens the action queue, then the queue row's `poolPlayer` cell shows `"Manipulation 3 + Persuasion 4 + Authoritative — 8"`.
- Given the same submission, when the ST opens the processing panel for that skill acquisition, then the panel shows two columns: "Player's Submitted Pool" with the pool expression, and "ST Validated Pool" with an editable input.
- Given the same submission, when the ST views the existing "Player Notes" block, then the player's description text is still rendered (no regression).
- Given a Resources acquisition (separate action type), when the ST opens its processing panel, then only "Player Notes" is shown (no Submitted/Validated pool — Resources isn't rolled).
- Given a legacy submission (DT 1 era) with `skill_acquisitions` description set but no structured pool fields, when the queue and panel render, then `poolPlayer` is empty and the panel shows the 2-column layout with an empty Submitted Pool column. ST manually fills the Validated Pool input.
- Given a character with PT Asset Skill bonus on the chosen skill, when the queue's `poolPlayer` is built, then the skill component reflects the effective rating via `skTotal` (e.g. `"Brawl 5"` for Brawl 4 inherent + 1 PT bonus).
- Given a player declares a spec that doesn't actually appear on the character's skill specs (data inconsistency), when the queue builds, then the spec component is silently omitted (no false bonus).
- Given the optional player-side blob enrichment is implemented, when the published outcome compilation reads `responses['skill_acquisitions']`, then the blob includes a "Pool: ..." line and an "Availability: ..." line below the description.
- Given the optional enrichment is NOT implemented, when the published outcome compilation reads the blob, then it returns only the description (existing behaviour preserved).

## Verification

**Commands:**

- No new tests required — changes are render-side and reuse already-tested accessors. Existing suites remain green.
- Browser console clean during ST queue load and processing panel open.

**Manual checks:**

1. **Queue and panel parity:**
   - Open the player DT form; configure a skill acquisition with attr + skill + spec on a known character. Save and submit.
   - Switch to the ST view; open the action queue. Find the skill acquisition row. Confirm the `poolPlayer` cell shows the expected pool expression.
   - Open the processing panel for that row. Confirm the 2-column Submitted/Validated pool layout is visible. Confirm the player's pool is correct.
2. **Effective rating uplift:**
   - Pick a character with PT Asset Skill bonus on, say, Persuasion. Submit a skill acq using Persuasion. Confirm the ST queue's poolPlayer shows the effective Persuasion (e.g. 5 if 4 inherent + 1 PT).
3. **Resources separation:**
   - Submit a Resources acquisition for the same character. Open its processing panel. Confirm only "Player Notes" is shown (no Submitted/Validated pool).
4. **Legacy submission graceful fallback:**
   - Find a DT 1 era submission with a skill acquisition (or simulate one by deleting the `skill_acq_pool_*` keys from a recent submission via Mongo). Open the action queue. Confirm `poolPlayer` is empty. Open the panel; confirm the 2-column layout renders with an empty Submitted Pool. ST can fill the Validated Pool manually as today.
5. **(Optional) Blob enrichment:**
   - If Change 3 was implemented: submit a fresh skill acq. After save, query the submission in Mongo (or read it via the API). Confirm `responses.skill_acquisitions` is multi-line with `Description ... \n Pool: ... \n Availability: ...`.
6. **Cross-check with feeding tally:**
   - The dtlt-4 effective-rating sweep updates the player-side feeding pool to use `skTotal`. After both stories ship, the ST queue's poolPlayer for skill acquisitions and the player's feeding pool for the same character + skill should reflect the same effective skill rating. This is a sanity check across stories, not a per-story AC.

## Final consequence

The structured `skill_acq_pool_*` fields the DT form has been collecting since dtfp-3 are finally read by ST tooling. The ST stops rebuilding pools from scratch when reviewing skill acquisitions. The 2-column Submitted/Validated layout already in use for projects, sphere actions, and sorcery now extends to skill acquisitions — one fewer special case in the processing panel.

The optional player-side blob enrichment makes the structured pool durable in the legacy `skill_acquisitions` field too — published outcomes that summarise the acquisition include the pool, matching how `resources_acquisitions` already works.

Per the diagnostic conversation: the player form was always doing the right thing. This story closes the read-side gap that made the form's work invisible to the ST.
