---
id: jdt.3
epic: jdt
status: ready-for-dev
priority: medium
depends_on: [jdt.1, jdt.2]
---

# Story JDT-3: Invitee acceptance / decline flow on the DT form

As a player who has been invited to participate in another character's joint project,
I should see a "Pending invitations" panel on my DT form listing each pending invitation, with Accept and Decline buttons, and on accept the joint locks into my next available project slot as a Support role with editable personal notes,
So that I can join the joint without coordinating slot assignment manually with the lead, and so my pool / personal contribution stays editable while the shared description stays read-only.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 5 (Joint Downtimes), JDT5.3:

> **JDT5.3** — Invitee acceptance flow. Invitations panel above project slot tabs. Accept consumes next available slot, locks to support, exposes editable personal notes. Decline closes invitation.

After JDT-2 ships invitations as `pending`, JDT-3 lets the invitee respond. The flow:

1. On opening the DT form, the invitee fetches their pending invitations for the current cycle (`GET /api/project_invitations?character_id=<self>&cycle_id=<active>&status=pending`).
2. A panel renders **above** the project slot tabs listing each pending invitation: lead name, joint description, action type, Accept and Decline buttons.
3. **Accept**: server-side mutation that:
   - Sets invitation status to `'accepted'`.
   - Finds the invitee's next available project slot.
   - Writes to `projects_resolved[slot - 1]` (or to the saved slot fields): `joint_id`, `joint_role: 'support'`, plus the joint's action_type and description (for read-only display).
   - Pushes a participant record into the joint's `participants[]`.
4. **Decline**: server-side mutation that sets invitation status to `'declined'`. The invitation disappears from the panel.
5. After accept, the joint slot UI displays as **support** mode (read-only description, editable pool builder, editable personal notes — see JDT-4 for the lock implementation; JDT-3 wires the data plumbing).

