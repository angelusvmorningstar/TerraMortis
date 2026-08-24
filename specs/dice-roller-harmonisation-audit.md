# Dice roller harmonisation — research audit (no code changed)

**Status: RESEARCH/AUDIT ONLY.** Nothing in this repo has been edited as part of this doc. Written to
reconcile issue #1039 ("Roller redesign") against what's actually in the codebase, before anyone
shards it into stories — the gap John's own review below flags explicitly. Companion to (not a
replacement for) #1039 itself; read both before scoping.

## Why this exists

TM Game has **five** independent, mostly non-communicating dice-resolution touchpoints that grew
without ever being reconciled against each other. Angelus asked for a full audit — existing roller,
alternate (Piatra) roller, the planned redesign epic's scope, a BMAD party-mode roundtable to weigh
in on harmonising them, then a Phase 0 (audit-only) pass to de-risk the plan before any code moves.
This doc is the output of all four passes.

---

## 1. The five implementations, mapped

| # | File | Used where | Pool-building | Dice math | Spend | Notes |
|---|---|---|---|---|---|---|
| 1 | `public/js/suite/roll.js` (482 lines) | Player suite, **live by default** | Receives a pre-built pool from upstream (`char-pools.js`); no builder of its own | `shared/dice.js` | **None** — WP/Rote costs are honour-system UI toggles, no real deduction | Extracted from a larger monolith (comments reference imports "that will exist once extracted") |
| 2 | `public/js/suite/roll-v2.js` (775 lines) | Player suite, **opt-in only** via a buried per-device Settings flag (`tm-use-new-dice-roller`) | Identical to #1 | `shared/dice.js` (same import) | **Real** — gdx-7's vitae/willpower auto-deduct, gated on `game_in_progress`, reviewed (Blind Hunter/Edge Case Hunter/Acceptance Auditor citations in code), re-entrancy guarded | Strict superset of #1: same pool math **confirmed byte-identical** (see §4), plus spend automation + an "effective pool" anchor UI + a segmented Again pill (#1024 slice A+D) |
| 3 | `public/js/admin/dice-engine.js` (495 lines) | ST/admin app only (`admin.js`) | **Real attr+skill+discipline+power builder** — dropdowns, auto power-cost/action/duration/resistance info banner, auto unskilled penalty | **Own, independent** dice math (does not import `shared/dice.js`) | None | Never ported to the player app. A story (epc-1) claims it was — false for the builder UI; true only for an unrelated tap-to-load piece that actually shipped via `char-pools.js` |
| 4 | `public/js/game/char-pools.js` (176 lines) | Feeds rollers #1 and #2 (not #3) | Tap-to-load "smart pools" — already collapsible, sectioned (Skill/Discipline), badge-annotated (9-Again, Rote-eligible, formula sub-label), persisted collapse state | — (delegates to whichever roller is active) | — | This already does a version of #1039's "collapsible sections" ask; nobody scoping #1039 appears to have looked at it |
| 5 | `public/js/game/contested-roll.js` | Contested/opposed rolls (its own UI, separate from #1/#2's inline opposed-roll path inside `doRoll()`) | **Own, hardcoded** pool-building model — a `TYPES` table (Territory Bid, Social Manoeuvre, Resistance Check) computing pools directly from character data, bypassing `char-pools.js`/`dice-engine.js` entirely | **Own, independent, deliberately simplified** — its own header says *"always 10-again, ignores Roll tab state"*: no 8/9-again choice, no chance-die handling, no Rote | — | Logs every roll to `/api/session_logs` — a real, working server-side roll log, narrowly scoped to contested rolls (relevant to gdx-8/#989, "roll history," still backlog). One pool type reads the active roller's live state directly (`suiteState.PS`) — undocumented, fragile coupling |

**Two more touchpoints, adjacent but not full engines:**
- `game/combat-tab.js` has its own inline `d10()` for initiative (`initBase + d10()`) — crude, but a working precedent for #1039's planned "initiative = single die + composure" special pool.
- `game/challenge-notification.js` doesn't roll client-side at all — results are computed **server-side** and displayed. A sixth resolution point in effect, not audited here (a server route, out of this pass's file scope).

