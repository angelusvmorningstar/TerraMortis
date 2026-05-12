/**
 * Regression tests for fix.49 — Fucking Thief: stolen domain merits route to category: 'domain'
 *
 * Root cause: shEditGenMerit hardcoded category: 'general' for all FT-stolen merits.
 * Domain merits (DOMAIN_MERIT_TYPES: Safe Place, Haven, Feeding Grounds, Herd, Mandragora Garden)
 * should land in category: 'domain'.
 *
 * Fix: stolenMeritCategory() helper checks rule.sub_category first (primary), falls back to
 * DOMAIN_MERIT_TYPES.includes(name). Removal path is now category-agnostic.
 *
 * AC-1: stealing Mandragora Garden → { category: 'domain', granted_by: 'Fucking Thief' }
 * AC-2: stolen Mandragora Garden does NOT appear in general merits list
 * AC-3: stealing a non-domain merit (Striking Looks) → { category: 'general' } (no regression)
 * AC-4: swapping qualifier removes old entry regardless of category, adds new with correct category
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '777000049', username: 'test_st49', global_name: 'Test ST 49',
  avatar: null, role: 'st', player_id: 'p-fix49',
  character_ids: ['char-fix49-001'], is_dual_role: false,
};

function buildChar() {
  return {
    _id: 'char-fix49-001',
    name: 'FT Domain Tester',
    moniker: null, honorific: null,
    clan: 'Daeva', covenant: 'Carthian Movement', player: 'Test Player',
    blood_potency: 1, humanity: 7, humanity_base: 7,
    court_title: null, retired: false,
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: { Persuasion: { dots: 1, bonus: 0, specs: [], nine_again: false } },
    disciplines: {},
    merits: [{ category: 'general', name: 'Fucking Thief', rating: 1, cp: 1 }],
    ordeals: [], powers: [],
    xp_log: { spent: 0 },
  };
}

// Minimal rules — Mandragora Garden with sub_category 'domain' (tests primary path in stolenMeritCategory)
const RULES = [
  { key: 'mandragora-garden', category: 'merit', sub_category: 'domain', name: 'Mandragora Garden', rating_range: [1, 3] },
  { key: 'striking-looks', category: 'merit', sub_category: null, name: 'Striking Looks', rating_range: [1, 2] },
  { key: 'fucking-thief', category: 'merit', sub_category: null, name: 'Fucking Thief', rating_range: [1, 1] },
];

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setupSuite(page, char) {
  await page.addInitScript((u) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, ST_USER);

  // Catch-all first — specific routes registered after take priority (Playwright LIFO)
  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
  );
  await page.route('**/api/characters/names', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: char._id, name: char.name, moniker: null, honorific: null }]) })
  );
  await page.route(new RegExp(`/api/characters/${char._id}$`), r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) })
  );
  await page.route('**/api/rules', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RULES) })
  );
}

async function openCharInEditMode(page, char) {
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])');
  await page.waitForSelector(`[data-id="${char._id}"]`, { timeout: 5000 });
  await page.click(`[data-id="${char._id}"]`);
  await page.waitForSelector('#cd-edit-toggle', { timeout: 5000 });
  await page.click('#cd-edit-toggle');
  await page.waitForTimeout(300);
  await page.waitForSelector('#cd-save-api:not([style*="display: none"])', { timeout: 5000 });
}

/**
 * Call shEditGenMerit on the FT merit (filtered general index 0) and capture the PUT body.
 * Registers its own PUT intercept which takes priority over the setup route (LIFO).
 */
async function editFTQualifierAndSave(page, char, qualifier) {
  let savedBody = null;
  await page.route(new RegExp(`/api/characters/${char._id}$`), r => {
    if (r.request().method() === 'PUT') {
      savedBody = JSON.parse(r.request().postData() || '{}');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) });
  });
  // shEditGenMerit is bound to window via Object.assign(window, {...}) in admin.js
  await page.evaluate((q) => window.shEditGenMerit(0, 'qualifier', q), qualifier);
  await page.click('#cd-save-api');
  await page.waitForTimeout(500);
  return savedBody;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.49: Fucking Thief stolen domain merit routing', () => {

  test('AC-1: stealing Mandragora Garden stores category: domain with granted_by', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openCharInEditMode(page, char);

    const saved = await editFTQualifierAndSave(page, char, 'Mandragora Garden');
    expect(saved).not.toBeNull();

    const stolenMerit = (saved.merits || []).find(
      m => m.name === 'Mandragora Garden' && m.granted_by === 'Fucking Thief'
    );
    expect(stolenMerit).toBeDefined();
    expect(stolenMerit.category).toBe('domain');
  });

  test('AC-2: stolen Mandragora Garden does not appear in general merits', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openCharInEditMode(page, char);

    const saved = await editFTQualifierAndSave(page, char, 'Mandragora Garden');

    const generalMandragora = (saved.merits || []).find(
      m => m.name === 'Mandragora Garden' && m.category === 'general'
    );
    expect(generalMandragora).toBeUndefined();
  });

  test('AC-3: stealing Striking Looks (non-domain) stores category: general', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openCharInEditMode(page, char);

    const saved = await editFTQualifierAndSave(page, char, 'Striking Looks');
    expect(saved).not.toBeNull();

    const stolenMerit = (saved.merits || []).find(
      m => m.name === 'Striking Looks' && m.granted_by === 'Fucking Thief'
    );
    expect(stolenMerit).toBeDefined();
    expect(stolenMerit.category).toBe('general');
  });

  test('AC-4: swapping qualifier removes old domain entry, adds new non-domain correctly', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openCharInEditMode(page, char);

    // First: steal Mandragora Garden (domain)
    await page.evaluate(() => window.shEditGenMerit(0, 'qualifier', 'Mandragora Garden'));
    await page.waitForTimeout(100);

    // Then: swap to Striking Looks (general) — captures the save
    const saved = await editFTQualifierAndSave(page, char, 'Striking Looks');

    // Mandragora Garden entry must be gone (category-agnostic removal)
    const mandragora = (saved.merits || []).find(m => m.name === 'Mandragora Garden');
    expect(mandragora).toBeUndefined();

    // Striking Looks must be present as general
    const strikingLooks = (saved.merits || []).find(
      m => m.name === 'Striking Looks' && m.granted_by === 'Fucking Thief'
    );
    expect(strikingLooks).toBeDefined();
    expect(strikingLooks.category).toBe('general');
  });

});
