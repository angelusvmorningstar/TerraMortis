# Story gdx.11: Vampire Mechanics quick actions + free Custom Pool builder on the roll tab

Status: ready-for-dev

<!-- Explicitly NOT to be dev-storied today, per Angelus's own instruction when this story was
     created. Do not start implementation on receipt of this file without a fresh, current go-ahead. -->

## Story

As an ST running a live game (and, on the same shared surface, any player rolling their own
character),
I want one-tap access to common VtR 2e mechanics (Frenzy Resistance, Riding the Wave, Clash of
Wills, Lash Out, Humanity Check, Blood Bond Resistance, Staking) and a free Attribute×Skill×Discipline
pool builder, right on the roll tab,
so that I stop having to flip to the character sheet, read dots off by eye, and do the arithmetic
by hand every time I want a roll outside the 15 hardcoded `COMMON_ACTIONS` combos or a skill's
single default attribute pairing.

## Why this story exists

Angelus (ST) found the roll tab's picker gated behind pre-scripted choices: `openPanel()`
(`public/js/app.js`) only offers **Character**, **Discipline** (a loaded character's own owned
powers), **Common** (`COMMON_ACTIONS`, 15 hardcoded Attribute+Skill combos), and **Auspex**
(read-only reference text). There is no way to freely combine any Attribute + Skill + Discipline,
and zero quick-action wiring for common table mechanics.

This story is the product of an in-session design pass: `/bmad-party-mode` review (Sally/UX,
Dana/Data Steward, Winston/Architect, Quinn/QA), rulebook research grounded in
`st-working/reference/Vampire the Requiem 2e Rulebook.md`, live data-shape verification against
this repo's real source (not assumed), a phone-density redesign pass, and an approved visual
mockup: https://claude.ai/code/artifact/0cd782d3-2083-4013-b02f-82c3fefe28f4. The full design
narrative and every rejected alternative lives in the session's plan file
(`C:\Users\angel\.claude\plans\synchronous-dazzling-aho.md` at time of writing — not part of this
repo, cite for provenance only, do not treat as a living doc).

**This directly extends Epic GDX ("Game-Day Experience")**, specifically Group B (game-day
roller). gdx-5/6/7 (all done) built the `game_in_progress` flag, structured power costs, and
one-tap Vitae/Willpower spend-on-roll — this story is the next Group B slice, reusing that exact
spend plumbing rather than rebuilding it.

## Grounding against the 25 July 2026 planning meeting — read before touching scope

`D:\Terra Mortis\2026-07-25_meeting-lessons.md` §2.8-2.9 already recorded ST/dev decisions on
this exact surface ("Roller redesign", "Automation and policy boundaries"). Three findings that
change how this story should be read, surfaced rather than silently reconciled:

1. **Lash Out is directly corroborated, not invented here.** §2.9: "lashing out uses fixed pools
   per 'which beast'." That is exactly this story's aspect-chip design (Monstrous/Seductive/
   Competitive → Strength/Presence/Intelligence). Treat the rulebook-cited formula in this story
   as the intended implementation of that meeting decision, not a new idea competing with it.
2. **Humanity Check directly contradicts a recorded decision — flagged, not silently overridden.**
   §2.9, verbatim: **"breaking point checks stay fully manual with the ST, judged too rare and
   intricate to automate."** This story specs exactly that automation anyway. Do not treat this
   as an oversight to quietly fix by dropping Humanity Check, and do not treat it as settled by
   this story text alone — the meeting decision predates Peter stepping back from TM Suite dev
   (2026-08-09, per `CLAUDE.md`) and predates this session's explicit, current request from
   Angelus (the sole current code/schema owner) to build exactly this. **Confirm with Angelus
   before dev-story starts** whether this is a deliberate reversal (recommended reading, given
   who asked for it and when) or whether Humanity Check should be cut from this story's scope.
   If confirmed, note the reversal explicitly in this file's own history (mirroring how gdx-7
   corrected a stale `CLAUDE.md` claim in its own story text) rather than leaving the contradiction
   unresolved for a future reader.
3. **Frenzy's "automatic hunger/starving modifiers (data-curse aware)" are NOT in this story.**
   §2.9 names them alongside Frenzy Resistance's Composure+Resolve pool (this story's Frenzy
   Resistance matches that pool exactly). Grepped `public/js/**` for `data-curse`/`data curse`/
   `starving modifier` — no hits anywhere in this repo. Unbuilt, not referenced by any other
   system. Out of scope for this story; do not invent a hunger/starving modifier system to satisfy
   this line.
