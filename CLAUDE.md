# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## !! HARD RULE: Git Push and Merge

**NEVER push to origin or merge to main.** Not after a commit. Not at the end of a session. Not ever, unless the user's current message explicitly says "push", "merge to main", or "deploy".

- `commit` = `git commit` only. Nothing else.
- `merge to main` = explicit instruction, one-time, in that message only.
- A prior "commit and merge" in the same session does NOT carry forward.
- **Never work directly on `main`.** Cut a side branch from `main` first — see Branching below.
- Each Netlify/Render deploy costs money. The user controls deploy cadence.

## Project Overview

Terra Mortis TM Game is a browser-based character management system for a Vampire: The Requiem 2nd Edition campaign. Express API backend on Render, static frontend on Netlify, MongoDB Atlas for persistence, Discord OAuth for ST authentication.

## Running & Testing

- **Local frontend:** `npx http-server public -p 8080`
- **Local API:** `cd server && npm run dev` (needs `server/.env` with MongoDB URI + Discord credentials)
- **Local hooks (recommended):** `git config core.hooksPath .githooks` after cloning. Enables a parse-check on staged `public/js/**/*.js` files; catches smart-quote-as-syntax and other parse-time errors before they reach `main`. See `.githooks/README.md`.

### Tests

There **is** a test framework — two, in fact. Do not tell the user there isn't one, and do not skip
running the affected suites because a change "looks safe".

