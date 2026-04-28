# Coding Standards

## Language and Locale

**British English throughout.** This is non-negotiable -- the game is set in Sydney and uses VtR 2e British English conventions.

Required spellings:

| British (correct) | American (wrong) |
|---|---|
| Defence | Defense |
| Armour | Armor |
| Honour | Honor |
| Vigour | Vigor |
| Socialise | Socialize |
| Capitalise | Capitalize |
| Organisation | Organization |

Apply to: all string literals, UI labels, variable names where the word appears, comments, documentation.

## JavaScript Standards

### Module Structure

- ES modules only. No global script, no `var`, no IIFEs.
- `const` by default. `let` when reassignment is required. Never `var`.
- Strict mode is implicit in ES modules.
- No single file exceeds 500 lines.

### Function Style

- Named function declarations for module exports:
  ```js
  export function renderSheet(char, container) { ... }
  ```
- Arrow functions for callbacks and short inline expressions:
  ```js
  const total = chars.filter(c => c.clan === 'Daeva').length;
  ```
- No anonymous function expressions assigned to exports.

### Data Access

**Rule:** All character data access goes through `js/data/accessors.js`. Direct property access is forbidden outside that module.

```js
// WRONG -- direct access
const str = char.attributes.Strength.dots;

// RIGHT -- use accessor
import { attrDots } from '../data/accessors.js';
const str = attrDots(char, 'Strength');
```

### Derived Stats

Never compute size, speed, defence, health, willpower max, or vitae max inline. Import from `js/data/derived.js`:

```js
import { calcSpeed, calcDefence, calcHealth } from '../data/derived.js';
```

### Error Handling

No defensive programming for impossible states. Trust the v2 schema. Validate only at boundaries:
- JSON load from fetch (catch network errors)
- localStorage read (handle missing key)
- User input in edit mode (validate before writing to char object)

Do not add try/catch around internal function calls that cannot throw.

### Comments

Comment the *why*, not the *what*. VtR 2e rule references are appropriate:

```js
// VtR 2e p.98: Defence is min(Wits, Dexterity) + Athletics
function calcDefence(c) {
  return Math.min(attrDots(c, 'Wits'), attrDots(c, 'Dexterity')) + skDots(c, 'Athletics');
}
```

Do not comment self-evident code:
```js
// WRONG: increment i
i++;
```

## CSS Standards

### Design Tokens

All colour and font values flow through tokens in `public/css/theme.css`. No bare hex in rule bodies.

The default theme is **Parchment** (warm light); `[data-theme="dark"]` provides the dark override. Tokens flip between themes; rule bodies stay theme-agnostic.

Token families (see `public/css/theme.css` for the full set and per-theme values):

| Family | Tokens | Purpose |
|---|---|---|
| Surfaces | `--bg`, `--surf`, `--surf1`, `--surf2`, `--surf3` | Page bg through rising contrast tiers |
| Borders | `--bdr`, `--bdr2`, `--bdr3` | Default through lightest |
| Text | `--txt`, `--txt2`, `--txt3` | Primary through subdued |
| Text on coloured surfaces | `--txt-on-dark`, `--txt-on-gold`, `--txt-inverse` | Use on `--crim`, accent, dark rgba overlays |
| Accent | `--accent`, `--gold`, `--gold2`, `--gdim` | Panel headers, hover states, active indicators |
| Damage / alerts | `--crim`, `--crim2`, plus opacity variants `--crim-aN` | Crimson states |
| Status | `--green`, `--green2-4`, `--result-succ`, `--result-pend` | Success / pending |
| Fonts | `--fh` (Cinzel), `--fl` (Lato), `--ft` (Libre Baskerville), `--fh-decorative` (Cinzel Decorative) | See Typography below |

**Rule:** never write bare hex in rule bodies. Tokens are the only colour source. The only hex allowed is inside `:root` / `[data-theme]` declarations in `theme.css`.

### Shared Chrome Pattern

When multiple classes share visual chrome (background, border, radius, padding) or shared text style (font, size, weight, letter-spacing), declare it once via a grouped selector rather than duplicating rule bodies.

`public/css/admin-layout.css` uses this pattern extensively for the Downtimes admin tab. Canonical groups (line numbers approximate; check current file):

