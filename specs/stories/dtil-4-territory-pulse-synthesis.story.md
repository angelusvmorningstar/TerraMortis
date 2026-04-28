---
id: dtil.4
epic: dtil
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTIL-4: Territory Pulse synthesis per territory in DT City view

As a Storyteller publishing per-territory atmosphere to the players who fed there,
I should generate one Territory Pulse synthesis per territory per cycle from a structured prompt that includes that territory's ambience, the disciplines used in it, and its feeders this cycle, then paste the LLM output back into the territory's pulse draft on the cycle, so it interleaves into each feeder's published Feeding section,
So that I do not have to author a bespoke "what was it like in your feeding ground this cycle" letter for every player — I write one synthesis per territory and it broadcasts to all the feeders there.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 4 (DT Intelligence Layer):

> **DTP4.4** — Territory Pulse. Per-territory generic LLM snapshot. Generated in DT City view (one snapshot per territory per cycle). Prompt-builder reads territory ambience + powers used in territory + feeder list. ST runs externally, pastes back to `cycle.territory_pulse[territory_id].draft`. At publish time, each feeder's published outcome includes the relevant territory snapshot. Replaces old per-player customised territory letter — much lower production load.

The intent is to **collapse the per-player territory letter into a per-territory broadcast**. Each territory gets a single ST-authored pulse this cycle; every player who fed in that territory receives that same pulse interleaved into their Feeding section.

Data shape:
```js
cycle.territory_pulse = {
  '<territory_id>': {
    prompt_snapshot: '<the assembled prompt at the moment ST ran it>',  // optional, for reference
    draft:           '<the LLM output the ST pasted back>',
    last_edited_at:  ISO string,
  },
  // ...
}
```

The prompt incorporates:
- The territory's current ambience (the modifier tier).
- Powers/disciplines used in the territory this cycle (across all feeding rolls and projects targeting it).
- The list of feeders (character display names who fed there).
- Optional: any feeding narratives or notable events from those feeders' submissions.

At publish time, `compilePushOutcome` is extended to inject the relevant territory pulse(s) into each feeder's Feeding section based on which territory(ies) they fed in.

### Files in scope

- `public/js/admin/city-views.js` — DT City view (note: `renderCityOverview` is in `downtime-views.js` at line 8757; the city sub-view code is in `city-views.js` per the import at line 8 of `downtime-story.js`. Verify at implementation; the panel goes in whichever DT City surface is appropriate).
- `public/js/admin/downtime-views.js` — `compilePushOutcome` (line 2913): inject relevant territory pulse(s) into each feeder's Feeding section at publish time.
- `public/js/admin/downtime-story.js` — same `compilePushOutcome` if that's where the canonical implementation lives; verify which file owns the publish blob.
- `server/routes/downtime.js` — no new route (existing `PUT /api/downtime_cycles/:id` accepts the new field).

### Out of scope

- Per-player customisation of territory pulse. Memory locks the broadcast model: one pulse per territory per cycle.
- LLM API integration. Copy-paste only.
- Auto-tagging which players fed in which territory (the data is already there; we just read it).
- Cross-cycle territory pulse continuity (e.g. "remind the LLM what the Academy felt like last cycle"). v1 is per-cycle isolated; the prompt does not include prior cycles' pulses.
- Territory Pulse for territories with zero feeders this cycle. Still generate the prompt (it covers ambience + powers used + empty feeder list) so the ST can author atmospheric description even with no feeders, but don't auto-broadcast because there's no one to broadcast to.
- Per-territory variations within the same cycle (e.g. "the Academy felt different to Vincent than to Magda"). The single broadcast is intentional.
- Validation that the ST has authored a pulse for every feeder's territory before publishing. v1 publishes whatever is authored; a missing pulse means the player's Feeding section just has no territory broadcast (acceptable).
- Replacing the existing territory_reports section workflow. v1 layers Territory Pulse on top; if territory_reports becomes redundant, retire it in a follow-up.

---

## Acceptance Criteria

### Panel placement

