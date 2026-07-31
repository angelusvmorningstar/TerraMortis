---
epic: ADM (#1064)
adr: ADR-008 D9 (scope separation, Rev 13 emitter exclusivity), D10, D2 Rev 12
phase: 1
slice: Spheres (surface 2)
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1096
branch: piatra/issue-1096-adm-p1-spheres-impl
---

# Story ADM-2: merge the Spheres surface into index.html behind the role gate

## Status

Approved

## Story

**As a** Storyteller who currently opens a second application to read the influence-sphere standings,
**I want** Spheres to render inside the main app, loaded only when my role warrants it,
**so that** the merge pattern is proven a second time — and so we learn whether the rig built for Tickets actually carries, or only worked once.

## Acceptance Criteria

1. Spheres renders inside `index.html` for an ST, from `admin/spheres-view.js`. No second implementation.
2. An ST reaches it via a new `stOnly` nav entry.
3. `admin/spheres-view.js` loads by dynamic `import()`, gated on `getRole()` — not `effectiveRole()`.
4. `index.html` provides a container with id `spheres-content`. **`spheres-view.js` is not modified.**
5. The sphere family is extracted **by emitter set** into buckets (ADR-008 Rev 13), declarations copied unchanged:
   - emitted by `spheres-view.js` only → `public/css/admin-spheres.css`
   - emitted by two or more surfaces → `public/css/admin-shared.css`, **emitter set recorded beside each class**
   - emitted only by an unmoved surface, or by nothing → left in `admin-layout.css`
6. The surface's load path injects **both** sheets. `admin.html` static-links both (transitional until P3).
7. `admin-leak-gate.py` shows no increase over the blessed baseline of zero.
8. **Negative limb (D2 Rev 12):** demonstrate nothing player-facing regressed. Downtime first, while a cycle is open.
9. `admin.html`'s Spheres domain continues to work unchanged.

### Invariants

10. No admin module modified, `spheres-view.js` included.
11. No new `effectiveRole()` call site beyond the sheet-visibility one in `applyRoleRestrictions()`.
12. Nothing in the downtime path touched.

## Dev Notes

### Why Spheres was chosen

Product direction applied the move/retire/defer rule: Documents is **purged** after the merge (retire — moving it is discarded work); ST-Mods Audit **remains but is retooled** with a new data interface (defer); Spheres **remains as-is** (move). The only one of the three where the work survives the app split.

### No Stage A

Unlike Tickets there is no dead player-side copy — `suite.css` and `components.css` define zero sphere rules. Single stage.

### The structural difference from Tickets

`initTicketsView(containerEl)` took a container. `initSpheresView()` takes **no arguments** and calls `document.getElementById('spheres-content')` internally (`spheres-view.js:29`). Handled by nesting: outer `#t-spheres` for `goTab` to resolve, inner `#spheres-content` for the module — two elements, because one cannot carry both ids. No signature change, so the module stays unmodified.

The error path writes to the **inner** container. Replacing the tab would destroy `#spheres-content`, and a retry could never find it.

### Emitter exclusivity — the precondition this surface added

All three existing preconditions passed and the extraction was still not per-surface: the family is emitted by both `spheres-view.js` and `downtime-views.js`. See ADR-008 Rev 13.

**Extract by what the surface emits, not by name prefix.** The count gap was never a convention difference — 49 = 31 `.sph-*` + 18 `.sphere*`, two separate prefix families merged only by a substring search.

## Testing

- `admin-leak-gate.py` and `write-path-inventory.py --touches origin/dev`, exit codes captured directly, never through a pipe
- Browser, ST: the surface renders; `admin.html`'s Spheres domain unchanged (**highest risk — its rules now arrive from two new files**); the pyramid, since `.spheres-grid`'s second definition overrides the first
- Browser, player: downtime opens and submits normally against the open cycle

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-31 | 1.0 | Approved. Written after implementation began — ACs originated in issue #1096; created so the Dev Agent Record and QA Results have their usual home. | Khepri (SM) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
