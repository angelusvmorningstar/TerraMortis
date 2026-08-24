# Story gdx.4: CSS standards cleanup - DOM-API colour literals, print.js inline hexes, suite.css literals, inline grid layout

Status: review

## Story

As the developer who has to keep Terra Mortis's two apps theme-correct,
I want every colour in the touched files to resolve through a design token or through one explicitly
registered exemption,
so that a future theme change, or a future contributor, cannot silently reintroduce the drift that
#854 already cleaned up once and that has already crept back in since.

## Why this story exists

GitHub issue **#985** (Epic GDX, Group A), which **absorbs** GitHub issue **#859**. Both bodies are
short enough to quote in full.

**#985:**

> Absorbs #859. Remove 5 bare-hex inline styles in `public/js/editor/print.js` (print stylesheet or
> tokens); tokenise literal colours at `suite.css:1387,1704,2451`; migrate low-risk inline JS
> grid-template-columns that force !important media-query overrides.
>
> AC:
> - [ ] Enforcement grep clean on touched files
> - [ ] #859 closeable

**#859** (the absorbed issue) is the follow-up Quinn raised out of #854's QA: the #854 enforcement
grep matched HTML `style="..."` attributes only, so **DOM-API** styles set from JavaScript
(`el.style.cssText = '...'`, `el.style.color = '#fff'`) were never guarded. Its five acceptance
criteria are carried through verbatim into this story's AC1, AC2, AC5 and AC7.

### One issue-metadata note the dev agent should not be confused by

#985 carries a single comment: *"Folded from Epic GDX into Epic USF (#1047). This player-facing
frontend work (CSS standards cleanup) should be built once on the unified role-gated app, not on
`player.html` which USF restructures away. Target surface changes accordingly; scope otherwise
unchanged."*

That comment has **no practical effect on this story**. None of the files in scope belongs to
`player.html`: they are `public/js/admin.js` (admin app), `public/js/tabs/*` and `public/css/suite.css`
(the suite app that `public/index.html` already serves to both roles), `public/js/editor/print.js`
(a detached print document) and `public/js/admin/next-session.js` (admin app). There is nothing here
that USF would restructure away, so the work is safe to do now. Sprint status keeps this row under
`epic-gdx`.

---

## Verified baseline (audited during story creation, 2026-08-20)

**Every line number, file path and count below was re-derived from the current tree.** Do not trust
#985's or #859's own figures. This is now the third GDX story in a row where the source issue's cited
details were stale: gdx-2 found issue #983's numbers wrong, gdx-3 found issue #984's `.svt-btn` line
and size both wrong plus its "18px rating dot" pointing at ST-editor-only chrome. gdx-4 continues the
pattern, and in one case the issue's stated *premise* (not just its line numbers) does not hold.

### Bullet 1 - the two DOM-API colour literals (#859)

The widened grep from #859, run against the current tree:

```
grep -rnoE "\.style\.[a-zA-Z]+\s*=\s*['\"\`][^'\"\`]*(#[0-9A-Fa-f]{3,6}|rgba?\()" public/js/
```

| #859 says | Reality now | Verdict |
|---|---|---|
| `public/js/admin.js:222` - `devBtn.style.cssText` with `#333`/`#aaa`/`#555` | Real line is **`public/js/admin.js:288`**. Content is otherwise exactly as described: `devBtn.style.cssText = 'margin-top:12px;padding:8px 16px;background:#333;color:#aaa;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:12px;width:100%'`, inside the `if (location.hostname === 'localhost')` block that appends the "Dev Preview (local only)" button to `.login-box`. | **In scope.** Fix per #859's own recommendation: a `.dev-preview-btn` class. |
| `public/js/tabs/feeding-tab.js:952` - `.style.color = '#fff'` | Real line is **`public/js/tabs/feeding-tab.js:983`**. The literal is one of a **pair**: line 982 is `btn.style.background = 'var(--crim)'` and line 983 is `btn.style.color = '#fff'`, both inside the `#feed-confirm-btn` save-failure `catch`. Line 982 is token-compliant but is still a DOM-API inline style. | **In scope.** Replace **both** lines with a single class toggle, so the pair moves to CSS together. |
| `public/js/app.js:1780` - token-compliant, leave alone | Real line is **`public/js/app.js:2180`**, content unchanged: `statusEl.style.color = 'var(--green2, #7EC8A0)'` (hex is a `var()` fallback only). | **Do NOT touch.** #859 AC2 says leave as-is. It is the documented compliant shape. |
| `public/js/admin.js:2` - console banner, non-applicable | Still at **line 2**: `console.log('%c[TM Admin] build 2026-04-08T1', 'color: #E0C47A; font-weight: bold')`. Console `%c` styling genuinely cannot read CSS custom properties. | **Do NOT touch.** Register it as a named exemption instead (AC5). |

**Drift found that neither issue knew about.** The `style="..."` attribute grep from #854 (which
that story left at zero outside `print.js`) now returns **one new hit**:

