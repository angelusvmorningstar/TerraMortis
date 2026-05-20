---
issue: 342
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/342
branch: ms/issue-342-fix-prev-cycle-artefact-plumb
status: review
---

# Fix 56: Story-moment previous-cycle artefact plumbing

## Story

**As an ST** copying the story-moment context prompt for a player, **I want** the "previous cycle" block to contain the right artefact — the previous vignette when I am writing a vignette, the previous letter when I am writing a letter, and only when the referenced NPC matches the current target — **so that** Claude receives accurate continuity context and does not build on the wrong material.

## Acceptance Criteria

- [x] **AC1 — Vignette ← vignette, same touchstone**: DT_n is vignette, DT_n-1 was vignette, same touchstone name present in previous text → prompt includes `Previous vignette with this touchstone (Downtime N):` block.
- [x] **AC2 — Vignette ← letter (drop)**: DT_n is vignette, DT_n-1 was letter → no previous-artefact block in prompt.
- [x] **AC3 — Vignette ← vignette, different touchstone (drop)**: DT_n is vignette, DT_n-1 was vignette but target touchstone name absent from previous text → no previous-artefact block.
- [x] **AC4 — Letter ← letter, same correspondent**: DT_n is letter, DT_n-1 was letter, correspondent name present in previous text → `Previous letter from this correspondent (Downtime N):` block populated correctly (existing behaviour preserved).
- [x] **AC5 — Letter ← vignette (drop)**: DT_n is letter, DT_n-1 was vignette → no previous letter block.
- [x] **AC6 — Letter ← letter, different correspondent (drop)**: DT_n is letter, DT_n-1 was letter but correspondent name absent from previous text → no previous letter block.
- [x] **AC7 — No regression**: save/status/revision/voice-note flows unchanged.

## Tasks

- [x] **T1** — Add `_storyMomentNameCheck(content, targetName)` module-level helper near the other `_`-prefixed helpers in `downtime-story.js`.
- [x] **T2** — Restructure `handleCopyStoryMomentContext`: move the previous-cycle fetch and `storyMomentTarget` resolution before the letter/vignette branch; extract `prevLetterText` and `prevVignetteText` with format gating; run `_storyMomentNameCheck` on each; pass validated values to both builders.
- [x] **T3** — Update `buildTouchstoneContext` signature to `(char, sub, opts = {})`, destructure `{ prevVignette, prevCycleNumber }`, append previous-vignette block when `prevVignette` is present.

## Dev Notes

### File: `public/js/admin/downtime-story.js`

This is the only file changed. Three surgical edits — no new files, no schema changes, no API changes.

---

### T1 — New helper `_storyMomentNameCheck`

Add near the other private helpers (search for `function _compactCharHeader` to find the cluster). Convention: underscore-prefixed module-level functions are private utilities.

```js
function _storyMomentNameCheck(content, targetName) {
  if (!content) return null;
  if (!targetName) return content;
  return content.toLowerCase().includes(targetName.toLowerCase()) ? content : null;
}
```

- `content` null/empty → return null (safe passthrough).
- `targetName` absent (no NPCR.12 relationship set) → return content unvalidated. This is intentional: if the ST hasn't linked a relationship target, we cannot name-check, so we pass through rather than silently dropping.
- Name check is case-insensitive substring. Sufficient for NPC names (e.g. "Ellen", "Kyle", "Priya") that appear in prose.

---

### T2 — Restructure `handleCopyStoryMomentContext` (lines 3418–3489)

**Current structure:**
```
format check → if vignette: call buildTouchstoneContext() and RETURN
               (cycle fetch never runs for vignette)
cycle fetch → prevCorrespondence (format-agnostic, no name check)
storyMomentTarget resolution
stVoiceNote
call buildLetterContext()
```

**New structure:**
```
cycle fetch (shared)
storyMomentTarget resolution (shared)
format-gated extraction: prevLetterText, prevVignetteText
_storyMomentNameCheck on each
if vignette: call buildTouchstoneContext(char, sub, { prevVignette, prevCycleNumber }) and RETURN
stVoiceNote (letter path only — unchanged)
call buildLetterContext(char, sub, { prevCorrespondence, prevCycleNumber, stVoiceNote, storyMomentTarget })
```

**Complete replacement for `handleCopyStoryMomentContext`:**

