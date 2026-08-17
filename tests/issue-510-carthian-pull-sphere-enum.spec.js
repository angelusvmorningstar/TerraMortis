/**
 * Player DT form — Carthian Pull sphere is a fixed enum + match/augment (#510)
 *
 * Corrects #508: the sphere is now a <select> from INFLUENCE_SPHERES (not free
 * text), and Contacts excludes spheres the character already holds. The
 * match/augment-by-qualifier server behaviour is covered by
 * server/tests/api-characters-carthian-pull.test.js; this spec covers the
 * DT-form control.
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-510',
  character_ids: ['char-510'], is_dual_role: false,
};
const ACTIVE_CYCLE = {
  _id: 'cycle-510', cycle_number: 6, status: 'open',
  deadline: new Date(Date.now() + 86400000 * 7).toISOString(), confirmed_ambience: {}, narrative_notes: '',
};
const CHAR_BASE = {
  _id: 'char-510', name: 'Pull Sphere', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Carthian Movement', player: 'Test Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null, regent_territory: null, retired: false,
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

// #522: mirror the set-based endpoint — accepts {allocations:[{target,sphere}]}
// (and legacy {target,sphere}); strip-then-apply over the set.
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

async function setup(page, char) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: PLAYER_USER });
  let live = JSON.parse(JSON.stringify(char));
  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/api/auth/me'))             return ok(PLAYER_USER);
    if (url.includes('/api/characters/names'))    return ok([{ _id: live._id, name: live.name }]);
    if (method === 'PATCH' && /\/api\/characters\/[^/]+\/carthian_pull/.test(url)) { live = applyCarthian(live, route.request().postDataJSON()); return ok(live); }
    if (/\/api\/characters\/char-510(\?|$)/.test(url))  return ok(live);
    if (url.includes('/api/characters'))          return ok([live]);
    if (url.includes('/api/attendance'))          return ok({ attended: false });
    if (url.includes('/api/chapters'))     return ok([ACTIVE_CYCLE]);
    if (url.includes('/api/downtime_submissions')) { if (method === 'POST' || method === 'PUT') return ok({ _id: 'sub-510', responses: {} }); return ok([]); }
    if (url.includes('/api/territories'))         return ok([]);
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') return ok({ ok: true, _id: 'sub-510' });
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

test.describe('Player DT form — Carthian Pull sphere enum (#510)', () => {

  test('AC#1: the sphere control is a <select> from INFLUENCE_SPHERES (not free text)', async ({ page }) => {
    await setup(page, { ...CHAR_BASE, merits: [CP] });
    await openDtTab(page);
    await page.locator(`${SECTION} .qf-section-title`).click();
    await page.selectOption('#dt-carthian_target', 'allies');
    // It is a <select>, and there is no free-text input
    await expect(page.locator('select#dt-carthian_sphere')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('input#dt-carthian_sphere')).toHaveCount(0);
    // Canonical spheres are present as options
    await expect(page.locator('#dt-carthian_sphere option[value="Underworld"]')).toHaveCount(1);
    await expect(page.locator('#dt-carthian_sphere option[value="Legal"]')).toHaveCount(1);
  });

  test('AC#6: Contacts dropdown excludes a sphere the character already holds', async ({ page }) => {
    const char = { ...CHAR_BASE, merits: [CP, { category: 'influence', name: 'Contacts', spheres: ['Legal', 'Street'], cp: 2, rating: 2 }] };
    await setup(page, char);
    await openDtTab(page);
    await page.locator(`${SECTION} .qf-section-title`).click();
    await page.selectOption('#dt-carthian_target', 'contacts');
    await expect(page.locator('select#dt-carthian_sphere')).toBeVisible({ timeout: 3000 });
    // Held spheres are excluded; an unheld one is offered
    await expect(page.locator('#dt-carthian_sphere option[value="Legal"]')).toHaveCount(0);
    await expect(page.locator('#dt-carthian_sphere option[value="Street"]')).toHaveCount(0);
    await expect(page.locator('#dt-carthian_sphere option[value="Underworld"]')).toHaveCount(1);
  });

  test('AC#3: choosing a Contacts sphere PATCHes with the enum value', async ({ page }) => {
    const char = { ...CHAR_BASE, merits: [CP, { category: 'influence', name: 'Contacts', spheres: ['Legal'], cp: 1, rating: 1 }] };
    await setup(page, char);
    await openDtTab(page);
    await page.locator(`${SECTION} .qf-section-title`).click();
    await page.selectOption('#dt-carthian_target', 'contacts');
    await expect(page.locator('select#dt-carthian_sphere')).toBeVisible({ timeout: 3000 });

    // #522: the request body is now a set — {allocations:[{target,sphere},...]}.
    const hasContacts = (r) => {
      const a = r.postDataJSON().allocations;
      return Array.isArray(a) && a.some(x => x.target === 'contacts');
    };
    const [req] = await Promise.all([
      page.waitForRequest(r => r.method() === 'PATCH' && /carthian_pull/.test(r.url()) && hasContacts(r), { timeout: 6000 }),
      page.selectOption('#dt-carthian_sphere', 'Underworld'),
    ]);
    expect(req.postDataJSON().allocations).toContainEqual({ target: 'contacts', sphere: 'Underworld' });
  });

});
