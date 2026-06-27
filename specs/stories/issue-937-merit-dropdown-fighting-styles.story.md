# Issue #937: Merit dropdown should include fighting styles and manoeuvres

Status: review
<!-- Implementation complete and statically verified (node --check x5, prereq unit suite 10/10). Open gate: in-browser smoke on dev (Angelus cannot test locally). Manoeuvres-in-downtime resolved out of scope (option a). -->

issue: 937
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/937
branch: ms/issue-937-merit-dropdown-fighting-styles

## Story

As a player (and the ST building a sheet),
I want fighting styles and manoeuvres to be selectable through the Merit dropdown — on the character sheet editor and in the downtime XP-spend picker — and any merit whose prerequisite names a fighting style to unlock once I own that style,
so that I can take things like Street Fighting and Iron Skin without the fighting sub-system being invisibly walled off from the merit purchase paths.

## Background / why now

Raised when Einar's player could not find Street Fighting (and the Iron Skin it leads into) anywhere they could select it — not in the sheet Merit picker, not in the downtime form. Neither is removed from play; both are live in `purchasable_powers`. Investigation found two distinct causes:

1. The fighting sub-system (styles + manoeuvres) is deliberately excluded from the Merit dropdown and has **no entry point at all** in the downtime form's XP-spend picker.
2. A prerequisite-engine bug means a merit whose prereq names a fighting style (e.g. Iron Skin → `Street Fighting ●● OR Martial Arts ●●`) can never qualify, because the engine only looks in `c.merits` and styles live in `c.fighting_styles`.

The ST's position (locked below): a Fighting Style is conceptually a Merit (VtR: each style dot grants a manoeuvre), so the Merit dropdown should surface them rather than hiding them behind a separate path with no player entry point.

## How the fighting sub-system actually works (read before coding)

- **Catalogue (`purchasable_powers`):** there is **no doc** for a fighting style itself (no "Street Fighting" / "Boxing" / "Martial Arts" row). Styles exist only as the `parent` of `category:'manoeuvre'` docs (178 manoeuvres across 37 parents). Individual manoeuvres are `category:'manoeuvre'`. There are also 13 `category:'merit'` docs with `parent:'Style'` (Body As Weapon, Punch Drunk, Survivalist, Empath, Trigger Discipline, etc.) — these ARE real merits, currently hidden by the dropdown filter.
- **On the character:** styles live in `c.fighting_styles[]` (each `{ name, type:'style'|'merit', cp, xp, free_mci, free_ots }`; **effective dots = cp + xp + free_mci + free_ots**). Picked manoeuvres live in `c.fighting_picks[]` (`{ manoeuvre: name }` or a bare string). Dots in a style grant pick slots (1 pick per dot); access is "orthodox" (own style dots ≥ rank) or "unorthodox" (shared style-tag count ≥ rank). None of this is in `c.merits`.
- **Implication:** manoeuvres are not independently XP-purchased — they are **picks granted by style dots**. "Both styles and manoeuvres in the dropdown" therefore means two different routings (see Decisions).

## Current behaviour (files read)

**`public/js/data/prereq.js`** (read in full):
- `meetsPrereq` `case 'merit'` (L65-92) resolves the named merit **only against `char.merits`** (`directMatch` over `merits.some(...)`, plus optional `opts.domTotal`). Nothing consults `char.fighting_styles`. So a `{type:'merit', name:'Street Fighting', dots:2}` leaf is unsatisfiable no matter the style dots. `prereqLabel` (L156-224) already renders such leaves fine — display is not the problem.

