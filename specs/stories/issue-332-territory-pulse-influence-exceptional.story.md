# Issue #332: Territory Pulse -- Influence Contributors and Exceptional Project Successes

Status: done

issue: 332
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/332
branch: morningstar-issue-332-territory-pulse-influence-exceptional

## Story

As an ST generating a Territory Pulse,
I want the prompt to include which characters spent influence or landed exceptional
ambience project successes in the territory,
so that the AI can subtly impress those characters' vibes on the territory's prose.

## Acceptance Criteria

1. A character with positive influence spend on a territory appears under
   "Positive influence contributors" in that territory's prompt (name + amount + clan/covenant).
2. A character with negative influence spend appears under "Negative influence contributors".
3. A character with a validated exceptional ambience project in the territory appears
   under "Exceptional ambience project successes" (name + clan/covenant).
4. If none exist for a territory, those sections read "None this cycle." — consistent
   with the existing disciplines and feeders sections.
5. Non-exceptional ambience projects do not appear in the exceptional section.

## Tasks / Subtasks

- [x] Task 1 -- Add influence contributors and exceptional project sections to
      `_buildTerritoryPulsePromptText` (AC: 1, 2, 3, 4, 5)
  - [x] Gather positive and negative influence contributors for the territory from
        `sub.responses?.influence_spend` (JSON-parsed); include character name,
        clan, covenant, and spend amount
  - [x] Gather exceptional ambience project contributors from `sub.projects_resolved`
        filtered by `_isAmbienceAction`, `proj.roll?.exceptional`, `proj.pool_status === 'validated'`,
        and `_resolveProjectTerritory(sub, pIdx) === territory.slug`; include name, clan, covenant
  - [x] Append both sections to the `lines` array before `return lines.join('\n')`

## Dev Notes

### File to modify

**Single file: `public/js/admin/downtime-views.js`**

Only `_buildTerritoryPulsePromptText` (line 2509) changes. No UI, no save handlers,
no other functions.

---

### Current function (lines 2509-2548) — read before editing

```js
function _buildTerritoryPulsePromptText(cycle, territory, subs, charById) {
  const ambience = _territoryAmbienceLabel(territory);
  const oid = _terrOidForSlug(territory.slug);
  const profile  = (oid && cycle?.discipline_profile?.[oid]) || {};
  const discsUsed = Object.entries(profile)
    .filter(([, c]) => c > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  const feeders = [];
  for (const sub of subs || []) {
    if (!_feedTerrIdsForSub(sub).includes(territory.slug)) continue;
    const char = charById.get(String(sub.character_id));
    const name = (char ? dropdownName(char) : null) || sub.character_name || 'Unknown';
    const method = sub.responses?._feed_method || sub.responses?.feed_method || '';
    feeders.push({ name, method, sortKey: char ? sortName(char) : (sub.character_name || '') });
  }
  feeders.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const framing = `You are writing a Territory Pulse for ${territory.name} in a Vampire: The Requiem 2nd Edition LARP. ...`;

  const lines = [
    framing,
    '',
    `Territory: ${territory.name}`,
    `Current ambience: ${ambience}`,
    '',
    'Disciplines used in this territory this cycle:',
    discsUsed.length
      ? discsUsed.map(([d, c]) => `  - ${d} (used ${c} time${c === 1 ? '' : 's'})`).join('\n')
      : '  None recorded this cycle.',
    '',
    'Players who fed here this cycle:',
    feeders.length
      ? feeders.map(f => `  - ${f.name}${f.method ? ` (${f.method})` : ''}`).join('\n')
      : '  None recorded this cycle.',
  ];
  return lines.join('\n');
}
```

---

### Task 1 detail -- exact additions

Add two new data-gathering blocks **after** the feeders sort and **before** the
`const framing` line. Then append two new sections to `lines`.

**Influence contributors** — parse `influence_spend` the same way `_gatherInfluence`
does (line 3809). The keys are `the_*` slugs; use `resolveTerrId(k)` to normalise
and compare against `territory.slug`. Values are numbers: positive = pos contributor,
negative = neg contributor.

**Exceptional ambience** — iterate `sub.projects_resolved`, apply the same filters
used in `recomputeDisciplineProfile` (lines 3594-3610): `proj.pool_status === 'validated'`,
`_isAmbienceAction(actionType)`, `proj.roll?.exceptional`. Resolve territory via
`_resolveProjectTerritory(sub, pIdx)` and compare against `territory.slug`.

