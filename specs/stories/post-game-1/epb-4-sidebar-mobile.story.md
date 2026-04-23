# Story EPB.4: Sidebar Nav Mobile Improvements

Status: done

## Story

**As an** ST using the admin app on a tablet,
**I want** the sidebar to be easy to open/close and not obstruct content,
**so that** I can navigate between sections quickly without fumbling.

## Background

On mobile/tablet the sidebar in `admin.html` overlaps the main content and is difficult to collapse. The close button (`#sb-close`) is small, and the mode-switch buttons at the bottom of the sidebar are hard to reach.

## Acceptance Criteria

1. On screens ≤ 900px, the sidebar overlays the content (already the case) and has a visible, finger-sized close button (min 44×44px tap target).
2. Tapping outside the sidebar (on the overlay) closes it.
3. The open button (`#sb-open`) is visible and reachable when the sidebar is closed on mobile.
4. The mode-switch buttons at the bottom of the sidebar (`#sidebar-footer-nav`) are large enough to tap reliably (min 44px height each).
5. No regression on desktop (> 900px) where the sidebar is always visible.

## Tasks / Subtasks

- [ ] Read `public/admin.html` sidebar structure and `public/css/admin-layout.css` sidebar rules
- [ ] Increase `#sb-close` button tap target to min 44×44px on mobile
- [ ] Add click-outside-to-close: on mobile, clicking `.main-content` or an overlay dismisses the sidebar
- [ ] Ensure `#sb-open` button is accessible on mobile — check its position and size
- [ ] Increase `#sidebar-footer-nav` button min-height to 44px on mobile
- [ ] Test on 768px and 1024px viewports

## Dev Notes

- `public/admin.html` — sidebar HTML structure
- `public/css/admin-layout.css` — sidebar CSS (look for `#sidebar`, `.sb-close-btn`, `.sb-open-btn`, `#sidebar-footer-nav`)
- Click-outside handler: add to `public/js/admin.js` — listen for clicks on `.domain` or `#main-content` when sidebar is open on mobile (`window.innerWidth <= 900`)
- Use `--accent` for active states, `--surf2` for hover — no hardcoded colours
- The sidebar open/close state is controlled via a CSS class on `<body>` or `#sidebar` — check `admin.js` for the toggle pattern

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
