---
id: oaq.1
epic: oaq
epic_file: specs/epic-oaq-office-approval-queue.md
status: done
priority: medium
type: investigation-spike
depends_on: []
branch: ms/oaq-1-data-lock-contested-roll-shape
---

# Story OAQ.1: Data-lock — `contested_roll_requests` shape vs Status Action needs (Investigation Spike)

As a developer about to build oaq.2 (pending Status Actions — submit, ST accept/decline),
I want the real shape of `contested_roll_requests` verified against source, and the open design
questions for extending it resolved with evidence rather than guessed,
so that oaq.2 doesn't write code against an assumed collection shape that turns out to be wrong.

---

## Status: investigation-spike

This is **deliberately not a code-change story**. Per `epic-oaq-office-approval-queue.md`'s own
framing for oaq.1 ("Dana's data-steward pass"), this story exists to:

1. Confirm the real, current shape of `contested_roll_requests` — is pending-vs-resolved an
   explicit status field, or inferred from whether a resolution field is present?
2. Resolve whether a single-party action (Status Actions has no "opposing roll", unlike a
   contested roll) needs a discriminator field plus a type-specific payload sub-document before
   the collection is extended to also carry pending Status Actions.
3. Record the answer, with cited evidence, in `D:\Terra Mortis\data-map.md` (the ecosystem's
   living data map) so oaq.2 reads a settled decision, not a re-derivation.

The `bmad-data-lock` workflow was run in full for this story during the same session that created
it (2026-08-12) — see "Findings" below for the complete, cited result. This story's own file is
the committed record of that pass; **no further data-lock work is needed before oaq.2 starts**,
unless oaq.2's own scoping surfaces a question this pass didn't anticipate.

---

## Findings (from the `bmad-data-lock` pass, 2026-08-12)

### 1. `contested_roll_requests.status` is an explicit enum, not inferred — CONFIRMED

Real shape, verified directly from source (not a schema file, since the write schema deliberately
excludes it — see finding 2):

- `status` is a plain string field: `'pending' | 'resolved' | 'declined' | 'voided'`, set
  server-side on every write.
- `outcome` is `null` until `status` flips to `'resolved'`, at which point it becomes
  `{ attacker: {name, pool, successes, rolls}, defender: {...}, outcome: 'attacker'|'defender'|'draw', margin }`.
- Every gate in the route checks `status`, never infers pending-ness from `outcome`'s presence:
  `_findChallenge` (the shared lookup every mutating route calls) rejects with 409 unless
  `doc.status === 'pending'`.

**Source**: `server/routes/contested-rolls.js` — `POST /` sets `status:'pending', outcome:null`
(:24-25); `PUT /:id/accept` sets `status:'resolved'` plus the outcome shape (:76-79);
`PUT /:id/decline` sets `status:'declined'` (:112); `PUT /:id/void` (ST-only) sets
`status:'voided'` (:127); `_findChallenge`'s pending gate (:144).

This directly answers the epic's own oaq.1 question 1: **status enum, not inferred.**

### 2. The write schema cannot accept a Status Action as-is — a real schema change is needed

`server/schemas/contested_roll_request.schema.js` is `additionalProperties: false` with
`challenger_character_id`, `challenger_character_name`, `target_character_id`,
`target_character_name`, `roll_type`, `challenger_pool`, `defender_pool` all **required**. A
Status Action document (actor/target ids, an `action_type` of `raise`/`lower`/`grant_first`/
`strip_last`, no dice pools at all) cannot pass this schema. Extending the collection to also
carry Status Actions means changing this schema, not just adding a new consumer of the existing
one.

### 3. House precedent for the discriminator question already exists in this repo

The epic's own oaq.1 question 2 — does a single-party action need a discriminator field plus a
type-specific payload sub-document — is already answered by an existing, proven pattern in this
same codebase: `relationships.kind`.

- `relationships.kind` is a required string enum (`KIND_ENUM`, 19 values,
  `server/schemas/relationship.schema.js:20`) that determines which optional sub-fields are
  meaningful for a given row. `kind === 'touchstone'` requires `touchstone_meta.humanity` (1–10)
  and a one-PC-one-NPC endpoint pair — but the JSON Schema itself allows `touchstone_meta`
  unconditionally for any `kind`; the kind-specific requirement is enforced in the **route
  handler** (`server/routes/relationships.js:507` validates `kind` against `KIND_ENUM`; the
  touchstone-specific cross-field rule is enforced elsewhere in the same file, not via a JSON
  Schema conditional).
