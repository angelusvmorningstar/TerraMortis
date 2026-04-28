---
id: ord.8
epic: ord
status: superseded
priority: medium
depends_on: [ord.5]
superseded_by: ord.5
---

**Superseded** by ORD-5's direct-migration approach. Covenant slug
normalisation (display form → canonical slug: carthian / crone / invictus /
lancea / unaligned) is implemented inline in
`migrate-ordeal-submissions-from-deprecated.js` via `COVENANT_SLUG_MAP` and
`toCovenantSlug()`. A shared `covenant-slugs.js` module was not extracted
since the normaliser is used only in the migration script for now; if other
surfaces need it, factor out then.

Outstanding: 4 pre-existing display-form duplicate rubrics in
tm_suite.ordeal_rubrics ("Carthian", "Circle", "Invictus", "Lancea") could
be deleted when convenient; functionally harmless while they sit alongside
the canonical slug-form entries.

# Story ORD-8: Harmonise covenant slug representation across submissions and rubrics

As an ST,
I want `ordeal_submissions.covenant` and `ordeal_rubrics.covenant` to use the same vocabulary,
So that rubric lookup by covenant during marking cannot fail due to naming drift.

---

## Context

Covenant values appear in at least three shapes across the codebase:

- Display form: `"Carthian Movement"`, `"Circle of the Crone"`, `"Invictus"`, `"Lancea et Sanctum"`, `"Unaligned"`
- Slug form: `"carthian"`, `"crone"`, `"invictus"`, `"lancea"`
- Mixed: `covenant_questionnaire` rubrics in `tm_deprecated` use slug-ish `"Carthian"`, `"Circle"`, `"Invictus"`, `"Lancea"`

When the marking UI loads a submission and looks up the rubric by `covenant`, the join fails if the forms differ. This story decides the canonical form and enforces it everywhere ordeal data is touched.

---

## Acceptance Criteria

**Given** a decision on canonical covenant vocabulary **Then** the slug form is chosen: `carthian`, `crone`, `invictus`, `lancea`, `unaligned`. Rationale: lowercase slugs are URL-friendly, file-system-friendly, and avoid capitalisation drift.

**Given** a new shared module `public/js/data/covenant-slugs.js` **Then** it exports:
- `COVENANT_SLUGS` = array of canonical slugs (`['carthian', 'crone', 'invictus', 'lancea', 'unaligned']`)
- `COVENANT_DISPLAY` = map from slug to display label (`{ carthian: 'Carthian Movement', ... }`)
- `toCovenantSlug(input)` = normaliser that accepts any known form (display, slug, `"Carthian"`, `"Circle"`) and returns the canonical slug or `null` for unknown input.

**Given** ORD.5 export script **Then** it uses `toCovenantSlug` when writing `covenant` on each submission and rubric.

**Given** ORD.9 import script **Then** it uses `toCovenantSlug` when setting `covenant` on each inserted doc, defensively normalising even if the source already has a slug.

**Given** the rubric seed file `data/ordeal_rubrics_seed.json` **Then** its `covenant_questionnaire` entries are keyed by canonical slug.

**Given** the existing client-side covenant module `public/js/tabs/covenant-data.js` **Then** its keys are audited against the canonical slug set. Any mismatches are reconciled by changing the module's keys OR by routing through `toCovenantSlug` at the lookup boundary.

**Given** the covenant_questionnaire review UI **Then** it renders display labels (via `COVENANT_DISPLAY`) and stores/retrieves slugs everywhere underneath.

**Given** the questionnaire form's covenant field (stripped by ORD.1 so no longer player-facing there) and any remaining covenant-referencing UI **Then** all use the canonical slug as the stored value, display label for rendering.

---

## Implementation Notes

- **The "Unaligned" case**: not all ordeal flows allow unaligned characters. The covenant_questionnaire ordeal specifically requires a covenant pick. Decide whether `unaligned` is valid for the slug module (probably yes, to avoid downstream `null` handling) but rejected at the covenant_questionnaire submission validation layer.
- **Bloodlines**: distinct from covenants. Don't muddle them in the slug module.
- **Cross-reference**: check `character.covenant` on existing `tm_suite.characters`. Most likely stores display form. Character schema may or may not need normalisation; if it does, that's a separate story, not in this epic.
- **Testing**: unit test for `toCovenantSlug` covering every known input form plus edge cases (empty string, null, unknown covenant).

## Files expected to change

- `public/js/data/covenant-slugs.js` (new)
- `server/scripts/export-ordeal-submissions-for-import.js` (from ORD.5)
- `server/scripts/import-ordeal-submissions.js` (from ORD.9)
- `data/ordeal_rubrics_seed.json` (consistent slugs)
- `public/js/tabs/covenant-data.js` (audit and possibly update keys)
- `public/js/admin/ordeals-admin.js` (use display labels for render)
