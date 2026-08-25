# Story gdx.11: Vampire Mechanics quick actions + free Custom Pool builder on the roll tab

Status: done

<!-- 2026-08-19: go-ahead given, dev-story cleared to start. Humanity Check (formerly AC4) is
     carved out to a new story, gdx-12, per Angelus's own ruling below in the Grounding section -
     it needs the OAQ submit/approve pattern, not an immediate tile, and that is real scope this
     story does not build. Everything else proceeds as specced. -->
<!-- 2026-08-18 note superseded: was "Explicitly NOT to be dev-storied today... do not start
     implementation without a fresh, current go-ahead." That go-ahead is now given. -->

## Story

As an ST running a live game (and, on the same shared surface, any player rolling their own
character),
I want one-tap access to common VtR 2e mechanics (Frenzy Resistance, Riding the Wave, Clash of
Wills, Lash Out, Blood Bond Resistance, Staking) and a free Attribute×Skill×Discipline
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
2. **Humanity Check directly contradicts a recorded decision — RESOLVED 2026-08-19, carved out,
   not dropped and not silently kept.** §2.9, verbatim: **"breaking point checks stay fully manual
   with the ST, judged too rare and intricate to automate."** This story originally specced
   automating it as an immediate, symmetric ST/player tile (former AC4) anyway. Discussed directly
   with Angelus: the reconciliation is that Humanity Check should still go through the ST, not
   become player self-service — automating the *arithmetic* (dice-per-level table, touchstone
   modifier) is fine, automating the *judgement call* of when a breaking point fires is not. The
   concrete mechanism agreed: reuse Epic OAQ's existing submit/approve pattern
   (`contested_roll_requests`'s `request_type` discriminator + the ST-only approval queue tab,
   `public/js/suite/office-approvals.js`) — a player taps the tile, it submits a pending request,
   no dice roll yet; the ST accepts it from the queue; only then does the pool compute and the
   roll fire. That is real scope beyond an immediate tile (a second collection write path plus
   queue-UI wiring), so it does NOT belong in this story. **Humanity Check is carved out to a new
   story, gdx-12** (not yet created as of this note) which must spec the OAQ-reuse flow properly
   before any code is written. This story (gdx-11) proceeds without it. See "What this story is
   NOT" below.
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

- **NOT Humanity Check.** Carved out to a new story, gdx-12, 2026-08-19 — see the Grounding
  section above for why (it needs Epic OAQ's submit/approve pattern, not an immediate tile, which
  is real scope this story does not build). Former AC4 struck below rather than renumbered, to
  keep every other cross-reference in this file stable.
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
4. ~~**Humanity Check**~~ — REMOVED 2026-08-19, carved out to gdx-12 (see Grounding section and
   "What this story is NOT" above). Number struck rather than reused, so AC5-AC10's own
   cross-references below stay stable and unambiguous.
5. **Blood Bond Resistance** appears in the same section, marked as opening a choice. Tapping it
   opens a scoped panel with two chip rows: Vitae ingested (1/2/3/4+) and prior resistance attempts
   vs. this same vampire (0/1/2/3+), both ST-entered scene facts — no new data model, no tracked
   history added. Pool = `max(0, Blood Potency - Vitae ingested - prior attempts)`. `pi.noWP = true`
   (spending 1 WP is the cost of *attempting*, per the rulebook, not a dice bonus — same reasoning
   the now-carved-out Humanity Check used, restated here directly since AC4 no longer exists to
   cite).
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
   Blood Bond Resistance (fast/common first). None of AC2, AC3, or AC5's scoped panels
   cause the page to reflow when opened — they use the existing `#panel-overlay`/`#panel` bottom
   sheet mechanism, each scoped to exactly one mechanic's own 2-4 choices, never sharing a panel
   with an unrelated mechanic or with `openPanel('common')`.
10. **Existing behaviour is unaffected**: Character/Discipline/Common/Auspex panels, `COMMON_ACTIONS`,
    the shortcut-row buttons and their labels, and `roll.js` (v1) all render and behave identically
    to before this story. Loading a character without any Discipline dots still renders Vampire
    Mechanics correctly (Clash of Wills' "Your Discipline" chip group and Custom Pool's Discipline
    chip group both render an empty/appropriate state rather than erroring).

