/**
 * E2E tests for dt-form.32 — Remove joint authoring / project invitation from MVP (GH #83)
 *
 * Verifies that:
 * 1. No Solo/Joint toggle (radio or ticker fieldset) is present anywhere in the form.
 * 2. No Pending Invitations panel is present anywhere in the form.
 * 3. A legacy submission with project_1_is_joint / joint_* keys loads without JS
 *    errors and renders a normal project slot (action select visible, no joint chrome).
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '777888999', username: 'test_player32', global_name: 'Test Player 32',
  avatar: null, role: 'player', player_id: 'p-dt32',
  character_ids: ['char-dt32'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-dt32', status: 'active', label: 'Test Cycle DT32',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-05-07T00:00:00.000Z',
};

function buildChar() {
  return {
    _id: 'char-dt32', name: 'Joint Tester', moniker: null, honorific: null,
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
          _id: existingSubmission?._id || 'sub-dt32-new',
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
  await page.waitForSelector('#dt-sandbox [data-dt-mode="advanced"][aria-pressed="true"]', { timeout: 5000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('dt-form.32: Joint authoring removed from MVP', () => {

  test('No Solo/Joint toggle present in ADVANCED mode', async ({ page }) => {
    await setupSuite(page, buildChar());
    await openDowntimeForm(page, buildChar());
    await switchToAdvanced(page);

    // No individual radio with Solo/Joint data attribute
    const soloJointRadio = page.locator('#dt-sandbox [data-project-solo-joint]');
    await expect(soloJointRadio).toHaveCount(0);

    // No ticker fieldset wrapping the Solo/Joint radios
    const soloJointTicker = page.locator('#dt-sandbox [data-proj-solo-joint-ticker]');
    await expect(soloJointTicker).toHaveCount(0);
  });

  test('No Pending Invitations panel present in ADVANCED mode', async ({ page }) => {
    await setupSuite(page, buildChar());
    await openDowntimeForm(page, buildChar());
    await switchToAdvanced(page);

    const invPanel = page.locator('#dt-sandbox .dt-pending-invitations-panel');
    await expect(invPanel).toHaveCount(0);
  });

  test('Legacy joint submission loads cleanly — no errors, normal slot rendered', async ({ page }) => {
    const char = buildChar();
    const existingSub = {
      _id: 'sub-dt32-legacy',
      cycle_id: ACTIVE_CYCLE._id,
      character_id: char._id,
      status: 'draft',
      responses: {
        project_1_is_joint: 'yes',
        project_1_joint_description: 'test desc',
        project_1_joint_invited_ids: '[]',
        project_1_joint_role: 'lead',
      },
    };

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setupSuite(page, char, existingSub);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);

    // No JS errors during load
    expect(consoleErrors.filter(e => !e.includes('favicon'))).toHaveLength(0);

    // The normal action select for slot 1 exists in the DOM (not replaced by support-slot chrome)
    const actionSelect = page.locator('#dt-sandbox #dt-project_1_action');
    await expect(actionSelect).toHaveCount(1);

    // No joint tab badge on the tab bar
    const jointBadge = page.locator('#dt-sandbox .dt-proj-tab-joint-badge');
    await expect(jointBadge).toHaveCount(0);

    // No joint panel chrome of any kind
    const jointPanel = page.locator('#dt-sandbox .dt-proj-support-pane, #dt-sandbox .dt-proj-support-header');
    await expect(jointPanel).toHaveCount(0);
  });

});
