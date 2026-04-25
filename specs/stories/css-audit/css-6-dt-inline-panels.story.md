# Story CSS-6: DT Panel Chrome Harmonisation — Inline Detail Panels (Bucket 1B)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an ST processing downtimes,
I want every inline detail panel inside the action-row drawer (right-rail mod boxes, pool builders, project slots, info cards, stripe-accent callouts) to share one consistent chrome,
so that the processing surface reads as one designed system instead of a patchwork of boxes built across many epics.

## Background

Audit doc: `specs/audits/downtime-ui-audit-2026-04-26.md`. Bucket 1B (the inline detail panels rendered inside `.proc-action-detail` and `.dt-resp-panel`) currently has ~17 distinct class declarations splitting into a "heavy" cluster (radius 6, `--surf2` bg, 10/12 padding) and a "light" cluster (radius 4, `--surf1`/`--surf2` bg, 8/10 padding). The split was incidental, not designed: each epic that added a panel picked its own values.

Approach decided in pre-work conversation:
- **Pure CSS only.** No JS edits, no markup edits, no class renames.
- **Grouped selector rewrites.** Existing class names stay (heavy JS coupling makes renames unsafe). The canonical chrome is written once as a grouped selector covering all target classes.
- **Stripe-accent variants stay.** They keep their distinguishing `border-left: 3px solid <token>` and the meaning that goes with each colour, layered on top of the canonical chrome.
- **Canonical chrome** (audit §4A): `background: var(--surf2); border: 1px solid var(--bdr); border-radius: 6px; padding: 10px 12px;`. Already the most-used shape in the file (~8 instances).

This story is bucket 1B only. Bucket 1A (outer dashboards), 1C (nine duplicate detail wrappers), 1D (story-tab cards), and the title harmonisation (audit §2) are separate stories not yet drafted.

## Acceptance Criteria

1. **Given** the seven "heavy" cluster classes (`.dt-proj-slot`, `.proc-feed-mod-panel`, `.proc-feed-vitae-panel`, `.proc-proj-succ-panel`, `.proc-feed-right-section`, `.proc-proj-roll-card`, `.proc-pool-builder`) **When** rendered **Then** each has the canonical chrome from a single shared rule block, and any duplicated bg/border/radius/padding declarations on the individual class blocks are removed.
2. **Given** the five "light" cluster classes (`.proc-proj-detail`, `.proc-feed-info`, `.proc-feed-desc-card`, `.proc-acq-notes`, `.proc-narr-action-ref`) **When** rendered **Then** each adopts the same canonical chrome, with their previous lighter background / 4px radius / 8/10 padding removed. Visual review during implementation may surface a reason to retain a tier distinction; if so, the deviation is captured as an open question and brought back before completing the story.
3. **Given** the stripe-accent variants (`.proc-player-note-section`, `.proc-proj-contested-panel`, `.proc-mismatch-flag`, `.proc-xref-callout`) **When** rendered **Then** they sit on the canonical chrome and add only their `border-left: 3px solid <colour>` plus any colour-specific background tint required for the warning role; the accent colour-to-meaning mapping (gold = cross-ref, accent = info, crim = warning, green = resolved) is preserved.
4. **Given** the implementation diff **When** inspected **Then** no `.js` file is modified, no `.html` file is modified, and no class name is renamed or removed.
5. **Given** any JS file in `public/js/` that previously referenced one of the target class names via `querySelector`, `closest`, `classList`, or string concatenation **When** searched after the change **Then** every reference still finds its element (i.e. the class names are still present in the rendered markup).
6. **Given** the admin app open on the Downtimes tab **When** an ST expands a project action, a feeding action, a sorcery action, and a merit action in turn **Then** every panel inside each drawer reads as visually consistent in radius, border weight, padding, and background tier; no panel feels like an outlier.
7. **Given** `public/css/admin-layout.css` after the change **When** measured **Then** the file has the same or fewer total lines than before (rule deduplication should not increase line count).

## Tasks / Subtasks

