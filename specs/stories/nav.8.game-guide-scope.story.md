---
id: nav.8
epic: unified-nav-polish
group: F
status: complete
priority: deferred
---

# Story nav.8: Game Guide — Content & Source Decision (SCOPE DEFINITION REQUIRED)

## ⚠️ Scope Decision Required

**Do not implement this story until the content source and scope have been decided.**

---

## Current State

The Game Guide tab exists in the unified app nav but renders empty. No content has been written or wired up.

## Decision Required

Before any development begins, answer the following:

1. **What is the Game Guide?** Is it:
   - A player-facing "how to play at Terra Mortis" guide (venue rules, safety tools, how game works)?
   - A rules summary / quick reference (overlapping with the Primer or Rules tab)?
   - A separate document from the Primer, covering in-game setting rather than mechanics?
   - Something else entirely?

2. **Where does the content come from?**
   - Static markdown file bundled with the app (like the Primer)?
   - Fetched from the API (dynamic, ST-editable)?
   - A Google Doc / external link?
   - Written fresh?

3. **Who maintains it?** If it changes between sessions, who updates it and how?

## Placeholder Implementation

Until the decision is made, the Game Guide tab should render a placeholder:

```
Game Guide
Content coming soon. Ask your ST.
```

This is preferable to a blank white screen.

## When Decision Is Made

Update this story with:
- A clear description of what the Game Guide contains
- The content source and fetch/load mechanism
- Acceptance criteria for the complete implementation
- Change `status` to `ready`

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
Placeholder implemented per story spec: tab now shows 'Game Guide — Content coming soon. Ask your Storyteller.' instead of blank white screen. Full implementation deferred until content source decision is made.
### File List
- public/js/app.js
