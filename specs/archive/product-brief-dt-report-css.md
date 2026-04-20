---
title: "Product Brief: DT Report Dark-Native CSS — Breathing Correspondence"
status: "complete"
created: "2026-04-17"
updated: "2026-04-17"
inputs:
  - specs/brainstorming/brainstorming-session-2026-04-17-1.md
  - public/js/player/story-tab.js
  - public/css/suite.css (lines 580–622)
  - public/css/theme.css (dark mode variables)
---

# Product Brief: DT Report Dark-Native CSS — Breathing Correspondence

## Problem

The DT Report tab in the Terra Mortis game app (`index.html`) renders downtime narratives using CSS ported from the player portal (`player-layout.css`). That CSS was designed for a desktop browser with light-mode parchment aesthetics: card borders, background fills, small uppercase labels, cramped body text. Applied to the game app's dark theme on a phone screen at a live LARP table, the result is visually incoherent — a widget-heavy UI where the text is hard to read and the atmosphere is absent.

The game app serves a fundamentally different context: players reading their DT narrative in transit (mood-setting ritual) or glancing at mechanical outcomes in a dark venue. The design must honour both modes.

## Design Direction: Breathing Correspondence

The DT Report is not a portal widget. It is a **threshold ritual** — the document a player reads to cross into the game world. The design language is a **playbill/letter hybrid**:

- Outer structure = theatre programme. The cycle label is the title card.
- Inner content = correspondence. Section headings are already written as story beats; the design honours that.
- Chrome reduced to the minimum needed for legibility. The dark page is the page.

**Typography constraint (hard rule — no exceptions):**
- `--fh` (Cinzel) — cycle label ONLY, as the one display moment
- `--fl` (Lato) — headings, labels, type chips, roll results
- `--ft` (Libre Baskerville) — all narrative body text

---

## Scope

### In scope
- CSS changes to `.story-*` and `.proj-card-*` classes in `public/css/suite.css`
- Minor HTML output changes in `public/js/player/story-tab.js` (two targeted edits)

### Out of scope
- `public/css/player-layout.css` — the player portal's Chronicle view is NOT being changed
- Card internal order — confirmed as Title → Fiction → Details (no reordering)
- Any new components or data changes

---

## Implementation Specification

### File: `public/css/suite.css`

Replace the current `.story-*` and `.proj-card-*` blocks (lines ~580–622) with the following rules. All changes are dark-mode native (game app never renders in light mode).

#### Cycle label — Cinzel display heading

**Before:**
```css
.story-cycle-label {
  background: var(--surf3);
  padding: 8px 16px;
  font-family: var(--fl);
  font-size: 12px;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: .08em;
  border-bottom: 1px solid var(--bdr);
}
```

**After:**
```css
.story-cycle-label {
  font-family: var(--fh);        /* Cinzel — the only display usage */
  font-size: 22px;
  font-weight: 400;
  color: var(--txt);
  text-align: center;
  padding: 28px 20px 20px;
  letter-spacing: .04em;
  border-bottom: 1px solid var(--bdr2);
  margin-bottom: 8px;
}
```

#### Story entry — remove container chrome

**Before:**
```css
.story-entry {
  background: var(--surf2);
  border: 1px solid var(--bdr);
  border-radius: 8px;
  overflow: hidden;
}
```

**After:**
```css
.story-entry {
  /* No background, no border, no radius — dark page is the container */
}
```

#### Narrative body — Libre Baskerville, full legibility

**Before:**
```css
.story-narrative {
  padding: 16px;
  font-size: 14px;
  color: var(--txt2);
  line-height: 1.7;
}
.story-narrative p { margin: 0 0 10px; }
.story-narrative p:last-child { margin-bottom: 0; }
```

**After:**
```css
.story-narrative {
  font-family: var(--ft);        /* Libre Baskerville */
  font-size: 16px;
  color: var(--txt);             /* Full cream — highest legibility */
  line-height: 1.85;
  padding: 0 20px;
}
.story-narrative p { margin: 0 0 14px; }
.story-narrative p:last-child { margin-bottom: 0; }
```

#### Section structure — ruled separator, sentence-case heading

**Before:**
```css
.story-section {
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--bdr);
}
.story-section:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.story-section-head {
  font-family: var(--fl);
  font-size: 12px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--accent);
  margin: 0 0 8px;
}
```

**After:**
```css
.story-section {
  padding: 20px 0 0;
  margin: 0 0 4px;
}
.story-section:first-child { padding-top: 12px; }
.story-section-head {
  font-family: var(--fl);        /* Lato */
  font-size: 14px;
  font-weight: 600;
  color: var(--txt);
  letter-spacing: 0;
  text-transform: none;          /* Sentence case — these are story beat titles */
  margin: 0 0 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--bdr2);
}
.story-section-mech {
  background: var(--surf2);
  padding: 10px;
  border-radius: 4px;
  margin: 0 0 12px;
}
```

