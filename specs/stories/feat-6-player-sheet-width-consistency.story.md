---
id: feat.6
epic: feat
status: needs-investigation
priority: low
depends_on: []
---

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
