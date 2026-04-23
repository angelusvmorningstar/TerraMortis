---
epic_id: di
epic_name: Data Imports
status: backlog
created: 2026-04-17
---

# Epic DI: Data Imports

## Overview

Import historical content into the player-facing Chronicles and Ordeals systems. All three stories share tooling (import scripts, DB writes) and should be sequenced together.

---

## Completed Ad-Hoc: Missing Devotions Seeded to purchasable_powers

**Status: Done — merged to main 2026-04-17**

- 21 devotions missing from the `purchasable_powers` collection inserted via `server/migrate-devotions-missing.js`
- Source: `st-working/reference/TM_rules_devotion_missing.json`
- Bloodlines: Lasombra, Gorgon, Norvegi, Apollinaire, Zelani, Lygos, Rotgrafen, Mnemosyne, Order of Sir Martin; Mystery Cult of the Moulding Room devotions
- Script is idempotent — safe to re-run; skips existing keys

---

## Story DI-1: Import DT1 Narratives into Chronicles

**Backlog item:** 7
**Status: Script written — awaiting run**

**As a** player viewing the Story / Chronicles tab,
**I want** my Downtime 1 narrative (written before the app form existed) to appear in my chronicle,
**so that** my full story history is accessible in one place.

### Acceptance Criteria

1. [x] DT1 narrative content for each character is importable via a script
2. [ ] Imported narratives appear in the player's Chronicle tab in the correct chronological position (before DT2 app-generated entries)
3. [x] Cycle label for DT1 entries is correct ("Downtime 1", game_number: 1, status: closed)
4. [x] No existing Chronicle entries are overwritten (skip guard + --force flag)

### Dev Notes

- **Script**: `server/migrate-dt1.js` — written 2026-04-17, merged to main
- Source: `TM_downtime1_submissions.json` (26 records, bespoke format)
- Creates `downtime_cycles` doc: label "Downtime 1", game_number 1, status closed, loaded_at 2026-02-28, closed_at 2026-03-13
- Maps `st_narrative` → `published_outcome` markdown; sections: Feeding, Projects, Touchstone, Letter, Territory Reports
- 5 characters had blank `character_id` in source — fixed via `CHAR_ID_FIXES` map in script
- **To run:** `node server/migrate-dt1.js --apply`

---

## Story DI-2: Import Game 1 Letters into Chronicles

**Backlog item:** 8

**As a** player viewing the Story / Chronicles tab,
**I want** the letter I received at the start of Game 1 to be accessible,
**so that** my full in-character correspondence is preserved.

### Acceptance Criteria

1. Game 1 letters for each character importable via script or admin tool
2. Letters appear in the appropriate section of the player's Chronicle / Story tab
3. Correct character attribution

### Dev Notes

- Determine where letters should live: new document type, or as a section within a DT submission document?
- Letters may need a new document type or a new section in the existing story/archive system
- Coordinate with existing archive tab structure (`public/js/player/story-tab.js`)

---

## Story DI-3: Sync Ordeal Data to Active Database

**Backlog item:** 9

**As a** player viewing the Ordeals tab,
**I want** my ordeal completion data to be current and correct,
**so that** my XP reflects all completed ordeals.

### Acceptance Criteria

1. Ordeal data from `tm_suite` is verified present in `tm_suite` (active database)
2. No ordeal completions are missing from any character
3. XP totals reflect correct ordeal data

### Dev Notes

- Investigate: run a comparison query between tm_suite and tm_suite ordeal records
- May be a simple data copy / migration script rather than a code change
- Confirm which database is active in production (likely `tm_suite` — verify)
