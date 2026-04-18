# Story DS-12: Menu Sidebar and Login — admin-layout.css Sidebar/Login Section

## Status
Ready for Dev

## Story
As an ST,
I want the admin menu sidebar and login screen to use the three-font system and semantic colour tokens,
So that the navigation frame and entry point are visually consistent with the validated design system.

## Background

Panel 29 of the design system reference covers:

- **Sidebar**: App logo/header, nav link list (12 items), active/hover states, user identity row, domain header, collapse/expand controls
- **Login screen**: App title, login prompt, Discord button, error message

The sidebar is visible on every admin tab, so any regression here is globally visible. This story is intentionally last so that all tab stories are done before touching the global navigation frame.

Panel 29 was reviewed during the font-test.html build session. Key fix applied in the test file: `.sb-app-link` (nav link items) changed from `font-variant:small-caps` at 11px → `text-transform:uppercase`.

Prerequisite: DS-01 must be complete. All DS-02 through DS-11 should be done or in review before this story ships, since it cleans up the remaining shared parchment override block entries.

## Design Decisions

- **App title / logo text** (`.sb-logo-text`, `.app-title-text`): The app title "Terra Mortis" is a proper noun displayed as the app's primary identity → `--fh` (Cinzel) is appropriate here.
- **Nav link labels** (`.sb-nav-link`, `.sb-app-link`): Navigation labels are functional UI text → `--fl`. At 11px: `text-transform:uppercase`, not `font-variant:small-caps`.
- **Domain header** (`.sb-domain-header`): Section divider within the sidebar → `--fl` 11px uppercase.
- **User row** (`.sb-user-name`, `.sb-user-role`): Username is a label, not a character name → `--fl`. Role sub-label → `--fl` lighter weight or `--label-secondary` colour.
- **Active nav state**: Border/text accent uses `var(--accent)`.
- **Login screen title**: If the login screen shows "Terra Mortis" as a display heading → `--fh`. The login instruction text → `--ft`. Button label → `--fl`.
- **`.login-error`**: Error message label → `--fl` (status label, not prose).
- **Close/collapse buttons** (`.sb-close-btn`): Button labels → `--fl`.
- **Final parchment override block cleanup**: After all DS-02 through DS-11 tab sweeps are done, this story performs the final audit of the `html:not([data-theme="dark"])` blocks in `admin-layout.css`, `editor.css`, `components.css`, and `player-layout.css` — deleting any remaining redundant rules and consolidating anything that remains.

## Files to Change

- `public/css/admin-layout.css` (sidebar/login selectors + final parchment override block cleanup)
- `public/css/player-layout.css` (sidebar-related selectors if any; final parchment override block cleanup)

## Acceptance Criteria

- [ ] No sidebar or login selector uses `var(--fhd)` or `var(--fb)`
- [ ] App title uses `--fh` (Cinzel); all nav labels use `--fl`
- [ ] `.sb-app-link` uses `text-transform:uppercase` — not `font-variant:small-caps`
- [ ] Active sidebar state uses `var(--accent)` for border and text
- [ ] Login screen: title → `--fh`, instruction text → `--ft`, button → `--fl`, error → `--fl`
- [ ] `var(--gold2)` → `var(--accent)` in sidebar and login selectors
- [ ] **Final cleanup**: After DS-02–DS-11 are complete, the `html:not([data-theme="dark"])` blocks contain only rules that genuinely cannot be tokenised (icon filter chains, CSS mask background-color). All redundant rules are deleted.
- [ ] No visual regressions in sidebar, active state, login screen (both themes)

## Tasks / Subtasks

- [ ] **Font sweep** — replace `--fhd`/`--fb` in sidebar/login selectors
- [ ] **Cinzel → Lato**: Nav labels, domain headers, user row labels, close buttons
- [ ] **Keep Cinzel on**: App title display element
- [ ] **Small-caps → uppercase**: `.sb-app-link` and any other nav item at 11px using `font-variant:small-caps`
- [ ] **Colour sweep**: `var(--gold2)` → `var(--accent)` in sidebar/login selectors
- [ ] **Final parchment override audit** (after DS-02–DS-11 merged):
  - `admin-layout.css`: Audit entire `html:not([data-theme="dark"])` block; delete all rules made redundant by the sweep; document what remains and why
  - `editor.css`: Same audit
  - `components.css`: Same audit
  - `player-layout.css`: Same audit
- [ ] **Verify override block minimum**: Only non-tokenisable rules should remain (icon filter chains, CSS mask bg-color, any `!important` inline-style overrides for specific JS-rendered elements)

## Dev Notes

- Panel 29 in `public/mockups/font-test.html` is the visual spec for the sidebar and login screen.
- The "final cleanup" task in this story depends on DS-02 through DS-11 being complete. If any tab stories are still in progress when DS-12 begins, do the sidebar/login sweep first and defer the final override block cleanup until all other stories are merged.
- The faction/topbar icon filter overrides (`invert(1) sepia(1) hue-rotate(300deg) brightness(0.30)`) in the parchment blocks are not tokenisable — these must remain in the override blocks. Document their presence with a comment so future developers understand why they exist.
- After DS-12 ships and the parchment override blocks are cleaned up, the per-file blocks should be small enough to scan at a glance — ideally 10-20 lines each, down from the current 50-100+ lines.