The acceptance write needs server-side state verification (Call A's race-safety):

> Race conditions in invitation lifecycle (lead un-invites between invitee opening form and clicking Accept). Server-side state verification on Accept handler.

So Accept's handler re-reads the invitation; if status has changed since the invitee saw it (e.g. lead cancelled, status `cancelled-by-lead`), the accept is rejected with 409 and the panel refreshes.

### Files in scope

- `public/js/tabs/downtime-form.js`:
  - On form open / render, fetch pending invitations for `currentChar` and `currentCycle`.
  - New `renderPendingInvitationsPanel(invitations)` rendered above project slot tabs.
  - Accept and Decline click handlers.
- `server/routes/downtime.js`:
  - New endpoint `POST /api/project_invitations/:invitationId/accept`.
  - New endpoint `POST /api/project_invitations/:invitationId/decline`.
  - Existing `GET /api/project_invitations` (or new) — lists invitations filtered by character_id + cycle_id + status.

### Out of scope

- Slot lock + read-only display rendering (**JDT-4**); JDT-3 provides the data writes; JDT-4 styles the locked slot.
- Decouple flow (**JDT-6**'s Call A territory).
- Lead's view of accept/decline (already covered by JDT-2's status badges; refreshes on lead's next form open).
- Multiple invitations to the same character for the same joint (race / duplicate prevention) — server-side uniqueness check on creation in JDT-2; JDT-3 trusts that invariant.
- Cross-cycle invitations. Invitations are per-cycle.
- Notification (email / Discord webhook) when an invitation arrives. Future enhancement.
- Live updates to the invitations panel mid-form (no polling); panel refreshes on form open / explicit refresh button.

---

## Acceptance Criteria

### Pending invitations fetch

**Given** I am a player opening the DT form for a cycle where I have at least one pending invitation
**When** the form loads
**Then** a "Pending invitations" panel renders above the project slot tabs with one row per pending invitation.

**Given** I have zero pending invitations
**Then** the panel **does not** render (no empty placeholder; the slot tabs remain in their normal position).

**Given** I have multiple pending invitations
**Then** rows are sorted by `created_at` descending (most recent first).

### Invitation row contents

**Given** a row renders
**Then** it shows:
- The lead's character display name and the lead's project's title (if set).
- The action type label (e.g. "Investigate").
- The joint description (truncated to ~150 characters with click-to-expand).
- An Accept button.
- A Decline button.

### Accept flow

**Given** I click Accept on a pending invitation
**When** the request succeeds
**Then** the invitation row disappears from the panel.
**And** my next available project slot (lowest-numbered slot with no action set, or set to no-action / empty) becomes the joint slot.
**And** the slot's tab visually indicates Joint (e.g. a chain icon or "Joint" badge).
**And** opening the slot shows the joint's read-only description, the joint's action_type, the (editable) target if applicable, the (editable) pool builder, and an editable "Your personal notes" textarea.

**Given** the request fails because the invitation status has changed (e.g. cancelled by lead, race condition)
**Then** the panel re-fetches and re-renders.
**And** an error message appears: "*This invitation is no longer available. The list has been refreshed.*"

**Given** I have no available project slots (all 4 are filled with non-empty actions)
**Then** the Accept button is **disabled** with a tooltip: "*You have no available project slots. Free up a slot to accept.*"
**And** clicking it does not fire the accept request.

**Given** I have multiple slots available
**Then** the joint occupies the **lowest-numbered** available slot (e.g. if slots 2 and 4 are available, the joint takes slot 2).

### Decline flow

**Given** I click Decline on a pending invitation
**When** the request succeeds
**Then** the invitation row disappears from the panel.
**And** the lead's status badge for me (visible on the lead's form when they next reload) shows `Declined`.
**And** no slot is consumed.

**Given** the decline request fails due to race
**Then** same handling as Accept's race case (refresh + error message).

### Server-side state verification

**Given** the accept handler runs
**Then** before mutating, it re-fetches the invitation from MongoDB and checks `status === 'pending'`.
**And** if status is anything else, it returns HTTP 409 Conflict with a body that explains the actual state.

**Given** the accept handler succeeds
**Then** it returns the updated invitation document AND the joint document (so the client has both for re-render).

### Auth

**Given** the Accept or Decline endpoint is called
**Then** the server verifies the caller is authenticated.
**And** verifies the caller's `character_ids` include the invitation's `invited_character_id`.
**And** returns 403 if not.

### Joint participant record

**Given** an Accept succeeds
**Then** the joint object's `participants` array is appended with:
```js
{
  invitation_id: <the invitation's _id>,
  character_id: <invitee's character_id>,
  submission_id: <invitee's submission _id for this cycle>,
  project_slot: <the chosen slot number>,
  joined_at: <ISO timestamp>,
  decoupled_at: null,
  description_change_acknowledged_at: null,
}
```

**Given** the invitee has no existing submission for the cycle yet (rare; they haven't opened the form before)
**Then** the server creates an empty submission for them as part of the accept flow, sets `invited_submission_id` on the invitation, and proceeds.

### Slot persistence

**Given** the joint accept writes to slot N
**Then** the invitee's submission's `responses[\`project_${N}_action\`]` is set to the joint's action_type.
**And** `responses[\`project_${N}_joint_id\`]` is set to the joint's `_id`.
**And** `responses[\`project_${N}_joint_role\`]` is set to `'support'`.
**And** `responses[\`project_${N}_description\`]` is set to the joint's description (read-only mirror; the actual source of truth stays on the joint object).

### Visual

**Given** the Pending invitations panel renders
**Then** it is visually distinct (e.g. amber border, prominent title) so the player notices it at top of the form.

---

## Implementation Notes

### Fetch on open

In the form's init / open flow (around `tabs/downtime-form.js:762` where `currentCycle` is resolved), after the cycle is set:

```js
let pendingInvitations = [];
async function loadPendingInvitations() {
  if (!currentChar?._id || !currentCycle?._id) return;
  try {
    pendingInvitations = await apiGet(
      `/api/project_invitations?character_id=${currentChar._id}&cycle_id=${currentCycle._id}&status=pending`
    );
  } catch (err) {
    pendingInvitations = [];
  }
}
```

Call from the form's render orchestrator before the first paint.

### Render panel

```js
function renderPendingInvitationsPanel(invitations) {
  if (!invitations.length) return '';
  const sorted = invitations.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  let h = `<section class="dt-pending-invitations-panel">`;
  h += `<h3 class="dt-pending-invitations-title">Pending invitations</h3>`;
  for (const inv of sorted) {
    const joint = inv._joint;  // server-enriched: include the joint document inline in the response
    if (!joint) continue;
    const lead = charById.get(joint.lead_character_id);
    const noSlot = !hasAvailableSlot(currentChar, currentCycle);
    h += `<div class="dt-pending-invitation-row" data-invitation-id="${esc(inv._id)}">`;
    h += `<div class="dt-pending-invitation-lead">${esc(displayName(lead) || 'Unknown')}</div>`;
    h += `<div class="dt-pending-invitation-action">${esc(ACTION_TYPE_LABELS[joint.action_type] || joint.action_type)}</div>`;
    h += `<div class="dt-pending-invitation-desc">${esc(truncate(joint.description, 150))}</div>`;
    h += `<button class="dt-pending-invitation-accept" data-invitation-id="${esc(inv._id)}"${noSlot ? ' disabled title="You have no available project slots. Free up a slot to accept."' : ''}>Accept</button>`;
    h += `<button class="dt-pending-invitation-decline" data-invitation-id="${esc(inv._id)}">Decline</button>`;
    h += `</div>`;
  }
  h += `</section>`;
  return h;
}
```

The server should enrich the invitation response with the inline joint document (`_joint`) so the client has everything in one fetch.

### Accept handler

```js
const acceptBtn = e.target.closest('.dt-pending-invitation-accept');
if (acceptBtn && !acceptBtn.disabled) {
  const invId = acceptBtn.dataset.invitationId;
  try {
    const result = await apiPost(`/api/project_invitations/${invId}/accept`, {});
    // result: { invitation, joint, slot, submission }
    // refresh in-memory state and re-render
    pendingInvitations = pendingInvitations.filter(i => i._id !== invId);
    responseDoc = result.submission;
    renderForm(container);
    showToast(`Joined "${result.joint.description.slice(0, 40)}…" — slot ${result.slot}`);
  } catch (err) {
    if (err.status === 409) {
      await loadPendingInvitations();
      renderForm(container);
      showToast('This invitation is no longer available. The list has been refreshed.', 'error');
    } else {
      showToast('Accept failed: ' + err.message, 'error');
    }
  }
  return;
}
```

### Decline handler

Symmetric:

```js
const declineBtn = e.target.closest('.dt-pending-invitation-decline');
if (declineBtn) {
  const invId = declineBtn.dataset.invitationId;
  try {
    await apiPost(`/api/project_invitations/${invId}/decline`, {});
    pendingInvitations = pendingInvitations.filter(i => i._id !== invId);
    renderForm(container);
  } catch (err) {
    if (err.status === 409) {
      await loadPendingInvitations();
      renderForm(container);
    }
  }
  return;
}
```

### Server-side accept

```js
router.post('/api/project_invitations/:id/accept', requireAuth, async (req, res) => {
  const inv = await getInvitation(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });

  // Auth
  const ownsChar = (req.user.character_ids || []).map(String).includes(String(inv.invited_character_id));
  if (!ownsChar) return res.status(403).json({ error: 'Not your invitation' });

  // Race-safety: re-check status
  if (inv.status !== 'pending') {
    return res.status(409).json({ error: 'Invitation no longer pending', current_status: inv.status });
  }

  // Find / create invitee's submission
  let sub = await getSubmission({ character_id: inv.invited_character_id, cycle_id: inv.cycle_id });
  if (!sub) sub = await createSubmission({ character_id: inv.invited_character_id, cycle_id: inv.cycle_id });

  // Find next available slot
  const slot = findFirstAvailableSlot(sub);
  if (!slot) return res.status(409).json({ error: 'No available slots' });

  // Get the joint
  const cycle = await getCycle(inv.cycle_id);
  const joint = (cycle.joint_projects || []).find(j => j._id === inv.joint_project_id);
  if (!joint) return res.status(409).json({ error: 'Joint no longer exists' });

  // Mutations (atomic where possible)
  await updateInvitation(inv._id, { status: 'accepted', responded_at: nowISO(), invited_submission_id: sub._id });
  await pushJointParticipant(cycle._id, joint._id, {
    invitation_id: inv._id,
    character_id: inv.invited_character_id,
    submission_id: sub._id,
    project_slot: slot,
    joined_at: nowISO(),
    decoupled_at: null,
    description_change_acknowledged_at: nowISO(),
  });
  await updateSubmissionSlot(sub._id, slot, {
    [`project_${slot}_action`]: joint.action_type,
    [`project_${slot}_joint_id`]: joint._id,
    [`project_${slot}_joint_role`]: 'support',
    [`project_${slot}_description`]: joint.description,
  });

  // Return enriched payload
  const updatedInv = await getInvitation(inv._id);
  const updatedSub = await getSubmission(sub._id);
  const updatedJoint = (await getCycle(cycle._id)).joint_projects.find(j => j._id === joint._id);

  res.json({ invitation: updatedInv, joint: updatedJoint, slot, submission: updatedSub });
});
```

The mutations are individually atomic but the sequence is not — at our 30-player scale this is acceptable. If transactional integrity becomes important, wrap in a Mongo transaction.

### Server-side decline

Simpler:

```js
router.post('/api/project_invitations/:id/decline', requireAuth, async (req, res) => {
  const inv = await getInvitation(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const ownsChar = (req.user.character_ids || []).map(String).includes(String(inv.invited_character_id));
  if (!ownsChar) return res.status(403).json({ error: 'Not your invitation' });
  if (inv.status !== 'pending') {
    return res.status(409).json({ error: 'Invitation no longer pending', current_status: inv.status });
  }
  await updateInvitation(inv._id, { status: 'declined', responded_at: nowISO() });
  res.json(await getInvitation(inv._id));
});
```

### CSS

```css
.dt-pending-invitations-panel { margin-bottom: 1rem; padding: .75rem 1rem; background: var(--surf2); border: 2px solid var(--gold2); border-radius: 4px; }
.dt-pending-invitations-title { font-family: var(--fh2); font-size: .85rem; letter-spacing: .12em; text-transform: uppercase; color: var(--gold2); margin: 0 0 .5rem; }
.dt-pending-invitation-row { display: grid; grid-template-columns: minmax(7rem, 1fr) auto minmax(10rem, 3fr) auto auto; gap: .5rem; align-items: center; padding: .35rem 0; }
.dt-pending-invitation-accept { background: var(--gold2); color: var(--bg); border: none; padding: .25rem .75rem; border-radius: 3px; cursor: pointer; }
.dt-pending-invitation-decline { background: transparent; color: var(--txt2); border: 1px solid var(--bdr2); padding: .25rem .75rem; border-radius: 3px; cursor: pointer; }
```

### British English

All copy British; no em-dashes.

### No tests required for this story alone

UI + server endpoints. Recommended: `server/tests/api-project-invitations.test.js` covering accept/decline/race for the endpoints. Manual smoke test:
- Player A creates joint inviting Player B.
- Player B opens form: panel appears.
- Player B accepts: invitation gone, slot 2 (or whichever) shows the joint as support; refresh confirms.
- Player B starts a new browser, declines a different invitation: invitation gone.
- Race: open invitation in two tabs; accept in tab 1; tab 2 accept fails with 409 + refresh.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — `loadPendingInvitations`, `renderPendingInvitationsPanel`, accept/decline handlers, render orchestration.
- `server/routes/downtime.js` — `POST /api/project_invitations/:id/accept`, `POST /api/project_invitations/:id/decline`, `GET /api/project_invitations` query support.
- `public/js/data/api.js` — verify; likely no change.
- `public/css/<dt-form-css>.css` — pending invitations panel styles.

---

## Definition of Done

- All AC verified.
- Manual smoke test: end-to-end accept and decline.
- Race-condition test: concurrent accepts → one succeeds, other gets 409.
- Auth gate verified via direct API call (player attempting to accept another player's invitation gets 403).
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `jdt-3-invitee-acceptance-flow: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- **Depends on JDT-1** (schema for invitations + joint participants).
- **Depends on JDT-2** (invitations get created here).
- **Blocks JDT-4** (slot lock for the accepted slot — visual rendering once data is in place).
- Independent of JDT-5 and JDT-6 (those build on top of accepted state).
