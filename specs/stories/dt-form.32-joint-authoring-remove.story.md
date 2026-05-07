---
id: dt-form.32
task: 32
issue: 83
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/83
branch: morningstar-issue-83-joint-authoring-remove
epic: epic-dt-form-mvp-redesign
status: review
priority: low
depends_on: []
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Out-of-scope)
---

# Story dt-form.32 — Remove joint authoring / project invitation from MVP

As an ST shipping the MVP DT form,
I should not see joint-authoring / project-invitation UI surfaces in the form,
So that the MVP scope matches ADR-003 and joint authoring is preserved as a future scoping decision rather than a half-functional feature.

## Context

ADR-003 §Out-of-scope: *"Joint authoring / project invitation. Task #32 removes from MVP. Re-enabling is a future scoping decision."*

This story removes the joint-authoring affordances from the form via **code deletion**, not a feature flag. The diff should be legible: dead functions gone, inline blocks excised cleanly. Data already in submissions that referenced joint authors is preserved automatically by the `_prior` spread invariant — no migration needed.

The JDT surface turned out to be substantial on survey: 15 functions (≈800 lines), 10+ inline blocks, plus one exported constant in `downtime-data.js`. The story captures every removal site precisely so the dev agent can work through it systematically.

## Files in Scope

- `public/js/tabs/downtime-form.js` — the bulk of the work (functions + inline blocks)
- `public/js/tabs/downtime-data.js` — remove `JOINT_ELIGIBLE_ACTIONS` export

## Files NOT in Scope

- Server routes (`/api/project_invitations/*`, `/api/downtime_cycles/:id/joint_projects/*`) — leave untouched; server keeps the data model
- Admin ST-side joint views — separate concern
- `public/css/` — JDT-specific CSS classes become dead CSS; leave for a future CSS cleanup pass
- Any MongoDB downtime_submissions data — `_prior` spread handles preservation automatically

## Acceptance Criteria

**Given** the player opens the DT form (any mode)
**When** the form renders
**Then** there is no joint-authoring UI surface: no Solo/Joint toggle, no invitee chips, no Pending Invitations panel, no Joint badge on project tabs, no support-slot read-only view.

**Given** legacy submission data has `project_N_is_joint`, `project_N_joint_*`, `project_N_joint_invited_ids`, etc. in `responses`
**When** the form loads
**Then** no error. The fields are not surfaced but are preserved in `responses` for historical record.

