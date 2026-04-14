# Story 1.7: Cacophony Savvy Section

## Status: ready-for-dev

## Story

**As an** ST writing the Cacophony Savvy intelligence for a character with that merit,
**I want** N context slots (one per CS dot) that surface noisy public-facing actions from across the cycle,
**so that** I can write flavourful "things heard" vignettes grounded in real cycle events.

## Background

This story implements the Cacophony Savvy section in the DT Story character view, replacing the B1 scaffold placeholder. The section is only shown for characters who have the Cacophony Savvy merit.

The old DT Processing system had an `intelligence_dossier` narrative field as a catch-all for CS, visions, and rumours. DT Story replaces this with a structured, per-slot section that auto-surfaces which actions are "noisy" enough for the Cacophony to carry.

### What "Cacophony Savvy" means

The Cacophony is the vampiric rumour network. A character with CS dots picks up N impressionistic fragments of what other Kindred were doing this cycle — filtered by action type (noisy actions surface, quiet ones don't). The ST writes a short "things heard" vignette per slot, in third person (the character hears about someone else's actions, not their own).

Cacophony impressions are distorted — not full truth, not precise outcomes. The vignette reflects what filtered through rather than what actually happened.

### Merit lookup — finding CS dots

```js
function getCSDots(char) {
  const m = (char.merits || []).find(m => m.name === 'Cacophony Savvy');
  return m ? (m.rating || 0) : 0;
}
```

The merit is in `category: "general"`. It has a `picks` array (specialisations) which can be ignored for B7.

If `getCSDots(char) === 0`, suppress the entire section — do not render even the header.

### Noisy action priority order

Cacophony carries loud, public-facing actions. Priority order (highest to lowest):

```js
const CS_ACTION_PRIORITY = [
  'attack',
  'patrol_scout',
  'investigate',
  'ambience_increase',
  'ambience_decrease',
  'support',
  'misc',
  'rumour',
  'grow',
  'acquisition',
  'maintenance',
  'xp_spend',
  'block',
];
```

Lower index = higher priority. Actions not in this list (e.g. `hide_protect`) are not considered noisy.

### scanNoisyActions — cycle-wide scan

```js
function scanNoisyActions(allSubmissions, currentCharId, csDots) {
  const candidates = [];
  for (const s of allSubmissions) {
    if (s.character_id === currentCharId) continue; // exclude own actions
    const resolved = s.projects_resolved || [];
    resolved.forEach((rev, idx) => {
      if (!rev) return;
      if (rev.pool_status === 'skipped') return;
      // Exclude hidden: hide_protect with net successes > 0
      if (rev.action_type === 'hide_protect' && (rev.roll?.successes || 0) > 0) return;
      // Exclude action types not in CS_ACTION_PRIORITY
      const priorityIdx = CS_ACTION_PRIORITY.indexOf(rev.action_type);
      if (priorityIdx === -1) return;
      const slot = idx + 1;
      candidates.push({
        priorityIdx,
        characterName: s.character_name || 'Unknown',
        actionType: rev.action_type,
        territory: s.responses?.[`project_${slot}_territory`] || '',
        outcome: s.responses?.[`project_${slot}_outcome`] || '',
        successes: rev.roll?.successes ?? null,
      });
    });
  }
  // Sort by priority index (ascending = highest priority first)
  candidates.sort((a, b) => a.priorityIdx - b.priorityIdx);
  // Return first N by priority
  return candidates.slice(0, csDots);
}
```

**Tie-breaking within same action type:** preserve source order (the order candidates were discovered in `allSubmissions`). No random selection.

**Own actions excluded:** a character knows what they did themselves; CS surfaces other characters' activities only.

### buildCacophonySavvyContext — per slot

