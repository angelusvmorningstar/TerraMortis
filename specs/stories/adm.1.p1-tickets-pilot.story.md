---
epic: ADM (#1064)
adr: ADR-008 D4/D5/D5a/D9 (Rev 4)
phase: 1
slice: Tickets (pilot)
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1068
branch: piatra/issue-1068-adm-p1-tickets
---

# Story ADM-1 (P1 pilot): merge the Tickets surface into index.html behind the role gate

## Status

Approved

## Story

**As a** Storyteller who currently has to open a second application to work the ticket queue,
**I want** Tickets to render inside the main app, with the admin code loaded only when my role warrants it,
**so that** the merge pattern is proven end to end — role gate, dynamic import, render, interact, write — on one surface where a mistake is cheap, before it is applied to sixteen more.

## Acceptance Criteria

### Stage A — retire the dead player copy (ADR-008 D5a; ADR-007 D8 two-step)

Lands before Stage B. The admin view must never be introduced alongside a dead renderer for the same surface — that ambiguity is what D8 exists to prevent.

1. **PR1 (dereference):** the `app.js:74` import of `renderTicketsTab` and the `app.js:524` `if (t === 'tickets')` branch are removed.
2. **PR2 (delete):** `public/js/tabs/tickets-tab.js`, the `#t-tickets` div at `index.html:368`, and the dead `.tk-*` rules in `suite.css` are deleted. *(Delivered as 31 lines, not 28 — the block also held a `#t-tickets.active` rule whose element dies in the same PR. Declared as a scope addition in the Dev Agent Record.)*
3. The Settings ticket-submit form is **unaffected** (`app.js:1812`, `POST /api/tickets`). It is the live player-side ticket path and uses no `.tk-*` class.

### Stage B — merge the surface

4. The Tickets surface renders inside `index.html` for an ST, from `admin/tickets-views.js`. **No second implementation is created.**
5. An ST reaches it via a nav entry that does not exist today, declared `stOnly` following the existing nav metadata pattern.
6. `admin/tickets-views.js` loads through dynamic `import()` at the point of use.
7. The import is gated on **`getRole()`, not `effectiveRole()`** (ADR-008 D4; ADR-007 D3).
8. **ATTRIBUTABLE, not absolute — and executable rather than prose** (restated by Rev 6 after Stage B found the absolute form unpassable on a pre-existing leak). Verified by `python3 specs/qa/harness/admin-leak-gate.py`, which replaces the unmeasurable network-panel check for the JS half.
   - **Attributable:** no admin module becomes *statically* reachable from the player entry **because of** a merged surface. A moved surface reaches its modules through dynamic `import()` only. The gate deliberately does **not** follow `import()`, since that is the sanctioned path and a gate flagging it would fire on every correct migration.
   - **Ratchet:** the leaked set may shrink, never grow.
   - The blessed baseline is a **named set, never a count** — a count of 2 would let a different leak silently substitute for a fixed one, the same substitution hazard as counting rules instead of enumerating them. Baseline: `public/js/admin/downtime-story.js` (200 KB) and `public/js/admin/downtime-constants.js` (14 KB), both inherited through the single edge `story-tab.js:9`, pre-existing on `dev` before this epic, tracked as #1075.
   - **Stylesheet half unchanged:** a player session fetches **zero** ST stylesheets. Per D4 Rev 4 the criterion is zero ST *presentation*, not merely zero ST JavaScript; satisfied here by the `getRole()`-gated injection.
9. An ST can list, filter, expand and edit a ticket in the merged surface — status, ST note, title, body, priority — and the writes persist. **Filter-active and expanded-row state are visibly distinguishable**, since both are conveyed by CSS alone.
10. `admin.html`'s Tickets domain continues to work unchanged. It is retired in P3, not here.

### Stage B — surface stylesheet (ADR-008 D9, scope separation)

Added by Rev 4 after Stage A established that the merged surface has **zero** of its definable classes styled: `index.html` never loads `admin-layout.css`, and the 10 classes that were in `suite.css` were correctly deleted in Stage A.

11. The `.tk-*` rules are extracted from `admin-layout.css` into `public/css/admin-tickets.css`. **Declarations are copied unchanged** — scope separation edits no values and makes no design judgement (that is what distinguishes it from reconcile and rename).
12. **The count is settled — assert it, do not re-derive it.** The 47-vs-48 discrepancy was a scoping difference, not a counting error, exactly as QA hypothesised: **47 rule blocks** containing a `.tk-` selector, **48 single selectors** mentioning `.tk-`, the delta being one all-`.tk-` comma group (`.tk-select, .tk-input`). **Blocks is the extraction unit**, because extraction moves whole rules. The load-bearing figure is the last one and it must be asserted rather than assumed: **zero** comma groups mix a `.tk-` with a non-`.tk-` selector, and **zero** sit inside an `@media` block. A mixed group could not be relocated without splitting it, and splitting a rule is an *edit* — which would take the change out of resolution class 3 and back into reconciliation. Fail the story on any later surface where that count is non-zero. State the scope you counted.
13. `index.html` **injects** the sheet from the same gated load path as the module. `admin.html` **static-links** it while it still exists. The asymmetry is transitional and ends at P3 when `admin.html` retires — it is not an inconsistency.
14. **Injection gates on `getRole()`** (authority: should this session ever load it?).
15. **Application gates on `effectiveRole()`** (visibility: should it apply right now?), enforced by toggling `link.disabled` inside `applyRoleRestrictions()`. Use `disabled`, not element removal, or every view toggle costs a refetch.
16. Module and stylesheet fetches are **concurrent, both awaited before render** — no unstyled flash, no added round trip.
17. Idempotency **caches the load promise**, keyed by href. A presence-check on the `<link>` element is a bug: a second caller passes the guard while the sheet is still in flight and renders unstyled, and only on the second open.
18. A stylesheet failure **degrades, it does not fail**. Catch the link's error and render unstyled rather than throwing, so a bad href costs styling and not the whole surface.

### Invariants

19. **D7.1** — no write-path inventory entry is touched. A diff touching one is the ADR-007 D7 escalation, not a judgement call.
20. **D7.2** — every new `effectiveRole()` call site is a review stop. Note AC15 adds one deliberately, inside `applyRoleRestrictions()`; that one is the design and is reviewed as such. Any *other* new call site is the escalation.
21. No `components.css` promotion in this story. Scope separation (D9) is not promotion — the rules move to a private per-surface sheet, not into the shared lib, and Tickets carries zero collisions after Stage A.

## Tasks / Subtasks

- [x] **Stage A PR1 — dereference** (AC: 1)
- [x] **Stage A PR2 — delete** (AC: 2, 3)
  - [x] Confirm by word-boundary check that no surviving `.tk-*` emitter exists outside `tickets-tab.js` before deleting the 28 rules.
- [x] **Stage B — surface stylesheet** (AC: 11, 12, 13)
  - [x] Assert the extraction unit is rule BLOCKS (47) and that zero comma groups mix `.tk-` with non-`.tk-` selectors; state the scope counted.
- [x] **Stage B — nav entry + gated dynamic import** (AC: 4, 5, 6, 7)
- [x] **Stage B — dual gating** (AC: 14, 15) — implemented
  - [ ] Verify the view-mode toggle disables the sheet, and re-enables it, without a refetch. *(browser-only; Ma'at)*
- [x] **Stage B — concurrent load, cached promise, graceful degrade** (AC: 16, 17, 18) — implemented
  - [ ] Open the surface twice in one session and confirm the second open is styled. *(browser-only; Ma'at)*
  - [ ] Point the href at a missing file and confirm the surface still renders. *(browser-only; Ma'at)*
- [ ] **Stage B — verify** (AC: 8, 9, 10) — JS half of AC8 done; the rest is browser-only
  - [x] `admin-leak-gate.py`: **exit 0**, 2 modules / 214 KB, no increase over the named baseline. Gate's *sensitivity* independently confirmed (see Stage B note 8).
  - [ ] Zero ST stylesheets in a player session — the AC8 stylesheet half. *(browser-only; Ma'at)*
  - [ ] ST session: list, filter, expand, edit, and confirm each write persists. *(browser-only; Ma'at)*
  - [ ] `admin.html` Tickets domain still works. *(browser-only; Ma'at)*

## Dev Notes

### Why Tickets, and why it is clean

ADR-008 D5 Rev 2 inverted its own original reasoning. The first version argued the pilot should prove the loading pattern **and** surface the CSS collision problem at once. That is wrong by ADR-007 D14's logic: Tier 0 was chosen because it had zero judgement calls, so a failure could only be the apparatus. A pilot exercising loading *and* a collision leaves two candidate causes for any rendering fault.

After Stage A, Tickets carries **zero** `.tk-*` collisions, so any fault is unambiguously a loading-pattern fault. **The pilot is right because it is clean, not because it is rich.**

### The player copy is dead — established, not assumed

Nothing routes to `#t-tickets`. No nav array entry, no More-grid entry, no hardcoded `goTab('tickets')`, no router. `window.goTab` is exposed at `app.js:2371` so a console call would render it, but there is no UI path. `app.js:1564` carries the epitaph: *"Tickets removed — submit form is in Settings"*.

The 28 `suite.css` `.tk-*` rules are emitted only by `tickets-tab.js`. Apparent exceptions are substring noise from the Settings form's `#stk-*` IDs (`stk-body` contains `tk-body`); a word-boundary check outside `tickets-tab.js` returns empty. **They are not a live duplication.** They are dead rules that would become live against admin markup the moment the documents merge, which is why Stage A precedes Stage B rather than following it.

### The dependency graph is already shared

`admin/tickets-views.js` imports only `data/api.js` and `data/helpers.js`. `app.js` already imports both (`:99`, `:15`). The dynamic import pulls in almost nothing new, which is part of why this slice isolates the loading pattern rather than the loading *weight*.

Weight is a later problem, deliberately: `downtime-views.js` (604 KB) and `downtime-story.js` (205 KB) are 67% of the admin graph and both sit on the D7 write path, so ADR-008 D4 sequences them **last** within P1.

### Gate on getRole(), not effectiveRole()

`effectiveRole()` (`app.js:149`) returns `'player'` when a real ST is in player-preview mode. It is presentation only. Authority — including whether to fetch a module — reads `getRole()`. Gating the import on `effectiveRole()` would mean an ST toggling preview mode loses the ability to load admin code, and it inverts the D3 contract.

### Not write-path-touching

Tickets performs real writes (`POST /api/tickets`; `PUT /api/tickets/:id` for status, note, title, body, priority) but none is a frozen write-path inventory entry. That combination is the point: the pilot exercises a mutation without touching either sacrosanct path.

### Scope separation is a third resolution class (ADR-008 D9)

Stage A established that "Stage B renders by loading what exists" was false — nothing exists to load. The two documents link disjoint app sheets: `index.html` takes theme/layout/components/suite, `admin.html` takes theme/components/admin-layout, and neither takes the other's.

`tickets-views.js` emits 37 distinct `tk-` tokens: 10 were defined in **both** sheets (deleted from `suite.css` in Stage A), 17-20 exist **only** in `admin-layout.css`, and 6 `tk-adm-*` are defined **nowhere**. Three of the missing rules are the interaction state itself, all defined once in `admin-layout.css` and nowhere else:

| Class | Site | What it conveys |
|---|---|---|
| `.tk-filter-btn-on` | `tickets-views.js:138` | which filter is active |
| `.tk-admin-row-expanded` | `tickets-views.js:185` | which row is expanded |
| `.tk-admin-split` | `tickets-views.js:47` | `display:grid 1fr 1fr` — without it both panels stack |

So AC9 was unsatisfiable, not merely unpolished: two of its four verbs go invisible.

The resolution is a class the ADRs did not previously name:

| # | Class | Situation | Resolution |
|---|---|---|---|
| 1 | Reconcile (ADR-007 D5) | one component, two copies | keep one |
| 2 | Rename (ADR-007 D13) | two components, one name, *must* coexist | rename one |
| 3 | **Scope separate (D9)** | two components, one name, need *not* coexist | **load them apart** |

Class 3 edits no declarations and makes no design judgement. It is available precisely *because* the surfaces are role-gated, and it is why reconciliation was never the right question here.

### The co-render precondition

Scope separation is sound only where the two surfaces cannot co-render. This codebase has exactly one violation, and it is a feature: the `_viewMode` ST-preview toggle (`app.js:1776`). An ST opens an admin surface, its sheet injects, they toggle to player preview, and admin rules now apply to player markup.

Moot for Tickets — the player copy is dead per D5a — but live for the other fifteen surfaces, and the kind of thing found in production rather than review because it needs a toggle no smoke test exercises.

Hence the two gates in AC14/AC15. Note that `applyRoleRestrictions()` is **already** called by the view-mode toggle handler and already runs on boot, so the application gate needs **no new composition site**. This is ADR-007 D3's authority-versus-presentation split landing on fetch-versus-apply without being bent.

### Out of scope

- **A generalised solution for sixteen surfaces.** Land one, for Tickets. If surfaces two through four prove the extraction mechanical, the pattern holds; if not, we learn it at a cost of three rather than sixteen. Whether the files are later concatenated is a packaging decision available in P3, and it changes nothing about D9.
- **The 6 `tk-adm-*` classes defined nowhere** — `tk-adm-*` is styled in neither sheet, so admin's *current* Tickets surface has 6 unstyled classes today. Pre-existing defect, filed separately, explicitly **not** inherited as "styling we broke".
- **No "dynamic import scaffolding" story or commit.** ADR-008 D2: infrastructure delivering nothing openable is not a phase and not a story — it is the mechanism inside this slice. A commit by that name is the non-delivering-part trap re-forming.
- **`t-map` (#1067)** — a separate unreachable tab from the same sweep, explicitly outside this epic. One carve-out: if Stage A is editing the tab dispatcher anyway and #1067 is open, it may ride in PR1.

### Relevant files

- `public/js/admin/tickets-views.js` (298 lines, `initTicketsView(containerEl)` — the surface being merged)
- `public/js/app.js` (`:74`, `:524` dereference; `:149` `effectiveRole`; `:1483` `applyRoleRestrictions`; nav arrays)
- `public/js/tabs/tickets-tab.js` (217 lines — deleted in Stage A)
- `public/index.html` (`:368` dead div; nav + container for Stage B)
- `public/css/suite.css` (28 dead `.tk-*` rules)
- `public/js/admin.js` (`:42`, `:325` — admin's own wiring, unchanged)

## Testing

No unit framework. Verify in-browser:

- **Player session, network panel:** zero requests to `public/js/admin/*`. This is AC8 and it is the criterion for every later surface move.
- **ST session:** nav entry present, surface renders, list/filter/expand work, each of the five writes persists across a reload.
- **`admin.html`:** Tickets domain unchanged.
- **Regression:** the Settings ticket-submit form still posts.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-29 | 0.1 | Initial draft — P1 pilot per ADR-008 D5/D5a Rev 3 | Khepri (SM) |
| 2026-07-30 | 1.0 | Approved. Stage A merges without review (pure deletion, nothing renders today); Stage B is reviewed by Peter before merge. | Khepri (SM) |
| 2026-07-30 | 1.1 | Stage B revised per ADR-008 Rev 4. AC8 widened to zero ST presentation; AC9 given a visible-state criterion; AC11-18 added (scope separation, dual gating, concurrent load, cached promise, graceful degrade). Cause: Stage A established that "renders by loading what exists" was false. | Khepri (SM) |

## Dev Agent Record

**Both stages implemented.** Stage A merged to `dev` (`d360f597`) via PR #1069 then #1070, Ma'at gate PASS. Stage B was halted before implementation on the CSS-coverage blocker, escalated, ruled on by Imhotep as ADR-008 Rev 4 D9 (scope separation), and then implemented — the halt record is kept below because the ruling grew out of it.

`Status` is left at `Approved` rather than advanced to `Ready for Review` because **Stage B's browser-only criteria cannot be exercised from this environment** (no browser, no Discord OAuth session). What is implemented is complete and statically verified; what remains is AC8/AC9/AC10 and three subtasks that require a real session. Ma'at's gate is not a formality here — it is the only place those ACs can be met. See "What I could not verify".

### Agent Model Used

Ptah (DEV) — claude-opus-5

### Debug Log References

Branches (stacked off pushed `origin/piatra/issue-1068-adm-p1-tickets`; neither pushed at time of writing):

| Branch | Commit | Content |
|--------|--------|---------|
| `piatra/issue-1068-adm-p1-tickets-pr1` | `406b6d08` | Stage A PR1 — dereference |
| `piatra/issue-1068-adm-p1-tickets-pr2` | `70b8a7ad` | Stage A PR2 — delete (stacked on PR1) |

Worked in a dedicated worktree at `/private/tmp/tm-ptah/adm1-pr1`. The main checkout advanced mid-session (Imhotep committing on `piatra/write-path-inventory-rev4`); it was never touched by this work. Three git-status checkpoints run per dispatch (branch creation, pre-staging, pre-commit).

Stacked sub-branches rather than the story branch itself: the story branch was checked out in the SM's worktree, so git refuses a second worktree on it. Two PRs required two branches regardless. Adaptation confirmed correct by Khepri.

### Completion Notes List

**1. Word-boundary check re-run independently (AC2 subtask).** Not taken on the SM's assertion. Result confirms the `#stk-*` substring-noise diagnosis and is *stronger* than the story states: after PR2, `app.js` contains **zero** word-boundary `tk-` tokens. Every apparent `.tk-*` use in it was substring noise from the Settings form's `#stk-*` IDs (`stk-body` contains `tk-body`). Post-PR2 sweep of `renderTicketsTab`, `tickets-tab`, `t-tickets` and word-boundary `tk-` across `public/` returns empty.

**2. AC3 verified — Settings ticket-submit form unaffected.** Now at `app.js:1807` (was `:1812`; shifted by PR1's 5-line deletion). Addresses only `#stk-*` IDs, carries no `.tk-*` class, `POST /api/tickets` still wired. Untouched by both PRs.

**3. DECLARED SCOPE ADDITION — 31 lines removed from `suite.css`, not 28.** The story specifies 28 dead `.tk-*` rules. The `suite.css` "Tickets tab (css-3)" section also contained a `#t-tickets.active` rule (pre-edit line 1589) and its section comment. PR2 removes the whole section: section comment + `#t-tickets.active` + the 28 `.tk-*` rules = 31 lines including the trailing blank. Justification: `#t-tickets.active` styles an id whose element is deleted in this same PR, so leaving it would leave a rule for an element that no longer exists — the precise condition ADR-007 D8 exists to prevent. Declared here rather than left for QA to discover as an unexplained 31-vs-28 discrepancy. **Approved by Khepri (SM) 2026-07-30.** Brace balance verified (1442/1442) and section spacing preserved after the cut.

**4. Deliberately not done.** No "dynamic import scaffolding" commit, helper module, or story (ADR-008 D2). No `components.css` promotion and no rule promoted anywhere (AC13). No `effectiveRole()` call site added (D7.2 not triggered). No write-path inventory entry touched (D7.1 not triggered). #1067 (`t-map`) **not** folded into PR1 despite the ADR-008 Rev 3 carve-out permitting it: PR1 merges without Peter review, which is the wrong vehicle for an out-of-epic change. Left standalone; endorsed by Khepri.

**5. MECHANISM FINDING — independent dual authoring, not duplication.** `suite.css` and `admin-layout.css` **independently define the same 10 class names** that `admin/tickets-views.js` emits — `tk-badge`, `tk-input`, `tk-select`, `tk-textarea`, `tk-form-row`, `tk-form-label`, `tk-submit-form`, `tk-btn-submit`, `tk-empty`, `tk-error` — with different values, one set per document.

This is a different and worse shape than a duplicated rule. **Neither copy is "the duplicate"**, so there is no obviously-correct one to delete: each was authored independently for its own document and is correct within it. The two authorings only collide when the documents merge. ADR-008's ~118-rule collision enumeration counts this shape but does not distinguish it, and the distinction is what makes it dangerous — a collision audit that reports a count invites "delete the duplicate", which is not a well-defined operation here.

This is why Stage A precedes Stage B and why the deletion is load-bearing rather than tidying: left in place, `suite.css`'s **player-authored** values would land on **admin markup** the moment the documents merge, producing a rendering fault whose cause is two-candidate. Expect this shape on the remaining 16 surfaces.

**6. Stage A did not stall on the Stage B blocker.** Every resolution path to the Stage B CSS question still deletes these 10 `suite.css` definitions, so the deletion is unconditionally correct and Stage A shipped while the blocker was escalated.

### Stage B halted — not implemented

Halted before any implementation, on the ADR-008 escalation condition covering `admin-layout.css`'s 47 `.tk-*` rules. Escalated to Khepri (SM), who verified the claim independently and referred the CSS pattern question to Imhotep (architect) because it sets precedent for all 16 remaining surfaces. **Halt confirmed correct by SM.**

The story's Dev Notes assert Stage B "renders correctly by loading what exists". It does not, because **stylesheet linking is per-document**:

- `index.html` links `theme.css`, `layout.css`, `components.css`, `suite.css` — **never** `admin-layout.css`
- `admin.html` links `theme.css`, `components.css`, `admin-layout.css` — **never** `suite.css`

`admin/tickets-views.js` emits 37 distinct `tk-` tokens (36 real + one `tk-badge-${status}` template prefix):

| Count | Where defined | Consequence in `index.html` |
|-------|---------------|------------------------------|
| 10 | `suite.css` **and** `admin-layout.css`, independently | correctly deleted from `suite.css` in PR2 |
| 20 | `admin-layout.css` only | `index.html` never loads it |
| 6 | `tk-adm-*` — nowhere at all | pre-existing; see below |

After Stage A the merged surface would have **0 of 30** definable classes styled.

**This blocks AC9 functionally, not cosmetically.** Interaction state in this surface is conveyed by CSS alone:

- `tickets-views.js:138` — `const on = f === activeFilter ? ' tk-filter-btn-on' : ''`; `admin-layout.css:3998` is the *only* signal of which filter is active
- `tickets-views.js:185` — `const rowClass = isExpanded ? ' tk-admin-row-expanded' : ''`; `admin-layout.css:4002` is the *only* signal of which row is expanded
- `tickets-views.js:47` — `tk-admin-split` is `display: grid; grid-template-columns: 1fr 1fr` (`admin-layout.css:3972`); without it both panels stack full-width

So AC9's "list, **filter**, **expand** and edit" is not satisfiable: filter-active and expanded-row become invisible to the ST. AC4–AC8 and the loading pattern itself are unaffected — the pattern is sound, only its rendering is unresolved. If the ruling is "CSS is P2, re-scope", AC9 requires rewording before Stage B can pass.

Direction pending Imhotep. The SM's working proposal is a per-surface `css/admin-tickets.css` whose `<link>` is injected idempotently by the dynamic-import path under the same `getRole()` gate, so zero ST CSS (not merely zero ST JavaScript) reaches a player.

### Stage B — implemented (commit `aa901d4f`, branch `piatra/issue-1068-adm-p1-tickets-stage-b` off `dev`)

**1. AC12 — ASSERTED (the count itself is settled; this is the relocatability assertion).**

**THE LOAD-BEARING ASSERTION, which is what makes this a relocation rather than an edit:**

| Assertion | Value |
|---|---|
| comma groups mixing a `.tk-` selector with a non-`.tk-` selector | **0** |
| `.tk-*` rules inside an `@media` block | **0** |

Both are **zero**, so **every rule moved whole and the extraction is a pure relocation.** This is the condition D9 rests on. A mixed comma group could not be relocated without splitting it, and splitting a rule is an *edit* — which would drop the change out of resolution class 3 (scope separation) and back into reconciliation, i.e. out of this story's scope entirely.

**Rule for later surfaces: if either figure is non-zero, fail the story. Do not split the group.** The split is the reconcile decision wearing an extraction's clothes, and the person best placed to notice is whoever runs this assertion.

**Scope counted** (stated for the next surface's dev, since "the count" is meaningless without it): rules **defined in `admin-layout.css`**, which is linked by **`admin.html` only**. Per D8 rule 5, the decision unit for CSS is the *document*, not the repository — granularity and scope are orthogonal, and a per-rule measurement taken tree-wide is correctly granular at the wrong scope. Every reachability question here was asked as "which document loads this?", never "does this class appear in the tree?".

**Method:** brace-depth parse, comments stripped, `@media` context tracked, word-boundary match on `.tk-` (`(^|[^A-Za-z0-9_-])\.tk-`) so `#stk-*` substrings cannot contribute. Source: `origin/dev:public/css/admin-layout.css`, block spanning lines 3970–4018.

**Confirming the settled count rather than re-deriving it:** 47 rule blocks / 48 selectors, delta exactly one all-`.tk-` comma group (`.tk-select, .tk-input`). Blocks is the extraction unit. Also observed, and *not* a source of the discrepancy: seven compound/descendant selectors (`.tk-submit-form h4`, `.tk-admin-row:hover`, `.tk-admin-note label`, …), each counting once under both conventions.

**Post-extraction check:** `admin-layout.css` contains 0 `.tk-`; `admin-tickets.css` carries 47 rule blocks / 48 selectors.

**2. AC11 — declarations byte-identical, verified not asserted.** Extraction was done programmatically, then the 47 non-comment lines were diffed against `HEAD:public/css/admin-layout.css` lines 3970–4018: **byte-identical**. Brace balance checked. Nothing was reformatted, reordered, or renamed. Two comments travelled with the block (its section header and one interior comment); a new file header was added recording provenance and the counting convention.

**3. The extraction is genuinely mechanical — the class-3 premise holds for this surface.** This was the halt condition worth checking hardest, since sixteen surfaces are sequenced on it. Two things could have made it non-mechanical and neither did:

- **Custom properties.** The block references 23 `var(--…)` properties, including eight `--tk-*-bg`/`--tk-*-fg` pairs and `--txt1`. **All 23 are defined in `theme.css`**, which *both* documents load (`--txt1` is an alias of `--txt` at `theme.css:45`); zero are defined in `admin-layout.css`. So the move leaves nothing dangling. Had any lived in `admin-layout.css`, extraction would have silently produced unstyled badges in `index.html` and scope separation would have needed a property carve-out.
- **Host container.** No new container rule was needed. `.tab.active{display:block}` (`suite.css:76`) covers display generically, and `#bnav` is a `position: relative` flex sibling of `.tab-wrap` rather than an overlay, so no bottom-nav clearance padding is required. **Zero declarations were added, edited, or promoted** — AC21 holds, and nothing here was a design judgement.

**4. AC15/AC20 — zero new `effectiveRole()` call sites, not the one anticipated.** AC20 expected the application gate to add one deliberate call site. It adds none: `applyRoleRestrictions()` already computes `const role = effectiveRole()` at its top, so `applySurfaceSheetVisibility(role === 'st' || role === 'dev')` reuses it. Verified by parsing call sites with comments and prose stripped: **9 real call sites on `origin/dev`, 9 now, none added, none removed.** A naive grep reports 15 because the new code *documents* the distinction in prose; that is comment text, not a call.

One related judgement, flagged rather than buried: `loadSurfaceSheet` sets the link's initial `disabled` state from the `_viewMode` module variable directly instead of calling `effectiveRole()`. This is so a sheet injected while in player preview does not apply on arrival, without adding a D7.2 call site. It reads presentation state, which is what `_viewMode` is. The only path that can inject while in preview is a `window.goTab` console call, since the tile itself is `effectiveRole`-filtered.

**5. AC5 — the entry path I created, stated explicitly (the inverse of Ma'at's router check).**

One declaration produces two UI entry points:

```
MORE_APPS { id: 'tickets', section: 'st', stOnly: true }
  ├─ More-grid tile        app.js:1973   onclick="goTab('tickets')"
  └─ desktop sidebar tile  app.js:2176   onclick="goTab('tickets')"
        └─ goTab('tickets') → dispatcher app.js:578
              └─ initTicketsSurface(#t-tickets)
                    ├─ getRole() gate (authority) — returns early for players
                    └─ Promise.all[ import('./admin/tickets-views.js'),
                                    loadSurfaceSheet('css/admin-tickets.css') ]
                          └─ mod.initTicketsView(el)
```

Tile *visibility* filters on `effectiveRole` (existing `app.stOnly && !isST` guards); the *fetch* gates on `getRole`. Enumerated programmatically: `tickets` appears as an object-literal `id` exactly once. **Deliberately not added to `NAV_ITEMS`** — the bottom nav is unchanged (0 occurrences); one nav entry was asked for and one exists. The pre-existing `window.goTab` console path is unchanged and was not created here.

**What this enumeration is structurally incapable of seeing** (applying D8's preamble to my own check rather than only to QA's): it is a literal enumeration of object-literal `id:` declarations, so it cannot see an entry whose id is computed at runtime, an entry pushed into `MORE_APPS` by another module after load, or a server-supplied nav config. I did not find any of those, but not finding them with *this* method is weak evidence, and a second literal grep would be a correlated pass rather than an independent one.

The independent check that does cover it is structural rather than enumerative: **the `getRole()` gate sits inside `initTicketsSurface`, not at the nav layer.** Any entry path — declared, computed, injected, or a console `goTab('tickets')` — funnels through the single dispatcher branch at `app.js:578` and hits that gate before either fetch. So an entry path nobody enumerated still cannot leak admin code to a player. The gate is what makes this safe; the enumeration only tells us what a *user* can click.

**6. AC8 could not pass as originally written — a pre-existing leak, not caused by this diff. Escalated, and RULED: AC8 is now attributable + ratchet (Rev 6), verified by an executable gate. See note 8 for the run.**

AC8 requires a player session to fetch **zero** modules from `public/js/admin/`. Static graph analysis of `index.html`'s module tree (121 modules walked from `app.js`) found this **static** import chain:

```
public/js/app.js
  → public/js/game/dt-lookup.js
    → public/js/tabs/story-tab.js
      → public/js/admin/downtime-story.js      200 KB
        → public/js/admin/downtime-constants.js  14 KB
```

Confirmed **pre-existing on untouched `origin/dev`** (checked by restoring `public/js` from `origin/dev` and re-walking): the identical two modules leak. A static `import` is fetched regardless of role, so **a player session already downloads ~214 KB from `public/js/admin/` today.**

This diff adds **zero** new leaks — `admin/tickets-views.js` is reachable only through the dynamic `import()` at `app.js:630`, and no other module in the static graph references it.

Two reasons this matters beyond bookkeeping. First, `downtime-story.js` is precisely the module ADR-008 D4 sequences **last** because it sits on the frozen write path — so the pilot's headline criterion is blocked by the one surface the epic deliberately deferred. Second, AC8 is described as "the criterion for every later surface move"; if it is failing before the first move, every later pass against it is meaningless. **AC8 needs restating** (e.g. "no *new* modules from `public/js/admin/`, and none attributable to the merged surface") or the leak needs fixing first — which is out of scope here and touches deferred, write-path code. **Not fixed, not worked around, escalated.**

**7. AC13 — the transitional asymmetry, implemented as specified.** `admin.html` static-links `css/admin-tickets.css` (line 16, with a comment noting the asymmetry and its P3 end); `index.html` does **not** link it statically (verified 0 occurrences in served bytes) and receives it only by injection from the gated path.

**8. AC8 — gate run, and its sensitivity verified rather than trusted.**

```
$ python3 specs/qa/harness/admin-leak-gate.py
  admin modules statically reachable : 2
  uncompressed weight                : 214 KB
  public/js/admin/downtime-constants.js  (14 KB)
     via app.js -> archive-tab.js -> story-tab.js -> downtime-story.js -> downtime-constants.js
  public/js/admin/downtime-story.js  (200 KB)
     via app.js -> archive-tab.js -> story-tab.js -> downtime-story.js
OK — no increase over baseline (2 modules).
exit 0
```

Attributability holds: the two named modules are the pre-existing baseline, and `admin/tickets-views.js` does **not** appear — it is reached through dynamic `import()` only.

**A green gate is only evidence if the gate can go red, so I checked that rather than assuming it.** I temporarily added a static `import { initTicketsView } from './admin/tickets-views.js'` to `app.js`, re-ran, and it **exited 1**, naming the module *and* its import path:

```
FAIL: new admin modules statically reachable from the player entry.
  + public/js/admin/tickets-views.js
     via app.js -> tickets-views.js
exit 1
```

Reverted; `app.js` matches `HEAD`. So the gate detects precisely the failure this story would be blamed for, and it caught the exact module in question.

*Procedure warning for anyone repeating this:* I reverted the simulated leak with `git checkout -- public/js/app.js`, which also discarded an **uncommitted** change I had in that file (the note-9 injector edit), and `git status` then read clean — which looks like success. Commit or stash before injecting a simulated failure into a file you are also editing, or revert the injected lines specifically rather than the file. `--paths` resolves what looked like a discrepancy between my trace (`dt-lookup.js`) and the gate's default output (`archive-tab.js`) — both are real, and they are two of three:

```
$ python3 specs/qa/harness/admin-leak-gate.py --paths
  public/js/admin/downtime-story.js  (200 KB)
     3 static path(s):
       app.js -> archive-tab.js  -> story-tab.js -> downtime-story.js
       app.js -> downtime-tab.js -> story-tab.js -> downtime-story.js
       app.js -> dt-lookup.js    -> story-tab.js -> downtime-story.js
```

All three converge on `story-tab.js`, so **the join point at `story-tab.js:9` is the only cut that closes the leak** — removing any single importer changes nothing. The default one-representative-path output would have hidden that, which is why `--paths` exists (QA's finding, #1075).

**9. The injector no longer answers a presentation question (Rev 6 correction).**

Superseded my earlier `link.disabled = _viewMode === 'player'`. The objection was correct and better than the one I anticipated: reading `_viewMode` was not a purity problem, it was a **second site computing "should ST presentation apply"**. It agreed with `effectiveRole()` only because `effectiveRole()`'s condition happens to be exactly that comparison; a third role, a dev-preview mode or an impersonation flag would have made them disagree *silently*, surfacing only as wrongly-applied CSS. That is the documented two-views-of-the-same-arithmetic failure mode.

Final shape (after the Rev 8 correction in note 10):

- `loadSurfaceSheet` creates the link, tags `data-surface-sheet`, appends it **enabled**, and calls `applyRoleRestrictions()`. It reads no view state and never writes `disabled`.
- `applySurfaceSheetVisibility` queries `document.querySelectorAll('[data-surface-sheet]')` rather than the promise cache, so it owns every surface sheet however it arrived.
- The promise cache maps `href → promise` directly; the element is no longer needed there.

`applyRoleRestrictions` is the **single** owner of the decision, reusing the `role` it computes at `:1580`. Verified: exactly one `disabled` write for surface sheets exists in the file, inside `applySurfaceSheetVisibility`. **Call-site count unchanged: 9 on `dev`, 9 now.** No recursion — `applySurfaceSheetVisibility` does not reach `loadSurfaceSheet`.

**10. `disabled = true` at injection was CONSIDERED AND SUPERSEDED (Rev 8) — recorded so the reasoning survives, not just its absence.**

Rev 6 specified injecting with `link.disabled = true` as a fail-safe, so ST styling could not flash into a player preview. I implemented that, then found a defect in it: **a disabled `<link rel="stylesheet">` may never be fetched at all** (the basis of the lazy-CSS trick). If it is not fetched, neither `load` nor `error` fires, `loadSurfaceSheet`'s promise never settles, the `Promise.all` in `initTicketsSurface` never resolves, and the tab stays **blank with no error**. One live edge followed: a real ST already in player preview passes the `getRole()` authority gate correctly, then gets `disabled = true` from `effectiveRole()`, so the surface could hang.

I offered a one-line guard — `if (link.disabled) return Promise.resolve(false);` — and left the design alone pending the Architect.

**Ruled: drop `disabled` at injection entirely.** The guard was rejected for a better reason than "unnecessary": it **defends a mechanism that should not be in use.** `disabled` couples *application* to *fetching*, which are precisely the two concerns Rev 6 had just separated. Injecting enabled means the fetch always proceeds, so the promise always settles, so the hazard is **gone rather than guarded** — including on the ST-in-preview edge, which now renders unstyled. That is the semantics the guard was reaching for, arrived at without a special case.

No flash results, because `applyRoleRestrictions()` runs synchronously in the same task and the browser cannot paint between two synchronous statements. The fail-safe was protecting against something that cannot happen on the normal path.

**The general rule this produced (now D9), which came out of the ordering worry rather than the defect:** compare what a future refactor that moves `applyRoleRestrictions()` behind an `await`/`setTimeout`/`rAF` costs under each shape —

| shape | failure mode of that refactor |
|---|---|
| `disabled = true` | blank surface, no error, no console output |
| inject enabled | brief flash of ST styling |

**Prefer the mechanism whose failure mode is cosmetic over the one whose failure mode is silent and total.** `disabled = true` was chosen because it *read* as the safer default; it was the more dangerous one. The synchronous-ordering comment is kept at the line, since the ordering still matters — now for the no-flash property rather than for settling — and the comment is the only thing protecting it.

**What this ruling does not depend on:** what any browser actually does with a disabled link. The corrected shape is correct under either answer. QA still runs the preview-mode check because the answer is worth knowing — if the fetch does proceed, the hazard was latent rather than live — but no design decision rests on the result.

### What I could not verify — Ma'at's gate is load-bearing

No browser and no authenticated session in this environment, so every criterion that is a *behavioural* check remains open. I did not tick them and did not infer them from the code:

- **AC8** — network panel, player session. Static analysis above says it fails on the pre-existing leak; a real panel is still needed to confirm the Tickets modules themselves stay absent.
- **AC9** — ST lists, filters, expands, edits; five writes persist across reload. Includes the visible-state check the halt was about (`tk-filter-btn-on`, `tk-admin-row-expanded`).
- **AC10** — `admin.html` Tickets domain unchanged. Higher risk than it looks: `admin.html` now depends on a *second* stylesheet for rules it previously had in one, so a missing link there breaks the existing ST surface.
- **AC15 subtask** — toggle disables and re-enables the sheet with no refetch (check the network panel shows no second request).
- **AC17 subtask** — second open in one session is styled (the promise-cache property).
- **AC18 subtask** — break the href, confirm the surface still renders unstyled rather than dying.

What I *did* verify statically or by serving locally: `app.js` parses; all assets serve 200 (`admin-tickets.css` 5,981 B, 47 rule lines, including the three state rules the halt turned on); `tickets-tab.js` is 404 (Stage A); `index.html` does not statically link the sheet; `admin.html` does; `admin-layout.css` has zero `.tk-`; declarations byte-identical; call-site counts unchanged; no write-path inventory file touched.

### Bookkeeping — `dev` carries Rev 3 of this story, not Rev 4

Flagging for the SM rather than fixing unilaterally. The Stage A PRs (#1069, #1070) were cut from branches based on the pre-ruling story, so what merged to `dev` is **Rev 3's** acceptance criteria plus my Stage A record. Khepri's Rev 4 revision — which adds AC11–18 and renumbers the invariants to 19–21 — exists only on `origin/piatra/issue-1068-adm-p1-tickets` and has not reached `dev`. This branch carries the reconciled file (Rev 4 ACs + Stage A record + Stage B record), so merging Stage B resolves it; noted because anyone reading the story on `dev` right now sees ACs that understate the work, and because Ma'at gating Stage B needs Rev 4's AC11–21.

### Out of scope — filed separately, not folded in

6 `tk-adm-*` classes (`tk-adm-body`, `tk-adm-error`, `tk-adm-inner`, `tk-adm-submit`, `tk-adm-title`, `tk-adm-type`) are defined in **no stylesheet at all**, including for `admin.html`. The current ST Tickets surface therefore has 6 unstyled classes in production today. Pre-existing defect, unrelated to this story; Khepri is filing it separately. Explicitly **not** folded in.

### File List

**Stage A — merged to `dev` (#1069, #1070)**

*Modified*

- `public/js/app.js` — PR1: removed `renderTicketsTab` import (`:74`) and the `if (t === 'tickets')` dispatcher branch (`:524`). 5 deletions.
- `public/index.html` — PR2: removed `<div id="t-tickets" class="tab">` (`:368`). 1 deletion.
- `public/css/suite.css` — PR2: removed the entire "Tickets tab (css-3)" section — section comment, `#t-tickets.active`, and the 28 dead `.tk-*` rules. 31 deletions (see Completion Note 3).

*Deleted*

- `public/js/tabs/tickets-tab.js` — 217 lines. Fully unreferenced after PR1.

*Net:* 249 deletions, zero additions. No file created.

**Stage B — branch `piatra/issue-1068-adm-p1-tickets-stage-b`, commit `aa901d4f`**

*Created*

- `public/css/admin-tickets.css` — the 47 extracted rule blocks, declarations byte-identical, plus a provenance/convention header. 66 lines.

*Modified*

- `public/css/admin-layout.css` — removed the "Tickets admin domain" section (47 rule blocks + 2 comments + a blank). 50 deletions; 0 `.tk-` remain.
- `public/js/app.js` — added the surface-stylesheet helpers (`_surfaceSheets`, `loadSurfaceSheet`, `applySurfaceSheetVisibility`), `initTicketsSurface`, the `goTab` dispatch branch (`:578`), the `MORE_APPS` Tickets entry, and the `applySurfaceSheetVisibility` call inside `applyRoleRestrictions`. Replaced the stale "Tickets removed" epitaph comment. Net +93.
- `public/index.html` — re-added `<div id="t-tickets" class="tab">` as a **live** container (Stage A's was dead), with a comment naming its filler. +3.
- `public/admin.html` — static `<link>` for `css/admin-tickets.css` (`:16`) with a comment recording the transitional asymmetry. +3.
- `specs/stories/adm.1.p1-tickets-pilot.story.md` — this record; task checkboxes. Also carries the reconciled Rev 4 story text that has not yet reached `dev` (see Bookkeeping).

*Net:* +165 / −51 across 5 files.

### Change Log addendum

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-30 | 1.1 | Stage A implemented (PR1 `406b6d08`, PR2 `70b8a7ad`). Stage B halted pre-implementation on the `admin-layout.css` CSS-coverage blocker; escalated and confirmed. | Ptah (DEV) |
| 2026-07-30 | 1.2 | Stage A merged to `dev` (`d360f597`), Ma'at PASS. Stage B implemented per ADR-008 Rev 4 D9 (`aa901d4f`): 47 rule blocks extracted byte-identical, dual gating, concurrent load, cached promise, graceful degrade. AC12 count reconciled (47 blocks = 48 selectors, one comma group). **AC8 found unpassable on a pre-existing 214 KB `admin/downtime-story.js` static leak — escalated, not fixed.** Browser-only ACs 8/9/10 remain for Ma'at. | Ptah (DEV) |

## QA Results

### Review — 2026-07-30, Ma'at (Test Architect)

**Gate: PASS (Stage A only)** → `specs/qa/gates/adm.1-stage-a.yml`

**Scope.** Stage A only, on the SM's instruction. Stage B is halted pre-implementation and is not in these PRs; **AC4-18 are not adjudicated**. Story `Status` left at `Approved` — the dev's reasoning for not advancing it is right and QA has not altered it.

**Verdict: Stage A can merge, independently of the Stage B ruling.** PR1 then PR2, in that order; PR2 is stacked on PR1 and must not be retargeted to dev before PR1 lands.

> **Commit provenance.** Reviewed against `aa7e6c40` (what `gh` reported as PR2's head at dispatch). PR2's branch was **rebased mid-review** onto `5dc5cbab` — `aa7e6c40` is not an ancestor of it. Re-verified rather than assumed: `git diff aa7e6c40 5dc5cbab -- public/` is **empty**, so every product file is byte-identical and all code verdicts carry over. The story changed: Stage A AC1-3 unchanged in substance, invariants renumbered **11/12/13 → 19/20/21**, Stage B grew to AC4-18.
>
> **Second finding, since resolved:** when Stage A merged, this story on dev was still **Rev 3** while ADR-008 on dev was **Rev 4** (`0d78620b` merged the ADR alone) — the Rev 4 story revisions never reached dev via #1069/#1070. The story was brought to Rev 4 first (#1072) and only then was this gate landed, so it sits beside the numbering it cites. Gate AC verdicts retain **both** numberings deliberately. Stage A verdicts are unaffected either way — AC1-3 are identical in substance in both revisions.

#### Re-derived, not accepted

| Claim | Verdict | Basis |
|---|---|---|
| #t-tickets unreachable | **Confirmed** | Checked against the **pre-PR1** tree (`406b6d08^`). No nav entry, no More-grid entry, no hardcoded `goTab('tickets')`, no `NAV_ALIAS` entry. |
| 31 deleted CSS lines dead | **Confirmed, per-rule** | 29 rule blocks, each comma-group split, word-boundary matched. **0 index-reachable emitters.** |
| Settings form works | **Confirmed** | Markup `app.js:1737` and wiring `app.js:1799` both intact; PR2 doesn't touch `app.js`. |

**Extension beyond the two prior checks.** A literal `tickets` grep cannot rule out a *generic* router — the one route class three reviewers could all miss the same way. Checked separately: no `hashchange`/`popstate`/`location.hash`/pathname tab routing exists anywhere in `public/js`. The only dynamic call sites interpolate from nav metadata (`MORE_APPS` 18 ids, `NAV_ITEMS` 48 entries — enumerated programmatically, `tickets` in neither) plus `goTab(currentTab)`, which reads `.tab.active` from the DOM at `app.js:1065` and so can only re-enter an already-open tab, never introduce one.

**Line accounting reconciles the declared 31-vs-28:** 1 section comment + 1 `#t-tickets.active` + 28 `.tk-*` rules + 1 trailing blank. Brace balance 1442/1442, independently recomputed.

**The apparent exceptions, resolved.** `admin/tickets-views.js` + `admin-layout.css` are the dual-authoring shape — emitted into `admin.html`, which never loads `suite.css`. `mockups/font-test.html` is fully self-contained (inline `<style>`, no local links). `stk-*` is substring noise, correctly excluded by the word boundary.

#### Invariants (Rev 3 AC11-13 / Rev 4 AC19-21)

D7.1 PASS (inventory names none of the four touched files — caveat: checked against the version at this tip; `write-path-inventory-rev4` is in flight). D7.2 PASS, not triggered (0 additions; the deliberate new call site Rev 4 anticipates belongs to Stage B). No-components.css-promotion PASS. ADR-004 PASS. ADR-007 D8 two-step PASS.

#### Notes

- Boot smoke run **with the API up deliberately**: the harness's BENIGN filter includes `/Failed to load resource/`, broad enough to swallow a 404 — exactly the failure a delete-only change could cause. `benignFiltered: 0` both roles, so the clean result isn't a filter artefact. Static server confirmed 404 on `/js/tabs/tickets-tab.js`.
- **The dual-authoring finding is corroborated and matters for gating, not just design.** "Is this rule dead?" has a different answer *per document*, and a tree-wide grep cannot express that. A reviewer who greps and finds `tickets-views.js` emitting `.tk-badge` would wrongly conclude the `suite.css` copy is live. Same failure shape as the `.map-*` family-granularity error: the measurement must be scoped to the unit the decision applies to — here the **document**, not the repository. This is worth carrying into AC12, which asks the next dev to derive the `admin-layout.css` count from the tree: that count is also document-scoped.
- Fourth surface found live-in-source and unreachable-in-fact. The third check was proportionate — but all three of us checked the same *way*. If a fifth instance arises, adding the generic-router check is worth more than a fourth pair of eyes on the same method.
