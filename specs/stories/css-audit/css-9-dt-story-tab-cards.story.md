# Story CSS-9: DT Panel Chrome Harmonisation — Story-Tab Cards (Bucket 1D)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an ST drafting per-action player narratives in the Story tab,
I want every card surface in the Story tab (section wrappers, project cards, merit cards, resources cards, context blocks, sign-off panel) to share consistent chrome,
so that the Story tab reads as one designed surface rather than a stack of cards with three different radii and two different border tokens.

## Background

Audit doc: `specs/audits/downtime-ui-audit-2026-04-26.md` §1D. Seven story-tab card classes use **three different border radii** (4 / 5 / 6 px) and **two different border tokens** (`--bdr` / `--bdr2`) for what reads as the same visual tier.

Targets:
- `.dt-story-section` (6675) — outer section wrapper, radius 6, border `--bdr`, bg `--surf`
- `.dt-story-proj-card` (6818) — project card inside section, radius **5**, border `--bdr`, bg `--surf2`
- `.dt-story-merit-card` (7113) — merit card, radius **4**, border `--bdr2`, bg `--surf`
- `.dt-story-resources-card` (7159) — resources card, radius **4**, border `--bdr2`, bg `--surf`
- `.dt-story-context-block` (6883) — context display block, radius 4, border `--bdr`, bg `--surf`
- `.dt-story-sign-off` (6752) — sign-off panel, radius 6, border `--bdr`, bg `--surf2`
- `.dt-feeding-locked` (6603) — single-line feeding lock notice, radius 4, border `--bdr2` + accent stripe, bg `--surf`

User confirmed in pre-work conversation: visual variants are **not intentional**. The merit card and resources card are visually identical and were built independently. The radius and border-token drift is incidental.

Approach: same as CSS-6, CSS-7, CSS-8 — pure CSS, grouped selector rewrite, no JS edits, no class renames.

**Two visual tiers within the Story tab,** based on user-confirmed structural distinction:
- **Tier 1 — Section wrapper.** `.dt-story-section` is the outer collapsible container that wraps a major story area. It already matches the CSS-7 outer-panel pattern and should keep that chrome (radius 6, border `--bdr`, `overflow: hidden`).
- **Tier 2 — Inner cards.** `.dt-story-proj-card`, `.dt-story-merit-card`, `.dt-story-resources-card`, `.dt-story-context-block`, `.dt-story-sign-off` all read as cards inside a section. They should share one chrome.
- **Tier 3 — Inline notice.** `.dt-feeding-locked` is a single-line inline notice with an accent stripe. Treat it as a stripe-accent variant of the inner-card chrome, parallel to the CSS-6 stripe variants.

