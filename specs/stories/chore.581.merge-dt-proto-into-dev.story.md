# Story Chore.581: Merge the DT processing prototype into dev, against the live data dev already points to

## Status: ready-for-dev

> **Decisions resolved 2026-06-05** (see "Decisions for Angelus" below): harness is KEPT as a permanent offline playground (1b); proto is the intended REPLACEMENT for the production DT view, so conflicts resolve in proto's favour on DT-view files while dev's 2 newer non-DT commits are preserved (2); dev-only scope (3). The merge itself is mechanical from here.

## Metadata
- issue: 581
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/581
- branch: morningstar-issue-581-merge-dt-proto-dev
- source branch (the work): ms/dt-processing-proto (13 commits ahead of origin/dev, latest 2026-05-28, never pushed)
- type: chore / integration
- supersedes framing: the issue body assumed `dt-proto.html` needs "rewiring to live data". Pickup analysis proved that wrong (see Background). The real admin DT view is already on live data; the merge itself delivers the goal.

---

## Story

**As** Angelus, integrating the prototype work,
**I want** the DT processing prototype merged into `dev` so its features run in the real admin downtime view against the live data `dev` already points to,
**so that** the proto.1-16 improvements (filter engine, flat card wall, snapshot intelligence panel, sorcery card + pool builder) are exercisable on the dev site with real characters, cycles and submissions, not local fixtures.

---

## Background

### The key finding (why the issue is re-scoped)

The "DT prototype" is **not a separate codebase**. `public/dt-proto.html` is a thin dev harness; all the substantive work lives in the **shared production module** `public/js/admin/downtime-views.js`, which the **real admin app already imports** (`public/js/admin.js:27`). The branch's own sprint-status header states it plainly:

```
# DT PROCESSING PROTOTYPE — branch ms/dt-processing-proto
# Uses same downtime-views.js as production; proto-only entry point dt-proto.html.
# Data fixtures in gitignored public/dt-proto-data/ (local only).
```

Consequence: merging the branch lands proto.1-16 directly in the live admin DT processing view (`/admin`), which **already** reads live production data via `/api/*` (Netlify proxies `from = "/api/*"` to `https://tm-suite-api.onrender.com`, `netlify.toml:17-19`) behind the existing ST auth. There is nothing to "rewire" for the real view to see real data.

### What the harness actually is

`public/js/dt-proto-boot.js` loads four static JSON files from the gitignored `/dt-proto-data/` (submissions, cycles, territories, characters), then installs a **fetch shim** that intercepts every `/api/` call and returns those fixtures (and fakes `auth` as `{role:'st'}`, `tracker_state` as 404, etc.). It exists so the DT view could be iterated fast, with no auth and no live backend. The real admin app never touches it. So the harness is scaffolding, not product.

### What the merge brings in (diff vs origin/dev, 33 files, +4801 / -1207)

- Product code (shared with the live admin app):
  - `public/js/admin/downtime-views.js` (the bulk, ~2839 lines changed) — proto.1-16 features
  - `public/css/admin-layout.css` (~746 lines) — flat card wall, filter bar, snapshot panel, pool builder chrome
  - Small (4-12 line) touches: `public/js/admin.js`, `public/js/editor/sheet.js`, `public/js/editor/identity.js`, and several `public/js/admin/*.js` + `public/js/components/map-overlay.js` (mostly the "strip honorific from admin character name display" change)
- Harness (dev-only): `public/dt-proto.html`, `public/js/dt-proto-boot.js` (fixtures `public/dt-proto-data/` are gitignored and do not travel)
- Specs/docs: `specs/architecture/proto-snapshot-field-map.md`, 18 `specs/stories/proto.*.story.md` files, and `specs/stories/sprint-status.yaml` (proto.1-16 + task-sa registered, all at `review`)

### Testability is clean (unusual for this project)

The diff has **zero `server/` changes** (verified: `git diff --stat origin/dev...ms/dt-processing-proto -- server/` is empty). Most recent stories carry the "not testable on dev until main" caveat because dev's frontend proxies `/api/*` to the production API built from `main`. This story is **all client-side** (`public/*`) plus specs, so a dev smoke check on `/admin` is fully valid the moment it deploys.

### Merge is not trivially clean

`git merge-tree` shows overlapping ("changed in both") regions in `downtime-views.js`, `admin-layout.css`, and `sprint-status.yaml`. The proto branch last merged `origin/dev` at `5b033c3` ("resolve conflicts in favour of proto"), and `dev` has since advanced 2 commits (e.g. the `public/js/app.js` fast-forward). Conflicts must be resolved deliberately, not auto-favoured, so dev's newer commits are preserved.

---

## Decisions for Angelus (RESOLVED 2026-06-05)

1. **Fate of the dev harness — RESOLVED: (b) KEEP as-is.** `public/dt-proto.html` + `public/js/dt-proto-boot.js` stay, deliberately, as a permanent **offline playground**: Angelus's space to experiment with the DT view without needing an API or auth. The fetch shim + gitignored `dt-proto-data/` fixtures are the feature, not scaffolding. It stays dev-only (players never see `/admin` or the proto page). The harness will fail to load fixtures on the deployed site, which is expected and fine: it is a local-only tool. NOT retired, NOT re-pointed to live data.

