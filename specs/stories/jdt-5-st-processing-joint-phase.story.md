---
id: jdt.5
epic: jdt
status: ready-for-dev
priority: medium
depends_on: [jdt.1, jdt.2, jdt.3, jdt.4]
---

# Story JDT-5: ST Processing — new Joint Projects phase with aggregated panel

As a Storyteller processing a downtime cycle that includes joint projects,
I should see a new phase between Feeding and Solo Projects called "Joint Projects" with one aggregated panel per joint — shared description / target / action type at the top, then each participant's pool builder + roll card stacked below (lead first, supports alphabetical) — and a single ST joint outcome textarea bound to the joint's `st_joint_outcome` field,
So that I can resolve a joint as a unified narrative event (one outcome, one canonical description) while still rolling each participant's pool independently per the locked mechanical model.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 5 (Joint Downtimes), JDT5.5:

> **JDT5.5** — ST Processing Joint Projects phase. New phase between Feeding and Solo Projects. New entry type `actionType === 'joint'`. Aggregated panel: shared description/action_type/target up top, each participant's pool builder + roll card stacked below (lead first, supports alphabetical). Joint outcome textarea bound to joint object.

The mechanical model (locked):

> Mechanical model: independent rolls per-character. STs aggregate meaning narratively. No pool-pooling, no automatic success summing.

So the panel does NOT sum dice or successes across participants — each participant rolls their own pool, and the ST writes one narrative outcome that synthesises whatever the rolls produced collectively.

Memory also flags an architectural risk that JDT-5 must address:

> Phase ordering in `buildProcessingQueue` uses magic constants today; one cleanup pass before adding new phase.

So part of JDT-5 is a small refactor of the phase numbering in `buildProcessingQueue` (in `downtime-views.js`) to support inserting the new "joint" phase at position N (between Feeding at N-1 and Solo Projects at N+1).

### Files in scope

- `public/js/admin/downtime-views.js`:
  - `buildProcessingQueue` (line 1518): refactor magic phase constants; add a new `'joint'` phase between Feeding and Solo Projects.
  - `renderActionPanel` (line 6124) or a new dispatcher: route entries with `actionType === 'joint'` to a new `renderJointPanel`.
  - New `renderJointPanel(joint, participants, ...)` aggregating the panel.
- `public/js/admin/downtime-story.js`:
  - `compilePushOutcome` (line 2913): joint outcome inclusion in each participant's published outcome (the `st_joint_outcome` text replicates into each participant's Project Reports section, with personal-contribution notes interleaved).
- `public/css/admin-layout.css`:
  - Styles for the joint aggregated panel.

### Out of scope

- Lifecycle edge cases (re-invite, decouple, lead-cancellation, mid-cycle edit indicator, action-type change blocker) — **JDT-6**.
- Auto-summing successes across participants. Locked: no pool-pooling.
- Joint-level dice modifiers (e.g. "+1 die per accepted support"). v1 stays per-pool.
- A separate Joints tab in DT Story authoring. Joint outcomes flow through to participants' Project Reports sections via `compilePushOutcome`; the ST-side authoring lives in DT Processing's joint panel only.
- Per-participant outcome differentiation. The joint outcome is shared; personal notes interleave.
- Auto-rolling participants' pools. ST clicks Roll for each pool, same as today.

---

## Acceptance Criteria

### Phase ordering

**Given** the existing phase order in `buildProcessingQueue`
**Then** the order is updated to:
1. Travel Review (existing, phaseNum -1)
2. Sorcery (existing)
3. Feeding (existing)
4. **Joint Projects** (new)
5. Solo Projects (existing)
6. Merit Actions (existing)
7. ... (other existing phases continue)

**Given** the magic-number constants for phaseNum
**Then** they are replaced (or supplemented) with named constants (e.g. `PHASE_TRAVEL = -1`, `PHASE_SORCERY = 0`, `PHASE_FEEDING = 1`, `PHASE_JOINT = 2`, `PHASE_SOLO_PROJECTS = 3`, etc.) so future insertions are not magic-number archaeology.

### Queue entry shape

**Given** a cycle has at least one joint project
**Then** for each joint, the queue contains **one** entry of `actionType === 'joint'`.
**And** the entry carries the joint's `_id`, the joint document itself (or a reference), and the participant list.

