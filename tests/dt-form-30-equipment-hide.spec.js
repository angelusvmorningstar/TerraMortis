/**
 * E2E tests for dt-form.30 — Equipment section hidden for this DT cycle (GH #85)
 *
 * Verifies that:
 * 1. The Equipment section heading is not rendered in ADVANCED mode.
 * 2. The Equipment section heading is not rendered in MINIMAL mode.
 * 3. Legacy equipment_* data in a saved submission is preserved on re-save
 *    (i.e., the collect block skips equipment when hidden, leaving prior values intact).
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '333444555', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-dt30',
  character_ids: ['char-dt30'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-dt30', status: 'active', label: 'Test Cycle DT30',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-05-07T00:00:00.000Z',
};

function buildChar() {
  return {
    _id: 'char-dt30', name: 'Equipment Tester', moniker: null, honorific: null,
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

async function setupSuite(page, char, existingSubmission = null) {
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
          _id: existingSubmission?._id || 'sub-dt30-new',
          cycle_id: ACTIVE_CYCLE._id, character_id: char._id,
          status: 'draft', responses: reqBody.responses || {},
        }),
      });
    }
    const list = existingSubmission ? [existingSubmission] : [];
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) });
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
  await page.waitForSelector('#dt-sandbox #dt-btn-submit-final', { timeout: 5000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('dt-form.30: Equipment section hidden for this DT cycle', () => {

  test('Equipment section heading absent in ADVANCED mode', async ({ page }) => {
    await setupSuite(page, buildChar());
    await openDowntimeForm(page, buildChar());
    await switchToAdvanced(page);

    // The section heading contains "Equipment" — must not be present
    const equipSection = page.locator('#dt-sandbox [data-section-key="equipment"]');
    await expect(equipSection).toHaveCount(0);

    // Double-check: no heading text "Equipment: Items and Gear"
    const equipHeading = page.locator('#dt-sandbox :text("Equipment: Items and Gear")');
    await expect(equipHeading).toHaveCount(0);
  });

  test('Equipment section heading absent in MINIMAL mode', async ({ page }) => {
    await setupSuite(page, buildChar());
    await openDowntimeForm(page, buildChar());
    // MINIMAL is the default mode — no mode switch needed

    const equipSection = page.locator('#dt-sandbox [data-section-key="equipment"]');
    await expect(equipSection).toHaveCount(0);

    const equipHeading = page.locator('#dt-sandbox :text("Equipment: Items and Gear")');
    await expect(equipHeading).toHaveCount(0);
  });

  test('Legacy equipment_* data preserved in POST body when section is hidden', async ({ page }) => {
    const char = buildChar();
    const existingSub = {
      _id: 'sub-dt30-legacy',
      cycle_id: ACTIVE_CYCLE._id,
      character_id: char._id,
      status: 'draft',
      responses: {
        equipment_slot_count: '1',
        equipment_1_name: 'Silver Dagger',
        equipment_1_qty: '1',
        equipment_1_notes: 'For defence',
      },
    };
    await setupSuite(page, char, existingSub);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);

    // Intercept the save request and verify equipment fields are preserved
    const [request] = await Promise.all([
      page.waitForRequest(
        req => req.url().includes('/api/downtime_submissions') &&
               (req.method() === 'POST' || req.method() === 'PUT'),
        { timeout: 5000 }
      ),
      page.locator('#dt-sandbox #dt-btn-submit').click(),
    ]);

    const body = JSON.parse(request.postData() || '{}');
    const responses = body?.responses || {};

    // Equipment data from prior submission must survive the save
    expect(responses['equipment_1_name']).toBe('Silver Dagger');
    expect(responses['equipment_1_qty']).toBe('1');
    expect(responses['equipment_1_notes']).toBe('For defence');
  });

});
