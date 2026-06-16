/**
 * Tests for feat #745 — Sheet: display Mandragora Garden parked rites
 *
 * AC-1: Character with mandragora_parked:true shows .rite-mg-tag on both
 *       suite sheet and admin/editor sheet
 * AC-2: .rite-mg-tag has title="Permanently sustained by Mandragora Garden"
 * AC-3: Non-parked rites (mandragora_parked absent/false) show no .rite-mg-tag
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ST_USER_745 = {
  id: '777000745', username: 'test_st745', global_name: 'Test ST 745',
  avatar: null, role: 'st', player_id: 'p-745',
  character_ids: ['char-745-001'], is_dual_role: false,
};

function buildChar(overrides = {}) {
  return {
    _id: 'char-745-001',
    name: 'MG Rite Tester',
    moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Test Player 745',
    blood_potency: 2, humanity: 7, humanity_base: 7,
    court_title: null, retired: false,
    status: { city: 1, clan: 0, covenant: { 'Circle of the Crone': 1 } },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: { Occult: { dots: 3, bonus: 0, specs: [], nine_again: false } },
    disciplines: { Cruac: { dots: 2, bonus: 0 } },
    merits: [{ name: 'Mandragora Garden', rating: 1, dots: 1, bonus: 0, category: 'general' }],
    powers: [],
    ordeals: [],
    xp_log: { spent: 0 },
    ...overrides,
  };
}

// ── Suite sheet helpers ───────────────────────────────────────────────────────

async function setupSuite(page, char) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, ST_USER_745);

  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER_745) })
  );
  await page.route(/\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
  );
  await page.route('**/api/characters/names', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: char._id, name: char.name, moniker: null, honorific: null }]) })
  );
  await page.route(new RegExp(`/api/characters/${char._id}$`), r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) })
  );
  await page.route('**/api/rules', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function renderSheetDesktop(page, char) {
  await page.evaluate(async (c) => {
    document.body.classList.add('desktop-mode');
    const stateModule = await import('/js/suite/data.js');
    const state = stateModule.default;
    state.chars = [c];
    const { onSheetChar } = await import('/js/suite/sheet.js');
    onSheetChar(c.name);
  }, char);
  await page.waitForTimeout(200);
}

function suiteSheetHtml(page) {
  return page.evaluate(() =>
    document.querySelector('#sh-content-suite')?.innerHTML || ''
  );
}

// ── Admin sheet helper (calls shRenderDisciplines directly) ───────────────────

async function setupAdmin(page, char) {
  await page.addInitScript(({ user, token }) => {
    localStorage.setItem('tm_auth_token', token);
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER_745, token: 'local-test-token' });

  await page.route('http://localhost:3000/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('http://localhost:3000/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER_745) })
  );
  await page.route(/localhost:3000\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
  );
  await page.route('http://localhost:3000/api/characters/names', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: char._id, name: char.name, moniker: null, honorific: null }]) })
  );
  await page.route('http://localhost:3000/api/rules', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
}