**Given** I am an ST viewing the DT City view (in DT Processing) for the active cycle
**Then** I see a "**Territory Pulse**" panel listing one row per territory in the city.
**And** the panel renders for any cycle status.

### Per-territory rows

**Given** the Territory Pulse panel renders
**Then** for each territory (Academy, Harbour, Dockyards, Second City, North Shore — the five that can be fed in; Barrens excluded if it cannot be fed in, otherwise included), there is a row with:
- The territory name and current ambience tier.
- A "Build prompt" / "Show prompt" affordance that expands an inline prompt-builder block.
- A scratchpad textarea for the synthesis draft, pre-filled with `cycle.territory_pulse[territory_id].draft`.
- A small Save button or auto-save on blur.

**Given** I expand the prompt-builder for a territory
**Then** the assembled prompt contains:
1. **Framing instructions**:
   > *"You are writing a Territory Pulse for the <Territory Name> in a Vampire: The Requiem 2nd Edition LARP. The pulse describes the current atmosphere of the territory after a cycle of activity. Write 100 to 200 words of atmospheric prose covering what the place feels like right now, any rumours running through it, and how the recent activity has shaped its mood. Use British English. Do not invent specific characters or events not present in the inputs."*
2. **Territory state**:
   > *Territory: <Territory Name>*
   > *Current ambience: <ambience tier label>*
3. **Disciplines used here this cycle** (across feeding rolls, projects, sorcery, merit actions targeting this territory):
   > *Disciplines used in this territory this cycle:*
   > *  - Auspex (×3 by various)*
   > *  - Vigour (×1 by Vincent)*
4. **Feeders this cycle**:
   > *Players who fed here this cycle:*
   > *  - Magda Marx (Familiar Face)*
   > *  - Bertram Crewe (Stalking)*

**Given** there are zero disciplines or zero feeders for a territory
**Then** the corresponding section of the prompt simply says "*None recorded this cycle.*"

### Copy and persistence

**Given** I click "**Copy prompt**" on a territory row
**Then** the assembled prompt is copied to clipboard.

**Given** I paste the LLM's output into the textarea and click Save
**Then** `cycle.territory_pulse[territory_id]` is updated with `{ prompt_snapshot: <prompt at this save>, draft: <pasted text>, last_edited_at: <iso> }`.
**And** the persistence happens via PUT `/api/downtime_cycles/:id`.

**Given** I reload the page
**Then** the saved pulse text is pre-filled.

### Publish-time injection

**Given** an ST publishes a submission via the existing publish flow
**When** `compilePushOutcome(sub)` runs
**Then** for each territory the submission's `feeding_review` indicates the player fed in:
- Look up `cycle.territory_pulse[territory_id].draft`.
- If non-empty, append the pulse text to the **Feeding** section of the published outcome, with a heading like `### Territory Pulse — <Territory Name>`.

**Given** a submission whose player fed in two territories
**Then** both relevant pulses are injected, in territory order (or alphabetical), each with its own subheading.

**Given** the ST has not authored a pulse for one of the territories the player fed in
**Then** that territory's pulse section is **omitted** (no placeholder, no gap text).

**Given** the player did not feed (status `no_feed`)
**Then** **no** pulses are injected (Feeding section in the published outcome has its existing handling).

**Given** the cycle has a `cycle.territory_pulse` field but it's an empty object
**Then** no pulses are injected anywhere; the publish outcome is unchanged from the no-pulse case.

### Visibility / role

**Given** I am authenticated as a player
**Then** the Territory Pulse panel is **not** visible (DT City is ST-only).
**But** the player **does** see the broadcast pulse text in their published Feeding section.

### British English / no em-dashes

**Given** any new copy
**Then** it follows project conventions.

---

## Implementation Notes

### Reading territory feeders

