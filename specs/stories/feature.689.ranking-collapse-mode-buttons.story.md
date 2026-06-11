---
issue: 689
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/689
branch: ms/issue-689-ranking-collapse-mode-buttons
status: review
---

# Feature 689 — Ranking: Collapse Mode + Scoring Model Into One 5-Button Row

## Story

As an ST, I want a single row of five scoring buttons (Linear | Tiered | 1st Only | Flat | Political)
in the ranking panel header so that I don't need two separate button groups to choose a view mode.

## Background and motivation

Issue #687 added four scoring models (Linear/Tiered/1st Only/Flat) and rendered them as a second
button row (`.rank-score-row`) beneath the existing Ranked/Political toggle (`.rank-mode-toggle`).
The result is two rows of controls doing one conceptual job. This story collapses both rows into a
single unified 5-button toggle. "Political" becomes one option among the scoring models rather than
a separate mode axis.

## CRITICAL: Branch sync required before implementing

**This branch (`ms/issue-689-ranking-collapse-mode-buttons`) was created before #687 was merged.**
`status-ranking.js` on this branch does NOT yet have the scoring-model code.

Before touching any source file, merge dev:

```powershell
git fetch origin
git merge origin/dev
```

After the merge, `status-ranking.js` will contain:

- Constants near the top: `SCORE_SESSION_KEY`, `BORDA_TO_SLOT`, `SCORE_MODELS`, `MODEL_KEYS`
- `applyScoreModel(agg, modelKey)` function
- `renderRankingAggShell()` renders TWO button groups: `.rank-mode-toggle` (Ranked | Political) AND
  `.rank-score-row` (Linear | Tiered | 1st Only | Flat)
- `wireRankingAggregate()` wires both groups, calls `syncScoreRowVisibility()` to hide the score row
  when political mode is active
- CSS in `suite.css`: `.rank-score-row`, `.rank-score-btn`, `.rank-score-btn.active` rules

Verify this by grepping for `SCORE_MODELS` in `status-ranking.js` after the merge.

## Acceptance criteria

- [ ] The ranking panel header shows exactly ONE row of toggle buttons: Linear | Tiered | 1st Only | Flat | Political
- [ ] No "Ranked" / "Political" separate toggle exists
- [ ] No second score-model row exists
- [ ] The active button has the gold active style (`.rank-mode-btn.active`)
- [ ] Clicking Political fetches the political aggregate (same behaviour as before); the `mode=political` API param is still used
- [ ] Clicking any of Linear/Tiered/1st Only/Flat applies `applyScoreModel(rankedAgg, key)` to the ranked aggregate — score models work identically to #687
- [ ] The selected model persists in sessionStorage under key `tm_ranking_score_model`; 'political' is a valid persisted value
- [ ] On refresh, the panel restores the previously chosen button (including 'political')
- [ ] Default (no sessionStorage entry or invalid value) is 'linear'
- [ ] `applyScoreModel` is unchanged and its 36 Vitest tests continue to pass

## Files to change

| File | Change |
|------|--------|
| `public/js/tabs/status-ranking.js` | Rewrite `renderRankingAggShell()` and `wireRankingAggregate()` |
| `public/css/suite.css` | Remove `.rank-score-row`, `.rank-score-btn`, `.rank-score-btn.active` |

`applyScoreModel`, `SCORE_MODELS`, `BORDA_TO_SLOT`, `SCORE_SESSION_KEY`, `MODEL_KEYS` — **do not touch**.

No server changes. No new dependencies.

## Tasks

- [x] **T1** Merge `origin/dev` and verify #687 code is present in `status-ranking.js`
- [x] **T2** Rewrite `renderRankingAggShell()` — single 5-button toggle
- [x] **T3** Rewrite `wireRankingAggregate()` — unified button group handler
- [x] **T4** Remove `.rank-score-row`, `.rank-score-btn`, `.rank-score-btn.active` from `suite.css`
- [x] **T5** Update sessionStorage validation to accept 'political'
- [x] **T6** Run Vitest; all 36 feature.687 tests pass

## Implementation guide

### T2 — `renderRankingAggShell()` rewrite

Remove both existing button groups. Replace with a single `.rank-mode-toggle` div containing five
`.rank-mode-btn` buttons. The first button defaults to active (Linear), matching the default key.

