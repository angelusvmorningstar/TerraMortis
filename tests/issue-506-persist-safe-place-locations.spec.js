/**
 * Player DT form — persist Safe Place / Haven locations on the character (#506)
 *
 * Builds on #504. Locations now live on the character (merits[].location) so they
 * carry across downtime cycles. This spec covers the new client behaviour:
 *   - AC#1: a fresh cycle (no submission) pre-fills each input from sp.location
 *   - AC#1 precedence: an in-progress submission edit wins over sp.location
 *   - AC#2: editing a location and submitting issues a PATCH to
 *           /api/characters/:id/safe_place_locations carrying the typed value
 *   - AC#6 regression: the (Haven) marker is unaffected
 *
 * Server-side persistence (the endpoint itself) is covered by
 * server/tests/api-characters-safe-place-locations.test.js.
 *
 * Harness mirrors issue-504-safe-place-locations.spec.js; the submit-drive
 * technique (set a feeding-territory hidden input, then click submit) mirrors
 * dt-form-34-submit-delegation.spec.js.
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  // 2026-08-25 (D6): actor player->st - this form is retired for players (see
  // public/js/downtime/form-retirement.js); ST still sees it unchanged.
  avatar: null, role: 'st', player_id: 'p-506',
  character_ids: ['char-506'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-506', cycle_number: 4, status: 'open',
  deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
  confirmed_ambience: {}, narrative_notes: '',
};

const CHAR_BASE = {
  _id: 'char-506', name: 'Loci Test', moniker: null, honorific: null,
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

// Two Safe Places with stored locations + a Haven on the first.
const CHAR_SP_STORED = {
  ...CHAR_BASE,
  merits: [
    { category: 'domain', name: 'Safe Place', rating: 1, qualifier: 'Harbour Warehouse', location: '12 Dock St, Harbourside' },
    { category: 'domain', name: 'Safe Place', rating: 1, qualifier: 'Northshore Flat', location: '7 River Lane, Northshore' },
    { category: 'domain', name: 'Haven', rating: 1, attached_to: 'Safe Place (Harbour Warehouse)' },
  ],
};

// Two Safe Places, no stored locations (for the submit write-through test).
const CHAR_SP_NO_LOC = {
  ...CHAR_BASE,
  merits: [
    { category: 'domain', name: 'Safe Place', rating: 1, qualifier: 'Harbour Warehouse' },
    { category: 'domain', name: 'Safe Place', rating: 1, qualifier: 'Northshore Flat' },
    { category: 'domain', name: 'Haven', rating: 1, attached_to: 'Safe Place (Harbour Warehouse)' },
  ],
};

async function setup(page, { char = CHAR_SP_STORED, cycle = ACTIVE_CYCLE, submission = null, attended = false } = {}) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: PLAYER_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/api/auth/me'))             return ok(PLAYER_USER);
    if (url.includes('/api/characters/names'))    return ok([{ _id: char._id, name: char.name, moniker: char.moniker, honorific: char.honorific }]);
    // #506 write-through endpoint — echo the char back (server applies the locations).
    if (method === 'PATCH' && /\/api\/characters\/[^/]+\/safe_place_locations/.test(url)) return ok(char);
    // Single fresh-fetch returns the object; the bare list returns an array.
    if (/\/api\/characters\/char-506(\?|$)/.test(url))  return ok(char);
    if (url.includes('/api/characters'))          return ok([char]);
    if (url.includes('/api/attendance'))          return ok({ attended });
    if (url.includes('/api/chapters'))     return ok(cycle ? [cycle] : []);
    if (url.includes('/api/downtime_submissions')) {
      if (method === 'POST' || method === 'PUT') return ok({ _id: 'sub-506', chapter_id: cycle ? cycle._id : null, character_id: char._id, status: 'submitted', responses: {} });
      return ok(submission ? [submission] : []);
    }
    if (url.includes('/api/territories'))         return ok([]);
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') return ok({ ok: true, _id: 'sub-506' });
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

const SECTION = '[data-section-key="safe_place_locations"]';
const INPUTS = '[data-section-key="safe_place_locations"] [data-safe-place-location]';

test.describe('Player DT form — persist Safe Place locations (#506)', () => {

  test('AC#1: a fresh cycle pre-fills inputs from the stored character location', async ({ page }) => {
    // No submission for this cycle — values must come from merits[].location.
    await setup(page, { char: CHAR_SP_STORED, submission: null });
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    await expect(page.locator(INPUTS)).toHaveCount(2);
    await expect(page.locator('#dt-safe_place_location_0')).toHaveValue('12 Dock St, Harbourside');
    await expect(page.locator('#dt-safe_place_location_1')).toHaveValue('7 River Lane, Northshore');
  });

  test('AC#1 precedence: an in-progress submission edit overrides the stored location', async ({ page }) => {
    // Submission has a value for slot 0 only; slot 1 falls back to sp.location.
    const submission = {
      _id: 'sub-506-existing', chapter_id: ACTIVE_CYCLE._id,
      character_id: CHAR_SP_STORED._id, character_name: CHAR_SP_STORED.name,
      player_name: 'Test Player', status: 'draft',
      responses: { safe_place_location_0: 'EDITED THIS CYCLE' },
      _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
      st_review: {},
    };
    await setup(page, { char: CHAR_SP_STORED, submission });
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    // slot 0: in-progress edit wins over stored '12 Dock St…'
    await expect(page.locator('#dt-safe_place_location_0')).toHaveValue('EDITED THIS CYCLE');
    // slot 1: no submission value → stored location
    await expect(page.locator('#dt-safe_place_location_1')).toHaveValue('7 River Lane, Northshore');
  });

  test('AC#6 regression: the (Haven) marker is still applied to the hosting safe place', async ({ page }) => {
    await setup(page, { char: CHAR_SP_STORED });
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    const havenLabel = page.locator(`${SECTION} label`, { hasText: 'Harbour Warehouse' });
    await expect(havenLabel).toContainText('(Haven)');
  });

  test('AC#2: editing a location and submitting PATCHes the character endpoint', async ({ page }) => {
    // Capture every PATCH to the new safe_place_locations endpoint.
    const patches = [];
    page.on('request', req => {
      if (req.method() === 'PATCH' && /\/api\/characters\/[^/]+\/safe_place_locations/.test(req.url())) {
        patches.push({ url: req.url(), body: req.postDataJSON() });
      }
    });

    await setup(page, { char: CHAR_SP_NO_LOC, attended: false });
    await openDtTab(page);
    await expect(page.locator('#dt-safe_place_location_0')).toBeAttached({ timeout: 8000 });

    // Expand the collapsed section and type a location.
    await page.locator(`${SECTION} .qf-section-title`).click();
    await expect(page.locator('#dt-safe_place_location_0')).toBeVisible({ timeout: 3000 });
    await page.fill('#dt-safe_place_location_0', '99 Quay Street, Docklands');

    // Satisfy the only required field in MINIMAL mode (feeding territory) by
    // setting the first feed-val hidden input — same technique as dt-form.34.
    const feedSet = await page.evaluate(() => {
      const el = document.querySelector('[id^="feed-val-"]');
      if (!el) return false;
      el.value = 'poaching';
      return true;
    });
    expect(feedSet, 'a feed-val territory input exists to satisfy validation').toBe(true);

    // Submit and wait for the write-through PATCH.
    const [req] = await Promise.all([
      page.waitForRequest(
        r => r.method() === 'PATCH' && /\/api\/characters\/char-506\/safe_place_locations/.test(r.url()),
        { timeout: 6000 },
      ),
      page.locator('#dt-btn-submit').click(),
    ]);

    expect(req).toBeTruthy();
    const body = req.postDataJSON();
    expect(Array.isArray(body.locations)).toBe(true);
    expect(body.locations[0]).toBe('99 Quay Street, Docklands');
  });

});
