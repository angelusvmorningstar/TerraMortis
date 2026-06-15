/**
 * Tests for feat #742 — DT Processing: acknowledge action for parked Mandragora rite slots
 *
 * AC-1: Parked rite slot shows a .proc-mg-ack-btn button; non-parked shows nothing
 * AC-2: Clicking .proc-mg-ack-btn issues a PUT with responses.sorcery_N_mg_acked + sorcery_review[N].pool_status = 'skipped'
 * AC-3: When submission already has sorcery_N_mg_acked = 'yes', button is absent; .proc-mg-ack-done is visible
 * AC-4: Non-parked rite shows no .proc-mg-ack element at all
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ST_USER_742 = {
  id: '123000742', username: 'test_st_742', global_name: 'Test ST 742',
  avatar: null, role: 'st', player_id: 'p-742', character_ids: [], is_dual_role: false,
};

const CYCLE_742 = {
  _id: 'cycle-742-cur', cycle_number: 5, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

const CYCLE_PRIOR_742 = {
  _id: 'cycle-742-pri', cycle_number: 4, status: 'closed',
  confirmed_ambience: {}, narrative_notes: '',
};

const CHAR_742 = {
  _id: 'char-742', name: 'Mandragora Acker', moniker: null, honorific: null,
  clan: 'Gangrel', covenant: 'Circle of the Crone', player: 'Test Player 742',
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

const TERRITORY_742 = {
  _id: 'bbb000000000000000000742', slug: 'academy', name: 'The Academy',
  regent_id: null, lieutenant_id: null, feeding_rights: [], ambience: 2,
};

// Parked rite — not yet acked
const SUB_PARKED_742 = {
  _id: 'sub-742-cur',
  cycle_id: 'cycle-742-cur',
  character_name: 'Mandragora Acker',
  character_id: 'char-742',
  player_name: 'Test Player 742',
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
    pool_player: 'Wits 3 + Survival 2 = 5', pool_validated: 'Wits 3 + Survival 2 = 5',
    pool_status: 'validated', nine_again: false, eight_again: false,
    active_feed_specs: [], pool_mod_spec: 0, pool_mod_equipment: 0,
    notes_thread: [], player_feedback: '',
  },
  sorcery_review: {},
  projects_resolved: [],
  merit_actions_resolved: [],
  st_review: {},
  st_narrative: {},
};

// Parked rite — already acked
const SUB_PARKED_ACKED_742 = {
  ...SUB_PARKED_742,
  _id: 'sub-742-acked',
  responses: {
    ...SUB_PARKED_742.responses,
    sorcery_1_mg_acked: 'yes',
  },
  sorcery_review: {
    1: { pool_status: 'skipped', notes_thread: [], story_context: '' },
  },
};

// Non-parked rite
const SUB_NOT_PARKED_742 = {
  ...SUB_PARKED_742,
  _id: 'sub-742-notparked',
  responses: {
    ...SUB_PARKED_742.responses,
    sorcery_1_mandragora: 'no',
  },
};

// Prior-cycle submission (used by MG-1 prior-outcome lookup)
const SUB_PRIOR_742 = {
  _id: 'sub-742-pri',
  cycle_id: 'cycle-742-pri',
  character_name: 'Mandragora Acker',
  character_id: 'char-742',
  player_name: 'Test Player 742',
  submitted_at: '2026-05-15T00:00:00Z',
  _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
  responses: {
    _gate_has_sorcery: 'yes',
    sorcery_slot_count: '1',
    sorcery_1_rite: 'Rite of the Fallow Field',
    sorcery_1_mandragora: 'yes',
    feed_violence: 'kiss',
    '_feed_blood_types': '["human"]',
    feeding_territories: '{}',
  },
  feeding_review: { pool_player: '', pool_validated: '', pool_status: 'validated', nine_again: false, eight_again: false, active_feed_specs: [], pool_mod_spec: 0, pool_mod_equipment: 0, notes_thread: [], player_feedback: '' },
  sorcery_review: {
    1: { pool_status: 'validated', notes_thread: [], story_context: '', ritual_result_note: 'Rite sustained through prior cycle.' },
  },
  projects_resolved: [],
  merit_actions_resolved: [],
  st_review: {},
  st_narrative: {},
};

// ── Setup helper ──────────────────────────────────────────────────────────────

async function setupProcessing742(page, currentSubs, priorSubs = [SUB_PRIOR_742]) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER_742 });

  await page.route('http://localhost:3000/**', route => {
    const url    = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });

    if (url.includes('/api/downtime_submissions')) {
      if (url.includes('cycle-742-pri')) return ok(priorSubs);
      return ok(currentSubs);
    }
    if (url.includes('/api/downtime_cycles'))  return ok([CYCLE_742, CYCLE_PRIOR_742]);
    if (url.includes('/api/characters/names')) return ok([{ _id: CHAR_742._id, name: CHAR_742.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))       return ok([CHAR_742]);
    if (url.includes('/api/territories'))      return ok([TERRITORY_742]);
    if (url.includes('/api/game_sessions'))    return ok([]);
    if (url.includes('/api/session_logs'))     return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openSorceryAction742(page) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  const sorcPill = page.locator('.proc-filter-pill[data-filter-dim="phases"]').first();
  await sorcPill.click();
  await page.waitForTimeout(300);
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
  await page.waitForTimeout(800); // allow _hydrateMgPriorOutcomes async fetch
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('feat.742: acknowledge action for parked Mandragora rite slots', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────

  test('AC-1: parked rite slot shows .proc-mg-ack-btn button in right panel', async ({ page }) => {
    await setupProcessing742(page, [SUB_PARKED_742]);
    await openSorceryAction742(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    const ackBtn = rightPanel.locator('.proc-mg-ack-btn');
    await expect(ackBtn).toBeVisible({ timeout: 5000 });
    await expect(ackBtn).toContainText('Noted');
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────

  test('AC-2: clicking ack button sends PUT with mg_acked and sorcery_review pool_status:skipped', async ({ page }) => {
    const putBodies = [];

    await page.addInitScript(({ user }) => {
      localStorage.setItem('tm_auth_token', 'local-test-token');
      localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
      localStorage.setItem('tm_auth_user', JSON.stringify(user));
    }, { user: ST_USER_742 });

    await page.route('http://localhost:3000/**', async route => {
      const url    = route.request().url();
      const method = route.request().method();
      const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

      if (method === 'PUT') {
        try { putBodies.push(route.request().postDataJSON()); } catch { /* ignore */ }
        return ok({ ok: true });
      }
      if (method === 'PATCH' || method === 'POST') return ok({ ok: true });

      if (url.includes('/api/downtime_submissions')) {
        if (url.includes('cycle-742-pri')) return ok([SUB_PRIOR_742]);
        return ok([SUB_PARKED_742]);
      }
      if (url.includes('/api/downtime_cycles'))  return ok([CYCLE_742, CYCLE_PRIOR_742]);
      if (url.includes('/api/characters/names')) return ok([{ _id: CHAR_742._id, name: CHAR_742.name, moniker: null, honorific: null }]);
      if (url.includes('/api/characters'))       return ok([CHAR_742]);
      if (url.includes('/api/territories'))      return ok([TERRITORY_742]);
      if (url.includes('/api/game_sessions'))    return ok([]);
      if (url.includes('/api/session_logs'))     return ok([]);
      return ok([]);
    });

    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
    await page.click('[data-domain="downtime"]');
    await page.waitForTimeout(1000);
    await openSorceryAction742(page);

    const ackBtn = page.locator('.proc-mg-ack-btn').first();
    await expect(ackBtn).toBeVisible({ timeout: 5000 });
    await ackBtn.click();
    await page.waitForTimeout(800);

    // Verify at least one PUT contained the mg_acked flag
    const mgAckPut = putBodies.find(b => b && b['responses.sorcery_1_mg_acked'] === 'yes');
    expect(mgAckPut).toBeTruthy();

    // Verify at least one PUT contained pool_status: 'skipped' in sorcery_review
    const sorceryReviewPut = putBodies.find(b => b && b.sorcery_review && b.sorcery_review[1]?.pool_status === 'skipped');
    expect(sorceryReviewPut).toBeTruthy();
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────

  test('AC-3: already-acked submission shows .proc-mg-ack-done, no button', async ({ page }) => {
    await setupProcessing742(page, [SUB_PARKED_ACKED_742]);
    await openSorceryAction742(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    // Button must NOT be present
    await expect(rightPanel.locator('.proc-mg-ack-btn')).toHaveCount(0);

    // Confirmation text must be present
    const ackDone = rightPanel.locator('.proc-mg-ack-done');
    await expect(ackDone).toBeVisible({ timeout: 3000 });
    await expect(ackDone).toContainText('Noted');
  });

  // AC-2-UI: immediate transition after click ────────────────────────────────

  test('AC-2-UI: after clicking ack button, button is replaced by .proc-mg-ack-done in the same session', async ({ page }) => {
    await setupProcessing742(page, [SUB_PARKED_742]);
    await openSorceryAction742(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    // Button present before click
    const ackBtn = rightPanel.locator('.proc-mg-ack-btn');
    await expect(ackBtn).toBeVisible({ timeout: 5000 });

    await ackBtn.click();
    await page.waitForTimeout(1000); // allow two API calls + renderProcessingMode

    // Button must be gone
    await expect(page.locator('.proc-mg-ack-btn')).toHaveCount(0);

    // Confirmation text must appear in its place
    const ackDone = page.locator('.proc-mg-ack-done');
    await expect(ackDone).toBeVisible({ timeout: 3000 });
    await expect(ackDone).toContainText('Noted');
  });

  // AC-4 ──────────────────────────────────────────────────────────────────────

  test('AC-4: non-parked rite slot shows no .proc-mg-ack element', async ({ page }) => {
    await setupProcessing742(page, [SUB_NOT_PARKED_742]);
    await openSorceryAction742(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    await expect(rightPanel.locator('.proc-mg-ack')).toHaveCount(0);
    await expect(rightPanel.locator('.proc-mg-ack-btn')).toHaveCount(0);
  });

});