**`public/js/editor/merits.js`** (read):
- `buildMeritOptions(c, currentName)` (L306-337) — the sheet's general Merit dropdown. Reads `getRulesByCategory('merit')` only. Excludes `rule.sub_category && !== 'general'` (L314), `INFLUENCE_MERIT_TYPES` (L315), and **`rule.parent in ['Style','Invictus Oath','Carthian Law']` (L316)**, then `meritPrereqOK` (L317).
- `buildMCIGrantOptions` (L397-428) and `buildSubCategoryMeritOptions` (L350-385) carry the same `parent` exclusion (L406) — out of scope to change, but be aware the filter pattern is repeated.
- `meritPrereqOK(c, rule)` (L298-300) = `_meetsPrereq(c, rule.prereq)` (the `prereq.js` engine), **called with no opts** — so even `domTotal` isn't wired here.

**`public/js/editor/sheet.js`** (read):
- `_manDB()` (L59-64) builds `MAN_DB` from `getRulesByCategory('manoeuvre')` mapping `style: r.parent`, `rank: r.rank`. No `active`/`implemented` filter.
- `_styleManoeuvres` (L1934), `_qualifiesForManoeuvre` (L1950, orthodox via `fighting_styles` effective dots / unorthodox via `STYLE_TAGS`), `_availablePicks` (L1971, excludes `NON_COMBAT_STYLES`, already-picked, unqualified, prereq-failing), `_allStyles` (L1989, distinct manoeuvre parents minus 'Regular').
- `NON_COMBAT_STYLES` (L1806) = Fast-Talking, Cacophony Savvy, Etiquette, Three Heads of Kerberos.
- General Merit dropdown rendered at **L1752** via `buildMeritOptions(c, m.name)`, selection routed through `shEditGenMerit`.
- Dedicated Fighting Style dropdown at **L2070** → `shAddStyle(value,'style')`; Fighting Merit button at L2102 → `shAddStyle('Fighting Merit','merit')`; manoeuvre pick dropdown at **L2127** → `shAddPick(value)` (options from `_availablePicks`).

**`public/js/editor/edit-domain.js`** (read):
- `shAddStyle(styleName, type='style')` (L580), `shEditStyle(idx, field, val)` (L599), `shAddPick(manName)` (L627) — the routing targets for style/pick writes. Exported and registered in `public/js/editor/edit.js` (L35, L50) for **both** `admin.js` and `app.js` consumers (keep both in sync — see memory: editor handlers have two importers).

**`public/js/tabs/downtime-form.js`** (read):
- `XP_CATEGORIES` (L4076) = Attribute, Skill, Discipline, Merit, Devotion, Rite. **No fighting-style / manoeuvre category, and the player has no path to picks here at all.**
- `getItemsForCategory('merit')` (L4166-4250) mirrors `buildMeritOptions`: excludes `parent in ['Style','Invictus Oath','Carthian Law']` (**L4190**), `sub_category==='standing'` (L4191), then `meetsPrereq(c, rule.prereq)` (L4192). Builds graduated/flat item descriptors (`Name|grad|cur|maxTarget` etc.).
- `getXpCost(category, item)` (L4103-4129) — per-category cost; `merit` graduated cost comes from the row's `dotsBuying`.
- The XP-spend rows are rendered/committed elsewhere in this file (trace the apply path before wiring style writes — the downtime form records an XP-spend intent that is later applied to the character; a style purchase must land in `c.fighting_styles`, not `c.merits`).

## Decisions (locked — from Angelus, 2026-06-27)

