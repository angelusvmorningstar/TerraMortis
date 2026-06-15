---
title: 'DT Processing: show prior cycle resolution for parked Mandragora rites'
type: 'feature'
issue: 741
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/741
branch: ms/issue-741-dt-mg-prior-outcome
created: '2026-06-15'
status: done
recommended_model: 'sonnet — two small changes + one new async helper in one file'
context:
  - public/js/admin/downtime-views.js
---

## Intent

When a parked Mandragora Garden rite appears in DT processing, show the prior
cycle's ST-entered resolution inline under the `[Parked in Mandragora Garden]`
label, so the ST has context without navigating away.

---

## Root cause / motivation

Players with the Mandragora Garden merit can park Cruac rites permanently.
The DT form already pre-fills parked rites each cycle from
`character.powers[].mandragora_parked`. The processing panel already labels
those slots `[Parked in Mandragora Garden]` when
`sorcery_N_mandragora === 'yes'`. However the ST sees no record of what
the rite resolved to in the prior cycle — they must cross-reference the prior
cycle's submission manually.

The resolution text already exists in
`downtime_submissions.sorcery_review[N].ritual_result_note` for the prior
cycle's submission. This story adds a read-only async lookup that surfaces it
inline.

---

## File locations

| File | Lines | Notes |
|------|-------|-------|
| `public/js/admin/downtime-views.js` | 2842–2865 | Sorcery queue-entry builder — add `mandragora` flag |
| `public/js/admin/downtime-views.js` | 7647–7703 | `_renderSorceryRightPanel` — inject placeholder when parked |
| `public/js/admin/downtime-views.js` | 66–68 | Module-level vars — add `_mgPriorSubCache` Map |
| `public/js/admin/downtime-views.js` | 4627+ | `renderProcessingMode` — call `_hydrateMgPriorOutcomes()` fire-and-forget at end |

---

## Data shapes

| Field | Location | Notes |
|-------|----------|-------|
| `sorcery_N_mandragora` | `submission.responses` | `'yes'` when slot is parked |
| `sorcery_N_rite` | `submission.responses` | Rite name — join key for prior-cycle lookup |
| `sorcery_review[N].ritual_result_note` | `submission.sorcery_review` | ST-entered resolution text; the field to surface |
| `allCycles` | module-level var (line 66) | All cycles loaded at boot; used to find prior cycle by `cycle_number` |
| `currentCycle` | module-level var (line 68) | The active cycle |
| `character_id` | `submission.character_id` | Join key for matching prior submission to current character |

The prior cycle is identified as:
```js
const priorCycle = allCycles
  .filter(c => c.cycle_number < currentCycle.cycle_number)
  .sort((a, b) => b.cycle_number - a.cycle_number)[0] || null;
```

---

## T1 — Add `mandragora` flag to sorcery queue entries

**File:** `public/js/admin/downtime-views.js`  
**Location:** The `queue.push({...})` block at lines 2850–2865 (sorcery queue builder)

Add `mandragora` to the pushed object:

```js
queue.push({
  key: `${sub._id}:sorcery:${n}`,
  subId: sub._id,
  charName,
  phase: PHASE_NUM_TO_LABEL[0],
  phaseNum: 0,
  actionType: 'resolve_first',
  label: `${tradition}: ${rite}`,
  description: desc,
  source: 'sorcery',
  actionIdx: n,
  poolPlayer: resp[`sorcery_${n}_pool_expr`] || '',
  riteName: rite,
  tradition,
  targetsText,
  mandragora: resp[`sorcery_${n}_mandragora`] === 'yes',   // ← add this line
});
```

---

## T2 — Add module-level prior-sub cache

**File:** `public/js/admin/downtime-views.js`  
**Location:** Near the other module-level vars at lines 66–68

```js
let _mgPriorSubCache = new Map(); // keyed by prior cycle_id → array of submissions
```

---

## T3 — Inject placeholder in `_renderSorceryRightPanel`

**File:** `public/js/admin/downtime-views.js`  
**Location:** `_renderSorceryRightPanel(entry, char, sub, rev)` — line 7660, immediately
after `let h = \`<div class="proc-feed-right" ...\`;`

When the entry is parked (`entry.mandragora === true`), identify the prior cycle
and render a placeholder div that `_hydrateMgPriorOutcomes` will fill in.