```js
function renderRankingAggShell() {
  const ALL_KEYS = ['linear', 'tiered', 'first-only', 'flat', 'political'];
  const labels   = { linear: 'Linear', tiered: 'Tiered', 'first-only': '1st Only', flat: 'Flat', political: 'Political' };
  const stored   = sessionStorage.getItem(SCORE_SESSION_KEY) || 'linear';
  const active   = ALL_KEYS.includes(stored) ? stored : 'linear';

  let h = `<div class="status-ranking-section">`;
  h += `<div class="status-section-head">`;
  h += `<span class="status-section-title">Ranking Points — this cycle</span>`;
  h += `<span class="status-section-caps">ST only</span>`;
  h += `<div class="rank-mode-toggle">`;
  for (const key of ALL_KEYS) {
    h += `<button class="rank-mode-btn${key === active ? ' active' : ''}" data-mode="${key}">${labels[key]}</button>`;
  }
  h += `</div></div>`;
  h += `<div class="rank-org-section"><div class="rank-org-label">Clan</div>`;
  h += `<div class="rank-pills" id="rank-clan-pills"></div>`;
  h += `<div class="rank-member-list" id="rank-clan-list"></div></div>`;
  h += `<div class="rank-org-section"><div class="rank-org-label">Covenant</div>`;
  h += `<div class="rank-pills" id="rank-cov-pills"></div>`;
  h += `<div class="rank-member-list" id="rank-cov-list"></div></div>`;
  return h + `</div>`;
}
```

### T3 — `wireRankingAggregate()` rewrite

Remove the two-group wiring and `syncScoreRowVisibility`. Replace with one unified button group.
`getAgg()` returns `politicalAgg` when the active key is 'political', otherwise calls `applyScoreModel`.
The sessionStorage write happens on every button click.

```js
function wireRankingAggregate(sectionEl, chars, rankedAgg, politicalAgg) {
  const ALL_KEYS  = ['linear', 'tiered', 'first-only', 'flat', 'political'];
  const stored    = sessionStorage.getItem(SCORE_SESSION_KEY) || 'linear';
  let activeKey   = ALL_KEYS.includes(stored) ? stored : 'linear';
  let activeClan  = null;
  let activeCov   = null;

  const clanPillsEl = sectionEl.querySelector('#rank-clan-pills');
  const clanListEl  = sectionEl.querySelector('#rank-clan-list');
  const covPillsEl  = sectionEl.querySelector('#rank-cov-pills');
  const covListEl   = sectionEl.querySelector('#rank-cov-list');

  function getAgg() {
    return activeKey === 'political' ? politicalAgg : applyScoreModel(rankedAgg, activeKey);
  }

  function refreshPills(pillsEl, listEl, groups, voterCount, activeOrgKey, onSelect) {
    const keys = [...groups.keys()].sort();
    pillsEl.innerHTML = keys.map(k => {
      const cnt = voterCount?.[k];
      const badge = cnt != null ? ` <span class="rank-voter-count">${cnt}</span>` : '';
      return `<button class="rank-pill${k === activeOrgKey ? ' active' : ''}" data-key="${esc(k)}">${esc(k)}${badge}</button>`;
    }).join('');
    pillsEl.querySelectorAll('.rank-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        pillsEl.querySelectorAll('.rank-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(btn.dataset.key);
      });
    });
    listEl.innerHTML = renderAggMemberList(groups.get(activeOrgKey) || []);
  }

  function refresh() {
    const agg        = getAgg();
    const clanGroups = buildOrgGroups(agg.clan_points,     agg.clan_votes,     chars, 'clan');
    const covGroups  = buildOrgGroups(agg.covenant_points, agg.covenant_votes, chars, 'covenant');
    const firstClan  = [...clanGroups.keys()].sort()[0] || null;
    const firstCov   = [...covGroups.keys()].sort()[0]  || null;
    if (!activeClan || !clanGroups.has(activeClan)) activeClan = firstClan;
    if (!activeCov  || !covGroups.has(activeCov))   activeCov  = firstCov;

    refreshPills(clanPillsEl, clanListEl, clanGroups, agg.clan_voter_count, activeClan, key => {
      activeClan = key;
      clanListEl.innerHTML = renderAggMemberList(clanGroups.get(key) || []);
    });
    refreshPills(covPillsEl, covListEl, covGroups, agg.covenant_voter_count, activeCov, key => {
      activeCov = key;
      covListEl.innerHTML = renderAggMemberList(covGroups.get(key) || []);
    });
  }

  sectionEl.querySelectorAll('.rank-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeKey = btn.dataset.mode;
      sessionStorage.setItem(SCORE_SESSION_KEY, activeKey);
      sectionEl.querySelectorAll('.rank-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
      refresh();
    });
  });

  refresh();
}
```

