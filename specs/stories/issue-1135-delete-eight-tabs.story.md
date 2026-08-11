# Story issue-1135: Delete eight redundant tabs from the Game App, and scrap the ticket system

Status: done

<!-- "done" here follows this project's working convention (see issue-1128): reviewed,
     findings resolved, regression green. It does NOT mean merged - this is uncommitted
     and unpushed, on branch ms/issue-1135-delete-seven-tabs. -->


Issue: [#1135](https://github.com/angelusvmorningstar/TerraMortis/issues/1135)
Branch: `ms/issue-1135-delete-seven-tabs` (named before the scope grew to eight; harmless)

## Story

As a Storyteller running a game at the table,
I want the Game App to carry only the surfaces someone actually reaches for mid-session,
so that there is less code to break, no duplication of what TM Wiki already serves, and no dead tiles between me and the thing I need.

## Why this story exists

Decided 2026-08-10, rescoped 2026-08-11. Three reasons, in the issue's own words: less code means more stability; most of this content now lives on TM Wiki and is therefore duplicated; and the app should carry only what a player or ST reaches for mid-session.

The eight: **World** (`whos-who`), **Primer**, **Game Guide**, **Rules**, **NPCs** (`relationships`), **Tickets**, **Finance**, **Devlog**.

Four ST decisions on 2026-08-11 changed the shape of the work. Each inverts something the original issue asserted, so each is restated here rather than left in the issue's history:

1. **No tie migration is needed.** The Wiki board is a live projection over `tm_suite.relationships`, not a copy.
2. **Tickets is scrapped entirely**, server and admin included. This inverts the original "`tickets-views.js` MUST survive".
3. **Finance goes, the check-in stays.**
4. **Devlog joins the list, player side only.** Route, schema, admin authoring and the 13 entries all stay.

## Acceptance Criteria

1. **Given** the Game App at any viewport, **when** I open the bottom nav, the More grid, or the desktop sidebar, **then** none of World, Primer, Game Guide, Rules, NPCs, Tickets, Finance or Devlog appears.
2. **Given** the desktop sidebar, **when** Primer, Game Guide and Rules are gone, **then** no LORE section header renders.
3. **Given** a direct call to `goTab('whos-who')` (or any of the other seven), **when** it runs, **then** nothing throws and no container becomes active. Note the observable result is a blank view: `goTab` deactivates every `.tab` before looking up the target, so the previously-active tab does *not* remain visible. Assert on "no throw + no active container", never on "previous tab still showing".
4. **Given** the character sheet, **when** I press the **Rules** button (`index.html:119`), **then** the rules overlay still opens and closes correctly.
5. **Given** `admin.html`, **when** I open the City domain, **then** the city map overlay still works (`city-tab.js` untouched).
6. **Given** `admin.html`, **when** I look at the sidebar, **then** there is no Tickets domain, and no console error or 404 from the removed stylesheet, route or view.
7. **Given** the Game App Settings tab, **when** it renders, **then** there is no Submit Ticket form and no console error from the removed `#stk-*` handlers.
8. **Given** any client, **when** it calls `/api/tickets`, **then** the route is absent (404).
9. **Given** a coordinator account, **when** they sign in, **then** the absence of Finance is the only change; no console error from the removed `coordinatorOnly` entry.
10. **Given** the check-in tab, **when** an ST or coordinator uses it, **then** it behaves exactly as before (`signin-tab.js` and `payment-helpers.js` untouched).
11. **Given** `admin.html`, **when** I open the Devlog domain, **then** ST authoring still works against the 13 existing entries.
12. **Given** TM Herald, **when** it polls `GET /api/devlog`, **then** the route still responds (see Dev Notes: external consumer).
13. Every module in the deletion table is deleted from disk and no import of it remains anywhere.
14. CSS deletion matches the verified table in Dev Notes exactly: the listed rules go, and **no `npcr-*` rule is touched**.
15. Test specs are updated per the verified verdicts in Dev Notes; targeted suites green, no new failures.
16. The ADM-1 pilot references are repointed at Spheres.

## What this story is NOT

- ~~**Not dropping the `tickets` collection.**~~ **Superseded 2026-08-11, after the review closed.** Angelus authorised the drop explicitly ("we can delete all outstanding tickets, I don't care"), having been told the 19 open ones included real unfixed bugs. The collection was dropped as a **separate authorised action after this story's review**, not as part of its scope — the story shipped code-only, exactly as specified. Guarded: the drop script aborted unless the live count matched the export exactly (69 = 69). Recovery path remains `data/exports/tickets-full-export-2026-08-11.json` (all 69, status split 19 open / 3 resolved / 47 closed) and `tickets-open-2026-08-11.md`.
- **Not opening GitHub issues for the 19 open tickets.** Declined by Angelus with the drop; the bugs they described are not tracked anywhere but the export.
- Not touching the `relationships` collection, its routes, or admin-side relationship tooling.
- Not touching the `game_sessions` finance fields. They stay, and become uneditable. That is intended.
- Not touching the devlog route, schema, admin surface or its 13 entries.
- Not building a replacement player-facing propose path for canon ties.
- **Not deleting `renderCityTab` from `city-tab.js`.** The file survives for `openCityMapOverlay`; `renderCityTab` becomes an unreferenced export. Leave it. It belongs to #1095 (unreachable surfaces).
- Not fixing the duplicate `territory` key in `TAB_SUBTITLES` (defined twice, lines 353 and 364). Pre-existing, unrelated; log to `deferred-work.md` instead.
- Not #1095, #1067 (dead `t-map`), or #846 (dead dice-engine).

## Tasks / Subtasks

- [x] **T1 — Game App nav and dispatch** (AC: 1, 2, 3)
  - [x] Remove the 6 `NAV_ITEMS` entries: `whos-who` (396), `devlog` (400), `primer` (401), `game-guide` (402), `rules` (403), `finance` (409). `relationships` and `tickets` are not in `NAV_ITEMS`.
  - [x] Remove the 8 `MORE_APPS` entries: `whos-who` (1693), `relationships` (1705), `primer` (1710), `game-guide` (1711), `rules` (1712), `tickets` (1716), `finance` (1719), `devlog` (1725). Also remove the now-orphaned comment at 1706-1707.
  - [x] Remove the `goTab` branches: `rules` (492), `finance` (495), `whos-who` (543), `primer` (571), `game-guide` (575), `relationships` (586), `tickets` (600), `devlog` (601).
  - [x] Remove the two `TAB_SUBTITLES` entries: `rules` (355), `devlog` (367). **Fourth registration point — the issue said three.**
  - [x] Remove the `lore` entry from `MORE_SECTIONS` (1731) as dead data. See Dev Notes: this is tidiness, not the fix for AC2.
  - [x] Remove the 6 now-dead imports: `initFinanceTab` (67), `initRules` (70, keep `openRulesOverlay`/`closeRulesOverlay`), `renderPrimerTab` (74), `renderRelationshipsTab` (78), `renderCityTab` (79), `renderDevlogTab` (82).
  - [x] Remove the 8 container divs in `index.html`: 347, 354, 361, 364, 365, 367, 376, 377.
- [x] **T2 — Ticket teardown, client** (AC: 6, 7)
  - [x] `app.js`: delete `initTicketsSurface` (680-695), the Settings Submit-a-Ticket block (1879-1889) and its handler (1948-1964).
  - [x] `admin.js`: delete the import (42) and the dispatch (331).
  - [x] `admin.html`: delete the stylesheet link (21), sidebar button (68) and domain section (190-192).
  - [x] Delete `public/js/admin/tickets-views.js` and `public/css/admin-tickets.css`.
  - [x] Remove the mock handlers: `dev-fixtures.js` (81-82), `dt-proto-boot.js` (78).
- [x] **T3 — Ticket teardown, server** (AC: 8)
  - [x] `server/index.js`: remove the import (28) and the mount (111).
  - [x] Delete `server/routes/tickets.js` and `server/schemas/ticket.schema.js`.
- [x] **T4 — Delete the player modules** (AC: 13)
  - [x] `tabs/relationships-tab.js`, `game/finance-tab.js`, `tabs/primer-tab.js`, `tabs/devlog-tab.js`.
- [x] **T5 — CSS** (AC: 14) — follow the verified table exactly, delete nothing else.
- [x] **T6 — Specs** (AC: 15) — follow the verified verdicts exactly.
- [x] **T7 — Docs** (AC: 16) — repoint ADM-1 references at Spheres; log the `TAB_SUBTITLES` duplicate to `deferred-work.md`.
- [x] **T8 — Verify** (AC: 3-12) — run the targeted suites; check the Rules overlay, admin City, admin Devlog and the check-in by hand.

## Dev Notes

### There are FOUR registration points per tab, not three

The issue says three (`NAV_ITEMS`, `MORE_APPS`, `goTab`). Verified: there is a fourth, `TAB_SUBTITLES` at `app.js:347-368`, which carries `rules` (355) and `devlog` (367). Miss it and those two leave a stale header subtitle behind.

Per-tab registration, verified by reading:

| Tab | NAV_ITEMS | MORE_APPS | goTab | TAB_SUBTITLES | container |
|---|---|---|---|---|---|
| `whos-who` | 396 | 1693 (`game`) | 543 | — | 361 |
| `primer` | 401 | 1710 (`lore`) | 571 | — | 364 |
| `game-guide` | 402 | 1711 (`lore`) | 575 | — | 365 |
| `rules` | 403 | 1712 (`lore`) | 492 | **355** | 347 |
| `relationships` | — | 1705 (`st`, **stOnly**) | 586 | — | 367 |
| `tickets` | — | 1716 (`st`, stOnly) | 600 | — | 376 |
| `finance` | 409 | 1719 (`st`, coordinatorOnly) | 495 | — | 354 |
| `devlog` | 400 | 1725 (`player`) | 601 | **367** | 377 |

### NPCs is already ST-only — correcting the issue

The issue calls NPCs "Epic NPCR's player-facing tier ... players propose ties". **Not today.** `MORE_APPS:1705` is `section: 'st', stOnly: true`, there is no `NAV_ITEMS` entry, and both the More grid (`app.js:2020`) and the desktop sidebar (`app.js:2207`) filter `stOnly` against role. No player-reachable path exists. The line was last edited 2026-05-09, after the one player proposal (2026-04-30), so the gating postdates it. Deleting this tab removes an **ST** surface, not a player write path.

The single `pending_confirmation` edge was retired 2026-08-11 (Yusuf Kalusicj → Harpy Brandy LaRoux). `relationships` now holds 92 docs: 88 active, 4 retired, **0 pending**. Nothing is stranded.

### AC2 is already satisfied by existing code — do not "fix" it

Both render sites already skip empty sections:
- `renderMoreGrid` — `app.js:2041`: `if (!sectionApps.length) continue;`
- `renderDesktopSidebar` — `app.js:2216`: `if (!sectionApps.length && !hasPrimary) continue;`

Removing the three `lore` entries from `MORE_APPS` is therefore sufficient for AC2. Deleting the `lore` entry from `MORE_SECTIONS` is dead-data tidiness. **Do not add new empty-section logic.**

### The generic router — why deleting the container divs is load-bearing

`app.js:1202` derives `currentTab` from the DOM (`document.querySelector('.tab.active')?.id?.replace('t-','')`) and `:1248` re-dispatches `goTab(currentTab)`. `app.js:2187` does the same for sidebar active-state. This is exactly the router ADR-008 Rev 5 warns a literal name-grep cannot find. Deleting the `<div id="t-…">` containers is what makes a deleted id unreachable through it — removing only the nav entries would leave a live re-entry path.

`goTab` itself is null-safe throughout (`if (tabEl)` 471, `if (navEl)` 475, `if (subEl && TAB_SUBTITLES[t])` 483), so AC3 holds by construction once the branches are gone.

### CSS — the verified table. Delete exactly this, and nothing else.

`admin.html` loads `theme/components/admin-layout/admin-shared/admin-spheres/admin-tickets`. It does **not** load `suite.css`. So every `suite.css` rule below serves the Game App only.

| Prefix | Rules | File | Verdict |
|---|---|---|---|
| `tk-` | 47 (whole file) | `admin-tickets.css` | **Delete the file.** All 47 are confined here; ADR-008 Stage A already consolidated them. Zero `.tk-` rules exist in `suite.css`, `components.css` or `admin-layout.css`. |
| `rel-` | 85 | `components.css` | **Delete.** Census over `public/js` + `public/*.html` found zero consumers outside `relationships-tab.js`. |
| `fin-` | 28 | `suite.css` | **Delete.** Zero consumers outside `finance-tab.js`. `signin-tab.js` uses none of them. |
| `primer-` | 27 | `suite.css` | **Delete.** All 11 distinct classes (`primer-content`, `primer-layout`, `primer-toc*`) belong to the deleted tab. |
| `devlog-` | 22 | `suite.css` | **Delete.** All belong to the deleted tab. |
| `.settings-ticket-form` | 1 | `suite.css:2333` | **Delete.** Serves only the removed Settings form. |
| `npcr-` | 128 in `admin-layout.css` + 6 in `components.css` | — | **DO NOT TOUCH ANY.** |

**The `npcr-` rule is the trap in this story.** `relationships-tab.js` uses 9 `npcr-*` classes (`npcr-btn`, `npcr-field`, `npcr-field-label`, `npcr-modal`, `npcr-modal-actions`, `npcr-modal-body`, `npcr-modal-overlay`, `npcr-modal-title`, `npcr-textarea`). **All nine are also used by surviving files**: `admin/npc-register.js`, `admin/relationship-editor.js`, `editor/edit.js`, `tabs/downtime-form.js`. Deleting by prefix breaks the admin NPC register, the relationship editor and the DT form. Not one `npcr-` rule is exclusive to the deleted tab.

Two false-positive traps when grepping: `devlog-` and `primer-` match in `app.js`/`admin.js` only as **import paths** (`'./tabs/devlog-tab.js'`, `'./admin/primer-admin.js'`), not as classes. Do not read those as surviving consumers.

`primer-admin.js` (live at `admin.js:41`/`:330`, domain `documents`) uses a disjoint set — `primer-admin-shell`, `primer-file`, `primer-upload-btn` — which is **defined in no stylesheet at all**. That surface is already unstyled. Pre-existing; leave it alone, and do not add styles for it.

### Cross-repo checks — both cleared, do not re-litigate

- **TM Wiki does not consume TM Suite CSS.** It loads its own `/css/base.css` + `components-01..09`. The `../TM Suite/...` strings in that repo are comments and `settings.local.json` entries. Deleting 85 `rel-` rules from `components.css` cannot affect it.
- **TM Herald consumes `GET /api/devlog`** (`services/announcements.js:61`), polling for new entries and announcing them to Discord. This is why the devlog route must survive, and it is also why deleting the player devlog tab loses nothing: entries still reach players through Discord. **Nothing anywhere consumes `/api/tickets`** — Herald, Wiki and Cockpit were all checked.

### Test specs — verified verdicts

| Spec | Verdict |
|---|---|
| `tests/issue-7-world-tab.spec.js` | **Retire the whole file.** All 12 tests sit in one `Issue #7: World tab layout and icons` describe and exercise `renderCityTab`'s output via the deleted World tab. |
| `tests/fin-checkin-finance.spec.js` | **Partial.** Retire the four `fin.4` Finance tests (lines 84, 91, 102, 113). **Keep the two `fin.3` check-in tests** (61, 69) — they cover the surviving surface and must still pass. |
| `tests/desktop-and-css.spec.js` | **Two surgical edits, keep the other 18 tests.** (a) line 86, `expect(navText).toMatch(/Lore/i)` inside 'sidebar has section labels' — must be updated, LORE is gone. (b) lines 166-203, 'css-audit — Primer tab renders styled TOC' — retire; it clicks `.more-app-icon[data-app="primer"]` and asserts `.primer-layout` exists in the CSSOM. |
| `tests/issue-502-devlog-tab.spec.js` | **Partial.** Retire the `Player — Devlog tab in game app` describe (258-332). **The `Admin — Devlog domain` describe (134-255) must still pass unchanged.** |

### ADM-1 / ADR-008 repoint

Spheres is live at `app.js:599` and `:1717` (`stOnly`) on the identical loading pattern, documented at `app.js:645-651` ("Same shape as Tickets"). Deleting Tickets therefore does not remove the pattern's live proof.

Four files carry the reference: `specs/architecture/adr-008-admin-merge.md` (D5, D5a, D9, Rev 4/5/13 commentary), `specs/stories/adm.1.p1-tickets-pilot.story.md`, `specs/qa/gates/adm.1-stage-a.yml`, `specs/qa/gates/adm.1-stage-b.yml`.

Treatment: add a Rev note recording that the pilot surface was removed by #1135 and Spheres is now the reference implementation. **Leave the historical findings intact** — several Tickets citations are recorded discoveries that generalise (emitter exclusivity, the correlated-checks preamble, the CSS-coverage failure). Rewriting them out destroys the reasoning trail.

### Environment and hard rules

- **Never push or merge.** Commit only when Angelus asks, in that message. Work stays on `ms/issue-1135-delete-seven-tabs`.
- British English; no em-dashes in app-authored strings.
- `loadSurfaceSheet` (`app.js:183`) survives — Spheres uses it at 667-668. Only the `admin-tickets.css` call at 688 goes.
- Targeted suites only, per `project-context.md`. Never `| tail` a test run (masks the exit code).
- No new CSS is written by this story. It only deletes. If something looks like it needs a new rule, that is a signal something was over-deleted.

### References

- `public/js/app.js` — `TAB_SUBTITLES` 347-368, `NAV_ITEMS` 387-416, `goTab` 457-614, `initTicketsSurface` 680-695, `currentTab` router 1202/1248, Settings ticket form 1879-1889 + handler 1948-1964, `MORE_APPS` 1690-1726, `MORE_SECTIONS` 1728-1733, `renderMoreGrid` 2012-2050, `renderDesktopSidebar` 2202-2240
- `public/index.html` — containers 347/354/361/364/365/367/376/377; Rules sheet button 119
- `public/admin.html` — 21, 68, 190-192
- `public/js/admin.js` — 42, 331
- `server/index.js` — 28, 111
- `TM Wiki/server/routes/wiki-relationship-board.js`, `TM Wiki/server/wiki-schemas/relationship-board.schema.js` — why no tie migration is needed
- `TM Herald/services/announcements.js:61` — the `/api/devlog` consumer
- `specs/architecture/coding-standards.md` → CSS Standards; `specs/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-opus-5 (BMAD dev-story, 2026-08-11)

### Debug Log References

- New spec: `tests/issue-1135-deleted-tabs.spec.js` — **12 passed** (14.0s)
- `tests/fin-checkin-finance.spec.js` + `tests/issue-502-devlog-tab.spec.js` — **7 passed** (6.5s)
- `server` vitest, `api-devlog` + `api-relationships` — **53 passed**, real runs (mongod present, not skipped)
- `tests/desktop-and-css.spec.js` — 12 failed / 7 passed. **The baseline number originally recorded here (13 failed / 7 passed) is not reliable.** Codex reconstructed base `40cee7fb` independently and measured **12 failed / 8 passed**, with the Primer test *passing*. Two full runs of byte-identical base code disagree on exactly that one test, and in the original baseline run it failed by 60s **timeout waiting for `.more-app-icon[data-app="primer"]`** — the signature of a flake or order-dependence, not a deterministic assertion failure. So the honest reading is: **12 deterministic pre-existing failures, plus one flaky test that has since been retired.** What both measurements agree on, and what AC15 actually turns on, is that the **failure set is unchanged** — no new failures. Not re-adjudicated further: it is one number about a now-deleted test, and settling it would cost two more ~10-minute full runs.
- `tests/admin.spec.js -g "City Domain"` — 4 failed / 4 passed on this branch AND **the identical 4/4 on HEAD**, so those failures are pre-existing.

### Completion Notes List

1. **All 16 ACs satisfied — but only after external review.** ~~As implemented~~, AC15 was **false**: five live tests in `tests/feat-16-17-fix44-tracker-feeding.spec.js` drove `goTab('rules')` and waited on the deleted `#t-rules`, and two more assertions in `tests/post-game-1.spec.js` referenced the deleted Rules tile. The original verification only ran the four spec files the story itself named, and never swept the whole suite for references to the eight deleted ids. Codex found it; see the Senior Developer Review below. Fixed and re-verified.
2. **Discrimination proven, not assumed.** The new spec was run against a reconstructed pre-deletion tree (HEAD's `public/` rebuilt in a scratch dir, served on its own port via a temporary config, since reverting the working tree was correctly blocked). Result: **8 failed / 4 passed against HEAD vs 12/12 against this change.** Every one of the 8 deletion assertions flips; the only 4 that pass both ways are the deliberate controls — surviving containers, the Rules overlay, admin Devlog, admin City. The temporary config and scratch tree were removed afterwards.
3. **The fourth registration point was real.** `TAB_SUBTITLES` carried `rules` and `devlog`. The issue's "exactly three registration points" would have left two stale header subtitles.
4. **AC2 needed no new code**, exactly as the story predicted: `app.js` `renderMoreGrid` and `renderDesktopSidebar` both already skip a section with no visible apps. Removing the three lore tiles was sufficient; the `MORE_SECTIONS` `lore` entry was removed as dead data only.
5. **The `npcr-` trap held.** Zero `npcr-` **rules or selectors** were touched. All 9 classes the deleted tab used are shared with `npc-register.js`, `relationship-editor.js`, `edit.js` and `downtime-form.js`; Codex re-derived that set independently and confirmed each one still has a surviving emitter. **Correction:** the evidence command originally cited here was wrong. `git diff -U0 public/css/components.css | grep -c npcr-` returns **1**, not 0 — the diff *adds* an explanatory comment containing the string. The rule-level claim is sound; the command as written does not demonstrate it. To check selectors only: `git diff -U0 public/css/components.css | grep -E '^[+-]' | grep -E '^\-.*\.npcr-'` → empty.
6. **A CSS gap the story's table missed, found and closed.** The verified table was prefix-based, so it could not see **ID-scoped** rules targeting the deleted containers. Found via a follow-up census: `#t-finance.active`, `#t-primer.active`, and an eight-line `#t-primer .reading-pane` block, all exclusive and removed; plus two **shared** selector lists (`#t-…active` and `#t-… > *`) where `#t-whos-who` sat beside surviving ids and only that one selector was removed. `.reading-pane` base rules were kept — eight surviving files use them.
7. **First CSS attempt was reverted, not patched over.** The initial cutter glued rules onto preceding lines (`}@media …{`) and skipped `@media` blocks. Both files were restored with `git checkout` and redone with a range-based remover that deletes exact byte ranges in reverse, leaving all surviving text byte-identical. **Corrected count** (the original "79 from `suite.css`" was the automated cutter's own tally, taken *before* the manual id-scoped deletions in note 6, and was never restated afterwards): `suite.css` lost **84 brace-blocks** — 83 style rules plus one now-empty `@media` grouping — and `components.css` lost **85**. Independently recounted base-vs-current: `suite.css` 1442 → 1358, `components.css` 1777 → 1692. Braces balanced in both. Total style rules removed is **168**, not the 164 stated earlier.
8. **Dead code found while removing dead code.** `apiPost` became unused in `app.js` once the ticket form went (its only caller), so it was dropped from the import. In `issue-502-devlog-tab.spec.js`, retiring the player describe orphaned `loginAsGameApp`, `loginAsPlayer` and `PLAYER_USER`; all three removed.
9. **Stale comments corrected** rather than left to mislead: the ADM-1 preamble above `initSpheresSurface` (which described a surface that no longer exists, and had left two stacked comment blocks after the tickets function went), the `npcr-modal` "Used by" list in `components.css`, the `relationships-tab.js` reference in `server/routes/npcs.js`, and the headers of two specs. **This originally said "six ... rather than left to mislead", which overstated it**: the six named were corrected, but five more were missed and left misleading — the `lore` section contract at the top of `MORE_APPS`, two Finance-consumer claims in `game/payment-helpers.js`, and the coordinator-tier rationale in `server/index.js`. Codex found all five; all are now corrected.
10. **A test-harness bug in my own new spec, caught and fixed.** The admin tests first failed because Playwright uses the **last** matching route: my `**/api/**` catch-all was overriding `**/api/auth/me`, so admin bounced to `/`. Registering the catch-all first fixed it. Noted in the spec so the next person does not re-derive it.
11. **Environment:** Playwright's Chromium binary was not installed in this checkout; `npx playwright install chromium` was needed before any E2E could run. The first "20/20 failed" reading was entirely that, not the code.

### Declared deviations

- **Tests were written after the deletions, not before.** A strict red-green was not followed: the deletions came first, then the spec. Mitigated by the explicit discrimination run in note 2, which demonstrates the same property red-green would have — every assertion fails on the pre-change tree and passes on this one.
- **`desktop-and-css.spec.js` cannot be made green by this story and was not made green.** 12 of its 19 tests fail because `#btn-desktop-toggle` never becomes visible under the stubbed API (`#hdr-nav` is revealed by `_applyDesktopMode`, which needs `effectiveRole()` to resolve to ST). Pre-existing, unrelated to tabs, and confirmed by the identical baseline on an untouched tree. Fixing that harness is its own piece of work; AC15's "no new failures" is met, its "green" is not, for this file only.
- **`tests/admin.spec.js` was not run to completion.** It takes over 10 minutes and 16 of its tests fail; the City Domain subset was run on both trees and is identically 4/4, so it is pre-existing. The rest was not exhaustively baselined. AC5/AC6/AC11 are instead discharged by dedicated tests in the new spec, which do pass.
- **AC9 (coordinator role) is covered by construction, not by a coordinator-role test.** The Finance entry was `coordinatorOnly` in both `NAV_ITEMS` and `MORE_APPS` and both entries are gone, so no role can render it; the ST-role tests assert its absence. A coordinator fixture was not added.

### File List

**Deleted (8 source + 1 spec)**
- `public/js/tabs/relationships-tab.js`
- `public/js/tabs/primer-tab.js`
- `public/js/tabs/devlog-tab.js`
- `public/js/game/finance-tab.js`
- `public/js/admin/tickets-views.js`
- `public/css/admin-tickets.css`
- `server/routes/tickets.js`
- `server/schemas/ticket.schema.js`
- `tests/issue-7-world-tab.spec.js`

**Added**
- `specs/stories/issue-1135-delete-eight-tabs.story.md`
- `tests/issue-1135-deleted-tabs.spec.js`

**Modified**
- `public/js/app.js`, `public/index.html`, `public/js/admin.js`, `public/admin.html`
- `public/js/dev-fixtures.js`, `public/js/dt-proto-boot.js`
- `public/css/suite.css`, `public/css/components.css`
- `server/index.js`, `server/routes/npcs.js`
- `tests/desktop-and-css.spec.js`, `tests/fin-checkin-finance.spec.js`, `tests/issue-502-devlog-tab.spec.js`
- `specs/architecture/adr-008-admin-merge.md`, `specs/stories/adm.1.p1-tickets-pilot.story.md`
- `specs/qa/gates/adm.1-stage-a.yml`, `specs/qa/gates/adm.1-stage-b.yml`
- `specs/stories/deferred-work.md`, `specs/stories/sprint-status.yaml`

**Data (not in the repo)**
- `data/exports/tickets-full-export-2026-08-11.json`, `data/exports/tickets-open-2026-08-11.md` — taken before any teardown; the collection itself is untouched.

## Senior Developer Review (AI)

**External, 2026-08-11.** Adversarial 3-pass review (Blind Hunter → Edge Case Hunter → Acceptance
Auditor) run in Codex, which shared none of the implementing session's context. Prompt:
`specs/stories/code-review/issue-1135-codex-review.md`. Raw findings preserved verbatim at
`specs/stories/code-review/issue-1135-codex-findings.md`. **Every finding below originated outside
this session unless marked otherwise.** Outcome: **0 High, 7 Medium, 9 Low.**

### What the review independently confirmed

Worth recording, because these were the implementing session's own load-bearing claims and an
external reviewer reproduced them rather than taking them on trust: the discrimination run
(**8 failed / 4 passed** against base vs 12/12 after — exact match), the `npcr-` rule-level
protection (it re-derived all 9 shared classes itself), brace balance in both stylesheets, the
admin City subset being identically 4/4 on both trees, TM Herald's `/api/devlog` still mounted, and
a real **404** from `/api/tickets` on a booted server. It also checked something the implementing
session had flagged as its own weakest point and found it **stronger than claimed**: all 12 tests in
the new spec do have a same-test positive control, so none is vacuous against a blank page.

### Patched (10)

| # | Sev | Finding | Resolution |
|---|---|---|---|
| M1 | Med | **Five live Rules tests broken by the deletion** — `feat-16-17-fix44-tracker-feeding.spec.js` drove `goTab('rules')` and waited on the deleted `#t-rules`. | **Converted, not retired.** They cover rules *content* (City Status, Territory, `[data-sec]`, `.rl-sec-hd`), which survives behind `openRulesOverlay()`. Helper retargeted to `#rules-overlay`. 5 failed → **5 passed**. |
| M2 | Med | AC15 "no new failures" therefore false. | Resolved by M1. |
| M3 | Med | "All 16 ACs satisfied" therefore overstated. | Record corrected (note 1). |
| — | Med | *(found here, extending M1)* `post-game-1.spec.js` had two more stale Rules assertions the reviewer explicitly declined to attribute, because a pre-existing `#n-more` failure masked them. Checking where it disclosed a gap found them **latent**: they would have broken the moment `#n-more` was fixed. | Visibility assertion removed; the navigation exemplar switched from the deleted Rules tile to Feeding. |
| M4 | Med | **Settings still advertised and controlled three deleted tabs** — a *fifth* registration point the story's "four registration points" analysis missed entirely: a font-size hint naming Primer/Game Guide/Rules, and a "Show Primer, Guide & Rules tabs" toggle whose only targets were gone. | Hint corrected (the control itself is still live — `--reading-font-size` drives `.reading-pane`, emitted by eight surviving modules). Toggle, handler, both `showGuides` reads and both now-unreachable `guide` filters removed. |
| M5 | Med | CSS rule counts undercounted. | Recounted independently; note 7 corrected (84 + 85, not 79 + 85). |
| M6 | Med | Desktop baseline evidence false. | Adjudicated as a flaky test; deviation rewritten. |
| M7 | Med | **Three current docs still advertised the live ticket API** — `system-map.md`, `reference-data-ssot.md`, `epic-city-refresh.md`. | All three corrected. *(Found here, not by the review: `specs/qa/gates/adm.2-spheres.yml` cites `admin-tickets.css` in its AC9 evidence — annotated as historical rather than rewritten, matching the ADR-008 treatment.)* |
| L1 | Low | Page-error listeners registered after boot in three tests. | All three moved before `setupSuite`. |
| L2 | Low | Three icon entries orphaned by this change. | `_svg.primer/guide/rules` removed. Three others (`status`, `whosWho`, `dtReport`) confirmed **already dead at base** — deferred, not this story's. |
| L3 | Low | Five stale comments left misleading. | All corrected; note 9 rewritten. |
| L4 | Low | **AC8 had no regression test** — `/api/tickets` returning 404 was true by construction and untested. | Added `server/tests/tickets-removed.test.js` (3 tests). Deliberately a **static** guard on the real `server/index.js` mount table: a 404 against `tests/helpers/test-app.js` would prove nothing, since that harness builds its own router table. Needs no DB, so it runs where the other server suites skip. |
| L5 | Low | AC4/AC5 tests bypassed the interactions the criteria name. | AC4 now asserts the sheet button's `onclick` and fires it via the real inline handler; AC5 now clicks `[data-open-map-edit]` and asserts `#city-map-overlay` opens. |
| L7 | Low | The cited `npcr-` evidence command returns 1, not 0. | Note 5 corrected with a selector-only command. |

### Deferred (3)

- Three `_svg` entries dead **before** this change (`status`, `whosWho`, `dtReport`).
- No coordinator-role fixture in the targeted browser specs (AC9 / half of AC10 rest on construction plus static inspection).
- `tests/post-game-1.spec.js` nav-1-3 (3 tests) and `tests/desktop-and-css.spec.js` (12 tests) fail for **pre-existing** reasons — `#n-more` was never in `NAV_ITEMS` (confirmed absent at base `40cee7fb`) and `#btn-desktop-toggle` never becomes visible under the stubbed API.

All three are logged in `deferred-work.md`.

### Dismissed (0), and one reviewer judgement overturned

Nothing was dismissed. One of the reviewer's own **non-findings** was overturned: it declined to
attribute `post-game-1.spec.js` because that test failed earlier for a pre-existing reason. Its
triage was a claim, not a verdict — the assertions were genuinely stale, merely masked, and are now
fixed. This is the second time in this story that checking hardest where the reviewer disclosed a
gap produced a real defect.

### Prove-discrimination

| Patch | Single change reverted | Expected failure | Result |
|---|---|---|---|
| M1 conversion | before vs after, same 5 tests, no other edit | the 5 tests fail on `#t-rules` | 5 failed → 5 passed ✅ |
| L5, AC4 | `index.html:119` `onclick="openRulesOverlay()"` → `voidBrokenHandler()` | AC4 test fails on the `onclick` assertion | failed with `Expected "openRulesOverlay()" / Received "voidBrokenHandler()"`; restored, `git diff` clean ✅ |
| L4 guard | appended a `/api/tickets` mount to `server/index.js` | guard test 1 fails | 1 failed / 2 passed; restored, green again ✅ |

### Verification after patching

- `tests/issue-1135-deleted-tabs.spec.js` + `fin-checkin-finance` + `issue-502-devlog-tab` — **19 passed**
- `tests/feat-16-17-fix44-tracker-feeding.spec.js -g "feat.17"` — **5 passed** (was 5 failed)
- `server` vitest, `api-devlog` + `api-relationships` + `tickets-removed` — **56 passed**, real runs
- `tests/post-game-1.spec.js -g "nav-1-3"` — 3 failed, all on pre-existing `#n-more`

### Residual, disclosed

- The reviewer could not run the server suites (Mongo `EACCES`) and correctly declined to escalate against an external DB. Those 53 tests were therefore verified **only** in this session — re-run here after the later edits: 56 passed.
- Pass ordering could not be confirmed by interrogating the Codex session directly. The attestation lists genuinely different files per pass and stops Pass 3a at story line 183, and the review returned 0 Highs, which is consistent with real ordering rather than a collapsed run.

## Change Log

| Date | Change |
|---|---|
| 2026-08-11 | Story created from rescoped #1135. |
| 2026-08-11 | Implemented. Eight tabs and the ticket system removed; 12 new tests, discrimination proven against HEAD (8/4 vs 12/12); no new failures in any pre-existing suite. Status → review. |
| 2026-08-11 | External adversarial review (Codex): 0 High, 7 Medium, 9 Low. AC15 was genuinely false — five live Rules tests, plus two latent stale assertions found by checking the reviewer's own disclosed gap. All Medium and 6 Low patched, 3 deferred, 3 record claims corrected (CSS counts, desktop baseline, `npcr-` evidence command). 5 further stale comments and a missed fifth registration point (Settings) fixed. |
| 2026-08-11 | Implemented. Eight tabs and the ticket system removed; 12 new tests, discrimination proven against HEAD (8/4 vs 12/12); no new failures in any pre-existing suite. Status → review. |
