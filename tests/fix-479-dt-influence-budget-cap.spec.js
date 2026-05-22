/**
 * Tests for fix.479 — DT form influence spend budget cap enforcement
 *
 * Bug: influence steppers had no visual disabled state when remaining = 0.
 *      Buttons silently did nothing on click but appeared enabled, giving
 *      no feedback and historically allowing over-budget submissions.
 *
 * Fix: + disabled when val >= 0 && remaining <= 0
 *      − disabled when val <= 0 && remaining <= 0
 *      Buttons that reduce absolute value (free budget) always stay enabled.
 *
 * AC1: + button disabled on all territories when remaining = 0
 * AC2: − button disabled on zero-value territories when remaining = 0
 * AC3: values cannot be increased past budget via steppers
 * AC4: − button on a spent territory remains enabled (frees budget)
 * AC5: remaining counter is accurate throughout interactions
 * AC6: with zero spend, all buttons are enabled and remaining shows correctly
 *
 * Character budget: clan 1 + covenant Invictus 1 = 2 influence
 */

const { test, expect } = require('@playwright/test');

// ── Mock data ─────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '777000479', username: 'test_player479', global_name: 'Test Player 479',
  avatar: null, role: 'player', player_id: 'p-fix479',
  character_ids: ['char-fix479'], is_dual_role: false,
};

const GAME_CYCLE = {
  _id: 'cycle-fix479', status: 'game', label: 'Downtime Test',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-05-22T00:00:00.000Z',
};

function buildChar() {
  return {
    _id: 'char-fix479', name: 'Test Character', moniker: null, honorific: null,
    clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
    blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    // clan: 1, covenant Invictus: 1 → calcTotalInfluence = 2
    status: {
      city: 1, clan: 1,
      covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
    },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  };
}

function buildSub(influenceSpend = {}) {
  return {
    _id: 'sub-fix479',
    cycle_id: GAME_CYCLE._id,
    character_id: 'char-fix479',
    status: 'submitted',
    responses: {
      _mode: 'advanced',
      _feed_method: 'seduction',
      _feed_disc: '',
      _feed_spec: '',
      feeding_territories: JSON.stringify({}),
      influence_spend: JSON.stringify(influenceSpend),
    },
  };
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function setupRoutes(page, submission) {
  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) })
  );
  await page.route(/\/api\/characters(\?.*)?$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([buildChar()]) })
  );
  await page.route('**/api/characters/names', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: 'char-fix479', name: 'Test Character', moniker: null, honorific: null }]) })
  );
  await page.route('**/api/downtime_cycles*', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([GAME_CYCLE]) })
  );
  await page.route('**/api/downtime_submissions*', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([submission]) })
  );
  await page.route('**/api/territories*', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.addInitScript((u) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);
}

