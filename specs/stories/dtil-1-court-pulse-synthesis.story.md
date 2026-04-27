---
id: dtil.1
epic: dtil
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTIL-1: Court Pulse synthesis prompt-builder and scratchpad

As a Storyteller preparing for the next game session,
I should have a single panel that assembles every player's game-night highlights into a structured LLM prompt I can copy out to the synthesis tool of my choice, then paste the resulting court-mood synthesis back into a scratchpad bound to this cycle,
So that I can lift the gestalt of "what's happening in the city" out of 30 individual prose snippets without re-reading each submission, and so the synthesis is preserved against the cycle for reference during processing and prep.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 4 (DT Intelligence Layer):

> **DTP4.1** — Court Pulse synthesis view. Prompt-builder reads all `game_highlights_*` across cycle's submissions, assembles structured prompt with framing instructions + attributed quotes, renders as copyable block. ST runs externally (LLM tool of choice), pastes synthesis back into scratchpad bound to `cycle.st_court_synthesis_draft`. v1: copy-paste handoff only, no API integration. Prompt template tuned post-ship via use.

The data the prompt assembles from is the per-submission `responses.game_recount_N` fields (1 through 5) — same fields as DTFP-7's mechanical-flag story. Each player's highlights become attributed quotes in the prompt:

> Highlights from <Character display name>:
>   1. <text of game_recount_1>
>   2. <text of game_recount_2>
>   ...

The prompt framing (instructions for the LLM at the top) is a starting template the ST tunes over time via use. DTIL-1 ships v1 wording; later iterations refine.

The scratchpad is a textarea bound to `downtime_cycle.st_court_synthesis_draft` (string). The ST pastes the LLM's output back into the scratchpad; it persists on the cycle document for reference during processing.

**v1 is copy-paste only.** No API integration with any LLM provider. The ST runs the prompt externally in their tool of choice (Claude.ai, ChatGPT, etc.).

### Files in scope

- `public/js/admin/downtime-views.js` — DT Processing tab: add a new panel "Court Pulse" alongside the existing prep / city / submissions sections.
- `server/schemas/` — no change (cycle accepts `st_court_synthesis_draft` via the existing `additionalProperties: true` cycle write path).

### Out of scope