```js
function buildCacophonySavvyContext(char, noisyAction, slotIdx, csDots) {
  const lines = [];
  lines.push('You are helping a Storyteller write a Cacophony Savvy intelligence vignette for a Vampire: The Requiem 2nd Edition LARP character.');
  lines.push('');
  lines.push(`Character: ${displayName(char)}`);
  lines.push(`Cacophony Savvy: ${csDots} dots (slot ${slotIdx + 1} of ${csDots})`);
  lines.push('');
  lines.push('This slot covers a noisy event that filtered through the Cacophony this cycle:');
  lines.push('');
  lines.push(`Source: ${noisyAction.characterName}`);
  lines.push(`Action: ${ACTION_TYPE_LABELS[noisyAction.actionType] || noisyAction.actionType}`);
  if (noisyAction.territory) lines.push(`Territory: ${noisyAction.territory}`);
  if (noisyAction.outcome)   lines.push(`Declared intent: ${noisyAction.outcome}`);
  lines.push('');
  lines.push(`Write a short vignette (~75 words) of what ${displayName(char)} heard via the Cacophony about this event.`);
  lines.push('');
  lines.push('Style rules:');
  lines.push('- Third person — the character hears about someone else, not about themselves');
  lines.push('- British English');
  lines.push('- No mechanical terms — no discipline names, success counts, dot ratings');
  lines.push('- No em dashes');
  lines.push('- Cacophony impressions are distorted — facts may be garbled, emphasis skewed, source obscured');
  lines.push('- Do not state what actually happened precisely; write what filtered through the rumour network');
  lines.push('- Do not editorialise about significance');
  return lines.join('\n');
}
```

### Section layout (N slots)

```
┌─────────────────────────────────────────────────────┐
│  CACOPHONY SAVVY (3 dots)                            │
├─────────────────────────────────────────────────────┤
│  ● Slot 1                           [Copy Context]   │
│  [Context block]                                     │
│  Source: Rene St. Dominique · Patrol/Scout           │
│  Territory: The Second City                          │
│  Intent: "Secure the southern perimeter..."          │
│  [textarea — CS vignette for this slot]              │
│  [Save Draft]    [Mark Complete ✓]                   │
├─────────────────────────────────────────────────────┤
│  ● Slot 2                           [Copy Context]   │
│  ...                                                 │
└─────────────────────────────────────────────────────┘
```

If fewer noisy actions exist than CS dots, render a "No further noisy actions found" notice for the remaining slots with no textarea or Copy Context button.

### st_narrative shape for cacophony_savvy

```js
st_narrative.cacophony_savvy = [
  {
    slot: 0,
    action_ref: { character_name, action_type, territory },
    response: String,
    author: String,
    status: 'draft' | 'complete'
  },
  ...
]
```

The `action_ref` snapshot is saved alongside the response so the action context is preserved even if the submission changes later.

### Save pattern

```js
await saveNarrativeField(sub._id, {
  'st_narrative.cacophony_savvy': buildUpdatedArray(
    sub.st_narrative?.cacophony_savvy || [],
    slotIdx,
    {
      slot: slotIdx,
      action_ref: {
        character_name: noisyAction.characterName,
        action_type: noisyAction.actionType,
        territory: noisyAction.territory,
      },
      response: text,
      author,
      status: 'draft'
    }
  )
});
```

`buildUpdatedArray` is already defined from B2/B3.

### Completion

```js
function cacophonySavvyComplete(char, sub) {
  const csDots = getCSDots(char);
  if (csDots === 0) return true; // section suppressed = trivially complete
  // Count available noisy slots (may be fewer than csDots if cycle is quiet)
  const noisyCount = scanNoisyActions(_allSubmissions, sub.character_id, csDots).length;
  if (noisyCount === 0) return true; // nothing to write
  const slots = sub.st_narrative?.cacophony_savvy || [];
  // Only require completion for slots that have noisy actions
  return slots.slice(0, noisyCount).every(s => s?.status === 'complete');
}
```

`isSectionComplete` is not used — use `cacophonySavvyComplete(char, sub)` in the pill rail and sign-off counter.

### Pre-fill and legacy fallback

No legacy pre-fill for CS slots — the old system had `intelligence_dossier` as a single catch-all field. There is no meaningful mapping from a single blob to individual slots. Pre-fill only from `st_narrative.cacophony_savvy[slotIdx]?.response`.

