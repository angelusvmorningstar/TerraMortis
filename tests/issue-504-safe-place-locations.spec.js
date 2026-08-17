/**
 * Player DT form — Safe Places and Havens location section (issue #504)
 *
 * A new ungated section, rendered after Court, asks for the street + suburb
 * of each Safe Place the character holds. A Haven is built on a Safe Place
 * (Haven.attached_to === domKey(safePlace)), so it is not a separate input —
 * the hosting safe place is marked "(Haven)". Zero safe places omits the
 * section entirely.
 *
 * Harness mirrors downtime-player-smoke.spec.js: auth via localStorage init
 * script, all API calls mocked through page.route, DT tab opened via the
 * global goTab('downtime').
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-504',
  character_ids: ['char-504'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-504', cycle_number: 3, status: 'open',
  deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
  confirmed_ambience: {}, narrative_notes: '',
};

const CHAR_BASE = {
  _id: 'char-504', name: 'Loci Test', moniker: null, honorific: null,
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

// Two Safe Places (distinct qualifiers); a Haven built on the first.
const CHAR_TWO_SP_HAVEN = {
  ...CHAR_BASE,
  merits: [
    { category: 'domain', name: 'Safe Place', rating: 1, qualifier: 'Harbour Warehouse' },
    { category: 'domain', name: 'Safe Place', rating: 1, qualifier: 'Northshore Flat' },
    { category: 'domain', name: 'Haven', rating: 1, attached_to: 'Safe Place (Harbour Warehouse)' },
  ],
};

// No domain merits at all.
const CHAR_NO_SP = { ...CHAR_BASE, merits: [] };

async function setup(page, { char = CHAR_TWO_SP_HAVEN, cycle = ACTIVE_CYCLE, submission = null, attended = false } = {}) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: PLAYER_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') return ok({ ok: true, _id: 'sub-504' });
    if (url.includes('/api/auth/me'))             return ok(PLAYER_USER);
    if (url.includes('/api/attendance'))          return ok({ attended });
    if (url.includes('/api/chapters'))     return ok(cycle ? [cycle] : []);
    if (url.includes('/api/downtime_submissions')) return ok(submission ? [submission] : []);
    if (url.includes('/api/characters/names'))    return ok([{ _id: char._id, name: char.name, moniker: char.moniker, honorific: char.honorific }]);
    if (url.includes('/api/characters'))          return ok([char]);
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

const SECTION = '[data-section-key="safe_place_locations"]';
const INPUTS = '[data-section-key="safe_place_locations"] [data-safe-place-location]';

test.describe('Player DT form — Safe Places and Havens (#504)', () => {

  test('AC#2: one location input per Safe Place instance', async ({ page }) => {
    await setup(page, { char: CHAR_TWO_SP_HAVEN });
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    await expect(page.locator(INPUTS)).toHaveCount(2);
    await expect(page.locator(SECTION)).toContainText('Harbour Warehouse');
    await expect(page.locator(SECTION)).toContainText('Northshore Flat');
  });

  test('AC#3: the safe place hosting the haven is marked "(Haven)"', async ({ page }) => {
    await setup(page, { char: CHAR_TWO_SP_HAVEN });
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    // No extra input beyond the two safe places
    await expect(page.locator(INPUTS)).toHaveCount(2);
    // The (Haven) tag is present, attached to the Harbour Warehouse label
    const havenLabel = page.locator(`${SECTION} label`, { hasText: 'Harbour Warehouse' });
    await expect(havenLabel).toContainText('(Haven)');
    // The non-haven safe place label has no marker
    const plainLabel = page.locator(`${SECTION} label`, { hasText: 'Northshore Flat' });
    await expect(plainLabel).not.toContainText('(Haven)');
  });

  test('AC#4: zero safe places omits the section entirely', async ({ page }) => {
    await setup(page, { char: CHAR_NO_SP });
    await openDtTab(page);
    // Form rendered (personal story present) but the SP section is absent
    await expect(page.locator('[data-section-key="personal_story"]')).toBeAttached({ timeout: 8000 });
    await expect(page.locator(SECTION)).toHaveCount(0);
  });

  test('AC#1: section is ungated — present even when player did not attend', async ({ page }) => {
    await setup(page, { char: CHAR_TWO_SP_HAVEN, attended: false });
    await openDtTab(page);
    // Court is hidden by its attendance gate...
    await expect(page.locator('[data-section-key="court"].dt-gated-hidden')).toHaveCount(1, { timeout: 8000 });
    // ...but the safe-place section is rendered and NOT gated-hidden
    await expect(page.locator(SECTION)).toBeAttached();
    await expect(page.locator(`${SECTION}.dt-gated-hidden`)).toHaveCount(0);
  });

  test('AC#6: saved location values reload into the inputs', async ({ page }) => {
    const submission = {
      _id: 'sub-504-existing', chapter_id: ACTIVE_CYCLE._id,
      character_id: CHAR_TWO_SP_HAVEN._id, character_name: CHAR_TWO_SP_HAVEN.name,
      player_name: 'Test Player', status: 'draft',
      responses: {
        safe_place_location_0: '12 Dock Street, Harbourside',
        safe_place_location_1: '7 River Lane, Northshore',
      },
      _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
      st_review: {},
    };
    await setup(page, { char: CHAR_TWO_SP_HAVEN, submission });
    await openDtTab(page);
    await expect(page.locator(SECTION)).toBeAttached({ timeout: 8000 });
    await expect(page.locator('#dt-safe_place_location_0')).toHaveValue('12 Dock Street, Harbourside');
    await expect(page.locator('#dt-safe_place_location_1')).toHaveValue('7 River Lane, Northshore');
  });

  test('AC#6 (save): a typed location is captured in the autosave payload', async ({ page }) => {
    // Capture every submission write the form makes.
    const bodies = [];
    page.on('request', req => {
      const m = req.method();
      if ((m === 'POST' || m === 'PUT') && req.url().includes('/api/downtime_submissions')) {
        const d = req.postDataJSON();
        if (d) bodies.push(d);
      }
    });

    await setup(page, { char: CHAR_TWO_SP_HAVEN });
    await openDtTab(page);
    await expect(page.locator('#dt-safe_place_location_0')).toBeAttached({ timeout: 8000 });

    // The section renders collapsed; expand it before interacting.
    await page.locator(`${SECTION} .qf-section-title`).click();
    await expect(page.locator('#dt-safe_place_location_0')).toBeVisible({ timeout: 3000 });

    bodies.length = 0; // discard any boot-time autosave
    await page.fill('#dt-safe_place_location_0', '99 Quay Street, Docklands');
    // Autosave debounce is 2s (scheduleSave → saveDraft).
    await page.waitForTimeout(2600);

    const hit = bodies.reverse().find(b => b && b.responses && b.responses.safe_place_location_0 !== undefined);
    expect(hit, 'an autosave write captured the safe-place location field').toBeTruthy();
    expect(hit.responses.safe_place_location_0).toBe('99 Quay Street, Docklands');
  });

});
