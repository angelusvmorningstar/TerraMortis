---
issue: 485
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/485
branch: ms/issue-485-checkin-inf-remaining-spend
---

# feature.485 — Check-In: show remaining INF (total minus last-cycle spend)

**Status:** review

## Story

As a coordinator running game-night check-in,
I want the INF figure for each character to show remaining / max (not max / max),
so that I can see at a glance how much influence each character has available after last cycle's spend.

## Acceptance Criteria

- **AC1** — Given a character with INF 7 who spent 3 dots in the last closed cycle, Check-In shows `4/7`
- **AC2** — Given a character with no submission for the last closed cycle, Check-In shows `7/7`
- **AC3** — Given a character whose submission predates the `influence_spend` field (DT1 era), Check-In shows `7/7`
- **AC4** — Given no closed cycle exists, Check-In shows `max/max` for all characters
- **AC5** — The new data-fetch calls are parallelised with `loadPlayerNames()` so load time does not increase perceptibly

## Tasks / Subtasks

- [x] T1 — Add `loadInfluenceSpend()` helper to `signin-tab.js`
  - [x] T1.1 — Add module-level `let _infSpentByCharId = new Map();`
  - [x] T1.2 — Implement `loadInfluenceSpend()`: fetch `/api/downtime_cycles`, find first doc with `status === 'closed'`, fetch `/api/downtime_submissions?cycle_id=<id>`, build `_infSpentByCharId` map of `character_id → totalSpent`
  - [x] T1.3 — Parse `submission.responses.influence_spend` as a JSON string (it is stored as a string, not an object); sum all numeric values; store in map
  - [x] T1.4 — Wrap in try/catch; on failure log warning and leave map empty (defaults to 0 spend for all)
- [x] T2 — Wire `loadInfluenceSpend()` into the init flow
  - [x] T2.1 — In `initSignIn()`: change `await loadPlayerNames()` to `await Promise.all([loadPlayerNames(), loadInfluenceSpend()])`
  - [x] T2.2 — In `handleNewSession()`: change `await loadPlayerNames()` to `await Promise.all([loadPlayerNames(), loadInfluenceSpend()])` (new session creation still needs spend data for the roster)
- [x] T3 — Update `render()` resource row
  - [x] T3.1 — After `const infMax = calcTotalInfluence(c);`, add `const infSpent = _infSpentByCharId.get(String(c._id)) || 0;` and `const infRemaining = infMax - infSpent;`
  - [x] T3.2 — Change the Inf span from `${infMax}/${infMax}` to `${infRemaining}/${infMax}`
- [x] T4 — E2E tests in `tests/feature-485-checkin-inf-remaining-spend.spec.js`
  - [x] T4.1 — AC1: char with `influence_spend` JSON string → shows `remaining/max`
  - [x] T4.2 — AC2: char with no submission → shows `max/max`
  - [x] T4.3 — AC3: char with submission but no `influence_spend` field → shows `max/max`
  - [x] T4.4 — AC4: no closed cycle → shows `max/max`

## Dev Notes

### Only file to modify

**`public/js/game/signin-tab.js`** — full current content in place as of feature.483 / PR #484.

Do NOT touch:
- `public/js/admin/attendance.js` — out of scope
- `server/` — no backend changes needed; existing endpoints are sufficient
- Any other file

### Critical data shape discovery

**`influence_spend` is a JSON-encoded string, not a plain object.**

From live submission data (backup_downtime_3_2026-05-16.json):
```json
"responses": {
  "influence_spend": "{\"the_academy\":5,\"the_harbour\":0,\"the_dockyards\":0,\"the_second_city\":0,\"the_north_shore\":5}"
}
```

The dev-fixtures (`data/dev-fixtures/downtime_submissions.json`) are DT1-era CSV imports and do NOT have `influence_spend` — they are the AC3 test case. App-form submissions (DT2+) have it as a JSON string under `responses.influence_spend`.

Correct parsing:
```js
const raw = sub.responses?.influence_spend;
if (!raw) continue; // no field = 0 spend (AC2/AC3)
let spendObj;
try { spendObj = JSON.parse(raw); } catch { continue; }
const total = Object.values(spendObj).reduce((s, v) => s + (Number(v) || 0), 0);
```

