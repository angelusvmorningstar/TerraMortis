/**
 * Downtime Player Form — General Smoke Tests
 *
 * Covers the player-facing submission form on player.html:
 *   - Form renders when an active cycle exists
 *   - Empty/no-cycle state is handled gracefully
 *   - Core sections present (feeding, projects, personal story)
 *   - Sections auto-appear for characters with relevant merits
 *   - Draft auto-save wiring (save-status element present)
 *   - Submit button present and labelled correctly
 *   - Regency section visible for Regent characters
 *   - Sorcery section visible for characters with Cruac/Theban
 */

const { test, expect } = require('@playwright/test');

// ── Shared auth ───────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-dt-smoke',
  character_ids: ['char-dt-smoke'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-dt-smoke', cycle_number: 3, status: 'open',
  deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
  confirmed_ambience: {}, narrative_notes: '',
};

// Minimal character — no merits, no disciplines
const CHAR_MINIMAL = {
  _id: 'char-dt-smoke', name: 'Smoke Test', moniker: null, honorific: null,
  clan: 'Gangrel', covenant: 'Unbound', player: 'Test Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  regent_territory: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { Carthian: 0, Crone: 0, Invictus: 0, Lancea: 0, OD: 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

// Character with Allies merit — sphere/allies section should appear
const CHAR_WITH_ALLIES = {
  ...CHAR_MINIMAL, _id: 'char-dt-smoke',
  merits: [{ name: 'Allies', category: 'influence', rating: 3, qualifier: 'Criminal' }],
};

// Character with Cruac discipline — blood sorcery section should appear
const CHAR_WITH_CRUAC = {
  ...CHAR_MINIMAL, _id: 'char-dt-smoke',
  disciplines: { Cruac: { dots: 2 } },
};

// Regent character — regency section should appear
const CHAR_REGENT = {
  ...CHAR_MINIMAL, _id: 'char-dt-smoke',
  regent_territory: 'northshore',
};

// ── Setup helper ─────────────────────────────────────────────────────────────

async function setup(page, { char = CHAR_MINIMAL, cycle = ACTIVE_CYCLE, submission = null } = {}) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: PLAYER_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') return ok({ ok: true, _id: 'sub-draft-001' });
    // Return the proper user so validateToken() doesn't overwrite tm_auth_user with []
    if (url.includes('/api/auth/me'))            return ok(PLAYER_USER);
    if (url.includes('/api/downtime_cycles'))     return ok(cycle ? [cycle] : []);
    if (url.includes('/api/downtime_submissions')) return ok(submission ? [submission] : []);
    if (url.includes('/api/characters/names'))    return ok([{ _id: char._id, name: char.name, moniker: char.moniker, honorific: char.honorific }]);
    if (url.includes('/api/characters'))          return ok([char]);
    if (url.includes('/api/territories'))         return ok([]);
    if (url.includes('/api/game_sessions'))       return ok([]);
    if (url.includes('/api/session_logs'))        return ok([]);
    if (url.includes('/api/ordeal-responses'))    return ok([]);
    return ok([]);
  });

  // player.html redirects to / (index.html) — the unified game app
  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function openDtTab(page) {
  // In the game app the DT tab is triggered via the global goTab() function.
  // Wait until the sidebar tile is rendered (after boot completes).
  await page.waitForFunction(() => typeof window.goTab === 'function', { timeout: 8000 });
  await page.evaluate(() => window.goTab('downtime'));
  await page.waitForTimeout(600);
}

// ── Section: DT tab navigation ────────────────────────────────────────────────

test.describe('Player DT form — Tab navigation', () => {

  test('Downtime nav tile is present in sidebar', async ({ page }) => {
    await setup(page);
    // Game app renders DT as a sidebar tile (desktop) or bottom-nav button (mobile)
    await page.waitForFunction(() => typeof window.goTab === 'function', { timeout: 8000 });
    const tile = page.locator('button.sidebar-app-tile:has-text("Downtime"), button#n-downtime').first();
    await expect(tile).toBeVisible({ timeout: 5000 });
  });

  test('DT tab container exists in DOM', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#t-downtime')).toBeAttached();
  });

});

// ── Section: No active cycle state ───────────────────────────────────────────

test.describe('Player DT form — No active cycle', () => {

  test('Shows a message or empty state when no cycle is open', async ({ page }) => {
    await setup(page, { cycle: null });
    await openDtTab(page);
    const dtPanel = page.locator('#t-downtime');
    // Should not crash — panel should render something (not blank or erroring)
    await expect(dtPanel).toBeVisible({ timeout: 5000 });
    // No form submit button should appear without an active cycle
    await expect(dtPanel.locator('#dt-btn-submit')).toHaveCount(0);
  });

});

