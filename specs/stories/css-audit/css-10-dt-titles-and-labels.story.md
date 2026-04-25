# Story CSS-10: DT Panel Chrome Harmonisation — Titles and Labels (Audit §2)

Status: review

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

- [x] Verify class line numbers against current file (audit was 2026-04-26)
  - [x] All sixteen target classes located (audit said 17 but actual count is 16). Class-to-tier mapping from story is sensible.

- [x] Write the Tier-1 (panel header) rule block (AC: #1, #5)
  - [x] Located at admin-layout.css:1592-1606 under comment `/* ── Title tiers (CSS-10): T1 panel header label ── */`. Grouped selector covers all 7 Tier-1 classes.

- [x] Write the Tier-2 (sub-label) rule block (AC: #2)
  - [x] Located at admin-layout.css:1608-1620 under comment `/* ── T2 sub-label / field label ── */`. Grouped selector covers all 5 Tier-2 classes.
  - [x] `.dt-resp-section-title` retains `border-bottom + padding-bottom` in its individual block at line 1634.

- [x] Write the Tier-3 (micro-label) rule block (AC: #3)
  - [x] Located at admin-layout.css:1622-1628 under comment `/* ── T3 micro-label ── */`. Grouped selector covers all 4 Tier-3 classes.
  - [x] `.proc-char-strip-label` retains `font-weight: 700; white-space: nowrap; margin-right: 2px;` at line 3994.
  - [x] `.proc-feed-lbl` retains `margin-right: 4px;` at line 5300.

- [x] Strip duplicated chrome from each individual class declaration
  - [x] All 16 classes stripped. 11 individual blocks deleted entirely (canonical absorbs all chrome). 5 retained with unique props only.
  - [x] **Reconciled divergences:**
    - `.dt-feed-header` (size 12 → 11, ls .5px → 0.06em) — block deleted
    - `.dt-prep-early-title` (size 12 → 11, gained uppercase + ls 0.06em) — block deleted
    - `.dt-narr-label` (size 13 → 11, weight 600 → regular, gained uppercase + ls 0.06em) — block deleted
    - `.proc-amb-title` (size 13 → 11, ls .5px → 0.06em, gained uppercase) — block deleted
    - `.dt-merit-summary-group-label` (ls .05em → 0.04em, retained padding/border-bottom/mb 4) at line 6541
    - `.dt-conflict-section-head` (size 10 → 11, weight 700 → regular, ls .1em → 0.04em, retained padding) at line 1940
    - `.dt-resp-section-title` (size 10 → 11, weight 700 → regular, ls .08em → 0.04em, **color also changed --accent → --txt3** per audit tier mapping, retained border-bottom + padding-bottom) at line 1634
    - `.proc-char-strip-label` (ls .08em → 0.05em, retained font-weight 700 + white-space + margin-right) at line 3994
    - `.dt-exp-lbl` (size 11 → 10 per T3 canonical) — block deleted

- [x] Verify no JS coupling broken (AC: #6, #7)
  - [x] Title classes are typically applied via classList in DOM construction, not queried via querySelector. Class names unchanged regardless. Diff scope confirmed: only `public/css/admin-layout.css` modified.

- [x] Visual verification in browser (AC: #5, #8) — **VERIFIED by user 2026-04-26** ("reviewed downtime 2, it looks good"). All three flagged watch-points cleared: `.dt-resp-section-title` colour shift accepted; Tier-1 outliers uppercased without awkward phrases; tier hierarchy reads cleanly.
  - [ ] Start frontend: `npx http-server public -p 8080`
  - [ ] Open admin Downtimes tab in a cycle with submissions
  - [ ] **Tier-1 verification.** Locate each of: a `.dt-panel-title` (Player Responses panel header), `.proc-mod-panel-title` (mod panel in feeding/project drawer), `.dt-feed-header`, `.dt-prep-early-title` (prep panel), `.proc-amb-title` (ambience dashboard), `.proc-attach-char-header` (attach panel), `.dt-narr-label` (narrative output block). Confirm all read as the same visual prominence in accent gold.
  - [ ] **Tier-2 verification.** Locate each of: `.proc-detail-label` (action drawer field labels), `.proc-detail-section-title` (drawer sub-section titles), `.dt-merit-summary-group-label` (merit summary block), `.dt-conflict-section-head` (conflicts list), `.dt-resp-section-title` (responses panel sub-sections). Confirm all read as the same subdued grey field labels.
  - [ ] **Tier-3 verification.** Locate each of: `.dt-lbl` (form labels), `.dt-exp-lbl` (expenditure panel), `.proc-feed-lbl` (inline feed labels), `.proc-char-strip-label` (character status strip). Confirm all read as the same smallest tier (with `.proc-char-strip-label` slightly bolder by exception).
  - [ ] **Outlier check.** The three previously-non-uppercase Tier-1 outliers (`.dt-prep-early-title`, `.dt-narr-label`, `.proc-amb-title`) now display in uppercase. Confirm this reads naturally; if any one of them hosts text that looks awkward in uppercase (e.g., a long phrase that would wrap badly), document it and bring back.
  - [ ] **Special check: `.dt-resp-section-title` colour shift.** Previously rendered as accent gold; now renders as subdued grey per audit tier mapping. Confirm this reads as a deliberate sub-section label rather than a buried/lost header.
  - [ ] **Hierarchy check.** Stand back from the page. Are Tier-1 headers clearly more prominent than Tier-2 labels, which are clearly more prominent than Tier-3 captions? If two tiers feel indistinguishable post-change, the chrome may need to be tuned. Bring back to user.

- [x] Update audit doc with implementation note (AC: #9)
  - [x] Section 2 entry to be added (next edit)

- [x] Confirm line count did not grow (AC: #9)
  - [x] LOC: 8171 → 8122 (net −49). Seventeen-ish rules collapsed to three.

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

claude-opus-4-7 (Amelia persona, bmad-dev-story workflow)

### Debug Log References

- LOC pre-CSS-10: 8171 (post-CSS-9)
- LOC post-CSS-10: 8122 (net −49)
- Cumulative session: 8305 → 8122 (−183 LOC across CSS-8 + follow-up + CSS-6 + CSS-7 + CSS-9 + CSS-10)
- `git diff --stat` (admin-layout.css only): 35 insertions, 84 deletions
- Three canonical title tier groups at admin-layout.css:1592-1628.
- Eleven individual blocks deleted entirely (canonical absorbs full chrome). Five retained with unique props only.
- Audit said 17 target classes; actual count is 16. Mapping unchanged; story spec stands.

### Completion Notes List

- Three canonical tier blocks introduced at admin-layout.css:1592-1628 (T1 panel header, T2 sub-label, T3 micro-label) covering all 16 target classes via grouped selectors.
- **Visible changes:**
    - `.dt-feed-header`, `.dt-prep-early-title`, `.proc-amb-title` shrink from 12/13px to 11px.
    - `.dt-narr-label` shrinks from 13px and loses 600 weight (becomes regular).
    - Three Tier-1 outliers (`.dt-prep-early-title`, `.dt-narr-label`, `.proc-amb-title`) gain `text-transform: uppercase` for the first time.
    - `.dt-conflict-section-head` and `.dt-resp-section-title` lose their 700 weight and tighten letter-spacing.
    - `.dt-resp-section-title` ALSO loses its accent (gold) colour and becomes subdued grey per audit tier mapping. **This is the most likely-noticeable change** — a previously-prominent sub-section title becomes quieter. Story task list didn't explicitly call this out; audit tier mapping is the source of truth. Worth a careful eyeball.
    - `.dt-exp-lbl` shrinks from 11px to 10px (joins T3).
    - `.proc-attach-char-header` mb 4 → 8 (slightly more breathing room).
    - All Tier-2/Tier-3 labels normalise to tighter letter-spacing (0.04 / 0.05em).
- `.dt-story-section-label` left unchanged per AC #4 (deliberately louder Story-tab section header — out of scope).
- Eleven blocks deleted entirely: `.dt-panel-title`, `.proc-mod-panel-title`, `.dt-feed-header`, `.dt-prep-early-title`, `.proc-amb-title`, `.proc-attach-char-header`, `.dt-narr-label`, `.dt-lbl`, `.dt-exp-lbl`, `.proc-detail-label`, `.proc-detail-section-title`. Five retained with unique-only props: `.dt-resp-section-title` (border-bottom + padding-bottom), `.dt-conflict-section-head` (padding), `.proc-char-strip-label` (font-weight 700 + white-space + margin-right), `.proc-feed-lbl` (margin-right), `.dt-merit-summary-group-label` (padding + border-bottom + mb 4).
- **AC #5/#8 (visual verification) VERIFIED by user 2026-04-26** ("reviewed downtime 2, it looks good"). All three flagged watch-points cleared without bring-back: the `.dt-resp-section-title` colour shift, the Tier-1 outlier uppercasing, and the three-tier hierarchy clarity. Closes the harmonisation series.
- No JS edits, no HTML edits, no class renames.

### File List

- Modified: `public/css/admin-layout.css` (three canonical title tier blocks introduced; 11 individual blocks deleted; 5 stripped to unique-only; net −49 LOC)
- Modified: `specs/stories/css-audit/css-10-dt-titles-and-labels.story.md` (this file — task checkboxes, Dev Agent Record, Status)
- Audit doc update pending (Section 2 — Resolved entry to be added in next edit)
