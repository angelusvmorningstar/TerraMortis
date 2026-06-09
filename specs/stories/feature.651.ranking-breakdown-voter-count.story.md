# Story feature.651: Vote breakdown and voter count in ST ranking aggregate

## Status: review

## Metadata

```yaml
issue: 651
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/651
branch: ms/issue-651-ranking-breakdown-voter-count
```

## Story

**As an** ST reviewing the "Ranking Points — This Cycle" panel,
**I want** to see how each character's score was built up and how many players have voted per group,
**so that** I can understand the ranking at a glance — knowing both the total and the individual contributions that made it, and whether all clan/covenant members have participated.

## Acceptance Criteria

1. **Given** ranked mode and a character who received votes of 5 pts and 3 pts from two voters, the inline tally reads `Name (5+3)` — non-zero contributions in descending order.
2. **Given** political mode and a character with contributions of 3 and 1 from two voters, the inline tally reads `Name (3+1)`.
3. **Given** a character with no votes at all, the tally reads `Name (0)` — unchanged from current behaviour.
4. **Given** the Daeva clan pill is active and 3 Daeva players have submitted ballots this cycle, the pill label (or section header) shows a voter count of 3.
5. Voter count is shown independently for each clan pill and each covenant pill.
6. The player ballot view is entirely unaffected — no breakdown or counts are visible to players.
7. The existing vitest suite for `GET /api/ranking_ballots/aggregate` passes with the new response fields; new tests cover the breakdown arrays and voter counts.

## Tasks

- [x] **Task 1 — API: add `clan_votes`, `covenant_votes`, `clan_voter_count`, `covenant_voter_count`**

  In `server/routes/ranking_ballots.js` (`GET /aggregate`):

  a. Fetch voter docs in **both** ranked and political modes. Currently only political mode does this; ranked mode needs it too for voter count. Move the voter-doc fetch above the `if (mode === 'ranked')` branch so it runs for all modes.

  b. After building points, build `clan_votes` and `covenant_votes` — objects mapping `char_id → number[]` (the point contribution each ballot gave that character). Sort each array descending before returning.

  c. Build `clan_voter_count` and `covenant_voter_count` — objects mapping org name (e.g. `"Daeva"`, `"Invictus"`) to the number of ballots submitted by members of that org. Derive from voter docs.

  d. Return shape:
  ```json
  {
    "clan_points":          { "char_id": total },
    "clan_votes":           { "char_id": [5, 3] },
    "clan_voter_count":     { "Mekhet": 2, "Daeva": 1 },
    "covenant_points":      { "char_id": total },
    "covenant_votes":       { "char_id": [4, 2] },
    "covenant_voter_count": { "Invictus": 3 }
  }
  ```

  e. **Zero-weight political votes**: include zero-weight contributions in the votes array only if the voter actually submitted that character in their ranking (i.e., push `0` if `covWeight === 0` and `cid` is in the ranking). This surfaces that a low-status voter voted, which STs find useful context.

- [x] **Task 2 — Frontend: pass votes through `buildOrgGroups`**

  In `public/js/tabs/status-ranking.js`:

  Update `buildOrgGroups(points, chars, orgKey)` to accept a `votes` parameter:
  ```js
  function buildOrgGroups(points, votes, chars, orgKey) { ... }
  ```
  Push `votes: (votes || {})[String(c._id)] || []` alongside `pts` into each member entry.

  Update all call sites in `wireRankingAggregate` / `refresh()` to pass `agg.clan_votes` / `agg.covenant_votes`.

- [x] **Task 3 — Frontend: render breakdown in `renderAggMemberList`**

  Replace the current `(${m.pts})` with the breakdown string:
  ```js
  const nonZero = (m.votes || []).filter(v => v > 0);
  const breakdown = nonZero.length > 0 ? nonZero.join('+') : String(m.pts);
  // name span becomes: `${esc(m.name)} (${breakdown})`
  ```

  **Backward compat**: when `m.votes` is empty or absent (e.g. old Playwright fixtures that only supply `clan_points`), this falls back to showing `m.pts` — identical to the current #647 behaviour. Existing tests continue to pass.

- [x] **Task 4 — Frontend: show voter count on pills**

  Update `refreshPills` to accept a `voterCount` map and render a count badge inside each pill:
  ```js
  function refreshPills(pillsEl, listEl, groups, voterCount, activeKey, onSelect) { ... }
  // pill HTML:
  const cnt = voterCount?.[k];
  const badge = cnt != null ? ` <span class="rank-voter-count">${cnt}</span>` : '';
  `<button class="rank-pill..." data-key="..."> ${esc(k)}${badge}</button>`
  ```

  Update `refresh()` calls to pass `agg.clan_voter_count` and `agg.covenant_voter_count`.

