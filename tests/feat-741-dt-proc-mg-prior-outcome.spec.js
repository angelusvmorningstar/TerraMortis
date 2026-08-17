/**
 * Tests for feat #741 — DT Processing: show prior cycle resolution for parked Mandragora rites
 *
 * AC-1: Parked rite slot shows a .proc-mg-prior-outcome container in the right panel
 * AC-2: When prior cycle submission has ritual_result_note, that text appears in .mg-prior-text
 * AC-3: When prior cycle submission has no ritual_result_note, shows "No prior resolution recorded"
 * AC-4: Non-parked rite slot shows no .proc-mg-prior-outcome element
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ST_USER_741 = {
  id: '123000741', username: 'test_st_741', global_name: 'Test ST 741',
  avatar: null, role: 'st', player_id: 'p-741', character_ids: [], is_dual_role: false,
};

const CYCLE_CURRENT = {
  _id: 'cycle-741-cur', cycle_number: 5, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

const CYCLE_PRIOR = {
  _id: 'cycle-741-pri', cycle_number: 4, status: 'closed',
  confirmed_ambience: {}, narrative_notes: '',
};

const CHAR_741 = {
  _id: 'char-741', name: 'Mandragora Tester', moniker: null, honorific: null,
  clan: 'Gangrel', covenant: 'Circle of the Crone', player: 'Test Player 741',
  blood_potency: 3, humanity: 6, humanity_base: 7, court_title: null,
  home_territory: 'academy', retired: false,
  status: { city: 1, clan: 0, covenant: { 'Circle of the Crone': 1 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 3, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {
    Occult: { dots: 3, bonus: 0, specs: [], nine_again: false },
    Survival: { dots: 2, bonus: 0, specs: [], nine_again: false },
  },
  disciplines: { Cruac: { dots: 2, bonus: 0 } },
  merits: [{ name: 'Mandragora Garden', rating: 1, dots: 1, bonus: 0, category: 'general' }],
  powers: [{ name: 'Rite of the Fallow Field', category: 'rite', mandragora_parked: true }],
  ordeals: [],
};

const TERRITORY_ACADEMY_741 = {
  _id: 'bbb000000000000000000741', slug: 'academy', name: 'The Academy',
  regent_id: null, lieutenant_id: null, feeding_rights: [], ambience: 2,
};

// Current-cycle submission — parked rite in slot 1
const SUB_PARKED = {
  _id: 'sub-741-cur',
  chapter_id: 'cycle-741-cur',
  character_name: 'Mandragora Tester',
  character_id: 'char-741',
  player_name: 'Test Player 741',
  submitted_at: '2026-06-15T00:00:00Z',
  _raw: {
    projects: [],
    feeding: { method: 'seduction', pool: { expression: 'Wits 3 + Survival 2 = 5' } },
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    _gate_has_sorcery: 'yes',
    sorcery_slot_count: '1',
    sorcery_1_rite: 'Rite of the Fallow Field',
    sorcery_1_targets: 'Self',
    sorcery_1_notes: 'Permanent via Mandragora Garden',
    sorcery_1_mandragora: 'yes',
    feed_violence: 'kiss',
    '_feed_blood_types': '["human"]',
    feeding_territories: '{"the_academy":"feeding_rights"}',
  },
  feeding_review: {
    pool_player: 'Wits 3 + Survival 2 = 5',
    pool_validated: 'Wits 3 + Survival 2 = 5',
    pool_status: 'validated',
    nine_again: false, eight_again: false,
    active_feed_specs: [], pool_mod_spec: 0, pool_mod_equipment: 0,
    notes_thread: [], player_feedback: '',
  },
  sorcery_review: {},
  projects_resolved: [],
  merit_actions_resolved: [],
  st_review: {},
  st_narrative: {},
};

// Prior-cycle submission WITH a resolution note
const SUB_PRIOR_WITH_RESOLUTION = {
  _id: 'sub-741-pri-yes',
  chapter_id: 'cycle-741-pri',
  character_name: 'Mandragora Tester',
  character_id: 'char-741',
  player_name: 'Test Player 741',
  submitted_at: '2026-05-15T00:00:00Z',
  _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
  responses: {
    _gate_has_sorcery: 'yes',
    sorcery_slot_count: '1',
    sorcery_1_rite: 'Rite of the Fallow Field',
    sorcery_1_targets: 'Self',
    sorcery_1_notes: '',
    sorcery_1_mandragora: 'yes',
    feed_violence: 'kiss',
    '_feed_blood_types': '["human"]',
    feeding_territories: '{}',
  },
  feeding_review: { pool_player: '', pool_validated: '', pool_status: 'validated', nine_again: false, eight_again: false, active_feed_specs: [], pool_mod_spec: 0, pool_mod_equipment: 0, notes_thread: [], player_feedback: '' },
  sorcery_review: {
    1: {
      pool_status: 'validated',
      notes_thread: [],
      story_context: '',
      ritual_result_note: 'Resolved: the rite takes hold. Effect sustained for this cycle.',
    },
  },
  projects_resolved: [],
  merit_actions_resolved: [],
  st_review: {},
  st_narrative: {},
};

// Prior-cycle submission WITHOUT a resolution note
const SUB_PRIOR_NO_RESOLUTION = {
  ...SUB_PRIOR_WITH_RESOLUTION,
  _id: 'sub-741-pri-no',
  sorcery_review: {
    1: { pool_status: 'validated', notes_thread: [], story_context: '' },
  },
};

// Current-cycle submission — NOT parked
const SUB_NOT_PARKED = {
  ...SUB_PARKED,
  _id: 'sub-741-notparked',
  responses: {
    ...SUB_PARKED.responses,
    sorcery_1_mandragora: 'no',
  },
};

// ── Setup helper ──────────────────────────────────────────────────────────────

async function setupProcessing741(page, currentSubs, priorSubs) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER_741 });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });

    if (url.includes('/api/downtime_submissions')) {
      if (url.includes('cycle-741-pri')) return ok(priorSubs);
      return ok(currentSubs);
    }
    if (url.includes('/api/chapters'))  return ok([CYCLE_CURRENT, CYCLE_PRIOR]);
    if (url.includes('/api/characters/names')) return ok([{ _id: CHAR_741._id, name: CHAR_741.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))       return ok([CHAR_741]);
    if (url.includes('/api/territories'))      return ok([TERRITORY_ACADEMY_741]);
    if (url.includes('/api/game_sessions'))    return ok([]);
    if (url.includes('/api/session_logs'))     return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openSorceryAction741(page) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  // Filter to sorcery phase (phase 0 = resolve first / sorcery)
  const sorcPill = page.locator('.proc-filter-pill[data-filter-dim="phases"]').first();
  await sorcPill.click();
  await page.waitForTimeout(300);
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
  await page.waitForTimeout(800); // allow _hydrateMgPriorOutcomes async fetch
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('feat.741: prior cycle resolution for parked Mandragora rites', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────

  test('AC-1: parked rite slot shows .proc-mg-prior-outcome container in right panel', async ({ page }) => {
    await setupProcessing741(page, [SUB_PARKED], [SUB_PRIOR_WITH_RESOLUTION]);
    await openSorceryAction741(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    const priorOutcome = rightPanel.locator('.proc-mg-prior-outcome');
    await expect(priorOutcome).toBeVisible({ timeout: 5000 });
    await expect(priorOutcome).toContainText('Prior cycle resolution');
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────

  test('AC-2: resolution text from prior cycle ritual_result_note appears in .mg-prior-text', async ({ page }) => {
    await setupProcessing741(page, [SUB_PARKED], [SUB_PRIOR_WITH_RESOLUTION]);
    await openSorceryAction741(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    const priorText = rightPanel.locator('.mg-prior-text');
    await expect(priorText).toContainText('Resolved: the rite takes hold', { timeout: 5000 });
    await expect(priorText).not.toContainText('No prior resolution recorded');
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────

  test('AC-3: "No prior resolution recorded" shows when prior submission has no ritual_result_note', async ({ page }) => {
    await setupProcessing741(page, [SUB_PARKED], [SUB_PRIOR_NO_RESOLUTION]);
    await openSorceryAction741(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    const priorText = rightPanel.locator('.mg-prior-text');
    await expect(priorText).toContainText('No prior resolution recorded', { timeout: 5000 });
  });

  // AC-4 ──────────────────────────────────────────────────────────────────────

  test('AC-4: non-parked rite slot shows no .proc-mg-prior-outcome element', async ({ page }) => {
    await setupProcessing741(page, [SUB_NOT_PARKED], [SUB_PRIOR_WITH_RESOLUTION]);
    await openSorceryAction741(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    await expect(rightPanel.locator('.proc-mg-prior-outcome')).toHaveCount(0);
  });

  // AC-7 ──────────────────────────────────────────────────────────────────────

  test('AC-7: prior outcome section is read-only — no inputs, textareas, or buttons inside it', async ({ page }) => {
    await setupProcessing741(page, [SUB_PARKED], [SUB_PRIOR_WITH_RESOLUTION]);
    await openSorceryAction741(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    const priorOutcome = rightPanel.locator('.proc-mg-prior-outcome');
    await expect(priorOutcome).toBeVisible({ timeout: 5000 });

    // No interactive elements inside the prior outcome section
    await expect(priorOutcome.locator('input')).toHaveCount(0);
    await expect(priorOutcome.locator('textarea')).toHaveCount(0);
    await expect(priorOutcome.locator('button')).toHaveCount(0);
  });

  // AC-Edge: no prior cycle ───────────────────────────────────────────────────

  test('AC-Edge: first cycle (no prior cycle) shows "No prior resolution recorded" immediately — no perpetual Loading', async ({ page }) => {
    // Only one cycle exists — no prior cycle possible
    const CYCLE_ONLY = { _id: 'cycle-741-only', cycle_number: 1, status: 'active', confirmed_ambience: {}, narrative_notes: '' };
    const SUB_FIRST_CYCLE = { ...SUB_PARKED, chapter_id: 'cycle-741-only' };

    await page.addInitScript(({ user }) => {
      localStorage.setItem('tm_auth_token', 'local-test-token');
      localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
      localStorage.setItem('tm_auth_user', JSON.stringify(user));
    }, { user: ST_USER_741 });

    await page.route('http://localhost:3000/**', route => {
      const url = route.request().url();
      const method = route.request().method();
      const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
      if (url.includes('/api/downtime_submissions')) return ok([SUB_FIRST_CYCLE]);
      if (url.includes('/api/chapters'))      return ok([CYCLE_ONLY]);
      if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_741._id, name: CHAR_741.name, moniker: null, honorific: null }]);
      if (url.includes('/api/characters'))           return ok([CHAR_741]);
      if (url.includes('/api/territories'))          return ok([TERRITORY_ACADEMY_741]);
      if (url.includes('/api/game_sessions'))        return ok([]);
      if (url.includes('/api/session_logs'))         return ok([]);
      return ok([]);
    });

    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
    await page.click('[data-domain="downtime"]');
    await page.waitForTimeout(1000);
    await openSorceryAction741(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    const priorText = rightPanel.locator('.mg-prior-text');
    await expect(priorText).toContainText('No prior resolution recorded', { timeout: 3000 });
    // Must NOT stay as "Loading…"
    await expect(priorText).not.toContainText('Loading');
  });

});
