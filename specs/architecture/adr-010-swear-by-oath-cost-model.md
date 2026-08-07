---
id: ADR-010
title: 'Swear By oath cost model — merit attachment, encumbrance vs suspension, and typed oath metadata'
status: approved
date: 2026-08-06
author: Imhotep (Architect)
revision: 4
supersedes: null
issue: 'https://github.com/angelusvmorningstar/TerraMortis/issues/1111'
related:
  - specs/architecture/adr-005-pool-grant-and-sharing-scope-generalisation.md (D1 slug-keyed map; D3 discriminator-typed `sharing_scope`; D3/D6 render-time-synthesis and runtime-guard discipline this ADR reuses)
  - specs/architecture/adr-004-st-mods-overlay.md (D8 cache-entry invariant; single-composition-site pattern; immutable-audit retention Position B)
  - specs/architecture/adr-006-defence-penalty-readpath.md (D4 precedent — a whitelisted stat_path whose value was never read; the same class is live on `merits.N.dots`)
  - server/schemas/purchasable_power.schema.js (`additionalProperties: false`; `cost_model` undeclared)
  - server/routes/rules.js:59 (POST validates), :69-76 (`UPDATABLE_FIELDS` allowlist — `cost_model` absent)
  - server/schemas/character.schema.js (merit definition, `additionalProperties: false`)
  - public/js/editor/domain.js:309 (`meritEffectiveRating` — designated canonical effective-dots helper)
  - public/js/editor/xp.js:190 (`meritRating` — owned-dots helper, distinct from effective)
  - public/js/editor/merits.js:20 (`isMeritExcluded` — existing exclusion walk)
  - 2026-07-25_meeting.md §2 "Rules & sheets" (prior recorded direction on oaths and on forced merit loss — superseded by #1111 per Peter, 2026-08-06)
  - 'https://github.com/angelusvmorningstar/TerraMortis/issues/1119 (merits.N.dots dead read path in the st_mods whitelist — filed from §5 of this ADR; independent of this work)'
  - memory: project_necropolis_merit_family, feedback_two_views_same_arithmetic, feedback_verify_issue_cited_paths
---

# ADR-010 — Swear By oath cost model

## Revision history

| Rev | Date | Change | Author |
|---|---|---|---|
| 1 | 2026-08-06 | Initial. Written ahead of a story for issue #1111 at Peter's direction (ADR before story). Grounding by Khepri (SM) on the Chapter-boundary question and the `cost_model` reachability question was taken as given and then re-verified against live Atlas and the route code; three of the SM's framing assumptions changed as a result (see Context §3). Six decisions requested; eight recorded (D7 and D8 are consequences the survey forced). Four questions left open, one of them (Q1) blocking. | Imhotep (Architect) |
| 2 | 2026-08-06 | **Status → approved.** No decision text changed; D1–D8 stand exactly as drafted in Rev 1. Three status updates only. (a) **Q1 resolved by Peter: build it — the issue supersedes the 2026-07-25 meeting, full scope.** The ST-mod alternative is not pursued; the `merits.N.dots` dead read path from §5 was filed independently as #1119 and is no longer a cost on this work. (b) **Q3 resolved by Khepri (SM), not escalated: partner shared-domain sums stay untouched**, with the added justification that touching them would pre-judge the deferred MNEC-prerequisite audit. (c) The two-story implementation seam in the closing note is **adopted** rather than merely offered. Q2 (uniqueness scope) and Q4 (restoration trigger) remain open with Peter; neither blocks Story A, and Q4 affects only the trigger step of Story B. Approved-with-opens follows the ADR-005 Rev 2 precedent of a deferred non-blocking question inside an approved ADR. | Imhotep (Architect) |
| 3 | 2026-08-06 | **Q2 and Q4 answered by Peter; no open questions remain.** Both answers shrink the build, and one corrects a factual premise. (a) **Q2 — uniqueness is not enforced in code at all.** "I would rather have the STs coordinate and check this rather than enforce in code." That is not a choice between the scoping options offered; it declines enforcement. **D5 is withdrawn**, not narrowed — no `uniqueness` field, no write-path check, no picker filter — and survives only as a rejected alternative recording the *product* reasoning, so a later reader who finds the constraint in the rules text does not file its absence as a bug. (b) **Q4 part 1 — a Chapter IS a month.** This voids D3b's argument (i) outright: "one dot per month" and "one dot per chapter" are the same rate in different units, so **there is no wall-clock dependency anywhere in this mechanic**. Arguments (ii) sparse data and (iii) the recorded ST-call preference stand. (c) **Q4 part 2 — restoration is deferred entirely**; no scheduler, no due-date computation, no trigger. **D3b is withdrawn** as a shipping decision and restated as the deferred work's specification. Consequential amendments the survey forced, none of them requested: D6's `restored` event is **load-bearing and must survive the deferral** (see D3b); D7's `session` variant **cannot ship** with restoration deferred; and D3a's binding obligation moves from render-time to **write-time**. D1, D1b, D2, D4, D6, D8 are unchanged. | Imhotep (Architect) |
| 4 | 2026-08-07 | **D2's implementation site corrected. Decisions otherwise unchanged; OATH-A already merged (`dev` at `b2cf0d21`) and is unaffected.** Found by Ptah at build time by implementing the briefed version and **measuring all seven categories**; confirmed by the SM; re-verified here against `origin/dev`. (a) **The fall-through is not universal.** `meritEffectiveRating` has three early returns inside its `domain` branch, so a suspension applied only in the fall-through is silently ignored by Haven, Mandragora Garden, Safe Place, Feeding Grounds and every shared domain merit. **D1's own worked example pledges Safe Place**, so the ADR's canonical case was precisely the one its stated site would miss. D2's surrounding reasoning — no sixth fork, suspension is another cap, `meritEffectiveRating` is the designated read — all stands; only the named branch was wrong. (b) **New finding, not in the SM's brief: the subtraction must precede the cap.** The approved fix (subtract once at the exported exit) closes the coverage gap but is order-wrong: both combining branches return `min(5, own + partner)`, so subtracting after the cap under-reports whenever the cap binds, and drives the owner's total below the partner's contribution. The SM's stated equivalence of the two designs does not hold. Decision: subtract on the **own-dots term, before combination and capping**, in every branch; the zero floor is required rather than defensive because `CAP_DOMAIN` can return less than own dots. (c) The SM's test #1 is **correctly designed and will fail** on the briefed implementation — its two clauses are mutually unsatisfiable in the capped case — so it must not be weakened to go green. | Imhotep (Architect) |

---

## Context

### 1. The mechanic

The reworked Invictus Oaths introduce a cost model with no equivalent in the schema. Per the source document ("New and Improved Invictus Oaths"):

> 'Swear By' oaths do not cost xp. Instead, they are attached to an equal number of xp worth of merits. If the oath is broken or abandoned (but not if the liege releases the vassal, as appropriate) access to those dots is temporarily lost. The PC will lose access to them entirely for that Chapter and the next, after which they will return at the rate of one dot per month.

Five oaths use it. They are seeded and live.

### 2. Verified live state

Queried directly against Atlas `tm_suite` on 2026-08-06 (the repo contains no seed script for these rows — the referenced `TM Cockpit/scripts/seed-covenant-merits-2026-08.mjs` and `content/rules/NEW-MERITS-TO-PORT.md` do not exist in this repository, so the rows were written from outside it):

| key | `cost_model` | `rating_range` | `sub_category` | `implemented` |
|---|---|---|---|---|
| `oath-of-abstinence` | `swear_by` | `null` | `null` | `false` |
| `oath-of-action` | `swear_by` | `[1,5]` | `null` | `false` |
| `oath-of-the-model-prisoner` | `swear_by` | `null` | `null` | `false` |
| `oath-of-burning-blood` | `swear_by` | `[1,5]` | `'oath'` | `true` |
| `oath-of-the-bloody-hand` | `swear_by` | `[1,5]` | `'oath'` | `true` |

Ten rows carry `cost_model` in total — the five above plus five at `cost_model: 'free'` (`oath-of-penance`, `oath-of-the-handshake-deal`, `oath-of-running-blood`, `blood-tell-oath`, `oath-of-blood-knives`), which #1111 correctly scopes out.

Four facts from that table matter architecturally:

- **`rating_range: null` is already correct** on the two derived-rating oaths. D4 does not need to displace a wrong value; it needs to supply the missing basis.
- **`sub_category` is inconsistent** across the family: the three older rows are `null`, the two newer are `'oath'`. Any picker or filter keyed on `sub_category === 'oath'` will silently see two of five.
- **`exclusive` is `null` on all five.** The uniqueness constraint is unexpressed today — and per Rev 3 (D5 withdrawn) it stays that way by decision.
- **Zero characters hold any of the five.** `characters` was scanned for all five names: no holders. **This work is greenfield — there is no backfill, no migration, and no live data to preserve.** That is the single largest simplification available and it should be spent, not banked.

### 3. Three corrections to the dispatch framing

The SM's grounding was re-verified rather than assumed. Three points moved:

**(a) `cost_model` is not merely unread — it is unreachable and unmanageable.** The SM confirmed nothing reads it, which is true. The stronger fact is that nothing can *write* it either:

- `server/routes/rules.js:59` validates `POST /api/rules` against `purchasablePowerSchema`, which declares `additionalProperties: false` and does **not** declare `cost_model`. Creating a swear-by oath through the API is rejected today.
- `PUT /api/rules/:key` filters the body through `UPDATABLE_FIELDS` (`rules.js:69-76`), which does not include `cost_model`. An ST editing one of these rows in the admin Rule Data UI cannot change it. (`$set` on the filtered subset means the existing value survives — this is unreachable, not destructive.)

The five rows exist only because they were written directly to Atlas, bypassing both. They currently fail their own schema. Every field this ADR introduces inherits the same constraint, so schema-and-allowlist reachability is promoted to a decision in its own right (D8) rather than left as an implementation detail.

**(b) The Chapter ordinal is expressible but not reliably populated.** `game_sessions.chapter_number` exists and is ST-editable, as stated. In live data it is set on **3 of 14** sessions. `downtime_cycles.is_chapter_finale` is `true` on **1 of 6** cycles, explicitly `false` on one, and absent on four. `chapter_label` is free text with no shared format across the three rows that have it (`"Game 6"`, `"Story 2, Chapter 2"`, `"Ch 2, Game 4"`), and is read off *cycles* at `admin/downtime-views.js:1935` while being *schema'd* on sessions — two homes, one of them undeclared (`downtime_cycles` has no schema file at all).

The boundary is therefore derivable in principle and unreliable in practice. This does not block D3a (which anchor), but it is decisive for D3b (whether the forfeiture clock may run unattended).

**(c) There is prior art for a per-character uniqueness constraint.** The SM reported none. `purchasable_powers.exclusive` is a comma-separated name list walked by `isMeritExcluded` (`public/js/editor/merits.js:20-27`), which lowercases both sides. A **self-referential** `exclusive` value therefore yields one-per-character uniqueness with zero new code. Rev 1's D5 declined this shim on maintainability grounds, not for want of a mechanism; Rev 3 withdrew enforcement altogether as a product decision. The correction to the SM's grounding stands either way — the mechanism exists, it was simply not used.

### 4. The real difficulty: merit-dot arithmetic is already forked

The SM identified that "every accessor that sums merit dots must agree". The survey found the accessors do **not** agree today, and the divergence is documented and deliberate:

| Site | Channels summed |
|---|---|
| `xp.js:190 meritRating` | `cp` + 10 named `freeOf` slugs + `xp` — omits `attache`, `carthian`, `fwb`, `retainer` |
| `domain.js:239 meritFreeSum` | full union via `rules-helpers`, plus a categorical Necropolis-target gate |
| `domain.js:65 domMeritShareableSingle` | `cp` + `mci` + `xp` only |
| `domain.js:309 meritEffectiveRating` | `cp` + `xp` + `meritFreeSum`, plus domain caps and Herd bonuses |
| `server/routes/characters.js:249` | `cp` + `mci` + `bloodline` + `retainer` + `xp` |

ADR-005 Rev 2 §D6(b) records the client/server split as knowingly deferred. Any design that subtracts suspended dots "in the sum" must therefore pick *which* of five sums, and will drift from the other four — the failure mode in [feedback_two_views_same_arithmetic](memory/feedback_two_views_same_arithmetic.md), where two functions computing the same logical quantity diverge silently and load-bearingly.

D2 resolves this by not adding a sixth sum.

### 5. A prior recorded direction that conflicts with the issue

The refactor planning meeting of 2026-07-25 recorded (`2026-07-25_meeting.md` §2):

> **Oaths:** wording stored as an ST-created document attached to both parties' sheets (click to view); mechanical effects applied via ST mods. "Swear-by" mechanic simplified — implement via a swear-by merit or ST mod toggle rather than hard-coding.

and, on the closely-related problem of forced merit loss:

> **Sanctity of merits / merit XP:** ... Forced losses go into a time-gated pool (recovery rate is an ST call). Elegant no-code solve: represent damaged merit XP as a merit on the sheet with dots that unlock over time.

Issue #1111 (filed 2026-08-06, twelve days later) asks for the mechanism to be built. The two are not reconcilable by inference: one says do not hard-code oath effects, the other specifies them as acceptance criteria. The issue is the more recent artefact and this ADR proceeds on it, but the conflict is surfaced under Open Questions rather than silently resolved — and the meeting's *"recovery rate is an ST call"* is treated as the strongest available evidence on D3b.

For completeness, the "just use ST mods" route was costed and **does not work today**: `st_mods` accepts `merits.<N>.dots` (`server/routes/st_mods.js:65` `DYNAMIC_PATH_RE`), but no merit carries a `dots` field — the character merit shape is `cp`/`xp`/`free_grants`/`rating`, and a live scan found `merits[].dots` on zero characters. `applyStMods` treats the missing leaf as base `0` and writes a `dots` key that no merit reader consults. This is the ADR-006 §D4 bug class (a whitelisted path whose value is never read) still live on the merit branch. It is currently harmless — zero `st_mods` target `merits.*` — but it means the meeting's cheaper option carries an unbudgeted read-path fix. Recorded here so it is not rediscovered mid-story.

---

## Decisions

### D1 — Attachment lives on the oath merit, as a typed object, keyed by stable merit descriptors

The pledge is persisted on the **oath's** merit row, not on the merits it encumbers:

```js
// c.merits[i] where the row IS the oath
m.sworn_by = {
  dots_required: 4,                       // snapshot of the oath's rating at swear time (see below)
  attachments: [
    { name: 'Resources',  qualifier: null,          dots: 2 },
    { name: 'Contacts',   qualifier: 'Police',      dots: 1 },
    { name: 'Safe Place', qualifier: '12 Rue Morgue', dots: 1 },   // <-- see D2 Rev 4: this row is the counterexample
  ],
  sworn_at: { chapter_number: 2, iso: '2026-08-06' },
  history: [ /* D6 */ ],
}
```

**Why the oath row and not the encumbered merits.** Both endpoints live on the same character document, so this is an intra-document relationship and there is no join to optimise. One endpoint must own it or the two will desynchronise. The oath owns it because every write is oath-triggered (swear, breach, release, restore) and because the XP-parity invariant (D1b) is a property of the *oath*, not of any one attached merit. The reverse direction — "is this merit encumbered, and by what?" — is a **render-time reverse index**, rebuilt per render from `c.merits`, never persisted. That is the ADR-005 §D3 render-time-synthesis discipline and the project's never-store-derived rule applied to a relationship rather than a stat.

**Why name+qualifier and not array index.** `c.merits` is array-indexed (unlike `c.disciplines`, which is name-keyed — see [project_disciplines_object_keyed](memory/project_disciplines_object_keyed.md)), and indices move under splice. The house convention for intra-character merit references is already name-based: `m.shared_with` holds partner names, `m.attached_to` holds a merit name (ADR-005 §D7). `sworn_by.attachments[].name` + `.qualifier` follows it. Resolution goes through one helper, `resolveAttachment(c, ref)`, so the multi-instance cases (Safe Place, Contacts) have a single matching rule rather than a per-callsite one.

**Why `free_grants` is the wrong shape** — confirming the SM: `free_grants` is `{ slug: integer }` with `minimum: 0`, keyed by *grant source*, and its whole semantic is "dots this merit was **given**". A pledge is the inverse (dots this merit **owes**), needs a per-row dot count against a *target reference* rather than a source slug, and must not enter `meritFreeSum`. Reusing it would put pledged dots into every free-dot sum in the codebase.

**D1b — XP parity.** Merits cost **1 XP per dot** (CLAUDE.md; `xpSpentMerits` sums `m.xp` with no multiplier — `xp.js:119`). "An equal XP value of merits" therefore reduces to **an equal number of merit dots**, and the parity check is integer addition:

```
sum(sworn_by.attachments[].dots) === sworn_by.dots_required
```

`dots_required` is **snapshotted at swear time** rather than recomputed. For the two derived-rating oaths (D4) the basis moves — Blood Potency rises, Status changes — and a live-recomputed requirement would silently invalidate a standing oath's parity every time it moved. Rules-wise the pledge was made at a rating; that rating is what was pledged. The snapshot is the value the parity check and the forfeiture use; the derived basis (D4) is what the *purchase UI* offers.

Attachable dots must be dots the character actually owns and has not already pledged. The eligibility rule is: for each candidate merit, `meritRating(c, m)` minus the sum of dots already pledged against it by any other standing oath.

### D2 — Split "encumbered" from "suspended". Only suspension is arithmetic, and it enters at exactly one helper

The SM framed this as one new third state beyond purchased/granted. It is two states with very different costs, and separating them removes most of the risk:

**Encumbered (oath standing) is not a dot-arithmetic concept at all.** The dots remain fully usable — every sum in §4 above must continue to return exactly what it returns today. Encumbrance is a *display and edit-gate* concern: the sheet badges the pledged merits, and the editor refuses to sell or reallocate pledged dots out from under a standing oath. Both read the render-time reverse index from D1. **Zero accessor changes.** Any design that routes encumbrance through the dot sums is strictly worse and buys nothing.

**Suspended (post-breach) is arithmetic, and it lands in `meritEffectiveRating`.**

`public/js/editor/domain.js:309` already carries the docstring *"Effective merit rating ... Use this everywhere a calc references a merit's effective dots. Do NOT read m.rating directly."* It is already the designated canonical effective-dots helper, and it already applies exactly this shape of reduction — the Haven/Mandragora cap, the Carthian exclusion, the Herd bonuses. **Suspension is another cap.** ~~It goes in the general fall-through branch so it applies to every merit category, not just `domain`.~~ **That sentence is wrong — corrected in Rev 4 below.** The intent (one helper, one reduction, no sixth fork) stands; the named site does not.

The critical boundary: **suspension must not touch `meritRating` (`xp.js:190`) or `xpSpent`.** A vampire who breaks an oath loses *access* to dots, not the XP that bought them. Refunding or discounting the XP would be a rules error, and it would make `xpLeft` jump on breach. The existing `meritRating` (owned) vs `meritEffectiveRating` (effective) split is therefore not an obstacle to route around — it is precisely the distinction the rules require, already implemented. Suspension is the first consumer to give it teeth.

`domMeritShareableSingle` and the server's `characters.js` enrichment are deliberately **not** touched, consistent with ADR-005 §D6(b): whether suspended dots stop contributing to a *partner's* domain total is a genuine rules question nobody has asked, and folding it in here would silently pre-judge the deferred MNEC-prerequisite audit. Recorded as Open Question 3.

**Composition.** The suspension amount is derived per render from `sworn_by.history` (D6) plus the schedule (D7); it is never stored on the encumbered merit. It is materialised onto the in-memory character as a transient `m._suspended_dots` at the same composition site that already runs `applyDerivedMerits`, before any accessor reads — the ADR-004 §D8 cache-entry invariant. `meritEffectiveRating` subtracts `m._suspended_dots`, floored at zero. `_`-prefixed, therefore stripped on **both** existing save paths — `buildSaveBody` (`public/js/admin.js:962`, API writes) and `charsForSave` (`public/js/editor/export.js:79`, the localStorage mirror) — so it can never reach a persisted document or a stale cache entry (ADR-005 §D3 / Concern #3 precedent).

#### D2 amendment (Rev 4) — the fall-through is not universal, and the subtraction must precede the cap

Found by Ptah at build time by implementing the briefed version and **measuring all seven categories** rather than reasoning about them; confirmed by the SM and re-verified here against `origin/dev` at `b2cf0d21`.

**Correction 1 — the site.** `meritEffectiveRating` has three early returns above the fall-through, all inside `if (m.category === 'domain')`:

| Predicate | Members | Returns |
|---|---|---|
| `CAP_DOMAIN.has(m.name)` | Haven, Mandragora Garden | the capped value |
| `MULTI_INSTANCE_DOMAIN.has(m.name)` | Safe Place, Feeding Grounds | `domMeritTotalSingle(c, m)` |
| `(m.shared_with \|\| []).length > 0` | any shared domain merit | `domMeritTotal(c, m.name)` |

A suspension applied only in the fall-through is silently ignored by all five named merits and by every shared domain merit. General, influence and plain domain merits work.

**This is not academic: D1's own worked example is the counterexample.** It pledges `{ name: 'Safe Place', qualifier: '12 Rue Morgue' }` — `MULTI_INSTANCE_DOMAIN`, an early return. The pledge editor applies no category filter, so domain merits are ordinary targets. Shipped as briefed, an ST breaks the oath, the event records correctly, and the dots do not move: no error, correct-looking history, unchanged sheet.

**Correction 2 — order of operations. The subtraction must be applied to the character's OWN dots, before any partner contribution is combined and before any cap.** The SM's approved fix (existing body becomes the unsuspended computation; the exported function subtracts once before returning) fixes the coverage gap but introduces an ordering error, and the reasoning offered for it — that subtracting at the exit and subtracting from own give "identical answers in every reachable case" — is false wherever the 5-cap binds.

Both combining branches cap: `domMeritTotalSingle` returns `Math.min(5, own + partnerTotal)`, and `domMeritTotal` returns `Math.min(cap, own + partnerTotal)` with `cap = 5` (Herd-with-Flock excepted). Worked counterexample, all values reachable:

```
Safe Place, own = 4, partner = 3, pledge = 4 dots, oath broken.

  unsuspended effective   = min(5, 4 + 3)          = 5
  subtract at the exit    = 5 - 4                  = 1     <-- SM's approved fix
  subtract from own first = min(5, (4-4) + 3)      = 3     <-- correct
```

Two dots wrong, and the owner's displayed total (1) drops **below the partner's contribution (3)** — the precise outcome the SM's own test #1 asserts must never occur. The divergence appears exactly where a partner contribution is combined under a binding cap, which is also exactly where this brushes Open Question 3: the exit subtraction does not write to the partner's sheet, but it does visibly consume the partner's dots on the owner's.

`CAP_DOMAIN` is unaffected — both orderings yield the same result there (Haven own 4, cap 2, pledge 4: exit gives `max(0, 2-4) = 0`; own-first gives `min(0, 2) = 0`) because there is no partner term to protect. So the only divergent paths are the two combining branches.

**Decision.** Subtract on the own-dots term, before combination and capping, in every branch. `domMeritContribSingle` is the own-term for both combining branches, so it is one site for both; the `CAP_DOMAIN` branch and the fall-through have no partner term and may take the subtraction at the exported exit, provided it is not applied twice. D2's constraint is unchanged in spirit — **one subtraction rule, applied at the same logical point in every path** — and the floor at zero is *required*, not defensive, because `CAP_DOMAIN` can return less than the character's own dots.

**Warning on the SM's test #1.** Its two clauses — "drops by exactly the suspended amount" *and* "never below the partner's contribution" — are **mutually unsatisfiable** under the exit-subtraction implementation in the capped case above (5 → 1 is exactly −4 *and* below the partner's 3). The test is correctly designed and will **fail** on the briefed implementation. It is expected to pass, so the risk is that the assertion gets weakened to make it green rather than the ordering being fixed. Per [feedback_baseline_red_before_gate](memory/feedback_baseline_red_before_gate.md), the test is right; the implementation under it is what must change.

**What this failure was.** Not a reasoning error — a code-reading error of a specific kind. The docstring's "use this everywhere a calc references a merit's effective dots" is a true statement about the **function** and says nothing about which **branch** a given merit takes through it. Universality of a helper is not evidence about any particular path through it. That is the same species as the `meritEffectiveRating` read-path audit already carried as a hard AC in the Risks section, one level further in: the audit asks *which callers reach the helper*, and this asks *which branch they land on once inside*. Both must be measured, not inferred.

### D3a — The Chapter span anchors on the ordinal, `game_sessions.chapter_number`

"This Chapter and the next" is a span, and a span needs an ordinal, not an event. `is_chapter_finale` is a boolean on a cycle: it can tell you a boundary was crossed but cannot express "until chapter N+2 begins" without walking the cycle history and counting. `chapter_number` states it directly:

```
suspended while  current_chapter_number <= sworn_by.history[breach].chapter_number + 1
```

`is_chapter_finale` keeps its existing job (the CHM-3 at-risk reminder at `downtime-form.js:3673`) and gains no new load. The current chapter is read as the `chapter_number` of the most recent `game_sessions` row that has one.

Given §3(b) — 3 of 14 sessions populated — the resolver must degrade honestly, not guess: when no current `chapter_number` can be resolved, the sheet displays the suspension as **indeterminate and ST-resolvable**, never as silently expired. A missing ordinal must not release dots.

#### D3a amendment (Rev 3) — with restoration deferred, the binding obligation moves from render-time to write-time

The SM's reading was that deferring restoration makes the indeterminate rule above *more* important — "the only thing standing between sparse data and dots quietly coming back". **The opposite is true, and the real risk lies elsewhere.** With restoration deferred there is no code path that releases dots: `_suspended_dots` becomes a pure function of the exit events in `sworn_by.history`, with no chapter arithmetic evaluated at all. Nothing computes expiry, so nothing can mis-expire. The indeterminate rule stays in the ADR because it governs the deferred work, but in the shipped scope its urgency is close to zero.

What the deferral actually endangers is the opposite end: **`chapter_number` must be stamped onto the exit event at the moment of breach, even though nothing reads it yet.** This is precisely the field a story drops when its only consumer is deferred — it looks like dead weight. It is not: which chapter an oath was broken in is unrecoverable after the fact. Miss it and the deferred restoration work has no anchor to compute from, and the only remedy is ST archaeology across session logs.

So the obligation is: **capture at write time, tolerate at render time.** Story B must record `chapter_number` on every exit event and treat its absence at render as indeterminate. Only the first of those has teeth in the shipped scope, and it is the one with no visible consumer to protect it.

### D3b — Restoration is DEFERRED. Nothing computes it. **There is no wall-clock anywhere in this mechanic.**

Peter, 2026-08-06: *"note that a chapter is a month so back at one per chapter, however this need not be encoded now."* Two rulings in one sentence.

#### The correction — a Chapter is a month

Rev 1 argued that "one dot per month" introduced a wall-clock dependency with no other consumer in the schema. **That argument is void.** A Chapter *is* a month, so "one dot per month" and "one dot per chapter" are the same rate expressed in two units, and the whole mechanic runs on a single unit end to end:

| Quantity | Unit |
|---|---|
| Blackout span ("that Chapter and the next") | chapters |
| Restoration rate ("one dot per month") | chapters — **one dot per chapter** |
| Anchor | `game_sessions.chapter_number` (D3a) |

**No date arithmetic is required anywhere in this family.** Anyone building the deferred restoration must build chapter arithmetic against the D3a ordinal, not a date scheduler. This is stated prominently because Rev 1 taught the opposite, and a future implementer reaching for a timer would be following this ADR's own retracted reasoning.

Note this correction does not decay the way §3(b)'s counts do: **it is a rules fact, not a data fact.** The snapshot caveat that applies to the sparsity numbers applies here in reverse.

The other two Rev 1 arguments survive intact — the chapter data is too sparse to run a clock unattended (§3b), and the 2026-07-25 meeting already recorded "recovery rate is an ST call" for the adjacent forced-loss mechanic.

#### The ruling — not encoded now

**No scheduler, no due-date computation, no automatic trigger, in either story.** The system suspends and records; it does not restore. An ST clears a suspension by hand.

#### The amendment this forces — `restored` must survive the deferral

The SM's boundary ("keeps D2, D6 and D7 whole and removes only D3b") is right in substance and needs one correction to be implementable.

**Suspension is a derived value.** Per D2 it is computed per render from `sworn_by.history` and materialised as the transient `m._suspended_dots`. **A computed value cannot be cleared by hand.** The only way an ST can change it is by appending an event to the history that the computation reads. That event is D6's `restored`.

So what is deferred is the *automatic computation of when restoration is due* — not the restoration event, and not the ability to restore. **D6's `restored` event is load-bearing in the shipped scope and must not be dropped as part of "deferring restoration".** Drop it and suspension becomes irreversible: dots go dark at breach with no path back short of hand-editing a character document, which is exactly what the append-only log exists to prevent.

The shipped model is therefore:

- Breach appends `exited` with `reason` and `chapter_number` → dots suspend.
- ST judges the schedule out-of-band (one dot per chapter, by the rules) and appends `restored { dots: n }` when due → dots return.
- Nothing computes *when* that should happen. The ST does.

That is coherent, and the deferred work is a pure addition: compute the due chapter from the D3a ordinal and either prompt or auto-append. **No shape changes** — the deferred story adds a computation over an event log that already records everything it needs, which is why D3a's write-time capture obligation matters now rather than later.

#### Rate, recorded for the deferred work

`one dot per chapter`, beginning after the blackout span of the breach chapter and the next. Recorded here so the deferred story does not have to re-derive it from the source text or re-litigate the units.

### D4 — Variable rating bases: a discriminator-typed `rating_basis` on the rule, resolved at render time

`rating_range` stays as-is for fixed oaths and stays `null` for derived ones. A sibling field supplies the basis, following the ADR-005 §D3/§D5 discriminator pattern — each variant carries its own neighbouring fields and does not overload another variant's:

```js
// oath-of-abstinence
rating_basis: { type: 'blood_potency_multiple', factor: 2 }

// oath-of-the-model-prisoner
rating_basis: { type: 'highest_status', pools: ['covenant', 'clan'] }

// absent / null → use rating_range (every other power, unchanged)
```

Resolved by `resolveRatingBasis(c, rule)` at render time and **never stored on the character**, per the never-store-derived rule. Unknown `type` warns and falls back to `rating_range`, matching ADR-005 §D5's safe-degradation requirement.

Note the interaction with D1b: the basis determines what the purchase UI *offers*; `sworn_by.dots_required` snapshots what was *sworn*. Blood Potency 5 at swear time means a 10-dot pledge that stays a 10-dot pledge when Blood Potency rises to 6.

An expression language (`expr: 'blood_potency * 2'`) was rejected: it is a parser and a sandbox for two call sites, and ADR-005 §D5 explicitly requires each variant to stay inspectable rather than generalised.

### D5 — ~~Uniqueness is an explicit typed field, enforced server-side~~ **WITHDRAWN (Rev 3). Uniqueness is not enforced in code at all.**

*The number is retained rather than reused so that references to D6/D7/D8 in the stories, issue comments and prior revisions stay valid.*

**Peter, 2026-08-06: "i would rather have the STs coordinate and check this rather than enforce in code."**

This is not a narrowing of the Rev 1 decision, it is a refusal of the category. **No `uniqueness` field, no write-path check, no picker filter, no display gating.** The oaths that the rules text limits to one at a time may be added twice by the app; the STs catch it.

**This is a product decision, not a technical concession, and it is recorded here for one reason:** the next person to read the live `rules_text` will find an explicit constraint ("A character may be part of only one Oath of Action at a time, as vassal or liege"), find nothing enforcing it, and file that gap as a bug. **It is not a bug.** It was priced and declined.

#### What made the price visible

The Rev 1 analysis is retained because it is what produced the answer rather than a cheaper wrong one:

- The constraint covers **three** oaths, not the two in #1111's acceptance criteria. Oath of Action's live `rules_text` carries it too.
- Oath of Action's clause is **"as vassal or liege"** — a constraint on a *relationship*, not on a character. Enforcing it means validating a write against **another character's sheet**, which would be the first cross-character write validation in the system.
- The cheap shim is not a substitute. `isMeritExcluded` (`public/js/editor/merits.js:20-27`) lowercases both sides, so a **self-referential** `exclusive` value yields one-per-character uniqueness with zero new code — but it is a **dropdown filter, not a write-path check**. It suggests; it does not constrain. Offering it as "enforcement" would have been misrepresenting it.

Presented with the honest cost — a novel cross-character validation path for a rule the STs already track between themselves — the STs were judged cheaper than the machinery. That trade is only visible once the real price is on the table, which is the argument for pricing rejected options rather than dismissing them.

#### Optional, and explicitly *not* enforcement: an ST-facing "also held by" display

Coordination needs something to coordinate against. A cheap, honest affordance is a read-only line on the oath's merit row in the **admin** sheet listing other characters who currently hold the same oath. The admin already has the full character set in `state.chars`, so it is a render-time scan with no new fetch and no new field — the same shape as ADR-005 §D3's render-time synthesis.

Two constraints if it is built: it is **admin-only** (the player portal would need a new server projection to see other characters' merits, which is a real cost and out of scope), and it **must be presented as information, never as validation**. A display that looks like a check invites the belief that something is checking. Optional; not part of either story unless Peter asks.

### D6 — Exit is an append-only typed event, not a mutable field

Two exits with different consequences means the *reason* must be recorded, as the SM said. It also means an oath can be sworn, broken, partially restored, and re-sworn — so a single mutable `status` loses the history the forfeiture clock depends on.

```js
m.sworn_by.history = [
  { event: 'sworn',    at: '2026-08-06', chapter_number: 2 },
  { event: 'exited',   at: '2026-09-01', chapter_number: 2,
    reason: 'broken',                       // see enum below
    by: { discord_id, discord_name } },
  { event: 'restored', at: '2026-11-02', chapter_number: 4, dots: 1,
    by: { discord_id, discord_name } },
]
```

`reason` enum: `broken` | `abandoned` | `released_by_liege` | `fulfilled` | `st_void`.

**Only `broken` and `abandoned` trigger forfeiture.** `released_by_liege` is the explicit no-forfeiture exit from the source text. `fulfilled` is required by Oath of Action, whose rules text ends the oath on successful completion with consequences falling on the *liege* — an exit the issue does not mention. `st_void` is the escape hatch for adjudication error; without it the only way to undo a mis-recorded breach is to edit history, which defeats the point of an append-only log.

Append-only follows the ADR-004 Rev 4 retention Position B precedent (immutable audit) and the `st_mod_audit` event-stream shape, which likewise captures `delta` and `reason` *at the event* so a later edit cannot rewrite history.

### D7 — The forfeiture schedule belongs on the rule, not on the character

The issue describes one schedule. The live rules text describes at least two:

- Generic Swear By: *"entirely for that Chapter and the next, after which they will return at the rate of one dot per month."*
- **Oath of the Bloody Hand**: *"lose access to increased pool, lose access to sworn by dots for duration of session"* — a session-scoped suspension with a different trigger (failing to spend a DT action on duties) sitting *alongside* the standard abandonment path.

A schedule hard-coded to "current chapter + next, then 1/month" cannot express the second, and Bloody Hand is one of the five rows in scope. So the schedule is per-oath data on the rule, discriminator-typed:

```js
forfeiture: { type: 'chapter_span_then_monthly', chapters: 2, restore_per_month: 1 }   // default
forfeiture: { type: 'session', sessions: 1 }                                            // Bloody Hand's duty lapse
```

Absent `forfeiture` defaults to the first form, so the four other rows need no data change beyond the default. The suspension resolver dispatches on `type`; unknown types warn and fall back to the default rather than releasing dots.

This is the ADR-005 §D3 lesson applied: the variant that "obviously" does not exist yet already exists, in row five of five.

#### D7 amendment (Rev 3) — the `session` variant cannot ship while restoration is deferred

The SM's Rev 3 brief kept D7 "whole". It is not whole, and the part that breaks is the one that looks most harmless.

**`{ type: 'session', sessions: 1 }` is entirely a restoration rule.** Its whole content is "this suspension ends automatically at the end of the session". With restoration deferred (D3b), nothing ends it — so shipping the variant would start a suspension that never terminates. Bloody Hand's duty lapse is a *temporary penalty with a defined natural end*, not a forfeiture with a recovery schedule; implemented half-way it silently over-penalises, indefinitely. **That is worse than not implementing it at all**, because the failure is invisible: the sheet shows a correct-looking suspension that simply never lifts.

So the session variant **defers together with restoration**. Story B ships the discriminator and the default variant only.

**And the default variant's parameters are inert in the shipped scope.** `chapters: 2` and `restore_per_month: 1` are both restoration parameters; with D3b deferred, nothing reads either. The field is still *declared* (D8 requires it) and still *populated* — it is correct rules data whose consumer arrives later.

**This is not a repeat of the `cost_model` mistake in §3(a), and the distinction is worth stating** because a careful reader will reach for it. `cost_model`'s defect was never "nothing reads it". It was that the field was **undeclared in the schema, absent from the PUT allowlist, unwritable through the API, and in violation of its own validator** — reference data the application could neither create, edit, nor validate. A field that is properly declared, ST-editable, schema-valid, and consumed by a named deferred story is ordinary forward-declared rules data. **Declared-and-manageable-but-not-yet-consumed is fine; undeclared-and-unwritable is not.** D8 is what keeps `forfeiture` on the right side of that line.

### D8 — Schema and route reachability ship with the field family, not after it

Per §3(a), every field in this ADR is unreachable through the app unless three files change in the same PR:

1. `server/schemas/purchasable_power.schema.js` — declare `cost_model`, `rating_basis`, `forfeiture`. (Rev 3: `uniqueness` is **not** declared — D5 is withdrawn, so the field does not exist.) **Required**: the object is `additionalProperties: false`, so `POST /api/rules` rejects any oath row carrying them until they are declared. Declaring `cost_model` also regularises the five rows, which fail their own schema today.
2. `server/routes/rules.js` `UPDATABLE_FIELDS` — add the same three, or STs cannot edit them in the admin Rule Data UI and the reference data becomes code-deploy-only, contradicting the standing MongoDB-backed convention in CLAUDE.md. This matters most for `forfeiture`, whose consumer is deferred (D7 amendment): a forward-declared field that STs cannot edit is precisely the `cost_model` failure repeating.
3. `server/schemas/character.schema.js` merit definition — declare `sworn_by`. Also `additionalProperties: false`; without it, saving a character who has sworn an oath fails validation.

The transient `_suspended_dots` and the reverse index are **not** declared and **not** persisted; they are stripped by the existing `_`-prefix strips in `buildSaveBody` (`public/js/admin.js:962`) and `charsForSave` (`public/js/editor/export.js:79`). Both must be confirmed to fire for `sworn_by`'s transient siblings; note that `sworn_by` itself is **not** `_`-prefixed and must persist.

The two pre-existing `sub_category` inconsistencies (`null` on three rows, `'oath'` on two) and the stray `selected: true` / `special: null` keys on the seeded rows are data hygiene that should ride the same PR, since it is the only one that will ever have these five rows open.

---

## Consequences

**Positive.** Encumbrance costs zero accessor changes (D2). Suspension touches one helper with an existing cap idiom, and the owned-vs-effective boundary it needs already exists. Greenfield data means no backfill and no migration. Both surviving new rule fields are discriminator-typed, so the next oath variant is a data change. Rev 3's two rulings removed roughly a third of the build: no uniqueness enforcement, no restoration engine, no date arithmetic anywhere.

**Negative.** `meritEffectiveRating` gains a second responsibility (it already has caps and Herd bonuses; suspension makes four). Three new rule fields plus `sworn_by` cross the schema/allowlist boundary, so D8 is unavoidable ceremony. The client/server shareable divergence stays unresolved and now has one more reason to be audited. Two behaviours the rules text specifies ship absent by decision — uniqueness (D5, declined) and Bloody Hand's session-scoped suspension (D7 amendment, deferred with restoration).

**Risks.**

1. **`meritEffectiveRating` is not universally used, AND reaching it is not enough.** Two distinct checks, and Rev 4 proved the second the hard way. (a) *Which callers reach the helper* — its docstring claims universal use, which is not evidence that they do; every read that displays or rolls merit dots must be confirmed to route through it. (b) *Which branch they land on once inside* — the helper has three early returns above its fall-through, and the Rev 1 text placed the suspension in a branch that five named merits never reach (D2 Rev 4 amendment). **A claim about a helper's universality is not evidence about any particular path through it.** Both must be measured category-by-category, as Ptah did, not inferred from the docstring. This is the §4 fork restated as a test obligation and remains the single most likely way this ships broken.
2. **~~Sparse chapter data will make suspensions look wrong.~~ Superseded by the D3a amendment (Rev 3).** With restoration deferred, no code path evaluates chapter arithmetic, so sparse data cannot mis-expire a suspension. The live risk inverted: **`chapter_number` may be silently omitted from exit events** because nothing reads it in the shipped scope, which would make the deferred restoration work uncomputable and the data unrecoverable. Test that the exit event records it, not merely that the renderer tolerates its absence.
3. **`restored` may be dropped as "part of the deferred restoration".** It is not — it is the only mechanism by which a suspension can ever lift (D3b). Dropping it ships irreversible dot loss. The most likely way Rev 3's scope reduction goes wrong.
4. **The `merits.N.dots` dead path (§5) remains live** in the `st_mods` whitelist. Filed as #1119. Relevant here because an ST trying to hand-adjust a suspended merit via ST Mods will appear to succeed and do nothing — a plausible workaround for exactly the suspension this ADR introduces.

---

## Open questions — **all four resolved (2026-08-06). None remain.**

**1. ~~The 2026-07-25 meeting said not to hard-code this.~~ RESOLVED 2026-08-06 — build it.** The meeting recorded "Swear-by mechanic simplified — implement via a swear-by merit or ST mod toggle rather than hard-coding"; #1111 asks for the mechanism. **Peter's ruling: the issue supersedes the meeting. ADR-010 stands as drafted, full scope.** The ST-mod alternative is therefore not pursued, and the `merits.N.dots` dead read path from §5 is no longer a cost on this work — it has been filed independently as **#1119** (reject-or-route, plus an audit of `DYNAMIC_PATH_RE` for other accepted leaves with no corresponding field).

**2. ~~Uniqueness scope (D5).~~ RESOLVED 2026-08-06 — not enforced in code at all.** Peter: *"i would rather have the STs coordinate and check this rather than enforce in code."* Not a choice between the offered scopings — a refusal of the category. **D5 withdrawn**; see it for the full record, including why the absence of enforcement is a decision and not a bug, and the optional non-enforcing ST display.

**3. ~~Suspended dots and partner sharing (D2).~~ RESOLVED 2026-08-06 — leave partner sums untouched.** Resolved by Khepri (SM) rather than escalated. The conservative reading stands, and it carries a second justification this ADR did not originally claim: touching partner sums would pre-judge the deferred MNEC-prerequisite audit, which is already load-bearing for the `domain.js:48` vs `characters.js:249` divergence recorded in ADR-005 Rev 2 §D6(b). A rules-silent question should not be answered as a side effect of an unrelated story. Suspension is invisible to partners; D2 is unchanged.

**4. ~~Restoration trigger (D3b).~~ RESOLVED 2026-08-06 — deferred, and the premise was corrected.** Peter: *"note that a chapter is a month so back at one per chapter, however this need not be encoded now."* Restoration is not encoded in either story; the ST clears suspensions by hand via D6's `restored` event. Separately, **a Chapter is a month**, which voids Rev 1's wall-clock argument entirely — the mechanic runs on `chapter_number` end to end and needs no date arithmetic. See D3b.

---

## Implementation note — the two-story seam (adopted, Rev 2)

Khepri flagged that purchase-time attachment plus XP-parity validation is separable from the forfeiture schedule, and that Peter chose the full ADR over that split. The ADR is full-scope; the *implementation* **lands in two stories** along this seam (adopted by the SM, 2026-08-06):

- **Story A** — D1, D1b, D4, D8: swear an oath, nominate merits, validate dot parity, derived rating bases, schema and allowlist. Delivers a working purchase flow. Ships without any forfeiture machinery. *(Rev 3: D5 removed — withdrawn, nothing to build.)*
- **Story B** — D2, D3a, D6, D7: exit events, suspension, the chapter anchor and its write-time capture, and the forfeiture discriminator with its default variant only. *(Rev 3: D3b removed — deferred. D7 ships partial; its `session` variant defers with restoration.)*

Story A is independently useful and independently testable, and it does not build anything Story B discards. Per [feedback_decomposition_into_nondelivering_parts](memory/feedback_decomposition_into_nondelivering_parts.md), the seam is only legitimate because Story A is openable on its own — a player can swear an oath and see it on the sheet. If it were split any finer (schema-only, then UI) it would not be. **Rev 3's reductions do not disturb the seam**: both stories lost work, neither lost its deliverable.

**All four open questions are answered, so both stories are unblocked and fully scoped.**

Acceptance obligations carrying from the Risks section into the stories as **hard ACs, not notes** (SM, 2026-08-06; items 2 and 3 revised by Rev 3):

1. The `meritEffectiveRating` read-path audit must be **demonstrated**, not asserted. A docstring claiming universal use is not evidence of universal use.
2. **Every exit event records `chapter_number`.** Assert on the persisted event, not the render. Nothing reads it in the shipped scope, which is exactly why it will otherwise be dropped — and it is unrecoverable after the fact (D3a amendment). The Rev 2 form of this AC — exercise the resolver with `chapter_number` absent — is now the *weaker* half; keep it, but it is no longer the one that protects the deferred work.
3. **A suspension can be lifted.** Assert that appending `restored` returns the dots. Guards against `restored` being dropped as "part of the deferred restoration", which would ship irreversible dot loss (D3b).
