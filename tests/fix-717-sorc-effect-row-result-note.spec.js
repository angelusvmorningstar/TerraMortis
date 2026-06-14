/**
 * fix.717 — Sorcery Details card: Effect row wrongly shows ST Mechanical Result note
 *
 * Acceptance criteria:
 *   1. ritual_result_note does NOT appear in the Details > Effect row
 *   2. Effect row shows the rite's canonical DB description when one exists
 *   3. Effect row is absent when the rules DB has no description for the rite
 *   4. Red banner still shows ritual_result_note when set
 *   5. Mechanical Result textarea still shows ritual_result_note
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const CHAR_SORC = {
  _id: 'char-sorc', name: 'Ivana Sorcerer', moniker: null, honorific: null,
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
  powers: [{ category: 'rite', name: 'Blood Blight', tradition: 'Cruac', rating: 2 }],
  ordeals: [],
};

const TEST_CYCLE = {
  _id: 'cycle-001', cycle_number: 4, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

// Rules DB rite that HAS a description — seeded into localStorage('tm_rules_db')
const RULES_DB_RITE_WITH_DESC = {
  category: 'rite', parent: 'Cruac',
  name: 'Blood Blight',
  description: 'Inflicts a supernatural disease on the victim.',
};

const RESULT_NOTE = '2 successes; potency 3 disease, 5 nights';

// Submission: rite ≤60 chars (blobRite used), ritual_result_note set in review
const mkSorcSub = (riteName, resultNote) => ({
  _id: 'sub-sorc-717',
  cycle_id: 'cycle-001',
  character_name: 'Ivana Sorcerer',
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
    1: { pool_status: 'pending', ...(resultNote ? { ritual_result_note: resultNote } : {}) },
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

test.describe('fix.717 — sorcery Details > Effect row', () => {

  test('AC1+2: Effect row shows DB description, not ritual_result_note', async ({ page }) => {
    const sub = mkSorcSub('Blood Blight', RESULT_NOTE);
    await setupSorcery(page, [sub], [RULES_DB_RITE_WITH_DESC]);
    await openSorceryAction(page);

    const detailView = page.locator('.proc-feed-desc-view');
    const effectLabel = detailView.locator('.proc-feed-lbl', { hasText: 'Effect' });

    // AC2: Effect row exists and shows the DB description
    await expect(effectLabel).toBeVisible();
    const effectRow = detailView.locator('.proc-proj-field').filter({ has: page.locator('.proc-feed-lbl', { hasText: 'Effect' }) });
    await expect(effectRow).toContainText('Inflicts a supernatural disease on the victim.');

    // AC1: ritual_result_note must NOT appear in the Effect row
    await expect(effectRow).not.toContainText(RESULT_NOTE);
  });

  test('AC3: Effect row absent when rite has no DB description', async ({ page }) => {
    // Use a rite name not present in the rules DB
    const sub = mkSorcSub('Unknown Custom Rite', RESULT_NOTE);
    await setupSorcery(page, [sub], [RULES_DB_RITE_WITH_DESC]); // DB has Blood Blight, not this rite
    await openSorceryAction(page);

    const detailView = page.locator('.proc-feed-desc-view');
    // Effect label must not appear at all
    await expect(detailView.locator('.proc-feed-lbl', { hasText: 'Effect' })).not.toBeVisible();
  });

  test('AC4+5: Banner and Mechanical Result textarea still show ritual_result_note', async ({ page }) => {
    const sub = mkSorcSub('Blood Blight', RESULT_NOTE);
    await setupSorcery(page, [sub], [RULES_DB_RITE_WITH_DESC]);
    await openSorceryAction(page);

    // AC4: red banner shows the result note
    const banner = page.locator('.proc-ritual-note-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(RESULT_NOTE);

    // AC5: Mechanical Result textarea value equals the result note
    const textarea = page.locator('.proc-ritual-note-input');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue(RESULT_NOTE);
  });

});