```js
// ── Parked Mandragora rite — prior cycle resolution (async-filled by _hydrateMgPriorOutcomes) ──
if (entry.mandragora) {
  const _priorCycle = currentCycle
    ? allCycles
        .filter(c => c.cycle_number < currentCycle.cycle_number)
        .sort((a, b) => b.cycle_number - a.cycle_number)[0] || null
    : null;
  const _priorCycleId = _priorCycle?._id || '';
  const _charId       = sub?.character_id || '';
  h += `<div class="proc-mg-prior-outcome mg-prior-loading"
              data-prior-cycle-id="${esc(String(_priorCycleId))}"
              data-char-id="${esc(String(_charId))}"
              data-rite-name="${esc(entry.riteName || '')}"
              data-action-idx="${esc(String(entry.actionIdx))}">`;
  h += `<div class="proc-mod-panel-title">Prior cycle resolution</div>`;
  h += `<div class="mg-prior-text"><em>Loading…</em></div>`;
  h += `</div>`;
}
```

Place this block **before** the `// ── Dice Pool Builder` comment.

---

## T4 — `_hydrateMgPriorOutcomes()` async helper

**File:** `public/js/admin/downtime-views.js`  
**Location:** Add as a new function near `renderProcessingMode` (around line 4627)

```js
/**
 * Async post-render step: fills each .proc-mg-prior-outcome placeholder with
 * the rite's resolution text from the prior cycle's submission.
 * Uses _mgPriorSubCache to avoid duplicate fetches.
 */
async function _hydrateMgPriorOutcomes() {
  const placeholders = document.querySelectorAll('.proc-mg-prior-outcome.mg-prior-loading');
  if (!placeholders.length) return;

  // Group by priorCycleId so we fetch each prior cycle at most once
  const byPriorCycle = new Map();
  placeholders.forEach(el => {
    const cid = el.dataset.priorCycleId;
    if (!cid) return;
    if (!byPriorCycle.has(cid)) byPriorCycle.set(cid, []);
    byPriorCycle.get(cid).push(el);
  });

  for (const [priorCycleId, els] of byPriorCycle) {
    // Fetch and cache
    if (!_mgPriorSubCache.has(priorCycleId)) {
      try {
        const subs = await getSubmissionsForCycle(priorCycleId);
        _mgPriorSubCache.set(priorCycleId, subs);
      } catch {
        _mgPriorSubCache.set(priorCycleId, []);
      }
    }
    const priorSubs = _mgPriorSubCache.get(priorCycleId) || [];

    els.forEach(el => {
      const charId    = el.dataset.charId;
      const riteName  = el.dataset.riteName;
      const textEl    = el.querySelector('.mg-prior-text');
      if (!textEl) return;

      // Find prior submission for this character
      const priorSub = priorSubs.find(s => String(s.character_id) === String(charId));
      let resolutionText = '';

      if (priorSub && priorSub.sorcery_review) {
        // Find slot matching rite name
        const r = priorSub.responses || {};
        const slotCount = parseInt(r.sorcery_slot_count || '3', 10);
        for (let n = 1; n <= slotCount; n++) {
          if (r[`sorcery_${n}_rite`] === riteName && r[`sorcery_${n}_mandragora`] === 'yes') {
            resolutionText = (priorSub.sorcery_review[n] || {}).ritual_result_note || '';
            break;
          }
        }
      }

      textEl.innerHTML = resolutionText
        ? esc(resolutionText)
        : '<em>No prior resolution recorded</em>';
      el.classList.remove('mg-prior-loading');
    });
  }
}
```

---

## T5 — Call `_hydrateMgPriorOutcomes()` after render

**File:** `public/js/admin/downtime-views.js`  
**Location:** `renderProcessingMode(container)` — at the very end, after all sync rendering
and event-handler wiring

Add a fire-and-forget call:

```js
// Async: fill parked-rite prior-outcome placeholders (Mandragora Garden)
_hydrateMgPriorOutcomes(); // intentionally not awaited
```

Also: clear the cache on each full render so stale data from a prior cycle-switch
doesn't persist:

```js
_mgPriorSubCache.clear(); // reset prior to _hydrateMgPriorOutcomes() call
_hydrateMgPriorOutcomes();
```

Add `_mgPriorSubCache.clear()` **before** the hydrate call, at the top of
`renderProcessingMode` (not the end). This ensures each render starts fresh
(protects against the ST switching between cycles without a page reload).

---

## T6 — Playwright tests

New spec file: `tests/feat-741-dt-proc-mg-prior-outcome.spec.js`

Reuse the `setupProcessing` / `openSorceryAction` pattern from existing sorcery tests.

