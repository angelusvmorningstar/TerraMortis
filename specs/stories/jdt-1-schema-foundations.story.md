---
id: jdt.1
epic: jdt
status: ready-for-dev
priority: medium
depends_on: []
---

# Story JDT-1: Joint Downtimes — schema foundations (no-op data shape)

As a future story in the Joint Downtimes epic that needs structured persistence,
I should have the new `joint_projects` array on the downtime cycle, a new `project_invitations` collection, and small schema additions to `downtime_submission.projects_resolved[N]` to support the support-slot role,
So that JDT-2 through JDT-6 can write and read these shapes without each one duplicating the schema work, and so the schema additions ship in isolation first to verify they do not break existing publish / DT Story / DT Processing flows.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 5 (Joint Downtimes), foundations story. Joint Downtimes is the largest schema delta in the project. Memory locks the staging strategy:

> **JDT5.1** — Schema foundations. New `joint_projects` array on `downtime_cycle`. New `project_invitations` collection, lifecycle states `pending | accepted | declined | decoupled | cancelled-by-lead`. Schema additions to `downtime_submission` for support slots: `projects_resolved[N].joint_id`, `projects_resolved[N].joint_role`. Ships first as no-op data shape; verifies nothing existing breaks.

JDT-1 is **schema only**. No UI, no API endpoints, no save/read logic. The deliverable is:
1. Updated JSON Schema for `downtime_cycle` with `joint_projects` field.
2. Updated JSON Schema for `downtime_submission` with `projects_resolved[N].joint_id` and `joint_role` properties.
3. New `project_invitations` collection (Mongo collection name: `project_invitations`), with a JSON Schema file in `server/schemas/`.
4. (Optional) Brief integration smoke test confirming existing read/write flows still pass.

The intent is to land the data plumbing first so JDT-2 (lead invitation flow) has somewhere to write to immediately, and so any breakage from the schema additions surfaces in isolation.

### Lifecycle states for invitations

Locked enum:
```
pending | accepted | declined | decoupled | cancelled-by-lead
```

These are the five states an invitation can be in. JDT-2 through JDT-6 implement the transitions; JDT-1 just declares the shape.

### `joint_projects` shape on cycle

Per memory and resolved product calls (Calls A, B, C):

```js
cycle.joint_projects = [
  {
    _id: 'string',
    lead_character_id: 'string',
    lead_submission_id: 'string',
    lead_project_slot: 1,                   // 1-4, the slot on the lead's submission
    description: 'string',
    action_type: 'string',                  // one of joint-eligible action types
    target_type: 'string',                  // 'character' | 'territory' | 'other' | null
    target_value: 'string',                 // depends on target_type
    description_updated_at: 'string',       // ISO; bumped on lead edit (Call B)
    st_joint_outcome: 'string',             // ST-authored joint narrative
    participants: [
      {
        invitation_id: 'string',
        character_id: 'string',
        submission_id: 'string',
        project_slot: 'integer | null',     // assigned on accept; null while pending/declined
        joined_at: 'string',                // ISO; set on accept
        decoupled_at: 'string | null',
        description_change_acknowledged_at: 'string | null',
      },
    ],
    created_at: 'string',
    cancelled_at: 'string | null',
    cancelled_reason: 'string | null',      // 'lead-cancelled' or 'st-override'
  },
];
```

### `project_invitations` collection

```js
{
  _id: 'string',
  joint_project_id: 'string',
  cycle_id: 'string',
  invited_character_id: 'string',
  invited_submission_id: 'string | null',   // null until invitee opens form
  status: 'pending' | 'accepted' | 'declined' | 'decoupled' | 'cancelled-by-lead',
  created_at: 'string',
  responded_at: 'string | null',
  decoupled_at: 'string | null',
  cancelled_at: 'string | null',
}
```

A separate collection (rather than embedded on the cycle) is chosen because invitations are queried per-character in JDT-3's invitee acceptance flow ("show me all my pending invitations"), and a flat collection makes that query cheap.

### `projects_resolved[N]` schema additions

```js
projects_resolved[N] = {
  // ...existing fields (pool, roll, etc.)...
  joint_id:   'string | null',     // set when this slot is a support slot for a joint
  joint_role: 'lead' | 'support' | null,   // 'lead' on the joint's lead slot; 'support' on participant slots
}
```

Both fields are optional; existing submissions with no joint involvement leave them absent (or null).

### Files in scope

