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
  // #522: Carthian Pull pool = Carthian (Covenant) Status, keyed by full name.
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 3, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
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

// #522: mirror the set-based endpoint — accepts {allocations:[{target,sphere}]}
// (and legacy {target,sphere}); strip-then-apply over the set so the mocked
// PATCH returns a consistent char (Allies by area, Contacts spheres[]+marker).
function applyCarthian(char, body) {
  const c = JSON.parse(JSON.stringify(char));
  const raw = Array.isArray(body && body.allocations) ? body.allocations
            : ((body && body.target) ? [{ target: body.target, sphere: body.sphere }] : []);
  const allocs = raw.filter(a => a && a.target).map(a => ({ target: a.target, sphere: ((a.sphere) || '').trim() }));
  c.merits = (c.merits || [])
    .filter(m => m.granted_by !== 'Carthian Pull')
    .map(m => {
      const pushed = (Array.isArray(m.carthian_spheres) && m.carthian_spheres.length) || m.carthian_sphere;
      if (!m.free_carthian && !pushed) return m;
      const r = { ...m }; delete r.free_carthian;
      let popped = [];
      if (Array.isArray(r.carthian_spheres)) { popped = popped.concat(r.carthian_spheres); delete r.carthian_spheres; }
      if (r.carthian_sphere) { popped.push(r.carthian_sphere); delete r.carthian_sphere; }
      if (popped.length && Array.isArray(r.spheres)) r.spheres = r.spheres.filter(s => popped.indexOf(s) < 0);
      r.rating = (r.name === 'Contacts' && Array.isArray(r.spheres)) ? r.spheres.length : ((r.cp || 0) + (r.xp || 0) + (r.free || 0));
      return r;
    });
  const alliesAdds = {}, contactsAdds = []; let havenAdds = 0, herdAdds = 0;
  for (const a of allocs) {
    if (a.target === 'allies') alliesAdds[a.sphere] = (alliesAdds[a.sphere] || 0) + 1;
    else if (a.target === 'contacts') contactsAdds.push(a.sphere);
    else if (a.target === 'haven') havenAdds++;
    else if (a.target === 'herd') herdAdds++;
  }
  Object.keys(alliesAdds).forEach(area => {
    const cnt = alliesAdds[area];
    const ex = c.merits.find(m => m.category === 'influence' && m.name === 'Allies' && (m.area || '') === area);
    if (ex) { ex.free_carthian = (ex.free_carthian || 0) + cnt; ex.rating = (ex.rating || 0) + cnt; }
    else c.merits.push({ category: 'influence', name: 'Allies', area, granted_by: 'Carthian Pull', free_carthian: cnt, rating: cnt });
  });
  if (contactsAdds.length) {
    const ex = c.merits.find(m => m.category === 'influence' && m.name === 'Contacts');
    if (ex) { const base = Array.isArray(ex.spheres) ? ex.spheres : []; ex.spheres = base.concat(contactsAdds); ex.free_carthian = (ex.free_carthian || 0) + contactsAdds.length; ex.carthian_spheres = (Array.isArray(ex.carthian_spheres) ? ex.carthian_spheres : []).concat(contactsAdds); ex.rating = ex.spheres.length; }
    else c.merits.push({ category: 'influence', name: 'Contacts', spheres: contactsAdds.slice(), carthian_spheres: contactsAdds.slice(), granted_by: 'Carthian Pull', free_carthian: contactsAdds.length, rating: contactsAdds.length });
  }
  [['Haven', havenAdds], ['Herd', herdAdds]].forEach(([nm, cnt]) => {
    if (!cnt) return;
    const ex = c.merits.find(m => m.category === 'domain' && m.name === nm);
    if (ex) { ex.free_carthian = (ex.free_carthian || 0) + cnt; ex.rating = (ex.rating || 0) + cnt; }
    else c.merits.push({ category: 'domain', name: nm, granted_by: 'Carthian Pull', free_carthian: cnt, rating: cnt });
  });
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
    // #522: body is now a set {allocations:[...]}.
    expect(req.postDataJSON().allocations).toContainEqual({ target: 'herd', sphere: '' });
  });

  test('write: Allies reveals a sphere dropdown and PATCHes with the chosen enum sphere', async ({ page }) => {
    await setup(page, { char: CHAR_WITH_CP });
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    await page.locator(`${SECTION} .qf-section-title`).click();

    // Selecting Allies reveals the sphere <select> (no write yet — needs a sphere).
    await page.selectOption(TARGET, 'allies');
    await expect(page.locator('select#dt-carthian_sphere')).toBeVisible({ timeout: 3000 });

    const hasAllies = (r) => {
      const a = r.postDataJSON().allocations;
      return Array.isArray(a) && a.some(x => x.target === 'allies');
    };
    const [req] = await Promise.all([
      page.waitForRequest(r => r.method() === 'PATCH' && /carthian_pull/.test(r.url()) && hasAllies(r), { timeout: 6000 }),
      page.selectOption('#dt-carthian_sphere', 'Street'),
    ]);
    // #522: body is now a set {allocations:[...]}.
    expect(req.postDataJSON().allocations).toContainEqual({ target: 'allies', sphere: 'Street' });
  });

  test('AC#8 (#522): removing an applied dot clears it (PATCH empty allocation set)', async ({ page }) => {
    // Start from a char that already holds a Carthian Pull Herd bonus.
    const seeded = applyCarthian(CHAR_WITH_CP, { allocations: [{ target: 'herd' }] });
    await setup(page, { char: seeded });
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    await page.locator(`${SECTION} .qf-section-title`).click();
    // The persisted dot shows as a removable chip (multi-row UI replaces the
    // single "select None to clear" control).
    await expect(page.locator(`${SECTION} .qf-carthian-chip`)).toContainText('Herd');

    const [req] = await Promise.all([
      page.waitForRequest(r => r.method() === 'PATCH' && /carthian_pull/.test(r.url()), { timeout: 6000 }),
      page.locator(`${SECTION} [data-carthian-remove]`).first().click(),
    ]);
    expect(req.postDataJSON().allocations).toEqual([]);
  });

});
