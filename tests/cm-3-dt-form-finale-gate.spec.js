/**
 * cm-3 (player side) — the PT/MCI at-risk warning strip is gated on the
 * DERIVED chapter-finale fact, not the old per-cycle `is_chapter_finale`
 * checkbox.
 *
 * Why this file exists: cm-3's review found that all ~22 existing DT-form
 * Playwright specs mock `/api/**` with a catch-all `[]`, which pins
 * `_storyCycles = []` for every one of them — so the player half of this
 * story's own derivation had zero e2e coverage. Those specs assert nothing
 * about maintenance and the inert `is_chapter_finale: false` in their fixtures
 * now describes a dead field, so rather than churn 22 files, the gate gets its
 * own spec that actually drives `GET /api/story_cycles`.
 *
 * Mounts the DT form in a sandbox (the dt-form-599 pattern) and reads the
 * warning strips at the top of the Personal Projects section.
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-002',
  character_ids: ['char-001'], is_dual_role: false,
};

// Story 9 owns Games 1 and 2. Game 2 (the cycle the form picks) is live.
const STORY_ID = 'sc-cm3';
const CYCLE_1 = {
  _id: 'cyc-cm3-1', status: 'closed', label: 'CM3 Game 1', game_number: 1,
  story_cycle_id: STORY_ID, feeding_rights_confirmed: true,
  created_at: '2026-05-01T00:00:00.000Z',
};
const CYCLE_2 = {
  _id: 'cyc-cm3-2', status: 'active', label: 'CM3 Game 2', game_number: 2,
  story_cycle_id: STORY_ID, feeding_rights_confirmed: true,
  created_at: '2026-05-07T00:00:00.000Z',
  maintenance_audit: {},
};

const PT  = { category: 'standing', name: 'Professional Training', rating: 3, dots: 3 };
const MCI = { category: 'standing', name: 'Mystery Cult Initiation', rating: 2, dots: 2, cult_name: 'The Gilded Chain' };

function buildChar(merits) {
  return {
    _id: 'char-001', name: 'Maintenance Haver', moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
    blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
    attributes: {
      Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: { Investigation: { dots: 3, bonus: 0, specs: [], nine_again: false } },
    disciplines: {}, merits, powers: [], ordeals: [],
  };
}

const PRIOR = {
  _id: 'sub-cm3', cycle_id: CYCLE_2._id, character_id: 'char-001', status: 'draft',
  responses: { _feed_method: 'predator', feed_violence: 'kiss' },
};

/**
 * @param storyCycles what GET /api/story_cycles answers, or the string 'fail'
 *                    to make it 500.
 */
async function setupSuite(page, char, storyCycles, cycles = [CYCLE_1, CYCLE_2]) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);

  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) }));
  await page.route(/\/api\/characters\/char-001$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) }));
  await page.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) }));
  await page.route('**/api/characters/names', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ _id: char._id, name: char.name }]) }));
  await page.route('**/api/downtime_cycles', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cycles) }));
  await page.route(/\/api\/downtime_submissions($|\?)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([PRIOR]) }));
  await page.route(/\/api\/story_cycles$/, r => (
    storyCycles === 'fail'
      ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'SERVER_ERROR' }) })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(storyCycles) })
  ));

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function openForm(page, char) {
  await page.evaluate(async (c) => {
    const sandbox = document.createElement('div');
    sandbox.id = 'dt-sandbox';
    sandbox.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#1a1208;z-index:99999;';
    document.body.appendChild(sandbox);
    const mod = await import('/js/tabs/downtime-form.js');
    await mod.renderDowntimeTab(sandbox, c, []);
  }, char);
  await page.waitForSelector('#dt-sandbox [data-section-key="projects"]', { state: 'attached', timeout: 10000 });
}

const warnings = page => page.locator('#dt-sandbox .dt-maintenance-warning');