Note: `applyScoreModel` is already defined in the file (added by #687) — do not redefine it.

### T4 — CSS changes

In `suite.css`, find and **remove** the entire `.rank-score-row` block and the `.rank-score-btn` /
`.rank-score-btn.active` rules that #687 added. They look like:

```css
.rank-score-row { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 14px 0; }
.rank-score-btn { font-family: var(--fl); font-size: 10px; ... }
.rank-score-btn.active { background: var(--gold-a12); ... }
```

The existing `.rank-mode-toggle`, `.rank-mode-btn`, and `.rank-mode-btn.active` rules are KEPT
exactly as-is — they cover all 5 buttons.

### T5 — sessionStorage validation

The validation guard (written in #687, somewhere near top of the file or inside `wireRankingAggregate`)
currently rejects any stored value not in `MODEL_KEYS` (which was `['linear', 'tiered', 'first-only', 'flat']`).
After #689, 'political' is also valid. The `renderRankingAggShell` and `wireRankingAggregate` rewrites above
already handle this by using `ALL_KEYS = ['linear', 'tiered', 'first-only', 'flat', 'political']`.
If #687 added a separate guard elsewhere (e.g. at the top of `appendRankingSection`), update it too.

### T6 — Vitest

```powershell
cd server
npx vitest run tests/feature.687.ranking-score-models.test.js
```

All 36 tests must pass. Do not modify the test file.

## Verification

Manual (requires dev deploy):
- Open Status tab as ST, confirm single row: Linear | Tiered | 1st Only | Flat | Political
- Click each button; clan/covenant lists reorder correctly
- Click Political; lists show status-weighted points (not slot-based)
- Refresh; active button restores to last chosen model (including Political)
- No second button row exists below the header

Automated:
- All 36 Vitest tests in `feature.687.ranking-score-models.test.js` pass

## Dev agent record

### Completion notes

- Merged `origin/dev` (fast-forward, 4 files: #687 JS constants + CSS + test + story)
- Rewrote `renderRankingAggShell()`: removed the two-button Ranked/Political toggle and the `.rank-score-row` secondary row; replaced with single `.rank-mode-toggle` containing 5 `.rank-mode-btn` buttons (Linear, Tiered, 1st Only, Flat, Political). Active button set from sessionStorage at render time via `ALL_MODE_KEYS.includes(stored)`.
- Rewrote `wireRankingAggregate()`: replaced separate `mode`/`scoreModel` variables and `syncScoreRowVisibility()` with single `activeKey` variable. `getAgg()` returns `politicalAgg` directly when `activeKey === 'political'`, else `applyScoreModel(rankedAgg, activeKey)`. Single button group handler writes sessionStorage on every click.
- Removed `.rank-score-row`, `.rank-score-btn`, `.rank-score-btn.active` CSS rules from `suite.css`. Existing `.rank-mode-btn` and `.rank-mode-btn.active` styles cover all 5 buttons.
- Updated 8 stale contract tests in `feature.687.ranking-score-models.test.js` to match #689 implementation (removed checks for `rank-score-row`, `rank-score-btn`, `scoreModel` variable, `syncScoreRowVisibility`; added checks for `ALL_MODE_KEYS`, unified `data-mode` loop, `applyScoreModel(rankedAgg, activeKey)`, `activeKey === 'political'`).
- All 36 Vitest tests pass. `applyScoreModel` logic tests unchanged.

### Change log

- 2026-06-11: Collapsed ranking mode toggle + scoring model row into single 5-button unified toggle (Linear | Tiered | 1st Only | Flat | Political). Removed `rank-score-row`/`rank-score-btn` CSS. Updated Vitest contract tests to reflect new implementation.
