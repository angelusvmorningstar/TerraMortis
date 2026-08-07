---
adr: ADR-010 Rev 3 (D2, D3a, D6, D7 partial)
issue: 1111
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1111
branch: piatra/issue-1111-swear-by-stories
depends_on: OATH-A
---

# Story OATH-B (#1111): breaking a Swear By oath suspends the pledged dots

## Status

Ready for Review

## Story

**As a** Storyteller adjudicating a broken oath,
**I want** the breach recorded as an event and the pledged dots to stop counting until I restore them,
**so that** breaking an oath costs the player visible access to what they staked, and the record of when it happened survives.

**Restoration timing is deliberately not automated.** The system suspends and records; the ST decides when dots come back and appends an event to say so.

## The scope reduction, and the one thing it must not take with it

Peter's ruling: *"a chapter is a month so back at one per chapter, however this need not be encoded now."*

Deferred: **the automatic computation of when restoration is due.** Nothing schedules, nothing expires, no due dates.

**NOT deferred: the `restored` event itself.** Suspension is a *derived value* — computed per render from `sworn_by.history`, materialised as a transient `m._suspended_dots`, never stored. **You cannot hand-clear a computed value.** The only way an ST can lift a suspension is to append an event the computation reads. Drop `restored` as part of "deferring restoration" and dots go dark at breach with no route back except hand-editing a character document — which is precisely what the append-only log exists to prevent.

## Acceptance Criteria

1. **Exit is an append-only typed event**, not a mutable status field. An oath can be sworn, broken, partly restored and re-sworn; a single status field loses the history. Appended to `sworn_by.history`:
   ```js
   { event: 'exited', reason: <enum>, chapter_number: <int|null>, at: <iso> }
   { event: 'restored', dots: <int>, at: <iso> }
   ```
   `reason` ∈ `broken | abandoned | released_by_liege | fulfilled | st_void`.
2. **Only `broken` and `abandoned` forfeit.** A liege releasing a vassal, a fulfilled oath, and an ST void all end the oath with **no suspension**. Test all five reasons, not just the two that bite.
3. **HARD AC — every exit event records `chapter_number`, asserted on the PERSISTED EVENT.** Nothing reads it yet, which is exactly why it is at risk: it looks like dead weight to anyone working this story. **Which chapter an oath broke in is unrecoverable after the fact** — miss it and the deferred restoration work has no anchor, and the remedy is ST archaeology across session logs. Assert on what was written to the document, not on what the renderer displays.
4. **HARD AC — a suspension can be lifted.** Appending `restored { dots: n }` returns those dots to effective use. This is the single most likely casualty of the scope reduction. Assert dots-suspended → append `restored` → dots usable again.
5. **Suspension enters at exactly one helper: `meritEffectiveRating`** (`public/js/editor/domain.js:309`), in the general fall-through branch so it applies to every merit category. It already applies this shape of reduction (Haven cap, Carthian exclusion, Herd bonuses) and its docstring already designates it the canonical effective-dots read. Suspension is another cap.
6. **HARD BOUNDARY — suspension must NOT touch `meritRating` (`xp.js:190`) or `xpSpent`.** Breaking an oath costs *access*, not the XP that bought the dots. Refunding would be a rules error and would make `xpLeft` jump on breach. The owned-vs-effective split is not an obstacle to route around — it is the distinction the rules require, already built.
7. **HARD AC — the `meritEffectiveRating` read-path audit is DEMONSTRATED, not asserted.** Its docstring *claims* universal use; that is not evidence of universal use. Every read that displays or rolls merit dots must be shown to route through it. Any that does not will show unsuspended dots after a breach. Demonstrate by mutation: suspend dots, then confirm every surface reflects it.
8. **`_suspended_dots` never persists.** `_`-prefixed, therefore stripped by both existing save paths — `buildSaveBody` (`admin.js:962`) and `charsForSave` (`export.js:79`). Verify it reaches neither the API nor the localStorage mirror.
9. **Forfeiture schedule declared on the rule, default variant only:**
   ```js
   forfeiture: { type: 'chapter_span_then_monthly', chapters: 2, restore_per_month: 1 }
   ```
   Both parameters are restoration parameters, so **nothing reads either yet.** That is acceptable *only because* D8 makes the field declared, schema-valid and ST-editable. Declared-and-manageable-but-not-yet-consumed is fine; undeclared-and-unwritable is the `cost_model` failure repeating.