Canonical inner-card chrome (chosen by alignment with CSS-6's canonical for inline panels): `background: var(--surf2); border: 1px solid var(--bdr); border-radius: 6px;` with padding kept per-class because the cards have different content density (a project card breathes more than a sign-off bar).

## Acceptance Criteria

1. **Given** `.dt-story-section` **When** rendered **Then** it adopts the CSS-7 canonical outer-panel chrome (`border: 1px solid var(--bdr); border-radius: 6px; overflow: hidden;`). If CSS-7 has already shipped, this story confirms `.dt-story-section` is included in the CSS-7 grouped selector. If CSS-7 has not shipped, this story handles `.dt-story-section` directly.
2. **Given** the five inner-card classes (`.dt-story-proj-card`, `.dt-story-merit-card`, `.dt-story-resources-card`, `.dt-story-context-block`, `.dt-story-sign-off`) **When** rendered **Then** each has the canonical inner-card chrome from a single shared rule block: `background: var(--surf2); border: 1px solid var(--bdr); border-radius: 6px;`. Padding stays per-class. The radius drift (4 / 5 / 6) collapses to 6. The border-token drift (`--bdr` vs `--bdr2`) collapses to `--bdr`. The background drift (`--surf` vs `--surf2`) collapses to `--surf2`.
3. **Given** `.dt-feeding-locked` **When** rendered **Then** it sits on the inner-card canonical chrome and adds only its `border-left: 3px solid var(--gold2)`. The 14/16 padding stays as-is (it's a one-line notice with extra breathing room).
4. **Given** completion-state modifiers (`.dt-story-proj-card.complete`, `.dt-story-merit-card.complete`, `.dt-story-resources-card.complete` etc.) **When** rendered **Then** their existing `border-color` overrides (e.g., `var(--story-compl-a40)`, `var(--gold2)`) still apply correctly on top of the canonical chrome.
5. **Given** revision-state modifiers (`.dt-story-proj-card.revision`, `.dt-story-merit-card.revision`, `.dt-story-cs-slot.revision`) **When** rendered **Then** their existing `border-color: rgba(139,0,0,0.3)` override still applies.
6. **Given** the implementation diff **When** inspected **Then** no `.js` file is modified, no `.html` file is modified, and no class name is renamed or removed.
7. **Given** the admin app open on the Story sub-tab inside Downtimes **When** an ST views a character's story sections (Letter from Home, Touchstone, Territory Reports, Merits, Resources, Project cards, Sign-off panel) **Then** every card reads as visually consistent in radius and border weight; the previous radius drift is no longer visible.
8. **Given** `public/css/admin-layout.css` after the change **When** measured **Then** the file has the same or fewer total lines than before.

## Tasks / Subtasks

- [ ] Verify line numbers against current file (audit was 2026-04-26)
  - [ ] Confirm all seven target classes still exist at the audit-cited locations
  - [ ] Confirm no new story-tab card class has been added since the audit (if so, add it to the appropriate tier)

- [ ] Decide handling for `.dt-story-section` based on CSS-7 status (AC: #1)
  - [ ] If CSS-7 has shipped: add `.dt-story-section` to the CSS-7 outer-panel grouped selector and remove its individual chrome declarations. Update CSS-7's class list comment if present.
  - [ ] If CSS-7 has not shipped: handle `.dt-story-section` in this story by writing its canonical chrome inline (same shape as the CSS-7 canonical), with a comment noting it should be merged into the CSS-7 group when that story lands.

- [ ] Write the canonical inner-card rule block (AC: #2)
  - [ ] Suggested location: just before `.dt-story-proj-card` (around line 6817), under comment `/* ── Story-tab inner cards: canonical chrome (CSS-9) ── */`
  - [ ] Grouped selector covering the five inner-card classes:
    ```
    .dt-story-proj-card,
    .dt-story-merit-card,
    .dt-story-resources-card,
    .dt-story-context-block,
    .dt-story-sign-off {
      background: var(--surf2);
      border: 1px solid var(--bdr);
      border-radius: 6px;
    }
    ```

- [ ] Strip duplicated chrome from each inner-card class (AC: #2)
  - [ ] `.dt-story-proj-card` (6818) — remove background, border, border-radius. Keep `margin-bottom: 10px; padding: 10px 12px;`
  - [ ] `.dt-story-merit-card` (7113) — remove background, border, border-radius (radius drifts from 4 to 6, border token from `--bdr2` to `--bdr`, bg from `--surf` to `--surf2`). Keep `margin-bottom: 10px; padding: 8px 10px;`
  - [ ] `.dt-story-resources-card` (7159) — same as merit card
  - [ ] `.dt-story-context-block` (6883) — remove background, border, border-radius. Keep `margin-bottom: 8px; padding: 8px 10px;`
  - [ ] `.dt-story-sign-off` (6752) — remove background, border, border-radius. Keep margin-top, padding, flex layout

- [ ] Reconcile `.dt-feeding-locked` as a stripe variant (AC: #3)
  - [ ] Add `.dt-feeding-locked` to the inner-card grouped selector OR keep it separate but reduce its declaration to: `border-left: 3px solid var(--gold2); padding: 14px 16px;` (the canonical chrome supplies the rest)
  - [ ] **Pick one approach during implementation; pick the one that produces the minimum diff and the cleanest result.** Document the choice in Completion Notes.
  - [ ] Verify the gold left-stripe still wins over the canonical `border` shorthand (declare `border-left` AFTER `border`; same gotcha as CSS-6)

- [ ] Verify state modifiers still work (AC: #4, #5)
  - [ ] Read each `.complete` and `.revision` modifier rule (lines 6825, 7054, 7055, 7056, 7120, etc.)
  - [ ] Confirm they declare `border-color` only (not the full `border` shorthand) — if so, they correctly override the canonical block's border colour while keeping the canonical width and style
  - [ ] If any modifier uses the full `border` shorthand and accidentally resets width/style, fix it to use `border-color` only

- [ ] Verify no JS coupling broken (AC: #6)
  - [ ] Use Grep tool against `public/js/` for the seven story-tab class names
  - [ ] Confirm every reference still finds its element

- [ ] Visual verification in browser (AC: #7)
  - [ ] Start frontend: `npx http-server public -p 8080`
  - [ ] Open admin Downtimes tab → expand to the Story sub-tab inside a cycle
  - [ ] Pick a character with submitted DT and view their story view
  - [ ] Eyeball every card surface: outer sections (collapsible), project cards inside, merit cards, resources cards, context blocks, sign-off panel at bottom
  - [ ] Confirm radius is uniformly 6px (no more 4 vs 5 vs 6 drift)
  - [ ] Confirm border weight is uniform (no more `--bdr` vs `--bdr2` mix)
  - [ ] Trigger the `.complete` state on a project card (mark something complete) and confirm the gold border-color still wins
  - [ ] Trigger the `.revision` state and confirm the crim border-color still wins
  - [ ] Open a feeding row that shows `.dt-feeding-locked` (regent gate) and confirm the gold left-stripe still renders correctly

- [ ] Update audit doc with implementation note (AC: #8)
  - [ ] Add `### Bucket 1D — Resolved` line at the bottom of audit §3 referencing this story key and date
  - [ ] If `.dt-story-section` was handled here rather than via CSS-7, document the temporary placement

- [ ] Confirm line count did not grow (AC: #8)
  - [ ] Before/after LOC of `public/css/admin-layout.css` recorded in Dev Agent Record

## Dev Notes

**Single file in scope:** `public/css/admin-layout.css`.

**Hard constraint:** No JS edits, no markup edits, no class renames. Same as CSS-6, CSS-7, CSS-8.

**Visible behaviour change:** AC #2 makes `.dt-story-merit-card` and `.dt-story-resources-card` adopt `--surf2` background where they previously used `--surf`. This is a visible change (cards become slightly darker, matching the project card). Verify in browser this reads as intentional.

**State-modifier override discipline:** This story's biggest risk is the `.complete` and `.revision` modifiers. If any uses `border:` shorthand instead of `border-color:`, the canonical chrome will silently override the state colour. Audit those declarations carefully (lines 6825, 7054-7056, 7120). The CSS spec says shorthand always wins over longhand of the same property declared earlier, but order on the cascade depends on which rule appears later in source — confirm in browser dev tools that the state colour wins.

**Coordination with CSS-7:** `.dt-story-section` is structurally an outer panel and belongs to CSS-7's grouped selector. If CSS-7 ships first, this story merges `.dt-story-section` into that group. If this story ships first, `.dt-story-section` gets handled inline and CSS-7 picks it up later. The task list above branches on this.

**Token discipline:** All colours via tokens. The `rgba(139,0,0,0.3)` used for `.revision` border-color should ideally become a proper `--revision-bdr` token in `theme.css` — but that's a separate concern (out of scope for this story; existing usage is preserved as-is).

**British English in any new comments.** Default to no comments.

### Project Structure Notes

- All work in `public/css/admin-layout.css`. No file moves, no new files.

### References

- [Source: specs/audits/downtime-ui-audit-2026-04-26.md] — Section 1D
- [Source: public/css/admin-layout.css:6603-7325] — affected line range
- [Source: public/css/theme.css] — `--surf2`, `--bdr`, `--gold2`, `--story-compl-a40`
- [Source: CLAUDE.md] — branch policy, no em-dashes
- Memory: `reference_css_token_system` — token discipline

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
