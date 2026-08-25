/**
 * Player DT form — Carthian Pull multi-dot allocation (#522)
 *
 * Carthian Pull now grants a POOL of dots equal to the character's Carthian
 * (Covenant) Status, allocatable across Allies/Contacts/Haven/Herd. This spec
 * covers the multi-row DT-form UI: the "X of N" pool counter, allocating
 * multiple dots, and the applied-dot chips. The set-based server contract is
 * covered by server/tests/api-characters-carthian-pull.test.js.
 *
 * Harness mirrors issue-508/510; the mock applies the set to a live char copy.
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  // 2026-08-25 (D6): actor player->st - this form is retired for players (see
  // public/js/downtime/form-retirement.js); ST still sees it unchanged.
  avatar: null, role: 'st', player_id: 'p-522',
  character_ids: ['char-522'], is_dual_role: false,
};
const ACTIVE_CYCLE = {
  _id: 'cycle-522', cycle_number: 7, status: 'open',
  deadline: new Date(Date.now() + 86400000 * 7).toISOString(), confirmed_ambience: {}, narrative_notes: '',
};
const CHAR_BASE = {
  _id: 'char-522', name: 'Pull Pool', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Carthian Movement', player: 'Test Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null, regent_territory: null, retired: false,
  // Carthian Status 3 → a 3-dot pool.
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 3, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [{ category: 'general', name: 'Carthian Pull', cp: 1, rating: 1 }], powers: [], ordeals: [],
};

// Mirror the set-based endpoint (strip-then-apply over {allocations:[...]}).
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
    if (/\/api\/characters\/char-522(\?|$)/.test(url))  return ok(live);
    if (url.includes('/api/characters'))          return ok([live]);
    if (url.includes('/api/attendance'))          return ok({ attended: false });
    if (url.includes('/api/chapters'))     return ok([ACTIVE_CYCLE]);
    if (url.includes('/api/downtime_submissions')) { if (method === 'POST' || method === 'PUT') return ok({ _id: 'sub-522', responses: {} }); return ok([]); }
    if (url.includes('/api/territories'))         return ok([]);
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') return ok({ ok: true, _id: 'sub-522' });
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

test.describe('Player DT form — Carthian Pull multi-dot (#522)', () => {

  test('the pool counter reflects Carthian Status and allocating fills it', async ({ page }) => {
    await setup(page, CHAR_BASE);
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    await page.locator(`${SECTION} .qf-section-title`).click();

    // Pool counter starts at 0 of 3.
    await expect(page.locator(`${SECTION} .qf-carthian-pool`)).toContainText('0 of 3');

    // Allocate dot 1 → Herd.
    await page.selectOption('#dt-carthian_target', 'herd');
    await expect(page.locator(`${SECTION} .qf-carthian-pool`)).toContainText('1 of 3');
    await expect(page.locator(`${SECTION} .qf-carthian-chip`)).toHaveCount(1);
    await expect(page.locator(`${SECTION} .qf-carthian-chip`).first()).toContainText('Herd');
  });

  test('allocating a second dot accumulates the set in the PATCH', async ({ page }) => {
    await setup(page, CHAR_BASE);
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    await page.locator(`${SECTION} .qf-section-title`).click();

    // Dot 1 → Herd.
    await page.selectOption('#dt-carthian_target', 'herd');
    await expect(page.locator(`${SECTION} .qf-carthian-pool`)).toContainText('1 of 3');

    // Dot 2 → Haven, via the fresh "new dot" row. The PATCH carries BOTH.
    const [req] = await Promise.all([
      page.waitForRequest(r => r.method() === 'PATCH' && /carthian_pull/.test(r.url())
        && (r.postDataJSON().allocations || []).some(a => a.target === 'haven'), { timeout: 6000 }),
      page.selectOption('#dt-carthian_target', 'haven'),
    ]);
    const allocs = req.postDataJSON().allocations;
    expect(allocs).toContainEqual({ target: 'herd', sphere: '' });
    expect(allocs).toContainEqual({ target: 'haven', sphere: '' });
    await expect(page.locator(`${SECTION} .qf-carthian-pool`)).toContainText('2 of 3');
    await expect(page.locator(`${SECTION} .qf-carthian-chip`)).toHaveCount(2);
  });

});
