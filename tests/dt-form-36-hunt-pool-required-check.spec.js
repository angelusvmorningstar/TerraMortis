/**
 * Tests for dt-form.36 — feeding_method required:true always blocked submission (GH #115)
 *
 * The bug: DOWNTIME_SECTIONS feeding_method question had required:true, but
 * collectResponses() never writes to responses['feeding_method'] — it writes to
 * _feed_method/_feed_custom_attr etc. So responses['feeding_method'] was always
 * undefined, making the required check always fire.
 *
 * The fix: required:false on feeding_method in DOWNTIME_SECTIONS (DTFP-4 intent).
 * The minimum-complete gate (_hasFeedingMethod in dt-completeness.js) correctly
 * checks FEEDING_POOL_KEYS and is unchanged.
 *
 * Technique: mounts the DT form in a sandbox overlay (same pattern as
 * dt-form-34-submit-delegation.spec.js). Clicks submit with feeding territory
 * absent so the form fails at the territory gate — proving submitForm() ran past
 * the feeding_method check without firing "How does your character hunt?".
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-002',
  character_ids: ['char-001'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-dt36', status: 'active', label: 'Test Cycle DT36',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-05-07T00:00:00.000Z',
};

function buildChar(overrides = {}) {
  return {
    _id: 'char-001', name: 'Test Subject', moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
    blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: {
      city: 1, clan: 1,
      covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
    },
    attributes: {
      Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {
      Stealth: { dots: 2, bonus: 0, specs: [], nine_again: false },
      Persuasion: { dots: 2, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: { Auspex: { dots: 2 } },
    merits: [], powers: [], ordeals: [],
    ...overrides,
  };
}

// Prior submission with a persisted feed method (but no territory)
function buildPriorSub(responses = {}) {
  return {
    _id: 'sub-dt36-prior',
    cycle_id: ACTIVE_CYCLE._id,
    character_id: 'char-001',
    status: 'draft',
    responses,
  };
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function setupSuite(page, char, priorSub = null) {
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
  await page.route(/\/api\/characters\/char-001$/, r =>
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
  // Regex matches both bare /api/downtime_submissions and ?cycle_id=... variants
  await page.route(/\/api\/downtime_submissions($|\?)/, r => {
    if (r.request().method() === 'GET') {
      return r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(priorSub ? [priorSub] : []),
      });
    }
    if (r.request().method() === 'POST') {
      return r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          _id: 'sub-dt36-new', cycle_id: ACTIVE_CYCLE._id,
          character_id: char._id, status: 'submitted', responses: {},
        }),
      });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  if (priorSub) {
    await page.route(new RegExp(`/api/downtime_submissions/${priorSub._id}`), r =>
      r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...priorSub, status: 'submitted' }),
      })
    );
  }

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

// Click #dt-btn-submit (calls submitForm() in both MINIMAL and ADVANCED modes)
// and confirm the validation toast fired. #dt-btn-submit-final opens a confirmation
// modal and does NOT call submitForm() — do not use it as the click target here.
// In all tests the feeding territory is not selected, so the toast should mention
// "Feeding Territory" — proving submitForm ran past the feeding_method check.
async function submitAndCheckToast(page) {
  await page.locator('#dt-sandbox #dt-btn-submit').click();
  const toast = page.locator('#dt-toast');
  await expect(toast).toBeVisible({ timeout: 3000 });
  return toast;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('dt-form.36: feeding_method required:false no longer blocks submission', () => {

  test('MINIMAL mode: submit reaches territory gate, no "How does your character hunt?" toast', async ({ page }) => {
    const char = buildChar();
    // No prior sub → no method, no territory
    await setupSuite(page, char, null);
    await openDowntimeForm(page, char);

    // MINIMAL is the default mode — submit button is #dt-btn-submit
    const toast = await submitAndCheckToast(page);

    // submitForm ran past the feeding_method check
    await expect(toast).not.toContainText('How does your character hunt?');
    // Territory gate (hardcoded in submitForm after the DOWNTIME_SECTIONS loop) fires
    await expect(toast).toContainText('Feeding Territory');
  });

  test('ADVANCED mode: custom pool (no method card) → no "How does your character hunt?" toast', async ({ page }) => {
    const char = buildChar();
    // Prior sub has custom pool fields but no _feed_method
    const priorSub = buildPriorSub({
      _feed_custom_attr: 'Presence',
      _feed_custom_skill: 'Empathy',
      _feed_custom_disc: '',
    });
    await setupSuite(page, char, priorSub);
    await openDowntimeForm(page, char);

    await page.locator('#dt-sandbox [data-dt-mode="advanced"]').click();
    await page.waitForSelector('#dt-sandbox #dt-btn-submit-final', { timeout: 5000 });

    const toast = await submitAndCheckToast(page);

    await expect(toast).not.toContainText('How does your character hunt?');
    await expect(toast).toContainText('Feeding Territory');
  });

  test('ADVANCED mode: method card selected (no custom pool) → no "How does your character hunt?" toast', async ({ page }) => {
    const char = buildChar();
    // Prior sub has _feed_method set (player clicked a method card)
    const priorSub = buildPriorSub({ _feed_method: 'seduction' });
    await setupSuite(page, char, priorSub);
    await openDowntimeForm(page, char);

    await page.locator('#dt-sandbox [data-dt-mode="advanced"]').click();
    await page.waitForSelector('#dt-sandbox #dt-btn-submit-final', { timeout: 5000 });

    const toast = await submitAndCheckToast(page);

    await expect(toast).not.toContainText('How does your character hunt?');
    await expect(toast).toContainText('Feeding Territory');
  });

  test('ADVANCED mode: no method, no pool, no territory → still fails on territory only', async ({ page }) => {
    const char = buildChar();
    // Completely empty form
    await setupSuite(page, char, null);
    await openDowntimeForm(page, char);

    await page.locator('#dt-sandbox [data-dt-mode="advanced"]').click();
    await page.waitForSelector('#dt-sandbox #dt-btn-submit-final', { timeout: 5000 });

    const toast = await submitAndCheckToast(page);

    // feeding_method is no longer a required gate
    await expect(toast).not.toContainText('How does your character hunt?');
    // Territory gate still fires
    await expect(toast).toContainText('Feeding Territory');
  });

});
