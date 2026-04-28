---
id: ord.6
epic: ord
status: superseded
priority: high
depends_on: [ord.5]
superseded_by: ord.5
---

**Superseded** by ORD-5's direct-migration approach. Dry-run audit is now a
`--dry-run` flag on `server/scripts/migrate-ordeal-submissions-from-deprecated.js`.
Name resolution was executed on 2026-04-24 with zero unresolved characters
(four NAME_OVERRIDES added + Yusuf moniker data fix).

# Story ORD-6: Dry-run audit of ordeal submission import

As the ST team,
I want a full dry-run of `import-ordeal-submissions.js` against the ORD.5 extracts before any writes hit `tm_suite`,
So that every unmatched character name is surfaced and resolved before migration executes.

---

## Context

`import-ordeal-submissions.js` resolves characters by name using a normaliser (`HONORIFICS` regex, quote-stripping, parenthetical stripping, prefix matching). The live character set in `tm_suite.characters` may have honorifics, monikers, or spellings that don't match the raw names captured in Google Forms. Every unmatched row is silently dropped as `[UNMATCHED]` in the current script output.

This story is a dry-run gate: run the import with `--dry-run`, catalogue every unmatched row, resolve each, and re-run until zero unmatched. No data writes.

---

## Acceptance Criteria

**Given** ORD.5 has produced `data/lore_mastery.json`, `data/rules_mastery.json`, `data/covenant_questionnaire.json`, and `data/character_histories.json` **Then** `node server/scripts/import-ordeal-submissions.js --dry-run` runs to completion.

**Given** the dry-run completes **Then** stdout lists every submission with either `[OK] <character name>` or `[UNMATCHED] <type> <raw name>`.

**Given** any `[UNMATCHED]` entries **Then** each is resolved by one of the following routes:

- Extending the `HONORIFICS` regex in the script (e.g. if "Baron", "Brother", "Monsignor", or another honorific isn't covered).
- Correcting the `character_name` string in the JSON extract (typo, nickname not matching moniker, etc.).
- Adding the missing honorific to the character's `honorific` field on `tm_suite.characters` if the character-side value is actually wrong.
- Confirming the submission is for a retired character and accepting it via an explicit manual override or dropping it from the extract if it's truly orphaned.

**Given** a second dry-run after resolutions **Then** zero `[UNMATCHED]` entries remain.

**Given** the dry-run **Then** no writes occur anywhere (guaranteed by the existing `DRY_RUN` guard in the script).

**Given** the summary output at the end of the dry-run **Then** it prints: total submissions prepared per ordeal type, total unmatched per ordeal type, zero warnings.

**Given** resolved entries **Then** their resolution is recorded in the story completion note (e.g. "Added 'Monsignor' to HONORIFICS regex; corrected 'Rene St.-Dominique' → 'Rene St Dominique' in extract").

---

## Implementation Notes

- **No production writes.** This story is read-only plus updates to `HONORIFICS` regex and/or JSON extracts. The clean dry-run is the exit criterion.
- **HONORIFICS regex currently covers**: lord, lady, doctor, dr, sister, sir, miss, mr, mrs, madam, don, preacher, inquisitor, rev, reverend. Extend as needed.
- **Character name normalisation** in the existing script strips quotes (`'text'`, `"text"`) and parentheticals (`(text)`). If Google Form submissions include unusual punctuation, extend the normaliser.
- **Prefix matching** is already a fallback. Exercise care: "Rene" prefix-matches both "Rene Meyer" and "Rene St Dominique". Confirm the prefix match resolved to the correct one by comparing against `submitted_at` and other context.
- **Covenant mismatches** are not character-resolution issues; ORD.8 addresses those separately.
- **Running the script locally**: user runs the script themselves per repo convention. This story's completion note captures the dry-run output and resolutions applied.

## Files expected to change

- `server/scripts/import-ordeal-submissions.js` (possibly HONORIFICS regex extensions)
- `data/lore_mastery.json` / `data/rules_mastery.json` / `data/covenant_questionnaire.json` / `data/character_histories.json` (possibly name corrections)
- No production writes.
