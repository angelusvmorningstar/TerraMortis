---
id: ADR-010
title: 'Swear By oath cost model — merit attachment, encumbrance vs suspension, and typed oath metadata'
status: approved
date: 2026-08-06
author: Imhotep (Architect)
revision: 2
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
- **`exclusive` is `null` on all five.** The uniqueness constraint is unexpressed today.
- **Zero characters hold any of the five.** `characters` was scanned for all five names: no holders. **This work is greenfield — there is no backfill, no migration, and no live data to preserve.** That is the single largest simplification available and it should be spent, not banked.

### 3. Three corrections to the dispatch framing

The SM's grounding was re-verified rather than assumed. Three points moved:

**(a) `cost_model` is not merely unread — it is unreachable and unmanageable.** The SM confirmed nothing reads it, which is true. The stronger fact is that nothing can *write* it either:

- `server/routes/rules.js:59` validates `POST /api/rules` against `purchasablePowerSchema`, which declares `additionalProperties: false` and does **not** declare `cost_model`. Creating a swear-by oath through the API is rejected today.
- `PUT /api/rules/:key` filters the body through `UPDATABLE_FIELDS` (`rules.js:69-76`), which does not include `cost_model`. An ST editing one of these rows in the admin Rule Data UI cannot change it. (`$set` on the filtered subset means the existing value survives — this is unreachable, not destructive.)

The five rows exist only because they were written directly to Atlas, bypassing both. They currently fail their own schema. Every field this ADR introduces inherits the same constraint, so schema-and-allowlist reachability is promoted to a decision in its own right (D8) rather than left as an implementation detail.

**(b) The Chapter ordinal is expressible but not reliably populated.** `game_sessions.chapter_number` exists and is ST-editable, as stated. In live data it is set on **3 of 14** sessions. `downtime_cycles.is_chapter_finale` is `true` on **1 of 6** cycles, explicitly `false` on one, and absent on four. `chapter_label` is free text with no shared format across the three rows that have it (`"Game 6"`, `"Story 2, Chapter 2"`, `"Ch 2, Game 4"`), and is read off *cycles* at `admin/downtime-views.js:1935` while being *schema'd* on sessions — two homes, one of them undeclared (`downtime_cycles` has no schema file at all).

The boundary is therefore derivable in principle and unreliable in practice. This does not block D3a (which anchor), but it is decisive for D3b (whether the forfeiture clock may run unattended).

**(c) There is prior art for a per-character uniqueness constraint.** The SM reported none. `purchasable_powers.exclusive` is a comma-separated name list walked by `isMeritExcluded` (`public/js/editor/merits.js:20-27`), which lowercases both sides. A **self-referential** `exclusive` value therefore yields one-per-character uniqueness with zero new code. D5 declines this shim, but on maintainability grounds, not for want of a mechanism.

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
    { name: 'Safe Place', qualifier: '12 Rue Morgue', dots: 1 },
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

`public/js/editor/domain.js:309` already carries the docstring *"Effective merit rating ... Use this everywhere a calc references a merit's effective dots. Do NOT read m.rating directly."* It is already the designated canonical effective-dots helper, and it already applies exactly this shape of reduction — the Haven/Mandragora cap, the Carthian exclusion, the Herd bonuses. **Suspension is another cap.** It goes in the general fall-through branch so it applies to every merit category, not just `domain`.

The critical boundary: **suspension must not touch `meritRating` (`xp.js:190`) or `xpSpent`.** A vampire who breaks an oath loses *access* to dots, not the XP that bought them. Refunding or discounting the XP would be a rules error, and it would make `xpLeft` jump on breach. The existing `meritRating` (owned) vs `meritEffectiveRating` (effective) split is therefore not an obstacle to route around — it is precisely the distinction the rules require, already implemented. Suspension is the first consumer to give it teeth.

`domMeritShareableSingle` and the server's `characters.js` enrichment are deliberately **not** touched, consistent with ADR-005 §D6(b): whether suspended dots stop contributing to a *partner's* domain total is a genuine rules question nobody has asked, and folding it in here would silently pre-judge the deferred MNEC-prerequisite audit. Recorded as Open Question 3.