Note: territory values include 0s (unspent territories) — summing all values is correct because 0 + N = N.

### API endpoints used

**`GET /api/downtime_cycles`**
- Returns all cycles sorted by `_id` desc (most recently created first)
- Both ST and player roles can call this
- Cycle status field: `'open'` or `'closed'`
- "Most recently closed cycle" = first doc where `status === 'closed'` (since already sorted desc)

**`GET /api/downtime_submissions?cycle_id=<id>`**
- ST role: returns all submissions for the cycle
- Player role: returns only their own characters' submissions
- Check-In tab is `coordinatorOnly: true` (visible to ST + coordinator roles) — coordinator uses ST auth, so gets all submissions

### Current `initSignIn` flow (as of feature.483)

```js
export async function initSignIn(el, chars) {
  _el = el;
  _chars = chars || [];
  el.innerHTML = '<div class="si-loading">Loading session…</div>';
  try {
    const sessions = await apiGet('/api/game_sessions');
    _session = sessions.sort(...)[0] || null;
  } catch { /* render error, return */ }

  if (!_session) {
    renderNoSession();
    return;
  }

  await loadPlayerNames();   // ← change to Promise.all
  render();
}
```

And `handleNewSession`:
```js
async function handleNewSession() {
  // ... fetch, confirm, POST ...
  _session = created;
  await loadPlayerNames();   // ← change to Promise.all
  render();
}
```

### New module-level state

Add alongside existing `let _playerByCharId = new Map();`:
```js
let _infSpentByCharId = new Map();
```

### `loadInfluenceSpend()` implementation

```js
async function loadInfluenceSpend() {
  _infSpentByCharId = new Map();
  try {
    const allCycles = await apiGet('/api/downtime_cycles');
    const lastClosed = (allCycles || []).find(c => c.status === 'closed');
    if (!lastClosed) return; // AC4: no closed cycle → map stays empty → all default to 0
    const subs = await apiGet('/api/downtime_submissions?cycle_id=' + lastClosed._id);
    for (const sub of (subs || [])) {
      const raw = sub.responses?.influence_spend;
      if (!raw) continue;
      let spendObj;
      try { spendObj = JSON.parse(raw); } catch { continue; }
      const total = Object.values(spendObj).reduce((s, v) => s + (Number(v) || 0), 0);
      if (total > 0) _infSpentByCharId.set(String(sub.character_id), total);
    }
    console.info('[signin] inf spend loaded: %d entries', _infSpentByCharId.size);
  } catch (err) {
    console.warn('[signin] influence spend load failed; defaulting to 0', err);
  }
}
```

### `render()` change (resource row — line ~200–204)

Current:
```js
const infMax = calcTotalInfluence(c);
const resourceRow = `<div class="si-resources">
  ...
  ${infMax > 0 ? `<span class="si-res-item"><span class="si-res-lbl">Inf</span> ${infMax}/${infMax}</span>` : ''}
</div>`;
```

New:
```js
const infMax = calcTotalInfluence(c);
const infSpent = _infSpentByCharId.get(String(c._id)) || 0;
const infRemaining = infMax - infSpent;
const resourceRow = `<div class="si-resources">
  ...
  ${infMax > 0 ? `<span class="si-res-item"><span class="si-res-lbl">Inf</span> ${infRemaining}/${infMax}</span>` : ''}
</div>`;
```

### Playwright test setup pattern

This story uses the same test patterns established in feature.483:
- Use `fake-test-token` (NOT `local-test-token`) to bypass `dev-fixtures.js` interceptor
- Register catch-all route first (lowest priority), specific routes after
- ST_USER with `role: 'st'`

New routes to mock:
```js
await page.route('**/api/downtime_cycles', route =>
  route.fulfill({ body: JSON.stringify([CLOSED_CYCLE, OPEN_CYCLE]) })
);
await page.route('**/api/downtime_submissions**', route =>
  route.fulfill({ body: JSON.stringify(SUBMISSIONS) })
);
```

For AC4 (no closed cycle):
```js
await page.route('**/api/downtime_cycles', route =>
  route.fulfill({ body: JSON.stringify([OPEN_CYCLE]) }) // no closed cycle
);
```

