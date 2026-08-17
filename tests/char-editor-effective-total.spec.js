/**
 * Editor card corner total — effective rating inclusive of bonus dots (issue #573)
 *
 * Verifies that the prominent corner total (`.bd-val`) on Attribute and Skill
 * cards in the sheet editor edit mode shows the EFFECTIVE rating (base + bonus
 * dots), matching the rendered filled+hollow dots — not just CP+XP.
 *
 * Covers:
 *   - Skill with a manual bonus dot → corner = cp + xp-derived + bonus, dots = filled + hollow
 *   - Skill with zero bonus → corner unchanged (= cp + xp-derived)
 *   - Attribute with discipline auto-bonus + manual bonus → corner = tot + autoBonus + bonus
 *
 * Also covers issue #577 PT dot-4 gate:
 *   - Post-migration state (dots=4, free=0): PT hollow dot renders, corner = 5 = ●●●●○
 *   - Gate regression: even with old folded data (dots=5), sheet never renders 6 dots
 *
 * Fixtures keep `cp` aligned with stored `dots` so the corner's filled portion
 * (cp/xp-derived) matches the rendered dots (stored dots) — the change under test
 * only adds the bonus channel on top.
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

// baseDots for a non-clan attribute = 1. cp is set so (baseDots + cp) === dots,
// keeping the corner's filled portion consistent with the rendered dots.
const TEST_CHAR = {
  _id: 'char-573-001',
  name: 'Effie Testbridge',
  moniker: null,
  honorific: null,
  clan: 'Mekhet',
  covenant: 'Ordo Dracul',
  player: 'Test Player',
  blood_potency: 2,
  humanity: 6,
  humanity_base: 7,
  court_title: null,
  clan_attribute: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 1 } },
  attributes: {
    Intelligence: { dots: 2, bonus: 0, cp: 1, xp: 0 },
    Wits:         { dots: 2, bonus: 0, cp: 1, xp: 0 },
    Resolve:      { dots: 2, bonus: 0, cp: 1, xp: 0 },
    // Strength: discipline auto-bonus (Vigour 1) + manual bonus 1 on top of 3 base
    Strength:     { dots: 3, bonus: 1, cp: 2, xp: 0 },
    Dexterity:    { dots: 2, bonus: 0, cp: 1, xp: 0 },
    Stamina:      { dots: 2, bonus: 0, cp: 1, xp: 0 },
    Presence:     { dots: 2, bonus: 0, cp: 1, xp: 0 },
    Manipulation: { dots: 2, bonus: 0, cp: 1, xp: 0 },
    // Composure: zero-bonus control
    Composure:    { dots: 2, bonus: 0, cp: 1, xp: 0 },
  },
  skills: {
    // Expression: cp 4 + manual bonus 1 → corner 5, dots ●●●●○
    Expression: { dots: 4, bonus: 1, cp: 4, xp: 0, specs: ['prosecution'], nine_again: false },
    // Academics: zero-bonus control → corner 2
    Academics:  { dots: 2, bonus: 0, cp: 2, xp: 0, specs: [], nine_again: false },
  },
  // Vigour drives Strength's auto-bonus (BONUS_SOURCE = { Strength: 'Vigour', Stamina: 'Resilience' })
  disciplines: { Vigour: { dots: 1 } },
  merits: [],
  powers: [],
  ordeals: [],
  xp_log: { spent: 0 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAsST(page) {
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TEST_CHAR]) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ _id: TEST_CHAR._id, name: TEST_CHAR.name, moniker: null, honorific: null }]) })
  );
  await page.route(/\/api\/characters\/char-573-001$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_CHAR) })
  );
  // ST-mods overlay boot fetch (ADR-004) — empty so no overlay is applied
  await page.route('**/api/st_mods*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  );
  await page.route(/\/api\/game_sessions\/next/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  );
  await page.route(/\/api\/game_sessions/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/chapters*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/downtime_submissions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/territories*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/session_logs*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/players*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });
}

async function openCharInEditMode(page) {
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])');
  await page.waitForSelector('[data-id="char-573-001"]', { timeout: 5000 });
  await page.click('[data-id="char-573-001"]');
  await page.waitForSelector('#char-detail #cd-edit-toggle', { timeout: 5000 });
  await page.click('#cd-edit-toggle');
  await page.waitForSelector('#cd-save-api:not([style*="display: none"])', { timeout: 5000 });
  // Edit-mode skill cells only exist once the edit sheet has rendered
  await page.waitForSelector('.sk-edit-cell', { timeout: 5000 });
}

// ══════════════════════════════════════
//  SKILL CARD — corner total
// ══════════════════════════════════════

