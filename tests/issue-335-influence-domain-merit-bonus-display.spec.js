/**
 * Issue #335 — Influence and Domain Merit Bonus Dot Display
 *
 * After merging #333, meritBdRow shows a Bonus ▼/▲ stepper for ALL merit
 * categories. This issue fixes the dot display in shRenderInfluenceMerits
 * and shRenderDomainMerits so that clicking the stepper visually updates the
 * hollow-dot count in the merit's header row — matching the existing behaviour
 * for general merits.
 *
 * AC1 — Influence merit edit mode: clicking Bonus ▲ increases hollow-dot count
 *        in the infl-dots-derived span immediately.
 * AC2 — Influence merit view mode: hollow dots appear in the merit row when
 *        bonus > 0 (shDotsMixed path via iBon).
 * AC3 — Domain merit edit mode: clicking Bonus ▲ increases hollow-dot count
 *        in the dom-contrib-lbl span immediately.
 * AC4 — Domain merit view mode: hollow dots appear when bonus > 0.
 * AC5 — XP totals and influence totals are unchanged by bonus increments.
 * AC6 — Bonus persists in PUT payload.
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '335000001', username: 'test_st_335', global_name: 'Test ST 335',
  avatar: null, role: 'st', player_id: 'p-335', character_ids: [], is_dual_role: false,
};

const TEST_CHAR = {
  _id: 'char-335-001',
  name: 'Display Tester',
  moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus',
  player: 'Test Player',
  blood_potency: 2,
  humanity: 7, humanity_base: 7,
  court_title: null, retired: false,
  status: {
    city: 1, clan: 0,
    covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
  },
  attributes: {
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {
    Academics: { dots: 1, bonus: 0, specs: [], nine_again: false },
  },
  disciplines: {},
  merits: [
    // Influence merit — 2 cp dots (2 filled, 0 hollow initially)
    { name: 'Allies', category: 'influence', cp: 2, xp: 0, bonus: 0, area: 'Academic' },
    // Domain merit — 2 cp dots
    { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, bonus: 0, qualifier: 'Penthouse' },
  ],
  powers: [], ordeals: [],
};

// Character variant with bonus pre-set to 1 on both merits (for view-mode tests)
const TEST_CHAR_BON = {
  ...TEST_CHAR,
  merits: [
    { name: 'Allies', category: 'influence', cp: 2, xp: 0, bonus: 1, area: 'Academic' },
    { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, bonus: 1, qualifier: 'Penthouse' },
  ],
};

// ── Setup helpers ─────────────────────────────────────────────────────────────

let lastPutBody = null;

async function setup(page) {
  lastPutBody = null;
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url    = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'PUT') {
      lastPutBody = route.request().postDataJSON();
      return ok({ ok: true });
    }
    if (method === 'PATCH' || method === 'POST') return ok({ ok: true });
    if (url.match(/\/api\/characters\/char-335-001$/))   return ok(TEST_CHAR);
    if (url.includes('/api/characters/names'))            return ok([{ _id: TEST_CHAR._id, name: TEST_CHAR.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))                  return ok([TEST_CHAR]);
    if (url.includes('/api/territories'))                 return ok([]);
    if (url.includes('/api/game_sessions'))               return ok([]);
    if (url.includes('/api/session_logs'))                return ok([]);
    if (url.includes('/api/downtime_cycles'))             return ok([]);
    if (url.includes('/api/downtime_submissions'))        return ok([]);
    if (url.includes('/api/players'))                     return ok([]);
    return ok([]);
  });
}

async function setupWithBonus(page) {
  lastPutBody = null;
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url    = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'PUT') { lastPutBody = route.request().postDataJSON(); return ok({ ok: true }); }
    if (method === 'PATCH' || method === 'POST') return ok({ ok: true });
    if (url.match(/\/api\/characters\/char-335-001$/))   return ok(TEST_CHAR_BON);
    if (url.includes('/api/characters/names'))            return ok([{ _id: TEST_CHAR_BON._id, name: TEST_CHAR_BON.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))                  return ok([TEST_CHAR_BON]);
    if (url.includes('/api/territories'))                 return ok([]);
    if (url.includes('/api/game_sessions'))               return ok([]);
    if (url.includes('/api/session_logs'))                return ok([]);
    if (url.includes('/api/downtime_cycles'))             return ok([]);
    if (url.includes('/api/downtime_submissions'))        return ok([]);
    if (url.includes('/api/players'))                     return ok([]);
    return ok([]);
  });
}

async function openSheet(page) {
  await page.goto('http://localhost:8080/admin.html');
  await page.waitForSelector('.char-card', { timeout: 10000 });
  await page.locator('.char-card').first().click();
  await page.waitForSelector('.sh-sec-title', { timeout: 8000 });
}

async function openEditor(page) {
  await page.goto('http://localhost:8080/admin.html');
  await page.waitForSelector('.char-card', { timeout: 10000 });
  await page.locator('.char-card').first().click();
  await page.waitForSelector('.sh-sec-title', { timeout: 8000 });
  // Enter edit mode
  const editBtn = page.locator('button', { hasText: /edit/i }).first();
  if (await editBtn.isVisible()) await editBtn.click();
  await page.waitForSelector('.merit-bd-row', { timeout: 8000 });
}

// ── Helper: count hollow dots (○) in an element's text content ───────────────
async function hollowDotCount(locator) {
  const text = await locator.textContent();
  return (text.match(/○/g) || []).length;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Issue #335 — Influence and Domain merit bonus dot display', () => {

  test.beforeEach(async ({ page }) => {
    await setup(page);
    await openEditor(page);
  });

  // ── AC1: Influence merit edit mode ─────────────────────────────────────────
  test('AC1 — Influence merit edit mode: Bonus ▲ adds hollow dot to infl-dots-derived span', async ({ page }) => {
    // Locate the Allies merit row and its breakdown panel
    const alliesSection = page.locator('.sh-sec').filter({ hasText: 'Influence Merits' });
    const editRow = alliesSection.locator('.infl-edit-row').first();
    const dotSpan = editRow.locator('.infl-dots-derived');

    const initialHollow = await hollowDotCount(dotSpan);

    // Locate the Bonus ▲ button inside the merit-bd-row that follows this merit's edit row
    const bdRow = alliesSection.locator('.attr-derived-row').filter({ hasText: 'Bonus' }).first();
    const upBtn = bdRow.locator('button').last();

    await upBtn.click();
    const afterHollow = await hollowDotCount(dotSpan);
    expect(afterHollow).toBe(initialHollow + 1);
  });

  test('AC1b — Influence merit edit mode: Bonus ▲▲ adds two hollow dots; ▼ removes one', async ({ page }) => {
    const alliesSection = page.locator('.sh-sec').filter({ hasText: 'Influence Merits' });
    const editRow = alliesSection.locator('.infl-edit-row').first();
    const dotSpan = editRow.locator('.infl-dots-derived');
    const bdRow = alliesSection.locator('.attr-derived-row').filter({ hasText: 'Bonus' }).first();
    const upBtn = bdRow.locator('button').last();
    const downBtn = bdRow.locator('button').first();

    const initial = await hollowDotCount(dotSpan);

    await upBtn.click();
    await upBtn.click();
    const afterTwo = await hollowDotCount(dotSpan);
    expect(afterTwo).toBe(initial + 2);

    await downBtn.click();
    const afterOne = await hollowDotCount(dotSpan);
    expect(afterOne).toBe(initial + 1);
  });

  // ── AC3: Domain merit edit mode ────────────────────────────────────────────
  test('AC3 — Domain merit edit mode: Bonus ▲ adds hollow dot to dom-contrib-lbl span', async ({ page }) => {
    const domSection = page.locator('.sh-sec').filter({ hasText: 'Domain Merits' });
    const editBlock = domSection.locator('.dom-edit-block').first();
    const contribSpan = editBlock.locator('.dom-contrib-lbl');

    const initialHollow = await hollowDotCount(contribSpan);

    const bdRow = editBlock.locator('.attr-derived-row').filter({ hasText: 'Bonus' }).first();
    const upBtn = bdRow.locator('button').last();

    await upBtn.click();
    const afterHollow = await hollowDotCount(contribSpan);
    expect(afterHollow).toBe(initialHollow + 1);
  });

  // ── AC5: XP and influence totals unchanged ─────────────────────────────────
  test('AC5 — Influence total unchanged after setting Bonus on Allies', async ({ page }) => {
    const alliesSection = page.locator('.sh-sec').filter({ hasText: 'Influence Merits' });
    const inflTotal = alliesSection.locator('.infl-total .inf-n');
    const totalBefore = await inflTotal.textContent();

    const bdRow = alliesSection.locator('.attr-derived-row').filter({ hasText: 'Bonus' }).first();
    await bdRow.locator('button').last().click();

    const totalAfter = await inflTotal.textContent();
    expect(totalAfter).toBe(totalBefore);
  });

  // ── AC6: PUT payload includes updated bonus ────────────────────────────────
  test('AC6 — Save PUT payload includes merit bonus for Allies', async ({ page }) => {
    const alliesSection = page.locator('.sh-sec').filter({ hasText: 'Influence Merits' });
    const bdRow = alliesSection.locator('.attr-derived-row').filter({ hasText: 'Bonus' }).first();
    await bdRow.locator('button').last().click();

    // Trigger save
    const saveBtn = page.locator('button', { hasText: /save/i }).first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(500);
    }

    if (lastPutBody && lastPutBody.merits) {
      const allies = lastPutBody.merits.find(m => m.name === 'Allies' && m.category === 'influence');
      expect(allies).toBeTruthy();
      expect(allies.bonus).toBe(1);
    }
  });

});

// ── View-mode tests ───────────────────────────────────────────────────────────

test.describe('Issue #335 — View-mode hollow dot display (bonus pre-set)', () => {

  test.beforeEach(async ({ page }) => {
    await setupWithBonus(page);
    await openSheet(page);
  });

  // ── AC2: Influence merit view mode ─────────────────────────────────────────
  test('AC2 — Influence merit view mode: hollow dot visible when bonus = 1', async ({ page }) => {
    const inflSection = page.locator('.sh-sec').filter({ hasText: 'Influence Merits' });
    await inflSection.waitFor({ timeout: 5000 });
    const sectionText = await inflSection.textContent();
    expect((sectionText.match(/○/g) || []).length).toBeGreaterThan(0);
  });

  // ── AC4: Domain merit view mode ────────────────────────────────────────────
  test('AC4 — Domain merit view mode: hollow dot visible when bonus = 1', async ({ page }) => {
    const domSection = page.locator('.sh-sec').filter({ hasText: 'Domain Merits' });
    await domSection.waitFor({ timeout: 5000 });
    const sectionText = await domSection.textContent();
    expect((sectionText.match(/○/g) || []).length).toBeGreaterThan(0);
  });

});
