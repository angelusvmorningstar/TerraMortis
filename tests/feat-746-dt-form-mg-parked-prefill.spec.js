/**
 * Tests for feat #746 — DT form: lock pre-filled Mandragora Garden rite slots + show prior outcome
 *
 * AC-1: Character with parked rites + no submission sees read-only rite display (no select dropdown)
 * AC-2: Pre-filled parked slot has mandragora checkbox checked and disabled
 * AC-3: Pre-filled parked slot has no Remove button
 * AC-4: Prior cycle ritual_result_note shown inline; falls back to "No prior resolution recorded."
 * AC-5: Seeding capped at MG rating when character has more parked rites than MG dots
 * AC-6: Characters without mandragora_parked rites are unaffected
 * AC-7: Existing server submission is not overwritten by seeding
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '987000746', username: 'test_player_746', global_name: 'Test Player 746',
  avatar: null, role: 'player', player_id: 'p-746',
  character_ids: ['char-746'], is_dual_role: false,
};

const CYCLE_CURRENT = {
  _id: 'cycle-746-cur', cycle_number: 5, status: 'active',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-06-15T00:00:00.000Z',
};

const CYCLE_PRIOR = {
  _id: 'cycle-746-pri', cycle_number: 4, status: 'closed',
  confirmed_ambience: {}, narrative_notes: '',
};

const TERRITORY = {
  _id: 'bbb000000000000000000746', slug: 'academy', name: 'The Academy',
  regent_id: null, lieutenant_id: null, feeding_rights: [], ambience: 2,
};

function buildChar(overrides = {}) {
  return {
    _id: 'char-746', name: 'Crone Tester', moniker: null, honorific: null,
    clan: 'Gangrel', covenant: 'Circle of the Crone', player: 'Test Player 746',
    blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    home_territory: 'academy',
    status: { city: 1, clan: 0, covenant: { 'Circle of the Crone': 1 } },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: { Occult: { dots: 3, bonus: 0, specs: [], nine_again: false } },
    disciplines: { Cruac: { dots: 2, bonus: 0 } },
    merits: [{ name: 'Mandragora Garden', rating: 1, dots: 1, cp: 1, bonus: 0, category: 'domain' }],
    powers: [
      { name: 'Rite of Warding', category: 'rite', tradition: 'Cruac', level: 1, mandragora_parked: true },
    ],
    ordeals: [],
    ...overrides,
  };
}

// A locked-slot submission (simulates what seeding produces after mode switch)
function lockedSub(responses = {}) {
  return {
    _id: 'sub-746',
    cycle_id: 'cycle-746-cur',
    character_id: 'char-746',
    status: 'draft',
    responses: {
      _mode: 'advanced',
      sorcery_slot_count: '1',
      sorcery_1_rite: 'Rite of Warding',
      sorcery_1_mandragora: 'yes',
      sorcery_1_mg_locked: 'yes',
      ...responses,
    },
  };
}

async function setupSuite(page, char, sub, cycles = [CYCLE_CURRENT]) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);

  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) }));
  await page.route(/\/api\/characters\/char-746$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) }));
  await page.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) }));
  await page.route('**/api/characters/names', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ _id: 'char-746', name: 'Crone Tester', moniker: null }]) }));
  await page.route('**/api/downtime_cycles', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cycles) }));
  await page.route(/\/api\/downtime_submissions($|\?)/, r => {
    if (r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sub ? [sub] : []) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ _id: 'sub-746', status: 'draft', responses: {} }) });
  });
  await page.route(/\/api\/territories($|\?)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TERRITORY]) }));
  await page.route(/\/api\/st_mods($|\?)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function openForm(page, char) {
  await page.evaluate(async (c) => {
    const sandbox = document.createElement('div');
    sandbox.id = 'dt-sandbox-746';
    sandbox.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#1a1208;z-index:99999;overflow:auto;';
    document.body.appendChild(sandbox);
    const mod = await import('/js/tabs/downtime-form.js');
    await mod.renderDowntimeTab(sandbox, c, []);
  }, char);
  // Wait for basic form to render
  await page.waitForSelector('#dt-sandbox-746 [data-section-key="projects"]', { timeout: 10000 });
}

async function openSorcerySection(page) {
  const title = page.locator('#dt-sandbox-746 [data-section-key="blood_sorcery"] .qf-section-title');
  await title.waitFor({ state: 'attached', timeout: 10000 });
  const section = page.locator('#dt-sandbox-746 [data-section-key="blood_sorcery"]');
  const collapsed = await section.evaluate(el => el.classList.contains('collapsed'));
  if (collapsed) await title.click();
  await page.waitForSelector('#dt-sandbox-746 [data-section-key="blood_sorcery"]:not(.collapsed)', { timeout: 5000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('feat.746 — DT form: Mandragora Garden locked rite slots', () => {

  test('AC-1: locked slot shows rite name as text, not a select', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, lockedSub());
    await openForm(page, char);
    await openSorcerySection(page);

    const slot1 = page.locator('#dt-sorcery-slot-1');
    await slot1.waitFor({ state: 'visible', timeout: 5000 });

    // No select in the locked slot — hidden input present instead
    await expect(page.locator('#dt-sandbox-746 #dt-sorcery_1_rite[type="hidden"]')).toHaveCount(1);
    await expect(page.locator('#dt-sandbox-746 select#dt-sorcery_1_rite')).toHaveCount(0);

    // The locked display shows the rite name
    const lockedP = page.locator('#dt-sandbox-746 .qf-mg-locked-rite').first();
    await expect(lockedP).toContainText('Rite of Warding');
  });

  test('AC-1: locked slot shows MG chip', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, lockedSub());
    await openForm(page, char);
    await openSorcerySection(page);

    const mgChip = page.locator('#dt-sandbox-746 #dt-sorcery-slot-1 .rite-mg-tag');
    await expect(mgChip).toBeVisible();
    await expect(mgChip).toContainText('MG');
  });

  test('AC-2: mandragora checkbox is checked and disabled for locked slot', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, lockedSub());
    await openForm(page, char);
    await openSorcerySection(page);

    const cb = page.locator('#dt-sorcery_1_mandragora');
    await cb.waitFor({ state: 'attached', timeout: 5000 });
    await expect(cb).toBeChecked();
    await expect(cb).toBeDisabled();
  });

  test('AC-3: Remove button absent for locked slot 1 (n=1)', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, lockedSub());
    await openForm(page, char);
    await openSorcerySection(page);

    // Slot 1 never has Remove button (n > 1 guard); also should not appear for locked slots
    await expect(page.locator('#dt-sorcery-slot-1 .dt-sorcery-remove')).toHaveCount(0);
  });

  test('AC-3: Remove button absent for locked slot 2 (n=2 but locked)', async ({ page }) => {
    const char = buildChar({
      merits: [{ name: 'Mandragora Garden', rating: 2, dots: 2, cp: 2, bonus: 0, category: 'domain' }],
      powers: [
        { name: 'Rite of Warding', category: 'rite', tradition: 'Cruac', level: 1, mandragora_parked: true },
        { name: 'Rite of the Fallow Field', category: 'rite', tradition: 'Cruac', level: 2, mandragora_parked: true },
      ],
    });
    const sub = lockedSub({
      sorcery_slot_count: '2',
      sorcery_2_rite: 'Rite of the Fallow Field',
      sorcery_2_mandragora: 'yes',
      sorcery_2_mg_locked: 'yes',
    });
    await setupSuite(page, char, sub);
    await openForm(page, char);
    await openSorcerySection(page);

    // Slot 2 is locked — should NOT have a Remove button
    await expect(page.locator('#dt-sorcery-slot-2 .dt-sorcery-remove')).toHaveCount(0);
  });

  test('AC-4: prior outcome placeholder shows "Loading..." then populates', async ({ page }) => {
    const char = buildChar();
    const priorSub = {
      _id: 'sub-746-prior',
      cycle_id: 'cycle-746-pri',
      character_id: 'char-746',
      status: 'processed',
      responses: { sorcery_slot_count: '1', sorcery_1_rite: 'Rite of Warding' },
      sorcery_review: { 1: { ritual_result_note: 'The ward held through the night.' } },
    };

    await setupSuite(page, char, lockedSub(), [CYCLE_CURRENT, CYCLE_PRIOR]);
    // Override the submissions route to serve prior sub when queried by cycle
    await page.route(/\/api\/downtime_submissions\?cycle_id=cycle-746-pri/, r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([priorSub]) }),
    );

    await openForm(page, char);
    await openSorcerySection(page);

    const priorEl = page.locator('#dt-mg-prior-1');
    await priorEl.waitFor({ state: 'visible', timeout: 5000 });

    // Eventually populates with the note (wait for Loading to disappear)
    await expect(priorEl).not.toHaveClass(/dt-mg-prior-loading/, { timeout: 10000 });
    await expect(priorEl).toContainText('The ward held through the night.');
  });

  test('AC-4: prior outcome falls back to "No prior resolution recorded." when absent', async ({ page }) => {
    const char = buildChar();
    // No prior cycle in the list
    await setupSuite(page, char, lockedSub(), [CYCLE_CURRENT]);
    await openForm(page, char);
    await openSorcerySection(page);

    const priorEl = page.locator('#dt-mg-prior-1');
    await priorEl.waitFor({ state: 'visible', timeout: 5000 });
    await expect(priorEl).not.toHaveClass(/dt-mg-prior-loading/, { timeout: 10000 });
    await expect(priorEl).toContainText('No prior resolution recorded.');
  });

  test('AC-5: seeding capped at MG rating when character has more parked rites', async ({ page }) => {
    // MG rating 1, but 2 parked rites in DB — only 1 should be seeded + shown.
    const char = buildChar({
      merits: [{ name: 'Mandragora Garden', rating: 1, dots: 1, cp: 1, bonus: 0, category: 'domain' }],
      powers: [
        { name: 'Rite of Warding', category: 'rite', tradition: 'Cruac', level: 1, mandragora_parked: true },
        { name: 'Rite of the Fallow Field', category: 'rite', tradition: 'Cruac', level: 2, mandragora_parked: true },
      ],
    });
    // No server submission — seeding fires; then switch to advanced mode to see sorcery section.
    await setupSuite(page, char, null, [CYCLE_CURRENT]);
    await openForm(page, char);

    // Switch to Advanced mode so sorcery section renders
    const advBtn = page.locator('#dt-sandbox-746 [data-dt-mode="advanced"]');
    await advBtn.waitFor({ state: 'visible', timeout: 5000 });
    await advBtn.click();
    await page.waitForSelector('#dt-sandbox-746 [data-section-key="blood_sorcery"]', { timeout: 5000 });

    await openSorcerySection(page);

    // Should have exactly 1 sorcery slot (cap respected) — Rite of Warding only
    const slots = page.locator('#dt-sandbox-746 .dt-sorcery-slot');
    await expect(slots).toHaveCount(1);
    await expect(page.locator('#dt-sorcery-slot-1 .qf-mg-locked-rite')).toContainText('Rite of Warding');
  });

  test('AC-6: character without parked rites sees normal editable sorcery slot', async ({ page }) => {
    const char = buildChar({
      merits: [],
      powers: [{ name: 'Rite of Warding', category: 'rite', tradition: 'Cruac', level: 1 }],
    });
    // Submission without locked flag — normal state
    const sub = {
      _id: 'sub-746-normal',
      cycle_id: 'cycle-746-cur',
      character_id: 'char-746',
      status: 'draft',
      responses: { _mode: 'advanced', sorcery_slot_count: '1', sorcery_1_rite: 'Rite of Warding' },
    };
    await setupSuite(page, char, sub);
    await openForm(page, char);
    await openSorcerySection(page);

    // Select is present (not locked)
    await expect(page.locator('#dt-sandbox-746 select#dt-sorcery_1_rite')).toBeVisible();
    // No locked display
    await expect(page.locator('#dt-sandbox-746 .qf-mg-locked-rite')).toHaveCount(0);
  });

  test('AC-7: existing server submission is not overwritten by seeding', async ({ page }) => {
    const char = buildChar();
    // Existing draft with different rite chosen
    const existingSub = {
      _id: 'sub-746-existing',
      cycle_id: 'cycle-746-cur',
      character_id: 'char-746',
      status: 'draft',
      responses: { _mode: 'advanced', sorcery_slot_count: '1', sorcery_1_rite: 'Some Other Rite' },
    };
    await setupSuite(page, char, existingSub);
    await openForm(page, char);
    await openSorcerySection(page);

    // The existing submission is used — normal editable select shows the other rite
    const select = page.locator('#dt-sandbox-746 select#dt-sorcery_1_rite');
    await expect(select).toBeVisible();
    // Not locked
    await expect(page.locator('#dt-sandbox-746 .qf-mg-locked-rite')).toHaveCount(0);
  });

});
