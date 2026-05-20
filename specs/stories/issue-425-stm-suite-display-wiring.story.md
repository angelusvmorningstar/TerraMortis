# Issue #425: STM bugfix — suite sheet renderer missing STM display wiring

Status: Done

issue: 425
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/425
branch: piatra/issue-425-stm-suite-display-wiring
epic: STM (specs/epic-stm-st-mods.md)
dispatch: PROCEED-WITH-NOTICE — v2 wiring gap, independent of Rev 4

## Story

As a player landing on `/` (the suite app),
I want modded values on my character sheet to show the same gold-tint dots / markers / tooltips / click-to-popover as the admin sheet,
so that I can see *that* a value was adjusted by the ST, not just the modded number with no indication.

## Root cause

STM-4 + polish #408 wired the EDITOR sheet renderer (`public/js/editor/sheet.js`). The SUITE sheet renderer (`public/js/suite/sheet.js`) is a parallel implementation that was never wired — same fragmentation pattern CLAUDE.md notes for the two tracker implementations. The data layer worked (STM-7's cache-entry invariant populates `c._st_mod_overlay` at suite boot); only the suite's consumption side was missing.

## Tasks / Subtasks

- [x] Task 1 — Import `markerFor` + add `_stmAttrOpts` / `_stmSkillOpts` helpers to suite/sheet.js (mirror editor pattern).
- [x] Task 2 — Attribute render: switch from sheet-helpers `dotsWithBonus` to canonical `shDotsWithBonus(base, bonus, opts)` so modded dots/bonus get gold-tint. autoBonus (discipline-derived) computed as `getAttrBonus − manualBonus` for the hollow offset.
- [x] Task 3 — Skill render: add opts to the existing `shDotsWithBonus` call.
- [x] Task 4 — Stats strip: `markerFor` on BP, Humanity, Size, Speed, Defence number displays.
- [x] Task 5 — Disciplines: `markerFor(c, disciplines.<Name>.dots)` on each discipline row (object-keyed per project_disciplines_object_keyed).
- [x] Task 6 — Popover active-char resolution: set `window.__activeChar = state.sheetChar` in suite `renderSheet` (reuses the global player.js already sets; chosen fix (a) for minimal diff).
- [x] Task 7 — Install the popover delegated handler for the suite app: `installStModPopover(document.body)` in app.js boot (STM-4 wired admin + player but not the suite).
- [x] Task 8 — Suite onStModUpdate WS callback upgraded from tracker-repaint-only to full `suiteRenderSheet()` so a remote mod change refreshes the modded dots/markers (STM-9 left this as tracker-repaint because the suite wasn't STM-wired yet).
- [x] Task 9 — 5 vitest cases on the opts → markup contract + no-regression byte-identity.

## Acceptance Criteria

1. All `shDotsWithBonus` in suite/sheet.js pass opts — ✅ (skill call + attribute render switched to shDotsWithBonus)
2. Derived/root stat numbers get `markerFor` — ✅ (BP, Humanity, Size, Speed, Defence + disciplines)
3. Popover `_resolveActiveCharacter` resolves suite active char — ✅ via `window.__activeChar` + `installStModPopover` in suite boot
4. Smoke on `/`: Presence dots + bonus mod shows gold-tint + ring + tooltip + popover — ⏳ needs Peter (structural: opts emit `stm-modded-dot` markup, popover handler installed, resolver wired)
5. No regression — ✅ 1035/1035 server tests; no-overlay path byte-identical
6. ≥2 vitest cases — ✅ 5 added

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **Attribute render switched from sheet-helpers `dotsWithBonus` to canonical `shDotsWithBonus`.** sheet-helpers' version wraps bonus dots in a suite-only `.dots-bonus` (dim-gold) span; the canonical opts-aware version doesn't. Switching drops that wrapper for attributes — but this ALIGNS attributes with skills (which already use shDotsWithBonus) and with the editor. Net consistency win, not a regression. Documented inline + in PR. The non-modded path stays byte-identical to the editor's output.
- **autoBonus split for the hollow offset.** Suite's `getAttrBonus` combines manual + discipline-derived bonus. The modded `attributes.X.bonus` overlay targets the MANUAL bonus channel. To offset the modded sub-range correctly (disc-auto dots render first, manual after — editor convention), `autoBonus = getAttrBonus − c.attributes[a].bonus`.
- **Popover handler install added to suite boot.** STM-4 wired `installStModPopover` for admin + player only. Without it, suite markers emit `data-stm-marker-path` but nothing opens the popover. Added to app.js boot. This was a latent gap that #425 surfaces (the suite never had ANY markers before, so the missing install was invisible).
- **Suite onStModUpdate upgraded to full re-render.** STM-9's app.js handler only called `repaintSheetTrackers()` (suite wasn't STM-wired then). Now calls `suiteRenderSheet()` so modded dots/markers refresh on a remote mod change.
- **Deferred: tracker-max markers (derived.health_max / willpower_max / vitae_max).** The tracker num displays (`current/max`) are rewritten by `repaintSheetTrackers` on every tracker tick via `textContent`/`innerHTML` assignment, which would wipe an injected marker. Adding markers there means dual-wiring (static render + repaint path) and fighting a hot path. These are rare mod targets; deferred with this note. The primary bug (attribute mods showing no indication — Peter's Presence smoke) is fully addressed. Follow-up issue if ST debugging needs them.
- **Worktree pattern continued.**

### File List

- `public/js/suite/sheet.js` (modified) — `markerFor` import; `_stmAttrOpts`/`_stmSkillOpts` helpers; attribute + skill dot opts; stats-strip + discipline markers; `window.__activeChar` set in renderSheet
- `public/js/app.js` (modified) — `installStModPopover(document.body)` in suite boot; onStModUpdate upgraded from `repaintSheetTrackers` to `suiteRenderSheet`
- `server/tests/stm-suite-display-425.test.js` (new) — 5 vitest cases on the opts → markup contract
- `specs/stories/issue-425-stm-suite-display-wiring.story.md` — this file

### Change Log

- 2026-05-20 (Ptah): suite display wiring