test.describe('Editor card effective total — Skills (#573)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await openCharInEditMode(page);
  });

  test('skill with a manual bonus shows effective total (5) and a hollow bonus dot', async ({ page }) => {
    const cell = page.locator('.sk-edit-cell', { hasText: 'Expression' });
    // Corner total = cp(4) + xp-derived(0) + bonus(1) = 5
    await expect(cell.locator('.bd-val')).toHaveText('5');
    // Dots: 4 filled + 1 hollow = ●●●●○
    await expect(cell.locator('.pointed')).toHaveCount(5);
    await expect(cell.locator('.pointed.hollow')).toHaveCount(1);
  });

  test('skill with zero bonus shows unchanged total (cp + xp-derived)', async ({ page }) => {
    const cell = page.locator('.sk-edit-cell', { hasText: 'Academics' });
    await expect(cell.locator('.bd-val')).toHaveText('2');
    await expect(cell.locator('.pointed.hollow')).toHaveCount(0);
  });
});

// ══════════════════════════════════════
//  ATTRIBUTE CARD — corner total
// ══════════════════════════════════════

test.describe('Editor card effective total — Attributes (#573)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await openCharInEditMode(page);
  });

  test('attribute with discipline auto-bonus + manual bonus shows effective total (5)', async ({ page }) => {
    // tot(3) + autoBonus Vigour(1) + manual bonus(1) = 5
    const panel = page.locator('.attr-cell-edit', { hasText: 'Strength' })
      .locator('xpath=following-sibling::div[contains(@class,"attr-bd-panel")]');
    await expect(panel.locator('.bd-eq .bd-val')).toHaveText('5');
    // Dots: 3 filled + 2 hollow (1 auto + 1 manual)
    const wrap = page.locator('div').filter({ has: page.locator('.attr-cell-edit', { hasText: 'Strength' }) }).first();
    await expect(wrap.locator('.attr-dots-sh .pointed.hollow')).toHaveCount(2);
  });

  test('attribute with zero bonus shows unchanged total', async ({ page }) => {
    // Composure: baseDots(1) + cp(1) = 2, no bonus
    const panel = page.locator('.attr-cell-edit', { hasText: 'Composure' })
      .locator('xpath=following-sibling::div[contains(@class,"attr-bd-panel")]');
    await expect(panel.locator('.bd-eq .bd-val')).toHaveText('2');
  });
});

// ══════════════════════════════════════
//  PT DOT-4 GATE (issue #577)
// ══════════════════════════════════════

// Minimal PT character: post-migration state (dots=4, free=0, cp=4).
// PT merit dot4_skill = 'Intimidation'. PT rating=5 so tier-4 rule fires.
const PT_CHAR = {
  _id: 'char-577-edna',
  name: 'Edna (PT-577 fixture)',
  moniker: null, honorific: null,
  clan: 'Nosferatu', covenant: 'Invictus',
  player: 'Test Player', blood_potency: 2,
  humanity: 7, humanity_base: 7,
  court_title: null, clan_attribute: null, retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Intelligence: { dots: 2, bonus: 0, cp: 1, xp: 0 }, Wits: { dots: 2, bonus: 0, cp: 1, xp: 0 },
    Resolve: { dots: 2, bonus: 0, cp: 1, xp: 0 }, Strength: { dots: 2, bonus: 0, cp: 1, xp: 0 },
    Dexterity: { dots: 2, bonus: 0, cp: 1, xp: 0 }, Stamina: { dots: 2, bonus: 0, cp: 1, xp: 0 },
    Presence: { dots: 2, bonus: 0, cp: 1, xp: 0 }, Manipulation: { dots: 2, bonus: 0, cp: 1, xp: 0 },
    Composure: { dots: 2, bonus: 0, cp: 1, xp: 0 },
  },
  // Post-migration: dots=cp=4, free=0. PT hollow dot comes from rule engine only.
  skills: {
    Intimidation: { dots: 4, bonus: 0, cp: 4, xp: 0, free: 0, specs: [], nine_again: false },
  },
  merits: [
    { name: 'Professional Training', category: 'standing', dots: 5, rating: 5,
      cp: 5, xp: 0, dot4_skill: 'Intimidation', asset_skills: ['Intimidation', 'Subterfuge'] },
  ],
  disciplines: {},
  powers: [], ordeals: [], xp_log: { spent: 0 },
};

// Same as PT_CHAR but with the old broken data shape (free folded into dots).
const PT_CHAR_BROKEN = {
  ...PT_CHAR,
  _id: 'char-577-edna-broken',
  name: 'Edna (PT-577 broken fixture)',
  skills: {
    Intimidation: { dots: 5, bonus: 0, cp: 4, xp: 0, free: 1, specs: [], nine_again: false },
  },
};

