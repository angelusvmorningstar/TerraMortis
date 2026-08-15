# Story gdx.6: structured power costs — vitae_cost/willpower_cost fields + migration

Status: done

## Story

As a Storyteller running Terra Mortis,
I want every discipline, devotion, and rite in `purchasable_powers` to carry a machine-readable
Vitae/Willpower activation cost alongside its existing free-text description,
so that gdx.7's roll-spend automation has real numbers to read instead of having to parse
"3–9 V & 1 WP" out of prose at roll time.

## Why this story exists

GDX-7 (#988, "apply vitae/WP costs on roll") needs a number to put in its "Roll & spend N Vitae[, M WP]"
button. Today that number does not exist anywhere structured — `purchasable_powers.cost` is a free-text
field ("2 V", "3–9 V & 1 WP", "Free / 1 V", "Varies", and worse) meant for human reading on the sheet,
never parsed. This story adds the structured fields and a one-off migration to populate them from the
real live data, following the same plan/apply/main convention every migration script in this project
uses (`migrate-office-purchases-to-seats.mjs` is the shape exemplar, same as it was for xpl.2 tonight).

## What this story is NOT

- NOT GDX-7's roll-spend feature itself. This story only adds the fields and populates them; nothing
  reads `vitae_cost`/`willpower_cost` at roll time yet.
- NOT GDX-5 (`game_in_progress` flag) — unrelated, already shipped tonight, no dependency either way
  beyond both being GDX-7 prerequisites.
- NOT a "devotions data" migration separate from `purchasable_powers`. The parent GitHub issue (#987)
  says "Add ... to purchasable_powers schema **and devotions data**" — stale. Epic PP (see `CLAUDE.md`)
  already unified `DEVOTIONS_DB` into `purchasable_powers` (`category: 'devotion'`), confirmed live:
  all 51 devotions are `purchasable_powers` documents today, no separate collection or JS module
  exists. There is only one place to add these fields.
- NOT touching `attribute`, `skill`, `manoeuvre`, or `merit` category rows. Confirmed live: none of
  the 9 attributes, 24 skills, 178 manoeuvres, or 230 merits carry a non-null `cost` value at all —
  "activation cost" is not a concept that applies to them (you don't "activate" a dot of Strength or a
  merit). The migration's parse scope is `discipline`/`devotion`/`rite` only; the other four categories
  are left with `vitae_cost`/`willpower_cost`/`cost_note` simply absent (the schema does not require
  them — see AC1 — so "not present" is valid, not a gap).
- NOT `xp_fixed` or any XP-purchase-cost concept. `vitae_cost`/`willpower_cost` are **activation**
  costs (spent to USE a power in play); `xp_fixed` is the cost to LEARN it. Completely different
  mechanics on the same document — do not conflate or derive one from the other.
- NOT retroactively refreshing devotion cost text already frozen onto a character's own `powers[]`
  array. `editor/sheet.js`'s devotion renderer displays `p.stats` — a snapshot string stored on the
  character at the moment the devotion was added, not read live from `purchasable_powers` (see Dev
  Notes — Display Site, Discipline vs Devotion Asymmetry). Only NEW devotion additions and disciplines
  (which render live every time, no snapshot) show the new structured cost immediately after this ships.
- NOT fixing the duplicate `"Summoning"` devotion name found live during this story's own investigation
  (two `purchasable_powers` documents share that exact name) — a pre-existing data-quality issue,
  logged to `deferred-work.md`, not this story's to fix.
- NOT running `--apply` against live `tm_suite`. Same convention as every migration script in this
  project's history (`migrate-office-purchases-to-seats.mjs`, `dbo-1-purchasable-powers-field-
  cleanup.mjs`, tonight's own `xpl-2-historic-xp-reconciliation.mjs` when it's built): dry-run by
  default, `--apply` required to write, and running it for real is Angelus's own action.

## Acceptance Criteria

1. `server/schemas/purchasable_power.schema.js` gains three new declared properties (the object is
   `additionalProperties: false`, so — same lesson this schema's own comments already document twice,
   for `cost_model` and `special` — a row cannot carry these until they're declared here):
   - `vitae_cost`: `{ type: ['integer', 'null'], minimum: 0 }`
   - `willpower_cost`: `{ type: ['integer', 'null'], minimum: 0 }`
   - `cost_note`: `{ type: ['string', 'null'] }`
   None are `required` — every existing row not touched by this migration (attribute/skill/manoeuvre/
   merit) stays schema-valid with all three simply absent.
2. New script `server/scripts/gdx-6-structured-power-costs.mjs`, no shebang (imported directly by its
   own test suite — the shebang-breaks-vitest landmine documented at length in `CLAUDE.md` and every
   sibling migration script's own header), exports `planCostMigration(powersCollection)`,
   `applyCostMigration(powersCollection, plan, {apply, log})`, and a `main(argv)` CLI entry.
3. `planCostMigration` reads every `purchasable_powers` document with `category` in
   `['discipline', 'devotion', 'rite']` and classifies each into exactly one of:
   - **`zero`** — `cost` is `null` or the literal string `"-"` (a real, distinct sentinel three
     devotions use for "no cost" instead of `null` — see Dev Notes). Confirmed free to activate:
     `vitae_cost: 0`, `willpower_cost: 0`, `cost_note: null`.
   - **`parsed`** — `cost` matches a recognised shape (see AC4 for the exact patterns). Produces real
     `vitae_cost`/`willpower_cost` integers, `cost_note` set only when the match carries a qualifier
     worth keeping (see AC4).
   - **`unparsed`** — everything else. `vitae_cost: null`, `willpower_cost: null`, `cost_note` is the
     row's own original `cost` string **verbatim, never summarised or fabricated** (mirrors xpl-2's own
     "refuse to guess" convention from tonight).
4. Parser patterns, built from the REAL live samples this story's own investigation pulled (cite them
   directly in the parser's own tests, per Task 4) — case-insensitive, tolerant of the real separator
   inconsistency the live data actually has (disciplines join with `&`, rites join with `+`, spacing
   around the separator is inconsistent — `"2 V +1 WP"`, `"3 V + 1WP"`, `"1 V + 1 WP"` are three
   different spacings of the same shape, all live):
   - `"N V"` / `"N Vitae"` → `vitae_cost: N, willpower_cost: 0`
   - `"N WP"` → `vitae_cost: 0, willpower_cost: N`
   - `"N V" (& or +) "M WP"`, any spacing → `vitae_cost: N, willpower_cost: M`
   - `"N V per effect"` (Celerity/Resilience/Vigour's own ladder — 15 live rows, every rank) →
     `vitae_cost: N, willpower_cost: 0, cost_note: "per effect"`
   - `"N V/turn"` (Juggernaut's Gait) → `vitae_cost: N, willpower_cost: 0, cost_note: "per turn"`
   - `"N V (qualifier text)"` (Iron Edict: `"1 V (0 in bond)"`) → `vitae_cost: N, willpower_cost: 0,
     cost_note: "<qualifier text>"` — keep the parenthetical, it is real mechanical information (a
     blood-bond exception), not noise.
   Everything else — `"Free / N V"` (a genuine two-branch choice, not one number), `"N–M V & K WP"`
   (a range, en-dash, tied to something else like territory Ambience — no single N to extract even
   though the WP half IS a clean number; keep BOTH null rather than half-populating), `"N W (Opt M V)"`
   (Willpower-with-optional-Vitae-alternative, also a real choice), `"Varies"`, and the five
   body-mutilation devotions whose cost is a health-damage cost plus an unquantified "+ Vitae" (Eye
   Behind Glass, The Contagion Principle, Face of the New Flesh, The Pleasure of the Text, The Soul
   Transplant) — falls to `unparsed`.
5. `applyCostMigration`, called only with `--apply`, sets exactly the three new fields per row from the
   plan — **never touches, overwrites, or deletes the existing `cost` string field.** `cost` remains
   the permanent, ultimate display fallback (AC7) and the plan's own audit trail; this migration is
   purely additive.
6. Idempotent by construction, not by a guard: `planCostMigration` is a pure re-derivation from each
   row's own stable `cost` string, not a stateful diff against prior runs, so running `--apply` twice
   produces byte-identical output both times. No duplicate-detection logic needed (unlike, say,
   xpl-2's ledger-insert case, which genuinely needs one) — call this out explicitly in code review so
   it isn't flagged as a missing guard.
7. `public/js/suite/sheet-helpers.js`'s `fmtRuleStats(r)` — the single shared cost-display function,
   already de-duplicated once from three separate copies per its own doc comment — prefers the
   structured fields when either is a real number, falling back to `cost_note` alone (for a fully
   `unparsed` row) or the legacy `r.cost` string (belt-and-braces, in case a future row somehow has
   neither), in that order:
   - Both `vitae_cost`/`willpower_cost` are `0` and no `cost_note` → show nothing for cost (matches
     today's `if (r.cost)` falsy-skip behaviour for a genuinely free power — do not print "Cost: 0
     Vitae").
   - Either is a positive integer → build `"N Vitae"` / `"N Willpower"` / `"N Vitae & M Willpower"` as
     appropriate, then append `cost_note` in parentheses if present (e.g. `"1 Vitae (per effect)"`).
   - Both `null` and `cost_note` present → show `cost_note` alone (already the original text or a
     close paraphrase, per AC3's own `unparsed` bucket).
   - Both `null` and no `cost_note` (shouldn't happen for discipline/devotion/rite post-migration, but
     is the correct current behaviour for every other category) → fall back to the legacy `r.cost`
     string exactly as today.
8. Real test coverage: unit tests for the parser's classification (`zero`/`parsed`/`unparsed`) built
   directly from the real row samples this story's investigation pulled (see Dev Notes for the full
   cited list — Feral Infection "2 V", Lord of the Land "3–9 V & 1 WP", Beast's Hackles "Free / 1 V",
   Iron Edict "1 V (0 in bond)", Celerity 1 "1 V per effect", The Taste of Things Lived "1 Vitae",
   City Attunement "-", the three rite separator-spacing variants, at minimum one of the five
   body-mutilation devotions); a live-DB integration test proving `main()` end-to-end against
   `tm_suite_test` (seeded fixtures, not live `tm_suite`) correctly plans and applies a representative
   mixed batch, and that a second `--apply` run produces the identical result (AC6's idempotency,
   proven not just asserted); and unit tests for `fmtRuleStats`'s new fallback branches.
9. This story does NOT run `--apply` against live `tm_suite`. The script exists, is tested against
   `tm_suite_test`, and is left for Angelus to run for real.

## Tasks / Subtasks

- [x] Task 1 — Schema (AC: 1)
  - [x] Add `vitae_cost`, `willpower_cost`, `cost_note` to `purchasable_power.schema.js`, matching the
        existing `cost_model`/`special` declared-property precedent (comment explaining why they must
        be declared before any row can carry them).
- [x] Task 2 — Script skeleton + parser (AC: 2, 3, 4)
  - [x] `server/scripts/gdx-6-structured-power-costs.mjs`, no shebang, connection via `../db.js`.
  - [x] `parseCostString(cost)` — the pure parser, one function, returns
        `{ classification, vitae_cost, willpower_cost, cost_note }`. Written as its own small function
        with direct unit coverage (mirrors xpl-2's own item-string-parser convention from tonight) —
        this is the single most likely place a real-data shape this story's investigation didn't
        sample breaks silently. Smoke-tested against all 17 real cited samples before the full vitest
        suite was written — 17/17 correct on first pass.
  - [x] `planCostMigration(powersCollection)`: query `category: { $in: ['discipline','devotion','rite'] }`,
        run each row's `cost` through `parseCostString`, return `{ zero: [...], parsed: [...],
        unparsed: [...], counts: {...} }` — the `unparsed` list is what an ST reviews by hand, keep it
        genuinely readable (row name, category, original cost text).
- [x] Task 3 — Apply phase (AC: 5, 6)
  - [x] `applyCostMigration`: dry-run by default (prints what it would set), `--apply` to write. Sets
        only `vitae_cost`/`willpower_cost`/`cost_note`, `$set` only — never touches `cost` itself.
- [x] Task 4 — Display fallback (AC: 7)
  - [x] Update `fmtRuleStats` in `public/js/suite/sheet-helpers.js` per AC7's exact precedence rules.
        Confirm both consumers (`powersForDisc` in the same file, and `export-character.js`) still
        compile and their own existing tests (if any) still pass unmodified — this function's contract
        (a formatted one-line string) does not change, only what feeds it. Implemented as a new,
        separately-exported `fmtCostLine(r)` so the cost-line logic has its own direct test coverage
        rather than only being reachable through the full `fmtRuleStats` string.
- [x] Task 5 — Tests (AC: 8)
  - [x] `server/tests/gdx-6-structured-power-costs.test.js` — parser unit tests against the real cited
        samples (all three classifications, both separator styles, at least one body-mutilation
        devotion), `main()`-path integration tests against `tm_suite_test` (plan+apply, not a
        subprocess `main()` call directly, matching this file's own direct-function-call convention),
        idempotency proof (two `--apply` runs, identical result). 24 tests.
  - [x] `fmtCostLine` unit tests for the four precedence branches in AC7 — no existing sheet-helpers
        test file was found (confirmed by grep before starting), so added to the same new test file.
        7 tests.
- [x] Task 6 — Full changed-area regression (AC: 9)
  - [x] Run the new suite, plus any existing test file that already exercises `fmtRuleStats` or
        `purchasable_power.schema.js` (grep before assuming none exist), plus `oxp-11`-style migration
        precedent tests for a sanity comparison of style, not because they share code. 10 files,
        194 tests, all green (31 own + 88 schema/rules-adjacent + 75 remaining `purchasable_power`
        referencers found by grep).
  - [x] Confirm via `git diff`/manual read that no `--apply` was ever run against `MONGODB_URI` (live)
        in this session. Confirmed: the only direct `node` invocation of the script was the parser
        smoke-test (`parseCostString` only, no DB connection at all); every DB-touching call in this
        session went through the vitest suite, which is hard-forced onto `tm_suite_test` by the
        project's own setup file.

### Review Findings

Internal 3-layer review (Blind Hunter, Edge Case Hunter, Acceptance Auditor), 2026-08-15. Codex
(external) was attempted first and hit its own usage limit mid-run (unavailable until 2026-08-20);
fell back to internal per the loop's own standing instruction. 21 raw findings across the three
layers, deduplicated to 12 unique issues. Acceptance Auditor's independent verdict: **Ship** (all 9
ACs satisfied on literal wording; the one real issue it found was a false claim in this story's own
Debug Log, corrected above, not a code defect).

- [x] [Review][Patch] `parseCostString` throws on a non-string `cost`, contradicting its own "Never
      throws" doc comment [server/scripts/gdx-6-structured-power-costs.mjs] — prove-discriminated
      (reverted, watched `TypeError: cost.trim is not a function`, restored). Fixed: explicit
      `typeof cost !== 'string'` guard, classified `unparsed`.
- [x] [Review][Patch] Whitespace-only and empty-string `cost` produced a visible-garbage or
      uninformative `unparsed` result instead of `zero` — same file. Fixed: both fold into `zero`
      alongside `null`/`"-"`.
- [x] [Review][Patch] `RE_QUALIFIED`'s parenthetical capture allowed a whitespace-only qualifier,
      trimming to an empty-string `cost_note` that violated the field's own "null, or a meaningful
      qualifier" contract — same file. Fixed: empty-after-trim qualifier becomes `null`.
- [x] [Review][Patch] Unparsed `cost_note` stored the untrimmed original string, not `trimmed` — same
      file. Fixed.
- [x] [Review][Patch] `main()`'s console output claimed unparsed rows are "left as cost_note only,"
      contradicting `applyCostMigration`'s own actual behaviour (explicit `null`/`null` are written
      too) — same file. Fixed: wording corrected.
- [x] [Review][Patch] `fmtCostLine`'s `structured` variable comment described only the "absent/
      undefined" case, not that it's equally `false` for the fully-`unparsed` (`null`/`null`) case —
      not a functional bug (the `note` fallback below produces identical correct output either way),
      but the comment claimed less than the real control flow [public/js/suite/sheet-helpers.js].
      Fixed: comment corrected.
- [x] [Review][Patch] Test file's `globalThis.window = globalThis` self-alias caused
      `sheet-helpers.js`'s own module-top-level `window.suiteToggleExp`/`suiteToggleDisc` assignments
      to leak permanently onto `globalThis`, visible to every later test file in this project's shared
      single-process vitest run [server/tests/gdx-6-structured-power-costs.test.js]. Fixed: `window`
      stubbed as a plain distinct object instead, confirmed by direct test that the leak no longer
      reaches `globalThis` and `fmtCostLine` still behaves identically.
- [x] [Review][Patch] Debug Log's claim that `sheet-helpers.js` needs `localStorage` stubbed (in
      addition to `location`/`window`) to import was false — corrected above, in the Debug Log itself,
      per the Acceptance Auditor's own reproduction. The unnecessary stub has been removed from the
      test file.
- [x] [Review][Defer] `fmtRuleStats` is not the only cost-display site — `print/page2.js` and
      `editor/csv-format.js` each build their own independent cost string, bypassing `fmtCostLine`
      entirely [public/js/print/page2.js:109, public/js/editor/csv-format.js:309] — deferred, real
      but beyond AC7's own named scope (`fmtRuleStats` only); logged with a corrected Dev Notes claim
      above (this story previously overstated `fmtRuleStats` as "the ONE shared" site).
- [x] [Review][Defer] Admin rule editor has no field for the new structured costs, so an ST editing a
      rule's `cost` text has no way to keep `vitae_cost`/`willpower_cost`/`cost_note` in sync
      [public/js/admin/rules-view.js:390] — deferred, a real gap but a UI-scoped follow-up beyond this
      schema-and-migration story.
- [x] [Review][Defer] CSV export/import round-trip drops the three new fields
      [public/js/editor/csv-format.js, public/js/admin/data-portability.js] — deferred, lower severity
      since they're re-derivable by re-running the migration (the source `cost` field survives the
      round-trip).
- [x] [Review][Defer] `applyCostMigration`'s `updateOne` has no `matchedCount` check — a document
      deleted between plan and apply silently no-ops while still counted as written
      [server/scripts/gdx-6-structured-power-costs.mjs] — deferred, low-probability race in a
      single-operator one-off admin script.
- [x] [Review][Defer] `"0 V"`-shaped costs (no live occurrence) classify `parsed` rather than `zero` —
      same file — deferred, cosmetic report-bucket inconsistency only; the displayed string is
      identical either way.

**Dismissed (4, informational or already correct-by-design):** `RE_COMBO`'s en-dash-range safety
framed as "coincidental" — it's actually deterministic given full `^...$` anchoring on `\d+`, not luck;
`RE_QUALIFIED`'s trailing-text-after-parenthesis silently falling to `unparsed` — by design, refuse to
guess; the "one-off" framing sitting next to an "idempotency check: re-run" instruction — not a real
tension, a one-off script can still be safely re-run to verify; `export-character.js`'s separate raw
`cost` export field alongside its own `fmtRuleStats`-derived `stats` field — re-examined directly, not
a competing display path, a structured-export column serving a different purpose.

Full raw findings: this story's own review session (internal subagents; no separate findings file was
generated for the internal fallback, unlike the abandoned Codex attempt at
`specs/stories/code-review/gdx-6-codex-review.md`, which never completed a pass before hitting its
usage limit).

## Dev Notes

### Investigation findings (2026-08-15, live read-only queries against `tm_suite` — do not re-derive)

**Full category breakdown, `purchasable_powers` (674 total documents):**

| category | count | rows with a `cost` value |
|---|---|---|
| attribute | 9 | 0 |
| skill | 24 | 0 |
| manoeuvre | 178 | 0 |
| merit | 230 | 0 |
| discipline | 50 | 42 (8 `null`) |
| devotion | 51 | 40 (11 `null`, 3 `"-"`) |
| rite | 132 | 132 (0 `null`) |

Only discipline/devotion/rite ever carry a meaningful `cost` string — confirming this migration's
scope (AC3) is correctly narrower than "every row," matching what the live data actually supports
rather than the epic's own broader-sounding framing.

**Rites (132/132) are the cleanest category — every value is cleanly parseable**, but with real
separator inconsistency worth building the regex around, not around: `"1 WP"` (63), `"1 V"` (26),
`"2 V"` (31), `"3 V"` (7), `"1 V + 1 WP"` (2), `"2 V +1 WP"` (2, no space before the `1`), `"3 V +
1WP"` (1, no space before `WP`). Rites join Vitae+WP with `+`; disciplines join with `&` (see below) —
two different separator tokens for the same combined-cost concept across categories.

**Disciplines (50 total, 42 with a cost) — real distinct values, all 50 rows sampled directly:**
- 8 `null` (confirmed free: Feral Whispers, Spirit's Touch, Entombed Command, Mesmerise, Awe,
  Confidant, Dread Presence, Face in the Crowd — all social/passive powers).
- 18 clean `"N V"` (Feral Infection "2 V", Raise the Familiar "1 V", etc.).
- 3 clean `"N V & M WP"` (Possession "1 V & 1 WP", Idol "2 V & 1 WP", Mortal Terror "1 V & 1 WP").
- 15 `"1 V per effect"` — Celerity 1-5, Resilience 1-5, Vigour 1-5 (every rank of all three ladders).
- 1 `"1 V (0 in bond)"` — Iron Edict, a real blood-bond mechanical exception worth keeping in
  `cost_note`, not discarding.
- 2 `"Free / N V"` — Beast's Hackles, Uncanny Perception. A genuine two-branch choice (free at a
  reduced effect, or pay for the full one), not one number — `unparsed`.
- 2 `"N–M V & 1 WP"` (en-dash range) — Lord of the Land "3–9 V & 1 WP", Oubliette "3–9 V & 1 WP". The
  Vitae half scales with something else (likely territory Ambience or similar, not specified in this
  string); the WP half IS a clean `1`, but AC4 deliberately keeps BOTH `null` rather than
  half-populating a row whose overall cost is not actually "1 WP, Vitae TBD" — `unparsed`, with the
  full original string preserved in `cost_note`.
- 1 `"Varies"` — Unmarked Grave. `unparsed`.

**Devotions (51 total, 40 with a cost) — messier than disciplines, includes non-numeric costs:**
- 11 `null` + 3 literal `"-"` (City Attunement, Conditioning, Cross-Contamination) — two different
  sentinel spellings for the same "no cost" fact in the live data. AC3 treats both as `zero`.
- ~27 clean `"N V"` (Body of Will "1 V", Cult of Personality "10 V", etc.) — note **"Summoning" appears
  twice** as a distinct document, both "1 V" — a real pre-existing duplicate-name data-quality issue,
  logged to `deferred-work.md`, not this story's to fix (the migration parses both rows independently
  and correctly regardless; the duplicate is a display/data-hygiene concern, not a parsing one).
