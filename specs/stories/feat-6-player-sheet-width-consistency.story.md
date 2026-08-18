---
id: feat.6
epic: feat
status: superseded
priority: low
depends_on: []
---

> ## ✅ CLOSED AS MOOT — 2026-08-18, Angelus's own call
>
> Tracing the actual player code path (`app.js:showPlayerSheet` → `onSheetChar` → `suite/sheet.js`,
> confirmed via `app.js:129`'s import) shows a player's own sheet view **never** reaches
> `editor/sheet.js` at all — that file (and the `.cd-sheet` width toggle found below) only serves
> the admin editor tab and the ST's read-only quick-view modal, both gated `role !== 'st'`. The
> `.cd-sheet` finding is real but belongs to a different surface this story was never about.
>
> The actual player path (`suite/sheet.js` + `suite.css`) shows **no content-driven width mechanism
> at all**: `#app` is a fixed `900px` cap (or uniformly uncapped in `desktop-mode`), tabs fill via
> `inset:0`, and the tab-content panes carry no width rule of their own. Nothing in that chain
> varies per-character. Combined with the story's own target file (`public/player.html`) having
> been deleted 2026-07-28 (see the STALE PREMISE note below, kept for the record), the honest
> conclusion is that **the original symptom no longer exists in the current unified SPA** — it was
> most likely specific to the now-gone `player.html`.
>
> Closed as moot rather than carried forward speculatively. Reopen only if a player reports the
> symptom again against the current app — and if so, capture which two characters and confirm both
> were viewed via the same nav path (not one via an ST quick-view surface and one via the player
> tab), since that distinction is what this investigation had to rule out by hand.

> ## ⚠ STALE PREMISE — found 2026-08-18, investigation redirected
>
> This story's own file references (`public/player.html`, `public/css/player-app.css`) point at a
> path **deleted 2026-07-28** (`5fdaa032`, `feat(#1047): USF Phase 0 Stage B — delete dead player
> path`), three months after this story was drafted (2026-04-27). Confirmed: no `player.html`
> anywhere in the working tree, no `/player` route in `netlify.toml` or `server/index.js`/
> `server/routes/*.js`. **This is why the original grep for `player-sheet`/`left.*panel.*width`
> found nothing — the target file is gone, not hidden.**
>
> The player sheet now lives in the unified SPA at `public/index.html`, gated by a role/view-mode
> flag (`public/js/app.js:151-155`). Two renderers produce it: `public/js/suite/sheet.js`
> (player-facing, phone-width tab panes) and `public/js/editor/sheet.js` (admin editor tab AND the
> ST's read-only "char-detail" quick-view modal).
>
> **A real, reproducible width-inconsistency mechanism was found in the current code — but it is
> context-driven, not character-content-driven as originally hypothesised:**
>
> ```css
> /* public/css/components.css:749-753 */
> #sh-content{max-width:640px;margin:0 auto;}
> .cd-sheet #sh-content,
> #sh-content.cd-sheet,
> .char-detail #sh-content{max-width:none !important;}
> ```
> ```js
> // public/js/editor/sheet.js:3133
> const isDesktop = el.closest('.cd-sheet');
> ```
>
> The SAME renderer produces a genuinely different layout depending on which DOM element it's told
> to render into: the ST's "char-detail" quick-view (`admin.js:678`, `<div id="sh-content"
> class="cd-sheet">`) gets `isDesktop: true` (2-column `.sh-desktop` grid, no width cap); the
> player/editor tab (`index.html:124`, no `cd-sheet` class) gets `isDesktop: false` (single-column,
> `640px`/`900px` capped). **No `max-content`/`min-content`/content-driven grid track exists
> anywhere in the sheet's outer-container chain** — every ancestor checked (`suite.css`,
> `components.css`, `admin-layout.css`) uses fixed `fr`/`minmax`/flex-ratio values, several with an
> explicit `min-width:0` specifically preventing content from forcing growth.
>
> **Conclusion:** if the original "left panel width varies between characters" symptom is still
> real, it very likely traces to *which surface was used to view each character* (ST quick-view
> modal vs. player-tab vs. `desktop-mode` toggle) — not any character's data. This story cannot
> proceed to `ready-for-dev` on its original hypothesis; it needs re-scoping against the current
> app structure, and Step 1 (identify two characters showing the difference) needs re-running
> noting which surface/nav-path opened each one.

# Story FEAT-6: Player Sheet Width Consistency

As a player viewing my character sheet on player.html,
I want my sheet to render at a consistent width regardless of which character I'm viewing,
So that the layout doesn't shift between characters and I'm not stuck with a narrow sheet on some characters and a wide one on others.

---

## Status: needs-investigation

The sprint-status comment for this item is:

> Left panel width varies between characters; sheet should be full-width consistently

But a `Grep` for `max-width.*sheet`, `sheet.*max-width`, `player-sheet`, and `left.*panel.*width` across `public/` returned **no matches** for an obvious width-control rule that varies per character. This suggests one of:

1. The width variation is incidental — driven by content (long honorific names, very full skill specs) pushing layout differently per character. In that case the fix is content-agnostic CSS (e.g. fixed-width left panel, scrollable content area).
2. The width variation comes from a per-character data field (e.g. some characters have a long custom field that makes a column expand). In that case the fix is constraining the layout, not the data.
3. The variation is from the desktop / mobile responsive breakpoint kicking in differently per character because of total content length. In that case the fix is the responsive rule itself.

**Before this story can move to ready-for-dev**, the dev (or user) needs to:

- Identify two specific characters where the width visibly differs. Capture screenshots or note the character names.
- Inspect the rendered sheet in both cases (browser devtools).
- Identify which CSS rule or content shape is driving the difference.

Once that's known, the fix is almost certainly a small CSS change — but the fix can't be pre-specified without seeing the cause.

---

## Provisional acceptance criteria (drafted; refine after investigation)

### Visual consistency

**Given** I view character A on player.html
**When** I switch to viewing character B
**Then** the overall sheet width is identical.
**And** the left panel (sheet container) width does not change.
**And** the content panel (right side, if applicable) does not shift.

### Content overflow

**Given** a character has very long content (e.g. many merits, long specs)
**Then** content scrolls within its container rather than expanding the container width.

### Responsive behaviour

**Given** I view the sheet on a desktop viewport (≥ 1200px)
**Then** the sheet renders at its full intended width.

**Given** I view the sheet on a narrower viewport
**Then** the responsive breakpoint kicks in consistently regardless of character — the breakpoint is viewport-driven, not content-driven.

### No regressions

**Given** characters with normal content lengths
**Then** the visual rendering is unchanged (the fix should add a constraint, not redesign the sheet).

---

## Investigation procedure

Discrete steps; document findings inline before code changes.

### Step 1 — Identify the symptom

- Load player.html locally or against production.
- View at least 5 different characters, side-by-side if possible.
- Capture screenshots of the difference. Note which characters show wide vs narrow.

### Step 2 — Inspect the DOM

- Open browser devtools.
- For each variant, identify the outermost container of the sheet. Note its computed width.
- Walk up the DOM until you find the rule (CSS or inline) that's setting a different width.
- Common suspects:
  - A grid column that auto-sizes based on content (`grid-template-columns: max-content 1fr` or similar).
  - A flex item with `flex: 1` that's getting pushed by a sibling with content-driven width.
  - A `max-width` on a container that's being conditionally applied.

### Step 3 — Find the rule

`Grep` for the suspicious rule. Likely files:
- `public/css/player-app.css`
- `public/css/admin-layout.css` (if shared)
- Sheet-specific CSS imported by player.html.

### Step 4 — Propose the fix

Once the cause is known, the fix is typically one of:
- Set an explicit `max-width` on the sheet container.
- Replace `max-content` grid columns with fixed `<value>fr` columns.
- Add `overflow: hidden` or `overflow-x: auto` to the offending container.

### Step 5 — Verify across multiple characters

Re-test on the same 5 characters from Step 1. Width should now match.

---

## Files Expected to Change

- One or more CSS files under `public/css/` — exact file determined by Step 3.
- Possibly `public/player.html` if the markup itself needs a wrapper added.
- Possibly the per-tab JS render if a component is producing variable-width output (less likely).

---

## Definition of Done

- All AC verified across at least 5 characters with diverse content lengths.
- The investigation findings (Steps 1-3 above) are recorded in completion notes — what the cause was, where the rule lived.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml`: `feat-6-player-sheet-width-consistency: needs-investigation → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- Independent of every other FEAT story.
- Could pair with any other player.html visual work (no hard requirement).

---

## References

- `specs/epic-features.md` — does not list FEAT-6; sourced from sprint-status comment.
- `specs/stories/sprint-status.yaml` line ~359 — original framing.
- `memory/feedback_player_desktop.md` — player.html is desktop-first; no max-width caps on tab panels (note: this memory is itself a hint that an *unintentional* max-width may be the symptom).
