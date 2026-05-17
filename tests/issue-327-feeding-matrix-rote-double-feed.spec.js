/**
 * Issue #327 — Feeding matrix rote+normal double-feed renders single symbol
 *
 * Root cause A: _getSubFedTerrs early-return when ST override fires skips the rote grid.
 * Root cause B: Player submitted feeding_territories_rote with 'none' (Brandy — data fix only).
 *
 * Test coverage:
 *   AC1  — ST override array + rote grid both counted → "O O" (Ivana pattern)
 *   AC2  — No override, both grids match → "O O" regression (Keeper/Tegan pattern)
 *   AC3  — Override present but no rote project slot → single "O" (not double)
 *   AC4  — feeding_rote override replaces player rote grid in matrix count
 *   AC5  — Rote feed processing entry renders feeding_rote territory pill row
 */

const { test, expect } = require('@playwright/test');

// ── Shared stubs ────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '327000001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-327', character_ids: [], is_dual_role: false,
};

const CHAR_IVANA = {
  _id: 'char-ivana-327', name: 'Ivana Horvat', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Ivana Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 0, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const TEST_CYCLE = {
  _id: 'cycle-327', cycle_number: 3, status: 'game',
  confirmed_ambience: {}, narrative_notes: '', phase_signoff: {},
};

// North Shore territory with Ivana in feeding_rights
const TERR_NS = {
  _id: 'terr-ns-327', slug: 'northshore', name: 'The North Shore',
  ambience: 'Fertile', feeding_rights: ['char-ivana-327'],
  regent_id: null, lieutenant_id: null,
};

// ── Submission builders ─────────────────────────────────────────────────────────

/** AC1 / Ivana pattern: ST override sets feeding=['northshore'], player has rote grid with NShore. */
function makeIvanaSub() {
  return {
    _id: 'sub-ivana-327',
    cycle_id: 'cycle-327',
    character_name: 'Ivana Horvat',
    character_id: 'char-ivana-327',
    player_name: 'Ivana Player',
    submitted_at: '2026-05-16T00:00:00Z',
    _raw: { projects: [{ action_type: 'rote', desired_outcome: 'Hunt', detail: '', primary_pool: { expression: '' } }], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {
      _feed_method: 'seduction',
      feeding_territories: JSON.stringify({ the_north_shore: 'feeding_rights' }),
      feeding_territories_rote: JSON.stringify({ the_north_shore: 'feeding_rights', the_academy: 'none', the_harbour: 'none', the_dockyards: 'none', the_second_city: 'none', the_barrens_no_territory_: 'none' }),
      project_1_action: 'rote',
    },
    projects_resolved: [{}],
    feeding_review: null,
    merit_actions_resolved: [],
    // ST override replaces the main feeding grid — WITHOUT the fix this suppressed rote grid
    st_review: { territory_overrides: { feeding: ['northshore'] } },
  };
}

/** AC2 / Keeper pattern: No ST override; both main grid and rote grid declare the same territory. */
function makeKeeperSub() {
  return {
    _id: 'sub-keeper-327',
    cycle_id: 'cycle-327',
    character_name: 'Ivana Horvat',  // reuse char for simplicity
    character_id: 'char-ivana-327',
    player_name: 'Ivana Player',
    submitted_at: '2026-05-16T00:00:00Z',
    _raw: { projects: [{ action_type: 'rote', desired_outcome: 'Hunt', detail: '', primary_pool: { expression: '' } }], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {
      _feed_method: 'seduction',
      feeding_territories: JSON.stringify({ the_north_shore: 'feeding_rights' }),
      feeding_territories_rote: JSON.stringify({ the_north_shore: 'feeding_rights' }),
      project_1_action: 'rote',
    },
    projects_resolved: [{}],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },  // no override
  };
}

/** AC3: ST override present but no rote project slot — should count=1 only. */
function makeOverrideOnlySub() {
  return {
    _id: 'sub-ovr-only-327',
    cycle_id: 'cycle-327',
    character_name: 'Ivana Horvat',
    character_id: 'char-ivana-327',
    player_name: 'Ivana Player',
    submitted_at: '2026-05-16T00:00:00Z',
    _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {
      _feed_method: 'seduction',
      feeding_territories: JSON.stringify({ the_north_shore: 'feeding_rights' }),
    },
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: { feeding: ['northshore'] } },
  };
}

/** AC4: feeding_rote override set by ST; player rote grid has 'none' (Brandy pattern). */
function makeFeedingRoteOvrSub() {
  return {
    _id: 'sub-roteovr-327',
    cycle_id: 'cycle-327',
    character_name: 'Ivana Horvat',
    character_id: 'char-ivana-327',
    player_name: 'Ivana Player',
    submitted_at: '2026-05-16T00:00:00Z',
    _raw: { projects: [{ action_type: 'rote', desired_outcome: 'Hunt', detail: '', primary_pool: { expression: '' } }], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {
      _feed_method: 'seduction',
      feeding_territories: JSON.stringify({ the_north_shore: 'feeding_rights' }),
      // Player forgot to select rote territory — all 'none'
      feeding_territories_rote: JSON.stringify({ the_north_shore: 'none', the_academy: 'none', the_harbour: 'none', the_dockyards: 'none', the_second_city: 'none', the_barrens_no_territory_: 'none' }),
      project_1_action: 'rote',
    },
    projects_resolved: [{}],
    feeding_review: null,
    merit_actions_resolved: [],
    // ST corrected rote territory via the new feeding_rote override
    st_review: { territory_overrides: { feeding_rote: ['northshore'] } },
  };
}

// ── Setup helper ────────────────────────────────────────────────────────────────

async function setup(page, submission, territories = [TERR_NS]) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url    = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
    if (url.includes('/api/downtime_submissions')) return ok([submission]);
    if (url.includes('/api/downtime_cycles'))      return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_IVANA._id, name: CHAR_IVANA.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR_IVANA]);
    if (url.includes('/api/territories'))          return ok(territories);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);
}