4. **Unrelated discovery, not fixed here:** `public/js/game/combat-tab.js:47`'s `_initPool` computes
   initiative as `Dexterity + Composure` (a dice pool), but §2.9 decided initiative should be "a
   single die plus composure" (1d10 + a flat Composure bonus, not a Composure-sized dice pool).
   Flagging only — initiative is not part of this story's scope, and combat-tab.js is not touched
   here.

## What this story is NOT

- **NOT `roll.js` (v1/legacy roller).** This entire feature is v2-only, gated behind the existing
  `tm-use-new-dice-roller` flag, same precedent as gdx-7. `roll.js` is not touched. Reason: several
  of these mechanics need the `willpower_cost`/`spendableCost()` plumbing that only exists in
  `roll-v2.js` today; rather than hand-duplicating that plumbing into a file already flagged for
  retirement (GDX-10, separate story), the whole section lives on v2 only.
- **NOT a change to `openPanel('common')` or `COMMON_ACTIONS`.** That panel and its 15 mundane
  action combos are untouched. An earlier draft of this design folded everything into a renamed
  "Common"→"Actions" panel; that direction was reviewed and rejected (Sally/UX round) for burying
  a new capability under a label that already meant something else, and for mismatching the
  reactive mechanics' actual usage rhythm. Final design instead extends the existing
  `renderCharPools()` pool-button grid (`public/js/game/char-pools.js`) — see Dev Notes.
- **NOT Daysleep Resistance or Wake-from-Danger.** Both were researched (Stamina+Resolve; a flat
  Humanity-dice pool respectively — both clean, rulebook-verified, cheap) and explicitly deferred:
  Angelus judged them not relevant during actual live play (daysleep scenarios are
  narrative/downtime pacing, not table-pressure moments). Not part of this story; may be a future
  GDX slice if that judgement changes.
- **NOT general combat maneuvers** (Grapple, Disarm, Called Shot, autofire bursts, etc.). Angelus's
  own call: these belong on the Combat tab (`t-combat`, `public/js/game/combat-tab.js`), a real but
  unfinished screen (confirmed by reading it: has initiative, health boxes, and three fixed
  attack-skill quick-rolls, but no weapon-type awareness or damage-type-from-equipment logic yet).
  Not touched by this story.
- **NOT damage automation of any kind.** §2.9: "roll spend automation explicitly does not extend
  to damage" — already the existing project convention (gdx-7 respected this too). Staking's
  "Apply Torpor" action is a status write, not a damage calculation, and does not compute or apply
  any damage box changes.
