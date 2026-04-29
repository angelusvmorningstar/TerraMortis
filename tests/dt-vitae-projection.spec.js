/**
 * E2E coverage for the player downtime form's vitae projection and rote hunt
 * UX changes shipped 2026-04-29 (ad-hoc fixes, no story file).
 *
 * Covers:
 *   - Three-container feeding layout (main hunt / rote section / vitae budget)
 *   - Standard / Rote pill toggle replaces the legacy checkbox
 *   - Rote sub-block expands with its own territory pills + pool selector
 *   - Vitae projection rewrite: starts at 0, lists positive then negative mods,
 *     subtotal "Net starting Vitae", then "Projected average gathered"
 *   - Effective merit ratings (Herd, Mandragora Garden) flow through to projection
 *   - Mandragora Garden: cost is in negatives, Blood Fruit count is below the line
 *   - Oath of Fealty bonus = effective Invictus Status, with case-insensitive
 *     pact-name match (Charlie's data uses "Oath Of Fealty")
 *
 * Test approach: navigates the unified app (index.html), overrides the
 * /api/characters response with a single test character per scenario, and
 * uses goTab('downtime') to render the form.
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654321',
  username: 'test_player',
  global_name: 'Test Player',
  avatar: null,
  role: 'player',
  player_id: 'p-002',
  character_ids: ['char-001'],
  is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-001',
  status: 'active',
  label: 'Test Cycle',
  feeding_rights_confirmed: true,
  is_chapter_finale: false,
  created_at: '2026-04-29T00:00:00.000Z',
};

function buildChar(overrides = {}) {
  return {
    _id: 'char-001',
    name: 'Test Subject',
    moniker: null,
    honorific: null,
    clan: 'Mekhet',
    covenant: 'Invictus',
    player: 'Test Player',
    blood_potency: 1,
    humanity: 7,
    humanity_base: 7,
    court_title: null,
    retired: false,
    status: {
      city: 0,
      clan: 0,
      covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
    },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {},
    disciplines: {},
    merits: [],
    powers: [],
    ordeals: [],
    ...overrides,
  };
}

async function setupSuite(page, char) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    // Use 'fake-test-token' so validateToken hits the mocked /api/auth/me
    // rather than triggering the local-test-token dev-fixtures path (which
    // wraps window.fetch and bypasses Playwright's network mocks).
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);

  // Catch-all first (lowest priority — last-registered wins in Playwright)
  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  // Specific routes registered after take precedence
  await page.route('**/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) })
  );
  await page.route(/\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
  );
  await page.route('**/api/characters/names', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ _id: char._id, name: char.name }]) })
  );
  await page.route('**/api/downtime_cycles', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) })
  );

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

  // Make sure suiteState has the test character selected and switch to it
  await page.evaluate((charId) => {
    if (window.suiteState) {
      const c = (window.suiteState.chars || []).find(x => String(x._id) === String(charId));
      if (c) {
        window.suiteState.sheetChar = c;
        window.suiteState.rollChar = c;
      }
    }
  }, char._id);
}

async function openFeedingSection(page, char) {
  // Directly invoke renderDowntimeTab on a sandbox div so we don't have to
  // wrangle the unified app's character picker. The form is the unit under
  // test — its parent app surface is incidental.
  await page.evaluate(async (c) => {
    const sandbox = document.createElement('div');
    sandbox.id = 'dt-sandbox';
    sandbox.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:99999;overflow:auto;';
    document.body.appendChild(sandbox);
    const mod = await import('/js/tabs/downtime-form.js');
    await mod.renderDowntimeTab(sandbox, c, []);
  }, char);
  // Wait for the feeding section to render (form needs an active cycle to mount)
  await page.waitForSelector('#dt-sandbox .qf-section[data-section-key="feeding"]', { timeout: 10000 });
  // Sections start collapsed — click the title to expand
  await page.locator('#dt-sandbox .qf-section[data-section-key="feeding"] .qf-section-title').click();
  await expect(page.locator('#dt-sandbox .qf-section[data-section-key="feeding"]')).not.toHaveClass(/collapsed/);
}

// ── Tests ────────────────────────────────────────────────────────────────────

// Scope all locators to the sandbox div so we don't accidentally match the
// app's own UI (which uses some of the same CSS classes).
const sb = (page) => page.locator('#dt-sandbox');

