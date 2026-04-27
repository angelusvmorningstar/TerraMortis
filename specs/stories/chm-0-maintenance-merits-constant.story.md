---
id: chm.0
epic: chm
status: ready-for-dev
priority: high
depends_on: []
---

# Story CHM-0: Shared MAINTENANCE_MERITS constant + MCI string fix

As a player whose character holds Professional Training or Mystery Cult Initiation,
I should see the **Maintenance** option appear in my project action dropdown,
So that I can declare a Maintenance project for my standing merit and not silently lose it at chapter end.

This story also lays the foundation: any future code that needs to detect "characters who hold a maintenance-eligible standing merit" reads from a single shared constant, so future stories (CHM-1 through CHM-3, plus the player at-risk warning logic) inherit the correct gate without re-deriving it from string literals.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 3 (Chapter & Maintenance Layer), prerequisite story. The Maintenance project action option is currently invisible to every PT/MCI holder due to a string-mismatch bug in the dropdown gate: the code checks `m.name === 'MCI'` but the actual stored merit name is `'Mystery Cult Initiation'` (per `public/js/editor/edit-domain.js:162`).

The bug is two lines and obvious in isolation. The reason it's lifted to its own story rather than a one-line fix is that two more stories (CHM-2 maintenance audit panel, CHM-3 player at-risk warning strip) need the same merit-name check. If each story redefines the check by string literal, we have three places to drift in the future. Doing the constant once now means CHM-2 and CHM-3 read from a single source of truth.

The bug is at `public/js/tabs/downtime-form.js:2121-2123`:

```js
const hasMaintenance = (currentChar.merits || []).some(m =>
  m.name === 'Professional Training' || m.name === 'MCI'
);
```

`'MCI'` should be `'Mystery Cult Initiation'`. Fix the literal AND extract the merit-name list into a shared constant.

### Files in scope

- `public/js/tabs/downtime-data.js` — natural home for the new constant (already exports `FEED_METHODS`, `PROJECT_ACTIONS`, `SPHERE_ACTIONS`, `DOWNTIME_SECTIONS`).
- `public/js/tabs/downtime-form.js` — the only current consumer of this gate, around line 2121.
- Repo-wide audit for other call sites that hard-code `'Professional Training'` or `'MCI'` / `'Mystery Cult Initiation'` as merit-name strings.

### Out of scope

- The full chapter feature (CHM-1, CHM-2, CHM-3 follow this story)
- Auto-detection of maintenance from project action types (deferred per memory)
- Any change to how merits are stored on character documents
- The `'Professional Training'` and `'Mystery Cult Initiation'` strings themselves — those are canonical merit names in the data; do not rename.

---

## Acceptance Criteria

**Given** a character holds Professional Training as a standing merit
**When** the player opens the DT form's Personal Projects section and selects a project slot
**Then** the action-type dropdown includes "Maintenance: Upkeep of professional or cult relationships" as an option.

**Given** a character holds Mystery Cult Initiation as a standing merit
**When** the player opens the DT form's Personal Projects section and selects a project slot
**Then** the action-type dropdown includes "Maintenance: Upkeep of professional or cult relationships" as an option.

**Given** a character holds neither Professional Training nor Mystery Cult Initiation
**When** the player opens the DT form's Personal Projects section and selects a project slot
**Then** the action-type dropdown does **not** include the Maintenance option.

**Given** a character holds both Professional Training and Mystery Cult Initiation
**When** the player opens the DT form's Personal Projects section
**Then** the Maintenance option appears once (no duplication).

**Given** the codebase
**When** any module needs to check "does this character hold a maintenance-eligible standing merit"
**Then** it imports and uses the shared `MAINTENANCE_MERITS` constant rather than hard-coding the strings.

**Given** the file `public/js/tabs/downtime-data.js`
**Then** it exports `MAINTENANCE_MERITS` as an array of strings: `['Professional Training', 'Mystery Cult Initiation']`.

---

## Implementation Notes

- **Add the constant** to `public/js/tabs/downtime-data.js`, near the other exported reference data (after `FEED_METHODS`, before `DOWNTIME_SECTIONS`):
  ```js
  export const MAINTENANCE_MERITS = ['Professional Training', 'Mystery Cult Initiation'];
  ```
- **Update the dropdown gate** at `public/js/tabs/downtime-form.js:2121-2123` to import and use the constant:
  ```js
  import { ..., MAINTENANCE_MERITS } from './downtime-data.js';
  // ...
  const hasMaintenance = (currentChar.merits || []).some(m =>
    MAINTENANCE_MERITS.includes(m.name)
  );
  ```
- **Audit for other consumers.** Grep the codebase for the strings `'Professional Training'`, `'MCI'`, `'Mystery Cult Initiation'`. Expected hits:
  - `public/js/editor/edit-domain.js:162` — the merit definition itself; do **not** change.
  - `public/js/editor/mci.js`, `public/js/editor/xp.js`, `public/js/admin.js`, `public/js/app.js` — these contain MCI-related logic that may or may not be the same gate. **Do not refactor anything outside the project-action dropdown gate in this story** — touching those files would expand scope. Note in the dev record any duplicate gates spotted; CHM-2 and CHM-3 will pick them up.
- **Do not introduce a server-side counterpart.** This is purely a client-side gate today. If a future story needs server-side maintenance-merit detection (e.g. for auto-detect), it can introduce a server constant at that point.
- **No tests required.** This is a one-line behaviour fix in a render path. Manual verification (open DT form as a PT or MCI character; see Maintenance option appear) is sufficient.

---

## Files Expected to Change

- `public/js/tabs/downtime-data.js` — new export `MAINTENANCE_MERITS`.
- `public/js/tabs/downtime-form.js` — import and use the constant in the project action dropdown gate; remove the hard-coded `'MCI'` literal.

---

## Definition of Done

- All AC verified.
- Manual browser smoke test: as a character with Professional Training, the Maintenance option appears; as a character with Mystery Cult Initiation, the Maintenance option appears; as a character with neither, the option is absent.
- Audit documented in dev record: list of any other code locations that hard-code these merit-name strings (for CHM-2 and CHM-3 to pick up later).
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `chm-0-maintenance-merits-constant: ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies. Ships independently as a standalone bug fix.
- **CHM-1, CHM-2, CHM-3 depend on this story** because they read from `MAINTENANCE_MERITS`. CHM-0 must be merged before any of them start.