1. **Dropdown entries = BOTH styles and manoeuvres.** Selecting a **style** adds/raises a `c.fighting_styles[]` entry (XP buys dots; cost = 4 XP/dot? — confirm against existing style XP rate in the editor, do not assume). Selecting a **manoeuvre** adds a `c.fighting_picks[]` entry (a pick slot, **not** an XP line) and must only be offered when the character qualifies AND has a free pick slot — i.e. reuse the exact eligibility of `_availablePicks(c)`. The selection handler must detect entry type and route to the correct sub-system; it must NOT create a `c.merits` row for styles/manoeuvres.
2. **Un-hide the 13 `parent:'Style'` merits in this change.** They are already `category:'merit'` and are bought as normal graduated merits into `c.merits`. **Verify each routes correctly as a plain merit** (no bespoke sub-system handling) before un-hiding; if any one needs special handling, exclude just that one and note it. These are distinct from the parent-less fighting *styles* in decision 1.
3. **Downtime form: surface within the existing 'Merit' category** (no new category). Styles/manoeuvres appear in the Merit item list, routed correctly on commit.
4. **Direction A (UI aggregation), storage unchanged.** Do NOT migrate the fighting sub-system into `c.merits`. Keep `fighting_styles`/`fighting_picks` and their dot-pool / pick-slot / orthodox-unorthodox mechanics intact.
5. **Prereq fix uses effective dots.** A `type:'merit'` leaf naming a fighting style is satisfied when `c.fighting_styles` has that style at `cp + xp + free_mci + free_ots >= dots`. Existing `c.merits` resolution stays unchanged (dual-read: try merits, then fighting_styles).

## Acceptance Criteria

1. The sheet's general Merit dropdown (`buildMeritOptions`) lists fighting **styles** (e.g. Street Fighting) and eligible **manoeuvres** as selectable entries, in addition to ordinary merits.
2. Selecting a **style** from that dropdown routes to `c.fighting_styles[]` (via the `shAddStyle` path) and never creates a `c.merits` row; selecting a **manoeuvre** routes to `c.fighting_picks[]` (via the `shAddPick` path) and only appears when `_availablePicks(c)` eligibility holds (qualified + free pick slot).
3. The 13 `parent:'Style'` merits (Body As Weapon, Punch Drunk, Survivalist, etc.) appear in the Merit dropdown and are purchased as normal merits into `c.merits`. Any that require bespoke handling are individually excluded with a code comment.
4. The downtime XP-spend picker, under the existing **Merit** category, lists fighting styles (and eligible manoeuvres) with correct XP cost (style = dots × style rate; manoeuvre pick = 0 XP / pick-slot) and dot/slot accounting, and on commit applies a style to `c.fighting_styles` (not `c.merits`).
5. Given a character with Stamina ●●● and Street Fighting ●● (or Martial Arts ●●) in `fighting_styles`, Iron Skin appears as selectable in both the sheet Merit picker and the downtime XP picker.
6. Given a character with neither style (or the style below ●●), Iron Skin remains hidden — no regression to existing gating.
7. The prereq engine resolves style names via effective dots (`cp + xp + free_mci + free_ots`); existing `c.merits`-based prereqs resolve unchanged. Covered by a unit test for `meetsPrereq` (merit-leaf-against-fighting_styles, both pass and fail cases).
8. No regression to: existing merit/manoeuvre rendering, the dedicated Fighting Styles / Manoeuvres section, XP-spent calc, the pools/rules engine, or the roll calculator.
9. Styling reuses existing component classes (`.man-list`, `.mci-block`, `.gen-name-select`, `.dev-add-btn`, `.gen-edit-row`) and `theme.css` tokens — no inline `style=`, no bare hex/`rgba()`. (Note: surrounding legacy code uses inline `style=`; do not propagate it.)

## Tasks / Subtasks

- [x] **Task 1 — Prereq engine reads fighting_styles (AC: 5,6,7).**
  - [x] In `prereq.js` `case 'merit'`, after the `c.merits` check fails, also match `c.fighting_styles[]` by name using effective dots (`cp + xp + free_mci + free_ots`). Preserve qualifier semantics and the existing `domTotal` fallback ordering. (Unqualified leaves only — styles carry no qualifier.)
  - [x] Add unit tests for the merit-leaf-vs-fighting_styles path (style present at/over dots → pass; below dots / absent → fail; legacy `c.merits` still passes). `server/tests/issue-937-prereq-fighting-styles.test.js`, 10/10 green.