async function adminSheetDiscHtml(page, char) {
  return page.evaluate(async (c) => {
    const { shRenderDisciplines } = await import('/js/editor/sheet.js');
    return shRenderDisciplines(c, false);
  }, char);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('feat.745: Mandragora parked rite indicator on character sheet', () => {

  // ── Suite sheet ──────────────────────────────────────────────────────────────

  test('AC-1 (suite): parked rite shows .rite-mg-tag in Rites section', async ({ page }) => {
    const char = buildChar({
      powers: [
        { name: 'Rite of the Fallow Field', category: 'rite', level: 1, tradition: 'Cruac', free: true, mandragora_parked: true },
      ],
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await suiteSheetHtml(page);
    expect(html).toContain('rite-mg-tag');
  });

  test('AC-2 (suite): .rite-mg-tag has correct title attribute', async ({ page }) => {
    const char = buildChar({
      powers: [
        { name: 'Rite of the Fallow Field', category: 'rite', level: 1, tradition: 'Cruac', free: true, mandragora_parked: true },
      ],
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await suiteSheetHtml(page);
    expect(html).toContain('title="Permanently sustained by Mandragora Garden"');
  });

  test('AC-3 (suite): non-parked rite shows no .rite-mg-tag', async ({ page }) => {
    const char = buildChar({
      powers: [
        { name: 'Rite of the Fallow Field', category: 'rite', level: 1, tradition: 'Cruac', free: true },
      ],
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await suiteSheetHtml(page);
    expect(html).not.toContain('rite-mg-tag');
  });

  test('AC-3b (suite): rite with mandragora_parked:false shows no .rite-mg-tag', async ({ page }) => {
    const char = buildChar({
      powers: [
        { name: 'Rite of the Fallow Field', category: 'rite', level: 1, tradition: 'Cruac', free: true, mandragora_parked: false },
      ],
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await suiteSheetHtml(page);
    expect(html).not.toContain('rite-mg-tag');
  });

  // ── Admin/editor sheet ───────────────────────────────────────────────────────

  test('AC-1 (admin view-mode): parked rite shows .rite-mg-tag in rendered HTML', async ({ page }) => {
    const char = buildChar({
      powers: [
        { name: 'Rite of the Fallow Field', category: 'rite', level: 1, tradition: 'Cruac', free: true, mandragora_parked: true },
      ],
    });
    await setupAdmin(page, char);

    const html = await adminSheetDiscHtml(page, char);
    expect(html).toContain('rite-mg-tag');
  });

  test('AC-2 (admin view-mode): .rite-mg-tag has correct title attribute', async ({ page }) => {
    const char = buildChar({
      powers: [
        { name: 'Rite of the Fallow Field', category: 'rite', level: 1, tradition: 'Cruac', free: true, mandragora_parked: true },
      ],
    });
    await setupAdmin(page, char);

    const html = await adminSheetDiscHtml(page, char);
    expect(html).toContain('title="Permanently sustained by Mandragora Garden"');
  });

  test('AC-3 (admin view-mode): non-parked rite shows no .rite-mg-tag', async ({ page }) => {
    const char = buildChar({
      powers: [
        { name: 'Rite of the Fallow Field', category: 'rite', level: 1, tradition: 'Cruac', free: true },
      ],
    });
    await setupAdmin(page, char);

    const html = await adminSheetDiscHtml(page, char);
    expect(html).not.toContain('rite-mg-tag');
  });

  test('AC-1 (admin edit-mode): parked rite shows .rite-mg-tag in edit mode', async ({ page }) => {
    const char = buildChar({
      powers: [
        { name: 'Rite of the Fallow Field', category: 'rite', level: 1, tradition: 'Cruac', free: true, mandragora_parked: true },
      ],
    });
    await setupAdmin(page, char);

    const html = await page.evaluate(async (c) => {
      const { shRenderDisciplines } = await import('/js/editor/sheet.js');
      return shRenderDisciplines(c, true);
    }, char);
    expect(html).toContain('rite-mg-tag');
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  test('isolation (suite): mixed parked/non-parked — chip appears exactly once', async ({ page }) => {
    const char = buildChar({
      merits: [{ name: 'Mandragora Garden', rating: 1, dots: 1, bonus: 0, category: 'general' }],
      powers: [
        { name: 'Rite of the Fallow Field', category: 'rite', level: 1, tradition: 'Cruac', free: true, mandragora_parked: true },
        { name: 'Rite of the Verdant Spring', category: 'rite', level: 1, tradition: 'Cruac', free: true },
      ],
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await suiteSheetHtml(page);
    const count = (html.match(/rite-mg-tag/g) || []).length;
    expect(count).toBe(1);
  });

  test('isolation (admin): mixed parked/non-parked — chip appears exactly once', async ({ page }) => {
    const char = buildChar({
      merits: [{ name: 'Mandragora Garden', rating: 1, dots: 1, bonus: 0, category: 'general' }],
      powers: [
        { name: 'Rite of the Fallow Field', category: 'rite', level: 1, tradition: 'Cruac', free: true, mandragora_parked: true },
        { name: 'Rite of the Verdant Spring', category: 'rite', level: 1, tradition: 'Cruac', free: true },
      ],
    });
    await setupAdmin(page, char);

    const html = await adminSheetDiscHtml(page, char);
    const count = (html.match(/rite-mg-tag/g) || []).length;
    expect(count).toBe(1);
  });

  test('no-tradition guard (suite): parked rite with no tradition still shows chip', async ({ page }) => {
    const char = buildChar({
      powers: [
        { name: 'Rite of the Fallow Field', category: 'rite', level: 1, tradition: '', free: true, mandragora_parked: true },
      ],
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await suiteSheetHtml(page);
    expect(html).toContain('rite-mg-tag');
  });

});
