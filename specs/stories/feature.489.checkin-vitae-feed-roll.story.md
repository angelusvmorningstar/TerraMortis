---
issue: 489
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/489
branch: ms/issue-489-checkin-vitae-feed-roll
---

# feature.489 — Check-In: vitae shows last cycle's logged feed roll, else 0

**Status:** review

## Story

As a coordinator running game-night check-in,
I want each character's V (vitae) figure to show the vitae from their logged feed roll in the last downtime cycle (or 0 if none was logged),
so that I can see at a glance how much blood each character is walking into the session with.

## Acceptance Criteria

- **AC1** — Given a character whose last-cycle submission has a logged feed roll (vessels allocated `[3,3]`, feeding bonus `+2`) and a vitae max of 10, Check-In shows `V 8/10`
- **AC2** — Given a character with no submission for the last cycle, Check-In shows `V 0/10`
- **AC3** — Given a character whose last-cycle submission has no logged feed roll (feed deferred, or `feeding_vitae_allocation` absent/empty), Check-In shows `V 0/10`
- **AC4** — Given no last cycle exists (no non-open downtime cycle at all), Check-In shows `V 0/<vMax>` for every character
- **AC5** — Given a logged feed roll whose total exceeds the character's vitae max, Check-In shows `V <vMax>/<vMax>` (display clamped to vMax)
- **AC6** — The feeding-data load is parallelised with `loadPlayerNames()` and the influence load, so Check-In load time does not increase perceptibly
- **AC7** — The WP and INF displays are unchanged, and the existing 13 `feature-485` E2E tests still pass (zero regression)

## Tasks / Subtasks

