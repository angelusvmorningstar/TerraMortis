---
id: dtsr.9
epic: dtsr
status: ready-for-dev
priority: medium
depends_on: [dtsr.8]
---

# Story DTSR-9: ST flag inbox in DT Story tab

As a Storyteller working through a downtime cycle's narratives,
I should see a single inbox of all open player flags across all submissions in the active cycle, with one-click navigation to the flagged section and a quick-resolve action,
So that I can sweep player concerns in one place rather than scrolling through each submission to spot inline flag indicators.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 1 (Story Surface Reform). DTSR-8 introduces the per-section flag mechanism on the player Story view; DTSR-9 surfaces those flags to the ST in a focused inbox at the top of the DT Story tab.

The inbox is **scoped to the current cycle** by default, since DT Story itself is scoped to the active cycle (per DTSR-3). It lists every open flag across every submission in the cycle, sorted most-recent first. Each row shows:

- The flagging player's character display name
- The section's display label (Story Moment, Project: <title>, Rumour 2, etc.)
- The flag category (Inconsistent / Wrong story / Other)
- The reason text (truncated with full-text on hover or expand)
- Two actions: **Open section** (navigates to the relevant submission + section in DT Story) and **Resolve** (marks the flag resolved with an optional resolution note)

The inbox is **not a notification system** — STs see flags when they open DT Story. Notifications, badges on the DT Story tab nav button, or push notifications can be follow-ups.

### Files in scope

- `public/js/admin/downtime-story.js` — primary surface:
  - Inbox panel rendered at the top of the DT Story tab, between the existing nav rail and the character view.
  - New helper `renderFlagInbox(submissions)` and supporting `resolveFlagRow(flagId, note)`.
  - On Resolve: PATCH `/api/downtime_submissions/:id/section-flag/:flagId` with status `'resolved'` and the optional note.
- `server/routes/downtime.js` — new PATCH route for resolving a flag.
- `public/admin.html` — add `<div id="dt-story-flag-inbox">` slot if needed.
- `public/css/admin-layout.css` — minimal styling for the inbox panel.

### Out of scope

- Cross-cycle inbox (showing flags from previous cycles). Today's flags should be acted on this cycle; if a player flags a historical cycle, the ST sees it via the same inbox once they open DT Story for that cycle (rare). Cross-cycle aggregation is a follow-up.
- Bulk resolve. Each flag is resolved individually so the ST is forced to acknowledge each one.
- Auto-resolve on inline edit (DTSR-4). Editing the section does not auto-clear flags — the ST decides explicitly whether the player's concern is addressed. (This may be a follow-up if "did you address all flags before publishing" becomes a workflow gate.)
- ST-side flag creation. STs do not flag; they resolve. A separate "ST note to player" affordance is a different feature.
- Notification / badge. Inbox is reactive only.
- Recalled-flag visibility. When a player recalls (DTSR-8 status `'recalled'`), the flag disappears from the inbox. STs do not see recalled flags. (If audit becomes useful, add a "show recalled" toggle later.)

---

## Acceptance Criteria

### Visibility

**Given** I am an ST opening the DT Story tab
**Then** at the top of the panel (above the nav rail), an inbox section is rendered titled "**Player Flags**" with the count: e.g. "Player Flags (3 open)" or "Player Flags (none)".

**Given** there are zero open flags across the cycle
**Then** the inbox is **collapsed** (or replaced by a single muted line: "No open player flags this cycle.").

**Given** there is at least one open flag
**Then** the inbox is expanded by default and lists every open flag.

### Row contents

