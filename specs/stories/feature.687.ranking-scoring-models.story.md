---
issue: 687
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/687
branch: ms/issue-687-ranking-scoring-models
status: review
---

# Feature 687 — Ranking: alternative scoring models (Tiered / 1st-Only / Flat)

## Story

As an ST reviewing the ranking aggregate, I want to switch between four scoring models so I can see how the standings look under different weightings without changing how ballots are stored.

## Context

The current ranking aggregate uses a linear Borda scale (5/4/3/2/1 per slot). This over-weights a single voter placing someone 1st. Three flatter models have been agreed:

| Model | Rule |
|---|---|
| **Linear** (default) | Slots 1–5 = 5/4/3/2/1 (current behaviour, unchanged) |
| **Tiered** | Slots 1 & 2 = 2 pts; slots 3, 4, 5 = 1 pt |
| **1st Only** | Slot 1 = 2 pts; slots 2, 3, 4, 5 = 1 pt |
| **Flat** | All slots = 1 pt |

Model selection is display-only — ballots are stored once and re-scored client-side on every model switch. The selected model persists in sessionStorage so a page refresh within the tab keeps the user's choice.

## Acceptance Criteria

- [x] A scoring model button group appears below the ranking panel header when mode = "ranked"
- [x] Selecting **Tiered** recalculates: slots 1 & 2 score 2 pts, slots 3–5 score 1 pt
- [x] Selecting **1st Only** recalculates: slot 1 scores 2 pts, slots 2–5 score 1 pt
- [x] Selecting **Flat** recalculates: every slot scores 1 pt
- [x] **Linear** is the default on first load; selected model state is highlighted
- [x] Vote breakdowns (voter: pts) update to reflect the active model per character
- [x] Switching to **Political** mode hides the scoring model row (political uses status-weight, not slots)
- [x] Selected model persists in `sessionStorage` key `tm_ranking_score_model`; restored on page refresh
- [x] No server writes occur — model selection never hits the API

## File Map

| File | Change |
|---|---|
| `public/js/tabs/status-ranking.js` | All logic changes — scoring models, UI shell, wiring |
| `public/css/suite.css` | Add `.rank-score-row` and `.rank-score-btn` classes |

**No other files change.** The server (`server/routes/ranking_ballots.js`) is untouched.

## Implementation Guide

### 1. How client-side rescoring works

The server aggregate endpoint (`GET /api/ranking_ballots/aggregate?mode=ranked`) returns:

```js
{
  clan_points:     { [charId]: number },      // summed Borda pts per char
  clan_votes:      { [charId]: [{pts, voter}] }, // per-voter contribution
  clan_voter_count: { [orgName]: number },
  // …same for covenant_…
}
```

In ranked mode the server uses `SLOT_POINTS = { 1:5, 2:4, 3:3, 4:2, 5:1 }`. Because the pts values are distinct (5/4/3/2/1), we can reverse-map each vote's `pts` back to its original slot:

```js
const BORDA_TO_SLOT = { 5: 1, 4: 2, 3: 3, 2: 4, 1: 5 };
```

With the slot known, apply any scoring model's point value. Then sum per character to get recalculated totals.

### 2. Define scoring models

Add near the top of `status-ranking.js` (after imports):

```js
const SCORE_SESSION_KEY = 'tm_ranking_score_model';

// pts → original ballot slot (server uses 5/4/3/2/1)
const BORDA_TO_SLOT = { 5: 1, 4: 2, 3: 3, 2: 4, 1: 5 };

const SCORE_MODELS = {
  linear:   { label: 'Linear',   slotPts: { 1:5, 2:4, 3:3, 4:2, 5:1 } },
  tiered:   { label: 'Tiered',   slotPts: { 1:2, 2:2, 3:1, 4:1, 5:1 } },
  'first-only': { label: '1st Only', slotPts: { 1:2, 2:1, 3:1, 4:1, 5:1 } },
  flat:     { label: 'Flat',     slotPts: { 1:1, 2:1, 3:1, 4:1, 5:1 } },
};
const MODEL_KEYS = ['linear', 'tiered', 'first-only', 'flat'];
```

