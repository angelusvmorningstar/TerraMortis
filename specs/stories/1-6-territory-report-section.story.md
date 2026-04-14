# Story 1.6: Territory Report Section

## Status: review

## Story

**As an** ST writing the Territory Report for a character,
**I want** a section that shows the relevant territory context — co-residents, the character's own actions, and notable events — and generates a per-territory prompt,
**so that** the narrative is grounded in what actually happened in that territory this cycle.

## Background

This story implements the Territory Report section in the DT Story character view, replacing the B1 scaffold placeholder. A territory report is a short in-character narrative of what the character observed and experienced in their operating territory this cycle.

This is the most data-intensive section in DT Story: it requires a cycle-wide scan of `_allSubmissions` to surface co-residents and notable events, and territory derivation from the character's feeding declaration.

### What "Territory Report" means

The character is aware of what happens in their territory — public-facing actions by other Kindred, the general atmosphere, who else was active there. The report is written from the character's perspective. It does not reveal hidden actions.

### Territory derivation — where to look

**Not** from the Haven merit: the Haven merit in `chars_v2.json` has no territory qualifier field. It only has `rating` and optional `shared_with` (character names, not territory names).

**From the submission form:** `sub.responses?.feeding_territories` is a JSON string with fixed keys:

```js
// Parse: JSON.parse(sub.responses?.feeding_territories || '{}')
// Keys: 'the_academy', 'the_harbour', 'the_dockyards', 'the_second_city', 'the_north_shore', 'the_barrens'
// Values: 'resident' | 'poacher' | 'none' | 'Not feeding here'
```

A character's home territory for this cycle = any key with value `"resident"`. Typically one, but potentially two if co-regency applies.

**TERRITORY_SLUG_MAP** — duplicate into downtime-story.js to resolve slugs to territory IDs:

```js
const TERRITORY_SLUG_MAP = {
  the_academy:   'academy',
  the_harbour:   'harbour',
  the_dockyards: 'dockyards',
  the_second_city: 'secondcity',
  the_north_shore: 'northshore',
  the_barrens:   null,
};

const TERRITORY_DISPLAY = {
  academy:    'The Academy',
  harbour:    'The Harbour',
  dockyards:  'The Dockyards',
  secondcity: 'The Second City',
  northshore: 'The North Shore',
};
```

`the_barrens` always resolves to null — omit from territory list.

### Finding co-residents

