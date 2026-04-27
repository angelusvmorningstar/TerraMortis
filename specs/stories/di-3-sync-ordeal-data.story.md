---
id: di.3
epic: di
status: ready-for-dev
priority: low
type: investigation-spike
depends_on: []
---

# Story DI-3: Audit Ordeal Data Parity (Investigation Spike)

As a Storyteller maintaining player XP integrity,
I want to confirm that every completed ordeal in any historical record is reflected in the live database,
So that no player's XP is silently understating their actual completed ordeals.

---

## Status: investigation-spike

This is **deliberately not a code-change story**. Per `memory/project_dt_overhaul_2026-04-27.md` and the original DI epic dev note ("DI-3 may be investigation-only"), this story exists to:

1. Verify nothing is missing.
2. If anything is missing, surface it precisely enough that a follow-up migration story can be written and scoped.
3. If nothing is missing, close DI-3 as `done` with the audit report attached as evidence.

The story does not authorise writing a migration script. If the audit finds a gap, the dev pauses, presents findings, and waits for the user to scope a follow-up DI-4 (or similar).

---

## Context

### What the original epic note said

From `specs/epic-data-imports.md` line 88-94:

> **As a** player viewing the Ordeals tab,
> **I want** my ordeal completion data to be current and correct,
> **so that** my XP reflects all completed ordeals.
>
> ### Dev Notes
> - Investigate: run a comparison query between tm_suite and tm_suite ordeal records
> - May be a simple data copy / migration script rather than a code change
> - Confirm which database is active in production (likely `tm_suite` — verify)

The "tm_suite to tm_suite" wording is a typo in the epic file — it almost certainly meant "between [some legacy source] and tm_suite". The dev should clarify with the user what comparison source was originally in mind. Likely candidates:

- An older MongoDB database (e.g. `tm_suite_v1`, if such ever existed).
- A legacy JSON / CSV / spreadsheet file in `data/`, `data/archive/`, or `st-working/`.
- A Google Sheet the ST team used before ordeal tracking moved into the app (per the ORD epic).

The ORD epic (in `epic-ord-ordeals-tracking.md`, mostly shipped 2026-04-24) brought ordeal data into MongoDB via direct migration (story ORD-5). DI-3 may be a residual question of "did everything from the pre-migration source actually land?".

### What "ordeal data" means in the live DB

The current production schema (post-ORD-5) places ordeal completion in:

- **`character.ordeals[]`** — array of ordeal records on each character document. Each entry has fields like `name`, `completed`, `completed_at`, `xp_awarded`, etc. (Verify exact shape via a `Glob server/schemas/character*.schema.js` and a sample read.)
- **XP impact** — `xpOrdeals(c)` in `public/js/editor/xp.js` reads the `ordeals` array and counts complete entries × 3 XP each.

If an ordeal completion is missing from `character.ordeals[]`, `xpOrdeals(c)` undercounts that character's XP earned. The Ordeals tab on the admin app and the Ordeals card on player.html both render from this same source.

### Files in scope (for the investigation, not for changes)

- `server/schemas/character.schema.js` (or wherever the character schema lives) — confirm the `ordeals` field shape.
- `public/js/editor/xp.js` — `xpOrdeals` function; the canonical XP rule.
- `public/js/admin/<ordeals view>` — confirm via grep where ordeals render in admin; how completion is surfaced.
- `data/archive/`, `st-working/`, `data/dev-fixtures/` — search for any legacy ordeal source.
- ORD-5 migration script (see ORD epic file) — if it logged its writes anywhere, check whether the log shows any skipped or failed records.

---

## Investigation procedure

Each step is a discrete deliverable. Document findings in a single audit note (e.g. `specs/audits/di-3-ordeal-parity-2026-MM-DD.md`) as the dev proceeds. The audit note becomes the artefact of this story.

### Step 1 — Confirm the comparison source with the user

Before reading any data, ask: "What source were you comparing against when you wrote DI-3? An older Mongo database, a spreadsheet, a JSON file, or something else?"

If the user does not remember (likely, given the epic was drafted 2026-04-17 and ORD-5 has since shipped), proceed with these candidate sources in priority order:
1. Any file under `data/archive/` mentioning ordeals.
2. Any Google Sheet referenced in `memory/reference_google_calendar.md` or the broader `memory/reference_*.md` set.
3. ORD-5's migration source data (per the ORD epic file).

### Step 2 — Catalogue current live state

For each character in `tm_suite.characters`:
- List the `ordeals` array.
- Per ordeal entry: name, `completed` flag, `xp_awarded` (if stored).

Output: a table or JSON dump of (character_name, ordeal_name, completed, xp).

### Step 3 — Catalogue source state

From whichever source the user identified in Step 1:
- Extract the same shape: (character_name, ordeal_name, completed).

### Step 4 — Diff

Produce a three-column diff:

| Character | Ordeal | Source says | Live says | Mismatch? |
|---|---|---|---|---|
| ... | ... | complete | absent | YES — missing from live |
| ... | ... | complete | complete | no |
| ... | ... | absent | complete | INVESTIGATE — extra in live |

### Step 5 — Verdict

One of three outcomes:

