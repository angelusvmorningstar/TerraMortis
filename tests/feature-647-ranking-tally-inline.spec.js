/**
 * E2E — inline ranking tally next to character name in ST aggregate view (#647).
 *
 * Covers ACs not already tested in feature-624-clan-covenant-ranking.spec.js:
 *   AC3 — mode switching (Ranked → Political) refreshes the inline tally
 *   AC4 — .rank-member-pts column is still present alongside the inline tally
 *   AC5 — player ballot is unaffected (no inline tally in picker options)
 */

const { test, expect } = require('@playwright/test');
const { bootApp, goToTab } = require('./helpers/unified-app.js');

const ST_USER = {
  id: '901', username: 'st_647', global_name: 'ST 647',
  avatar: null, role: 'st', player_id: 'p-st-647', character_ids: ['char-st-647'], is_dual_role: false,
};
const PLAYER_USER = {
  id: '902', username: 'player_647', global_name: 'Player 647',
  avatar: null, role: 'player', player_id: 'p-647', character_ids: ['char-voter-647'], is_dual_role: false,
};

const ACTIVE_CYCLE = { _id: 'cycle-647', cycle_number: 1, status: 'active' };

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

const ALPHA  = mkChar('char-alpha',  'Alpha',  'Mekhet', 'Invictus');
const BRAVO  = mkChar('char-bravo',  'Bravo',  'Mekhet', 'Invictus');
const VOTER  = mkChar('char-voter-647', 'Voter647', 'Daeva', 'Carthian Movement');
const ALL    = [ALPHA, BRAVO, VOTER];

function statusProjection(c) {
  return {
    _id: c._id, name: c.name, honorific: c.honorific, moniker: c.moniker,
    clan: c.clan, covenant: c.covenant, status: c.status, court_title: c.court_title,
    player: c.player, powers: [], _player_info: { discord_id: null, discord_avatar: null },
  };
}

async function setupST(page, { ranked, political } = {}) {
  await bootApp(page, ST_USER, {
    routes: async (p) => {
      await p.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ALPHA]) }));
      await p.route('**/api/characters/status', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL.map(statusProjection)) }));
      await p.route('**/api/characters/names', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL.map(c => ({ _id: c._id, name: c.name }))) }));
      await p.route('**/api/downtime_cycles', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) }));
      await p.route('**/api/ranking_ballots/aggregate*', r => {
        const url = r.request().url();
        const isRanked = url.includes('mode=ranked');
        const agg = isRanked
          ? (ranked  || { clan_points: {}, covenant_points: {} })
          : (political || { clan_points: {}, covenant_points: {} });
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(agg) });
      });
    },
  });
  await goToTab(page, 'status');
}

async function setupPlayer(page) {
  await bootApp(page, PLAYER_USER, {
    routes: async (p) => {
      await p.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([VOTER]) }));
      await p.route('**/api/characters/status', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL.map(statusProjection)) }));
      await p.route('**/api/characters/names', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL.map(c => ({ _id: c._id, name: c.name }))) }));
      await p.route('**/api/downtime_cycles', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) }));
      await p.route('**/api/ranking_ballots/mine*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) }));
      await p.route('**/api/ranking_ballots/aggregate*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clan_points: {}, covenant_points: {} }) }));
    },
  });
  await goToTab(page, 'status');
}

test.describe('#647 — inline ranking tally', () => {

  test('AC3 — switching to Political mode updates the inline tally', async ({ page }) => {
    await setupST(page, {
      ranked:   { clan_points: { 'char-alpha': 5, 'char-bravo': 3 }, covenant_points: {} },
      political: { clan_points: { 'char-alpha': 1, 'char-bravo': 4 }, covenant_points: {} },
    });

    const clanList = page.locator('#rank-clan-list');
    await expect(clanList).toBeVisible({ timeout: 8000 });
    await page.locator('#rank-clan-pills .rank-pill[data-key="Mekhet"]').click();

    // Initial mode is Ranked — Alpha leads with 5
    await expect(clanList).toContainText('Alpha (5)');
    await expect(clanList).toContainText('Bravo (3)');

    // Switch to Political — Bravo now leads with 4
    await page.locator('.rank-mode-btn[data-mode="political"]').click();
    await expect(clanList).toContainText('Alpha (1)');
    await expect(clanList).toContainText('Bravo (4)');
  });

  test('AC4 — .rank-member-pts column is preserved alongside the inline tally', async ({ page }) => {
    await setupST(page, {
      ranked: { clan_points: { 'char-alpha': 7 }, covenant_points: {} },
    });

    const clanList = page.locator('#rank-clan-list');
    await expect(clanList).toBeVisible({ timeout: 8000 });
    await page.locator('#rank-clan-pills .rank-pill[data-key="Mekhet"]').click();

    // Name span has the inline tally
    const alphaRow = clanList.locator('.rank-member-row').filter({ hasText: 'Alpha' });
    await expect(alphaRow.locator('.rank-member-name')).toContainText('Alpha (7)');
    // Separate pts column still present on the same row
    await expect(alphaRow.locator('.rank-member-pts')).toContainText('7');
  });

  test('AC5 — player ballot picker options have no inline tally', async ({ page }) => {
    await setupPlayer(page);

    const clanSlot = page.locator('.status-ranking-sel[data-rank="clan"][data-slot="1"]');
    await expect(clanSlot).toBeVisible({ timeout: 8000 });

    const opts = await clanSlot.locator('option').allTextContents();
    // Option text should be plain name only — no "(n)" suffix
    const hasTally = opts.some(o => /\(\d+\)/.test(o));
    expect(hasTally).toBe(false);
  });

});