**Given** an open flag row
**Then** it shows:
- **Character name** — `displayName(char)` of the flagging player's character.
- **Section label** — display label of the flagged section (e.g. "Story Moment", "Project: <title>", "Rumour 2", "Feeding", "Home Report", "Allies & Asset Summary"). If the section has an index, include it (e.g. "Project: The Smuggling Ring" rather than "project_responses[1]").
- **Category badge** — visually distinct chip per category (Inconsistent / Wrong story / Other).
- **Reason text** — truncated to ~120 characters on the row; full text accessible via expand/click.
- **Created timestamp** — relative ("2 hours ago") or ISO depending on existing convention in the file.
- **Open section** button — navigates to the flagged section in the DT Story view.
- **Resolve** button — opens a small inline form to add a resolution note and confirm.

### Open section navigation

**Given** I click Open section on a flag row
**Then** the existing character selection logic is triggered: the character's pill in the nav rail becomes active, and the character view scrolls to (or expands and highlights) the flagged section.

**Given** the flagged section's key cannot be resolved to a current section (e.g. legacy key from a section that no longer exists)
**Then** the character is selected and the view shows a small banner: "Flagged section '<key>' could not be located; review the submission directly."

### Resolve flow

**Given** I click Resolve on a flag row
**Then** an inline form appears: a small textarea for "Resolution note (optional)" and a Confirm Resolve button.

**Given** I click Confirm Resolve
**Then** the flag's status flips to `'resolved'` via PATCH `/api/downtime_submissions/:id/section-flag/:flagId` with body `{ status: 'resolved', resolution_note: '<text>' }`.
**And** the row disappears from the open inbox.
**And** the resolution is persisted (resolved_at timestamp, resolution_note, status).

**Given** the resolution PATCH fails
**Then** the row remains visible with an error message; the form stays open.

### Server-side

**Given** the new PATCH endpoint
**Then** it requires ST role (`req.user.role === 'st'` or equivalent — match the existing role check pattern in the file).
**And** it returns 403 if a player attempts to call it.
**And** it locates the flag by `flagId` within the submission's `section_flags` array, sets `status: 'resolved'`, `resolved_at: <iso>`, `resolution_note: <text>`, and writes back.
**And** it returns the updated flag.

### Inbox sort order

**Given** multiple open flags exist
**Then** they sort **most-recent first** by `created_at`.
**And** within the same timestamp resolution, secondary sort is by character name alphabetical.

### Empty state and refresh

**Given** an ST resolves the last open flag
**Then** the inbox transitions to the "No open player flags this cycle." empty state.

**Given** a player creates a new flag while the ST has the inbox open
**Then** the new flag does **not** appear until the ST refreshes the page or a future enhancement adds polling. (v1: no live updates.)

---

## Implementation Notes

### Read path

In `initDtStory` after `_allSubmissions` is populated, derive the open-flag list:

```js
function collectOpenFlags(subs) {
  const flags = [];
  for (const sub of subs) {
    for (const flag of (sub.section_flags || [])) {
      if (flag.status === 'open') {
        flags.push({ ...flag, sub_id: sub._id, character_id: sub.character_id });
      }
    }
  }
  flags.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return flags;
}
```

### Render the inbox

Inject above the existing nav rail in `initDtStory`:

```js
const inbox = document.createElement('div');
inbox.id = 'dt-story-flag-inbox';
inbox.className = 'dt-story-flag-inbox';
inbox.innerHTML = renderFlagInbox(_allSubmissions);
panel.appendChild(inbox);
```

Render structure:

```js
function renderFlagInbox(subs) {
  const flags = collectOpenFlags(subs);
  if (!flags.length) {
    return `<div class="dt-story-flag-inbox-empty">No open player flags this cycle.</div>`;
  }
  let h = `<div class="dt-story-flag-inbox-header"><h3>Player Flags (${flags.length} open)</h3></div>`;
  h += `<div class="dt-story-flag-inbox-rows">`;
  for (const flag of flags) {
    h += renderFlagRow(flag);
  }
  h += `</div>`;
  return h;
}
```

Each row: character name, section label (resolve via a helper that maps `section_key` + `section_idx` to a human label using the same `getApplicableSections` machinery and project/rumour title lookup), category badge, truncated reason, timestamp, Open + Resolve buttons.

