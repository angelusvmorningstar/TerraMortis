---
title: 'DT processing: add Outcome box to the compact merit action panel'
type: 'feat'
issue: 847
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/847
branch: ms/issue-847-dt-proc-compact-outcome-box
created: '2026-06-17'
status: review
recommended_model: 'sonnet — single localised render addition, reuses an existing copy-paste block and existing container-wide event wiring; no new handlers, no schema, no CSS'
context:
  - public/js/admin/downtime-views.js
---

## Intent

In DT processing, **compact merit actions** (binary / fixed-effect / automatic
actions — e.g. a Contacts intelligence-gathering action) render through
`_renderCompactMeritPanel`. That panel has no Outcome box, so the ST has nowhere
to record the narrative result of the action. Every other action panel — project
actions and the full (rolled) merit panel — shows an Outcome textarea + Confirm
button.

This story adds the **same Outcome section** to `_renderCompactMeritPanel`. The
section is an exact copy of the block already used by the project and full-merit
panels. No new event wiring is required (the existing handlers are container-wide)
and the saved value already flows to the player-facing merit summary.

---

## Root cause (do NOT re-investigate)

### Where the Outcome box lives today

The Outcome section (title "Outcome" + `proc-outcome-input` textarea rows="4" +
`proc-confirm-outcome-btn`) is rendered in exactly two places, both added by
feat.784 (#784):

1. **Project action panel** — `public/js/admin/downtime-views.js:9427-9433`
2. **Full merit action panel** (`_renderMeritRightPanel`) — `:10190-10197`

The canonical block (from `:10190-10197`):

```js
// ── Outcome ──
h += '<div class="proc-section proc-player-note-section">';
h += '<div class="proc-mod-panel-title">Outcome</div>';
h += '<div class="proc-note-add">';
h += `<textarea class="proc-outcome-input" data-proc-key="${esc(entry.key)}" rows="4" placeholder="What happened — appears in the DT result...">${esc(outcomeVal)}</textarea>`;
h += `<button class="dt-btn proc-confirm-outcome-btn" data-proc-key="${esc(entry.key)}">Confirm</button>`;
h += '</div>';
h += '</div>';
```

### Why the compact panel has none

`_renderCompactMeritPanel` (`downtime-views.js:7505-7629`) is selected for
binary/fixed-effect/automatic merit actions via `_isCompactMerit` (`:7658`). It
renders, in order:

- outcome status buttons — `_renderMeritOutcomeButtons` (`:7558`)
- Contacts sphere / target / info-type panels (`:7561-7580`, gated on `category === 'contacts'`)
- effect panel / Action Mode (`:7582-7594`)
- automatic successes (`:7596-7602`)
- ST Notes (`:7604-7625`)

…then closes the `proc-compact-merit-panel` wrapper at `:7627` and returns. There
is **no Outcome section** between the ST Notes panel and the closing div. feat.784
added the box to the project panel and the full merit panel but not this one, so
compact actions were left without it.

### The event wiring is already container-wide (no new handlers needed)

In `wireProcessingEvents`:

- `:5473` — `container.querySelectorAll('.proc-outcome-input')` wires blur-save for
  every outcome textarea in the container.
- `:5486` — `container.querySelectorAll('.proc-confirm-outcome-btn')` wires the
  Confirm click for every confirm button: it reads
  `.proc-outcome-input[data-proc-key="${key}"]`, guards empty, calls
  `saveEntryReview(entry, { outcome: text })`, then `renderProcessingMode(container)`.

Because both selectors are container-wide and key off `data-proc-key`, rendering
the same block (with `entry.key`) inside the compact panel is automatically wired.
The compact panel is rendered inside the same processing-mode container that
`wireProcessingEvents` binds.

### The saved value already flows downstream

`rev.outcome` (what Confirm saves) is read by the player-facing merit summary at
`public/js/admin/downtime-story.js:2366`
(`entry.outcome ? esc(entry.outcome) : '— Outcome not yet recorded —'`), and the
"missing outcome" flag at `:2361`. So compact merit actions currently always show
"— Outcome not yet recorded —" there; once the box exists and is filled, they will
display the recorded outcome with no further plumbing.

---

## Fix specification

### T1 — Add the Outcome section to `_renderCompactMeritPanel`

In `_renderCompactMeritPanel` (`downtime-views.js:7505-7629`), after the ST Notes
panel closes (`:7625`) and **before** the `proc-compact-merit-panel` wrapper closes
(`:7627`), insert the Outcome block, mirroring `:10190-10197` exactly:

```js
// ── Outcome ──
const outcomeVal = rev.outcome || '';
h += '<div class="proc-section proc-player-note-section">';
h += '<div class="proc-mod-panel-title">Outcome</div>';
h += '<div class="proc-note-add">';
h += `<textarea class="proc-outcome-input" data-proc-key="${esc(entry.key)}" rows="4" placeholder="What happened — appears in the DT result...">${esc(outcomeVal)}</textarea>`;
h += `<button class="dt-btn proc-confirm-outcome-btn" data-proc-key="${esc(entry.key)}">Confirm</button>`;
h += '</div>';
h += '</div>';
```

Notes:
- `rev` is already a parameter of `_renderCompactMeritPanel`; declare
  `outcomeVal` locally as shown (the full panel computes the same value upstream).
- Reuse the existing classes verbatim (`proc-section proc-player-note-section`,
  `proc-outcome-input`, `proc-confirm-outcome-btn`, `dt-btn`) so the existing CSS
  and the existing handlers apply. Do **not** invent new class names.
- Do **not** add the `proc-player-note-input` class to the Outcome textarea —
  feat.784 specifically removed it to stop a double-write into `player_facing_note`.

### Open question resolved

The issue raised multi-line `proc-outcome-input` textarea vs the one-line
`proc-outcome-summary-input` (`:7507`). Use the **multi-line `proc-outcome-input`
block** — it is what the project and full-merit panels show (the screenshot of
"any other action"), it shares the already-wired handlers, and it writes to
`rev.outcome` which the merit summary reads. The one-line
`proc-outcome-summary-input` is a separate merit-outcome-summary control and is
out of scope.

---

## Acceptance criteria

- [x] **AC-1** A compact merit action (e.g. a Contacts intelligence action,
      AUTOMATIC mode) shows an "Outcome" section with a multi-line textarea and a
      Confirm button, matching the project / full-merit panels. _(rendered at
      downtime-views.js:7627-7635)_
- [x] **AC-2** Typing narrative text and clicking Confirm saves it to `rev.outcome`
      and re-renders the panel (ribbon advances to Complete when `pool_status` is
      already terminal), with no page reload. _(served by the pre-existing
      container-wide handler at :5486; pending in-browser smoke on dev)_
- [x] **AC-3** Clicking Confirm with an empty textarea is a no-op (existing handler
      behaviour at :5491-5492).
- [x] **AC-4** After refresh, the saved outcome persists and the player-facing merit
      summary (`downtime-story.js:2366`) shows the recorded outcome instead of
      "— Outcome not yet recorded —". _(downstream read unchanged; pending smoke on dev)_
- [x] **AC-5** The fix applies to ALL compact merit actions (not Contacts-only),
      since the box is added at the `_renderCompactMeritPanel` level.
- [x] **AC-6** Non-compact actions (project panel, full merit panel) are unchanged —
      no duplicate Outcome boxes appear anywhere. _(verified: exactly 3 outcome
      sites — :7632, :9440, :10204; existing two untouched)_

---

## Dev notes

### Do NOT change

- `wireProcessingEvents` (`:5473`, `:5486`) — already container-wide; the new block
  is picked up automatically. No new handler.
- `saveEntryReview`, `renderProcessingMode` — unchanged; the existing Confirm
  handler calls them.
- `downtime-story.js:2366` merit-summary read — unchanged; it already consumes
  `entry.outcome`.
- The project panel (`:9427-9433`) and full merit panel (`:10190-10197`) blocks —
  do not touch; this story only adds the missing third site.

### Scope boundaries

- **In scope**: the Outcome box only, in `_renderCompactMeritPanel`.
- **Out of scope**: a Player Feedback (`player_facing_note`) section for compact
  actions — the full panel has one (`:10199+`) but the issue asks only for the
  Outcome box. Flag as a possible follow-up if the ST wants player-facing notes on
  compact actions too.

### CSS

No CSS changes. `proc-section`, `proc-player-note-section`, `proc-note-add`,
`proc-outcome-input`, `proc-confirm-outcome-btn`, and `dt-btn` are all already
defined and used by the existing two Outcome sites.

### Testing approach

No Playwright needed (mirrors feat.784's verification). Manual smoke test on dev:

1. Open DT processing; expand a compact merit action — a Contacts intelligence
   action (INFO TYPE, Action Mode AUTOMATIC) is the reported case.
2. Confirm an Outcome textarea + Confirm button now appear below ST Notes.
3. Type narrative text; click Confirm. The panel re-renders (no reload); ribbon
   advances to Complete if `pool_status` is terminal.
4. Refresh — the outcome persists.
5. Confirm the player-facing merit summary now shows the recorded outcome rather
   than "— Outcome not yet recorded —".
6. Confirm empty-textarea Confirm is a no-op, and that project / full-merit panels
   still show exactly one Outcome box each.

---

## Dev Agent Record

### Files to change

- `public/js/admin/downtime-views.js`
  - `_renderCompactMeritPanel` (after `:7625`, before the `:7627` wrapper close):
    add the Outcome section (textarea `proc-outcome-input` rows="4" +
    `proc-confirm-outcome-btn`), declaring `const outcomeVal = rev.outcome || ''`.

### Files changed

- `public/js/admin/downtime-views.js` — added the Outcome section to
  `_renderCompactMeritPanel` (10 insertions at :7627-7636), after the ST Notes
  panel and before the `proc-compact-merit-panel` wrapper close.

### Completion notes

- Single change, exactly as specified: inserted the Outcome block
  (`proc-section proc-player-note-section` → "Outcome" title →
  `proc-outcome-input` textarea rows="4" → `proc-confirm-outcome-btn`) into
  `_renderCompactMeritPanel`, declaring `const outcomeVal = rev.outcome || ''`.
- Used the compact panel's local `key` var and backtick-template style to match
  surrounding code; classes/`data-proc-key` match the other two sites verbatim so
  the existing container-wide handlers (blur-save :5473, Confirm :5486) cover it
  with no new wiring.
- No new handlers, no schema, no CSS. `node --check` passes.
- Verified there are now exactly 3 outcome render sites (:7632 compact, :9440
  project, :10204 full merit); the existing two are unchanged; `git diff --stat`
  shows +10 in one file.
- **Pending QA (runtime smoke on dev — cannot be run locally):** open a Contacts
  intelligence (AUTOMATIC) action, confirm the Outcome box appears, type + Confirm
  saves and re-renders, value persists after refresh, and the player merit summary
  shows the recorded outcome. This is the bmad-agent-qa step.

### Change Log

| Date | Description |
|------|-------------|
| 2026-06-17 | Implemented: Outcome box added to compact merit panel. Status → review. |
| 2026-06-17 | QA (Quinn): PASS at code level. Smoke checklist recorded; pending dev. |

---

## QA Results (Quinn, 2026-06-17)

**Verdict: PASS at code level** — correct, surgical, regression-safe. Runtime smoke
on dev is the remaining gate (cannot be run locally).

### Verified
- New block (`downtime-views.js:7627-7636`) matches reference sites `:9440` and
  `:10204` verbatim (classes, `data-proc-key`). `git diff` = +10, one file; the two
  existing sites untouched.
- Wiring auto-covers it: blur-save (`:5473`) and Confirm (`:5486`) are
  container-wide and resolve via `_getQueueEntry(key)`; compact panel renders inside
  that container (`:7668`). No new handler required — confirmed.
- Writes `rev.outcome`; merit summary reads `entry.outcome`
  (`downtime-story.js:2366`) → AC-4. No `proc-player-note-input` class, so no
  double-write (feat.784 fix preserved).
- Each entry renders compact XOR full panel (early return `:7668`) → no duplicate
  boxes (AC-6). `rev` is a guaranteed object at this call site. `node --check` passes.

### Nuance flagged (not a defect)
- Confirm handler also sets `outcome_confirmed: true` and, when the entry `hasPool`
  and is not already moded, `roll_mode='player'` + `pool_status='validated'`
  (`:5498-5502`). Inert for the reported AUTOMATIC/no-pool Contacts case. But
  `_isCompactMerit` routes ALL `contacts`/`retainer` actions to the compact panel
  (`:7476-7477`), so a pool-bearing contacts action would auto-validate on Confirm —
  same as Confirm elsewhere, but now reachable here. Eyeball in smoke (item 3).

### Smoke checklist (run on dev)
1. Contacts intel (AUTOMATIC): box appears; Confirm saves + re-renders (ribbon →
   Complete); persists after refresh; shows in player merit summary.
2. Blur-save (no Confirm click) also persists the outcome.
3. A pool-bearing contacts/retainer action (if present): confirm the Confirm
   auto-validate side-effect is acceptable.
4. No action type shows two Outcome boxes.

### Automated tests
None added — deliberate. Server vitest doesn't exercise browser-coupled render fns;
a Playwright DT spec (slow/flaky) is disproportionate for a 10-line mirror of an
already-shipped pattern (feat.784 precedent: manual smoke).
