---
epic: ADM (#1064)
adr: ADR-008 D4/D5/D5a (Rev 3)
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
2. **PR2 (delete):** `public/js/tabs/tickets-tab.js`, the `#t-tickets` div at `index.html:368`, and the 28 dead `.tk-*` rules in `suite.css` are deleted.
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
12. **Derive the rule count from the tree; do not take it from this story.** SM measured 47, the Architect measured 48. Neither number is authoritative and the discrepancy is exactly why D8 rule 4 exists. Record what you measured and how.
13. `index.html` **injects** the sheet from the same gated load path as the module. `admin.html` **static-links** it while it still exists. The asymmetry is transitional and ends at P3 when `admin.html` retires — it is not an inconsistency.
14. **Injection gates on `getRole()`** (authority: should this session ever load it?).
15. **Application gates on `effectiveRole()`** (visibility: should it apply right now?), enforced by toggling `link.disabled` inside `applyRoleRestrictions()`. Use `disabled`, not element removal, or every view toggle costs a refetch.
16. Module and stylesheet fetches are **concurrent, both awaited before render** — no unstyled flash, no added round trip.
17. Idempotency **caches the load promise**, keyed by href. A presence-check on the `<link>` element is a bug: a second caller passes the guard while the sheet is still in flight and renders unstyled, and only on the second open.
18. A stylesheet failure **degrades, it does not fail**. Catch the link's error and render unstyled rather than throwing, so a bad href costs styling and not the whole surface.

### Invariants

11. **D7.1** — no write-path inventory entry is touched. A diff touching one is the ADR-007 D7 escalation, not a judgement call.
12. **D7.2** — every new `effectiveRole()` call site is a review stop.
13. No `components.css` promotion in this story. Tickets carries zero collisions after Stage A.

## Tasks / Subtasks

- [ ] **Stage A PR1 — dereference** (AC: 1)
- [ ] **Stage A PR2 — delete** (AC: 2, 3)
  - [ ] Confirm by word-boundary check that no surviving `.tk-*` emitter exists outside `tickets-tab.js` before deleting the 28 rules.
- [ ] **Stage B — surface stylesheet** (AC: 11, 12, 13)
  - [ ] Derive the `.tk-*` rule count from the tree; record the number and the method.
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

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
