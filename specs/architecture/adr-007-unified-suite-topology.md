---
id: ADR-007
title: 'Unified suite topology: one role-gated player-facing entry, shared component lib, deferred admin merge'
status: approved
date: 2026-07-28
author: Imhotep (Architect)
revision: 2
supersedes: null
related:
  - issue #1047 (Epic USF, this ADR gates the shard breakdown)
  - issue #817 (dead name-keyed trackers, closed into USF)
  - issue #991 (player.html retirement + sheet renderer consolidation, closed into USF)
  - issues #982 #983 #984 #985 #990 (GDX frontend sub-tasks folded into USF)
  - specs/architecture/adr-004-st-mods-overlay.md (Rev 4, single applyStMods composition site + cache-entry invariant, must survive)
  - specs/architecture/adr-006-defence-penalty-readpath.md (render-path orchestrator discipline)
  - specs/architecture/coding-standards.md (CSS Standards, normalised CSS mandate)
  - public/index.html (the unified entry)
  - public/js/app.js:150-152 (effectiveRole), :1483-1524 (applyRoleRestrictions), :346-353 + :1870-1877 (stOnly/playerOnly nav metadata)
  - public/player.html:24-35 (redirect stub, shipped in 9018108f)
  - public/js/suite/sheet.js:32 (read-only wrapper importing five section renderers from editor/sheet.js)
  - public/js/suite/tracker.js (toast helper, name-keyed persistence removed wholesale in #836)
  - memory: feedback_canonical_first_state_pattern, feedback_reachability_before_retire, project_netlify_dev_no_deploy
---

# ADR-007: Unified suite topology

## Revision history

| Rev | Date | Change | Author |
|---|---|---|---|
| 1 | 2026-07-28 | Initial. Records the end-state topology and, more importantly, corrects three stale premises in the #1047 epic body: the role-gated single app has already shipped, the 193 suite/player CSS duplications are dead-file duplications rather than live divergence, and the tracker unification completed in #836. Locks D1 to D9. Re-sequences the shard plan accordingly. | Imhotep (Architect) |
| 2 | 2026-07-28 | Phase 1 addendum, requested by Khepri (SM) after Phase 0 shipped (main `8d56ef39`). Adds D10 to D15. Classifies the suite/components overlap by declaration equality and by admin reachability, which answers the operational questions D5 left open. Two findings reshape Phase 1: the overlap is 110 mechanical plus 53 decisions, with family size anti-correlated to risk; and 51 of 53 divergences are not reachable from the admin surface, which falsifies the cross-surface masking hypothesis for all but two rules and inverts the default resolution direction. Also carves the renderer name-collisions out of Phase 1 into Phase 2 (D13), and upgrades the parity gate from DOM structure to computed style (D15), because the Tier 0 safety argument is not airtight. | Imhotep (Architect) |

## Context

Epic USF (#1047) proposes merging three frontends into one role-gated player-facing suite, with a six-shard plan led by a CSS-duplication inventory. A survey of the working tree on 2026-07-28 shows the codebase is further along than the epic body records, and that the largest measured duplication figure points at a file that no live document loads.

### What is actually deployed

`public/player.html` is a redirect stub. Its `<head>` runs `window.location.replace('/')` before the body parses, preserving OAuth callback params. The redirect shipped in `9018108f` (`feat(unified-nav): nav-1-1`) and is present on `main`. Consequently:

- `public/js/player.js` (24KB) never executes. Nothing else imports it.
- `public/css/player-layout.css` (59KB) is linked only from that stub, so it is never applied to a rendered document.

`public/index.html` is already the unified role-gated app. It carries the ST surfaces (character grid `t-chars`, editor tabs `t-editor` / `t-edit`, sign-in, finance, contested roll) and the player surfaces (downtime, feeding, ordeals, story, primer, archive, city, status) in one document. `public/js/app.js` implements the gate:

- `getRole()` returns the authenticated role. `effectiveRole()` (app.js:150) overlays a `_viewMode` so an ST can preview the player view.
- `applyRoleRestrictions()` (app.js:1483) is idempotent and re-applied on boot, on view toggle, and on role-affecting state changes.
- Nav and app-grid entries carry declarative `stOnly` / `playerOnly` flags (app.js:353, app.js:1875-1877) rather than inline conditionals at each render site.
- The character fetch is role-filtered server-side (app.js:605-620), with `getRole()` (not `effectiveRole()`) selecting the request shape.

The tracker split is also resolved. `public/js/suite/tracker.js` had its entire name-keyed persistence surface removed in #836; the file now exports a single `toast` helper and a header comment explaining the history. `public/js/game/tracker.js` is the sole tracker, `_id`-keyed and MongoDB-persisted, imported by app.js, admin.js, feeding-tab.js, suite/sheet.js and tracker-feed.js.

The sheet renderers are already a shared core with a role wrapper, not two implementations. `public/js/editor/sheet.js` owns the section renderers (`shRenderAttributes`, `shRenderSkills`, `shRenderDisciplines`, `shRenderInfluenceMerits`, `shRenderDomainMerits`, `shRenderStandingMerits`, `shRenderGeneralMerits`, `shRenderManoeuvres`, `shRenderEquipment`), each taking an `editMode` argument. `public/js/suite/sheet.js:32` imports five of them for its read-only single-column layout and re-implements three (attributes, skills, disciplines) with local ST-mod option helpers. `app.js` holds both entry points and dispatches by tab and role.

### What the duplication numbers mean once reachability is applied

Re-measuring selector sets on 2026-07-28 (crude single-line selector extraction, so figures differ by a few percent from the epic's rule-body count):

| Pair | Overlapping selectors | Both loaded in one document? |
|---|---|---|
| suite.css / player-layout.css | 199 | **No.** player-layout.css is never applied. |
| suite.css / components.css | 166 | **Yes.** index.html loads both; suite.css wins on cascade order. |
| admin-layout.css / components.css | ~4 | Yes, but admin barely uses the lib at all. |
| admin-layout.css / suite.css | 27 | No, separate documents. |

The epic identifies suite/player as the primary vector. On reachability, it is the opposite: it is the only pair with **zero** live cascade risk. Its cost is real but it is a maintenance cost, not a rendering one, and #1044 is the proof. That bug was fixed by editing both stylesheets (`7b0fe390`, "both stylesheets"), meaning engineering effort was spent on a file that no browser loads. Deleting the dead player path retires all 199 in a single reachability-driven change rather than nine per-family promotion shards.

The genuine live hazard is suite.css re-defining 166 selectors that components.css already provides, in the same document, silently overriding the design system. That is where the promotion work belongs.

`admin-layout.css` carries roughly 2,472 selectors with near-zero overlap against the component library. Admin is not merely a separate entry point; it does not consume the design system. This is the dominant fact in the admin sequencing decision.

### Constraints carried in

- **Two sacrosanct foundations** (2026-07-25 meeting): character sheets must never be lost; downtime submissions must always be captured. Consolidation must be additive with parity, never a destructive rewrite.
- **ADR-004 Rev 4**: one `applyStMods` composition site; every in-memory `chars[]` entry overlaid once at boot via `applyOverlayToAll`; the `tm_chars_db` localStorage cache stays base-only via `charsForSave`; the editor strips the overlay on edit-mode entry.
- **CLAUDE.md**: normalised CSS is mandatory (theme.css tokens, components.css classes, no bare hex, no `rgba()`, no inline `style=`); new reference data is MongoDB-backed.
- No build step, no router, no framework. Modules are loaded natively; `index.html` registers a service worker.

## Decisions

### D1: USF warrants this ADR, and its subject is the anti-refragmentation contract, not the merge. (locks)

The topology change the epic set out to authorise has already shipped. Writing an ADR to approve it retrospectively would be bookkeeping. What is not written down anywhere, and what allowed the fragmentation to accumulate in the first place, is the set of rules that keep a single entry point from re-growing a second one. That is this ADR's subject.

Consequence: the ADR gates the shard breakdown by re-scoping it, not by blessing it. Shards 4 and 5 of the epic's proposed plan are already complete and must be closed as such rather than implemented.

### D2: One HTML entry, boot-time role detection, idempotent presentation gate. No router. (locks)

`public/index.html` is the sole player-facing entry point. Role gating is expressed as:

1. **One resolver pair.** `getRole()` is the authenticated role. `effectiveRole()` is the presentation role, equal to `getRole()` except when a real ST has toggled into player preview.
2. **One application function.** `applyRoleRestrictions()` is the only function that translates role into UI visibility. It must remain idempotent, because it is called on boot, on view toggle, and after role-affecting state changes.
3. **Declarative capability flags.** Nav items, app-grid tiles and tabs declare `stOnly` / `playerOnly` in their metadata. Filtering happens in one place.

**Prohibited**: an inline `if (role === 'st')` at a render site that is not routed through `applyRoleRestrictions()` or a declarative flag. This is the same discipline ADR-004 applies to `applyStMods` and ADR-006 to the render-path orchestrator: one composition site, so that adding a consumer cannot silently desynchronise the others.

Routing was rejected. There is no router, no build step and no server-side rendering to hang routes off; a route-based gate would need a second mechanism for the ST-to-player view toggle, which is a state change within a page rather than a navigation. Separate bundles with shared modules was rejected for the same reason it was rejected for the tracker: two artefacts that must be kept in step will drift.

### D3: `effectiveRole()` is presentation only. Authority reads `getRole()`. The server is the enforcement point. (locks)

`effectiveRole()` must never gate a data fetch, a write, or a permission decision. When an ST previews the player view, they remain an ST; the API must not be asked to behave as though they were not.

- **Reads and writes** select on `getRole()`. app.js:605-620 (role-filtered character fetch) and app.js:1500 (`isRealST` for the ST Admin link) are the correct pattern.
- **Visibility** selects on `effectiveRole()`.
- **Neither is a security boundary.** Client-side role gating is a usability affordance. Every ST-only route stays enforced server-side, as `tracker_state` already is.

The failure this rule prevents is subtle and expensive: a preview toggle that also narrows a fetch produces an ST who silently sees partial data and cannot tell why.

### D4: Section renderers live in one module and take `editMode`. Wrappers own layout and ordering only. (locks)

`public/js/editor/sheet.js` is the canonical home for section renderers. Role wrappers (`public/js/suite/sheet.js` today) compose those renderers into a layout. A wrapper may choose which sections to render, in what order, and inside what container. A wrapper may not re-implement a section the core already renders.

The three sections `suite/sheet.js` still re-implements (attributes, skills, disciplines, with local `_stmAttrOpts` / `_stmSkillOpts`) are the convergence target. They converge onto `shRenderAttributes` / `shRenderSkills` / `shRenderDisciplines` with a layout argument, not by adding a fourth parameter permutation per call site.

Rejected: merging into a single `renderSheet` with a mode switch. The two layouts differ in structure (multi-column editable grid versus single-column read-only), not just in field visibility, and a single function would accumulate branch density at exactly the place where a bug loses a character sheet.

Deferred as cosmetic: the `public/js/suite/` versus `public/js/game/` directory naming. These are not parallel implementations. `suite/` holds sheet, roll, status and territory renderers; `game/` holds tracker, combat, finance, sign-in and rules. The names are poor, the contents do not overlap, and a rename churns import paths across the tree for no behavioural gain. Do not spend a shard on it.

### D5: Promote to `components.css` when a rule describes a component. Keep in the app sheet only what describes that entry's shell. (locks)

The promotion test: **would you want a second copy of this rule if it appeared in another app?** If no, it belongs in the lib.

- **`components.css`** holds any named, reusable visual unit with its own class family, used by two or more entry points, or by two or more tabs within one entry point.
- **App sheets** (`suite.css`, `admin-layout.css`) hold only shell layout: header, sidebar, bottom nav, tab scaffolding, and the breakpoints that reflow that shell.
- **`theme.css`** holds tokens only. Unchanged.

Two corollaries:

1. **Never keep both copies.** For each of the 166 selectors overlapping between suite.css and components.css, the resolution is either "the lib is right, delete the suite copy" or "the lib is wrong, fix the lib, delete the suite copy". A shard that leaves a duplicate in place has not done the work.
2. **An app sheet may not use `!important` to defeat the lib.** If it needs to, the lib rule is under-parameterised; add a modifier class to the lib instead. An `!important` in an app sheet is a promotion bug, and reviewers should treat it as one.

### D6: `game/tracker.js` is the sole tracker. Confirmed, and already true. (locks)

No migration remains. The residual actions are hygiene, not architecture:

- Rename `public/js/suite/tracker.js` to a name that reflects its single `toast` export. The current name is a landmine for exactly the reason the epic tripped on it: a reader greps `tracker.js`, finds two files, and infers a split that no longer exists.
- Correct CLAUDE.md's "Two client tracker implementations exist and are fragmented" line, which is now false and is being read as a live constraint.

The one live coupling to preserve: `suite/sheet.js:348` still migrates legacy name-keyed localStorage values forward into the canonical `_id`-keyed store on first render. That block was deliberately kept for one release cycle. Do not remove it as part of USF without a separate decision on how long user devices may hold stale caches.

### D7: The sacrosanct foundations are persistence properties. Classify shards by whether they touch a write path. (locks)

Character sheets and downtime submissions are lost by changes to write paths, not by changes to stylesheets or renderers. A parity harness that treats every shard identically spends its budget in the wrong place and, worse, trains reviewers to sign off on a green harness that was never sensitive to the risk.

Every USF shard is classified at authoring time as **write-path-touching** or not.

**The write paths, frozen:**

- Characters: `buildSaveBody(c)` into `PUT /api/characters/:id` (admin.js:1001, :1020, :1226), `POST /api/characters` (admin.js:945), `DELETE /api/characters/:id` (admin.js:836).
- Downtime: `POST /api/downtime_submissions` (downtime-form.js:1166), and the `PUT /api/downtime_submissions/:id` family in feeding-tab.js and story-tab.js.

This inventory is checked in as part of shard 1. **Any USF pull request that adds, removes or reshapes an entry in it is a red-flag review**, escalated to Architect regardless of how small the diff looks.

**Verification, matched to risk:**

- **Non-write-path shards (CSS promotion, renderer convergence)**: DOM parity. Capture the rendered HTML of the sheet and of each affected family for a fixed fixture character, before and after, and diff. A DOM diff is cheaper than a screenshot diff, deterministic, and it catches the actual failure mode of a CSS promotion, which is a dropped class name rather than a shifted pixel.
- **Write-path-touching shards**: DOM parity plus a round-trip smoke. Submit, reload, and assert every response key survives. This matches the canonical-first convention already load-bearing in the DT form: state is written to `responseDoc.responses` first, then mirrored to the DOM.
- **Both**: the ADR-004 cache-entry invariant is re-asserted. `applyOverlayToAll` runs exactly once at boot, and `charsForSave` strips the overlay before the localStorage stash. Any consolidation that touches the boot path or the stash path states explicitly which of those two lines it preserves.

### D8: Retire in two steps. Dereference, then delete. (locks)

No USF shard deletes a file in the same pull request that removes its last reference. The dereferencing pull request lands first and is deployed; the deletion follows in a separate one. This is what "additive with parity, not destructive rewrite" means operationally, and it gives a one-deploy window in which a revert is a revert rather than a restore.

It also forces the check that memory records as `feedback_reachability_before_retire`: establish that nothing reaches the module before planning a migration, because in this codebase the migration repeatedly collapses into a deletion.

### D9: Admin stays a separate entry until its CSS is normalised. Not part of USF. (locks)

Defer the merge. Three reasons:

1. `admin-layout.css` is ~2,472 selectors with near-zero overlap against `components.css`. Merging admin into `index.html` today imports 300KB of un-normalised CSS into the player-facing document, where it would compete with the lib in the same cascade. That is the exact failure D5 exists to prevent, at ten times the scale of the 166 selectors already in scope.
2. The ST editor is the highest-consequence write path in the application. Putting it into the same document and the same cascade as the player sheet, during the epic that is churning that cascade, inverts the risk ordering the sacrosanct foundations demand.
3. **The expensive half of the admin merge has already happened.** `editor/sheet.js`, `editor/`, `tabs/` and `data/` are shared between `admin.js` and `app.js` today. What remains separate is the shell, which is the cheap half. There is no compounding-cost argument for doing it now.

Admin CSS normalisation against the lib is a **separate epic**, and it is the prerequisite for any future merge, not a stretch goal inside USF. USF should not open admin files at all beyond the one link repoint in D-seq Phase 0.

---

# Rev 2 addendum: Phase 1 direction

D5 gives the promotion rule. These decisions answer the operational questions it does not: how to shard the work, which copy wins, what the blast radius of a lib edit actually is, and what the parity gate has to measure.

## Phase 1 measurement

Classifying the suite.css / components.css overlap by *declaration equality* rather than by selector presence (script: normalise whitespace and declaration order per rule, compare the last winning block for each selector-plus-media key):

| | Count |
|---|---|
| Overlapping selector+media keys | 163 |
| **Identical declarations** (deleting the suite copy changes no computed value, subject to D15) | **110** |
| **Divergent declarations** (deleting the suite copy changes index rendering) | **53** |

Divergences by kind:

| Kind | Count | Character |
|---|---|---|
| A: token drift only | 8 | Same structure, different `var(--token)`. One file was migrated, the other was not. |
| B: superset or subset | 7 | No conflicting property; one copy simply declares more. |
| C: value conflict, same properties | 5 | Genuine per-value decisions. |
| D: structural | 33 | Properties *and* values differ. Frequently not the same component at all. |

**Family size is anti-correlated with risk.** `feeding` is the largest family (66 overlaps) and is 61 identical to 5 divergent, i.e. almost entirely mechanical. `proj` is a small family and is 1 identical to 18 divergent, i.e. almost entirely decisions. Sharding by family therefore puts a 61-item batch-delete and an 18-item design negotiation under the same review discipline, which is the wrong grouping in both directions.

**Admin reachability.** Intersecting the overlapping selectors' class names against every class literal emitted by `admin.js` and `public/js/admin/*`:

| | Reachable from admin |
|---|---|
| Divergent (53) | **2** (`.feeding-flow-step.done` and its `.feeding-flow-num` child, both kind A) |
| Identical (110) | **0** |

The structural reason is that `admin.js` imports **zero** modules from `public/js/tabs/`, whereas `app.js` imports twelve. Admin has its own downtime and story renderers under `public/js/admin/`, emitting its own prefixed families (`dt-story-proj-*`, not `story-proj-*`). Spot checks confirm it: `.proj-card-name`, `.proj-card-header`, `.story-proj-chip`, `.story-proj-lbl` appear zero times in admin sources.

*Method limit, stated so it is not over-trusted:* this is a static grep over `class="..."` literals. Class names assembled by string concatenation would be missed. Treat a negative as "no static evidence of admin use", not as proof of absence. D12 sets the hedge.

### What the reachability result means

Khepri's hypothesis was that suite.css overrides might be masking a divergence that admin users already see rendered differently. That is true for exactly **2 of 163** rules, both of them the easiest kind (token drift). For the other 161, components.css holds rules that **no admin surface renders**. The lib copy is not a second live consumer to be protected; for these selectors it is unexercised code.

This inverts the naive reading of D5 corollary 1. See D11.

## Decisions

### D10: Shard Phase 1 by divergence tier, not by family or by size. (locks)

| Tier | Contents | Shape | Review gate |
|---|---|---|---|
| **0** | The 110 identical | **One shard**, batch delete from suite.css | Machine-checkable (declaration sets equal), plus D15 parity |
| **1** | The 8 token-drift | One shard | Token-audit judgement, not layout judgement |
| **2** | The 7 superset/subset plus 5 value-conflict | One shard, or two if review load demands | Per-rule judgement, no structural risk |
| **3** | The 33 structural, **minus the D13 carve-out** | Shard by family: `proj`, `story`, `dt-hist` | Genuine design decisions, one reviewer pass each |

Tier 0 is deliberately the largest shard and deliberately first. See D14.

Rejected: size caps. A size cap on Tier 0 splits a provably mechanical batch into arbitrary halves, adding review passes that cannot find anything. A size cap is a proxy for risk, and here risk is directly measurable, so use the measurement.

### D11: For selectors with no admin surface, the default resolution is promote the suite body into the lib and delete the suite copy. (locks)

D5 corollary 1 says the resolution is either "the lib is right, delete the suite copy" or "the lib is wrong, fix the lib, delete the suite copy". It did not say which is the default. The reachability measurement settles it:

For the 161 selectors not rendered on any admin surface, **the suite body is the one that has been in front of users and the one that bug fixes have landed against** (`#1044` is the worked example). The lib body for those selectors has been rendering nowhere. Presumptively correct copy is therefore the suite copy, and the merge direction is suite into lib.

Exceptions, both of which must be argued in the story rather than assumed:

- **Tier 1 token drift**: the token-correct body wins regardless of which file it is in. Drift means one file was migrated and the other was not; the destination is whichever token the theme layer actually intends.
- **Any admin-reachable selector** (currently 2): no default. Both surfaces are live, so it is a genuine reconciliation, and D12 applies.

The invariant that does not bend: **exactly one copy survives.** A shard that leaves both is not done, and a shard that deletes both is a regression.

### D12: Blast radius is set by admin reachability, and reachability is measured per shard, not asserted. (locks)

Khepri's Q1 asked for a safety policy on lib edits, since components.css is consumed by index and admin. The policy is tiered by the measurement:

- **Selector not admin-reachable.** The lib edit is index-only in effect. Normal review. Index-surface parity only (D15). This covers 161 of 163.
- **Selector admin-reachable.** Admin-surface parity capture required in addition to index, and the shard is an **Architect escalation** before merge. This covers 2, and any further ones the per-shard measurement surfaces.
- **Hedge against the static-grep limit.** Where a selector is not individually reachable but its *family prefix* appears anywhere in admin sources, capture admin parity anyway. It costs one extra capture and it covers the concatenated-class-name blind spot the method admits to.

The reachability classifier runs **as part of each shard**, against the tree as it stands. It is not a one-off number quoted from this ADR. Admin is under change from other epics; a stale reachability claim is exactly the kind of premise that produced the Rev 1 corrections.

### D13: Renderer name-collisions are Phase 2 work. Carve them out of Phase 1. (locks)

Six selectors in the Tier 3 structural set are not duplicated components. They are **two different components sharing a name**:

`.attr-cell`, `.attr-name`, `.skill-row`, `.skill-name`, `.skill-spec`, `.skills-3col`

Each is emitted by **both** `public/js/suite/sheet.js` and `public/js/editor/sheet.js`, styled as a column layout in suite.css and as a row layout in components.css. That is precisely the read-only wrapper versus canonical section renderer pair that **D4 and Phase 2 exist to converge**, and precisely the three sections (attributes, skills, disciplines) Phase 2 names as its target.

Choosing a CSS body for these in Phase 1 pre-commits the Phase 2 decision about which layout survives, and the work would be redone once the renderers converge. Defer all six to Phase 2, where the renderer decision drives the stylesheet decision rather than the reverse.

**Third resolution class, which D5 corollary 1 does not name:** where a collision is real and both components must coexist beyond Phase 2, the resolution is **rename** (give the wrapper's variant its own name or a modifier class), never reconcile. Forcing one rule to serve two components is how the collision formed.

`.tab-split-left` stays in Phase 1: it is emitted only by `tabs/feeding-tab.js`, so it is an ordinary divergence, not a collision.

### D14: Pilot with Tier 0, not with a small family. (locks)

Khepri's instinct was to pilot on a small self-contained family (`fvt` at 9, `regency` at 3) to keep blast radius low. Take Tier 0 instead, despite it being the largest shard by count.

The pilot's job is to validate the apparatus, not to be small. Tier 0 has **zero judgement calls in it**, so it exercises the classifier, the parity capture, and the monotonic-overlap gate (D15) with nothing else varying. If parity fails on a set of byte-identical declaration deletions, the finding is that **the harness is wrong**, and that must be learned before any shard where a parity failure is ambiguous between "harness wrong" and "judgement wrong".

Piloting on `regency` learns nothing extra in any case: all 3 of its overlaps are identical, so it is a strict subset of Tier 0.

### D15: The Phase 1 parity gate is computed style, not DOM structure. Plus a monotonic-overlap check. (locks)

**The Tier 0 safety argument is not airtight, and the gate must reflect that.** "Identical declarations, therefore deleting the later copy is a no-op" fails in one case: if a rule of equal specificity sits *between* the two copies in cascade order and sets the same property on a co-occurring class. Concretely, with components.css loading before suite.css:

```
components.css   .a { color: red }
suite.css        .b { color: blue }
suite.css        .a { color: red }     <-- deleting this
```

An element matching both `.a` and `.b` currently resolves to red (suite's `.a` is last). Delete suite's `.a` and it resolves to blue, because the surviving `.a` in components.css now loses to `.b`. The DOM is unchanged; the computed value is not.

Consequences for the harness:

1. **Capture computed styles, not just rendered HTML.** Phase 0's DOM-structure capture was sufficient for a dead-path deletion. It is not sufficient for Phase 1, where the failure mode is an identical DOM with a changed computed value. For each captured surface, snapshot `getComputedStyle` for the elements carrying the affected classes.
2. **DOM structure capture stays** on top of that, because the failure mode of a *promotion* is still a dropped class name.
3. **Confirmed, Khepri's Q3 approach**: wire the local API (`cd server && npm run dev`) so the feeding, proj, dt and story tabs render fully. A partial render silently passes parity on elements that never mounted, which is the worst possible harness failure because it looks green.
4. **Capture index on every shard. Capture admin only where D12 says it matters.** An admin capture on the 161 non-reachable selectors is a constant baseline that proves nothing and trains reviewers to ignore it.
5. **Monotonic-overlap gate.** Check the classifier into the harness directory and run it after every Phase 1 shard, asserting the overlap count **decreased by exactly the shard's size and never increased**. This makes D5 corollary 1a ("never keep both copies") a machine check rather than a reviewer's diligence, and it is the standing regression guard against re-fragmentation for the remainder of the epic.

### Answer to Q4: absorb #985 per family as touched, but scan first. (locks)

Fold the CSS-standards cleanup into each shard as it opens a file. A final sweep would re-open every file Phase 1 has just closed and invalidate the parity captures taken against them.

One refinement: run the **#985 violation scan first**, once, to produce the list of bare hex, `rgba()` and inline-style violations. Then each shard clears the violations in the rules it **keeps** and ignores violations in the rules it **deletes**. Without the up-front scan, shards spend effort normalising declarations that are about to be removed.

## Rev 2 consequences

**Positive.** Phase 1's real shape is 110 mechanical deletions plus 53 decisions, of which 6 defer to Phase 2 and 2 need cross-surface care. That is a materially smaller and better-ordered body of work than "180 defs across 8 families". The monotonic-overlap gate outlives the epic.

**Negative.** D11's default (suite body wins) promotes bodies into the lib that were authored against one surface only. Where such a rule is later consumed by a second surface, it may prove under-parameterised. Accepted: the alternative is promoting an unexercised body, which is worse, and D5's modifier-class rule is the escape hatch.

**Watch.** D13's carve-out means Phase 2 inherits a CSS decision as well as a renderer decision. If Phase 2 slips, those six selectors stay duplicated, and the monotonic-overlap gate will show Phase 1 closing at 6 rather than 0. That residual is expected and must not be "fixed" by resolving them in Phase 1.

## Consequences

**Positive.** The anti-refragmentation rules (D2, D3, D4, D5) are reviewable as written and apply to every future feature epic, which is the durable output. The re-sequencing (below) retires 199 duplications through a reachability deletion rather than nine promotion shards, and redirects that effort at the 166 that are actually affecting rendering. D7 stops the parity harness from becoming ceremony.

**Negative.** D9 leaves the largest single body of un-normalised CSS untouched, and the admin normalisation epic it defers to is larger than all of USF. Accepted: doing it inside USF trades a bounded risk for an unbounded one.

**Neutral.** D4 leaves two sheet entry points in place indefinitely. This is deliberate. The cost of two thin wrappers over one shared core is low and visible; the cost of one function with an accumulating mode switch is high and invisible until it loses a sheet.

**Watch.** The `_viewMode` preview toggle is the most likely place for a D3 violation to appear, because it is the one path where the two role resolvers legitimately disagree. Any new call to `effectiveRole()` in a fetch or a write is a review stop.

## Shard sequencing

This replaces the six-shard plan in the #1047 body.

**Phase 0: correct the map.** Zero behavioural risk, retires 199 duplications and removes ~85KB of dead source.

- Repoint the two remaining links at the player stub: `admin.js:659` (`href="player.html"`) and the `dev-login.html` option.
- Dereference, then delete (D8): `public/js/player.js`, `public/css/player-layout.css`, `public/player.html`, and the `/player` entry in `netlify.toml`.
- Rename `public/js/suite/tracker.js` to reflect its `toast` export (D6).
- Correct the stale tracker claim in CLAUDE.md (D6).
- Freeze the write-path inventory (D7).

Phase 0 is not write-path-touching. DOM parity on the sheet is sufficient.

**Phase 1: reclaim the live cascade.** The selectors overlapping between suite.css and components.css, resolved per D5 with no duplicates left behind. Absorb #985 (CSS standards cleanup) here rather than running it separately; it is the same files under the same discipline. *Superseded in detail by the Rev 2 addendum: shard by divergence tier not family (D10), 163 overlaps split 110 mechanical / 53 decisions, six selectors carve out to Phase 2 (D13), parity gate is computed style plus a monotonic-overlap check (D15).*

**Phase 2: converge the three re-implemented sheet sections** (attributes, skills, disciplines) from `suite/sheet.js` onto the `editor/sheet.js` renderers, per D4. Not write-path-touching, but it is the highest-consequence rendering change in the epic; DOM parity is mandatory and the ADR-004 overlay assertions apply.

**Phase 3: GDX layout work** (#982 pinch-zoom viewport, #983 rem type scale and phone breakpoint, #984 touch targets, #990 single-scroll phone sheet). Sequenced after Phase 1 deliberately: these are viewport, type-scale and target-size changes across the same rule bodies Phase 1 is deleting or promoting. Running them first means doing the work twice, or doing it into rules that are about to be removed.

**Phase 4: admin CSS normalisation.** Separate epic, per D9. Not USF.

## Open items for Peter

Not blocking the shard breakdown, but surfaced by the survey and needing an owner:

- `public/_redirects` on `main` routes `/` and `/player.html` to `/maintenance.html` with a 302. The live site currently serves the app at `/` with a 200, so the file appears not to be in effect on the deployed build. Either it is stale and should be deleted, or it is live-but-bypassed and the deploy is not reflecting `main`. Worth resolving before USF starts changing entry points, because it is exactly the class of drift `project_netlify_dev_no_deploy` records.
