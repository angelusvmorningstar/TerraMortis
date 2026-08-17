/**
 * Feature #587 — admin button/input CSS token normalisation (QA top-up).
 *
 * #587 had no automated coverage (visual smoke only). These tests assert the
 * RENDERED result, theme-aware, by resolving the parchment tokens at runtime via
 * probe elements and comparing element computed styles:
 *   - the dark-on-dark button bases were lifted from --surf2 to --surf (so a button
 *     no longer matches the panel fill);
 *   - the targeting-group fill-in input uses the light --bg, not --surf2.
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: '123000587', username: 'test_st_587', global_name: 'Test ST 587',
  avatar: null, role: 'st', player_id: 'p-587', character_ids: [], is_dual_role: false,
};

const CHAR = {
  _id: 'char-587', name: 'Einar Test', moniker: null, honorific: null,
  clan: 'Gangrel', covenant: 'Invictus', player: 'P', blood_potency: 2,
  humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Investigation: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: { Auspex: { dots: 2 } }, merits: [], powers: [], ordeals: [],
};

const TEST_CYCLE = { _id: 'cycle-587', cycle_number: 3, status: 'active', confirmed_ambience: {}, narrative_notes: '' };
const TITLE = 'Hunting the Hunter';

function investigateSub() {
  return {
    _id: 'sub-587',
    chapter_id: 'cycle-587',
    character_name: 'Einar Test',
    character_id: 'char-587',
    player_name: 'P',
    submitted_at: '2026-06-05T00:00:00Z',
    _raw: {
      projects: [{ action_type: 'investigate', title: TITLE, desired_outcome: TITLE, detail: 'Scour.', primary_pool: { expression: 'Wits 3 + Investigation 3 = 6' } }],
      feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action: 'investigate',
      project_1_title: TITLE,
      project_1_description: 'Scour.',
      project_1_pool_expr: 'Wits 3 + Investigation 3 = 6',
    },
    projects_resolved: [], feeding_review: null, merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

async function setup(page) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
    if (url.includes('/api/downtime_submissions')) return ok([investigateSub()]);
    if (url.includes('/api/chapters'))      return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR._id, name: CHAR.name, moniker: CHAR.moniker, honorific: CHAR.honorific }]);
    if (url.includes('/api/characters'))           return ok([CHAR]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-action-row', { hasText: TITLE }).first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
}

// Resolve a CSS token to its computed rgb, and read element bgs — all in one pass.
async function probe(page) {
  return page.evaluate(() => {
    const resolve = (token) => {
      const el = document.createElement('div');
      el.style.backgroundColor = `var(${token})`;
      document.body.appendChild(el);
      const c = getComputedStyle(el).backgroundColor;
      el.remove();
      return c;
    };
    const detail = document.querySelector('.proc-action-detail');
    const btn = detail?.querySelector('.proc-rote-chip') || detail?.querySelector('.proc-roll-mode-btn');
    const input = detail?.querySelector('.proc-targeting-group .proc-conn-input');
    return {
      btnBg:   btn   ? getComputedStyle(btn).backgroundColor   : null,
      inputBg: input ? getComputedStyle(input).backgroundColor : null,
      surf:  resolve('--surf'),
      surf2: resolve('--surf2'),
      bg:    resolve('--bg'),
    };
  });
}

test.describe('Feature #587 — CSS token normalisation', () => {

  test('button base is lifted off the dark panel fill (--surf, not --surf2)', async ({ page }) => {
    await setup(page);
    const r = await probe(page);
    expect(r.btnBg).not.toBeNull();
    expect(r.btnBg).toBe(r.surf);       // raised onto --surf
    expect(r.btnBg).not.toBe(r.surf2);  // no longer the dark panel fill
  });

  test('targeting-group fill-in input uses the light --bg fill', async ({ page }) => {
    await setup(page);
    const r = await probe(page);
    expect(r.inputBg).not.toBeNull();
    expect(r.inputBg).toBe(r.bg);        // light/editable parchment
    expect(r.inputBg).not.toBe(r.surf2); // not the dark override
  });

});