- [x] **Task 5 — CSS: add `.rank-voter-count` badge style**

  In `public/css/suite.css`, after the existing `.rank-pill.active` rule (~line 2355):
  ```css
  .rank-voter-count {
    font-size: 10px; font-weight: 400; font-family: var(--ft);
    color: var(--txt3); margin-left: 4px;
  }
  ```
  The active pill variant inherits gold text — the count will also go gold on the active pill, which is acceptable (the parent `.rank-pill.active` colour applies). If contrast is poor, override:
  ```css
  .rank-pill.active .rank-voter-count { color: var(--gold-a60); }
  ```

- [x] **Task 6 — vitest: extend `api-ranking-ballots.test.js`**

  In `server/tests/api-ranking-ballots.test.js`:

  a. **Ranked aggregate** — extend the existing "sums 5/4/3/2/1" test or add alongside it:
  - `res.body.clan_votes[clanmate2.id]` equals `[5, 4]` (clanmate1 gave 5, voter gave 4 — sorted desc)
  - `res.body.clan_votes[clanmate1.id]` equals `[5]` (voter gave 5)
  - `res.body.clan_voter_count['Mekhet']` equals `2` (voter + clanmate1 both voted; both are Mekhet)
  - `res.body.covenant_votes[covmate1.id]` equals `[5]`
  - `res.body.covenant_voter_count['Invictus']` equals `1` (only voter is Invictus)

  b. **Political aggregate** — extend existing tests:
  - `res.body.clan_votes[clanmate1.id]` equals `[3]` (one contribution of weight 3)
  - `res.body.clan_votes[clanmate2.id]` equals `[3, 1]` (highVoter=3, voter=1 — sorted desc)
  - `res.body.clan_voter_count['Mekhet']` equals `2`

  c. **New describe block** — `clan_voter_count and covenant_voter_count` — covers the count fields in both modes, including a clan with 0 submissions returning no key (or `0`).

- [x] **Task 7 — Playwright: new E2E spec**

  Create `tests/feature-651-ranking-breakdown-voter-count.spec.js` covering:
  - AC1: ranked mode breakdown `Alpha (5+3)` renders for a character with two vote contributions
  - AC2: political mode breakdown `Alpha (3+1)` renders after mode switch
  - AC3: zero-vote character shows `Alpha (0)`
  - AC4/5: active pill label contains a voter count (e.g. `Mekhet` pill inner text contains `2`)
  - AC6: player view has no breakdown (no `+` in name spans on the player ballot)

  Use the same `bootApp`/`goToTab` pattern from `tests/helpers/unified-app.js` and the mock fixtures from `tests/feature-624-clan-covenant-ranking.spec.js` as the reference.

  Fixtures for this spec need:
  - `aggregate.clan_votes: { 'char-clan': [5, 3], 'char-cov': [] }` (two contributions for one char)
  - `aggregate.clan_voter_count: { 'Mekhet': 2 }`
  - A separate `politicalAggregate` mock with `clan_votes: { 'char-clan': [3, 1] }`

  The `setup` helper currently fetches `ranked` and `political` with two parallel requests. The spec's mock route for `/api/ranking_ballots/aggregate` should inspect `req.url` for `mode=political` to return the political fixture, else the ranked fixture.

## Dev Notes

### File map

| File | Change |
|------|--------|
| `server/routes/ranking_ballots.js` | Extend aggregate endpoint — add votes arrays + voter counts |
| `public/js/tabs/status-ranking.js` | `buildOrgGroups`, `renderAggMemberList`, `refreshPills`, `refresh` |
| `public/css/suite.css` | Add `.rank-voter-count` style (~line 2355) |
| `server/tests/api-ranking-ballots.test.js` | Extend vitest suite for new fields |
| `tests/feature-651-ranking-breakdown-voter-count.spec.js` | New Playwright E2E spec |

### Current API response (to be extended)

```js
// server/routes/ranking_ballots.js — GET /aggregate (lines 50–88)
res.json({ clan_points, covenant_points });
// ↑ Both are { char_id: total_number }
```

The new fields (`clan_votes`, `covenant_votes`, `clan_voter_count`, `covenant_voter_count`) are **additive** — existing consumers that only read `clan_points`/`covenant_points` are unaffected.

### Refactor approach for the aggregate endpoint

Currently ranked and political modes are two separate branches. The refactor:
1. Move voter-doc fetch **above** the `if (mode === 'ranked')` branch — needed by both modes for `voter_count_by_org`.
2. Extract a helper `addVote(pointsMap, votesMap, cid, pts)` that accumulates both the total and the votes array in one step.
3. Build voter count outside the mode branch (same logic for both).

