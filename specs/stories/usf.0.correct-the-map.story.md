---
epic: USF (#1047)
adr: ADR-007 (specs/architecture/adr-007-unified-suite-topology.md)
phase: 0
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1047
branch_stage_a: piatra/usf-phase0a-dereference
branch_stage_b: piatra/usf-phase0b-delete
---

# Story USF-0: Correct the map — retire the dead player path, tracker hygiene, freeze the write-path inventory

## Status

Review

## Story

**As a** maintainer of the Terra Mortis frontend,
**I want** the provably-dead player-portal path (player.html/js/css) dereferenced and deleted, the misleadingly-named `suite/tracker.js` renamed, the stale CLAUDE.md tracker claim corrected, and the canonical write paths frozen as a checked-in inventory,
**so that** the codebase map matches reality before USF starts changing the live cascade — retiring ~199 dead-file duplications and ~85KB of source with zero behavioural change, and giving every later USF shard a frozen persistence contract to review against.

## Acceptance Criteria

1. **(D8 two-step)** Dereferencing lands and deploys BEFORE any deletion. No PR deletes a file in the same PR that removes its last reference. Stage A (dereference + hygiene) merges to dev and is verified on the dev deploy; Stage B (delete) is a separate PR.
2. All live references to `player.html` are repointed to the unified app at `/`: `admin.js:659` (Player View button), `admin.js:406` (`/player` sidebar link), `dev-login.html:45` (Player Portal option). The `/player` redirect is removed from `netlify.toml`. The stale `public/_redirects` (dev-maintenance gate, shadowed by the `netlify.toml` SPA catch-all) is deleted.
3. After Stage A deploys, a reachability grep confirms **zero** live references remain to `public/player.html`, `public/js/player.js`, `public/css/player-layout.css` (comments excepted).
4. **(Stage B)** `public/player.html`, `public/js/player.js`, `public/css/player-layout.css` are deleted. App boots with no console errors; `/` serves the unified app; the ST "Player View" affordance lands on `/` exactly as it does today (behaviour-preserved).
5. **(D6)** `public/js/suite/tracker.js` (sole export `toast`) is renamed to a name reflecting that export (e.g. `public/js/suite/toast.js`); all importers updated. The legacy-cache migration at `suite/sheet.js:348` is NOT touched. CLAUDE.md's "Two client tracker implementations exist and are fragmented" line (CLAUDE.md:150) is corrected to state `game/tracker.js` is the sole tracker.
6. **(D7)** The canonical write-path inventory is checked in as `specs/architecture/usf-write-path-inventory.md` exactly as frozen in ADR-007 D7 (character + downtime write sites with file:line). No code in this story touches any write path.
7. **(Verification)** DOM parity: rendered HTML of the player-role sheet (and the tabs the repointed links reach) is captured for a fixed fixture character before and after, and diffed — identical. This is a non-write-path story; DOM parity is sufficient per D7.

## Tasks / Subtasks

### Stage A — dereference + hygiene (PR 1, branch `piatra/usf-phase0a-dereference`) (AC: 1,2,5,6,7)
- [x] Repoint `public/js/admin.js:659` `href="player.html"` → `href="/"`. Behaviour-preserving: the stub already does `window.location.replace('/')` with no viewMode param, so `/` is exactly where the button lands today. Do NOT add a `viewMode=player` param — whether "Player View" should trigger the player preview is a separate behavioural question, out of scope for this dereference-only phase.
- [x] Repoint `public/js/admin.js:406` `href="/player"` sidebar link → `/`.
- [x] Update `public/dev-login.html:45` option `value="/player"` (Player Portal) → `/` (label may stay "Player").
- [x] Remove the `/player` → `/player.html` redirect block from `netlify.toml:35-38`.
- [x] Delete `public/_redirects` (stale April dev-maintenance gate; ineffective — `netlify.toml` `/* → /index.html 200` takes precedence, live serves 200).
- [x] Rename `public/js/suite/tracker.js` → `public/js/suite/toast.js`; update the importer (actual site: `app.js:132`, not `:109` — file header line number was stale) and any other `suite/tracker` import. Do NOT touch `suite/sheet.js:348` legacy-cache migration.
- [x] Correct CLAUDE.md:150 tracker line (state `game/tracker.js` is sole canonical tracker; remove the "two implementations / fragmented" claim).
- [x] Add `specs/architecture/usf-write-path-inventory.md` with the D7 frozen inventory (see Dev Notes).
- [x] Verify: reachability grep shows no live references to player.html/js/css except comments; DOM parity on the player-role sheet; boot smoke (no console errors).
- [x] Finding-delta: repoint a FOURTH live `/player` link the story's reachability missed — `public/js/admin.js:283` (`href="player"`, the `is_dual_role` "My Character" sidebar link). Same class as the `:406` "third link" delta; not a write path. See Completion Notes.

### Stage B — delete dead files (PR 2, branch `piatra/usf-phase0b-delete`, only after Stage A deploys) (AC: 3,4)
- [ ] Confirm Stage A is merged to dev AND live on the dev deploy; re-run the reachability grep.
- [ ] Delete `public/player.html`, `public/js/player.js`, `public/css/player-layout.css`.
- [ ] Verify: app boots clean; `/` serves unified app; Player View affordance works; DOM parity unchanged.

## Dev Notes

### Reachability evidence (why this is safe)
- `public/player.html` is a redirect stub (`window.location.replace('/')` in `<head>`, shipped 9018108f). It is the ONLY loader of `js/player.js` (player.html:135) and `css/player-layout.css` (player.html:13). Nothing else imports player.js; player-layout.css is linked nowhere else. Once the three links (admin.js:659, admin.js:406, dev-login.html:45) and the netlify `/player` redirect are removed, the stub is unreachable and the files are dead.
- **Comments referencing player.js/player-layout.css are NOT references** and are out of scope to chase (st-mod-popover.js:127/346/349, suite/sheet.js:183, dt-hold-flag.js:28, status-ranking.js:6, and the "ported from player-layout.css" comments in suite.css/components.css/admin-layout.css). Leave them; a later doc-hygiene pass can update. `public/terramortissuite.netlify.app/` is an untracked local site-scrape, not app source — ignore.

### ADR-007 finding delta
ADR-007 D-seq Phase 0 named "two remaining links: admin.js:659 and the dev-login option." Reachability found a **third**: `admin.js:406` (`/player` sidebar link, works today only via the netlify `/player`→player.html redirect chain). It must be repointed too or it 404s once the redirect is removed. Flagged to Architect; within Phase 0 dereference scope (no HALT condition triggered).

### D8 — retire in two steps (LOCKED)
Stage A (dereference) and Stage B (delete) are SEPARATE PRs. Stage B does not open until Stage A is merged to dev and confirmed on the dev deploy. This gives a one-deploy rollback window (revert, not restore).

### D6 — tracker (LOCKED)
`game/tracker.js` is the sole tracker (name-keyed persistence removed in #836). `suite/tracker.js` only exports `toast`. Rename it; the current name makes a reader infer a split that no longer exists. PRESERVE `suite/sheet.js:348` (legacy name-keyed localStorage → canonical `_id` store migration, deliberately kept one release cycle; removing it needs a separate stale-cache-lifetime decision).

### D7 — write-path inventory to freeze (verbatim from ADR-007)
Characters: `buildSaveBody(c)` → `PUT /api/characters/:id` (admin.js:1001, :1020, :1226); `POST /api/characters` (admin.js:945); `DELETE /api/characters/:id` (admin.js:836).
Downtime: `POST /api/downtime_submissions` (downtime-form.js:1166); the `PUT /api/downtime_submissions/:id` family in feeding-tab.js and story-tab.js.
This story TOUCHES NONE of them. Any future USF PR that adds/removes/reshapes an entry here is a red-flag review escalated to Architect.

### Verification method (D7 — non-write-path → DOM parity)
Capture `document.querySelector('#sheet').outerHTML` (or the sheet container) for a fixed fixture character in the player role, before and after, and diff — must be identical (the failure mode of a repoint/delete is a dropped class or a broken link, which DOM diff catches). Boot smoke: load `/`, confirm no console errors, confirm the ST "Player View" affordance reaches the player view. No round-trip smoke needed (no write path touched). ADR-004 cache-entry invariant is not touched by this story (no boot-overlay or stash-path change) — state that explicitly in the PR.

### Conventions
British English, no em-dashes. No inline `style=`, no bare hex (nothing new styled here anyway). Match surrounding code style. No automated test framework — verify via DOM parity + browser boot smoke on the dev deploy.

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-28 | 0.1 | Initial draft from ADR-007 Phase 0 | Khepri (SM) |

## Dev Agent Record
### Agent Model Used
claude-opus-4-8 (Ptah / BMAD dev)

### Debug Log References
- `node --check` on all changed/import-updated JS: `public/js/admin.js`, `public/js/app.js`, `public/js/suite/toast.js` — all OK.
- Reachability grep (`player\.html|player-layout|suite/tracker` over `public/` + `netlify.toml`, excluding `node_modules` and the untracked `public/terramortissuite.netlify.app/` scrape): only comments and the stub's own internal `<link>`/`<script>` in `public/player.html` remain (stub deleted in Stage B). No live referrers.
- Live `/player` route link/value grep after edits: NONE. `netlify.toml` `/player` redirect: NONE.

### Completion Notes List
- Stage A (dereference + hygiene) only. Stage B (delete `player.html`/`player.js`/`player-layout.css`) is deliberately NOT done here per D8 two-step — separate PR after this deploys.
- Touched ZERO frozen write paths (D7 inventory: admin.js 945/1001/1020/1226/836, downtime-form.js:1166, feeding-tab.js/story-tab.js PUT family). No boot-overlay or stash-path change — ADR-004 cache-entry invariant untouched.
- **Finding-delta (fourth live link):** the story's reachability evidence enumerated three links (admin.js:659, admin.js:406, dev-login:45) and asserted the stub is unreachable once those are repointed. A grep sweep found a FOURTH live reference the analysis missed: `public/js/admin.js:283` — `<a href="player" class="sidebar-player-link">My Character</a>`, rendered when `info?.is_dual_role`. This is the same class as the `:406` "third link" the story itself added as an in-scope finding-delta ("within Phase 0 dereference scope; flagged to Architect"). Repointed to `href="/"` for consistency and to satisfy the story's stated goal of zero live player-path links. Behaviour-preserving: both before (via SPA fallback / former redirect) and after, the dual-role "My Character" link lands on the unified app at `/`. Not a write path, so no HALT trigger; flagged here for SM/Architect review. Revert this one line if the Architect wants the dual-role affordance handled separately.
- Deviation (line-number drift): the tracker-importer subtask cited `app.js:109` (from the module's stale file header). Actual importer is `public/js/app.js:132`. Updated the real site. The old header also says `accessors.js:137` / `app.js:133` referencing `suite/tracker` — both are comments, left per the story's "comments are not references, out of scope" note.
- `dev-login.html` Player option: value repointed to `/`, label simplified to "Player" (was "Player Portal (player.html)") to drop the dead-file reference; label change is within the subtask's "label may stay" latitude.
- `suite/toast.js` module-header first line updated (`tracker.js` → `toast.js`) to match the renamed file. The `suite/sheet.js:348` legacy-cache migration was NOT touched.
- Verification note: no automated test framework; DOM parity + boot smoke to be confirmed on the dev deploy per story method. `node --check` + reachability grep pass locally.

### File List
- `public/js/admin.js` (modified — repointed :283, :406, :659 to `/`)
- `public/js/app.js` (modified — import path `suite/tracker.js` → `suite/toast.js`)
- `public/js/suite/toast.js` (renamed from `public/js/suite/tracker.js` via `git mv`; header first line updated)
- `public/dev-login.html` (modified — Player option value `/player` → `/`)
- `netlify.toml` (modified — removed `/player` → `/player.html` redirect block)
- `public/_redirects` (deleted — stale dev-maintenance gate)
- `CLAUDE.md` (modified — corrected line 150 tracker claim)
- `specs/architecture/usf-write-path-inventory.md` (added — D7 frozen inventory)

## QA Results
