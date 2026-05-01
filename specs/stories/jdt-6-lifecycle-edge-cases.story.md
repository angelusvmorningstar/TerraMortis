---
id: jdt.6
epic: jdt
status: complete
priority: medium
depends_on: [jdt.1, jdt.2, jdt.3, jdt.4, jdt.5]
shipped: 2026-04-27
---

# Story JDT-6: Joint Downtimes lifecycle edge cases — decouple, mid-cycle edits, action-type whitelist enforcement

As a Storyteller and as a player navigating the messy real-world cases that come up around joint projects,
I should have decouple, lead re-invitation, lead cancellation (when supports drop), description-changed indicators on supports, action-type-change-blocking-while-invitations-exist, and the ST safety-valve override all working correctly,
So that the joint workflow does not become a trap when plans change mid-cycle, and so the system enforces the locked product calls (Calls A, B, C) the memory captured during scoping.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 5 (Joint Downtimes), JDT5.6:

> **JDT5.6** — Lifecycle edge cases. Implements the three resolved product calls below.

The three resolved product calls (verbatim from memory):

### Call A — Lead's recourse if too many decline

- Once one support accepts, joint stays joint. Lead cannot self-cancel.
- Supports can decouple voluntarily; explicit action visible to lead, slot unlocks.
- Lead can re-invite alternates while submissions open.
- Lead can cancel slot only when supports = 0 (i.e., after all decoupled).
- ST override path for the cancel-with-supports-stuck case (rare safety valve, in DT Processing).
- All state transitions surface explicit events to affected parties.
- Status enum: `pending | accepted | declined | decoupled | cancelled-by-lead`.

### Call B — Mid-cycle description edits by lead

- Free edit by lead at any time during cycle.
- Each edit produces a "Lead has updated this project" indicator on every accepted support's slot.
- Indicator persists until support acknowledges (clicks through or dismisses).
- Lead's panel shows "last edited [timestamp]" line.
- Supports use Call A's decouple if they no longer want in.
- Schema: `joint_projects[i].description_updated_at`, `joint_projects[i].participants[j].description_change_acknowledged_at`. Indicator rule: `description_updated_at > description_change_acknowledged_at`.

### Call C — Action-type whitelist for joints (enforcement)