- `server/schemas/downtime_submission.schema.js` — extend `resolvedAction` definition with `joint_id` and `joint_role` properties.
- `server/schemas/downtime_submission.schema.js` — extend `downtimeCycleSchema` with `joint_projects` array.
- `server/schemas/project_invitation.schema.js` (new file) — the invitation shape above.
- `server/index.js` (or wherever schemas register) — register the new schema if the project uses an explicit registry.
- `server/routes/` — no new routes (handled by JDT-2+).

### Out of scope

- Any UI for invitations, joints, or support slots (JDT-2 onwards).
- Any save/read business logic for joint projects or invitations.
- Indexes on the new collection (verify if MongoDB collection bootstraps need indexes; if so, add a basic index on `invited_character_id + status` for the query pattern in JDT-3).
- Migration of historical data. Joints didn't exist before this epic; nothing to migrate.
- Validation that `joint_id` references a real joint document. JSON Schema doesn't enforce referential integrity; runtime checks happen in JDT-2+.
- Lifecycle transition rules (e.g. "cannot transition `accepted` to `pending`"). JDT-2+ enforces transitions in business logic.
- Server tests of the new shapes' insert/update behaviour. JDT-1 is a schema-only landing; broader behaviour tests come with JDT-2+.

---

## Acceptance Criteria

### Cycle schema

**Given** the `downtimeCycleSchema` post-JDT-1
**Then** it has a new optional `joint_projects` property:
```js
joint_projects: {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      _id:                       { type: 'string' },
      lead_character_id:         { type: 'string' },
      lead_submission_id:        { type: 'string' },
      lead_project_slot:         { type: 'integer', minimum: 1, maximum: 4 },
      description:               { type: 'string' },
      action_type:               { type: 'string' },
      target_type:               { type: ['string', 'null'] },
      target_value:              { type: ['string', 'null'] },
      description_updated_at:    { type: ['string', 'null'] },
      st_joint_outcome:          { type: 'string' },
      participants: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            invitation_id:                              { type: 'string' },
            character_id:                               { type: 'string' },
            submission_id:                              { type: ['string', 'null'] },
            project_slot:                               { type: ['integer', 'null'], minimum: 1, maximum: 4 },
            joined_at:                                  { type: ['string', 'null'] },
            decoupled_at:                               { type: ['string', 'null'] },
            description_change_acknowledged_at:         { type: ['string', 'null'] },
          },
          additionalProperties: true,
        },
      },
      created_at:                { type: 'string' },
      cancelled_at:              { type: ['string', 'null'] },
      cancelled_reason:          { type: ['string', 'null'] },
    },
    additionalProperties: true,
  },
},
```

**Given** the field is optional
**Then** existing cycle documents (without `joint_projects`) still validate post-JDT-1.

### Submission schema

**Given** the `resolvedAction` definition post-JDT-1
**Then** it includes two new optional properties:
```js
joint_id:   { type: ['string', 'null'] },
joint_role: { type: ['string', 'null'], enum: ['lead', 'support', null] },
```

**Given** existing submissions (without these properties on `projects_resolved[N]`)
**Then** they still validate post-JDT-1.

### Invitation schema

**Given** a new file `server/schemas/project_invitation.schema.js`
**Then** it exports `projectInvitationSchema` matching the shape in the Context section.
**And** the `status` field's enum is `['pending', 'accepted', 'declined', 'decoupled', 'cancelled-by-lead']`.
**And** `_id`, `joint_project_id`, `cycle_id`, `invited_character_id`, `status`, `created_at` are required (in `required` array).
**And** the other fields are optional / nullable.

### Schema registration

**Given** the project uses an explicit schema registry (verify)
**Then** the new `projectInvitationSchema` is registered alongside other schemas (likely in `server/index.js` or a schemas index).

**Given** the project does NOT use an explicit registry (schemas validated at write-time per-route)
**Then** no registration step is required; the schema file simply exists and is imported by JDT-2+ routes.

### MongoDB collection bootstrap

**Given** the codebase has a pattern for bootstrapping new collections (see `server/scripts/`)
**Then** a small bootstrap script for the `project_invitations` collection is added with:
- A basic index on `{ invited_character_id: 1, status: 1 }` for the JDT-3 query pattern.
- A basic index on `{ joint_project_id: 1 }` for the JDT-2 fan-out queries.

**Given** no bootstrap pattern exists
**Then** the indexes can be deferred until JDT-2 / JDT-3 implementation; add a comment in the schema file noting the recommended indexes.

### No-op verification

**Given** the schema additions are in place
**When** an existing cycle, submission, or invitation-collection-less code path runs
**Then** **no behaviour changes** — all existing publish, DT Processing, DT Story, and player-form flows continue to operate identically.

**Given** a cycle is saved without `joint_projects`
**Then** the save succeeds.