**Given** the queue contains a joint entry
**Then** **no** corresponding solo entries are created for the lead's joint slot or any support's joint slot. The joint subsumes those slots in the queue.

### Aggregated panel render

**Given** the ST opens a joint queue entry
**Then** the panel renders with:
1. **Shared header** at the top:
   - Joint description (read-only, large prose).
   - Action type label (e.g. "Joint Investigation").
   - Joint target (if any).
   - Per-participant status pills (Accepted / Decoupled — useful for context).

2. **Per-participant blocks**, stacked vertically:
   - **Lead** first, with their character display name and a "Lead" badge.
   - **Supports** alphabetically by character display name.
   - For each participant, the same pool builder and roll card UI used in solo Project panels, scoped to that participant's pool.
   - Each participant's "personal notes" textarea (from JDT-4) shown read-only at the bottom of their block, so the ST has the participant's framing while resolving.

3. **Joint outcome zone** at the bottom:
   - Single textarea labelled "Joint outcome" bound to `cycle.joint_projects[i].st_joint_outcome`.
   - Save button + completion state badge (mirrors merit-action pattern).

### Per-participant rolls

**Given** I am rolling a participant's pool
**Then** the existing roll mechanics fire identically to a solo project pool: dice expression, modifier ticker, roll button, exceptional / nine-again / eight-again handling.
**And** the result persists on the participant's `projects_resolved[N]` (where N is their joint slot), same as a solo result.
**And** there is **no** cross-participant sum or aggregate displayed.

### Joint outcome write

**Given** I write text in the joint outcome textarea and click Save
**Then** `cycle.joint_projects[i].st_joint_outcome` is updated.
**And** the save persists across page reload.

### Publish-time per-participant outcome

