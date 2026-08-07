---
adr: ADR-010 Rev 3 (D2, D3a, D6, D7 partial)
issue: 1111
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1111
branch: piatra/issue-1111-swear-by-stories
depends_on: OATH-A
---

# Story OATH-B (#1111): breaking a Swear By oath suspends the pledged dots

## Status

Ready for Dev (blocked on OATH-A)

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

_(Ptah)_

## QA Results

_(Ma'at)_
