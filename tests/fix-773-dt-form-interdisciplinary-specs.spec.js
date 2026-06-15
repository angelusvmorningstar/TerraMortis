/**
 * fix.773 — DT form: interdisciplinary specialisations missing from project
 * dice pool spec chips.
 *
 * Root cause: `renderDicePool()` built `bestSpecs` from the selected skill's
 * native `specs[]` only. `isSpecs()` (which resolves Interdisciplinary
 * Specialty merits) was never called at this site. Fixed by merging
 * `isSpecs(currentChar)` into `bestSpecs` at `downtime-form.js:3955`.
 *
 * AC-1: Coward Punch chip appears when Weaponry is selected (IS merit, not
 *        in Weaponry.specs)
 * AC-2: Native Weaponry specs (Light Weapons, Weapon & Shield) appear
 *        alongside Coward Punch — no dedup bug
 * AC-3: Clicking Coward Punch chip marks it active and adds +1 to pool total
 * AC-4: Coward Punch chip appears when skill changes to Occult (unrelated) —
 *        interdisciplinary means it's always shown, not tied to any one skill
 * AC-5: Character without Interdisciplinary Specialty → only native specs; no
 *        Coward Punch chip (regression guard)
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '987000773', username: 'test_player_773', global_name: 'Test Player 773',
  avatar: null, role: 'player', player_id: 'p-773',
  character_ids: ['char-773'], is_dual_role: false,
};

const CYCLE_773 = {
  _id: 'cycle-773', cycle_number: 4, status: 'active', label: 'Test Cycle 773',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-06-16T00:00:00.000Z',
};

function buildChar(withIS = true) {
  return {
    _id: 'char-773', name: 'Charlie Ambience', moniker: null, honorific: null,
    clan: 'Gangrel', covenant: 'Unaligned', player: 'Test Player 773',
    blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
    status: {
      city: 1, clan: 0,
      covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
    },
    attributes: {
      Strength:     { dots: 3, bonus: 0 }, Dexterity:    { dots: 2, bonus: 0 }, Stamina:      { dots: 2, bonus: 0 },
      Intelligence: { dots: 2, bonus: 0 }, Wits:         { dots: 2, bonus: 0 }, Resolve:      { dots: 2, bonus: 0 },
      Presence:     { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure:    { dots: 2, bonus: 0 },
    },
    skills: {
      // Weaponry: has native specs — used to verify they still appear alongside IS spec
      Weaponry: { dots: 3, bonus: 0, specs: ['Light Weapons', 'Weapon & Shield'], nine_again: false },
      // Brawl: where Coward Punch lives as a native spec — isSpecs() finds it here
      Brawl:    { dots: 2, bonus: 0, specs: ['Coward Punch'], nine_again: false },
      // Occult: no specs — used to test IS spec appears with an unrelated skill
      Occult:   { dots: 2, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: { Protean: { dots: 2 } },
    merits: withIS
      ? [{ name: 'Interdisciplinary Specialty', qualifier: 'Coward Punch', category: 'general', dots: 1, rating: 1 }]
      : [],
    powers: [], ordeals: [],
  };
}

// Pre-seeded submission: project slot 1 already has ambience_change + Weaponry pool
function buildSub(skill = 'Weaponry') {
  return {
    _id: 'sub-773', cycle_id: 'cycle-773', character_id: 'char-773',
    status: 'draft',
    responses: {
      project_1_action:    'ambience_change',
      project_1_pool_attr: 'Strength',
      project_1_pool_skill: skill,
      project_1_pool_spec:  '',
    },
  };
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function setupSuite(page, char, sub) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);

  // Broad catch-all first
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/auth/me',        r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) }));
  await page.route(/\/api\/characters\/char-773$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) }));
  await page.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) }));
  await page.route('**/api/characters/names', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ _id: char._id, name: char.name, moniker: null }]) }));
  await page.route('**/api/downtime_cycles', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CYCLE_773]) }));
  await page.route(/\/api\/downtime_submissions($|\?)/, r => {
    if (r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sub ? [sub] : []) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ _id: 'sub-773', status: 'draft', responses: {} }) });
  });
  await page.route(/\/api\/downtime_submissions\/sub-773/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ _id: 'sub-773', status: 'draft' }) }));

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function openProjectPool(page, char) {
  await page.evaluate(async (c) => {
    const sandbox = document.createElement('div');
    sandbox.id = 'dt-sandbox';
    sandbox.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#1a1208;z-index:99999;overflow:auto;';
    document.body.appendChild(sandbox);
    const mod = await import('/js/tabs/downtime-form.js');
    await mod.renderDowntimeTab(sandbox, c, []);
  }, char);
  // Expand the Projects section
  await page.locator('#dt-sandbox .qf-section[data-section-key="projects"] .qf-section-title').click();
  // Wait for the pool skill select to be visible (pre-seeded action brings it into view)
  await page.waitForSelector('#dt-sandbox #dt-project_1_pool_skill', { state: 'visible', timeout: 10000 });
}