async function showMatrix(page) {
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="city"]');
  await page.waitForTimeout(400);
  const toggle = page.locator('.proc-disc-header[data-toggle="city-feed-matrix"]');
  await toggle.waitFor({ state: 'visible', timeout: 8000 });
  const txt = await toggle.textContent();
  if (txt && txt.includes('Show')) {
    await toggle.click();
    await page.waitForTimeout(300);
  }
}

async function getIvanaRow(page) {
  return page.locator('tr.dt-matrix-row').filter({ hasText: 'Ivana' });
}

// ── AC1: ST override + rote grid → count=2 → "O O" ────────────────────────────

test.describe('Issue #327 — AC1: ST override does not suppress rote grid', () => {

  test('Ivana: ST override array + rote grid → NShore shows "O O"', async ({ page }) => {
    await setup(page, makeIvanaSub());
    await showMatrix(page);

    const row = await getIvanaRow(page);
    await expect(row).toBeVisible({ timeout: 5000 });
    // Must be a resident cell (has feeding rights) with double count
    const residentCell = row.locator('td.dt-matrix-resident');
    await expect(residentCell).toBeVisible({ timeout: 5000 });
    await expect(residentCell).toContainText('O O');
  });

  test('Ivana: ST override + rote grid → NShore is NOT showing single "O"', async ({ page }) => {
    await setup(page, makeIvanaSub());
    await showMatrix(page);

    const row = await getIvanaRow(page);
    await expect(row).toBeVisible({ timeout: 5000 });
    // Cell text must be "O O", not bare "O" (which would indicate early return still present)
    const residentCell = row.locator('td.dt-matrix-resident');
    await expect(residentCell).toBeVisible({ timeout: 5000 });
    const text = await residentCell.textContent();
    expect(text?.trim()).toBe('O O');
  });

});

// ── AC2: No override + both grids → "O O" (regression) ────────────────────────

test.describe('Issue #327 — AC2: Keeper/Tegan pattern unchanged (regression)', () => {

  test('No override, both grids match → NShore shows "O O"', async ({ page }) => {
    await setup(page, makeKeeperSub());
    await showMatrix(page);

    const row = await getIvanaRow(page);
    await expect(row).toBeVisible({ timeout: 5000 });
    const residentCell = row.locator('td.dt-matrix-resident');
    await expect(residentCell).toBeVisible({ timeout: 5000 });
    await expect(residentCell).toContainText('O O');
  });

});

// ── AC3: Override without rote slot → single "O" (not double) ─────────────────

test.describe('Issue #327 — AC3: Override without rote slot stays at count=1', () => {

  test('ST override present, no rote project action → NShore shows single "O"', async ({ page }) => {
    await setup(page, makeOverrideOnlySub());
    await showMatrix(page);

    const row = await getIvanaRow(page);
    await expect(row).toBeVisible({ timeout: 5000 });
    const residentCell = row.locator('td.dt-matrix-resident');
    await expect(residentCell).toBeVisible({ timeout: 5000 });
    const text = await residentCell.textContent();
    expect(text?.trim()).toBe('O');
  });

});