- LLM API integration. v1 is copy-paste.
- Per-character or per-territory pulse synthesis (DTIL-4 covers Territory Pulse separately; player-level isn't useful at this aggregation layer).
- Re-generating the prompt button. The "Copy prompt" button always reads the current state; if highlights change, the player can recopy.
- Auto-summarising or otherwise processing the LLM output. The scratchpad is a free-text store.
- Embedding the synthesis in the published outcome. The synthesis is **ST-internal**, not player-visible.
- Versioning the synthesis. v1 is one draft per cycle; the ST can edit it freely, and the latest save wins.
- Auto-naming or tagging the synthesis with the cycle label. The bound cycle is the implicit context.
- Cross-cycle synthesis (e.g. "show me the Court Pulse from DT2 alongside DT3"). Out of scope.
- Inferring topics or sentiment from the highlights. The prompt's job is to ask the LLM to do that synthesis; we just hand over the data and the framing.

---

## Acceptance Criteria

### Panel placement

**Given** I am an ST viewing the DT Processing tab for the active cycle
**Then** I see a "**Court Pulse**" panel — section header, prompt-builder block, scratchpad textarea — placed alongside the existing prep/city/processing surfaces.
**And** the panel is visible during any cycle status (prep, game, active, closed) — STs may want to start synthesising as soon as some highlights are in.

**Given** there are zero highlights across all submissions in the cycle
**Then** the panel renders with a placeholder: "*No game highlights yet.*"
**And** the scratchpad is still editable.

### Prompt builder

**Given** at least one submission has a non-empty `game_recount_N` field
**Then** the prompt-builder block displays an assembled prompt that contains:
1. **Framing instructions** at the top, telling the LLM what it's reading and what it should produce. Strawman:
   > *"You are reading the game-night highlights of every player who attended the most recent game of a Vampire: The Requiem 2nd Edition LARP. Each highlight is one moment that stood out for that player. Synthesise the gestalt of the night: the dominant moods, recurring themes, social undercurrents, and any notable events that resurface across multiple players' accounts. Write a Court Pulse summary in 250 to 400 words, suitable for the Storyteller's reference. Use British English. Do not invent details not present in the highlights."*
2. **Per-character blocks**, one per submission with at least one highlight, in alphabetical order by character display name. Each block:
   ```
   Highlights from <displayName(char)>:
     1. <game_recount_1 if non-empty>
     2. <game_recount_2 if non-empty>
     ...
   ```
   Empty slots are skipped within a character's block.
3. The block is rendered inside a `<pre>` or `<textarea readonly>` so the entire content can be selected with one keystroke.

**Given** the prompt-builder block has a "**Copy prompt**" button
**When** I click it
**Then** the entire prompt text is copied to the clipboard.
**And** a brief "Copied" indicator appears.

### Scratchpad

**Given** the panel renders
**Then** below the prompt-builder, a textarea labelled "**Court Pulse synthesis (paste here)**" is visible.
**And** the textarea is pre-filled with the saved value of `cycle.st_court_synthesis_draft` (empty string if not set).
**And** the textarea has a Save button (or auto-saves on blur / debounced typing).

**Given** I edit the textarea and save
**Then** `cycle.st_court_synthesis_draft` is updated via PUT `/api/downtime_cycles/:id`.

**Given** I reload the page
**Then** the saved synthesis text is re-pre-filled.

### Visibility / role

**Given** I am authenticated as an ST
**Then** the panel is visible.

**Given** I am authenticated as a player
**Then** the panel is **not** visible (DT Processing tab is ST-only already; this is a defensive check, not a new gate).

### British English / no em-dashes

**Given** any new copy in the panel
**Then** it follows project conventions: British English, no em-dashes.

---

## Implementation Notes

### Panel render

Add a `renderCourtPulsePanel(cycle, submissions, characters)` helper in `downtime-views.js`. Call it from the appropriate panel-orchestration site (locate by reading the DT Processing tab init flow at the top of the file).

```js
function renderCourtPulsePanel(cycle, submissions, characters) {
  const charById = new Map(characters.map(c => [String(c._id), c]));
  const blocks = [];

  // Sort submissions by character display name
  const sorted = submissions
    .filter(sub => {
      for (let n = 1; n <= 5; n++) if ((sub.responses?.[`game_recount_${n}`] || '').trim()) return true;
      return false;
    })
    .map(sub => ({ sub, char: charById.get(String(sub.character_id)) }))
    .sort((a, b) => sortName(a.char || {}).localeCompare(sortName(b.char || {})));

  for (const { sub, char } of sorted) {
    const lines = [];
    for (let n = 1; n <= 5; n++) {
      const txt = (sub.responses?.[`game_recount_${n}`] || '').trim();
      if (txt) lines.push(`  ${lines.length + 1}. ${txt}`);
    }
    blocks.push(`Highlights from ${displayName(char) || 'Unknown'}:\n${lines.join('\n')}`);
  }

  const framing = `You are reading the game-night highlights of every player who attended the most recent game of a Vampire: The Requiem 2nd Edition LARP. Each highlight is one moment that stood out for that player. Synthesise the gestalt of the night: the dominant moods, recurring themes, social undercurrents, and any notable events that resurface across multiple players' accounts. Write a Court Pulse summary in 250 to 400 words, suitable for the Storyteller's reference. Use British English. Do not invent details not present in the highlights.`;

  const prompt = blocks.length
    ? `${framing}\n\n${blocks.join('\n\n')}`
    : '(No game highlights yet.)';

  const synthesis = cycle.st_court_synthesis_draft || '';

  return `
    <section class="dt-court-pulse-panel">
      <h3 class="dt-court-pulse-title">Court Pulse</h3>
      <div class="dt-court-pulse-prompt-block">
        <label class="dt-court-pulse-label">Prompt (copy and paste to your LLM):</label>
        <textarea class="dt-court-pulse-prompt-ta" readonly>${esc(prompt)}</textarea>
        <button type="button" class="dt-court-pulse-copy-btn">Copy prompt</button>
      </div>
      <div class="dt-court-pulse-synthesis-block">
        <label class="dt-court-pulse-label">Court Pulse synthesis (paste here):</label>
        <textarea class="dt-court-pulse-synthesis-ta" placeholder="Paste the LLM's synthesis here…">${esc(synthesis)}</textarea>
        <button type="button" class="dt-court-pulse-save-btn">Save synthesis</button>
        <span class="dt-court-pulse-save-status"></span>
      </div>
    </section>
  `;
}
```

### Click handlers

```js
panel.addEventListener('click', e => {
  const copyBtn = e.target.closest('.dt-court-pulse-copy-btn');
  if (copyBtn) {
    const ta = panel.querySelector('.dt-court-pulse-prompt-ta');
    navigator.clipboard.writeText(ta.value).then(() => {
      // brief "Copied" indicator
    });
    return;
  }

  const saveBtn = e.target.closest('.dt-court-pulse-save-btn');
  if (saveBtn) {
    const ta = panel.querySelector('.dt-court-pulse-synthesis-ta');
    const text = ta.value;
    updateCycle(cycle._id, { st_court_synthesis_draft: text }).then(() => {
      // brief "Saved" indicator
    });
    return;
  }
});
```

### Optional auto-save

If product wants debounced auto-save on the synthesis textarea (matches other ST notes patterns in the file), wire an `input` listener with a 1-second debounce. Otherwise, explicit Save button is fine for v1 — STs are unlikely to forget to save a synthesis they just pasted.

### CSS

Reuse existing tokens. Strawman:

```css
.dt-court-pulse-panel {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--surf2);
  border: 1px solid var(--bdr);
  border-radius: 4px;
}
.dt-court-pulse-title {
  font-family: var(--fh2);
  font-size: .8rem;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--accent);
  margin: 0 0 .75rem;
}
.dt-court-pulse-label {
  display: block;
  font-size: .75rem;
  color: var(--txt2);
  margin-bottom: .35rem;
}
.dt-court-pulse-prompt-ta {
  width: 100%;
  min-height: 240px;
  font-family: var(--fc);          /* monospace if available */
  font-size: .8rem;
  background: var(--surf);
  color: var(--txt);
  border: 1px solid var(--bdr2);
  padding: .5rem;
  resize: vertical;
}
.dt-court-pulse-synthesis-ta {
  width: 100%;
  min-height: 200px;
  font-family: var(--ft);
  font-size: .9rem;
  background: var(--surf);
  color: var(--txt);
  border: 1px solid var(--bdr2);
  padding: .5rem;
  resize: vertical;
}
```

Verify token names; substitute project-canonical equivalents at implementation.

### Prompt tuning

The framing text is a strawman. After the panel ships and STs use it, tune the framing based on what kinds of synthesis the LLM produces. Memory note: "Prompt template tuned post-ship via use." This means: ship v1, learn, refine in a follow-up story (or in-place tuning).

### British English / no em-dashes

Verify the framing text uses British English (no US spellings) and contains no em-dashes. The framing's "synthesise" / "summarise" / etc. are British by default.

### No tests required

UI panel + cycle write. Manual smoke test:
- Open DT Processing on a cycle with several submissions: panel renders prompt with attributed quotes.
- Click Copy prompt: clipboard contains the assembled text.
- Run prompt externally, paste result into synthesis textarea, Save: persists.
- Refresh: synthesis persists.

---

## Files Expected to Change

- `public/js/admin/downtime-views.js` — `renderCourtPulsePanel` helper; placement in DT Processing render orchestration; click handlers for Copy / Save.
- `public/admin.html` — slot for the panel if needed (likely append dynamically to an existing container).
- `public/css/admin-layout.css` — styles for `.dt-court-pulse-*` classes.

No server route changes (existing `PUT /api/downtime_cycles/:id` accepts the new field).

---

## Definition of Done

- All AC verified.
- Manual smoke test on a real cycle: prompt assembles correctly, copy works, scratchpad persists.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtil-1-court-pulse-synthesis: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies. Reads from existing `responses.game_recount_N` fields.
- Independent of every other DTIL story.