- 1 `"1 Vitae"` (The Taste of Things Lived) — spelled out, not abbreviated; the parser must match both
  `"V"` and `"Vitae"` as the same unit.
- 1 `"5 V/turn"` (Juggernaut's Gait) — recurring per-turn cost, same shape as disciplines' "per effect."
- 1 `"1 W (Opt 1 V)"` (Hold my Beer) — Willpower base cost with an optional Vitae alternative. Genuinely
  two-dimensional (the `W` here is Willpower, not a typo for `V`) — `unparsed`, not half-populated as
  `willpower_cost: 1`.
- **5 body-mutilation devotions whose cost is a health-damage cost plus an UNQUANTIFIED "+ Vitae"** —
  Eye Behind Glass (`"1L (the eye) + Vitae to fix it"`), The Contagion Principle (`"1L (amputated
  finger segment) + Vitae to implant"`), Face of the New Flesh (`"1 Agg (own face) + Vitae to glue;
  fatal to the mortal donor"`), The Pleasure of the Text (`"1L (split tongue) + Vitae over the
  medium"`), The Soul Transplant (`"1L (sternum) + Vitae; extended surgery on the donor"`). These are
  genuinely `unparsed` — there is no number attached to "Vitae" at all, and the primary cost (Lethal or
  Aggravated health damage) has no field in this schema regardless; the full original text is exactly
  what an ST needs to see, verbatim, in `cost_note`.

### Display Site, Discipline vs Devotion Asymmetry

`fmtRuleStats` (`public/js/suite/sheet-helpers.js:91-102`) is the shared cost-display function for the
three sites its own doc comment says were de-duplicated from separate copies — `editor/sheet.js`,
`suite/sheet-helpers.js`, and `editor/export-character.js` — specifically to stop drift between them.
`powersForDisc` (same file) calls it live, every render, for disciplines — so updating `fmtRuleStats`
makes every discipline's displayed cost correct on the character sheet the moment this ships.

**Correction, found by this story's own code review, not caught during investigation**: "the ONE
shared cost-display function" overstated it. `public/js/print/page2.js` and
`public/js/editor/csv-format.js` each build their own independent `"Cost: " + p.cost` string reading
the raw legacy field directly — neither was ever part of the de-duplication `fmtRuleStats`'s own doc
comment describes, and neither calls `fmtCostLine`. The printed sheet and CSV export can now diverge
from the on-screen sheet for any row this migration touched. Logged to `deferred-work.md` as a real
follow-up rather than expanded into this story's own scope — AC7 named only `fmtRuleStats`.

**Devotions do not go through this path the same way.** `editor/sheet.js`'s own devotion renderer
(around line 800) displays `p.stats` — a string **frozen onto the character's own `powers[]` entry at
the moment the devotion was added** — not read live from `purchasable_powers`. The `DEVOTIONS_DB`
lookup that function does perform (`_devDB()`, same file) is only used there for `db.xp` (XP cost) and
prerequisite text; its own `.cost` field is dead for display purposes. This means: a devotion added to
a character **after** this story ships will show the new structured cost (assuming whatever writes
`p.stats` at add-time also calls `fmtRuleStats`, which needs confirming at dev time — check
`shAddDevotion`-style handlers); a devotion a character **already owns** keeps showing its old frozen
text until re-added. Not a bug to fix here — a real scope boundary worth stating so it isn't discovered
as a surprise at review time.

### Project Structure Notes

- Modified files: `server/schemas/purchasable_power.schema.js`, `public/js/suite/sheet-helpers.js`.
- New files: `server/scripts/gdx-6-structured-power-costs.mjs`,
  `server/tests/gdx-6-structured-power-costs.test.js`.
- Does not touch `editor/sheet.js`'s devotion renderer, `_devDB()`, or anything in `powersForDisc`
  beyond it continuing to call the now-updated `fmtRuleStats` — no signature change to that function
  (still takes one rule object, still returns one string).
- Does not touch `xp_fixed`, XP cost calculation, or anything in `editor/xp.js`.

### References

- [Source: server/schemas/purchasable_power.schema.js] — the whole file; `additionalProperties: false`
  (line 70) and the existing `cost_model`/`special` "must be declared before any row can carry it"
  precedent (lines 137-151, 219-228) this story's own AC1 follows exactly. Existing `cost` field
  declaration at line 115.
- [Source: public/js/suite/sheet-helpers.js:83-102] — `fmtRuleStats`, the single shared display
  function this story updates; its own doc comment records the prior triple-duplication it fixed.
- [Source: public/js/suite/sheet-helpers.js:104-130] — `powersForDisc`, the live-every-render
  discipline consumer of `fmtRuleStats`.
- [Source: public/js/editor/sheet.js:57-93, 796-811] — `_devDB()` legacy shim and the devotion
  renderer proving `p.stats` (a frozen snapshot), not a live `fmtRuleStats` call, is what's actually
  shown for an already-owned devotion.
- [Source: server/scripts/migrate-office-purchases-to-seats.mjs] — plan/apply/main shape exemplar,
  same one xpl.2 cited tonight.
- [Source: 2026-08-15 live queries against tm_suite, this story's own investigation] — the full
  category breakdown, every discipline/rite cost value, the devotion sample set including the five
  body-mutilation rows and the duplicate "Summoning" name. Not re-derivable from any existing doc;
  this story file is now the record.
- [Source: CLAUDE.md — "Previously-static data now MongoDB-backed"] — confirms Epic PP already unified
  `DEVOTIONS_DB` into `purchasable_powers`, the basis for this story's "What this story is NOT" item
  correcting the parent issue's stale "devotions data" framing.
- [Source: GitHub #987 (GDX-6), #988 (GDX-7), #981 (Epic GDX)] — issue text for AC/scope cross-
  reference; `gh issue view <n>` to re-read verbatim if needed.

## Dev Agent Record

### Implementation Plan

Followed the story's own citations exactly: `migrate-office-purchases-to-seats.mjs` for the
plan/apply/main shape and header conventions (no shebang, dry-run default, `MONGODB_DB` override),
`fmtRuleStats`'s own doc comment for where the display fallback belongs, and the real parser patterns
this story's own investigation derived from live data (AC4). The parser (`parseCostString`) was
smoke-tested directly against all 17 real cited samples via a one-off `node -e` script BEFORE writing
the formal vitest suite — 17/17 correct on the first pass — then the same cases were formalised as
real assertions in Task 5, so the smoke test wasn't a substitute for coverage, just an early correctness
check.

### Debug Log

- No RED/GREEN cycle in the strict sense for the parser itself — it's a pure function with no prior
  behaviour to regress, so "tests first" here meant citing the real samples in the smoke test before
  writing the regex, not watching a specific assertion fail against existing code.
- One real design decision made mid-implementation, not pre-specified in the story: `fmtRuleStats`'s
  cost-line logic was pulled out into its own separately-exported `fmtCostLine(r)` rather than being
  inlined, specifically so AC7's four precedence branches could get direct unit coverage instead of
  only being reachable through the full multi-part `fmtRuleStats` string (which also mixes in Pool/
  Action/Duration, unrelated to this story). `fmtRuleStats`'s own external contract (one rule object
  in, one formatted string out) is unchanged.
- `sheet-helpers.js` cannot be imported under plain Node — confirmed by trying, and by precedent
  (`issue-1141-office-tab-render.test.js`'s own header comment describes hitting the same landmine for
  `office-tab.js`). Its own import chain needs `location` and `window` stubbed.
  **Correction (code review, Acceptance Auditor pass): the original version of this note claimed
  `localStorage` was ALSO required, "found by iterating the stub set against the actual error each
  time" — that specific claim was false.** The reviewer reproduced the import with only `location` +
  `window` stubbed and it succeeded; `localStorage` is only touched inside `loader.js` functions when
  actually *called*, not at module-eval time, and this test's `fmtCostLine` cases never call them. If
  the iteration-against-errors methodology had genuinely been followed to completion, it would have
  stopped at two stubs. Corrected here rather than left standing — this is the same "verify by running,
  don't trust a narrated methodology" lesson `feedback_source_contract_regex_false_pass.md` already
  recorded once. The test file's own `localStorage` stub has since been removed as unnecessary.
- No `--apply`/live-write concern — the only direct script invocation outside the test suite was the
  parser smoke-test, which calls `parseCostString` only (no import of `db.js`, no DB connection
  established at all).

### Completion Notes

- All 9 ACs satisfied, all 6 tasks complete.
- Schema: `vitae_cost`/`willpower_cost`/`cost_note` added to `purchasable_power.schema.js`, matching
  the existing `cost_model`/`special` declared-property precedent. None `required`, so every row this
  migration never touches (attribute/skill/manoeuvre/merit) stays valid with all three simply absent.
- Migration script: `server/scripts/gdx-6-structured-power-costs.mjs`. `parseCostString` classifies
  every discipline/devotion/rite `cost` string into `zero`/`parsed`/`unparsed`; `planCostMigration`
  scopes the query and buckets the results; `applyCostMigration` writes `$set` only, three fields,
  never touching `cost` itself; `main()` wires it together with the standard dry-run/`--apply`/
  `MONGODB_DB` CLI shape.
- Display: `fmtCostLine` (new, exported from `sheet-helpers.js`) implements AC7's four precedence
  branches; `fmtRuleStats` now calls it for its own Cost segment instead of the old bare
  `if (r.cost) parts.push(...)`. No signature change to `fmtRuleStats` itself — `powersForDisc` and
  `export-character.js` need no changes, confirmed by `node --check` on both.
- **Real scope correction found during investigation, not assumed from the issue text**: the parent
  GitHub issue says "purchasable_powers schema and devotions data" — stale, Epic PP already unified
  devotions into `purchasable_powers` months before this story. Corrected in the story's own "What
  this story is NOT" section before any code was written.
- **Real data is messier than "N V, N WP, combos"**: live samples include genuine choices ("Free / 1
  V", "1 W (Opt 1 V)"), a range cost ("3–9 V & 1 WP" — deliberately left both fields `null` rather than
  half-populating the clean-looking WP half), and five body-mutilation devotions whose cost is a
  health-damage cost plus an unquantified "+ Vitae" with no number attached at all. All fall to
  `unparsed` with the original text preserved verbatim, per AC3's own "refuse to guess" contract.
- **Duplicate live data flagged, not fixed**: two `purchasable_powers` documents are both named
  "Summoning" (both devotions, both "1 V"). Logged to `deferred-work.md` — pre-existing data hygiene,
  not this story's job; the migration parses and writes both independently and correctly regardless.
- Regression: 194 tests across 10 files, all green (31 new + 88 schema/rules-adjacent + 75 further
  `purchasable_power`-referencing files found by grep before starting). `node --check` clean on all 4
  modified/new JS files.

### File List

- `server/schemas/purchasable_power.schema.js` — MODIFIED (vitae_cost/willpower_cost/cost_note declared)
- `server/scripts/gdx-6-structured-power-costs.mjs` — NEW (parser, plan/apply/main migration;
  post-review: non-string/whitespace/empty-cost guards, corrected console wording)
- `server/tests/gdx-6-structured-power-costs.test.js` — NEW (36 tests: parser, plan, apply/idempotency,
  fmtCostLine; post-review: 5 new edge-case tests, window-stub fix, localStorage stub removed)
- `public/js/suite/sheet-helpers.js` — MODIFIED (new exported `fmtCostLine`, `fmtRuleStats` calls it;
  post-review: corrected `structured` comment)
- `specs/stories/sprint-status.yaml` — MODIFIED (gdx-6 tracked through its status lifecycle)
- `specs/stories/deferred-work.md` — MODIFIED (duplicate "Summoning" devotion name logged; post-review:
  4 more findings logged — print/CSV display bypass, admin editor gap, CSV round-trip, unchecked
  updateOne)
- `specs/stories/code-review/gdx-6-diff.txt`, `specs/stories/code-review/gdx-6-codex-review.md`,
  `specs/stories/code-review/gdx-6-codex-run.log` — NEW (Codex review artefacts from the attempted,
  incomplete external pass — kept for the record, not deleted)

### Change Log

- 2026-08-15: Story implemented end to end in one session. All 6 tasks, all 9 ACs. 194/194 targeted
  regression across 10 files. Status: ready-for-dev → review.
- 2026-08-15: Codex (external) review attempted, hit its own usage limit mid-run before completing any
  pass (unavailable until 2026-08-20) — fell back to internal 3-layer review per the loop's standing
  instruction. 0 decision-needed, 8 patch (all applied, one prove-discriminated), 4 defer (logged),
  4 dismissed. Acceptance Auditor's independent verdict was Ship even before the patch round. 36/36
  regression after patches. Status: review → done.