const specChip = (page, name) =>
  page.locator(`#dt-sandbox [data-pool-spec="project_1_pool"][data-spec-name="${name}"]`);

const poolTotal = (page) => page.locator('#dt-sandbox #project_1_pool_total');

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.773 — IS spec chips in project dice pool', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────

  test('AC-1: Coward Punch chip appears when Weaponry is in the pool', async ({ page }) => {
    const char = buildChar(true);
    const sub  = buildSub('Weaponry');
    await setupSuite(page, char, sub);
    await openProjectPool(page, char);

    await expect(specChip(page, 'Coward Punch')).toBeVisible();
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────

  test('AC-2: native Weaponry specs also appear alongside Coward Punch', async ({ page }) => {
    const char = buildChar(true);
    const sub  = buildSub('Weaponry');
    await setupSuite(page, char, sub);
    await openProjectPool(page, char);

    await expect(specChip(page, 'Light Weapons')).toBeVisible();
    await expect(specChip(page, 'Weapon & Shield')).toBeVisible();
    await expect(specChip(page, 'Coward Punch')).toBeVisible();
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────

  test('AC-3: clicking Coward Punch chip marks it active and adds +1 to total', async ({ page }) => {
    const char = buildChar(true);
    const sub  = buildSub('Weaponry');
    await setupSuite(page, char, sub);
    await openProjectPool(page, char);

    // Read the baseline total (Strength 3 + Weaponry 3 = 6; no spec yet)
    const baseTotalText = await poolTotal(page).textContent();
    const baseTotal = parseInt(baseTotalText, 10);

    await specChip(page, 'Coward Punch').click();

    // After re-render, chip should be active
    await expect(specChip(page, 'Coward Punch')).toHaveClass(/dt-feed-spec-on/);

    // Total should have increased by 1
    const newTotalText = await poolTotal(page).textContent();
    const newTotal = parseInt(newTotalText, 10);
    expect(newTotal).toBe(baseTotal + 1);
  });

  // AC-3b ─────────────────────────────────────────────────────────────────────

  test('AC-3b: clicking active Coward Punch chip again deselects it and removes bonus', async ({ page }) => {
    const char = buildChar(true);
    const sub  = buildSub('Weaponry');
    await setupSuite(page, char, sub);
    await openProjectPool(page, char);

    const baseTotalText = await poolTotal(page).textContent();
    const baseTotal = parseInt(baseTotalText, 10);

    // First click — select
    await specChip(page, 'Coward Punch').click();
    await expect(specChip(page, 'Coward Punch')).toHaveClass(/dt-feed-spec-on/);

    // Second click — deselect
    await specChip(page, 'Coward Punch').click();
    await expect(specChip(page, 'Coward Punch')).not.toHaveClass(/dt-feed-spec-on/);

    // Total should be back to baseline
    const restoredTotalText = await poolTotal(page).textContent();
    const restoredTotal = parseInt(restoredTotalText, 10);
    expect(restoredTotal).toBe(baseTotal);
  });

  // AC-4 ──────────────────────────────────────────────────────────────────────

  test('AC-4: Coward Punch chip appears after changing pool skill to unrelated Occult', async ({ page }) => {
    const char = buildChar(true);
    const sub  = buildSub('Weaponry');
    await setupSuite(page, char, sub);
    await openProjectPool(page, char);

    // Change skill to Occult (no native specs — Coward Punch must come via IS)
    await page.locator('#dt-sandbox #dt-project_1_pool_skill').selectOption('Occult');
    // Re-render fires; wait for Coward Punch chip
    await expect(specChip(page, 'Coward Punch')).toBeVisible();
    // Weaponry-only specs should be gone
    await expect(specChip(page, 'Light Weapons')).not.toBeVisible();
  });

  // AC-5 ──────────────────────────────────────────────────────────────────────

  test('AC-5: character without IS merit sees only native skill specs, no Coward Punch', async ({ page }) => {
    const char = buildChar(false); // no IS merit
    const sub  = buildSub('Weaponry');
    await setupSuite(page, char, sub);
    await openProjectPool(page, char);

    await expect(specChip(page, 'Light Weapons')).toBeVisible();
    await expect(specChip(page, 'Weapon & Shield')).toBeVisible();
    await expect(specChip(page, 'Coward Punch')).not.toBeVisible();
  });

});