---

## 2. Issue #1039 scope, cross-mapped against reality

| #1039 item | Status |
|---|---|
| Collapsible sections (Combat/Disciplines/Skills/General) + floating pool badge | **Partial** — `char-pools.js` already does 2-section collapsible pool grids; no floating badge; it's a *picker*, not the roller's own input UI |
| Persistent remembered per-power mod chips | **Not built anywhere** |
| Status-difference auto-mods (social manoeuvring) | **Not built anywhere** |
| Spend automation | **Built — only in `roll-v2.js`**, which ~90% of players never see |
| Special pools (initiative/frenzy/lashing-out) | **Not built anywhere** as a system — `combat-tab.js`'s crude initiative `d10()` is the closest precedent; breaking-point correctly stays manual everywhere |
| WS targeted rolls / subtle-power routing / OOC-always-known | **Not built anywhere** |

**Net**: of #1039's six items, only spend automation shipped, and only into one of five touchpoints.
`dice-engine.js` already contains a real, working version of the pool-builder UX #1039 describes
wanting — stranded in the wrong app.

---

## 3. Party-mode roundtable — synthesis

Four BMAD personas (John/PM, Winston/Architect, Sally/UX, Amelia/Dev) reviewed the above
independently, weighted toward #1039 as primary design intent per Angelus's instruction. Full
transcripts are in the session history; synthesis below.

**Near-total convergence on shape**, which is itself a signal:
- **Converge on `roll-v2.js` as the base**, not a from-scratch design. It's the reviewed, shipped
  superset with spend automation already proven.
- **Retire `roll.js` outright** once parity is confirmed (it now is — see §4) — not left behind a flag,
  since the flag mechanism is what caused the Game 7 incident in the first place.
- **Port `dice-engine.js`'s UI/interaction pattern, not its dice math.** Its independent math should
  be deleted once its UX ideas (power-picker + auto cost/duration/resistance info banner) are
  absorbed into the shared roller — not carried forward as a second math engine.
- **`char-pools.js` is the right home to extend**, not rebuild — it already ships collapsible
  sectioned pools in production; grow it to carry dice-engine.js's auto-cost-info and
  auto-unskilled-penalty behaviours as options, rather than reinventing the layout.
- **Mechanics merge before any #1039 net-new UI.** Landing a beautiful redesign on top of five
  still-separate engines makes the underlying fragmentation *harder* to spot, not safer.
- **This is not one story.** Multiple agents independently proposed 3-5 phase/PR sequencing,
  explicitly separating "which roller" from "how do consumers talk to it" from "the genuinely new
  #1039 surface" — so a bad change in one phase doesn't hide inside a 2000-line unreviewable diff.

**Specific contributions per voice:**
- **John (PM)** — reframe #1039 from "build from scratch" to "assemble the parts bin + genuinely new
  bits (mod chips, status-diff mods)." Flagged that #1039 itself is the one document nobody has
  reconciled against the live codebase — everything else here can be read directly, #1039 can only be
  read as *intent* (its source meeting note no longer exists anywhere in the repo).
- **Winston (Architect)** — the shared-DOM-ID contract (`pval`, `mval`, `roll-btn`, etc.) was never a
  feature, it was a workaround for not wanting to touch 5 call sites; fix it as an explicit interface
  *after* the roller merge lands, not in the same change. Proposed a 4-PR sequence: merge with
  existing IDs untouched → soak with a visible "which roller build is active" signal → flip default,
  remove flag → separate story to delete `roll.js` and absorb `dice-engine.js`'s UI patterns.
- **Sally (UX)** — concrete kill list (three separate Again buttons, the self-un-checking WP toggle,
  the unexplained buried Settings checkbox) and survivor list (v2's anchor+disclosure pattern,
  `char-pools.js`'s badges, dice-engine.js's power-info banner as the natural home for #1039's
  per-power mod chips, folding standalone spend buttons into the power-picker flow rather than
  leaving them as an accidental-tap foot-gun). Explicitly named the Settings checkbox itself as a UX
  failure independent of the flag mechanism — a real feature with zero affordance.
