# Story: Desktop Mode Toggle

Status: ready-for-dev

## Story

As an ST or player using the app on a desktop or laptop,
I want to switch to a desktop layout that shows a sidebar with all navigation visible,
So that I can access DT Submission, Ordeals, and other between-session features comfortably without phone-optimised constraints.

## Background

The unified game app is phone-first (600px max-width, bottom nav). This is correct for at-game use. But between sessions, STs and players often use the app on a desk and want more screen real estate and direct access to all features without navigating through the More grid.

Desktop mode adds a `body.desktop-mode` class that:
1. Removes the 600px width cap on `#app`
2. Hides the bottom nav (`#bnav`)
3. Shows a left sidebar with all navigation — same `goTab()` system, same sections as the More grid, but vertically oriented
4. Gives content area left margin to accommodate sidebar

**The sidebar nav mirrors the More grid structure:**
- Primary tabs: Dice, Sheet, Status (same as bottom bar)
- Then the More grid sections as collapsible groups:
  - Game: Who's Who, DT Report, Feeding, Map, Territory (if ST), Regency/Office if conditional
  - Player: Submit DT, Ordeals, Tickets
  - Lore: Rules, Primer, Game Guide
  - Storyteller: Tracker, Sign-In, Emergency (ST only)

This reuses `MORE_APPS` and `MORE_SECTIONS` data — no new navigation model.

**Persistence:** `localStorage['tm-mode']` — `'desktop'` or absent (game). Toggled by a button in the header.

## Acceptance Criteria

1. **Given** a user taps the Desktop Mode button in the header **When** toggled **Then** `body.desktop-mode` is set, `#bnav` hides, the left sidebar appears with all navigation, and the app fills available screen width
2. **Given** desktop mode is active **When** the user taps any nav item in the sidebar **Then** `goTab()` is called with the correct tab id — same behaviour as the bottom nav or More grid
3. **Given** desktop mode is active **When** the More grid sections are shown in the sidebar **Then** they are grouped with the same section labels (Game / Player / Lore / Storyteller) as the More grid, role-aware
4. **Given** desktop mode preference is saved **When** the user returns to the app **Then** desktop mode is restored from `localStorage['tm-mode']`
5. **Given** desktop mode is active **When** measured **Then** the app fills 100% width with no 600px cap; sidebar is ~200px fixed; content area fills remainder
6. **Given** the user taps the toggle again **When** toggled back **Then** game mode restores — bottom nav returns, sidebar hides, 600px cap restored
7. **Given** the header toggle button **When** in game mode **Then** shows a desktop/expand icon; in desktop mode shows a phone/collapse icon

## Tasks / Subtasks

- [ ] Add desktop mode toggle button to header (AC: #7)
  - [ ] Add `<button id="btn-desktop-toggle" class="app-nav-btn desktop-toggle-btn" onclick="toggleDesktopMode()">` to `#hdr-nav` in `index.html`
  - [ ] Desktop icon: outward arrows or grid SVG; Phone icon: phone SVG
- [ ] Implement `toggleDesktopMode()` in `app.js` (AC: #1, #4, #6)
  - [ ] Toggle `body.classList.toggle('desktop-mode')`
  - [ ] Save to `localStorage['tm-mode']`
  - [ ] Call `_updateDesktopIcon()` to swap icons
  - [ ] On app load: restore from localStorage
- [ ] Build `renderDesktopSidebar()` in `app.js` (AC: #2, #3)
  - [ ] Create `#desktop-sidebar` element (or render into a persistent container)
  - [ ] Primary nav items: Dice, Sheet, Status as top items
  - [ ] Divider then More sections: iterate `MORE_SECTIONS`, for each render visible `MORE_APPS` (same `appVisible()` logic)
  - [ ] Each item calls `goTab(id)` — same as bottom nav
  - [ ] Active state: highlight current tab using same `.on` / active pattern
  - [ ] Call `renderDesktopSidebar()` whenever mode is toggled or role changes
- [ ] CSS for desktop mode (AC: #1, #5, #6)
  - [ ] `body.desktop-mode #app { max-width: none; display: flex; flex-direction: row; }`
  - [ ] `body.desktop-mode #bnav { display: none; }`
  - [ ] `body.desktop-mode #desktop-sidebar { display: flex; flex-direction: column; width: 200px; flex-shrink: 0; ... }`
  - [ ] `body.desktop-mode .tab-wrap { flex: 1; min-width: 0; }`
  - [ ] Sidebar uses `--surf2` bg, `--bdr` right border, `--fl` Lato nav items, `--accent` active
  - [ ] Nav items: `min-height: 40px` (desktop context, 44px not required), padding 8px 16px
  - [ ] Section labels: `--label-secondary` Lato uppercase 10px
  - [ ] Add to `suite.css` using tokens only
- [ ] `#desktop-sidebar` container in `index.html` (AC: #1)
  - [ ] `<div id="desktop-sidebar" style="display:none"></div>` inside `#app`, before `.tab-wrap`
- [ ] Update `goTab()` to highlight desktop sidebar active item (AC: #2)
  - [ ] In desktop mode, update sidebar item active state as well as (or instead of) bottom nav

## Dev Notes

- `public/index.html` — add `#desktop-sidebar` container and toggle button
- `public/js/app.js` — `toggleDesktopMode()`, `renderDesktopSidebar()`, `_updateDesktopIcon()`
- `public/css/suite.css` — `body.desktop-mode` rules
- Reuses `MORE_APPS`, `MORE_SECTIONS`, `appVisible()` from the More grid — no duplication
- Role-aware: same conditions apply as More grid (ST sees ST apps, player sees player apps)
- The `#desktop-sidebar` renders on first toggle and re-renders on `goTab()` calls for active state
- Desktop sidebar does NOT need to show More grid — it IS the full nav, inline

### CSS Pattern
```css
body.desktop-mode #app { max-width: none; flex-direction: row; height: 100dvh; }
body.desktop-mode #bnav { display: none !important; }
body.desktop-mode #desktop-sidebar { display: flex; }
body.desktop-mode .tab-wrap { flex: 1; min-width: 0; overflow: hidden; }
#desktop-sidebar {
  display: none; /* hidden in game mode */
  width: 200px; flex-shrink: 0;
  background: var(--surf2); border-right: 1px solid var(--bdr);
  flex-direction: column; height: 100dvh;
  overflow-y: auto; padding: 8px 0;
}
```

### References
- [Source: public/js/app.js] — MORE_APPS, MORE_SECTIONS, appVisible(), goTab()
- [Source: public/css/suite.css] — existing nav patterns
- [Source: public/mockups/font-test.html] — sidebar nav patterns

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
