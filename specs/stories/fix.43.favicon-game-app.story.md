# Story fix.43: Favicon Missing in Game App

Status: complete

## Story

As a player visiting the game app,
I want the browser tab to show the Terra Mortis favicon,
so that the game app is visually consistent with the admin and player portal pages.

## Acceptance Criteria

1. `public/index.html` displays the Terra Mortis favicon (`assets/favicon.svg`) in the browser tab.
2. The favicon link tag is identical in format to the one already present in `admin.html` and `player.html`.
3. No other files are modified.

## Tasks / Subtasks

- [ ] Task 1: Add favicon link to `public/index.html` (AC: 1, 2)
  - [ ] In `public/index.html`, inside `<head>`, add `<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">` — matching the tag already present on line 7 of `admin.html` and line 7 of `player.html`.
  - [ ] Place it after the `<meta charset>` / `<meta viewport>` tags and before the stylesheet links, consistent with the position in the other HTML files.

## Dev Notes

### Root cause

`admin.html` and `player.html` both have:
```html
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
```
`index.html` has no favicon link at all. The SVG asset exists at `public/assets/favicon.svg`.

### File to change

- `public/index.html` — one line addition inside `<head>`

### No other changes needed

The favicon SVG already exists. No server changes, no CSS changes, no asset creation.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

### File List
