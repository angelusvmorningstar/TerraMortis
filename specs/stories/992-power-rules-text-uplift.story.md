---
issue: 992
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/992
branch: piatra/issue-992-power-rules-text-uplift
---

# Story 992: Uplift power rules text from markdown rulebooks into `purchasable_powers.rules_text`

**Story ID:** feat.992
**Status:** Draft
**Date:** 2026-07-14
**Issue:** [#992](https://github.com/angelusvmorningstar/TerraMortis/issues/992)
**Branch:** `piatra/issue-992-power-rules-text-uplift`

---

## User Story

As the ST maintaining the rules engine,
I want the full rulebook text for every power stored alongside its one-line summary,
so that players and STs can read complete, errata-corrected rules in-app instead of opening PDFs.

---

## Background

- Source books live in `markdown/` (repo root): `Vampire the Requiem 2e Rulebook.md` (651KB), `Chronicles of Darkness Rulebook.md` (554KB), `Hurt Locker.md` (295KB, manoeuvres), `Secrets of the Covenants.md` (135KB), `Blood Sorcery- New Rules.md`, `Damnation City Model - New Rules.md`, `Blood Sorcery Themes and Motifs.md`, plus errata: `Terra Mortis - Errata Master.md` (61KB) and `Auspex Errata.md` (8KB). `Terra Mortis Treatment.md` is campaign fiction — exclude.
- The markdown is PDF-extracted: **every wrapped line is followed by a blank line**. Normalise by joining consecutive non-blank-separated fragments into paragraphs before parsing (a "paragraph" ends where a structural marker begins, not at the double newline).
- Power heading formats observed:
  - `Feral Whispers •` — plain name + dot glyphs on its own line (VtR disciplines; rulebook line 12302)
  - `**Hamstring (•):** text...` — bolded name with parenthesised dots, body runs on (Hurt Locker manoeuvres, merit styles; e.g. line 10781)
  - Expect variants per book; the parser must be tolerant and REPORT what it could not classify rather than guessing.
- A power block runs from its heading to the next heading of equal kind, typically containing flavour paragraphs then structured lines: `**Cost:**`, `**Dice Pool:**`, `**Action:**`, `**Duration:**`, `**Roll Results**` with `**Dramatic Failure:**/**Failure:**/**Success:**/**Exceptional Success:**` subsections, sometimes `**Suggested Modifiers**`.
- Target collection: `purchasable_powers`, 619 docs. Categories and counts: discipline 50, devotion 45, rite 132, manoeuvre 178, merit 181, skill 24, attribute 9. ALL categories in scope (skills/attributes will mostly match CofD rulebook chapters; low match rates there are acceptable and simply reported).
- Doc shape: `{ key, name, category, parent, rank, rating_range, description, pool, resistance, cost, action, duration, prereq, ... }`. `description` is a one-line summary (median 46 chars) — **must not be modified**.
- Schema: `server/schemas/purchasable_power.schema.js`. `description` at line 92. Add `rules_text` and `rules_source` near it.
- Scripts using `../db.js` need `import 'dotenv/config'` as the FIRST import (`.env` lives at `server/.env`).
- **Hard lesson encoded in this repo (2026-06-16, PR #813):** a find+projection+replaceOne pattern destroyed 13 character docs. This script must use `updateOne` with `$set` on exactly `{ rules_text, rules_source }` and nothing else, and must have an end-to-end integration test that runs its `main()` against a test collection.

## Decisions (locked 2026-07-14, Peter)

- **Option B**: `description` untouched; new `rules_text` (full text) + `rules_source` (provenance, e.g. `"VtR 2e Rulebook"` or `"VtR 2e Rulebook + TM Errata"`).
- **All categories** in scope.
- `--apply` against prod is **not run in this story**. Deliverable is the dry-run report for Peter's review; apply is a separate explicitly-authorised step.
- Cost side-artifact: parsed `**Cost:**` strings are written to a JSON artifact for GDX-6 (#987) reuse; **no cost fields are written to the DB**.

---

## Acceptance Criteria

- [ ] AC1: `rules_text: { type: 'string' }` and `rules_source: { type: 'string' }` added to `server/schemas/purchasable_power.schema.js` (optional fields; not added to `required`).
- [ ] AC2: New script `server/scripts/uplift-power-rules-text.js` with `main()` export. Default mode is dry-run; writes nothing to the DB. `--apply` flag required for writes.
- [ ] AC3: Dry-run produces a report file (`server/scripts/reports/992-uplift-report.json` + human-readable `.md` summary) with per-category counts: matched, unmatched-in-db (power in DB, no markdown found), ambiguous (multiple candidate blocks), and per-match `{ key, name, source, before_len, after_len, preview }`.
- [ ] AC4: Matching is by normalised name (case/punctuation/diacritic-insensitive), sanity-checked against `rank` (dot count in heading, where present). Rank mismatch → ambiguous, not matched.
- [ ] AC5: Errata precedence — when a power appears in an errata file AND a book, the errata text is used and `rules_source` records both.
- [ ] AC6: Apply mode: (a) exports a full-collection backup JSON to `server/scripts/backups/` before any write; (b) writes via `updateOne({ _id }, { $set: { rules_text, rules_source } })` only; (c) skips docs whose parsed text is empty; (d) prints written/skipped counts.
- [ ] AC7: Vitest integration test runs `main()` end-to-end against a seeded test collection (both dry-run and apply paths), asserting: `description` unchanged, `rules_text`/`rules_source` set on matched docs, unmatched docs untouched, backup file created in apply mode.
- [ ] AC8: Cost side-artifact `server/scripts/reports/992-costs-extract.json`: `[{ key, name, cost_raw }]` for every matched power with a `**Cost:**` line.
- [ ] AC9: Dry-run executed against the live DB (read-only) and the report committed for review.

---

## Design notes for the dev agent

- Parser pipeline: read book → normalise wrap (join `line\n\nline` fragments into paragraphs; a heading line stays its own unit) → segment into power blocks by heading regex set → for each block capture `{ name, dots, flavour, sections: { cost, dice_pool, action, duration, roll_results, modifiers } }` → serialise `rules_text` as clean markdown (flavour paragraphs + `**Cost:** ...` etc. lines, single-spaced).
- Keep per-book heading regexes in a declarative table `{ book, file, patterns[] }` so new books are additive.
- Name normalisation: lowercase, strip diacritics (René), collapse whitespace, strip leading "the ". DB `name` is the join key; report collisions.
- Do NOT attempt fuzzy matching beyond normalisation in this story — unmatched is a reportable outcome, not a failure.
- Test DB pattern: follow `server/tests/helpers/db-setup.js` usage as in existing script tests; seed a handful of fake powers + a small fixture markdown string.
- Only stage/commit files belonging to this story (new script, schema edit, test, reports). The working tree contains unrelated uncommitted specs — leave them alone.

## Test Plan

1. Unit-ish: parser on a fixture markdown covering both heading styles + errata override.
2. Integration: `main()` dry-run + apply against seeded test collection (AC7).
3. Live dry-run: run against Atlas read-only, commit the report (AC9).

## Dev Notes

- Do not push, open a PR, or merge — SM handles the git ceremony after verification.
- Never run `--apply` against the live DB in this story.
- Run tests: `cd server && npx vitest run tests/issue-992-uplift-rules-text.test.js`.