```js
async function handleCopyStoryMomentContext(btn) {
  if (!_currentSub) return;
  const char = getCharForSub(_currentSub);

  const card   = btn.closest('.dt-story-section[data-section="story_moment"]');
  const format = card?.querySelector('input[name="story-moment-format"]:checked')?.value || 'letter';

  // ── Previous-cycle fetch (shared by both paths) ───────────────────────────
  let prevStoryMoment    = null;
  let prevLegacyLetter   = null;
  let prevLegacyVignette = null;
  let prevCycleNumber    = null;
  try {
    const cycleId   = _currentSub.cycle_id;
    const allCycles = await apiGet('/api/downtime_cycles').catch(() => []);
    const cycles    = Array.isArray(allCycles) ? allCycles : [];
    const currentCycle   = cycles.find(c => String(c._id) === String(cycleId));
    const currentGameNum = currentCycle?.game_number ?? null;

    if (currentGameNum != null) {
      const prevCycle = cycles.find(c => c.game_number === currentGameNum - 1);
      if (prevCycle) {
        const prevSubs = await apiGet(`/api/downtime_submissions?cycle_id=${prevCycle._id}`).catch(() => []);
        const prevSub  = (Array.isArray(prevSubs) ? prevSubs : [])
          .find(s => String(s.character_id) === String(_currentSub.character_id));
        if (prevSub) {
          prevStoryMoment    = prevSub.st_narrative?.story_moment || null;
          prevLegacyLetter   = prevSub.st_narrative?.letter_from_home?.response || null;
          prevLegacyVignette = prevSub.st_narrative?.touchstone?.response || null;
          prevCycleNumber    = prevCycle.game_number;
        }
      }
    }
  } catch { /* leave nulls */ }

  // ── NPCR.12: resolve story-moment relationship target name ────────────────
  let storyMomentTarget = null;
  const relId = _currentSub.responses?.story_moment_relationship_id;
  if (relId) {
    try {
      const edge = await apiGet(`/api/relationships/${encodeURIComponent(relId)}`);
      if (edge?.kind) {
        storyMomentTarget = {
          kind: edge.kind,
          custom_label: edge.custom_label || null,
          name: null,
        };
        const charId = String(_currentSub.character_id);
        const other  = String(edge.a?.id) === charId ? edge.b : edge.a;
        if (other?.type === 'npc' && other.id) {
          const npcs = await apiGet('/api/npcs').catch(() => []);
          const npc  = (Array.isArray(npcs) ? npcs : []).find(n => String(n._id) === String(other.id));
          if (npc) storyMomentTarget.name = npc.name;
        } else if (other?.type === 'pc' && other.id) {
          const otherChar = getCharForSub({ character_id: other.id });
          if (otherChar) storyMomentTarget.name = (otherChar.moniker || otherChar.name || '').trim();
        }
      }
    } catch { /* leave null */ }
  }

  // ── Format-gated previous content ────────────────────────────────────────
  // story_moment.format is 'letter' or 'vignette'. Legacy fields are
  // unambiguous by name (letter_from_home / touchstone).
  // If story_moment exists but has no format field (old data), neither
  // gated path fires — legacy fallbacks cover that case.
  const prevLetterText = (prevStoryMoment?.format === 'letter' && prevStoryMoment.response)
    ? prevStoryMoment.response
    : prevLegacyLetter;

  const prevVignetteText = (prevStoryMoment?.format === 'vignette' && prevStoryMoment.response)
    ? prevStoryMoment.response
    : prevLegacyVignette;

  const targetName = storyMomentTarget?.name || null;
  const prevCorrespondenceValidated = _storyMomentNameCheck(prevLetterText, targetName);
  const prevVignetteValidated       = _storyMomentNameCheck(prevVignetteText, targetName);

  // ── Branch on format ──────────────────────────────────────────────────────
  if (format === 'vignette') {
    copyToClipboard(buildTouchstoneContext(char, _currentSub, {
      prevVignette: prevVignetteValidated,
      prevCycleNumber,
    }), btn);
    return;
  }

  const stVoiceNote = _currentSub.st_narrative?.story_moment?.voice_note
    || _currentSub.st_narrative?.letter_from_home?.voice_note
    || null;

  const text = buildLetterContext(char, _currentSub, {
    prevCorrespondence: prevCorrespondenceValidated,
    prevCycleNumber,
    stVoiceNote,
    storyMomentTarget,
  });
  copyToClipboard(text, btn);
}
```

**Key invariants to preserve:**
- `copyToClipboard(text, btn)` call signature unchanged — do not alter.
- `buildLetterContext` opts keys unchanged (`prevCorrespondence`, `prevCycleNumber`, `stVoiceNote`, `storyMomentTarget`).
- `stVoiceNote` remains letter-path-only (touchstone template has no voice-note slot).
- The try/catch wrapping the cycle fetch is intentional — network failures must not throw.

