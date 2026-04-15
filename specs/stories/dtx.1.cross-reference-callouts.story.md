# Story DTX.1: Cross-Reference Callouts

Status: review

## Story

As an ST processing downtimes,
I want to see inline callouts on expanded action rows that show other characters with overlapping territories or investigation targets,
so that I can identify conflicts and synergies without holding everything in my head.

## Acceptance Criteria

1. A project action with `projTerritory` set shows other characters whose actions intersect that territory in the same cycle.
2. A feeding action shows other characters feeding in the same primary territory.
3. An investigate action shows other characters investigating the same target character.
4. An investigate callout also notes if the target has an active hide/protect action in the queue.
5. No callout renders when no cross-references exist for that entry (no empty state noise).
6. Callouts are read-only — no interactive elements.
7. Cross-reference index is built in a single O(n) pass over the queue after `buildProcessingQueue()` returns. No additional API calls.
8. No regression on any existing E2E tests.

## Tasks / Subtasks

- [x] Task 1: Build cross-reference index after `buildProcessingQueue()` (AC: 7)
  - [ ] In `renderProcessingMode` (the function that calls `buildProcessingQueue`), after line ~3226 where `byPhase` is fully built, add a single O(n) pass to build the xref index:

    ```js
    // ── Cross-reference index ──
    const xrefIndex = new Map(); // key: 'terr:North Shore' | 'inv-target:Einar Solveig'
    for (const entry of queue) {
      // Project territory
      if (entry.projTerritory) {
        const k = `terr:${entry.projTerritory}`;
        if (!xrefIndex.has(k)) xrefIndex.set(k, []);
        xrefIndex.get(k).push({ charName: entry.charName, label: entry.label, phase: entry.phase });
      }
      // Feeding territories
      if (entry.feedTerrs) {
        for (const terr of Object.keys(entry.feedTerrs)) {
          const k = `terr:${terr}`;
          if (!xrefIndex.has(k)) xrefIndex.set(k, []);
          xrefIndex.get(k).push({ charName: entry.charName, label: 'Feeding', phase: entry.phase });
        }
      }
      // Investigate target — requires review data
      if (entry.actionType === 'investigate') {
        const sub = submissions.find(s => String(s._id) === String(entry.subId));
        const rev = entry.source === 'project'
          ? (sub?.projects_resolved?.[entry.actionIdx] || {})
          : (sub?.merit_actions_resolved?.[entry.actionIdx] || {});
        const target = rev.investigate_target_char;
        if (target) {
          const k = `inv-target:${target}`;
          if (!xrefIndex.has(k)) xrefIndex.set(k, []);
          xrefIndex.get(k).push({ charName: entry.charName, label: entry.label, phase: entry.phase });
        }
      }
    }
    ```

  - [ ] Make `xrefIndex` available to `renderActionPanel` via closure (it is defined in the same scope as the rendering loop at line ~3244)

- [x] Task 2: Render callout block in the left panel (AC: 1–6)
  - [ ] In `renderActionPanel` (line ~5987), find the point just before the source-type branching that closes `proc-feed-left` (lines ~6720–6734). This is after line ~6718 which closes the `proc-notes-container` div.
  - [ ] Insert a callout block at that position:

    ```js
    // ── Cross-reference callout ──
    const xrefLines = [];

    // Territory (project)
    if (entry.projTerritory) {
      const others = (xrefIndex.get(`terr:${entry.projTerritory}`) || [])
        .filter(r => r.charName !== entry.charName);
      if (others.length) {
        const names = others.map(r => `${r.charName} (${r.label})`).join(', ');
        xrefLines.push(`Also in ${entry.projTerritory}: ${names}`);
      }
    }

    // Territory (feeding)
    if (entry.source === 'feeding' && entry.primaryTerr) {
      const others = (xrefIndex.get(`terr:${entry.primaryTerr}`) || [])
        .filter(r => r.charName !== entry.charName);
      if (others.length) {
        const names = others.map(r => `${r.charName} (${r.label})`).join(', ');
        xrefLines.push(`Also feeding ${entry.primaryTerr}: ${names}`);
      }
    }

    // Investigate target
    if (entry.actionType === 'investigate' && rev.investigate_target_char) {
      const target = rev.investigate_target_char;
      const others = (xrefIndex.get(`inv-target:${target}`) || [])
        .filter(r => r.charName !== entry.charName);
      if (others.length) {
        const names = others.map(r => r.charName).join(', ');
        xrefLines.push(`Also investigating ${target}: ${names}`);
      }
      // Check for active hide/protect targeting same character
      const hasHideProtect = queue.some(e =>
        e.actionType === 'hide_protect' && (() => {
          const eSub = submissions.find(s => String(s._id) === String(e.subId));
          const eRev = e.source === 'project'
            ? (eSub?.projects_resolved?.[e.actionIdx] || {})
            : (eSub?.merit_actions_resolved?.[e.actionIdx] || {});
          return eRev.hide_protect_target === target || eRev.investigate_target_char === target;
        })()
      );
      if (hasHideProtect) xrefLines.push(`Target has active hide/protect action`);
    }

    if (xrefLines.length) {
      h += `<div class="proc-xref-callout">`;
      for (const line of xrefLines) {
        h += `<div class="proc-xref-line">${esc(line)}</div>`;
      }
      h += `</div>`;
    }
    ```

  - [ ] Note: `rev` is already computed earlier in `renderActionPanel` — use the same variable. `queue` and `submissions` are available via closure.

