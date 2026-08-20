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

**Touch targets:** every interactive control on a player surface needs a hit area of at least
`var(--tap-min)` (44px, WCAG 2.5.5 AAA, declared in `theme.css`'s `:root`). Use the token, never a
bare `44px`. The three techniques and their traps are documented in one block at the end of
`public/css/suite.css` (search "TOUCH TARGETS"); read it before adding a new control.

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

### Component Reuse (reuse before invent)

Most UI is already built from reusable classes. Before adding markup, grep for an
analogous element and reuse its class. Inventing a one-off class (or worse, an
inline style) when a component already exists is the single most common drift we
clean up after.

Shared, app-agnostic components live in `public/css/components.css`. App-specific
chrome lives in `suite.css` (Suite/Game) and `admin-layout.css` (ST Admin).

Common reusable classes (confirm in the CSS before use):

| Need | Class(es) | File |
|---|---|---|
| Action button | `.dt-btn` (admin), `.nbtn` (suite nav) | admin-layout / suite |
| Text input / select | `.form-input`, `.form-select`, `.form-label` | components |
| Form section | `.form-section`, `.form-section-title` | components |
| Character card / grid | `.char-card`, `.char-grid`, `.char-chip` | components |
| Dot stepper / dots | `.dot-stepper`, `.pointed` (+`.hollow`) | components |
| Expandable row | `.exp-row` (+`.exp-row.open`) | components |
| Merit breakdown row | `.merit-bd-row` + `.bd-grp`/`.bd-lbl`/`.bd-eq`/`.bd-val` | components |
| Sheet section | `.sh-sec` | components |
| Influence / merit rows | `.infl-edit-row`, `.infl-tier-chip`, `.mci-block`, `.dom-edit-block` | components |
| DT processing panel | `.proc-feed-mod-panel`, `.proc-pool-builder` (grouped chrome) | admin-layout |
| Derived note / annotation | `.derived-note` | components |

If nothing fits, add a class to the correct stylesheet (shared → `components.css`;
app-specific → the app sheet) using tokens, and follow the Shared Chrome Pattern
above. Do not fork chrome and do not inline.

### Styling from JavaScript

Render functions build HTML strings. **Apply a class — never an inline
`style="color:#..."`.** Inline styles bypass tokens and theming and are the main
source of design drift in AI-written features.

```js
// WRONG: inline style + bare hex; ignores tokens and dark theme
h += `<span style="color:#E0C47A;font-size:10px;">${label}</span>`;

// RIGHT: reuse/define a class; colour comes from a token in the stylesheet
h += `<span class="effpool-seg effpool-merit">${label}</span>`;
// .effpool-merit { color: var(--gold2); font-size: 10px; }  (in the app stylesheet)
```

If a one-off dynamic value is genuinely unavoidable (e.g. a computed width), it
must still resolve to a token, never a literal colour/font.

#### The DOM API counts too

The rule above is about the *value*, not about the syntax that carried it. Setting
the same literal through the DOM API is equally prohibited: `el.style.cssText`,
`el.style.color`, `el.style.background` and every sibling. This is not a
hypothetical. #854 normalised the attribute form and left the DOM-API form
untouched, because its enforcement grep only matched `style="..."`; #859 was
raised out of that gap and gdx-4 closed it.

```js
// WRONG: same literal, different syntax; the grep that only reads attributes misses it
btn.style.cssText = 'background:#333;color:#aaa;border:1px solid #555';
el.style.color = '#fff';

// RIGHT: a class, with the colours declared as tokens in the stylesheet
btn.className = 'dev-preview-btn';
el.classList.add('is-error');
// .feed-confirm-btn.is-error { background: var(--crim); color: var(--txt-on-dark); }
```

One shape is compliant and must **not** be "fixed": `var(--token, #hex)`, where
the hex is a fallback and the token is what renders. `public/js/app.js`'s
`statusEl.style.color = 'var(--green2, #7EC8A0)'` is the precedent (#859 AC2).

#### Enforcement

Both greps are the human-runnable form. Run them by hand as:

```
grep -rnoE "\.style\.[a-zA-Z]+\s*=\s*['\"\`][^'\"\`]*(#[0-9A-Fa-f]{3,6}|rgba?\()" public/js/
grep -rnoE "style=\"[^\"]*(#[0-9A-Fa-f]{3,6}|rgba?\()" public/js/
```

The first must return exactly one line, `public/js/app.js`'s `var()` fallback. The
second must return none.

**The checked-in vitest suite is a stricter superset of these two commands, not an
identical copy** - a Codex adversarial review (2026-08-20) found that treating them
as interchangeable let real bypasses through: the shell greps use `{3,6}` hex
digits and (the second) double-quoted attributes only, while
`server/tests/gdx-4-css-standards-grep.test.js` matches `{3,8}` digits, both quote
styles, whitespace around `=`, and several more DOM-API syntax forms
(`.style['prop'] =`, `+=`, `.setProperty(...)`, `.setAttribute('style', ...)`).
It also runs over the whole of `public/js` and, for the bare-hex-in-declaration
check, `public/css/suite.css` plus (grandfathered at their measured pre-existing
count where non-zero) the rest of `public/css` except `theme.css` - see that
file's own header for the full list. Prefer running the vitest suite over
copy-pasting the shell commands: a match on the commands above is necessary but
not sufficient for a clean gate.

#### Documented exemptions

Exactly two standing exemptions exist. This list is the register: adding a third
means adding it here, with its reason, and to the allowlist in the test suite
above. Nothing is exempt by being overlooked.

1. **`public/js/editor/print.js`'s embedded `<style>` block.** `printSheet()` builds
   a complete standalone `<!DOCTYPE html>` document and hands it to a new window
   for printing. That document does not link `theme.css` and must not: a print
   sheet needs dark ink on white paper whichever theme the ST is running in the
   app, so `var(--txt)` would resolve to nothing there. The exemption covers that
   one embedded stylesheet only: a colour in a `style="..."` attribute inside the
   same file is still a violation.
2. **`console.log('%c...')` devtools banners** (`public/js/admin.js:2`). Console
   `%c` styling is parsed by the browser's devtools console, not by the page's CSS
   engine, so it cannot read a custom property.

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
