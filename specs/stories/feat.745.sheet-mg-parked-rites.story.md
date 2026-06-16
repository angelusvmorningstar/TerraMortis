---
title: 'Sheet: display Mandragora Garden parked rites on character sheet'
type: 'feature'
issue: 745
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/745
branch: ms/issue-745-sheet-mg-parked-rites
created: '2026-06-15'
status: done
recommended_model: 'sonnet — three small touch points, two JS files + one CSS rule'
context:
  - public/js/editor/sheet.js
  - public/js/suite/sheet.js
  - public/css/components.css
depends_on: []
---

## Intent

Add a small "MG" tag to each rite that has `mandragora_parked: true` on the
character sheet (both admin/editor sheet and suite player sheet). The tag
indicates the rite is permanently sustained by the Mandragora Garden and costs
no vitae per cycle.

---

## Background

The Mandragora Garden merit (one per dot level, up to 5) allows a character to
park Cruac rites permanently in the garden. The `mandragora_parked: true` flag
already exists on `character.powers[]` for two characters confirmed in a June
2026 audit:

- **Keeper (Henry St. John)** — Mandragora Garden •••, three rites parked
- **Ivana Horvat** — Mandragora Garden ••, two rites parked

Nothing in the current sheet rendering reads or surfaces this flag. Parked and
non-parked rites look identical in the UI.

---

## Companion issue note

Issue #746 (DT form pre-fill) has already been **partially implemented** in
`public/js/tabs/downtime-form.js` under the "Mandragora 2b" and "Mandragora 2c"
comment blocks (lines ~1441–1460 and ~4863–4882). The form already seeds
sorcery slots from `mandragora_parked` rites when no submission exists and shows
the capacity counter. No work needed on `downtime-form.js` for this story.

---

## File locations

| File | Change |
|------|--------|
| `public/js/suite/sheet.js` | Add MG chip to `tradSub` in rite row rendering |
| `public/js/editor/sheet.js` | Add MG chip to view-mode rite row `trait-sub` |
| `public/css/components.css` | Add `.rite-mg-tag` class after existing rite badge block |

---

## Current rite rendering

### Suite sheet (`public/js/suite/sheet.js`, lines ~594–609)

```js
const ritesList = rites(c);
if (ritesList.length) {
  html += `<div class="sh-sec"><div class="sh-sec-title">Rites</div><div class="disc-list">`;
  ritesList.forEach((p, i) => {
    const gid = 'rite' + c.name.replace(/[^a-z]/gi, '') + i;
    // ...pool calculation...
    const levelDots = p.level ? `<span class="trait-dots">${dots(p.level)}</span>` : '';
    const tradSub = p.tradition ? `<div class="trait-sub"><span class="trait-qual dim">${p.tradition}</span></div>` : '';
    const inner = `<div class="trait-row">...<div class="trait-main">...<span class="trait-name secondary">${p.name}</span>...<div class="trait-right">${levelDots}...</div></div>${tradSub}</div>`;
    html += `<div class="disc-tap-row" ...)>${inner}</div>...`;
  });
```

`tradSub` is the `.trait-sub` div that shows the tradition name below the rite
name. This is where the MG chip goes.

### Editor sheet (`public/js/editor/sheet.js`, lines ~685–704)

View mode (non-edit) renders each rite at line ~702 as a single long string
with this shape in the `trait-sub`:

```js
'<div class="trait-sub"><span class="trait-qual dim">' + esc(p.tradition) + '</span>'
+ (p.free === false ? '<span class="trait-chip">' + xpCost + ' XP</span>' : '')
+ '</div>'
```

`trait-chip` has **no CSS definition** — it renders as unstyled text. The MG
tag goes alongside this, using the new `.rite-mg-tag` class instead.

---

## Implementation

### T1 — CSS: add `.rite-mg-tag` in `public/css/components.css`

Locate the **"Rite badges"** block (currently lines ~769–774):

```css
/* ── Rite badges ── */
.rite-free-badge,.rite-xp-badge{...}
.rite-free-badge{...}
.rite-free-badge:hover{...}
.rite-xp-badge{...}
.rite-xp-badge:hover{...}
```

Add immediately after `.rite-xp-badge:hover`:

```css
.rite-mg-tag{font-family:var(--fl);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);background:var(--accent-a8);border:1px solid var(--accent-a40);padding:1px 5px;border-radius:3px;white-space:nowrap;flex-shrink:0;}
```

This matches the visual pattern of `.disc-clan-tag` (line ~472) and
`.gen-granted-tag-view` (line ~384) — small 9px Lato gold accent inline tag.
Do NOT invent a new colour or size token.

### T2 — Suite sheet: add chip to tradSub (`public/js/suite/sheet.js`, ~line 605)