- [x] Task 3: Add CSS for callout styling (AC: 6)
  - [ ] In `public/css/admin-layout.css`, add after the `proc-notes-thread` / `proc-note-*` block (~line 4733):

    ```css
    /* DTX-1: cross-reference callout */
    .proc-xref-callout {
      margin-top: 8px;
      padding: 8px 10px;
      background: var(--surf2);
      border: 1px solid var(--bdr);
      border-left: 3px solid var(--gold2);
      border-radius: 4px;
      font-size: 12px;
      color: var(--txt2);
    }
    .proc-xref-line {
      line-height: 1.5;
    }
    .proc-xref-line + .proc-xref-line {
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid var(--bdr);
    }
    ```

- [ ] Task 4: E2E tests (AC: 1–8)  <!-- pending -->
  - [ ] Add 5 tests in a new `test.describe('DTX-1: Cross-reference callouts')` block in `tests/downtime-processing-dt-fixes.spec.js`:
    1. Project action with `projTerritory` set shows `.proc-xref-callout` containing other character name
    2. Feeding action with shared territory shows `.proc-xref-callout` containing other character name
    3. Investigate action with shared target shows `.proc-xref-callout` containing other character name
    4. Investigate action where target has hide/protect shows the hide/protect note in callout
    5. Action with no cross-references does NOT render `.proc-xref-callout`

## Dev Notes

### Queue Entry Fields Available

From `buildProcessingQueue` (line 1805):

| Field | Present on | Value |
|-------|-----------|-------|
| `charName` | All | Display name string (from `sortName`) |
| `label` | All | Short action label |
| `phase` | All | Phase label string |
| `source` | All | `'project'` \| `'merit'` \| `'feeding'` \| `'sorcery'` |
| `actionType` | All | `'investigate'` \| `'feeding'` \| `'hide_protect'` \| etc. |
| `actionIdx` | All | Index into source-specific resolved array |
| `subId` | All | Submission `_id` string |
| `projTerritory` | Project entries | Territory name string or `''` |
| `feedTerrs` | Feeding entries | Object: `{ 'North Shore': 'resident', ... }` |
| `primaryTerr` | Feeding entries | First resident territory name |

### Investigate Target Access

`rev.investigate_target_char` — stored in review data, not on the queue entry. Must look up review data during index build:

```js
const sub = submissions.find(s => String(s._id) === String(entry.subId));
const rev = entry.source === 'project'
  ? (sub?.projects_resolved?.[entry.actionIdx] || {})
  : (sub?.merit_actions_resolved?.[entry.actionIdx] || {});
const target = rev.investigate_target_char;
```

`submissions` is the array passed into `renderProcessingMode`. It is in scope at the point of index build.

### Callout Placement in Left Panel

`renderActionPanel` at line 5987. The left panel (`proc-feed-left`) closes at different lines depending on `entry.source`:

```js
// Line ~6718: closes proc-notes-container
h += '</div>';

// ← INSERT xref callout block HERE (before the source branching below)

if (entry.source === 'feeding') {
  h += '</div>'; // proc-feed-left  (~line 6720)
  h += _renderFeedRightPanel(entry, feedChar, rev);
  h += '</div>'; // proc-feed-layout
} else if (entry.source === 'project') {
  h += '</div>'; // proc-feed-left  (~line 6726)
  h += _renderProjRightPanel(entry, projChar, rev);
  h += '</div>'; // proc-feed-layout
} else if (isSorcery) {
  h += '</div>'; // proc-feed-left  (~line 6730)
  ...
} else if (entry.source === 'merit') {
  h += '</div>'; // proc-feed-left  (~line 6734)
  h += _renderMeritRightPanel(entry, rev);
  h += '</div>'; // proc-feed-layout
}
```

Insert the callout block after line ~6718 and before this branching block. The callout appears inside `proc-feed-left` for all source types.

### Closure Availability

`renderProcessingMode` defines `queue` (line ~3214), `xrefIndex` (Task 1 above), and iterates with the rendering loop. `renderActionPanel` is called from within this scope, so `xrefIndex`, `queue`, and `submissions` are all available by closure — no parameter changes needed.

### Design Tokens

- `--gold2`: `#E0C47A` — gold accent for the left border of callout
- `--surf2`: secondary surface background
- `--txt2`: secondary text (muted but readable)
- `--bdr`: border colour

### No Save Paths Changed

Callouts are read-only. No `saveEntryReview` calls, no new fields. Pure derived rendering.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Built `xrefIndex` Map after `byPhase` grouping (~line 3228): single O(n) pass over queue. Territory keys (`terr:`) populated from `e.projTerritory` and `e.feedTerrs`. Investigate-target keys (`inv-target:`) populated by looking up review data (`projects_resolved` or `merit_actions_resolved`) for each investigate entry. `xrefIndex` available by closure in `renderActionPanel`.
- Callout block inserted in `renderActionPanel` before `proc-feed-left` close (after player feedback, before source-type branching). Wrapped in block scope `{}` to isolate `xrefLines`. Three cross-ref types: project territory, feeding `primaryTerr`, investigate target. Hide/protect check: `queue.some(e => e.actionType === 'hide_protect' && e.charName === target)` — no stored target field on hide/protect; the caster IS the protected character.
- CSS added to `admin-layout.css`: `.proc-xref-callout` with gold left border (`var(--gold2)`), `.proc-xref-line` with separator between multiple lines.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `tests/downtime-processing-dt-fixes.spec.js`
- `specs/stories/dtx.1.cross-reference-callouts.story.md`
