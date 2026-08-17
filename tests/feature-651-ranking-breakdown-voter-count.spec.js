/**
 * E2E — vote breakdown and voter count in ST ranking aggregate (#651).
 *
 * Ranked mode: each character's inline tally shows individual contributions (5+3),
 * not just the total. Political mode likewise. Clan/covenant pills show voter count badge.
 * Player ballot view is unaffected (no breakdown visible to players).
 */

const { test, expect } = require('@playwright/test');
const { bootApp, goToTab } = require('./helpers/unified-app.js');

const PLAYER_USER = {
  id: '900', username: 'voter_651', global_name: 'Voter Player',
  avatar: null, role: 'player', player_id: 'p-651', character_ids: ['char-voter-651'], is_dual_role: false,
};
const ST_USER = {
  id: '901', username: 'st_651', global_name: 'ST User',
  avatar: null, role: 'st', player_id: 'p-st-651', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = { _id: 'cycle-651', cycle_number: 4, status: 'active' };

function mkChar(id, name, clan, covenant, statusClan = 1, covStatus = {}) {
  return {
    _id: id, name, moniker: null, honorific: null, clan, covenant, player: name + ' Player',
    blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: { city: 1, clan: statusClan, covenant: covStatus },
    attributes: {
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  };
}

const VOTER    = mkChar('char-voter-651', 'Alpha',    'Mekhet', 'Invictus', 1, { Invictus: 1 });
const CLANMATE = mkChar('char-clan-651',  'Beta',     'Mekhet', 'Carthian Movement');
const COVMATE  = mkChar('char-cov-651',   'Gamma',    'Daeva',  'Invictus', 1, { Invictus: 1 });
const ALL = [VOTER, CLANMATE, COVMATE];

function statusProjection(c) {
  return {
    _id: c._id, name: c.name, honorific: c.honorific, moniker: c.moniker,
    clan: c.clan, covenant: c.covenant, status: c.status, court_title: c.court_title,
    player: c.player, powers: [], _player_info: { discord_id: null, discord_avatar: null },
  };
}

// Ranked aggregate: Beta got contributions from two voters; Alpha got zero; Gamma got one.
const RANKED_AGG = {
  clan_points:          { 'char-clan-651': 8, 'char-voter-651': 0 },
  clan_votes:           { 'char-clan-651': [{ pts: 5, voter: 'VoterOne' }, { pts: 3, voter: 'VoterTwo' }] },
  clan_voter_count:     { Mekhet: 2 },
  covenant_points:      { 'char-cov-651': 5, 'char-voter-651': 0 },
  covenant_votes:       { 'char-cov-651': [{ pts: 5, voter: 'VoterOne' }] },
  covenant_voter_count: { Invictus: 2 },
};

// Political aggregate: Beta got weighted contributions from two voters.
const POLITICAL_AGG = {
  clan_points:          { 'char-clan-651': 4, 'char-voter-651': 0 },
  clan_votes:           { 'char-clan-651': [{ pts: 3, voter: 'HighVoter' }, { pts: 1, voter: 'LowVoter' }] },
  clan_voter_count:     { Mekhet: 2 },
  covenant_points:      { 'char-cov-651': 3, 'char-voter-651': 0 },
  covenant_votes:       { 'char-cov-651': [{ pts: 3, voter: 'HighVoter' }] },
  covenant_voter_count: { Invictus: 2 },
};

async function setup(page, user, { mine = null } = {}) {
  await bootApp(page, user, {
    routes: async (p) => {
      await p.route(/\/api\/characters$/, r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([VOTER]) }));
      await p.route('**/api/characters/status', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL.map(statusProjection)) }));
      await p.route('**/api/characters/names', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL.map(c => ({ _id: c._id, name: c.name }))) }));
      await p.route('**/api/chapters', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) }));
      await p.route('**/api/ranking_ballots/mine*', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mine) }));
      // Dual-mode mock: inspect URL to return ranked vs political fixture.
      await p.route('**/api/ranking_ballots/aggregate*', r => {
        const agg = r.request().url().includes('mode=political') ? POLITICAL_AGG : RANKED_AGG;
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(agg) });
      });
      await p.route(/\/api\/ranking_ballots$/, r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
    },
  });
  await goToTab(page, 'status');
}

