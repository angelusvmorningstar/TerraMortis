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
8. **Network-panel check, not a code assertion:** a player session fetches **zero** modules from `public/js/admin/` and **zero** ST stylesheets. Per D4 Rev 4 the criterion is zero ST *presentation*, not merely zero ST JavaScript.
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
- [ ] **Stage B — surface stylesheet** (AC: 11, 12, 13)
  - [ ] Assert the extraction unit is rule BLOCKS (47) and that zero comma groups mix `.tk-` with non-`.tk-` selectors; state the scope counted.
- [ ] **Stage B — nav entry + gated dynamic import** (AC: 4, 5, 6, 7)
- [ ] **Stage B — dual gating** (AC: 14, 15)
  - [ ] Verify the view-mode toggle disables the sheet, and re-enables it, without a refetch.
- [ ] **Stage B — concurrent load, cached promise, graceful degrade** (AC: 16, 17, 18)
  - [ ] Open the surface twice in one session and confirm the second open is styled.
  - [ ] Point the href at a missing file and confirm the surface still renders.
- [ ] **Stage B — verify** (AC: 8, 9, 10)
  - [ ] Network panel, player session: zero `public/js/admin/` requests.
  - [ ] ST session: list, filter, expand, edit, and confirm each write persists.
  - [ ] `admin.html` Tickets domain still works.

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

**Scope of this record: Stage A only.** Stage B is halted before implementation, not attempted and not partially done — see "Stage B halted" below. Story `Status` is deliberately left at `Approved` rather than advanced to `Ready for Review`, because advancing it would signal whole-story completion when only Stage A exists. Stage A is independently correct and independently mergeable; Ma'at gates it now on Khepri's instruction (2026-07-30).

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

### Out of scope — filed separately, not folded in

6 `tk-adm-*` classes (`tk-adm-body`, `tk-adm-error`, `tk-adm-inner`, `tk-adm-submit`, `tk-adm-title`, `tk-adm-type`) are defined in **no stylesheet at all**, including for `admin.html`. The current ST Tickets surface therefore has 6 unstyled classes in production today. Pre-existing defect, unrelated to this story; Khepri is filing it separately. Explicitly **not** folded in.

### File List

**Modified**

- `public/js/app.js` — PR1: removed `renderTicketsTab` import (`:74`) and the `if (t === 'tickets')` dispatcher branch (`:524`). 5 deletions.
- `public/index.html` — PR2: removed `<div id="t-tickets" class="tab">` (`:368`). 1 deletion.
- `public/css/suite.css` — PR2: removed the entire "Tickets tab (css-3)" section — section comment, `#t-tickets.active`, and the 28 dead `.tk-*` rules. 31 deletions (see Completion Note 3).
- `specs/stories/adm.1.p1-tickets-pilot.story.md` — this record; Stage A task checkboxes.

**Deleted**

- `public/js/tabs/tickets-tab.js` — 217 lines. Fully unreferenced after PR1.

**Net:** 249 deletions, zero additions across Stage A. No file created.

### Change Log addendum

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-30 | 1.1 | Stage A implemented (PR1 `406b6d08`, PR2 `70b8a7ad`). Stage B halted pre-implementation on the `admin-layout.css` CSS-coverage blocker; escalated and confirmed. | Ptah (DEV) |

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
