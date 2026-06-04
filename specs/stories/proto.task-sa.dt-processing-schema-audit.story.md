# Task proto.TASK-SA: DT Processing — Snapshot Schema Audit

Status: review

## Task

As the dev team,
we need to audit the existing `st_review` and `st_narrative` MongoDB fields
before writing any new Snapshot data,
so that proto.7 onward does not duplicate or conflict with established field shapes.

This is a prerequisite gate — not a shippable feature. Output is a field map document.

## Acceptance Criteria

1. Every field present on `st_review` objects in the live MongoDB data is enumerated.
2. Every field present on `st_narrative` objects (where they exist on submission documents) is enumerated.
3. Each design decision (D1, D7, D9, D10, D13) is mapped to an existing field or flagged as a gap requiring a new field.
4. `blocking` action types are confirmed as structured/queryable (or flagged if they are not).
5. `obfuscate` discipline-selection data is confirmed as structured and co-located with territory (or flagged).
6. `outcome` field shape is confirmed — single string, or does paragraph mode require a separate flag/field.
7. Output field map is written to `specs/architecture/proto-snapshot-field-map.md`.
8. sprint-status entry `proto-task-sa-schema-audit` is updated to `review`.

## Tasks / Subtasks

- [x] Enumerate `st_review` and `st_narrative` fields from live MongoDB (AC: 1, 2)
  - [x] Connect to MongoDB `tm_suite` via MCP
  - [x] Sample 10 submission documents from `downtime_submissions` that have a non-empty `st_review` object
  - [x] Collect all unique top-level and nested keys from those `st_review` objects
  - [x] Do the same for `st_narrative` if it appears as a field on submissions or in a separate collection

- [x] Map design decisions to field shape (AC: 3, 4, 5, 6)
  - [x] D1 (live re-derive on st_review save): confirm what field on `st_review` acts as the save trigger hook
  - [x] D7 (MongoDB-always): confirm reviews are persisted; identify any field that is currently written only to localStorage or ephemeral state
  - [x] D9 (blocking is queryable): find the field on `st_review` that stores blocking action type/status; confirm it is a structured value not free text
  - [x] D10 (obfuscate queryable by territory + discipline): find the field that stores obfuscate discipline selection; confirm territory is co-stored or otherwise derivable
  - [x] D13 (outcome + notes + dice all separate fields): confirm each of `notes`, `dice_result`/`roll`, and `outcome` are distinct keys on `st_review`; confirm whether `outcome` is a simple string or needs a paragraph-mode flag

- [x] Write field map document (AC: 7)
  - [x] Create `specs/architecture/proto-snapshot-field-map.md`
  - [x] Document: every enumerated field, its type, existing/new, and which decision(s) it satisfies
  - [x] Flag any gaps where a new field will be needed for proto.7+
  - [x] Include a go/no-go recommendation for proceeding to proto.7

- [x] Update sprint-status (AC: 8)
  - [x] Set `proto-task-sa-schema-audit` to `review` in `specs/stories/sprint-status.yaml`

## Dev Notes

### Design decisions being mapped

| # | Decision | What to confirm |
|---|---|---|
| D1 | Snapshot re-derives on every `st_review` save | Is there a timestamp or version field on `st_review` that a Snapshot hook can key off? |
| D7 | MongoDB always; schema review is prerequisite | Is any current review data written only to localStorage or ephemeral JS state? |
| D9 | Blocking is a structured, queryable action type | Is `blocking` a typed field on `st_review` or just a string label in `actionType`? |
| D10 | Obfuscate queryable by territory + discipline | What field stores the obfuscate discipline selection? Is territory co-stored? |
| D13 | Notes, Dice Result, and Outcome are separate fields; Outcome allows paragraph | Are these three keys distinct on `st_review`? Is there a flag for paragraph-mode outcome? |

### Key MongoDB collection

- `downtime_submissions` — each document has a `st_review` sub-object (keyed by phase+actionIdx or flat) and possibly `st_narrative`
- Look for documents from DT cycle 2 or 3 where real ST processing was done (these will have the most populated review fields)

### No code to write

This task produces a document, not code. The red-green-refactor cycle does not apply. Treat "tests pass" as "field map document exists and covers all ACs."

### Output document location

`specs/architecture/proto-snapshot-field-map.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- **Storage architecture**: No separate `st_review` collection. All review data lives as sub-objects on `downtime_submissions`: `st_review` (submission-level), `st_narrative` (narrative content), `feeding_review`, `projects_resolved[]`, `merit_actions_resolved[]`, `sorcery_review{}`, `st_actions_resolved[]`, `acquisitions_resolved[]`.
- **D1 (re-derive trigger)**: Minor gap. No `st_review_updated_at` field exists. Server-side submission `updatedAt` is the recommended hook for proto.16; adding `st_review_touched_at` is the fallback if needed.
- **D7 (MongoDB-always)**: Confirmed. All `saveEntryReview` calls write through `updateSubmission()` → `PATCH /api/...`. No localStorage write paths for review data.
- **D9 (blocking is queryable)**: Confirmed. `block` is a first-class enum string in `PHASE_MAP` and `action_type_override`. Not free text.
- **D10 (obfuscate queryable)**: Gap identified. Discipline selection goes into `pool_validated` as text expression only — no separate structured field. New `hide_protect_disc: string` field required for proto.10.
- **D13 (notes/dice/outcome separate)**: Confirmed. All three exist per source type. Paragraph-mode `outcome` uses `outcome_summary` string field on merit actions — no separate flag needed.
- **Go/No-Go**: GO for proto.7. All cross-reference data for proto.7–proto.13 derives from queue entries already in memory (no new MongoDB writes needed for those stories). Two gaps identified are scoped to later stories (proto.10 and proto.16).
- **`roll_mode` field**: Introduced in proto.4 (prototype branch only). Not yet present in live MongoDB documents — confirm before merging proto branch to dev.

### File List

- `specs/stories/proto.task-sa.dt-processing-schema-audit.story.md` (this file)
- `specs/architecture/proto-snapshot-field-map.md` (created)
- `specs/stories/sprint-status.yaml` (status update)