### 3. Add `applyScoreModel(agg, modelKey)` helper

This function takes the raw server aggregate and returns a NEW object with recalculated points and vote breakdowns. Do not mutate the original.

```js
function applyScoreModel(agg, modelKey) {
  const model = SCORE_MODELS[modelKey] || SCORE_MODELS.linear;
  const { slotPts } = model;

  function rescore(votes) {
    const newPts = {}, newVotes = {};
    for (const [cid, contributions] of Object.entries(votes || {})) {
      let total = 0;
      const newContribs = [];
      for (const { pts: bordaPts, voter } of contributions) {
        const slot    = BORDA_TO_SLOT[bordaPts] ?? 0;
        const newPt   = slotPts[slot] ?? 0;
        total += newPt;
        if (newPt > 0) newContribs.push({ pts: newPt, voter });
      }
      newPts[cid]   = total;
      newVotes[cid] = newContribs.sort((a, b) => b.pts - a.pts);
    }
    return { pts: newPts, votes: newVotes };
  }

  const clan     = rescore(agg.clan_votes);
  const covenant = rescore(agg.covenant_votes);
  return {
    clan_points:          clan.pts,
    clan_votes:           clan.votes,
    clan_voter_count:     agg.clan_voter_count,
    covenant_points:      covenant.pts,
    covenant_votes:       covenant.votes,
    covenant_voter_count: agg.covenant_voter_count,
  };
}
```

### 4. Update `renderRankingAggShell()`

Add a `.rank-score-row` div below the section header. It is hidden initially; `wireRankingAggregate` shows/hides it based on mode.

```js
function renderRankingAggShell() {
  let h = `<div class="status-ranking-section">`;
  h += `<div class="status-section-head">`;
  h += `<span class="status-section-title">Ranking Points — this cycle</span>`;
  h += `<span class="status-section-caps">ST only</span>`;
  h += `<div class="rank-mode-toggle">`;
  h += `<button class="rank-mode-btn active" data-mode="ranked">Ranked</button>`;
  h += `<button class="rank-mode-btn" data-mode="political">Political</button>`;
  h += `</div></div>`;
  // Scoring model row — visible only when mode=ranked
  h += `<div class="rank-score-row">`;
  for (const key of MODEL_KEYS) {
    h += `<button class="rank-score-btn" data-score="${key}">${SCORE_MODELS[key].label}</button>`;
  }
  h += `</div>`;
  h += `<div class="rank-org-section"><div class="rank-org-label">Clan</div>`;
  h += `<div class="rank-pills" id="rank-clan-pills"></div>`;
  h += `<div class="rank-member-list" id="rank-clan-list"></div></div>`;
  h += `<div class="rank-org-section"><div class="rank-org-label">Covenant</div>`;
  h += `<div class="rank-pills" id="rank-cov-pills"></div>`;
  h += `<div class="rank-member-list" id="rank-cov-list"></div></div>`;
  return h + `</div>`;
}
```

### 5. Update `wireRankingAggregate()`

Replace the existing function. Key changes:
- Read/write sessionStorage for score model
- Wire score model buttons
- Show/hide `.rank-score-row` based on mode
- When mode=ranked, apply `applyScoreModel(rankedAgg, scoreModel)` before passing to `buildOrgGroups`