### Section label helper

```js
function flagSectionLabel(flag, sub, char) {
  const key = flag.section_key;
  if (key === 'project_responses' && flag.section_idx != null) {
    const title = sub.responses?.[`project_${flag.section_idx + 1}_title`] || `Project ${flag.section_idx + 1}`;
    return `Project: ${title}`;
  }
  if (key === 'cacophony_savvy' && flag.section_idx != null) {
    return `Rumour ${flag.section_idx + 1}`;
  }
  // Fallback to section's display label from getApplicableSections
  const sections = getApplicableSections(char, sub);
  const match = sections.find(s => s.key === key);
  return match?.label || key;
}
```

### Open section navigation

The existing nav rail's pill click handler at line 152 (`selectCharacter(charId)`) is the navigation hook. After selecting the character, scroll to or expand the flagged section. The minimum: trigger `selectCharacter` and let the existing render handle the rest. Optional refinement: pass a section-anchor parameter so the renderer scrolls / highlights.

### Server route

Add to `server/routes/downtime.js`:

```js
router.patch('/api/downtime_submissions/:id/section-flag/:flagId', requireST, async (req, res) => {
  const sub = await getSubmission(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Not found' });
  const flag = (sub.section_flags || []).find(f => String(f._id) === String(req.params.flagId));
  if (!flag) return res.status(404).json({ error: 'Flag not found' });
  flag.status = req.body.status === 'resolved' ? 'resolved' : flag.status;
  flag.resolved_at = new Date().toISOString();
  flag.resolution_note = req.body.resolution_note || null;
  await saveSubmissionFlag(req.params.id, flag);
  res.json(flag);
});
```

`requireST` (or whatever the existing helper is) gates the route to ST role.

### Strawman wording

- Inbox header: "**Player Flags (N open)**"
- Empty state: "No open player flags this cycle."
- Category badges: "Inconsistent" / "Wrong story" / "Other"
- Resolve form heading: "Resolve this flag"
- Resolution note placeholder: "What did you do? (optional)"
- Confirm button: "Confirm Resolve"

### No tests required

UI + new endpoint. Manual smoke test as ST:
- Player flags two sections (use DTSR-8); inbox shows both.
- Open section: navigates to the flagged one.
- Resolve with a note; row disappears; refresh confirms persistence.
- Server check: PATCH endpoint rejects player-role calls (403).

A server-side test covering the role gate is a useful follow-up; not blocking.

---

## Files Expected to Change

- `public/js/admin/downtime-story.js` — inbox panel rendering, helpers (`collectOpenFlags`, `renderFlagInbox`, `renderFlagRow`, `flagSectionLabel`, `resolveFlagRow`); event delegation for Open / Resolve / Confirm Resolve.
- `public/admin.html` — slot for the inbox panel if not appended dynamically.
- `public/css/admin-layout.css` — styles for `.dt-story-flag-inbox`, `.dt-story-flag-inbox-rows`, category badges, resolve form. Reuse existing tokens.
- `server/routes/downtime.js` — PATCH `/api/downtime_submissions/:id/section-flag/:flagId`.

No client-side changes outside `downtime-story.js` and CSS.

---

## Definition of Done

- All AC verified.
- Manual smoke test as ST against a cycle with multiple open flags from DTSR-8.
- Resolve flow round-trips correctly; resolved flag disappears from inbox.
- Empty state appears when no open flags remain.
- Server PATCH rejects non-ST callers.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtsr-9-st-flag-inbox: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- **Depends on DTSR-8** for the flag-creation surface and the schema field.
- Independent of DTSR-3, DTSR-4, DTSR-5, DTSR-6, DTSR-7. Compatible with DTSR-1's section reorder and DTSR-2's Story Moment consolidation (the section-label helper handles whatever keys exist in the section list).