**Given** the joint outcome is authored
**When** `compilePushOutcome` runs for any participant in the joint
**Then** the participant's published outcome's Project Reports section includes the joint outcome rendered as a block:
- A heading like `## <Joint description (truncated)> — Joint with <Lead Name>` (or use the joint's first sentence as the title).
- The `st_joint_outcome` text.
- The participant's own `personal_notes` interleaved (as a follow-up paragraph: "*Your contribution: <personal_notes>*").

**Given** a non-participant
**Then** the joint outcome is **not** included in their published outcome.

**Given** the joint has not been authored (`st_joint_outcome` empty)
**Then** the participant's published outcome includes the joint title with a placeholder like "*[Joint outcome pending]*" rather than omitting the entry — consistent with existing solo-project gap-text behaviour.

### Visibility

**Given** I am an ST in DT Processing
**Then** I see joint queue entries in the Joint Projects phase.

**Given** I am a player
**Then** DT Processing is ST-only; no change.

### Visual

**Given** the aggregated panel
**Then** it is visually distinguished from solo project panels (e.g. a wider container, a "Joint" badge in the panel header, gold accent borders).

### Empty state

**Given** the cycle has zero joint projects
**Then** the Joint Projects phase header in the queue still renders if the queue UI lists phases by header, with a "*No joint projects this cycle.*" placeholder. (Or, if the queue UI hides empty phases, simply omit it.)

---

## Implementation Notes

### Phase constant refactor

In `buildProcessingQueue` near line 1518, define constants near the top:

```js
const PHASE_TRAVEL          = -1;
const PHASE_SORCERY         = 0;
const PHASE_FEEDING         = 1;
const PHASE_JOINT           = 2;     // NEW
const PHASE_SOLO_PROJECT    = 3;
const PHASE_MERIT_ACTION    = 4;
// ... continue for the other phases at their current positions
```

Replace existing magic numbers (e.g. `phaseNum: -1`, `phaseNum: 1`, etc.) with the named constants.

### Joint queue entry

In the queue assembly loop, after Feeding entries are pushed:

```js
for (const joint of (cycle.joint_projects || [])) {
  if (joint.cancelled_at) continue;
  queue.push({
    key: `joint:${joint._id}`,
    subId: joint.lead_submission_id,    // anchor to lead's submission for grouping
    charName: charById.get(joint.lead_character_id)?.displayName || 'Joint',
    phase: 'joint',
    phaseNum: PHASE_JOINT,
    actionType: 'joint',
    label: 'Joint Project',
    description: joint.description,
    source: 'joint',
    actionIdx: 0,
    poolPlayer: '',
    joint,                               // full joint doc inline
  });
}
```

**Crucially**, when iterating solo project entries, **skip** any project slot where `projects_resolved[N - 1].joint_id` is set (i.e. the slot is part of a joint and is being processed via the joint entry, not as a solo).

### Render dispatch

In `renderActionPanel` (line 6124), add at the top:

```js
if (entry.source === 'joint') {
  return renderJointPanel(entry.joint, allSubmissions, charById);
}
```

### renderJointPanel

```js
function renderJointPanel(joint, allSubmissions, charById) {
  const participants = (joint.participants || []).map(p => ({
    ...p,
    char: charById.get(p.character_id),
    sub:  allSubmissions.find(s => String(s._id) === String(p.submission_id)),
  })).filter(p => !p.decoupled_at);

  const lead = charById.get(joint.lead_character_id);
  const supports = participants
    .filter(p => p.character_id !== joint.lead_character_id)
    .sort((a, b) => sortName(a.char || {}).localeCompare(sortName(b.char || {})));

  // Lead first
  const ordered = [
    { ...participants.find(p => p.character_id === joint.lead_character_id) || { character_id: joint.lead_character_id, char: lead, sub: allSubmissions.find(s => String(s._id) === String(joint.lead_submission_id)) }, role: 'lead' },
    ...supports.map(p => ({ ...p, role: 'support' })),
  ];

  let h = `<div class="proc-joint-panel" data-joint-id="${esc(joint._id)}">`;

  // Shared header
  h += `<div class="proc-joint-shared-header">`;
  h += `<div class="proc-joint-action-label">Joint ${esc(ACTION_TYPE_LABELS[joint.action_type] || joint.action_type)}</div>`;
  h += `<div class="proc-joint-description">${esc(joint.description)}</div>`;
  if (joint.target_value) {
    h += `<div class="proc-joint-target">Target: ${esc(joint.target_value)}</div>`;
  }
  h += `<div class="proc-joint-participant-pills">`;
  for (const p of ordered) {
    h += `<span class="proc-joint-participant-pill">${esc(displayName(p.char) || 'Unknown')}${p.role === 'lead' ? ' <em>(Lead)</em>' : ''}</span>`;
  }
  h += `</div>`;
  h += `</div>`;

  // Per-participant blocks
  for (const p of ordered) {
    const slot = p.project_slot ?? joint.lead_project_slot;
    h += renderJointParticipantBlock(joint, p, slot);
  }

  // Joint outcome zone
  const outcomeTxt = joint.st_joint_outcome || '';
  h += `<div class="proc-joint-outcome-zone">`;
  h += `<div class="proc-mod-panel-title">Joint outcome</div>`;
  h += `<textarea class="proc-joint-outcome-ta" data-joint-id="${esc(joint._id)}" rows="6">${esc(outcomeTxt)}</textarea>`;
  h += `<button class="dt-btn proc-joint-outcome-save-btn" data-joint-id="${esc(joint._id)}">Save outcome</button>`;
  h += `</div>`;

  h += `</div>`;
  return h;
}
```

### Per-participant block

`renderJointParticipantBlock(joint, p, slot)` — reuse the existing solo project pool-builder and roll-card render, but scoped to participant `p`'s submission and slot. Detail at implementation; the existing `_renderProjectRightPanel` (or whatever the function is named) should be extractable. Read-only display of the participant's `personal_notes` at the bottom of the block.

### compilePushOutcome change

In the project_responses branch of `compilePushOutcome` (line 2944), check whether each project slot is a joint slot:

```js
} else if (key === 'project_responses') {
  (sub.projects_resolved || []).forEach((rev, i) => {
    if (rev.joint_id) {
      // Joint slot — pull from the joint doc instead of project_responses
      const joint = (cycle.joint_projects || []).find(j => j._id === rev.joint_id);
      const personalNotes = sub.responses?.[`project_${i + 1}_personal_notes`] || '';
      const titleSnip = (joint?.description || `Joint Project`).slice(0, 60);
      const leadName = displayName(charById.get(joint?.lead_character_id)) || 'Unknown';

      const outcomeText = (joint?.st_joint_outcome || '').trim();
      if (outcomeText) {
        let block = `## ${titleSnip} — Joint with ${leadName}\n\n${outcomeText}`;
        if (personalNotes.trim()) block += `\n\n*Your contribution: ${personalNotes.trim()}*`;
        parts.push(block);
        hasContent = true;
      } else {
        parts.push(`## ${titleSnip} — Joint with ${leadName}\n\n${_GAP_TEXT}`);
      }
      return;
    }

    // ... existing solo project handling ...
  });
}
```

`compilePushOutcome` will need access to the cycle document to look up joints. If it doesn't already, pass it as an argument.

### Save handler

```js
container.addEventListener('click', async e => {
  const saveBtn = e.target.closest('.proc-joint-outcome-save-btn');
  if (saveBtn) {
    const jointId = saveBtn.dataset.jointId;
    const ta = container.querySelector(`.proc-joint-outcome-ta[data-joint-id="${jointId}"]`);
    if (!ta) return;
    const text = ta.value;
    await updateCycleJoint(currentCycle._id, jointId, { st_joint_outcome: text });
    // brief saved indicator
    return;
  }
});

