# feat.907 — DT Story: show player's submitted description before ST outcome

```yaml
issue: 907
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/907
branch: ms/issue-907-player-merit-description
status: review
type: feature
```

## Story

As a player, when I open my downtime story, I want to see my own submitted
request or description alongside the ST's outcome in the Allies & Asset Summary,
so I can understand what I asked for and what was delivered without having to
go back to my original submission.

## Acceptance criteria

- [x] **AC-1** — Contacts action: the player's request text (`contact_${n}_request`)
  appears before the ST outcome in the Allies & Asset Summary row
- [x] **AC-2** — Allies/Status sphere action: the player's desired outcome
  (`sphere_${n}_outcome` or `status_${n}_outcome`) appears before the ST outcome
- [x] **AC-3** — Retainer action: the player's task description (`retainer_${n}_task`)
  appears before the ST outcome
- [x] **AC-4** — Skill Acquisition: the skill(s) text from the submission appears
  before the ST outcome
- [x] **AC-5** — When no description is available (blank field or old submission),
  the row renders without a description element — no empty gap, no placeholder
- [x] **AC-6** — When there is no ST outcome the row is already excluded from the
  summary (existing gate unchanged — this criterion guards against regression)
- [x] **AC-7** — Styling uses design-system tokens only; no inline `style=`, no
  bare hex

## Scope

**In scope**
- `public/js/tabs/story-tab.js` — `buildPlayerMeritActions` and
  `renderMeritSummarySection`
- `public/css/components.css` — new `.merit-summary-description` class

**Out of scope**
- Admin DT Story layout (`downtime-story.js`) — no changes
- DT Processing panel — no changes
- `renderMeritActionCards` (legacy fallback, not the summary ledger)

---

## Dev Notes

### 1. The two functions to modify

**`buildPlayerMeritActions`** (`story-tab.js:605–668`) reconstructs the ordered
list of merit actions from `sub.responses` and `sub._raw`. It currently returns
`{ merit_type, action_type }` per entry. This story adds a `description` field
to each entry.

**`renderMeritSummarySection`** (`story-tab.js:541–596`) builds category groups
and renders the HTML rows. It currently passes `{ meritLabel, actionLabel, summary }`
into each group. This story adds `description` and renders it before the outcome.

### 2. `buildPlayerMeritActions` — exact changes

Reference implementation: admin `buildMeritActions` at `downtime-story.js:1955–2141`,
which already has `desired_outcome` and `description` per action.

#### Spheres (Allies, etc.)

**Raw path** — reading from `raw.sphere_actions`:
```js
// BEFORE
actions.push({
  merit_type:  resp[`sphere_${slot}_merit`] || '',
  action_type: entry.action_type || '',
});

// AFTER
actions.push({
  merit_type:   resp[`sphere_${slot}_merit`] || '',
  action_type:  entry.action_type || '',
  description:  entry.desired_outcome || resp[`sphere_${slot}_outcome`] || '',
});
```

**Form path** — reading from `resp` keys:
```js
// BEFORE
actions.push({ merit_type: mt, action_type: resp[`sphere_${n}_action`] || '' });

// AFTER
actions.push({
  merit_type:  mt,
  action_type: resp[`sphere_${n}_action`] || '',
  description: resp[`sphere_${n}_outcome`] || '',
});
```

#### Status loop — currently MISSING in `buildPlayerMeritActions`

**This is a pre-existing bug.** The admin `buildMeritActions` has a Status loop
(lines 1997–2014) inserted after spheres and before contacts, matching the flat
index order in `merit_actions_resolved`. Without it, any submission with Status
actions misaligns contact/retainer outcomes.

Add this loop **after the spheres block and before the contacts block** (around
line 627 in the current file):

```js
// ── Status / MCI ── (mirrors downtime-story.js:1997–2014)
for (let n = 1; n <= 5; n++) {
  const mt = resp[`status_${n}_merit`];
  const actionVal = resp[`status_${n}_action`];
  if (!mt || !actionVal) continue;
  actions.push({
    merit_type:  mt,
    action_type: actionVal,
    description: resp[`status_${n}_outcome`] || '',
  });
}
```

#### Contacts

**Raw path** (reading from `raw.contact_actions.requests`):
```js
// BEFORE
contactRaw.forEach((_, idx) => {
  const n = idx + 1;
  actions.push({ merit_type: resp[`contact_${n}_merit`] || 'Contacts', action_type: 'misc' });
});

// AFTER
contactRaw.forEach((c, idx) => {
  const n = idx + 1;
  actions.push({
    merit_type:  resp[`contact_${n}_merit`] || 'Contacts',
    action_type: 'misc',
    description: c.detail || c.description || '',
  });
});
```

Note: `_` becomes `c` to read the raw object's description fields.

