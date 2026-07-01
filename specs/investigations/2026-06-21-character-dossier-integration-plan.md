# Character Dossier — Integration Brief (deferred)

**Status:** the `character_dossier` knowledge layer is a deliberate **duplicate / staging dataset**, not part of the canonical character schema. Integration into Mongo's canonical model is a **later, dedicated task**. This brief captures the 2026-06-21 hard review so the integration doesn't re-derive it.

## What exists now

- `character_dossier` collection: **29 character dossiers, 424 tagged facts** (avg 14.6/char). Schema (documentation-only): `server/schemas/character_dossier.schema.js`; tag vocab `DOSSIER_TAGS`.
- Sources: `excel` 357, `history` 51, `questionnaire` 16. Built from player histories + the "Character Details" questionnaire (Excel) + DB portal form.
- Side-effects already in PRODUCTION collections (not quarantined): **45 NPCs + 88 relationship edges** in `npcs` / `relationships` (17 named sires, family, PC ally/coterie/rival edges). These ARE app-visible.

## Hard-review findings (what to fix AT integration)

1. **No enforcement.** No DB validator; schema is documentation-only. Drift already occurred (`early_nights` tag; an `clan_goal` remapped at write). At integration, enforce `tag ∈ vocab`, `source ∈ enum`, and per-tag required fields (secret⟹severity+st_hidden; boon/debt⟹status+counterparty).

2. **People referenced by free-text name, not id — the costliest integration problem.**
   - 93 people-referencing facts (sire/family/ally/enemy/brood), **only 18 linked** to an npc/pc id; **75 name people in prose only**.
   - All 9 obligation `counterparty` values are NAMES not refs (`"Eve Lockridge"`, `"Doc and Macheath"` = two people in one field, one literal `"undefined"`).
   - **Recommendation: resolve names → typed refs `{type:pc|npc, id}` (relationships-collection shape).** Best done while extraction context is fresh; this is the expensive, decay-prone part of the merge.

3. **Obligations are one-sided.** A boon/debt sits on one party's dossier as prose; the counterparty's side knows nothing. At integration, model as two-sided edges (`relationships` has `debt-holder`/`debt-bearer` + `status`); repayment flips one status; the dossier surfaces it.

4. **Structured data trapped in prose.** Median fact 153 chars (max 442). 18 facts bury a year in prose; only 2 have structured `birth_year`. Lift `birth_year`/`embrace_year` (ints) and origin/locations (refs) so the data answers queries, not just describes.

5. **Fragmentation risk to reconcile at integration:** touchstones live in 3 places (sheet `touchstones[]` = authoritative, dossier `touchstone` facts, relationships `touchstone` kind). Pick one source of truth. Sheet stays authoritative on any clash (precedence: **sheet > DB > Excel**).

6. **Known data bugs to clean:** `counterparty:"undefined"`; `early_nights` drift tag; `"Doc and Macheath"` split into two refs.

## What is intentionally NOT done now

- No DB-level validator (premature on a transitional collection).
- No promotion of obligations into production `relationships`.
- No structured-field extraction (belongs to the integration target schema).

See [[project-character-dossier]] memory and the `tm-history-ingest` skill for the build details.