Test data shape:
```js
const CLOSED_CYCLE = { _id: 'cycle-closed-001', status: 'closed', cycle_number: 3 };
const OPEN_CYCLE   = { _id: 'cycle-open-001',   status: 'open',   cycle_number: 4 };

// Character c-001 spent 3 dots total (2 + 1)
const SUBMISSIONS = [{
  _id: 'sub-001',
  character_id: 'c-001',
  cycle_id: 'cycle-closed-001',
  status: 'submitted',
  responses: {
    influence_spend: JSON.stringify({ the_harbour: 2, the_academy: 1, the_north_shore: 0 })
  }
}];
```

TEST_CHARS should include characters with known `calcTotalInfluence` values. Since `calcTotalInfluence` reads merit dots, give the test char a simple influence merit:
```js
const TEST_CHARS = [
  {
    _id: 'c-001', name: 'Alice Char', player: 'Alice Player', retired: false,
    clan: 'Daeva', covenant: 'Invictus',
    status: { city: 0, clan: 0, covenant: {} },
    merits: [{ name: 'Allies', category: 'influence', dots: 7, bonus: 0 }],
    // calcTotalInfluence(c-001) = 7
  },
  {
    _id: 'c-002', name: 'Bob Char', player: 'Bob Player', retired: false,
    clan: 'Gangrel', covenant: 'Circle of the Crone',
    status: { city: 0, clan: 0, covenant: {} },
    merits: [{ name: 'Allies', category: 'influence', dots: 4, bonus: 0 }],
    // calcTotalInfluence(c-002) = 4, no submission → 4/4
  },
];
```

Wait — `calcTotalInfluence` uses `calcMeritInfluence` which checks the effective rating and various merit-specific rules. For a simple Allies merit, the rating is the dot count. To avoid coupling tests to `domain.js` internals, assert on the pattern `N/M` where `N < M` rather than hardcoded numbers, or use a character known to have a predictable total (e.g., Status 0, no other influence sources, a single Allies 7 = 7 total).

### What NOT to change

- `loadPlayerNames()` — no change, already parallel-ready
- `doAutosave()` — no change
- `calcEminence()` — no change
- `wireEvents()` — no change
- `PAYMENT_METHODS`, `PAID_METHODS`, `DEFAULT_RATE` — no change
- The `V` and `WP` resource displays remain `max/max` (unchanged)
- `handleNewSession()` logic — only the `await loadPlayerNames()` line changes to `Promise.all`

### Predecessor story

feature.483 (PR #484) rewrote this file. The current state on `dev` is the post-483 version — read it carefully before editing.

## Dev Agent Record

### Debug Log
- Test chars initially used `dots` field for Allies merits — `meritEffectiveRating` reads `m.cp + m.xp`, not `m.dots`, so `calcTotalInfluence` returned 0 and the Inf span was suppressed. Fixed by using `status.clan` dots instead (direct 1:1 mapping to influence, no merit calc path).

### Completion Notes
- T1: `loadInfluenceSpend()` added after `loadPlayerNames()`. Fetches cycles, finds first `status === 'closed'`, fetches all submissions for that cycle, parses `responses.influence_spend` as JSON string, sums territory values, stores in `_infSpentByCharId` map keyed by `String(character_id)`. Entries with total=0 are skipped (default to 0 via `|| 0` lookup).
- T2: Both `initSignIn()` and `handleNewSession()` now use `Promise.all([loadPlayerNames(), loadInfluenceSpend()])`.
- T3: Resource row now computes `infSpent` and `infRemaining`; Inf display changed from `${infMax}/${infMax}` to `${infRemaining}/${infMax}`.
- T4: 6 E2E tests — 2 for AC1, 1 each for AC2/AC3/AC4(no-closed)/AC4(no-cycles). All 6 pass. 20/20 total Check-In tests pass (0 regressions).

## File List

- `public/js/game/signin-tab.js` — add `_infSpentByCharId` map, `loadInfluenceSpend()`, wire into `initSignIn` and `handleNewSession`, update resource row in `render()`
- `tests/feature-485-checkin-inf-remaining-spend.spec.js` — new E2E tests (AC1–AC4)

## Change Log

- 2026-05-22: Story created — Check-In INF remaining display
- 2026-05-22: Implementation complete — all tasks done, 6/6 new tests pass, 20/20 total Check-In tests pass
