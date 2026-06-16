/**
 * E2E — unified 5-button scoring/mode toggle for ranking aggregate (#689).
 *
 * Replaces the two-row UI from #687 (Ranked/Political toggle + score-model row)
 * with a single row: Linear | Tiered | 1st Only | Flat | Political.
 *
 * AC1 — single 5-button row rendered; no "Ranked" button; no .rank-score-row
 * AC2 — Linear is active by default
 * AC3 — Tiered button rescores ranked aggregate client-side (slot1+2→2, slot3-5→1)
 * AC4 — Political button switches to the political aggregate (different totals)
 * AC5 — chosen model (including Political) restored from sessionStorage on load
 * AC5b — clicking a model writes it to sessionStorage
 */

const { test, expect } = require('@playwright/test');
const { bootApp, goToTab } = require('./helpers/unified-app.js');

const ST_USER = {
  id: '901', username: 'st_689', global_name: 'ST 689',
  avatar: null, role: 'st', player_id: 'p-st-689', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = { _id: 'cycle-689', cycle_number: 5, status: 'active' };

function mkChar(id, name, clan, covenant) {
  return {
    _id: id, name, moniker: null, honorific: null, clan, covenant,
    player: name + ' Player', blood_potency: 1, humanity: 7, humanity_base: 7,
    court_title: null, retired: false, status: { city: 1, clan: 1, covenant: {} },
    attributes: {
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  };
}

const ALPHA = mkChar('char-alpha-689', 'Alpha', 'Mekhet', 'Invictus');
const BRAVO = mkChar('char-bravo-689', 'Bravo', 'Mekhet', 'Invictus');
const ALL   = [ALPHA, BRAVO];

function statusProjection(c) {
  return {
    _id: c._id, name: c.name, honorific: c.honorific, moniker: c.moniker,
    clan: c.clan, covenant: c.covenant, status: c.status, court_title: c.court_title,
    player: c.player, powers: [], _player_info: { discord_id: null, discord_avatar: null },
  };
}

// Ranked aggregate — Borda pts preserved so applyScoreModel can rescore.
// Alpha: slot1(pts=5)+slot3(pts=3) → Linear=8, Tiered=2+1=3, 1stOnly=2+1=3, Flat=2
// Bravo: slot1(pts=5)              → Linear=5, Tiered=2,     1stOnly=2,     Flat=1
const RANKED_AGG = {
  clan_points:          { 'char-alpha-689': 8, 'char-bravo-689': 5 },
  clan_votes:           {
    'char-alpha-689': [{ pts: 5, voter: 'VoterA' }, { pts: 3, voter: 'VoterB' }],
    'char-bravo-689': [{ pts: 5, voter: 'VoterC' }],
  },
  clan_voter_count:     { Mekhet: 3 },
  covenant_points:      {}, covenant_votes: {}, covenant_voter_count: {},
};

// Political aggregate — Bravo leads (status-weighted; position irrelevant)
const POLITICAL_AGG = {
  clan_points:          { 'char-alpha-689': 1, 'char-bravo-689': 4 },
  clan_votes:           {
    'char-alpha-689': [{ pts: 1, voter: 'VoterA' }],
    'char-bravo-689': [{ pts: 2, voter: 'VoterB' }, { pts: 2, voter: 'VoterC' }],
  },
  clan_voter_count:     { Mekhet: 3 },
  covenant_points:      {}, covenant_votes: {}, covenant_voter_count: {},
};

async function setupST(page) {
  await bootApp(page, ST_USER, {
    routes: async (p) => {
      await p.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ALPHA]) }));
      await p.route('**/api/characters/status', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL.map(statusProjection)) }));
      await p.route('**/api/characters/names', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL.map(c => ({ _id: c._id, name: c.name }))) }));
      await p.route('**/api/downtime_cycles', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) }));
      await p.route('**/api/ranking_ballots/aggregate*', r => {
        const url = r.request().url();
        const agg = url.includes('mode=ranked') ? RANKED_AGG : POLITICAL_AGG;
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(agg) });
      });
    },
  });
  await goToTab(page, 'status');
}