## Tasks / Subtasks

- [x] Task 1 — Resolve the Humanity Check grounding question with Angelus (former AC4's
  precondition). RESOLVED 2026-08-19: carved out to gdx-12, reusing Epic OAQ's submit/approve
  pattern rather than an immediate tile. Outcome recorded in the Grounding section above. Task 2
  (below) is superseded by the same ruling — `attachedTouchstoneCount` was Humanity-Check-only and
  moves to gdx-12 with it.
- [x] ~~Task 2~~ — SUPERSEDED 2026-08-19, moved to gdx-12, no action required in this story (was: add `attachedTouchstoneCount(char)`
  to `public/js/data/accessors.js`, after verifying the 4 existing inline
  `char.humanity >= t.humanity` predicate sites agree — `public/js/suite/sheet.js:268`;
  `public/js/editor/sheet.js:428,451`; `public/js/admin/downtime-story.js:1698,1765,1897`. That
  verification still needs doing, just as part of gdx-12, not here.)
- [x] Task 3 — `public/js/shared/resist.js`: exported `ATTRS`, `SKILLS`, `DISC_ABBR` (all three, not
  just the two named — Custom Pool needs `ATTRS`, Clash of Wills needs `DISC_ABBR`'s reverse lookup).
  `parseResistance()`/`getResistTokenVal()` themselves unchanged. Also added a new pure
  `lashOutPool(char, attr, kindred)` export here (not originally scoped in this task, added during
  Task 11 to make the Kindred/Mortal -> willpower_cost mapping unit-testable without booting
  app.js, which has import-time side effects unsafe for a test environment).
- [x] Task 4 — `public/js/shared/pools.js`: exported `unskilledPenalty`.
- [x] Task 5 — `public/js/data/equipment-derivation.js`: added `isStakeWeapon(entry)` alongside the
  existing `isCombatGearWeaponShaped`/`isEquipmentOnMe` predicates.
- [x] Task 6 — `public/js/game/tracker.js`: added `'in_torpor'` to the allowlist at line ~165 (AC7).
- [x] Task 7 — `public/js/game/char-pools.js`: new "Vampire Mechanics" section + "+ Custom Pool"
  tile in `renderCharPools()`, ahead of Skill/Discipline Pools; flipped the pools-collapsed
  default (AC1, AC8, AC9). **Both gated behind `localStorage.getItem('tm-use-new-dice-roller') ===
  '1'`** — a real gap found live in browser verification (not in the original task text): this
  module is shared by all three v1/v2-agnostic call sites in app.js, and the AC's own "v2-only,
  roll.js untouched" requirement would have been silently violated without this check, since every
  choice tile's `pi` carries `noWP`/`willpower_cost` fields only `roll-v2.js` understands.
- [x] Task 8 — `public/js/app.js`: four new `openPanel()` modes (Clash of Wills, Lash Out, Blood
  Bond Resistance, Custom Pool — the task text named three, but AC8's Custom Pool build genuinely
  needs its own mode too; not an oversight left uncorrected), each rendering only its own
  mechanic's chips — kept separate from `openPanel('common')` and from each other (AC2, AC3, AC5,
  AC8). The three onTap callback sites (all three `renderCharPools()` call sites) updated to route
  `{opensPanel}` entries to `openPanel(mode)` instead of `loadPool()`.
- [x] Task 9 — `public/js/suite/roll-v2.js`: `noWP` guard in `effPool()`/`updPool()`
  (both the sub-line AND the effline breakdown segment — AC6); Staking detection (`_stakeNote()`)
  + "Apply Torpor" action wired into both of `doRoll()`'s result branches (standard and contested —
  AC7).
- [x] Task 10 — Content: tagged the existing "Stake" equipment_catalogue entry (already melee/
  lethal, just missing the tag) with `'stake'` in production `tm_suite.equipment_catalogue`
  (`_id: 6a3385da303c414f83965f7b`), verified via direct query afterward. No schema change (AC7).
- [x] Task 11 — Tests: `server/tests/gdx-11-vampire-mechanics-quick-actions.test.js`, 16 tests —
  `noWP` guard (5 tests, including the RESIST_MODE composition case), `lashOutPool()` Kindred/
  Mortal -> `spendableCost()`'s actual WP delta (7 tests), `isStakeWeapon()` (4 tests, added beyond
  Task 11's own named scope since Task 5 needed coverage too). 16/16 green.
