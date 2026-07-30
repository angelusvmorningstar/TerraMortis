---
id: ADR-008
title: 'Admin merge: one app, shell first, code-split behind the role gate'
status: approved
date: 2026-07-29
revision: 4
author: Imhotep (Architect)
supersedes: ADR-007 D9 through D15 (Rev 2 addendum and the Phase 1 shard plan)
related:
  - issue #1047 (Epic USF, re-scoped and closed by this ADR)
  - specs/architecture/adr-007-unified-suite-topology.md (D1-D8 retained and load-bearing here)
  - specs/architecture/adr-004-st-mods-overlay.md (Rev 4, single applyStMods composition site)
  - specs/architecture/adr-006-defence-penalty-readpath.md (render-path orchestrator discipline)
  - specs/qa/harness/admin-collision-map.py (the P2 checklist, checked in with this ADR)
  - specs/qa/harness/css-overlap.py (retained as a one-number regression check)
  - public/admin.html (the entry this epic retires)
  - public/js/app.js:150-152 (effectiveRole), :1483-1524 (applyRoleRestrictions)
  - memory: feedback_count_is_not_reachability, feedback_decomposition_into_nondelivering_parts
---

# ADR-008: Admin merge

## Revision history

| Rev | Date | Change | Author |
|---|---|---|---|
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
| emitted by player-app sources | 900 (71.1%) |

