/**
 * Player DT form — Carthian Pull write failure no longer snaps to Contacts (#512)
 *
 * When a Herd/Haven allocation write fails (e.g. the endpoint 404s in an
 * environment whose API lacks it), the dropdown previously fell back to a stale
 * `carthian_pull_target` left by an earlier deferred Contacts selection — so it
 * silently "reverted to Contacts". The fix: surface a toast and reflect the
 * character's actual state (None here), never the stale saved target.
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  // 2026-08-25 (D6): actor player->st - this form is retired for players (see
  // public/js/downtime/form-retirement.js); ST still sees it unchanged.
  id: '1', username: 't', global_name: 'T', avatar: null, role: 'st',
  player_id: 'p', character_ids: ['c1'], is_dual_role: false,
};
const CYCLE = { _id: 'cy', cycle_number: 1, status: 'open', deadline: new Date(Date.now() + 9e8).toISOString(), confirmed_ambience: {}, narrative_notes: '' };
const CHAR = {
  _id: 'c1', name: 'T', moniker: null, honorific: null, clan: 'Daeva', covenant: 'Carthian Movement', player: 'T',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null, regent_territory: null, retired: false,
  status: { city: 1, clan: 1, covenant: { Carthian: 1, Crone: 0, Invictus: 0, Lancea: 0, OD: 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, powers: [], ordeals: [],
  merits: [{ category: 'general', name: 'Carthian Pull', cp: 1, rating: 1 }, { category: 'influence', name: 'Contacts', spheres: ['Legal'], cp: 1, rating: 1 }],
};

async function setup(page) {
  await page.addInitScript(u => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36e5));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);
  const live = JSON.parse(JSON.stringify(CHAR));
  await page.route('http://localhost:3000/**', route => {
    const u = route.request().url(), m = route.request().method();
    const ok = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.includes('/api/auth/me')) return ok(PLAYER_USER);
    if (u.includes('/api/characters/names')) return ok([{ _id: 'c1', name: 'T' }]);
    // #512: simulate the endpoint being unavailable — every carthian write fails.
    if (m === 'PATCH' && /carthian_pull/.test(u)) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND' }) });
    if (/\/api\/characters\/c1(\?|$)/.test(u)) return ok(live);
    if (u.includes('/api/characters')) return ok([live]);
    if (u.includes('/api/attendance')) return ok({ attended: false });
    if (u.includes('/api/chapters')) return ok([CYCLE]);
    if (u.includes('/api/downtime_submissions')) { if (m === 'POST' || m === 'PUT') return ok({ _id: 's', responses: {} }); return ok([]); }
    if (u.includes('/api/territories')) return ok([]);
    if (m === 'POST' || m === 'PUT' || m === 'PATCH') return ok({ ok: true, _id: 's' });
    return ok([]);
  });
  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => typeof window.goTab === 'function', { timeout: 8000 });
  await page.evaluate(() => window.goTab('downtime'));
  await page.waitForTimeout(600);
}

test('a failed Herd write reverts the dropdown to None (not stale Contacts) and toasts', async ({ page }) => {
  await setup(page);
  const SEC = '[data-section-key="carthian_pull"]';
  await page.locator(`${SEC} .qf-section-title`).click();

  // Defer a Contacts selection — leaves carthian_pull_target='contacts' in the submission.
  await page.selectOption('#dt-carthian_target', 'contacts');
  await page.waitForTimeout(300);
  await expect(page.locator('#dt-carthian_target')).toHaveValue('contacts');

  // Now select Herd — the write 404s. It must NOT snap back to Contacts.
  await page.selectOption('#dt-carthian_target', 'herd');
  await page.waitForTimeout(800);

  await expect(page.locator('#dt-carthian_target')).toHaveValue(''); // None, not 'contacts'
  await expect(page.locator('#dt-toast')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#dt-toast')).toContainText('Carthian Pull');
});