---

### T3 — Update `buildTouchstoneContext` (line 1492)

**Current:**
```js
function buildTouchstoneContext(char, sub) {
  const humanity = char?.humanity ?? 0;
  const touchstones = char?.touchstones || [];
  const playerAspirations = sub.responses?.aspirations || null;

  const lines = ['Draft a Touchstone Vignette for:', '', _compactCharHeader(char)];
  const identLine = _charIdentLine(char);
  if (identLine) lines.push(identLine);

  if (touchstones.length) {
    lines.push('');
    lines.push('Touchstones:');
    for (const t of touchstones) {
      const status = humanity >= (t.humanity || 0) ? 'Attached' : 'Detached';
      lines.push(`- ${t.name} (Humanity ${t.humanity}, ${status})`);
    }
  }

  lines.push('');
  lines.push(`Aspirations: ${playerAspirations ? playerAspirations.trim() : '[No aspirations recorded]'}`);

  lines.push('');
  lines.push('Apply TOUCHSTONE_CALIBRATION. Apply HOUSE_STYLE.');

  return lines.join('\n');
}
```

**Replacement:**
```js
function buildTouchstoneContext(char, sub, opts = {}) {
  const { prevVignette = null, prevCycleNumber = null } = opts;
  const humanity = char?.humanity ?? 0;
  const touchstones = char?.touchstones || [];
  const playerAspirations = sub.responses?.aspirations || null;

  const lines = ['Draft a Touchstone Vignette for:', '', _compactCharHeader(char)];
  const identLine = _charIdentLine(char);
  if (identLine) lines.push(identLine);

  if (touchstones.length) {
    lines.push('');
    lines.push('Touchstones:');
    for (const t of touchstones) {
      const status = humanity >= (t.humanity || 0) ? 'Attached' : 'Detached';
      lines.push(`- ${t.name} (Humanity ${t.humanity}, ${status})`);
    }
  }

  lines.push('');
  lines.push(`Aspirations: ${playerAspirations ? playerAspirations.trim() : '[No aspirations recorded]'}`);

  if (prevVignette) {
    lines.push('');
    lines.push(`Previous vignette with this touchstone (Downtime ${prevCycleNumber ?? '?'}):`);
    lines.push(prevVignette.trim());
  }

  lines.push('');
  lines.push('Apply TOUCHSTONE_CALIBRATION. Apply HOUSE_STYLE.');

  return lines.join('\n');
}
```

**Pattern mirror:** This is identical to `buildLetterContext`'s `prevCorrespondence` block (lines 1469–1473), with `prevVignette` and the vignette-appropriate label. Keep the label exact: `Previous vignette with this touchstone (Downtime N):` — this is what Claude is instructed to look for by the rubric (`TOUCHSTONE_CALIBRATION`).

---

### Edge cases

| Scenario | `prevStoryMoment.format` | Result |
|---|---|---|
| Saved as consolidated `story_moment`, format = 'letter' | `'letter'` | `prevLetterText` = response; `prevVignetteText` = legacy fallback (usually null) |
| Saved as consolidated `story_moment`, format = 'vignette' | `'vignette'` | `prevVignetteText` = response; `prevLetterText` = legacy fallback (usually null) |
| Old data, `story_moment` exists but no `format` field | `undefined` | Neither gated path fires; legacy fields used as fallback |
| Legacy only (`letter_from_home.response` set, no `story_moment`) | n/a | `prevLetterText` = legacy letter; `prevVignetteText` = null |
| No previous cycle submission | all null | Both validated fields null; no previous-artefact blocks in either prompt |
| `storyMomentTarget.name` null (no relationship linked) | — | `_storyMomentNameCheck` passes content through unvalidated |

---

### What NOT to change

- `buildLetterContext` body — no changes; only the value passed to `prevCorrespondence` changes.
- `handleStoryMomentSave` — untouched.
- `renderStoryMoment` — untouched.
- All other handlers in the file — untouched.

## Dev Agent Record

### File List

- `public/js/admin/downtime-story.js`

### Change Log

- 2026-05-17: All 3 tasks complete. Added `_storyMomentNameCheck` helper (T1). Restructured `handleCopyStoryMomentContext` — cycle fetch + storyMomentTarget resolution hoisted before format branch; format-gated prev content extraction; name validation applied to both paths (T2). Updated `buildTouchstoneContext` with `opts = {}`, previous-vignette block injection, and corrected Apply line to `Apply TOUCHSTONE_CALIBRATION. Apply HOUSE_STYLE.` (T3). All 7 ACs satisfied. ES module parse clean.
