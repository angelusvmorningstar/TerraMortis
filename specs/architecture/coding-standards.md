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

All colour values are defined in `css/theme.css` as CSS custom properties. No hardcoded hex values in any other file.

```css
/* css/theme.css */
:root {
  --bg:     #0D0B09;    /* page background */
  --surf1:  #1A1714;    /* surface tier 1 */
  --surf2:  #241F1B;    /* surface tier 2 */
  --surf3:  #2E2823;    /* surface tier 3 */
  --gold1:  #C4A85A;    /* gold, muted */
  --gold2:  #E0C47A;    /* gold, primary accent */
  --gold3:  #F0D898;    /* gold, highlight */
  --crim:   #8B0000;    /* crimson -- damage, alerts */
  --text:   #E8DCC8;    /* primary text */
  --muted:  #8A7E6E;    /* secondary text */
}
```

All other CSS files use `var(--token-name)` exclusively for colour.

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

| Use | Font |
|---|---|
| Headings (H1-H3), character names | Cinzel Decorative |
| Sub-headings (H4-H6), labels | Cinzel |
| Body text, descriptions | Lora |
| Numbers, stats | Lora or monospace fallback |

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
