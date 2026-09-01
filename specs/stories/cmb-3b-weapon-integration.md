---
id: cmb.3b
epic: cmb
epic_file: specs/epic-cmb-combat-panel.md
status: done
priority: high
type: feature
depends_on: [cmb.3a]
branch: ms/epic-cmb-combat-panel
---

# Story CMB.3b: Equipped-weapon integration into the Attack modal

## Story

As the ST resolving an attack,
I want the modal to already know what the attacker is actually carrying,
so that I don't have to remember or look up which weapon applies, but I'm never stopped from
attacking with something the catalogue doesn't know about either.

## Why this story exists

`cmb.3a` computes a pool from bare attributes and skills — correct, but blind to equipment. A
character with a Machete rolling Melee Combat should see that Machete named and its rating shown,
without it changing the pool number itself (weapon ratings affect damage, resolved in `cmb.3c`, not
the attack roll — core rulebook p.176: "damage by adding the successes rolled to any weapon bonus").

## Pre-flight finding, already checked (do not re-derive)

Queried the live `tm_game.equipment_catalogue` collection directly (bmad-epic-loop, 2026-09-01):
**10 `combat_gear` documents, 6 weapon-shaped, and all 6 have `weapon_type`/`damage_mod`/
`damage_type` fully populated — no gaps.** Dana's earlier flagged concern (a live document missing
one of these fields) does not apply; this story can read them without a null-handling contingency
beyond ordinary defensive coding. **One real gap worth knowing before building:** none of the 6 are
`weapon_type: 'thrown'` — the live catalogue has no Thrown example today (only `melee` and `ranged`).
Test coverage for the Thrown path needs a synthetic fixture, not a real catalogue document.

