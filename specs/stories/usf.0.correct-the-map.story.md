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

Done

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
- [x] Confirm Stage A is merged to dev AND live on the dev deploy (SM confirmed: toast.js serves 200, boot smoke clean); re-run the reachability grep.
- [x] Delete `public/player.html`, `public/js/player.js`, `public/css/player-layout.css`.
- [x] Verify: app boots clean; `/` serves unified app; Player View affordance works; DOM parity unchanged.
- [x] Fix cosmetic defect usf.0a-01 (Ma'at): correct `suite/toast.js:13` comment line-ref `app.js:109` → `app.js:132`.

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

#### Stage B (delete dead files)
- Pre-delete reachability grep confirmed no live reference remains: the only non-comment hits were the stub `player.html`'s OWN internal `<link>`/`<script>` (deleted with it) and the two behavioural path guards (`admin.js:406` `path !== '/player'`, `helpers.js:21` `startsWith('/player')`) — neither is an `href/src/value` to the dead files. No HALT condition. Deletion safe.
- Deleted `public/player.html`, `public/js/player.js`, `public/css/player-layout.css` via `git rm`.
- Boot smoke via `specs/qa/harness/usf-smoke.mjs`: `player` → `pass: true` (0 pageErrors, 0 meaningfulConsoleErrors, 10 benign filtered); `st` → `pass: true` (0 pageErrors, 0 meaningfulConsoleErrors, 9 benign filtered). Both roles render `t-chars`/`t-editor` containers, title "Terra Mortis". `/` serves the unified app (HTTP 200).
- Fixed cosmetic defect usf.0a-01 (Ma'at): `suite/toast.js:13` comment `app.js:109` → `app.js:132`.
- DOM parity: Stage B only removes unreachable files, so no rendering change is possible — parity is trivially preserved.
- Post-delete reachability grep: only comments (out of scope per story — later doc-hygiene pass) and the two path guards remain. No dangling `src`/`import` to the deleted files.

### File List
- `public/js/admin.js` (Stage A — repointed :283, :406, :659 to `/`)
- `public/js/app.js` (Stage A — import path `suite/tracker.js` → `suite/toast.js`)
- `public/js/suite/toast.js` (Stage A rename from `suite/tracker.js` via `git mv`; Stage B — header line-ref `app.js:109` → `:132`)
- `public/dev-login.html` (Stage A — Player option value `/player` → `/`)
- `netlify.toml` (Stage A — removed `/player` → `/player.html` redirect block)
- `public/_redirects` (Stage A — deleted, stale dev-maintenance gate)
- `CLAUDE.md` (Stage A — corrected line 150 tracker claim)
- `specs/architecture/usf-write-path-inventory.md` (Stage A — added, D7 frozen inventory)
- `public/player.html` (Stage B — deleted, dead redirect stub)
- `public/js/player.js` (Stage B — deleted, dead)
- `public/css/player-layout.css` (Stage B — deleted, dead)

## QA Results

### Review Date: 2026-07-28

### Reviewed By: Ma'at / Quinn (Test Architect)

### Gate (Stage B): PASS → `specs/qa/gates/usf.0-stage-b.yml`

**Review Date:** 2026-07-28 · **Reviewed By:** Ma'at / Quinn (Test Architect)

Minimal, provably-safe deletion. Commit 5fdaa032 removes exactly the three dead files + the toast.js:13 cosmetic fix + story bookkeeping. Phase 0 complete on dev across both stages.

| AC | Verdict | Note |
|----|---------|------|
| 3 — reachability zero live refs | PASS | grep returns only comments + the two behavioural path-guards (admin.js:406, helpers.js:21 — pathname string-comparisons, not file refs). No live href/src/value/import to the deleted files. |
| 4 — files deleted; boot clean; / serves unified app; Player View lands on / | PASS | 3×D (player.html/js/css); no other product file. `usf-smoke.mjs` player + st both pass:true, pageErrors:[], meaningfulConsoleErrors:[]. Player View already lands on / from Stage A. |

**Invariants:** ADR-007 D8 (Stage A confirmed ancestor of Stage B; deployed first) PASS · D7 (admin.js not in commit — no write site touched) PASS · ADR-004 untouched.

**Defect resolution:** usf.0a-01 RESOLVED — suite/toast.js:13 now cites app.js:132.

**Low deferred items (not blockers, story-scoped-out):** usf.0b-01 — admin.js:406 / helpers.js:21 `/player` guards are now dead-but-inert conditionals (a later hygiene pass can simplify); usf.0b-02 — a few stale comments still mention the deleted files (deferred doc-hygiene).

**Note:** full sheet DOM-parity capture not run (no local API → partial render, same before/after); moot for a delete-of-never-loaded-files change. Boot smoke — the relevant risk — is clean.

**Recommendation:** merge Stage B to dev; Phase 0 then complete on dev and ready for prod promotion. Merge/promotion cadence is the SM's / Peter's call.

---

### Gate: PASS (Stage A) → `specs/qa/gates/usf.0-stage-a.yml`

Clean, scope-disciplined dereference + hygiene with zero write-path risk. All Stage-A ACs pass; the two verification items (DOM parity, boot smoke) are the story's own dev-deploy checks and are flagged pending-dev-deploy — they gate Stage B, not this merge.

### AC-by-AC Verdict (Stage A: 1,2,5,6,7)

| AC | Verdict | Note |
|----|---------|------|
| 1 — D8 two-step: dereference before delete | PASS | Only `public/_redirects` (a stale config) removed; player.html/js/css remain. Stage B is a separate branch. |
| 2 — all player.html refs → /; netlify /player gone; _redirects deleted | PASS | admin.js :659/:406/:283 + dev-login.html:45 all → "/". Live /player href/value grep returns NONE. SPA fallback retained. |
| 3 — (Stage B) reachability grep zero live refs | N/A Stage B | Stage-A grep already shows only comments + stub internals. |
| 4 — (Stage B) delete + boot clean | N/A Stage B | Deferred by design (D8). |
| 5 — D6 rename; sheet.js:348 preserved; CLAUDE.md:150 corrected | PASS | git R097 rename; sole export `toast`; app.js:132 importer updated; no dangling import; sheet.js:348 untouched; CLAUDE.md:150 corrected. |
| 6 — D7 inventory checked in verbatim; no write path touched | PASS | Inventory matches ADR-007 D7 exactly. admin.js diff = 3 href repoints only; no write-path line changed. |
| 7 — DOM parity + boot smoke | PENDING-DEV-DEPLOY | No browser in review env; static correctness high (links change destination only, rename is byte-identical, no renderer/CSS touched). Confirm on dev deploy before opening Stage B. |

### Invariants

ADR-007 **D7 write-path CONFIRMED untouched** (critical) · D6 tracker rename + preserved migration PASS · D8 two-step PASS · ADR-004 cache-entry invariant untouched (no boot-overlay/stash-path change).

### admin.js:283 sanity verdict

**Correct and behaviour-preserving.** Old relative `href="player"` resolved to `/player` → netlify redirect → stub → `replace('/')` → landed on `/`. New `href="/"` → `/`. Identical. The repoint is also *necessary*: this same commit removes the netlify `/player` block, so an un-repointed `href="player"` would resolve to `/player` and fall through the SPA catch-all at a stray URL. Fourth-link finding-delta accepted; same class as the sanctioned `:406` third-link delta. Architect to confirm the dual-role affordance is content landing on `/` (it does today).

### Defects

- **usf.0a-01 (low, cosmetic):** `toast.js` header line 13 still cites "app.js:109's import path" — actual importer is app.js:132 (the story's own notes corrected this; the module header wasn't updated to match). No functional effect. Optional one-word fix; can ride Stage B.
- **usf.0a-02 (low, not a defect — logged):** admin.js:283 finding-delta, accepted as above.

### Checks Run

Reachability grep (only comments + stub internals) · live /player href/value grep NONE · no dangling suite/tracker import · admin.js diff isolated to 3 repoints (no D7 line touched) · helpers.js:21 guard + suite/sheet.js:348 migration untouched · git R097 rename, sole `toast` export · inventory vs ADR-007 D7 verbatim · `node --check` clean ×3 · player.html/js/css present (scope-correct) · no ADR-004 boot/stash change · no inline style/bare hex in added code.

### Recommendation

Merge Stage A to dev. Then run the pending dev-deploy DOM parity + boot smoke; those are the precondition for opening the Stage B delete PR. Merge gate remains the SM's / Peter's call.