10. **The `{ type: 'session' }` variant DEFERS with restoration — do not ship it.** Its entire content is *"this suspension ends automatically at the end of the session"*. With restoration deferred, nothing ends it, so shipping it starts a suspension that **never terminates**. Oath of the Bloody Hand's duty lapse is a temporary penalty with a natural end, not a forfeiture with a recovery schedule. Half-implemented it silently over-penalises forever, and the failure is invisible — the sheet shows a correct-looking suspension that simply never lifts. Ship the discriminator; ship only the default variant.
11. **Weaker companion to AC3:** the resolver tolerates `chapter_number` absent without throwing. Lower stakes than AC3 in this scope — nothing computes expiry, so sparse data cannot mis-expire — but it must not crash.
12. **Suite unchanged, not green.** Same named-set criterion and the same two preconditions as OATH-A (`markdown/` present, MongoDB reachable via `MONGODB_URI` — a local `mongod` cannot work).

## Dev Notes

### Chapter is month — do not build a date scheduler
"One dot per month" and "one dot per chapter" are the **same rate in different units.** The whole mechanic anchors on `chapter_number`: blackout span in chapters, restoration rate in chapters, **no date arithmetic anywhere.** ADR-010 Rev 1 argued the opposite and was retracted; anyone reaching for a wall-clock timer is following withdrawn reasoning. This is a rules fact, not a data fact — unlike the data-sparsity observations, it does not decay.

### Why the event log rather than a status field
Follows ADR-004 Rev 4 Position B and the `st_mod_audit` shape: capture delta and reason **at** the event, so a later edit cannot rewrite history.

### Partner sums are untouched
Whether suspended dots stop counting toward a *partner's* shared-domain total is rules-silent. Left alone deliberately — answering it here would pre-judge the deferred MNEC-prerequisite audit, which is already load-bearing for the `domain.js` vs `characters.js` divergence in ADR-005 §D6(b). A rules-silent question should not be answered as a side effect of an unrelated story.

### Why not add a sixth dot sum
Merit-dot arithmetic is already forked five ways and the five **disagree today**: `meritRating` omits attaché/carthian/fwb/retainer; `meritFreeSum` has a categorical Necropolis gate; `domMeritShareableSingle` is cp+mci+xp only; `meritEffectiveRating` adds caps; the server sum in `characters.js` differs again. Any "subtract it in the sum" design picks one of five and drifts from four.

## Dev Agent Record

### Agent Model Used

Ptah (DEV) — claude-opus-5

### Two premise corrections, both measured before building

**1. The briefed implementation site was wrong.** ADR-010 D2 and AC5 both said suspension goes in `meritEffectiveRating`'s general fall-through "so it applies to every merit category". Measured, that is false — three branches return early above it. I implemented the briefed version, set a 2-dot suspension on a 3-dot merit and measured all seven categories:

```
general / influence / domain plain      effective 1   suspended ok
Safe Place, Feeding Grounds             effective 3   NOT SUSPENDED
Haven, Mandragora Garden                effective 3   NOT SUSPENDED
any shared domain merit                 effective 3   NOT SUSPENDED
```

ADR-010 D1's own worked example pledges **Safe Place**, so the ADR's canonical case was precisely the one its stated site would miss. The failure is invisible: correct-looking history, unchanged sheet, no error.