```js
// Always fetch voter docs
const voterIds = [...new Set(ballots.map(b => b.voter_character_id))].map(toOid).filter(Boolean);
const voterDocs = voterIds.length ? await charCol().find({ _id: { $in: voterIds } }).toArray() : [];
const voterById = new Map(voterDocs.map(d => [String(d._id), d]));

// Voter count per org
const clan_voter_count = {}, covenant_voter_count = {};
for (const b of ballots) {
  const v = voterById.get(String(b.voter_character_id));
  if (!v) continue;
  if (v.clan)     clan_voter_count[v.clan]         = (clan_voter_count[v.clan]         || 0) + 1;
  if (v.covenant) covenant_voter_count[v.covenant] = (covenant_voter_count[v.covenant] || 0) + 1;
}

// Votes accumulator helper
function addVote(pts, votes, cid, contribution) {
  if (!cid) return;
  const k = String(cid);
  pts[k] = (pts[k] || 0) + contribution;
  if (!votes[k]) votes[k] = [];
  votes[k].push(contribution);
}

const clan_points = {}, clan_votes = {};
const covenant_points = {}, covenant_votes = {};

if (mode === 'ranked') {
  for (const b of ballots) {
    for (const [slot, cid] of Object.entries(b.clan_ranking || {}))
      if (cid) addVote(clan_points, clan_votes, cid, SLOT_POINTS[slot] || 0);
    for (const [slot, cid] of Object.entries(b.covenant_ranking || {}))
      if (cid) addVote(covenant_points, covenant_votes, cid, SLOT_POINTS[slot] || 0);
  }
} else { // political
  for (const b of ballots) {
    const voter = voterById.get(String(b.voter_character_id));
    if (!voter) continue;
    const clanWeight = voter.status?.clan || 0;
    const covWeight  = voter.status?.covenant?.[voter.covenant] || 0;
    for (const cid of Object.values(b.clan_ranking || {}))
      if (cid) addVote(clan_points, clan_votes, cid, clanWeight);
    for (const cid of Object.values(b.covenant_ranking || {}))
      if (cid) addVote(covenant_points, covenant_votes, cid, covWeight);
  }
}

// Sort contributions descending
for (const arr of Object.values(clan_votes))     arr.sort((a, b) => b - a);
for (const arr of Object.values(covenant_votes)) arr.sort((a, b) => b - a);

res.json({ clan_points, clan_votes, clan_voter_count, covenant_points, covenant_votes, covenant_voter_count });
```

### Backward compatibility — Playwright fixtures

`tests/feature-624-clan-covenant-ranking.spec.js` and `tests/feature-647-ranking-tally-inline.spec.js` mock the aggregate route returning only `{ clan_points, covenant_points }` — no votes arrays. The updated `renderAggMemberList` must fall back gracefully:

```js
const nonZero = (m.votes || []).filter(v => v > 0);
const breakdown = nonZero.length > 0 ? nonZero.join('+') : String(m.pts);
```

When `m.votes` is `[]` or absent: `nonZero` is empty → `breakdown = String(m.pts)`. Renders identically to current `(${m.pts})`. **All existing Playwright assertions continue to pass without fixture changes.**

### `buildOrgGroups` signature change

The function is currently called from two places inside `refresh()`:
```js
const clanGroups = buildOrgGroups(agg.clan_points, chars, 'clan');
const covGroups  = buildOrgGroups(agg.covenant_points, chars, 'covenant');
```
After the change:
```js
const clanGroups = buildOrgGroups(agg.clan_points, agg.clan_votes, chars, 'clan');
const covGroups  = buildOrgGroups(agg.covenant_points, agg.covenant_votes, chars, 'covenant');
```
No other consumers exist — `buildOrgGroups` is a module-private function.

### `refreshPills` signature change

Currently called with 5 args: `(pillsEl, listEl, groups, activeKey, onSelect)`.
New signature: `(pillsEl, listEl, groups, voterCount, activeKey, onSelect)` — `voterCount` inserted as 4th arg.

Both call sites are inside `refresh()` in `wireRankingAggregate`. No external consumers.

### CSS conventions

- Use `var(--txt3)` for the muted count (consistent with other tertiary labels in the UI).
- No bare hex. No new token names — piggyback on existing `--txt3`, `--gold` from the `:root` palette.
- Place the new rule after `.rank-pill.active` in `suite.css` (~line 2355) so it reads as part of the same component block.

### Vitest test seeding pattern