Determine which territories a submission fed in. Today's `feeding_review` carries the validated pool and result; the territory selection lives in the player's response (`responses` has territory selection in some shape — verify in `tabs/feeding-tab.js` or `tabs/downtime-form.js`'s feeding section). At minimum:

```js
function feedTerritoriesForSub(sub) {
  // Reads from sub.responses or sub.feeding_review depending on canonical location
  const terr = sub.responses?.feeding_territory || sub.feeding_review?.territory;
  return terr ? [terr] : [];
}
```

Multi-territory feeders may exist (e.g. someone fed in two places via a special merit). Verify how this is stored; the helper should return the array.

### Building the prompt

```js
function buildTerritoryPulsePrompt(cycle, territoryId, territoryName, submissions) {
  // Find ambience for this territory
  const ambience = cycle.ambience_overrides?.[territoryId] || lookupBaseAmbience(territoryId);

  // Collect disciplines used in this territory across all submissions
  const discsUsed = new Map(); // discName -> { count, by: Set<charName> }
  for (const sub of submissions) {
    // Feeding rolls
    if (feedTerritoriesForSub(sub).includes(territoryId) && sub.feeding_review?.disc) {
      addDiscEntry(discsUsed, sub.feeding_review.disc, sub.character_name);
    }
    // Project actions targeting this territory
    for (const rev of sub.projects_resolved || []) {
      if (rev.territory_id === territoryId && rev.disc_used) {
        addDiscEntry(discsUsed, rev.disc_used, sub.character_name);
      }
    }
    // Merit actions targeting this territory (similar pattern)
  }

  // Collect feeders
  const feeders = submissions
    .filter(sub => feedTerritoriesForSub(sub).includes(territoryId))
    .map(sub => ({
      name: sub.character_name || displayName(charById.get(sub.character_id)),
      method: sub.responses?._feed_method || sub.responses?.feed_method || '(unspecified)',
    }));

  // Assemble prompt
  const lines = [
    `You are writing a Territory Pulse for the ${territoryName} in a Vampire: The Requiem 2nd Edition LARP. The pulse describes the current atmosphere of the territory after a cycle of activity. Write 100 to 200 words of atmospheric prose covering what the place feels like right now, any rumours running through it, and how the recent activity has shaped its mood. Use British English. Do not invent specific characters or events not present in the inputs.`,
    '',
    `Territory: ${territoryName}`,
    `Current ambience: ${ambience}`,
    '',
    'Disciplines used in this territory this cycle:',
    discsUsed.size
      ? [...discsUsed.entries()].map(([d, info]) => `  - ${d} (${info.count}× by ${[...info.by].join(', ')})`).join('\n')
      : '  None recorded this cycle.',
    '',
    'Players who fed here this cycle:',
    feeders.length
      ? feeders.map(f => `  - ${f.name} (${prettyMethod(f.method)})`).join('\n')
      : '  None recorded this cycle.',
  ];

  return lines.join('\n');
}
```

The exact data sources need verification at implementation; the structure is locked.

### Publish-time injection

In `compilePushOutcome` at the feeding section branch (lines 2923-2932 in `downtime-story.js`), after the existing feeding narrative inclusion (DTSR-7), append the territory pulse(s):

```js
if (key === 'feeding_validation') {
  // ... existing feeding narrative inclusion (DTSR-7) ...

  // Territory pulses
  const cycle = lookupCycle(sub.cycle_id);
  const territories = feedTerritoriesForSub(sub);
  for (const terrId of territories) {
    const pulse = cycle?.territory_pulse?.[terrId]?.draft;
    if (pulse?.trim()) {
      parts.push(`### Territory Pulse — ${territoryName(terrId)}\n\n${pulse.trim()}`);
      hasContent = true;
    }
  }
  continue;
}
```

`compilePushOutcome` will need access to the cycle document. If it does not currently have it, pass the cycle as an additional argument from the publish caller.

### Panel render

Add a new helper in `city-views.js` (or wherever DT City sub-views live):

```js
function renderTerritoryPulsePanel(cycle, submissions, characters) {
  const territories = TERRITORIES_LIST; // import from constants
  const pulseMap = cycle.territory_pulse || {};

  let h = `<section class="dt-territory-pulse-panel">`;
  h += `<h3 class="dt-territory-pulse-title">Territory Pulse</h3>`;

  for (const terr of territories) {
    const pulse = pulseMap[terr.id] || {};
    const draft = pulse.draft || '';
    const promptText = buildTerritoryPulsePrompt(cycle, terr.id, terr.name, submissions);

    h += `<div class="dt-territory-pulse-row" data-terr-id="${esc(terr.id)}">`;
    h += `<div class="dt-territory-pulse-row-head">`;
    h += `<span class="dt-territory-pulse-name">${esc(terr.name)}</span>`;
    h += `<button class="dt-territory-pulse-toggle-prompt">Show prompt</button>`;
    h += `</div>`;
    h += `<div class="dt-territory-pulse-prompt-block" style="display:none">`;
    h += `<textarea class="dt-territory-pulse-prompt-ta" readonly>${esc(promptText)}</textarea>`;
    h += `<button class="dt-territory-pulse-copy-btn" data-prompt-snapshot="${esc(promptText)}">Copy prompt</button>`;
    h += `</div>`;
    h += `<textarea class="dt-territory-pulse-draft-ta" placeholder="Paste the LLM's pulse here…">${esc(draft)}</textarea>`;
    h += `<button class="dt-territory-pulse-save-btn">Save</button>`;
    h += `</div>`;
  }

  h += `</section>`;
  return h;
}
```

### Save handler

```js
async function saveTerritoryPulse(cycle, terrId, draft, promptSnapshot) {
  const map = { ...(cycle.territory_pulse || {}) };
  map[terrId] = {
    prompt_snapshot: promptSnapshot,
    draft,
    last_edited_at: new Date().toISOString(),
  };
  await updateCycle(cycle._id, { territory_pulse: map });
  cycle.territory_pulse = map;
}
```

### CSS

Reuse existing tokens. Strawman:

```css
.dt-territory-pulse-panel { margin-top: 1.5rem; padding: 1rem; background: var(--surf2); border: 1px solid var(--bdr); border-radius: 4px; }
.dt-territory-pulse-row { padding: .75rem 0; border-bottom: 1px solid var(--bdr); }
.dt-territory-pulse-row:last-child { border-bottom: none; }
.dt-territory-pulse-name { font-family: var(--fh2); font-size: .9rem; color: var(--accent); }
.dt-territory-pulse-prompt-ta { width: 100%; min-height: 200px; font-family: var(--fc); font-size: .8rem; }
.dt-territory-pulse-draft-ta { width: 100%; min-height: 150px; font-family: var(--ft); font-size: .9rem; margin-top: .5rem; }
```

### British English

All copy uses British English; no em-dashes.

### No tests required

UI + cycle write + publish-time blob change. Manual smoke test:
- Open DT City on a cycle with active feeders.
- Open Territory Pulse panel: every territory row visible with assembled prompt.
- Copy a prompt, run externally, paste back into draft, Save: persists.
- Refresh: draft persists.
- Publish a submission whose player fed in that territory: published outcome's Feeding section includes the pulse subheading + text.
- Submission whose player did NOT feed in that territory: published outcome unchanged for that territory.

---

## Files Expected to Change

- `public/js/admin/city-views.js` — `renderTerritoryPulsePanel` helper; placement in DT City render orchestration; click handlers.
- `public/js/admin/downtime-story.js` (or `downtime-views.js`) — `compilePushOutcome` extended to inject territory pulses into the Feeding section.
- `public/css/admin-layout.css` — styles for `.dt-territory-pulse-*`.

No server route changes; existing PUT accepts the new field.

---

## Definition of Done

- All AC verified.
- Manual smoke test: full round-trip from prompt copy to publish-time injection.
- No regression on submissions whose territory has no pulse authored.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtil-4-territory-pulse-synthesis: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- Independent of DTIL-1 (Court Pulse) and DTIL-2/DTIL-3 (Action Queue). All four panels are independent surfaces.
- Compatible with DTSR-7 (feeding narrative): both append to the Feeding section of the published outcome; ordering is feeding narrative first, then territory pulses (per cycle's editorial preference; tunable at implementation).
- Closes Epic DTIL when shipped.