2. **Merge-conflict resolution policy — RESOLVED: proto overrides the existing DT view.** The intent is that the prototype **replaces** the existing production DT processing view, so on the DT-view files (`downtime-views.js`, `admin-layout.css`) conflicting hunks resolve in **proto's favour**. BUT dev's 2 newer commits (and anything dev changed outside the DT view) are preserved, not reverted. For `sprint-status.yaml`, union the entries (keep dev's recent issue-stories AND the proto.1-16 block).

3. **Scope — RESOLVED: dev only.** Merges to `dev` only (PR then merge, per protocol). No `main` merge unless instructed separately.

---

## Acceptance Criteria

- [ ] **AC1** — `ms/dt-processing-proto` is merged into this branch then into `dev` (PR first, then merge). All 13 proto commits' work is present; dev's 2 newer commits are preserved; no proto.1-16 feature is lost to a conflict resolution.
- [ ] **AC2** — On the dev site, the **real** admin DT processing view (`/admin`, Downtime domain) shows the proto.1-16 features running against **live prod data** via `/api/*`: filter bar + char-chip strip, flat card wall (no phase accordions), the snapshot intelligence panel (sibling actions, discipline ratings, territory presence, blockers, hide/protect, investigate, sorcery, feeding), and the sorcery card rite header + pool builder.
- [ ] **AC3** — The harness is KEPT untouched (Decision 1b): `public/dt-proto.html` and `public/js/dt-proto-boot.js` remain on `dev`, the fetch shim is left intact, and `dt-proto-data/` stays gitignored. The local playground still boots at `http://localhost:8080/dt-proto.html` against fixtures after the merge (the proto `downtime-views.js` it loads is exactly what lands, so no breakage).
- [ ] **AC4** — `sprint-status.yaml` after merge contains BOTH dev's recent issue-story entries and the proto.1-16 + task-sa block (no clobber either way); `last_updated` note added.
- [ ] **AC5** — The merge introduces no `server/` changes (re-verify the diff), confirming a dev smoke check is valid; ST smoke on dev `/admin` DT processing passes (loads, filters, opens a card, renders the snapshot panel against a real cycle).

---

## Tasks

### Task 1 — Sync and merge (AC1)
On `morningstar-issue-581-merge-dt-proto-dev` (already cut from current `dev`): `git merge ms/dt-processing-proto`. Resolve conflicts per Decision 2 in `downtime-views.js`, `admin-layout.css`, `sprint-status.yaml`. Do not blanket-favour either side; read each conflicting hunk.

### Task 2 — Keep the harness (AC3)
Per Decision 1b: leave `public/dt-proto.html` and `public/js/dt-proto-boot.js` untouched; do not delete, do not strip the shim. After merge, sanity-check the playground still boots offline at `http://localhost:8080/dt-proto.html` against local `dt-proto-data/` fixtures (it loads the proto `downtime-views.js`, which is what the merge lands, so it should be unaffected).

### Task 3 — Reconcile sprint-status (AC4)
Union the `development_status` entries and the proto section header comment. Add a `chore-581-merge-dt-proto-dev` entry and update the `last_updated` header note.

### Task 4 — Verify + smoke (AC2, AC5)
Re-run `git diff --stat origin/dev...HEAD -- server/` (expect empty). Open PR into `dev`. After merge/deploy, ST smoke on dev `/admin`: load Downtime, confirm filter bar, flat card wall, snapshot panel and sorcery/pool builder render against a live cycle.

---

## Dev Notes

### Files / artifacts
- `public/js/admin/downtime-views.js` — the shared product module (proto changes here ARE live-admin changes). Largest conflict surface.
- `public/js/admin.js:27` — imports `initDowntimeView` from `downtime-views.js`; this is why the real admin app inherits the proto work.
- `public/css/admin-layout.css` — second conflict surface (panel/card/filter chrome).
- `public/dt-proto.html`, `public/js/dt-proto-boot.js` — the dev harness (shim + fixtures). Subject of Decision 1.
- `netlify.toml:17-19` — `/api/*` proxy to `tm-suite-api.onrender.com` (why dev sees live prod data).
- `public/_redirects` — dev is in player-maintenance mode but `/admin` stays accessible for ST work, so the merged view is reachable for smoke.
- `specs/architecture/proto-snapshot-field-map.md`, `specs/stories/proto.*.story.md` (18 files) — incoming docs.

### Must preserve / watch-outs
- Do NOT auto-resolve the merge wholesale in favour of the proto branch: `dev` has 2 commits the proto branch has not seen (post-`5b033c3`); blanket "favour proto" would revert them.
- The fixtures `public/dt-proto-data/` are gitignored and local-only; they are not part of the merge and must not be added.
- No `server/` changes should appear in this branch. If a conflict tempts a server edit, stop: that is out of scope and breaks the "testable on dev" property.
- The proto.1-16 stories arrive at status `review`, not `done`. This merge does not mark them done; that is a later review/QA step.
- Per CLAUDE.md: `dev` only. No push/merge to `main` without an explicit instruction.

### References
- [Source: public/js/admin.js:27] — shared `downtime-views.js` import
- [Source: netlify.toml:17-19] — `/api/*` -> prod Render proxy
- [Source: ms/dt-processing-proto:specs/stories/sprint-status.yaml] — proto section header + proto.1-16 statuses
- `reference_dev_frontend_prod_api` — dev proxies `/api/*` to prod (here it works FOR us: client-only change, live data, dev-testable)
- [GitHub issue #581] — https://github.com/angelusvmorningstar/TerraMortis/issues/581 (body assumes a rewire; this story corrects the framing)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
