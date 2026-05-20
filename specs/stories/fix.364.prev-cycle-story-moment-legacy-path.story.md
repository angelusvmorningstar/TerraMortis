# Story fix.364: DT Story — fix async race + legacy prev-cycle path in handleCopyStoryMomentContext

**Story ID:** fix.364
**Epic:** DT Story tab fixes
**Status:** review
**Date:** 2026-05-18
**Issue:** [#364](https://github.com/angelusvmorningstar/TerraMortis/issues/364)
**Branch:** ms/issue-364-prev-cycle-story-moment-legacy-path

---

## User Story

As an ST using the DT Story tab, when I click "Copy Context" on a Story Moment card, I want the previous-cycle correspondence field to contain the prior letter OR vignette (whichever was written), even for submissions processed before the story-moment consolidation — so that I am never shown a blank "Previous letter" when content exists.

---

## Background

### Two bugs in `handleCopyStoryMomentContext`

**Bug 1 — Async race (same class as #363)**

`handleCopyStoryMomentContext` is `async` and reads `_currentSub` multiple times after `await` boundaries:

```js
async function handleCopyStoryMomentContext(btn) {   // line 3413
  if (!_currentSub) return;
  const char = getCharForSub(_currentSub);           // line 3415 — OK, before any await

  // ... sync work ...

  const allCycles = await apiGet('/api/downtime_cycles').catch(() => []);  // AWAIT BOUNDARY

  // Reads _currentSub AFTER await:
  .find(s => String(s.character_id) === String(_currentSub.character_id));  // line 3441 — STALE
  // ...
  const stVoiceNote = _currentSub.st_narrative?.story_moment?.voice_note   // line 3450 — STALE
  const relId = _currentSub.responses?.story_moment_relationship_id;        // line 3456 — STALE
  const charId = String(_currentSub.character_id);                          // line 3466 — STALE

  // Another await boundary: await apiGet(`/api/relationships/...`)
  // Another await boundary: await apiGet('/api/npcs')

  const text = buildLetterContext(char, _currentSub, {...});  // line 3480 — STALE
```

If the ST switches characters during any of the awaited fetches, `_currentSub` changes and the prompt is built from the wrong submission.

**Bug 2 — Legacy prev-cycle path misses vignette**

When building the Letter context, the handler fetches the previous cycle's submission and reads:

```js
prevCorrespondence = prevSub?.st_narrative?.story_moment?.response
  || prevSub?.st_narrative?.letter_from_home?.response   // line 3442-3443
  || null;
```

This chain checks `story_moment` (new unified field) and `letter_from_home` (legacy letter field), but **not** `touchstone.response` (legacy vignette field). DT2 submissions that were processed as vignettes used `st_narrative.touchstone.response`. When a character's previous-cycle narrative was a vignette, `prevCorrespondence` is always `null` even though the content exists.

**Bug 3 — `handleCopyTerritoryContext` has the same async race**

`handleCopyTerritoryContext` (line 3661) is `async` and reads `_currentSub` after `await Promise.all(...)`:

```js
async function handleCopyTerritoryContext(btn) {
  if (!_currentSub) return;
  // ...
  const [allCycles, terrs] = await Promise.all([...]);   // AWAIT BOUNDARY
  const text = buildTerritoryContext(char, _currentSub, ...);  // line 3678 — STALE
```

### Confirmed DT3 instances

Keeper's DT3 Story Moment prompt showed `[No previous correspondence]` despite Keeper having processed DT2 as a vignette (content stored in `st_narrative.touchstone.response`).

---

## Acceptance Criteria

- [x] Clicking Copy Context on a character whose previous cycle narrative was a vignette (stored in `st_narrative.touchstone.response`) populates "Previous correspondence" in the prompt
- [x] Switching characters immediately before handleCopyStoryMomentContext resolves still generates the prompt for the originally clicked character
- [x] Same isolation guarantee holds for handleCopyTerritoryContext
- [x] If no previous cycle or no previous submission, the "Previous correspondence" field is absent from the prompt (not `null` or blank)

---

## Implementation

### `public/js/admin/downtime-story.js`

#### 1. `handleCopyStoryMomentContext` — snapshot + legacy path fix (line ~3413)

```js
async function handleCopyStoryMomentContext(btn) {
  if (!_currentSub) return;
  const sub  = _currentSub;                              // ← snapshot immediately
  const char = getCharForSub(sub);

  const card   = btn.closest('.dt-story-section[data-section="story_moment"]');
  const format = card?.querySelector('input[name="story-moment-format"]:checked')?.value || 'letter';

  if (format === 'vignette') {
    copyToClipboard(buildTouchstoneContext(char, sub), btn);  // ← use sub
    return;
  }

  let prevCorrespondence = null;
  let prevCycleNumber    = null;
  try {
    const cycleId   = sub.cycle_id;                      // ← use sub
    const allCycles = await apiGet('/api/downtime_cycles').catch(() => []);
    const cycles    = Array.isArray(allCycles) ? allCycles : [];
    const currentCycle   = cycles.find(c => String(c._id) === String(cycleId));
    const currentGameNum = currentCycle?.game_number ?? null;

    if (currentGameNum != null) {
      const prevCycle = cycles.find(c => c.game_number === currentGameNum - 1);
      if (prevCycle) {
        const prevSubs = await apiGet(`/api/downtime_submissions?cycle_id=${prevCycle._id}`).catch(() => []);
        const prevSub  = (Array.isArray(prevSubs) ? prevSubs : [])
          .find(s => String(s.character_id) === String(sub.character_id));  // ← use sub
        if (prevSub) {
          prevCorrespondence =
            prevSub.st_narrative?.story_moment?.response
            || prevSub.st_narrative?.letter_from_home?.response
            || prevSub.st_narrative?.touchstone?.response    // ← NEW: vignette legacy path
            || null;
          prevCycleNumber = prevCycle.game_number;
        }
      }
    }
  } catch { /* leave nulls */ }

  const stVoiceNote = sub.st_narrative?.story_moment?.voice_note   // ← use sub
    || sub.st_narrative?.letter_from_home?.voice_note
    || null;

  let storyMomentTarget = null;
  const relId = sub.responses?.story_moment_relationship_id;       // ← use sub
  if (relId) {
    try {
      const edge = await apiGet(`/api/relationships/${encodeURIComponent(relId)}`);
      if (edge?.kind) {
        storyMomentTarget = {
          kind: edge.kind,
          custom_label: edge.custom_label || null,
          name: null,
        };
        const charId = String(sub.character_id);                   // ← use sub
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

  const text = buildLetterContext(char, sub, {            // ← use sub
    prevCorrespondence, prevCycleNumber, stVoiceNote, storyMomentTarget,
  });
  copyToClipboard(text, btn);
}
```

#### 2. `handleCopyTerritoryContext` — snapshot (line ~3661)

```js
async function handleCopyTerritoryContext(btn) {
  if (!_currentSub) return;
  const sub    = _currentSub;                              // ← snapshot immediately
  const char   = getCharForSub(sub);
  const terrId = btn.dataset.terrId;
  if (!terrId) return;

  let cycleData = null, territories = [];
  try {
    const cycleId = sub.cycle_id;                          // ← use sub
    const [allCycles, terrs] = await Promise.all([
      apiGet('/api/downtime_cycles').catch(() => []),
      apiGet('/api/territories').catch(() => []),
    ]);
    cycleData   = (Array.isArray(allCycles) ? allCycles : []).find(c => String(c._id) === String(cycleId)) || null;
    territories = Array.isArray(terrs) ? terrs : [];
  } catch { /* use nulls */ }

  const text = buildTerritoryContext(char, sub, terrId, _allSubmissions, _allCharacters, cycleData, territories);  // ← use sub
  copyToClipboard(text, btn);
}
```

#### 3. Audit remaining async `handleCopy*` handlers

After applying the above, confirm no other async copy-context handlers read `_currentSub` after an `await`. Current known handlers: `handleCopyProjectContext` (fixed in #363), `handleCopyStoryMomentContext`, `handleCopyTerritoryContext`, `handleCopyCacophonyContext` (synchronous — no fix needed).

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-story.js` | Snapshot `_currentSub` in `handleCopyStoryMomentContext`; extend prev-cycle chain to include `touchstone.response`; snapshot in `handleCopyTerritoryContext` |

No schema changes. No API changes. No CSS changes.

---

## Dev Notes

- `handleCopyCacophonyContext` is synchronous — it does not `await` anything. It reads `_currentSub` but there is no async boundary, so it is not affected by this class of bug.
- `buildTouchstoneContext` and `buildLetterContext` are pure functions that accept `sub` as a parameter — they are correct as-is. Only the handlers that read `_currentSub` after await need fixing.
- The `touchstone.response` fallback is third in priority (after the new unified field and the legacy letter field). This means a character who had both a letter and a vignette in the previous cycle will use the letter — consistent with the default format preference.

---

## Dev Agent Record

**Date:** 2026-05-20

### Completion Notes

Fix implemented in commit `55a0cf4`. `handleCopyStoryMomentContext` (line 3777) snapshots `_currentSub`; `handleCopyTerritoryContext` (line 4086) snapshots `_currentSub`. Legacy vignette fallback: `prevLegacyVignette = prevSub.st_narrative?.touchstone?.response || null` (line 3804) with format-gated logic at lines 3847–3849. Covered by: `fix.364` describe block in `tests/issue-363-367-dt-story-copy-context.spec.js` (verifies legacy `touchstone.response` surfaces correctly); `issue-352` Bug 2 tests verify format-gated prev-cycle logic.

---

## File List

- `public/js/admin/downtime-story.js` (modified)
- `tests/issue-363-367-dt-story-copy-context.spec.js` (added)

---

## Change Log

- 2026-05-18: fix(#364): snapshot in handleCopyStoryMomentContext + handleCopyTerritoryContext; legacy touchstone.response fallback
- 2026-05-20: test: Playwright test for legacy vignette prev-cycle path