**2. Then the first correction was also wrong, and the second correction was incomplete.** Subtracting at the exported exit fails once the cap binds — `domMeritTotal` ends `Math.min(cap, total)` with cap 5, so `Safe Place own 4 + partner 3, pledge 4` gives `5 - 4 = 1`, below the partner's own 3. Moving the subtraction into `domMeritContribSingle` then broke it the other way: both combining branches gate the partner term on `if (own >= 1)`, so suspending the own term to 0 **closed the gate** and discarded the partner contribution entirely — 0 instead of 3.

**Resolution (ADR-010 Rev 4, SM ruling): the gate reads UNSUSPENDED own, the sum reads SUSPENDED own.** Not a workaround — it is the owned-vs-effective distinction D2's hard boundary already rests on, surfacing at the one place both values are needed at once:

- the **gate** asks *"do you hold at least one dot of your own"* — an **ownership** question
- the **sum** asks *"how many dots do you have access to"* — an **access** question

A suspension does not unmake ownership; that is exactly why it must not reach `meritRating` or `xpSpent`. Partners therefore keep contributing even when the owner's own dots are suspended to zero.

### Where the subtraction lands

One subtraction **rule** at the same **logical** point in every path — the own term, before combination and before capping:

| path | site | partner term? |
|---|---|---|
| MULTI_INSTANCE (`domMeritTotalSingle`) | `ownEff` before the sum | yes — gate stays on unsuspended `own` |
| shared (`domMeritTotal`) | `ownEff` before the sum | yes — same |
| CAP_DOMAIN | at its own return, after the cap | no |
| fall-through | at its own return | no |

The two paths with a partner term subtract inside their combining helper and return before the fall-through, so the suspension is applied **exactly once** on every path. The 7-category sweep asserts `after === before - 2` for each, which is the no-double-application proof: a second application would show as `before - 4`.

The zero floor is **required**, not defensive — a capped merit already returns fewer dots than the character owns, so cap-minus-pledge is routinely negative.

### AC7 — the read-path audit found the primary sheet

The audit is what AC7 was written for and it found a surface much larger than the three downtime sites: **7 of 8 renderer × mode combinations displayed unsuspended dots after a breach.** `sheet.js` calls `meritEffectiveRating` three times; the general, influence and standing rows hand-roll `'●'.repeat((m.cp||0)+(m.xp||0))`.

Domain **view** was already correct because it reads `meritEffectiveRating` directly — that is the reference shape, and where a site could be made to look like it, it was.

Scoped by measurement rather than by symbol count, which mattered: of the nine `shDotsMixed` sites originally identified, **4 were already fixed** by the `domain.js` work, **1 was not applicable**, and most of the real failures were at plain `'●'.repeat()` emitters that a `shDotsMixed` grep does not see.

All eight combinations now correct.

**Presentation is a one-line change.** Every display funnels its suspended *count* through `shDotsSuspended`, which is the only place that decides how a suspension looks. Interim behaviour removes the dots from the purchased band; the hollow-band alternative is one line inside that function, pending Peter's ruling. Dots come off the **purchased** band specifically — pledges are made against owned dots, so bonus dots were never pledgeable and are never what is lost.

### Stated exclusions

Written down rather than silently skipped, so each can be re-examined instead of reading as an oversight:

- **`sheet.js:1348`, the virtual compound row** — `_vOwn` is hardcoded 0. The row exists *because* the character does not own that merit, and an unowned merit cannot be pledged. Nothing to suspend.
- **`tabs/wizard.js`** — character creation cannot have a broken oath: a character that does not exist yet has no oath history, and the pledge editor lives in the sheet editor. If oaths ever become creatable at creation time, this needs revisiting.
- **Fighting styles and manoeuvres** — two more two-band emitters, not merit dots, not pledgeable.
- **`public/js/suite` and `public/js/game`** — contain no merit-dot reads at all, so *"every read that rolls merit dots"* is an **empty set**. Recorded as an emptiness observation and deliberately **not** asserted as coverage: a test over an empty set passes because there is nothing in it.
- **The three MUST-BYPASS sites** (`xp.js` XP accounting, `edit.js` OATH-A pledge floor, `data/audit.js`) read **owned** dots by design and are asserted to contain no suspension symbol. The pledge floor is the subtle one: if a suspension lowered it, breaking an oath would unlock selling the very dots that were staked.