### No actions found edge case

If `scanNoisyActions` returns 0 results for a slot, render:

```html
<div class="dt-story-cs-empty">No noisy actions found for this slot this cycle.</div>
```

No textarea, no Copy Context, no Save/Complete buttons for that slot. The slot is considered trivially complete.

### Renderer signature

```js
function renderCacophonySavvy(char, sub, stNarrative, allSubmissions) { ... }
```

The renderer needs `allSubmissions` for the cycle-wide scan. `_allSubmissions` is a module-level variable; pass it in from the character view re-render function.

---

## Acceptance Criteria

1. The Cacophony Savvy section is only rendered for characters with at least 1 dot of Cacophony Savvy merit (`char.merits.find(m => m.name === 'Cacophony Savvy')?.rating > 0`). For all other characters, the section is suppressed entirely (no header, no placeholder).
2. The section header shows "CACOPHONY SAVVY (N dots)" where N = CS dots.
3. N slots are rendered, one per CS dot.
4. Each slot header shows "Slot N" with a completion dot and Copy Context button.
5. `scanNoisyActions` scans all submissions except the current character's. It excludes: skipped actions, hide/protect with net successes > 0, action types not in CS_ACTION_PRIORITY. It returns up to N results sorted by priority order (Attack first, then Patrol/Scout, etc.). Tie-breaking within the same action type uses source order.
6. Each slot's context block shows: source character name, action type (human-readable label), territory (if present), declared outcome/intent (if present).
7. The Copy Context button assembles `buildCacophonySavvyContext(char, noisyAction, slotIdx, csDots)` and writes to clipboard. Shows "Copied!" / "Failed" states per shared `copyToClipboard` utility.
8. The prompt describes the character, their CS dots, the slot number, the noisy action details, and the style rules (third person, Cacophony is distorted, British English, no mechanical terms, no em dashes).
9. If fewer noisy actions exist than CS dots, remaining slots render a "No noisy actions found for this slot" notice with no textarea, Copy Context, or Save/Complete buttons.
10. Each slot textarea is pre-filled from `sub.st_narrative?.cacophony_savvy?.[slotIdx]?.response || ''`. No legacy fallback.
11. Save Draft: saves `{ slot, action_ref, response, author, status: 'draft' }` to `st_narrative.cacophony_savvy[slotIdx]` via `saveNarrativeField` using `buildUpdatedArray`.
12. Mark Complete: saves `{ ..., status: 'complete' }`. Completion dot turns green. Pill rail uses `cacophonySavvyComplete(char, sub)`.
13. Context block is collapsed once textarea has content; "Show context" toggle expands it.
14. No changes to `downtime-views.js`.

---

## Tasks / Subtasks

- [ ] Task 1: getCSDots(char) helper
  - [ ] Finds Cacophony Savvy merit in char.merits by name
  - [ ] Returns rating (0 if not found)

- [ ] Task 2: scanNoisyActions(allSubmissions, currentCharId, csDots) pure function
  - [ ] Excludes current character's own submissions
  - [ ] Excludes skipped actions
  - [ ] Excludes hide_protect with roll.successes > 0
  - [ ] Excludes action types not in CS_ACTION_PRIORITY
  - [ ] Sorts by CS_ACTION_PRIORITY index (ascending)
  - [ ] Returns first csDots entries
  - [ ] Each entry: { priorityIdx, characterName, actionType, territory, outcome, successes }

- [ ] Task 3: buildCacophonySavvyContext(char, noisyAction, slotIdx, csDots) pure function
  - [ ] Assembles prompt with character info, slot number, noisy action details, style rules
  - [ ] Omits territory/outcome lines if absent
  - [ ] Returns string

- [ ] Task 4: cacophonySavvyComplete(char, sub) helper
  - [ ] Returns true if csDots === 0
  - [ ] Counts available noisy slots (re-runs scanNoisyActions with _allSubmissions)
  - [ ] Returns true if noisyCount === 0
  - [ ] Returns true if all slots 0..noisyCount-1 have status === 'complete'