async function openInfluenceSection(page, submission) {
  const char = buildChar();
  await setupRoutes(page, submission);
  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(300);
  await page.evaluate(async ({ c, terrs }) => {
    const sandbox = document.createElement('div');
    sandbox.id = 'dt-sandbox-479';
    sandbox.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#1a1208;z-index:99999;overflow:auto;';
    document.body.appendChild(sandbox);
    const mod = await import('/js/tabs/downtime-form.js');
    await mod.renderDowntimeTab(sandbox, c, [], { skipFreshFetch: true });
  }, { c: char, terrs: [] });
  // Wait for form submit button as a render-complete signal
  await page.waitForSelector('#dt-sandbox-479 #dt-btn-submit', { timeout: 10000 });
  const sandbox = page.locator('#dt-sandbox-479');

  // Expand the territory section (advanced mode = rendered; starts collapsed)
  const terrSection = sandbox.locator('.qf-section[data-section-key="territory"]');
  await terrSection.waitFor({ state: 'attached', timeout: 5000 });
  await terrSection.locator('.qf-section-title').click();
  await page.waitForTimeout(300);

  // Wait for influence grid
  await sandbox.locator('.dt-influence-grid').waitFor({ timeout: 5000 });
  return sandbox;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.479 — influence spend budget cap enforcement', () => {

  // AC6: zero spend state — all buttons enabled, counter correct
  test('AC6: zero spend → all stepper buttons enabled, remaining shows budget', async ({ page }) => {
    const sandbox = await openInfluenceSection(page, buildSub({}));

    // Remaining counter should show 2 (budget)
    const remSpan = sandbox.locator('.dt-influence-budget .dt-influence-remaining');
    await expect(remSpan).toHaveText('2');

    // All + and − buttons should be enabled
    const plusAcademy  = sandbox.locator('[data-inf-terr="the_academy"][data-inf-dir="1"]');
    const minusAcademy = sandbox.locator('[data-inf-terr="the_academy"][data-inf-dir="-1"]');
    const plusHarbour  = sandbox.locator('[data-inf-terr="the_harbour"][data-inf-dir="1"]');
    const minusHarbour = sandbox.locator('[data-inf-terr="the_harbour"][data-inf-dir="-1"]');

    await expect(plusAcademy).toBeEnabled();
    await expect(minusAcademy).toBeEnabled();
    await expect(plusHarbour).toBeEnabled();
    await expect(minusHarbour).toBeEnabled();
  });

  // AC1 + AC2 + AC5: spend full budget via steppers — buttons disable, counter = 0
  test('AC1/AC2/AC5: after spending full budget, + and − on zero territories disabled, counter = 0', async ({ page }) => {
    const sandbox = await openInfluenceSection(page, buildSub({}));

    const plusAcademy  = sandbox.locator('[data-inf-terr="the_academy"][data-inf-dir="1"]');
    const minusAcademy = sandbox.locator('[data-inf-terr="the_academy"][data-inf-dir="-1"]');
    const plusHarbour  = sandbox.locator('[data-inf-terr="the_harbour"][data-inf-dir="1"]');
    const minusHarbour = sandbox.locator('[data-inf-terr="the_harbour"][data-inf-dir="-1"]');
    const remSpan      = sandbox.locator('.dt-influence-budget .dt-influence-remaining');

    // Spend budget: click + on Academy twice
    await plusAcademy.click();
    await plusAcademy.click();
    await expect(remSpan).toHaveText('0');

    // AC1: + buttons disabled on all territories (remaining = 0)
    await expect(plusAcademy).toBeDisabled();
    await expect(plusHarbour).toBeDisabled();

    // AC2: − disabled on zero-value territory (Harbour val = 0, remaining = 0)
    await expect(minusHarbour).toBeDisabled();

    // AC4 (partial): − on Academy is NOT disabled (val = 2 > 0, would free budget)
    await expect(minusAcademy).toBeEnabled();
  });

  // AC3: stepper value cannot exceed budget — val stays at budget ceiling
  test('AC3: value cannot increase past budget', async ({ page }) => {
    const sandbox = await openInfluenceSection(page, buildSub({}));

    const plusAcademy = sandbox.locator('[data-inf-terr="the_academy"][data-inf-dir="1"]');
    const valAcademy  = sandbox.locator('#inf-val-the_academy');

    // Spend full budget
    await plusAcademy.click();
    await plusAcademy.click();
    await expect(valAcademy).toHaveText('2');

    // Button is now disabled — clicking should not change the value
    await expect(plusAcademy).toBeDisabled();
    await expect(valAcademy).toHaveText('2');
  });

  // AC4: − button on a spent territory remains enabled and re-enables others on click
  test('AC4: − on spent territory frees budget and re-enables + buttons', async ({ page }) => {
    const sandbox = await openInfluenceSection(page, buildSub({}));

    const plusAcademy  = sandbox.locator('[data-inf-terr="the_academy"][data-inf-dir="1"]');
    const minusAcademy = sandbox.locator('[data-inf-terr="the_academy"][data-inf-dir="-1"]');
    const plusHarbour  = sandbox.locator('[data-inf-terr="the_harbour"][data-inf-dir="1"]');
    const remSpan      = sandbox.locator('.dt-influence-budget .dt-influence-remaining');

    // Spend full budget
    await plusAcademy.click();
    await plusAcademy.click();
    await expect(remSpan).toHaveText('0');
    await expect(plusHarbour).toBeDisabled();

    // AC4: − Academy is enabled despite remaining = 0
    await expect(minusAcademy).toBeEnabled();
    await minusAcademy.click();

    // Remaining recovers to 1 → + Harbour re-enabled
    await expect(remSpan).toHaveText('1');
    await expect(plusHarbour).toBeEnabled();
  });

  // AC1/AC2: pre-loaded over-budget submission — buttons reflect over-spent state
  test('AC1/AC2: pre-loaded at budget → buttons correctly disabled on render', async ({ page }) => {
    // Load with Academy already at full budget (2)
    const sandbox = await openInfluenceSection(page, buildSub({ the_academy: 2 }));

    const remSpan      = sandbox.locator('.dt-influence-budget .dt-influence-remaining');
    const plusAcademy  = sandbox.locator('[data-inf-terr="the_academy"][data-inf-dir="1"]');
    const minusAcademy = sandbox.locator('[data-inf-terr="the_academy"][data-inf-dir="-1"]');
    const plusHarbour  = sandbox.locator('[data-inf-terr="the_harbour"][data-inf-dir="1"]');
    const minusHarbour = sandbox.locator('[data-inf-terr="the_harbour"][data-inf-dir="-1"]');

    await expect(remSpan).toHaveText('0');

    // + disabled on all (remaining = 0)
    await expect(plusAcademy).toBeDisabled();
    await expect(plusHarbour).toBeDisabled();

    // − disabled on zero territories (Harbour = 0)
    await expect(minusHarbour).toBeDisabled();

    // − enabled on spent territory (Academy val = 2 > 0)
    await expect(minusAcademy).toBeEnabled();
  });

});
