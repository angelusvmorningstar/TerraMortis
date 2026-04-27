---
id: dtsr.1
epic: dtsr
status: review
priority: medium
depends_on: []
---

# Story DTSR-1: Reorder DT Story sections and rename Cacophony Savvy to Rumours

As a Storyteller authoring downtime narratives,
I should see the DT Story sections appear in the same order as the v2 player report structure (Story Moment / Letter / Touchstone → Home Report → Feeding → Projects → Merit Summary → Rumours), and see "Cacophony Savvy" renamed to "Rumours",
So that authoring sequence and player-delivery sequence align, and the Cacophony tab uses the in-world player-facing term ("Rumours") instead of the merit's mechanical name.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 1 (Story Surface Reform), opening story. This is a tiny no-schema reorder that aligns the admin authoring tab with the v2 player report design (`memory/project_dt_report_v2.md`):

> Six-section report: Story Moment → Home Report → Feeding → Projects → Merit Summary → Rumours

DTSR-2 will collapse Letter + Touchstone into a single "Story Moment" section. DTSR-1 keeps both as separate sections (so it ships independently of DTSR-2) but places them at the top in the same slot the consolidated section will eventually occupy. The result: when DTSR-2 lands, the only change is consolidation; the relative position of all other sections is already correct.

The "Rumours" rename is purely a label change. The internal section key stays `cacophony_savvy` (no schema migration, no breaking of existing per-character `_collapseComplete` state, no risk to the prompt-builder helpers in `downtime-story.js`). The merit name "Cacophony Savvy" stays unchanged on the character document — only the section's display label flips to "Rumours".

### Current vs target order

**Current** (per `getApplicableSections` at `public/js/admin/downtime-story.js:778`):
1. Letter from Home
2. Touchstone
3. Feeding
4. Home Report (conditional)
5. Project Reports (conditional)
6. Allies & Asset Summary (conditional)
7. Cacophony Savvy (conditional)

**Target** (DTSR-1 ships):
1. Letter from Home
2. Touchstone
3. Home Report (conditional)
4. Feeding
5. Project Reports (conditional)
6. Allies & Asset Summary (conditional, label unchanged)
7. **Rumours** (conditional, renamed from Cacophony Savvy)

### Files in scope

- `public/js/admin/downtime-story.js` — `getApplicableSections` at line 778: reorder the section list; rename Cacophony Savvy label.
- Same file, line ~986: `cacophony_savvy: 'Cacophony'` short-label map — verify what this is used for (nav rail badge / pill label?) and update its display string to "Rumours" if appropriate; leave the key unchanged.
- Search the codebase for other display-label sites that say "Cacophony Savvy" in admin Story tab context; rename consistently. The merit name itself ("Cacophony Savvy" as a merit) **must not be renamed**.

### Out of scope

