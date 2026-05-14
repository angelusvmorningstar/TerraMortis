/**
 * Issue #306 — Out-of-window access override must bypass inner gate in downtime-form.js
 *
 * AC coverage:
 *   AC1 — Game App: character in out_of_window_player_ids on prep cycle sees form (not gate page)
 *   AC2 — (manual) Player Portal path — covered by the same inner-gate fix; no separate E2E surface
 *   AC3 — Regression: character NOT in out_of_window_player_ids on prep cycle still sees "not yet open" gate
 *   AC4 — Regression: active cycle still passes all players regardless of override membership
 */

const { test, expect } = require('@playwright/test');

// ── Shared mock data ──────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '987654306', username: 'test_oow', global_name: 'Test OOW Player',
  avatar: null, role: 'player', player_id: 'p-306',
  character_ids: ['char-306'], is_dual_role: false,
};

const CHAR_306 = {
  _id: 'char-306', name: 'Gate Test', moniker: null, honorific: null,
  clan: 'Nosferatu', covenant: 'Unbound', player: 'Test OOW Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  regent_territory: null, retired: false,
  status: { city: 1, clan: 1, covenant: { Carthian: 0, Crone: 0, Invictus: 0, Lancea: 0, OD: 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

// Prep cycle with char-306 in the out-of-window override list
const PREP_CYCLE_WITH_OOW = {
  _id: 'cycle-306', cycle_number: 3, status: 'prep',
  deadline_at: new Date(Date.now() + 86400000 * 4).toISOString(),
  out_of_window_player_ids: ['char-306'],
  confirmed_ambience: {}, narrative_notes: '',
};

// Prep cycle with NO override for this character
const PREP_CYCLE_NO_OOW = {
  ...PREP_CYCLE_WITH_OOW,
  out_of_window_player_ids: [],
};

// Active cycle — all players should pass regardless of override list
const ACTIVE_CYCLE_306 = {
  ...PREP_CYCLE_WITH_OOW,
  status: 'active',
  out_of_window_player_ids: [], // deliberately empty — should not matter
};

// ── Setup helper ─────────────────────────────────────────────────────────────

async function setup(page, { char = CHAR_306, cycle = PREP_CYCLE_WITH_OOW } = {}) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: PLAYER_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') return ok({ ok: true, _id: 'sub-306-draft' });
    if (url.includes('/api/auth/me'))             return ok(PLAYER_USER);
    if (url.includes('/api/downtime_cycles'))     return ok(cycle ? [cycle] : []);
    if (url.includes('/api/downtime_submissions')) return ok([]);
    if (url.includes('/api/characters/names'))    return ok([{ _id: char._id, name: char.name, moniker: char.moniker, honorific: char.honorific }]);
    if (url.includes('/api/characters'))          return ok([char]);
    if (url.includes('/api/territories'))         return ok([]);
    if (url.includes('/api/game_sessions'))       return ok([]);
    if (url.includes('/api/session_logs'))        return ok([]);
    if (url.includes('/api/ordeal-responses'))    return ok([]);
    return ok([]);
  });

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function openDtTab(page) {
  await page.waitForFunction(() => typeof window.goTab === 'function', { timeout: 8000 });
  await page.evaluate(() => window.goTab('downtime'));
  await page.waitForTimeout(800);
}

// ── AC1: Out-of-window override bypasses inner gate on prep cycle ─────────────

test.describe('Issue #306 — AC1: OOW override on prep cycle', () => {

  test('Form renders for character with out-of-window access on prep cycle', async ({ page }) => {
    await setup(page, { cycle: PREP_CYCLE_WITH_OOW });
    await openDtTab(page);

    const dtPanel = page.locator('#t-downtime');

    // Form container must be present — not the gate page
    await expect(dtPanel.locator('#dt-container')).toBeVisible({ timeout: 8000 });

    // The gate message must NOT appear
    await expect(dtPanel.locator('.qf-gate-msg')).toHaveCount(0);
  });

  test('Submit button is present for OOW-overridden character on prep cycle', async ({ page }) => {
    await setup(page, { cycle: PREP_CYCLE_WITH_OOW });
    await openDtTab(page);

    await expect(page.locator('#dt-btn-submit')).toBeVisible({ timeout: 8000 });
  });

});

// ── AC3: Regression — ungated character still blocked on prep cycle ───────────

test.describe('Issue #306 — AC3: Ungated character still blocked on prep cycle', () => {

  test('No form and no submit button for character not in out_of_window_player_ids', async ({ page }) => {
    await setup(page, { cycle: PREP_CYCLE_NO_OOW });
    await openDtTab(page);

    const dtPanel = page.locator('#t-downtime');

    // Form container must NOT be present
    await expect(dtPanel.locator('#dt-container')).toHaveCount(0);

    // Submit button must NOT be present
    await expect(dtPanel.locator('#dt-btn-submit')).toHaveCount(0);
  });

  test('"Downtimes are not yet open" state card shows for ungated player on prep cycle', async ({ page }) => {
    await setup(page, { cycle: PREP_CYCLE_NO_OOW });
    await openDtTab(page);

    const dtPanel = page.locator('#t-downtime');

    // Outer gate (downtime-tab.js) renders the "not yet open" state card
    await expect(dtPanel.locator('.dt-state-title')).toContainText(/not yet open/i, { timeout: 6000 });
  });

});

// ── AC4: Regression — active cycle passes all players regardless of OOW list ──

test.describe('Issue #306 — AC4: Active cycle passes all players', () => {

  test('Form renders on active cycle even with empty out_of_window_player_ids', async ({ page }) => {
    await setup(page, { cycle: ACTIVE_CYCLE_306 });
    await openDtTab(page);

    await expect(page.locator('#dt-container')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#dt-btn-submit')).toBeVisible({ timeout: 8000 });
  });

  test('No gate message on active cycle', async ({ page }) => {
    await setup(page, { cycle: ACTIVE_CYCLE_306 });
    await openDtTab(page);

    const dtPanel = page.locator('#t-downtime');
    await expect(dtPanel.locator('.qf-gate-msg')).toHaveCount(0);
    await expect(dtPanel.locator('.dt-state-title')).toHaveCount(0);
  });

});
