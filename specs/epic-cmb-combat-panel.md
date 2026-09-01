# Epic: CMB — Combat Panel

**Goal:** Replace the already-shipped but underused list-row Combat tab (`nav-9-combat-st-tool`,
`public/js/game/combat-tab.js`) with a card-based combatant tracker validated against a clickable
prototype this session: collapse-by-default cards (Name/Initiative/Health, one expanded at a time),
free drag-to-reorder turn order with a dice-preserving Reset, and an Attack modal that replaces the
fixed per-character pool button with a target+type picker whose preloaded pool is always freely
adjustable and never gates a custom roll.

**Why:** Angelus (sole ST, plays this on a phone/tablet mid-LARP) wants combat to help him do maths
and remember equipment, not replace his judgement. Three explicit non-negotiables carried into every
story below: **phablet/fingertip-first** (every interactive control assumes a thumb, not a mouse);
the tool must **never constrain a roll he wants to make outside the rules**; **"support rails, not
handcuffs"** — every rules-derived number is an editable pre-fill, never a gate.

**Source:** one 2026-09-01 session — an iterative clickable HTML mockup (a real interactive Artifact,
not code) built and corrected across roughly six rounds of direct feedback, plus a 2026-09-01
party-mode roundtable (Dana/Sally/Game Designer/Bob) that turned the validated mockup into this epic.

Grounded against real code and two real rules sources:
- `public/js/game/combat-tab.js` (the code this epic supersedes), `public/js/data/accessors.js`
  (`calcDefence`/`calcHealth`/`calcWillpowerMax`/`calcVitaeMax`/`calcSpeed`),
  `public/js/data/equipment-derivation.js` (`isEquipmentOnMe`, `isCombatGearWeaponShaped`),
  `server/schemas/equipment_catalogue.schema.js`, `public/js/game/tracker.js` (`trackerRead`/
  `trackerAdj`, the player-facing Tracker tab this shares `tracker_state` with),
  `server/routes/tracker.js`.
- Vampire: The Requiem 2nd Edition core rulebook, pp.175-182 (Attack, Defense, Ranged/Melee weapon
  charts, Armor, Injury and Healing) — `st-working/reference/Vampire the Requiem 2e Rulebook.md`.
- Terra Mortis's own Conflict Errata (Google Doc house-rule layer) — **ruled authoritative over core
  RAW wherever the two disagree** (Angelus, this session).

---

## Decisions made this session (do not relitigate)