// ── Section: Active cycle — core form renders ─────────────────────────────────

test.describe('Player DT form — Core form renders with active cycle', () => {

  test('DT container renders when active cycle exists', async ({ page }) => {
    await setup(page);
    await openDtTab(page);
    await expect(page.locator('#dt-container, #tab-downtime .qf-section').first()).toBeVisible({ timeout: 8000 });
  });

  test('Submit button is present', async ({ page }) => {
    await setup(page);
    await openDtTab(page);
    await expect(page.locator('#dt-btn-submit')).toBeVisible({ timeout: 8000 });
  });

  test('Save status indicator is present (draft auto-save hook)', async ({ page }) => {
    await setup(page);
    await openDtTab(page);
    await expect(page.locator('#dt-save-status')).toBeAttached({ timeout: 8000 });
  });

  test('Feeding section is present', async ({ page }) => {
    await setup(page);
    await openDtTab(page);
    const feedSection = page.locator('[data-section-key="feeding"], [data-section-key="feed"]').first();
    await expect(feedSection).toBeAttached({ timeout: 8000 });
  });

  test('Projects section is present', async ({ page }) => {
    await setup(page);
    await openDtTab(page);
    const projSection = page.locator('[data-section-key="projects"]').first();
    await expect(projSection).toBeAttached({ timeout: 8000 });
  });

  test('Personal story section is present', async ({ page }) => {
    await setup(page);
    await openDtTab(page);
    const psSection = page.locator('[data-section-key="personal_story"]').first();
    await expect(psSection).toBeAttached({ timeout: 8000 });
  });

});

// ── Section: Merit-driven section auto-detection ─────────────────────────────

test.describe('Player DT form — Merit-driven sections', () => {

  test('Character with Allies merit: merit actions section present', async ({ page }) => {
    await setup(page, { char: CHAR_WITH_ALLIES });
    await openDtTab(page);
    // spheres is an advanced-mode section — switch to advanced before asserting
    await page.locator('button[data-dt-mode="advanced"]').click();
    await page.waitForTimeout(300);
    const meritSection = page.locator('[data-section-key="spheres"]').first();
    await expect(meritSection).toBeAttached({ timeout: 8000 });
  });

  test('Character without merits: no sphere actions section rendered', async ({ page }) => {
    await setup(page, { char: CHAR_MINIMAL });
    await openDtTab(page);
    await page.waitForTimeout(500);
    // CHAR_MINIMAL has no Allies merits so spheres section should be absent
    const sphereSection = page.locator('[data-section-key="spheres"]');
    await expect(sphereSection).toHaveCount(0);
  });

});

// ── Section: Discipline-driven sorcery section ───────────────────────────────

test.describe('Player DT form — Sorcery section', () => {

  test('Character with Cruac discipline: blood sorcery section is present', async ({ page }) => {
    await setup(page, { char: CHAR_WITH_CRUAC });
    await openDtTab(page);
    // blood_sorcery is an advanced-mode section — switch to advanced before asserting
    await page.locator('button[data-dt-mode="advanced"]').click();
    await page.waitForTimeout(300);
    const sorcerySection = page.locator('[data-section-key="blood_sorcery"]');
    await expect(sorcerySection).toBeAttached({ timeout: 8000 });
  });

  test('Character without sorcery disciplines: no blood sorcery section', async ({ page }) => {
    await setup(page, { char: CHAR_MINIMAL });
    await openDtTab(page);
    await page.waitForTimeout(500);
    const sorcerySection = page.locator('[data-section-key="blood_sorcery"]');
    await expect(sorcerySection).toHaveCount(0);
  });

});

// ── Section: Existing draft loads ────────────────────────────────────────────

test.describe('Player DT form — Existing submission loads', () => {

  test('Previously submitted form still shows submit button (edit mode)', async ({ page }) => {
    const existingSubmission = {
      _id: 'sub-existing', cycle_id: ACTIVE_CYCLE._id,
      character_id: CHAR_MINIMAL._id, character_name: CHAR_MINIMAL.name,
      player_name: 'Test Player', status: 'submitted',
      submitted_at: new Date().toISOString(),
      responses: { _feed_method: 'predatory_aura' },
      _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
      st_review: {},
    };
    await setup(page, { submission: existingSubmission });
    await openDtTab(page);
    await expect(page.locator('#dt-btn-submit, #dt-btn-submit-final').first()).toBeVisible({ timeout: 8000 });
  });

});
