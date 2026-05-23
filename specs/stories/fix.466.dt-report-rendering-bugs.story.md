---
issue: 466
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/466
branch: ms/issue-466-dt-report-rendering
status: review
date: 2026-05-22
---

# fix.466 — DT player report: ST notes heading, line breaks, feedback italic

## Story

As a player viewing my downtime report,
I want the ST notes to have a clear heading, paragraph breaks to render as distinct
paragraphs, and the ST's feedback note to appear in italic,
so that the report is readable and its sections are visually distinct.

## Background

Three rendering defects observed in Anichka's DT 3 player report, all in
`public/js/tabs/story-tab.js`:

1. **ST notes missing heading** — `player_facing_note` renders inside a `.proj-card-feedback`
   div after the project narrative section. The `proj-card-feedback-label` span ("ST Note") is
   styled at 10px in suite.css (`text-transform:none`, `color:var(--txt3)`) — effectively
   invisible on the parchment theme. No visual boundary separates the narrative prose from the
   ST note.

2. **Line breaks not rendering** — `_storyNarrSection` splits text on `/\n{2,}/` (two or more
   newlines). If the ST wrote single `\n` between paragraphs (one Enter, not two), all lines
   collapse into a single `<p>` wall of text. The same pattern appears in the inline section
   loop in `renderOutcomeWithCards` and in the legacy `renderStoryMoment` paths.

3. **Player feedback not italicised** — The note text after the label is rendered as
   `${esc(note)}` (plain escaped text) with no `<em>` wrapper.

## Acceptance Criteria

- [ ] AC1: A visible "ST Note" heading (styled like a section label, not hidden small text)
  appears before the `player_facing_note` text in the project card, clearly separated from the
  project narrative above it.
- [ ] AC2: Single `\n` line breaks in narrative text (story moment, project outcome sections)
  render as distinct `<p>` elements — "A dream" and the paragraph below it appear as two blocks,
  not one wall.
- [ ] AC3: `player_facing_note` text is rendered in italic.
- [ ] AC4: No regression — existing reports with `\n\n` paragraph breaks still render correctly;
  legacy `letter_from_home` / `touchstone` paths are unaffected.

---

## Dev Notes

### Files to modify

| File | Change |
|------|--------|
| `public/js/tabs/story-tab.js` | Bug 2: split fix in `_storyNarrSection`; Bug 3+1: label + italic in proj-card-feedback HTML |
| `public/css/components.css` | Bug 1: restyle `.proj-card-feedback-label` |
| `public/css/suite.css` | Bug 1: restyle `.proj-card-feedback-label` override |

Do NOT touch: `parseOutcomeSections`, `renderStoryMoment`, `renderHomeReportSection`,
`renderFlagAffordance`, or anything else. All three bugs are contained to the lines below.

---

### Bug 2 fix — line-break split (story-tab.js)

**Current pattern (appears in four places):**
```js
const paras = text.trim().split(/\n{2,}/).filter(Boolean);
h += paras.map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('');
```

**Replacement (same four places):**
```js
const paras = text.trim().split(/\n/).filter(Boolean);
h += paras.map(p => `<p>${esc(p)}</p>`).join('');
```

**Why this is safe:** `filter(Boolean)` removes empty strings, so `\n\n` (double newline)
produces an empty string between the two splits which is filtered out. Both `\n\n`- and
`\n`-separated content produce the same result: one `<p>` per non-empty line. The
`p.replace(/\n/g, ' ')` is redundant after splitting on `/\n/` (no `\n` remain in `p`), so
remove it.

**The five locations to update (DT narrative paths only):**

| Line | Function | String to find |
|------|----------|----------------|
| 226 | `_storyNarrSection` | `text.trim().split(/\n{2,}/)` |
| 303 | `renderStoryMoment` (legacy touchstone path) | `touchstone.trim().split(/\n{2,}/)` |
| 308 | `renderStoryMoment` (legacy letter path) | `letter.trim().split(/\n{2,}/)` |
| 480 | `renderOutcomeWithCards` section loop body | `body.split(/\n{2,}/)` |
| 492 | `renderOutcomeWithCards` headingless section | `body.split(/\n{2,}/)` |

Use `grep -n 'split.*\\\\n{2,}' public/js/tabs/story-tab.js` to find them — you will see SIX
results. The sixth at line 846 is in the character doc-history renderer (unrelated to DT reports)
— leave it unchanged for this story.

---

### Bug 1 + Bug 3 fix — proj-card-feedback HTML (story-tab.js:427)

**Current (line 427):**
```js
if (note) cardHtml += `<div class="proj-card-feedback"><span class="proj-card-feedback-label">ST Note</span>${esc(note)}</div>`;
```

**Replacement:**
```js
if (note) cardHtml += `<div class="proj-card-feedback"><h4 class="proj-card-feedback-label">ST Note</h4><em>${esc(note)}</em></div>`;
```

Changes: `<span>` → `<h4>` for semantic heading weight; `${esc(note)}` → `<em>${esc(note)}</em>` for italic.

---

### Bug 1 fix — CSS restyling (components.css + suite.css)