**Given** a developer wants to re-enable joint authoring in a future cycle
**When** that work picks up
**Then** the JDT codebase is documented (this story's DAR) and the re-enable is a new story, not a one-liner flag flip.

## Implementation Notes

### Data preservation invariant

`collectResponses()` opens at line 348 with:
```javascript
const _prior = responseDoc?.responses || {};
const responses = { ..._prior };
```
This spreads all previously-saved responses (including any `project_N_joint_*` keys) as the base. Once the joint collect blocks are removed, those keys are never overwritten — they survive saves untouched. No migration required.

### Recommended removal order

Work **bottom-up on functions** (higher line numbers first) to avoid line-number drift when editing the file. After all functions are removed, work top-down on inline blocks.

---

### Pass 1 — Remove standalone functions (bottom to top)

All functions below are exclusively JDT. Delete each one entirely including its leading comment.

| Function | Approx line | JDT tag |
|---|---|---|
| `renderJointStatusBadges` | 4967 | JDT-2/6 |
| `renderPendingInvitationsPanel` | 4917 | JDT-3 |
| `renderJointInviteeGrid` | 4898 | JDT-2 |
| `renderJointCancelPanel` | 4880 | JDT-6 |
| `renderJointReinvitePanel` | 4849 | JDT-6 |
| `renderJointSphereChips` | 4813 | DTUI-14 (inside JDT gate) |
| `renderJointInviteeChips` | 4777 | JDT-2 |
| `renderDtJointPanel` | 4733 | JDT-2 |
| `renderJointAuthoring` | 4671 | JDT-2/6 |
| `formatTimestamp` | 4643 | JDT-6 helper (only used by renderJointAuthoring) |
| `findExistingJoint` | 4657 | JDT-2 |
| `createPendingJoints` | 1088 | JDT-2 |
| `refreshJointCaches` | 1067 | JDT-3 |
| `handleJointDescriptionAcknowledge` | 1053 | JDT-6 |
| `handleJointDescriptionSave` | 1029 | JDT-6 |
| `handleJointCancel` | 1004 | JDT-6 |
| `handleJointReinvite` | 980 | JDT-6 |
| `handleInvitationDecouple` | 950 | JDT-6 |
| `handleInvitationDecline` | 924 | JDT-3 |
| `handleInvitationAccept` | 898 | JDT-3 |

---

### Pass 2 — Inline blocks in `downtime-form.js` (top to bottom)

After Pass 1, edit these inline sites:

**1. Import line ~16 — strip `JOINT_ELIGIBLE_ACTIONS`:**
```javascript
// BEFORE
import { ..., JOINT_ELIGIBLE_ACTIONS, ... } from './downtime-data.js';

// AFTER — remove JOINT_ELIGIBLE_ACTIONS from the destructure
import { ..., ACTION_APPROACH_PROMPTS } from './downtime-data.js';
```

**2. Module state lines ~95–103 — delete both:**
```javascript
// DELETE these two declarations:
let _jointInvitations = [];
const JOINT_STATUS_LABELS = { pending: 'Pending', accepted: 'Accepted', declined: 'Declined' };
```

**3. `collectResponses()` — project slot loop (~lines 523–574):**
Remove the three JDT collect blocks inside the `for (let n = 1; n <= projectSlotCount; n++)` loop:

```javascript
// DELETE: JDT-4 personal notes (only rendered in support slots; becomes dead code)
const personalNotesEl = document.getElementById(`dt-project_${n}_personal_notes`);
if (personalNotesEl) {
  responses[`project_${n}_personal_notes`] = personalNotesEl.value;
}

// DELETE: JDT-2 joint scratch fields (lines 529–562) — the entire block
const soloJointRadio = ...
responses[`project_${n}_is_joint`] = ...
const jointDescEl = ...
... through ...
responses[`project_${n}_joint_invited_ids`] = ...

// DELETE: joint sphere chips collect (lines 563–574)
const chipPanel = document.querySelector(`[data-support-assets-wrap="${n}"]`);
if (chipPanel) { ... } else { ... }
```

**4. Sphere slot collect (~lines 659–666) — remove joint_sphere_chips cross-reference:**

The block that forces `sphere_${n}_action = 'support'` based on saved joint_sphere_chips — delete it entirely:
```javascript
// DELETE this block inside the sphere slot loop:
const sphereSlotKey = `sphere_${n}`;
for (let pn = 1; pn <= projectSlotCount; pn++) {
  let chips = [];
  try { chips = JSON.parse(responses[`project_${pn}_joint_sphere_chips`] || '[]'); } catch { chips = []; }
  if (Array.isArray(chips) && chips.includes(sphereSlotKey)) {
    responses[`sphere_${n}_action`] = 'support';
    break;
  }
}
```

**5. Save path (~line 883) — remove `createPendingJoints` call:**
```javascript
// DELETE this line from the save success path:
await createPendingJoints(responses);
```

**6. `renderDowntimeTab` invitation fetch (~lines 1422–1429) — delete the block:**
```javascript
// DELETE:
_jointInvitations = [];
if (currentCycle?._id && currentCycle._id !== 'dev-stub') {
  try {
    _jointInvitations = await apiGet(`/api/project_invitations?...`) || [];
  } catch { _jointInvitations = []; }
}
```

**7. Event delegation — click handler (~lines 2003–2044) — delete 6 JDT handlers:**
```javascript
// DELETE from the click handler (lines 2003–2044):
// JDT-3: pending invitation Accept / Decline
const acceptBtn = ...
if (acceptBtn && !acceptBtn.disabled) { ... return; }
const declineBtn = ...
if (declineBtn) { ... return; }

// JDT-6: voluntary decouple
const decoupleBtn = ...
if (decoupleBtn) { ... return; }

// JDT-6: lead re-invite alternates
const reinviteBtn = ...
if (reinviteBtn) { ... return; }

// JDT-6: lead cancel joint
const cancelBtn = ...
if (cancelBtn) { ... return; }

// JDT-6: lead description save
const descSaveBtn = ...
if (descSaveBtn) { ... return; }

// JDT-6: support acknowledge description change
const ackBtn = ...
if (ackBtn) { ... return; }
```

**8. Event delegation — Solo/Joint toggle (~lines 2320–2329) — delete handler:**
```javascript
// DELETE:
const soloJoint = e.target.closest('[data-project-solo-joint]');
if (soloJoint) {
  activeProjectTab = parseInt(soloJoint.dataset.projectSoloJoint, 10);
  const responses = collectResponses();
  if (responseDoc) responseDoc.responses = responses;
  else responseDoc = { responses };
  renderForm(container);
  return;
}
```

**9. Projects section render — pending invitations panel (~line 3214–3216):**
```javascript
// DELETE this single line (inside renderProjectsSection):
h += renderPendingInvitationsPanel();
```

**10. Project tab bar (~lines 3235–3244) — remove joint badge:**
```javascript
// DELETE three lines:
const jointRole = saved[`project_${n}_joint_role`];
const jointTabClass = jointRole ? ' dt-proj-tab-joint' : '';
const jointBadge = jointRole ? `<span class="dt-proj-tab-joint-badge">Joint</span>` : '';

// And simplify the tab button (remove jointTabClass and jointBadge):
// BEFORE:
h += `<button type="button" class="dt-proj-tab${active}${noAction}${jointTabClass}" data-proj-tab="${n}">`;
// ...
h += jointBadge;
// AFTER:
h += `<button type="button" class="dt-proj-tab${active}${noAction}" data-proj-tab="${n}">`;
// (remove the jointBadge line entirely)
```

**11. Support slot detection and render (~lines 3260–3376) — delete entire block:**
```javascript
// DELETE all of this (JDT-4 support-slot detection + isSupportSlot render):
const slotJointRole = saved[`project_${n}_joint_role`];
const slotJointId = saved[`project_${n}_joint_id`];
const isSupportSlot = slotJointRole === 'support' && !!slotJointId;

h += `<div class="dt-proj-pane...${isSupportSlot ? ' dt-proj-support-pane' : ''}...">`;
// ... through ...
if (isSupportSlot) {
  // entire support slot render (~3283–3376)
  // ... 
  continue;
}
```
Simplify the pane open tag to remove `dt-proj-support-pane` conditional:
```javascript
// AFTER:
h += `<div class="dt-proj-pane${visible ? '' : ' dt-proj-pane-hidden'}" data-proj-pane="${n}">`;
```

**12. `isJointEligible` / `existingJoint` / `isJoint` / `lockActionType` (~lines 3378–3394) — delete all:**
```javascript
// DELETE all four variable declarations:
const isJointEligible = JOINT_ELIGIBLE_ACTIONS.includes(actionVal);
const existingJoint = isJointEligible ? findExistingJoint(n) : null;
const isJoint = isJointEligible && (existingJoint != null || saved[`project_${n}_is_joint`] === 'yes');

let lockActionType = false;
if (existingJoint) {
  const activeInvs = _jointInvitations.filter(...);
  if (activeInvs.length > 0) lockActionType = true;
}
```

**13. Action-type select (~lines 3399–3413) — remove lockActionType:**
```javascript
// BEFORE:
const actionSelectAttrs = lockActionType ? ' disabled title="Cancel the joint first..."' : '';
h += `<select id="..." class="qf-select" data-project-action="${n}"${actionSelectAttrs}>`;
// ...
if (lockActionType) {
  h += `<p class="qf-desc dt-action-type-locked-help">...</p>`;
}

// AFTER:
h += `<select id="dt-project_${n}_action" class="qf-select" data-project-action="${n}">`;
// (remove lockActionType conditional and locked help text entirely)
```

**14. `if (isJointEligible)` block (~lines 3546–3584) — delete entirely:**
This removes the Solo/Joint ticker, `renderJointAuthoring`, the Support Assets ticker, and `renderJointSphereChips`:
```javascript
// DELETE the entire block:
if (isJointEligible) {
  // Solo/Joint ticker fieldset
  // ... renderJointAuthoring (if isJoint)
  // ... Support Assets ticker (if hasAssetMerits)
  // ... renderJointSphereChips
}
```

---

### Pass 3 — `downtime-data.js`

**Remove `JOINT_ELIGIBLE_ACTIONS` export (~lines 112–132):**
```javascript
// DELETE:
// JDT-2: action types eligible for the Solo/Joint toggle on a project slot.
// Must stay in sync with JOINT_ELIGIBLE_ACTIONS in server/routes/downtime.js.
export const JOINT_ELIGIBLE_ACTIONS = [
  'ambience_change',
  'attack',
  // ... etc
];
```

---

### What NOT to change

- `allCharacters` — still used for many other character-name lookups throughout the form
- `apiPost`, `apiGet`, `apiPatch` — used throughout
- `activeProjectTab` state variable — still drives the tab bar click handler (non-JDT)
- `project_${n}_personal_notes` collect on the support render path — becomes unreachable once the support slot render is removed (getElementById returns null, block skips harmlessly). Remove it anyway in Pass 2 step 3 for cleanliness.
- CSS classes `dt-joint-*`, `dt-pending-invitation-*` — dead CSS after this story; clean up in a future CSS pass

## Test Plan

3 Playwright E2E tests in `tests/dt-form-32-joint-authoring-remove.spec.js`:

1. **No Solo/Joint toggle visible** — open the DT form in ADVANCED, expand Projects section, assert no `[data-project-solo-joint]` radio exists and no `[data-proj-solo-joint-ticker]` fieldset exists.

2. **No Pending Invitations panel** — open the DT form in ADVANCED, expand Projects section, assert no `.dt-pending-invitations-panel` element exists.

3. **Legacy joint submission loads cleanly** — mock a saved submission with `project_1_is_joint: 'yes'`, `project_1_joint_description: 'test desc'`, `project_1_joint_invited_ids: '[]'`. Open the form, confirm no console errors, confirm the slot renders as a normal empty project slot (action select visible, no joint chrome).

Follow same test harness pattern as `tests/dt-form-30-equipment-hide.spec.js`: `setupSuite` → route mocks → `openDowntimeForm` → `switchToAdvanced` → `expandProjectsSection` helper.

## Definition of Done

- [x] All 20 JDT functions deleted from `downtime-form.js`
- [x] All inline JDT blocks removed (14 sites across Pass 2; plus 3 additional joint_sphere_chips cross-references in sphere/retainer/tick paths)
- [x] `JOINT_ELIGIBLE_ACTIONS` removed from `downtime-data.js`
- [x] No reference to `JOINT_ELIGIBLE_ACTIONS`, `_jointInvitations`, `JOINT_STATUS_LABELS`, `renderJointAuthoring`, etc. remains in either file
- [x] Form renders correctly for a normal character (MINIMAL and ADVANCED) — no JS errors
- [x] Legacy joint data in responses loads cleanly — no UI surface, no errors
- [x] 3 Playwright E2E tests added and passing
- [ ] PR opened into `dev`

## Dev Agent Record

**Agent:** Claude (Morningstar)
**Date:** 2026-05-07

### File List

**Modified**
- `public/js/tabs/downtime-form.js`
- `public/js/tabs/downtime-data.js`
- `specs/stories/dt-form.32-joint-authoring-remove.story.md`

**Added**
- `tests/dt-form-32-joint-authoring-remove.spec.js`

### Completion Notes

Removed all JDT joint-authoring code across three passes:

**Pass 1 (functions)**: Deleted 20 standalone JDT functions (formatTimestamp, findExistingJoint, renderJointAuthoring, renderDtJointPanel, getCharFreeSlotCount, renderJointInviteeChips, isSphereMeritUsed, renderJointSphereChips, renderJointReinvitePanel, renderJointCancelPanel, renderJointInviteeGrid, renderPendingInvitationsPanel, renderJointStatusBadges, handleInvitationAccept, handleInvitationDecline, handleInvitationDecouple, handleJointReinvite, handleJointCancel, handleJointDescriptionSave, handleJointDescriptionAcknowledge, refreshJointCaches, createPendingJoints).

**Pass 2 (inline blocks)**: Removed all 14 specified inline sites plus 3 additional joint_sphere_chips cross-references found during implementation — sphere slot locked-badge block, retainer slot locked-badge block, and retainer section tick secondary check.

**Pass 3 (data)**: Removed JOINT_ELIGIBLE_ACTIONS export from downtime-data.js.

Both files parse clean (node --input-type=module --check). 3 Playwright E2E tests pass: no Solo/Joint toggle, no Pending Invitations panel, legacy joint data loads without errors.

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-07 | Claude (Morningstar) | Story enriched from Draft to ready-for-dev. Full JDT surface survey completed: 20 functions, 14 inline sites, 1 data export. Precise removal map documented. Data-preservation invariant confirmed via _prior spread. |
| 2026-05-07 | Claude (Morningstar) | Implementation complete. All JDT code removed across 3 passes. 3 Playwright E2E tests passing. Status → review. |