- **Amelia (Dev)** — pushed back hardest on assuming v2 is a safe drop-in ("strict superset by line
  count" ≠ "proven safe replacement," since v2 has had near-zero production exposure vs v1). Named
  the two real risks that turned out to be genuine: (1) the shared/dice.js-vs-dice-engine.js math
  divergence, and (2) a state-model question she framed as push-based (`char-pools.js` tap-to-load)
  vs compositional (`dice-engine.js` dropdown-build) pool sourcing. **That framing itself turned out
  to be wrong — see §4d, D5 RESOLVED 2026-08-24**: `char-pools.js` was never flat/push-only, it
  already carries the full compositional breakdown `dice-engine.js` only appears to have. Proposed
  the Phase 0 audit that produced §4 below.

---

## 4. Phase 0 audit findings (the follow-up Angelus commissioned)

Three read-only passes, run after the roundtable, specifically to de-risk before any code moves.

### 4a. `roll.js` vs `roll-v2.js` — CONFIRMED byte-identical on gameplay math
Actual `diff` run (399-line unified diff), function by function. `effPool()`, `chgPool()`,
`chgMod()`, `loadPool()`, `togSpec()`, `updWeaponRef()`, `mkDieEl()`, `mkColsEl()`, `addHist()`,
`renderHist()`, `clrHist()`, `togEquipChip()` — all byte-identical, zero diff hunks. **`doRoll()`'s
entire dice-resolution logic (chance-die branch, Rote roll-twice-keep-better, contested/opposed
branch, exceptional threshold) is byte-identical** — the only insertion is the new spend block and
the `async` keyword; everything from `if (eff <= 0)` onward is unchanged. **No live rules-divergence
bug between v1 and v2** — players on either roller get identical outcomes for identical inputs. The
risk here was UI/feature parity and the flag mechanism, not silent rule disagreement.

### 4b. `shared/dice.js` vs `dice-engine.js` vs official rules text — Rote is a deliberate house rule, not a bug
Full 3-way comparison against `st-working/reference/Vampire the Requiem 2e Rulebook.md`:

| Mechanic | Verdict |
|---|---|
| Success threshold (8/9/10) | All agree |
| Again explosion (10-again baseline, overridable) | All agree, identical default and logic |
| Chance die (pool ≤0, 10=success, 1=dramatic failure) | All agree |
| Exceptional success (≥5 successes) | All agree |
| Dramatic failure (not auto-applied to a normal 0-success roll) | All agree, correctly |
| **Rote quality** | Departs from RAW, identically everywhere — **confirmed intentional, D1 RESOLVED 2026-08-24** |

**Rote quality — RULED, not a bug.** Official RAW is *reroll only the individual dice that failed,
once each, keeping original successes*. What's coded everywhere (`shared/dice.js`'s callers AND
`dice-engine.js` independently) is *roll the entire pool a second, fully independent time, keep
whichever complete pool has more successes*. This audit originally flagged the difference as a
defect needing a decision — **Angelus confirmed 2026-08-24 this is a deliberate house-rule shift
from RAW, not a mistake: "roll twice take best result is what we're using."** No code change, no
retroactive accounting for past Rote rolls. D1 is closed; rlv.9 (which existed solely to fix this)
is superseded — see the epic file's own D1/rlv.9 rows.

Not relevant now that D1 is resolved, kept for the historical record only: whether
`game/contested-roll.js`, `game/combat-tab.js`, or `game/challenge-notification.js` implement Rote
at all was never checked in this pass — moot, since there is no fix to apply consistently.

### 4c. Real call graph of the five external consumers — confirms 3 engines is an undercount
- **`app.js`** — the only file importing both rollers; boot-time DOM-subtree removal per the flag;
  touches the full shared-ID surface.
- **`shared/resist.js`** — no import from either roller at all; coupling is entirely via shared
  `state` (`RESIST_CHAR`/`RESIST_MODE`/`RESIST_VAL`). No independent dice math.
- **`game/contested-roll.js`** — imports only `mkDieEl`/`mkColsEl` (rendering helpers) from
  `roll.js`. **Confirmed as a genuine third dice-resolution engine** — its own header says
  *"always 10-again, ignores Roll tab state."* Also a fourth, hardcoded pool-building model (the
  `TYPES` table), bypassing every other pool-building path in the app.