- [x] **Task 2 — Sheet Merit dropdown lists + routes styles & manoeuvres (AC: 1,2).**
  - [x] New `shFightingMeritOptions(c)` in sheet.js appends two `<optgroup>`s (styles via `_allStyles` minus owned/`NON_COMBAT_STYLES`; eligible manoeuvres via `_availablePicks`), with sentinel-prefixed values (`__style__:` / `__man__:`). Appended at the dropdown call site (sheet.js:1752).
  - [x] `shEditGenMerit` (edit-domain.js) detects the sentinel, removes the placeholder merit row, and routes to `shAddStyle` / `shAddPick`. No half-set merit row left.
  - [x] Built the option helper in sheet.js (where `_allStyles`/`_availablePicks` already live) rather than importing them into merits.js — avoids a circular import. `shFightingMeritOptions` exported for potential reuse.
- [x] **Task 3 — Un-hide parent:'Style' merits (AC: 3).**
  - [x] Removed `'Style'` from the L316 exclusion in `buildMeritOptions` (kept `Invictus Oath`/`Carthian Law`). The 13 are plain graduated merits routing to `c.merits` via the existing path; none needed bespoke handling (the 3 `(depreicated)` driving merits surface like other deprecated merits already do — consistent with current behaviour, not regressed).
- [~] **Task 4 — Downtime XP picker: styles & manoeuvres under Merit (AC: 4,5).** Partial — see Open decision below.
  - [x] Relaxed the L4190 `'Style'` exclusion in `getItemsForCategory('merit')` (parallel to Task 3).
  - [x] Inject fighting **styles** as graduated merit-category items (`Name|grad|cur|5`), riding the existing dot-selector + `getRowCost` path. Rate confirmed 1 XP/dot (not guessed — `xpSpentMerits` sums `fs.xp` directly). The form records intent into `xp_spend`; the ST applies via the now-style-capable sheet (Task 2) — there is **no** automated apply for any XP spend, so AC4's "on commit applies to fighting_styles" = the ST's existing manual apply step, which Task 2 now supports.
  - [x] **Manoeuvres in the downtime XP picker — OUT OF SCOPE (Angelus, 2026-06-27, option (a)).** A manoeuvre is a 0-XP pick granted by style dots, not an XP spend; it does not belong in the downtime XP-spend picker. Manoeuvre picks remain on the sheet (Task 2). The downtime form lets the player buy the style; its granted picks are chosen on the sheet at ST apply.
- [x] **Task 5 — Regression pass (AC: 8,9).** Static checks done (`node --check` all 5 files; prereq unit suite 10/10). In-browser smoke is the open gate (deploy to `dev` required — cannot test locally); see Status note.

## Open decision (RESOLVED)

**Manoeuvres in the downtime XP-spend picker.** Resolved 2026-06-27 — Angelus chose **(a) styles-only in downtime**. The player buys the fighting style in downtime; the manoeuvre picks it grants are chosen on the sheet at ST apply (the sheet already supports this, Task 2). No manoeuvre items in the downtime XP picker. Task 4 complete at this scope.

## Dev Notes

- **Routing is the whole risk.** The Merit dropdown historically maps one option → one `c.merits` row. Styles and manoeuvres must divert to `c.fighting_styles` / `c.fighting_picks`. Encode the entry type in the option value and branch in the handler; never write a style/manoeuvre into `c.merits`.
- **Two consumers.** `shAddStyle` / `shAddPick` / `shEditStyle` are exported via `editor/edit.js` and wired into BOTH `admin.js` and `app.js`. Any new handler/dispatcher must be registered in both (memory: editor handlers have two importers).
- **Effective dots everywhere.** Style dots = `cp + xp + free_mci + free_ots` (see sheet.js:1959-1962). Use this for both the prereq fix and any "owned at N dots" checks; bonus/derived dots are real dots.
- **Don't duplicate eligibility.** Reuse `_availablePicks` / `_qualifiesForManoeuvre` / `_allStyles` (sheet.js) rather than re-deriving manoeuvre eligibility in the downtime form.
- **CSS standards (mandatory).** Reuse `.gen-name-select`, `.gen-edit-row`, `.man-list`, `.mci-block`, `.dev-add-btn` and `theme.css` tokens. No inline `style=`, no bare hex/`rgba()`. Surrounding fighting-style render code uses inline styles — legacy tech-debt, do not propagate. See `specs/project-context.md` and `specs/architecture/coding-standards.md` → CSS Standards.
- **Testing.** No browser test framework; unit-test the `prereq.js` change (the one piece with isolated logic). Verify the rest manually in-browser per repo convention; Angelus cannot test locally, so smoke needs the branch on `dev` first.
- **Smoke target.** Reproduce with Einar Solveig (Stamina ●●●, no Street Fighting/Martial Arts yet): add Street Fighting ●● via the Merit dropdown → confirm it lands in `fighting_styles` and Iron Skin then appears.