// ── AC4: feeding_rote override replaces player rote grid ──────────────────────

test.describe('Issue #327 — AC4: territory_overrides.feeding_rote drives matrix count', () => {

  test('Player rote grid all-none + feeding_rote override → NShore shows "O O"', async ({ page }) => {
    await setup(page, makeFeedingRoteOvrSub());
    await showMatrix(page);

    const row = await getIvanaRow(page);
    await expect(row).toBeVisible({ timeout: 5000 });
    const residentCell = row.locator('td.dt-matrix-resident');
    await expect(residentCell).toBeVisible({ timeout: 5000 });
    // Main grid counts NShore (1) + feeding_rote override counts NShore (1) = 2 → "O O"
    await expect(residentCell).toContainText('O O');
  });

});

// ── AC5: Rote feed processing entry renders feeding_rote pill row ──────────────

test.describe('Issue #327 — AC5: Rote feed processing entry has feeding_rote pills', () => {

  test('Rote feed entry expansion shows territory pill row with context feeding_rote', async ({ page }) => {
    await setup(page, makeIvanaSub());

    // Navigate to the processing queue projects phase
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(400);

    // The rote feed entry is routed to the feeding phase section (fix #317)
    const feedPhaseToggle = page.locator('[data-toggle-phase="feeding"]');
    await feedPhaseToggle.waitFor({ state: 'visible', timeout: 8000 });

    // Expand the feeding section if collapsed
    const toggleText = await feedPhaseToggle.textContent().catch(() => '');
    if (toggleText.includes('Show')) await feedPhaseToggle.click();
    await page.waitForTimeout(200);

    // Click the rote feed action row to expand it
    const feedSection = page.locator('.proc-phase-section').filter({ has: page.locator('[data-toggle-phase="feeding"]') });
    const actionRow = feedSection.locator('.proc-action-row').first();
    await actionRow.waitFor({ state: 'visible', timeout: 5000 });
    await actionRow.click();
    await page.waitForTimeout(400);

    // Expanded entry must contain a feeding_rote territory pill row
    const roteTerrPills = page.locator('.proc-terr-pill-row[data-terr-context="feeding_rote"]');
    await expect(roteTerrPills).toBeVisible({ timeout: 5000 });
  });

  test('Rote feed pills include North Shore pill', async ({ page }) => {
    await setup(page, makeIvanaSub());

    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(400);

    const feedPhaseToggle = page.locator('[data-toggle-phase="feeding"]');
    await feedPhaseToggle.waitFor({ state: 'visible', timeout: 8000 });
    const toggleText = await feedPhaseToggle.textContent().catch(() => '');
    if (toggleText.includes('Show')) await feedPhaseToggle.click();
    await page.waitForTimeout(200);

    const feedSection = page.locator('.proc-phase-section').filter({ has: page.locator('[data-toggle-phase="feeding"]') });
    const actionRow = feedSection.locator('.proc-action-row').first();
    await actionRow.waitFor({ state: 'visible', timeout: 5000 });
    await actionRow.click();
    await page.waitForTimeout(400);

    // N. Shore pill must be present in the feeding_rote pill row
    const nShorePill = page.locator(
      '.proc-terr-pill-row[data-terr-context="feeding_rote"] .proc-terr-pill[data-terr-id="northshore"]'
    );
    await expect(nShorePill).toBeVisible({ timeout: 5000 });
  });

  test('Rote feed pills pre-select NShore when player rote grid declares it', async ({ page }) => {
    await setup(page, makeIvanaSub());

    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(400);

    const feedPhaseToggle = page.locator('[data-toggle-phase="feeding"]');
    await feedPhaseToggle.waitFor({ state: 'visible', timeout: 8000 });
    const toggleText = await feedPhaseToggle.textContent().catch(() => '');
    if (toggleText.includes('Show')) await feedPhaseToggle.click();
    await page.waitForTimeout(200);

    const feedSection = page.locator('.proc-phase-section').filter({ has: page.locator('[data-toggle-phase="feeding"]') });
    const actionRow = feedSection.locator('.proc-action-row').first();
    await actionRow.waitFor({ state: 'visible', timeout: 5000 });
    await actionRow.click();
    await page.waitForTimeout(400);

    // N. Shore pill should be active because the player's rote grid declares it
    const nShorePill = page.locator(
      '.proc-terr-pill-row[data-terr-context="feeding_rote"] .proc-terr-pill[data-terr-id="northshore"]'
    );
    await expect(nShorePill).toHaveClass(/active/, { timeout: 5000 });
  });

});