- **`game/combat-tab.js`** — imports `loadPool, doRoll` from `roll.js` specifically, **never
  roll-v2, never flag-aware**. `doRoll` is imported but never called (dead import).
  **`loadPool()` IS called** by Quick Roll, then calls `goTab('dice')`.
  **CONFIRMED LIVE BUG**: when the new-roller flag is ON, `#t-dice` was removed from the DOM at
  boot (only `#t-roll` exists) — `goTab('dice')` silently finds nothing and no-ops. **Anyone on the
  new roller who taps Quick Roll from the Combat tab today gets nothing, with no error.** Same
  failure shape as the Game 7 incident (a silent per-device divergence nobody can diagnose by
  looking at the screen). Also confirms `combat-tab.js`'s own inline `d10()` for initiative (§1).
- **`game/challenge-notification.js`** — imports only `mkDieEl`/`mkColsEl` from `roll.js`
  (defensively wrapped in try/catch — the author already distrusted this import). No client dice
  math; results come from a server-side roll, per its own header comment. A fifth resolution point,
  not audited here.

**Bottom line**: not three independent dice-math implementations — **five**, once
`contested-roll.js`'s engine and the server-side path behind `challenge-notification.js` are
counted. The `mkDieEl`/`mkColsEl` imports into `contested-roll.js`/`challenge-notification.js` are
safe today only because those functions are currently byte-identical between v1/v2 — any future
divergence there would silently desync their visuals from whichever roller is actually active.

### 4d. `char-pools.js` vs `dice-engine.js` — D5 RESOLVED 2026-08-24, the "two models" framing was wrong

Investigated 2026-08-24 at Angelus's request (his own suspicion: "char-pools was built by Peter for
the dice roller app, and so is doing this in a smarter way" than credited). Read both files in full,
plus `shared/pools.js`, plus `git log`/`git blame` on `char-pools.js`.

**`char-pools.js` is NOT push-based/flat — it already IS the compositional model, and a richer one
than `dice-engine.js`.** Every pool it builds (`char-pools.js:104,129`) is a full breakdown object
— `{ total, attr, attrV, skill, skillV, discName, discV, unskilled, resistance, cost, vitae_cost,
willpower_cost, meritBonus, meritLabel, nineAgain }` — not a bare number. For discipline/power pools
this comes from `shared/pools.js`'s `getPool()` (lines 29-77), which resolves a rule's
`{attr, skill, disc}` spec into that same full breakdown, including rules text and costs. This whole
object is passed straight into `roll-v2.js:loadPool(total, name, pi)` (line 182) and stored as
`state.POOL_INFO` (line 188) — and it is **already load-bearing**, not vestigial: `effline`'s
breakdown display renders it segment-by-segment (`roll-v2.js:339-349` — attr/skill/unskilled/
discName/merit/rote/WP/resist each their own span), and `spendableCost(state.POOL_INFO, ...)`
(line 145) drives gdx.7's real shipped vitae/WP spend automation off it. The original audit's
"push-based tap-to-load" framing (§3, Amelia's bullet) undersold this file — the ingredients survive
end-to-end and already power a real feature.

**`dice-engine.js`'s "compositional" state is shallower, not richer, despite looking more
manual.** `selAttr`/`selSkill`/`selDisc`/`selSpec` (lines 33-37) only track which dropdown is
currently picked; the pool number is *re-derived from scratch* on every render via
`getAttrVal`/`getSkillVal`/`getDiscVal` (lines 66-79), with no persisted breakdown object and no
cost/resistance/rules metadata carried anywhere. It is compositional in "you assemble it by
picking," not in "it remembers what it's made of" — the opposite of what §3/§5 item 7 implied.

**What #1039 actually needs (toggleable per-power modifier chips) is a proven pattern already,
not a missing capability.** `roll-v2.js`'s `state.WP`/`state.MOD`/`state.ROTE` are already
independent, toggleable additive layers stacked on the base `pi`, each live-updating
`effPool()`/`updPool()` (lines 208-225). A persistent chip is structurally "one more toggleable
layer," generated from a list instead of hardcoded — a small extension of an existing pattern, not
a foundation swap.

**Authorship, checked against `git log`:** Angelus himself wrote `char-pools.js` originally
(2026-04-04, Story 6.2) — the hypothesis "built by Peter" is not quite right. Peter did contribute 6
of the file's 10 commits afterward with real improvements (9-again auto-select, derived-data
application, discipline-power correctness) — so "Peter made it smarter" holds, "Peter built it"
doesn't. `dice-engine.js` is the Peter-heavier file (8 of 14 commits).

