/**
 * Issue #333 — Merit and Skill Manual Bonus Dot Stepper
 *
 * meritBdRow (xp.js) appends a Bonus ▼ 0 ▲ stepper to every merit's bd-panel.
 * sk-bd-panel (sheet.js) has a matching Bonus stepper for every skill in edit mode.
 *
 * AC1 — Merit Bonus row renders; ▼ disabled at zero, bd-src shows "0"
 * AC2 — Merit Bonus ▲ increments display to "+1"; ▼ then enabled; ▲+▼ round-trips to "0"
 * AC3 — Merit bonus is display-only: XP badge unchanged after incrementing bonus
 * AC4 — Skill Bonus row renders in sk-bd-panel; ▼ disabled at zero, bd-src shows "0"
 * AC5 — Skill Bonus ▲ increments display to "+1"; ▲+▼ round-trips to "0"
 * AC6 — Save PUT payload includes updated bonus for both merit and skill
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '333000001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-333', character_ids: [], is_dual_role: false,
};

const TEST_CHAR = {
  _id: 'char-333-001',
  name: 'Bonus Tester',
  moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Ordo Dracul',
  player: 'Test Player',
  blood_potency: 1,
  humanity: 7, humanity_base: 7,
  court_title: null, retired: false,
  status: {
    city: 0, clan: 0,
    covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
  },
  attributes: {
    Intelligence: { dots: 2, bonus: 0 }, Wits:         { dots: 2, bonus: 0 }, Resolve:      { dots: 2, bonus: 0 },
    Strength:     { dots: 2, bonus: 0 }, Dexterity:    { dots: 2, bonus: 0 }, Stamina:      { dots: 2, bonus: 0 },
    Presence:     { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure:    { dots: 2, bonus: 0 },
  },
  skills: {
    Academics: { dots: 2, bonus: 0, specs: [], nine_again: false },
  },
  disciplines: {},
  merits: [
    { name: 'Allies', category: 'general', cp: 2, xp: 0 },
  ],
  powers: [], ordeals: [],
};

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function setup(page) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url    = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
    // Individual character fetch (edit mode entry) — must come before the list check
    if (url.match(/\/api\/characters\/char-333-001$/))    return ok(TEST_CHAR);
    if (url.includes('/api/characters/names'))             return ok([{ _id: TEST_CHAR._id, name: TEST_CHAR.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))                   return ok([TEST_CHAR]);
    if (url.includes('/api/territories'))                  return ok([]);
    if (url.includes('/api/game_sessions'))                return ok([]);
    if (url.includes('/api/session_logs'))                 return ok([]);
    if (url.includes('/api/downtime_cycles'))              return ok([]);
    if (url.includes('/api/downtime_submissions'))         return ok([]);
    if (url.includes('/api/players'))                      return ok([]);
    return ok([]);
  });
}

async function openInEditMode(page) {
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])');
  await page.waitForSelector('[data-id="char-333-001"]', { timeout: 8000 });
  await page.click('[data-id="char-333-001"]');
  await page.waitForSelector('#char-detail #cd-edit-toggle', { timeout: 5000 });
  await page.click('#cd-edit-toggle');
  await page.waitForTimeout(300);
  await page.waitForSelector('#cd-save-api:not([style*="display: none"])', { timeout: 5000 });
}

// ── AC1/AC2: Merit Bonus Stepper ──────────────────────────────────────────────

test.describe('Issue #333 — AC1/AC2: Merit Bonus ▼ 0 ▲ stepper', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await openInEditMode(page);
  });

  test('Merit bonus row visible with Bonus label and initial value 0', async ({ page }) => {
    const bonusRow = page.locator('.merit-list .attr-derived-row').first();
    await bonusRow.waitFor({ state: 'visible', timeout: 5000 });
    await expect(bonusRow.locator('.bd-lbl')).toHaveText('Bonus');
    await expect(bonusRow.locator('.bd-src')).toHaveText('0');
    await expect(bonusRow.locator('button.sh-stat-adj').first()).toBeDisabled();
  });

  test('Merit Bonus ▲ increments bd-src to +1 and enables ▼', async ({ page }) => {
    const bonusRow = page.locator('.merit-list .attr-derived-row').first();
    await bonusRow.waitFor({ state: 'visible', timeout: 5000 });
    await bonusRow.locator('button.sh-stat-adj').last().click();
    await expect(bonusRow.locator('.bd-src')).toHaveText('+1');
    await expect(bonusRow.locator('button.sh-stat-adj').first()).toBeEnabled();
  });

  test('Merit Bonus ▲ then ▼ round-trips: bd-src returns to 0 and ▼ re-disabled', async ({ page }) => {
    const bonusRow = page.locator('.merit-list .attr-derived-row').first();
    await bonusRow.waitFor({ state: 'visible', timeout: 5000 });
    await bonusRow.locator('button.sh-stat-adj').last().click();
    await expect(bonusRow.locator('.bd-src')).toHaveText('+1');
    await bonusRow.locator('button.sh-stat-adj').first().click();
    await expect(bonusRow.locator('.bd-src')).toHaveText('0');
    await expect(bonusRow.locator('button.sh-stat-adj').first()).toBeDisabled();
  });
});

// ── AC3: Bonus is display-only — XP unchanged ─────────────────────────────────

test.describe('Issue #333 — AC3: Merit bonus does not affect XP', () => {
  test('XP badge text unchanged after incrementing merit bonus', async ({ page }) => {
    await setup(page);
    await openInEditMode(page);
    const xpBadge = page.locator('.sh-xp-badge');
    await xpBadge.waitFor({ state: 'visible', timeout: 5000 });
    const xpBefore = await xpBadge.textContent();
    await page.locator('.merit-list .attr-derived-row').first().locator('button.sh-stat-adj').last().click();
    await expect(page.locator('.sh-xp-badge')).toHaveText(xpBefore);
  });
});

// ── AC4/AC5: Skill Bonus Stepper ──────────────────────────────────────────────

test.describe('Issue #333 — AC4/AC5: Skill Bonus ▼ 0 ▲ stepper', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await openInEditMode(page);
  });

  // Locate the Academics sk-edit-cell by filtering on its sh-skill-name span
  function academicsCell(page) {
    return page.locator('.sk-edit-cell').filter({
      has: page.locator('.sh-skill-name', { hasText: 'Academics' }),
    });
  }

  test('Skill bonus row visible in Academics cell with Bonus label and initial value 0', async ({ page }) => {
    const bonusRow = academicsCell(page).locator('.attr-derived-row');
    await bonusRow.waitFor({ state: 'visible', timeout: 5000 });
    await expect(bonusRow.locator('.bd-lbl')).toHaveText('Bonus');
    await expect(bonusRow.locator('.bd-src')).toHaveText('0');
    await expect(bonusRow.locator('button.sh-stat-adj').first()).toBeDisabled();
  });

  test('Skill Bonus ▲ increments bd-src to +1 and enables ▼', async ({ page }) => {
    const bonusRow = academicsCell(page).locator('.attr-derived-row');
    await bonusRow.waitFor({ state: 'visible', timeout: 5000 });
    await bonusRow.locator('button.sh-stat-adj').last().click();
    await expect(bonusRow.locator('.bd-src')).toHaveText('+1');
    await expect(bonusRow.locator('button.sh-stat-adj').first()).toBeEnabled();
  });

  test('Skill Bonus ▲ then ▼ round-trips: bd-src returns to 0 and ▼ re-disabled', async ({ page }) => {
    const bonusRow = academicsCell(page).locator('.attr-derived-row');
    await bonusRow.waitFor({ state: 'visible', timeout: 5000 });
    await bonusRow.locator('button.sh-stat-adj').last().click();
    await expect(bonusRow.locator('.bd-src')).toHaveText('+1');
    await bonusRow.locator('button.sh-stat-adj').first().click();
    await expect(bonusRow.locator('.bd-src')).toHaveText('0');
    await expect(bonusRow.locator('button.sh-stat-adj').first()).toBeDisabled();
  });
});

// ── AC6: Persistence — PUT payload includes updated bonus ─────────────────────

test.describe('Issue #333 — AC6: Bonus values persist to save PUT payload', () => {
  async function setupWithCapture(page) {
    await setup(page);
    let putBody = null;
    // Register specific route AFTER catch-all so it takes priority (Playwright: last registered wins)
    await page.route('http://localhost:3000/api/characters/char-333-001', route => {
      const method = route.request().method();
      if (method === 'PUT') {
        putBody = JSON.parse(route.request().postData() || '{}');
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_CHAR) });
      }
    });
    return { getPutBody: () => putBody };
  }

  test('Merit bonus of 1 included in save PUT body; merit xp unchanged', async ({ page }) => {
    const { getPutBody } = await setupWithCapture(page);
    await openInEditMode(page);
    await page.locator('.merit-list .attr-derived-row').first().locator('button.sh-stat-adj').last().click();
    await page.click('#cd-save-api');
    await page.waitForTimeout(600);

    const body = getPutBody();
    expect(body).not.toBeNull();
    const ally = body.merits?.find(m => m.name === 'Allies');
    expect(ally?.bonus).toBe(1);
    expect(ally?.xp).toBe(0);
  });

  test('Skill bonus of 1 included in save PUT body', async ({ page }) => {
    const { getPutBody } = await setupWithCapture(page);
    await openInEditMode(page);
    const cell = page.locator('.sk-edit-cell').filter({
      has: page.locator('.sh-skill-name', { hasText: 'Academics' }),
    });
    await cell.locator('.attr-derived-row button.sh-stat-adj').last().click();
    await page.click('#cd-save-api');
    await page.waitForTimeout(600);

    const body = getPutBody();
    expect(body).not.toBeNull();
    expect(body.skills?.Academics?.bonus).toBe(1);
  });
});
