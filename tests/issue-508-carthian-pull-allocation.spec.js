/**
 * Player DT form — Carthian Pull dot-allocation (#508)
 *
 * A single-dot allocation, shown only when the character holds Carthian Pull,
 * rendered before Feeding. Allocating the dot writes a live `free_carthian`
 * bonus to the chosen merit on the character (player-scoped PATCH). This spec
 * covers the DT-form behaviour: section gating, the target choice, the live
 * write payload, the sphere reveal, the 5-cap disable, and the extra Allies
 * action slot. The server-side write itself is covered by
 * server/tests/api-characters-carthian-pull.test.js.
 *
 * Harness mirrors issue-506; the mock applies the allocation to a live char copy
 * so the form's re-render reflects it (as the real endpoint would).
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-508',
  character_ids: ['char-508'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-508', cycle_number: 5, status: 'open',
  deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
  confirmed_ambience: {}, narrative_notes: '',
};

const CHAR_BASE = {
  _id: 'char-508', name: 'Pull Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Carthian Movement', player: 'Test Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  regent_territory: null, retired: false,
  status: { city: 1, clan: 1, covenant: { Carthian: 1, Crone: 0, Invictus: 0, Lancea: 0, OD: 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const CP = { category: 'general', name: 'Carthian Pull', cp: 1, rating: 1 };

const CHAR_WITH_CP = { ...CHAR_BASE, merits: [CP] };
const CHAR_NO_CP = { ...CHAR_BASE, merits: [] };
// Five Allies merits → at the 5-action cap.
const CHAR_CP_CAPPED = {
  ...CHAR_BASE,
  // Distinct `area` so meritKey (name_rating_area) keeps all five (no dedupe).
  merits: [CP,
    { category: 'influence', name: 'Allies', area: 'A', cp: 1, rating: 1 },
    { category: 'influence', name: 'Allies', area: 'B', cp: 1, rating: 1 },
    { category: 'influence', name: 'Allies', area: 'C', cp: 1, rating: 1 },
    { category: 'influence', name: 'Allies', area: 'D', cp: 1, rating: 1 },
    { category: 'influence', name: 'Allies', area: 'E', cp: 1, rating: 1 },
  ],
};

// Mirror the server strip-then-apply so the mocked PATCH returns a consistent char.
function applyCarthian(char, body) {
  const c = JSON.parse(JSON.stringify(char));
  const target = (body && body.target) || '';
  const sphere = ((body && body.sphere) || '').trim();
  c.merits = (c.merits || [])
    .filter(m => m.granted_by !== 'Carthian Pull')
    .map(m => { if (m.free_carthian) { const r = { ...m }; delete r.free_carthian; return r; } return m; });
  if (target === 'allies' || target === 'contacts') {
    c.merits.push({ category: 'influence', name: target === 'allies' ? 'Allies' : 'Contacts', spheres: [sphere], granted_by: 'Carthian Pull', free_carthian: 1, rating: 1 });
  } else if (target === 'haven' || target === 'herd') {
    const name = target === 'haven' ? 'Haven' : 'Herd';
    const ex = c.merits.find(m => m.category === 'domain' && m.name === name);
    if (ex) { ex.free_carthian = (ex.free_carthian || 0) + 1; ex.rating = (ex.rating || 0) + 1; }
    else c.merits.push({ category: 'domain', name, granted_by: 'Carthian Pull', free_carthian: 1, rating: 1 });
  }
  return c;
}

async function setup(page, { char = CHAR_WITH_CP, attended = false } = {}) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: PLAYER_USER });

  // Mutable live char so the mocked PATCH "persists" across the session.
  let live = JSON.parse(JSON.stringify(char));

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/api/auth/me'))             return ok(PLAYER_USER);
    if (url.includes('/api/characters/names'))    return ok([{ _id: live._id, name: live.name, moniker: live.moniker, honorific: live.honorific }]);
    if (method === 'PATCH' && /\/api\/characters\/[^/]+\/carthian_pull/.test(url)) {
      const body = route.request().postDataJSON();
      live = applyCarthian(live, body);
      return ok(live);
    }
    if (/\/api\/characters\/char-508(\?|$)/.test(url))  return ok(live);
    if (url.includes('/api/characters'))          return ok([live]);
    if (url.includes('/api/attendance'))          return ok({ attended });
    if (url.includes('/api/downtime_cycles'))     return ok([ACTIVE_CYCLE]);
    if (url.includes('/api/downtime_submissions')) {
      if (method === 'POST' || method === 'PUT') return ok({ _id: 'sub-508', responses: {} });
      return ok([]);
    }
    if (url.includes('/api/territories'))         return ok([]);
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') return ok({ ok: true, _id: 'sub-508' });
    return ok([]);
  });

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function openDtTab(page) {
  await page.waitForFunction(() => typeof window.goTab === 'function', { timeout: 8000 });
  await page.evaluate(() => window.goTab('downtime'));
  await page.waitForTimeout(600);
}

const SECTION = '[data-section-key="carthian_pull"]';
const TARGET = '#dt-carthian_target';

test.describe('Player DT form — Carthian Pull allocation (#508)', () => {

  test('AC#1: section is absent when the character has no Carthian Pull', async ({ page }) => {
    await setup(page, { char: CHAR_NO_CP });
    await openDtTab(page);
    await expect(page.locator('[data-section-key="feeding"]')).toBeAttached({ timeout: 8000 });
    await expect(page.locator(SECTION)).toHaveCount(0);
  });

  test('AC#2/#3: section renders before Feeding with all four targets', async ({ page }) => {
    await setup(page, { char: CHAR_WITH_CP });
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    // options present
    for (const v of ['allies', 'contacts', 'haven', 'herd']) {
      await expect(page.locator(`${TARGET} option[value="${v}"]`)).toHaveCount(1);
    }
    // ordered before feeding
    const order = await page.evaluate(() => {
      const all = [...document.querySelectorAll('[data-section-key]')].map(e => e.getAttribute('data-section-key'));
      return { cp: all.indexOf('carthian_pull'), feed: all.indexOf('feeding') };
    });
    expect(order.cp).toBeGreaterThanOrEqual(0);
    expect(order.cp).toBeLessThan(order.feed);
  });

  test('write: selecting Herd PATCHes the endpoint with target herd', async ({ page }) => {
    await setup(page, { char: CHAR_WITH_CP });
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    await page.locator(`${SECTION} .qf-section-title`).click();

    const [req] = await Promise.all([
      page.waitForRequest(r => r.method() === 'PATCH' && /\/api\/characters\/char-508\/carthian_pull/.test(r.url()), { timeout: 6000 }),
      page.selectOption(TARGET, 'herd'),
    ]);
    expect(req.postDataJSON().target).toBe('herd');
  });

  test('write: Allies reveals a sphere input and PATCHes with the typed sphere', async ({ page }) => {
    await setup(page, { char: CHAR_WITH_CP });
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    await page.locator(`${SECTION} .qf-section-title`).click();

    // Selecting Allies reveals the sphere field (no write yet — needs a sphere).
    await page.selectOption(TARGET, 'allies');
    await expect(page.locator('#dt-carthian_sphere')).toBeVisible({ timeout: 3000 });

    const [req] = await Promise.all([
      page.waitForRequest(r => r.method() === 'PATCH' && /carthian_pull/.test(r.url()) && r.postDataJSON().target === 'allies', { timeout: 6000 }),
      page.fill('#dt-carthian_sphere', 'Street').then(() => page.locator('#dt-carthian_sphere').blur()),
    ]);
    expect(req.postDataJSON()).toMatchObject({ target: 'allies', sphere: 'Street' });
  });

  test('AC#5: Allies target is disabled at the 5-action cap', async ({ page }) => {
    await setup(page, { char: CHAR_CP_CAPPED });
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    await expect(page.locator(`${TARGET} option[value="allies"]`)).toBeDisabled();
    // Haven/Herd remain available
    await expect(page.locator(`${TARGET} option[value="herd"]`)).toBeEnabled();
  });

  test('AC#8: selecting None clears the allocation (PATCH target empty)', async ({ page }) => {
    // Start from a char that already holds a Carthian Pull Herd bonus.
    const seeded = applyCarthian(CHAR_WITH_CP, { target: 'herd' });
    await setup(page, { char: seeded });
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    // The section reflects the persisted allocation.
    await expect(page.locator(TARGET)).toHaveValue('herd');
    await page.locator(`${SECTION} .qf-section-title`).click();

    const [req] = await Promise.all([
      page.waitForRequest(r => r.method() === 'PATCH' && /carthian_pull/.test(r.url()), { timeout: 6000 }),
      page.selectOption(TARGET, ''),
    ]);
    expect(req.postDataJSON().target).toBe('');
  });

});