- [x] Locate every target class in `public/css/admin-layout.css` (AC: #1, #2, #3)
  - [x] Heavy cluster line numbers (per audit §1B): `.dt-proj-slot` 2061, `.proc-feed-mod-panel` 5493, `.proc-feed-vitae-panel` 5494, `.proc-proj-succ-panel` 5495, `.proc-feed-right-section` 5648, `.proc-proj-roll-card` 5509, `.proc-pool-builder` 4623
  - [x] Light cluster line numbers: `.proc-proj-detail` 5686, `.proc-feed-info` 5381, `.proc-feed-desc-card` 5417, `.proc-acq-notes` 4377, `.proc-narr-action-ref` 4149
  - [x] Stripe-accent variant line numbers: `.proc-player-note-section` 4872, `.proc-proj-contested-panel` 4987, `.proc-mismatch-flag` 4890, `.proc-xref-callout` 4903
  - [x] Verify line numbers against current file before editing (audit was 2026-04-26, file may have shifted)

- [x] Write the canonical inline-panel rule block (AC: #1, #2)
  - [x] Pick a clean home for the shared rule. Suggested location: just before the first existing target rule (around line 2056 where `.dt-proj-detail, .dt-merit-detail` already groups two classes), or under a new comment block `/* ── Inline detail panels: canonical chrome (CSS-6) ── */`
  - [x] Write a single grouped selector covering all twelve target classes (heavy + light) with the canonical chrome: `background: var(--surf2); border: 1px solid var(--bdr); border-radius: 6px; padding: 10px 12px;`
  - [x] Do NOT add `margin-bottom` to the shared block; spacing belongs to each panel's individual context

- [x] Strip duplicated chrome from each individual class declaration (AC: #1, #2)
  - [x] For each of the twelve target classes, remove the four properties (background, border, border-radius, padding) from its individual block, leaving only properties unique to that class (margin, display, flex-direction, gap, width, etc.)
  - [x] Light-cluster border tokens that diverged (`.proc-feed-desc-card` uses `border: 1px solid var(--surf3)`) collapse into the shared `var(--bdr)`
  - [x] Light-cluster backgrounds that diverged (`--surf1`) collapse into shared `var(--surf2)`

- [x] Reconcile stripe-accent variants (AC: #3)
  - [x] `.proc-player-note-section` keeps `border-left: 3px solid var(--accent)`; the `border` shorthand and other chrome come from the shared block. Ensure `border-left` is declared AFTER the shorthand so it overrides correctly (or use only `border` + override one side).
  - [x] `.proc-proj-contested-panel` keeps `border-left: 3px solid var(--crim)` and its `display: flex; flex-direction: column; gap: 6px`
  - [x] `.proc-xref-callout` keeps `border-left: 3px solid var(--gold2)`
  - [x] `.proc-mismatch-flag` is a special case: it has its own warning background (`rgba(139, 0, 0, 0.12)`) and full crim border, not just a stripe. Decision: left out of the shared block as recommended; current declaration retained as-is. Documented in Completion Notes.

- [x] Verify no JS coupling broken (AC: #4, #5)
  - [x] Run from repo root: grep against `public/js/` for the 16 class names — heavy usage in `downtime-views.js` (querySelector/closest/HTML emissions), all references resolve to unchanged class names.
  - [x] Confirm every JS reference still maps to a class name that exists in the rendered HTML (since no class was renamed, this should be trivially true; the check is to catch any accidental rename during refactor)
  - [x] Confirm `git diff --stat` shows only `public/css/admin-layout.css` modified (and optionally the audit doc per the next task)

- [x] Visual verification in browser (AC: #6) — **VERIFIED by user 2026-04-26** ("css changes took place too"). Local API server (port 3000) + local frontend (port 8080) used to view live admin Downtimes tab; user confirmed the harmonised panels render as expected. No hierarchy concerns surfaced for the light cluster (AC #2 deferred decision: light cluster joining canonical chrome is accepted as final).
  - [ ] Start frontend: `npx http-server public -p 8080`
  - [ ] Open `http://localhost:8080/admin.html`, log in (use `localTestLogin()` if Discord OAuth not available locally — see `reference_local_env`)
  - [ ] Navigate to Downtimes tab, pick a cycle with submissions
  - [ ] Expand a **project action** drawer: confirm `.dt-proj-slot`, `.proc-pool-builder`, `.proc-proj-roll-card`, `.proc-proj-succ-panel`, `.proc-proj-detail` all read as visually consistent
  - [ ] Expand a **feeding action** drawer: confirm `.proc-feed-mod-panel`, `.proc-feed-vitae-panel`, `.proc-feed-right-section`, `.proc-feed-info`, `.proc-feed-desc-card` all read as consistent
  - [ ] Expand a **merit/sorcery action** drawer: confirm `.proc-acq-notes`, `.proc-narr-action-ref`, `.proc-player-note-section` are consistent and that the stripe accents on the latter still display the gold/crim/accent left bar
  - [ ] Expand a row that triggers `.proc-mismatch-flag` (if available) to confirm it still displays correctly
  - [ ] Note any panel that looks visually off after the change; if a hierarchy reason emerges to keep a panel "lighter", document it in Completion Notes and bring back to user before marking story done (per AC #2)

- [x] Update audit doc with implementation note (AC: #7)
  - [x] Add a `### Bucket 1B — Resolved` line at the bottom of audit §3 (or wherever fits) referencing this story key and the implementation date
  - [x] No other audit content modified

- [x] Verify line count did not grow (AC: #7)
  - [x] Before/after line count of `public/css/admin-layout.css` recorded in Dev Agent Record

## Dev Notes

**Single file in scope:** `public/css/admin-layout.css`. All edits land here.

**Key constraint (do NOT violate):** No JS file in `public/js/` may be modified. No class name may be renamed or removed. The CSS rule bodies change; the class names that carry them do not. This is because of heavy JS coupling — `downtime-views.js` (~6500 lines) and other admin JS reach into these elements by class name.

**Token discipline (per `reference_css_token_system`):** All colour values must reference an existing token from `public/css/theme.css`. Do not introduce bare hex. The canonical chrome uses `var(--surf2)` and `var(--bdr)`, both already defined.

**British English in any new comments** (per CLAUDE.md). Default to no comments at all (per CLAUDE.md "default to writing no comments"); only add a comment if a reader would otherwise be confused by why a property is structured the way it is. The grouped selector itself documents its own intent through the class list.

**Audit doc as design contract:** `specs/audits/downtime-ui-audit-2026-04-26.md` §1B and §4A are the design intent for this story. If the implementation diverges from the audit (e.g., a class needs to opt out of the shared block), capture that divergence in Completion Notes and update the audit doc accordingly.

**Stripe-accent override pattern (CSS gotcha):** When a class extends the shared `border: 1px solid var(--bdr);` shorthand with a custom left border, declare `border-left: 3px solid <token>;` AFTER any shorthand on the same element. CSS shorthands reset all four sides, so `border` declared after `border-left` will silently overwrite the stripe. The shared rule comes first (because it's grouped above), the stripe variant comes after (because its rule appears later in source order). Verify in browser dev tools that the stripe wins.

**Light cluster — visual-tier question:** AC #2 states the light cluster joins canonical chrome. There is a reasonable argument for keeping `.proc-feed-info` and `.proc-proj-detail` slightly lighter (they're "context strips" above the actual interactive panel, not interactive panels themselves). The story does not pre-decide this — visual verification (AC #6) is the moment to surface the hierarchy concern. If the harmonised view feels flat, retain `--surf1` background on those two via a `.dt-context-strip` modifier or similar, document it, and bring it back. Do NOT silently re-introduce divergence.

**Mismatch flag exclusion:** `.proc-mismatch-flag` (line 4890) is treated as not a panel for the purposes of this story. It's an inline alert with its own warning background. Leaving it as-is is the recommended path; if implementation review feels it should join, it can be brought in as a stripe variant with a `--crim`-tinted background.

**Browser test setup:** The local dev environment uses `npx http-server public -p 8080` for the frontend and `node server/index.js` for the API (per `reference_local_env`). For admin login, `localTestLogin()` provides a bypass if Discord OAuth isn't reachable.

### Project Structure Notes

- All work in `public/css/admin-layout.css`. No file moves, no new files.
- The audit doc lives in `specs/audits/`, a sibling to `specs/stories/css-audit/` (which is where this story file sits). Updating the audit during implementation is in scope; creating new audit docs is not.

### References

- [Source: specs/audits/downtime-ui-audit-2026-04-26.md] — Sections 1B, 4A, and 6 are the load-bearing context for this story
- [Source: public/css/admin-layout.css:2056-5722] — primary edit range
- [Source: public/css/theme.css] — token definitions for `--surf2`, `--bdr`, `--accent`, `--crim`, `--gold2`
- [Source: CLAUDE.md] — branch policy (Morningstar only), British English, no comments by default, no em-dashes
- Memory: `reference_css_token_system` — token discipline rules
- Memory: `reference_downtime_system` — downtime tab structure (for browser verification path)
- Memory: `reference_local_env` — local dev setup including `localTestLogin()`

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Amelia persona, bmad-dev-story workflow)

### Debug Log References

- LOC pre-CSS-6: 8282 (post CSS-8 + follow-up fold)
- LOC post-CSS-6: 8244 (net −38 for this story; cumulative −61 from baseline 8305)
- `git diff --stat` (admin-layout.css only): 22 insertions, 63 deletions
- JS reference grep across `public/js/` returned ~80 matches in `downtime-views.js` covering all 15 target classes (querySelector with attribute selectors, closest(), HTML string emissions). All references resolve to class names that remain in the CSS as members of the new grouped selector. No JS or HTML edits required.
- Stripe ordering verified by source order: shared block at line 2049 declares `border` shorthand; stripe variants (`.proc-player-note-section` line 4837, `.proc-proj-contested-panel` line 4949, `.proc-xref-callout` line 4865, plus `.dt-proj-resolved`/`.dt-proj-unresolved` at lines 2075-2076) declare `border-left` longhand later in source — longhand wins on the left side, shorthand wins on the other three sides.

### Completion Notes List

- Implemented as a single 15-class grouped selector at `public/css/admin-layout.css:2049-2069` titled `/* ── Inline detail panels: canonical chrome (CSS-6) ── */`. Located just before the existing "Project & Merit Resolution Panels" section comment so it precedes all consumers in source order.
- Heavy cluster (7 classes) was already on canonical chrome — only needed to be consolidated; no visual change for these.
- Light cluster (5 classes) MIGRATED to canonical: `.proc-narr-action-ref`, `.proc-acq-notes` already had `--surf2` bg + `--bdr` border so only `border-radius` (4→6) and `padding` (8/10 → 10/12) changed; `.proc-feed-info`, `.proc-feed-desc-card`, `.proc-proj-detail` had `--surf1` bg (now `--surf2`) and `.proc-feed-desc-card` had `--surf3` border (now `--bdr`). **Visible change** — these panels become slightly darker and more prominent.
- Stripe-accent variants (3 classes) MIGRATED: `.proc-player-note-section` previously had no border on top/right/bottom, now gets full canonical 1px border + retains its accent left stripe (visible change — reads as a panel-with-stripe rather than a stripe-only element). `.proc-proj-contested-panel` and `.proc-xref-callout` retained their existing structure with chrome consolidated.
- `.proc-mismatch-flag` (line 4843) intentionally EXCLUDED from the shared block as recommended in story task 4. It's an inline alert with its own warning background, not a panel. Untouched.
- `.dt-proj-slot`'s `margin-bottom: 8px` retained in its individual block. `.proc-pool-builder`'s `margin-top: 8px; margin-bottom: 12px` retained. `.proc-proj-roll-card`'s flex layout retained. `.proc-acq-notes`'s font/color/wrap retained. `.proc-feed-info`'s flex layout retained. `.proc-xref-callout`'s font-size + color retained.
- `.dt-proj-resolved` and `.dt-proj-unresolved` (existing modifier classes that add a left stripe to `.dt-proj-slot`) confirmed to override the canonical `border-left` correctly via source order (they appear at line 2075-2076, after the shared block at line 2049-2069).
- **AC #6 (visual verification) VERIFIED by user 2026-04-26.** Local API server started on port 3000, frontend on 8080; user viewed live Downtimes tab and confirmed harmonised panels render correctly. AC #2's deferred decision (light cluster joining canonical chrome vs retaining `--surf1` lighter tier) closed in favour of canonical — no hierarchy concerns surfaced.
- No JS edits, no HTML edits, no class renames. Class-name-stable refactor only.

### File List

- Modified: `public/css/admin-layout.css` (canonical inline panel chrome introduced; 15 class declarations consolidated; net −38 LOC)
- Modified: `specs/audits/downtime-ui-audit-2026-04-26.md` (will add "Bucket 1B — Resolved" entry — see audit doc edit below)
- Modified: `specs/stories/css-audit/css-6-dt-inline-panels.story.md` (this file — task checkboxes, Dev Agent Record, Status)