- Letter + Touchstone consolidation (DTSR-2's territory).
- Renaming "Allies & Asset Summary" to "Merit Summary" — DTSR-6 audits this section's content but the rename is not in any DTSR story; if a rename is later requested, it ships as its own change.
- Schema changes — no field rename, no data migration.
- The `cacophony_savvy` section **key** in `getApplicableSections`, in `_collapseComplete`, in the `SECTION_SAVE_HANDLERS` registry, and anywhere else internal — keep as `cacophony_savvy`; only labels change.
- The merit name "Cacophony Savvy" on the character document or in `MERITS_DB` (those are the system-canonical names from the rulebook).
- Player-facing report rendering (paired with `epic-dtp` stories, not in this story).
- Any change to the prompt-builder content for the Rumours section (DTSR's authoring stories handle copy; DTSR-1 is structural only).

---

## Acceptance Criteria

### Section order

**Given** I am an ST viewing the DT Story tab for any submission
**When** the section nav renders
**Then** sections appear in this order, omitting any whose conditional gate is unmet:
1. Letter from Home
2. Touchstone
3. Home Report (when `char.home_territory` is set)
4. Feeding
5. Project Reports (when `sub.projects_resolved` is non-empty)
6. Allies & Asset Summary (when at least one merit action is non-skipped)
7. Rumours (when `getCSDots(char) > 0`)

**Given** the same submission viewed before this story shipped
**Then** the post-DTSR-1 order has only **Feeding** and **Home Report** swapped in position; all other sections retain their relative order, and **Cacophony Savvy** is renamed to **Rumours** in label only.

### Rename

**Given** a character holds the Cacophony Savvy merit
**When** I open the DT Story section nav for their submission
**Then** the section displays as "**Rumours**" — both in the nav rail / section header and in any short-label / badge / completion summary that surfaces this section's name to the ST.

**Given** I am viewing the character editor or any non-DT-Story surface
**Then** the merit "Cacophony Savvy" is **unchanged**: the merit name on the character document, in MERITS_DB references, and in the character editor's merits list still reads "Cacophony Savvy".

**Given** the section's prompt-builder helper output (the LLM context block accessible via the "Copy Context" button)
**Then** the **prompt content** still uses "Cacophony Savvy" where the term refers to the in-world mechanical merit (the prompt instructs an LLM to write a Cacophony Savvy intelligence vignette; this terminology must persist for the LLM's benefit).
**And** any UI chrome around the prompt (button labels, panel headers in the Story tab) uses "Rumours".

### Internal stability

**Given** the codebase
**When** any code reads or writes `st_narrative.cacophony_savvy[...]`, the section key `'cacophony_savvy'`, the `SECTION_SAVE_HANDLERS['cacophony_savvy']` route, or any other internal identifier
**Then** the identifier is **unchanged** — only display strings flip.

**Given** an existing submission in MongoDB has `st_narrative.cacophony_savvy: [...]` populated
**When** an ST opens the DT Story tab for it after DTSR-1 ships
**Then** the saved Rumours data renders correctly with no migration required.

### Completion state

**Given** the per-character `_collapseComplete` set or any other section-keyed state
**Then** behaviour is identical to before DTSR-1; the section reorder does not affect collapse state, completion state, or save routing.

---

## Implementation Notes

### Section list

Modify `getApplicableSections` at `public/js/admin/downtime-story.js:778`. Reorder so Home Report comes before Feeding's neighbours and rename Cacophony Savvy:

```js
function getApplicableSections(char, sub) {
  const sections = [
    { key: 'letter_from_home',   label: 'Letter from Home' },
    { key: 'touchstone',         label: 'Touchstone' },
  ];

  if (char?.home_territory) sections.push({ key: 'home_report', label: 'Home Report' });

  sections.push({ key: 'feeding_validation', label: 'Feeding' });

  if (sub?.projects_resolved?.length) {
    sections.push({ key: 'project_responses', label: 'Project Reports' });
  }

  const hasCategory = (cats) => (sub?.merit_actions || []).some((a, i) => {
    const cat = deriveMeritCategory(a.merit_type);
    if (!cats.includes(cat)) return false;
    const rev = sub?.merit_actions_resolved?.[i] || {};
    return rev.pool_status !== 'skipped';
  });

  const ALL_MERIT_CATS = ['allies', 'status', 'retainer', 'staff', 'contacts', 'resources', 'misc'];
  if (hasCategory(ALL_MERIT_CATS)) sections.push({ key: 'merit_summary', label: 'Allies & Asset Summary' });

  if (getCSDots(char) > 0) {
    sections.push({ key: 'cacophony_savvy', label: 'Rumours' });
  }

  return sections;
}
```

### Short-label / badge map (line ~986)

Find the map currently containing `cacophony_savvy: 'Cacophony'` and change the value to `'Rumours'` (key unchanged). Confirm at implementation what surface this map drives — if it's a nav-rail badge or a tooltip, the label change is consistent with the new section name.

### Audit for other "Cacophony" / "Cacophony Savvy" labels

Grep for `'Cacophony'`, `"Cacophony"`, and `Cacophony Savvy` in:
- `public/js/admin/downtime-story.js` (primary)
- `public/js/admin/downtime-views.js` (any DT-Story-adjacent rendering)
- `public/css/` (if any class name leaks the term, leave it; class names are internal identifiers like the section key)
- `public/admin.html` (any hard-coded labels in the DT Story tab DOM scaffold)

Update display strings to "Rumours". Leave merit-name references and prompt-builder content (which addresses an LLM about the in-world Cacophony) unchanged. The judgement: if a string is rendered to the ST as the section's name, it becomes "Rumours"; if the string is in-world content (prompt instructing the LLM, narrative copy describing what the Cacophony is), it stays as is.

### No tests required

Pure UI label and order change. Manual smoke test (open DT Story tab, view submissions with various combinations of merits + home_territory + projects to verify both order and the Rumours rename) is sufficient.

---

## Files Expected to Change

- `public/js/admin/downtime-story.js` — section order in `getApplicableSections`; "Rumours" rename in the section list and the short-label map at line ~986; any other ST-facing label sites that surface the section name.
- `public/admin.html` — verify no hard-coded "Cacophony" labels in the DT Story tab DOM (low likelihood; check at implementation).

No schema changes, no server changes, no data migrations.

---

## Definition of Done

- All AC verified.
- Manual smoke test:
  - Open DT Story for a submission whose character has Cacophony Savvy + Home Report eligibility + project reports + merit actions: section order reads Letter / Touchstone / Home Report / Feeding / Project Reports / Allies & Asset Summary / Rumours.
  - The Rumours section opens correctly, prompt-builder works, save flow unchanged.
  - Open the character editor: the merit "Cacophony Savvy" is still listed as "Cacophony Savvy".
  - Open an existing submission with Rumours data populated pre-DTSR-1: data renders without error.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtsr-1-section-reorder-rumours-rename: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No dependencies. Ships independently as a small structural change.
- **Sets up DTSR-2's consolidation** (Letter + Touchstone → Story Moment) by placing both sections in the right position relative to the rest of the order. After DTSR-2, the order becomes: Story Moment / Home Report / Feeding / Project Reports / Allies & Asset Summary / Rumours.
- Independent of every other DTSR / DTFP / DTIL / JDT / NPCP / CHM story.

---

## Dev Agent Record

### Completion Notes (2026-04-27)

Implemented all four ST-facing display changes in `public/js/admin/downtime-story.js`. Internal identifiers (`cacophony_savvy` section key, `SECTION_SAVE_HANDLERS` route, helper/handler function names, merit-name lookups, LLM prompt content for the Rumours vignette) all preserved unchanged per AC. Merit name "Cacophony Savvy" untouched on character documents and in MERITS_DB.

Audited adjacent surfaces:
- `public/admin.html` — no hard-coded "Cacophony" labels in DT Story tab DOM.
- `public/js/admin/downtime-views.js:7246` — "Cacophony Savvy" appears in an Intelligence Dossier hint as an in-world reference to the merit/intel type, distinct from the Rumours section name; left unchanged per AC's "in-world content stays" rule.
- `public/css/admin-layout.css:7072` — section comment, internal identifier; left unchanged.

Syntax check: `node --input-type=module --check` clean.

No tests added (pure UI label/order change; project has no test framework per CLAUDE.md). Manual smoke test pending against running localhost:8080 frontend.

### File List

- `public/js/admin/downtime-story.js` — modified
  - `getApplicableSections` (line 778): reordered so Home Report sits between Touchstone and Feeding; Cacophony Savvy section label → "Rumours".
  - TRACKER_LABELS map (line 987): `cacophony_savvy: 'Cacophony'` → `'Rumours'`.
  - `renderCacophonySavvy` textarea placeholder (line 2867): "Write Cacophony Savvy vignette…" → "Write Rumours vignette…".
  - Compiled push-outcome label (line 2980): `Cacophony Savvy ${i+1}` → `Rumours ${i+1}`.

### Change Log

| Date       | Change                                                                                       |
|------------|----------------------------------------------------------------------------------------------|
| 2026-04-27 | DTSR-1 implemented: section reorder (Home Report before Feeding) + Cacophony Savvy → Rumours display rename. Internal identifiers preserved. |
