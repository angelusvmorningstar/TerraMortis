---
title: "Remove Step 0 (Pre-read) from DT Processing"
issue: 284
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/284
branch: morningstar-issue-284-remove-step0-preread
status: review
type: tech-debt
---

## Story

As an ST using the DT Processing panel, I want Step 0 (Pre-read) removed so I can reach the actual processing steps without scrolling past redundant UI that DT Prep already handles.

## Background

Step 0 was built in DT Processing Epic 1 (Stories 1.1 + 1.2) to surface player questionnaire responses before processing. DT Prep (issue #231) now handles that pre-game read-through, making Step 0 dead UI. Removing it cleans up the panel and the supporting state.

## Acceptance criteria

- [x] "Step 0 — Pre-read" section no longer renders in DT Processing
- [x] `renderPreReadSection()` call removed from the render path
- [x] `preReadExpanded` Set and its supporting click handler cleaned up
- [x] Lore responded handler (`.proc-lore-btn`) removed (it only exists inside the pre-read section)
- [x] Steps 1–11 in DT Processing are unaffected and continue to function
- [x] No orphaned CSS classes remain for pre-read-exclusive styles

---

## Dev notes

### Files changed

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | Remove constants, function, call site, and event handlers |
| `public/css/admin-layout.css` | Remove three pre-read-exclusive CSS rules |

---

### Critical: shared CSS classes — do NOT remove

`.proc-preread-char` and `.proc-preread-body` are **shared** across four sections. Removing them would break sign-off, XP review, and narrative panels.

Confirmed shared usage in `downtime-views.js`:
- Sign-off (Step 11): `proc-preread-char` at line 3989, `proc-preread-body` at line 3995 — keyed by `data-signoff-id`
- XP Review (Step 10): `proc-preread-char` at line 4215, `proc-preread-body` at line 4222 — keyed by `data-xp-review-id`
- Narrative: `proc-preread-char` at line 4283, `proc-preread-body` at line 4289 — keyed by `data-narrative-id`

**Do not touch these CSS rules in `admin-layout.css`:**
- `.proc-preread-char` (line 4160)
- `.proc-preread-char:hover` (line 4169)
- `.proc-preread-char.expanded` (line 4170)
- `.proc-preread-body` (line 4191)
- `.proc-preread-body .dt-narr-detail` (line 4253–4254)

---

### JS removals — `downtime-views.js`

#### 1. `preReadExpanded` Set declaration (line 46)

Remove this line:
```js
const preReadExpanded = new Set();   // subIds with pre-read body expanded in processing mode
```

#### 2. `COURT_KEYS` and `COURT_LABELS` constants (lines 3843–3848)

Remove the entire block:
```
// ── Pre-read Panel (Epic 1 — Story 1.1 + 1.2) ────────────────────────────────

const COURT_KEYS = ['travel', 'game_recount', 'rp_shoutout', 'correspondence'];
const COURT_LABELS = {
  travel: 'Travel', game_recount: 'Game Recount', rp_shoutout: 'Shoutout',
  correspondence: 'Dear X',
};
```

These are only used inside `renderPreReadSection()`.

#### 3. `renderPreReadSection()` function (lines 3851–3943)

Remove the entire function — from `function renderPreReadSection() {` through its closing `}`.

The function definition can be deleted outright; no other caller exists.

#### 4. Call site (lines 4503–4504)

Remove these two lines from the render path:
```js
  // Pre-read — Step 0, player questionnaire responses
  h += renderPreReadSection();
```

The surrounding code at lines 4500–4506 (character strip call and the phase loop) must be left intact.

#### 5. Pre-read click handler block (lines 5799–5807)

Remove the entire block:
```js
  // Wire pre-read character block toggles
  container.querySelectorAll('.proc-preread-char').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.prereadId;
      if (preReadExpanded.has(id)) preReadExpanded.delete(id);
      else preReadExpanded.add(id);
      renderProcessingMode(container);
    });
  });
```

**Why safe to remove:** This selector currently fires on ALL `.proc-preread-char` elements including sign-off, XP review, and narrative rows (which share the class). For those rows it reads `el.dataset.prereadId` as `undefined` and causes a spurious re-render. Removing the block has no negative effect on other sections — XP review has its own dedicated `[data-xp-review-id]` handler (line 5830); sign-off and narrative row expansion is a pre-existing unrelated issue, out of scope here.

#### 6. Lore responded handler block (lines 5809–5827)

Remove the entire block:
```js
  // Wire lore responded button — update in-place without full re-render
  container.querySelectorAll('.proc-lore-btn').forEach(btn => {
    el.addEventListener('click', async e => {
      ...
    });
  });
```

`.proc-lore-btn` elements are only generated inside `renderPreReadSection()`. After that function is removed, no such elements will exist in the DOM. This handler becomes unreachable dead code.

---

### CSS removals — `admin-layout.css`

These three rules are **pre-read-section exclusive** (used only inside `renderPreReadSection()` output):

| Rule | Line | Why safe to remove |
|------|------|--------------------|
| `.proc-preread-char-right` | ~4171 | Only emitted in pre-read char header rows (the right-side slot holding the lore badge + toggle arrow). Not used by sign-off, XP review, or narrative. |
| `.proc-preread-lore-badge` | ~4178 | Only used inside pre-read char rows for the "Lore ?" badge. |
| `.proc-lore-btn.active` | ~4197 | Only applies to the lore "Mark responded" button. |

Grep confirms none of these appear anywhere else in JS or CSS.

---

## Dev agent record

### Files changed

- `public/js/admin/downtime-views.js` — removed `preReadExpanded` Set (line 46), `COURT_KEYS`/`COURT_LABELS` constants, `renderPreReadSection()` function (~100 lines), call site + comment (2 lines), pre-read click handler block (9 lines), lore responded handler block (19 lines)
- `public/css/admin-layout.css` — removed `.proc-preread-char-right`, `.proc-preread-lore-badge`, `.proc-lore-btn.active` rules; updated section comment from "Pre-read panel (Step 0)" to "Shared submission-row styles"

### Completion notes

All six targeted removals applied. `.proc-preread-char` and `.proc-preread-body` CSS classes intentionally preserved — they are shared with sign-off (Step 11), XP review (Step 10), and narrative panels. Brace balance confirmed clean (3733/3733). No test framework; verify in-browser per checklist below.

---

### Verification checklist

After implementing, confirm in-browser:
1. DT Processing panel opens with no "Step 0 — Pre-read" section visible
2. Steps 1 through 11 render and expand/collapse as normal
3. Sign-off (Step 11) character rows still render correctly (same visual, since `.proc-preread-char` CSS is preserved)
4. XP Review (Step 10) character rows still expand/collapse correctly (their own `[data-xp-review-id]` handler is untouched)
5. No console errors on open or interaction
6. `.proc-lore-btn` handler removal: no console error about undefined (it simply no longer fires since no such buttons exist)
