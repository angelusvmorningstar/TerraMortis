---
id: dtsr.8
epic: dtsr
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTSR-8: Player flag UI on Story view sections

As a player reading my published downtime narrative,
I should be able to flag any section as having a problem (Inconsistent / Wrong story / Other), with a short reason,
So that my Storytellers see the flag in their inbox and can review or correct the section without me needing to chase them through Discord.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 1 (Story Surface Reform). The current player Story view (`public/js/tabs/story-tab.js`) is read-only. If a player notices a name spelling problem, a logical inconsistency with their submission, or simply doesn't recognise the events depicted, they have to message an ST out-of-band. DTSR-8 surfaces a per-section flag affordance so the player can register the concern in-band, and DTSR-9 builds the ST inbox that surfaces those flags.

Strawman flag categories (final at implementation; these are the locked starting set):

- **Inconsistent** — facts contradict the player's submission, character knowledge, or other in-world canon.
- **Wrong story** — the events described don't match what the player intended or remembers.
- **Other** — catch-all with required reason text.

The flag is **per section**, not per submission, so the ST can see exactly which Story Moment / Project / Rumour / Feeding the player is querying. The flag carries a short text reason (mandatory for "Other"; optional for the two specific categories but encouraged).

The flag is a **lightweight communication channel**, not a workflow gate. Flagging does not unpublish the section, does not block other actions, does not auto-edit anything. The ST sees the flag, decides what to do, optionally edits via DTSR-4's inline edit, and clears the flag (DTSR-9 handles ST-side resolution).

### Files in scope

- `public/js/tabs/story-tab.js` — primary surface:
  - `renderOutcomeWithCards` (line 213) and per-section render helpers (`renderStoryMoment`, `renderHomeReportSection`, `renderRumoursSection`, project card renderer): add a small "Flag for review" affordance to each section.
  - Flag form: a small modal or inline expanding form with category radio + reason textarea + Submit / Cancel buttons.
  - Local state: optimistic update so the player sees their flag immediately, then API confirms.
- `server/routes/downtime.js` — new endpoint `POST /api/downtime_submissions/:id/section-flag` (or extend an existing route).
- `server/schemas/downtime_submission.schema.js` — add `section_flags` array to the submission schema (or accept via `additionalProperties`).
- New API in `public/js/data/api.js` — none required if the existing `apiPost` is used directly.

### Out of scope

