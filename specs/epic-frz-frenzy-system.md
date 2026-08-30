# Epic FRZ — The Frenzy System (scoping stub, not yet storied)

**Status:** backlog, scoping only. Pulled out of Epic RCV's own `rcv.1` on 2026-08-30, after
investigating what a correct fix for the "Riding the Wave" bug would actually require and finding it
was one gap in a much larger, almost entirely unbuilt system.

## What this is

`public/js/game/rules.js:44-56` carries Terra Mortis' own house-ruled frenzy system as glossary text
— five distinct mechanics. Only one is built in the live app at all:

1. **Frenzy Trigger** (fire, starvation, blood, provocation, humiliation) — **not built**. No code
   anywhere detects or offers these triggers; presumably narrated by the ST today.
2. **Resistance Roll** — Resolve + Composure, **1 success needed** (this table's own simpler house
   threshold, not the core rulebook's four-tier dramatic-failure/failure/success/exceptional split),
   usually gain the Tempted Condition on a fail, −1 to future resistance attempts. **Partially built**:
   `char-pools.js`'s `VM_IMMEDIATE` array has the bare roll (Resolve+Composure, no modifiers, no
   Tempted grant, no −1 tracking).
3. **Delay with Willpower** — spend 1 WP to delay frenzy by one round, each point spent adds +1 to the
   eventual resistance roll. **Not built.**
4. **Riding the Wave** — Wits + Composure, **after** the character has already triggered/succumbed to
   frenzy, to direct it. Costs 1 WP per turn attempted, 5 successes needed across attempts. **Not
   built** — and wrongly modelled in the live app today as an unconditional standalone roll
   (`char-pools.js`'s own `VM_IMMEDIATE`, fixed as `rcv-1` in Epic RCV, a pure removal with nothing put
   in its place yet).
5. **Touchstone Talk-Down** — a third party can attempt to calm a frenzying vampire with an extended
   roll. **Not built.**

## Why this is its own epic, not a line item

Building #4 correctly needs state that doesn't exist anywhere in this app today:

- **No "this character is currently frenzying" flag, anywhere.** Confirmed via a full grep of
  `public/js/` and `server/` for "frenzy" — no schema field, no Condition object, nothing read or
  written that represents frenzy as real state. `public/js/game/tracker.js`'s Conditions system
  (`trackerAddCondition`/`trackerRemoveCond`, `:309-337`, backed by `CONDITIONS_DB`, real, working,
  persisted to `/api/tracker_state` once a character is `_confirmed`) is a plausible home for an on/off
  marker, but it's a plain named-list shape, not built to carry numeric state (a successes count, a
  turn number) on a Condition entry.
- **A turn counter exists, but only inside `combat-tab.js`'s formally-tracked combat scenes**
  (`_scene = { combatants, round, activeIdx }`, `:22`, `nextRound()`/`nextTurn()` `:99-108`,
  `sessionStorage`-scoped). The trigger list above (humiliation, provocation, blood) suggests frenzy
  will often happen OUTSIDE a formally-tracked combat scene — a social confrontation has no round
  counter to anchor "1 WP/turn" to today.
- **No cross-roll success accumulator exists anywhere.** `roll-v2.js`'s `doRoll()` surfaces a
  `successes` number per individual roll (`buildRollLogPayload`, `:1112-1117`); nothing sums a
  character's running total across repeated attempts at the same thing. Riding the Wave's own "5
  successes needed" and Talk-Down's "extended roll" both need exactly this and neither has it.
- The recovered `roller-live/app.js` prototype (Epic RCV's own primary design source) **never built
  any of this either** — its "Resisting Frenzy" special (`:181-213`, `:1323-1333`) is a single
  stateless roll with toggleable Suggested Modifiers chips (the p.104 table), useful as a partial
  reference for mechanic #2's own modifiers but silent on #1, #3, #4, and #5 entirely.

Four of these five mechanics need the same underlying state (a frenzy episode with a start, a
duration, and a running tally). Building them one at a time without designing that state once, up
front, risks the same shape of drift this ecosystem has been bitten by before (see Dana's own reason
for existing) — a second mechanic quietly assuming a slightly different shape than the first.

## What this epic needs before it can be storied

1. **A design-lock pass** — there is no existing mockup or prototype for any of this (unlike Epic RCV,
   which had `roller-live/` to port from). This is genuinely new UI/UX, not a port, and needs Sally +
   Angelus's own look-and-feel sign-off before any story gets written, per this project's own standing
   design-lock discipline.
2. **A state-shape decision, likely Dana + Winston's own call to scope**: does a frenzy episode live as
   an extended `tracker.js` Condition (name + a new structured payload — episode start, WP spent,
   successes so far, maybe a scene/session id), or as a new dedicated collection? Given how few fields
   this actually needs and that `tracker_state` already has the write path or `Conditions` already have,
   extending Conditions is the more likely fit rather than a whole new schema.
3. **A decision on scope of a "turn" outside formal combat** — does frenzy triggered in a social scene
   borrow `combat-tab.js`'s own round concept, get its own lightweight turn counter, or resolve as ST
   discretion (the ST manually advancing "turns" via taps, no real clock)?
4. **Whether to build all five mechanics together or sequence them** — #1 (Trigger) and #5 (Talk-Down)
   plausibly don't block #2/#3/#4 and could ship later; #2 (Resistance Roll)'s own missing pieces
   (modifiers, Tempted grant, −1 tracking) are a much smaller, more contained fix than #3/#4's shared
   state-design problem and could plausibly go first once the state shape is settled.

## Not yet scoped as stories

Deliberately not broken into `frz.N` rows yet — that needs the design-lock and state-shape decisions
above settled first, likely via a dedicated `bmad-party-mode` round (Dana, Winston, Sally at minimum)
once Epic RCV is further along or complete.