Scan `_allSubmissions` for all submissions (excluding the current character's) where `feeding_territories[thisTerrKey] === 'resident'`:

```js
function getCoResidents(territorySlug, thisSub, allSubmissions, allChars) {
  return allSubmissions
    .filter(s => s._id !== thisSub._id)
    .filter(s => {
      let terrs = {};
      try { terrs = JSON.parse(s.responses?.feeding_territories || '{}'); } catch { return false; }
      return terrs[territorySlug] === 'resident';
    })
    .map(s => {
      const char = allChars.find(c => c._id === s.character_id || displayName(c) === s.character_name);
      return { name: s.character_name || 'Unknown', clan: char?.clan || '', covenant: char?.covenant || '' };
    });
}
```

### Character's own actions in this territory

From the current character's submission — project actions in this territory:

```js
// For each entry in sub.projects_resolved (with matching territory):
const slot = idx + 1;
const territory = sub.responses?.[`project_${slot}_territory`] || '';
// resolveTerrId(territory) === thisTerrId → include
// action_type: ambience_increase, ambience_decrease, patrol_scout, investigate, support, etc.
// Include: action type label, outcome, roll successes (if resolved)
```

Feeding is always in the character's resident territory — include if feeding was resolved (pool_status !== 'skipped'):

```js
// sub.feeding_roll — present if feeding was processed; include pool expression if available
```

### Notable public events in the territory

Scan `_allSubmissions` for any submission (including current character's, excluding only hidden actions) with project actions in this territory:

```js
function getNotableEvents(terrId, thisSub, allSubmissions) {
  const events = [];
  for (const s of allSubmissions) {
    if (s._id === thisSub._id) continue; // current char handled separately
    const resolved = s.projects_resolved || [];
    resolved.forEach((rev, idx) => {
      if (!rev || rev.pool_status === 'skipped') return;
      const slot = idx + 1;
      const rawTerr = s.responses?.[`project_${slot}_territory`] || '';
      if (resolveTerrId(rawTerr) !== terrId) return;
      // Exclude hidden: hide_protect actions with net successes > 0
      if (rev.action_type === 'hide_protect' && (rev.roll?.successes || 0) > 0) return;
      events.push({
        characterName: s.character_name || 'Unknown',
        actionType: ACTION_TYPE_LABELS[rev.action_type] || rev.action_type,
        outcome: s.responses?.[`project_${slot}_outcome`] || '',
        successes: rev.roll?.successes ?? null,
      });
    });
  }
  return events;
}
```

**Hidden actions (hide_protect with net successes > 0) are excluded from notable events** — the character would not observe them.

### resolveTerrId — duplicate into downtime-story.js

```js
function resolveTerrId(raw) {
  if (!raw) return null;
  if (Object.prototype.hasOwnProperty.call(TERRITORY_SLUG_MAP, raw)) return TERRITORY_SLUG_MAP[raw];
  const normalised = raw.toLowerCase().replace(/^the[_\s]+/, '').replace(/_/g, ' ').trim();
  for (const [id, name] of Object.entries(TERRITORY_DISPLAY)) {
    const norm = name.toLowerCase().replace(/^the\s+/, '');
    if (normalised === norm || normalised.includes(norm) || norm.includes(normalised)) return id;
  }
  return null;
}
```

### Copy Context prompt structure (one per territory)

```
You are helping a Storyteller write a Territory Report for a Vampire: The Requiem 2nd Edition LARP character.

Character: {displayName(char)}
Clan: {char.clan}
Covenant: {char.covenant}
Territory: {TERRITORY_DISPLAY[terrId]}

Co-residents this cycle:
- {name} ({clan}, {covenant})
...
[or: No other residents this cycle]

This character's actions in {territory}:
- Feeding (pool validated)
- {actionType}: {outcome} — {N successes}
...

Notable events in {territory} (public-facing):
- {characterName} ran {actionType}: {outcome}
...
[or: No notable events recorded]

Write a short territory report (~100 words) describing what the character observed and experienced in {territory} this cycle.

Style rules:
- Second person, present tense
- British English
- No mechanical terms — no discipline names, success counts, dot ratings
- No em dashes
- Do not reveal hidden actions or information the character could not have witnessed
- Character moments only — no foreshadowing or plot hooks
- Do not editorialise
```

### Section layout (one sub-section per resident territory)

```
┌─────────────────────────────────────────────────────┐
│  TERRITORY REPORT                                     │
├─────────────────────────────────────────────────────┤
│  ● THE HARBOUR                      [Copy Context]   │
│  [Context block — collapsible]                       │
│  Co-residents: Reed Justice (Ventrue, Invictus)      │
│  Events: Rene ran Patrol/Scout — "secure perimeter"  │
├─────────────────────────────────────────────────────┤
│  [textarea — ST's territory report]                   │
│  [Save Draft]    [Mark Complete ✓]                   │
└─────────────────────────────────────────────────────┘
```

One sub-section per resident territory. If the character has no resident territory (no `"resident"` key in feeding_territories), render a single collapsed block: "No resident territory declared this cycle."

### st_narrative shape for territory_reports

```js
// st_narrative.territory_reports = array
// Each entry: { territory_id, response, author, status }
// Example: [ { territory_id: 'harbour', response: '...', author: 'Angelus', status: 'complete' } ]
```

Index in array corresponds to index in the list of resident territories for this character.

### Save pattern

```js
await saveNarrativeField(sub._id, {
  'st_narrative.territory_reports': buildUpdatedArray(
    sub.st_narrative?.territory_reports || [],
    idx,
    { territory_id: terrId, response: text, author, status: 'draft' }
  )
});
```

`buildUpdatedArray` is already defined in B2/B3.

### Completion

```js
function territoryReportsComplete(sub) {
  const feedTerrs = parseFeedingTerritories(sub);
  const residentCount = feedTerrs.filter(([, v]) => v === 'resident').length;
  if (residentCount === 0) return true; // no resident territory = no report needed
  const reports = sub.st_narrative?.territory_reports || [];
  return reports.filter(r => r?.territory_id).length >= residentCount
    && reports.every(r => !r || r.status === 'complete');
}
```

`isSectionComplete` is not used for territory reports — use `territoryReportsComplete(sub)` instead, both in the pill rail and the sign-off counter.

### Pre-fill and legacy fallback

The old `st_review.narrative.territory_report` was a single text field, not array-based. Fallback only applies to the first resident territory entry (index 0):

```js
const existingResponse =
  stNarrative?.territory_reports?.[idx]?.response ||
  (idx === 0 ? sub.st_review?.narrative?.territory_report?.text : '') ||
  '';
```

---

## Acceptance Criteria

1. The Territory Report section renders in the DT Story character view, replacing the B1 scaffold placeholder. One sub-section per resident territory found in `sub.responses?.feeding_territories`.
2. If no "resident" territory exists in the feeding form, the section renders a single block: "No resident territory declared this cycle." with no textarea or Copy Context.
3. Each sub-section header shows the territory name and has a completion dot + Copy Context button.
4. The context block for each territory shows: co-resident characters (name, clan, covenant), the current character's own actions in that territory this cycle (action type + outcome + roll if resolved), and notable public-facing events from other characters.
5. Hide/protect actions with net successes > 0 are excluded from notable events — hidden actions are not visible.
6. The Copy Context button assembles `buildTerritoryContext(char, sub, terrId, allSubmissions, allChars)` and writes to clipboard. Shows "Copied!" / "Failed" states per shared `copyToClipboard` utility.
7. The prompt includes: character name/clan/covenant, territory name, co-residents, character's own actions in territory, notable events, house style rules (second person present tense, no mechanical terms, British English, no em dashes, no hidden info).
8. The textarea is pre-filled from `sub.st_narrative?.territory_reports?.[idx]?.response`. Falls back to `sub.st_review?.narrative?.territory_report?.text` for index 0 only (DT1/legacy single-field).
9. Save Draft: saves `{ territory_id, response, author, status: 'draft' }` to `st_narrative.territory_reports[idx]` via `saveNarrativeField` using `buildUpdatedArray`. Confirms save with brief visual feedback.
10. Mark Complete: saves `{ ..., status: 'complete' }`. Completion dot turns green. Pill rail uses `territoryReportsComplete(sub)` for amber/green.
11. Context block is collapsed once textarea has content; "Show context" toggle expands it.
12. No changes to `downtime-views.js`.

---

## Tasks / Subtasks

- [x] Task 1: Duplicate TERRITORY_SLUG_MAP, TERRITORY_DISPLAY, resolveTerrId into downtime-story.js
  - [x] 5 territory IDs (academy, harbour, dockyards, secondcity, northshore)
  - [x] resolveTerrId() — mirrors downtime-views.js but self-contained

- [x] Task 2: parseFeedingTerritories(sub) helper
  - [x] Parses sub.responses?.feeding_territories JSON string safely
  - [x] Returns array of [slugKey, value] pairs
  - [x] Returns [] on parse failure

- [x] Task 3: getCoResidents(territorySlug, thisSub, allSubmissions, allChars) pure function
  - [x] Filters allSubmissions for other subs with feeding_territories[slug] === 'resident'
  - [x] Looks up char in allChars for clan/covenant
  - [x] Returns array of { name, clan, covenant }

- [x] Task 4: getNotableEvents(terrId, thisSub, allSubmissions) pure function
  - [x] Scans all other submissions' projects_resolved for actions in this territory
  - [x] Excludes skipped actions
  - [x] Excludes hide_protect actions where roll.successes > 0
  - [x] Returns array of { characterName, actionType, outcome, successes }

- [x] Task 5: buildTerritoryContext(char, sub, terrId, allSubmissions, allChars) pure function
  - [x] Assembles prompt string for one territory
  - [x] Includes co-residents, own actions, notable events, style rules
  - [x] Omits empty sections gracefully
  - [x] Returns string

- [x] Task 6: territoryReportsComplete(sub) helper
  - [x] Returns true if resident count === 0 (no territory = trivially complete)
  - [x] Returns true if all territory_reports entries are status === 'complete' and count matches resident count

- [x] Task 7: renderTerritoryReports(char, sub, stNarrative, allSubmissions, allChars) renderer
  - [x] Parses feeding_territories to find resident territory slugs
  - [x] Renders one sub-section per resident territory
  - [x] "No resident territory declared" block if none found
  - [x] Each sub-section: territory name header, completion dot, Copy Context, collapsible context block, textarea, Save Draft, Mark Complete
  - [x] Context block collapsed if existing response present
  - [x] Pre-fill with fallback per AC 8

- [x] Task 8: Event delegation for territory_reports section
  - [x] Copy Context → buildTerritoryContext → copyToClipboard (uses data-terr-id on button)
  - [x] Context toggle per sub-section (shared handleContextToggle)
  - [x] Save Draft → saveNarrativeField with inline array update → re-render section
  - [x] Mark Complete → save + re-render + update pill rail using territoryReportsComplete

- [x] Task 9: CSS for territory report section
  - [x] `.dt-story-terr-section` — container for one territory sub-section
  - [x] `.dt-story-terr-header` — territory name + dot + copy button row
  - [x] `.dt-story-terr-name` — territory display name (larger, prominent)
  - [x] `.dt-story-terr-coresidents` — co-resident list block
  - [x] `.dt-story-terr-events` — notable events list block
  - [x] `.dt-story-terr-own-actions` — this character's actions block

---

## Dev Notes

### Renderer signature includes allSubmissions and allChars

Unlike B4 and B5, the territory renderer needs cycle-wide data:

```js
function renderTerritoryReports(char, sub, stNarrative, allSubmissions, allChars) { ... }
```

The caller (the character view re-render function in downtime-story.js) already holds `_allSubmissions` and `_allCharacters` as module-level variables and should pass them in.

### parseFeedingTerritories helper

```js
function parseFeedingTerritories(sub) {
  try {
    return Object.entries(JSON.parse(sub.responses?.feeding_territories || '{}'));
  } catch {
    return [];
  }
}

// Usage:
const residentTerrs = parseFeedingTerritories(sub)
  .filter(([, v]) => v === 'resident')
  .map(([slug]) => ({ slug, id: TERRITORY_SLUG_MAP[slug] || null, name: TERRITORY_DISPLAY[TERRITORY_SLUG_MAP[slug]] || slug }))
  .filter(t => t.id); // drop null (barrens)
```

### Character's own feeding action

Feeding is always in the resident territory. If `sub.feeding_roll` is present and pool was validated (pool_status !== 'skipped'), show it as a context item:

```js
const feedingResolved = sub.st_review?.feeding_status === 'approved'; // or however feeding status is tracked
const feedingPool = sub.feeding_roll?.params?.size
  ? `${sub.feeding_roll.params.size} dice`
  : null;
// Context line: "Feeding — pool: {feedingPool || 'not validated'}"
```

If feeding roll data is absent, omit the feeding line from the context block.

### Notable events — hide/protect exclusion

A hide/protect action is "hidden" if `rev.roll?.successes > 0`. If roll is null (not yet rolled), it is still visible. Skipped actions are always excluded.

```js
const isHidden = rev.action_type === 'hide_protect' && (rev.roll?.successes || 0) > 0;
if (isHidden) return; // exclude from notable events
```

### Legacy st_review.narrative.territory_report

The old narrative panel saved territory report as a single text field at `st_review.narrative.territory_report.text`. This is only used as fallback for index 0:

```js
const legacyText = idx === 0
  ? (sub.st_review?.narrative?.territory_report?.text || '')
  : '';
const existingResponse = stNarrative?.territory_reports?.[idx]?.response || legacyText;
```

### No resident territory edge case

If `residentTerrs.length === 0`, render:

```html
<div class="dt-story-terr-no-territory">
  No resident territory declared this cycle. No territory report required.
</div>
```

`territoryReportsComplete` returns true in this case.

### Pill rail integration

The pill rail update for the territory section must call `territoryReportsComplete(sub)` rather than the generic `isSectionComplete`. The same applies to the sign-off counter. This is parallel to the `projectResponsesComplete` pattern established in B2.

### Action type labels

`ACTION_TYPE_LABELS` is already in downtime-story.js from B2. Use it for notable events display.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-story.js` | Modify: add TERRITORY_SLUG_MAP, TERRITORY_DISPLAY, resolveTerrId, parseFeedingTerritories, getCoResidents, getNotableEvents, buildTerritoryContext, territoryReportsComplete, renderTerritoryReports, event handlers |
| `public/css/admin-layout.css` | Modify: add territory report CSS classes in dt-story-* block |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |
| 2026-04-15 | 1.1 | Implementation complete | claude-sonnet-4-6 |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- Syntax validated with `node --input-type=module --check` — clean
- All 11 function names confirmed present via grep

### Completion Notes List
- Added TERRITORY_SLUG_MAP, TERRITORY_DISPLAY, resolveTerrId at module top (after ACTION_TYPE_LABELS)
- parseFeedingTerritories: safe JSON parse, returns [] on failure
- getCoResidents: scans _allSubmissions, matches by character_id first then displayName
- getNotableEvents: excludes skipped + hide/protect with successes > 0
- buildTerritoryContext: assembles prompt with co-residents, own actions (feeding + projects), notable events, style rules
- territoryReportsComplete: handles zero-territory (trivially complete) and full completion check
- renderTerritoryReports: one dt-story-terr-section per resident territory; no-territory block if none; pre-fills from st_narrative with idx-0 legacy fallback
- isSectionDone territory_reports case updated to call territoryReportsComplete(sub) (replaces stub)
- renderSection switch updated with territory_reports case
- Event delegation: copy/save/complete routes added for territory_reports
- handleCopyTerritoryContext / handleTerritorySave added at end of file
- CSS: terr-section, terr-header, terr-name, terr-coresidents, terr-events, terr-own-actions, terr-list, terr-no-territory

### File List
- `public/js/admin/downtime-story.js` — modified: TERRITORY_SLUG_MAP, TERRITORY_DISPLAY, resolveTerrId, parseFeedingTerritories, getCoResidents, getNotableEvents, buildTerritoryContext, territoryReportsComplete, renderTerritoryReports, handleCopyTerritoryContext, handleTerritorySave; renderSection switch; isSectionDone territory_reports case; event delegation
- `public/css/admin-layout.css` — modified: B6 territory report CSS block
- `specs/stories/sprint-status.yaml` — updated: 1-6-territory-report-section → review