- ST inbox / review queue UI (**DTSR-9**'s territory).
- Auto-notification (Discord webhook, email) on flag creation. v1: ST sees flags on next page load of the inbox. Notification can be added as a follow-up.
- Per-flag conversation threading (player + ST replies). v1 is one-shot: player flags; ST resolves; flag is closed. If discussions become useful, layer on later.
- Rate limiting on flag creation. At our 30-player scale, rate limiting is overkill.
- Flag history viewer for the player. The player sees their own flags inline on the Story view; no separate "my flags" tab.
- Editing a flag after submission. If the player needs to revise, they delete and resubmit. Or they can submit a follow-up Other flag.
- Flagging at sub-section granularity (e.g. flagging a single project card within a Project Reports section). v1 flags the section as a whole; the player describes the specific issue in the reason text.

---

## Acceptance Criteria

### Visibility and gating

**Given** I am a player viewing my Story tab Chronicle pane
**When** any chronicle entry renders
**Then** each section within that entry has a small "**Flag for review**" affordance — a button or icon link, visually subtle, near the section header.

**Given** I am an ST viewing the same surface (either as ST or via the lst-6 ST-as-player toggle)
**Then** the Flag for review affordance is **not** visible (STs use DTSR-4 inline edit and DTSR-9 inbox instead).

**Given** the Chronicle entry is for a cycle I do not own (e.g. the player view receives a different character's submission via some future shared surface)
**Then** the Flag for review affordance is **not** visible — only the owning player can flag their own sections.

### Flag form

**Given** I click Flag for review on a section
**Then** an inline form (or modal) appears containing:
- Three radio options: "**Inconsistent**", "**Wrong story**", "**Other**".
- A reason textarea (~3 rows). Label changes based on category — for Inconsistent: "What's inconsistent?"; for Wrong story: "What should the story have shown?"; for Other: "Tell your Storyteller what's up." Placeholder optional.
- A Submit button (disabled until a category is chosen; for Other, also disabled until the reason has at least 5 non-whitespace characters).
- A Cancel button.

**Given** I click Cancel
**Then** the form closes; no API call is made.

**Given** I click Submit on a valid form
**Then** the flag is sent to the server (POST `/api/downtime_submissions/:id/section-flag` with body `{ section_key, section_idx?, category, reason }`).
**And** on success, the form closes and the flag is shown inline on the section (a small badge or row: "**Flagged: Inconsistent — '<reason snippet>'**" with a Clear button so the player can recall the flag).
**And** the flag persists across page reloads.

**Given** the API call fails
**Then** the form remains open with an error message; the player can retry or cancel.

### Per-section attribution

**Given** the Story Moment section
**Then** flagging it sends `section_key: 'story_moment'`.

**Given** an individual Project card (e.g. project slot 2)
**Then** flagging it sends `section_key: 'project_responses'`, `section_idx: 1` (0-based).

**Given** an individual Rumour line
**Then** flagging it sends `section_key: 'cacophony_savvy'` (or `'rumours'` if DTSR-1's rename has propagated to the parsed-section identifier in the player view), `section_idx: <index>`.

**Given** the Feeding section
**Then** flagging it sends `section_key: 'feeding_validation'`.

**Given** the Home Report section
**Then** flagging it sends `section_key: 'home_report'`.

**Given** the Allies & Asset Summary section
**Then** flagging it sends `section_key: 'merit_summary'`.

(Use whatever section keys the existing `parseOutcomeSections` and `compilePushOutcome` agree on; this list is the strawman.)

### Persistence shape

**Given** the server receives a flag submission
**Then** it appends an entry to `submission.section_flags`:
```js
{
  _id:          '<server-generated id>',
  section_key:  string,
  section_idx:  number | null,
  category:     'inconsistent' | 'wrong_story' | 'other',
  reason:       string,
  created_at:   ISO string,
  player_id:    string (the flagging player),
  status:       'open',                              // 'resolved' set by DTSR-9
  resolved_at:  null,
  resolution_note: null,
}
```

**Given** the player flags a section that already has an open flag from them
**Then** the new flag is appended (no de-duplication); the player is signalling renewed concern. Repeated flags are visually grouped on display.

**Given** I (the player) click Clear on one of my open flags
**Then** the flag's `status` is set to `'recalled'` (or the row is hard-deleted — design call at implementation; recalled is safer for ST visibility into "the player changed their mind").

### Server-side scope

**Given** the new endpoint receives a flag submission
**Then** it verifies:
- The caller is authenticated.
- The caller is the player who owns the submission's character (`req.user.character_ids` includes `submission.character_id`).
- If the caller does not own the submission, the endpoint returns 403 with no flag persisted.

**Given** the endpoint is called by an ST role
**Then** it rejects with 403 (STs do not flag; they resolve via DTSR-9). This is a defensive default; can loosen if STs want to self-flag for visibility, but not in v1.

### Visual

**Given** a section has zero open flags by me
**Then** the Flag for review affordance is just a quiet button/link (no badge, no count).

**Given** a section has open flags by me
**Then** a small inline indicator appears near the section header: "**Flagged: <category>**" with a clickable to expand the reason text and a Clear button.

### British English / no em-dashes

**Given** any displayed copy on the flag UI
**Then** it follows project conventions: British English spelling, no em-dashes (use commas, en-dashes, or rephrase).

---

## Implementation Notes

### Server endpoint

Add to `server/routes/downtime.js`:

```js
router.post('/api/downtime_submissions/:id/section-flag', requireAuth, async (req, res) => {
  const sub = await getSubmission(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Not found' });

  // Ownership check
  if (req.user.role !== 'player') return res.status(403).json({ error: 'Only players may flag' });
  const ownsCharacter = (req.user.character_ids || []).map(String).includes(String(sub.character_id));
  if (!ownsCharacter) return res.status(403).json({ error: 'Not your submission' });

  const { section_key, section_idx, category, reason } = req.body;
  if (!section_key || !category) return res.status(400).json({ error: 'section_key and category required' });
  if (!['inconsistent', 'wrong_story', 'other'].includes(category)) return res.status(400).json({ error: 'invalid category' });
  if (category === 'other' && (!reason || reason.trim().length < 5)) return res.status(400).json({ error: 'reason required for other' });

  const flag = {
    _id: new ObjectId().toString(),
    section_key,
    section_idx: section_idx == null ? null : Number(section_idx),
    category,
    reason: (reason || '').trim(),
    created_at: new Date().toISOString(),
    player_id: req.user._id || req.user.id,
    status: 'open',
    resolved_at: null,
    resolution_note: null,
  };

  await pushSubmissionFlag(req.params.id, flag);
  res.json(flag);
});
```

The exact code style should follow the existing route patterns in `server/routes/downtime.js`; the above is structural, not literal.

### Schema update

Add to `server/schemas/downtime_submission.schema.js`:

```js
section_flags: {
  type: 'array',
  items: {
    type: 'object',
    required: ['_id', 'section_key', 'category', 'created_at', 'player_id', 'status'],
    properties: {
      _id:             { type: 'string' },
      section_key:     { type: 'string' },
      section_idx:     { type: ['integer', 'null'] },
      category:        { type: 'string', enum: ['inconsistent', 'wrong_story', 'other'] },
      reason:          { type: 'string' },
      created_at:      { type: 'string' },
      player_id:       { type: 'string' },
      status:          { type: 'string', enum: ['open', 'resolved', 'recalled'] },
      resolved_at:     { type: ['string', 'null'] },
      resolution_note: { type: ['string', 'null'] },
    },
    additionalProperties: true,
  },
},
```

### Client renderer

Inject the Flag affordance in each per-section render helper inside `story-tab.js`. Reuse a small helper:

```js
function renderFlagAffordance(subId, sectionKey, sectionIdx, openFlags) {
  if (!isOwningPlayer(subId)) return '';
  const flagged = openFlags.length > 0;
  if (flagged) {
    return `<div class="story-section-flagged">
      <span class="story-section-flagged-label">Flagged: ${esc(openFlags[0].category)}</span>
      <button class="story-section-flag-expand" data-sub-id="${esc(subId)}" data-section-key="${esc(sectionKey)}" data-section-idx="${esc(sectionIdx)}">View</button>
    </div>`;
  }
  return `<button class="story-section-flag-btn" data-sub-id="${esc(subId)}" data-section-key="${esc(sectionKey)}" data-section-idx="${esc(sectionIdx)}">Flag for review</button>`;
}
```

Wire a click handler on `.story-section-flag-btn` that opens the form (modal or inline expansion). On Submit, call:

```js
const flag = await apiPost(`/api/downtime_submissions/${subId}/section-flag`, {
  section_key,
  section_idx,
  category,
  reason,
});
// optimistic local update + re-render
```

### Owning-player check

`isOwningPlayer(subId)` reads from the local character context: the current viewer's character ids vs the submission's `character_id`. The user identity is available via `auth/discord.js` (or whatever the player view uses today; verify at implementation).

### Strawman wording

- Affordance label: "**Flag for review**"
- Form heading: "Tell your Storyteller about a problem with this section"
- Category labels: "Inconsistent", "Wrong story", "Other"
- Per-category reason prompt: as listed above in AC
- Inline flagged indicator: "**Flagged: Inconsistent**" / "**Flagged: Wrong story**" / "**Flagged: Other**"
- Clear button: "Recall flag"

### No tests required

UI + new endpoint. Manual smoke test:
- As a player, open Story tab, click Flag for review on the Story Moment section, choose Inconsistent, write a reason, Submit. Refresh: flag persists with the inline indicator.
- Click Recall flag: status changes to recalled; affordance returns to its unflagged state.
- As an ST, verify Flag for review affordance is not visible.

A server-side test covering the four-case auth gate (unauthenticated / wrong-character player / right-character player / ST) would be a useful follow-up. Not blocking.

---

## Files Expected to Change

- `public/js/tabs/story-tab.js` — Flag affordance per section, flag form (modal or inline), submit/cancel/recall handlers, owning-player check.
- `server/routes/downtime.js` — `POST /api/downtime_submissions/:id/section-flag` and `PATCH` (or DELETE) for recall.
- `server/schemas/downtime_submission.schema.js` — `section_flags` array shape.
- `public/css/` — small styles for `.story-section-flag-btn`, `.story-section-flagged`, the flag form. Reuse existing tokens.

No DT Story tab changes in this story (DTSR-9 is the inbox).

---

## Definition of Done

- All AC verified.
- Manual smoke test as a player on a real or dev submission: flag, refresh, recall, refresh.
- Manual smoke test as an ST: affordance absent.
- Manual smoke test of the auth gate: a player attempting to flag a different player's submission via direct API call gets 403.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtsr-8-player-flag-ui: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- **Pairs with DTSR-9** (ST flag inbox). DTSR-8 writes flags; DTSR-9 reads them. Either can ship first; if DTSR-8 ships alone, the ST can read flags via Mongo until DTSR-9 lands.
- Independent of DTSR-4 (inline edit). DTSR-4 lets the ST edit; DTSR-8 lets the player flag. They operate on the same submission but via different surfaces.