#### Project cards — left-border accent, no box

**Before:**
```css
.proj-card {
  border: 1px solid var(--bdr);
  border-radius: 6px;
  margin: 12px 16px 20px;
  padding: 14px 16px;
  background: var(--surf2);
}
.proj-card-withheld { border-style: dashed; padding: 12px 16px; opacity: .7; }
.proj-card-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.proj-card-type-chip {
  font-family: var(--fl);
  font-size: 10px;
  letter-spacing: .07em;
  text-transform: uppercase;
  background: var(--surf3);
  border: 1px solid var(--bdr);
  border-radius: 3px;
  padding: 2px 6px;
  color: var(--txt3);
  flex-shrink: 0;
}
.proj-card-name { font-family: var(--fl); font-size: 13px; font-weight: 600; color: var(--txt1); letter-spacing: .03em; }
.proj-card-objective { font-size: 12px; color: var(--txt3); font-style: italic; margin-bottom: 10px; }
```

**After:**
```css
.proj-card {
  border: none;
  border-left: 3px solid var(--gold2);  /* Left-border accent only */
  border-radius: 0;
  margin: 14px 0 22px 20px;
  padding: 10px 16px;
  background: none;                      /* No fill — dark page is the container */
}
.proj-card-withheld {
  border-left-color: var(--bdr2);
  opacity: .6;
  padding: 10px 16px;
}
.proj-card-header { display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
.proj-card-type-chip {
  font-family: var(--fl);
  font-size: 10px;
  font-style: italic;
  letter-spacing: .04em;
  text-transform: none;
  background: none;
  border: none;
  padding: 0;
  color: var(--txt3);
  flex-shrink: 0;
}
.proj-card-type-chip::after { content: ' ·'; }   /* Inline prefix separator */
.proj-card-name { font-family: var(--fl); font-size: 14px; font-weight: 600; color: var(--txt); letter-spacing: 0; }
.proj-card-objective { display: none; }           /* Eliminated — not needed at game */
```

#### Pool + dice metadata — de-emphasised combined line

**Before:**
```css
.proj-card-pool { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; }
.proj-card-pool-label { font-family: var(--fl); font-size: 10px; letter-spacing: .07em; text-transform: uppercase; color: var(--txt3); }
.proj-card-pool-val { color: var(--txt2); }
```

**After:**
```css
.proj-card-pool {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-family: var(--fl);
  font-size: 11px;
  color: var(--txt3);
}
.proj-card-pool-label { display: none; }    /* "Pool" label redundant in this context */
.proj-card-pool-val { color: var(--txt3); }
```

#### Roll result — prominent, colour-coded outcome

**Before:**
```css
.proj-card-roll {
  display: inline-block;
  margin-top: 8px;
  font-family: var(--fl);
  font-size: 11px;
  letter-spacing: .06em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 3px;
  border: 1px solid var(--bdr);
  background: var(--surf3);
  color: var(--txt2);
}
.proj-card-roll-exc { border-color: var(--gold2); color: var(--gold2); background: transparent; }
.proj-card-roll-fail { border-color: var(--crim); color: var(--crim); background: transparent; }
```

**After:**
```css
.proj-card-roll {
  display: block;
  margin-top: 8px;
  font-family: var(--fl);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: .01em;
  text-transform: none;
  padding: 0;
  border: none;
  border-radius: 0;
  background: none;
  color: var(--txt2);             /* Standard outcome */
}
.proj-card-roll-exc { color: var(--gold2); }     /* Exceptional — gold */
.proj-card-roll-fail { color: var(--crim); }     /* Failure — crimson */
```

#### Dice string — secondary detail

**Before:**
```css
/* No existing rule — .proj-card-dice rendered as unstyled div */
```

**After:**
```css
.proj-card-dice {
  font-family: var(--fl);
  font-size: 11px;
  color: var(--txt3);
  margin-top: 2px;
}
```

#### ST note — left-ruled quote style

**Before:**
```css
.proj-card-feedback {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--bdr);
  font-size: 12px;
  color: var(--txt3);
  line-height: 1.5;
}
.proj-card-feedback-label {
  font-family: var(--fl);
  font-size: 10px;
  letter-spacing: .07em;
  text-transform: uppercase;
  display: block;
  margin-bottom: 3px;
  color: var(--txt3);
}
```

