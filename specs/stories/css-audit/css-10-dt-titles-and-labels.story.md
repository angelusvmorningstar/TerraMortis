# Story CSS-10: DT Panel Chrome Harmonisation — Titles and Labels (Audit §2)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an ST scanning the Downtimes tab,
I want every section title, sub-label, and micro-caption to use one of three consistent text styles (instead of seventeen slightly-different declarations),
so that the visual hierarchy is obvious and the page stops feeling like a patchwork of label conventions from different epics.

## Background

Audit doc: `specs/audits/downtime-ui-audit-2026-04-26.md` §2 and §4B. The audit identified **seventeen distinct title/label class declarations** covering what is essentially three visual roles. Sizes drift across 10 / 11 / 12 / 13 px; weight across regular and 700; letter-spacing across .04, .05, .06, .07, .08em, .1em, and .5px; colour split between `--accent` and `--txt3` with no principled rule.

The three visual tiers proposed (audit §4B):

**Tier 1 — Panel header label** (the title above a panel, prominent):
- `font-family: var(--fl); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); margin-bottom: 8px;`
- Based on `.dt-panel-title` (1563) and `.proc-mod-panel-title` (5549)

**Tier 2 — Sub-label / field label** (subdued, beside or above a field, less prominent):
- `font-family: var(--fl); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--txt3); margin-bottom: 6px;`
- Based on `.proc-detail-label` (4580) and `.proc-detail-section-title` (5182)

**Tier 3 — Micro-label** (smallest, captions above strips/groups):
- `font-family: var(--fl); font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--txt3);`
- Based on `.proc-feed-lbl` (5398)

Class-to-tier mapping (proposed; subject to per-class verification during implementation):

| Tier | Classes |
|------|---------|
| 1 — Panel header (accent) | `.dt-panel-title`, `.proc-mod-panel-title`, `.dt-feed-header`, `.dt-prep-early-title`, `.proc-amb-title`, `.proc-attach-char-header`, `.dt-narr-label` |
| 2 — Sub-label (subdued) | `.proc-detail-label`, `.proc-detail-section-title`, `.dt-merit-summary-group-label`, `.dt-conflict-section-head`, `.dt-resp-section-title` |
| 3 — Micro-label (smallest) | `.dt-lbl`, `.dt-exp-lbl`, `.proc-feed-lbl`, `.proc-char-strip-label` |
| Special — keep distinct | `.dt-story-section-label` (700 weight, 12px, `--txt` colour: it's a section header on the Story tab, not a panel header — it's louder by design) |

Approach: same as CSS-6 through CSS-9 — pure CSS, grouped selector rewrite, no JS edits, no class renames.

**Why this story is more delicate than CSS-6/7/8/9:** the visual differences between tiers are subtle (a 1px size drop and a 0.02em letter-spacing change). Browser visual verification must be careful. The risk is collapsing two genuinely-different roles into one tier and erasing intended hierarchy — particularly with the three non-uppercase outliers (`.dt-prep-early-title`, `.dt-narr-label`, `.proc-amb-title`) which the audit flagged as breaking convention without clear reason. The proposed mapping puts them in tier 1 (uppercase). Verify in browser that they read correctly when uppercased; if not, raise as a question and decide per-class.

## Acceptance Criteria

