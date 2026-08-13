# Story feature.1155: EQC-4 — Programmatic Purchase: Stat-Tweak Request

## Status: done

---
issue: 1155
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1155
branch: ms/issue-1155-eqc4-purchase-stat-tweak
depends_on: ms/issue-1154-eqc3-container-assignment (EQC-3, #1154) — branched from its tip, same
  stacking rationale as EQC-2/EQC-3, in the same dedicated worktree (`TM Suite-eqc`).
---

## Story

**As a** player filing a downtime equipment acquisition,
**I want** to optionally request a one-step stat tweak on the item I'm acquiring, paying one extra
availability dot for it,
**so that** minor customisation ("this pistol, but +1 damage") is a structured, capped request the ST
can see and adjudicate — not an ad hoc negotiation with no anti-cheese guardrail.

## Background

Epic #1038 item 5: *"Programmatic purchasing: pick from the catalogue, availability vs resources
checked automatically. Stat tweaks allowed at one dot of availability per shift, limited to one step
per stat (anti micro-sword cheese). Per Peter, the stat-shift constraint is ~3 lines."*

**Investigation finding, this session**: "availability vs resources checked automatically" is already
built — issue #896 (`isAffordable`/`availabilityCap`/`effectiveAvailability`) already gates the DT
form's equipment dropdown, disabling options a character can't afford (Resources rating + Fixer
reduction). The genuinely new piece is the stat-tweak request.

**Scope decision (Angelus, via AskUserQuestion, this session)**: tweakable stats are the ONE primary
numeric bonus field per bucket-shape a purchased item actually has — `damage_mod` for weapon-shaped
`combat_gear`, `armour_value` for armour-shaped `combat_gear`, `bonus_dice` for `skill_gear`.
`tool_utility` (no numeric bonus by design — "does a thing, no bonus"), `narrative`, and `container`
items have no tweakable field at all. This means every tweakable item has exactly ONE tweakable stat,
so "one step per stat" collapses to "one tweak, always +1, on the one number that matters" for this
scope — matching Peter's own "~3 lines" sizing.

**Architecture decision**: this codebase's equipment rows are deliberately lean references
(`catalogue_id` only — "full stats resolved at render time", EQ-1's own founding design rule, repeated
in every equipment schema comment since). A tweaked item therefore does NOT get a stat-override field
on the equipment row — that would fork this architecture for one feature. Instead, granting a tweaked
item means the ST creates a DISTINCT catalogue entry for the tweaked variant (e.g. "Glock 17 (+1
dmg)") via the catalogue-admin CRUD that already exists (EQC-1), same as creating any other new
catalogue item. This story is scoped to the REQUEST side only — capturing what a player is asking for,
structured and capped — not the granting side, which needs no new infrastructure.

## Explicitly NOT this story

- **No new schema field.** No stat-override on `character.equipment[]` rows. See Architecture decision.
- **No automated granting.** An ST still manually creates the tweaked catalogue variant and assigns it
  via existing tooling (equipment-catalogue-admin.js CRUD + the equipment-add flow from EQC-1/EQC-3).
  This story only structures the REQUEST.
- **No downward tweaks.** The mechanic is "pay more, get a better stat" (anti micro-sword cheese is
  about capping UPGRADES, not modelling downgrades nobody would rationally request). Always +1 to the
  bucket's primary numeric stat, never −1.
- **No stacking multiple tweaks on one item, and no tweaking `tool_utility`/`narrative`/`container`
  items** — they have no primary numeric bonus field to tweak in the first place.
- **No change to the existing affordability-gate dropdown logic for CHOOSING which items appear** —
  that's #896's own established behaviour, untouched. This story adds a tweak checkbox that appears
  AFTER an item is chosen, not a new filtering dimension on the dropdown itself.

## Acceptance Criteria

1. `equipment-derivation.js` exports `equipmentTweakableField(entry)`: returns `'damage_mod'` for a
   weapon-shaped `combat_gear` entry, `'armour_value'` for an armour-shaped `combat_gear` entry,
   `'bonus_dice'` for a `skill_gear` entry, `null` otherwise (including a combat_gear entry that's
   neither weapon- nor armour-shaped, and every `tool_utility`/`narrative`/`container` entry).
2. `equipment-derivation.js` exports `tweakedAvailability(entry)`: returns `(entry.availability ?? 0)
   + 1` when `equipmentTweakableField(entry)` is non-null, `null` when it's not tweakable at all (there
   is no meaningful "tweaked cost" for an item with no tweakable stat).
