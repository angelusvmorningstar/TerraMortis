/**
 * Tests for fix #737 — normal feed territory pill must appear in the right column,
 * not the left card body.
 *
 * AC-A: Territory panel is visible inside .proc-feed-right
 * AC-B: Territory panel precedes the Feed Declaration panel in DOM order (top < top)
 */

const { test, expect } = require('@playwright/test');

const ST_USER_737 = {
  id: '123000737', username: 'test_st_737', global_name: 'Test ST 737',
  avatar: null, role: 'st', player_id: 'p-737', character_ids: [], is_dual_role: false,
};

const CYCLE_737 = {
  _id: 'cycle-737', cycle_number: 5, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

const CHAR_737 = {
  _id: 'char-737', name: 'Col Placement Tester', moniker: null, honorific: null,
  clan: 'Ventrue', covenant: 'Invictus', player: 'Test Player 737',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  home_territory: 'academy', retired: false,
  status: { city: 1, clan: 0, covenant: { Invictus: 1 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Persuasion: { dots: 2, bonus: 0, specs: [], nine_again: false } },
  disciplines: {}, merits: [], powers: [], ordeals: [],
};

const TERRITORY_ACADEMY_737 = {
  _id: 'aaa000000000000000000737', slug: 'academy', name: 'The Academy',
  regent_id: null, lieutenant_id: null, feeding_rights: [], ambience: 2,
};

const SUB_FEED_737 = {
  _id: 'sub-737-base',
  chapter_id: 'cycle-737',
  character_name: 'Col Placement Tester',
  character_id: 'char-737',
  player_name: 'Test Player 737',
  submitted_at: '2026-06-15T00:00:00Z',
  _raw: {
    projects: [],
    feeding: { method: 'seduction', pool: { expression: 'Presence 3 + Persuasion 2 = 5' } },
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    feed_violence: 'kiss',
    '_feed_blood_types': '["human"]',
    feeding_territories: '{"the_academy":"feeding_rights"}',
  },
  feeding_review: {
    pool_player: 'Presence 3 + Persuasion 2 = 5',
    pool_validated: 'Presence 3 + Persuasion 2 = 5',
    pool_status: 'validated',
    nine_again: false, eight_again: false,
    active_feed_specs: [], pool_mod_spec: 0, pool_mod_equipment: 0,
    notes_thread: [], player_feedback: '',
  },
  projects_resolved: [],
  merit_actions_resolved: [],
  st_review: {},
  st_narrative: {},
};

async function setupProcessing737(page) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER_737 });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });

    if (url.includes('/api/downtime_submissions'))  return ok([SUB_FEED_737]);
    if (url.includes('/api/chapters'))       return ok([CYCLE_737]);
    if (url.includes('/api/characters/names'))      return ok([{ _id: CHAR_737._id, name: CHAR_737.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))            return ok([CHAR_737]);
    if (url.includes('/api/territories'))           return ok([TERRITORY_ACADEMY_737]);
    if (url.includes('/api/game_sessions'))         return ok([]);
    if (url.includes('/api/session_logs'))          return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openFeedingAction737(page) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="feeding"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
  await page.waitForTimeout(300);
}

test.describe('fix.737: feed territory pill column placement', () => {

  // AC-A ──────────────────────────────────────────────────────────────────────

  test('AC-A: territory panel is inside .proc-feed-right, not the left card body', async ({ page }) => {
    await setupProcessing737(page);
    await openFeedingAction737(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    // Territory panel must be a descendant of .proc-feed-right
    const terrInRight = rightPanel.locator('.proc-feed-mod-panel').filter({
      has: page.locator('.proc-mod-panel-title', { hasText: 'Territory' }),
    });
    await expect(terrInRight.first()).toBeVisible({ timeout: 5000 });
  });

  // AC-B ──────────────────────────────────────────────────────────────────────

  test('AC-B: territory panel appears above the Feed Declaration panel in right column', async ({ page }) => {
    await setupProcessing737(page);
    await openFeedingAction737(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    const terrPanel = rightPanel.locator('.proc-feed-mod-panel').filter({
      has: page.locator('.proc-mod-panel-title', { hasText: 'Territory' }),
    }).first();

    const feedDeclPanel = rightPanel.locator('.proc-feed-violence-block').first();

    await expect(terrPanel).toBeVisible({ timeout: 5000 });
    await expect(feedDeclPanel).toBeVisible({ timeout: 5000 });

    const terrBox = await terrPanel.boundingBox();
    const feedDeclBox = await feedDeclPanel.boundingBox();

    expect(terrBox).not.toBeNull();
    expect(feedDeclBox).not.toBeNull();
    expect(terrBox.y).toBeLessThan(feedDeclBox.y);
  });

});