**D5 RESOLVED: standardise the unified roller on `char-pools.js`/`shared/pools.js`'s model.**
`dice-engine.js`'s own *data shape* is not ported in as a foundation — that would be a downgrade,
losing cost/resistance/rules metadata that already exists and is already used. `dice-engine.js`'s
*dropdown-assembly UI* is the part worth reusing, as an alternate entry path for ad-hoc rolls that
have no pre-built pool button (its actual real use case) — it should construct the same `pi` object
shape `char-pools.js` already produces, not a competing shape. This changes rlv.3/rlv.4's own
framing: not "reconcile two competing state models," but "add a generated-chip toggle layer plus an
ad-hoc dropdown entry path onto the model that already won." One item flagged but not resolved by
this pass: `char-pools.js`'s `_pools` module-level array (line 52) is a mutable singleton — worth a
look for race/staleness risk once a chip-toggle layer is added, when rlv.3 is actually storied.

---

## 5. Open decisions for Angelus

1. **Rote fix** — scope and timing, independent of the roller consolidation. Does it ship as its own
   fix regardless of #1039's sequencing? Any retroactive-accounting question for past Rote rolls?
2. **Chassis choice** — roundtable converged on `roll-v2.js` as the base; confirmed safe by §4a.
3. **DOM-contract cleanup** — Winston's proposal (land with existing IDs first, convert to a real
   `getPool()`/`onRollComplete()`/`mountInto()` interface as a *separate* follow-up) vs. doing it in
   the same pass.
4. **`combat-tab.js`'s Quick Roll bug** — worth an immediate, narrow fix (make it flag-aware, or route
   through the active roller's real API) independent of the larger consolidation, given it's already
   live and silent.
5. ~~**`contested-roll.js`'s scope**~~ — **D4 RESOLVED 2026-08-24: stays separate.** Confirmed it is
   NOT a near-duplicate of Epic CRD's `challenge-initiation.js` despite sharing the same three
   roll-type labels — `contested-roll.js` is an ST-only, no-persistence, in-session quick-tool
   (`#btn-contested` hidden from players, `app.js:1631-1632`); CRD's system is player-initiated and
   asynchronous, with no stated intent anywhere in its own docs to replace this file. The
   simplification is a real feature of its use case, not a limitation — not folded in. Its working
   server-side roll log remains relevant to gdx-8. See `epic-rlv-roller-harmonisation.md`'s own D4
   line for the full record.
6. **Staged-rollout mechanism** — reuse the existing (imperfect) flag infrastructure for one more
   soak cycle with a visible "which build is active" signal (Winston's proposal), or a different
   approach given the flag itself already caused one incident.
7. ~~**State-model reconciliation**~~ — **RESOLVED 2026-08-24, see §4d.** There was never a real
   two-model conflict: `char-pools.js`/`shared/pools.js` already carry the full compositional
   breakdown `dice-engine.js` only appears to have. Standardise on the `char-pools.js` model; port
   `dice-engine.js`'s dropdown UI in as an alternate ad-hoc entry path, not a competing data shape.

## Provenance

Researched 2026-08-22 across four passes in one TM Game session: (1) independent parallel mapping of
`roll.js`, `roll-v2.js`, and `dice-engine.js`/`char-pools.js` against issue #1039's stated scope; (2)
a BMAD party-mode roundtable (John/Winston/Sally/Amelia) synthesising the harmonisation approach; (3)
a Phase 0 read-only audit (byte-diff, rules cross-check, call-graph mapping) Amelia's own review
proposed and Angelus commissioned. All passes read-only — no file in this repo was edited to produce
this document.
