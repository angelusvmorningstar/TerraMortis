/**
 * fix.718 — Sorcery: rites unknown to rules DB should auto-fallback to Custom in processing
 *
 * Acceptance criteria:
 *   1. Rite not in rules DB → RITE dropdown pre-selects __custom__
 *   2. Rite not in rules DB (≤60 chars) → "Player: <name>" label visible
 *   3. Rite not in rules DB → Level input (proc-rite-custom-level-input) visible
 *   4. Rite IS in rules DB → dropdown pre-selects the rite by name (not __custom__)
 *   5. rev.rite_override already === '__custom__' → dropdown still shows __custom__
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const CHAR_SORC = {
  _id: 'char-sorc', name: 'Brandy LaRoux', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 1, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Occult: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: { Cruac: { dots: 3 } },
  merits: [],
  powers: [
    { category: 'rite', name: 'Mantle of Amorous Fire', tradition: 'Cruac', rating: 2 },
    { category: 'rite', name: 'Blood Blight', tradition: 'Cruac', rating: 2 },
  ],
  ordeals: [],
};

const TEST_CYCLE = {
  _id: 'cycle-001', cycle_number: 4, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

// A rite that IS in the rules DB
const RULES_DB_KNOWN_RITE = {
  category: 'rite', parent: 'Cruac', name: 'Blood Blight', rank: 2,
  description: 'Inflicts a supernatural disease.',
};

// Build a sorcery submission with a given rite name and optional review override
const mkSorcSub = (riteName, reviewOverrides = {}) => ({
  _id: 'sub-sorc-718',
  cycle_id: 'cycle-001',
  character_name: 'Brandy LaRoux',
  character_id: 'char-sorc',
  player_name: 'Test Player',
  submitted_at: '2026-06-14T00:00:00Z',
  _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
  responses: {
    sorcery_slot_count: '1',
    sorcery_1_rite: riteName,
    sorcery_1_targets: '',
    sorcery_1_notes: '',
    sorcery_1_pool_expr: 'Intelligence 3 + Occult 3 = 6',
  },
  projects_resolved: [],
  feeding_review: null,
  merit_actions_resolved: [],
  sorcery_review: {
    1: { pool_status: 'pending', ...reviewOverrides },
  },
  st_review: { territory_overrides: {} },
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function setupSorcery(page, submissions, rulesDb = []) {
  await page.addInitScript(({ user, db }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
    if (db.length) localStorage.setItem('tm_rules_db', JSON.stringify(db));
  }, { user: ST_USER, db: rulesDb });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
    if (url.includes('/api/downtime_submissions'))  return ok(submissions);
    if (url.includes('/api/downtime_cycles'))       return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))      return ok([CHAR_SORC].map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))            return ok([CHAR_SORC]);
    if (url.includes('/api/territories'))           return ok([]);
    if (url.includes('/api/game_sessions'))         return ok([]);
    if (url.includes('/api/session_logs'))          return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openSorceryAction(page) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="resolve_first"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('fix.718 — sorcery RITE dropdown auto-fallback to custom', () => {

  test('AC1: rite not in rules DB → dropdown pre-selects __custom__', async ({ page }) => {
    // Rules DB has Blood Blight but NOT Mantle of Amorous Fire
    const sub = mkSorcSub('Mantle of Amorous Fire');
    await setupSorcery(page, [sub], [RULES_DB_KNOWN_RITE]);
    await openSorceryAction(page);

    const select = page.locator('.proc-rite-select');
    await expect(select).toHaveValue('__custom__');
  });

  test('AC2: rite not in rules DB (≤60 chars) → "Player:" label shows original name', async ({ page }) => {
    const sub = mkSorcSub('Mantle of Amorous Fire'); // 22 chars — short rite
    await setupSorcery(page, [sub], [RULES_DB_KNOWN_RITE]);
    await openSorceryAction(page);

    const label = page.locator('.proc-recat-original');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Mantle of Amorous Fire');
  });

  test('AC3: rite not in rules DB → Level input visible', async ({ page }) => {
    const sub = mkSorcSub('Mantle of Amorous Fire');
    await setupSorcery(page, [sub], [RULES_DB_KNOWN_RITE]);
    await openSorceryAction(page);

    await expect(page.locator('.proc-rite-custom-level-input')).toBeVisible();
  });

  test('AC4: rite IS in rules DB → dropdown pre-selects the rite by name', async ({ page }) => {
    const sub = mkSorcSub('Blood Blight'); // IS in RULES_DB_KNOWN_RITE
    await setupSorcery(page, [sub], [RULES_DB_KNOWN_RITE]);
    await openSorceryAction(page);

    const select = page.locator('.proc-rite-select');
    await expect(select).toHaveValue('Blood Blight');
    // Level input must NOT be visible for a known rite
    await expect(page.locator('.proc-rite-custom-level-input')).not.toBeVisible();
  });

  test('AC5: rev.rite_override already === __custom__ → dropdown still shows __custom__', async ({ page }) => {
    const sub = mkSorcSub('Mantle of Amorous Fire', { rite_override: '__custom__', rite_custom_level: 2 });
    await setupSorcery(page, [sub], [RULES_DB_KNOWN_RITE]);
    await openSorceryAction(page);

    const select = page.locator('.proc-rite-select');
    await expect(select).toHaveValue('__custom__');
    // Level input pre-filled with saved level
    const levelInput = page.locator('.proc-rite-custom-level-input');
    await expect(levelInput).toBeVisible();
    await expect(levelInput).toHaveValue('2');
  });

});