- **NOT a server schema change.** Every new field this story needs (`tracker_state.in_torpor`, the
  `stake` equipment tag) is additive and writes through routes that already accept arbitrary
  fields with no schema validation (`server/routes/tracker.js`'s `PUT` does an unvalidated `$set`;
  `equipment_catalogue.schema.js`'s `tags` is already a free `string[]`). See Dev Notes for the one
  required client-side change this does need.

## Acceptance Criteria

1. **Frenzy Resistance** and **Riding the Wave** appear as direct-tap pool buttons in a new
   "Vampire Mechanics" section of the roll tab's pool-button grid, positioned above Skill Pools
   and Discipline Pools (not after — see AC7), and roll immediately on tap with no intermediate
   choice. Pools: Resolve+Composure (Frenzy Resistance), Wits+Composure (Riding the Wave).
2. **Clash of Wills** appears in the same section, marked as opening a choice (not rolling
   immediately). Tapping it opens a scoped panel with two chip groups: "Your Discipline" (chips
   for the loaded character's own `disciplines` with `dots > 0`) and "Their Discipline" (chips for
   `state.RESIST_CHAR`'s own `disciplines` with `dots > 0`, populated once an opposing character is
   picked via the existing resist-target dropdown). Pool = Blood Potency + chosen discipline dots;
   resistance string built as `'v ' + <their discipline's existing DISC_ABBR abbreviation> + ' + BP'`
   feeding the *unmodified* existing `parseResistance()`/`getResistTokenVal()` in
   `public/js/shared/resist.js`. Duration bonus and WP-spend eligibility remain ST-discretion via
   the existing Mod stepper and WP chip — no new state for either.
3. **Lash Out** appears in the same section, marked as opening a choice. Tapping it opens a scoped
   panel with three aspect chips (Monstrous→Strength, Seductive→Presence, Competitive→Intelligence)
   and a Kindred/Mortal toggle. Pool = chosen Power Attribute + Blood Potency; resistance defaults
   to `'v ' + <same attribute> + ' + BP'` (documented simplification: assumes a symmetric aspect on
   both sides; ST hand-adjusts via the existing Mod stepper if the real response used a different
   aspect — this is a known, accepted limitation, not a bug to chase). Kindred toggle sets
   `willpower_cost: 1`; Mortal sets `willpower_cost: 0`. The roll button's actual WP deduction
   matches whichever toggle state was selected at roll time.
4. **Humanity Check** appears in the same section — *implementation proceeds only after the
   grounding-section confirmation with Angelus is resolved* (see above). Tapping it opens a scoped
   panel with a level-chip row filtered to `1..char.humanity` (not a fixed 10-down-to-1 row).
   Pool = the rulebook's dice-per-level table (10/9→5, 8/7→4, 6/5→3, 4/3→2, 2→1, 1→0) plus a
   touchstone modifier from a new `attachedTouchstoneCount(char)` export — **before writing that
   export, verify the 4 existing inline copies of `char.humanity >= t.humanity`
   (`public/js/suite/sheet.js:268`; `public/js/editor/sheet.js:428,451`;
   `public/js/admin/downtime-story.js:1698,1765,1897`) actually agree** (if any differs, that's a
   pre-existing bug to report, not to silently pick a side on). `pi.noWP = true`; the WP(+3) chip
   must not add dice to this pool (AC6) and the sub-line must not claim "WP +3" when it's inert.
5. **Blood Bond Resistance** appears in the same section, marked as opening a choice. Tapping it
   opens a scoped panel with two chip rows: Vitae ingested (1/2/3/4+) and prior resistance attempts
   vs. this same vampire (0/1/2/3+), both ST-entered scene facts — no new data model, no tracked
   history added. Pool = `max(0, Blood Potency - Vitae ingested - prior attempts)`. `pi.noWP = true`
   (same rule as AC4: spending 1 WP is the cost of *attempting*, per the rulebook, not a dice bonus).
6. **`noWP` enforcement**: `effPool()` in `public/js/suite/roll-v2.js` (only — `roll.js` is not
   touched) treats `state.POOL_INFO?.noWP` as forcing `wpBonus` to 0 regardless of `state.WP`, and
   `updPool()`'s sub-line omits the "WP +3" phrase under the same condition.
7. **Staking** is NOT a list entry. After any weapon-attack roll in `roll-v2.js`'s `doRoll()` where
   `state.activeWeaponId` resolves to a catalogue entry whose `tags` array includes `'stake'` AND
   the roll's own successes ≥ 5, the result area shows a flagged note: "5+ successes with a stake —
   confirm 5+ net damage for Torpor" (honest that armour/soak reduction is not computed at this
   layer). A one-tap "Apply Torpor" action calls `trackerWriteField(charId, 'in_torpor', true)` on
   the resist-target character. Verified end-to-end: after the tap, `GET /api/tracker_state/:id`
   returns `in_torpor: true` (not just a client-side flash) — this requires adding `'in_torpor'` to
   the persistence allowlist at `public/js/game/tracker.js:165` (currently
   `['vitae','willpower','bashing','lethal','aggravated']` only; anything else silently falls
   through to `localStorage`-only via `saveLocal`, confirmed by reading the function). At least one
   real equipment catalogue entry carries the `'stake'` tag (content addition, existing admin UI or
   seed data — `tags` needs no schema change, it's already a free `string[]`).
8. **"+ Custom Pool" tile** appended to the end of the same grid (after Skill/Discipline Pools).
   Tapping it opens the existing full panel overlay with three chip groups: Attribute (9 fixed
   chips — export `ATTRS` from `public/js/shared/resist.js` rather than duplicating the list),
   Skill (chips default to the character's non-zero skills, plus a "show all" toggle revealing
   0-dot skills too — do not hide the 0-dot case entirely; a deliberate unskilled roll is exactly
   what this tool exists to allow), Discipline (chips for the character's own `dots > 0`
   disciplines). A live total updates on every chip tap:
   `getAttrEffective(char, attr) + skTotal(char, skill) + unskilledPenalty(skill) [when a 0-dot
   skill is chosen; export from public/js/shared/pools.js] + (disciplineDots || 0)`. "Load Pool"
   feeds the existing, unmodified `loadPool(total, label, pi)`.
9. **Phone-density**: on first view after loading a character, Skill Pools and Discipline Pools
   default to **collapsed** (flip `renderCharPools()`'s current expanded-by-default via
   `localStorage.tm_pools_collapsed` — the toggle itself, `gcp-collapse-btn`, is unchanged). Vampire
   Mechanics sits directly under the stats strip, above the (collapsed) Pools toggle. Within
   Vampire Mechanics, order is: Frenzy Resistance, Riding the Wave, Lash Out, Clash of Wills,
   Humanity Check, Blood Bond Resistance (fast/common first). None of AC2-AC5's scoped panels
   cause the page to reflow when opened — they use the existing `#panel-overlay`/`#panel` bottom
   sheet mechanism, each scoped to exactly one mechanic's own 2-4 choices, never sharing a panel
   with an unrelated mechanic or with `openPanel('common')`.
10. **Existing behaviour is unaffected**: Character/Discipline/Common/Auspex panels, `COMMON_ACTIONS`,
    the shortcut-row buttons and their labels, and `roll.js` (v1) all render and behave identically
    to before this story. Loading a character without any Discipline dots still renders Vampire
    Mechanics correctly (Clash of Wills' "Your Discipline" chip group and Custom Pool's Discipline
    chip group both render an empty/appropriate state rather than erroring).

## Tasks / Subtasks

- [ ] Task 1 — Resolve the Humanity Check grounding question with Angelus (AC4's precondition);
  record the outcome in this file before writing any Humanity Check code.
- [ ] Task 2 — `public/js/data/accessors.js`: add `attachedTouchstoneCount(char)`, after verifying
  the 4 existing inline predicate sites agree (AC4).
- [ ] Task 3 — `public/js/shared/resist.js`: export `ATTRS` (and `SKILLS`/`DISC_ABBR` if needed by
  Custom Pool/Clash of Wills); no change to `parseResistance()`/`getResistTokenVal()` themselves.
- [ ] Task 4 — `public/js/shared/pools.js`: export `unskilledPenalty`.
- [ ] Task 5 — `public/js/data/equipment-derivation.js`: add `isStakeWeapon(entry)` alongside the
  existing `isCombatGearWeaponShaped`/`isEquipmentOnMe` predicates.
- [ ] Task 6 — `public/js/game/tracker.js`: add `'in_torpor'` to the allowlist at line ~165 (AC7).
- [ ] Task 7 — `public/js/game/char-pools.js`: new "Vampire Mechanics" section + "+ Custom Pool"
  tile in `renderCharPools()`; reorder ahead of Skill/Discipline Pools; flip the pools-collapsed
  default (AC1, AC8, AC9).
- [ ] Task 8 — `public/js/app.js`: four new `openPanel()` modes (Clash of Wills, Lash Out, Humanity
  Check, Blood Bond Resistance), each rendering only its own mechanic's chips — kept separate from
  `openPanel('common')` and from each other (AC2-AC5).
- [ ] Task 9 — `public/js/suite/roll-v2.js`: `noWP` guard in `effPool()`/`updPool()` (AC6); Staking
  detection + "Apply Torpor" action inside/near `doRoll()` (AC7).
- [ ] Task 10 — Content: tag one real equipment catalogue entry `stake` (admin UI or seed data),
  no schema change (AC7).
- [ ] Task 11 — Tests: `noWP` guard unit test (roll-v2.js only); touchstone dice/modifier table
  (0/1/2/3 attached cases); Lash Out Kindred/Mortal toggle vs. actual WP delta charged.
- [ ] Task 12 — Manual verification pass per the plan file's own Verification section (hand-check
  every mechanic's numbers against the rulebook formulas at the table, on an actual phone width).

## Dev Notes

- **Data-shape verifications already done this session — do not re-derive, cite these:**
  - `character.disciplines` is a keyed object (`{ [name]: { dots, ... } }`) —
    `server/schemas/character.schema.js:214-217`. Matches the pattern `openPanel('disc')` and
    `char-pools.js`'s own discipline-pool section already use.
  - `blood_potency` is **not** part of the ST-mod overlay's mutated-field set — confirmed by
    grepping `public/js/data/st-mods.js` for `blood_potency` (no matches). Reading `char.blood_potency`
    raw is therefore currently correct, not a bypass — there is no overlay-adjusted value it could
    disagree with today. Leave a one-line comment flagging this as a re-check point if a future
    epic ever adds BP to the overlay's mutated fields.
  - The resist-target dropdown (`public/js/shared/resist.js`'s `updResist()`, reading
    `state.chars.find(...)`) and the app's own character array (`suiteState.chars` in `app.js`) are
    the *same* singleton — both files import the default export of `./suite/data.js` /
    `../suite/data.js`. `applyOverlayToAll(suiteState.chars, globalEnabled)` runs at `app.js:776`
    before `window._charNames` is built at `app.js:781`. No divergent, pre-overlay lookup path
    exists for the resist-target list.
  - `trackerWriteField()` (`public/js/game/tracker.js:160-172`) only forwards a write to the server
    (`saveToApi`) for `['vitae','willpower','bashing','lethal','aggravated']`; any other field name
    falls through to `localStorage`-only (`saveLocal`), silently. This is the one client-side change
    Staking's persistence needs (Task 6) — the server route itself
    (`server/routes/tracker.js`'s `PUT /:character_id`) does an unvalidated `$set` of the whole
    request body, so no server-side schema change is required for `in_torpor` itself. (Separate,
    not-this-story observation: that route's total absence of field validation is its own hygiene
    gap worth a look someday — not fixed here.)
  - No existing `'stake'` tag convention anywhere in the equipment catalogue (repo-wide grep, no
    hits beyond unrelated "stakeholder"/"at stake" text) and no existing "in torpor" status field
    anywhere in `character.schema.js` or the tracker route (grepped) — both genuinely new, both
    additive, neither needs a migration in the destructive-write sense.
- **Reuse, do not reinvent:** `parseResistance()`/`getResistTokenVal()`/`DISC_ABBR` in
  `public/js/shared/resist.js` already resolve a string like `'v Obf + BP'` end-to-end (the `'Obf'`
  → `'Obfuscate'` abbreviation map, the `type:'disc'` branch reading `c.disciplines?.[key]?.dots`,
  and the `type:'bp'` branch reading `c.blood_potency`) — Clash of Wills and Lash Out's resistance
  strings need zero changes to this file's actual resolution logic, only chip-driven string
  construction at the call site.
- **`willpower_cost`/`spendableCost()`/`rollButtonLabel()` in `roll-v2.js` are already built** (gdx-7)
  and read straight off `state.POOL_INFO.willpower_cost` — Lash Out's Kindred/Mortal toggle needs
  zero changes to that plumbing, only setting the field correctly when building `pi`.
- **Mockup** (approved): https://claude.ai/code/artifact/0cd782d3-2083-4013-b02f-82c3fefe28f4 — shows
  the default collapsed-Pools view and the Lash Out scoped mini-panel exactly as specced in AC3/AC9.
- Per this project's CSS standards (`specs/project-context.md`): reuse `.gcp-*`/`.panel*`/`.mchip`
  classes from `public/css/suite.css` for every new element; no bare hex, no inline `style="..."`.

### Project Structure Notes

- All client-side, `public/js/**` + `public/index.html`'s existing `t-roll` block only. No server
  route changes, no new MongoDB collections, no new schema files.
- Files touched: `char-pools.js`, `app.js`, `roll-v2.js`, `resist.js`, `pools.js`, `accessors.js`,
  `equipment-derivation.js`, `tracker.js`. Not touched: `roll.js`, `index.html`'s shortcut row,
  `openPanel('common')`/`COMMON_ACTIONS`, any `server/` file, any schema file.
- No conflicts detected with in-flight epic-gdx siblings (gdx-8 roll-history, gdx-9
  single-scroll-sheet are both still backlog/unstoried; neither touches `char-pools.js` or
  `roll-v2.js`'s `doRoll()`/`effPool()`).

### References

- Full design narrative, rejected alternatives, and the `/bmad-party-mode` review transcript: session
  plan file (see "Why this story exists" above for path/caveat).
- Rulebook citations: `st-working/reference/Vampire the Requiem 2e Rulebook.md` — Predatory Aura
  p.86-87 (Lash Out), Breaking Points/Detachment p.107-108 (Humanity Check), Clash of Wills p.125-126,
  Blood Bond p.100 (Blood Bond Resistance), Staking p.90, Frenzy/Riding the Wave already in
  `public/js/game/rules.js:50,52`.
- Meeting-decision grounding: `D:\Terra Mortis\2026-07-25_meeting-lessons.md` §2.8-2.9 (see the
  dedicated section above — read this before dev-story starts, not just this summary).
- `gdx-7-apply-costs-on-roll.md` — direct precedent for this story's structure ("Why this story
  exists" / "What this story is NOT" sections) and for the v2-only, roll.js-untouched convention.

## Dev Agent Record

### Agent Model Used

(not yet dev-storied)

### Debug Log References

### Completion Notes List

### File List
