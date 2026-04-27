---
id: jdt.4
epic: jdt
status: ready-for-dev
priority: medium
depends_on: [jdt.1, jdt.2, jdt.3]
---

# Story JDT-4: Slot lock and read-only display for accepted joint support slots

As a player whose project slot has accepted a joint invitation as Support,
I should see that slot rendered with the joint's description as read-only text and the action type as a non-editable display ("Support — joint with <Lead Name>"), but with the pool builder fully editable and a textarea where I can write my personal notes about my contribution,
So that I cannot accidentally edit the joint's shared description (which belongs to the lead) and the boundary between "what we're doing together" and "what I bring to it" is structurally clear.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 5 (Joint Downtimes), JDT5.4:

> **JDT5.4** — Slot lock + read-only display for accepted supports. Description block read-only, action type display "Support — joint with [Lead Name]" not editable, pool builder fully editable, personal notes textarea.

JDT-3 ships the data writes when an invitee accepts (slot binding, joint participant record, joint metadata mirrored into the slot's responses). JDT-4 ships the **render** of an accepted support slot: the read-only chrome around the lead-owned content, the editable pool builder for the invitee's own contribution, the personal notes field.

The lock is **client-side** (the schema already permits any value; the lock prevents accidental edits via the UI). Server-side enforcement is handled by JDT-6's edge cases (e.g. preventing action_type changes while invitations are accepted).

### Files in scope

- `public/js/tabs/downtime-form.js` — project slot render in `renderProjectSlots` and tab-pane render: detect when a slot has `joint_role: 'support'` and render it in support mode.
- `public/css/<dt-form-css>.css` — styles for the support slot's read-only chrome.

### Out of scope

- Lead-owned slot rendering (the lead's slot is just a normal project slot with a `joint_id` reference; the lead's UI was set up by JDT-2 — this story does not modify it).
- Mid-cycle description edits by lead and the "indicator" on supports' slots when the lead edits (Call B's full implementation in **JDT-6**). JDT-4 renders the description as read-only at any moment; the indicator that the description has changed since the support last acknowledged is JDT-6's territory.
- Decouple flow (**JDT-6**'s Call A territory).
- ST Processing display for joint slots (**JDT-5**).
- Schema changes — none required (JDT-1 + JDT-3 already populate the relevant fields).

---

## Acceptance Criteria

### Detection

**Given** I am the invitee on the DT form
**And** my submission has `responses[\`project_${N}_joint_role\`] === 'support'` for some slot N
**Then** the slot N pane renders in **support mode** (per the rules below) instead of the normal project slot mode.

**Given** my submission has `joint_role: 'lead'` for some slot
**Then** the lead's slot renders in **lead mode** — same as a normal project slot today, with no read-only chrome (lead owns the description).

**Given** my submission has neither role on a slot
**Then** the slot renders normally.

### Support slot — read-only chrome

**Given** the support slot pane renders
**Then** the slot tab label includes a small "Joint" badge or icon so the slot is visually distinguishable from the other tabs.

**Given** I open the support slot pane
**Then** the top of the pane shows:
- A header line: "**Support — joint with <Lead's display name>**" (not editable, not a dropdown).
- The joint's description, rendered as **read-only prose** (not in a `<textarea>`; in a styled `<div>` or `<p>` with appropriate prose styling).
- The joint's target (if any), rendered read-only.

### Support slot — editable pool

**Given** the support slot pane renders
**Then** the **pool builder** (attr / skill / disc / spec dropdowns and chips) is **fully editable** for my contribution.
**And** the pool builder reads/writes the same response keys as a normal project slot (e.g. `project_${N}_pool_attr`, `project_${N}_pool_skill`, `project_${N}_pool_disc`, etc.).

**Given** I make pool selections
**Then** they save normally on the next form save.

### Support slot — personal notes

**Given** the support slot pane renders
**Then** below the pool builder, a textarea labelled "**Your personal notes**" is visible.
**And** the textarea reads from / writes to `responses[\`project_${N}_personal_notes\`]` (or whatever shape works for the existing save flow; verify at implementation).
**And** the textarea has a placeholder prompt: "*What do you bring to this joint? What's your character's angle on it?*"

**Given** I write personal notes and save
**Then** the text persists alongside the pool selections.

### What's NOT shown / editable on a support slot

**Given** a support slot
**Then** the following are **NOT visible / NOT editable**:
- The action-type dropdown (the action type is fixed by the joint).
- The slot's project title (the joint's description is the title; no separate title).
- The slot's solo Description / Desired outcome textareas (the joint owns description).
- The Solo / Joint toggle (the slot is locked to joint support; switching back is via Decouple in JDT-6).
- The target picker (the joint owns the target).
- The XP-spend picker (separate slot if the player wants to spend XP).
- Aspirations or any other slot-bound field that doesn't belong to the support's contribution.

### Description-changed indicator (deferred)

**Given** the joint's description was edited by the lead after I accepted
**Then** the slot **does not show** a "Lead has updated this project" indicator in this story.

(JDT-6 ships the indicator. JDT-4 renders the current description as read-only without comparing timestamps.)

### Visual

**Given** the support slot pane renders
**Then** it is visually distinguishable from a normal slot — e.g. a left-border accent in gold (matching the joint authoring style from JDT-2), the header line styled prominently, the read-only description in a slightly different background to signal "owned by someone else".

---

## Implementation Notes

### Detection and dispatch

In the per-slot pane render in `renderProjectSlots`, before the standard action-type-driven content, check:

```js
const jointRole = saved[`project_${n}_joint_role`];
const jointId   = saved[`project_${n}_joint_id`];

if (jointRole === 'support' && jointId) {
  h += renderSupportSlot(n, saved, jointId, currentCycle, charById);
  // Continue with `continue` or skip the standard render
  continue;
}
// (For 'lead', no special render — let the standard render handle it; the joint metadata is just decoration.)
```

### renderSupportSlot

```js
function renderSupportSlot(n, saved, jointId, cycle, charById) {
  const joint = (cycle.joint_projects || []).find(j => j._id === jointId);
  if (!joint) {
    // Joint disappeared (race / cancelled by lead) — render a placeholder
    return `<div class="dt-proj-pane dt-proj-pane-orphaned" data-proj-pane="${n}">
      <p class="qf-desc">This joint project is no longer available. Contact your ST.</p>
    </div>`;
  }

  const lead = charById.get(joint.lead_character_id);
  const leadName = displayName(lead) || 'Unknown';
  const personalNotes = saved[`project_${n}_personal_notes`] || '';

  let h = `<div class="dt-proj-pane dt-proj-support-pane" data-proj-pane="${n}">`;

  // Header
  h += `<div class="dt-proj-support-header">Support — joint with <strong>${esc(leadName)}</strong></div>`;

  // Read-only description
  h += `<div class="dt-proj-support-readonly-block">`;
  h += `<div class="dt-proj-support-label">Joint description</div>`;
  h += `<div class="dt-proj-support-desc">${esc(joint.description)}</div>`;
  if (joint.target_value) {
    h += `<div class="dt-proj-support-label">Joint target</div>`;
    h += `<div class="dt-proj-support-target">${esc(joint.target_value)}</div>`;
  }
  h += `</div>`;

  // Pool builder — reuse existing helper
  h += renderProjectPoolBuilder(n, saved);   // whatever the existing pool helper is named

  // Personal notes
  h += `<div class="qf-field">`;
  h += `<label class="qf-label" for="dt-project_${n}_personal_notes">Your personal notes</label>`;
  h += `<textarea id="dt-project_${n}_personal_notes" class="qf-textarea" rows="4" placeholder="What do you bring to this joint? What's your character's angle on it?">${esc(personalNotes)}</textarea>`;
  h += `</div>`;

  h += `</div>`;
  return h;
}
```

Verify the existing pool builder helper name (`renderProjectPoolBuilder` is a placeholder; locate the actual function or factor one out from `renderProjectSlots` if needed).

### Save logic for personal notes

In the form save flow, ensure `project_${n}_personal_notes` is captured. If the existing save flow walks every input by id pattern, this is captured automatically. Verify.

### Tab badge

In the slot tab render (around line 2141), add a Joint badge when the slot has a joint role:

```js
const jointRole = saved[`project_${n}_joint_role`];
const jointBadge = jointRole === 'support' ? '<span class="dt-proj-tab-joint-badge">Joint</span>' : '';
// add inside the tab button:
h += jointBadge;
```

### CSS

```css
.dt-proj-support-pane {
  border-left: 3px solid var(--gold2);
  padding-left: 1rem;
}
.dt-proj-support-header {
  font-family: var(--fh2);
  font-size: .85rem;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--gold2);
  padding: .5rem 0;
  margin-bottom: .5rem;
}
.dt-proj-support-readonly-block {
  background: var(--surf2);
  padding: .75rem 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}
.dt-proj-support-label {
  font-size: .75rem;
  text-transform: uppercase;
  color: var(--txt2);
  margin-top: .35rem;
}
.dt-proj-support-desc, .dt-proj-support-target {
  font-family: var(--ft);
  white-space: pre-wrap;
  margin-bottom: .35rem;
}
.dt-proj-tab-joint-badge {
  display: inline-block;
  padding: 0 .35rem;
  background: var(--gold2);
  color: var(--bg);
  font-size: .65rem;
  border-radius: 999px;
  margin-left: .35rem;
}
```

Reuse tokens; substitute project-canonical equivalents.

### Edge case: joint cancelled

If the support slot's `joint_id` no longer matches a joint in `cycle.joint_projects` (e.g. cancelled by lead between page loads), render an `dt-proj-pane-orphaned` placeholder telling the player to contact their ST. JDT-6 will introduce the proper handling for cancellation; JDT-4 just doesn't crash.

### British English

All copy British; no em-dashes.

### No tests required

UI render. Manual smoke test:
- Player A creates joint with description "Investigate the warehouse"; invites Player B.
- Player B accepts (per JDT-3): slot 2 (or whichever) takes the joint.
- Open slot 2: header reads "Support — joint with Player A". Description shows as read-only. Pool builder is editable. Personal notes textarea is visible.
- Edit pool selections; save; refresh: pool persists.
- Type personal notes; save; refresh: notes persist.
- Try to find an action-type dropdown: not visible.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — slot detection + dispatch; `renderSupportSlot` helper; tab badge for joint slots; verify save flow captures personal notes.
- `public/css/<dt-form-css>.css` — support slot styles.

No server changes (data shape already in place from JDT-1, JDT-3).

---

## Definition of Done

- All AC verified.
- Manual smoke test: end-to-end from JDT-2 lead creation through JDT-3 acceptance to JDT-4 support slot render.
- Pool and notes persist correctly.
- Action type / description / target are not editable on the support slot.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `jdt-4-slot-lock-readonly-display: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- **Depends on JDT-1** (schema), **JDT-2** (joints exist), **JDT-3** (slot binding written by accept).
- **Blocks JDT-6** (the indicator on support slots when lead edits the description requires this render to exist first).
- Independent of JDT-5 (ST Processing aggregation works with whatever the support slot has saved).