### Project Structure Notes

- Frontend-only except the prereq engine (shared module). No server route or schema changes. No DB writes (data is Peter's domain; this is code-only).
- Catalogue is MongoDB-backed (`purchasable_powers`); no reference data is added — this is purely surfacing/ routing existing data.

### References

- `public/js/data/prereq.js#L65-92` — merit-leaf resolution (the bug)
- `public/js/editor/merits.js#L306-337` (`buildMeritOptions`, exclusion L316), `#L298-300` (`meritPrereqOK`)
- `public/js/editor/sheet.js#L1752` (merit dropdown render), `#L1934-1995` (style/pick helpers), `#L1997` (`shRenderManoeuvres`), `#L1806` (`NON_COMBAT_STYLES`), `#L1959-1962` (effective dots)
- `public/js/editor/edit-domain.js#L580-650` (`shAddStyle`/`shEditStyle`/`shAddPick`), `public/js/editor/edit.js#L35,L50` (two-consumer registration)
- `public/js/tabs/downtime-form.js#L4076` (`XP_CATEGORIES`), `#L4166-4250` (merit branch, exclusion L4190), `#L4103-4129` (`getXpCost`)
- Catalogue: `purchasable_powers` — `category:'manoeuvre'` (178, parented to styles), `category:'merit'` `parent:'Style'` (13); Iron Skin `key:iron-skin` (parent `Physical`, rating ●●-●●●●, prereq `(Martial Arts●● OR Street Fighting●●) AND Stamina●●●`)
- Issue: https://github.com/angelusvmorningstar/TerraMortis/issues/937

## QA Results (Quinn, 2026-06-27)

**Gate: PASS** (headless) — clear to deploy to `dev`. In-browser smoke is the only remaining confirmation and is deploy-gated (cannot run locally).

**Regression:** 270 tests green across every suite importing the changed modules (`prereq.js`, `merits.js`, `sheet.js`, `edit-domain.js`, `downtime-form.js`) + the new prereq suite (10/10). `node --check` clean on all 5 files.

**QA-caught + fixed during this pass:**
- The #937 comment in `buildMeritOptions` pushed `meritPrereqOK(c, rule)` past the 600-char window asserted by `n7-n9-allocator-readers.test.js` (brittle source-distance test; invariant still holds). Fixed by tightening the comment (now 588 chars), not by loosening the test.

**Edge cases reviewed (sheet routing + downtime injection):**
- Sentinel dispatch (`__style__:` / `__man__:`) only fires under `field === 'name'`; qualifier edits unaffected; no real merit name collides with the sentinel.
- Placeholder merit row is removed before `shAddStyle`/`shAddPick`; single re-render; `shAddStyle`/`shAddPick` retain their own owned/slot/dedup guards.
- Already-owned styles and unqualified manoeuvres are excluded from the options (`_availablePicks` eligibility), so the awkward "select something you can't have" path can't occur.
- Downtime style items ride the existing graduated-merit machinery; `getRowCost` returns dots = XP (1 XP/dot, confirmed via `xpSpentMerits`); empty rules cache → no style items (graceful).

**Low-severity notes (non-blocking):**
1. Selecting a style/manoeuvre on an *existing, populated* general-merit row converts it (discards that merit's dots), since the row is removed. The intended flow is "+ Add Merit → pick a style" on a blank row. Acceptable; flagging for awareness.
2. Un-hiding `parent:'Style'` also surfaces 3 `(depreicated)` driving merits + Clipping. Consistent with how other deprecated merits (e.g. `Attaché (depreicated)`) already appear — pre-existing pattern; a global deprecated-merit filter could be a separate cleanup.

**Smoke script for `dev` (the open gate):** Einar (Stamina ●●●, no fighting style) → Merit dropdown → add **Street Fighting** → confirm it lands under Fighting Styles, not general merits → raise to ●● → confirm **Iron Skin** now appears in the Merit dropdown. Then downtime form → XP Spend → Merit category → confirm **Street Fighting (Fighting Style)** is selectable with correct XP.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMAD dev-story, Amelia)

### Debug Log References

- Prereq test: RED 4 fail / 6 pass → GREEN 10/10 (`server/tests/issue-937-prereq-fighting-styles.test.js`).
- `node --check` clean on all 5 modified frontend files.
- Pre-existing, unrelated: `server/tests/n8-mandragora-prereq.test.js` fails to load under vitest with "Invalid or unexpected token" (byte-identical to `origin/dev`, never touched; `node --check` passes on it — an esbuild-transform issue on the base branch). The adjacent `prereq-same-level-sentinel.test.js` (same engine path) passes, so the engine has live coverage.

### Completion Notes List

- **Task 1 (prereq engine):** `prereq.js` `case 'merit'` now falls back to `c.fighting_styles` (effective dots = cp+xp+free_mci+free_ots) for unqualified merit leaves. Unblocks Iron Skin once the character owns Street Fighting/Martial Arts ●●. Existing `c.merits` and `domTotal` paths unchanged.
- **Task 2 (sheet dropdown):** styles + eligible manoeuvres appear in the general Merit dropdown via `shFightingMeritOptions`; selection routes to `c.fighting_styles`/`c.fighting_picks` (never `c.merits`) by sentinel dispatch in `shEditGenMerit`. Reuses existing `shAddStyle`/`shAddPick` guards. No new window handler → no edit.js registration change needed.
- **Task 3 (un-hide):** `parent:'Style'` merits now surface in `buildMeritOptions`.
- **Task 4 (downtime, partial):** `parent:'Style'` merits un-hidden; fighting styles surface as graduated 1 XP/dot merit-category items recorded into `xp_spend` for ST manual apply. Manoeuvres deferred (see Open decision).
- Rate finding: fighting styles cost **1 XP/dot** in this codebase (`xpSpentMerits` sums `fs.xp` directly; dots = cp+xp+free). Not guessed.
- No DB writes, no server/route/schema changes. No new dependencies.

### File List

- `public/js/data/prereq.js` (modified) — fighting_styles fallback in `case 'merit'`
- `public/js/editor/sheet.js` (modified) — `shFightingMeritOptions` helper + appended at merit dropdown call site
- `public/js/editor/edit-domain.js` (modified) — `shEditGenMerit` sentinel dispatch to style/pick
- `public/js/editor/merits.js` (modified) — un-hide `parent:'Style'` in `buildMeritOptions`
- `public/js/tabs/downtime-form.js` (modified) — un-hide `parent:'Style'` + inject fighting-style items in `getItemsForCategory('merit')`
- `server/tests/issue-937-prereq-fighting-styles.test.js` (new) — prereq unit tests

### Change Log

- 2026-06-27: Implemented Tasks 1-3 + core of Task 4. Prereq engine reads fighting_styles; sheet Merit dropdown lists/routes styles + manoeuvres; parent:'Style' merits un-hidden; downtime XP picker lists fighting styles. Manoeuvres-in-downtime deferred pending decision; in-browser smoke pending dev deploy.
