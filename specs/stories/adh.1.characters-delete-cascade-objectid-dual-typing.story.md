---
epic: ADH (Accessor Drift & Data Hygiene Remediation)
epic_file: specs/epic-adh-accessor-drift-hygiene.md
story: ADH.1
source: specs/data-hygiene-audit-2026-09-02.md — "The defensive-read half" section, "Real,
  unguarded risk found" subsection (characters.js) + Tier 4 "real, isolated data-quality issues"
  (characters.date_of_embrace)
priority: HIGHEST in this epic — destructive path, flagged in the epic's own priority note
---

# Story ADH.1: `characters.js` hard-delete cascade — dual-type `character_id` reads

## Status: Draft (scoping only — no code written)

## Story

**As** a Storyteller running a character hard-delete,
**I want** the delete cascade (and its preview) to find every affected row regardless of whether
`character_id` is stored as an `ObjectId` or a legacy string,
**so that** a hard delete never undercounts what it's about to destroy and never leaves orphaned
rows referencing a character `_id` that no longer exists.

## Background (source finding, verbatim citation)

`specs/data-hygiene-audit-2026-09-02.md`, "The defensive-read half" section:

> **`server/routes/characters.js` — the character hard-delete cascade and its preview do NOT
> dual-type `character_id`, unlike every read in `downtime.js`:**
> - `GET /:id/cascade-preview` (line 766): `getCollection('downtime_submissions').countDocuments({ character_id: oid })` — ObjectId only.
> - `DELETE /:id` (lines 1021-1028): `deleteMany({ character_id: oid })` against
>   `downtime_submissions`, `ordeal_submissions`, `histories`, `questionnaire_responses`,
>   `tracker_state`, plus `$pull` on `game_sessions.attendance`/`players.character_ids`/
>   `npcs.linked_character_ids` — all ObjectId-only, no `$in: [oid, String(oid)]` fallback.

Confirmed live at `server/routes/characters.js:761-774` (`cascade-preview`) this scoping pass —
current code matches the audit's citation exactly (three `countDocuments`/`$in` calls, all
`{ character_id: oid }` or `{ 'attendance.character_id': oid }`/`{ character_ids: oid }`, no
string fallback anywhere in the handler).

**Currently dormant, not inert.** The audit's own live Mongo run found zero string-typed
`character_id` values anywhere in `tm_game` today, so no submission is being missed right now. But
it is structurally unguarded: the audit explicitly names this "the exact mechanism June's #558
already produced once" and "the exact mechanism June explicitly warned territory keys would
regrow through via CSV import." A hard delete is worse than a silent read-miss because it is
**irreversible** — the audit's own words: "this bug produces permanent orphaned data plus an ST
who was told it was safe to delete."

**The established pattern to copy** (already live, already proven) — `server/routes/downtime.js`:
- `$in: [...charIdOids, ...charIdStrs]` (lines 259-263, 308-314), comment: *"Accept both ObjectId
  and legacy string-stored character_ids (CSV imports may store as string)"*.
- `submission.character_id instanceof ObjectId ? submission.character_id : parseId(String(...))`
  (lines 473-475, 977-979).
- `.toString()` equality normalisation for ownership checks (lines 357-358, 614-615, 664-665, 1047).
- `server/schemas/downtime_submission.schema.js` (~line 191): canonical storage is ObjectId; the
  route layer coerces string → ObjectId before write; schema accepts `['string', 'null']` for the
  wire shape.

## Acceptance Criteria

1. `GET /api/characters/:id/cascade-preview` (`server/routes/characters.js:761-774`) counts
   `downtime_submissions`, `game_sessions` (attendance), and `players` (character_ids) using a
   dual-typed match — both the `ObjectId` and its `String(...)` equivalent — for `character_id`,
   matching the `$in: [oid, String(oid)]` pattern already established in `downtime.js`.
2. `DELETE /api/characters/:id` (`server/routes/characters.js:1021-1028` and its `$pull`
   operations) applies the same dual-typed match to every one of the five collections/fields the
   audit names: `downtime_submissions`, `ordeal_submissions`, `histories`,
   `questionnaire_responses`, `tracker_state` (all `deleteMany`), plus `$pull` on
   `game_sessions.attendance`, `players.character_ids`, `npcs.linked_character_ids`.
3. The preview count and the delete cascade's actual deleted/pulled counts stay in agreement — a
   dry-run preview should never undercount relative to what the delete actually removes, on either
   ObjectId-typed or string-typed data.