Find the `tradSub` assignment inside the `ritesList.forEach` loop:

```js
const tradSub = p.tradition ? `<div class="trait-sub"><span class="trait-qual dim">${p.tradition}</span></div>` : '';
```

Replace with:

```js
const mgChip = p.mandragora_parked ? `<span class="rite-mg-tag" title="Permanently sustained by Mandragora Garden">MG</span>` : '';
const tradSub = (p.tradition || mgChip) ? `<div class="trait-sub"><span class="trait-qual dim">${p.tradition || ''}</span>${mgChip}</div>` : '';
```

### T3 — Editor sheet: add chip to view-mode trait-sub (`public/js/editor/sheet.js`, ~line 702)

In the `else` branch of `if (editMode)` inside `ritP.forEach`, find the
view-mode HTML string. Locate the `.trait-sub` section:

```js
'<div class="trait-sub"><span class="trait-qual dim">' + esc(p.tradition) + '</span>'
+ (p.free === false ? '<span class="trait-chip">' + xpCost + ' XP</span>' : '')
+ '</div>'
```

Add the MG chip after the XP chip:

```js
'<div class="trait-sub"><span class="trait-qual dim">' + esc(p.tradition) + '</span>'
+ (p.free === false ? '<span class="trait-chip">' + xpCost + ' XP</span>' : '')
+ (p.mandragora_parked ? '<span class="rite-mg-tag" title="Permanently sustained by Mandragora Garden">MG</span>' : '')
+ '</div>'
```

Also add to edit-mode HTML (inside `if (editMode)` at line ~700) in the same
`trait-sub` location for ST awareness during editing. The edit-mode `trait-sub`
currently only shows `esc(p.tradition)` — add the MG chip alongside it.

---

## Acceptance criteria

- [ ] Given a character with `mandragora_parked: true` on a rite, both the
  suite sheet and the admin/editor sheet show a small "MG" tag beside that rite
  in the Rites section
- [ ] Given a character with `mandragora_parked: true` on a rite, the MG tag
  has a `title` attribute of "Permanently sustained by Mandragora Garden"
- [ ] Non-parked rites (`mandragora_parked` absent or `false`) show no MG tag
- [ ] The MG tag uses the `.rite-mg-tag` CSS class (gold accent, 9px, uppercase)
- [ ] No changes to `downtime-form.js`, `server/`, or any schema files

---

## Guardrails

- Only three files change: `suite/sheet.js`, `editor/sheet.js`, `components.css`.
- Do NOT add new JavaScript logic, API calls, or data fetching — `mandragora_parked`
  is already on the in-memory character object.
- Do NOT modify `saveEntryReview`, `updateSubmission`, or any DT processing code.
- Do NOT touch `downtime-form.js` — the Mandragora 2b/2c code there already handles
  the DT form side and belongs to issue #746.
- The `.rite-mg-tag` style must stay in the "Rite badges" block of `components.css`
  alongside `.rite-free-badge` and `.rite-xp-badge` — not in `suite.css` or
  `admin-layout.css`.
- Read the full rite rendering block in both sheet files before editing — it is
  long minified HTML string; surgical edits only.

---

## Dev Agent Record

### Files changed

- `public/css/components.css` — T1: added `.rite-mg-tag` rule after `.rite-xp-badge:hover` in the Rite badges block
- `public/js/suite/sheet.js` — T2: `mgChip` variable + updated `tradSub` to include chip when `mandragora_parked`
- `public/js/editor/sheet.js` — T3: MG chip added to view-mode trait-sub (line 702) and edit-mode trait-sub (line 700)
- `tests/feat-745-sheet-mg-parked-rites.spec.js` — 8 Playwright tests (AC-1/2/3 × suite, admin view-mode, admin edit-mode)

### Completion notes

T1 (CSS): `.rite-mg-tag` placed in the existing Rite badges block alongside `.rite-free-badge` / `.rite-xp-badge`. Follows `.disc-clan-tag` visual pattern — 9px Lato, gold accent, `accent-a8` background, `accent-a40` border, radius 3px, uppercase.

T2 (suite sheet): `tradSub` was a simple ternary on `p.tradition`. Split into: `mgChip` (conditional span, empty string if not parked) + `tradSub` guarded on `p.tradition || mgChip` so a rite with no tradition but a parked flag still gets the trait-sub wrapper.

T3 (editor sheet): The view-mode `h+=` string was one long line — matched on the `trait-chip` conditional suffix to avoid the `›` character. Edit-mode matched on `esc(p.tradition)` + drawer opener context. Both changes add `(p.mandragora_parked ? '<span class="rite-mg-tag" ...>MG</span>' : '')` before the closing `</div>` of trait-sub.

All 8 Playwright tests pass (17.7s). No regressions.