```js
function wireRankingAggregate(sectionEl, chars, rankedAgg, politicalAgg) {
  let mode       = 'ranked';
  let activeClan = null;
  let activeCov  = null;
  let scoreModel = sessionStorage.getItem(SCORE_SESSION_KEY) || 'linear';

  // Validate saved model key is still valid
  if (!SCORE_MODELS[scoreModel]) scoreModel = 'linear';

  const clanPillsEl  = sectionEl.querySelector('#rank-clan-pills');
  const clanListEl   = sectionEl.querySelector('#rank-clan-list');
  const covPillsEl   = sectionEl.querySelector('#rank-cov-pills');
  const covListEl    = sectionEl.querySelector('#rank-cov-list');
  const scoreRowEl   = sectionEl.querySelector('.rank-score-row');
  const scoreBtns    = [...(scoreRowEl?.querySelectorAll('.rank-score-btn') || [])];

  function syncScoreBtns() {
    scoreBtns.forEach(b => b.classList.toggle('active', b.dataset.score === scoreModel));
  }

  function syncScoreRowVisibility() {
    if (scoreRowEl) scoreRowEl.style.display = mode === 'ranked' ? '' : 'none';
  }

  function getAgg() {
    if (mode !== 'ranked') return politicalAgg;
    return applyScoreModel(rankedAgg, scoreModel);
  }

  function refreshPills(pillsEl, listEl, groups, voterCount, activeKey, onSelect) {
    const keys = [...groups.keys()].sort();
    pillsEl.innerHTML = keys.map(k => {
      const cnt   = voterCount?.[k];
      const badge = cnt != null ? ` <span class="rank-voter-count">${cnt}</span>` : '';
      return `<button class="rank-pill${k === activeKey ? ' active' : ''}" data-key="${esc(k)}">${esc(k)}${badge}</button>`;
    }).join('');
    pillsEl.querySelectorAll('.rank-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        pillsEl.querySelectorAll('.rank-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(btn.dataset.key);
      });
    });
    listEl.innerHTML = renderAggMemberList(groups.get(activeKey) || []);
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

  // Wire mode toggle (Ranked / Political)
  sectionEl.querySelectorAll('.rank-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      sectionEl.querySelectorAll('.rank-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
      syncScoreRowVisibility();
      refresh();
    });
  });

  // Wire score model buttons
  scoreBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      scoreModel = btn.dataset.score;
      sessionStorage.setItem(SCORE_SESSION_KEY, scoreModel);
      syncScoreBtns();
      refresh();
    });
  });

  syncScoreBtns();
  syncScoreRowVisibility();
  refresh();
}
```

### 6. CSS — add to `suite.css` after the `.rank-mode-btn.active` rule (~line 2341)

```css
.rank-score-row {
  display: flex; flex-wrap: wrap; gap: 4px;
  padding: 6px 14px 0;
}
.rank-score-btn {
  font-family: var(--fl); font-size: 10px; font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; padding: 3px 10px; border: 1px solid var(--bdr2);
  border-radius: 20px; background: var(--surf2); color: var(--txt2); cursor: pointer;
  transition: background .12s, color .12s, border-color .12s;
}
.rank-score-btn.active { background: var(--gold-a12); border-color: var(--bdr3); color: var(--gold); }
```

## What Must Not Break

- **Player ballot form** — `renderRankingBallot`, `wireRankingSave`, `wireDuplicateGuard` are untouched
- **Political mode** — `politicalAgg` is passed through unchanged; `applyScoreModel` is never called for political
- **Both consumers** — `status-ranking.js` is imported by `status-tab.js` AND `suite/status.js`; the exported API (`appendRankingSection`) signature is unchanged
- **Ranked mode default** — on first load (no sessionStorage key), Linear must be active and `applyScoreModel(agg, 'linear')` must return totals identical to the raw server response

## Edge Cases

- `BORDA_TO_SLOT[pts]` returns `undefined` if server ever returns an unexpected pts value (e.g. political mode leaking in). Guard with `?? 0` → score 0.
- Saved sessionStorage model key not in `SCORE_MODELS` (stale cache from a future rename): fall back to `'linear'`.
- Characters with zero votes still appear with 0 pts — `applyScoreModel` preserves this since `rescore` only processes votes that exist.

## Dev Notes

- The `applyScoreModel` function treats the server aggregate as immutable input — always returns a new object. Do not mutate `rankedAgg`.
- `BORDA_TO_SLOT` only works because the server's Borda values are currently `{1:5, 2:4, 3:3, 4:2, 5:1}` — all distinct. If the server's SLOT_POINTS ever changes (e.g. adding a 6th slot), this client map must be updated too.
- The `.rank-score-row` visibility toggle uses `style.display` (not a CSS class) to avoid overriding responsive rules.
- No Playwright spec required at this stage — this is a pure ST-only display feature. If a test is desired post-dev, use the `bmad-agent-qa` flow.