**components.css** — current `.proj-card-feedback-label` block (around line 4459):
```css
.proj-card-feedback-label {
  font-family: var(--fl);
  font-size: 10px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  display: block;
  margin-bottom: 3px;
  color: var(--txt3);
}
```
Update to:
```css
.proj-card-feedback-label {
  font-family: var(--fl);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  display: block;
  margin: 0 0 6px;
  color: var(--txt2);
  font-weight: normal;
}
```
Key changes: `color: var(--txt2)` (more visible than `--txt3`), `margin` reset to prevent h4 browser defaults pushing layout, `font-weight: normal` (h4 defaults to bold, which we don't want here).

**suite.css** — current `.proj-card-feedback-label` override (line 762):
```css
.proj-card-feedback-label{font-family:var(--fl);font-size:10px;font-style:italic;letter-spacing:.04em;text-transform:none;display:block;margin-bottom:4px;color:var(--txt3);}
```
Update to:
```css
.proj-card-feedback-label{font-family:var(--fl);font-size:11px;letter-spacing:.06em;text-transform:uppercase;display:block;margin:0 0 6px;color:var(--txt2);font-weight:normal;}
```
Key changes: remove `font-style:italic` (the `<em>` on the note body handles italic now); change `text-transform:none` → `uppercase`; change `color:var(--txt3)` → `var(--txt2)`; reset margin.

---

### What NOT to do

- Do NOT change `parseOutcomeSections` — the split fix is in the render layer, not the parser.
- Do NOT add a new CSS class — reuse `.proj-card-feedback-label` on the `<h4>`.
- Do NOT apply the split fix to `renderRumoursSection` — it renders lists, not paragraphs.
- Do NOT add `font-weight: bold` to the label — it should look like a label, not a full heading.
- Do NOT modify the `published_outcome` assembly in `downtime-views.js` — it is not involved in these bugs.

---

### Parse check (required)

After all edits:
```
node --check --input-type=module < public/js/tabs/story-tab.js
```
Must exit 0.

---

## Tasks / Subtasks

- [x] T1: Fix line-break split in all five occurrences in `story-tab.js`
  - [x] Line 226 — `_storyNarrSection`
  - [x] Line 303 — `renderStoryMoment` touchstone path
  - [x] Line 308 — `renderStoryMoment` letter path
  - [x] Line 480 — `renderOutcomeWithCards` section body
  - [x] Line 492 — `renderOutcomeWithCards` headingless section
- [x] T2: Update `proj-card-feedback` HTML at line 427 — `<span>` → `<h4>`, add `<em>` around note text
- [x] T3: Update `.proj-card-feedback-label` CSS in `components.css` (line ~4459)
- [x] T4: Update `.proj-card-feedback-label` CSS in `suite.css` (line ~762)
- [x] T5: Parse check: `node --check --input-type=module < public/js/tabs/story-tab.js`

---

## Testing Approach

No automated tests are needed for this story — all three bugs are rendering-only changes in
well-isolated code paths. Verify manually:

1. Open the player portal (player.html) → Story tab → Anichka's DT 3 report.
2. Confirm STORY MOMENT shows paragraph breaks between "A dream" and the long paragraph.
3. Confirm the last project section's proj-card shows "ST NOTE" as a visible label above the
   italic note text.
4. Confirm no visual regression in earlier DTs (DT1/DT2) — story moment, home report, feeding
   sections should look the same as before.

If local dev is not available, the parse check (T5) is the minimum gate.

---

## File List

- `public/js/tabs/story-tab.js` — UPDATE (5× split fix + 1× proj-card HTML)
- `public/css/components.css` — UPDATE (`.proj-card-feedback-label` restyle)
- `public/css/suite.css` — UPDATE (`.proj-card-feedback-label` override restyle)

---

## Dev Agent Record

### Completion Notes

T1: Changed `split(/\n{2,}/)` → `split(/\n/)` and removed `p.replace(/\n/g, ' ')` at all five DT
narrative render sites in `story-tab.js` (lines 226, 303, 308, 480, 492). Line 846 (doc-history
renderer) left unchanged per story scope. Single and double newlines now both produce distinct `<p>`
elements via `filter(Boolean)`.

T2: Changed `proj-card-feedback` HTML at line 427 — `<span>` → `<h4>` on the label, `${esc(note)}`
→ `<em>${esc(note)}</em>` on the note text. Handles Bug 1 (visible heading) and Bug 3 (italic) in
one line.

T3+T4: Updated `.proj-card-feedback-label` in both `components.css` and `suite.css` — bumped to
11px, removed `font-style:italic` (now on the `<em>`), changed `text-transform:none` → `uppercase`
in suite.css, changed `color:var(--txt3)` → `var(--txt2)` for visibility, added `font-weight:normal`
to suppress h4 browser bold default, reset margin to 0 0 6px.

Parse check: exit 0.

### Change Log

- fix(#466): story-tab.js — split single newlines as paragraph breaks across all 5 DT render sites (2026-05-22)
- fix(#466): story-tab.js — proj-card-feedback label promoted to h4, note wrapped in em (2026-05-22)
- fix(#466): components.css + suite.css — proj-card-feedback-label visible heading style (2026-05-22)