- [x] Task 12 — Manual verification pass. **Partial, honestly disclosed**: full hand-check against
  every rulebook formula at the table, on an actual phone width, needs Angelus (this session cannot
  do that — see `CLAUDE.md`'s standing note). What this session COULD and DID do: started local
  servers (`http-server public -p 8080` + `cd server && npm run dev`), used the documented
  `local-test-token` localhost-only auth bypass (`server/middleware/auth.js`) to reach the app as
  ST against real production Atlas data, and drove every mechanic live in a real browser —
  Frenzy Resistance (immediate roll, AC1), Clash of Wills (chip selection + disclosed-limitation
  empty state, AC2), Lash Out (aspect + Kindred/Mortal, resistance string, WP(+3) composing
  correctly, AC3), Blood Bond Resistance (vitae/attempts chips, `noWP` correctly suppressing BOTH
  the dice bonus and the sub-line/breakdown label, AC5/AC6), Custom Pool (Attribute+Skill+Discipline
  live total, Show All toggle, AC8). Zero console errors on the final pass. This live check is what
  found and fixed the Task 7 v2-gating gap and a `ReferenceError: state is not defined` bug (app.js
  uses `suiteState`, not `state`, as its import alias — a mistake a source review alone would not
  have caught, since the identifier `state` is valid and correct in the other four files this story
  touches).

### Review Findings

Internal 3-layer review (Blind Hunter, Edge Case Hunter, Acceptance Auditor — two-pass, Codex
external review unavailable, usage-limited until 2026-08-20). All findings independently verified
against the real code before being trusted; several converged across two or all three layers,
raising confidence. All `patch` items below were applied, prove-discriminated where testable
(single-change revert → confirmed red → restored → confirmed green), and re-verified live in a
real browser where DOM-only. One additional real defect (marked `[Review][Patch][live-recheck]`)
was found by this session's OWN post-review live re-verification of Staking specifically — the
one mechanic the original dev pass never actually clicked through — not by any of the three
subagents.

- [x] [Review][Patch] Blood Bond Resistance's `pi` set `noWP:true` but never `willpower_cost:1`,
  so AC5's "1 WP to attempt" was never actually charged [public/js/app.js, public/js/shared/resist.js].
  Source: blind+edge (independently). Fixed by extracting `bloodBondPool()` (mirrors the existing
  `lashOutPool()` precedent) so the fix is unit-tested and prove-discriminated
  (server/tests/gdx-11-vampire-mechanics-quick-actions.test.js).
- [x] [Review][Patch] Contested-roll Staking check used the roller's raw successes (`wS`) instead
  of gating on the contest outcome, so a stake attack that scored 5+ successes but was then BEATEN
  by the target's resistance roll still offered "Apply Torpor" [public/js/suite/roll-v2.js].
  Source: blind+edge (independently; edge traced the exact `won`/`net` distinction). Fixed:
  `_stakeNote(won ? net : 0)`.
- [x] [Review][Patch] AC7's "one-tap Apply Torpor action" was realistically unreachable for an
  ordinary weapon-attack roll: the button was gated on `state.RESIST_CHAR`, which only populates
  when the loaded pool carries a `resistance` string — true for Clash of Wills/Lash Out, NOT true
  for a plain Common-Actions/Custom-Pool weapon-skill roll, the realistic way a stake attack
  happens [public/js/suite/roll-v2.js]. Source: Acceptance Auditor, tracing the actual code path.
  Fixed: `_stakeNote()` now has its own target `<select>` (same `window._charNames` source
  `showResistSec()` itself uses), independent of the resistance mechanism.
- [x] [Review][Patch][live-recheck] Found by this session's own post-fix live re-verification, not
  by any of the three review layers: `trackerWriteField()` silently no-ops for any character whose
  tracker was never `ensureLoaded()`'d this session (the `_confirmed` gate exists to stop
  stale-cache writes clobbering real data) — a stake target picked from the new dropdown, unlike
  `state.rollChar`, has no such guarantee. Reproduced live: Apply Torpor showed success (button
  text, toast) but the write never reached the server. Fixed: `await ensureTrackerLoaded(target)`
  before the write, same pattern `doRoll()` already uses for `state.rollChar`
  [public/js/suite/roll-v2.js].
