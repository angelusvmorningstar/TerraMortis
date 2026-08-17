/**
 * Regression tests for fix.683 — ranking ballot covenant dropdown
 * must only list primary covenant members (c.covenant === me.covenant),
 * not secondary standing holders.
 *
 * Bug: appendRankingSection was building covMembers via covenantRowsFor(),
 * which includes anyone with status.covenant[cov] > 0. Characters who hold
 * secondary standing in a covenant (e.g. Keeper's secondary Invictus) were
 * therefore appearing in the ballot dropdown for that covenant even though
 * their primary covenant is different.
 *
 * AC-1: Secondary standing holder excluded from covenant ballot
 * AC-2: Primary covenant member with 0 standing still appears
 * AC-3: Primary covenant member with standing appears
 * AC-4: Voter themselves excluded from covenant ballot (pre-existing self-exclusion)
 * AC-5: Clan ballot unaffected
 */

const { test, expect } = require('@playwright/test');
const { bootApp, goToTab } = require('./helpers/unified-app.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '683001', username: 'player_683', global_name: 'Player 683',
  avatar: null, role: 'player', player_id: 'p-683', character_ids: ['char-voter-683'], is_dual_role: false,
};

const ACTIVE_CYCLE = { _id: 'cycle-683', cycle_number: 4, status: 'active' };

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
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  };
}

// Voter: Invictus primary
const VOTER = mkChar('char-voter-683', 'Voter683', 'Mekhet', 'Invictus', { Invictus: 1 });
// AC-3: primary Invictus member with standing — SHOULD appear
const PRIMARY_COV = mkChar('char-prim-683', 'PrimCov683', 'Daeva', 'Invictus', { Invictus: 2 });
// AC-2: primary Invictus member with 0 / absent standing — SHOULD appear
const ZERO_STANDING = mkChar('char-zero-683', 'ZeroStand683', 'Gangrel', 'Invictus', {});
// AC-1: Carthian primary but holds secondary Invictus status 3 — must NOT appear (this was the bug)
const SECONDARY_HOLDER = mkChar('char-sec-683', 'SecHolder683', 'Nosferatu', 'Carthian Movement', { Invictus: 3 });
// Clan-only mate for AC-5
const CLANMATE = mkChar('char-clan-683', 'Clanmate683', 'Mekhet', 'Carthian Movement', {});

const ALL = [VOTER, PRIMARY_COV, ZERO_STANDING, SECONDARY_HOLDER, CLANMATE];

function statusProjection(c) {
  return {
    _id: c._id, name: c.name, honorific: c.honorific, moniker: c.moniker,
    clan: c.clan, covenant: c.covenant, status: c.status, court_title: c.court_title,
    player: c.player, powers: [], _player_info: { discord_id: null, discord_avatar: null },
  };
}

async function setup(page) {
  await bootApp(page, PLAYER_USER, {
    routes: async (p) => {
      await p.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([VOTER]) }));
      await p.route('**/api/characters/status', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL.map(statusProjection)) }));
      await p.route('**/api/characters/names', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL.map(c => ({ _id: c._id, name: c.name }))) }));
      await p.route('**/api/chapters', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) }));
      await p.route('**/api/ranking_ballots/mine*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) }));
      await p.route('**/api/ranking_ballots/aggregate*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clan_points: {}, covenant_points: {} }) }));
      await p.route(/\/api\/ranking_ballots$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
    },
  });
  await goToTab(page, 'status');
  // Wait for the ranking section to be present
  await page.waitForSelector('.status-ranking-section', { timeout: 10000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.683 — ranking ballot covenant filter', () => {

  test('AC-1: secondary Invictus standing holder excluded from covenant ballot', async ({ page }) => {
    await setup(page);
    const slot1 = page.locator('.status-ranking-sel[data-rank="covenant"][data-slot="1"]');
    await expect(slot1).toBeVisible({ timeout: 8000 });
    const opts = await slot1.locator('option').allTextContents();
    // SECONDARY_HOLDER holds Invictus status 3 but is Carthian primary — must NOT appear
    expect(opts).not.toContain('SecHolder683');
  });

  test('AC-2: primary covenant member with 0 standing still appears', async ({ page }) => {
    await setup(page);
    const slot1 = page.locator('.status-ranking-sel[data-rank="covenant"][data-slot="1"]');
    await expect(slot1).toBeVisible({ timeout: 8000 });
    const opts = await slot1.locator('option').allTextContents();
    // ZERO_STANDING is Invictus primary with no standing entry — must appear
    expect(opts).toContain('ZeroStand683');
  });

  test('AC-3: primary covenant member with standing appears', async ({ page }) => {
    await setup(page);
    const slot1 = page.locator('.status-ranking-sel[data-rank="covenant"][data-slot="1"]');
    await expect(slot1).toBeVisible({ timeout: 8000 });
    const opts = await slot1.locator('option').allTextContents();
    // PRIMARY_COV is Invictus primary with Invictus 2 — must appear
    expect(opts).toContain('PrimCov683');
  });

  test('AC-4: voter excluded from their own covenant ballot', async ({ page }) => {
    await setup(page);
    const slot1 = page.locator('.status-ranking-sel[data-rank="covenant"][data-slot="1"]');
    await expect(slot1).toBeVisible({ timeout: 8000 });
    const opts = await slot1.locator('option').allTextContents();
    // Voter themselves must not appear in their own ballot
    expect(opts).not.toContain('Voter683');
  });

  test('AC-5: clan ballot unaffected — lists clan members regardless of covenant', async ({ page }) => {
    await setup(page);
    const slot1 = page.locator('.status-ranking-sel[data-rank="clan"][data-slot="1"]');
    await expect(slot1).toBeVisible({ timeout: 8000 });
    const opts = await slot1.locator('option').allTextContents();
    // CLANMATE is Mekhet (same clan as Voter) and Carthian — must appear in clan ballot
    expect(opts).toContain('Clanmate683');
    // Voter themselves excluded from clan ballot too
    expect(opts).not.toContain('Voter683');
  });

});