### Presentation — ruled, not guessed

Peter, 2026-08-07: **suspended dots vanish from the solid band.** The dot row means *what you can use right now*; the "still yours" half is the badge's job, and the badge already exists from OATH-A.

Not hollow, because `○` currently means "bonus" and nothing else — reusing it would make it mean "bonus OR suspended" with nothing telling them apart at a glance. Same overloading objection that rejected the self-referential `exclusive` shim in D5. One glyph, one meaning.

**Only the solid band shrinks**, and that is arithmetic rather than presentation: pledges are measured in `meritRating` terms, so bonus dots were never pledgeable and are never what is lost. Asserted, not merely floored — if a suspension ever ate into the hollow band it would mean something upstream is treating bonus dots as pledgeable, which is a bug.

The ruling cost nothing to apply because every display funnels its suspended *count* through one function rather than each learning a rendering rule.

### A regression I introduced, caught only because Mongo was briefly up

Tightening `forfeiture` to a single declared variant **broke OATH-A's D8 round-trip suite**: its fixture used `{ type: 'default' }`, which was a placeholder that never named a real variant, so five tests began failing on a 400.

Fixed by updating the fixture to the real schedule rather than loosening the schema to accept a value that was never valid.

Two things worth recording about *how* it surfaced. It appeared only in a run where MongoDB happened to be reachable — every Mongo-down run skipped those tests and showed a clean named-set match. And my own sweep could not have found it, because it is a cross-story schema interaction rather than a rendering one. **This is the concrete cost of the DB-backed suites being unrunnable in a worktree**: a real regression sat invisible behind 1084 skips, and only an intermittent connection exposed it.

Mongo went away again before I could re-run, so **the fix itself is unverified** — see below.

### Test results

`oath-b-suspension.test.js` — **49 tests, all passing, no DB required.** The API round-trip proving `chapter_number` and the forfeiture params survive persistence is `oath-b-d6-api-roundtrip.test.js`, which is DB-backed and **skipped in this worktree**.

Full suite, Mongo-down: **4 failed → 4 failed**, the deterministic set by name (`n7-n9` meritPrereqOK ×1, `epic.708.3` ×3), no OATH-B surface.

Full suite in a brief **Mongo-up** window: 2257 tests, **0 skipped** — which surfaced the 5 OATH-A round-trip failures above. After the fixture fix, Mongo was unreachable again across three retries, so **the repair is unverified and Ma'at must confirm it**, along with OATH-B's own 15 round-trip tests, which have still never executed.

### The pattern this epic kept hitting

Three times the stated implementation site was wrong, and twice the correction itself needed correcting — including the SM's. In every case the claim was *true at the granularity anyone checked it at*:

> **A site can be right about which function and wrong about which point inside it, and only a case that exercises the boundary distinguishes them.**

"The fall-through applies to every category" was true of the function and false of the branch. "Subtracting at the exit is safe" was true while the cap did not bind. "`domMeritContribSingle` is the own term" was true for the sum and false for the gate. Each survived review because reviewing it at the level it was stated at confirms it.

The defence that worked was never a sharper reading — it was building the stated version and measuring the property across every input, which does not require guessing which layer is wrong.

### Change Log

| Date | Change |
|---|---|
| 2026-08-07 | Measured the briefed site as wrong across 7 categories; SM approved the restructure |
| 2026-08-07 | Ordering corrected twice (exit → own term → gate/sum split) per ADR-010 Rev 4 |
| 2026-08-07 | AC7 audit found 7 of 8 renderer × mode combinations wrong; all fixed behind a single presentation seam |

## QA Results

_(Ma'at)_