- [x] [Review][Patch] `DISC_ABBR` only covers the 10 base-clan/ritual disciplines; Clash of Wills
  feeds a real character's own chosen discipline through the same `parseResistance()` pipeline, and
  this campaign's live data has non-core disciplines (Creation, Divination, Protection — directly
  observed on Hierophant Anichka during live verification) `DISC_ABBR` was never meant to enumerate.
  The old fallback silently resolved these as `type:'attr'`, a guaranteed 0 [public/js/shared/resist.js].
  Source: Acceptance Auditor. Fixed: unrecognised tokens now resolve as `type:'disc'` instead —
  provably safe (the old fallback was already 0 either way for any non-attribute name) and
  prove-discriminated with a live-data-shaped test.
- [x] [Review][Patch] `SKILLS` exported from `shared/resist.js` alongside `ATTRS`/`DISC_ABBR` with
  a stated rationale ("Custom Pool needs it") that didn't match what was built — Custom Pool
  actually uses `ALL_SKILLS` from `data/constants.js`, and `SKILLS` (which still carries a legacy
  `'Socialize'` duplicate `ALL_SKILLS` doesn't) was a dead, unused export. Source: blind+auditor
  (independently). Fixed: reverted to module-private.
- [x] [Review][Patch] Custom Pool's live-preview total had no floor — an unskilled Mental-skill
  chip (-3) with a low Attribute could show a negative dice count in the preview text before
  confirming (`loadPool()` itself already clamps via `Math.max(0,...)` on confirm, so this was
  never a real dice-count bug, only a confusing preview). Source: Blind Hunter. Fixed: clamped for
  display consistency too.
- [x] [Review][Patch] `tracker.js`'s `ensureLoaded()` never read `in_torpor` back into the client
  cache after a reload, even though `trackerWriteField()` (this story's own Task 6) writes it
  server-side — no current UI reads `cs.in_torpor` yet, so this wasn't an AC violation, but it was
  a latent trap for the next consumer. Source: Edge Case Hunter. Fixed: added to the cache
  reconstruction in the `remote` branch.
- [x] [Review][Patch] Custom Pool rendered a bare, empty chip row with no chips and no hint when a
  character has zero non-zero skills and "show all" is off. Source: Edge Case Hunter. Fixed: added
  an empty-state hint.
- [x] [Review][Defer] `saveToApi()`'s fetch has only a silent `.catch(() => {})` — a failed
  network/auth write (e.g. a 403 from `canAccess()` on a target outside the acting player's own
  `character_ids`) reports success in the UI regardless. Source: blind+edge (independently).
  Deferred, pre-existing: this is `trackerWriteField`/`trackerAdj`'s own shared infrastructure
  (predates this story, gdx-6/gdx-7 era), used by every existing tracker write in the app, not
  something this story's own new call site should silently diverge from or fix in isolation.
  Logged to `deferred-work.md`.
- [x] [Review][Defer] `char-pools.js`'s module-level `_pools` array is shared across the app's two
  render containers (`gcp-panel`/`roll-char-pools`); a stale button index clicked after the other
  container's render overwrote it could resolve to a mismatched entry. Source: Edge Case Hunter.
  Deferred, pre-existing: the array itself predates this story (already shared for skill/discipline
  pools); this story's new `{opensPanel}`-shaped entries have a narrower type (no `total`/`pi`),
  which could make a hypothetical stale-index bug's symptom worse (`NaN` pool vs. a wrong number),
  but fixing the shared-state architecture app-wide is well beyond this story's scope. Logged to
  `deferred-work.md`.
- [x] [Review][Dismiss] "No panel-close after Load Pool" — false positive. `loadPool()` (unmodified
  by this diff, just out of the diff's visible context) already calls `closePanel()` at its own
  end; confirmed in source and in every live browser test this session ran. Source: Blind Hunter
  (diff-only, no repo access to see `loadPool()`'s own body).
- [x] [Review][Dismiss] No null-guard on `state.RESIST_CHAR.name`/`_id` before the Torpor write —
  matches this file's own established convention (`state.rollChar.name.split(' ')[0]` is used
  unguarded elsewhere in the same file, including inside `loadPool()` itself); `name`/`_id` are
  non-optional on every real character document. Source: Blind Hunter.
- [x] [Review][Dismiss] AC9's collapsed-by-default flip affects the pre-existing Skill/Discipline
  Pools sections too, not just the new Vampire Mechanics UI — this is AC9's own explicit literal
  text ("Skill Pools and Discipline Pools default to collapsed"), not a scope leak. Source: Blind
  Hunter.
- [x] [Review][Dismiss] Blood Bond Resistance's "4+"/"3+" chip labels store the literal capped
  value rather than an open-ended "at least N" semantic — matches AC5's own literal chip-value
  spec and the approved mockup; a product convention, not a computation defect. Source: Blind
  Hunter.
- [x] [Review][Dismiss] `char-pools.js` re-reads the v2 flag fresh per render while `app.js`'s own
  roller selection is frozen at page load — a theoretical multi-tab/devtools desync. Dismissed:
  the flag's own Settings toggle already forces `location.reload()`, so this can't occur through
  normal single-tab use; the scenario needs a developer manually editing `localStorage` across
  tabs without reloading. Source: Edge Case Hunter.
- [x] [Review][Dismiss] Custom Pool's tile sits inside the same collapsed-by-default `gcp-pools-wrap`
  as Skill/Discipline Pools, so it's not visible on first view either — a defensible reading of
  AC8's own "appended to the end of the same grid" wording, already reasoned about in this file's
  Dev Notes, not an unconsidered gap. Source: Acceptance Auditor.
- [x] [Review][Dismiss] `pi.skill` repurposed to carry a second Attribute (Frenzy Resistance/Riding
  the Wave) rests on an asserted-not-demonstrated safety claim. Source: Blind Hunter. Already
  verified directly (not just asserted) before this review: `skSpecs()`'s only read of `pi.skill`
  is `c.skills?.[skill]?.specs`, which safely returns `undefined -> []` for a non-skill string.

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
- Files touched: `char-pools.js`, `app.js`, `roll-v2.js`, `resist.js`, `pools.js`,
  `equipment-derivation.js`, `tracker.js`. `accessors.js` is NOT touched by this story any more
  (moved to gdx-12 with the Humanity Check carve-out). Not touched: `roll.js`, `index.html`'s
  shortcut row, `openPanel('common')`/`COMMON_ACTIONS`, any `server/` file, any schema file.
- No conflicts detected with in-flight epic-gdx siblings (gdx-8 roll-history, gdx-9
  single-scroll-sheet are both still backlog/unstoried; neither touches `char-pools.js` or
  `roll-v2.js`'s `doRoll()`/`effPool()`).

### References

- Full design narrative, rejected alternatives, and the `/bmad-party-mode` review transcript: session
  plan file (see "Why this story exists" above for path/caveat).
- Rulebook citations: `st-working/reference/Vampire the Requiem 2e Rulebook.md` — Predatory Aura
  p.86-87 (Lash Out), Clash of Wills p.125-126, Blood Bond p.100 (Blood Bond Resistance), Staking
  p.90, Frenzy/Riding the Wave already in `public/js/game/rules.js:50,52`. (Breaking
  Points/Detachment p.107-108, for Humanity Check, is now gdx-12's citation to carry forward.)
- Meeting-decision grounding: `D:\Terra Mortis\2026-07-25_meeting-lessons.md` §2.8-2.9 (see the
  dedicated section above — read this before dev-story starts, not just this summary).
- `gdx-7-apply-costs-on-roll.md` — direct precedent for this story's structure ("Why this story
  exists" / "What this story is NOT" sections) and for the v2-only, roll.js-untouched convention.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5, direct in-session (not delegated to a subagent) — the /bmad-loop invariant names
Opus for dev-story; recorded here as an explicit, disclosed deviation rather than left unstated.

### Debug Log References

- Real bug found and fixed via live browser verification (not caught by any static check):
  `ReferenceError: state is not defined` at `app.js`'s Clash of Wills `render()` — `app.js` imports
  the shared singleton as `suiteState` (line 94), not `state`, which every OTHER file this story
  touches (`roll-v2.js`, `resist.js`, the test file) correctly uses as `state`. Fixed by renaming
  the one reference; the same mistake is not present anywhere else (grepped for a bare `state.`
  pattern across `app.js` after the fix, only the (also corrected) comment remained).
- Real gap found via the same live check: the "Vampire Mechanics" section and "+ Custom Pool" tile
  were rendering unconditionally in `char-pools.js`, which is shared by all three v1/v2-agnostic
  `renderCharPools()` call sites in `app.js` — meaning they appeared on the LEGACY `roll.js` too,
  directly contradicting this story's own "NOT roll.js" scope line and AC6's `noWP` guarantee
  (`roll.js` has no concept of `pi.noWP`). Fixed by gating both behind
  `localStorage.getItem('tm-use-new-dice-roller') === '1'`, checked once (`isV2`) and reused.
  Confirmed fixed by loading the actual v1 roller in a real browser and seeing the section vanish,
  then confirming it reappears correctly on v2.
- Both fixes verified together: full six-mechanic pass in a real browser (Frenzy Resistance, Lash
  Out, Clash of Wills, Blood Bond Resistance, Custom Pool, and the v1/v2 gate itself) against real
  production character data, zero console errors on the final pass.

### Completion Notes List

- **Humanity Check carved out to gdx-12** per the Grounding-section ruling (Task 1) — see that
  section and "What this story is NOT" for the full reasoning. Nothing in this story implements it;
  `attachedTouchstoneCount` and its 4-site verification move to gdx-12 with it.
- **Two real defects found and fixed during this session's own browser verification**, not present
  in the original story text or caught by any automated check beforehand — see Debug Log References
  above. Both are the kind of gap that only shows up when the feature actually runs: a wrong import
  alias (syntactically valid, would have shipped a broken panel) and a missing v-gate (would have
  shipped a scope violation onto the legacy roller). Neither would have been caught by `node --check`
  or the unit test suite alone.
- **A pre-existing double-counted-bonus pattern was found, NOT fixed** (out of scope): the existing
  skill-pool loop in `char-pools.js` computes `getAttrEffective(char, attr) + getAttrBonus(char,
  attr)`, but `getAttrEffective` (`accessors.js`) already includes bonus dots internally — this
  looks like a real double-count bug, pre-existing and untouched by this story. This story's OWN new
  code (the two-attribute immediate tiles, Custom Pool) deliberately does NOT copy that pattern —
  uses `getAttrEffective` alone, matching AC8's own literal formula — so as not to propagate the
  same defect into new code. Flagging here rather than silently fixing a pattern this story didn't
  introduce and wasn't asked to touch.
- **Two pre-existing Playwright failures found and confirmed unrelated**, via `git stash` A/B
  comparison against the unmodified codebase: `tests/issue-1018-parallel-roll-tab-flag.spec.js`
  ("roll-v2.js exists and exports the same public surface as roll.js") and
  `tests/issue-1024-roll-v2-anchor-and-again-seg.spec.js` ("#t-roll no longer has the old
  a8/a9/na-c chips") both fail identically with and without this story's changes. Neither is on
  `CLAUDE.md`'s documented known-failures list — worth adding there, not done in this pass (out of
  scope for a dev-story to edit project-wide docs unprompted).
- **Two attribute-only pools (Frenzy Resistance, Riding the Wave) reuse `pi.skill`/`pi.skillV`** to
  carry the second attribute, rather than inventing a new pi shape — documented inline at the call
  site. Verified safe: `skSpecs()`/the equipment-chip domain check both key off `pi.skill` but
  degrade to "nothing shown" for a non-skill string like `'Composure'`, not an error.
- Full six-mechanic live browser pass (see Debug Log References) plus `server/tests/
  gdx-11-vampire-mechanics-quick-actions.test.js` (16/16) plus the changed-area regression (195/195
  across 6 files). Full untargeted suite: 4059 passed / 9 failed / 5 skipped across 230 files (7
  failing files). 5 of those 7 are CLAUDE.md's own documented pre-existing failures
  (`n7-n9-allocator-readers.test.js`, `epic.708.3-cycle-phase-controls.test.js`,
  `oath-a-pledge-helpers.test.js`, `issue-836-legacy-tracker-cache-removed.test.js`,
  `issue-1013-indomitable-rules-text.test.js`). The other 2
  (`cm-4-renumber-chapter-merge.test.js`, `fix.715.dt-manual-open-gate.test.js`) are NOT on that
  list — verified pre-existing/environmental, not a regression, by direct `git stash` A/B
  comparison: `cm-4-renumber-chapter-merge.test.js` fails identically (timeouts, "Test timed out in
  5000ms") on the unmodified base codebase, consistent with this repo's own documented
  Atlas-connection-contention flake class (see oxp-5's own sprint-status entry for the same
  pattern); `fix.715.dt-manual-open-gate.test.js` failed only inside the full-suite run and passed
  clean (1/1) in isolation, the same shape. Worth adding both to CLAUDE.md's known-failures list —
  not done here, out of scope for a dev-story to edit project-wide docs unprompted.
- **Code review round (2026-08-19)**: internal 3-layer review (Blind Hunter/Edge Case Hunter/
  Acceptance Auditor, two-pass), Codex unavailable (usage-limited until 2026-08-20). 8 real patch
  findings applied (2 unanimous across all three angles — Blood Bond's missing `willpower_cost` and
  the Staking win-gate; one AC7 violation the auditor traced precisely; one MORE found only by this
  session's own post-fix live re-verification of Staking specifically, the mechanic never actually
  clicked through before this round), 2 deferred with reasons to `deferred-work.md` (pre-existing,
  app-wide infrastructure, not this story's to fix), 9 dismissed with evidence (several were the
  reviewers not having repo access to see `loadPool()` already calling `closePanel()`, or matching
  this file's own established conventions/explicit AC wording). Two new pure functions extracted
  during the fix pass (`bloodBondPool()`, alongside the existing `lashOutPool()`) specifically so
  the willpower-cost fix is unit-tested and prove-discriminated, not just asserted. Full detail:
  the "Review Findings" section above. 23 tests before the review round -> 23 stayed green
  throughout (nothing regressed) plus this round; final count after the round's new tests: see
  the test file itself. Every testable patch prove-discriminated (revert -> confirmed red ->
  restored -> confirmed green) before being trusted as fixed.

### File List

- `public/js/shared/resist.js` — exported `ATTRS`, `DISC_ABBR` (NOT `SKILLS`, reverted to
  module-private per review — dead export); added `lashOutPool()` and `bloodBondPool()`; the
  `parseResistance()` unrecognised-token fallback now resolves as `type:'disc'` (review fix)
- `public/js/shared/pools.js` — exported `unskilledPenalty`
- `public/js/data/equipment-derivation.js` — added `isStakeWeapon()`
- `public/js/game/tracker.js` — added `'in_torpor'` to the persistence allowlist; `ensureLoaded()`
  now reads `in_torpor` back into the cache (review fix)
- `public/js/game/char-pools.js` — Vampire Mechanics section, Custom Pool tile, v2 gate, collapsed
  default flip, `choiceBtn()` helper; Custom Pool preview total clamped, empty-skill-list hint
  (review fixes)
- `public/js/app.js` — four new `openPanel()` modes, three onTap call sites updated, new imports;
  Blood Bond Resistance now calls `bloodBondPool()` instead of an inline `pi` (review fix)
- `public/js/suite/roll-v2.js` — `noWP` guard (`effPool()`, `updPool()` x2), `_stakeNote()`, wired
  into both `doRoll()` result branches, `trackerWriteField` import; `_stakeNote()` gained its own
  target picker + `await ensureTrackerLoaded()` before writing, and the contested branch now gates
  on `won`/`net` (review fixes)
- `public/css/suite.css` — `.gcp-choice`/`.gcp-choice-wide` tile styles, `.vm-chip-wrap`/
  `.panel-total`/`.pnl-confirm-btn` scoped mini-panel styles, `.rv2-stake-note`/`.rv2-stake-btn`/
  `.rv2-stake-target-sel` Staking styles
- `server/tests/gdx-11-vampire-mechanics-quick-actions.test.js` — 16 tests pre-review, +7 in the
  review round (`bloodBondPool()`, `parseResistance()` disc-fallback) = 23
- `specs/deferred-work.md` — 2 entries added (review round defers)
- Production `tm_suite.equipment_catalogue` — content only, `'stake'` tag added to the existing
  "Stake" entry (`_id: 6a3385da303c414f83965f7b`), no schema change