test.describe('Downtime feeding — three-container layout', () => {
  test('feeding section renders main hunt, rote section, and vitae budget containers', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openFeedingSection(page, char);

    const section = sb(page).locator('.qf-section[data-section-key="feeding"]');
    await expect(section.locator('.dt-feed-card-wrap')).toBeVisible();
    await expect(section.locator('.dt-feed-rote-section')).toBeVisible();
    await expect(section.locator('.dt-vitae-budget')).toBeVisible();
  });

  test('Standard/Rote toggle pills replace the old checkbox', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openFeedingSection(page, char);

    const stdBtn = sb(page).locator('button[data-feed-rote="off"]');
    const roteBtn = sb(page).locator('button[data-feed-rote="on"]');
    await expect(stdBtn).toHaveText(/Standard Hunt/);
    await expect(roteBtn).toHaveText(/Rote Hunt/);
    // Standard active by default (feedRoteAction === false)
    await expect(stdBtn).toHaveClass(/dt-feed-vi-on/);
    await expect(roteBtn).not.toHaveClass(/dt-feed-vi-on/);
    // Old checkbox should not exist
    await expect(sb(page).locator('#dt-feed-rote')).toHaveCount(0);
  });

  test('clicking Rote Hunt expands sub-block with its own territory pills and pool selector', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openFeedingSection(page, char);

    await sb(page).locator('button[data-feed-rote="on"]').click();
    await expect(sb(page).locator('.dt-rote-slot-picker')).toBeVisible();
    // Rote sub-block has its own territory pills (separate data-attr from main set)
    await expect(sb(page).locator('[data-feed-rote-terr-key]').first()).toBeVisible();
    // Rote textarea uses placeholder, no label
    await expect(sb(page).locator('#dt-rote-description')).toHaveAttribute('placeholder', 'Describe how your character hunts');

    // Toggle back to Standard collapses the sub-block
    await sb(page).locator('button[data-feed-rote="off"]').click();
    await expect(sb(page).locator('.dt-rote-slot-picker')).toHaveCount(0);
  });
});

test.describe('Downtime feeding — vitae projection', () => {
  test('empty character: starting 0, net +0, projected 0 / 10', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openFeedingSection(page, char);

    const budget = sb(page).locator('.dt-vitae-budget');
    await expect(budget).toContainText('Starting Vitae');
    await expect(budget).toContainText('Net starting Vitae');
    await expect(budget.locator('.dt-vitae-subtotal span').last()).toHaveText('+0');
    await expect(budget).toContainText('Projected Vitae after feeding');
    await expect(budget.locator('.dt-vitae-total span').last()).toHaveText('0 / 10');
  });

  test('Herd merit (domain) contributes its effective rating as a positive mod', async ({ page }) => {
    const char = buildChar({
      merits: [{ category: 'domain', name: 'Herd', rating: 3, cp: 3 }],
    });
    await setupSuite(page, char);
    await openFeedingSection(page, char);

    const budget = sb(page).locator('.dt-vitae-budget');
    const herdRow = budget.locator('.dt-vitae-pos', { hasText: 'Herd' }).first();
    await expect(herdRow).toBeVisible();
    await expect(herdRow.locator('span').last()).toHaveText('+3');
    await expect(budget.locator('.dt-vitae-subtotal span').last()).toHaveText('+3');
  });

  test('Mandragora Garden costs vitae (negative mod) and lists Blood Fruit produced', async ({ page }) => {
    const char = buildChar({
      merits: [{ category: 'domain', name: 'Mandragora Garden', rating: 2, cp: 2 }],
    });
    await setupSuite(page, char);
    await openFeedingSection(page, char);

    const budget = sb(page).locator('.dt-vitae-budget');
    const mandRow = budget.locator('.dt-vitae-cost', { hasText: 'Mandragora Garden' });
    await expect(mandRow).toBeVisible();
    await expect(mandRow.locator('span').last()).toHaveText('−2'); // unicode minus + 2
    const fruitRow = budget.locator('.dt-vitae-note', { hasText: 'Blood Fruit produced' });
    await expect(fruitRow).toBeVisible();
    await expect(fruitRow.locator('span').last()).toHaveText('2');
    await expect(budget.locator('.dt-vitae-subtotal span').last()).toHaveText('−2');
  });

  test('Oath of Fealty (canonical lowercase name) adds effective Invictus Status', async ({ page }) => {
    const char = buildChar({
      status: {
        city: 0, clan: 0,
        covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 4, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
      },
      powers: [{ category: 'pact', name: 'Oath of Fealty' }],
    });
    await setupSuite(page, char);
    await openFeedingSection(page, char);

    const budget = sb(page).locator('.dt-vitae-budget');
    const oathRow = budget.locator('.dt-vitae-pos', { hasText: 'Oath of Fealty' });
    await expect(oathRow).toBeVisible();
    await expect(oathRow.locator('span').last()).toHaveText('+4');
    await expect(budget.locator('.dt-vitae-subtotal span').last()).toHaveText('+4');
  });

  test('Oath of Fealty is matched case-insensitively (Charlie\'s data uses "Oath Of Fealty")', async ({ page }) => {
    const char = buildChar({
      status: {
        city: 0, clan: 0,
        covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 4, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
      },
      // Title-cased "Of" — must still match the lower-case canonical pact name
      powers: [{ category: 'pact', name: 'Oath Of Fealty' }],
    });
    await setupSuite(page, char);
    await openFeedingSection(page, char);

    const budget = sb(page).locator('.dt-vitae-budget');
    const oathRow = budget.locator('.dt-vitae-pos', { hasText: 'Oath of Fealty' });
    await expect(oathRow).toBeVisible();
    await expect(oathRow.locator('span').last()).toHaveText('+4');
  });
});