- **Unit / integration: vitest**, 171 suites in `server/tests/`. Run with `cd server && npm test`, or
  a single suite with `npx vitest run tests/<name>.test.js`.
  - Tests are forced onto `tm_game_test` by the vitest setup file. They never touch live data.
  - Several suites need a **local `mongod`**. Without one they **SKIP rather than fail** (#1117) —
    a skipped suite is not a passing suite, so read the summary line, not just the exit code.
- **E2E: Playwright**, ~150 specs in `tests/`. Run with `npx playwright test tests/<name>.spec.js`.
  - Chromium may not be installed in a fresh checkout: `npx playwright install chromium`.
  - **Never run two Playwright invocations concurrently** — they share port 8080 with
    `reuseExistingServer`.
- **Run the changed area's suites, not the whole thing.** Full runs are slow and bury the signal.
- **Known pre-existing failures** — present at base, not caused by your change (list corrected
  2026-08-15; a shebang-parse bug that had been silently masking several of these as unexplained
  `SyntaxError` failures was found and fixed that day — see `specs/deferred-work.md`'s dbo-2 entry):
  - `n7-n9-allocator-readers.test.js`, `epic.708.3-cycle-phase-controls.test.js`,
    `oath-a-pledge-helpers.test.js` — each asserts on a literal source-code snippet that has drifted
    since the test was written (`n7-n9`'s is the original, documented case, #1115; the other two are
    the same shape, previously undocumented).
  - `issue-836-legacy-tracker-cache-removed.test.js` — asserts against `public/js/suite/tracker.js`,
    which was renamed to `toast.js` elsewhere; the test never got updated to match.
  - `issue-1013-indomitable-rules-text.test.js` — two assertions blocked on the `markdown/` rulebook
    corpus genuinely not existing in this checkout (#1117); not a code defect.
  - `tests/desktop-and-css.spec.js` (12) — `#btn-desktop-toggle` never becomes visible under the
    stubbed API.
  - `tests/post-game-1.spec.js` nav-1-3 (3) — `#n-more` has never existed in `NAV_ITEMS`.
  - `tests/cycle-phase-controls.spec.js` (11) — asserts the pre-CM-1 Cycle tab: three phase buttons
    and a disabled active button. CM-1 (#1028) replaced that with the four-button
    downtime/processing/prep/game group. Stale at base, measured identical with and without CM-4a
    (added to this list 2026-08-16); wants its own cleanup story.
- Angelus **cannot run the app locally** to smoke-test. Anything needing a human look must be on a
  deployed environment first.

## Deployment

- **Frontend:** Netlify (`terramortisgame.netlify.app`), deploys from `main` branch
- **API:** Render (`tm-game-api.onrender.com`), deploys from `main` branch
- **Database:** MongoDB Atlas (`tm_game`)
- **Staging:** Netlify (`terramortis-dev`), deploys from `dev`. Team-only. Note it proxies the
  **production** Render API — so a server-side change cannot be smoke-tested there; it has to reach
  `main` first.

## Branching

**Short-lived side branch off `main`, PR straight back to `main`.** That is the whole flow.

1. Branch from up-to-date `main`: `git fetch origin && git switch -c ms/issue-<n>-<slug> origin/main`
2. Commit to that branch.
3. PR it to `main` — **only when the user says so**. Never through `dev`.
4. After the merge lands, sync `main` back into `dev` so the two stop diverging.

Naming: `ms/issue-<n>-<slug>` for Angelus's work (e.g. `ms/issue-1137-collective-pool-producer`).

### What changed, so stale advice is recognisable

- **`Morningstar` was deleted** (local and remote, 2026-08-11). It was fully contained in `main` —
  0 unique commits, 281 behind. Anything telling you to work on it, switch to it, or merge it is out
  of date. The `tm-gh-issue-pickup` skill still defaults its branch base to `dev`/`Morningstar`;
  override to `main`.
- **There is no dev-sync protocol any more.** Do not run `git merge dev` at session start, and do not
  raise "dev is ahead/behind" as an action item unless asked. `dev` flows *from* `main` now, not into
  it. Direction reversed after #1128.
- **`Piatra` is Peter's branch and he stepped back from TM Game dev (2026-08-09).** Angelus owns
  code and schema; treat `dev` as a deploy target rather than an integration stream.
- `dev` is permanent. Never delete it.

## Architecture

```
Browser (Netlify)  →  Express API (Render)  →  MongoDB Atlas
   public/              server/                  tm_game DB
```

### Admin app (`public/admin.html`)

ST-only app with Discord OAuth. Sidebar domains: Player (character grid + sheet editor), City (territories, court, influence), Downtime, Attendance & Finance, Engine (session log).

### Suite app (`public/index.html`)

Roll calculator, sheet viewer, territory tracker. Reads character data from API or localStorage cache.

### API server (`server/`)

Express 5, ES modules. Routes: `/api/characters`, `/api/territories`, `/api/chapters` (the Chapter collection, `downtime_cycles` until cm-2b), `/api/downtime_submissions`, `/api/game_sessions`, `/api/session_logs`. Auth via `/api/auth/discord`. Health check at `/api/health`.

## v2 Schema

Source of truth: `schemas/schema_v2_proposal.md`. Live data in MongoDB `tm_game.characters`.

Key design rules:
- Attributes: always `{ dots, bonus }` objects
- Skills: always `{ dots, bonus, specs: [], nine_again }` objects
- Merits: single array with `category` field (general/influence/domain/standing/manoeuvre)
- Standing merits (MCI, PT): have `benefit_grants` array; child merits have `granted_by`
- Name fields: `name` (legal), `honorific` (Lord/Lady/Doctor/Sister), `moniker` (display override)
- Display: `displayName(c)` = honorific + (moniker || name). Sort: `sortName(c)` = moniker || name
- Character retirement: `retired: true` flag, shown separately in admin grid
- **Derived stats are never stored** — size, speed, defence, health, willpower_max, vitae_max calculated at render time

  **Sanctioned exception: ST mod overlay (Epic STM).** The `applyStMods` function in `public/js/data/st-mods.js` mutates the in-memory character's derived (and base) fields per-render with signed-integer deltas from the `st_mods` collection, and writes a `_st_mod_overlay` breakdown for the popover. The canonical character document on the server is never written to from this path. See [ADR-004](specs/architecture/adr-004-st-mods-overlay.md) for the composition site, write-direction invariant (overlay never mutates `tracker_state`), and how the overlay is stripped on edit-mode entry so the editor always sees base values. Adding a second composition path or moving overlay computation server-side requires an ADR.

  **Cache-entry invariant (STM-7, ADR-004 Rev 3 §D8).** From STM-7 onward, every in-memory `chars[]` entry has `applyStMods` applied at boot via `applyOverlayToAll(chars, globalEnabled)` (one bulk fetch through `GET /api/st_mods?character_ids=<csv>`). This means the existing accessor chain — `getAttrEffective`, `getAttrTotal`, `skTotal`, `discAttrBonus`, `calcDefence`, `calcHealth`, `calcWillpowerMax` in `public/js/data/accessors.js` — transparently reads modded values for ALL consumers. Roll calculator, DT player form pool display, DT admin resolution view, and the sheet all see the same modded numbers from the same in-memory mutation; there is no per-callsite overlay logic anywhere. The only path that strips the overlay is the editor (admin edit-mode entry, via `stripOverlay`) so the editor always edits canonical values. The localStorage cache (`tm_chars_db`) must stay base-only — `charsForSave` in `public/js/editor/export.js` strips the overlay before stash so a fresh boot reapplies cleanly without compounding mods. Adding a new write site that bypasses `applyStMods` (or skipping the boot-path overlay) breaks the invariant and silently desynchronises read sites.

### XP system (dynamic)

**Earned** — derived at render time, not stored:
- Starting: always 10
- Humanity drops: `(humanity_base - humanity) * 2`
- Ordeals: `ordeals.filter(complete).length * 3`
- Game: summed from `game_sessions` collection attendance data (1 attend + 1 costume + 1 downtime + extra)

**Spent** — derived from `attr_creation`, `skill_creation`, `disc_creation`, `merit_creation` XP sums. Falls back to `xp_log.spent` where creation data is incomplete.

XP functions in `public/js/editor/xp.js`: `xpEarned()`, `xpSpent()`, `xpLeft()`, `xpGame()`, `xpStarting()`, `xpHumanityDrop()`, `xpOrdeals()`.

### XP cost rates (VtR 2e flat)

- Attributes: 4 XP/dot, Skills: 2 XP/dot
- Clan Disciplines: 3 XP/dot, Out-of-clan/Ritual: 4 XP/dot
- Merits: 1 XP/dot, Devotions: variable (per `DEVOTIONS_DB`)

## Key helpers

- `displayName(c)` / `sortName(c)` — in `public/js/data/helpers.js`
- `xpEarned(c)` / `xpSpent(c)` / `xpLeft(c)` — in `public/js/editor/xp.js`
- `loadGameXP()` — in `public/js/admin.js`, caches `_gameXP` on each character from game_sessions

## Immutable reference data (baked into JS modules)

Small fixed enums that genuinely belong in code (changing them is a rule change, not a data update):

- `CLANS` (5)
- `COVENANTS` (5)
- `MASKS_DIRGES` (26)
- `CLAN_BANES` (per-clan free-text descriptions)
- `CLAN_DISCS` (per-clan discipline lists)

All of the above live in `public/js/data/constants.js`.

**Bloodlines are not on this list any more.** `BLOODLINE_DISCS`, `BLOODLINE_CLANS` and `APPROVED_BLOODLINES` were deleted from `constants.js` by Epic BL (issue #1008); see below.

### Previously-static data now MongoDB-backed

The "everything in JS modules" pattern was the original shape, but most reference data has since migrated to MongoDB:

- **Epic PP** moved `MERITS_DB`, `DEVOTIONS_DB`, `MAN_DB`, and the rules engine into MongoDB (`purchasable_powers` collection + `rule_*` per-category collections). Live reads go through `public/js/data/loader.js` (`getRuleByKey`, `getRulesByCategory`) and the rule-engine cache at `public/js/editor/rule_engine/load-rules.js`. Server-side: `server/routes/rules.js` + `server/routes/rules-engine.js`.
- **Epic ECM** moved the equipment catalogue from `public/js/data/equipment-data.js` + `server/data/equipment-catalogue.js` (both deleted in ECM-7 #874) into the `equipment_catalogue` MongoDB collection. Live reads go through `public/js/data/equipment-catalogue-cache.js` (the shared cache module ECM-5 introduced; refetches on the `broadcastCatalogueUpdate` WS frame). Server-side: `server/routes/equipment-catalogue.js` + `server/schemas/equipment_catalogue.schema.js`. Admin CRUD lives at `public/js/admin/equipment-catalogue-admin.js`.
- **Epic BL** (#1008) moved bloodlines out of `public/js/data/constants.js` (`BLOODLINE_DISCS`, `BLOODLINE_CLANS`, `APPROVED_BLOODLINES`, all deleted in BL-3b) into the `bloodlines` MongoDB collection. Live reads go through `public/js/data/bloodlines-cache.js` (`approvedBloodlines`, `bloodlinesByClan`, `discsForBloodline`; refetches on the bloodline WS frame), and `clanDiscList`/`isInClanDisc` in `public/js/data/accessors.js` are the only in-clan implementation. Server-side: `server/routes/bloodlines.js` + `server/schemas/bloodline.schema.js`. Admin CRUD lives at `public/js/admin/bloodlines-admin.js`. The one-time migration is retired at `server/scripts/archive/seed-bloodlines.js`, which carries the 23 original bloodlines as frozen literals; do not edit them, add a bloodline on the admin screen.

### Convention

**Any new reference-data introduction must default to MongoDB-backed. Static JS modules require an explicit ADR carve-out.**

The static enums above qualify because they encode rule-system facts (the five clans, the five covenants, the 26 mask/dirge archetypes) that change only as a system-level decision. New reference data — items, merits, rules, scenes, anything ST-editable — goes into a collection. The cost of a JS module re-introduction is the same cost the Epic PP and Epic ECM cleanups paid: every new bespoke item or rule edit requires a code deploy.

## Conventions

- **British English throughout**: Defence, Armour, Vigour, Honour, Socialise, capitalise
- **No em-dashes** in output text
- **Dots display**: `'●'.repeat(n)` using U+25CF filled circle
- **Gold accent**: CSS var `--gold2` (value differs per theme; never hardcode the hex)
- **Font stack**: Cinzel is DISPLAY-ONLY and bold (`--fh`; two sizes, `--type-size-display-lg`/`-sm`, plus this app's own `--type-size-display-hero` for the roll-calculator's numeral) — never for names, labels, sub-headings or buttons, no matter how prominent. Lato (`--fl`, aliased `--type-heading`/`--type-label`) is headings and labels, including character/entity names. Libre Baskerville (`--ft`, `--type-body`) is body prose. This corrects a stale "Lora for body" claim (Lora was never the real body font in this codebase's own `theme.css`) — caught during the 2026-08-22 design-token port, see `../design-token-port.md` and `../design-normalisation-tm-game-audit.md`.
- **CSS custom properties** defined on `:root` in `public/css/theme.css`. Default theme is **Parchment** (warm light); `[data-theme="dark"]` is the override. Tokens flip between themes; rule bodies stay theme-agnostic.
- **Normalised CSS (MANDATORY)**: all styling uses the design-system tokens in `theme.css`. Reuse an existing component class from `public/css/components.css` (or the app sheet `suite.css` / `admin-layout.css`) before inventing one. Never write a bare hex, `rgba()`, or inline `style="..."` in markup or JS-rendered HTML. Full guidance: `specs/architecture/coding-standards.md` → "CSS Standards"; the critical-standards summary auto-read by the BMAD dev/story agents lives in `specs/project-context.md`.

## Data Sources of Truth

Before building any feature that reads or writes data, consult `specs/reference-data-ssot.md`. It maps every domain to its MongoDB collection, API endpoint, auth boundary, and the UI surface where it is managed.

Key rules:
- `FEED_METHODS` and `TERRITORY_DATA` live in `public/js/player/downtime-data.js` — import from there, never duplicate
- Tracker state (`tracker_state` collection) is already player-scoped at the API level — `server/routes/tracker.js`'s own `canAccess()` lets a player read/write their own character's tracker (`character_ids` match), ST/dev unconditionally. Corrected 2026-08-15 (gdx.7); the previous "ST-auth only" line here was stale and had gone unread against the actual route.
- `public/js/game/tracker.js` (keyed by `_id`) is the sole canonical client tracker. The name-keyed persistence surface was removed in #836; `public/js/suite/toast.js` is only a toast helper, not a tracker
- Derived stats (health max, vitae max, willpower max, influence total, XP) are never stored — always calculate at render time

## Live data vs reference files

**MongoDB Atlas is the live data source.** Never treat local files as a substitute for querying the database.

| Location | Status | Purpose |
|----------|--------|---------|
| MongoDB `tm_game` | **LIVE** | All character, territory, downtime, session data |
| `data/dev-fixtures/` | Dev seed | Downtime cycles, submissions, sessions for local dev |
| `data/reference/` | Reference | Static rules reference (merit tables, vitae, offices) |
| `st-working/` | ST ops | Downtime docs, prompt refs, retrospectives — not code |

When you need current character or game data, query the API or check MongoDB directly.

## Key schema files

- `schemas/schema_v2_proposal.md` — Full v2 schema specification
- `archive/tm_characters.json` — 31 characters in old format (migrated, kept for reference)

## Known data issues

- Kirk Grimm: retired, Intelligence XP=5 (not divisible by 4)
- Gel and Magda: Skills XP is 1 total, not per-skill
- ~10 domain merits have unaccounted SP sources (need master sheet)
- Livia, Mammon, Ludica, Charles Mercer-Willows: MCI cult names blank
- Merit prerequisites not yet validated against character stats
- Game 2 XP: attendance data partially entered