async function updateCycleJoint(cycleId, jointId, patch) {
  // PUT /api/downtime_cycles/:id with the modified joint_projects array
  const cycle = await apiGet(`/api/downtime_cycles/${cycleId}`);
  const idx = (cycle.joint_projects || []).findIndex(j => j._id === jointId);
  if (idx < 0) return;
  const newJoints = [...cycle.joint_projects];
  newJoints[idx] = { ...newJoints[idx], ...patch };
  await apiPut(`/api/downtime_cycles/${cycleId}`, { joint_projects: newJoints });
  currentCycle.joint_projects = newJoints;
}
```

A dedicated `PATCH /api/downtime_cycles/:id/joint_projects/:jointId` endpoint would be cleaner; add if the dev judges it worth the extra route. Strawman uses the existing PUT.

### CSS

```css
.proc-joint-panel { padding: 1rem; background: var(--surf2); border: 2px solid var(--gold2); border-radius: 4px; }
.proc-joint-shared-header { padding-bottom: .75rem; margin-bottom: 1rem; border-bottom: 1px solid var(--bdr); }
.proc-joint-action-label { font-family: var(--fh2); text-transform: uppercase; letter-spacing: .12em; color: var(--gold2); margin-bottom: .35rem; }
.proc-joint-description { font-size: 1.05em; }
.proc-joint-participant-pills { display: flex; gap: .35rem; margin-top: .5rem; }
.proc-joint-participant-pill { padding: .15rem .5rem; background: var(--surf); border-radius: 999px; font-size: .8em; }
.proc-joint-outcome-zone { padding-top: .75rem; border-top: 1px solid var(--bdr); margin-top: 1rem; }
.proc-joint-outcome-ta { width: 100%; min-height: 200px; }
```

Reuse tokens.

### British English

All copy British; no em-dashes.

### Tests

Recommended: server-side test confirming PUT cycle round-trip with joint_projects modifications (already exercised by JDT-2's tests; verify). Manual smoke test:
- Create joint via JDT-2; have invitees accept via JDT-3.
- Open DT Processing on the cycle; navigate to Joint Projects phase: see one panel.
- Roll each participant's pool individually.
- Write joint outcome, save, refresh: persists.
- Publish all submissions: each participant's published outcome includes the joint outcome under their Project Reports section.

---

## Files Expected to Change

- `public/js/admin/downtime-views.js`:
  - Phase constants refactor in `buildProcessingQueue`.
  - New joint queue entry generation.
  - Skip joint slots in the existing solo project iteration.
  - `renderJointPanel` and `renderJointParticipantBlock` helpers.
  - Save handler for joint outcome.
- `public/js/admin/downtime-story.js`:
  - `compilePushOutcome` extended to inject joint outcome into participants' published outcomes.
- `public/css/admin-layout.css`:
  - `.proc-joint-*` styles.

No new server routes (existing PUT cycle is sufficient); optionally add `PATCH /api/downtime_cycles/:id/joint_projects/:jointId` for cleanliness.

---

## Definition of Done

- All AC verified.
- Manual smoke test: end-to-end from joint creation to publish, with multi-participant rolls and a written joint outcome.
- Phase ordering after refactor still correct for non-joint cycles (smoke-check against an existing cycle with no joints).
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `jdt-5-st-processing-joint-phase: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- **Depends on JDT-1, JDT-2, JDT-3, JDT-4**.
- **Blocks JDT-6** (lifecycle edge cases need the full processing path to test against).
- **Touches the magic-constants risk** flagged in memory; this story is the planned cleanup pass.