**Character identity line** — for both sections, use:
```js
const char = charById.get(String(sub.character_id));
const name = (char ? dropdownName(char) : null) || sub.character_name || 'Unknown';
const clan = char?.clan || '';
const covenant = char?.covenant || '';
const identity = [name, clan, covenant].filter(Boolean).join(', ');
```

**After (complete replacement of the function body from the feeders sort onward):**

```js
  feeders.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // Influence contributors for this territory
  const infPos = [], infNeg = [];
  for (const sub of subs || []) {
    let infObj = {};
    try { infObj = JSON.parse(sub.responses?.influence_spend || '{}'); } catch { infObj = {}; }
    for (const [k, v] of Object.entries(infObj)) {
      if (resolveTerrId(k) !== territory.slug) continue;
      const val = Number(v) || 0;
      if (!val) continue;
      const char = charById.get(String(sub.character_id));
      const name = (char ? dropdownName(char) : null) || sub.character_name || 'Unknown';
      const identity = [name, char?.clan, char?.covenant].filter(Boolean).join(', ');
      if (val > 0) infPos.push(`  - ${identity} (+${val})`);
      else         infNeg.push(`  - ${identity} (${val})`);
    }
  }

  // Exceptional ambience project successes for this territory
  const exceptionalAmb = [];
  for (const sub of subs || []) {
    for (const [pIdx, proj] of (sub.projects_resolved || []).entries()) {
      if (proj?.pool_status !== 'validated') continue;
      if (!proj?.roll?.exceptional) continue;
      const actionType = proj.action_type_override || proj.action_type;
      if (!_isAmbienceAction(actionType)) continue;
      if (_resolveProjectTerritory(sub, pIdx) !== territory.slug) continue;
      const char = charById.get(String(sub.character_id));
      const name = (char ? dropdownName(char) : null) || sub.character_name || 'Unknown';
      const identity = [name, char?.clan, char?.covenant].filter(Boolean).join(', ');
      exceptionalAmb.push(`  - ${identity}`);
    }
  }

  const framing = `You are writing a Territory Pulse for ${territory.name} ...`;  // unchanged

  const lines = [
    framing,
    '',
    `Territory: ${territory.name}`,
    `Current ambience: ${ambience}`,
    '',
    'Disciplines used in this territory this cycle:',
    discsUsed.length
      ? discsUsed.map(([d, c]) => `  - ${d} (used ${c} time${c === 1 ? '' : 's'})`).join('\n')
      : '  None recorded this cycle.',
    '',
    'Players who fed here this cycle:',
    feeders.length
      ? feeders.map(f => `  - ${f.name}${f.method ? ` (${f.method})` : ''}`).join('\n')
      : '  None recorded this cycle.',
    '',
    'Positive influence contributors this cycle:',
    infPos.length ? infPos.join('\n') : '  None this cycle.',
    '',
    'Negative influence contributors this cycle:',
    infNeg.length ? infNeg.join('\n') : '  None this cycle.',
    '',
    'Exceptional ambience project successes this cycle:',
    exceptionalAmb.length ? exceptionalAmb.join('\n') : '  None this cycle.',
  ];
  return lines.join('\n');
```

---

### Key helpers available in scope (do not reimplement)

- `resolveTerrId(raw)` — normalises territory string → canonical TERRITORY_DATA slug
- `_resolveProjectTerritory(sub, pIdx)` (line 10360) — returns slug or null
- `_isAmbienceAction(actionType)` (line 151) — tests against `_AMBIENCE_ACTION_TYPES` set
- `dropdownName(char)` — display name for a character object
- `charById` — `Map<String(_id), char>` already built by the caller; passed in as arg

### What NOT to change

- The `framing` string — unchanged
- `_feedTerrIdsForSub`, `_terrOidForSlug`, `_territoryAmbienceLabel` — unchanged
- `renderTerritoryPulsePanel`, save/copy handlers — unchanged
- Everything else in `downtime-views.js`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Task 1: Added `infPos`/`infNeg` influence loop (parses `influence_spend` per-sub, resolves slug, buckets pos/neg with identity string). Added `exceptionalAmb` loop (walks `projects_resolved`, filters validated + exceptional + ambience action type + territory match). Both loops append identity as `name, clan, covenant`. Three new sections appended to `lines` array. Parse check clean.

### File List

- `public/js/admin/downtime-views.js` (modify: `_buildTerritoryPulsePromptText`, lines 2509-2548)
- `tests/issue-332-territory-pulse-influence-exceptional.spec.js` (new: 16 Playwright tests, all green)
