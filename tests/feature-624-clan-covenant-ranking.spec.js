/**
 * E2E — clan/covenant ranking on the player Status tab (#624).
 *
 * Player view: a ranking ballot (clan + covenant top-3) whose pickers list only
 * the player's clan/covenant members, exclude the player themselves, and save.
 * ST view: the per-character clan/covenant points aggregate (ST-only) renders.
 */

const { test, expect } = require('@playwright/test');
const { bootApp, goToTab } = require('./helpers/unified-app.js');

const PLAYER_USER = {
  id: '900', username: 'voter_player', global_name: 'Voter Player',
  avatar: null, role: 'player', player_id: 'p-624', character_ids: ['char-voter'], is_dual_role: false,
};
const ST_USER = {
  id: '901', username: 'st_user', global_name: 'ST User',
  avatar: null, role: 'st', player_id: 'p-st-624', character_ids: ['char-voter'], is_dual_role: false,
};

const ACTIVE_CYCLE = { _id: 'cycle-624', cycle_number: 1, status: 'active' };

function mkChar(id, name, clan, covenant, covStatus = {}) {
  return {
    _id: id, name, moniker: null, honorific: null, clan, covenant, player: name + ' Player',
    blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: { city: 1, clan: 1, covenant: covStatus },
    attributes: {
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [], // array per schema — unified app renders sheet on boot
  };
}

const VOTER    = mkChar('char-voter', 'Voter',    'Mekhet', 'Invictus', { Invictus: 1 });
const CLANMATE = mkChar('char-clan',  'Clanmate', 'Mekhet', 'Carthian Movement');
const COVMATE  = mkChar('char-cov',   'Covmate',  'Daeva',  'Invictus', { Invictus: 1 });
const ALL = [VOTER, CLANMATE, COVMATE];

function statusProjection(c) {
  return {
    _id: c._id, name: c.name, honorific: c.honorific, moniker: c.moniker,
    clan: c.clan, covenant: c.covenant, status: c.status, court_title: c.court_title,
    player: c.player, powers: [], _player_info: { discord_id: null, discord_avatar: null },
  };
}

async function setup(page, user, { mine = null, aggregate = null } = {}) {
  let lastPut = null;
  // Unified app via the shared harness (#625/#626): catch-all + auth + goto '/' + wait #app.
  // Spec-specific mocks go in `routes` (they win over the catch-all).
  await bootApp(page, user, {
    routes: async (p) => {
      await p.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([VOTER]) }));
      await p.route('**/api/characters/status', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL.map(statusProjection)) }));
      await p.route('**/api/characters/names', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL.map(c => ({ _id: c._id, name: c.name }))) }));
      await p.route('**/api/downtime_cycles', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) }));
      await p.route('**/api/ranking_ballots/mine*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mine) }));
      await p.route('**/api/ranking_ballots/aggregate*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(aggregate || { clan_points: {}, covenant_points: {} }) }));
      await p.route(/\/api\/ranking_ballots$/, r => {
        lastPut = JSON.parse(r.request().postData() || '{}');
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      });
    },
  });
  await goToTab(page, 'status');
  return () => lastPut;
}

test.describe('#624 — player ranking ballot', () => {
  test('ranking section renders with clan + covenant pickers', async ({ page }) => {
    await setup(page, PLAYER_USER);
    await expect(page.locator('.status-ranking-section').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.status-ranking-sel[data-rank="clan"]')).toHaveCount(3);
    await expect(page.locator('.status-ranking-sel[data-rank="covenant"]')).toHaveCount(3);
  });

  test('clan picker lists clan members and excludes the player themselves', async ({ page }) => {
    await setup(page, PLAYER_USER);
    const clanSlot1 = page.locator('.status-ranking-sel[data-rank="clan"][data-slot="1"]');
    await expect(clanSlot1).toBeVisible({ timeout: 8000 });
    const opts = await clanSlot1.locator('option').allTextContents();
    expect(opts).toContain('Clanmate');     // a clan member
    expect(opts).not.toContain('Voter');     // never yourself
    expect(opts).not.toContain('Covmate');   // not a clan member
  });

  test('saving a ballot PUTs the picks and shows Saved', async ({ page }) => {
    const getPut = await setup(page, PLAYER_USER);
    await page.locator('.status-ranking-sel[data-rank="clan"][data-slot="1"]').selectOption('char-clan');
    await page.locator('.status-ranking-sel[data-rank="covenant"][data-slot="1"]').selectOption('char-cov');
    await page.locator('.status-ranking-save').click();
    await expect(page.locator('.status-ranking-msg')).toContainText('Saved', { timeout: 5000 });
    const put = getPut();
    expect(put.clan_ranking['1']).toBe('char-clan');
    expect(put.covenant_ranking['1']).toBe('char-cov');
    expect(put.voter_character_id).toBe('char-voter');
  });
});

test.describe('#624 — ST aggregate (ST-view)', () => {
  test('ST sees per-character clan points with inline tally (#647)', async ({ page }) => {
    await setup(page, ST_USER, { aggregate: { clan_points: { 'char-clan': 5 }, covenant_points: { 'char-cov': 3 } } });
    const clanList = page.locator('#rank-clan-list');
    await expect(clanList).toBeVisible({ timeout: 8000 });
    // Navigate to Mekhet (contains CLANMATE with 5 pts and VOTER with 0 pts)
    await page.locator('#rank-clan-pills .rank-pill[data-key="Mekhet"]').click();
    // Inline tally: points shown in parentheses after name
    await expect(clanList).toContainText('Clanmate (5)');
    // Zero-point entries also render with (0)
    await expect(clanList).toContainText('Voter (0)');
  });

  test('ST covenant list shows inline tally after selecting pill (#647)', async ({ page }) => {
    await setup(page, ST_USER, { aggregate: { clan_points: { 'char-clan': 5 }, covenant_points: { 'char-cov': 3 } } });
    await page.locator('#rank-cov-pills .rank-pill[data-key="Invictus"]').click();
    const covList = page.locator('#rank-cov-list');
    await expect(covList).toContainText('Covmate (3)');
    await expect(covList).toContainText('Voter (0)');
  });
});