// The Story names Game 2 (the live cycle) as its final chapter.
const STORY_NAMING_G2 = [{ _id: STORY_ID, number: 9, label: 'CM3 Story', final_chapter_id: CYCLE_2._id }];
// The Story names Game 1 instead — Game 2 is a member but NOT the finale.
const STORY_NAMING_G1 = [{ _id: STORY_ID, number: 9, label: 'CM3 Story', final_chapter_id: CYCLE_1._id }];
// The Story is still open: no final chapter named at all.
const STORY_OPEN      = [{ _id: STORY_ID, number: 9, label: 'CM3 Story' }];

test.describe('cm-3: the player at-risk warning is gated on the derived finale', () => {

  test('warns on both merits when the Story names THIS cycle as its final chapter', async ({ page }) => {
    const char = buildChar([PT, MCI]);
    await setupSuite(page, char, STORY_NAMING_G2);
    await openForm(page, char);
    await expect(warnings(page)).toHaveCount(2);
    await expect(warnings(page).nth(0)).toContainText('Professional Training');
    await expect(warnings(page).nth(1)).toContainText('Mystery Cult Initiation');
    await expect(warnings(page).nth(1)).toContainText('The Gilded Chain');
  });

  test('is silent when the Story names a DIFFERENT chapter as its finale', async ({ page }) => {
    // The regression the pointer design exists for: membership alone, or a
    // "highest game_number" rule, would call Game 2 the finale here.
    const char = buildChar([PT, MCI]);
    await setupSuite(page, char, STORY_NAMING_G1);
    await openForm(page, char);
    await expect(warnings(page)).toHaveCount(0);
  });

  test('is silent while the Story has no final chapter named', async ({ page }) => {
    const char = buildChar([PT, MCI]);
    await setupSuite(page, char, STORY_OPEN);
    await openForm(page, char);
    await expect(warnings(page)).toHaveCount(0);
  });

  test('is silent for a single-chapter Story until the ST names it', async ({ page }) => {
    // Live Story 3's exact shape: one member, more chapters expected.
    const char = buildChar([PT, MCI]);
    const solo = { ...CYCLE_2, story_cycle_id: 'sc-solo' };
    await setupSuite(page, char, [{ _id: 'sc-solo', number: 3, label: 'Solo Story' }], [solo]);
    await openForm(page, char);
    await expect(warnings(page)).toHaveCount(0);
  });

  test('a ticked audit clears that merit\'s warning, leaving the other', async ({ page }) => {
    const char = buildChar([PT, MCI]);
    const ticked = { ...CYCLE_2, maintenance_audit: { 'char-001': { pt: true, mci: false } } };
    await setupSuite(page, char, STORY_NAMING_G2, [CYCLE_1, ticked]);
    await openForm(page, char);
    await expect(warnings(page)).toHaveCount(1);
    await expect(warnings(page).first()).toContainText('Mystery Cult Initiation');
  });

  test('a character holding neither merit sees nothing, even on the finale', async ({ page }) => {
    const char = buildChar([{ category: 'general', name: 'Haven', rating: 2, dots: 2 }]);
    await setupSuite(page, char, STORY_NAMING_G2);
    await openForm(page, char);
    await expect(warnings(page)).toHaveCount(0);
  });

  test('a failed story_cycles fetch says so, instead of silently showing nothing', async ({ page }) => {
    // Review finding: the first pass swallowed this with `.catch(() => [])`,
    // which is indistinguishable from "the Story just is not closed yet" — a
    // player would read the absent warning as "nothing at risk".
    const char = buildChar([PT, MCI]);
    await setupSuite(page, char, 'fail');
    await openForm(page, char);
    await expect(warnings(page)).toHaveCount(1);
    await expect(warnings(page).first()).toContainText('Maintenance status unavailable');
  });

  test('a failed fetch stays silent for a character with no maintenance merits', async ({ page }) => {
    const char = buildChar([{ category: 'general', name: 'Haven', rating: 2, dots: 2 }]);
    await setupSuite(page, char, 'fail');
    await openForm(page, char);
    await expect(warnings(page)).toHaveCount(0);
  });
});
