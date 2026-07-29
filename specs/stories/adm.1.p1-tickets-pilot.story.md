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

Draft

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
8. **Network-panel check, not a code assertion:** a player session fetches **zero** modules from `public/js/admin/`.
9. An ST can list, filter, expand and edit a ticket in the merged surface — status, ST note, title, body, priority — and the writes persist.
10. `admin.html`'s Tickets domain continues to work unchanged. It is retired in P3, not here.

### Invariants

11. **D7.1** — no write-path inventory entry is touched. A diff touching one is the ADR-007 D7 escalation, not a judgement call.
12. **D7.2** — every new `effectiveRole()` call site is a review stop.
13. No `components.css` promotion in this story. Tickets carries zero collisions after Stage A.

## Tasks / Subtasks

- [ ] **Stage A PR1 — dereference** (AC: 1)
- [ ] **Stage A PR2 — delete** (AC: 2, 3)
  - [ ] Confirm by word-boundary check that no surviving `.tk-*` emitter exists outside `tickets-tab.js` before deleting the 28 rules.
- [ ] **Stage B — nav entry + gated dynamic import** (AC: 4, 5, 6, 7)
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

### Out of scope

- **`admin-layout.css`'s 47 `.tk-*` rules.** Whether the merged surface needs them, or a subset promoted, is a P2 question. Stage B renders correctly by loading what exists, not by rewriting styling.
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

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
