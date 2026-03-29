---
title: "Product Brief Distillate: TM Suite"
type: llm-distillate
source: "product-brief-tm-suite.md"
created: "2026-03-29"
purpose: "Token-efficient context for downstream PRD creation"
---

# Product Brief Distillate: TM Suite

## Data Architecture

- Single v2 JSON is the canonical data format; schema defined in `schema_v2_proposal.md`
- Two schemas currently exist: v2 (used by Editor) and old format (used by ST Suite/index.html)
- Integration plan (`integration_plan.md`) has 3 phases: Phase 1 bridge via `v2ToOld()`, Phase 2 shared accessors, Phase 3 merge
- Attributes are always `{ dots, bonus }` objects, never bare ints
- Skills are always `{ dots, bonus, specs: [], nine_again }` objects
- Merits use a single array with `category` field (general/influence/domain/standing/manoeuvre)
- Derived stats (size, speed, defence, health, willpower_max, vitae_max) are NEVER stored — calculated at render time
- XP fields store actual XP cost, not dot counts; dots derived via `xpToDots(xpCost, baseBefore, costPerDot)`

## Test Data vs Real Data

- Both `tm_editor.html` and `index.html` contain ~10 fictional test characters inline for development/testing purposes
- Real character data (30+ characters) exists in `chars_v2.json` (v2 format) and `tm_characters.json` (old format)
- Real data also embedded as `CHARS_DATA` constant in the editor
- **Decision: separate test data from real data during restructure** — use test characters for development, keep real character data in a separate JSON file
- Real character data can be derived from `Terra Mortis Character Master (v3.0).xlsx` first tab, though that data is arranged for Power Query data merge into PDFs, not direct JSON consumption

## Known Data Issues

- Gel and Magda: Skills XP is 1 total, not per-skill
- Kirk Grimm: Intelligence XP=5 (not divisible by 4, produces fractional dots)
- Conrad: Discipline dot splits were manually corrected, may have errors
- `features` field exists on 5 characters but is not yet rendered in any view

## Immutable Reference Data (baked into editor JS)

- `CLANS` (5), `COVENANTS` (5), `MASKS_DIRGES` (26)
- `MERITS_DB` (203+ entries with prerequisites and descriptions)
- `DEVOTIONS_DB` (42: 31 general + 11 bloodline-exclusive)
- `MAN_DB` (manoeuvre definitions)
- `CLAN_BANES`, `BLOODLINE_DISCS`
- These represent years of domain encoding — the core value proposition of the tool

## XP Cost Rates (VtR 2e flat)

- Attributes: 4 XP/dot, Skills: 2 XP/dot
- Clan Disciplines: 3 XP/dot, Out-of-clan/Ritual: 4 XP/dot
- Merits: 1 XP/dot, Devotions: variable (per `DEVOTIONS_DB`)

## UI / Platform Context

- ST Suite (index.html) is already mobile/tablet-friendly — built for iPad use
- TM Editor (tm_editor.html) is desktop-first — needs responsive adaptation
- Both apps share identical CSS design tokens (colours, fonts, borders) but duplicated across files
- Campaign website (terramortislarp-website.netlify.app) uses the same design language
- Design tokens: `--bg:#0D0B09`, `--gold:#C9A962`, `--crim:#8B0000`, fonts: Cinzel/Cinzel Decorative/Lora
- British English throughout: Defence, Armour, Vigour, Honour, Socialise
- No em-dashes in output text
- Dots display: `'●'.repeat(n)` using U+25CF

## Existing Application Structure

- **Editor control flow**: `renderList()` → `pickChar(idx)` → `renderSheet(c)` → `editFromSheet()` → `shEdit(field, value)` → `markDirty()` → `saveChars()`
- **Suite control flow**: `loadChars()` → `goTab(t)` → feature-specific rendering
- **Suite tabs**: Roll, Sheet, Territory, Tracker
- **Roll tab**: `getPool(char, raw)` parses pool strings like `"Intelligence + Occult"` into dot totals; `updResist()` handles resistance checks
- Territory tab uses React (loaded from CDN) — the only React dependency in the project
- XLSX library loaded from CDN for export functionality

## Player Portal (Future Phase)

- Discord-based authentication planned for player access
- Players would: view character sheet, access documentation, create characters, submit downtimes
- Privacy concern: static site with single JSON would expose all character data to all players — Discord auth + selective data serving needed
- Player visibility creates data-quality feedback loop (players spot their own errors)

## Downtimes

- Soft deadline: 8 April 2026 for downtime system
- Peter (collaborator) currently investigating the downtime question
- Google Form exists as current interim capture method
- Claude Chat (general) used for processing
- Vision is automated downtime resolution, not just a submission form — but this is lower priority than the restructure

## Hosting & Deployment

- Currently deployable via GitHub Pages (Peter's recommendation) or Netlify (paid account exists)
- Static site — no backend, no database, no server
- This is a deliberate constraint: no accounts to manage, no privacy liability, no server maintenance for a volunteer-run LARP

## Related Projects

- Invictus Narrator Suite (https://invictus-narrator-suite.netlify.app/) — separate LARP narrator suite by Angelus, potentially shares patterns
- Terra Mortis campaign website (https://terramortislarp-website.netlify.app/) — vibe-coded, shares design language

## Rejected / Deferred Ideas

- Native mobile app — browser-based is sufficient
- Backend/database — deliberately staying static for simplicity and accessibility
- Generic RPG tool approach — purpose-built for VtR 2e / Terra Mortis specifically
- Splitting into many small PRs during restructure — not yet decided, but user prefers pragmatic approach

## Open Questions

- How exactly will Discord auth integrate with a static site? (may need a lightweight auth proxy or serverless function)
- Should the Territory tab keep its React dependency, or be rewritten in vanilla JS during restructure?
- What is the downtime processing workflow Peter is designing?
- How should the Excel master data be transformed/imported into the v2 JSON format?
- What does "contested roll" automation look like in practice? (two characters selected, pools compared, results shown?)

## Design Constraints

- Every architectural pattern should be teachable — Angelus is learning, not just consuming
- No unnecessary abstractions — right amount of complexity for the task
- British/Australian English in all output and communication
- Consistent with existing campaign website aesthetic
