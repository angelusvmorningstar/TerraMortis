---
id: dtui.24
epic: dtui
status: done
priority: low
depends_on: []
---

# Story DTUI-24: Feeding — Method of Feeding label rename

As a player picking how my character feeds,
I want the violent option to be clearly labelled "The Assault (violent)" alongside "The Kiss (subtle)",
So that the labels match the in-fiction terminology consistently.

**STATUS: DONE — VERIFIED ALREADY SATISFIED, NO CODE CHANGE. Closed 2026-08-27.**

dtui-23's own Dev Agent Record flagged this in advance: *"Found dtui-24's own label rename ('The
Assault (violent)') already exists in current code as a side effect of this file's history - flagged
so this story doesn't wrongly claim credit for it, and dtui-24's own story still needs to formally
verify/close it."* This story is that formal verification.

---

## Acceptance Criteria (from epic doc, Story 1.24)

1. **Given** the Method of Feeding ticker renders, **when** the player views the options, **then**
   the labels are: "The Kiss (subtle)" and "The Assault (violent)".
2. **Given** the legacy "Violent" label is removed, **when** the form persists data, **then**
   existing data with "Violent" or "violent" enum values continues to read correctly via back-compat
   (rename surfaces only the label, not the underlying enum).

## Verification

**AC1 — satisfied, live in `public/js/tabs/downtime-form.js:7285-7287`.** The Method of Feeding
`.dt-ticker` radiogroup renders both pills with the exact wording: `<span>The Kiss (subtle)</span>`
(value `kiss`) and `<span>The Assault (violent)</span>` (value `violent`). Landed as part of
dtui-23's own ticker-conversion rewrite (Wave 4, `main`), not a fresh change here. Regression
coverage already exists: `tests/dtui-23-feeding-territory-relocation.spec.js:200` asserts
`toContainText(['The Kiss (subtle)', 'The Assault (violent)'])` against the rendered ticker.

**AC2 — satisfied, trivially true, no shim needed.** Traced the enum's full history from its origin
story (`specs/stories/dtfp-5-kiss-violent-toggle.story.md`): `feed_violence` has been `'kiss' |
'violent'` (lowercase) as a *stored value* since the field was first introduced — "Violent" was
always only the display label, never the persisted enum. Confirmed empirically against every
`feed_violence` occurrence in the repo's own historical data dumps and migration backups
(`server/scripts/_dt3-submissions.json`, `_dt4-submissions.json`,
`archive/_backups/*-migration-*.json`, ~100+ real records): every single value is lowercase `kiss`
or `violent`, no capitalised `Violent` ever appears as data. AC2's premise (that a legacy
capitalised-enum value might need a back-compat shim) does not describe any state this data has
ever actually been in, so there is nothing to shim.

**Out of scope, not a gap:** the ST-facing admin summary/override UI
(`public/js/admin/downtime-views.js:8332,8355`) still displays the plain "Violent" label, not "The
Assault (violent)". AC1 is explicitly scoped to "the Method of Feeding ticker" (the player-facing
`.dt-ticker`), which the admin view is not — it's a different override-dropdown/summary control. Not
touched by this story, consistent with dtui-23's own admin/player scope boundary.

## Files in scope

None — no implementation was made; this story file (plus the epic doc coverage row and
`sprint-status.yaml`) is the only artefact this pass produces.

## Definition of Done

- [x] AC1 verified against live code and existing regression coverage (no new test needed).
- [x] AC2 verified against real historical data (no legacy capitalised-enum records exist; no
      back-compat shim needed).
- [x] Admin-view label divergence checked and confirmed out of scope, not silently left unnoticed.
- [x] Epic doc's dtui.24 coverage row updated to record verified-already-satisfied.
- [x] `sprint-status.yaml` updated to `done`.
- No code changed. No commit beyond doc updates (this story file, the epic doc row,
  `sprint-status.yaml`).

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Completion Notes

Read dtui-23's own flag first rather than starting scope-blind. Verified AC1 by reading the live
render code directly (not trusting the flag alone) and confirming an existing Playwright assertion
already covers the exact wording. Verified AC2 by tracing the enum back to its origin story and then
grepping every historical `feed_violence` occurrence across the repo's own production data dumps and
migration backups to confirm the "legacy Violent value" AC2 guards against has never actually existed
as stored data — the AC's back-compat concern was written defensively at spec time, not against a
known real hazard. Noted the admin-view label divergence explicitly rather than silently passing over
it, and confirmed it's a deliberate scope boundary (AC1 names the player-facing ticker specifically),
not an overlooked gap.

### File List

- `specs/stories/dtui-24-feeding-method-label-rename.story.md` — new, closed `done`
- `specs/epic-dtui-downtime-form-ux-refactor.md` — dtui.24 coverage-map row updated
- `specs/stories/sprint-status.yaml` — dtui-24 line updated to `done`
