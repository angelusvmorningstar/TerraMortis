---
id: ADR-008
title: 'Admin merge: one app, shell first, code-split behind the role gate'
status: approved
date: 2026-07-29
revision: 15
author: Imhotep (Architect)
supersedes: ADR-007 D9 through D15 (Rev 2 addendum and the Phase 1 shard plan)
related:
  - issue #1047 (Epic USF, re-scoped and closed by this ADR)
  - specs/architecture/adr-007-unified-suite-topology.md (D1-D8 retained and load-bearing here)
  - specs/architecture/adr-004-st-mods-overlay.md (Rev 4, single applyStMods composition site)
  - specs/architecture/adr-006-defence-penalty-readpath.md (render-path orchestrator discipline)
  - specs/qa/harness/admin-collision-map.py (the P2 checklist, checked in with this ADR)
  - specs/qa/harness/admin-leak-gate.py (D4 attributability gate, Rev 6)
  - specs/qa/harness/write-path-inventory.py (D10 display-only check; ADR-007 D7 generator)
  - specs/qa/harness/css-overlap.py (retained as a one-number regression check)
  - public/admin.html (the entry this epic retires)
  - public/js/app.js:150-152 (effectiveRole), :1483-1524 (applyRoleRestrictions)
  - memory: feedback_count_is_not_reachability, feedback_decomposition_into_nondelivering_parts
---

# ADR-008: Admin merge

## Revision history

| Rev | Date | Change | Author |
|---|---|---|---|
| 15 | 2026-07-31 | Adds **D8 rule 7: prefer syntax-aware extraction; parse or declare**, from Ma'at, diagnosing four boundary failures as one defect — a measurement whose tokeniser disagreed with the language it was reading. Applying it to this ADR's own instruments found the same defect in every emitter scan: a naive class-attribute regex truncates on `${...}` interpolation, both missing real classes and inventing phantom ones, across 385 interpolated attributes in 53 files. Corrects merge exposure **~118 → ~89** and player adoption **900 → 922**; the D9 baseline stays at 55 with changed membership and was re-blessed from scratch. | Imhotep (Architect) |
| 14 | 2026-07-31 | **Logs a pre-existing exception to D9's zero-ST-presentation rule** that Rev 4 and Rev 13 both stated as though absolute: 55 classes / 88 blocks in `components.css` are emitted only by admin, dominated by `stm-audit-*`. Rev 13's decision stands but its rationale is restated on cascade separability, which holds independently. Converted to a shrink-only ratchet gated by `--st-in-lib`. Records the emitter-exclusivity sweep — **no surface passes outright**, so `admin-shared.css` is the normal path, and `downtime-views.js` is the most common sharing partner despite being sequenced last. Adds a **fifth precondition**: no rule block may span two buckets; leave it behind rather than cut it. Names **structural demonstration** as the preferred form for D2's negative limb. | Imhotep (Architect) |
| 13 | 2026-07-31 | Adds D9's **fourth precondition: emitter exclusivity**, after Spheres (#1096) passed all three existing ones and was still not a per-surface family — 5 of its classes are emitted by `downtime-views.js` as well. Records why it recurs (families are named after a domain concept, surfaces after a screen) and that Tickets passed by luck of naming. Establishes **extract by emitter set, never by name prefix**, above the block-counting convention: the 49-block Spheres 'section' is two prefix families merged by a `.sph` substring search. Adds a shared admin sheet for classes two or more surfaces emit, rather than filing them under the first migrant's filename, and makes a surface declare the SET of sheets it needs. | Imhotep (Architect) |
| 12 | 2026-07-31 | **D10 corrected to FILE granularity** after Ma'at found it certifying display-only for a change that can *prevent* a write: hunk intersection sees changes to a write site but not changes to whether one is reached (early `return` at `story-tab.js:1063` vs untouched `apiPut` at `:1079`). Affordable because 47 sites sit in 14 of 162 files. Adds a **second limb to D2** after Peter's steer — every phase must also demonstrate no player-facing regression, downtime first while a cycle is open. States the **live-cycle reason** in D4, which outlives the weight and write-path reasons. Re-points P1's success condition to player parity, with an explicit move/retire/defer decision per surface. | Imhotep (Architect) |
| 11 | 2026-07-30 | Corrects D10's documented invocation, which passed vacuously. `--touches` diffs the working tree against the ref, so the bare `<ref>` form — copied from Rev 10 into a story and a dispatch and run as `--touches <own-branch>` — produced a zero-line diff, printed `DISPLAY-ONLY ESTABLISHED` and exited 0 against 34 unexamined lines. Now documented as `--touches origin/dev` with the reason attached, and the tool refuses an empty diff with exit 2 rather than passing it. Notable for its shape: the failure required no carelessness, it was produced by following the instructions. Adds a commit-before-negative-control warning to both gate harnesses, after a revert step destroyed uncommitted work while leaving `git status` clean. | Imhotep (Architect) |
| 10 | 2026-07-30 | Adds D8 rule 6 — **a caveat that does not travel with the number it qualifies is decoration** — after two instances a week apart by different authors, each of whom wrote the correct limitation and then published a figure that reads as unqualified because the two sat in different paragraphs. Adds **D10**: a fix may ship ahead of its gate only when it cannot alter what is persisted; the criterion is display-only, not diff size, and it is established by `write-path-inventory.py --touches` rather than judged. Also carries forward the stranded ADR-007 Rev 4 write-path generator, which had never reached `dev`. | Imhotep (Architect) |
| 9 | 2026-07-30 | Records the Chromium confirmation that the Rev 6 injector hazard was **live, not latent** (sheet never fetched, promise never settled, blank surface, zero console output), with severity bounded honestly — recoverable by toggling back to ST view, which does not make the old shape acceptable. Corrects the record that the proposed guard was never written into the code. Adds a second D8 preamble from James: **a check only produces truth if halting is cheap for the person who runs it** — the executor holds both the cheapest access to a counterexample and the strongest incentive to rationalise it away, so the rules in D8 degrade into rubber stamps under schedule pressure while looking unchanged in the record. Distinguishes 'one cut closes it' from 'one path reaches it' in the leak gate. | Imhotep (Architect) |
| 8 | 2026-07-30 | Corrects the Rev 6 injector shape, which James found unsafe while implementing it. A `disabled` stylesheet link may never be fetched, so `load`/`error` never fire and a promise awaiting them never settles — the Rev 6 `disabled = true` initial state could leave an ST in player preview with a blank surface and no error. Corrected to inject enabled and let `applyRoleRestrictions()` own application, which removes the dependency instead of guarding it and downgrades the failure mode from silent-and-total to cosmetic. Also fixes the leak gate's docstring (it presented one representative import path as the only one) and adds `--paths`. | Imhotep (Architect) |
| 7 | 2026-07-30 | Rewords the D9 custom-property precondition after Ma'at ran the negative control the rest of us only reasoned about. Rev 6 stated it as "resolves in `theme.css`", a name-presence test against a *file*; the hazard has a second dimension, *scope*. `admin-layout.css`'s `--ar-*` are declared under `.ar-pending`/`.ar-valid`/`.ar-complete`, not `:root`, so a property declared in a shared sheet under an admin-only selector would pass the stated check and still render unstyled. Correct form: resolves from a **document-agnostic scope** in a sheet both documents load, alias chains followed. Also records that D7.2 is a delta invariant rather than a count. | Imhotep (Architect) |
| 6 | 2026-07-30 | AC8/D4 restated as **attributable + ratchet** after James found the criterion unmeasurable: `app.js` already statically reaches `admin/downtime-story.js` (~214 KB of ST code) through `story-tab.js:9`, so "zero" is already false and sixteen future passes against it would assert nothing. Adds `specs/qa/harness/admin-leak-gate.py` with a named-set baseline that may only shrink. Adds a D9 precondition — custom properties must resolve in the destination document, since scope separation relocates rules but not the properties they resolve against. Resolves the injector's application-state question to a single composition site. #1075 confirmed as independent debt with one sequencing constraint. | Imhotep (Architect) |
| 5 | 2026-07-30 | Two additions from Ma'at's Stage A gate, both class errors in the method D8 prescribes rather than gaps in diligence. Adds a D8 preamble — **three checks by the same method are one check** — after three people passed rule 3 by the same name-grep, which cannot find a generic router by construction. Gives rule 3 an explicit second half (enumerate nav metadata programmatically; rule out the routing class separately; trace dynamic dispatch to source). Adds **rule 5: match the scope**, since for CSS the decision unit is the document and a tree-wide search cannot express per-document deadness at any granularity — a false red that would have blocked a correct deletion. Settles the 47-vs-48 counting convention (blocks is the extraction unit; 0 mixed comma groups). Records in D5a that the D8 two-step protected a real intermediate state. | Imhotep (Architect) |
| 4 | 2026-07-30 | Adds D9 (a merged surface owns its stylesheet; scope separation as the third resolution class) and extends D4 to presentation, after ADM P1 Stage B could not render: `index.html` never loads `admin-layout.css`, so a moved surface arrives with zero styling and two of AC9's four verbs become invisible. Names the independent-co-authoring shape the ~118-rule enumeration was counting without distinguishing. Records the `_viewMode` co-render precondition and the getRole/effectiveRole double gate. Reframes P2 from sixteen collision negotiations to sixteen mechanical extractions. | Imhotep (Architect) |
| 3 | 2026-07-29 | Adds D8 operating rule 4 (measure at the granularity of the decision; treat your own first number as a hypothesis), after Khepri's entry-path sweep of all 17 admin surfaces and 33 player tabs. Sweep result: every admin surface is live, so P1 does not shrink; two player tabs are dead, `t-tickets` (already handled by D5a) and `t-map`, a fourth instance of the pattern. The sweep also produced two first-pass false positives that its author caught by re-deriving, which is the finding rule 4 records. `t-map` is deliberately NOT absorbed into this epic; see the note under Phase sequencing. | Imhotep (Architect) |
| 2 | 2026-07-29 | D5's reason 1 corrected and D5a added, after Khepri (SM) ran a reachability check at story-drafting time and found the player-side Tickets tab is dead code. This was the count-for-reachability pattern recurring a third time, inside the ADR that locks D8 against it: D5 cited a static import and a dispatcher call site as evidence a surface was live. Tickets remains the pilot and the discovery improves it (see D5). Adds a third operating rule to D8 making the reachability check routine at drafting time. | Imhotep (Architect) |
| 1 | 2026-07-29 | Initial. Re-scopes the epic around the admin merge after USF was stopped. Supersedes ADR-007 D9-D15. Locks D1-D8. | Imhotep (Architect) |