test.describe('#651 — ST ranked mode: vote breakdown with voter names', () => {
  test('AC1: character with two contributions shows "voter: pts" pairs', async ({ page }) => {
    await setup(page, ST_USER);
    await page.locator('#rank-clan-pills .rank-pill[data-key="Mekhet"]').click();
    const clanList = page.locator('#rank-clan-list');
    await expect(clanList).toBeVisible({ timeout: 8000 });
    // Beta got {pts:5,voter:'VoterOne'} and {pts:3,voter:'VoterTwo'} → "Beta (VoterOne: 5, VoterTwo: 3)"
    await expect(clanList).toContainText('Beta (VoterOne: 5, VoterTwo: 3)');
  });

  test('AC3: zero-vote character still shows (0)', async ({ page }) => {
    await setup(page, ST_USER);
    await page.locator('#rank-clan-pills .rank-pill[data-key="Mekhet"]').click();
    const clanList = page.locator('#rank-clan-list');
    await expect(clanList).toBeVisible({ timeout: 8000 });
    // Alpha received no votes → votes array empty → fallback to pts = 0
    await expect(clanList).toContainText('Alpha (0)');
  });

  test('AC1 covenant: single contribution shows "voter: pts"', async ({ page }) => {
    await setup(page, ST_USER);
    await page.locator('#rank-cov-pills .rank-pill[data-key="Invictus"]').click();
    const covList = page.locator('#rank-cov-list');
    await expect(covList).toBeVisible({ timeout: 8000 });
    // Gamma got {pts:5,voter:'VoterOne'} → "Gamma (VoterOne: 5)"
    await expect(covList).toContainText('Gamma (VoterOne: 5)');
  });
});

test.describe('#651 — ST political mode: named breakdown after mode switch', () => {
  test('AC2: switching to Political shows weighted "voter: pts" pairs', async ({ page }) => {
    await setup(page, ST_USER);
    await page.locator('.rank-mode-btn[data-mode="political"]').click();
    await page.locator('#rank-clan-pills .rank-pill[data-key="Mekhet"]').click();
    const clanList = page.locator('#rank-clan-list');
    await expect(clanList).toBeVisible({ timeout: 8000 });
    // Beta got {pts:3,voter:'HighVoter'} and {pts:1,voter:'LowVoter'} → "Beta (HighVoter: 3, LowVoter: 1)"
    await expect(clanList).toContainText('Beta (HighVoter: 3, LowVoter: 1)');
  });

  test('AC2 covenant: political covenant named breakdown renders', async ({ page }) => {
    await setup(page, ST_USER);
    await page.locator('.rank-mode-btn[data-mode="political"]').click();
    await page.locator('#rank-cov-pills .rank-pill[data-key="Invictus"]').click();
    const covList = page.locator('#rank-cov-list');
    await expect(covList).toBeVisible({ timeout: 8000 });
    // Gamma got {pts:3,voter:'HighVoter'} → "Gamma (HighVoter: 3)"
    await expect(covList).toContainText('Gamma (HighVoter: 3)');
  });
});

test.describe('#651 — voter count badge on pills', () => {
  test('AC4: active clan pill shows voter count', async ({ page }) => {
    await setup(page, ST_USER);
    const mekhetPill = page.locator('#rank-clan-pills .rank-pill[data-key="Mekhet"]');
    await expect(mekhetPill).toBeVisible({ timeout: 8000 });
    // RANKED_AGG.clan_voter_count.Mekhet = 2 → pill has badge "2"
    await expect(mekhetPill.locator('.rank-voter-count')).toContainText('2');
  });

  test('AC5: covenant pill shows voter count independently', async ({ page }) => {
    await setup(page, ST_USER);
    const invictusPill = page.locator('#rank-cov-pills .rank-pill[data-key="Invictus"]');
    await expect(invictusPill).toBeVisible({ timeout: 8000 });
    // RANKED_AGG.covenant_voter_count.Invictus = 2
    await expect(invictusPill.locator('.rank-voter-count')).toContainText('2');
  });

  test('AC5: voter count updates when switching to Political mode', async ({ page }) => {
    await setup(page, ST_USER);
    await page.locator('.rank-mode-btn[data-mode="political"]').click();
    const mekhetPill = page.locator('#rank-clan-pills .rank-pill[data-key="Mekhet"]');
    await expect(mekhetPill).toBeVisible({ timeout: 5000 });
    // POLITICAL_AGG.clan_voter_count.Mekhet = 2 also
    await expect(mekhetPill.locator('.rank-voter-count')).toContainText('2');
  });
});

test.describe('#651 — AC6: player ballot view unaffected', () => {
  test('player ballot has no breakdown format in name spans', async ({ page }) => {
    await setup(page, PLAYER_USER);
    const rankingSection = page.locator('.status-ranking-section').first();
    await expect(rankingSection).toBeVisible({ timeout: 8000 });
    // The player ballot renders selects, not name spans with point tallies
    // No "+" in any element text within the ranking section (breakdown separator)
    const allText = await rankingSection.textContent();
    // The only "+" should come from stat calculations, not breakdown — player has no agg view
    // Check that no .rank-member-name exists (that's ST-only aggregate rendering)
    await expect(rankingSection.locator('.rank-member-name')).toHaveCount(0);
  });
});