*(The tempting correction — that D9 inferred non-adoption from low definition overlap, which are opposite readings, since a class used but never redefined gives zero overlap and total adoption — was tested and did not hold. D9's conclusion survives direct measurement. Recorded because the check was made and came back negative.)*

**What D9 got wrong is the unmeasured clause.** Measured in both directions, per rule, by asking whether a selector could match an element the *other* app emits:

| Merge cascade exposure | rules |
|---|---|
| `admin-layout.css` rules whose every class token is emitted by the player app | 55 |
| `suite.css` rules whose every class token is emitted by admin | 62 |
| unscoped element rules in admin-layout (the `body` rule at `admin-layout.css:5`) | 1 |
| **genuinely new exposure created by merging the documents** | **~118** |
| `components.css` rules matching admin elements | 108, and **not a merge cost** |

That last row matters most. **`admin.html:12` already loads `components.css`**, before `admin-layout.css`. Those 108 apply today. Admin is not outside the design-system cascade waiting to be dragged into it; it is already inside it and overriding it. D9 described a boundary that does not exist.

The exposure is small because the two class vocabularies barely intersect. Admin emits 1,807 distinct class literals, the player app 2,001, and 1,696 of admin's appear nowhere in the player app. These are not two dialects competing for the same names. They are two vocabularies sharing about a hundred words.

All figures in this section are reproducible with `python3 specs/qa/harness/admin-collision-map.py`, checked in with this ADR. Its docstring carries the method limits; D8 explains why they live there rather than here.

So ADR-007 D9 deferred the merge on a CSS obstacle of ~118 enumerable rules while stating it as 2,686. Roughly twenty-fold.

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

Consequence, and it is the operative half: **cleanup with no visible output never becomes a phase.** The 503 `admin-layout.css` classes emitted by neither app (26% of the file, a reachability-deletion lead) ride inside a delivering phase or they do not happen. Same for the `body` rule and the residual overlap in D6.

### D3: Shell first, reconcile second. Invert USF's order. (locks)

Merging the documents is what makes the cascade collisions **visible on screen**. Reconciling 118 rules before the merge means reasoning about a cascade that does not exist yet, which is precisely the position that made a parity harness feel necessary in USF.

This is the same trade already accepted for the residual suite/components divergences: resolve where the breakage is visible, in a browser, in both themes.

Rejected: CSS-first. It is the ordering that feels safer and is not. It defers the only phase that delivers the done-condition, and it re-creates the need for an instrument to tell you what a browser would have told you.

### D4: The admin graph is code-split behind the role gate and never fetched for a player. (locks)

`applyRoleRestrictions()` (`app.js:1483`) already knows the role and is already idempotent. Admin modules load through dynamic `import()` at the point of use, gated on `getRole()`, **not** `effectiveRole()` (see D7).

- A player session must never fetch a module from `public/js/admin/`. This is a network-panel check, not an assertion in code, and it is the acceptance criterion for every phase that moves a surface across.
- `downtime-views.js` (604 KB) and `downtime-story.js` (205 KB) are moved **last** within P1. They are 67% of the weight and they sit on the D7 write path, so they carry both risks at once and should land when the pattern is proven rather than while it is being established.

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

### D6: The residual suite/components overlap is state, not a backlog. (locks)

The overlap stands at **48** on `dev` (163 at USF Phase 1 open, 110 removed by the Tier 0 batch delete, 5 more by the dt-hist family pass in #1063). Verified by `css-overlap.py --count` at `9953e2e6`.

Those 48 are **not** a workstream, are **not** a prerequisite for this epic, and must not be carried into ADR-008 as a residual. Whatever subset the merge actually needs gets resolved inside P2, in context, where the breakage is visible. Recording them as a backlog would be the D2 trap wearing a different hat.

`css-overlap.py --count` is retained as a cheap one-number regression check so the figure cannot silently grow. Everything else under `specs/qa/harness/` from the USF parity work is unused; it is left in place in case the merge wants it back, and it is not maintained.

**The six ADR-007 D13 renderer name-collisions** (`.attr-cell`, `.attr-name`, `.skill-row`, `.skill-name`, `.skill-spec`, `.skills-3col`) keep their carve-out and their third resolution class: where a collision is real and both components must coexist, the resolution is **rename**, never reconcile. That rule now applies to the whole P2 collision set, not only to those six.

### D7: Invariants carried from ADR-007. (locks)

Three, stated before any code is written rather than discovered in review.

1. **ADR-007 D7's frozen write-path inventory is untouched by P1.** The shell merge is markup and module loading; it does not reshape `buildSaveBody(c)` or any `PUT`/`POST`/`DELETE` site in the inventory. **Any P1 diff that adds, removes or reshapes an inventory entry is the D7 red-flag escalation to Architect**, regardless of how small the diff looks. This matters most when `downtime-views.js` and `downtime-story.js` move, per D4.

2. **ADR-007 D3 becomes load-bearing in a way it has not been until now.** Once the ST editor and the player view live in one document, `effectiveRole()` gating a fetch stops being a subtle bug and becomes a way to show an ST partial data in the application they administer with. Reads, writes and module loading select on `getRole()`. Visibility selects on `effectiveRole()`. **Every new `effectiveRole()` call site in this epic is a review stop.** This is the invariant most likely to bite in P1.

3. **ADR-007 D9 is superseded, not deleted.** Its deferral was correct on reason 2 and wrong on reason 1, and the deferral bought the shared-module consolidation that makes P1 cheap now. The record of a decision that was right for one of its stated reasons and wrong for another is more useful than its removal.

ADR-004's cache-entry invariant and ADR-006's render-path orchestrator discipline are unchanged and unaffected. No phase of this epic may add a second `applyStMods` composition site.

### D8: An entity count may size the work. It may never size the obstacle. (locks)

The obstacle is what a reachability measurement returns.

For CSS specifically, the test is per rule — *could this selector match an element the other surface emits?* — and **not** *do these two files share selector keys*. The two questions differed by twentyfold in D9's case and by the entire work plan in Rev 1's.

Two operating rules follow:

- **Enumerate, do not count.** A reachability measurement returns a list. That list is a reviewable checklist, which is worth more than the number ever was. `specs/qa/harness/admin-collision-map.py` is checked in with this ADR and emits the P2 list.
- **State the method limit in the instrument, not in the message.** Class extraction over `class="..."` / `className=` / `classList.*` literals misses names assembled by string concatenation, so 55, 62 and ~118 are **floors, not ceilings**, and the measurement establishes match-possibility rather than cascade outcome (load order and specificity are not modelled). This caveat lives in the script's docstring because `css-overlap.py`'s docstring caveat is exactly what let QA catch the byte-identity trap on Tier 0. A caveat that lives only in a message does not survive the next reader.

- **Reachability is checked at story-drafting time as a matter of course, not when someone thinks to ask.** Added at Rev 2, after the pattern recurred a third time inside this ADR: D5 originally cited a static import and a call site as evidence that a surface was live, which is the same non-evidence the two ADR-007 instances rested on. Every USF-family surface examined so far has been present-and-wired and unreachable — `player.html`, the 193 suite/player duplications, and now `tabs/tickets-tab.js`. Three for three is not carelessness by any one author; it is a property of a codebase that has been accreting entry points faster than it retires them.

  The check is cheap and it is specific. **An import is not a reference; a call inside a dispatcher is not a route.** For any surface a story proposes to move, merge, restyle or delete, establish the *entry path* before the work is scoped: which nav array, grid entry or hardcoded call actually reaches it, and does any router exist. If the answer is none, the story is a deletion story and should be re-scoped as one before it is drafted, per `feedback_reachability_before_retire`.

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

**The mechanism.** Extract the surface's rules from `admin-layout.css` into a private per-surface sheet (`public/css/admin-tickets.css` for the pilot), and have the surface's own dynamic-`import()` load path inject the `<link>`, idempotently. Rejected alternatives: linking `admin-layout.css` from `index.html` (it is a full layout sheet, would collide broadly with `layout.css` and `suite.css`, and destroys the pilot's zero-collision property at the moment of the merge); and shipping Stage B unstyled (breaks D2 in the exact way D2 exists to prevent — Peter opens it and sees a broken surface, learning that the phase failed when only its styling was unresolved; a false red is as damaging as a false green).

Static links from `index.html` were also rejected in favour of injection: they would ship ST CSS to every player. That does not breach D4's module-fetch criterion, but it breaches its intent. **Zero ST presentation reaches a player, not merely zero ST JavaScript.**

**The precondition, and the one place it fails.** Scope separation is sound only where the two surfaces cannot co-render. This codebase has exactly one violation: the `_viewMode` ST-preview toggle (`app.js:1777-1779`). An ST who opens an admin surface, injecting its sheet, and then toggles to player preview would keep admin rules applied to player markup. It is moot for Tickets (the player copy is dead, per D5a) and live for the other fifteen.

Therefore the injected sheet is **gated in both directions, and the two gates are different**, which is ADR-007 D3 applied to presentation:

- **Injection gates on `getRole()`** — authority. Should this session ever load this sheet?
- **Application gates on `effectiveRole()`** — presentation. Should it apply right now? Enforced by toggling `link.disabled` inside `applyRoleRestrictions()`, which is already idempotent and already runs on boot, on view toggle and on role-affecting state changes.

That D3's read/write-versus-visibility split lands cleanly on fetch-versus-apply is a check on the design rather than a coincidence. Retracting by `disabled` rather than removing the element avoids a refetch on every toggle.

**Consequence for P2, which is the larger half of this decision.** P2 was framed as sixteen collision negotiations. For role-exclusive surfaces it becomes sixteen mechanical extractions, and the independent-co-authoring problem largely dissolves because each surface's rules live in a namespace that only loads with it. Reconciliation and rename remain for whatever genuinely coexists after the merge; that set is expected to be small, and it must be **measured per surface rather than assumed** (D8 rule 4).

Do not pre-emptively design for sixteen sheets. Land one, for Tickets. If surfaces two through four show the extraction is mechanical, the pattern is proven; if they do not, that is learned at a cost of three surfaces. With no build step, a stylesheet that never loads costs nothing, and whether the files are later concatenated is a packaging decision, not an architectural one.

`admin.html` static-links the extracted sheet while it still exists; `index.html` injects it. The asymmetry is transitional and ends at P3 when `admin.html` is retired.

**Mechanism or scaffolding under D2.** The injection helper is **mechanism**. Khepri's proposed line — a helper called from within a surface's own load path is mechanism, one landed as its own story is scaffolding — reaches the right answer, and the criterion underneath it is D2 itself: *does the story that lands the helper also deliver something openable?* The helper arriving inside the Tickets slice, used by Tickets, ships with a working surface. The same helper landed as "add CSS injection infrastructure", with no surface attached, is the trap. Judge the story, not the file.

## Phase sequencing

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
