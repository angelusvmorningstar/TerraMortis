---
id: jdt.2
epic: jdt
status: ready-for-dev
priority: medium
depends_on: [jdt.1]
---

# Story JDT-2: Lead invitation flow — Solo/Joint toggle, invitee picker, live status badges

As a player who wants to run a project as a joint action with one or more other characters,
I should toggle my project slot to "Joint", write the joint description, pick the characters I'm inviting from a checkbox grid (alive characters with at least one available slot, excluding me), and see live per-invitee status badges as they accept or decline,
So that I can stand up a joint project from my submission without an out-of-band coordination message, and track who has agreed without re-asking each invitee directly.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 5 (Joint Downtimes), JDT5.2:

> **JDT5.2** — Lead invitation flow. Solo/Joint toggle on action-type stage. Joint description input + invitee checkbox grid (alive characters, excluding lead, with at least one available slot). On save, create joint object and pending invitations. Live per-invitee status badges.

Lead invitation is the first **interactive** JDT story (JDT-1 was schema-only). After JDT-2, the lead can:
1. Pick "Joint" mode for a project slot whose action type is **joint-eligible** (per memory's Call C whitelist).
2. Author the joint's description and target.
3. Tick invitees from a grid of eligible alive characters.
4. Save: a `joint_projects[]` entry is created on the cycle, plus one `project_invitations` document per invitee with status `'pending'`.
5. See live status badges per invitee as JDT-3 invitees respond (this story renders the badges; JDT-3 transitions the status).

### Joint-eligible action types (Call C)

```
ambience_increase, ambience_decrease, attack, hide_protect, investigate, patrol_scout, misc
```

Excluded: `support` (recursive role conflict), `xp_spend` (personal), `maintenance` (personal). The Solo/Joint toggle does not appear for excluded action types.

### Files in scope

- `public/js/tabs/downtime-form.js`:
  - Project slot UI (around `renderProjectSlots` at line 2099 and the action-type dropdown render): add a Solo/Joint toggle that conditionally appears for joint-eligible action types.
  - Joint description, target picker (use DTFP-6's `renderTargetPicker`), invitee checkbox grid renderers.
  - Save logic: when Joint is selected and the slot is saved, create the joint + invitations on the server.
  - Live status badge render (read from cycle.joint_projects + project_invitations).
- `server/routes/downtime.js`:
  - New endpoint `POST /api/downtime_cycles/:cycleId/joint_projects` — creates a joint and the invitations atomically.
  - New endpoint `GET /api/project_invitations?character_id=...&cycle_id=...` (used by JDT-3, but the shape may need to land here for the lead to read invitee statuses).
- `server/schemas/project_invitation.schema.js` — already shipped in JDT-1.
- `server/schemas/downtime_submission.schema.js` — `joint_projects` array already shipped in JDT-1.

### Out of scope

- Invitee acceptance / decline (**JDT-3**).
- Slot lock and read-only display on accepted supports (**JDT-4**).
- ST Processing aggregated joint phase (**JDT-5**).
- Lifecycle edge cases — re-invite alternates, lead-cancellation when supports = 0, ST override (**JDT-6**).
- Mid-cycle description edits (Call B's full implementation is in **JDT-6**; JDT-2 supports description authoring at create time only).
- Action-type whitelist enforcement — **JDT-2** implements the toggle visibility rule per Call C, but the action-type-change-blocking-when-invitations-exist check lives in JDT-6.

---

## Acceptance Criteria

### Solo/Joint toggle visibility

**Given** I am a player on a project slot
**And** the slot's action type is one of `ambience_increase | ambience_decrease | attack | hide_protect | investigate | patrol_scout | misc`
**Then** a Solo / Joint toggle is rendered (default Solo).

**Given** the slot's action type is `support`, `xp_spend`, `maintenance`, or empty
**Then** the Solo/Joint toggle **does not** render. The slot behaves as a solo project.

**Given** I switch the action type from a joint-eligible type to an excluded type
**When** the toggle was set to Joint and I have not yet saved
**Then** the toggle disappears; the joint UI fields disappear; the slot reverts to Solo behaviour.

### Joint authoring UI

**Given** I select Joint on an eligible slot
**Then** the slot's input area expands to include:
- A **joint description** textarea (multi-line).
- A **target picker** (reuses `renderTargetPicker` from DTFP-6) for the joint's target.
- An **invitee checkbox grid** listing eligible characters.

### Eligible invitee list

**Given** the invitee checkbox grid renders
**Then** it lists every character meeting all of:
- Not retired.
- Not the lead's own character (lead excluded).
- Has at least one project slot **available** (not already assigned to another joint as a support, not already filled with a non-empty action of their own).

**Given** an invitee has zero available slots
**Then** they are **omitted** from the grid (or shown disabled with a tooltip; pick at implementation).

**Given** the eligible list is empty
**Then** the grid shows a placeholder: "*No characters with available slots to invite.*"

### Save behaviour

**Given** I have ticked at least one invitee, written a description, and (optionally) a target
**When** I save the form
**Then** a single API call creates:
- One `joint_projects` entry on `cycle.joint_projects` with the lead's metadata, description, target, action_type, and an empty `participants` array (participants populate as invitees accept).
- One `project_invitations` document per ticked invitee, status `'pending'`, linked by `joint_project_id`.

**Given** the save succeeds
**Then** the joint slot's UI updates to show the per-invitee status badges (initially all `pending`).

**Given** the save fails
**Then** the slot remains in editable state; an error message appears; no joint object or invitations are created.

### Live status badges

**Given** the joint object exists
**Then** each invitee row in the joint slot UI shows their character name and a status badge: `Pending`, `Accepted`, `Declined`, `Decoupled`, or `Cancelled by lead`.

**Given** the lead reloads the form
**Then** the badges reflect the current state from the server (re-fetched on form open).

**Given** a JDT-3 invitee accepts in another browser tab
**When** the lead's form is open
**Then** the badge does **not** update live (no websocket / polling in v1; see "Out of scope").

If product wants live updates, add as a follow-up. The "live" in memory's wording refers to "re-fetch on next form open", not "WebSocket / push".

### Schema validation

**Given** the joint object created on save
**Then** it conforms to the `joint_projects` shape declared in JDT-1.

**Given** each invitation created on save
**Then** it conforms to `projectInvitationSchema` from JDT-1.

### Lead's own slot bookkeeping

**Given** the lead saved a joint on their project slot N
**Then** the lead's own `projects_resolved[N - 1]` (or wherever the resolved store sits at submit time) carries `joint_id: <new joint id>` and `joint_role: 'lead'` so DT Processing knows this slot is the joint lead.

(Alternatively, this association lives on the joint document itself via `lead_submission_id` and `lead_project_slot`, in which case the projects_resolved field can stay null. Pick the cleaner pattern at implementation; both shapes are supported by JDT-1's schema.)

### Visual

**Given** the joint authoring UI is visible
**Then** it is visually distinguished from solo project slots (e.g. a different border colour, a "Joint" badge near the slot tab) so the lead always knows which slot is the joint.

---

## Implementation Notes

### UI insertion point

In `renderProjectSlots`'s per-slot pane (around line 2155 onwards in `downtime-form.js`), after the action-type dropdown but before the action-specific fields, insert the toggle:

```js
const JOINT_ELIGIBLE = ['ambience_increase', 'ambience_decrease', 'attack', 'hide_protect', 'investigate', 'patrol_scout', 'misc'];
const isJointEligible = JOINT_ELIGIBLE.includes(actionVal);

if (isJointEligible) {
  const isJoint = saved[`project_${n}_is_joint`] === 'yes';
  h += `<div class="dt-project-solo-joint-toggle">`;
  h += `<label><input type="radio" name="dt-project_${n}_solo_joint" value="solo"${!isJoint ? ' checked' : ''}> Solo</label>`;
  h += `<label><input type="radio" name="dt-project_${n}_solo_joint" value="joint"${isJoint ? ' checked' : ''}> Joint</label>`;
  h += `</div>`;

  if (isJoint) {
    h += renderJointAuthoring(n, saved, allCharacters, charById, currentChar, currentCycle);
  }
}
```

### Joint authoring helper

```js
function renderJointAuthoring(n, saved, allCharacters, charById, currentChar, currentCycle) {
  const desc = saved[`project_${n}_joint_description`] || '';
  const targetType = saved[`project_${n}_joint_target_type`] || '';
  const targetValue = saved[`project_${n}_joint_target_value`] || '';
  const invitedIds = JSON.parse(saved[`project_${n}_joint_invited_ids`] || '[]');

  // Existing joint document (if already saved)
  const jointId = saved[`project_${n}_joint_id`];
  const joint = jointId ? (currentCycle?.joint_projects || []).find(j => j._id === jointId) : null;

  let h = `<div class="dt-joint-authoring">`;
  h += `<label class="qf-label">Joint description</label>`;
  h += `<textarea id="dt-project_${n}_joint_description" class="qf-textarea" rows="3">${esc(desc)}</textarea>`;

  h += `<label class="qf-label">Joint target</label>`;
  h += renderTargetPicker(`project_${n}_joint_target`, {
    savedType: targetType,
    savedValue: targetValue,
    allCharacters,
    includeOptions: ['character', 'territory', 'other'],
  });

  h += `<label class="qf-label">Invitees</label>`;
  const eligible = eligibleInvitees(allCharacters, currentChar, currentCycle);
  h += renderInviteeGrid(n, eligible, invitedIds);

  if (joint) {
    h += renderJointStatusBadges(joint);
  }

  h += `</div>`;
  return h;
}
```

### Eligible invitee logic

```js
function eligibleInvitees(allCharacters, leadChar, cycle) {
  return allCharacters
    .filter(c => !c.retired)
    .filter(c => String(c._id) !== String(leadChar._id))
    .filter(c => hasAvailableSlot(c, cycle));
}

function hasAvailableSlot(char, cycle) {
  // Read the character's submission for this cycle (if any)
  // Count: how many of their 4 project slots have an action assigned or are bound to a joint as support?
  // If < 4, return true.
  // Implementation depends on how submissions are queryable from the form context.
  // Lead may need to fetch submissions for the cycle to check; alternative: server-side check at save time, optimistic UI.
  return true; // strawman; implementation reads submission data
}
```

If accurate availability is hard to compute client-side at form-render time (because the lead's form doesn't have other players' submissions in memory), the simpler pattern: render all alive non-self non-retired characters, accept tick-marks optimistically, and let the server reject invitations to characters with no available slots at save time. Strawman.

### Server endpoint

`POST /api/downtime_cycles/:cycleId/joint_projects` — body:

```js
{
  lead_character_id: string,
  lead_submission_id: string,
  lead_project_slot: integer,    // 1-4
  description: string,
  action_type: string,
  target_type: string | null,
  target_value: string | null,
  invitee_character_ids: string[],
}
```

Server logic:
1. Authenticate; verify caller owns `lead_character_id`.
2. Validate action_type is in JOINT_ELIGIBLE.
3. Generate joint `_id`.
4. Insert one `project_invitations` document per invitee_character_id with status `'pending'`.
5. Push the joint object onto `cycle.joint_projects`.
6. Update lead's submission's `projects_resolved[lead_project_slot - 1].joint_id` and `.joint_role = 'lead'`.
7. Return the joint document and the invitation list.

### Status badges

```js
function renderJointStatusBadges(joint) {
  let h = `<div class="dt-joint-status-grid">`;
  h += `<div class="dt-joint-status-head">Invitee status</div>`;
  for (const p of joint.participants || []) {
    const char = charById.get(p.character_id);
    const status = p.status || 'pending';   // status comes from invitation document; may need a join
    h += `<div class="dt-joint-status-row">`;
    h += `<span class="dt-joint-invitee-name">${esc(displayName(char) || 'Unknown')}</span>`;
    h += `<span class="dt-joint-status-badge dt-joint-status-${esc(status)}">${esc(status)}</span>`;
    h += `</div>`;
  }
  h += `</div>`;
  return h;
}
```

To get current status, the form's read on open should fetch invitations for this joint or the cycle's full joint_projects (with participants enriched server-side from invitations).

### CSS

Reuse existing tokens. Strawman:

```css
.dt-project-solo-joint-toggle { display: flex; gap: 1rem; margin: .5rem 0; }
.dt-joint-authoring { padding: .75rem; background: var(--surf2); border-left: 3px solid var(--gold2); margin-top: .5rem; }
.dt-joint-status-grid { margin-top: .75rem; }
.dt-joint-status-row { display: flex; justify-content: space-between; padding: .25rem 0; }
.dt-joint-status-badge { padding: .15rem .5rem; border-radius: 999px; font-size: .8em; }
.dt-joint-status-pending { background: var(--surf3); color: var(--txt2); }
.dt-joint-status-accepted { background: var(--gold2); color: var(--bg); }
.dt-joint-status-declined { background: var(--crim); color: var(--bg); }
.dt-joint-status-decoupled,
.dt-joint-status-cancelled-by-lead { background: var(--surf3); color: var(--txt3); }
```

### British English

Toggle labels, descriptions, badges all British.

### No tests required for this story alone

JDT-2 is the lead surface. Server-side endpoint adds test surface; recommended to add a basic test of the endpoint (auth, validation, insert) in `server/tests/api-joint-projects.test.js` (new file). Manual smoke test at minimum:
- As a player, set project slot 1 to action_type=Investigate, toggle Joint, write a description, tick two other characters, save → verify cycle.joint_projects has the entry; verify two project_invitations exist.
- Switch action_type to xp_spend → toggle disappears; joint authoring fields disappear (don't auto-delete the joint server-side, but the UI hides the existing joint association; let JDT-6 handle the action-type change blocker).

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — Solo/Joint toggle, joint authoring helper, invitee grid, status badge render, save flow extension.
- `server/routes/downtime.js` — `POST /api/downtime_cycles/:cycleId/joint_projects` endpoint; supporting helpers.
- `public/js/data/api.js` — verify `apiPost` handles the new path; likely no change needed.
- `public/css/<dt-form-css>.css` — joint authoring styles.

---

## Definition of Done

- All AC verified.
- Manual smoke test creates a joint with two invitees end-to-end.
- Schema validation passes for the created cycle and invitation documents.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `jdt-2-lead-invitation-flow: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- **Depends on JDT-1** for schema fields and the invitation collection.
- **Depends on DTFP-6** for `renderTargetPicker` if the helper is used; if DTFP-6 hasn't shipped, JDT-2 can implement an inline target picker that DTFP-6 then folds into the shared helper.
- **Blocks JDT-3** (invitee acceptance reads the invitations created here) and downstream JDT stories.
