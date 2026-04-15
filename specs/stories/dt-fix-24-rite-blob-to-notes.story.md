# Story DT-Fix-24: Rite Blob Pre-Populate Notes

## Status: ready-for-dev

## Story

**As an** ST processing a DT2 CSV sorcery submission,
**I want** the player's full submission blob text to appear in the Notes field of the sorcery details card,
**so that** I can read the complete submission even though the blob is suppressed from the rite selector row.

## Background

DT-Fix-16 added a guard in `renderActionPanel`: when `entry.riteName.length > 60` (a CSV submission blob), the blob is suppressed from the `proc-rite-select-row` override indicator. This correctly prevents hundreds of characters of raw text appearing inline next to the rite dropdown.

However the fix introduced a gap: the ST now has no way to read the player's full sorcery submission text inside the processing panel. The sorcery Details card (left column, above Connected Characters) has a Notes field — `rev.sorc_notes` — which is the correct place to surface this text. The blob should be pre-populated into that field when it would otherwise be invisible, but only when the ST has not already typed something into Notes.

---

## Acceptance Criteria

1. When `entry.riteName` is a blob (longer than 60 characters) and `rev.sorc_notes` is falsy/undefined, the Notes textarea in the sorcery Details card is pre-populated with `entry.riteName`.
2. If `rev.sorc_notes` already has a value (the ST has previously typed or saved a note), the blob does NOT overwrite it.
3. The pre-population is render-time only — it does not automatically call `saveEntryReview`. The ST must press Save in the Details card to persist it (same as any other edit in that card).
4. The pre-population is visible immediately when the panel renders (i.e. the textarea shows the blob text in view mode and in the edit-mode textarea).
5. Short rite names (`entry.riteName.length <= 60`) are unaffected — `notesVal` continues to fall back to the raw submission notes field as before.

---

## Tasks / Subtasks

- [ ] Task 1: Extend `notesVal` derivation to include the blob fallback
  - [ ] 1.1: In `renderActionPanel`, at line ~6178, update the `notesVal` declaration to add a third fallback: when `rev.sorc_notes` is nullish AND `sorcRawNotes` is empty AND `entry.riteName` is a blob, use `entry.riteName`.

---

## Dev Notes

### Key file

All changes are in `public/js/admin/downtime-views.js` (single-file codebase — no imports).

### Exact location

The sorcery details card renders inside the `if (isSorcery)` block starting at line 6173. The Notes value is derived at line 6178:

```js
// Line 6173–6184 (current state):
if (isSorcery) {
  const sorcRawNotes    = sorcSub?.responses?.[`sorcery_${entry.actionIdx}_notes`]   || '';
  const sorcRawTargets  = sorcSub?.responses?.[`sorcery_${entry.actionIdx}_targets`] || entry.targetsText || '';
  const targetsVal      = rev.sorc_targets    ?? sorcRawTargets;
  const notesVal        = rev.sorc_notes      ?? sorcRawNotes;
  // ST overrides for tradition and rite name — fall back to submission values
  const traditionVal    = rev.sorc_tradition  ?? entry.tradition ?? '';
  // Rite: prefer ST-set name, then right-panel rite_override, skip blob if >60 chars
  const blobRite        = (entry.riteName && entry.riteName.length <= 60) ? entry.riteName : '';
  const riteVal         = rev.sorc_rite_name  ?? rev.rite_override ?? blobRite;
  const riteRaw         = entry.riteName || '\u2014';
```

`notesVal` is then used in two places:
- Line 6193 (view mode): `if (notesVal) h += \`<div class="proc-proj-field">...\`
- Line 6228 (edit mode textarea): `<textarea ... >${esc(notesVal)}</textarea>`

### Exact fix

Change line 6178 only:

```js
// BEFORE (line 6178):
const notesVal        = rev.sorc_notes      ?? sorcRawNotes;

// AFTER:
const blobAsNotes     = (entry.riteName && entry.riteName.length > 60) ? entry.riteName : '';
const notesVal        = rev.sorc_notes      ?? sorcRawNotes || blobAsNotes;
```

The `??` operator means: use `rev.sorc_notes` if it is not null/undefined. If it is null/undefined, evaluate `sorcRawNotes || blobAsNotes` — which returns `sorcRawNotes` if it has content, otherwise the blob. This preserves the existing precedence chain:

1. ST-saved note (`rev.sorc_notes`) — highest priority
2. Player's structured notes field from app-form submission (`sorcRawNotes`)
3. Player's blob text from CSV submission (`blobAsNotes`) — only when 1 and 2 are both empty

### The `shortRiteName` guard (right panel — do NOT change)

For reference, the guard added by DT-Fix-16 is at line 6562 in the right-panel rite selector section:

```js
// Line 6561–6563 (right panel — unchanged):
// Override indicator — only for short rite names (suppress blobs from CSV submissions)
const shortRiteName = entry.riteName && entry.riteName.length <= 60;
if (overridden && shortRiteName) h += `<span class="proc-recat-original">Player: ${esc(entry.riteName)}</span>`;
```

This story does NOT touch the right panel. The blob is surfaced via the left-column Notes field instead.

### Save handler (no changes required)

The Notes field is saved by the existing `.proc-sorc-desc-save-btn` click handler at line ~3575–3595, which reads `.proc-sorc-notes-input` and saves `sorc_notes` via `saveEntryReview`:

```js
// Line 3586, 3592 (existing — unchanged):
const notes = card.querySelector('.proc-sorc-notes-input').value.trim();
await saveEntryReview(entry, {
  ...
  sorc_notes: notes || null,
});
```

Because `rev.sorc_notes` is null after a save with an empty string (saved as `null`), the blob would re-appear the next render if the ST clears the field. This is the correct behaviour — if the ST deliberately blanks the Notes, they see the blob again (it is always recoverable until `rev.sorc_notes` is set to a non-empty value).

### No test framework

Manual verification only. Completion Notes should describe what to check.

---

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-views.js`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (SM) + Angelus |