- [ ] Task 5: renderCacophonySavvy(char, sub, stNarrative, allSubmissions) renderer
  - [ ] Returns empty string if getCSDots(char) === 0
  - [ ] Calls scanNoisyActions to get noisy action list
  - [ ] Renders section header with CS dot count
  - [ ] Renders N slots (one per CS dot):
    - [ ] If noisyAction exists for slot: context block, Copy Context, textarea, Save Draft, Mark Complete
    - [ ] If no noisyAction for slot: "No noisy actions found" notice, no controls
  - [ ] Context block collapsed if existing response present

- [ ] Task 6: Event delegation for cacophony_savvy section
  - [ ] Copy Context → buildCacophonySavvyContext → copyToClipboard (uses data-slot-idx on button)
  - [ ] Context toggle per slot
  - [ ] Save Draft → saveNarrativeField with buildUpdatedArray → re-render section
  - [ ] Mark Complete → save + re-render + update pill rail using cacophonySavvyComplete

- [ ] Task 7: CSS for Cacophony Savvy section
  - [ ] `.dt-story-cs-section` — outer container
  - [ ] `.dt-story-cs-header` — "CACOPHONY SAVVY (N dots)" header row
  - [ ] `.dt-story-cs-slot` — individual slot container
  - [ ] `.dt-story-cs-slot-header` — slot label + dot + copy button row
  - [ ] `.dt-story-cs-empty` — "no noisy actions" notice (muted, italic)

---

## Dev Notes

### CS_ACTION_PRIORITY constant

Place near the top of downtime-story.js alongside ACTION_TYPE_LABELS:

```js
const CS_ACTION_PRIORITY = [
  'attack',
  'patrol_scout',
  'investigate',
  'ambience_increase',
  'ambience_decrease',
  'support',
  'misc',
  'rumour',
  'grow',
  'acquisition',
  'maintenance',
  'xp_spend',
  'block',
];
```

### character_id vs character_name for exclusion

The current character's ID is held in `_currentCharId` (module-level). Sub documents have `character_id` (ObjectId string) and `character_name`. Use `s.character_id === _currentCharId` as the primary exclusion check; fall back to `s.character_name === displayName(char)` if `character_id` is absent.

### Pill rail and sign-off integration

The pill rail must call `cacophonySavvyComplete(char, sub)` for the CS section. If `getCSDots(char) === 0`, the section is not shown in the pill rail at all (it contributes 0 to the section count). The sign-off counter should only count sections that are rendered.

This mirrors how skipped project cards are excluded from `projectResponsesComplete`.

### Re-scanning on each render

`scanNoisyActions` is called fresh each time `renderCacophonySavvy` is invoked — it does not cache. This ensures the context block always reflects the current cycle state, including actions resolved after the section was first opened.

The `cacophonySavvyComplete` helper also re-scans to determine how many slots require completion. This is intentional.

### action_ref snapshot on save

When saving a CS slot response, store the action details alongside:

```js
action_ref: {
  character_name: noisyAction.characterName,
  action_type: noisyAction.actionType,
  territory: noisyAction.territory,
}
```

This is a convenience snapshot — the canonical data always lives in the source submission. It is not used by the completion logic, only stored for audit.

### No old intelligence_dossier migration

The old `st_review.narrative.intelligence_dossier` was a single freetext field covering CS, visions, and rumours. There is no sensible mapping to individual CS slots. Do not attempt a fallback read from it. The field is still used by the old DT Processing narrative panel and remains untouched.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-story.js` | Modify: add CS_ACTION_PRIORITY, getCSDots, scanNoisyActions, buildCacophonySavvyContext, cacophonySavvyComplete, renderCacophonySavvy, event handlers |
| `public/css/admin-layout.css` | Modify: add CS section CSS classes in dt-story-* block |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Debug Log References
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-story.js`
- `public/css/admin-layout.css`
