/**
 * Flight-check regression: the player-facing downtime-retired notice
 * (public/js/downtime/form-retirement.js, public/js/tabs/downtime-tab.js).
 *
 * downtime-player-smoke.spec.js deliberately runs as an ST actor (moved
 * player->st 2026-08-25 per D6, see its own PLAYER_USER comment) so it can
 * keep exercising the real form now that it's retired for players. That
 * left the actual player-facing retired-notice path with zero coverage —
 * found during a 2026-08-27 flight-check ahead of full player release.
 *
 * Covers the 2026-08-27 copy pass (named destination, real CTA link,
 * smaller footnote) rather than the placeholder text it replaced.
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654322', username: 'test_player_retirednotice', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-retired-notice',
  character_ids: ['char-retired-notice'], is_dual_role: false,
};

const CHAR = {
  _id: 'char-retired-notice', name: 'Notice Test', moniker: null, honorific: null,
  clan: 'Gangrel', covenant: 'Unbound', player: 'Test Player',
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

async function setup(page) {
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
    if (url.includes('/api/auth/me'))            return ok(PLAYER_USER);
    if (url.includes('/api/chapters'))            return ok([]);
    if (url.includes('/api/downtime_submissions')) return ok([]);
    if (url.includes('/api/characters/names'))    return ok([{ _id: CHAR._id, name: CHAR.name, moniker: CHAR.moniker, honorific: CHAR.honorific }]);
    if (url.includes('/api/characters'))          return ok([CHAR]);
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
  await page.waitForTimeout(600);
}

test.describe('Downtime form retirement — player-facing notice', () => {

  test('a real (non-ST) player sees the retired notice, not the form', async ({ page }) => {
    await setup(page);
    await openDtTab(page);
    await expect(page.locator('.dt-retired-notice')).toBeVisible();
    // The real form must NOT render for a retired-form player.
    await expect(page.locator('#dt-feeding_description')).toHaveCount(0);
  });

  test('notice names the actual destination, not vague "sibling site" copy', async ({ page }) => {
    await setup(page);
    await openDtTab(page);
    const notice = page.locator('.dt-retired-notice');
    await expect(notice).toContainText('TM Story');
    await expect(notice).not.toContainText('sibling site');
  });

  test('notice has a real, correctly-targeted CTA link to TM Story', async ({ page }) => {
    await setup(page);
    await openDtTab(page);
    const cta = page.locator('.dt-retired-notice a.dt-mobile-show-anyway');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', 'https://terramortisstory.netlify.app/');
    await expect(cta).toHaveAttribute('target', '_blank');
    await expect(cta).toHaveAttribute('rel', 'noopener');
  });

  test('footnote about pre-cutover submissions is present but visually secondary', async ({ page }) => {
    await setup(page);
    await openDtTab(page);
    const footnote = page.locator('.dt-retired-notice-footnote');
    await expect(footnote).toBeVisible();
    await expect(footnote).toContainText('Storyteller directly');
  });

});