Fixtures needed:
- `CYCLE_CURRENT` — cycle with `cycle_number: 5`
- `CYCLE_PRIOR` — cycle with `cycle_number: 4`
- `CHAR_741` — character with Mandragora Garden merit (rating 1), and `powers[]` with one Cruac rite where `mandragora_parked: true`
- `SUB_PARKED` — current-cycle submission where `responses.sorcery_1_rite = 'Rite of X'`, `responses.sorcery_1_mandragora = 'yes'`
- `SUB_PRIOR_WITH_RESOLUTION` — prior-cycle submission for same character, where `responses.sorcery_1_rite = 'Rite of X'`, `responses.sorcery_1_mandragora = 'yes'`, `sorcery_review: { 1: { ritual_result_note: 'Resolved: target was affected.' } }`
- `SUB_PRIOR_NO_RESOLUTION` — prior-cycle submission for same character, `sorcery_review: { 1: {} }` (empty note)
- `SUB_NOT_PARKED` — current-cycle submission where `responses.sorcery_1_rite = 'Rite of Y'`, `responses.sorcery_1_mandragora = 'no'`

Route interceptor must handle both cycle IDs for `/api/downtime_submissions`:
- Returns `[SUB_PARKED]` for `cycle_id = CYCLE_CURRENT._id`
- Returns `[SUB_PRIOR_WITH_RESOLUTION]` (or `SUB_PRIOR_NO_RESOLUTION`) for `cycle_id = CYCLE_PRIOR._id`

Tests:

- **AC-1**: For a parked rite, `.proc-mg-prior-outcome` container is present in the sorcery right panel
- **AC-2**: When prior cycle submission has `ritual_result_note`, its text appears in `.mg-prior-text` (not "No prior resolution recorded")
- **AC-3**: When prior cycle submission has no `ritual_result_note`, `.mg-prior-text` shows "No prior resolution recorded"
- **AC-4**: For a non-parked rite (`sorcery_1_mandragora !== 'yes'`), no `.proc-mg-prior-outcome` element is rendered

---

## Acceptance criteria

- [ ] Parked rite slot in DT processing shows a "Prior cycle resolution" section in the right panel
- [ ] Section displays the prior cycle's `sorcery_review[N].ritual_result_note` for the matching rite
- [ ] When no prior resolution exists, section shows "No prior resolution recorded"
- [ ] Non-parked sorcery slots show no prior-resolution section
- [ ] Prior submissions are cached per cycle — no duplicate fetches if multiple parked rites share the same prior cycle
- [ ] Cache is cleared on each full `renderProcessingMode` call (protects against cycle-switch without reload)
- [ ] Display is read-only — no write path added

---

## Guardrails

- Only `public/js/admin/downtime-views.js` changes.
- Do NOT modify `_renderRollCard`, the pool builder, or any non-sorcery rendering path.
- `_hydrateMgPriorOutcomes` must be fire-and-forget (not awaited) — it must not block the sync render or event-handler wiring.
- Use `getSubmissionsForCycle` (already imported from `../downtime/db.js`) for the fetch — do not use raw `apiGet('/api/downtime_submissions?...')`.
- The `mandragora` flag is additive to the queue entry object — no existing entry fields change.
- Prior cycle identification: use `allCycles` + `currentCycle.cycle_number` comparison, not index-based ordering (cycle numbers are authoritative).
- Do NOT store prior resolution in the in-memory `submissions` array — it is display-only context, not part of current-cycle state.

---

## Dev Agent Record

### Files changed

- `public/js/admin/downtime-views.js` — T1: `mandragora` flag on sorcery queue entries; T2: `_mgPriorSubCache` module-level var; T3: prior-outcome placeholder in `_renderSorceryRightPanel`; T4: `_hydrateMgPriorOutcomes()` async helper; T5: cache clear + hydrate call at end of `renderProcessingMode`
- `tests/feat-741-dt-proc-mg-prior-outcome.spec.js` — 4 Playwright tests (AC-1 through AC-4)

### Completion notes

`_hydrateMgPriorOutcomes` is fire-and-forget (not awaited) so it never blocks the sync render or event-handler wiring. Cache is cleared at the start of each `renderProcessingMode` call to protect against cycle-switches without reload. Prior resolution is found by matching `sorcery_N_rite` name + `sorcery_N_mandragora === 'yes'` in the prior submission, then reading `sorcery_review[N].ritual_result_note`. The `mandragora` flag on queue entries is additive — no existing fields change. All 6 tests pass (4 dev + AC-7 read-only + AC-Edge no-prior-cycle). QA also found and fixed a bug: when no prior cycle exists, the placeholder previously stayed as "Loading…" indefinitely. Fixed by detecting `_priorCycleId === ''` at render time and writing the fallback text directly without `mg-prior-loading`, bypassing the hydrator entirely.
