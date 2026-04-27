---
id: feat.8
epic: feat
status: ready-for-dev
priority: low
depends_on: []
---

# Story FEAT-8: Contacts Have No Action Type

As a Storyteller processing downtimes,
I want Contact actions to skip the action-type selector entirely (they only ever do one thing — gather information),
And as a player viewing the DT Story tab,
I want my Contact actions to be labelled simply as "Contacts" without an action-type badge,
So that the UI stops asking and answering a question that has only one possible answer.

---

## Context

### What's wrong today

Contacts are a merit type with **a single fixed action**: gather information. Unlike Allies, Status, or Retainers — which can do multiple things and need an action-type selector to pick — Contacts only do the one thing. The current code treats them inconsistently:

- `public/js/admin/downtime-story.js:1612` — contact actions get assigned `action_type: 'misc'` (a placeholder).
- `public/js/admin/downtime-views.js:7248, 7442, 9308, 9388` — contact actions get assigned `action_type: 'Gather Info'` in some flows.
- `public/js/admin/downtime-views.js:7779, 7781` — contact actions get assigned `action_type: ''` (empty) in still other flows.

Three different values for the same conceptual thing. None of them are useful — there is no actual choice the ST or player makes. The action-type selector renders for contacts in DT Processing but offers a single choice (or worse, a confusing menu of unrelated types). DT Story labels contact actions with one of these stale `action_type` values which adds visual noise without information.

### What this story does

Two related cleanups:

1. **DT Processing**: when rendering a contact action's panel, skip the action-type selector row entirely. The contact action's only thing is gathering information; there is no selector to render.
2. **DT Story**: when rendering a contact action card, omit the action-type badge / label. The card's heading reads "Contacts" (with the contact qualifier) — no `(Misc)` or `(Gather Info)` suffix.

### Files in scope

- **`public/js/admin/downtime-views.js`** — the action-type row renderer for merit actions. Need to check `_renderActionTypeRow` (line ~5982) and the merit panel paths (lines 6289, 6294 are call sites for project / merit panels). Likely the right approach is to early-return from `_renderActionTypeRow` when the entry is a contact, OR conditionally skip the call.
- **`public/js/admin/downtime-story.js`** — the merit action card render. Contacts currently flow through the same `merit_type: 'Contacts'` path; need to suppress the `action_type` display string when `merit_type === 'Contacts'`.
- **`public/js/tabs/story-tab.js`** — the player-side story view also renders `action_type` labels (verify via `Grep ACTION_TYPE_LABELS`). Same suppression rule applies.

### Out of scope

- Removing contact actions from the data model. The actions still exist with a contact merit type; only the action-type selector / label is suppressed.
- Migrating existing contact action records that have `action_type: 'Gather Info'` or `'misc'` in the database to clean values. The suppression is at render time; old data renders the same as new data because both paths skip the selector. A future cleanup can null out the field in DB if desired.
- Changing the contact request UI on the player form (where players type their contact request). Contacts already have their own form path — that stays as-is.
- Other merit categories that may also have only one action mode (e.g. Resources for `xp_spend`). FEAT-8 is contacts-specific; if other categories should follow, that's a separate story.

---

## Acceptance Criteria

### DT Processing — selector suppression

**Given** an ST expands a contact action in DT Processing
**Then** the action-type selector row does **not** render.
**And** the rest of the contact action panel renders as it does today (description, pool builder if applicable, ST notes, outcome).

**Given** an ST expands an Allies, Status, Retainer, or other non-contact merit action
**Then** the action-type selector row continues to render exactly as today (no regression).

### DT Story — label suppression

**Given** the ST or a player views a contact action card on the DT Story tab
**Then** the card heading reads "Contacts" (with the existing qualifier rendered, e.g. "Contacts ●●● (Crime)") — no action-type suffix.
**And** there is no `(Misc)`, `(Gather Info)`, or other action-type tag visible on the card.

**Given** non-contact merit action cards
**Then** the action-type label continues to render exactly as today (no regression).

### Player Story tab

**Given** a player loads the Story tab on player.html
**When** the Chronicle pane renders a published downtime narrative containing contact actions
**Then** contact action cards have no action-type badge.
**And** other merit action cards are unchanged.

### Data — no migration required

