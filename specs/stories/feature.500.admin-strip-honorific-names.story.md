# Story feature.500: Admin — strip honorific from character name display

**Story ID:** feature.500
**Epic:** Admin UI hardening
**Status:** review
**Date:** 2026-05-27
**Issue:** [#500](https://github.com/angelusvmorningstar/TerraMortis/issues/500)
**Branch:** ms/issue-500-admin-strip-honorific-names

---

## User Story

As an ST managing characters and processing downtime in the admin app, I want character names to display without honorifics so that operational surfaces are readable and uncluttered.

---

## Background

`displayName(c)` in `public/js/data/helpers.js` prepends `c.honorific` when set — e.g. "Senator Keeper", "Lord Aurelius". This is appropriate for formal or narrative output but adds noise in operational ST contexts (character grid, sheet editor, DT processing queue, dropdowns).

Surfaced concretely: Keeper (Henry St. John, `honorific: "Senator"`) shows as "Senator Keeper" throughout admin, whereas the ST only ever thinks of this character as "Keeper".

**An appropriate helper already exists:** `cardName(c)` returns `moniker || name` with dev-mode redaction support — identical to `displayName()` minus the honorific prefix. No new helper is needed.

---

## Acceptance Criteria

- [ ] Audit all `displayName()` callsites across `public/js/admin/` and `public/js/admin.js` and replace those serving UI labels, headings, card names, and filter strips with `cardName(c)`
- [ ] Audit dropdown/select option callsites in admin; replace with `dropdownName(c)` (already honorific-free, redaction-skip is appropriate for selects)
- [ ] Leave `displayName()` in place for **narrative output** (downtime story prompts, session logs, rumour text) where the honorific is intentionally formal
- [ ] Leave `displayName()` in place for **city/court views** where title-bearing display may be appropriate (regent labels, lieutenant labels) — flag these as deliberate exceptions in a comment if kept
- [ ] Player-facing files (`public/js/app.js`, `public/js/suite/`, `public/js/tabs/`, `public/js/game/`) are **not touched**
- [ ] After changes: "Keeper" (not "Senator Keeper") appears in the admin character grid, sheet editor header, DT processing card headers, and character filter strips

---

## Key Technical Facts

### The helper landscape (helpers.js:151–185)

```js
// ✅ USE THIS for admin UI labels, headings, filter chips, card names
export function cardName(c) {           // moniker || name — WITH redaction
  const base = c.moniker || c.name;
  return isRedactMode() ? _blockOut(base, 10, 16) : base;
}

// ✅ USE THIS for <option> text in admin dropdowns/selects
export function dropdownName(c) {       // moniker || name — NO redaction
  return c.moniker || c.name;
}

// ⚠️  KEEP for narrative/formal output only (downtime story, session log)
export function displayName(c) {        // honorific + base — WITH redaction
  const base = c.moniker || c.name;
  const raw = c.honorific ? c.honorific + ' ' + base : base;
  return isRedactMode() ? _blockOut(raw, 10, 16) : raw;
}

// ⚠️  KEEP for functional controls that already use it (displayNameRaw)
export function displayNameRaw(c) {     // honorific + base — NO redaction
  const base = c.moniker || c.name;
  return c.honorific ? c.honorific + ' ' + base : base;
}
```

**Do not introduce a new helper.** `cardName` is the right tool.

### Callsite audit — admin scope

All callsites below use `displayName()`. Determine per-site whether to switch or leave:

| File | Approx line | Context | Recommended action |
|------|------------|---------|-------------------|
| `public/js/admin.js` | 603 | Character card heading | → `cardName` |
| `public/js/admin.js` | 677 | Confirmation dialog text | → `cardName` |
| `public/js/admin.js` | 715 | Emergency contact panel label | → `cardName` |
| `public/js/admin.js` | 737 | Character name variable (multiple uses) | → `cardName` |
| `public/js/admin.js` | 997 | Character name variable | → `cardName` |
| `public/js/admin.js` | 1137 | Ordeals section heading | → `cardName` |
| `public/js/admin/city-views.js` | 225 | Data export character name | → keep `displayName` (export) |
| `public/js/admin/city-views.js` | 304 | Territory lookup fallback | → keep (lookup, not display) |
| `public/js/admin/city-views.js` | 358 | Lieutenant display in form | deliberate exception — flag with comment |
| `public/js/admin/city-views.js` | 366 | Regent name in territory card | deliberate exception — flag with comment |
| `public/js/admin/attendance.js` | 59 | Sort comparator | → `cardName` (or `sortName`) |
| `public/js/admin/attendance.js` | 104 | CSV export `character_display` | → keep `displayName` (export record) |
| `public/js/admin/st-mods-panel.js` | 111 | ST Mods panel heading | → `cardName` |
| `public/js/admin/st-mods-audit.js` | 66 | Audit report name field | → keep `displayName` (audit record) |
| `public/js/admin/ordeals-admin.js` | 169 | Ordeal submission char name | → `cardName` |
| `public/js/admin/ordeals-admin.js` | 456 | Ordeal submission char name (fallback) | → `cardName` |
| `public/js/admin/npc-register.js` | 135 | NPC register character label | → `cardName` |
| `public/js/admin/npc-register.js` | 184 | NPC list item label | → `cardName` |
| `public/js/admin/npc-register.js` | 350 | NPC lookup fallback | → keep (lookup, not display) |
| `public/js/admin/downtime-story.js` | 632 | Downtime story char name | → keep (narrative output) |
| `public/js/admin/downtime-story.js` | 2877 | Name match/lookup | → keep (lookup, not display) |
| `public/js/admin/downtime-story.js` | 2924 | Regent name in downtime context | → keep (narrative) |
| `public/js/admin/downtime-story.js` | 3431 | Downtime log char name | → keep (log record) |
| `public/js/admin/downtime-story.js` | 3443 | Rumour prompt text | → keep (narrative) |
| `public/js/admin/downtime-story.js` | 3658 | Lead char name in narrative | → keep (narrative) |
| `public/js/admin/feeding-engine.js` | 271 | Feeding button text | → `cardName` |
| `public/js/admin/feeding-engine.js` | 353 | Feeding button text (updated) | → `cardName` |
| `public/js/admin/relationship-editor.js` | 98 | Relationship list "PC: " label | → `cardName` |
| `public/js/admin/session-tracker.js` | 153 | Session name display | → `cardName` |
| `public/js/admin/archive-admin.js` | 53 | Archive page title heading | → `cardName` |
| `public/js/editor/sheet.js` | 1801 | Sheet name in read-only mode | → `cardName` |
| `public/js/editor/identity.js` | 174 | Name in editor display | → `cardName` |
| `public/js/components/map-overlay.js` | 59 | Regent on territory map popup | deliberate exception — flag with comment |

### DT processing (downtime-views.js)

`downtime-views.js` uses `displayName()` in card headers and filter strips — these are exactly the surfaces that motivated this issue. Replace with `cardName()` throughout. The DT Story output in `downtime-story.js` is narrative and stays on `displayName()`.

### Import hygiene

Most admin files already import `displayName` from `helpers.js`. Add `cardName` and/or `dropdownName` to the same import destructure. Do not add a separate import statement — extend the existing one.

Example:
```js
// Before
import { displayName, sortName } from '../data/helpers.js';

// After
import { displayName, cardName, dropdownName, sortName } from '../data/helpers.js';
```

---

## Scope

**In scope:** `public/js/admin/`, `public/js/admin.js`, `public/js/editor/sheet.js`, `public/js/editor/identity.js`, `public/js/components/map-overlay.js` (where used in admin-facing surfaces)

**Out of scope:** `public/js/app.js`, `public/js/suite/`, `public/js/tabs/`, `public/js/game/` — player-facing, do not touch

**Deliberate exceptions (keep displayName, add comment):** regent/lieutenant labels in city-views.js and map-overlay.js — titles carry court-rank meaning in those formal city contexts

---

## Dev Agent Record

### Files Modified
- `public/js/admin.js` — 6 callsites → `cardName`
- `public/js/admin/attendance.js` — sort comparator → `cardName`; CSV export kept `displayName`
- `public/js/admin/city-views.js` — feeding rights chip → `cardName`; regent/lt flagged as deliberate exceptions
- `public/js/admin/st-mods-panel.js` — panel heading → `cardName`
- `public/js/admin/ordeals-admin.js` — 2 callsites → `cardName`
- `public/js/admin/npc-register.js` — 3 callsites → `cardName`
- `public/js/admin/feeding-engine.js` — 2 callsites → `cardName`
- `public/js/admin/relationship-editor.js` — PC relationship label → `cardName`
- `public/js/admin/session-tracker.js` — session name display → `cardName`
- `public/js/admin/archive-admin.js` — archive page title → `cardName`; import replaced `displayName` with `cardName` entirely
- `public/js/editor/sheet.js` — sheet read-only header → `cardName`
- `public/js/editor/identity.js` — editor name update → `cardName`
- `public/js/components/map-overlay.js` — flagged as deliberate exception (court title on map)

### Completion Notes
- No new helper introduced — `cardName(c)` (already in helpers.js) is the correct tool
- `downtime-views.js` required no changes — already uses `dropdownName` throughout
- `downtime-story.js` left unchanged — narrative output intentionally keeps honorific
- `city-views.js` regent/lieutenant and `map-overlay.js` regent flagged with `// deliberate: court title shown in city view` comments
- CSV export fields (`attendance.js` L104, `st-mods-audit.js` L66) kept `displayName` — export records should be complete
- All 13 modified files pass `node --input-type=module --check` syntax validation

---

## Dev Notes

- Verify each callsite in context before switching — a few lines in the table are marked "keep" because they are lookup/matching operations (comparing names for equality) or formal export records, not UI display
- `downtime-views.js` is large; search for `displayName` within it and assess each hit — the filter strip character chips and card headers are the priority targets
- No schema or API changes; this is purely a rendering-layer substitution
- No visual regression expected outside admin — player portal is untouched
