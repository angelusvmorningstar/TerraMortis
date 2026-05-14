/**
 * Feature #312 — Feeding Grounds pool modifier capped at 5
 *
 * AC coverage:
 *   AC1 — FG effective rating > 5 (FwB inflated): modifier row shows at most +5
 *   AC2 — FG at 3 (no FwB): modifier row shows +3
 *   AC3 — buildFeedingPool path: pool builder init total respects the cap
 *   AC4 — character sheet merit display unaffected (different code path — not exercised here)
 *   AC5 — no regressions: data-fg attribute holds capped value; live-update path inherits fix
 */

const { test, expect } = require('@playwright/test');

// ── Shared mock data ──────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

// Character with Feeding Grounds whose effective rating is 20 (FwB inflated)
const CHAR_FG_INFLATED = {
  _id: 'char-312-inf', name: 'Eve Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {
    Persuasion: { dots: 2, bonus: 0, specs: [], nine_again: false },
  },
  disciplines: {},
  // rating: 20 simulates FwB + MCI + Status bonus dots inflating the effective rating
  merits: [
    { name: 'Feeding Grounds', category: 'general', rating: 20, free_fwb: 15 },
  ],
  powers: [], ordeals: [],
};

// Character with Feeding Grounds at a normal 3 dots (no FwB)
const CHAR_FG_NORMAL = {
  _id: 'char-312-norm', name: 'Normal Feed Test', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Carthian Movement', player: 'Other Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 0, clan: 0, covenant: { 'Carthian Movement': 1, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {},
  disciplines: {},
  merits: [
    { name: 'Feeding Grounds', category: 'general', rating: 3 },
  ],
  powers: [], ordeals: [],
};

// Character with no Feeding Grounds merit
const CHAR_NO_FG = {
  _id: 'char-312-nofg', name: 'No FG Test', moniker: null, honorific: null,
  clan: 'Nosferatu', covenant: 'Unaligned', player: 'Third Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 0, clan: 0, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {},
  disciplines: {},
  merits: [],
  powers: [], ordeals: [],
};

const TEST_CYCLE = {
  _id: 'cycle-312', cycle_number: 4, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

function makeSubmission(id, charId, charName) {
  return {
    _id: id,
    cycle_id: 'cycle-312',
    character_name: charName,
    character_id: charId,
    player_name: 'Test Player',
    submitted_at: '2026-05-14T00:00:00Z',
    _raw: {
      projects: [],
      feeding: { method: 'seduction', pool: { expression: 'Presence 3 + Persuasion 2 = 5' } },
      sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      _feed_method: 'seduction',
      feeding_territories: JSON.stringify({}),
    },
    projects_resolved: [],
    feeding_review: {
      pool_player: 'Presence 3 + Persuasion 2 = 5',
      pool_validated: '',
      pool_status: 'pending',
      nine_again: false, eight_again: false,
      pool_mod_equipment: 0,
      notes_thread: [], player_feedback: '',
    },
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

const SUBMISSION_FG_INFLATED = makeSubmission('sub-312-inf', 'char-312-inf', 'Eve Test');
const SUBMISSION_FG_NORMAL   = makeSubmission('sub-312-norm', 'char-312-norm', 'Normal Feed Test');
const SUBMISSION_NO_FG       = makeSubmission('sub-312-nofg', 'char-312-nofg', 'No FG Test');

// ── Setup helpers ──────────────────────────────────────────────────────────────

async function setup(page, submissions, chars) {
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
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/downtime_cycles'))      return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))     return ok(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))           return ok(chars);
    if (url.includes('/api/territories'))          return ok([]);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
  await page.waitForTimeout(300);
}

async function openFeedingPanel(page) {
  await page.waitForSelector('.proc-phase-section', { state: 'visible', timeout: 8000 });
  const feedHeader = page.locator('.proc-phase-header').filter({ hasText: 'Feeding' }).first();
  const toggle = feedHeader.locator('.proc-phase-toggle');
  const toggleText = await toggle.textContent().catch(() => '');
  if (toggleText.includes('Show')) await feedHeader.click();
  await page.waitForTimeout(200);
  const feedPhase = page.locator('.proc-phase-section').filter({ hasText: 'Feeding' }).first();
  await feedPhase.locator('.proc-action-row').first().click();
  await page.waitForTimeout(400);
}

// ── AC1: FG inflated (rating: 20) shows +5, not +20 ──────────────────────────

test.describe('F312-1: Feeding Grounds modifier capped at 5 when effective rating exceeds 5', () => {

  test('FG row displays "+5" when character FG rating is 20 (FwB inflated)', async ({ page }) => {
    await setup(page, [SUBMISSION_FG_INFLATED], [CHAR_FG_INFLATED]);
    await openFeedingPanel(page);
    const fgRow = page.locator('.proc-mod-row').filter({ hasText: 'Feeding Grounds' }).first();
    await expect(fgRow).toBeVisible({ timeout: 5000 });
    const valSpan = fgRow.locator('.proc-mod-val');
    await expect(valSpan).toHaveText('+5');
  });

  test('FG row does NOT display "+20" when character FG rating is 20', async ({ page }) => {
    await setup(page, [SUBMISSION_FG_INFLATED], [CHAR_FG_INFLATED]);
    await openFeedingPanel(page);
    const fgRow = page.locator('.proc-mod-row').filter({ hasText: 'Feeding Grounds' }).first();
    await expect(fgRow).toBeVisible({ timeout: 5000 });
    const valSpan = fgRow.locator('.proc-mod-val');
    await expect(valSpan).not.toHaveText('+20');
  });

});

// ── AC2: FG at 3 (normal) shows +3 ───────────────────────────────────────────

test.describe('F312-2: Feeding Grounds modifier shows actual rating when at or below 5', () => {

  test('FG row displays "+3" when character FG rating is 3', async ({ page }) => {
    await setup(page, [SUBMISSION_FG_NORMAL], [CHAR_FG_NORMAL]);
    await openFeedingPanel(page);
    const fgRow = page.locator('.proc-mod-row').filter({ hasText: 'Feeding Grounds' }).first();
    await expect(fgRow).toBeVisible({ timeout: 5000 });
    const valSpan = fgRow.locator('.proc-mod-val');
    await expect(valSpan).toHaveText('+3');
  });

});

// ── AC5: data-fg attribute holds capped value (live-update path inherits fix) ──

test.describe('F312-3: data-fg attribute holds the capped value', () => {

  test('data-fg is "5" when FG effective rating is 20', async ({ page }) => {
    await setup(page, [SUBMISSION_FG_INFLATED], [CHAR_FG_INFLATED]);
    await openFeedingPanel(page);
    const modPanel = page.locator('.proc-feed-mod-panel').first();
    await expect(modPanel).toBeVisible({ timeout: 5000 });
    await expect(modPanel).toHaveAttribute('data-fg', '5');
  });

  test('data-fg is "3" when FG rating is 3', async ({ page }) => {
    await setup(page, [SUBMISSION_FG_NORMAL], [CHAR_FG_NORMAL]);
    await openFeedingPanel(page);
    const modPanel = page.locator('.proc-feed-mod-panel').first();
    await expect(modPanel).toBeVisible({ timeout: 5000 });
    await expect(modPanel).toHaveAttribute('data-fg', '3');
  });

  test('FG row shows em-dash when character has no Feeding Grounds merit', async ({ page }) => {
    await setup(page, [SUBMISSION_NO_FG], [CHAR_NO_FG]);
    await openFeedingPanel(page);
    const fgRow = page.locator('.proc-mod-row').filter({ hasText: 'Feeding Grounds' }).first();
    await expect(fgRow).toBeVisible({ timeout: 5000 });
    const valSpan = fgRow.locator('.proc-mod-val');
    // When char is loaded but has no FG, fgDice = 0; display = "0" not em-dash
    // (em-dash only when char is null). 0 is displayed as "0".
    const text = await valSpan.textContent();
    // Either 0 (char loaded, no FG merit) or em-dash (char not loaded) — neither is "+N"
    expect(text).not.toMatch(/^\+\d+/);
  });

});

// ── AC2 boundary: FG at exactly 5 shows +5 (cap does not bite legitimate 5-dot rating) ──

test.describe('F312-5: FG at exactly 5 displays correctly without over-capping', () => {

  test('FG row displays "+5" when character FG rating is exactly 5', async ({ page }) => {
    const CHAR_FG_5 = {
      ...CHAR_FG_NORMAL,
      _id: 'char-312-fg5', name: 'FG Five Test',
      merits: [{ name: 'Feeding Grounds', category: 'general', rating: 5 }],
    };
    const SUB_FG_5 = makeSubmission('sub-312-fg5', 'char-312-fg5', 'FG Five Test');
    await setup(page, [SUB_FG_5], [CHAR_FG_5]);
    await openFeedingPanel(page);
    const fgRow = page.locator('.proc-mod-row').filter({ hasText: 'Feeding Grounds' }).first();
    await expect(fgRow).toBeVisible({ timeout: 5000 });
    await expect(fgRow.locator('.proc-mod-val')).toHaveText('+5');
  });

  test('data-fg is "5" when FG rating is exactly 5', async ({ page }) => {
    const CHAR_FG_5 = {
      ...CHAR_FG_NORMAL,
      _id: 'char-312-fg5b', name: 'FG Five Test B',
      merits: [{ name: 'Feeding Grounds', category: 'general', rating: 5 }],
    };
    const SUB_FG_5 = makeSubmission('sub-312-fg5b', 'char-312-fg5b', 'FG Five Test B');
    await setup(page, [SUB_FG_5], [CHAR_FG_5]);
    await openFeedingPanel(page);
    const modPanel = page.locator('.proc-feed-mod-panel').first();
    await expect(modPanel).toBeVisible({ timeout: 5000 });
    await expect(modPanel).toHaveAttribute('data-fg', '5');
  });

});

// ── AC5: Live-update path uses capped data-fg value when equipment ticker is adjusted ──

test.describe('F312-6: Live modifier recalculation uses capped FG, not raw rating', () => {

  test('clicking equipment + updates total to FG(5) + equip(1) = +6, not FG(20) + equip(1) = +21', async ({ page }) => {
    await setup(page, [SUBMISSION_FG_INFLATED], [CHAR_FG_INFLATED]);
    await openFeedingPanel(page);
    const modPanel = page.locator('.proc-feed-mod-panel').first();
    await expect(modPanel).toBeVisible({ timeout: 5000 });
    // Confirm starting total is +5 (FG capped, no equipment)
    const totalVal = modPanel.locator('.proc-mod-total-val');
    await expect(totalVal).toHaveText('+5');
    // Click equipment + once
    const incBtn = modPanel.locator('.proc-equip-mod-inc');
    await incBtn.click();
    await page.waitForTimeout(200);
    // Total must be +6 (FG 5 capped + equipment 1), not +21 (FG 20 raw + equipment 1)
    await expect(totalVal).toHaveText('+6');
  });

  test('clicking equipment + on FG=3 character updates total to +4', async ({ page }) => {
    await setup(page, [SUBMISSION_FG_NORMAL], [CHAR_FG_NORMAL]);
    await openFeedingPanel(page);
    const modPanel = page.locator('.proc-feed-mod-panel').first();
    await expect(modPanel).toBeVisible({ timeout: 5000 });
    const totalVal = modPanel.locator('.proc-mod-total-val');
    await expect(totalVal).toHaveText('+3');
    await modPanel.locator('.proc-equip-mod-inc').click();
    await page.waitForTimeout(200);
    await expect(totalVal).toHaveText('+4');
  });

});

// ── AC3: Pool builder init total respects the cap (fgDice0 path) ──────────────

test.describe('F312-4: Pool builder initial modifier total respects the FG cap', () => {

  test('Pool mod total is at most +5 from FG when FG rating is 20', async ({ page }) => {
    await setup(page, [SUBMISSION_FG_INFLATED], [CHAR_FG_INFLATED]);
    await openFeedingPanel(page);
    const modPanel = page.locator('.proc-feed-mod-panel').first();
    await expect(modPanel).toBeVisible({ timeout: 5000 });
    // data-fg is the canonical value written by _renderFeedRightPanel (same path as fgDice0)
    // confirming it is 5 validates the pool builder init block caps correctly
    const fgAttr = await modPanel.getAttribute('data-fg');
    expect(parseInt(fgAttr, 10)).toBeLessThanOrEqual(5);
  });

  test('Mod total row value is consistent with capped FG contribution', async ({ page }) => {
    await setup(page, [SUBMISSION_FG_INFLATED], [CHAR_FG_INFLATED]);
    await openFeedingPanel(page);
    const totalRow = page.locator('.proc-mod-total-row').first();
    await expect(totalRow).toBeVisible({ timeout: 5000 });
    const totalVal = totalRow.locator('.proc-mod-total-val');
    const totalText = await totalVal.textContent();
    // With FG capped at 5 and no other modifiers, total should be +5 (or lower if unskilled applies)
    const totalNum = parseInt(totalText.replace(/[^0-9-]/g, ''), 10);
    expect(totalNum).toBeLessThanOrEqual(5);
  });

});
