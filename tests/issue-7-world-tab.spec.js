/**
 * Issue #7 — World tab: Court → Regencies → Who's Who order, BP/Humanity icons,
 * unified row layout, vacant territory handling.
 *
 * Uses the Game App (index.html). Mocks /api/characters/public and
 * /api/territories so tests run without a real API.
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-002',
  character_ids: ['char-001'], is_dual_role: false,
};

// Characters cover all icon-logic branches:
//   bp1_hum6  — BP 1 (plain icon), Humanity 6 (plain icon)
//   bp2_hum3  — BP 2 (✕ overlay), Humanity 3 (v overlay)
//   bp1_hum8  — BP 1 (plain), Humanity 8 (^ overlay)
//   court_char — court_category set → appears in Court section
const PUBLIC_CHARS = [
  {
    _id: 'c-001', name: 'Alice Vunder', moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Katherine H',
    blood_potency: 1, humanity: 6, court_category: null, regent_territory: null,
  },
  {
    _id: 'c-002', name: 'Brandy LaRoux', moniker: null, honorific: null,
    clan: 'Gangrel', covenant: 'Circle of the Crone', player: 'Ashley K',
    blood_potency: 2, humanity: 3, court_category: null, regent_territory: null,
  },
  {
    _id: 'c-003', name: 'Eve Lockridge', moniker: null, honorific: null,
    clan: 'Daeva', covenant: 'Carthian Movement', player: 'Jamie',
    blood_potency: 1, humanity: 8, court_category: null, regent_territory: null,
  },
  {
    _id: 'c-004', name: 'Lord Harkon', moniker: null, honorific: 'Lord',
    clan: 'Ventrue', covenant: 'Invictus', player: 'Marcus P',
    blood_potency: 3, humanity: 5, court_category: 'Head of State', regent_territory: null,
  },
];

// Territory data: one with a regent (c-001), one vacant.
const TERRITORIES = [
  { _id: 't-001', name: 'The North Shore', regent_id: 'c-001' },
  { _id: 't-002', name: 'The Docklands', regent_id: null },
];

// Characters list (minimal) returned by /api/characters for sheet loading
const CHARS_LIST = PUBLIC_CHARS.map(c => ({
  ...c,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
}));

// ── Auth / route helper ───────────────────────────────────────────────────────

async function loginAndOpenWorld(page) {
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) })
  );
  await page.route('**/api/characters/public', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PUBLIC_CHARS) })
  );
  await page.route('**/api/characters/game-xp', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/characters/combat', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/characters', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHARS_LIST) })
  );
  await page.route('**/api/territories*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TERRITORIES) })
  );
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/downtime_cycles*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/downtime_submissions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/players*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/rules/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/rules', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/tracker_state/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  );
  await page.route('**/api/tracker_state', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  );

  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: PLAYER_USER });

  await page.goto('/index.html');
  await page.waitForSelector('#app:not([style*="display: none"])', { timeout: 35000 });

  // Navigate to the World tab (bottom nav may be hidden in desktop viewport)
  await page.evaluate(() => goTab('whos-who'));
  await page.waitForSelector('#t-whos-who.active', { timeout: 8000 });

  // Expand all sections so content is visible
  const sections = page.locator('#t-whos-who details.city-section');
  const count = await sections.count();
  for (let i = 0; i < count; i++) {
    await sections.nth(i).evaluate(el => el.setAttribute('open', ''));
  }
  await page.waitForTimeout(300);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Issue #7: World tab layout and icons', () => {

  test('sections render in order: Court → Regencies → Who\'s Who', async ({ page }) => {
    await loginAndOpenWorld(page);

    const summaries = page.locator('#t-whos-who details.city-section summary');
    await expect(summaries).toHaveCount(3);

    const texts = await summaries.allTextContents();
    expect(texts[0]).toMatch(/^Court/);
    expect(texts[1]).toMatch(/^Regencies/);
    expect(texts[2]).toMatch(/^Who's Who/);
  });

  test('Court section shows court holder with charRow layout', async ({ page }) => {
    await loginAndOpenWorld(page);

    const courtSection = page.locator('#t-whos-who details.city-section').nth(0);
    await expect(courtSection.locator('.city-char-row')).toHaveCount(1);
    await expect(courtSection.locator('.city-char-name')).toContainText('Harkon');
    await expect(courtSection.locator('.city-char-badge')).toContainText('Head of State');
  });

  test('Court section shows clan icon and BP/Humanity icons per row', async ({ page }) => {
    await loginAndOpenWorld(page);

    const courtRow = page.locator('#t-whos-who details.city-section').nth(0).locator('.city-char-row').first();
    await expect(courtRow.locator('.city-char-right')).toBeVisible();
    await expect(courtRow.locator('.city-stat-icon')).toHaveCount(2);
  });

  test('BP ≥ 2 row shows ✕ glyph on BP icon', async ({ page }) => {
    await loginAndOpenWorld(page);

    // Brandy has BP 2 — find her row in Who's Who
    const worldSection = page.locator('#t-whos-who details.city-section').nth(2);
    const brandyRow = worldSection.locator('.city-char-row', { hasText: 'Brandy LaRoux' });
    const bpGlyph = brandyRow.locator('.city-stat-icon').first().locator('.city-stat-glyph');
    await expect(bpGlyph).toBeVisible();
    await expect(bpGlyph).toContainText('✕');
  });

  test('BP < 2 row has no ✕ glyph on BP icon', async ({ page }) => {
    await loginAndOpenWorld(page);

    const worldSection = page.locator('#t-whos-who details.city-section').nth(2);
    const aliceRow = worldSection.locator('.city-char-row', { hasText: 'Alice Vunder' });
    const bpIcon = aliceRow.locator('.city-stat-icon').first();
    await expect(bpIcon.locator('.city-stat-glyph')).toHaveCount(0);
  });

  test('Humanity < 4 row shows v glyph on Humanity icon', async ({ page }) => {
    await loginAndOpenWorld(page);

    const worldSection = page.locator('#t-whos-who details.city-section').nth(2);
    const brandyRow = worldSection.locator('.city-char-row', { hasText: 'Brandy LaRoux' });
    const humGlyph = brandyRow.locator('.city-stat-icon').nth(1).locator('.city-stat-glyph');
    await expect(humGlyph).toBeVisible();
    await expect(humGlyph).toContainText('v');
  });

  test('Humanity ≥ 8 row shows ^ glyph on Humanity icon', async ({ page }) => {
    await loginAndOpenWorld(page);

    const worldSection = page.locator('#t-whos-who details.city-section').nth(2);
    const eveRow = worldSection.locator('.city-char-row', { hasText: 'Eve Lockridge' });
    const humGlyph = eveRow.locator('.city-stat-icon').nth(1).locator('.city-stat-glyph');
    await expect(humGlyph).toBeVisible();
    await expect(humGlyph).toContainText('^');
  });

  test('Humanity 4–7 row has no glyph on Humanity icon', async ({ page }) => {
    await loginAndOpenWorld(page);

    const worldSection = page.locator('#t-whos-who details.city-section').nth(2);
    const aliceRow = worldSection.locator('.city-char-row', { hasText: 'Alice Vunder' });
    const humIcon = aliceRow.locator('.city-stat-icon').nth(1);
    await expect(humIcon.locator('.city-stat-glyph')).toHaveCount(0);
  });

  test('Regencies section shows regent character row with territory badge', async ({ page }) => {
    await loginAndOpenWorld(page);

    const regenciesSection = page.locator('#t-whos-who details.city-section').nth(1);
    // Alice (c-001) is regent of The North Shore
    const regentRow = regenciesSection.locator('.city-char-row', { hasText: 'Alice Vunder' });
    await expect(regentRow).toBeVisible();
    await expect(regentRow.locator('.city-char-badge')).toContainText('The North Shore');
  });

  test('Regencies section shows (vacant) for territories with no regent', async ({ page }) => {
    await loginAndOpenWorld(page);

    const regenciesSection = page.locator('#t-whos-who details.city-section').nth(1);
    const vacantRow = regenciesSection.locator('.city-char-row', { hasText: '(vacant)' });
    await expect(vacantRow).toBeVisible();
    await expect(vacantRow.locator('.city-char-badge')).toContainText('The Docklands');
  });

  test('vacant row has no stat icons', async ({ page }) => {
    await loginAndOpenWorld(page);

    const regenciesSection = page.locator('#t-whos-who details.city-section').nth(1);
    const vacantRow = regenciesSection.locator('.city-char-row', { hasText: '(vacant)' });
    await expect(vacantRow.locator('.city-stat-icon')).toHaveCount(0);
  });

  test('Who\'s Who section groups characters by covenant', async ({ page }) => {
    await loginAndOpenWorld(page);

    const worldSection = page.locator('#t-whos-who details.city-section').nth(2);
    expect(await worldSection.locator('.city-cov-group').count()).toBeGreaterThan(0);
  });


});
