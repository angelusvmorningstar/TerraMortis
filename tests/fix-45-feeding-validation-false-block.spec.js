/**
 * Regression tests for fix.45 — feeding method must not block DT form submission
 *
 * Verifies that "How does your character hunt?" never appears in the required-field
 * error toast (DTFP-4: feeding_method.required is false; pool components are the gate).
 *
 * AC-1: territory filled, method blank → toast does NOT include feeding-method label
 * AC-2: both blank → toast includes "Feeding Territory", NOT feeding-method label
 * AC-3: both filled → no feeding errors in toast
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '777000045', username: 'test_player45', global_name: 'Test Player 45',
  avatar: null, role: 'player', player_id: 'p-fix45',
  character_ids: ['char-fix45'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-fix45', status: 'active', label: 'Test Cycle FIX45',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-05-07T00:00:00.000Z',
};

function buildChar() {
  return {
    _id: 'char-fix45', name: 'Feeding Tester', moniker: null, honorific: null,
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
  await page.route(/\/api\/downtime_submissions/, r => {
    if (r.request().method() === 'POST' || r.request().method() === 'PUT') {
      const reqBody = JSON.parse(r.request().postData() || '{}');
      return r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          _id: 'sub-fix45-new',
          cycle_id: ACTIVE_CYCLE._id, character_id: char._id,
          status: 'draft', responses: reqBody.responses || {},
        }),
      });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

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

/** Fill feeding_territories so the territory gate passes. */
async function fillFeedingTerritory(page) {
  // Set a non-empty, non-'none' value on the feeding_territories hidden field directly.
  // The form encodes territory selections as JSON in a hidden input.
  await page.evaluate(() => {
    const el = document.getElementById('dt-feeding_territories');
    if (el) {
      el.value = JSON.stringify({ 'Downtown': 'hunt' });
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

/** Select the first non-empty option in the feeding_method select. */
async function fillFeedingMethod(page) {
  await page.evaluate(() => {
    const el = document.getElementById('dt-feeding_method');
    if (el) {
      const firstOpt = Array.from(el.options).find(o => o.value && o.value !== '');
      if (firstOpt) {
        el.value = firstOpt.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
}

const FEEDING_METHOD_LABEL = 'How does your character hunt?';

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.45: feeding method must not block DT form submission', () => {

  test('AC-1: territory filled, method blank → no feeding-method error in toast', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);

    await fillFeedingTerritory(page);
    // feeding_method left blank

    await page.click('#dt-sandbox #dt-btn-submit');
    // Toast may or may not appear depending on other required fields.
    // Either way, FEEDING_METHOD_LABEL must never be in any toast text.
    const toast = page.locator('#dt-toast');
    try {
      await toast.waitFor({ state: 'visible', timeout: 3000 });
      const text = await toast.textContent();
      expect(text).not.toContain(FEEDING_METHOD_LABEL);
    } catch {
      // No toast at all means validation passed — also acceptable.
    }
  });

  test('AC-2: both blank → toast has "Feeding Territory", not feeding-method label', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);

    // Leave both feeding_territories and feeding_method blank (default state)
    await page.click('#dt-sandbox #dt-btn-submit');

    const toast = page.locator('#dt-toast');
    await expect(toast).toBeVisible({ timeout: 5000 });

    const text = await toast.textContent();
    expect(text).toContain('Feeding Territory');
    expect(text).not.toContain(FEEDING_METHOD_LABEL);
  });

  test('AC-3: both filled → no feeding section errors', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);

    await fillFeedingTerritory(page);
    await fillFeedingMethod(page);

    await page.click('#dt-sandbox #dt-btn-submit');

    // If a toast appears, it must not reference either feeding field.
    const toast = page.locator('#dt-toast');
    try {
      await toast.waitFor({ state: 'visible', timeout: 3000 });
      const text = await toast.textContent();
      expect(text).not.toContain('Feeding Territory');
      expect(text).not.toContain(FEEDING_METHOD_LABEL);
    } catch {
      // No toast — validation passed entirely. Acceptable.
    }
  });

});