// PT tier-4 skill-bonus rule — makes the rule engine add dot4_skill to _pt_dot4_bonus_skills.
const PT_RULES = {
  rule_skill_bonus: [{ source: 'Professional Training', tier: 4, target_skill: 'dot4_skill' }],
  rule_grant: [], rule_nine_again: [], rule_speciality_grant: [],
  rule_tier_budget: [], rule_disc_attr: [], rule_derived_stat_modifier: [],
};

async function loginAsSTWithPTChar(page, char) {
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: char._id, name: char.name, moniker: null, honorific: null }]) })
  );
  await page.route(new RegExp(`/api/characters/${char._id}$`), route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) })
  );
  await page.route('**/api/rules/aggregate*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PT_RULES) })
  );
  await page.route('**/api/st_mods*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  );
  await page.route(/\/api\/game_sessions\/next/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  );
  await page.route(/\/api\/game_sessions/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/chapters*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/downtime_submissions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/territories*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/session_logs*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/players*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });
}

async function openPTCharInEditMode(page, charId) {
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])');
  await page.waitForSelector(`[data-id="${charId}"]`, { timeout: 5000 });
  await page.click(`[data-id="${charId}"]`);
  await page.waitForSelector('#char-detail #cd-edit-toggle', { timeout: 5000 });
  await page.click('#cd-edit-toggle');
  await page.waitForSelector('#cd-save-api:not([style*="display: none"])', { timeout: 5000 });
  await page.waitForSelector('.sk-edit-cell', { timeout: 5000 });
}

async function openPTCharInViewMode(page, charId) {
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])');
  await page.waitForSelector(`[data-id="${charId}"]`, { timeout: 5000 });
  await page.click(`[data-id="${charId}"]`);
  // Sheet loaded in view mode — edit toggle present but NOT clicked
  await page.waitForSelector('#char-detail #cd-edit-toggle', { timeout: 5000 });
  await page.waitForSelector('.sh-skill-row', { timeout: 5000 });
}

test.describe('PT dot-4 render gate — sheet.js base<5 guard (#577)', () => {
  test('post-migration state: Intimidation renders ●●●●○ (4 filled + 1 hollow), corner = 5', async ({ page }) => {
    await loginAsSTWithPTChar(page, PT_CHAR);
    await openPTCharInEditMode(page, PT_CHAR._id);
    const cell = page.locator('.sk-edit-cell', { hasText: 'Intimidation' });
    // Corner total = cp(4) + ptBn(1, gate passes: 4+0 < 5) = 5
    await expect(cell.locator('.bd-val')).toHaveText('5');
    // Dots: 4 filled + 1 hollow = ●●●●○ (5 total)
    await expect(cell.locator('.pointed')).toHaveCount(5);
    await expect(cell.locator('.pointed.hollow')).toHaveCount(1);
  });

  test('gate regression: old folded data (dots=5, free=1) never renders 6 dots', async ({ page }) => {
    await loginAsSTWithPTChar(page, PT_CHAR_BROKEN);
    await openPTCharInEditMode(page, PT_CHAR_BROKEN._id);
    const cell = page.locator('.sk-edit-cell', { hasText: 'Intimidation' });
    // Gate fires: (d=5 + bn=0) >= 5, so ptBn=0; dotStr = shDotsWithBonus(5, 0) = 5 filled, 0 hollow
    await expect(cell.locator('.pointed')).toHaveCount(5);
    await expect(cell.locator('.pointed.hollow')).toHaveCount(0);
  });

  // ── View mode (sheet.js ~547) — same gate, different code path ──────────────

  test('view mode: post-migration Intimidation renders ●●●●○ (4 filled + 1 hollow)', async ({ page }) => {
    await loginAsSTWithPTChar(page, PT_CHAR);
    await openPTCharInViewMode(page, PT_CHAR._id);
    const row = page.locator('.sh-skill-row', {
      has: page.locator('.sh-skill-name', { hasText: 'Intimidation' }),
    });
    await expect(row.locator('.pointed')).toHaveCount(5);
    await expect(row.locator('.pointed.hollow')).toHaveCount(1);
  });

  test('view mode gate regression: broken data (dots=5) renders 5 dots not 6', async ({ page }) => {
    await loginAsSTWithPTChar(page, PT_CHAR_BROKEN);
    await openPTCharInViewMode(page, PT_CHAR_BROKEN._id);
    const row = page.locator('.sh-skill-row', {
      has: page.locator('.sh-skill-name', { hasText: 'Intimidation' }),
    });
    await expect(row.locator('.pointed')).toHaveCount(5);
    await expect(row.locator('.pointed.hollow')).toHaveCount(0);
  });
});
