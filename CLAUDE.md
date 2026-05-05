# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## !! HARD RULE: Git Push and Merge

**NEVER push to origin or merge to main.** Not after a commit. Not at the end of a session. Not ever, unless the user's current message explicitly says "push", "merge to main", or "deploy".

- `commit` = `git commit` only. Nothing else.
- `merge to main` = explicit instruction, one-time, in that message only.
- A prior "commit and merge" in the same session does NOT carry forward.
- Always work on `Morningstar` branch. If the session starts on `main`, switch to `Morningstar` before making any changes.
- Each Netlify/Render deploy costs money. The user controls deploy cadence.

## !! ARCHITECTURAL RESET FREEZE (since 2026-05-01)

The repository is in an architectural-reset freeze. All proposed feature dev is paused. Before proposing any change, read:

- [`FREEZE.md`](FREEZE.md) — visible-at-the-root summary with the five-item gate
- [`specs/architectural-reset-charter.md`](specs/architectural-reset-charter.md) — full freeze rules, audit plan, resumption criteria

**Permitted during freeze:** hotfixes (cycle-blockers, strict definition), errata corrections (content-only ref data — `MERITS_DB` / `DEVOTIONS_DB` / `MAN_DB`), audit findings, doc updates.

**Paused:** new features, schema additions, new helper modules, the 34-story DT overhaul backlog, the NPC/edges DT integration.

The freeze lifts when all resumption criteria in the charter Part 3 are met. Not dated.

## Project Overview

Terra Mortis TM Suite is a browser-based character management system for a Vampire: The Requiem 2nd Edition campaign. Express API backend on Render, static frontend on Netlify, MongoDB Atlas for persistence, Discord OAuth for ST authentication.

## Running & Testing

- **Local frontend:** `npx http-server public -p 8080`
- **Local API:** `cd server && npm run dev` (needs `server/.env` with MongoDB URI + Discord credentials)
- **No test framework.** Verify changes manually in-browser.

## Deployment

- **Frontend:** Netlify (`terramortissuite.netlify.app`), deploys from `main` branch
- **API:** Render (`tm-suite-api.onrender.com`), deploys from `main` branch
- **Database:** MongoDB Atlas (`tm_suite`)
- **Branching:** Two developer branches feed into `dev`, which merges to `main` for production.
  - `Morningstar` — Angelus's working branch
  - `Piatra` — Peter's working branch
  - `dev` — integration branch; both developers merge into here
  - `main` — production; auto-deploys to Netlify + Render

## Branch Sync Protocol

**At the start of every significant work request**, before making any changes:

1. Check what's on `dev` that isn't in the current branch: `git log HEAD..origin/dev --oneline`
2. If `dev` is ahead, merge it in: `git merge dev`
3. Resolve any conflicts, then proceed with the work.

This keeps `Morningstar` and `Piatra` current with each other's merged work before new changes are layered on top.

## Architecture

```
Browser (Netlify)  →  Express API (Render)  →  MongoDB Atlas
   public/              server/                  tm_suite DB
```

### Admin app (`public/admin.html`)

ST-only app with Discord OAuth. Sidebar domains: Player (character grid + sheet editor), City (territories, court, influence), Downtime, Attendance & Finance, Engine (session log).

### Suite app (`public/index.html`)

Roll calculator, sheet viewer, territory tracker. Reads character data from API or localStorage cache.

### API server (`server/`)

Express 5, ES modules. Routes: `/api/characters`, `/api/territories`, `/api/downtime_cycles`, `/api/downtime_submissions`, `/api/game_sessions`, `/api/session_logs`. Auth via `/api/auth/discord`. Health check at `/api/health`.

## v2 Schema

Source of truth: `schemas/schema_v2_proposal.md`. Live data in MongoDB `tm_suite.characters`.

Key design rules:
- Attributes: always `{ dots, bonus }` objects
- Skills: always `{ dots, bonus, specs: [], nine_again }` objects
- Merits: single array with `category` field (general/influence/domain/standing/manoeuvre)
- Standing merits (MCI, PT): have `benefit_grants` array; child merits have `granted_by`
- Name fields: `name` (legal), `honorific` (Lord/Lady/Doctor/Sister), `moniker` (display override)
- Display: `displayName(c)` = honorific + (moniker || name). Sort: `sortName(c)` = moniker || name
- Character retirement: `retired: true` flag, shown separately in admin grid
- **Derived stats are never stored** — size, speed, defence, health, willpower_max, vitae_max calculated at render time

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

- `CLANS` (5), `COVENANTS` (5), `MASKS_DIRGES` (26)
- `MERITS_DB` (203+ entries with prerequisites and descriptions)
- `DEVOTIONS_DB` (42: 31 general + 11 bloodline-exclusive)
- `MAN_DB` (manoeuvre definitions)
- `CLAN_BANES`, `BLOODLINE_DISCS`

## Conventions

- **British English throughout**: Defence, Armour, Vigour, Honour, Socialise, capitalise
- **No em-dashes** in output text
- **Dots display**: `'●'.repeat(n)` using U+25CF filled circle
- **Gold accent**: `#E0C47A` (CSS var `--gold2`)
- **Font stack**: Cinzel / Cinzel Decorative for headings, Lora for body (Google Fonts CDN)
- **CSS custom properties** defined on `:root` — dark theme with `--bg: #0D0B09`, `--surf*` surface tiers, `--gold*` accent tiers, `--crim: #8B0000` for damage states

## Data Sources of Truth

Before building any feature that reads or writes data, consult `specs/reference-data-ssot.md`. It maps every domain to its MongoDB collection, API endpoint, auth boundary, and the UI surface where it is managed.

Key rules:
- `FEED_METHODS` and `TERRITORY_DATA` live in `public/js/player/downtime-data.js` — import from there, never duplicate
- Tracker state (`tracker_state` collection) is ST-auth only at the API level — player access requires explicit auth change
- Two client tracker implementations exist and are fragmented (`public/js/game/tracker.js` keyed by `_id` is canonical; `public/js/suite/tracker.js` keyed by name is legacy)
- Derived stats (health max, vitae max, willpower max, influence total, XP) are never stored — always calculate at render time

## Live data vs reference files

**MongoDB Atlas is the live data source.** Never treat local files as a substitute for querying the database.

| Location | Status | Purpose |
|----------|--------|---------|
| MongoDB `tm_suite` | **LIVE** | All character, territory, downtime, session data |
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