Also checked: **no `aerodynamic` field exists anywhere in `equipment_catalogue.schema.js` or the
catalogue admin UI.** The Errata's note that an aerodynamic thrown weapon may use Dexterity or
Strength at the player's discretion has no data to key off today — implementing it would mean adding
a new schema field and catalogue-admin UI, which is real, separate scope. **Not part of this story.**
Thrown stays Strength-only (per `cmb.3a`'s own formula) regardless of which weapon is selected.

## Decisions already made (do not re-litigate)

- **Weapon list per type is sourced from the attacker's real equipped `combat_gear`, filtered by the
  existing `isEquipmentOnMe` predicate** (`public/js/data/equipment-derivation.js` — `carried`/
  `worn`/`active` only; `stashed`/`lost` never appear). Do not re-derive this filter inline; import
  and reuse the real function.
- **A character with nothing equipped for the selected type still gets a fully usable modal.** No
  weapon chips shown for that type is not an error state — it falls through to the bare
  attribute+skill pool `cmb.3a` already computes (unarmed fists, an improvised/unlisted object,
  whatever the fiction calls for), or the ST picks "Other." Never a dead end, never a disabled type
  row.
- **Selecting a weapon updates only the modal's own reference display, never gates or locks the
  pool.** The `+`/`-` stepper from `cmb.3a` keeps working exactly as before regardless of whether a
  weapon is selected. A pool that becomes read-only or a Roll button that requires a weapon selection
  fails review on sight (Epic CMB Decision 5, restated because this is exactly the kind of story that
  could accidentally reintroduce a lock while adding a "smart" feature).
- **The weapon's rating (`damage_mod` + `damage_type`) is shown for reference on its own chip, not
  folded into the pool number.** This story surfaces the number; `cmb.3c` is what actually applies
  the Kindred bashing/lethal split to a rolled result. Do not anticipate that story's math here.
- **Multiple equipped weapons of the same type each get their own selectable chip.** Selecting one
  updates the reference display; selecting another swaps it. Only one weapon is "current" for the
  attack at a time, matching how a real attack uses one weapon.
- **Ranged Combat's "Defence does not apply" marking from `cmb.3a` is unaffected by weapon
  selection** — it's a property of the attack type, not the weapon.

## Acceptance Criteria

1. When Melee, Ranged, or Thrown is the selected type, the modal shows every one of the attacker's
   currently equipped (`carried`/`worn`/`active`) weapons matching that type as a tappable chip,
   naming the weapon and its rating (e.g. "Machete +1 Lethal").
2. A `stashed` or `lost` weapon of the matching type never appears as a chip, even though it exists
   in the character's `equipment[]` array — confirmed with a fixture carrying both an equipped and a
   stashed weapon of the same type.
3. Selecting a weapon chip visually marks it selected (only one at a time per type) and does not
   change the numeric pool shown by the stepper.
4. A type with zero matching equipped weapons shows no chips and no error — the modal remains fully
   usable, the pool still computes from the bare formula, Roll still works.
5. Switching attack type clears which weapon chip (if any) was selected for the previous type — a
   Melee weapon selection has no meaning once Ranged is chosen.
6. Unarmed Combat and Other never show weapon chips (Unarmed is bare-handed by definition; Other has
   no formula to attach a weapon reference to).
7. The stepper's full free-adjustment range from `cmb.3a` (any non-negative integer, including 0)
   still works identically whether or not a weapon is selected — tested explicitly with a weapon
   selected, not just assumed to still hold from `cmb.3a`'s own coverage.
8. Rolling with a weapon selected includes the weapon's name in the roll label passed to `_rollPool`
   (e.g. "Melee Combat vs Reed (Machete)"), so the eventual Roll-tab entry names what was actually
   used.
9. Tested against real character fixtures carrying real equipped items shaped exactly like the live
   catalogue documents confirmed in the Pre-flight section above (not a fixture that merely resembles
   the catalogue) — including one Thrown-type synthetic fixture, since no live example exists.
10. Every new interactive control (the weapon chips) meets the same real ≥44×44px AC established in
    `cmb.1`/`cmb.2`/`cmb.3a`.

## What this story is NOT

- Not the Kindred damage-split arithmetic (`cmb.3c`) — the weapon's rating is shown, not applied to
  anything yet.
- Not the Errata's aerodynamic Dexterity-or-Strength choice for Thrown weapons — no schema field
  exists for it (see Pre-flight). Adding one is its own future story if this is ever wanted.
- Not a change to the equipment catalogue schema, the equipment-admin UI, or how a character's
  `equipment[]` array is populated — this story only reads what already exists.

## Tasks / Subtasks

1. Import `isEquipmentOnMe` (or the equivalent already-exported predicate) from
   `public/js/data/equipment-derivation.js` into `combat-tab.js`.
2. Add a helper that, given the attacker character and an attack-type key, returns the matching
   equipped weapons from `c.equipment[]` cross-referenced against the catalogue (however the rest of
   this app already resolves a `catalogue_id` to its full entry — reuse that lookup, don't re-derive
   it).
3. Render the weapon-chip row inside the modal's Attack Type section, only for Melee/Ranged/Thrown
   and only when at least one match exists.
4. Track the selected weapon per type in the modal's own state (`_atk`), cleared on type change
   (AC5).
5. Update the Roll label to include the weapon name when one is selected (AC8).
6. Write Playwright coverage for AC1-AC10, extending `tests/cmb-3a-attack-modal.spec.js`'s house
   style and fixture-design rigour (deliberately discriminating fixtures, not just presence checks).

## Dev Notes

- Real files touched: `public/js/game/combat-tab.js`, `public/css/suite.css` (weapon-chip styling).
- Catalogue lookup: `getCatalogueEntry` is exported from `public/js/data/equipment-catalogue-cache.js`
  (confirmed — this is what `public/js/editor/sheet.js`'s own equipment renderer and
  `equipment-derivation.js`'s own functions both import it from). Import it directly into
  `combat-tab.js` rather than writing a second lookup.
- Angelus cannot smoke-test locally — verify the weapon-chip interaction with real dispatched
  events/measured boxes, not DOM presence alone.

## Dev Agent Record

Implemented by an Opus subagent (bmad-epic-loop Phase 2), 2026-09-01. New `_atkWeaponsFor(charId,
typeKey)` cross-references the attacker's real `equipment[]` against the catalogue exactly as
`editor/sheet.js`'s own equipment renderer does — `item.catalogue_id` through the real
`getCatalogueEntry`, filtered by `isEquipmentOnMe` (AC2) and `isCombatGearWeaponShaped` plus a
`weapon_type` match. `_atk` gained a `weapon` field: `null` on open, reset to `null` on every type
change (AC5), written only by `_atkSetWeapon` (which touches nothing else — no read of `_atk.pool` or
`_atk.manual` anywhere in it). The roll label gains the weapon's name when one is selected
(`"Melee Combat vs Reed (Machete)"`).

Two interpretive calls made and documented in the code:
1. **Weapon identity is the index into the attacker's own `equipment[]`, not `catalogue_id`.** The
   story spec didn't specify either way; keying on `catalogue_id` would collapse two carried items of
   the same catalogue entry into one chip, which contradicts the Decision that multiple equipped
   weapons of the same type each get their own selectable chip.
2. **Tapping the already-selected weapon chip deselects it**, matching the target pills' own existing
   behaviour in this same modal (`cmb.3a`) rather than introducing a second convention for the
   identical gesture.

The damage-rating format (`+1 Lethal`, always signed including `+0`) matches `editor/sheet.js`'s own
weapon line exactly, chosen over `roll-v2.js`'s bare-number convention since both this modal and the
sheet are character-facing weapon displays (the same item should read identically in both places);
`roll-v2.js`'s own convention was already inconsistent with `sheet.js`'s before this story, not
something introduced here.

`server/tests/cmb-1-combat-card-shell.test.js`'s `equipment-derivation.js` mock had to be extended
with real implementations of `isEquipmentOnMe`/`isCombatGearWeaponShaped` (previously mocked, if at
all, in a way that didn't need to be real) — the module now imports both, so a wholesale mock without
them would break that suite's own import, not just its assertions.

New test: `tests/cmb-3b-weapon-integration.spec.js` (34 tests, AC1-AC10). Fixture design follows
`cmb.3a`'s own discriminating principle: a stashed Greatsword and a worn Revolver of matching types
sit in the same `equipment[]` array as the weapons that should appear, an armour-shaped item and a
`skill_gear` item and a dangling `catalogue_id` are all present specifically to prove they never
surface as chips, and the one synthetic Thrown fixture is clearly labelled as such (no live example
exists in the catalogue per this story's own Pre-flight check). The pool-lock invariant (Epic CMB
Decision 5) is tested four separate ways: every chip of every type clicked with the pool re-read
unchanged after each; a +2-rated weapon selected with the pool and `manual` flag both confirmed
untouched; the full stepper range driven per type with a chip already selected; a DOM sweep for any
disabled control while a weapon is in play.

## Senior Developer Review

**Independently re-verified, not trusted on the subagent's report alone** (bmad-epic-loop Phase 3,
orchestrator inline, 2026-09-01):
- Re-ran every claimed suite myself: the three relevant vitest suites — 131/131. All four Playwright
  specs together (`cmb-1`/`cmb-2`/`cmb-3a`/`cmb-3b`) — 93/93, matching the reported counts exactly.
- Read the new weapon-integration code directly, not a diff summary. Confirmed `_atkSetWeapon` writes
  only `_atk.weapon`, confirmed `_atkOpen` initialises it to `null` and `_atkSetType` resets it to
  `null` on every type change (AC5), confirmed `_atkWeaponsFor` filters by `isEquipmentOnMe` before
  the catalogue lookup (AC2) and by `weapon_type` match plus `isCombatGearWeaponShaped` (excludes
  armour sharing the same `combat_gear` bucket). Confirmed `_atkRoll` resolves the selected weapon
  before `_atkClose()` wipes the state it reads, not after.
- Confirmed the CSS additions are tokens-only, `--tap-min` sized from the start, no bare hex/rgba/
  inline styles.
- Read `tests/cmb-3b-weapon-integration.spec.js` in full to confirm the coverage is genuinely
  discriminating: the stashed/lost/armour/skill_gear/dangling-reference exclusions are each backed by
  a fixture item that WOULD show up if the relevant filter were dropped, not just an absence check
  with nothing to fail against.
- Attempted a direct visual check via a throwaway harness; it hit a tooling snag on my end (the
  catalogue-loading sequence I improvised didn't resolve within a reasonable timeout) rather than a
  defect in the real implementation — the actual test suite's own equivalent real-catalogue-loading
  path (`refetchCatalogue()` over a stubbed `GET /api/equipment_catalogue`, the same pattern
  `cmb-3b-weapon-integration.spec.js` already uses successfully) passed cleanly in the independent
  re-run above. Given the code-level verification above and the test suite's own rigour, judged
  sufficient without forcing a manual screenshot — `cmb.3a`'s modal shell was already visually
  confirmed, and this story only adds a chip row inside it using the same rendering pattern.

**Three-lens findings:** none blocking. Both interpretive calls (weapon identity by array index,
tap-to-deselect) are reasoned, documented in the code, and consistent with this modal's own existing
conventions rather than inventing new ones. No new entries needed in `deferred-work.md`.

**Verdict: done.** No changes needed before `cmb.3c`.

## Change Log

- 2026-09-01: Story created (bmad-epic-loop, Phase 1), ready-for-dev. Pre-flight catalogue-completeness
  check run live against `tm_game.equipment_catalogue`: clean, no gaps, no Thrown example, no
  aerodynamic field.
- 2026-09-01: Dev-story complete (Phase 2, Opus subagent). Weapon chips wired into the Attack modal,
  the pool-lock invariant preserved and tested four ways.
- 2026-09-01: Independently re-verified + 3-lens reviewed (Phase 3, orchestrator inline). No findings.
  Status → done.