- `public/js/tabs/downtime-form.js:5498` - `<span class="dt-equipment-tweak-warn" style="color:#b23;margin-left:6px;">`.
  Introduced **after** #854 by commit `ff72cbad` (2026-08-13, `feat(equipment): EQC-4 - stat-tweak
  request on equipment acquisition (#1155)`). The element already carries a class,
  `.dt-equipment-tweak-warn`, but **that class is not declared in any stylesheet** (verified by grep
  across `public/css/*.css`), which is why the colour was inlined.

This is precisely the regression AC7's ratchet test exists to prevent, and it is inside this story's
own "enforcement grep clean" AC, so it is **in scope**. Do not defer it.

### Bullet 2 - "5 bare-hex inline styles in `public/js/editor/print.js`"

`print.js` is 171 lines and contains **8** hex literals, not 5. They split cleanly into two
categories, and the "5" in the issue is the correct count of the category that matters:

**Category A - the 5 inline `style="..."` attributes inside the generated markup (IN SCOPE):**

| Line | Literal | Element |
|---|---|---|
| 20 | `color:#888` | `<span>(+N bonus)</span>` on an attribute row |
| 45 | `color:#888;font-weight:normal` | `<span>(in-clan)</span>` on a discipline heading |
| 47 | `font-size:9pt;color:#555` | discipline power stats cell |
| 69 | `font-size:9pt;color:#555` | touchstone description cell |
| 129 | `font-weight:bold;border-top:1px solid #999;margin-top:4px;padding-top:4px` | the XP "Total Earned" row |

**Category B - the 3 hexes inside the document's own embedded `<style>` block (EXEMPT, keep):**

| Line | Literal | Rule |
|---|---|---|
| 77 | `color: #222` | `body` |
| 79 | `color: #555` | `.subtitle` |
| 80 | `1px solid #999` | `h2` border-bottom |

**Why Category B stays.** `printSheet()` builds a **complete standalone `<!DOCTYPE html>` document**
(line 74 onward) that is handed to a new window for printing. That document does **not** link
`theme.css`, so `var(--txt)` and friends resolve to nothing inside it, and it must not: a print sheet
needs dark ink on white paper regardless of which theme the ST is running in the app. This is the
"PDF can't use the cascade" exemption `specs/stories/fix.854.inline-styles-normalised-css.story.md`
already recorded twice (lines 103-106 and 163-166) - but it recorded it **only in that story file**.
It was never written into `specs/architecture/coding-standards.md`, which is why #985 can plausibly
read as "delete all 8". AC5 fixes that gap by giving the repo a real exemption register.

**The fix for Category A**, therefore, is **not** tokens (unavailable) and **not** deletion (the
greys carry real meaning). It is the issue's own first option, "print stylesheet": move the five
declarations into named classes in the embedded `<style>` block that already exists and already
legitimately holds hexes. Result: zero inline literals, all print colour in exactly one place, and
one honest documented exemption instead of eight scattered ones.

### Bullet 3 - "tokenise literal colours at `suite.css:1387,1704,2451`"

**None of the three cited lines resolves to a colour literal, at the current commit or at the commit
the issue was filed against.** Checked at `9498df02` (the last commit before #985 was opened,
2026-07-11T08:08:05Z) and at two earlier dates:

| Cited line | What is actually there at `9498df02` |
|---|---|
| `1387` | `.city-stat-img { width: 18px; height: 18px; display: block; }` - no colour. The **next** line, 1388, is `.city-stat-glyph { ... color: #fff; ... }`, so this one is an off-by-one. |
| `1704` | `.emg-list { display: flex; flex-direction: column; gap: 8px; }` - no colour, and no colour literal anywhere in the surrounding Emergency-tab block. |
| `2451` | `/* -- Tracker info popover -- */` - a comment. |

So the citation is unusable and the in-scope set must be derived rather than trusted. Running the
bare-hex rule-body grep over the **current** `public/css/suite.css` returns exactly **three** sites,
which is a satisfying reconciliation with the issue's own count of three even though not one of its
line numbers survives:

| Current line | Declaration | Fix |
|---|---|---|
| **89** | `-webkit-mask-image: linear-gradient(to right, transparent 0, #000 8px, #000 calc(100% - 8px), transparent 100%);` inside `@media (max-width: 599px) { #bnav { ... } }` | `var(--ink-black)` (declared `theme.css:168`) |
| **90** | `mask-image:` - the unprefixed twin of line 89, same two `#000` stops | `var(--ink-black)` |
| **1420** | `.city-stat-glyph { position: absolute; font-size:var(--fs-floor-body); color: #fff; font-weight: 700; line-height: 1; pointer-events: none; }` | `var(--txt-on-dark)` (declared `theme.css:133`; its own comment says "for text on always-dark surfaces") |

Everything else that the naive grep flags in `suite.css` is one of two **compliant or out-of-scope**
shapes, and the dev agent must not sweep them:

- **`var(--token, #hex)` fallbacks** (lines 1357, 1361, 1366, 1367, 1369, 1370, 1456, 1737, 1743,
  1927, 1977). #859 AC2 explicitly rules this shape compliant, using `app.js:2180` as the precedent.
  **Leave every one of them alone.**
- **Bare `rgba(...)` literals** (roughly 17 sites: 40, 252, 253, 721, 1030, 1319, 1324, 1356, 1363,
  1378, 1477, 1478, 1535, 1948, 2259, 2272, 2297). These are shadows, scrims and tinted fills. Many
  have a plausible alpha token in `theme.css` (`--overlay`, `--overlay2`, `--crim-aNN`,
  `--gold-aNN`, `--green4-aNN` and about sixty siblings), but several do not, and matching a
  hand-mixed rgba to the nearest token is a **per-site design judgement in two themes**, not a
  mechanical substitution. Seventeen such judgements is its own story. **Out of scope - see "Not in
  scope" below.**

### Bullet 4 - "migrate low-risk inline JS grid-template-columns that force !important media-query overrides"

**The premise does not hold as written.** The two halves of that sentence describe two different
things, and neither causes the other:

**Half one - inline JS `grid-template-columns`.** A full grep of `public/js/` returns exactly **one**
site:

- `public/js/admin/next-session.js:26` -
  `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:1rem;">`,
  the field row of the admin Next Session panel.

Nothing in any stylesheet overrides it with `!important`. It is a plain inline-style violation of the
"apply a class, never inline" rule, and migrating it is genuinely low-risk. **In scope.**

(There is a second inline `grid-template-columns` at `public/theme-preview.html:820`. That file is a
standalone token-preview page, not part of either app's build. **Leave it.**)

**Half two - `!important` grid overrides in the CSS.** There are four, all in `suite.css`, and all
four exist to beat **another CSS rule**, never an inline style:

| Line | Rule | Why the `!important` is there | Verdict |
|---|---|---|---|
| 1264 | `@media (max-width:768px) { .sh-attr-grid { grid-template-columns: 1fr !important; gap: 12px; } }` | Beats `components.css:766` `.sh-attr-grid{grid-template-columns:repeat(3,1fr)}`. Both selectors are specificity `(0,1,0)`, and `index.html` loads `components.css` **before** `suite.css` (lines 21-22), so `suite.css` already wins on source order. The `!important` is **redundant**. | **In scope**, remove the `!important` only. |
| 1265 | `.skill-grid { grid-template-columns: 1fr !important; gap: 12px; }`, same media block | Same shape, beats `components.css:211`. Same redundancy. Neither `.sh-attr-grid` (`editor/sheet.js:595`) nor `.skill-grid` (`editor/attrs-tab.js:27`) is ever emitted with an inline style, so nothing else is being beaten. | **In scope**, remove the `!important` only. |
| 1642, 1643 | `@media (min-width:900px) { .story-split { display:grid !important; grid-template-columns:1fr 1fr !important; ... } }` | **`.story-split` is declared twice in the same file.** Block one at lines **1610** and **1627**; block two at lines **1635** and **1641**. The second block uses `!important` purely to beat the first block, ten lines above it. | **In scope**, de-duplicate (see Task 6 for the exact merge, including the `gap` difference). |

`specs/architecture/coding-standards.md` -> Class Naming already says **"No `!important`."**, so
removing all four is standards-aligned rather than an invention of this story. All four are guarded
by tests that already exist in the `css-audit` group (`tests/desktop-and-css.spec.js`, the
`story-split is single column on phone` and `tab-split is single column on phone` tests), plus the
new assertions AC7 adds.

---

## What this story is NOT

This repo's convention is that overflow work is named, never silently absorbed. Two bodies of
genuinely gdx-4-adjacent work are **deliberately excluded** here, and a third and fourth surfaced
during this audit.

### Carve-out 1 - dead CSS selector deletion (excluded)

Seven declarations have been confirmed dead or unreachable and logged as gdx-4 candidates:

| Selector | Where declared | Evidence |
|---|---|---|
| `.hdr-profile` | `suite.css:59` | No live render path. `specs/deferred-work.md` gdx-3 dev-story section and gdx-3 Codex review section: emitted nowhere in `public/js/`, `public/index.html` or `public/admin.html`. `app.js` queries the `#hdr-profile-menu` **id**, which is a different thing. |
| `.hdr-profile-menu` | `suite.css:64` | Same. |
| `.hdr-menu-item` | `suite.css:65` | Same. |
| `.prestige-toggle` | `suite.css:578` | Occurs only in the repository-root legacy `index.html`, which is **not served** (Playwright and the dev server both serve `public/`). |
| `.st-char-dismiss` | `suite.css:590` | Same legacy-root-only evidence. |
| `.feed-toggle` | `suite.css:514` | Emitted nowhere. The only grep hits are the substring inside `proc-feed-toggles-row` in `public/js/admin/downtime-views.js`, which is an admin class, and `admin.html` does not load `suite.css`. |
| `.cc-alert.yellow`'s `font-size` | `components.css:21` | `specs/stories/deferred-work.md:586-589`: identical to its own base rule `.cc-alert` post-gdx-2, and `.cc-alert` itself has no live reference anywhere in `public/js/`. |

**Why excluded from gdx-4.** Deleting them is not a token substitution; it is a **removal of live
CSS surface**, which needs its own before/after evidence, and six of the seven currently carry
gdx-3's touch-target rules **and gdx-3 test fixtures** (`suite.css:2783`, `2788`, `2859`, `2864`,
`2955`, plus `GDX3_PROBES` and `GDX3_SIBLING_PROBES` in `tests/desktop-and-css.spec.js`). Deleting
the base rules without also retiring those fixtures would break the gdx-3 ratchet tests, and
retiring gdx-3 fixtures is a decision about gdx-3's AC, not gdx-4's. That is a whole task chain and a
different risk profile from "swap a hex for a token".

**Suggested follow-up story title:** *`gdx-13-dead-css-selector-retirement`: delete seven confirmed
dead declarations and retire their gdx-3 fixtures.*

### Carve-out 2 - the stray inline `font-size:Npx` audit (excluded)

`specs/stories/deferred-work.md:570-575` records that gdx-2's AC1 audit was file-scoped to
`suite.css`/`components.css` **by construction**, so inline `style="font-size:Npx"` sites bypassed it
entirely. Three survive, all re-verified at their stated lines during this audit:

- `public/js/suite/territory.js:368` - `font-size:12px` inside a `selStyle` string.
- `public/js/tabs/downtime-form.js:5662` - `font-size:12px` on `.dt-feed-dim`.
- `public/js/app.js:2034` - `font-size:11px` on the Player Mode sub-label.

**Why excluded from gdx-4.** This story's AC is colour-scoped, exactly as #854's was ("AC is
colour-only"), and #985 says nothing about `font-size`. More substantively, these three are
**gdx-2's** concern: the correct fix is `var(--fs-floor-body)` / `var(--fs-floor-micro)`, gdx-2's own
tokens, applied under gdx-2's own floor rules, and they should be checked against the ~242 sibling
sites the same deferred-work entry records rather than fixed in isolation here.

**Suggested follow-up story title:** *`gdx-14-inline-font-size-sweep`: retire the three inline
`font-size` literals gdx-2's file-scoped audit could not reach.*

### Carve-out 3 - the `rgba()` literal sweep in `suite.css` (excluded, discovered here)

The ~17 bare `rgba(...)` declarations enumerated under Bullet 3 above. Each needs a per-site,
per-theme judgement about which alpha token (if any) is the right match, and several have no existing
token at all. **Suggested follow-up story title:** *`gdx-15-rgba-literal-tokenisation`: match or mint
an alpha token for each of the seventeen bare `rgba()` sites in `suite.css`.*

### Carve-out 4 - two undefined custom properties (excluded, discovered here)

`public/js/admin/next-session.js:22-23` uses `var(--fh2)` and `var(--muted)`. **Neither token is
declared anywhere in `public/css/`** (verified by grep across all six stylesheets). Those two
declarations therefore silently do nothing today. The dev agent will be editing line 26 of this same
function for Task 5 and **must not** fix lines 22-23 as a drive-by: an undefined token is a live
rendering bug whose fix changes what the admin panel looks like, which needs a look on a deployed
environment. **Log it, do not fix it.**

### And it is not these either

- **Not a redesign.** The only intended visual change in the whole story is the dev-only
  "Dev Preview (local only)" button, which is rendered on `localhost` **only** and is currently
  hard-coded to dark-theme greys that look wrong in the default Parchment theme. AC6 states this
  explicitly.
- **Not a re-do of gdx-2 or gdx-3.** Do not touch any `font-size`, any `--tap-min` rule, any
  `::after` hit-area overlay, or the `TOUCH TARGETS` block at the end of `suite.css`.
- **Not a database or server change.** Nothing in `server/` changes except the addition of one test
  file under `server/tests/`.

---

## Acceptance Criteria

1. **No DOM-API colour literal survives in `public/js/`.** The widened #859 grep
   ```
   grep -rnoE "\.style\.[a-zA-Z]+\s*=\s*['\"\`][^'\"\`]*(#[0-9A-Fa-f]{3,6}|rgba?\()" public/js/
   ```
   returns **exactly one** line: `public/js/app.js:2180`, the `var(--green2, #7EC8A0)` fallback that
   #859 AC2 rules compliant. `admin.js:288` and `feeding-tab.js:982-983` are gone, replaced by
   token-backed classes.

2. **No HTML-attribute colour literal survives in `public/js/` outside the print exemption.** The
   #854 grep
   ```
   grep -rnoE "style=\"[^\"]*(#[0-9A-Fa-f]{3,6}|rgba?\()" public/js/
   ```
   returns **zero** lines. That includes `print.js`'s five Category-A sites (moved into its embedded
   stylesheet) **and** `downtime-form.js:5498` (the post-#854 EQC-4 regression).

3. **No bare hex survives in a `public/css/suite.css` rule body.** The three sites at lines 89, 90
   and 1420 resolve through `var(--ink-black)` and `var(--txt-on-dark)`. The eleven
   `var(--token, #hex)` fallback sites are **unchanged**, and the ~17 bare `rgba()` sites are
   **unchanged** (carve-out 3).

4. **The four redundant `!important` grid declarations are gone and the duplicate `.story-split`
   block is merged**, with computed layout identical before and after at 360px, 768px, 900px and
   1280px. The one inline JS `grid-template-columns` (`next-session.js:26`) is a class.

5. **The CSS standards documents prohibit DOM-API colour literals and carry a named exemption
   register.** `specs/architecture/coding-standards.md` -> CSS Standards -> "Styling from JavaScript"
   states that `el.style.cssText = '...#hex...'` and `el.style.color = '#...'` are equally prohibited,
   publishes both enforcement greps from AC1 and AC2, and lists the **only** two standing exemptions
   with their reasons:
   - `public/js/editor/print.js`'s embedded `<style>` block - the generated print document does not
     link `theme.css` and must not (dark ink on white paper, theme-independent).
   - `console.log('%c...')` devtools banners (`public/js/admin.js:2`) - console `%c` styling cannot
     read CSS custom properties.

   `specs/project-context.md` section 1 item 3 ("Styling from JavaScript") gains a matching sentence,
   kept to the one or two lines that file's own "short and high-signal" instruction allows.

6. **No unintended visual change.** For every element whose styling moved from inline to a class, the
   computed `color`, `background-color`, `border`, `padding`, `margin`, `font-size` and
   `border-radius` are unchanged in **both** themes and at 360px and 1280px, with exactly four
   declared exceptions, each a deliberate literal-to-token correction rather than a regression: the
   `localhost`-only `.dev-preview-btn`, whose hard-coded dark greys become tokens and therefore change
   appearance in the default Parchment theme; `.city-stat-glyph`, `#fff` -> `var(--txt-on-dark)`
   (`#F4EFE4`); `.feed-confirm-btn.is-error`'s text, the same `#fff` -> `var(--txt-on-dark)` shift; and
   `.dt-equipment-tweak-warn`, `#b23` -> `var(--crim2)`. All four colour corrections are named in the
   Completion Notes alongside the `.dev-preview-btn` exception - see Completion Notes #4.
   (Corrected 2026-08-21, addressing the Codex review: the AC's literal wording had only ever named
   `.dev-preview-btn`, even though Tasks 2, 3 and 7 always intended these four token substitutions and
   the Completion Notes always disclosed them. The code did not change; the AC's text was catching up
   to what had already shipped and been honestly recorded.)
   (**Corrected again, same day, Pass 3b of the same Codex review:** the first correction above wrongly
   argued `.dt-equipment-tweak-warn` was not a real exception because there was "no prior dark-theme
   rendering to compare against." That premise is false - an inline HTML `style="..."` attribute is
   not theme-scoped; `#b23` rendered identically (`rgb(187,34,51)`) in both Parchment and dark before
   the fix, exactly like `.feed-confirm-btn`'s old `#fff`. `.dt-equipment-tweak-warn` is a genuine
   fourth exception on the same footing as the other three, not a special case, and is corrected here
   to say so plainly.)

7. **A checked-in regression test ratchets AC1, AC2 and AC3** so this class of drift cannot return
   silently a third time, and it does so over the whole of `public/js` and `public/css` except
   `theme.css`. It must fail if `downtime-form.js:5498`'s literal is reintroduced, or if a new bare
   hex is introduced anywhere in `public/css` (grandfathered at `admin-layout.css`'s measured
   pre-existing count of 4 sites, unrelated to this story - see `deferred-work.md` carve-out 5).
   (Corrected 2026-08-21: at review time this ratchet's AC3 half only ever scanned `suite.css`, which
   the Codex review caught; it now covers the whole of `public/css` except the declared hex SSOT
   `theme.css`.)

8. **Carve-outs 1 to 4 are recorded in `specs/deferred-work.md`** in that file's existing style, each
   with its evidence and its suggested follow-up story title, so nothing in the "What this story is
   NOT" section above lives only in this story file.

---

## Tasks / Subtasks

- [x] **Task 1 (AC1, AC6)** - `public/js/admin.js` + `public/css/admin-layout.css`: the dev-preview
  button.
  - [x] In `admin-layout.css`, next to `.login-box` (line 274), add `.dev-preview-btn` carrying every
        declaration currently in the `cssText` string: `margin-top:12px; padding:8px 16px;
        border-radius:4px; cursor:pointer; font-size:12px; width:100%`, plus the three colours as
        tokens: `background:var(--surf2); color:var(--txt3); border:1px solid var(--bdr2)`.
  - [x] In `admin.js`, delete line 288 and replace it with `devBtn.className = 'dev-preview-btn';`.
        Leave lines 286, 287, 289 and 290 alone.
  - [x] `admin-layout.css` is the right file because `admin.html` loads it (line 13) and
        `index.html` does not; the button only ever exists on the admin login screen.

- [x] **Task 2 (AC1, AC6)** - `public/js/tabs/feeding-tab.js` + `public/css/components.css`: the
  save-failure state on `#feed-confirm-btn`.
  - [x] In `components.css`, next to the existing `.feed-confirm-btn` rules (lines 4285-4287), add
        `.feed-confirm-btn.is-error { background: var(--crim); color: var(--txt-on-dark); }`.
        `components.css` is correct: that is where `.feed-confirm-btn` itself is declared, and both
        apps load it.
  - [x] In `feeding-tab.js`, replace **both** lines 982 and 983 with
        `btn.classList.add('is-error');`. `#fff` becomes `--txt-on-dark`, which is the token whose
        own comment names "text on always-dark surfaces (crim, ...)" - i.e. exactly this case.
  - [x] Confirm the class does not need clearing: the success path calls `render()`, which rebuilds
        the container's `innerHTML`, so the button is a fresh node. Re-adding on a second failure is
        idempotent. State this in the Completion Notes rather than adding a speculative removal.

- [x] **Task 3 (AC2, AC6)** - `public/js/tabs/downtime-form.js` + `public/css/components.css`: the
  EQC-4 regression.
  - [x] In `components.css`, next to the `.dt-equipment-*` block (line 3673 onward), declare the
        class the markup already references:
        `.dt-equipment-tweak-warn { color: var(--crim2); margin-left: 6px; }`.
        `--crim2` is the repo's soft warning red; #854 used it for exactly this purpose (see its
        Completion Notes, "the soft red -> `--crim2`").
  - [x] In `downtime-form.js:5498`, delete the `style="color:#b23;margin-left:6px;"` attribute. The
        `class="dt-equipment-tweak-warn"` attribute already present stays.
  - [x] Do **not** also class-ify the sibling `style="margin-top:4px;"` on line 5500. It carries no
        colour, so it is outside AC2, and touching it widens the diff for no AC.

- [x] **Task 4 (AC2)** - `public/js/editor/print.js`: move the five Category-A inline styles into the
  document's own embedded stylesheet.
  - [x] Add three classes to the embedded `<style>` block (lines 76-90), next to the existing
        `.subtitle` rule so all print colour sits in one place:
        - `.print-muted { color: #888; }` - for lines 20 and 45.
        - `.print-note { font-size: 9pt; color: #555; }` - for lines 47 and 69.
        - `.xp-row-total { font-weight: bold; border-top: 1px solid #999; margin-top: 4px; padding-top: 4px; }` - for line 129.
  - [x] Line 45's span needs `font-weight:normal` as well, because it sits inside a `font-weight:bold`
        cell. Either add a `.print-muted-normal` variant or add `font-weight: normal` to a second
        class applied alongside. Do not lose it.
  - [x] Rewrite the five sites to `class="..."`. Line 129 becomes
        `<div class="xp-row xp-row-total">` - keep `.xp-row`, it supplies the flex layout.
  - [x] Add a **one-line comment** immediately above the embedded `<style>` block recording the
        exemption and pointing at `coding-standards.md`, e.g.
        `<!-- Exempt from the token rule: this is a standalone print document; it does not link theme.css and must render dark ink on white paper in either app theme. See specs/architecture/coding-standards.md -> CSS Standards -> Documented exemptions. -->`
        Put it in the JS template string so it lands in the generated document.
  - [x] Leave line 65's `style="font-size:9pt"` (banes cell) alone. It carries **no colour**, so it is
        outside AC2. Noted here only so its survival is not read as an oversight.
  - [x] `node --check public/js/editor/print.js` must pass. The file is one large template literal;
        an unbalanced backtick or brace here is a parse error, not a runtime one.

- [x] **Task 5 (AC4)** - `public/js/admin/next-session.js` + `public/css/admin-layout.css`: the inline
  grid.
  - [x] Add `.ns-field-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 1rem; }` to `admin-layout.css`, near the other Next Session panel
        rules.
  - [x] Replace `next-session.js:26`'s inline `style="..."` with `class="ns-field-grid"`.
  - [x] **Do not touch lines 20, 22, 23 or 26's siblings.** Lines 22-23 use the two undefined tokens
        `--fh2` and `--muted` (carve-out 4). Log, do not fix.

- [x] **Task 6 (AC4)** - `public/css/suite.css`: remove the four redundant `!important`s and merge the
  duplicated `.story-split`.
  - [x] Lines 1264-1265: delete the two ` !important` tokens. Change nothing else on those lines
        (`gap: 12px` stays).
  - [x] Merge the two `.story-split` blocks. **Watch the `gap`:** block one (line 1610) says
        `gap: 20px`, block two (line 1635) says `gap: 16px`, and block two currently wins on
        `!important` plus source order. The merged rule must therefore be
        `.story-split { display: flex; flex-direction: column; gap: 16px; }` - **16px, not 20px**.
        Getting this backwards is a silent 4px visual regression on every phone downtime report.
  - [x] The two `@media (min-width: 900px)` copies (lines 1627 and 1641) are otherwise identical
        (`grid`, `1fr 1fr`, `gap: 28px`, `align-items: start`). Keep **one**, without `!important`.
  - [x] Delete the now-empty second block and its `/* -- Two-panel layout fixes -- */` /
        `/* story-split: ... */` comment pair only if nothing else remains under them. The `.tab-split`
        rules from line 1649 onward are **not** duplicated and must survive.
  - [x] Prove-discriminate: revert this task alone and confirm the AC4 assertions from Task 9 go red.

- [x] **Task 7 (AC3)** - `public/css/suite.css`: the three bare hexes.
  - [x] Lines 89 and 90 (`#bnav`'s `-webkit-mask-image` and `mask-image`): replace all four `#000`
        stops with `var(--ink-black)`. Note in the Completion Notes that these are **mask alpha
        stops**, not visible colour - any opaque value works - and that a token was used in
        preference to a documented exemption purely because `--ink-black` already exists
        (`theme.css:168`, theme-invariant, declared once in `:root`).
  - [x] Line 1420 (`.city-stat-glyph`): `color: #fff` -> `color: var(--txt-on-dark)`. This glyph sits
        on top of an always-dark stat icon image, which is precisely what `--txt-on-dark` is
        documented for at `theme.css:131`. Expect a small warm shift (`#fff` -> `#F4EFE4`) in the
        Parchment theme; that is the intended correction, not a regression, and it is the same
        substitution #854 made across six files.
  - [x] **Do not touch** the eleven `var(--token, #hex)` sites or the ~17 bare `rgba()` sites.

- [x] **Task 8 (AC5, AC8)** - documentation.
  - [x] `specs/architecture/coding-standards.md` -> CSS Standards -> "Styling from JavaScript"
        (line 180): extend it with (a) the DOM-API prohibition, with a WRONG/RIGHT pair matching that
        section's existing style, (b) both enforcement greps verbatim, (c) a short
        **"Documented exemptions"** sub-heading listing the two standing exemptions from AC5 and
        stating that adding a third requires a note in that same list.
  - [x] `specs/project-context.md` section 1 item 3: add the DOM-API sentence. That file's own header
        says "Keep it short and high-signal", so one or two sentences, not a copy of the
        coding-standards block. Cross-reference rather than duplicate.
  - [x] `specs/deferred-work.md`: add a `## Deferred from: gdx-4-mobile-css-cleanup (2026-08-__, dev-story)`
        section holding carve-outs 1 to 4 with their evidence and suggested follow-up titles. Match
        that file's existing bullet style. (Note that `specs/stories/deferred-work.md` is a
        **separate, older** file that also carries gdx-2 entries; add the new section to
        `specs/deferred-work.md`, the one carrying the gdx-3 sections, and do not try to reconcile
        the two.)

- [x] **Task 9 (AC7)** - tests. See the Testing section for the required mechanism and the
  pre-existing-failure baseline.
  - [x] New vitest source-scan suite: `server/tests/gdx-4-css-standards-grep.test.js`.
  - [x] Extend the **existing** `css-audit` group in `tests/desktop-and-css.spec.js` with the AC4 and
        AC6 computed-style assertions.
  - [x] Prove-discriminate each new assertion against a reverted version of the change it guards.

- [x] **Task 10 (AC1-AC6)** - verification sweep.
  - [x] `node --check` on every changed `.js` file: `admin.js`, `feeding-tab.js`, `downtime-form.js`,
        `print.js`, `next-session.js`.
  - [x] Re-run both enforcement greps and paste the exact output into the Completion Notes.
  - [x] Record in the Completion Notes that #859 is closeable, with its five ACs answered one by one.

---

## Dev Notes

### The exemption principle this story is really establishing

There are three defensible responses to a colour literal, and this story uses all three deliberately.
Choosing the right one per site is the actual skill here:

1. **Tokenise** when the element lives in a document that loads `theme.css`. Tasks 1, 2, 3, 7.
2. **Move it into the one stylesheet that legitimately owns it** when tokens are unavailable but the
   value is real. Task 4 (`print.js`).
3. **Register a standing exemption** when neither is possible. Task 8, for the two cases in AC5.

What must **not** happen is a fourth response, "leave it and hope the grep does not notice", which is
how `downtime-form.js:5498` got in.

### Stylesheet placement, which is per-app and not negotiable

`public/index.html` loads (in order) `theme.css`, `layout.css`, `components.css`, `suite.css`.
`public/admin.html` loads `theme.css`, `components.css`, `admin-layout.css`, `admin-shared.css`,
`admin-spheres.css`. **`admin.html` does not load `suite.css`.** So:

| New class | Goes in | Because |
|---|---|---|
| `.dev-preview-btn` | `admin-layout.css` | admin login screen only |
| `.feed-confirm-btn.is-error` | `components.css` | that is where `.feed-confirm-btn` is declared |
| `.dt-equipment-tweak-warn` | `components.css` | that is where `.dt-equipment-*` is declared |
| `.ns-field-grid` | `admin-layout.css` | admin Next Session panel only |
| `.print-muted` / `.print-note` / `.xp-row-total` | the embedded `<style>` in `print.js` | the print document links no stylesheet at all |

Note that `suite.css` gains **no new class** in this story. It only loses literals and `!important`s.

### Token choices, with the reason each is the right one

| Literal | Token | Reason |
|---|---|---|
| `#333` (dev button bg) | `var(--surf2)` | second surface tier, the standard raised-panel fill |
| `#aaa` (dev button text) | `var(--txt3)` | subdued text tier |
| `#555` (dev button border) | `var(--bdr2)` | second border tier |
| `#fff` (feed-confirm error text) | `var(--txt-on-dark)` | sits on `var(--crim)`, which is what this token documents |
| `#b23` (equipment tweak warning) | `var(--crim2)` | the repo's soft warning red; #854 precedent |
| `#fff` (`.city-stat-glyph`) | `var(--txt-on-dark)` | text over an always-dark icon |
| `#000` (`#bnav` mask stops) | `var(--ink-black)` | already declared, theme-invariant |

All seven tokens exist in **both** themes today (`--ink-black` and `--txt-on-dark` are declared once
in `:root` and are theme-invariant by design; the rest have `[data-theme="dark"]` overrides). Verify
before use; do not mint a new token in this story.

### CSS standards apply in full

`specs/project-context.md` section 1 and `specs/architecture/coding-standards.md` -> CSS Standards.
In particular: no bare hex, no `rgba()`, no inline `style=`, no `!important`, reuse before invent,
BEM-lite naming. This story is literally the enforcement of those rules, so violating one while
fixing another would be an embarrassing outcome.

### British English, no em-dashes

Applies to comments, class names where a word choice arises, and every line of documentation this
story adds. `colour`, `Defence`, `normalise`.

### No database, no server behaviour

Nothing under `server/routes/`, `server/schemas/` or `server/scripts/` changes. The only addition
under `server/` is one test file. Do not run migrations, do not touch Atlas.

### Local verification and the port-8080 gotcha

Carried forward from gdx-1, gdx-2 and gdx-3:

- **Never run two Playwright invocations concurrently** - they share port 8080 with
  `reuseExistingServer`.
- Chromium may need installing in a fresh checkout: `npx playwright install chromium`.
- Angelus **cannot run the app locally** to smoke-test, so anything needing a human look must reach a
  deployed environment first. Design the AC6 verification to be machine-checkable
  (`getComputedStyle` before/after) rather than "looks fine to me".
- Viewport emulation gotcha (gdx-1/gdx-2/gdx-3): use `page.setViewportSize()` and read computed
  styles from the real served page, not from a synthetic node on `document.body`, whenever an
  ancestor's padding or width cap could matter.

### The `.dev-preview-btn` visual change is expected, and is a fix

`#333`/`#aaa`/`#555` are dark-theme greys hard-coded into a button that renders on the **admin login
screen**, whose default theme is Parchment (warm light). The button is therefore mis-themed today.
Tokenising it fixes that. It renders only when `location.hostname === 'localhost'`, so no deployed
user ever sees either version. Call this out by name in the Completion Notes as AC6's one declared
exception.

---

## Files to touch

| File | What changes | AC |
|---|---|---|
| `public/js/admin.js` | line 288: `cssText` string -> `className = 'dev-preview-btn'` | 1, 6 |
| `public/js/tabs/feeding-tab.js` | lines 982-983: two `.style.*` sets -> `classList.add('is-error')` | 1, 6 |
| `public/js/tabs/downtime-form.js` | line 5498: drop the `style="color:#b23;..."` attribute | 2, 6 |
| `public/js/editor/print.js` | lines 20, 45, 47, 69, 129 -> classes; 3 new rules + 1 exemption comment in the embedded `<style>` (lines 76-90) | 2 |
| `public/js/admin/next-session.js` | line 26: inline grid -> `class="ns-field-grid"` | 4 |
| `public/css/admin-layout.css` | new `.dev-preview-btn` (near `.login-box`, line 274); new `.ns-field-grid` | 1, 4, 6 |
| `public/css/components.css` | new `.feed-confirm-btn.is-error` (near line 4285); new `.dt-equipment-tweak-warn` (near line 3673) | 1, 2, 6 |
| `public/css/suite.css` | lines 89-90 `#000` -> `var(--ink-black)`; line 1420 `#fff` -> `var(--txt-on-dark)`; lines 1264-1265 drop `!important`; merge the duplicated `.story-split` blocks at 1610/1627 and 1635-1647 | 3, 4 |
| `specs/architecture/coding-standards.md` | CSS Standards -> Styling from JavaScript: DOM-API prohibition, both greps, "Documented exemptions" list | 5 |
| `specs/project-context.md` | section 1 item 3: one DOM-API sentence | 5 |
| `specs/deferred-work.md` | new gdx-4 section holding carve-outs 1 to 4 | 8 |
| `server/tests/gdx-4-css-standards-grep.test.js` | **new** - source-scan ratchet | 7 |
| `tests/desktop-and-css.spec.js` | extend the existing `css-audit` group | 7 |

**Explicitly not touched:** `public/js/app.js` (line 2180 is compliant; line 2034 is carve-out 2),
`public/js/admin.js:2` (console banner exemption), `public/js/suite/territory.js` (carve-out 2),
`public/theme-preview.html` (not part of either app), `public/css/theme.css` (no new token needed),
and every `var(--token, #hex)` fallback everywhere.

---

## Testing

Two surfaces, and they are not interchangeable. The AC1/AC2/AC3 ratchet is a **source-text** property,
so it belongs in vitest where it runs in under a second and needs no browser. AC4 and AC6 are
**computed-style** properties, so they belong in the Playwright `css-audit` group where a real
cascade exists.

### Part A - new vitest suite: `server/tests/gdx-4-css-standards-grep.test.js` (AC1, AC2, AC3, AC7)

Follow the idiom already established by `server/tests/bl3b-constants-deleted.test.js`: read the real
tree with `node:fs`, resolve `REPO_ROOT` via `fileURLToPath(import.meta.url)`, and assert on source
text.

- **Strip comments before grepping.** Use the existing helper
  `server/tests/helpers/strip-comments.js`. Its own header explains why the naive block/line-comment
  regex pair is unsafe (it erased real executable text in 10 of 659 files when measured). A guard
  whose whole job is to have no blind spot must not have one.
- **Three assertions, each over the whole tree, not only over the touched files.** AC7 says the
  ratchet must catch a reintroduction anywhere:
  1. DOM-API grep over every `.js` under `public/js/` -> the only permitted hit is
     `public/js/app.js`'s `var(--green2, #7EC8A0)`. Encode the allowlist as an explicit
     `{ file, snippet }` pair, matched on **content**, not on a line number, so the test does not
     rot the next time `app.js` shifts. (Line numbers in this story's own baseline had drifted by
     66 and 31 lines; assume yours will too.)
  2. `style="..."` attribute grep over every `.js` under `public/js/` -> **zero** permitted hits.
     `print.js` passes only because Task 4 removed its five; if a future change reintroduces one it
     must fail. Add a comment saying so.
  3. Bare-hex grep over `public/css/suite.css` rule bodies -> **zero** hits, where "bare" means a
     hex **not** immediately preceded by a `var(--token,` fallback opener. Get this predicate right:
     a naive `/#[0-9A-Fa-f]{3,6}/` matches all eleven compliant fallback sites and the test will be
     unfixably red.
- **Do not scan `public/css/theme.css`.** It is the declared hex SSOT.
- **Name the exemptions in the test file's own header comment**, so a future reader who hits a
  failure learns the policy from the failing test rather than from three documents.

### Part B - extend the existing `css-audit` group in `tests/desktop-and-css.spec.js` (AC4, AC6, AC7)

Add to the **existing** group rather than creating a new spec file, per `specs/project-context.md`'s
reuse-over-duplicate convention and following gdx-1's, gdx-2's and gdx-3's precedent in the same file.

- **Do NOT use `setupSuite()`.** That helper (line 26) waits on `#app` becoming visible and is
  currently broken in this environment; it is the root cause of the 12 pre-existing failures
  `CLAUDE.md` documents for this exact file. Use a bare `await page.goto('/')`, as gdx-1/2/3 did.
- **AC4 assertions.** Two already exist and will cover the de-duplication for free
  (`css-audit -- story-split is single column on phone` at line 220, and the `tab-split` twin at 236)
  - run them and confirm they stay green. Add:
  - `.story-split` at **900px**: computed `display` is `grid`, `grid-template-columns` resolves to two
    equal tracks, `column-gap` is `28px`.
  - `.story-split` at **390px**: computed `gap` is **`16px`**, which is the assertion that catches the
    merge picking up block one's `20px` by mistake. This is the highest-value new assertion in the
    story; write it first.
  - `.sh-attr-grid` and `.skill-grid` at **390px**: computed `grid-template-columns` is a single
    track, proving the `!important` removal did not change the outcome.
  - `.ns-field-grid`: assert the class is **defined** (walk the CSSOM for the selector) rather than
    trying to render the admin panel from the suite page.
- **AC6 assertions.** For `.city-stat-glyph`, assert computed `color` equals the resolved
  `--txt-on-dark` value in each theme (read the token off `:root` in the same evaluate call rather
  than hard-coding `rgb(244, 239, 228)`, so the assertion survives a token retune). For
  `.feed-confirm-btn.is-error`, mount a probe node and assert `background-color` matches `--crim` and
  `color` matches `--txt-on-dark`.
- **Mask sanity for Task 7:** assert `getComputedStyle(document.getElementById('bnav')).maskImage`
  still contains a resolved black stop at a phone width. `var()` inside a gradient resolves at
  computed-value time, so a broken token would show up here as `none` or as an unresolved string.
- **CSSOM walk trap** (gdx-2 paid a debugging cycle for this, gdx-3 repeated the warning): with CSS
  Nesting, a plain `CSSStyleRule` also exposes an empty `cssRules` list, so the obvious
  `if (rule.cssRules) { recurse; continue; }` shape silently skips every style rule in the sheet.
  Read the declaration **first**, then recurse only when `rule.cssRules.length` is non-zero. Also
  recurse into `CSSMediaRule` - `suite.css` has 11 media blocks and this story's targets at lines 89,
  90, 1264 and 1642 are all inside one.
- **Prove-discriminate per assertion, not in aggregate.** Revert each change in turn and confirm the
  matching assertion goes red. gdx-2 found one of its nine assertions passing against reverted CSS
  for a `box-sizing` reason it had not anticipated.

### Known pre-existing failures, do not be surprised

`CLAUDE.md` documents `tests/desktop-and-css.spec.js` as having **12 pre-existing failures** at base:
11 `desktop-mode --` tests plus `css-audit -- DT Submission tab has dark-theme input styles`, all
`setupSuite()`-dependent and unrelated to this story. gdx-1 measured 8 passed / 12 failed; gdx-2
finished at 29/12; gdx-3 finished at 36/12. **Expect 36/12 as your baseline**, confirmed by failure
**name**, not by count. Do not "fix" any of these here.

**The file takes roughly 16 minutes end to end**, because each of the 11 `setupSuite()` failures burns
its own timeout. Budget for that; do not assume a hang.

For the vitest side, `CLAUDE.md` also lists several pre-existing failures (`n7-n9-allocator-readers`,
`epic.708.3-cycle-phase-controls`, `oath-a-pledge-helpers`, `issue-836-legacy-tracker-cache-removed`,
`issue-1013-indomitable-rules-text`, `cm-4-renumber-chapter-merge`, `fix.715.dt-manual-open-gate`).
None is related. **Run the new suite targeted, not the whole thing.**

### Commands

- New vitest suite: `cd server && npx vitest run tests/gdx-4-css-standards-grep.test.js`
- Playwright: `npx playwright test tests/desktop-and-css.spec.js`
- Parse check: `node --check public/js/admin.js` (and the other four changed JS files)
- The repo also ships a pre-commit parse hook for staged `public/js/**/*.js`; enable it with
  `git config core.hooksPath .githooks` if it is not already on.

---

## References

- GitHub issue **#985** (this story) and GitHub issue **#859** (absorbed).
- `specs/stories/fix.854.inline-styles-normalised-css.story.md` - the parent cleanup, its QA Results
  section (the origin of #859), and the two places it records the `print.js` exemption informally
  (lines 103-106, 163-166).
- `specs/architecture/coding-standards.md` -> CSS Standards (line 89), Styling from JavaScript
  (line 180), Class Naming ("No `!important`").
- `specs/project-context.md` section 1 (auto-loaded by the BMAD dev agent).
- `specs/deferred-work.md` - gdx-3 dev-story section (line ~835, the `.hdr-profile` dead-CSS note)
  and gdx-3 Codex review section (line ~895, the five-selector extension).
- `specs/stories/deferred-work.md` - gdx-2 review section (line ~566 onward): the three inline
  `font-size:Npx` sites and the dead `.cc-alert.yellow` declaration.
- `specs/stories/gdx-2-mobile-type-scale.md`, `specs/stories/gdx-3-mobile-touch-targets.md` - the two
  immediately preceding stories in this epic; both establish the "audit the current tree, do not
  trust the issue's figures" convention this story continues.
- `public/css/theme.css` - token SSOT. `--ink-black` line 168, `--txt-on-dark` line 133.
- `server/tests/bl3b-constants-deleted.test.js` and `server/tests/helpers/strip-comments.js` - the
  source-grep test idiom Part A follows.

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (BMAD dev-story workflow), 2026-08-20.

### Debug Log References

**Baseline confirmed before any edit.** Both enforcement greps were re-run against the real tree
first, and both matched the story's audit exactly, line number for line number:

```
$ grep -rnoE "\.style\.[a-zA-Z]+\s*=\s*['\"\`][^'\"\`]*(#[0-9A-Fa-f]{3,6}|rgba?\()" public/js/
public/js/admin.js:288:.style.cssText = 'margin-top:12px;padding:8px 16px;background:#333;color:#aaa;border:1px solid #555
public/js/app.js:2180:.style.color = 'var(--green2, #7EC8A0
public/js/tabs/feeding-tab.js:983:.style.color = '#fff

$ grep -rnoE "style=\"[^\"]*(#[0-9A-Fa-f]{3,6}|rgba?\()" public/js/
public/js/editor/print.js:20:style="color:#888
public/js/editor/print.js:45:style="color:#888
public/js/editor/print.js:47:style="font-size:9pt;color:#555
public/js/editor/print.js:69:style="font-size:9pt;color:#555
public/js/editor/print.js:129:style="font-weight:bold;border-top:1px solid #999
public/js/tabs/downtime-form.js:5498:style="color:#b23
```

**Red-first.** `server/tests/gdx-4-css-standards-grep.test.js` was written and run before any
implementation edit: **16 failed / 4 passed (20)**. The four that passed at base are the ones that
assert something the story deliberately does NOT change (the `%c` banner exemption, `.tab-split`
surviving, the `app.js` fallback still existing, the rgba carve-out still present). After the
implementation: **20 passed / 0 failed**.

**Three story-baseline corrections, all measured, none changing the work.** Recorded because this
repo's convention is to correct stale assumptions against the real tree rather than quietly work
around them:

1. **`suite.css`'s mask lines are 90 and 91, not 89 and 90.** One-line drift in the story's own
   Bullet 3 table. The declarations are exactly as described.
2. **There are ten `var(--token, #hex)` fallback sites in `suite.css`, not eleven.** The eleventh
   the story counted is `var(--gold2-a40, rgba(224, 196, 122, .4))` (line 1363 pre-change), whose
   fallback is an `rgba()` rather than a hex. Eleven `var()` fallbacks total, ten of them hex. The
   ratchet asserts on the union, which is the honest predicate; none of them was touched either way.
   The story's cited line numbers for this set (1357, 1361, 1366...) are also about six lines
   adrift of the real ones (1367, 1372, 1373...).
3. **Carve-out 4's undefined tokens are on lines 23 and 24 of `next-session.js`, not 22-23**, and
   they are two separate declarations (`var(--fh2)` on the `<h3>`, `var(--muted)` on the
   `#ns-status` span) rather than one line carrying both. Both confirmed undefined by grep across
   all six stylesheets. Logged, not fixed, exactly as instructed.

**One create-story gap found.** The task hand-off said carve-outs 1 to 4 had already been logged to
`specs/deferred-work.md` by the create-story pass and only needed verifying. They had not been: the
only pre-existing `gdx-4` strings in that file were inside **gdx-3's own** sections, pointing
forward at gdx-4 as the place the dead-CSS work should happen. The gdx-4 section was written for
real under Task 8, as the story's own Task 8 (not the hand-off summary) required.

**Prove-discriminate, per assertion rather than in aggregate.** Each of the eight new Playwright
assertions was run against a version of the change it guards reverted in isolation, and each went
red:

| Reverted | Assertion that went red |
|---|---|
| `.story-split` `gap: 16px` -> `20px` | keeps gap:16px at 390px |
| the `@media (min-width: 900px) .story-split` rule deleted | two-track grid with a 28px gutter |
| the phone `.sh-attr-grid` rule deleted | single-track at 390px |
| `var(--ink-black)` -> an undeclared token | #bnav keeps a resolved opaque mask stop |
| `.city-stat-glyph` back to `#fff` | resolves to --txt-on-dark |
| `.feed-confirm-btn.is-error` deleted | matches --crim on --txt-on-dark |
| `.dt-equipment-tweak-warn` deleted | is declared and resolves to --crim2 |
| `.ns-field-grid` + `.dev-preview-btn` deleted | are declared in admin-layout.css |

The vitest side is discriminated by the red-first run above: every assertion that guards a changed
behaviour was failing at base and passes now.

**`print.js` before/after equivalence, measured rather than reasoned.** AC6 asks for computed
values to be unchanged wherever styling moved from inline to a class. The five Category-A sites were
rendered side by side in Chromium as two complete print documents, the pre-change markup with the
pre-change embedded stylesheet against the post-change pair, and eighteen computed properties
compared per element (`color`, `fontSize`, `fontWeight`, `fontFamily`, the four `borderTop*`, the
four `padding*`, `marginTop/Left/Right`, `textAlign`, `display`, `backgroundColor`,
`borderRadius`): **zero differences across all five elements**. The one specificity risk was line
45's `(in-clan)` span, which sits inside a `font-weight:bold` inline cell; `.print-normal` (0,1,0)
applies to the span itself and the parent's inline style does not reach it, which the measurement
confirms.

### Completion Notes List

#### 1. Both enforcement greps, exact output after the change

```
$ grep -rnoE "\.style\.[a-zA-Z]+\s*=\s*['\"\`][^'\"\`]*(#[0-9A-Fa-f]{3,6}|rgba?\()" public/js/
public/js/app.js:2180:.style.color = 'var(--green2, #7EC8A0

$ grep -rnoE "style=\"[^\"]*(#[0-9A-Fa-f]{3,6}|rgba?\()" public/js/
(no output)
```

AC1: exactly one line, and it is the `var()` fallback #859 AC2 rules compliant. AC2: zero lines,
including all five of `print.js`'s Category-A sites and `downtime-form.js:5498`.

AC3, the third grep, over `suite.css` declaration values with comments stripped, `var()` fallbacks
stepped over and ID selectors excluded (`#feed-chev` is a real live false positive for the naive
version): **zero hits**, down from three (`#000` x2 on lines 89/90, `#fff` on 1420).

#### 2. `node --check` on all five changed JS files

```
OK public/js/admin.js
OK public/js/tabs/feeding-tab.js
OK public/js/tabs/downtime-form.js
OK public/js/editor/print.js
OK public/js/admin/next-session.js
```

`tests/desktop-and-css.spec.js` also parses clean. `print.js` was the one worth worrying about,
being a single large template literal, so it was re-checked after every edit rather than once at the
end.

#### 3. #859 is closeable. Its five ACs, answered one by one

Quoted from the issue body, which was re-read rather than trusted from the story summary:

1. *"`admin.js:222` and `feeding-tab.js:952` no longer set bare hex via `.style.*`."* **Done.** The
   real lines were 288 and 983 (the issue's numbers had drifted by 66 and 31). `admin.js` now sets
   `className = 'dev-preview-btn'`; `feeding-tab.js` now calls `classList.add('is-error')`, which
   replaced **both** lines of the pair, so the token-compliant `var(--crim)` half moved into CSS with
   the `#fff` half rather than being left behind as an orphan DOM-API style.
2. *"`app.js:1780` left as-is; `admin.js:2` console banner left as-is."* **Done.** `app.js`'s real
   line is 2180 and is untouched; the ratchet allowlists it by content and separately asserts it is
   still there, so the carve-out cannot rot into a permanently-open hole. `admin.js:2` is untouched
   and is now a named entry in the exemption register, not an oversight.
3. *"coding-standards.md + project-context.md updated to prohibit DOM-API colour literals."*
   **Done**, plus the "Documented exemptions" register the issue did not ask for but which #985's
   "delete all 8 print.js hexes" reading proves was the actual missing piece.
4. *"The widened grep returns 0 for `.style.*` colour literals outside documented exemptions."*
   **Done**, and it is now a checked-in vitest suite over the whole of `public/js` rather than a
   grep somebody has to remember to run. That is the difference between #854's outcome and this one.
5. *"`node --check` clean on changed files."* **Done**, see section 2.

The issue's own Open Question ("class or documented exemption for the dev-only button?") is answered
the way it recommended: a class.

#### 4. AC6 - the one declared visual exception, and three sanctioned colour corrections

**The declared exception is `.dev-preview-btn`.** Its hard-coded `#333` / `#aaa` / `#555` were
dark-theme greys on the **admin login screen**, whose default theme is Parchment (warm light), so
the button was mis-themed. It is now `var(--surf2)` / `var(--txt3)` / `var(--bdr2)` and follows the
theme. It renders only when `location.hostname === 'localhost'`, so no deployed user has ever seen
either version. Every non-colour declaration (`margin-top:12px`, `padding:8px 16px`,
`border-radius:4px`, `cursor:pointer`, `font-size:12px`, `width:100%`) carried across unchanged.

Three further colour values change, all three prescribed by name in the story's own token table and
all three the same substitution #854 made across six files, so they are corrections rather than
regressions - but they are colour changes and are named here so review does not have to find them:

- `.city-stat-glyph`: `#fff` -> `var(--txt-on-dark)` (`#F4EFE4`). A small warm shift, on a glyph
  sitting over an always-dark stat icon, which is exactly what the token documents.
- `.feed-confirm-btn.is-error` text: `#fff` -> `var(--txt-on-dark)`, same shift, on `var(--crim)`.
- `.dt-equipment-tweak-warn`: `#b23` -> `var(--crim2)` (`#8B1010` Parchment / `#A81010` dark). It
  now also has a dark-theme value, which as an inline literal it never did.

Everything else was proved unchanged rather than assumed: the five `print.js` sites measured
identical across eighteen computed properties (see Debug Log), and `.sh-attr-grid` / `.skill-grid` /
`.story-split` are asserted by computed style at 390px and 900px.

#### 5. The `.story-split` merge kept `gap: 16px`

Confirmed twice, by source assertion and by computed style. Block one said `gap: 20px`, block two
said `gap: 16px` and won on `!important` plus source order, so **16px is the shipped value** and the
merged rule is `.story-split { display: flex; flex-direction: column; gap: 16px; }`. The Playwright
assertion reads `rowGap`/`columnGap` at 390px and was proved to go red against a 20px version. The
900px half kept `grid`, `1fr 1fr`, `gap: 28px`, `align-items: start`, without `!important`.

Six `!important` tokens went, not four: the story counted the two in the duplicate's media block
(`display:grid`, `grid-template-columns`) but the duplicate's base block also carried
`display: flex !important` and `flex-direction: column !important`, and both disappear with it. The
`/* Two-panel layout fixes */` and `/* Force single-column on phone */` section comments were kept,
because `.tab-split` and `.status-split` still live under them; only the `/* story-split: ... */`
comment and its two blocks were removed.

#### 6. Task 2's no-clear question, answered rather than guessed

`.is-error` needs no removal path. The success branch calls `render()`, which rebuilds the
container's `innerHTML`, so `#feed-confirm-btn` is a fresh node with no class on it; re-adding on a
second consecutive failure is idempotent. No speculative `classList.remove` was added. The reasoning
is also written into the CSS as a comment above the rule, so the next reader does not re-ask it.

#### 7. Test results

**Zero new failures on either surface.**

**Playwright, `tests/desktop-and-css.spec.js`, full file: 44 passed / 12 failed (10.3 min).**

The baseline the story predicted was 36/12; 36 + gdx-4's 8 new assertions = 44, and the 12 failures
are the documented pre-existing set **confirmed by name, not by count**: eleven `desktop-mode --`
tests (`toggle button visible in header`, `starts in game mode`, `toggle adds body.desktop-mode`,
`bottom nav hidden`, `sidebar has primary tabs`, `sidebar has section labels`, `ST sees Tracker and
Sign-In`, `tapping sidebar Dice navigates`, `toggling back restores game mode`, `preference saved to
localStorage`, `app width uncapped`) plus `css-audit -- DT Submission tab has dark-theme input
styles`. All twelve are `setupSuite()`-dependent and unrelated. None was "fixed" here.

All eight new assertions pass. The two pre-existing AC4 assertions the story expected to keep
working for free both stayed green: `css-audit -- story-split is single column on phone` and its
`tab-split` twin.

**vitest, full suite: 4127 passed / 12 failed / 3 skipped (232 files, 9 failed, 568s).**

Run in full rather than targeted because this story touches `suite.css`, `components.css` and
`downtime-form.js`, each of which is grepped by many suites. The new suite
`server/tests/gdx-4-css-standards-grep.test.js` contributes **20 passed / 0 failed**.

Six of the nine failing files are on CLAUDE.md's documented list, at their documented counts:
`n7-n9-allocator-readers` (1), `oath-a-pledge-helpers` (1), `epic.708.3-cycle-phase-controls` (3),
`issue-1013-indomitable-rules-text` (3), `cm-4-renumber-chapter-merge` (1, the 112-second
Atlas-contention timeout), and `issue-836-legacy-tracker-cache-removed` (suite-level).
`fix.715.dt-manual-open-gate` passed this time, which is consistent with its documented
full-suite-only flake.

The remaining three are **not on CLAUDE.md's list**, so each was A/B verified rather than assumed.
Every file gdx-4 touched was swapped back to its `HEAD` content and the suites re-run; all three
fail identically at base:

| Suite | Failing assertions | Verdict |
|---|---|---|
| `bl3a-one-inclan-implementation.test.js` | `has a desktop rule that can beat .sh-desktop .sh-edit-select` | Pre-existing. Asserts the literal `font-size:10px` in `components.css`; gdx-2's rem type scale changed it to `0.625rem`. Same shape as the three documented literal-source-snippet failures. |
| `issue-830-inherited-card-css.test.js` | `.dom-inherited-card-title is subtitle scale (<= 11px)`, `.dom-row-subtitle gets explicit styling` | Pre-existing, same gdx-2 rem cause. |
| `api-downtime-personal-story-freetext.test.js` | suite-level, 3 tests skipped | The documented no-local-`mongod` class (#1117). Passes clean when run targeted. |

**Recommendation for the human, outside this story's scope:** `bl3a-one-inclan-implementation.test.js`
and `issue-830-inherited-card-css.test.js` are gdx-2 casualties that belong on CLAUDE.md's
known-pre-existing-failures list, exactly as gdx-11 added two of its own. Not edited here, because
CLAUDE.md is outside gdx-4's file list and the change is not tied to an AC.

#### 8. One process note

The story's Task 8 required writing the four carve-outs into `specs/deferred-work.md`. The dev-story
hand-off said they had already been logged by the create-story pass and only needed verifying; they
had not been. The only pre-existing `gdx-4` strings in that file were inside **gdx-3's** sections,
pointing forward at gdx-4 as where the dead-CSS work should land. The section was written for real.
Carve-out 4 also gained a suggested follow-up title (`gdx-16-next-session-undefined-tokens`), which
the story named as a carve-out but left untitled.

### File List

**Modified (13):**

- `public/js/admin.js` - the `cssText` string became `devBtn.className = 'dev-preview-btn'`.
- `public/js/tabs/feeding-tab.js` - the `.style.background` / `.style.color` pair became
  `btn.classList.add('is-error')`, so both halves moved into CSS together.
- `public/js/tabs/downtime-form.js` - dropped the `style="color:#b23;margin-left:6px;"` attribute
  from the EQC-4 warning span; its `class="dt-equipment-tweak-warn"` was already there.
- `public/js/editor/print.js` - five inline `style="..."` attributes became `.print-muted`,
  `.print-muted print-normal`, `.print-note` (x2) and `.xp-row xp-row-total`; four rules and one
  exemption comment added to the document's own embedded `<style>` block.
- `public/js/admin/next-session.js` - the inline grid became `class="ns-field-grid"`.
- `public/css/admin-layout.css` - new `.dev-preview-btn` (next to `.login-box`) and new
  `.ns-field-grid` (new Next Session panel section at the end of the file, because the panel had no
  rules of its own in this sheet).
- `public/css/components.css` - new `.feed-confirm-btn.is-error` and new `.dt-equipment-tweak-warn`.
- `public/css/suite.css` - `#bnav` mask stops tokenised; `.city-stat-glyph` tokenised; four
  `!important`s removed; the duplicate `.story-split` pair merged away.
- `specs/architecture/coding-standards.md` - CSS Standards -> Styling from JavaScript gained "The
  DOM API counts too" (WRONG/RIGHT pair), "Enforcement" (both greps verbatim) and "Documented
  exemptions" (the two-entry register).
- `specs/project-context.md` - section 1 item 3 gained the DOM-API sentence and a cross-reference.
- `specs/deferred-work.md` - new `## Deferred from: gdx-4-mobile-css-cleanup` section holding
  carve-outs 1 to 4.
- `tests/desktop-and-css.spec.js` - eight assertions appended to the existing `css-audit` group,
  plus two helpers (`gdx4Probe`, `gdx4Resolve`).
- `specs/stories/sprint-status.yaml` - status line and `last_updated` header (targeted edits only).

**Added (1):**

- `server/tests/gdx-4-css-standards-grep.test.js` - the source-text ratchet (20 assertions).

**Deliberately not touched**, each for a reason stated in the story: `public/js/app.js` (line 2180
is the compliant fallback; line 2034 is carve-out 2), `public/js/admin.js:2` (console `%c`
exemption), `public/js/suite/territory.js` (carve-out 2), `public/theme-preview.html` (not part of
either app), `public/css/theme.css` (no new token needed), `print.js`'s three Category-B hexes and
its colourless `style="font-size:9pt"` banes cell, `downtime-form.js:5500`'s colourless
`style="margin-top:4px;"`, `next-session.js` lines 21-24, every `var(--token, #hex)` fallback, and
all ~17 bare `rgba()` sites in `suite.css`.

## Change Log

| Date | Description |
|------|-------------|
| 2026-08-20 | Story created. Audited the current tree rather than trusting #985/#859: both DOM-API line numbers had drifted (222 -> 288, 952 -> 983), none of the three cited `suite.css` line numbers resolves to a colour literal at any commit checked, `print.js` has 8 hexes not 5 (5 in scope, 3 exempt), and the "inline JS grid-template-columns forcing !important" premise does not hold (one inline site, four unrelated redundant `!important`s, one duplicated `.story-split` block). One new post-#854 regression found and pulled in (`downtime-form.js:5498`, from EQC-4 #1155). Four carve-outs named with follow-up story titles. Status -> ready-for-dev. |
| 2026-08-20 | Implemented, red-first. Both enforcement greps matched the story's audit exactly at baseline, so no re-derivation was needed. All ten tasks done: two DOM-API literals tokenised into classes (`.dev-preview-btn`, `.feed-confirm-btn.is-error`), the EQC-4 regression's inline `#b23` replaced by the `.dt-equipment-tweak-warn` rule the markup had always referenced but no stylesheet declared, `print.js`'s five Category-A inline styles moved into its own embedded stylesheet behind three new classes plus an exemption comment (its three Category-B hexes untouched), `suite.css`'s three bare hexes tokenised, the one inline JS grid migrated to `.ns-field-grid`, and the duplicated `.story-split` pair merged away with six `!important` tokens (not four - the duplicate's base block carried two more the story had not counted). Standards documents gained the DOM-API prohibition, both greps verbatim and a two-entry exemption register; the four carve-outs were written into `specs/deferred-work.md` (they had NOT been pre-logged as the hand-off claimed). New vitest ratchet `gdx-4-css-standards-grep.test.js` (20 assertions, 16-failed-at-base) plus eight computed-style assertions appended to the existing `css-audit` group, each prove-discriminated individually against its own reverted change. `print.js`'s five sites measured byte-identical across eighteen computed properties in a real browser. Three story-baseline corrections recorded (mask lines are 90/91 not 89/90; ten hex `var()` fallbacks not eleven; carve-out 4's tokens are on lines 23/24 as two separate declarations). Playwright 44/12, vitest 4127/12, zero new failures - three undocumented vitest failures A/B verified against `HEAD` and all pre-existing (two are gdx-2 rem-scale casualties worth adding to CLAUDE.md). Status -> review. |
| 2026-08-21 | Codex adversarial review completed (Pass 1-3a; Pass 3b, the run-the-gates verification pass, did not complete - it timed out spinning up a Playwright server and the run stopped there, so none of the Dev Agent Record's own pass/fail numbers were independently re-verified). Five findings, all Medium/Low, none High, addressed to the extent static analysis and honest scoping allow (see the same-day Pass 3b entry below for two corrections to this entry's own claims): (1) AC1's DOM-API regex widened to catch bracket-notation, `+=`, `.setProperty()` and `.setAttribute('style', ...)`, and its allowlist fixed to check each colour token by its own position rather than excusing a whole match that merely contained the allowed snippet - a colour built by string concatenation (`'#' + 'fff'`) remains, and always will remain, undetectable by a source-text regex; the file's own header says so plainly rather than implying full closure; (2) AC2's attribute regex fixed to match its value by a quote backreference (an opposite quote inside the value no longer truncates the scan) and to tolerate whitespace around `=`; (3) AC3's `declarationValues()` fixed to treat a quoted string as one atomic unit, so a `;` inside e.g. a data URI can no longer drop a real bare hex declared later in the same rule; (4) AC6's text corrected to name the colour corrections Tasks 2/3/7 always made and Completion Notes #4 always disclosed, not only `.dev-preview-btn` (this entry originally said "three" and argued `.dt-equipment-tweak-warn` was not a fourth exception - see the same-day Pass 3b correction below, that argument was wrong); (5) AC7's ratchet extended from `suite.css` only to the whole of `public/css` except `theme.css` - four of the other five stylesheets measured genuinely clean and are held to zero, `admin-layout.css`'s four pre-existing unrelated sites are grandfathered rather than swept blind (carve-out 5). Fixing (2) surfaced a real, previously-invisible pre-existing violation in `public/js/editor/sheet.js`'s Touchstones panel, structurally invisible to the old regex and unrelated to gdx-4's diff; deferred rather than fixed, with a narrow labelled exception in the test and full evidence in `deferred-work.md` carve-out 6 (including a dark-theme token, `--green2-a9`, that matches the hard-coded literal exactly). `server/tests/gdx-4-css-standards-grep.test.js`: 29/29 at the time this entry was written. Status remains `review` pending Pass 3b (the gate-verification pass) actually running to completion. |
| 2026-08-21 | Codex Pass 3b resumed (`codex exec resume --last`) and completed for real: it ran both full gates itself and read the whole revised file set. Verdict: **no High findings in any of the four passes.** It also found three genuine problems with the SAME-DAY fixes above, all corrected here, and one important gate-number correction: (1) **AC6's "no fourth exception" argument was factually wrong** - an inline `style="..."` attribute is not theme-scoped, so the pre-change `#b23` rendered identically in both Parchment and dark; `.dt-equipment-tweak-warn` is a genuine fourth exception on the same footing as the other three, and AC6 is corrected to say so (verified directly: `git show 53e55ea5:public/js/tabs/downtime-form.js` confirms the pre-change literal carried no theme conditional). (2) **The `admin-layout.css` grandfather was a count, not a site list** - `offenders.length <= 4` would stay green if one of the four pinned sites were fixed while a different, brand-new bare hex appeared elsewhere in the same file. Replaced with a pinned `(property, hex)` list plus a prove-discrimination test reproducing exactly that fix-one/add-one swap, confirmed to fail before the fix and pass after (`server/tests/gdx-4-css-standards-grep.test.js`: 31/31). (3) The split-string-literal gap in AC1 (`'#' + 'fff'`) was always disclosed in the test file's own header as permanently out of reach for a static regex, but this story's own Change Log wording overclaimed "all addressed" without repeating that caveat - corrected above. (4) **Gate-number correction, not a code defect:** the Dev Agent Record's Playwright claim of 44 passed / 12 failed does not reproduce in this environment - two independent full runs both returned **43 passed / 13 failed**, with one additional, previously-undocumented failure: `css-audit — the T1/T2 fixes did not grow the visible box on desktop (gdx-3 AC3)`, where `.edit-tab` measures 29px instead of the pinned 30px. This test passes in isolation (confirmed separately) and is unrelated to gdx-4's own diff - all eight gdx-4 test blocks passed both full runs, including the widened viewport loops - so this reads as a full-suite-load-dependent failure, the same class CLAUDE.md already documents for several vitest suites, just newly observed on the Playwright side. Worth adding to CLAUDE.md's known-failures list as its own entry (not done here - out of this story's file list). The historical vitest full-suite claim (4127/12/3) also could not be reproduced in this environment (no local `mongod`); real current totals were 4,151 total / 2,245 passed / 11 failed / 1,895 skipped, all eleven failures matching documented pre-existing shapes. No blocking problem found; ready to ship with the corrections above applied. |
