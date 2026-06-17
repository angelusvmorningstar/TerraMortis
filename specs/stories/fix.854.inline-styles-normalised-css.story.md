---
title: 'Replace inline styles / bare hex in JS render code with normalised CSS'
type: 'fix'
issue: 854
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/854
branch: ms/issue-854-inline-styles-normalised-css
created: '2026-06-17'
status: review
recommended_model: 'sonnet — small, well-scoped token-compliance fix; ~11 colour literals across 5 files, mostly reusing existing tokens'
context:
  - public/js/suite/roll.js
  - public/js/editor/sheet.js
  - public/js/suite/sheet.js
  - public/js/data/helpers.js
  - public/js/tabs/history-form.js
  - public/css/theme.css
  - public/css/suite.css
  - public/css/components.css
---

## Intent

App render code builds HTML with inline `style="color:#..."` / `rgba(...)` colour
literals instead of using the normalised CSS. These bypass `theme.css` tokens and
**break dark/light theming**. This story replaces the in-scope colour literals
with token-backed classes. First issue to flow through the CSS enforcement wiring
(`specs/project-context.md`, `coding-standards.md` → CSS Standards) — follow it.

## Root cause (do NOT re-investigate)

The hardcoded values are, in most cases, **literally the dark-theme token hex**,
baked in so they only look right on the dark theme and are wrong on Parchment
(the default). Mapping them back to the token fixes both the violation and the
broken theming. Confirmed against `public/css/theme.css`:

| Literal | Where | Meaning | Correct token |
|---|---|---|---|
| `#E0C47A` | roll.js:108 | merit bonus | `var(--gold2)` (dark `--gold2` IS #E0C47A; theme.css:184) |
| `#7EC8A0` | roll.js:110 | WP +3 | `var(--green2)` (dark `--green2` IS #7EC8A0; theme.css:209) |
| `#A8C4E0` | roll.js:112 | −Resist | `var(--info)` (dark `--info` IS #A8C4E0; theme.css:231) |
| `#E8A0A0` | roll.js:96, :106 | chance die / unskilled | crim family — reuse `var(--crim2)` or add a soft-negative token if the shade reads wrong on parchment (dev judgement) |
| `#9E7AE0` | roll.js:109 | Rote eligible | **no purple in the palette** — add ONE new semantic token (e.g. `--rote`) with a Parchment + dark value, defined in `theme.css` |
| `rgba(140,200,140,.8)` / `.9` | sheet.js:569, suite/sheet.js:269, helpers.js:239 | "attached" indicator green | `var(--green2-a9)` (or `-a8`) — **token already exists** (theme.css:57 parchment / :211 dark). NO new token. |
| `rgba(220,160,120,.9)` | sheet.js:740 | (amber annotation) | reuse a warm/warn token if one matches, else add one (dev judgement) |
| `#5A1A1A` | history-form.js:143 | crimson link | crim family (`var(--crim)`), confirm contrast |

Key facts:
- `roll.js` colours sit on spans that **already use the `.effpool-seg` class**
  (suite.css:135). Reuse it — add modifier classes (e.g. `.effpool-seg--merit`,
  `--wp`, `--resist`, `--rote`, `--neg`) carrying the token colour, rather than
  inlining. Line 109's `font-size:10px;cursor:pointer` and the `onclick` move into
  the class / stay as attributes respectively.
- The "attached" green token (`--green2-a8/-a9`) **already exists** — three files
  hardcode its dark value. One shared class, reuse across all three.

## Fix specification

For each in-scope colour literal, replace the inline `style` colour with a
token-backed class. Reuse an existing class/token where one fits; add a class (and
only where nothing fits, a token) otherwise. Per file:

### T1 — `public/js/suite/roll.js` (6 literals)
- :96 chance-die, :106 unskilled (`#E8A0A0`), :108 merit (`#E0C47A`), :109 rote
  (`#9E7AE0` + font-size/cursor), :110 WP (`#7EC8A0`), :112 resist (`#A8C4E0`).
- Add modifier classes on `.effpool-seg` in `suite.css` using the tokens from the
  table above. The `:96` chance-die span has no `.effpool-seg` class — give it the
  appropriate class too. Keep the `onclick`/`title` attributes on :109.

### T2 — shared "attached" green (3 files, ONE class)
- `editor/sheet.js:569`, `suite/sheet.js:269` (ternary green-vs-`--txt3`),
  `data/helpers.js:239`. Replace the `rgba(140,200,140,.x)` with a class whose
  colour is `var(--green2-a9)`. For the :269 ternary, two classes (attached vs
  not) or a class + the existing `--txt3` fallback. Put the shared class in
  `components.css` (used by both editor and suite render paths).

### T3 — `public/js/editor/sheet.js:740` (amber) and `tabs/history-form.js:143` (crim link)
- Replace with token-backed classes (`:740` amber per table; `:143` crim link).

## Acceptance criteria

- [x] **AC-1** Every in-scope colour literal replaced by a token-backed class; no
      inline `style=` colour literal remains in the in-scope files. _(Was 12 not 11:
      the assessment grep missed editor/sheet.js:299 — a 4th "attached" green whose
      value is string-concatenated. Caught by the AC-2 grep and fixed.)_
- [x] **AC-2** Broadened grep (catches concatenated values) returns **0** outside
      `editor/print.js`.
- [ ] **AC-3** Both themes render correctly — **pending manual smoke on dev**
      (roll legend, "attached" touchstone labels, AoE "+2", history link, in
      Parchment AND dark). Cannot be run locally.
- [x] **AC-4** Exactly one new token added (`--rote`, both themes); the "attached"
      green reuses the existing `--green2-a9`/`-a8`; gold2/green2/info/crim2/gdim
      all reused.
- [x] **AC-5** `node --check` clean on every changed `.js` file.

## Dev notes

### Reuse before invent (consult the standard)
Read `specs/project-context.md` and `specs/architecture/coding-standards.md` →
"CSS Standards" (Component Reuse, Styling from JavaScript) first. The default
move is reuse an existing token/class; add a token only for the Rote purple.

### Exempt — do NOT touch
- `public/js/editor/print.js` (5 grey literals `#888`/`#555`/`#999`). PDF
  generation does not load the CSS cascade, so inline styles there are
  legitimate. Leave it; the AC-2 grep explicitly excludes it. (Optionally add a
  one-line comment in print.js noting the deliberate exemption.)

### Out of scope (separate follow-up)
- Inline `width` / `font-size` styles in `editor/sheet.js` that are **not**
  colours. The AC is colour-only. Do not expand into these; note them for a later
  pass so this stays a clean, reviewable token-compliance diff.

### Where classes live
- roll.js legend → `suite.css` (next to `.effpool-seg`, :135).
- shared "attached" green → `components.css` (shared by editor + suite).
- history-form link → wherever history-form's other classes live (likely
  `components.css` / app sheet; grep first).

### Testing approach
No client test framework — **manual in-browser verification on dev**, in BOTH
Parchment and dark theme:
1. Roll calculator: trigger each legend segment (merit, WP, resist, rote-eligible,
   unskilled, chance die) and confirm the colour is correct and readable in both
   themes.
2. Sheet/suite "attached" indicators render green in both themes (was dark-baked).
3. History form crimson link renders correctly in both themes.
Plus `node --check` on changed files and the AC-2 grep. Do NOT mandate Playwright.

## Dev Agent Record

### Files to change
- `public/js/suite/roll.js`, `public/css/suite.css` (effpool-seg modifiers)
- `public/js/editor/sheet.js`, `public/js/suite/sheet.js`, `public/js/data/helpers.js`, `public/css/components.css` (shared "attached" green class)
- `public/js/tabs/history-form.js` (crim link class)
- `public/css/theme.css` (only if a `--rote` token is needed)

### Files changed
- `public/css/theme.css` — new `--rote` token (Parchment `#6A3CA0`, dark `#9E7AE0`)
- `public/css/suite.css` — `.effpool-seg--neg/--merit/--rote/--wp/--resist` modifiers
- `public/css/components.css` — `.exp-ts-state(.attached/.detached)`, `.sk-spec-aoe`, `.aoe-bonus`, `.rite-trad-single`, `.qf-link`
- `public/js/suite/roll.js` — 6 legend literals → effpool-seg modifier classes
- `public/js/editor/sheet.js` — 3 literals: touchstone attached (:299), spec AoE "+2" (:569), single-tradition label (:740)
- `public/js/suite/sheet.js` — touchstone attached label (:269)
- `public/js/data/helpers.js` — AoE "+2" spec badge (:239)
- `public/js/tabs/history-form.js` — backstory link (:143)

### Completion notes
- Token mapping per the Root-cause table: the dark-baked hex were mapped back to
  their tokens (`#E0C47A`→`--gold2`, `#7EC8A0`→`--green2`, `#A8C4E0`→`--info`),
  the soft red → `--crim2`, the single-tradition amber → `--gdim`, the crimson
  link → `--crim`. Only the Rote purple needed a new token (`--rote`).
- The "attached" green is **4 sites**, not 3 — the assessment grep missed
  `editor/sheet.js:299` (value built by string concat, so not matched by a
  `style="...rgba("` single-line pattern). The AC-2 grep caught it; all four now
  use `--green2-a9`/`-a8` via classes.
- **Pre-existing hack preserved (not in scope):** `components.css:992`
  (`html:not([data-theme="dark"]) .sk-spec-row span { color: var(--crim) !important }`)
  already forced the editor spec "+2" crimson in light theme, so the inline green
  only ever showed in dark. The class swap preserves that exact behaviour. If the
  ST wants the editor "+2" green in light too, that `!important` rule is a separate
  follow-up.
- **Out of scope (noted):** inline `width`/`font-size` styles in `editor/sheet.js`
  remain (AC is colour-only) — separate pass. `editor/print.js` left as documented
  exemption (PDF can't use the cascade).
- Verification: `node --check` clean on all 5 changed JS files; AC-2 grep returns 0
  outside print.js. **AC-3 (both-theme render) pending manual smoke on dev.**

### Change Log

| Date | Description |
|------|-------------|
| 2026-06-17 | Implemented: 12 inline colour literals across 6 files → token-backed classes; one new `--rote` token. Status → review. |
| 2026-06-17 | QA (Quinn): PASS at code level. Out-of-scope DOM-API blind spot flagged. |

---

## QA Results (Quinn, 2026-06-17)

**Verdict: PASS at code level** for the defined scope. AC-3 (both-theme visual render) pending manual smoke on dev (cannot run locally).

### Verified
- **Class consistency:** all 10 new classes match 1:1 between JS use and CSS def
  (`effpool-seg--neg/--merit/--rote/--wp/--resist`, `exp-ts-state` (+`.attached`/`.detached`),
  `sk-spec-aoe`, `aoe-bonus`, `rite-trad-single`, `qf-link`). No typo mismatches.
- **Theme-flip correct:** every token used exists in BOTH Parchment and dark
  (`--rote`, `--crim2`, `--gold2`, `--green2`, `--info`, `--gdim`, `--green2-a8/-a9`,
  `--crim`, `--txt3`). The roll legend now shows the readable Parchment values
  (`--gold2` #7A5208, `--green2` #2A7A4A, `--info` #1A4A7A) instead of the pale
  dark-theme hex that were baked in — i.e. the fix corrects the parchment rendering.
- **components.css:992 `!important` preserved:** the editor spec "+2" stays crimson
  in light / green in dark exactly as before (the class swap does not change it).
- **CSS placement correct per app:** editor (admin.html) sites use components.css
  classes (not suite.css); roll.js legend uses suite.css (index.html only). Matches
  the per-app stylesheet loading rule.
- `node --check` clean on all changed JS; AC-2 grep zero outside print.js.

### Findings — OUT OF #854 SCOPE (follow-up)
- **Enforcement blind spot:** the `style="..."` grep misses DOM-API inline styles
  (`.style.cssText` / `el.style.x =`). Real literals found: `admin.js:222`
  (dev-only "Dev Preview" button `#333/#aaa/#555`), `feeding-tab.js:952`
  (`.style.color='#fff'`). `app.js:1780` is token-compliant (`var(--green2, #7EC8A0)`
  fallback). `admin.js:2` is a `console.log('%c')` banner — non-applicable (like print.js).
  → Recommend a small follow-up issue + extending the CSS enforcement guidance to
  cover `.style.*` DOM-API literals.

### Smoke focus (token-compliant but shade shifts — eyeball)
- `rite-trad-single` amber → `--gdim`; `qf-link` `#5A1A1A` → `--crim`; chance-die
  span now inherits `.effpool-seg` sizing (13px). All intentional/acceptable.