**Given** a submission is saved without `joint_id` or `joint_role` on any of its `projects_resolved[N]` entries
**Then** the save succeeds.

### Optional smoke test

**Given** an integration test in `server/tests/`
**Then** add (or extend) a test confirming:
- A standard cycle save/load round-trip still works.
- A standard submission save/load with `projects_resolved` entries still works.

If no such tests exist or if extending them is non-trivial, manual smoke verification in the dev environment is acceptable for this story. Schema additions of this kind rarely break round-trips when `additionalProperties: true` is the established pattern.

---

## Implementation Notes

### Adding to existing schema file

Open `server/schemas/downtime_submission.schema.js`. The file currently houses both the submission schema and the cycle schema (cycle starts around line 412). Add:

1. The two new properties to `resolvedAction` (after `player_facing_note` around line 403):
   ```js
   joint_id:   { type: ['string', 'null'] },
   joint_role: { type: ['string', 'null'], enum: ['lead', 'support', null] },
   ```
2. The `joint_projects` block to `downtimeCycleSchema.properties` (after `regent_confirmations`).

### New file

Create `server/schemas/project_invitation.schema.js`:

```js
/**
 * JSON Schema (Draft-07) for Project Invitation.
 * Collection: project_invitations
 *
 * One document per invitation extended by the lead of a joint project.
 * Lifecycle: pending → (accepted | declined | decoupled | cancelled-by-lead).
 *
 * See specs/stories/jdt-1-schema-foundations.story.md and Epic JDT.
 */

export const projectInvitationSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Project Invitation',
  type: 'object',
  required: ['_id', 'joint_project_id', 'cycle_id', 'invited_character_id', 'status', 'created_at'],
  additionalProperties: true,

  properties: {
    _id:                   { type: 'string' },
    joint_project_id:      { type: 'string' },
    cycle_id:              { type: 'string' },
    invited_character_id:  { type: 'string' },
    invited_submission_id: { type: ['string', 'null'] },
    status: {
      type: 'string',
      enum: ['pending', 'accepted', 'declined', 'decoupled', 'cancelled-by-lead'],
    },
    created_at:    { type: 'string' },
    responded_at:  { type: ['string', 'null'] },
    decoupled_at:  { type: ['string', 'null'] },
    cancelled_at:  { type: ['string', 'null'] },
  },
};
```

### Index recommendations (for JDT-2/JDT-3)

The natural query patterns:

- JDT-3 (invitee acceptance): `find({ invited_character_id: charId, status: 'pending' })` → recommend index `{ invited_character_id: 1, status: 1 }`.
- JDT-2 / JDT-6 (lead view, cancellation): `find({ joint_project_id: jointId })` → recommend index `{ joint_project_id: 1 }`.

If the codebase has an `ensureIndex` bootstrap (search `server/` for `createIndex`), add the indexes there. Otherwise, add a comment block at the top of the schema file noting the recommended indexes for JDT-2 to wire up.

### Schema registry

If the project registers all schemas in a central `schemas.js` or via per-route `validateAgainst(schema, body)`, make sure the new `projectInvitationSchema` is wired in (or available to import). Verify the existing pattern at implementation.

### No client-side changes

JDT-1 is server-side schema only. Client code reads no joint data and writes no joint data until JDT-2 onwards.

### Verification

After landing the schema changes, manually exercise:
- Open the admin app, save a cycle (e.g. update its deadline) — must still work.
- Save a submission — must still work.
- Run `server/tests/` — all existing tests pass.

If any test fails, the schema addition has an unintended `required` constraint or a typo; revert the addition for that field and inspect.

---

## Files Expected to Change

- `server/schemas/downtime_submission.schema.js` — `resolvedAction` extended with `joint_id` and `joint_role`; `downtimeCycleSchema` extended with `joint_projects` array.
- `server/schemas/project_invitation.schema.js` — **new file**, exports `projectInvitationSchema`.
- (Optional) `server/index.js` or schema registry file — register the new schema.
- (Optional) `server/scripts/<bootstrap-script>.js` — add index creation for the new collection.

No client-side files touched.

---

## Definition of Done

- All AC verified.
- Schema files saved and importable.
- Manual smoke test: existing cycle and submission saves still succeed.
- Existing tests in `server/tests/` still pass.
- No new behaviour visible to STs or players (this is invisible plumbing).
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `jdt-1-schema-foundations: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies. Ships first in Epic JDT.
- **Blocks every other JDT story.** JDT-2 through JDT-6 all read or write fields defined here.
- Independent of every NPCP / CHM / DTSR / DTFP / DTIL story.