- `relationships.status` carries its own independent pending lifecycle
  (`'active'|'retired'|'pending_confirmation'|'rejected'`), structurally parallel to
  `contested_roll_requests.status` above — `relationships.js:287-323` ("status=
  'pending_confirmation'; any other state is a 403 or 409").

**This is the pattern oaq.2 should reuse, not re-derive**: one collection, one discriminator enum,
type-specific optional sub-fields, cross-field rules enforced at the route layer.

### 4. `office_actions` today has no pending lifecycle at all

Current shape (`server/routes/office-actions.js`, as of commit `94beca64` — the issue-1143
atomicity redesign): `{ game_session_id, actor_id, actor_name, target_id, target_name,
action_type, old_status, new_status, timestamp }`. Every write is immediate and final — no
`status` field, no accept/decline/void lifecycle. The transaction issue-1143 introduced protects
against concurrent-request races; it has nothing to do with deferring an action pending ST review.
This is precisely the gap Epic OAQ exists to close.

### 5. Zero cross-repo dependency on `contested_roll_requests`'s shape

Checked TM Wiki and TM Cockpit (both siblings in the umbrella workspace) for any code-level or
schema-level reference to `contested_roll_requests` or `/api/contested_roll_requests`:

- **TM Wiki**: zero references anywhere.
- **TM Cockpit**: one prose-only mention, in `.claude/skills/tm-dt-resolve-sorcery/SKILL.md`'s
  "Boundaries" section, telling an agent to cross-check player claims against the collection — no
  field-level coupling to any specific status value or the outcome sub-document shape.

**This collection is safe to reshape without a cross-repo migration concern.**

### 6. Recommendation for oaq.2 (a proposal, not yet a locked decision — oaq.2 should confirm or override it explicitly, not silently inherit it)

Reuse `contested_roll_requests` rather than create a new collection, adding a `request_type`
discriminator (`'contested_roll' | 'status_action'`), defaulting existing documents to
`'contested_roll'` so no backfill migration is forced (every existing document predates the new
field; a JSON Schema without `required: ['request_type']`, or an application-layer default at read
time, avoids needing to touch live data). Mirrors `relationships.kind`'s proven shape. oaq.2's own
data-lock/scoping pass should treat this as the starting proposal to validate against its actual
implementation needs (e.g. does a Status Action's pending record need `old_status`/`new_status`
snapshotted at submission time, or recomputed at approval time — a genuine oaq.2-level question
this story does not attempt to answer).

---

## What this story is NOT

- NOT a schema change. No code is written by this story — the schema/route changes needed to
  actually carry Status Actions belong to oaq.2.
- NOT a decision on whether submitting a Status Action spends the actor's session budget
  immediately (refund on decline?) or only on approval — the epic's own oaq.2 notes already flag
  this as oaq.2's own decision to make at build time, not this story's.
- NOT a UI story — oaq.3 (the ST approval queue tab) is separate and depends on oaq.2's schema
  landing first.

## Acceptance Criteria

1. `data-map.md` carries a cited, source-verified entry for `contested_roll_requests.status` /
   `.outcome`, confirming the enum shape (not an inference from `outcome`'s presence).
2. `data-map.md` carries a cited entry establishing the discriminator+payload precedent
   (`relationships.kind`/`.status`) as the pattern to reuse.
3. `data-map.md` carries a cited entry for `office_actions`'s current (no-pending-lifecycle)
   shape, naming the gap Epic OAQ closes.
4. Cross-repo consumer check completed and recorded (TM Wiki, TM Cockpit) — no silent assumption
   about safety to reshape.
5. This story file itself is the committed, readable record oaq.2 references — not a re-derivation
   required at oaq.2's own start.

All five are satisfied as of this story's own creation — see "Findings" above and the
`data-map.md` entries it cites (three new entries immediately above the `## TM Wiki` section
header, added 2026-08-12).

## Dev Notes

No implementation work remains for this story. If picked up as "ready-for-dev" by a future
session expecting code to write, that session should re-read this file's Findings section first —
there is nothing to implement here, only to verify the findings are still current (schema/route
files unchanged since this story's citations) before treating them as still valid.

### Files referenced (read, not modified, by this story)

- `server/routes/contested-rolls.js`
- `server/schemas/contested_roll_request.schema.js`
- `server/schemas/relationship.schema.js`
- `server/routes/relationships.js`
- `server/routes/office-actions.js`
- `D:\Terra Mortis\data-map.md` (the ecosystem-level living data map — outside this repo, umbrella
  workspace root)

## Project Context Reference

`specs/project-context.md`, `CLAUDE.md` HARD RULE: never push/merge without explicit instruction
this session.

## Dev Agent Record

Data-lock pass completed 2026-08-12 in the same session that created this story file (see
"Findings" above for the full cited record). No code changes. `data-map.md` updated with three new
entries. Status set to `ready-for-dev` reflecting "ready for oaq.2 to build against", not "code
remains to be written here."

## Senior Developer Review

_(not applicable — investigation spike, no code diff to review. If the findings above are
challenged or found stale in a future session, record that here rather than silently
re-deriving.)_