| Group | Approx line | Purpose |
|---|---|---|
| Outer dashboard panels | ~1361 | `.dt-snapshot-panel`, `.dt-scene-panel`, etc. + `.dt-story-section` |
| Loud collapsible toggle headers | ~1376 | `.dt-snapshot-toggle`, `.proc-phase-header`, etc. |
| Title tiers T1/T2/T3 | ~1592-1628 | Panel header / sub-label / micro-label |
| Inline detail panels | ~2049 | `.dt-proj-slot`, `.proc-pool-builder`, `.proc-feed-mod-panel`, etc. (+ stripe-accent variants) |
| Detail wrapper sections | ~2092 | `.dt-feed-detail`, `.dt-narr-detail`, etc. (top-rule dividers) |
| Story-tab inner cards | ~6688 | `.dt-story-proj-card`, `.dt-story-merit-card`, etc. (+ `.dt-feeding-locked` stripe) |

Adding a new panel? Add it to the appropriate canonical group rather than declaring fresh chrome. Adding a new label? Add it to T1, T2, or T3 rather than inventing a new combination of size/weight/letter-spacing.

**Stripe-accent gotcha:** when a class in a canonical group also has a `border-left: 3px solid <colour>` stripe, the stripe declaration MUST appear LATER in source than the grouped `border` shorthand, otherwise the shorthand resets all four sides and clobbers the stripe.

Design contract: `specs/audits/downtime-ui-audit-2026-04-26.md`.

### Class Naming

BEM-lite: `block__element--modifier`. Keep it readable, not academic.

```css
.char-card { }
.char-card__name { }
.char-card--selected { }
```

No utility class soup. No `!important`.

### Responsive Design

Suite views (Roll, Sheet, Territory, Tracker): mobile-first. Use `min-width` media queries.
Editor views (list, sheet, edit): desktop-first. Tablet optimisation is not required for MVP.

```css
/* Suite: mobile first */
.roll-panel { flex-direction: column; }
@media (min-width: 768px) { .roll-panel { flex-direction: row; } }
```

## HTML Standards

- Semantic elements required: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<button>`, `<ul>/<li>` for lists
- No `<div>` for interactive elements -- use `<button>` for clickable things
- All `<img>` elements require `alt` attributes
- Form inputs require associated `<label>` elements

## Display Conventions

### Dots

Use `'●'.repeat(n)` (U+25CF, BLACK CIRCLE) for filled dots. Use `'○'.repeat(max - n)` (U+25CB, WHITE CIRCLE) for empty dots.

```js
function renderDots(n, max = 5) {
  return '●'.repeat(n) + '○'.repeat(max - n);
}
```

Never use ASCII period or asterisk for dots. Never use emoji.

### Typography

| Use | Font | Token |
|---|---|---|
| Reading-pane h1/h2 (rules/lore documents only) | Cinzel Decorative | `--fh-decorative` |
| Section headings, character names | Cinzel | `--fh` |
| UI labels, buttons, panel titles, chips | Lato | `--fl` |
| Body text, descriptions, prose | Libre Baskerville | `--ft` |
| Numbers, stats | Lato or monospace fallback | `--fl` |

Reference these via the tokens, never via literal family names. New themes can swap fonts by changing only `theme.css`.

### Punctuation

No em-dashes (--) in output text. Use an en-dash (-) or rephrase. This applies to all user-visible strings rendered by JS and all HTML content.

## Naming Conventions

### JavaScript

- Functions: `camelCase` verbs (`renderSheet`, `calcDefence`, `loadChars`)
- Constants/config: `UPPER_SNAKE_CASE` (`MERITS_DB`, `DEVOTIONS_DB`)
- Variables: `camelCase` nouns (`charList`, `editIdx`, `poolSize`)
- DOM element refs: `camelCase` with `El` suffix (`containerEl`, `inputEl`)

### CSS

- Custom properties: `--kebab-case`
- Classes: `kebab-case`

### Files

- All filenames: `kebab-case.ext`
- No uppercase in filenames

## No-Build Standards

Because there is no build step, these constraints apply:

- No TypeScript. No JSX. No template literals that require transpilation.
- No npm packages. No `node_modules`. If a utility is needed, write it.
- ES module `import` paths must include the `.js` extension (browser requirement):
  ```js
  import { renderSheet } from './editor/sheet.js'; // correct
  import { renderSheet } from './editor/sheet';     // WRONG
  ```
- Dynamic `import()` is acceptable for lazy-loading large reference data files.