4. **Regression test added** (this repo's test convention — see `server/tests/api-territory-dual-read.test.js`
   from tech-debt.496.1 as a model): seed a character with at least one row in each of the five
   deleteMany collections and one reference in each of the three $pull targets, using a
   **string-typed** `character_id` in at least one seeded row (simulating regrowth), and confirm
   both the cascade-preview count and the actual delete correctly find and remove it. A second test
   confirms ObjectId-typed data (today's real shape) is unaffected — no regression on the common
   case.
5. **No live-data migration needed and none performed.** The audit confirms zero string-typed
   `character_id` values exist in `tm_game` today; this story is a defensive-code fix only, not a
   data cleanup. Do not write a migration script as part of this story.
6. **Bonus, cheap, same-severity-tier fix — data-hygiene audit Tier 4:** `characters.date_of_embrace`
   has one document with a plainly mistyped value `"12019-03-10"` (5-digit year; almost certainly
   `1201x` or `2019-03-10`). Identify that document by direct query, confirm with Angelus which
   correction is right (do not guess between the two candidates — the audit explicitly declined to
   pick), and apply the one-document data fix. This is a live-data write, gated on Angelus's
   confirmation of the correct value — do not silently pick one.

## Tasks / Subtasks

- [ ] Read `server/routes/characters.js` in full around the cascade-preview handler (`:761-774`)
      and the delete handler (`~:1000-1050`, confirm exact current line numbers before editing —
      the audit's own citation is `:1021-1028` as of this pass).
- [ ] Read `server/routes/downtime.js:259-263, 308-314, 473-475, 977-979` to copy the established
      dual-type pattern exactly (same helper/style, don't reinvent).
- [ ] Apply the dual-typed match to `cascade-preview`'s three counts (AC1).
- [ ] Apply the dual-typed match to `DELETE /:id`'s five `deleteMany` calls and three `$pull`
      operations (AC2).
- [ ] Add the regression test(s) per AC4, modelled on `server/tests/api-territory-dual-read.test.js`.
      Run against `tm_game_test` per this repo's existing test-DB isolation convention — never live
      `tm_game`.
- [ ] Run only the touched spec file(s) plus an adjacent regression sweep (characters/cascade/
      delete-related test files) — not the full suite, per this repo's stated convention.
- [ ] Separately: query live `tm_game.characters` for the `date_of_embrace` document matching
      `"12019-03-10"`, present both correction candidates to Angelus, apply the confirmed value
      (AC6). This is a live write — confirm before executing, and record the exact before/after
      value in this story's Dev Agent Record when done.

## Dev Notes

### Key files
- `server/routes/characters.js` — `cascade-preview` (`:761-774`), `DELETE /:id` (`~:1000-1050`,
  re-confirm line numbers live before editing).
- `server/routes/downtime.js` — the pattern to copy (`:259-263`, `:308-314`, `:473-475`, `:977-979`,
  `:357-358`, `:614-615`, `:664-665`, `:1047`).
- `server/routes/territories.js` — `PATCH /:id/lieutenant`'s `new ObjectId(...)` validation is the
  write-side analogue (different bug shape — validates on write rather than dual-reads — cited by
  the audit as the reason Tier 1.2's territory finding is now fixed).

### Explicitly out of scope
- The `npc-flags.js`/`npcs.js`/`players.js` string-only `character_id` convention for embedded
  sub-documents — audit calls this "lower-priority, worth a light mention," internally consistent,
  not a dual-typing bug. Do not touch.
- `st_mods.js`'s plain-string `character_id` convention — same, not a bug, don't touch.
- The two archived import scripts (`server/scripts/archive/import-questionnaire.js`,
  `import-history.js`) — audit notes these are a latent risk only if re-run directly against
  production, not an active path. Not in scope.
- Tier 2 (territory key residual, #496) and Tier 3 (FK/reference-value fragmentation) findings from
  the same audit doc — see the epic file's "Explicitly not in this epic" section. Not this story.

### Why this is ADH.1, not numbered by drift-map severity
This finding comes from the companion data-hygiene audit, not the drift-map audit the other five
ADH stories are sourced from. It is sequenced first in this epic specifically because it sits on a
**destructive** path — see the epic file's priority note.

### References
- `specs/data-hygiene-audit-2026-09-02.md` — "The defensive-read half" section in full (the
  established good pattern, the real unguarded risk, the lower-priority mentions).
- Issue #496/#497/#558 — the prior FK dual-typing bug class this pattern already fixed once
  elsewhere in the codebase.
- `specs/stories/tech-debt.496.1.server-territory-dual-read.story.md` — the model story for this
  exact bug class (server dual-read tolerance), useful as a structural template for tasks/tests.
