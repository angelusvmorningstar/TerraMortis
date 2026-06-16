/**
 * Regression tests for fix #733 — DT Processing Feeding Intelligence shows
 * raw MongoDB ObjectID instead of territory name.
 *
 * Root cause: `_renderSnapshotFeedingPanel()` resolved territory keys via
 * `terrList.find(t => t.slug === slug)`, but DT4+ submissions store ObjectID
 * strings as keys in `feeding_territories`. Added `resolveTerrId(slug) || slug`
 * before the lookup in both the rote-feed and regular-feed branches.
 *
 * AC-1: Regular feed — territory name shown (not ObjectID)
 * AC-2: Regular feed — Rights/Poaching/Resident badge renders alongside name
 * AC-3: Rote feed (rote project slot) — territory name shown (not ObjectID)
 * AC-4: Legacy slug key — still resolves correctly (no regression)
 * AC-5: Multiple territories — all names shown
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000733', username: 'test_st_733', global_name: 'Test ST 733',
  avatar: null, role: 'st', player_id: 'p-733', character_ids: [], is_dual_role: false,
};

// Territory with a realistic ObjectID-style _id.
const TERR_ACADEMY = {
  _id: '69d9e54c00815d471503bea9',
  slug: 'the_academy',
  name: 'The Academy',
  ambience: 'Scholarly',
  regent_id: null,
};

const TERR_HARBOUR = {
  _id: '69d9e54c00815d471503bea8',
  slug: 'harbour',
  name: 'The Harbour',
  ambience: '',
  regent_id: null,
};

const ALL_TERRS = [TERR_ACADEMY, TERR_HARBOUR];

function mkChar(id, name) {
  return {
    _id: id, name, moniker: null, honorific: null,
    clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
    blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
    status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
    attributes: {
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: { Persuasion: { dots: 3, bonus: 0, specs: [], nine_again: false } },
    disciplines: { Majesty: { dots: 2 } },
    merits: [], powers: [], ordeals: [],
  };
}

const CHAR_TEGAN  = mkChar('char-733-tegan',  'Tegan Groves');
const CHAR_ALEKSEI = mkChar('char-733-aleksei', 'Aleksei Romanov');
const ALL_CHARS = [CHAR_TEGAN, CHAR_ALEKSEI];

const TEST_CYCLE = {
  _id: 'cycle-733', cycle_number: 4, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

// Regular feed — key is ObjectID string, status is feeding_rights.
const SUB_REGULAR_FEED = {
  _id: 'sub-733-regular',
  cycle_id: 'cycle-733',
  character_name: 'Aleksei Romanov',
  character_id: 'char-733-aleksei',
  player_name: 'Test Player',
  submitted_at: '2026-06-15T00:00:00Z',
  _raw: {
    feeding: { method: 'seduction', description: 'Seduction' },
    projects: [],
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    feeding_method: 'seduction',
    feeding_description: 'Seduction',
    // ObjectID key — the bug scenario
    feeding_territories: JSON.stringify({ '69d9e54c00815d471503bea9': 'feeding_rights' }),
  },
  projects_resolved: [],
  feeding_review: { pool_status: 'not_set' },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// Rote feed — project action_type = 'rote'; territory also keyed by ObjectID.
// feeding entry uses poaching status for AC-2 variation.
const SUB_ROTE_FEED = {
  _id: 'sub-733-rote',
  cycle_id: 'cycle-733',
  character_name: 'Tegan Groves',
  character_id: 'char-733-tegan',
  player_name: 'Test Player',
  submitted_at: '2026-06-15T00:00:00Z',
  _raw: {
    feeding: { method: 'seduction', description: 'Rote Seduction' },
    projects: [
      {
        action_type: 'rote',
        desired_outcome: 'Rote feed',
        detail: 'Rote seduction feeding.',
        primary_pool: { expression: 'Presence 3 + Persuasion 3 = 6' },
      },
    ],
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    feeding_method: 'seduction',
    feeding_description: 'Rote Seduction',
    // ObjectID key — the bug scenario
    feeding_territories: JSON.stringify({ '69d9e54c00815d471503bea9': 'poaching' }),
    project_1_action: 'rote',
    project_1_description: 'Rote seduction feeding.',
    project_1_pool_expr: 'Presence 3 + Persuasion 3 = 6',
  },
  projects_resolved: [
    { pool_status: 'not_set' },
  ],
  feeding_review: { pool_status: 'not_set' },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// Legacy slug key — should still resolve (no regression).
const SUB_SLUG_KEY = {
  _id: 'sub-733-slug',
  cycle_id: 'cycle-733',
  character_name: 'Aleksei Romanov',
  character_id: 'char-733-aleksei',
  player_name: 'Test Player',
  submitted_at: '2026-06-15T00:00:00Z',
  _raw: {
    feeding: { method: 'seduction', description: 'Seduction' },
    projects: [],
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    feeding_method: 'seduction',
    feeding_description: 'Seduction',
    // Slug key — legacy format
    feeding_territories: JSON.stringify({ the_academy: 'feeding_rights' }),
  },
  projects_resolved: [],
  feeding_review: { pool_status: 'not_set' },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// Multiple territory keys — both ObjectIDs.
const SUB_MULTI_TERR = {
  _id: 'sub-733-multi',
  cycle_id: 'cycle-733',
  character_name: 'Aleksei Romanov',
  character_id: 'char-733-aleksei',
  player_name: 'Test Player',
  submitted_at: '2026-06-15T00:00:00Z',
  _raw: {
    feeding: { method: 'seduction', description: 'Seduction' },
    projects: [],
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    feeding_method: 'seduction',
    feeding_description: 'Seduction',
    feeding_territories: JSON.stringify({
      '69d9e54c00815d471503bea9': 'feeding_rights',
      '69d9e54c00815d471503bea8': 'poaching',
    }),
  },
  projects_resolved: [],
  feeding_review: { pool_status: 'not_set' },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setup(page, submissions) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (['PUT', 'PATCH', 'POST'].includes(method)) return ok({ ok: true });
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/downtime_cycles'))      return ok([TEST_CYCLE]);
    if (url.includes('/api/territories'))          return ok(ALL_TERRS);
    if (url.includes('/api/characters/names'))     return ok(ALL_CHARS.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))           return ok(ALL_CHARS);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openFeedingCard(page, charName) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  const row = page.locator('.proc-action-row', { hasText: charName }).first();
  await row.click();
  await page.waitForSelector('.proc-snapshot-panel', { timeout: 8000 });
}

const feedingPanel = page => page.locator('.proc-snapshot-panel').first();

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.733: feeding territory ObjectID resolved to name in snapshot panel', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────

  test('AC-1: regular feed — territory name shown instead of ObjectID', async ({ page }) => {
    await setup(page, [SUB_REGULAR_FEED]);
    await openFeedingCard(page, 'Aleksei Romanov');

    const panel = feedingPanel(page);
    // Territory name must appear.
    await expect(panel).toContainText('The Academy');
    // Raw ObjectID must not appear.
    await expect(panel).not.toContainText('69d9e54c00815d471503bea9');
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────

  test('AC-2: regular feed — Rights badge renders alongside territory name', async ({ page }) => {
    await setup(page, [SUB_REGULAR_FEED]);
    await openFeedingCard(page, 'Aleksei Romanov');

    const panel = feedingPanel(page);
    await expect(panel).toContainText('The Academy');
    await expect(panel.locator('.proc-snap-terr-status')).toContainText('Rights');
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────

  test('AC-3: rote feed — territory name shown instead of ObjectID', async ({ page }) => {
    await setup(page, [SUB_ROTE_FEED]);
    // The feeding card (not the rote project card) shows the feeding snapshot.
    await openFeedingCard(page, 'Tegan Groves');

    const panel = feedingPanel(page);
    await expect(panel).toContainText('The Academy');
    await expect(panel).not.toContainText('69d9e54c00815d471503bea9');
    // Poaching badge
    await expect(panel.locator('.proc-snap-terr-status')).toContainText('Poaching');
  });

  // AC-4 ──────────────────────────────────────────────────────────────────────

  test('AC-4: legacy slug key — still resolves to territory name (no regression)', async ({ page }) => {
    await setup(page, [SUB_SLUG_KEY]);
    await openFeedingCard(page, 'Aleksei Romanov');

    const panel = feedingPanel(page);
    await expect(panel).toContainText('The Academy');
    // Neither the slug nor the OID should appear raw.
    await expect(panel).not.toContainText('69d9e54c00815d471503bea9');
  });

  // AC-5 ──────────────────────────────────────────────────────────────────────

  test('AC-5: multiple territory ObjectID keys — all resolved to names', async ({ page }) => {
    await setup(page, [SUB_MULTI_TERR]);
    await openFeedingCard(page, 'Aleksei Romanov');

    const panel = feedingPanel(page);
    await expect(panel).toContainText('The Academy');
    await expect(panel).toContainText('The Harbour');
    await expect(panel).not.toContainText('69d9e54c00815d471503bea9');
    await expect(panel).not.toContainText('69d9e54c00815d471503bea8');
  });

});