## Context

Epic USF (#1047) was stopped on 2026-07-29, three weeks in, by the person who commissioned it. His words: he wanted two apps merged into one, and instead of cutting we were building a harness.

He was right, and the reason is structural rather than a failure of execution. **ADR-007 D9 parked the admin merge outside USF.** Everything USF then did was therefore preparation for a merge rather than a merge. Phase 0 deleted an already-dead player path. Phase 1 was player-app CSS hygiene. Both shipped, both were correct, and neither moved the thing being tracked. Work had reached the point of building a conformant computed-style parity harness to protect 53 CSS rules inside an application you can open in a browser and look at.

Two lessons are carried into this ADR as decisions rather than as retrospective notes, because both have already cost this project real time.

### Lesson 1: a count may size the work, never the obstacle

ADR-007 made the same measurement error twice, in one document, and both times it drove a phase.

1. **Rev 1**: "193 duplicated CSS rules between suite and player" sized the primary work vector. `player.html` is a redirect stub, so `player-layout.css` is never applied to a rendered document. All 193 were dead-file duplicates with zero live cascade risk. Nine promotion shards collapsed into one deletion.
2. **D9**: "admin-layout.css is ~2,472 selectors with near-zero components overlap, so merging would drag it into a cascade we wanted clean." The count was right. The clause that did the work, *"it would compete with the lib in the same cascade"*, was never measured.

A count is a proxy. The obstacle is whatever a reachability measurement returns. A third occurrence would not be a mistake, it would be a method.

### Lesson 2: phases that deliver nothing openable read as progress

A decomposition whose phases complete cleanly but produce nothing the commissioner can open and see is different will be read as progress toward the goal while not moving it. Competent execution makes this worse, because clean completions look like momentum. This is why the admin merge is **one epic** below and not three.

### ADR-007 D9 re-tested

*(ADR-007's D9, the deferral. Not to be confused with this ADR's D9 below.)*

Measured 2026-07-29 against the tree at `origin/dev` `9953e2e6`.

**All three of ADR-007 D9's factual claims are confirmed.** `admin-layout.css` is 2,501 rules / 2,686 single selectors (D9 said ~2,472). Its definition overlap with `components.css` is 4 keys. And admin genuinely does not consume the design system, now measured directly rather than inferred from overlap:

| Design-system adoption | components.css classes emitted |
|---|---|
| components.css defines | 1,266 |
| emitted by admin sources | 86 (6.8%) |
| emitted by player-app sources | 922 (72.8%) |

*(The tempting correction — that D9 inferred non-adoption from low definition overlap, which are opposite readings, since a class used but never redefined gives zero overlap and total adoption — was tested and did not hold. D9's conclusion survives direct measurement. Recorded because the check was made and came back negative.)*

**What D9 got wrong is the unmeasured clause.** Measured in both directions, per rule, by asking whether a selector could match an element the *other* app emits:

| Merge cascade exposure | rules |
|---|---|
| `admin-layout.css` rules whose every class token is emitted by the player app | 43 |
| `suite.css` rules whose every class token is emitted by admin | 45 |
| unscoped element rules in admin-layout (the `body` rule at `admin-layout.css:5`) | 1 |
| **genuinely new exposure created by merging the documents** | **~89** (was stated as ~118 before Rev 15; see D8 rule 7) |
| `components.css` rules matching admin elements | 108, and **not a merge cost** |

That last row matters most. **`admin.html:12` already loads `components.css`**, before `admin-layout.css`. Those 108 apply today. Admin is not outside the design-system cascade waiting to be dragged into it; it is already inside it and overriding it. D9 described a boundary that does not exist.

The exposure is small because the two class vocabularies barely intersect. Admin emits 1,807 distinct class literals, the player app 2,001, and 1,696 of admin's appear nowhere in the player app. These are not two dialects competing for the same names. They are two vocabularies sharing about a hundred words.

All figures in this section are reproducible with `python3 specs/qa/harness/admin-collision-map.py`, checked in with this ADR. Its docstring carries the method limits; D8 explains why they live there rather than here.

So ADR-007 D9 deferred the merge on a CSS obstacle of ~89 enumerable rules while stating it as 2,686. Roughly thirty-fold.

**D9's other two reasons are not withdrawn.** Reason 2 (the ST editor is the highest-consequence write path and should not be churned inside an epic already churning that cascade) stands and shapes the phase order below. Reason 3 (the expensive half already happened) is confirmed: `admin.js` and `app.js` share 23 modules including all of `data/` and the `editor/` core.

### The primary risk, which is not CSS

| | |
|---|---|
| `public/js/admin.js` | 62 KB |
| `public/js/admin/` (25 admin-only modules) | 1.2 MB |
| **additional ES module weight a merged document could load** | **~1.26 MB** |

And it is heavily concentrated:

| Module | Size | Lines |
|---|---|---|
| `admin/downtime-views.js` | 604 KB | 12,697 |
| `admin/downtime-story.js` | 205 KB | 4,664 |
| all 23 others combined | ~450 KB | |

Two files are 67% of the admin graph, and both are downtime admin, which is to say both sit on ADR-007 D7's frozen write path. **The heaviest modules are also the highest-risk ones.**

A merged document that eagerly loads this graph puts ~1.26 MB of additional ES modules on the phone at a game table, which is the same phone the GDX layout work (#983 rem type scale, #990 single-scroll sheet) exists to make usable.

**The admin merge is a code-splitting problem, not a CSS problem. D9 deferred it on the wrong axis.** If a future reader takes one thing from this ADR, it is that sentence.

There is no build step and no bundler, so the tool is native dynamic `import()` behind the role gate that already exists. That is a language feature, not new infrastructure.

## Decisions

### D1: One epic, one done-condition, stated the way it was asked for. (locks)

**Done means: `public/admin.html` no longer exists, and `public/index.html` serves both roles.**

Not "admin CSS normalised", not "module graph split". Those are tasks inside phases. The done-condition is phrased in the commissioner's terms because the USF drift happened in the gap between a defensible technical done-condition and the one being tracked.

Splitting this into three epics is the trap, not the mitigation: three clean done-conditions, none of which is the one above.

### D2: Every phase ends in something that can be opened in a browser and seen to be different. (locks)

A unit of work that cannot be demonstrated that way is a task inside a phase, not a phase.

**Second limb, added at Rev 12 after a product steer.** D2's positive limb — something openable and *different* — was written when the deliverable was ST surfaces appearing in the main app. Peter's steer re-points it: what he most wants to open and see is the **player experience, unchanged**. A phase that visibly adds an ST surface while subtly regressing player downtime satisfies D2 as originally written and fails the condition that actually matters.

So every phase carries both limbs:

- **Positive** — something can be opened and seen to be different.
- **Negative** — nothing player-facing has regressed, demonstrated rather than assumed, with **downtime first** while a cycle is open.

**Prefer a structural demonstration to an observational one (Rev 14).** Showing that no mechanism exists for a regression is stronger than showing none was observed, and it does not decay when someone forgets to look. The Spheres gate is the model: `index.html` references `admin-layout.css` zero times, so the edited file is not in the player's cascade at all and there is no path by which the change could reach a player. That closes the limb for every player surface at once, where an observational check closes it for the surfaces someone happened to open. Use the observational form only where no structural argument is available.

The negative limb is the harder one and it is the one under schedule pressure, because a regression that nobody opened the app to look for reads exactly like a clean phase.

Consequence, and it is the operative half: **cleanup with no visible output never becomes a phase.** The 503 `admin-layout.css` classes emitted by neither app (26% of the file, a reachability-deletion lead) ride inside a delivering phase or they do not happen. Same for the `body` rule and the residual overlap in D6.

### D3: Shell first, reconcile second. Invert USF's order. (locks)

Merging the documents is what makes the cascade collisions **visible on screen**. Reconciling 118 rules before the merge means reasoning about a cascade that does not exist yet, which is precisely the position that made a parity harness feel necessary in USF.

This is the same trade already accepted for the residual suite/components divergences: resolve where the breakage is visible, in a browser, in both themes.

Rejected: CSS-first. It is the ordering that feels safer and is not. It defers the only phase that delivers the done-condition, and it re-creates the need for an instrument to tell you what a browser would have told you.

### D4: The admin graph is code-split behind the role gate and never fetched for a player. (locks)

`applyRoleRestrictions()` (`app.js:1483`) already knows the role and is already idempotent. Admin modules load through dynamic `import()` at the point of use, gated on `getRole()`, **not** `effectiveRole()` (see D7).

- **The criterion is attributable-plus-ratchet, not zero (Rev 6).** "A player session fetches zero modules from `public/js/admin/`" was the original wording and it is *unmeasurable*, because it is already false. `public/js/app.js` statically imports its way into admin code today through a chain nobody placed deliberately:

  `app.js` → `tabs/archive-tab.js` (also `tabs/downtime-tab.js`, `game/dt-lookup.js`) → `tabs/story-tab.js:9` → `admin/downtime-story.js` (200 KB) → `admin/downtime-constants.js` (14 KB)

  ~214 KB of ST-only code (`downtime-story.js` imports `isSTRole`) shipped to every player session. A reviewer checking "zero" sees two modules and cannot distinguish expected legacy from new regression, so sixteen future passes would assert nothing. **A gate that cannot fail meaningfully is worse than no gate** — the same defect this project found in `usf-smoke.mjs`, one level up. Restated:

  1. **Attributable.** No admin module may become statically reachable from the player entry *because of a merged surface*. A moved surface reaches its module through dynamic `import()` only.
  2. **Ratchet.** The set of leaked modules may shrink, never grow. The baseline is a **named set**, not a count — a count of 2 would let a different leak silently substitute for a fixed one.

  Machine-checked by `specs/qa/harness/admin-leak-gate.py --check`, with the baseline in `admin-leak-baseline.json`. `--bless` refuses to record a larger set, so the only sanctioned direction is down. The gate does not follow `import()` by design: dynamic import is the sanctioned path, and a gate that flagged it would fire on every correct migration.

  The baseline lives in the generated artefact rather than in this prose, per the ADR-007 D7 Rev 4 lesson: a hand-maintained list of a moving target decays silently and is worse than none, because reviewers trust it.
- The legacy leak is tracked as **#1075**, independent debt rather than a P1 prerequisite. It is a live user-facing performance bug today — 214 KB on player phones, unrelated to the merge — and holding the pilot for it would be the D2 non-delivering-part trap, on a frozen-write-path file this ADR sequences last. **One sequencing constraint:** it must land before or with the downtime surfaces move, since that is when the same file is opened. The chokepoint is a *single edge*, `story-tab.js:9`, importing one function (`compilePushOutcome`); three modules import `story-tab.js`, but cutting that one edge closes the leak for all of them.
- `downtime-views.js` (604 KB) and `downtime-story.js` (205 KB) are moved **last** within P1, for three reasons, and the third is the one that outlives the others. They are 67% of the weight; they sit on the ADR-007 D7 write path; and **downtime is live** — a cycle is open and players are submitting into it, so touching these files mid-cycle risks real submissions rather than a rollback. Stated explicitly at Rev 12 because the first two reasons evaporate once the weight problem is solved, and the third does not. **Sequence these against the downtime cycle, not only against the epic.**

Rejected: a build step or bundler to solve this. It would be the largest new piece of infrastructure this project has taken on, to solve a problem `import()` solves natively, in a codebase whose stated architecture is "no build step, no router, no framework".

**Rev 4 extension: code-splitting covers presentation, not only modules.** A surface that loads its own JavaScript must load its own CSS. Stylesheet linking is per *document*, and the two documents link disjoint app sheets — `index.html` takes `theme/layout/components/suite` and never `admin-layout.css`; `admin.html` takes `theme/components/admin-layout` and never `suite.css`. So moving a surface's module across a document boundary moves its behaviour and leaves its appearance behind. See D9.

### D5: P1 opens with one surface, end to end, and that surface is Tickets. (locks)

The smallest version of P1 that still satisfies D2. It proves role gate to `import()` to render to interact to write, on one tab, before the pattern is applied twelve more times.

Tickets is chosen on measurement, not on size alone:

- **It is an admin-only surface. The player-side copy is dead code.** `tabs/tickets-tab.js` (217 lines) is statically imported at `app.js:74` and called at `app.js:524` inside `goTab`, and **nothing reaches it**: `tickets` appears in no nav array, no more-grid entry and no hardcoded `goTab()` call, and there is no hash or query routing. `app.js:1564` records the removal in a comment, *"Tickets removed — submit form is in Settings"*. The only live player-side ticket function is the Settings submit form, which uses `#stk-*` ids, not the `.tk-*` class family.
- **It is 10.5 KB and off the D7 write path.** It performs a real write (`POST /api/tickets`, `app.js:1812`), so the pilot exercises an interaction and a mutation, but not one of the two sacrosanct ones.
- **After the dead player copy is retired, it carries no CSS collision at all** (see D5a), which is what makes it the right first slice.

That last point inverts the reasoning this decision originally carried, and the inversion is the important part. **The pilot's job is to prove the loading pattern with nothing else varying.** ADR-007 D14 chose Tier 0 for exactly this property — zero judgement calls, so a failure could only be the apparatus — and the same logic applies here: a slice that exercised the loading pattern *and* a CSS collision would leave two candidate causes for any rendering fault. Tickets is the right pilot because it is clean, not because it is rich.

This is a phase boundary under D2 rather than premature decomposition, because an ST can open the app and work a ticket. It delivers.

### D5a: The dead player-side Tickets copy is retired first, in the pilot story, per ADR-007 D8. (locks)

`suite.css` defines 38 `.tk-*` selectors and **every one of them styles only the unreachable tab**; word-boundary checking confirms no `.tk-*` class is emitted anywhere else in the player app. `admin-layout.css` defines 48, `components.css` defines zero.

So the family is not a live duplication between two surfaces. It is 38 dead rules that would **become live against admin markup** the moment the documents merge. Retiring them is therefore not tidying, it is removing a trap that the merge would otherwise spring.

Sequence, per ADR-007 D8 (dereference, deploy, then delete), as the pilot story's first two pull requests:

1. Remove the `app.js:74` import and the `app.js:524` `goTab` branch.
2. Delete `public/js/tabs/tickets-tab.js` and the 38 `.tk-*` rules from `suite.css`.

D8's two-step is kept even though nothing reaches the module, because the static references at `:74` and `:524` are real references and removing them is what D8's window is for. This is the third surface in this codebase found present-and-wired but unreachable, after `player.html` and the 193 suite/player duplications. See D8 operating rule 3.

After this lands, merging the admin Tickets view introduces **zero** `.tk-*` collisions, and any rendering fault in the pilot is unambiguously a loading-pattern fault.

**The two-step protected a real intermediate state, not a theoretical one (Rev 5).** ADR-007 D8's one-deploy window is usually justified as making a revert a revert rather than a restore. Here it did something more concrete: `#t-tickets` was an **empty div** — all of its content came from `renderTicketsTab` — so between PR1 and PR2 even a console `goTab('tickets')` would have rendered a blank tab rather than a broken one. Worth recording as an instance of why the window matters *even when nothing reaches the module*, which is exactly the case where the two-step feels like ceremony.

### D6: The residual suite/components overlap is state, not a backlog. (locks)

The overlap stands at **48** on `dev` (163 at USF Phase 1 open, 110 removed by the Tier 0 batch delete, 5 more by the dt-hist family pass in #1063). Verified by `css-overlap.py --count` at `9953e2e6`.

Those 48 are **not** a workstream, are **not** a prerequisite for this epic, and must not be carried into ADR-008 as a residual. Whatever subset the merge actually needs gets resolved inside P2, in context, where the breakage is visible. Recording them as a backlog would be the D2 trap wearing a different hat.

`css-overlap.py --count` is retained as a cheap one-number regression check so the figure cannot silently grow. Everything else under `specs/qa/harness/` from the USF parity work is unused; it is left in place in case the merge wants it back, and it is not maintained.

**The six ADR-007 D13 renderer name-collisions** (`.attr-cell`, `.attr-name`, `.skill-row`, `.skill-name`, `.skill-spec`, `.skills-3col`) keep their carve-out and their third resolution class: where a collision is real and both components must coexist, the resolution is **rename**, never reconcile. That rule now applies to the whole P2 collision set, not only to those six.

### D7: Invariants carried from ADR-007. (locks)

Three, stated before any code is written rather than discovered in review.

1. **ADR-007 D7's frozen write-path inventory is untouched by P1.** The shell merge is markup and module loading; it does not reshape `buildSaveBody(c)` or any `PUT`/`POST`/`DELETE` site in the inventory. **Any P1 diff that adds, removes or reshapes an inventory entry is the D7 red-flag escalation to Architect**, regardless of how small the diff looks. This matters most when `downtime-views.js` and `downtime-story.js` move, per D4.

2. **ADR-007 D3 becomes load-bearing in a way it has not been until now.** Once the ST editor and the player view live in one document, `effectiveRole()` gating a fetch stops being a subtle bug and becomes a way to show an ST partial data in the application they administer with. Reads, writes and module loading select on `getRole()`. Visibility selects on `effectiveRole()`. **Every new `effectiveRole()` call site in this epic is a review stop.** This is the invariant most likely to bite in P1.

*D7.2 is a DELTA invariant, not a count (Rev 7).* Three defensible absolutes exist for the same tree — 9 counting distinct guarded sites, 13 counting invocations (a line like `effectiveRole() === 'st' || effectiveRole() === 'dev'` contains two), and 14 by raw grep including prose in comments. Do not try to reconcile them. **The invariant is that a non-write-path change adds none**, measured the same way before and after. Stage B's delta is zero under all three.

3. **ADR-007 D9 is superseded, not deleted.** Its deferral was correct on reason 2 and wrong on reason 1, and the deferral bought the shared-module consolidation that makes P1 cheap now. The record of a decision that was right for one of its stated reasons and wrong for another is more useful than its removal.

ADR-004's cache-entry invariant and ADR-006's render-path orchestrator discipline are unchanged and unaffected. No phase of this epic may add a second `applyStMods` composition site.

### D8: An entity count may size the work. It may never size the obstacle. (locks)

The obstacle is what a reachability measurement returns.

For CSS specifically, the test is per rule — *could this selector match an element the other surface emits?* — and **not** *do these two files share selector keys*. The two questions differed by twentyfold in D9's case and by the entire work plan in Rev 1's.

**Preamble, added at Rev 5 and governing all five rules below: three checks by the same method are one check.** On Tickets, three people independently ran rule 3 and all three passed it the same way — by grepping for the literal surface name. A literal name-grep *cannot find a generic router by construction*, so those were three correlated passes, not three independent ones, and a fourth reviewer would have bought nothing. When a blind spot is shaped by the method, the marginal value is in a different method, never in more eyes on the same one. Ask what the check you just ran is structurally incapable of seeing, and run something that can.

**Second preamble, added at Rev 9: a check only produces truth if halting is cheap for the person who runs it.**

Every rule below produces findings of one shape — *the work is not done*. And the person best placed to find a counterexample is the one executing the check, who therefore holds both the cheapest access to it **and** the strongest incentive to explain it away. That asymmetry is structural, not a matter of character.

Three specification errors were corrected during ADM P1 — the D5 reachability premise, the D9 property precondition, and the Rev 6 injector shape — each caught by whoever executed the thing that had been specified, and each surfaced as a halt rather than a workaround. That happened because halting was cheap and expected. It is a property of how the work is dispatched, not of anyone's diligence, and it is the load-bearing precondition for everything in this section.

If halting becomes expensive — schedule pressure, a surface count to hit, a reviewer treating a halt as a defect in the work rather than an output of it — these rules do not fail loudly. They degrade into rubber stamps **while continuing to look identical in the record**. That is the same false green this entire ADR is built against, arriving through the process rather than through an instrument.

Operationally, and it is P2's sixteen surfaces where the pressure will come from: **a tripped precondition is the process succeeding.** Say so when it happens. A story that halts on a D9 precondition has done its job better than one that does not.

Five operating rules follow:

- **Enumerate, do not count.** A reachability measurement returns a list. That list is a reviewable checklist, which is worth more than the number ever was. `specs/qa/harness/admin-collision-map.py` is checked in with this ADR and emits the P2 list.
- **State the method limit in the instrument, not in the message.** Class extraction over `class="..."` / `className=` / `classList.*` literals misses names assembled by string concatenation, so 55, 62 and ~118 are **floors, not ceilings**, and the measurement establishes match-possibility rather than cascade outcome (load order and specificity are not modelled). This caveat lives in the script's docstring because `css-overlap.py`'s docstring caveat is exactly what let QA catch the byte-identity trap on Tier 0. A caveat that lives only in a message does not survive the next reader.

- **Reachability is checked at story-drafting time as a matter of course, not when someone thinks to ask.** Added at Rev 2, after the pattern recurred a third time inside this ADR: D5 originally cited a static import and a call site as evidence that a surface was live, which is the same non-evidence the two ADR-007 instances rested on. Every USF-family surface examined so far has been present-and-wired and unreachable — `player.html`, the 193 suite/player duplications, and now `tabs/tickets-tab.js`. Three for three is not carelessness by any one author; it is a property of a codebase that has been accreting entry points faster than it retires them.

  The check is cheap and it is specific. **An import is not a reference; a call inside a dispatcher is not a route.** For any surface a story proposes to move, merge, restyle or delete, establish the *entry path* before the work is scoped: which nav array, grid entry or hardcoded call actually reaches it, and does any router exist. If the answer is none, the story is a deletion story and should be re-scoped as one before it is drafted, per `feedback_reachability_before_retire`.

  **Rule 3 has two halves, and the second is not optional (Rev 5).** Searching for the name and ruling out the routing *class* are different operations, and the first cannot perform the second:

  1. **Enumerate the nav metadata programmatically**, do not grep it. Read the arrays and count the entries — `MORE_APPS` (18 ids) and `NAV_ITEMS` (48 entries) on the current tree.
  2. **Rule out generic routing as a separate class.** Confirm there is no `hashchange`, `popstate`, `location.hash` or pathname-based tab routing anywhere in `public/js` (verified: zero occurrences). A name-grep would never surface any of these, because a generic router never mentions the name.
  3. **Trace any dynamic dispatch call to its source.** `goTab(currentTab)` looks capable of introducing a tab and is not: `currentTab` derives at `app.js:1065` from `document.querySelector('.tab.active')?.id`, so it reads the *already-active* tab out of the DOM and can only re-enter one something else opened.

  Step 3 is the difference between a check and an argument. A check reports what it found; an argument establishes what could not have been there.

- **Prefer syntax-aware extraction over pattern matching wherever a parser exists; where none exists, declare the measurement textual in the claim.** Added at Rev 15, from Ma'at, with four instances as its evidence:

  | pattern | target | outcome |
  |---|---|---|
  | `tk-` | `#stk-` | false positives, caught |
  | `.sph` | `.sphere` | **silently merged two families**, disguised as a counting disagreement |
  | `.placeholder` | `.placeholder-msg` | near-miss, caught on recheck |
  | `class="([^"]*)"` | `class="a${c ? ' b' : ''}"` | truncated the capture, returned zero cross-bucket pairs where there was one |

  **These are one defect with four faces, not four mistakes: a measurement whose tokeniser disagreed with the language it was reading.** Three read a *substring* where a *token* was meant; the fourth stopped at a delimiter the target language does not treat as one. "Be careful with regexes" is the wrong lesson, because care does not change what a tokeniser is capable of expressing.

  It predicts where the next one lands: **any extraction that treats source as text rather than as syntax.** `css-overlap.py` is a real parser for CSS, and nothing in the rig is one for JS — which is exactly why all four landed on the JS side or the CSS/JS boundary. The rule cannot be "always parse", because there is no JS parser here today. It is **parse or declare**.

  *Self-correction, recorded because this rule was written against my own instruments.* Every emitter scan in `admin-collision-map.py` used `class\s*=\s*["']([^"']*)["']`. Against the real line `class="sphere-card${vacant ? ' sphere-card-vacant' : ''}"` it captured `sphere-card` and a **phantom class `vacant`** (a JS identifier) while missing the real `sphere-card-vacant` — both error directions from one line. There are **385 interpolated class attributes across 53 files**. Restricted to classes some stylesheet actually defines, the old scan missed 36 admin and 48 player classes — overwhelmingly state modifiers (`expanded`, `done`, `hidden`, `flagged`) — and invented a handful of phantoms.

  Consequences, now corrected in Context above: merge exposure **~118 → ~89** (phantoms like `d`, `done`, `open` were matching rules and inflating collisions), player-side design-system adoption **900 → 922**. The D9 `st-in-lib` baseline stays at 55 but **its membership changed**: `done` leaves as a phantom, `stm-mod-row--inactive` enters. The baseline was deleted and re-blessed rather than amended, because a baseline established by a defective instrument is not a baseline. Ma'at's 56 was closer than my 55, and my correction of her figure was the wrong one.

- **A caveat that does not travel with the number it qualifies is decoration.** Added at Rev 6's successor, Rev 10. This is the *delivery* half of rules 4 and 5: those govern how a measurement is taken, this governs whether its limit survives contact with a reader.

  Two instances a week apart, by different authors, which is the argument for treating it as structural rather than as two mistakes. A PR carried the sentence *"this count is a floor — a site sniffing differently would not appear"* and then built its headline on the narrow figure: *"zero 24-hex sniffs remain."* There were four normalisation implementations in that file, and two of them resolve by `(_territories || []).find(t => String(t._id) === key)` with **no sniff at all** (`downtime-form.js:3947`, `:7203`, and the same shape at `:2403`, `:7353`), so they were invisible to the grep *by construction* — a more careful grep would not have found them; only a different question would. Separately, a QA gate that declared a harness UNVERIFIED later reported a coverage figure from it without restating the caveat beside the number.

  In both cases the correct limitation was written down and the number was published as though unqualified, because they ended up in different paragraphs. **Only the number travels** — into a PR title, a summary, a brief, someone's memory of a meeting. Downstream, a correctly-scoped measurement whose scope was dropped in the retelling is indistinguishable from a badly-scoped one, and it is *worse* than an unqualified guess, because it now carries borrowed authority.

  Operationally: **state the scope inside the claim, not beside it.** "Zero 24-hex sniffs remain" should have been "two of four normalisation sites consolidated; the other two resolve by `_id` lookup". Longer, and it cannot be quoted into a falsehood. The test is whether the shortest quotable fragment of your sentence is still true.

- **Match the SCOPE of the decision, which is a different axis from granularity.** Added at Rev 5. For CSS the decision unit is the **document**, not the repository, because stylesheet linking is per document: `index.html` loads `suite.css` and never `admin-layout.css`; `admin.html` the reverse. "Is this rule dead?" therefore has a *different answer per document*, and a tree-wide search cannot express that at any granularity.

  Worked example, and note it fails in the dangerous direction. A reviewer greps the tree, finds `admin/tickets-views.js` emitting `.tk-badge`, and concludes the `suite.css` `.tk-badge` rule is live. Wrong: `tickets-views.js` reaches `admin.html`, which never loads `suite.css`. The emitter exists, but not in the document that loads the rule. Classified by document reachability the per-rule scan returned **29 of 29 dead**, where a tree-wide grep shows three apparent survivors — so the reviewer would have **blocked a correct deletion**. That is a false red, and per D9 this project holds that false reds cost as much as false greens.

  Granularity and scope are orthogonal. A measurement can be correctly per-rule (right granularity) and still tree-wide (wrong scope), which is exactly this case. A reader who has satisfied rule 4 will not automatically ask rule 5, which is why it is stated separately rather than folded in.

- **Measure at the granularity of the decision, and treat your own first number as a hypothesis.** Added at Rev 3, and it is the rule the other three keep failing at rather than a fourth topic.

  Every instance of this pattern so far has been a measurement taken at a *coarser* granularity than the action it was used to justify. Rev 1 measured selector duplication across two files and used it to justify per-family promotion work, when the decision needed per-file load reachability. D9 measured selector counts and used them to justify deferring a merge, when the decision needed per-rule match-possibility. ADR-008 D5 measured that a module was imported and wired and used it to justify treating a surface as live, when the decision needed an entry path. In the sweep that followed, an initial finding of "11 dead `.map-*` rules in `suite.css`" was an *enumeration* and so satisfied rule 1, yet was still wrong: the emitter check had been run at family granularity while the decision was per-rule deletion. Checked per class, exactly **one** rule is dead (`.map-img-wrap`); the other eight are emitted by `components/map-overlay.js` through `tabs/city-tab.js`, which is reachable via the Who's Who tab (`app.js:470`).

  So the rule is not "enumerate instead of counting" alone. It is: **the measurement's granularity must match the granularity of what you are about to do.** If the action is per-rule, the evidence must be per-rule.

  The operating half is a habit rather than a technique. A first-pass measurement is a hypothesis, and the person who produced it is the one best placed to falsify it before anyone acts on it. Both false positives in the 2026-07-29 sweep — a default-routed admin domain flagged as unrouted, and the eleven-rules figure — were caught by their own author re-deriving before reporting. That is the discipline working, and it is worth more than any of the individual findings.

### D9: A merged surface owns its stylesheet. Scope separation is the third resolution class. (locks)

Added at Rev 4, after ADM P1 Stage B could not render. The finding that forced it is worth stating before the decision, because it generalises past Tickets.

**The problem is coverage, not collision.** After Stage A correctly deleted the 10 `.tk-*` rules that `suite.css` and `admin-layout.css` both defined, the merged Tickets surface in `index.html` had **zero** of its definable classes styled, because `index.html` never loads `admin-layout.css`. This is not cosmetic: three of the missing rules *are* the interaction state, and all three exist only in `admin-layout.css` — `.tk-filter-btn-on` (the only signal of which filter is active), `.tk-admin-row-expanded` (the only signal of which row is expanded), and `.tk-admin-split` (`display:grid`, without which both queue panels stack). Verified: each is defined once, in `admin-layout.css`, and nowhere else. AC9 requires an ST to list, **filter**, **expand** and edit; two of those four become invisible. A functional failure, reached through CSS alone.

**The shape underneath is independent co-authoring, and ADR-008 has been counting it without naming it.** `suite.css` and `admin-layout.css` independently authored the same class names with different values, one per document. Neither is "the duplicate", so there is no obviously-correct copy to delete. The ~118-rule enumeration in Context counts this shape; the framing of P2 as "reconcile collisions" presumes one side is canonical and does not hold for it.

**Three resolution classes, and the third is new:**

1. **Reconcile** (ADR-007 D5 corollary 1) — one component, two copies. Keep one. Presumes a canonical side.
2. **Rename** (ADR-007 D13) — two components sharing a name that **must coexist** in one document. Give one its own name.
3. **Scope separation** (this decision) — two components sharing a name that **need not coexist**, because they are role-gated and never render together. Load them apart. No rename, no reconciliation, no rule edited.

The third is available here precisely because these surfaces are role-exclusive, and it is the cheapest of the three: it edits no declarations and makes no design judgement. **For role-exclusive surfaces it is the preferred resolution.**

**Counting convention for an extraction, settled at Rev 5.** Two people measured the Tickets rules at 47 and 48 and both were right, about different questions. The delta is a single all-`.tk-` comma group (`.tk-select, .tk-input`). State which you mean:

| | Tickets |
|---|---|
| Rule **blocks** containing a `.tk-` selector — **the extraction unit** | **47** |
| Single **selectors** mentioning `.tk-`, after comma-splitting | 48 |
| Of those, inside an `@media` block | 0 |
| Comma groups **mixing** a `.tk-` with a non-`.tk-` selector | **0** |

**Blocks is the extraction unit, because extraction moves whole rules.** The last row is the one that must be checked rather than assumed: a mixed comma group cannot be moved without splitting it, which would be a rule edit rather than a relocation and would take the change out of class 3. Here it is zero, so the extraction is a pure relocation — the same grouped-selector safety check ADR-007's Tier 0 ran, with the same clean result.

**Precondition, checked before any extraction (Rev 6, reworded Rev 7): every referenced custom property must RESOLVE FROM A DOCUMENT-AGNOSTIC SCOPE IN A SHEET BOTH DOCUMENTS LOAD.**

Scope separation relocates *rules*; it does not relocate the custom properties those rules resolve against. If a moved rule references a `var(--x)` that does not resolve in the destination document, the elements render **silently unstyled** — the same failure mode, and the same silence, as the mixed-comma-group hazard.

**The hazard has two dimensions, and Rev 6 stated a check that only saw one.** Rev 6 said the properties must "resolve in `theme.css`, which both documents load". That is a *name-presence* test against a file, and it misses the second dimension:

1. **Wrong file** — the property is declared only in `admin-layout.css`, which `index.html` never loads.
2. **Wrong scope** — the property is declared in a shared sheet but under a selector that does not apply in the destination document.

`admin-layout.css`'s three local properties demonstrate the second: `--ar-bdr`, `--ar-bg` and `--ar-c` are declared under `.ar-pending` / `.ar-valid` / `.ar-complete` (`admin-layout.css:6206-6208`), i.e. inherited from an ancestor carrying one of those classes — not from `:root`. A property declared *in `theme.css`* but under an admin-only selector would pass Rev 6's stated check and still render unstyled. Hence the reworded form: what matters is the **scope it resolves from**, not the file it appears in.

The check, operationally:

- Collect every `var(--…)` in the rules being moved, then **follow alias chains** (`--accent` → `var(--crim)`, `--txt1` → `var(--txt)`) until closed.
- For each property in that closure, confirm it is declared under a document-agnostic selector — `:root`, `html`, `body`, or a theme attribute like `[data-theme="dark"]` — in a sheet **both** documents load.
- A property declared only under a component or state class fails, wherever it lives.

Tickets passes the strong form: the closure is 24 properties (23 references plus alias targets), all declared on `:root`, 14 with `[data-theme="dark"]` overrides, so it holds in both documents *and* both themes. `theme.css` declares its 188 properties under `:root` and 153 under `[data-theme="dark"]` and nothing under a component selector, which is why the weaker check happened to give the right answer here — and exactly why it should not be generalised from.

Negative control, run rather than reasoned about: a rule referencing `--ar-bdr` takes the closure's not-agnostic count from 0 to 1 and halts with the property and its three class scopes named. **Check it per surface. Do not assume it from Tickets.**

**Fourth precondition, added at Rev 13: EMITTER EXCLUSIVITY. Does exactly one surface emit this family?**

The first three preconditions can all pass on a family that is not per-surface at all. On Spheres (#1096) they did: zero mixed comma groups, zero `@media` nesting, and a clean 10/10 `var()` closure at `:root` — and the family is still shared. Of the sphere-family classes, 22 are emitted only by `spheres-view.js`, **5 are emitted by both it and `downtime-views.js`** (`sphere-card`, `sphere-head`, `sphere-name`, `sphere-total`, `spheres-grid`), 4 only by `downtime-views.js`, and the rest by nothing.

**Why this will recur, and why Tickets passing was luck rather than structure:** CSS families are named after a **domain concept** ("sphere"), while surfaces are named after a **screen**. Two screens can show the same concept. Tickets happened to have a family nobody else emitted, so the question never came up. With thirteen surfaces left, a concept appearing on two screens is the normal case.

**Extract by EMITTER SET, never by name prefix.** This sits above the block-versus-selector counting convention and supersedes it where they disagree — it is D8 rule 5 applied to modules rather than documents: the decision unit is the emitting surface, not the name. The Spheres section is 49 blocks only under a `.sph` substring search, which silently merges **two separate prefix families** — 31 `.sph-*` and 18 `.sphere*`/`.spheres*` — because `.sphere` begins with `.sph`. Same substring trap as `#stk-` matching `tk-` on Tickets, inverted: there it produced false positives, here it merged two families into one number and made the discrepancy look like a counting convention.

**Fifth precondition (Rev 14): no rule block may span two buckets.** The first three preconditions ask whether a family can *leave* `admin-layout.css`. Bucketing asks a second question one level down: can the family be **split internally without editing a rule**? A block whose selector spans two buckets cannot go into either sheet without being cut, and cutting is an *edit*, which drops it out of resolution class 3 exactly as a mixed comma group does — the same failure mode, one level down.

When the count is non-zero, **leave that block behind** in `admin-layout.css` rather than cut it. On Spheres it is exactly one (`.sphere-dominant .sphere-char-name`, spanning dead and Downtime-only), and both its buckets stay put, so nothing that moved was entangled.

**Resolution, and it is not simply "extract what this surface emits":**

| bucket | destination |
|---|---|
| emitted by this surface only | the surface's own sheet (`admin-spheres.css`) |
| emitted by **two or more** surfaces | a shared admin sheet (`admin-shared.css`) |
| emitted only by a surface that has not moved | leave in `admin-layout.css` until it moves |
| emitted by nothing | leave; it is dead and a deletion question, not a migration one |

**A surface's load path declares the SET of sheets it needs, not one sheet.** `loadSurfaceSheet` is already idempotent and promise-cached, so a surface injecting both its own sheet and a shared one costs nothing.

Rejected: putting the shared rules in the first-migrating surface's sheet. It works today and fails at the worst possible moment — when the second surface moves, which for Downtime is P1-last, on the frozen write path, against a live cycle. It also files one surface's rules under another's filename, and a filename that lies is discovered by whoever is least expecting it.

Rejected: promoting the shared rules to `components.css`. That is where ADR-007 D5's promotion test would send a class used by two or more consumers, but `components.css` is loaded by the player document. Two reasons, and at Rev 14 the second is the load-bearing one:

1. It would add to the ST presentation reaching every player — see the ratchet below.
2. **It would fuse the admin cascade into the shared lib**, which is the thing that has to stay separable. Peter's steer is that much of this app's function moves to another app; a rule that lives in `components.css` cannot travel with the surface that owns it. `admin-shared.css` is ADR-007 D5's promotion **confined to the admin cascade**, and it stays movable.

**Logged exception, added at Rev 14: the "zero ST presentation reaches a player" rule already has a large pre-existing violation, and Rev 4 and Rev 13 both stated it as though it did not.**

Measured on `dev`: **55 classes** defined in `components.css` are emitted by admin sources and by no player-side file, across **88 rule blocks**. The `stm-audit-*` family is 45 of them; the rest are `cc-*`, `char-card`/`char-detail`, `cd-sheet` and a few loose state classes. *Method limit, stated in the claim per D8 rule 6: this is static emitter analysis, so a class the player side builds by string concatenation would look admin-only. Treat 55 as an **upper bound** on the exception.*

This matters because the rule was cited at Rev 13 to refuse five classes while roughly ten times that number was already there. **The Rev 13 decision stands, but its rationale was overstated and is restated above on reason 2**, which holds independently of the legacy.

Resolution is a **ratchet, not a grandfather clause**: the rule is absolute for new work, and the existing set is a named baseline that may shrink and never grow. Same mechanism and the same reasoning as the D4 leak ratchet, including that the baseline is a **named set rather than a count**, so a new violation cannot substitute for a retired one — which also absorbs the imprecision the method limit admits to.

Gated by `admin-collision-map.py --st-in-lib --check`, baseline in `st-in-lib-baseline.json`, `--bless` refuses to grow it. Not fixed now, deliberately: it is cost-free in bytes beside the 214 KB already cut, and `stm-audit-*` belongs to a surface Peter has said is being retooled with a new data interface, so ripping it out now is work aimed at a moving target. Cleanup is tracked separately.

**`admin-shared.css` is the NORMAL path, not an exception mechanism (Rev 14).** An emitter-exclusivity sweep across all 14 admin surfaces found that **every surface with substantial styling shares classes with another**; not one passes exclusivity outright. The two apparent passes are artefacts — `st-mods-audit` because its styling already sits in `components.css` (the logged exception above), and `tickets` because its family has already been extracted. Shared counts run 3 to 8 per surface.

A reader meeting `admin-shared.css` for the first time will assume it is for edge cases, and will be wrong. Expect most surfaces to contribute to it.

Two consequences worth stating rather than discovering. **`downtime-views.js` is the most common sharing partner in the table** — the module D4 sequences *last* is entangled with nearly every surface sequenced before it. That is not an argument to resequence: the frozen-write-path and live-cycle reasons stand and are stronger. It does mean Downtime arrives last to a shared sheet it had no say in, so every earlier surface should record *which* of its shared classes are Downtime's, and the Downtime story should open by reviewing that accumulated set rather than accepting it.

Entry rule for `admin-shared.css`, to stop it becoming a second `admin-layout.css`: a class enters when **two or more surfaces emit it** — migrated or not, since emitter exclusivity is a property of the code rather than of migration order — and the emitter set is recorded alongside it. Deferring on the grounds that the second surface has not moved yet is exactly what creates the surprise.

**Not every class is a candidate for scope separation.** `spheres-view.js` emits `class="placeholder"` for its loading and error states; `.placeholder` is defined once, in `admin-layout.css`, and used by nine admin modules. It must not be extracted with any one surface. Accepted consequence: those two transient messages render as unstyled paragraphs in `index.html`. Text remains visible, and a class with many consumers needs a broader decision than a per-surface extraction can make.

**The mechanism.** Extract the surface's rules from `admin-layout.css` into a private per-surface sheet (`public/css/admin-tickets.css` for the pilot), and have the surface's own dynamic-`import()` load path inject the `<link>`, idempotently. Rejected alternatives: linking `admin-layout.css` from `index.html` (it is a full layout sheet, would collide broadly with `layout.css` and `suite.css`, and destroys the pilot's zero-collision property at the moment of the merge); and shipping Stage B unstyled (breaks D2 in the exact way D2 exists to prevent — Peter opens it and sees a broken surface, learning that the phase failed when only its styling was unresolved; a false red is as damaging as a false green).

Static links from `index.html` were also rejected in favour of injection: they would ship ST CSS to every player. That does not breach D4's module-fetch criterion, but it breaches its intent. **Zero ST presentation reaches a player, not merely zero ST JavaScript.**

**The precondition, and the one place it fails.** Scope separation is sound only where the two surfaces cannot co-render. This codebase has exactly one violation: the `_viewMode` ST-preview toggle (`app.js:1777-1779`). An ST who opens an admin surface, injecting its sheet, and then toggles to player preview would keep admin rules applied to player markup. It is moot for Tickets (the player copy is dead, per D5a) and live for the other fifteen.

Therefore the injected sheet is **gated in both directions, and the two gates are different**, which is ADR-007 D3 applied to presentation:

- **Injection gates on `getRole()`** — authority. Should this session ever load this sheet?
- **Application gates on `effectiveRole()`** — presentation. Should it apply right now? Enforced by toggling `link.disabled` inside `applyRoleRestrictions()`, which is already idempotent and already runs on boot, on view toggle and on role-affecting state changes.

That D3's read/write-versus-visibility split lands cleanly on fetch-versus-apply is a check on the design rather than a coincidence. Retracting by `disabled` rather than removing the element avoids a refetch on every toggle.

**One composition site owns the application state (Rev 6).** The injector must not compute "should this apply" for itself, even from `_viewMode` directly — that would be a second view of the same arithmetic, which this codebase has a documented history of drifting (`feedback_two_views_same_arithmetic`). Instead:

- `loadSurfaceSheet` injects the link **enabled**, tags the element (`data-surface-sheet`), and calls `applyRoleRestrictions()` **synchronously in the same task**.
- `applyRoleRestrictions()` owns every surface sheet's state: `document.querySelectorAll('[data-surface-sheet]').forEach(l => l.disabled = !isST)`, reusing the `role` it already computes at its top (`app.js:1480`).

This adds **zero** new `effectiveRole()` call sites, so D7.2 is not engaged, and the injector stays presentation-agnostic.

**Rev 8 correction: do not inject with `disabled = true`.** Rev 6 specified a `disabled = true` initial state as a fail-safe against flashing ST styling into a player preview. That was wrong, and wrong in the worst available direction.

A `disabled` stylesheet link **may never be fetched** — that is the basis of the lazy-CSS trick — so neither `load` nor `error` fires and a promise awaiting them never settles. Under the Rev 6 shape, an ST already in player preview who opens an admin surface would get a **blank surface with no error**: not a slow render, not an unstyled render, nothing. The normal path survived only because `applyRoleRestrictions()` flips `disabled` synchronously before the browser yields, which is an invisible ordering constraint that a later refactor moving that call behind an `await`, a `setTimeout` or a `rAF` would silently break.

The corrected shape removes the dependency rather than guarding it. Injecting enabled means the fetch always proceeds and the promise always settles; `applyRoleRestrictions()`, running synchronously in the same task, sets `disabled` before the browser can paint, so there is no flash to protect against. The preview case then renders the surface *unstyled*, which is the correct semantics of previewing what a player sees.

Note what changed about the failure mode, because it is the general lesson and not a detail of this file:

| | if the synchronous ordering is later broken |
|---|---|
| Rev 6 shape (`disabled = true`) | blank surface, no error, no console output |
| Rev 8 shape (inject enabled) | brief flash of ST styling |

**Prefer the mechanism whose failure mode is cosmetic over the one whose failure mode is silent and total.** Rev 6 chose `disabled` because it read as the safer default; it is the more dangerous one, because it couples *application* to *fetching* — the two concerns this decision had just carefully separated. A guard such as `if (link.disabled) return Promise.resolve(false)` would also work and **was proposed in the record but never written into the code** — the developer declined to alter a specified shape while awaiting a ruling, which was correct. Rev 8 is purely the removal of `disabled = true`; there was no guard to delete. It is noted here only because it defends a mechanism that should not be in use.

**Empirically confirmed, Chromium, against the Rev 6/7 shape (Rev 9).** The hazard was live, not latent. ST in player preview, `goTab('tickets')`: tab active, `contentLen` 0, zero rows; the `<link>` injected with `disabled` true; `admin-tickets.css` network responses `[]` — **never fetched**; zero `pageError`s and zero console output. Measured by instrumenting network responses rather than inferred from the blank tab.

*Severity bounded honestly:* from the blank state, toggling back to ST view settled the pending promise and the surface rendered. So the failure was silent and total but **recoverable**, not wedged. That must not be read as making the Rev 6 shape acceptable — a failure a user escapes only by accidentally toggling an unrelated mode is still a silent total failure — and it is recorded because the record should say the true thing rather than the one that makes the decision look better.

This ruling does not depend on resolving what any particular browser does with a disabled link. The corrected shape is correct under either answer, which is why it is preferred to establishing the behaviour and relying on it.

**Consequence for P2, which is the larger half of this decision.** P2 was framed as sixteen collision negotiations. For role-exclusive surfaces it becomes sixteen mechanical extractions, and the independent-co-authoring problem largely dissolves because each surface's rules live in a namespace that only loads with it. Reconciliation and rename remain for whatever genuinely coexists after the merge; that set is expected to be small, and it must be **measured per surface rather than assumed** (D8 rule 4).

Do not pre-emptively design for sixteen sheets. Land one, for Tickets. If surfaces two through four show the extraction is mechanical, the pattern is proven; if they do not, that is learned at a cost of three surfaces. With no build step, a stylesheet that never loads costs nothing, and whether the files are later concatenated is a packaging decision, not an architectural one.

`admin.html` static-links the extracted sheet while it still exists; `index.html` injects it. The asymmetry is transitional and ends at P3 when `admin.html` is retired.

**Mechanism or scaffolding under D2.** The injection helper is **mechanism**. Khepri's proposed line — a helper called from within a surface's own load path is mechanism, one landed as its own story is scaffolding — reaches the right answer, and the criterion underneath it is D2 itself: *does the story that lands the helper also deliver something openable?* The helper arriving inside the Tickets slice, used by Tickets, ships with a working surface. The same helper landed as "add CSS injection infrastructure", with no surface attached, is the trap. Judge the story, not the file.

### D10: A fix may ship ahead of its gate only when it cannot alter what is persisted. (locks)

Added at Rev 10, after a player-blocking defect was shipped ahead of QA on the SM's judgement and the criterion used was **diff size**. Size is the wrong property. A ten-line change that moves a write path is far more dangerous than a hundred-line change that cannot touch one.

The property that actually bounds the risk is **display-only**: can this change alter what is *persisted*, or only what is *displayed*? Character sheets and downtime submissions are lost through write paths (ADR-007 D7); a change that provably cannot reach one cannot lose them, whatever its size.

This is **established, not asserted**:

```
python3 specs/qa/harness/write-path-inventory.py --touches origin/dev
```

It intersects the diff's changed hunks with the generated inventory's sites and scans the diff for any mutating call to a sacrosanct collection, including ones not yet in the inventory. Exit 0 means display-only holds; exit 1 means the full gate is required; exit 2 means the invocation examined nothing. It runs in about a second, needs no browser, and composes with ADR-007 D7 — if the diff touches no inventory entry and introduces no persistence call, display-only is a measured fact.

**Certification is at FILE granularity, deliberately (Rev 12).** If the diff touches any file containing a write site, D10 does not certify — even when no changed hunk overlaps a site.

Rev 10 and 11 intersected changed hunks with inventory sites, and that measured the wrong thing. **Hunk intersection sees changes *to* a write site but not changes to whether a write site is *reached*.** The worked case: an early `return` added at `story-tab.js:1063` in a catch block can stop an untouched `await apiPut('/api/downtime_submissions/…')` at `:1079` — same function, sacrosanct collection — from ever executing. The `apiPut` line is in no hunk, the intersection is empty, and Rev 11 printed `DISPLAY-ONLY ESTABLISHED`.

This is D8 rules 4 and 5 arriving one level up, inside an instrument built to enforce them: the unit measured (changed lines) was not the unit the decision needs (reachability of writes). Establishing reachability properly needs control-flow analysis. File granularity is the cheap, robust, parser-free over-approximation, and **a bypass criterion must fail toward requiring the gate** — a false-conservative result costs one QA pass, a false-permissive one costs a submission.

It is affordable because write sites concentrate: 47 sites in **14 of 162** files, so most display-only changes touch no write-site file at all. When a changed file does contain sites, the report names them so the reviewer knows where to look, but D10 does not grant the bypass.

**Always `--touches origin/dev`, the branch point — never your own branch and never `HEAD` (Rev 11).** The mode diffs the *working tree* against the ref, so passing the branch you are standing on produces a zero-line diff that examines nothing. Rev 10 documented the bare form `--touches <ref>`, and that form was copied into a story and a dispatch and run as `--touches <own-branch>`, where it printed `DISPLAY-ONLY ESTABLISHED` and exited 0 against 34 lines of unexamined change.

That failure deserves stating rather than quietly fixing, because of its shape: **it does not require anyone to be careless — it is produced by following the instructions.** The vacuous pass is textually identical to a real one, and it propagates to every story that copies the documented invocation. It is D8 rule 6 applied to an *instruction* rather than to a number: the bare form is what travels, so the reason must be attached to it.

The tool now refuses an empty diff with exit 2 and names the likely cause, rather than printing a pass. That is D9's cosmetic-over-silent preference applied to the harness itself: a loud operator error in place of a silent vacuous green.

Two limits, both load-bearing:

- **It establishes only that what is persisted cannot change.** What is *displayed* still needs its gate. D10 is a bypass criterion for one class of risk, not a substitute for QA.
- **It depends on the inventory being current**, which is why the inventory is generated rather than hand-maintained (ADR-007 D7 Rev 4). A D10 exemption granted against a stale inventory is worth nothing.

Recorded here rather than left as process for the reason Rev 9 gives: this is a decision about **when the gates may be bypassed**, which is exactly the class of rule that erodes silently under pressure.

## Phase sequencing

**P1's success condition is player parity, not surface count (Rev 12).** Peter's steer: much of this app's function will be removed and reimplemented in another app, so the two halves need not match perfectly; what is wanted first is a merged app that *at least duplicates the existing player experience*, downtime especially.

Two consequences. First, "all 17 admin surfaces moved" is not the goal and never was the done-condition — D1's done-condition (`admin.html` gone, `index.html` serves both roles) is unchanged. Second, each surface now takes an explicit **move / retire / defer** decision at drafting time rather than being assumed to move: a surface whose function is migrating to the other app should be retired or deferred, because moving it is work that gets discarded. Record the decision and its reason per surface; do not let "defer" become an unexamined default.

**P1: merge the shell.** Admin's sidebar and nav into `index.html` under the existing role gate, with the admin module graph behind dynamic `import()` (D4). Opens with the Tickets surface end to end (D5), then the remaining surfaces, with `downtime-views.js` and `downtime-story.js` last. Not write-path-touching, and D7.1 is the standing check that it stays that way.

**P2: reconcile in place.** The ~118 enumerated collisions, resolved in a browser, in both themes, using the `admin-collision-map.py` output as the checklist. Renames where a collision is two components sharing a name (D6). The 503 dead admin-layout classes are cleared opportunistically here, never as their own phase (D2).

**Not in this epic: `t-map`.** The entry-path sweep found the player Map tab unreachable (dispatcher branch at `app.js:429-455`, `#t-map` at `index.html:360`, and nothing else — no nav entry, no more-grid entry, no hardcoded call, no router). Its dead surface is that branch, the div, the now-unused `app.js:52` import, and exactly one CSS rule (`.map-img-wrap`). `components/map-overlay.js` **stays**: it is live through `tabs/city-tab.js`, which renders into the Who's Who tab at `app.js:470`.

It is filed as its own issue and deliberately kept out of both P1 and P2. Out of P1 because the pilot's value is that any rendering fault in it is unambiguously a loading-pattern fault (D5), and unrelated deletions reintroduce a second candidate cause. Out of P2 because P2 reconciles collisions and this has none. Out of the epic entirely because it has nothing to do with merging admin, and attaching unrelated work to an epic is the scope accretion that produced the USF drift in the first place. D2's "cleanup rides inside a delivering phase" governs *this epic's* cleanup; it is not a licence to adopt orphans. If P1 happens to be editing the tab dispatcher anyway and the issue is still open, folding it in there is fine.

**P3: retire `admin.html`.** Per ADR-007 D8, unchanged: dereference, deploy, then delete in a separate pull request. That discipline earned its keep in USF Phase 0.

## Consequences

**Positive.** The done-condition is the thing that was asked for, and every phase moves it. The measurement replaces a twentyfold-overstated obstacle with a checklist. The code-split is a net improvement to the player app independent of the merge: admin modules are currently loaded by `admin.html` eagerly, and after D4 no session loads a module it will not use.

**Negative.** P1 puts the ST editor and the player view in one document during the epic, which is exactly what ADR-007 D9 reason 2 warned against. That warning is accepted rather than dismissed: it is why D7.1 escalates any write-path diff, why D7.2 makes every `effectiveRole()` call site a review stop, and why the two heaviest write-path modules move last. The risk is real and is being managed rather than avoided, because avoiding it is what produced three weeks of preparation for a merge that never came.

**Neutral.** The 48 residual overlaps stay. They are inside an app that can be opened and looked at, and D6 declines to make them a workstream.

**Watch.** The concentration of module weight in `downtime-views.js` (12,697 lines) is a standing problem this epic exposes but does not solve. If P1 finds that file cannot be cleanly code-split, that is a signal about the file rather than about the merge, and it warrants its own decision rather than an in-passing refactor.