1. **Errata beats RAW wherever they conflict, as a standing rule for this epic and any future combat
   work.** Concretely for CMB: Thrown Weapons use Strength + Athletics (not core's Dexterity), and
   Kindred damage resolves as the errata's specific split — the weapon's flat rating stays Lethal,
   every rolled success beyond that is Bashing (a 0-rated weapon upgrades its first success only).
   This is NOT deferred to a future errata epic — it's the correct combat math for TM Game today, so
   building CMB's Attack/Damage stories against core-only numbers would be knowingly shipping
   something wrong.
2. **The damage split displays as worked arithmetic, not a suggestion chip.** Copy names both
   audiences explicitly, e.g. "8 successes → 3 Lethal (a mortal takes this too) + 5 Bashing to
   Kindred (a mortal would take these as Lethal too)" — both numbers land in the same already-editable
   +L/+B damage fields. Rejected: a dismissible "chip" treatment (implies the split is optional when
   it isn't) and a silent auto-apply with no visible working (teaches nothing, and turns the tool into
   an unreviewable black box on the one number that matters most after a roll).
3. **Only one card is expanded at a time.** Expanding a card auto-collapses whatever was previously
   open. Chosen over free multi-expand because the actual failure mode at the table is losing track of
   the turn order on a phone screen with two or three cards open at once, not wanting to compare two
   expanded cards side by side.
4. **Scope boundary — new stateful mechanics are OUT of this epic**, deferred to a future epic
   (proposed code `CERR`, not started, referenced here only so it doesn't get silently absorbed): the
   errata's rewritten contested-overpower grapple, Tilts (Immobilised/Knocked Down/Stunned), reflexive
   off-turn blood-spend healing (an interrupt to the turn order, not a number), and errata-specific
   items (handcuffs/stun guns/pepper spray). These all introduce a NEW stateful concept the card model
   doesn't have yet (a relationship between two cards, a durable per-combatant condition, an off-turn
   interrupt) rather than just correcting a number CMB already computes — different risk profile,
   different epic. If a CMB story's implementer finds themselves reaching for one of these to make a
   number "feel right," that's a signal to stop and raise it, not to fold it in quietly.
5. **"Other" (a fully custom, zero-preload dice pool) is a first-class option on every attack-type
   surface, not a fallback.** Every story that adds a rules-assist must be able to answer "what's the
   Other here" — this is the actual guarantee against the tool ever constraining Angelus, more than
   any individual field being editable. A pool that becomes non-editable, or a submit action gated on
   a selection being made first, fails review on sight.
6. **`nav-9-combat-st-tool`'s `sprint-status.yaml` entry gets cross-referenced from cmb.1 as
   "superseded by Epic CMB"** so it doesn't read as duplicate/competing work later.

---

## Stories

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| cmb.1 | Card-based combatant tracker shell (re-skin, real data) | backlog | Port + re-skin of `combat-tab.js`; no new mechanics. See detail below. |
| cmb.2 | Drag-to-reorder turn order + Reset to Rolled Order | backlog | Needs cmb.1's card DOM. See detail below. |
| cmb.3a | Attack modal shell — target, type, adjustable pool (errata-correct) | backlog | The epic's highest fingertip-risk surface. See detail below. |
| cmb.3b | Equipped-weapon integration into the Attack modal | backlog | Depends on cmb.3a existing. See detail below. |
| cmb.3c | Kindred damage-split arithmetic on the damage-entry step | backlog | Depends on cmb.3a/3b's rolled pool existing. See detail below. |

### cmb.1 — Card-based combatant tracker shell (re-skin, real data)

Re-skins `combat-tab.js`'s existing list-row render as the collapse-by-default / tap-to-expand card
validated in this session's mockup, against real `suiteState.chars` and real `tracker_state` — not a
green-field build, and not a new mechanic. Everything the current tool already does (park from
roster including NPC/opponent characters via the existing merge logic, roll initiative once per
encounter, adjust health via +B/+L/+A/− and Vitae/Willpower via +/-) must keep working identically
once re-skinned.

- **Pre-flight data checks, do before writing ACs** (Dana, this session — not yet independently
  verified against live data, only against the code as read): confirm `server/routes/tracker.js`'s
  write mechanism is atomic (`$inc`-style) rather than a full-document read-modify-write PUT. Combat
  adds a third simultaneous writer path (ST via Combat) alongside the two `tracker_state` already
  supports (player's own Tracker tab; ST/dev unconditional per `canAccess()`) — if the write is
  full-document, two near-simultaneous edits from two open surfaces on the same character can stomp
  each other. If confirmed unsafe, this becomes its own AC/fix inside cmb.1, not a silent risk.
- Collapsed card shows Name, Initiative, Health only (NPC/Incapacitated tags still show collapsed —
  they're identity/status, not detail). Tapping the header row (a real `<button>`, structurally
  separate from the card's own drag handle — see cmb.2) expands to the full card: Vitae/Willpower/
  Health tracks, Defence, Movement/Speed chips, an Attack button (wired in cmb.3a), raw damage
  +B/+L/+A/− controls. **Only one card expanded at a time** — expanding a new card collapses whatever
  was previously open (Decision 3).
- Beginning a drag gesture on the card's own handle must never also fire the header's expand toggle,
  and releasing a tap on the header must never register as an abandoned drag — literal AC, not "feels
  fine," since this is exactly the kind of thumb-imprecision failure that only shows up under real
  touch use, not a mouse click-through.
- Derived numbers on the expanded card (Defence, Health/Willpower/Vitae max, Speed) come from the real
  accessor functions in `public/js/data/accessors.js` — never reimplemented or hardcoded, per this
  project's own "derived stats are never stored" rule.
- **Every interactive control on the collapsed AND expanded card measures a real, hit-testable
  minimum of 44×44px** (this project's own `--tap-min` token, already used elsewhere in
  `public/css/suite.css`). This is a literal, computed-box AC, not a visual-size-plus-invisible-bigger-
  hit-zone trick — that pattern was tried and rejected during this session's own mockup work because
  it technically passes a hit-test without feeling tappable to a real thumb. Also: no two adjacent
  controls sit close enough together that a normal fingertip width can't distinguish them (a defined
  minimum gap, not just each control individually hitting 44px).
- Test coverage for the old list-row DOM is carried forward or rewritten against the new card DOM —
  nothing from `combat-tab.js`'s existing suite silently goes dark.
- Mark `nav-9-combat-st-tool` superseded in `sprint-status.yaml` (Decision 6).

### cmb.2 — Drag-to-reorder turn order + Reset to Rolled Order

Lets the ST freely reorder the turn line by drag without ever mutating a card's own rolled initiative
value, plus a control that snaps the whole line back to rolled order at any time.

- Data-model change: the encounter's combatant list stores `rolled_initiative` and the current turn
  **position** as two distinct fields. Dragging writes position only — `rolled_initiative` is set once
  at roll time and never touched again by a reorder.
- Drag is implemented via touch/pointer events, not a mouse-only drag handler — literal AC given
  fingertip-first is non-negotiable for this whole epic, not "works when tested with a mouse in dev."
- "Reset to Rolled Order" restores every parked combatant's position from `rolled_initiative` in one
  action. Verified with a scenario where at least one card has already been dragged out of rolled
  order first, not just on an untouched list.
- Explicitly supports the motivating use case: a temporary initiative bump (a Celerity-style effect)
  can move a card up for its duration, then get reset later, without the original roll ever being
  lost in between.
- **Pre-flight data check** (Dana): confirm what's actually lost if the scene state (`tm_combat_scene`
  today, or wherever this data lives after cmb.1) is sessionStorage-only and dies on a tab reload
  mid-encounter. If the blast radius is "re-park and re-roll" (health/Vitae/Willpower are safe either
  way — those already live in the persisted `tracker_state`), that may be an acceptable trade-off to
  record explicitly rather than silently accept; if the ST regularly plays across a session long
  enough that a reload is likely, this may instead argue for persisting scene state (at minimum to
  `localStorage` for same-device reload survival). Angelus's call once the actual risk is confirmed,
  not an assumption either way.

### cmb.3a — Attack modal shell: target, type, adjustable pool (errata-correct)

Attack opens a modal: pick a target from the scene (their Defence shown, struck through if already
spent this turn), pick an attack type (Unarmed / Melee / Ranged / Thrown / Other), the type preloads a
computed dice pool that is always freely adjustable via a +/- stepper, "Other" starts from a fully
custom pool with no preload at all. Pool formulas are the **errata-corrected** versions per Decision 1
(Thrown = Strength + Athletics; Ranged never subtracts Defence, and per the rulebook the target's
Defence itself doesn't apply against firearms — reflect this in how the target's DEF chip reads when
Ranged is selected, not just in the math).

- **Literal AC, not a vibe:** for every attack type including the preloaded ones, the stepper can move
  the pool to any integer value down to 0 — nothing about a computed preload is read-only, and nothing
  blocks submitting an adjusted value. Test this explicitly for each type, including "Other."
- "Other" is never a visually or functionally lesser path — same reachability, same visual weight as
  every rules-preset type, every time (Decision 5). A pool disabled or hidden until a type is picked
  fails review on sight.
- "Already spent this turn" (for the struck-through Defence display) is driven by real per-turn state
  from cmb.1/cmb.2's turn tracking, not a standalone flag invented for this modal.
- **This is the epic's single highest fingertip-risk surface** — it is new UI, not a re-skin. The
  whole target→type→pool flow needs to be reviewed and tested on an actual touch/phablet viewport,
  one-handed, thumb-only — not approved off a desktop mouse click-through. Given Angelus cannot smoke-
  test this app locally (per this repo's own CLAUDE.md), this story's own Dev Agent Record should
  explicitly state how touch behaviour was verified, not just that Playwright specs pass at a narrowed
  desktop viewport.
- Do not bundle this story with cmb.3b or cmb.3c — this is new-UI risk on the epic's most sensitive
  surface, and deserves a review pass focused entirely on touch behaviour and the "never gates a
  custom roll" rule, uncontaminated by catalogue-integration or damage-math bugs from the other two.

### cmb.3b — Equipped-weapon integration into the Attack modal

Shows only the attacker's actually-equipped weapons per attack type as tappable chips, reusing the
real `combat_gear` catalogue shape and the real "on you" equipment rule, and folds the selected
weapon's rating into the preloaded (still freely adjustable) pool.

- **Pre-flight data check** (Dana): confirm `damage_mod`/`damage_type` are actually populated on live
  `combat_gear` documents, not just present in the schema — a schema allowing a field says nothing
  about whether every existing catalogue entry has it filled. A one-time query for `combat_gear` docs
  missing either field, run before this story is considered done, not after a live gap surfaces mid-
  session.
- Weapon list per type is sourced from the character's real equipped gear, filtered by the existing
  `isEquipmentOnMe` rule (`carried`/`worn`/`active` only — `stashed`/`lost` never appear) — not a
  re-derived copy of that rule.
- A character with nothing equipped for a given type still gets a usable modal (falls through to the
  base/unarmed pool, or to "Other") — never a dead end.
- Selecting a weapon updates the preload but the stepper still overrides freely — re-assert cmb.3a's
  "never gates a custom roll" AC here explicitly, since this is the story most likely to accidentally
  reintroduce a lock (a pool disabled until a weapon is picked is the wrong shape and fails review).
- Confirmed against real character data with genuinely equipped items, not a fixture shaped like the
  catalogue but not sourced from it.

### cmb.3c — Kindred damage-split arithmetic on the damage-entry step

Once a pool from cmb.3a/3b has been rolled (rolling itself may still hand off to the existing Roll
tab, matching `combat-tab.js`'s current `quickRoll` pattern — this story is about what happens to the
result, not about building a new dice engine), the damage-entry step shows the errata's Kindred split
as worked arithmetic per Decision 2, both halves landing in the already-existing +L/+B damage fields
and both freely re-editable before being applied.

- Weapon rating (the flat `damage_mod`, or 1 for a 0-rated weapon per the errata's own carve-out)
  stays Lethal; every additional rolled success is Bashing. Copy names both audiences explicitly
  (mortal vs. Kindred) rather than presenting bare "L/B" numbers — see Decision 2's exact phrasing
  example.
- This is a pre-fill into the existing damage controls, not a separate calculation the ST has to
  notice and manually reconcile against them — landing in the same +B/+L/+A/− fields cmb.1 already
  built, editable before and after.
- Depends on cmb.3a (the rolled pool) and cmb.3b (the weapon's actual rating) both existing first; do
  not bundle with either — this is arithmetic on their output, a distinct and separately-reviewable
  concern from "does the modal work" and "are the right weapons offered."