3. `tabs/downtime-form.js`'s equipment acquisition row (`renderEquipmentRow`) shows a "+1 tweak"
   checkbox once an item is selected, ONLY when that item is tweakable, labelled with which stat and
   the resulting availability cost (e.g. "+1 damage_mod (raises cost to avail 3)"). Unchecked by
   default; state persists via a new `equipment_${n}_tweak` response key (boolean-as-string, matching
   the existing `qty`/`notes` field convention).
4. The row re-renders when the catalogue-item dropdown changes (new delegated-change-handler branch,
   matching the existing pattern for Carthian Pull / rote dropdowns in the same file), so the tweak
   checkbox's visibility tracks the CURRENTLY selected item, not a stale one.
5. When the tweak checkbox is checked and the tweaked cost (`tweakedAvailability`) exceeds the
   character's effective availability cap, the row shows a warning matching the existing
   over-cap-tooltip wording style (`isAffordable`-based) — informational only, does not block saving
   the draft (STs adjudicate DT submissions, same as every other field in this form).
6. `npx vitest run server/tests` (the repo's real regression gate — `npm test` is a no-op stub in this
   project, see `deferred-work.md`): every equipment-related suite green; no new failures.
7. TM Wiki, TM Cockpit, and TM Herald are completely untouched — TM Suite-only.

## Tasks / Subtasks