test.describe('#689 — unified 5-button scoring/mode toggle', () => {

  test('AC1 — single 5-button row; no Ranked button; no .rank-score-row', async ({ page }) => {
    await setupST(page);

    await expect(page.locator('#rank-clan-pills')).toBeVisible({ timeout: 8000 });

    // All 5 unified buttons present
    await expect(page.locator('.rank-mode-btn[data-mode="linear"]')).toBeVisible();
    await expect(page.locator('.rank-mode-btn[data-mode="tiered"]')).toBeVisible();
    await expect(page.locator('.rank-mode-btn[data-mode="first-only"]')).toBeVisible();
    await expect(page.locator('.rank-mode-btn[data-mode="flat"]')).toBeVisible();
    await expect(page.locator('.rank-mode-btn[data-mode="political"]')).toBeVisible();

    // "Ranked" button removed by #689
    await expect(page.locator('.rank-mode-btn[data-mode="ranked"]')).toHaveCount(0);

    // Secondary score row removed by #689
    await expect(page.locator('.rank-score-row')).toHaveCount(0);
  });

  test('AC2 — Linear button active by default; Political not active', async ({ page }) => {
    await setupST(page);

    await expect(page.locator('#rank-clan-pills')).toBeVisible({ timeout: 8000 });

    await expect(page.locator('.rank-mode-btn[data-mode="linear"]')).toHaveClass(/active/);
    await expect(page.locator('.rank-mode-btn[data-mode="political"]')).not.toHaveClass(/active/);
  });

  test('AC3 — Tiered button rescores ranked data (slot1+2→2pts, slot3-5→1pt)', async ({ page }) => {
    await setupST(page);

    const clanList = page.locator('#rank-clan-list');
    await expect(clanList).toBeVisible({ timeout: 8000 });
    await page.locator('#rank-clan-pills .rank-pill[data-key="Mekhet"]').click();

    // Linear default: Alpha=8, Bravo=5
    const alphaRow = clanList.locator('.rank-member-row').filter({ hasText: 'Alpha' });
    await expect(alphaRow.locator('.rank-member-pts')).toContainText('8');

    // Switch to Tiered
    await page.locator('.rank-mode-btn[data-mode="tiered"]').click();
    await expect(page.locator('.rank-mode-btn[data-mode="tiered"]')).toHaveClass(/active/);

    // Alpha: slot1(5→2) + slot3(3→1) = 3
    await expect(alphaRow.locator('.rank-member-pts')).toContainText('3');
    // Bravo: slot1(5→2) = 2
    const bravoRow = clanList.locator('.rank-member-row').filter({ hasText: 'Bravo' });
    await expect(bravoRow.locator('.rank-member-pts')).toContainText('2');
  });

  test('AC4 — Political button uses political aggregate (Bravo leads)', async ({ page }) => {
    await setupST(page);

    const clanList = page.locator('#rank-clan-list');
    await expect(clanList).toBeVisible({ timeout: 8000 });
    await page.locator('#rank-clan-pills .rank-pill[data-key="Mekhet"]').click();

    // Linear default: Alpha leads (8)
    const alphaRow = clanList.locator('.rank-member-row').filter({ hasText: 'Alpha' });
    await expect(alphaRow.locator('.rank-member-pts')).toContainText('8');

    // Switch to Political: Bravo leads (4), Alpha drops to 1
    await page.locator('.rank-mode-btn[data-mode="political"]').click();
    await expect(page.locator('.rank-mode-btn[data-mode="political"]')).toHaveClass(/active/);
    await expect(alphaRow.locator('.rank-member-pts')).toContainText('1');
    const bravoRow = clanList.locator('.rank-member-row').filter({ hasText: 'Bravo' });
    await expect(bravoRow.locator('.rank-member-pts')).toContainText('4');
  });

  test('AC5 — Political stored in sessionStorage is restored as active on load', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('tm_ranking_score_model', 'political');
    });
    await setupST(page);

    await expect(page.locator('#rank-clan-pills')).toBeVisible({ timeout: 8000 });

    await expect(page.locator('.rank-mode-btn[data-mode="political"]')).toHaveClass(/active/);
    await expect(page.locator('.rank-mode-btn[data-mode="linear"]')).not.toHaveClass(/active/);
  });

  test('AC5b — clicking a model writes it to sessionStorage', async ({ page }) => {
    await setupST(page);

    await expect(page.locator('#rank-clan-pills')).toBeVisible({ timeout: 8000 });

    await page.locator('.rank-mode-btn[data-mode="flat"]').click();

    const stored = await page.evaluate(() => sessionStorage.getItem('tm_ranking_score_model'));
    expect(stored).toBe('flat');
  });

});