- [x] T1 — Extend last-cycle loading to also collect feeding vitae
  - [x] T1.1 — Add module-level `let _feedVitaeByCharId = new Map();` alongside `_infSpentByCharId`
  - [x] T1.2 — Rename `loadInfluenceSpend()` to `loadLastCycleData()`; reset BOTH maps at the top
  - [x] T1.3 — **Restructure the `subs` loop to remove the two `continue` statements** so feeding extraction runs even for submissions with no `influence_spend` (see "The `continue` trap" below — this is the #1 mistake to avoid)
  - [x] T1.4 — Feeding extraction: if `sub.feeding_vitae_allocation` is a non-empty array, `feedTotal = sum(allocation) + (sub.feeding_vitae_tally?.total_bonus || 0)`; store in `_feedVitaeByCharId` keyed by `String(sub.character_id)`
- [x] T2 — Wire the rename through both call sites
  - [x] T2.1 — `initSignIn()`: `Promise.all([loadPlayerNames(), loadLastCycleData()])`
  - [x] T2.2 — `handleNewSession()`: `Promise.all([loadPlayerNames(), loadLastCycleData()])`
- [x] T3 — Update `render()` V span
  - [x] T3.1 — Add `const feedVitae = _feedVitaeByCharId.get(String(c._id)) ?? 0;`
  - [x] T3.2 — Add `const vitaeShown = Math.min(feedVitae, vMax);`
  - [x] T3.3 — Change the V span from `${vMax}/${vMax}` to `${vitaeShown}/${vMax}`
- [x] T4 — E2E tests in `tests/feature-489-checkin-vitae-feed-roll.spec.js`
  - [x] T4.1 — AC1: logged feed (allocation + bonus) → `V <total>/<vMax>`
  - [x] T4.2 — AC2: no submission → `V 0/<vMax>`
  - [x] T4.3 — AC3: submission with feed deferred / no allocation → `V 0/<vMax>`
  - [x] T4.4 — AC4: no last cycle → `V 0/<vMax>` for all
  - [x] T4.5 — AC5: feed total exceeds vMax → clamped to `V <vMax>/<vMax>`
  - [x] T4.6 — Regression: run the existing `feature-485` spec, expect 13/13 still passing

## Dev Notes

### Files to modify

- **`public/js/game/signin-tab.js`** — all changes (recommended approach needs NO server changes)
- **`tests/feature-489-checkin-vitae-feed-roll.spec.js`** — new E2E spec

Do NOT touch `server/`, `feeding-tab.js`, `accessors.js`, or any other file.

### Current state of `signin-tab.js` (post #487 / #488 — read it before editing)

This file was last changed by feature.485 and its two follow-up fixes (#487
cycle-selection, #488 absolute-spend). The **current** `loadInfluenceSpend()` on
`dev` is:

```js
async function loadInfluenceSpend() {
  _infSpentByCharId = new Map();
  try {
    const allCycles = await apiGet('/api/downtime_cycles');
    // The cycles API sorts by _id desc, but DT1 was re-imported with a newer
    // _id than DT3 — so array order no longer tracks recency. Order on
    // game_number explicitly to pick the genuine most-recent cycle.
    const lastClosed = (allCycles || [])
      .filter(c => c.status && c.status !== 'open')
      .sort((a, b) => (b.game_number || 0) - (a.game_number || 0))[0] || null;
    if (!lastClosed) return;
    const subs = await apiGet('/api/downtime_submissions?cycle_id=' + lastClosed._id);
    for (const sub of (subs || [])) {
      const raw = sub.responses?.influence_spend;
      if (!raw) continue;                                    // ← TRAP
      let spendObj;
      try { spendObj = JSON.parse(raw); } catch { continue; } // ← TRAP
      const total = Object.values(spendObj).reduce((s, v) => s + Math.abs(Number(v) || 0), 0);
      if (total > 0) _infSpentByCharId.set(String(sub.character_id), total);
    }
    console.info('[signin] inf spend loaded: %d entries', _infSpentByCharId.size);
  } catch (err) {
    console.warn('[signin] influence spend load failed; defaulting to 0', err);
  }
}
```

The current `render()` resource row:

```js
const vMax  = calcVitaeMax(c);
const wpMax = calcWillpowerMax(c);
const infMax = calcTotalInfluence(c);
const infSpent = _infSpentByCharId.get(String(c._id)) || 0;
const infRemaining = Math.max(0, infMax - infSpent);
const resourceRow = `<div class="si-resources">
  <span class="si-res-item"><span class="si-res-lbl">V</span> ${vMax}/${vMax}</span>
  <span class="si-res-item"><span class="si-res-lbl">WP</span> ${wpMax}/${wpMax}</span>
  ${infMax > 0 ? `<span class="si-res-item"><span class="si-res-lbl">Inf</span> ${infRemaining}/${infMax}</span>` : ''}
</div>`;
```

### The `continue` trap (most important note)

`loadInfluenceSpend()`'s loop has two `continue` statements that skip a
submission entirely when it has no `influence_spend`. If you append feeding code
after them in the same loop, **a character who fed but spent no influence will
never have their feeding extracted.** You MUST restructure the loop so the
influence branch is a guarded `if (raw) { ... }` block rather than an early
`continue`, leaving feeding extraction to run unconditionally.

### Feeding data shapes (live, from DT3 — cycle `69e955c784bbfc821bed2810`)

Feeding fields live at the **top level** of a `downtime_submissions` document
(NOT under `responses`, unlike `influence_spend`):

- `feeding_vitae_allocation` — array of integers, one per drained vessel. e.g. `[2,2]`, `[3,3]`, `[2,2,2,2,2,2,2,2]`
- `feeding_vitae_tally` — object; the only field needed here is `total_bonus` (integer, already clamped at 0 server-side). e.g. `{ herd: 0, ambience: 3, ..., total_bonus: 3 }`
- `feeding_deferred` — boolean; `true` means the player deferred ("see STs at game") and there is no allocation

The DT3 data is **uneven** — some submissions have `feeding_vitae_allocation`
only, some have `feeding_vitae_tally` only, some have both, some neither. The
"else 0" rule (OQ2) makes this safe: a submission with no `feeding_vitae_allocation`
is simply treated as no logged feed.

Final feeding vitae = `sum(feeding_vitae_allocation) + (feeding_vitae_tally.total_bonus || 0)`.
This mirrors `grandTotal` in `feeding-tab.js` (`vesselTotal + total_bonus`).

### Recommended implementation

Add module-level state next to `_infSpentByCharId`:

```js
let _feedVitaeByCharId = new Map();
```

Rename `loadInfluenceSpend` to `loadLastCycleData` and restructure the loop:

```js
async function loadLastCycleData() {
  _infSpentByCharId = new Map();
  _feedVitaeByCharId = new Map();
  try {
    const allCycles = await apiGet('/api/downtime_cycles');
    const lastClosed = (allCycles || [])
      .filter(c => c.status && c.status !== 'open')
      .sort((a, b) => (b.game_number || 0) - (a.game_number || 0))[0] || null;
    if (!lastClosed) return;
    const subs = await apiGet('/api/downtime_submissions?cycle_id=' + lastClosed._id);
    for (const sub of (subs || [])) {
      const charId = String(sub.character_id);

      // Influence spend (#485) — guarded block, no early continue.
      const raw = sub.responses?.influence_spend;
      if (raw) {
        let spendObj = null;
        try { spendObj = JSON.parse(raw); } catch { spendObj = null; }
        if (spendObj) {
          const total = Object.values(spendObj)
            .reduce((s, v) => s + Math.abs(Number(v) || 0), 0);
          if (total > 0) _infSpentByCharId.set(charId, total);
        }
      }

      // Feeding vitae from the logged feed roll (#489).
      const alloc = sub.feeding_vitae_allocation;
      if (Array.isArray(alloc) && alloc.length > 0) {
        const vesselTotal = alloc.reduce((s, v) => s + (Number(v) || 0), 0);
        const bonus = Number(sub.feeding_vitae_tally?.total_bonus) || 0;
        _feedVitaeByCharId.set(charId, vesselTotal + bonus);
      }
    }
    console.info('[signin] last-cycle data loaded: %d inf, %d feed',
      _infSpentByCharId.size, _feedVitaeByCharId.size);
  } catch (err) {
    console.warn('[signin] last-cycle data load failed; defaulting to 0', err);
  }
}
```

`render()` V span — change from `${vMax}/${vMax}` to:

```js
const feedVitae  = _feedVitaeByCharId.get(String(c._id)) ?? 0;
const vitaeShown = Math.min(feedVitae, vMax);
// ...
<span class="si-res-item"><span class="si-res-lbl">V</span> ${vitaeShown}/${vMax}</span>
```

### Resolved decisions

These were open questions on the issue; resolved by Angelus 2026-05-22 and now
fixed requirements:

- **Data source — the logged feed roll in the downtime submission is authoritative.**
  The vitae number is `sum(feeding_vitae_allocation) + (feeding_vitae_tally.total_bonus || 0)`.
  `tracker_state.vitae` is NOT consulted: the logged feed roll is trusted directly,
  with no ST-confirmation cross-check and no new endpoint. (This means the figure
  reflects gross intake and may not net out a heavy Cruac rite cost — accepted.)
- **"Logged" = `feeding_vitae_allocation` is a non-empty array.** A submission with
  only a `feeding_vitae_tally` (bonuses computed but no vessels allocated), a
  deferred feed, or no submission at all all count as NOT logged and show `0`.
- **Display is clamped: `Math.min(feedTotal, vMax)`.** A raw feed total above the
  character's vitae max renders as `vMax/vMax`.

### What NOT to change

- `loadPlayerNames()`, `doAutosave()`, `calcEminence()`, `wireEvents()` — no change
- `PAYMENT_METHODS`, `PAID_METHODS`, `DEFAULT_RATE` — no change
- The WP display stays `${wpMax}/${wpMax}`; the INF display stays `${infRemaining}/${infMax}`
- The influence-spend logic itself — only the loop *structure* changes (drop the `continue`s); the influence result must be byte-identical, which the 13 `feature-485` tests verify

### Related stories

- **feature.485** (`feature.485.checkin-inf-remaining-spend.story.md`) — the INF feature this mirrors; same fetch, same map-keyed-by-character pattern
- **feature.483** (`feature.483.checkin-roster-new-session.story.md`) — established the roster render and the Playwright test patterns
- Follow-up fixes #487 (cycle selection by `game_number`) and #488 (absolute spend + clamp) are already merged to `dev` and reflected in the current-state snapshot above

### Playwright test patterns (from feature.485)

- Use `fake-test-token` (NOT `local-test-token`) to bypass the `dev-fixtures.js` interceptor
- Register the catch-all `**/api/**` route first (lowest priority), specific routes after
- `ST_USER` with `role: 'st'`
- The `feature-485` spec's `setup()` already routes `downtime_cycles` and a cycle-aware `downtime_submissions`; copy that scaffold. Cycle fixtures must carry `game_number` (the cycle picker sorts on it).
- Feeding fields go at the **top level** of the submission fixture, not under `responses`:
  ```js
  const SUBMISSION_FED = {
    _id: 'sub-f1', character_id: 'c-001', cycle_id: 'cycle-closed-001',
    status: 'submitted',
    feeding_vitae_allocation: [3, 3],
    feeding_vitae_tally: { total_bonus: 2 },
  };
  ```
- `calcVitaeMax` depends on blood potency, not merits — give test chars a known/derivable vMax, or assert on the `N/M` pattern rather than hardcoding, as the feature.485 story advised for influence.

## Dev Agent Record

### Debug Log

- The feature-485 regression test `V and WP resource displays still show max/max`
  failed on the first run (`expect(vL).toBe(vR)` — got `0` vs `5`). This was
  expected, not a code regression: feature.489 intentionally changes V away from
  `max/max`. The test was rewritten to assert WP only; V is now covered by the
  feature-489 spec.

### Completion Notes

- T1 — `loadInfluenceSpend()` renamed to `loadLastCycleData()`; it resets both
  `_infSpentByCharId` and the new `_feedVitaeByCharId`. The submissions loop was
  restructured so the influence branch is a guarded `if (raw) { ... }` block
  instead of two early `continue`s, so feeding extraction runs for every
  submission. Feeding total = `sum(feeding_vitae_allocation) + (feeding_vitae_tally.total_bonus || 0)`,
  stored only when `feeding_vitae_allocation` is a non-empty array.
- T2 — both `Promise.all` call sites (`initSignIn`, `handleNewSession`) now call
  `loadLastCycleData()`.
- T3 — `render()` resource row computes `feedVitae` (default 0) and
  `vitaeShown = Math.min(feedVitae, vMax)`; the V span shows `${vitaeShown}/${vMax}`.
- T4 — 10 E2E tests in `tests/feature-489-checkin-vitae-feed-roll.spec.js`
  (AC1 x2, AC2, AC3 x2, AC4 x2, AC5, WP regression). All pass.
- Regression — 36/36 across the three Check-In specs (483 / 485 / 489), zero
  code regressions. The one feature-485 test change is a spec update, not a fix
  (see Debug Log).
- `feeding-tab.js` has its own unrelated module-private `loadInfluenceSpend(charId)`
  — confirmed no collision with the renamed function (both are non-exported).

## File List

- `public/js/game/signin-tab.js` — added `_feedVitaeByCharId`, renamed `loadInfluenceSpend` to `loadLastCycleData` and extended its loop, updated both call sites, updated `render()` V span
- `tests/feature-489-checkin-vitae-feed-roll.spec.js` — new E2E spec (13 tests; 10 from dev-story + 3 from QA review)
- `tests/feature-485-checkin-inf-remaining-spend.spec.js` — updated the V/WP regression test to WP-only (feature.489 intentionally changes V from max/max)

## Change Log

- 2026-05-22: Story created from issue #489 — Check-In vitae shows last cycle's logged feed roll, else 0.
- 2026-05-22: Open questions resolved by Angelus (submission feed roll authoritative; "logged" = vessel allocation present; display clamped to vMax). Status → ready-for-dev.
- 2026-05-22: Implementation complete — T1-T4 done; 10 new feature-489 E2E tests pass; 36/36 across Check-In specs (483 / 485 / 489), zero regressions. Status → review.
- 2026-05-22: QA review (Quinn) — 3 coverage tests added (both-fields submission, empty allocation array, allocation-without-tally); 39/39 Check-In tests pass. QA-clear, ready for PR.
