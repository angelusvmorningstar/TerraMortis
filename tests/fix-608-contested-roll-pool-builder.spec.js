/**
 * Feature #608 — contested roll: styled Opposing Char typeahead + resistance-trait
 * pool builder. Mark contested, pick an opposing char, toggle resistance traits + BP,
 * and the pool computes from the opposing character's stats ("Resolve 3 + Blood
 * Potency 2 = 5") so Roll Defence is available.
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: '123000608', username: 'test_st_608', global_name: 'Test ST 608',
  avatar: null, role: 'st', player_id: 'p-608', character_ids: [], is_dual_role: false,
};

function mkChar(id, name, resolve, bp) {
  return {
    _id: id, name, moniker: null, honorific: null,
    clan: 'Gangrel', covenant: 'Invictus', player: 'P', blood_potency: bp,
    humanity: 6, humanity_base: 7, court_title: null, retired: false,
    status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
    attributes: {
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: resolve, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: { Investigation: { dots: 3, bonus: 0, specs: [], nine_again: false } },
    disciplines: {}, merits: [], powers: [], ordeals: [],
  };
}

const EINAR = mkChar('char-einar', 'Einar Test', 2, 2);  // acting char
const RYAN  = mkChar('char-ryan',  'Ryan Ambrose', 3, 2); // opposing: Resolve 3, BP 2
const ALL_CHARS = [EINAR, RYAN];

const TEST_CYCLE = { _id: 'cycle-608', cycle_number: 3, status: 'active', confirmed_ambience: {}, narrative_notes: '' };
const TITLE = 'Hunt the Hunter';

function sub() {
  return {
    _id: 'sub-608', chapter_id: 'cycle-608',
    character_name: 'Einar Test', character_id: 'char-einar', player_name: 'P',
    submitted_at: '2026-06-05T00:00:00Z',
    _raw: { projects: [{ action_type: 'investigate', title: TITLE, desired_outcome: TITLE, detail: 'Scour.', primary_pool: { expression: 'Wits 3 + Investigation 3 = 6' } }], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: { project_1_action: 'investigate', project_1_title: TITLE, project_1_description: 'Scour.', project_1_pool_expr: 'Wits 3 + Investigation 3 = 6' },
    projects_resolved: [{ action_type: 'investigate', pool_validated: 'Wits 3 + Investigation 3 = 6', pool_status: 'validated', roll_mode: 'player', roll: null, notes_thread: [] }],
    feeding_review: null, merit_actions_resolved: [], st_review: { territory_overrides: {} },
  };
}

async function setup(page) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
    if (url.includes('/api/downtime_submissions')) return ok([sub()]);
    if (url.includes('/api/chapters'))      return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))     return ok(ALL_CHARS.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))           return ok(ALL_CHARS);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-action-row', { hasText: TITLE }).first().click();
  await page.waitForSelector('.proc-action-detail .proc-proj-roll-card', { timeout: 8000 });
}

const detail = (page) => page.locator('.proc-action-detail').first();

test.describe('Feature #608 — contested resistance pool builder', () => {

  test('typeahead opposing char + resistance traits compute the pool', async ({ page }) => {
    await setup(page);

    // Mark contested.
    await detail(page).locator('.proc-contested-toggle').first().click();
    await page.waitForTimeout(400);

    // Opposing Char is a styled typeahead (no raw <select>).
    await expect(detail(page).locator('.proc-contested-char-sel')).toHaveCount(0);
    const ta = detail(page).locator('.proc-conn-typeahead[data-ta-save="contested_char"]').first();
    await expect(ta).toBeVisible();

    // Pick Ryan via the typeahead.
    await ta.locator('.proc-conn-input').fill('Ryan');
    await page.waitForTimeout(300);
    await ta.locator('.proc-conn-dropdown .proc-conn-dd-item', { hasText: 'Ryan Ambrose' }).first().click();
    await page.waitForTimeout(500);

    // Resistance builder now shows trait chips (no free-text input).
    await expect(detail(page).locator('.proc-contested-pool-input')).toHaveCount(0);
    await expect(detail(page).locator('.proc-contested-trait[data-trait="Resolve"]')).toBeVisible({ timeout: 5000 });

    // Toggle Resolve + Blood Potency → pool = Resolve 3 + BP 2 = 5.
    await detail(page).locator('.proc-contested-trait[data-trait="Resolve"]').first().click();
    await page.waitForTimeout(400);
    await detail(page).locator('.proc-contested-bp').first().click();
    await page.waitForTimeout(400);

    const total = detail(page).locator('.proc-contested-total').first();
    await expect(total).toContainText('Resolve 3');
    await expect(total).toContainText('Blood Potency 2');
    await expect(total).toContainText('= 5');

    // Roll Defence becomes available.
    await expect(detail(page).locator('.proc-contested-roll-btn')).toHaveCount(1);
  });

  // QA top-up: resistances can combine two attributes — Resolve 3 + Composure 2 = 5.
  test('two resistance traits sum correctly', async ({ page }) => {
    await setup(page);
    await detail(page).locator('.proc-contested-toggle').first().click();
    await page.waitForTimeout(400);
    const ta = detail(page).locator('.proc-conn-typeahead[data-ta-save="contested_char"]').first();
    await ta.locator('.proc-conn-input').fill('Ryan');
    await page.waitForTimeout(300);
    await ta.locator('.proc-conn-dropdown .proc-conn-dd-item', { hasText: 'Ryan Ambrose' }).first().click();
    await page.waitForTimeout(500);
    await detail(page).locator('.proc-contested-trait[data-trait="Resolve"]').first().click();
    await page.waitForTimeout(400);
    await detail(page).locator('.proc-contested-trait[data-trait="Composure"]').first().click();
    await page.waitForTimeout(400);
    const total = detail(page).locator('.proc-contested-total').first();
    await expect(total).toContainText('Resolve 3');
    await expect(total).toContainText('Composure 2');
    await expect(total).toContainText('= 5');
  });

  test('resistance builder is gated until an opposing char is picked', async ({ page }) => {
    await setup(page);
    await detail(page).locator('.proc-contested-toggle').first().click();
    await page.waitForTimeout(400);
    // No opposing char yet → hint, no trait chips, no roll button.
    await expect(detail(page).locator('.proc-contested-trait')).toHaveCount(0);
    await expect(detail(page).locator('.proc-contested-roll-btn')).toHaveCount(0);
    await expect(detail(page)).toContainText('Select an opposing character first');
  });

});