- [x] **Task 1 — Pure functions** (AC #1, #2)
  - [x] `equipment-derivation.js`: `equipmentTweakableField`, `tweakedAvailability`.
  - [x] Unit tests: every bucket shape, both directions of the combat_gear weapon/armour split, the
        no-stat buckets, null/undefined entries.

- [x] **Task 2 — DT form: tweak checkbox + re-render wiring** (AC #3, #4, #5)
  - [x] `renderEquipmentRow`: conditional tweak checkbox once an item is selected.
  - [x] Delegated change-handler branch for the equipment catalogue dropdown → re-render.
  - [x] Over-cap warning styling matching the existing dropdown-option tooltip convention.
  - [x] `collectResponses`: persist `equipment_${n}_tweak`.

- [x] **Task 3 — Full regression** (AC #6, #7)
  - [x] Every equipment-related vitest suite green.
  - [x] Confirm zero diff under TM Wiki, TM Cockpit, TM Herald.

## Dev Notes

- `equipmentTweakableField` should reuse the SAME shape predicates EQC-1's review already established
  (`isCombatGearWeaponShaped`/`isCombatGearArmourShaped`) rather than re-deriving weapon/armour
  detection a third time — single source of truth, same lesson as every prior EQC story.
- The DT form change-handler pattern already exists for exactly this kind of "dependent UI needs to
  follow a dropdown selection" need (Carthian Pull's target/sphere row, the rote-disc dropdowns) — copy
  that pattern (`collectResponses()` → update `responseDoc` → `renderForm(container)`), don't invent a
  new one.

### Project Structure Notes

- Modified: `public/js/data/equipment-derivation.js`, `public/js/tabs/downtime-form.js`, plus test
  coverage (`server/tests/issue-879-defence-penalty-wirein.test.js` for the pure functions; a
  static-analysis test alongside the existing DT-form checks, likely
  `server/tests/issue-871-876-ecm-4-9-bundle.test.js`, which already covers `renderEquipmentRow`'s
  optgroup structure).
- No schema changes.

### References

- Epic EQC, issue #1038, desired-behaviour item 5.
- `server/tests/issue-896-availability-filter.test.js` — the existing affordability-gate machinery this
  story extends rather than duplicates.
- `specs/stories/feature.1152.eqc1-bucket-container-schema.story.md` — `isCombatGearWeaponShaped`/
  `isCombatGearArmourShaped`, reused here.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5, via `bmad-dev-story`.

### Debug Log References

- Full scoped regression (`npx vitest run server/tests`) before this story's changes: 100 failed
  suites / 79 passed, 2 failed tests, 1149 passed, 1153 skipped (181 files). All 100 failed suites are
  pre-existing DB-connection guard trips (`Refusing to connect: test context (VITEST) targeting
  non-test database 'tm_suite'`) unrelated to equipment. Confirmed via `git stash` isolation before
  writing any EQC-4 code.
- First implementation pass added `equipmentTweakableField`/`tweakedAvailability` to
  `downtime-form.js`'s existing `equipment-derivation.js` import line. That broke issue #896's own
  test (`imports availabilityCap / fixerReduction / effectiveAvailability / isAffordable from the
  helper module`), which asserts an EXACT-match regex on that import statement's brace contents — the
  two new names widened the braces and the regex no longer matched. Fixed by giving the two new
  imports their own `import { equipmentTweakableField, tweakedAvailability } from
  '../data/equipment-derivation.js';` line rather than merging into the existing one. Caught by full
  regression, not by the two touched test files alone (which both still passed 88/88 and 116/116 in
  isolation) — same "prove the whole suite, not just the file you touched" lesson EQC-2's own review
  patch already banked for this module.
- Post-fix full scoped regression: 100 failed suites / 79 passed, 2 failed tests (SAME two
  pre-existing failures, confirmed identical) / 1163 passed (+14, matching the 9 new
  `equipment-derivation.js` tests + 5 new DT-form wiring tests) / 1153 skipped. Zero new failures.

### Completion Notes List

- Implemented `equipmentTweakableField`/`tweakedAvailability` in `equipment-derivation.js`, reusing
  `isCombatGearWeaponShaped`/`isCombatGearArmourShaped` (EQC-1) rather than re-deriving the shape
  check — same single-source-of-truth discipline as every prior EQC story.
- Implemented the DT-form tweak-request checkbox (`renderEquipmentRow`), the delegated-change-handler
  re-render branch (matching the Carthian Pull / rote-disc pattern), and `collectResponses`
  persistence, including the slot-removal shift/clear path so removing a row doesn't leave a stray
  tweak flag on a later slot.
- No schema change, no new write path, no automated ST-granting infrastructure — matches the story's
  explicit scope boundary. A tweak request is captured on the DT submission only; granting still goes
  through the existing catalogue-admin CRUD (create a distinct tweaked catalogue entry), unchanged by
  this story.

### File List

- `public/js/data/equipment-derivation.js` (modified — `equipmentTweakableField`, `tweakedAvailability`,
  review-patched)
- `public/js/tabs/downtime-form.js` (modified — tweak checkbox render, delegated change-handler branch,
  `collectResponses` persistence, slot-removal shift/clear, review-patched)
- `public/js/admin/downtime-views.js` (modified in review patch — surfaces the tweak request to the ST)
- `server/tests/issue-879-defence-penalty-wirein.test.js` (modified — pure-function tests, review-patched)
- `server/tests/issue-871-876-ecm-4-9-bundle.test.js` (modified — DT-form + admin-view wiring
  static-analysis tests, review-patched)
- `specs/deferred-work.md` (modified — two accepted-not-fixed findings recorded)
- `specs/stories/feature.1155.eqc4-purchase-stat-tweak.story.md` (new — this story)

## Senior Developer Review (AI)

**Review path**: Codex external CLI-direct review (the epic's established default) stalled twice mid-run
— it froze after Pass 1 (Blind Hunter) the first time, and got cut off mid-investigation on a resumed
attempt, in both cases before writing Pass 2/3 or a Validation notes section, despite the process
reporting a clean exit. Rather than a third blind retry, switched to the internal 3-layer path (same
three lenses — Blind Hunter / Edge Case Hunter / Acceptance Auditor — run as three independent
subagents in this session). Codex's own completed Pass 1 output (3 Medium + 2 Low, no High) is
superseded by the internal pass's findings below, which independently re-derived and then went well
beyond it (the internal Edge Case Hunter and Acceptance Auditor both had full repo/spec access Codex's
Pass 1 never reached).

**Findings and dispositions** (all three layers converged independently on the two High items, which is
why they're rated High despite neither being a hard AC-text breach on its own):

- **[High, patched]** The ST-facing admin submission renderer (`admin/downtime-views.js`) never read
  `equipment_${n}_tweak` — a request was captured on the response doc but visible nowhere in the app,
  directly undermining the story's own "so that" clause ("a request the ST can see and adjudicate").
  Confirmed via full-repo grep (only `downtime-form.js` itself referenced the key). Patched: the
  Equipment block now resolves the tweak via `equipmentTweakableField`/`tweakedAvailability` and appends
  a `requesting +1 <field> (avail <n>)` label when a genuinely-tweakable item was flagged. Static-analysis
  regression test added; prove-discriminated (reverted the read condition, confirmed the exact new test
  failed, restored).
- **[High, patched]** A checked tweak request silently carried over onto a different, newly-selected
  tweakable item in the same row — `collectResponses()` runs before the row re-renders on a dropdown
  change, so it read the OLD item's still-checked checkbox alongside the NEW item's `catalogue_id`, and
  the checked state was keyed only by row index, not by which item was selected. Patched: the dropdown
  change-handler branch now explicitly clears that row's own `equipment_${n}_tweak` on every selection
  change (parses `n` from `e.target.id`), so a freshly-selected item's checkbox always starts unchecked.
  Prove-discriminated (removed the two clearing lines, confirmed the exact new test failed and nothing
  else, restored).
- **[High → treated as Medium/AC-text violation, patched]** AC #5's literal wording gates the over-cap
  warning on the checkbox being CHECKED ("When the tweak checkbox is checked and the tweaked cost …
  exceeds …"); the first version showed the warning whenever the cost was over cap regardless of checked
  state. Patched: `warning` is now gated on `isChecked && tweakCost > rawMax`. Prove-discriminated.
- **[Medium, patched]** `equipmentTweakableField`'s `skill_gear` branch returned `'bonus_dice'`
  unconditionally, contradicting the function's own docstring ("or null if the entry has no tweakable
  numeric bonus at all") — a stat-less skill_gear row (schema-valid; `bonus_dice` is nullable) would
  still offer a "+1 bonus_dice" request. Patched: added a `entry.bonus_dice != null` guard, mirroring the
  combat_gear branch's own populated-field discipline. Prove-discriminated. New boundary-case test added.
- **[Medium, documented not fixed]** A `combat_gear` entry with BOTH weapon-shape and armour-shape fields
  populated (confirmed reachable — the catalogue-admin form exposes both field sets on one combat_gear
  item, no mutual-exclusivity check) always resolves to the weapon tweak, since
  `isCombatGearWeaponShaped` is checked first. No design ruling favours one stat over the other for a
  hybrid item, and the story's own scope is exactly one tweakable stat per item — added an explicit code
  comment documenting this is a deliberate (if arbitrary) tie-break rather than an accidental one, plus a
  regression test pinning the current (documented) behaviour. Not a functional fix; a design question
  for whoever next touches hybrid combat_gear items, not this story's to resolve.
- **[Medium, deferred — see `deferred-work.md`]** A tweak on an availability-5 item computes a cost (6)
  the catalogue schema's own `maximum: 5` cannot represent. Informational-only per AC #5 (doesn't block
  the draft); the story's stated grant mechanism (a distinct catalogue entry) simply has no valid target
  at that cost. Out of this story's scope to resolve (would mean raising the schema's global cap or
  silently capping the display, both bigger/unrelated changes).
- **[Low, patched]** Two DT-form static-analysis tests had titles claiming more than their bodies
  checked (one claimed to verify conditional rendering but only checked textual ordering; one claimed to
  verify the persisted value came from checkbox DOM state but only checked that *some* assignment
  existed). Both tightened to actually verify the claim (checkbox markup genuinely nested inside the
  `if (tweakField)` block; the persisted value's right-hand side is `tweakEl ? String(tweakEl.checked) :
  ''`).
- **[Low, dismissed]** A concern that `tweakedAvailability`'s raw (non-Fixer-adjusted) figure compared
  against `rawMax` might be a units mismatch — checked with full repo access: `tweakCost > rawMax` is
  algebraically identical to "the Fixer-adjusted tweaked cost exceeds the Resources cap" (the same
  relationship `isAffordable` expresses, just rearranged into raw units), and the pre-existing dropdown
  footnote this code's wording deliberately matches (per AC #5) already labels `rawMax` itself as
  "effective availability cap" in its own UI copy. Not a bug; dismissed with the Acceptance Auditor's
  independent confirmation.
- **[Low, dismissed — pre-existing convention]** Numeric-string `availability` values silently treated
  as 0 by `Number.isInteger` — matches the exact convention `effectiveAvailability` already uses
  elsewhere in the same file; not a defect this diff introduced, and not this story's place to revisit a
  codebase-wide convention.
- **[Low, dismissed — pre-existing pattern]** The new dropdown change-handler branch returns before the
  change-listener's trailing `scheduleSave()` call — true, but every sibling branch using the same
  "collect → responseDoc → renderForm → return" pattern (Carthian Pull, rote-disc, project-action,
  sphere-action, feed-pool-select, etc.) already has this exact characteristic; the Dev Notes explicitly
  instructed copying that pattern. Not a regression this story introduced.

**Post-patch verification**: `npx vitest run server/tests` — 100 failed suites / 79 passed, 2 failed
tests (the same two pre-existing, unrelated failures) / 1169 passed (+6 over the pre-patch count, the
new patch-regression tests) / 1153 skipped — matches the pre-patch baseline exactly on suite/failure
counts, zero new failures. Every patch prove-discriminated individually (single-change revert → confirm
the exact expected test fails and nothing else → restore → confirm green) before this final run.
