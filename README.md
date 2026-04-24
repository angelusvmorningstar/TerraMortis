# Terra Mortis TM Suite

A browser-based character management system for a **Vampire: The Requiem 2nd Edition** campaign. Single-page admin app with Express API backend, MongoDB persistence, and Discord OAuth authentication.

## Live Deployment

| Service | URL | Deploys from |
|---------|-----|--------------|
| Admin App (Netlify) | `terramortissuite.netlify.app` | `main` branch |
| API Server (Render) | `tm-suite-api.onrender.com` | `main` branch |
| Database | MongoDB Atlas (`tm_suite`) | — |

## Applications

| Path | Purpose |
|------|---------|
| `public/admin.html` | ST Admin — characters, city, downtime processing, attendance, session log, NPC Register + relationships |
| `public/player.html` | Player Portal + Game App — character sheet, tracker, downtime form, check-in, regency, finance (coordinator) |
| `public/index.html` | ST Suite — roll calculator, sheet viewer, territory tracker |

## Local Development

```bash
# Start API server (requires server/.env with MongoDB URI + Discord credentials)
cd server && npm run dev

# Serve frontend (any static server on port 8080)
npx http-server public -p 8080
```

## Data

| Location | Description |
|----------|-------------|
| MongoDB `tm_suite` | Live data: characters, territories, downtime, game sessions, session logs |
| `archive/tm_characters.json` | 31 characters in pre-v2 format (frozen reference) |

### Character Schema (v2)

Full specification in `schemas/schema_v2_proposal.md`. Key design rules:

- Attributes: `{ dots, bonus }` objects
- Skills: `{ dots, bonus, specs: [], nine_again }` objects
- Merits: single array with `category` field (general, influence, domain, standing, manoeuvre)
- Standing merits (MCI, PT): `benefit_grants` array + child merits have `granted_by`
- Name: `name` (legal name), `honorific` (Lord/Lady/Doctor/Sister), `moniker` (display override)
- Derived stats (size, speed, defence, health) calculated at render time, never stored
- XP earned: derived dynamically from `humanity_base`, `ordeals` array, game sessions
- XP spent: derived from `attr_creation`, `skill_creation`, `disc_creation`, `merit_creation`

### XP Cost Rates (VtR 2e Flat)

| Type | Cost per Dot |
|------|-------------|
| Attributes | 4 XP |
| Skills | 2 XP |
| Clan Disciplines | 3 XP |
| Out-of-clan / Ritual Disciplines | 4 XP |
| Merits | 1 XP |
| Devotions | Variable |

## Architecture

```
Browser (Netlify)  →  Express API (Render)  →  MongoDB Atlas
   static files        /api/* endpoints          tm_suite DB
```

- **Auth**: Discord OAuth2. ST IDs whitelisted in server config. Coordinator + dev roles for check-in / finance / dev access.
- **Frontend**: vanilla JS modules, no build step. Cinzel/Lora fonts, dark theme with gold accents.
- **API**: Express 5, ES modules, `server/` directory. Routes: characters, territories (+ feeding-rights PATCH), downtime, game_sessions, session_logs, npcs, relationships, npc-flags, attendance, rules.
- **Tests**: Vitest integration tests in `server/tests/`, forced against `tm_suite_test` (isolated from live DB).

## Branching

- `Morningstar` — Angelus's working branch
- `Piatra` — Peter's working branch
- `dev` — integration branch; Morningstar and Piatra merge in
- `main` — production, triggers Netlify + Render deploy on push
- Pattern: commit to your working branch → merge to `dev` per story → merge `dev` → `main` per epic

## Embedded Reference Data

- **CLANS** (5) and **COVENANTS** (5)
- **MASKS_DIRGES** (26 archetypes)
- **MERITS_DB** (203+ entries with prerequisites and descriptions)
- **DEVOTIONS_DB** (42: 31 general + 11 bloodline-exclusive)
- **MAN_DB** (manoeuvre definitions)

## Conventions

- British English throughout (Defence, Armour, Vigour, etc.)
- Dark theme with gold (`#E0C47A`) accents and crimson (`#8B0000`) damage states
- Fonts: Cinzel / Cinzel Decorative (headings), Lora (body) via Google Fonts
- Dots displayed as `●` (U+25CF)
