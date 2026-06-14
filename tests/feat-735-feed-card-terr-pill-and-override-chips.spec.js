/**
 * Tests for feat.735 — DT Processing feeding card UX:
 *   (1) Normal feed territory pill wrapped in proc-feed-mod-panel bordered panel
 *   (2) Feed Declaration: select replaced with chip buttons for method + new Blood Type row with chips
 *
 * AC-1: Territory pill is inside proc-feed-mod-panel with "Territory" title (not bare proc-recat-row)
 * AC-2: Blood type player-declared row shows parsed types; four ST override chips rendered
 * AC-3: Feeding method player-declared row shown; three ST override chips; no <select> element
 * AC-4a: "No override" chip is-active when no st_review override is set
 * AC-4b: Correct chip is-active on load when st_review overrides are persisted
 * AC-5: Clicking a method chip fires PATCH with st_review.feed_violence_st_override
 * AC-6: Clicking a blood type chip fires PATCH with st_review.feed_blood_type_st_override
 * AC-7: Clicking the current active method chip clears override — "No override" becomes is-active
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000735', username: 'test_st_735', global_name: 'Test ST 735',
  avatar: null, role: 'st', player_id: 'p-735', character_ids: [], is_dual_role: false,
};

const CYCLE_735 = {
  _id: 'cycle-735', cycle_number: 4, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

const CHAR_735 = {
  _id: 'char-735', name: 'Feed Chip Tester', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player 735',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  home_territory: 'academy', retired: false,
  status: { city: 1, clan: 0, covenant: { Invictus: 1 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Persuasion: { dots: 2, bonus: 0, specs: [], nine_again: false } },
  disciplines: {}, merits: [], powers: [], ordeals: [],
};

const TERRITORY_ACADEMY = {
  _id: 'aaa000000000000000000001', slug: 'academy', name: 'The Academy',
  regent_id: null, lieutenant_id: null, feeding_rights: [], ambience: 2,
};

// Base feeding submission — player declared Kiss + Human blood type
const SUB_FEED_BASE = {
  _id: 'sub-735-base',
  cycle_id: 'cycle-735',
  character_name: 'Feed Chip Tester',
  character_id: 'char-735',
  player_name: 'Test Player 735',
  submitted_at: '2026-06-15T00:00:00Z',
  _raw: {
    projects: [],
    feeding: { method: 'seduction', pool: { expression: 'Presence 3 + Persuasion 2 = 5' } },
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    feed_violence: 'kiss',
    '_feed_blood_types': '["human"]',
    feeding_territories: '{"the_academy":"feeding_rights"}',
  },
  feeding_review: {
    pool_player: 'Presence 3 + Persuasion 2 = 5',
    pool_validated: 'Presence 3 + Persuasion 2 = 5',
    pool_status: 'validated',
    nine_again: false, eight_again: false,
    active_feed_specs: [], pool_mod_spec: 0, pool_mod_equipment: 0,
    notes_thread: [], player_feedback: '',
  },
  projects_resolved: [],
  merit_actions_resolved: [],
  st_review: {},
  st_narrative: {},
};

// Submission with persisted overrides — Violent method + Human blood type
const SUB_FEED_WITH_OVERRIDES = {
  ...SUB_FEED_BASE,
  _id: 'sub-735-overrides',
  responses: {
    ...SUB_FEED_BASE.responses,
    '_feed_blood_types': '["animal","human"]',
  },
  st_review: {
    feed_violence_st_override: 'violent',
    feed_blood_type_st_override: 'human',
  },
};

// ── Setup helper ──────────────────────────────────────────────────────────────

async function setupProcessing(page, submissions) {
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

    if (url.includes('/api/downtime_submissions'))  return ok(submissions);
    if (url.includes('/api/downtime_cycles'))       return ok([CYCLE_735]);
    if (url.includes('/api/characters/names'))      return ok([{ _id: CHAR_735._id, name: CHAR_735.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))            return ok([CHAR_735]);
    if (url.includes('/api/territories'))           return ok([TERRITORY_ACADEMY]);
    if (url.includes('/api/game_sessions'))         return ok([]);
    if (url.includes('/api/session_logs'))          return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openFeedingAction(page) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="feeding"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
  await page.waitForTimeout(300);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('feat.735: feeding card territory pill + feed declaration chips', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────

  test('AC-1: territory pill is inside a bordered panel with "Territory" heading', async ({ page }) => {
    await setupProcessing(page, [SUB_FEED_BASE]);
    await openFeedingAction(page);

    // Bordered panel with "Territory" heading must exist
    const terrPanel = page.locator('.proc-feed-mod-panel').filter({
      has: page.locator('.proc-mod-panel-title', { hasText: 'Territory' }),
    });
    await expect(terrPanel.first()).toBeVisible({ timeout: 5000 });

    // Old bare row must NOT exist (replaced by the panel)
    const bareRow = page.locator('.proc-recat-row').filter({ hasText: 'Territories' });
    await expect(bareRow).toHaveCount(0);
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────

  test('AC-2: blood type section shows player-declared type and four ST override chips', async ({ page }) => {
    await setupProcessing(page, [SUB_FEED_BASE]);
    await openFeedingAction(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    // Player-declared blood type from responses._feed_blood_types: ["human"] → "Human"
    await expect(rightPanel).toContainText('Human');

    // Four blood type chips: No override, Animal, Human, Kindred
    const btChips = rightPanel.locator('.proc-feed-bt-chip');
    await expect(btChips).toHaveCount(4);
    await expect(btChips.nth(0)).toContainText('No override');
    await expect(btChips.nth(1)).toContainText('Animal');
    await expect(btChips.nth(2)).toContainText('Human');
    await expect(btChips.nth(3)).toContainText('Kindred');
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────

  test('AC-3: feeding method section shows player-declared method and three chips; no <select>', async ({ page }) => {
    await setupProcessing(page, [SUB_FEED_BASE]);
    await openFeedingAction(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    // Player-declared method from responses.feed_violence: 'kiss' → "The Kiss (subtle)"
    await expect(rightPanel).toContainText('The Kiss (subtle)');

    // Three method chips: No override, The Kiss (subtle), Violent
    const viChips = rightPanel.locator('.proc-feed-vi-chip');
    await expect(viChips).toHaveCount(3);
    await expect(viChips.nth(0)).toContainText('No override');
    await expect(viChips.nth(1)).toContainText('The Kiss');
    await expect(viChips.nth(2)).toContainText('Violent');

    // The old named select must be gone
    await expect(rightPanel.locator('.proc-feed-violence-st-override')).toHaveCount(0);
  });

  // AC-4a ─────────────────────────────────────────────────────────────────────

  test('AC-4a: "No override" chips are is-active when no st_review overrides are set', async ({ page }) => {
    await setupProcessing(page, [SUB_FEED_BASE]);
    await openFeedingAction(page);

    const rightPanel = page.locator('.proc-feed-right').first();

    // Method: "No override" chip is-active, others are not
    const viNoOverride = rightPanel.locator('.proc-feed-vi-chip[data-value=""]');
    await expect(viNoOverride).toHaveClass(/is-active/);

    const viKiss = rightPanel.locator('.proc-feed-vi-chip[data-value="kiss"]');
    await expect(viKiss).not.toHaveClass(/is-active/);

    // Blood type: "No override" chip is-active
    const btNoOverride = rightPanel.locator('.proc-feed-bt-chip[data-value=""]');
    await expect(btNoOverride).toHaveClass(/is-active/);

    const btHuman = rightPanel.locator('.proc-feed-bt-chip[data-value="human"]');
    await expect(btHuman).not.toHaveClass(/is-active/);
  });

  // AC-4b ─────────────────────────────────────────────────────────────────────

  test('AC-4b: correct chips are is-active on load when st_review overrides are persisted', async ({ page }) => {
    await setupProcessing(page, [SUB_FEED_WITH_OVERRIDES]);
    await openFeedingAction(page);

    const rightPanel = page.locator('.proc-feed-right').first();

    // Method override = 'violent' → "Violent" chip is-active; "No override" is not
    const viViolent = rightPanel.locator('.proc-feed-vi-chip[data-value="violent"]');
    await expect(viViolent).toHaveClass(/is-active/);

    const viNoOverride = rightPanel.locator('.proc-feed-vi-chip[data-value=""]');
    await expect(viNoOverride).not.toHaveClass(/is-active/);

    // Blood type override = 'human' → "Human" chip is-active; "Animal" is not
    const btHuman = rightPanel.locator('.proc-feed-bt-chip[data-value="human"]');
    await expect(btHuman).toHaveClass(/is-active/);

    const btAnimal = rightPanel.locator('.proc-feed-bt-chip[data-value="animal"]');
    await expect(btAnimal).not.toHaveClass(/is-active/);
  });

  // AC-5 ──────────────────────────────────────────────────────────────────────

  test('AC-5: clicking a method chip sends PATCH with feed_violence_st_override key', async ({ page }) => {
    const capturedPatches = [];
    page.on('request', req => {
      if (req.method() === 'PATCH' || req.method() === 'PUT') {
        try { capturedPatches.push(JSON.parse(req.postData() || '{}')); } catch { /* ignore */ }
      }
    });

    await setupProcessing(page, [SUB_FEED_BASE]);
    await openFeedingAction(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await rightPanel.locator('.proc-feed-vi-chip[data-value="violent"]').click();
    await page.waitForTimeout(600); // async PATCH

    expect(capturedPatches.length).toBeGreaterThan(0);
    const patch = capturedPatches.at(-1);
    // updateSubmission sends flat dot-notation keys, not nested objects
    expect(patch['st_review.feed_violence_st_override']).toBe('violent');
    // Blood type key must NOT be in this patch
    expect('st_review.feed_blood_type_st_override' in patch).toBe(false);
  });

  // AC-6 ──────────────────────────────────────────────────────────────────────

  test('AC-6: clicking a blood type chip sends PATCH with feed_blood_type_st_override key', async ({ page }) => {
    const capturedPatches = [];
    page.on('request', req => {
      if (req.method() === 'PATCH' || req.method() === 'PUT') {
        try { capturedPatches.push(JSON.parse(req.postData() || '{}')); } catch { /* ignore */ }
      }
    });

    await setupProcessing(page, [SUB_FEED_BASE]);
    await openFeedingAction(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await rightPanel.locator('.proc-feed-bt-chip[data-value="kindred"]').click();
    await page.waitForTimeout(600);

    expect(capturedPatches.length).toBeGreaterThan(0);
    const patch = capturedPatches.at(-1);
    // updateSubmission sends flat dot-notation keys, not nested objects
    expect(patch['st_review.feed_blood_type_st_override']).toBe('kindred');
    // Method key must NOT be in this patch
    expect('st_review.feed_violence_st_override' in patch).toBe(false);
  });

  // AC-7 ──────────────────────────────────────────────────────────────────────

  test('AC-7: clicking "No override" method chip clears override — it becomes is-active', async ({ page }) => {
    await setupProcessing(page, [SUB_FEED_WITH_OVERRIDES]);
    await openFeedingAction(page);

    const rightPanel = page.locator('.proc-feed-right').first();

    // Confirm: override is set, "No override" is NOT active
    const viNoOverride = rightPanel.locator('.proc-feed-vi-chip[data-value=""]');
    await expect(viNoOverride).not.toHaveClass(/is-active/);

    // Click "No override"
    await viNoOverride.click();
    await page.waitForTimeout(600);

    // "No override" should now be is-active; "violent" should not be
    await expect(viNoOverride).toHaveClass(/is-active/);
    const viViolent = rightPanel.locator('.proc-feed-vi-chip[data-value="violent"]');
    await expect(viViolent).not.toHaveClass(/is-active/);
  });

});