**Form path** (reading from `resp` keys):
```js
// BEFORE
actions.push({ merit_type: resp[`contact_${n}_merit`] || 'Contacts', action_type: 'misc' });

// AFTER
actions.push({
  merit_type:  resp[`contact_${n}_merit`] || 'Contacts',
  action_type: 'misc',
  description: resp[`contact_${n}_request`] || '',
});
```

#### Retainers

**Raw path** (reading from `raw.retainer_actions.actions`):
```js
// BEFORE
retainerRaw.forEach(() => actions.push({ merit_type: 'Retainer', action_type: 'misc' }));

// AFTER
retainerRaw.forEach(r => actions.push({
  merit_type:  r.merit || 'Retainer',
  action_type: 'misc',
  description: r.task || r.description || '',
}));
```

Note: `()` becomes `r` to read the raw object.

**Form path**:
```js
// BEFORE
actions.push({ merit_type: 'Retainer', action_type: 'misc' });

// AFTER — `resp[retainer_${n}_task]` is already guarded by `if (!resp[...])` above
actions.push({
  merit_type:  resp[`retainer_${n}_merit`] || 'Retainer',
  action_type: 'misc',
  description: resp[`retainer_${n}_task`] || '',
});
```

Note: The form path already has `if (!resp[\`retainer_${n}_task\`]) continue;`
so `resp[\`retainer_${n}_task\`]` is guaranteed non-empty in that branch.
Also, retrieve the merit name from `resp[\`retainer_${n}_merit\`]` rather than
hardcoding `'Retainer'` (matches admin pattern).

#### Resources

```js
// BEFORE
actions.push({ merit_type: 'Resources', action_type: 'acquisition' });

// AFTER
actions.push({
  merit_type:  'Resources',
  action_type: 'acquisition',
  description: (resp['acq_description'] || resAcqBlob).trim(),
});
```

`resAcqBlob` is already computed just above; `resp['acq_description']` is the
structured description from the form (same fields admin uses).

#### Skill Acquisitions

```js
// BEFORE
actions.push({ merit_type: 'Skill Acquisition', action_type: 'acquisition' });

// AFTER
actions.push({
  merit_type:  'Skill Acquisition',
  action_type: 'acquisition',
  description: skillAcqBlob.trim(),
});
```

`skillAcqBlob` is already computed just above.

### 3. `renderMeritSummarySection` — group push

At lines 569–574, the group push currently creates:
```js
groups[cat].push({
  meritLabel,
  actionLabel: cat === 'contacts' ? '' : (ACTION_TYPE_LABELS[a.action_type] || a.action_type || ''),
  summary,
});
```

Add `description`:
```js
groups[cat].push({
  meritLabel,
  actionLabel:  cat === 'contacts' ? '' : (ACTION_TYPE_LABELS[a.action_type] || a.action_type || ''),
  description:  (a.description || '').trim(),
  summary,
});
```

### 4. `renderMeritSummarySection` — row render

Current row render (lines 585–590):
```js
h += `<div class="merit-summary-row">`;
h += `<span class="merit-summary-merit">${esc(entry.meritLabel)}</span>`;
if (entry.actionLabel) h += `<span class="merit-summary-action-type">${esc(entry.actionLabel)}</span>`;
h += `<span class="merit-summary-text">${esc(entry.summary)}</span>`;
h += `</div>`;
```

After adding description. Change `.merit-summary-text` from `span` to `div`
(it is a flex child of the row — `div` is valid and allows block children):
```js
h += `<div class="merit-summary-row">`;
h += `<span class="merit-summary-merit">${esc(entry.meritLabel)}</span>`;
if (entry.actionLabel) h += `<span class="merit-summary-action-type">${esc(entry.actionLabel)}</span>`;
h += `<div class="merit-summary-text">`;
if (entry.description) h += `<span class="merit-summary-description">${esc(entry.description)}</span>`;
h += esc(entry.summary);
h += `</div>`;
h += `</div>`;
```

This stacks description above outcome within the flex-1 text column.

### 5. CSS — `components.css`

Add `.merit-summary-description` immediately after `.merit-summary-text`
(line 4582 in current file). Use `display: block` so it stacks above the outcome
text node within the `div.merit-summary-text` flex child.

```css
.merit-summary-text { color: var(--txt1); flex: 1; }
.merit-summary-description {
  display: block;
  color: var(--txt3);
  font-size: 12px;
  margin-bottom: 2px;
}
```

No bare hex. No inline style. Tokens only.

`.merit-summary-text` itself needs no layout change — `flex: 1` already makes it
fill available space; block children inside it stack naturally.

### 6. `esc()` guard

All player-submitted text goes through `esc()` (the HTML-escape helper already
used in this file) before being rendered. This is the existing pattern — maintain
it for `entry.description` too.

### 7. Index alignment — why Status must go before Contacts