1. **Given** the seven Tier-1 classes (`.dt-panel-title`, `.proc-mod-panel-title`, `.dt-feed-header`, `.dt-prep-early-title`, `.proc-amb-title`, `.proc-attach-char-header`, `.dt-narr-label`) **When** rendered **Then** each has the Tier-1 chrome from a single shared rule block, and divergent properties (size differences, letter-spacing differences, the missing uppercase on the three outliers) are reconciled to the canonical Tier-1.
2. **Given** the five Tier-2 classes (`.proc-detail-label`, `.proc-detail-section-title`, `.dt-merit-summary-group-label`, `.dt-conflict-section-head`, `.dt-resp-section-title`) **When** rendered **Then** each has the Tier-2 chrome from a single shared rule block. The `.dt-resp-section-title` border-bottom retains its border separator (it's a unique bottom-rule pattern, not a chrome conflict).
3. **Given** the four Tier-3 classes (`.dt-lbl`, `.dt-exp-lbl`, `.proc-feed-lbl`, `.proc-char-strip-label`) **When** rendered **Then** each has the Tier-3 chrome from a single shared rule block. `.proc-char-strip-label` retains its bold weight as a documented exception (it's a strip header, marginally louder than micro-labels — see Dev Notes).
4. **Given** `.dt-story-section-label` **When** rendered **Then** it stays unchanged (it's a Story-tab section header, deliberately louder than panel-tier labels; not part of this harmonisation).
5. **Given** the three previously-non-uppercase classes (`.dt-prep-early-title`, `.dt-narr-label`, `.proc-amb-title`) **When** rendered after the change **Then** they display in uppercase. If browser verification (AC #8) shows the uppercase reads poorly for any of them, the per-class deviation is captured in Completion Notes and brought back to the user before completing the story.
6. **Given** the implementation diff **When** inspected **Then** no `.js` file is modified, no `.html` file is modified, and no class name is renamed or removed.
7. **Given** any JS file that previously referenced one of the target class names **When** searched **Then** every reference still finds its element.
8. **Given** the admin app open on the Downtimes tab **When** an ST visually scans the page top-to-bottom **Then** title hierarchy is consistent: Tier-1 headers stand out as panel titles in accent gold; Tier-2 sub-labels read as subdued field labels in grey; Tier-3 micro-captions read as smallest strip labels in grey. No two adjacent labels of the same role render at different sizes or letter-spacings.
9. **Given** `public/css/admin-layout.css` after the change **When** measured **Then** the file has the same or fewer total lines than before.

## Tasks / Subtasks

- [ ] Verify class line numbers against current file (audit was 2026-04-26)
  - [ ] All seventeen target classes still exist at audit-cited locations
  - [ ] Class-to-tier mapping (above) still seems sensible after reading the live rule bodies; if any class has changed since the audit, re-tier or surface as a question

- [ ] Write the Tier-1 (panel header) rule block (AC: #1, #5)
  - [ ] Suggested location: at the top of admin-layout.css's downtime section (around line 1555, near `.dt-panel-title`'s current home), under comment `/* ── Title tiers (CSS-10): T1 panel header label ── */`
  - [ ] Grouped selector covering all seven Tier-1 classes:
    ```
    .dt-panel-title,
    .proc-mod-panel-title,
    .dt-feed-header,
    .dt-prep-early-title,
    .proc-amb-title,
    .proc-attach-char-header,
    .dt-narr-label {
      font-family: var(--fl);
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 8px;
    }
    ```

- [ ] Write the Tier-2 (sub-label) rule block (AC: #2)
  - [ ] Suggested location: directly under Tier-1 block, comment `/* ── T2 sub-label / field label ── */`
  - [ ] Grouped selector covering the five Tier-2 classes with the Tier-2 chrome above
  - [ ] `.dt-resp-section-title` retains its `border-bottom: 1px solid var(--bdr); padding-bottom: 3px;` in its individual block (not a chrome conflict — it's a unique sub-header decoration)

- [ ] Write the Tier-3 (micro-label) rule block (AC: #3)
  - [ ] Suggested location: directly under Tier-2 block, comment `/* ── T3 micro-label ── */`
  - [ ] Grouped selector covering the four Tier-3 classes with the Tier-3 chrome above
  - [ ] `.proc-char-strip-label` retains its `font-weight: 700` in its individual block (documented exception: strip header, marginally louder)
  - [ ] `.proc-feed-lbl` retains its `margin-right: 4px` (unique to inline labels that sit beside a value)

- [ ] Strip duplicated chrome from each individual class declaration
  - [ ] For each of the seventeen classes, remove the now-shared properties (font-family, font-size, letter-spacing, text-transform, color, margin-bottom where applicable)
  - [ ] Keep any unique-to-class properties (border-bottom on resp-section-title, font-weight 700 on char-strip-label, etc.)
  - [ ] **Specifically reconcile divergences:**
    - `.dt-feed-header` (size 12 → 11, ls .5px → 0.06em)
    - `.dt-prep-early-title` (size 12 → 11, add `text-transform: uppercase`, add `letter-spacing: 0.06em`)
    - `.dt-narr-label` (size 13 → 11, weight 600 → regular, add `text-transform: uppercase`, add `letter-spacing: 0.06em`, add `color: var(--accent)` — same)
    - `.proc-amb-title` (size 13 → 11, ls .5px → 0.06em, add `text-transform: uppercase`)
    - `.dt-merit-summary-group-label` (size 11 OK, ls .05em → 0.04em, retains its border-bottom and special padding)
    - `.dt-conflict-section-head` (size 10 → 11, weight 700 → regular, ls .1em → 0.04em — significant change; verify in browser)
    - `.dt-resp-section-title` (size 10 → 11, weight 700 → regular, ls .08em → 0.04em — significant change; verify in browser. Border-bottom retained.)

- [ ] Verify no JS coupling broken (AC: #6, #7)
  - [ ] Use Grep tool against `public/js/` for the seventeen class names
  - [ ] Title classes are usually applied via classList only, not selected on, but verify
  - [ ] Confirm `git diff --stat` shows only `public/css/admin-layout.css` modified (and optionally the audit doc)

- [ ] Visual verification in browser (AC: #5, #8)
  - [ ] Start frontend: `npx http-server public -p 8080`
  - [ ] Open admin Downtimes tab in a cycle with submissions
  - [ ] **Tier-1 verification.** Locate each of: a `.dt-panel-title` (Player Responses panel header), `.proc-mod-panel-title` (mod panel in feeding/project drawer), `.dt-feed-header`, `.dt-prep-early-title` (prep panel), `.proc-amb-title` (ambience dashboard), `.proc-attach-char-header` (attach panel), `.dt-narr-label` (narrative output block). Confirm all read as the same visual prominence in accent gold.
  - [ ] **Tier-2 verification.** Locate each of: `.proc-detail-label` (action drawer field labels), `.proc-detail-section-title` (drawer sub-section titles), `.dt-merit-summary-group-label` (merit summary block), `.dt-conflict-section-head` (conflicts list), `.dt-resp-section-title` (responses panel sub-sections). Confirm all read as the same subdued grey field labels.
  - [ ] **Tier-3 verification.** Locate each of: `.dt-lbl` (form labels), `.dt-exp-lbl` (expenditure panel), `.proc-feed-lbl` (inline feed labels), `.proc-char-strip-label` (character status strip). Confirm all read as the same smallest tier (with `.proc-char-strip-label` slightly bolder by exception).
  - [ ] **Outlier check.** The three previously-non-uppercase Tier-1 outliers (`.dt-prep-early-title`, `.dt-narr-label`, `.proc-amb-title`) now display in uppercase. Confirm this reads naturally; if any one of them hosts text that looks awkward in uppercase (e.g., a long phrase that would wrap badly), document it and bring back.
  - [ ] **Hierarchy check.** Stand back from the page. Are Tier-1 headers clearly more prominent than Tier-2 labels, which are clearly more prominent than Tier-3 captions? If two tiers feel indistinguishable post-change, the chrome may need to be tuned. Bring back to user.

- [ ] Update audit doc with implementation note (AC: #9)
  - [ ] Add `### Section 2 — Resolved` line at the bottom of audit §3 referencing this story key and date
  - [ ] Document any per-class deviations granted during implementation (e.g., if one outlier had to keep its non-uppercase form)

- [ ] Confirm line count did not grow (AC: #9)
  - [ ] Before/after LOC of `public/css/admin-layout.css` recorded in Dev Agent Record. Expected: net negative due to seventeen rules collapsing to three.

## Dev Notes

**Single file in scope:** `public/css/admin-layout.css`.

**Hard constraint:** No JS edits, no markup edits, no class renames. Same as CSS-6 through CSS-9.

**Visible behaviour change.** This story changes the *appearance* of many small text labels on the Downtimes tab — that is intentional (the harmonisation is the point), but it means the result needs more visual review than CSS-8 (which was a no-op visual change) or CSS-7 (which had one tier promotion). Specifically:
- `.dt-feed-header`, `.dt-prep-early-title`, `.proc-amb-title` shrink from 12/13px to 11px
- `.dt-narr-label` shrinks from 13px and loses 600 weight (becomes regular)
- Three Tier-1 outliers gain `text-transform: uppercase`
- `.dt-conflict-section-head` and `.dt-resp-section-title` lose their 700 weight and tighten letter-spacing
- All Tier-2/Tier-3 labels normalise to tighter letter-spacing (0.04 / 0.05em)

**Story-tab `.dt-story-section-label` is OUT of scope** (AC #4). It's deliberately louder (12px / 700 / `--txt`) because it heads a major Story-tab section, not a panel. Leaving it alone preserves the intended visual hierarchy on the Story tab.

**Order vs other CSS stories:** CSS-10 is independent of CSS-6/7/8/9. No target-class overlap. Land in any order. Recommended landing order from earlier discussion is CSS-6 → CSS-7 → CSS-8 → CSS-9 → CSS-10 (panels first, then titles), because title harmonisation is easier to assess once the panel chrome around them is settled.

**Risk: erasing intended hierarchy.** The mapping above is the audit's best-effort tier assignment. Some classes might genuinely need to stay distinct (e.g., if `.dt-conflict-section-head` is meant to be louder than a normal sub-label because conflicts demand attention). AC #5 and AC #8 explicitly require bringing back any case where the harmonised result looks worse than what was there.

**Token discipline:** Only `--accent`, `--txt3`, `--fl` referenced. All defined.

**British English in any new comments.** Default to no comments.

### Project Structure Notes

- All work in `public/css/admin-layout.css`. No file moves, no new files.

### References

- [Source: specs/audits/downtime-ui-audit-2026-04-26.md] — Sections 2A, 2B, 4B
- [Source: public/css/admin-layout.css:1563-6727] — affected lines (titles span widely)
- [Source: public/css/theme.css] — `--accent`, `--txt3`, `--fl`
- [Source: CLAUDE.md] — branch policy, no em-dashes, British English
- Memory: `reference_css_token_system` — token discipline
- Memory: `reference_typography_system` — font stack and hierarchy decisions

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