**Given** existing contact action records with `action_type: 'Gather Info'` or `'misc'` in the database
**Then** they render correctly (no badge) using the new suppression rule.
**And** new contact action records may be written with whatever value is convenient (the field is no longer rendered, so the value is irrelevant — strawman: write `null` or omit the field for new records).

### No regressions

**Given** the existing E2E tests for DT processing
**Then** they continue to pass.
**Specifically:** the DT processing consistency tests (`tests/downtime-processing-consistency.spec.js`) and DT fixes tests (`tests/downtime-processing-dt-fixes.spec.js`) still pass.

### Manual smoke

After implementation, manually verify:
- One submission with a contact action: panel has no action-type row.
- One submission with an allies action: panel still has the action-type row.
- A published narrative with both a contact and an allies card: contact has no badge, allies has its badge.

---

## Implementation Notes

### DT Processing suppression

In `public/js/admin/downtime-views.js`, the merit panel render path (around lines 6289-6294) calls `_renderActionTypeRow(entry, rev, char)`. The cleanest fix is at the call site:

```js
if (entry.meritCategory !== 'contacts') {
  h += _renderActionTypeRow(entry, rev, meritEntChar);
}
```

Apply at every call site. There may be multiple — verify with `Grep _renderActionTypeRow`.

Alternatively, edit `_renderActionTypeRow` itself to early-return on contacts:

```js
function _renderActionTypeRow(entry, rev, char) {
  if (entry.meritCategory === 'contacts') return '';
  // ... existing body ...
}
```

The latter is one change; the former is explicit at each call site. Pick one approach and apply consistently.

### DT Story (admin) suppression

In `public/js/admin/downtime-story.js`, find where the merit card heading is built. The current pattern looks something like:

```js
const heading = `${meritLbl} ${actionTypeLabel ? `(${actionTypeLabel})` : ''}`;
```

Change to:

```js
const heading = entry.merit_type === 'Contacts'
  ? meritLbl
  : `${meritLbl} ${actionTypeLabel ? `(${actionTypeLabel})` : ''}`;
```

Or equivalently set `actionTypeLabel = ''` when `entry.merit_type === 'Contacts'`.

### Player Story tab suppression

In `public/js/tabs/story-tab.js`, find where `ACTION_TYPE_LABELS` is consulted to render badges (line 9 defines the map; usages are downstream). Apply the same check:

```js
const showActionType = subEntry.merit_type !== 'Contacts';
const actionTypeLabel = showActionType ? ACTION_TYPE_LABELS[subEntry.action_type] : null;
```

### Detection rule

The detection is: `entry.merit_type === 'Contacts'` (string match) OR `entry.meritCategory === 'contacts'` (lowercase category). Both appear in the codebase. Use whichever matches the local variable shape — they refer to the same thing.

### Strawman wording

No new strings. The change is suppression of existing strings.

### British English

No new strings; nothing to verify.

---

## Files Expected to Change

- `public/js/admin/downtime-views.js` — suppress action-type row for contact merit actions.
- `public/js/admin/downtime-story.js` — suppress action-type suffix on contact action card headings.
- `public/js/tabs/story-tab.js` — suppress action-type badge on contact action cards in the Chronicle pane.
- No schema changes. No data migration.

---

## Definition of Done

- AC verified.
- Manual smoke test on a submission with both contact and non-contact merit actions confirms suppression on the right cards only.
- E2E tests pass with no regressions.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml`: `feat-8-contact-action-type: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- Pairs naturally with **DTSR-1** (section reorder + Rumours rename, ready-for-dev) since both touch DT Story rendering. Coordinate file edits if landing close together to avoid merge friction.
- Independent of every other FEAT story.

---

## References

- `specs/epic-features.md` — does not list FEAT-8; sourced from sprint-status comment.
- `specs/stories/sprint-status.yaml` line ~361 — original framing.
- `public/js/admin/downtime-views.js:5982` — `_renderActionTypeRow` definition.
- `public/js/admin/downtime-views.js:6289, 6294` — call sites in project / merit panels.
- `public/js/admin/downtime-story.js:1612` — contact action assigned `action_type: 'misc'` (an example of the inconsistency this story cleans up).
- `public/js/tabs/story-tab.js:9-16` — `ACTION_TYPE_LABELS` map (consumer of the suppression rule).