`merit_actions_resolved` is an ordered array parallel to the actions array.
The processing panel builds it in the same order as `buildMeritActions` in
`downtime-story.js`: spheres → Status → contacts → retainers → skill/resource.
The player's `buildPlayerMeritActions` must produce actions in the same order,
otherwise `resolved[i]` maps to the wrong action.

Currently `buildPlayerMeritActions` has no Status loop, so for any submission
with Status actions and subsequent Contacts actions, contact outcomes are being
read at wrong indices. Adding the Status loop in the correct position (after
spheres, before contacts) both enables description display for Status and fixes
the pre-existing index bug.

### 8. Files to change

| File | Change |
|------|--------|
| `public/js/tabs/story-tab.js` | `buildPlayerMeritActions`: add `description` field + Status loop; `renderMeritSummarySection`: include `description` in group push and row render |
| `public/css/components.css` | Add `.merit-summary-description` after `.merit-summary-text` (~line 4583) |

No server changes. No API changes. No admin-side changes.

### 9. Preservation invariants

- The `if (!summary) return;` gate at line 566 is unchanged. Rows without an
  ST outcome are still excluded from the summary regardless of description.
- `renderMeritActionCards` (legacy fallback) is untouched.
- `hasOutcomeSummaries` guard (lines 547–549) is untouched.
- The admin `downtime-story.js` is not touched.
- `buildPlayerMeritActions` return shape gains a new `description` field —
  `renderMeritActionCards` (the only other consumer) ignores extra fields, so
  no regression.

---

## Testing

Playwright E2E tests (following the fix.904 spec pattern at
`tests/fix-904-merit-outcome-field-fallback.spec.js`). Create
`tests/feat-907-player-merit-description.spec.js`.

Player-side tests use `setupPlayerStory(page, [sub])` +
`expandPastOutcome(page)` helpers (copy/adapt from the fix.904 spec).

**Test fixtures needed** — each tests a different action type:

| Test | Sub fixture shape | Assertion |
|------|------------------|-----------|
| AC-1 Contacts | `responses: { contact_1_request: 'Who runs the docks?', contact_1_merit: 'Contacts (Street)' }, merit_actions_resolved: [{ outcome: 'Mick Sullivan controls Pier 7.', outcome_confirmed: true }]` | `.merit-summary-description` contains `'Who runs the docks?'` |
| AC-2 Sphere | `responses: { sphere_1_merit: 'Allies (Dockers)', sphere_1_action: 'misc', sphere_1_outcome: 'Send them to watch the harbour.' }, merit_actions_resolved: [{ outcome: 'Your allies deployed.', outcome_confirmed: true }]` | description contains `'Send them to watch the harbour.'` |
| AC-3 Retainer | `responses: { retainer_1_merit: 'Retainer', retainer_1_task: 'Follow the red-haired man.' }, merit_actions_resolved: [{ outcome: 'Task complete.', outcome_confirmed: true }]` | description contains `'Follow the red-haired man.'` |
| AC-4 Skill Acq | `responses: { skill_acquisitions: 'Athletics 3' }, acquisitions_resolved: [{ outcome_summary: 'Approved.' }]` | description contains `'Athletics 3'` |
| AC-5 No description | `responses: { sphere_1_merit: 'Allies (X)', sphere_1_action: 'misc', sphere_1_outcome: '' }, merit_actions_resolved: [{ outcome: 'Some outcome.', outcome_confirmed: true }]` | no `.merit-summary-description` element present |

All player-side tests: boot the app via the player `setupPlayerStory` helper,
call `expandPastOutcome`, then assert on `.merit-summary-section` contents.

---

## Dev Agent Record

### Files changed
- `public/js/tabs/story-tab.js` — `buildPlayerMeritActions`: added `description` field to all six action types (spheres raw+form, Status loop added, contacts raw+form, retainers raw+form, resources, skill acquisitions); `renderMeritSummarySection`: group push includes `description`; row render emits `<span class="merit-summary-description">` inside `<div class="merit-summary-text">` when description non-empty
- `public/css/components.css` — added `.merit-summary-description` class (`display: block; color: var(--txt3); font-size: 12px; margin-bottom: 2px`)
- `tests/feat-907-player-merit-description.spec.js` — 7 new Playwright tests, all passing

### Completion notes
All 7 ACs satisfied. 7/7 tests pass in 24.3 s.
Pre-existing bug fixed alongside: `buildPlayerMeritActions` had no Status loop, causing index misalignment for submissions with Status actions followed by Contacts. Status loop added in correct position (after spheres, before contacts) matching admin `buildMeritActions` order.

### Change log
- 2026-06-19: feat #907 — player merit summary now shows submitted description before ST outcome for all action types

---
_Story created from GitHub issue #907. Branch: `ms/issue-907-player-merit-description`_