**Composition.** The suspension amount is derived per render from `sworn_by.history` (D6) plus the schedule (D7); it is never stored on the encumbered merit. It is materialised onto the in-memory character as a transient `m._suspended_dots` at the same composition site that already runs `applyDerivedMerits`, before any accessor reads — the ADR-004 §D8 cache-entry invariant. `meritEffectiveRating` subtracts `m._suspended_dots`, floored at zero. `_`-prefixed, therefore stripped on **both** existing save paths — `buildSaveBody` (`public/js/admin.js:962`, API writes) and `charsForSave` (`public/js/editor/export.js:79`, the localStorage mirror) — so it can never reach a persisted document or a stale cache entry (ADR-005 §D3 / Concern #3 precedent).

### D3a — The Chapter span anchors on the ordinal, `game_sessions.chapter_number`

"This Chapter and the next" is a span, and a span needs an ordinal, not an event. `is_chapter_finale` is a boolean on a cycle: it can tell you a boundary was crossed but cannot express "until chapter N+2 begins" without walking the cycle history and counting. `chapter_number` states it directly:

```
suspended while  current_chapter_number <= sworn_by.history[breach].chapter_number + 1
```

`is_chapter_finale` keeps its existing job (the CHM-3 at-risk reminder at `downtime-form.js:3673`) and gains no new load. The current chapter is read as the `chapter_number` of the most recent `game_sessions` row that has one.

Given §3(b) — 3 of 14 sessions populated — the resolver must degrade honestly, not guess: when no current `chapter_number` can be resolved, the sheet displays the suspension as **indeterminate and ST-resolvable**, never as silently expired. A missing ordinal must not release dots.

### D3b — Restoration is ST-actioned, with the system computing and surfacing the due schedule — **OPEN, recommendation only**

This is the one genuinely product-side question and per dispatch it is flagged rather than guessed. The recommendation, and the evidence for it:

1. **"One dot per month" is wall-clock, and nothing else in this schema derives from wall-clock.** Every other time-like derivation in TM keys off cycles, sessions, or chapters. Introducing a wall-clock derivation for one merit family creates a dependency on real elapsed time that has no other consumer and no existing test shape.
2. **The chapter data is too sparse to run a clock unattended** (§3b). An automatic restorer would, on today's data, restore dots on the basis of a `chapter_number` that is absent from 11 of 14 sessions.
3. **Peter has already stated a preference on the adjacent mechanic.** For forced merit loss, the 2026-07-25 meeting records "recovery rate is an ST call", with the "no-code solve" being dots that unlock over time on the sheet. Same problem class, explicit answer.

**Recommendation: the system computes and displays the schedule; an ST confirms each restoration.** The suspension row shows "2 of 4 dots restored; next due 2026-09-14" and an ST action applies it. This keeps the derivation visible and auditable, degrades safely when chapter data is missing, matches the recorded preference, and leaves a fully automatic restorer available later as a pure addition (the due-date computation is the same either way — only the trigger changes).

**Peter needs to confirm.** If he wants it automatic, D6's history shape and the due-date computation are unchanged; only the trigger moves, so the story is not blocked on this beyond the restoration step itself.

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

### D5 — Uniqueness is an explicit typed field, enforced server-side

```js
uniqueness: { type: 'one_per_character' }
```

on the rule, checked in the character write path and used to filter the merit picker.

**Rejected: self-referential `exclusive`.** It works — `isMeritExcluded` lowercases both sides, so `exclusive: "Oath of Burning Blood"` on `oath-of-burning-blood` makes owning one exclude adding another, with zero new code. It is rejected because (i) a rule that excludes itself reads as a data-entry error to the next maintainer and invites a well-meaning "fix"; (ii) `exclusive` means "this merit forbids those *other* merits" everywhere else it appears, and overloading it costs the field its one clear meaning; (iii) it is enforced only in the client picker — `isMeritExcluded` is a dropdown filter, not a write-path check — so it is a suggestion, not a constraint. The failure mode of the shim is a second oath silently appearing on a sheet; the failure mode of the explicit field is a 400. [feedback_prefer_cosmetic_failure_mode](memory/feedback_prefer_cosmetic_failure_mode.md) prefers the visible one.

**Scope correction.** #1111's acceptance criteria name Oath of Burning Blood and Oath of the Bloody Hand. The live `rules_text` for **Oath of Action** also states: *"A character may be part of only one Oath of Action at a time, as vassal or liege."* That is three oaths, not two, and the "as vassal or liege" clause is a **cross-character** constraint that `one_per_character` does not express. Flagged as Open Question 2; the discriminator leaves room for a second variant (`{ type: 'one_per_character_either_role' }`) without reopening the schema.

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

### D8 — Schema and route reachability ship with the field family, not after it

Per §3(a), every field in this ADR is unreachable through the app unless three files change in the same PR:

1. `server/schemas/purchasable_power.schema.js` — declare `cost_model`, `rating_basis`, `uniqueness`, `forfeiture`. **Required**: the object is `additionalProperties: false`, so `POST /api/rules` rejects any oath row carrying them until they are declared. Declaring `cost_model` also regularises the five rows, which fail their own schema today.
2. `server/routes/rules.js` `UPDATABLE_FIELDS` — add the same four, or STs cannot edit them in the admin Rule Data UI and the reference data becomes code-deploy-only, contradicting the standing MongoDB-backed convention in CLAUDE.md.
3. `server/schemas/character.schema.js` merit definition — declare `sworn_by`. Also `additionalProperties: false`; without it, saving a character who has sworn an oath fails validation.

The transient `_suspended_dots` and the reverse index are **not** declared and **not** persisted; they are stripped by the existing `_`-prefix strips in `buildSaveBody` (`public/js/admin.js:962`) and `charsForSave` (`public/js/editor/export.js:79`). Both must be confirmed to fire for `sworn_by`'s transient siblings; note that `sworn_by` itself is **not** `_`-prefixed and must persist.

The two pre-existing `sub_category` inconsistencies (`null` on three rows, `'oath'` on two) and the stray `selected: true` / `special: null` keys on the seeded rows are data hygiene that should ride the same PR, since it is the only one that will ever have these five rows open.

---

## Consequences

**Positive.** Encumbrance costs zero accessor changes (D2). Suspension touches one helper with an existing cap idiom, and the owned-vs-effective boundary it needs already exists. Greenfield data means no backfill and no migration. Three of the four new rule fields are discriminator-typed, so the next oath variant is a data change.

**Negative.** `meritEffectiveRating` gains a second responsibility (it already has caps and Herd bonuses; suspension makes four). Four new fields cross the schema/allowlist boundary, so D8 is unavoidable ceremony. The client/server shareable divergence stays unresolved and now has one more reason to be audited.

**Risks.**

1. **`meritEffectiveRating` is not universally used.** Its docstring claims it should be, which is not evidence that it is. Before the story is accepted, every read that displays or rolls merit dots must be checked to confirm it routes through the helper; any that does not will show unsuspended dots after a breach. This is the §4 fork restated as a test obligation, and it is the single most likely way this ships broken.
2. **Sparse chapter data (§3b) will make suspensions look wrong before it makes them look absent.** The indeterminate-not-expired rule in D3a is the mitigation and must be tested with `chapter_number` missing, not merely present.
3. **The `merits.N.dots` dead path (§5) remains live** in the `st_mods` whitelist. Out of scope here, but if an ST tries to hand-adjust a suspended merit via ST Mods it will appear to work and do nothing. Worth its own issue.

---

## Open questions

Two of the four are resolved (2026-08-06, relayed via Khepri). Two remain with Peter.

**1. ~~The 2026-07-25 meeting said not to hard-code this.~~ RESOLVED 2026-08-06 — build it.** The meeting recorded "Swear-by mechanic simplified — implement via a swear-by merit or ST mod toggle rather than hard-coding"; #1111 asks for the mechanism. **Peter's ruling: the issue supersedes the meeting. ADR-010 stands as drafted, full scope.** The ST-mod alternative is therefore not pursued, and the `merits.N.dots` dead read path from §5 is no longer a cost on this work — it has been filed independently as **#1119** (reject-or-route, plus an audit of `DYNAMIC_PATH_RE` for other accepted leaves with no corresponding field).

**2. Uniqueness scope (D5). OPEN — with Peter.** Oath of Action's rules text constrains "as vassal or liege" — one *per pair of characters*, not one per character. #1111's ACs omit Oath of Action entirely. Should the story cover all three oaths and add a cross-character variant, or ship `one_per_character` for the two named oaths and defer Oath of Action?

**3. ~~Suspended dots and partner sharing (D2).~~ RESOLVED 2026-08-06 — leave partner sums untouched.** Resolved by Khepri (SM) rather than escalated. The conservative reading stands, and it carries a second justification this ADR did not originally claim: touching partner sums would pre-judge the deferred MNEC-prerequisite audit, which is already load-bearing for the `domain.js:48` vs `characters.js:249` divergence recorded in ADR-005 Rev 2 §D6(b). A rules-silent question should not be answered as a side effect of an unrelated story. Suspension is invisible to partners; D2 is unchanged.

**4. Restoration trigger (D3b). OPEN — with Peter.** Recommendation above is ST-actioned with a computed due-date. Confirm or overrule. Overruling moves only the trigger — the due-date computation is identical either way — so it does not block the story past the restoration step.

---

## Implementation note — the two-story seam (adopted, Rev 2)

Khepri flagged that purchase-time attachment plus XP-parity validation is separable from the forfeiture schedule, and that Peter chose the full ADR over that split. The ADR is full-scope; the *implementation* **lands in two stories** along this seam (adopted by the SM, 2026-08-06):

- **Story A** — D1, D1b, D4, D5, D8: swear an oath, nominate merits, validate parity, derived ratings, uniqueness, schema and allowlist. Delivers a working purchase flow. Ships without any of the forfeiture machinery.
- **Story B** — D2, D3, D6, D7: exit events, suspension, chapter anchor, restoration.

Story A is independently useful and independently testable, and it does not build anything Story B discards. Per [feedback_decomposition_into_nondelivering_parts](memory/feedback_decomposition_into_nondelivering_parts.md), the seam is only legitimate because Story A is openable on its own — a player can swear an oath and see it on the sheet. If it were split any finer (schema-only, then UI) it would not be.

~~Do not begin either story until Open Question 1 is answered.~~ **Q1 is answered (build it), so both stories are unblocked.** Q2 scopes Story A's uniqueness work and Q4 scopes Story B's restoration step; neither blocks the story from starting.

Two acceptance obligations carry from the Risks section into the stories as **hard ACs, not notes** (SM, 2026-08-06):

1. The `meritEffectiveRating` read-path audit must be **demonstrated**, not asserted. A docstring claiming universal use is not evidence of universal use.
2. The suspension resolver must be exercised with `chapter_number` **absent**, not merely present — the indeterminate-not-expired rule is otherwise untested on the data that actually exists (§3b).
