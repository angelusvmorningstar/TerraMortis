/**
 * Regression tests for fix.47 — MINIMAL feeding section shows Advanced-mode hint
 *
 * AC-1: MINIMAL mode → .dt-feed-min-pool__advanced-hint is visible and mentions "Advanced"
 * AC-2: ADVANCED mode → .dt-feed-min-pool__advanced-hint is not in the DOM
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '777000047', username: 'test_player47', global_name: 'Test Player 47',
  avatar: null, role: 'player', player_id: 'p-fix47',
  character_ids: ['char-fix47'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-fix47', status: 'active', label: 'Test Cycle FIX47',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-05-07T00:00:00.000Z',
};

function buildChar() {
  return {
    _id: 'char-fix47', name: 'Hint Tester', moniker: null, honorific: null,
    clan: 'Daeva', covenant: 'Carthian Movement', player: 'Test Player',
    blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {}, disciplines: {}, merits: [], ordeals: [], powers: [],
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setupSuite(page, char) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);

  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) })
  );
  await page.route(new RegExp(`/api/characters/${char._id}$`), r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) })
  );
  await page.route(/\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
  );
  await page.route('**/api/characters/names', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: char._id, name: char.name }]) })
  );
  await page.route('**/api/downtime_cycles', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) })
  );
  await page.route(/\/api\/downtime_submissions/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function openDowntimeForm(page, char) {
  await page.evaluate(async (c) => {
    const sandbox = document.createElement('div');
    sandbox.id = 'dt-sandbox';
    sandbox.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#1a1208;z-index:99999;overflow:auto;';
    document.body.appendChild(sandbox);
    const mod = await import('/js/tabs/downtime-form.js');
    await mod.renderDowntimeTab(sandbox, c, []);
  }, char);
  await page.waitForSelector('#dt-sandbox #dt-btn-submit', { timeout: 10000 });
}

async function switchToAdvanced(page) {
  await page.locator('#dt-sandbox [data-dt-mode="advanced"]').click();
  await page.waitForSelector('#dt-sandbox [data-dt-mode="advanced"][aria-pressed="true"]', { timeout: 5000 });
}

async function expandFeedingSection(page) {
  const titleSel = '#dt-sandbox [data-section-key="feeding"] .qf-section-title';
  await page.locator(titleSel).click();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-section-key="feeding"]');
    return el && !el.classList.contains('collapsed');
  }, { timeout: 5000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.47: MINIMAL feeding section shows Advanced-mode hint', () => {

  test('AC-1: MINIMAL mode — Advanced hint is visible and references "Advanced"', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    // Default mode is MINIMAL — no mode switch needed
    await expandFeedingSection(page);

    const hint = page.locator('#dt-sandbox .dt-feed-min-pool__advanced-hint');
    await expect(hint).toBeVisible({ timeout: 5000 });
    await expect(hint).toContainText('Advanced');
  });

  test('AC-2: ADVANCED mode — Advanced hint is not present in the DOM', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandFeedingSection(page);

    await expect(page.locator('#dt-sandbox .dt-feed-min-pool__advanced-hint')).toHaveCount(0);
  });

});
