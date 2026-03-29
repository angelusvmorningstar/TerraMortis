# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Terra Mortis TM Suite is a browser-based character management system for a Vampire: The Requiem 2nd Edition campaign. It consists of two single-file HTML applications with no backend, build system, or package manager. All JS/CSS is inline.

## Running & Testing

- **No build step.** Open `.html` files directly in a browser.
- **No test framework.** Verify changes manually in-browser. For syntax checks: `node -e "require('vm').createScript(code)"`
- **Data persistence:** `localStorage` key `tm_chars_db` (v2 JSON). Tracker data uses `tm_tracker_<name>` per character.

## Architecture

### Two applications, converging

| File | Purpose | Data format |
|---|---|---|
| `tm_editor.html` (~3100 lines) | Character editor with list/sheet/edit views | v2 schema (native) |
| `index.html` (~2900 lines) | ST Suite: Roll, Sheet, Territory, Tracker tabs | Old schema (migration planned) |

**Integration roadmap** (see `integration_plan.md`): Phase 1 (current) has Editor on v2 and Suite on old format with a planned `v2ToOld()` bridge. Phase 2 migrates Suite to read v2 via shared accessor functions. Phase 3 merges both into a single file.

### v2 schema (source of truth: `schema_v2_proposal.md`)

Key design rules:
- Attributes are always `{ dots, bonus }` objects, never bare ints
- Skills are always `{ dots, bonus, specs: [], nine_again }` objects
- Merits are a single array with a `category` field (general/influence/domain/standing/manoeuvre)
- **Derived stats are never stored** — size, speed, defence, health, willpower_max, vitae_max are calculated at render time
- XP fields store **actual XP cost**, not dot counts. Dots are derived via `xpToDots(xpCost, baseBefore, costPerDot)` using flat rates

### XP cost rates (VtR 2e flat)

- Attributes: 4 XP/dot, Skills: 2 XP/dot
- Clan Disciplines: 3 XP/dot, Out-of-clan/Ritual: 4 XP/dot
- Merits: 1 XP/dot, Devotions: variable (per `DEVOTIONS_DB`)

### Editor control flow

1. `renderList()` shows character card grid (filterable by clan/covenant)
2. `pickChar(idx)` -> `renderSheet(c)` for read-only view
3. `editFromSheet()` toggles edit mode with form inputs
4. `shEdit(field, value)` updates `chars[editIdx]`, calls `markDirty()`
5. `saveChars()` writes to localStorage

### Suite control flow

1. `loadChars()` reads localStorage (old format)
2. `goTab(t)` switches Roll/Sheet/Territory/Tracker
3. `getPool(char, raw)` parses pool strings like `"Intelligence + Occult"` into dot totals
4. Roll tab has resistance check calculations via `updResist()`

### Immutable reference data (baked into editor JS)

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

## Key data files

- `chars_v2.json` — 30 characters in v2 format (also embedded as `CHARS_DATA` in editor)
- `tm_characters.json` — 30 characters in old format (used by Suite)
- `HANDOVER_v3.md` — Latest implementation notes and known data issues
- `schema_v2_proposal.md` — Full v2 schema specification

## Known data issues (from HANDOVER_v3.md)

- Gel and Magda: Skills XP is 1 total, not per-skill
- Kirk Grimm: Intelligence XP=5 (not divisible by 4, so fractional dots)
- Conrad: Discipline dot splits were manually corrected and may have errors
- `features` field exists on 5 characters but is not yet rendered