- Solo/Joint toggle conditional on action type (toggle simply doesn't appear for excluded types) — already implemented in JDT-2.
- **Action-type change blocked while joint has pending or accepted invitations; lead must cancel joint first.** ← JDT-6 enforces this.
- `support` remains fully available as solo project action type.

JDT-6 also handles two architectural risks flagged in memory:

> Cancellation cascade: deleting lead's submission cascades to invitations + accepted slots. Logic lives in submission delete handler.

(Implement the cascade so removing the lead's submission tidies up its joints.)

### Files in scope

Substantial cross-cutting work:

- `public/js/tabs/downtime-form.js`:
  - Decouple button on accepted support slots (JDT-4's render).
  - Re-invite affordance on lead's joint authoring (JDT-2's render) when supports = 0 or there are decoupled slots.
  - Lead cancel button when supports = 0.
  - Description edit affordance (Call B): lead can edit description; bumps `description_updated_at`.
  - Description-changed indicator on support slots (Call B): visible until support acknowledges.
  - Action-type change handler: when action type changes on a joint slot with pending/accepted invitations, block with confirmation modal: "*This joint has active invitations. Cancel the joint first.*"
- `server/routes/downtime.js`:
  - `POST /api/project_invitations/:id/decouple` — invitee voluntary decouple.
  - `POST /api/downtime_cycles/:cycleId/joint_projects/:jointId/cancel` — lead cancellation when supports = 0; ST override variant when supports remain.
  - `PATCH /api/downtime_cycles/:cycleId/joint_projects/:jointId` — description edit (bumps `description_updated_at`).
  - `POST /api/downtime_cycles/:cycleId/joint_projects/:jointId/participants/:charId/acknowledge` — support acknowledges description change.
  - Submission delete handler — cascade to joints (cancel as lead) and invitations (mark as cancelled).
- `public/js/admin/downtime-views.js`:
  - ST safety-valve cancel affordance in DT Processing's joint panel — visible only when supports = 0 OR ST chooses to force-cancel with supports remaining.

### Out of scope

- Per-call notification (Discord, email) when a state changes. Memory says "All state transitions surface explicit events to affected parties" — interpret as in-UI events on next form open, not push notifications.
- Edit history / audit log of description changes. The latest description and the timestamp are sufficient.
- Validation of decouple / cancel reasons. Both are bare actions; ST and player don't have to justify in v1.
- Reverting an action — e.g. unaccept (an invitee changing their mind after accepting). Use decouple instead.
- Cross-cycle visibility of cancelled / decoupled joints. They stay on the cycle document but don't render in the active phase.

---

## Acceptance Criteria

### Call A — Decouple

**Given** I am an accepted support on a joint slot
**Then** I see a "**Decouple**" button somewhere visible on the slot (e.g. inside the support slot pane near the personal notes).

**Given** I click Decouple
**Then** a confirmation prompt appears: "*Decouple from this joint? Your slot will be freed up.*"

**Given** I confirm
**Then** the API call to `POST /api/project_invitations/:id/decouple` runs, which:
- Sets the invitation status to `'decoupled'`.
- Sets the participant entry's `decoupled_at` on the joint object.
- Frees my slot (clears `joint_id`, `joint_role`, the action_type mirror, and the description mirror from `responses[\`project_${N}_*\`]`).
- Returns the updated invitation, joint, and submission.

**Given** the decouple succeeds
**Then** my slot reverts to a normal empty project slot (no joint chrome).
**And** the lead's joint panel shows my status as `Decoupled` on next form open.

**Given** the decouple is the last accepted participant on the joint
**Then** the joint object's `participants` array filters down to all-decoupled.
**And** the joint document remains (not deleted) so the lead can re-invite or cancel.

### Call A — Lead re-invite

**Given** I am the lead and one or more supports have decoupled (or declined originally)
**Then** my joint authoring panel still allows me to invite additional characters from the eligible-list.
**And** ticking new invitees and saving creates new `project_invitations` documents (`status: 'pending'`).

**Given** the lead has at least one accepted support
**Then** the lead **can** re-invite additional supports (joints can grow).
**And** the lead **cannot** self-cancel the joint while at least one support is accepted (Cancel button disabled or not rendered).

### Call A — Lead cancel when supports = 0

**Given** the joint has zero accepted (and zero pending) supports — all participants have declined or decoupled
**Then** the lead's joint panel shows a "**Cancel joint**" button.

**Given** I click Cancel joint
**Then** the API call cancels:
- The joint object's `cancelled_at` is set; `cancelled_reason` = `'lead-cancelled'`.
- All remaining pending invitations (if any) flip to `cancelled-by-lead`.
- The lead's slot reverts to a normal empty project slot.

### Call A — ST override (safety valve)

**Given** I am an ST in DT Processing on a joint with accepted supports
**Then** the joint panel shows a small "**ST override: cancel joint**" button (well-marked as a safety valve, not a primary action).

**Given** I click it and confirm
**Then** the joint cancels regardless of accepted-support count.
**And** all accepted supports' slots free up.
**And** `cancelled_reason` = `'st-override'`.

### Call B — Description edits

**Given** I am the lead and my joint exists
**Then** my joint authoring panel allows me to edit the joint description (multi-line textarea, same as create-time).

**Given** I edit and save
**Then** `joint.description` is updated.
**And** `joint.description_updated_at` is set to the current ISO timestamp.
**And** the lead's panel displays "Last edited <timestamp>" beneath the description.

### Call B — Description-changed indicator on supports

**Given** I am an accepted support on a joint
**And** the joint's `description_updated_at` is later than my participant entry's `description_change_acknowledged_at`
**Then** my support slot shows a prominent indicator at the top: "**The lead has updated this project description.**"
**And** the indicator includes a clickable affordance: "*View and acknowledge*".

**Given** I click the acknowledge affordance
**Then** `participants[me].description_change_acknowledged_at` is set to the current ISO timestamp.
**And** the indicator disappears.
**And** the support sees the new description (which was always shown read-only — acknowledging just dismisses the indicator).

**Given** I do nothing, but the lead edits the description **again**
**Then** the indicator reappears (`description_updated_at > description_change_acknowledged_at` still true after the new edit).

### Call C — Action-type change blocking

**Given** I am the lead on a joint slot with at least one pending OR accepted invitation
**When** I attempt to change the action_type dropdown to a different action
**Then** a confirmation modal appears: "*This joint has active invitations. Change action type? You'll need to cancel the joint and start fresh.*" (or simply block with: "*Cancel the joint first to change action type.*")
**And** if the user confirms, the action does NOT auto-cancel the joint — they have to cancel via the explicit Cancel button (or ST override).
**And** the action_type dropdown reverts to the joint's action type until cancellation is performed.

(Simpler alternative at implementation: just disable the action-type dropdown when the slot has a joint; surface a tooltip explaining why.)

### Cascade on submission delete

**Given** the lead's submission is deleted (e.g. ST removes a player from the cycle)
**Then** all joints where the deleted submission was the lead are cancelled (`cancelled_at`, `cancelled_reason: 'lead-submission-deleted'`).
**And** all related invitations are cancelled (`status: 'cancelled-by-lead'`).
**And** all accepted supports' slots are freed.

**Given** an accepted support's submission is deleted
**Then** their participation is decoupled (`decoupled_at` set on the joint participant entry; invitation status `'decoupled'`).
**And** other participants are unaffected.

### Visual

**Given** any new affordance (Decouple, Cancel joint, ST override, indicator, etc.)
**Then** copy is unambiguous about what will happen and is consistent with project conventions (British English, no em-dashes).

---

## Implementation Notes

### Decouple endpoint

```js
router.post('/api/project_invitations/:id/decouple', requireAuth, async (req, res) => {
  const inv = await getInvitation(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const ownsChar = (req.user.character_ids || []).map(String).includes(String(inv.invited_character_id));
  if (!ownsChar) return res.status(403).json({ error: 'Not your invitation' });
  if (inv.status !== 'accepted') return res.status(409).json({ error: 'Cannot decouple non-accepted invitation', current_status: inv.status });

  const cycle = await getCycle(inv.cycle_id);
  const joint = (cycle.joint_projects || []).find(j => j._id === inv.joint_project_id);
  if (!joint) return res.status(404).json({ error: 'Joint not found' });

  const participant = (joint.participants || []).find(p => p.invitation_id === inv._id);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });

  const slot = participant.project_slot;
  const sub = await getSubmission(participant.submission_id);

  // Mutations
  await updateInvitation(inv._id, { status: 'decoupled', decoupled_at: nowISO() });
  await setParticipantDecoupled(cycle._id, joint._id, participant.invitation_id);
  await clearSubmissionJointSlot(sub._id, slot);

  res.json({ /* enriched payload */ });
});

async function clearSubmissionJointSlot(subId, slot) {
  const patch = {
    [`responses.project_${slot}_action`]: '',
    [`responses.project_${slot}_joint_id`]: null,
    [`responses.project_${slot}_joint_role`]: null,
    [`responses.project_${slot}_description`]: '',
    [`responses.project_${slot}_personal_notes`]: '',
  };
  await db.submissions.updateOne({ _id: subId }, { $set: patch });
}
```

### Lead cancel endpoint

```js
router.post('/api/downtime_cycles/:cycleId/joint_projects/:jointId/cancel', requireAuth, async (req, res) => {
  const cycle = await getCycle(req.params.cycleId);
  const joint = (cycle.joint_projects || []).find(j => j._id === req.params.jointId);
  if (!joint) return res.status(404).json({ error: 'Not found' });

  const isST = req.user.role === 'st' || req.user.role === 'dev';
  const isLead = (req.user.character_ids || []).map(String).includes(String(joint.lead_character_id));
  const stOverride = !!req.body.st_override;

  if (!isLead && !(isST && stOverride)) {
    return res.status(403).json({ error: 'Not authorised' });
  }

  // Lead can only cancel when zero accepted supports
  const acceptedSupports = (joint.participants || []).filter(p => !p.decoupled_at);
  if (isLead && !stOverride && acceptedSupports.length > 0) {
    return res.status(409).json({ error: 'Cannot cancel joint with accepted supports; ask supports to decouple first' });
  }

  // Mutations
  await setJointCancelled(cycle._id, joint._id, stOverride ? 'st-override' : 'lead-cancelled');
  await cancelPendingInvitationsForJoint(cycle._id, joint._id);
  await clearLeadJointSlot(joint.lead_submission_id, joint.lead_project_slot);

  // Free up any remaining accepted supports' slots (st-override case)
  if (stOverride) {
    for (const p of acceptedSupports) {
      await clearSubmissionJointSlot(p.submission_id, p.project_slot);
    }
  }

  res.json({ /* enriched */ });
});
```

### Description edit endpoint

```js
router.patch('/api/downtime_cycles/:cycleId/joint_projects/:jointId', requireAuth, async (req, res) => {
  const cycle = await getCycle(req.params.cycleId);
  const joint = (cycle.joint_projects || []).find(j => j._id === req.params.jointId);
  if (!joint) return res.status(404).json({ error: 'Not found' });

  const isLead = (req.user.character_ids || []).map(String).includes(String(joint.lead_character_id));
  if (!isLead) return res.status(403).json({ error: 'Only lead may edit' });

  const allowed = ['description', 'target_type', 'target_value'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));

  if (Object.keys(updates).length) {
    updates.description_updated_at = nowISO();
    await updateJointFields(cycle._id, joint._id, updates);
  }

  res.json({ /* enriched */ });
});
```

### Acknowledge endpoint

```js
router.post('/api/downtime_cycles/:cycleId/joint_projects/:jointId/participants/:charId/acknowledge', requireAuth, async (req, res) => {
  const cycle = await getCycle(req.params.cycleId);
  const joint = (cycle.joint_projects || []).find(j => j._id === req.params.jointId);
  if (!joint) return res.status(404).json({ error: 'Not found' });

  const ownsChar = (req.user.character_ids || []).map(String).includes(String(req.params.charId));
  if (!ownsChar) return res.status(403).json({ error: 'Not your participant entry' });

  const participantIdx = (joint.participants || []).findIndex(p => p.character_id === req.params.charId);
  if (participantIdx < 0) return res.status(404).json({ error: 'Participant not found' });

  await setParticipantField(cycle._id, joint._id, participantIdx, { description_change_acknowledged_at: nowISO() });
  res.json({ /* enriched */ });
});
```

### Description-changed indicator render (in JDT-4's renderSupportSlot)

```js
const me = (joint.participants || []).find(p => p.character_id === currentChar._id);
const updatedAt = joint.description_updated_at;
const ackedAt   = me?.description_change_acknowledged_at;
const showIndicator = updatedAt && (!ackedAt || new Date(updatedAt) > new Date(ackedAt));

if (showIndicator) {
  h += `<div class="dt-joint-desc-changed-indicator">`;
  h += `<strong>The lead has updated this project description.</strong>`;
  h += `<button class="dt-joint-desc-acknowledge-btn" data-joint-id="${esc(joint._id)}">View and acknowledge</button>`;
  h += `</div>`;
}
```

### Action-type change block (lead's joint slot)

In the action-type dropdown change handler (downtime-form.js), check before applying:

```js
async function handleProjectActionChange(slot, newActionType) {
  const jointId = responses[`project_${slot}_joint_id`];
  const isJointLead = jointId && responses[`project_${slot}_joint_role`] === 'lead';
  if (isJointLead) {
    const joint = currentCycle.joint_projects?.find(j => j._id === jointId);
    const hasActiveInvites = joint && (
      (await fetchInvitations({ joint_project_id: jointId, statusIn: ['pending', 'accepted'] })).length > 0
    );
    if (hasActiveInvites) {
      alert('This joint has active invitations. Cancel the joint first to change action type.');
      // revert dropdown
      e.target.value = currentActionType;
      return;
    }
  }
  // proceed with change
}
```

### Submission delete cascade

In whatever route handles `DELETE /api/downtime_submissions/:id`:

```js
// Before deleting the submission, find joints where it's the lead
const joints = await getJointsByLeadSubmission(submissionId);
for (const joint of joints) {
  await setJointCancelled(joint.cycle_id, joint._id, 'lead-submission-deleted');
  await cancelPendingInvitationsForJoint(joint.cycle_id, joint._id);
  for (const p of (joint.participants || []).filter(p => !p.decoupled_at)) {
    await clearSubmissionJointSlot(p.submission_id, p.project_slot);
  }
}

// Find joints where it's a participant
const participantJoints = await getJointsByParticipantSubmission(submissionId);
for (const joint of participantJoints) {
  const participant = joint.participants.find(p => p.submission_id === submissionId);
  await setParticipantDecoupled(joint.cycle_id, joint._id, participant.invitation_id);
  await updateInvitation(participant.invitation_id, { status: 'decoupled', decoupled_at: nowISO() });
}

// Then proceed with the existing submission delete
```

### Tests

Recommended: server-side test file `server/tests/api-joint-lifecycle.test.js` covering:
- Decouple (auth, status check, slot freed).
- Lead cancel when supports = 0 (allowed) and supports > 0 (rejected with 409).
- ST override cancel with supports > 0 (allowed, slots freed).
- Description edit by lead (timestamp bumped).
- Description-acknowledge (sets ackd_at).
- Cascade on submission delete.

Manual smoke test exercises end-to-end:
- Create joint, invite two people; both accept.
- One decouples; lead's panel shows decoupled status.
- Lead invites a third person; new pending invitation visible.
- Lead edits description; both remaining accepted supports see indicator on their slot.
- One support clicks Acknowledge; their indicator disappears; the other still sees it.
- Lead tries to change action_type: blocked.
- Last support decouples; lead's Cancel button enables; lead cancels; joint gone.
- ST in DT Processing on a different joint with accepted supports clicks ST override: joint gone, slots freed.

### British English

All copy British; no em-dashes.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — decouple button, lead re-invite affordance, lead cancel, description edit, indicator, action-type change block.
- `public/js/admin/downtime-views.js` — ST safety-valve cancel affordance in joint panel.
- `server/routes/downtime.js` — decouple, lead cancel, ST cancel, description edit, acknowledge endpoints; submission delete cascade extended.
- `public/css/<dt-form-css>.css` — indicator and small affordance styles.

---

## Definition of Done

- All AC verified.
- Manual smoke test exercises the full lifecycle (create / accept / decouple / re-invite / edit / acknowledge / cancel / ST override / cascade).
- Server-side tests cover the new endpoints and the cascade.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `jdt-6-lifecycle-edge-cases: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- **Depends on JDT-1, JDT-2, JDT-3, JDT-4, JDT-5**.
- **Closes Epic JDT** when shipped.
- **Closes the Downtime Overhaul six-epic set** when shipped (alongside the rest of NPCP / CHM / DTSR / DTFP / DTIL).

---

## Completion notes (2026-04-27)

Shipped on `Morningstar` in four commits, each merged into `dev` and finally into `main` as part of the closing merge `b2fe0e7`.

### Commits
- `e20af6f` — voluntary decouple endpoint + UI (6 tests)
- `b9b7e29` — lead re-invite, lead cancel, ST override (11 tests)
- `f90c945` — mid-cycle description edits + indicator (7 tests)
- `13cbe6a` — action-type block + submission delete cascade (5 tests)

### Files changed
- `server/routes/downtime.js` — 5 new endpoints plus DELETE submission cascade
- `server/tests/api-invitation-lifecycle.test.js` — decouple suite (6 tests)
- `server/tests/api-joint-projects.test.js` — reinvite, cancel, PATCH joint, acknowledge participant, DELETE cascade (23 tests)
- `public/js/tabs/downtime-form.js` — Decouple button, Re-invite + Cancel panels, description Save + last-edited, support indicator, action-type lock
- `public/js/admin/downtime-views.js` — ST override safety-valve button on joint group panel
- `public/css/components.css` — JDT-6 lifecycle controls + indicator styles
- `public/css/admin-layout.css` — ST override button style

### Endpoint summary
- `POST /api/project_invitations/:id/decouple`
- `POST /api/downtime_cycles/:cycleId/joint_projects/:jointId/reinvite`
- `POST /api/downtime_cycles/:cycleId/joint_projects/:jointId/cancel` (lead path / `st_override:true` path)
- `PATCH /api/downtime_cycles/:cycleId/joint_projects/:jointId`
- `POST /api/downtime_cycles/:cycleId/joint_projects/:jointId/participants/:charId/acknowledge`
- `DELETE /api/downtime_submissions/:id` (ST only) with joint cascade

### Test totals
112 server tests across `tm_suite_test`. JDT + downtime suite: 81/81 pass (decouple, joint-projects, compile-push-outcome, downtime regression). Pre-existing `npcs/directory` flake unchanged — unrelated to JDT.

### Manual smoke deferred
Real-data end-to-end smoke (invite → accept → edit description → support acknowledge → support decouple → lead invite alternate → all decline → lead cancel; separate ST override run) deferred until DT3 cycle opens.

### Out-of-scope confirmation
- Discord / email push notifications on lifecycle events — deliberately out of v1 scope (memory contract: "explicit events to affected parties" interpreted as in-UI events on next form open, which the indicator + status badges already cover).
- Edit history / audit log of description changes — only the latest description + timestamp persisted.
- Reverting an accept (unaccept) — use decouple instead; not implemented.
- Cross-cycle visibility of cancelled / decoupled joints — they remain on the cycle document but are not surfaced in the active phase render.