**After:**
```css
.proj-card-feedback {
  margin-top: 10px;
  padding: 6px 0 0 10px;
  border-top: none;
  border-left: 2px solid var(--bdr2);
  font-family: var(--ft);         /* Libre Baskerville — narrative context */
  font-size: 13px;
  color: var(--txt3);
  line-height: 1.6;
}
.proj-card-feedback-label {
  font-family: var(--fl);
  font-size: 10px;
  font-style: italic;
  letter-spacing: .04em;
  text-transform: none;
  display: block;
  margin-bottom: 4px;
  color: var(--txt3);
}
```

#### Withheld message

```css
.proj-card-withheld-msg { font-family: var(--ft); font-size: 13px; color: var(--txt3); font-style: italic; margin: 6px 0 0; }
```

#### Story feed — tighten spacing

```css
.story-feed { display: flex; flex-direction: column; gap: 32px; }
```

#### Preserve: story-pre and story-proj-* classes

The `.story-pre` and `.story-proj-*` classes (old project card pattern, not currently used by `renderOutcomeWithCards`) can remain unchanged. They are not rendered by the current code path.

---

### File: `public/js/player/story-tab.js`

Two targeted changes to the HTML output of `renderOutcomeWithCards()` and `renderMeritActionCards()`.

#### Change 1: Remove `proj-card-objective` from HTML output

In `renderOutcomeWithCards()` around line 193–195, remove the conditional that emits `.proj-card-objective`:

**Remove these lines:**
```js
const objective = sub.responses?.[`project_${n}_description`] || sub[`project_${n}_description`];
if (objective) cardHtml += `<div class="proj-card-objective">${esc(objective)}</div>`;
```

The CSS hides this element anyway (`.proj-card-objective { display: none }`), but removing it from the DOM is cleaner.

#### Change 2: No structural changes to card order

Card internal order is confirmed: Header (chip + name) → Objective [removed] → Pool → Roll → Dice → Feedback. No reordering.

---

## Prioritised Implementation Order

| # | Change | Files | Risk |
|---|--------|-------|------|
| 1 | Typography: 16px body, 1.85 line-height, `--txt`, Libre Baskerville | suite.css | Low |
| 2 | Cycle label: Cinzel 22px, centred, generous padding | suite.css | Low |
| 3 | Remove card backgrounds + box borders from `.story-entry` and `.proj-card` | suite.css | Low |
| 4 | Left-border accent on `.proj-card` (`--gold2`, 3px) | suite.css | Low |
| 5 | Section heading: Lato 14px sentence case, ruled line beneath | suite.css | Low |
| 6 | Roll result: 16px bold, colour-coded, no border/badge chrome | suite.css | Low |
| 7 | Remove `proj-card-objective` from JS output | story-tab.js | Low |
| 8 | Type chip: italic inline prefix, no badge chrome | suite.css | Low |

All changes are low risk — purely presentational, no data or logic.

---

## Design Tokens Reference (dark mode)

| Token | Value | Usage in this brief |
|---|---|---|
| `--bg` | `#0D0B09` | Page background (no overrides needed) |
| `--surf2` | `#1E1A16` | Removed from story cards |
| `--surf3` | `#252018` | Removed from cycle label |
| `--txt` | `#E8E0D0` | Narrative body, headings, card names |
| `--txt2` | `#C4B49A` | Standard roll result |
| `--txt3` | `#8A7A6A` | Pool, type chip, ST note label, dice |
| `--bdr` | `rgba(201,169,98,.18)` | Section separator rules |
| `--bdr2` | `rgba(201,169,98,.35)` | Cycle label rule, heading rule, feedback rule |
| `--gold2` | `#E0C47A` | Left-border accent, exceptional result |
| `--crim` | `#8B0000` | Failure result |
| `--fh` | Cinzel | Cycle label only |
| `--fl` | Lato | Headings, labels, roll results, type chip |
| `--ft` | Libre Baskerville | Narrative body, ST note body |

---

## Acceptance Criteria

- [ ] Cycle label renders in Cinzel, centred, ~22px, with no surface background
- [ ] Narrative body renders in Libre Baskerville, 16px, `--txt`, 1.85 line-height
- [ ] Section headings render in Lato, sentence case (not uppercase), with a thin ruled line beneath
- [ ] Project cards have a 3px `--gold2` left border only — no background fill, no box border, no border-radius
- [ ] `proj-card-objective` is absent from the DOM
- [ ] Roll result (e.g., "4 Successes", "Exceptional Success", "Failure") renders at 16px bold, colour-coded: gold = exceptional, crimson = failure, `--txt2` = standard
- [ ] Type chip renders as italic Lato prefix (e.g., "Investigate ·") with no badge border or background
- [ ] ST note renders in Libre Baskerville with a left-border accent, no top border
- [ ] No Cinzel usage appears anywhere other than the cycle label
- [ ] No surface backgrounds (`--surf2`, `--surf3`) applied to narrative or card containers
- [ ] Changes visible in game app (`index.html`) Downtime tab — NOT in player portal story tab
