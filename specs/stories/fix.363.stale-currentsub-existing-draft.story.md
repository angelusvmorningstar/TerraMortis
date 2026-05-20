# Story fix.363: DT Story — fix stale _currentSub in async copy-context handlers

**Story ID:** fix.363
**Epic:** DT Story tab fixes
**Status:** review
**Date:** 2026-05-18
**Issue:** [#363](https://github.com/angelusvmorningstar/TerraMortis/issues/363)
**Branch:** ms/issue-363-stale-currentsub-existing-draft

---

## User Story

As an ST using the DT Story tab, when I click "Copy Context" on any project action card, I want the generated prompt to contain only that character's saved draft in the "Existing draft" field — so that I am never shown another character's content and directed to revise it.

---

## Background

### Root cause — async race in copy-context handlers

`_currentSub` is a module-level singleton (`downtime-story.js:95–96`). It is updated synchronously when the ST switches characters via `selectCharacter()` (`downtime-story.js:966–984`):

```js
function selectCharacter(charId) {
  _currentCharId = charId;
  _currentSub = _allSubmissions.find(...) || null;
  // ...
  view.innerHTML = renderCharacterView(char, _currentSub);
}
```

The character view container (`#dt-story-char-view`) is fully replaced via `innerHTML` on every switch, so there is no DOM-staleness issue. The bug is elsewhere.

`handleCopyProjectContext` is **async** and makes network calls:

```js
async function handleCopyProjectContext(btn) {
  if (!_currentSub) return;
  const card = btn.closest('.dt-story-proj-card');
  const idx  = parseInt(card.dataset.projIdx, 10);
  const char = getCharForSub(_currentSub);  // ← captured here

  const rev        = _currentSub.projects_resolved?.[idx] || {};
  const actionType = ...|| _currentSub.responses?.[...] || '';
  const cycleId    = _currentSub.cycle_id;

  const [allCycles, terrs] = await Promise.all([   // ← ASYNC BOUNDARY
    apiGet('/api/downtime_cycles'),
    apiGet('/api/territories'),
  ]);

  // _currentSub is read again AFTER the await:
  const text = buildProjectContext(char, _currentSub, idx, ...);
  //                                      ^^^^^^^^^^^
  //           if ST switched characters during the awaited fetches,
  //           _currentSub now points to a different submission.
}
```

If the ST switches characters while `Promise.all` is in flight (network latency ~100–500 ms is sufficient), `_currentSub` changes to the new character's submission. The context builder then reads `_currentSub.st_narrative?.project_responses?.[idx]?.response` — which is the **new character's** draft at that slot index — and emits it as the "Existing draft" for the card the ST originally clicked.

The same class of bug exists in `handleCopyStoryMomentContext`, which reads `_currentSub.character_id` after its own awaits.

### Why the database is clean

Database audit for DT3 confirmed René St. Dominique's `st_narrative.project_responses` contains only correct René-specific content. The contamination occurred in the **clipboard text** (the prompt the ST received) but was never written back. The ST rejected the contaminated output; René's saved responses are all correct.

### Confirmed DT3 instances

- Reed Justice's XP-spend narrative appeared in René's Ambience Increase prompt (idx 0)
- Reed Justice's XP-spend narrative appeared again in René's Miscellaneous Perth prompt (idx 1)  
- Ryan Ambrose's warehouse-party narrative appeared in René's third Miscellaneous prompt (idx 2)
- Keeper's feeding narrative appeared in Keeper's own Patrol prompt (same character, suggesting an idx mismatch in a prior async cycle)

---

## Acceptance Criteria

- [x] Clicking Copy Context on René St. Dominique's Ambience Increase card never produces an "Existing draft" field drawn from Reed Justice's or Ryan Ambrose's saved responses
- [x] Switching characters immediately before a Copy Context button resolves (i.e. during the API await) produces a prompt for the **originally clicked** character, not the newly selected one
- [x] If no prior draft exists for that character/slot, the Existing Draft section is absent from the prompt
- [x] Same guarantee holds for Patrol, Maintenance, and Story Moment copy-context handlers

---

## Implementation

### The fix — snapshot `_currentSub` before the first await

In each async copy-context handler, capture `_currentSub` into a local `const sub` as the **very first statement** (before any await). Use `sub` exclusively throughout the function body. Do not read `_currentSub` again after any `await`.

This is a pure defensive snapshot — zero behaviour change when the ST does not switch characters, and correct isolation when they do.

---

### `public/js/admin/downtime-story.js`

#### 1. `handleCopyProjectContext` (line ~3730)

```js
async function handleCopyProjectContext(btn) {
  if (!_currentSub) return;
  const sub  = _currentSub;                   // ← snapshot immediately
  const card = btn.closest('.dt-story-proj-card');
  if (!card) return;
  const idx  = parseInt(card.dataset.projIdx, 10);
  const char = getCharForSub(sub);            // ← use sub, not _currentSub

  const rev        = sub.projects_resolved?.[idx] || {};
  const slot       = idx + 1;
  const actionType = rev.action_type_override || rev.action_type
    || sub.responses?.[`project_${slot}_action`] || '';

  let cycleData = null, territories = [];
  try {
    const cycleId = sub.cycle_id;             // ← use sub
    const [allCycles, terrs] = await Promise.all([
      apiGet('/api/downtime_cycles').catch(() => []),
      apiGet('/api/territories').catch(() => []),
    ]);
    cycleData   = (Array.isArray(allCycles) ? allCycles : []).find(c => String(c._id) === String(cycleId)) || null;
    territories = Array.isArray(terrs) ? terrs : [];
  } catch { /* leave nulls */ }

  const isMainten = actionType === 'maintenance' || rev.pool_status === 'maintenance';
  const text = actionType === 'patrol_scout'
    ? buildPatrolContext(char, sub, idx, cycleData, territories)    // ← use sub
    : isMainten
      ? buildMaintenanceContext(char, sub, idx)                     // ← use sub
      : buildProjectContext(char, sub, idx, cycleData, territories); // ← use sub
  copyToClipboard(text, btn);
}
```

#### 2. `handleCopyStoryMomentContext` (line ~3562)

Add snapshot at the top; replace all `_currentSub` reads after the first await:

```js
async function handleCopyStoryMomentContext(btn) {
  if (!_currentSub) return;
  const sub = _currentSub;                    // ← snapshot immediately

  const card   = btn.closest('.dt-story-section[data-section="story_moment"]');
  const format = card?.querySelector('input[name="story-moment-format"]:checked')?.value || 'letter';
  const char   = getCharForSub(sub);          // ← use sub

  let prevStoryMoment = null, prevLegacyLetter = null, prevLegacyVignette = null, prevCycleNumber = null;
  try {
    const cycleId     = sub.cycle_id;         // ← use sub
    const allCycles   = await apiGet('/api/downtime_cycles').catch(() => []);
    const cycles      = Array.isArray(allCycles) ? allCycles : [];
    const currentCycle    = cycles.find(c => String(c._id) === String(cycleId));
    const currentGameNum  = currentCycle?.game_number ?? null;

    if (currentGameNum != null) {
      const prevCycle = cycles.find(c => c.game_number === currentGameNum - 1);
      if (prevCycle) {
        const prevSubs = await apiGet(`/api/downtime_submissions?cycle_id=${prevCycle._id}`).catch(() => []);
        const prevSub  = (Array.isArray(prevSubs) ? prevSubs : [])
          .find(s => String(s.character_id) === String(sub.character_id));  // ← use sub
        if (prevSub) {
          prevStoryMoment    = prevSub.st_narrative?.story_moment || null;
          prevLegacyLetter   = prevSub.st_narrative?.letter_from_home?.response || null;
          prevLegacyVignette = prevSub.st_narrative?.touchstone?.response || null;
          prevCycleNumber    = prevCycle.game_number;
        }
      }
    }
  } catch { /* leave nulls */ }

  // NPCR.12 relationship target (use sub throughout)
  let storyMomentTarget = null;
  const relId = sub.responses?.story_moment_relationship_id;  // ← use sub
  // ... rest of relationship resolution uses sub, not _currentSub ...

  // Format-gated previous content, buildLetterContext / buildTouchstoneContext
  // all pass sub (not _currentSub) as the submission argument
  if (format === 'vignette') {
    copyToClipboard(buildTouchstoneContext(char, sub, { ... }), btn);  // ← use sub
    return;
  }
  const stVoiceNote = sub.st_narrative?.story_moment?.voice_note      // ← use sub
    || sub.st_narrative?.letter_from_home?.voice_note
    || null;
  copyToClipboard(buildLetterContext(char, sub, { ... }), btn);        // ← use sub
}
```

#### 3. Audit remaining async copy-context handlers

Check every `async function handleCopy*` in the file. Apply the same snapshot pattern — `const sub = _currentSub` as the first statement — to any handler that reads `_currentSub` after an `await`. Current known cases: `handleCopyProjectContext`, `handleCopyStoryMomentContext`. Confirm no others exist.

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-story.js` | Snapshot `_currentSub` at top of `handleCopyProjectContext` and `handleCopyStoryMomentContext`; audit all other async `handleCopy*` handlers |

No schema changes. No API changes. No CSS changes.

---

## Dev Notes

- The render-time call to `buildProjectContext` inside `renderProjectCard` (line ~1472) is synchronous and passes `sub` as a parameter — it is not affected by this bug and does not need changing.
- `selectCharacter` is correct: it updates `_currentSub` before replacing the DOM. Do not change the character selection flow.
- After the fix, the "Existing draft" field in a prompt will always reflect the character who was active when Copy Context was clicked, regardless of what the ST does during the network fetch.
- Manual verification: open DT Story, click Copy Context on a project card, immediately switch to a different character while the button shows "Copied!", then inspect the clipboard. Before fix: possible contamination. After fix: always the original character's draft.

---

## Dev Agent Record

**Date:** 2026-05-20

### Completion Notes

Fix already implemented in commit `55a0cf4` (fix(#363-#367): fix 5 DT Story copy-context bugs in one pass, 2026-05-18). Verified `handleCopyProjectContext` (line 3946) and `handleCopyStoryMomentContext` (line 3777) both snapshot `_currentSub` as `const sub` before the first await. Race condition covered by Playwright test in `tests/issue-363-367-dt-story-copy-context.spec.js` (fix.363 describe block) — delays the `/api/downtime_cycles` route by 400ms and switches characters mid-flight; verifies clipboard contains the originally clicked character's draft.

---

## File List

- `public/js/admin/downtime-story.js` (modified — snapshot in handleCopyProjectContext + handleCopyStoryMomentContext)
- `tests/issue-363-367-dt-story-copy-context.spec.js` (added)

---

## Change Log

- 2026-05-18: fix(#363): snapshot _currentSub in handleCopyProjectContext and handleCopyStoryMomentContext
- 2026-05-20: test: Playwright race-condition test for fix.363 async snapshot
