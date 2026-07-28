---
id: ADR-007
title: 'Unified suite topology: one role-gated player-facing entry, shared component lib, deferred admin merge'
status: approved
date: 2026-07-28
author: Imhotep (Architect)
revision: 1
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

**Phase 1: reclaim the live cascade.** The 166 selectors overlapping between suite.css and components.css, grouped by family, resolved per D5 with no duplicates left behind. Absorb #985 (CSS standards cleanup) here rather than running it separately; it is the same files under the same discipline. DOM parity per family.

**Phase 2: converge the three re-implemented sheet sections** (attributes, skills, disciplines) from `suite/sheet.js` onto the `editor/sheet.js` renderers, per D4. Not write-path-touching, but it is the highest-consequence rendering change in the epic; DOM parity is mandatory and the ADR-004 overlay assertions apply.

**Phase 3: GDX layout work** (#982 pinch-zoom viewport, #983 rem type scale and phone breakpoint, #984 touch targets, #990 single-scroll phone sheet). Sequenced after Phase 1 deliberately: these are viewport, type-scale and target-size changes across the same rule bodies Phase 1 is deleting or promoting. Running them first means doing the work twice, or doing it into rules that are about to be removed.

**Phase 4: admin CSS normalisation.** Separate epic, per D9. Not USF.

## Open items for Peter

Not blocking the shard breakdown, but surfaced by the survey and needing an owner:

- `public/_redirects` on `main` routes `/` and `/player.html` to `/maintenance.html` with a 302. The live site currently serves the app at `/` with a 200, so the file appears not to be in effect on the deployed build. Either it is stale and should be deleted, or it is live-but-bypassed and the deploy is not reflecting `main`. Worth resolving before USF starts changing entry points, because it is exactly the class of drift `project_netlify_dev_no_deploy` records.