The existing tests seed characters directly with `seedChar()` and use `CYCLE` / `CYCLE_POL` constants. Add a new `CYCLE_BD = 'cycle-rank-breakdown-test'` constant for breakdown-specific tests and clean up with `deleteMany` in an `afterAll`. Follow the exact same pattern as the existing political-mode describe block.

### Playwright mock pattern for dual-mode

`appendRankingSection` fetches aggregate twice in parallel for ST view:
```js
[rankedAgg, politicalAgg] = await Promise.all([
  apiGet(`...&mode=ranked`),
  apiGet(`...&mode=political`),
]);
```
The Playwright mock must distinguish the two requests by URL:
```js
await p.route('**/api/ranking_ballots/aggregate*', r => {
  const url = r.request().url();
  const agg = url.includes('mode=political') ? POLITICAL_FIXTURE : RANKED_FIXTURE;
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(agg) });
});
```

### Scoring recap (for test arithmetic)

Ranked: 1st=5, 2nd=4, 3rd=3, 4th=2, 5th=1
Political: each pick = voter's clan/covenant status dots (position irrelevant)

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-09 | 1.0 | Story created from issue #651 | SM |
| 2026-06-09 | 1.1 | Implementation complete; all 7 tasks done; 21 vitest + 9 Playwright pass | Dev Agent |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
- **Task 1 (API):** Refactored `GET /aggregate` in `ranking_ballots.js`. Moved voter-doc fetch above the ranked/political branch (previously only political fetched voter docs; ranked needed it too for voter count). Extracted `addVote(pts, votes, cid, contribution)` helper that accumulates both running totals and per-ballot contribution arrays. Built `clan_voter_count`/`covenant_voter_count` from voter docs before the mode branch. Votes arrays sorted descending before response. Six fields returned: `clan_points`, `clan_votes`, `clan_voter_count`, `covenant_points`, `covenant_votes`, `covenant_voter_count`. Additive — existing `clan_points`/`covenant_points` consumers unaffected.
- **Task 2 (buildOrgGroups):** Added `votes` as second parameter (after `points`, before `chars`). Each member entry now carries `votes: (votes||{})[cid]||[]`. Both call sites in `refresh()` updated to pass `agg.clan_votes` / `agg.covenant_votes`.
- **Task 3 (renderAggMemberList):** Replaced `(${m.pts})` with breakdown: `nonZero = m.votes.filter(v=>v>0); breakdown = nonZero.length ? nonZero.join('+') : String(m.pts)`. Backward compat: when `m.votes` absent/empty → fallback to `String(m.pts)` — identical to previous behaviour; existing #647 Playwright fixtures pass unchanged.
- **Task 4 (refreshPills):** Added `voterCount` as 4th parameter. Pills render with `<span class="rank-voter-count">${cnt}</span>` badge when count is available. Both call sites in `refresh()` pass `agg.clan_voter_count` / `agg.covenant_voter_count`.
- **Task 5 (CSS):** Added `.rank-voter-count` and `.rank-pill.active .rank-voter-count` rules to `suite.css` after the `.rank-pill.active` rule. Uses `var(--txt3)` for inactive, `var(--gold-a60)` for active — no bare hex, no new tokens.
- **Task 6 (vitest):** Added 4 new tests to `api-ranking-ballots.test.js`: ranked aggregate asserts `clan_votes`/`covenant_votes` (sorted desc) and voter counts; political aggregate asserts `clan_votes[clanmate2.id]=[3,1]` and `clan_voter_count.Mekhet=2`; new describe block `CYCLE_BD` covers single-voter edge case and empty-cycle empty-objects. 21 tests pass (17 original + 4 new).
- **Task 7 (Playwright):** Created `tests/feature-651-ranking-breakdown-voter-count.spec.js` with 9 tests. Dual-mode mock route inspects URL for `mode=political`. Tests cover: `Beta (5+3)` breakdown (AC1), `Alpha (0)` zero fallback (AC3), political `Beta (3+1)` (AC2), `.rank-voter-count` badge content for clan and covenant pills (AC4/5), mode-switch voter count update, and player ballot having no `.rank-member-name` elements (AC6). All 9 pass. #647 backward-compat: all 3 existing tests pass. #624 pre-existing `toHaveCount(3)` failure confirmed present before this branch (5-slot ballot vs 3-slot test expectation — unrelated to this story).

### File List
- `server/routes/ranking_ballots.js`
- `public/js/tabs/status-ranking.js`
- `public/css/suite.css`
- `server/tests/api-ranking-ballots.test.js`
- `tests/feature-651-ranking-breakdown-voter-count.spec.js`