- **A. No mismatches.** Audit note records "all ordeal data verified parity as of <date>". Story moves to `done`. No follow-up.
- **B. Mismatches that look like real misses.** Audit note enumerates each mismatch. Story moves to `done` and the user scopes a follow-up DI-4 (or chooses to fix individually via the admin Ordeals tab). Do **not** write a migration script in this story.
- **C. Mismatches that look like data quality issues in source** (e.g. duplicate names, ambiguous attribution). Audit note flags these for human review. Story moves to `done` with the report; resolution is product-side.

---

## Acceptance Criteria

### Source identification

**Given** the dev is starting DI-3
**Then** the dev confirms with the user (in conversation, before reading data) what the comparison source for ordeal data is intended to be.
**And** if the user is unsure, the dev proposes the candidate sources from §Step 1 and gets a green-light on which to use.

### Live state catalogue

**Given** access to the production `tm_suite` database (read-only is sufficient)
**When** the dev queries `characters.ordeals`
**Then** the dev produces a complete catalogue of every ordeal entry across all characters.

### Source state catalogue

**Given** the agreed source from §Source identification
**When** the dev parses that source
**Then** the dev produces a comparable catalogue of every ordeal entry from the source.

### Diff

**Given** both catalogues exist
**Then** the dev produces a diff identifying:
- Entries present in source but missing from live (genuine import gaps).
- Entries present in live but absent from source (extras — investigate; may be legitimate post-migration entries).
- Entries present in both with status mismatches.

### Audit note

**Given** the diff completes
**Then** the dev writes `specs/audits/di-3-ordeal-parity-<YYYY-MM-DD>.md` containing:
- The agreed source.
- The live catalogue (or a summary if too long for the file).
- The source catalogue (or a summary).
- The full diff table.
- A verdict (A / B / C from §Step 5).
- Any recommended follow-up.

### No code changes

**Given** the verdict is anything other than "no mismatches"
**Then** the dev does **not** write a migration script in this story.
**And** the dev presents findings to the user for follow-up scoping.

### Sprint-status update

**Given** the audit note is complete
**Then** the dev moves `di-3-sync-ordeal-data` to `done` (regardless of verdict — the audit itself is the deliverable).
**And** if the verdict is B or C, the user scopes a follow-up story (DI-4 or similar) through normal sprint-planning, not as part of DI-3.

---

## Implementation Notes

### This is a data-read task, not a code task

No `Write`, `Edit`, or `migrate-*.js` invocations should happen in DI-3. The dev's tools are MongoDB read queries (via the `mongodb` MCP server or equivalent), file reads of source data, and writing a single markdown audit note.

### MongoDB MCP usage

If using the `mongodb` MCP server for the live read:
- Connect with read-only credentials if available; otherwise be careful to use only `find` / `aggregate`, never `update` / `delete`.
- Useful queries:
  - `find({}, { name: 1, moniker: 1, ordeals: 1, retired: 1 })` on `characters` to dump the live catalogue.
  - `count({ 'ordeals.completed': true })` to sanity-check totals.

### Audit note location

`specs/audits/` is the convention used by the panel-chrome audit (`specs/audits/downtime-ui-audit-2026-04-26.md`). Reuse that convention.

### British English

Audit note prose uses British English (no em-dashes, no US spellings). Data values are reproduced verbatim from source.

### British English in any TBD remediation

If the verdict triggers a follow-up DI-4 migration story, that story will be scoped separately and is not authored here.

---

## Files Expected to Change

- **`specs/audits/di-3-ordeal-parity-<YYYY-MM-DD>.md`** — new audit note (the entire deliverable).
- **`specs/stories/sprint-status.yaml`** — flip `di-3-sync-ordeal-data: ready-for-dev → in-progress → done` as the audit progresses.
- **No code changes.** No schema changes. No script changes.

---

## Definition of Done

- All AC verified.
- Audit note exists at `specs/audits/di-3-ordeal-parity-<YYYY-MM-DD>.md`.
- Verdict is recorded (A / B / C).
- If verdict is B or C: user has been notified and decides whether to scope a follow-up.
- If verdict is A: DI-3 closes with the audit as evidence; the DI epic moves one step closer to fully resolved.
- `specs/stories/sprint-status.yaml` updated.

---

## Dependencies and ordering

- **No upstream dependencies.** Investigation is read-only.
- **Recommended order within DI epic:** can run **before**, **after**, or **in parallel with** DI-1 and DI-2. They do not interact.
- **Pairs with the ORD epic** (mostly shipped 2026-04-24): if DI-3's source turns out to be ORD-5's migration source, this is essentially a post-mortem on that migration. Worth coordinating with whoever ran ORD-5 if they have insight.

---

## References

- `specs/epic-data-imports.md` — DI epic; DI-3 acceptance criteria.
- `specs/epic-ord-ordeals-tracking.md` — ORD epic; ORD-5 was the direct migration that brought ordeals into MongoDB.
- `public/js/editor/xp.js` — `xpOrdeals` function; the rule that turns a `complete` ordeal into 3 XP.
- `memory/project_ord_epic.md` — current ORD epic state.
- `memory/feedback_imports.md` — user runs MongoDB reads/writes; dev provides queries and instructions.
- `memory/feedback_audit_collections_first.md` — before any data-touching work, enumerate existing collections + schema fields.
- `specs/audits/downtime-ui-audit-2026-04-26.md` — audit note format precedent.
