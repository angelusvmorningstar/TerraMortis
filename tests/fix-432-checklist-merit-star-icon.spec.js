/**
 * Regression tests for fix #432 — Submission Checklist A/S/R/C cells never show ★
 *
 * Root cause: _chkState merit slot branch used `_CHK_TERMINAL_STATUSES.has(ps)`
 * (catches 'resolved'/'no_effect' → X) and `ps === 'validated'` (never written by
 * merit actions → ★ never fires). Merit actions use 'confirmed'/'resolved'/'no_effect'
 * vocabulary, not 'validated'.
 *
 * Fix: replace two generic checks with explicit merit vocabulary in _chkState:
 *   X: skipped | no_action | no_roll | maintenance
 *   ★: confirmed | rolled | resolved | no_effect
 *
 * AC-1: pool_status 'confirmed' → A1 shows ★ (was: O — fell through to unsighted)
 * AC-2: pool_status 'rolled'    → A1 shows ★ (was: O — fell through to unsighted)
 * AC-3: pool_status 'resolved'  → A1 shows ★ (was: X — caught by _CHK_TERMINAL_STATUSES)
 * AC-4: pool_status 'no_effect' → A1 shows ★ (was: X — caught by _CHK_TERMINAL_STATUSES)
 * AC-5: pool_status 'skipped'   → A1 shows X (regression guard — must stay X)
 * AC-6: pool_status 'no_roll'   → A1 shows X (regression guard — must stay X)
 * AC-7: A/S/R/C all show ★ for 'resolved' — fix applies to all four merit groups
 * AC-8: Projects path unchanged — 'validated' still → ★ for P1
 * AC-9: Unprocessed slot (no pool_status) → O (baseline)
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000432', username: 'test_st_432', global_name: 'Test ST 432',
  avatar: null, role: 'st', player_id: 'p-432', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-432', cycle_number: 3, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

const CHAR_MERIT = {
  _id: 'char-merit-432',
  name: 'Merit Tester', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

// ── Submission builders ───────────────────────────────────────────────────────

// Sets merit_actions directly so _getSubMeritActions returns it without _raw parsing.
// The slot map categorises by merit_type, then _chkState reads merit_actions_resolved[gIdx].

function buildAlliesSub(poolStatus) {
  const resolved = poolStatus ? [{ pool_status: poolStatus }] : [];
  return {
    _id: `sub-allies-432-${poolStatus || 'empty'}`,
    cycle_id: 'cycle-432',
    character_id: 'char-merit-432',
    character_name: 'Merit Tester',
    player_name: 'Test Player',
    status: 'submitted',
    responses: {},
    _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    merit_actions: [{ merit_type: 'Allies 2 (Police)', action_type: 'patrol_scout' }],
    projects_resolved: [],
    merit_actions_resolved: resolved,
    st_review: { territory_overrides: {} },
    acquisitions_resolved: [],
    st_narrative: {},
  };
}

function buildStatusSub(poolStatus) {
  return {
    _id: `sub-status-432-${poolStatus}`,
    cycle_id: 'cycle-432',
    character_id: 'char-merit-432',
    character_name: 'Merit Tester',
    player_name: 'Test Player',
    status: 'submitted',
    responses: {},
    _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    merit_actions: [{ merit_type: 'Status 2 (Invictus)', action_type: 'misc' }],
    projects_resolved: [],
    merit_actions_resolved: [{ pool_status: poolStatus }],
    st_review: { territory_overrides: {} },
    acquisitions_resolved: [],
    st_narrative: {},
  };
}

function buildRetainerSub(poolStatus) {
  return {
    _id: `sub-retainer-432-${poolStatus}`,
    cycle_id: 'cycle-432',
    character_id: 'char-merit-432',
    character_name: 'Merit Tester',
    player_name: 'Test Player',
    status: 'submitted',
    responses: {},
    _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    merit_actions: [{ merit_type: 'Retainer', action_type: '' }],
    projects_resolved: [],
    merit_actions_resolved: [{ pool_status: poolStatus }],
    st_review: { territory_overrides: {} },
    acquisitions_resolved: [],
    st_narrative: {},
  };
}

function buildContactsSub(poolStatus) {
  return {
    _id: `sub-contacts-432-${poolStatus}`,
    cycle_id: 'cycle-432',
    character_id: 'char-merit-432',
    character_name: 'Merit Tester',
    player_name: 'Test Player',
    status: 'submitted',
    responses: {},
    _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    merit_actions: [{ merit_type: 'Contacts', action_type: '' }],
    projects_resolved: [],
    merit_actions_resolved: [{ pool_status: poolStatus }],
    st_review: { territory_overrides: {} },
    acquisitions_resolved: [],
    st_narrative: {},
  };
}

// ── Setup ────────────────────────────────────────────────────────────────────

async function setup(page, submissions) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CHAR_MERIT]) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CHAR_MERIT].map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific }))) })
  );
  await page.route('**/api/downtime_cycles*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) })
  );
  await page.route('**/api/downtime_submissions*', route => {
    if (['PATCH', 'PUT', 'POST'].includes(route.request().method()))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(submissions) });
  });
  await page.route('**/api/territories*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/session_logs*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForSelector('.dt-chk-table', { timeout: 8000 });
  await page.waitForTimeout(300);
}

// ── Helper: resolve the cell for a given checklist column key ─────────────────

async function getChecklistCell(page, charName, columnKey) {
  return page.evaluate(({ name, key }) => {
    const table = document.querySelector('.dt-chk-table');
    if (!table) return null;
    const ths = [...table.querySelectorAll('thead th')];
    const colIdx = ths.findIndex(th => th.getAttribute('title') === key);
    if (colIdx < 0) return null;
    const rows = [...table.querySelectorAll('tbody tr')];
    const row = rows.find(r => r.querySelector('.dt-chk-name')?.textContent.trim().toLowerCase().includes(name.toLowerCase()));
    if (!row) return null;
    const cells = [...row.querySelectorAll('td')];
    const cell = cells[colIdx];
    return cell ? { className: cell.className, text: cell.textContent.trim() } : null;
  }, { name: charName, key: columnKey });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.432: Checklist merit slot star icon (A/S/R/C columns)', () => {

  // ── AC-1: confirmed → ★ ───────────────────────────────────────────────────

  test('AC-1: pool_status "confirmed" → A1 shows ★ (dt-chk-confirmed)', async ({ page }) => {
    await setup(page, [buildAlliesSub('confirmed')]);
    const cell = await getChecklistCell(page, 'Merit Tester', 'allies_1');
    expect(cell).not.toBeNull();
    expect(cell.className).toContain('dt-chk-confirmed');
    expect(cell.className).not.toContain('dt-chk-unsighted');
    expect(cell.text).toBe('★');
  });

  // ── AC-2: rolled → ★ ──────────────────────────────────────────────────────

  test('AC-2: pool_status "rolled" → A1 shows ★ (dt-chk-confirmed)', async ({ page }) => {
    await setup(page, [buildAlliesSub('rolled')]);
    const cell = await getChecklistCell(page, 'Merit Tester', 'allies_1');
    expect(cell).not.toBeNull();
    expect(cell.className).toContain('dt-chk-confirmed');
    expect(cell.text).toBe('★');
  });

  // ── AC-3: resolved → ★ (was X before fix) ────────────────────────────────

  test('AC-3: pool_status "resolved" → A1 shows ★, not X (was broken by _CHK_TERMINAL_STATUSES)', async ({ page }) => {
    await setup(page, [buildAlliesSub('resolved')]);
    const cell = await getChecklistCell(page, 'Merit Tester', 'allies_1');
    expect(cell).not.toBeNull();
    expect(cell.className).toContain('dt-chk-confirmed');
    expect(cell.className).not.toContain('dt-chk-no-action');
    expect(cell.text).toBe('★');
  });

  // ── AC-4: no_effect → ★ (was X before fix) ───────────────────────────────

  test('AC-4: pool_status "no_effect" → A1 shows ★, not X (was broken by _CHK_TERMINAL_STATUSES)', async ({ page }) => {
    await setup(page, [buildAlliesSub('no_effect')]);
    const cell = await getChecklistCell(page, 'Merit Tester', 'allies_1');
    expect(cell).not.toBeNull();
    expect(cell.className).toContain('dt-chk-confirmed');
    expect(cell.className).not.toContain('dt-chk-no-action');
    expect(cell.text).toBe('★');
  });

  // ── AC-5: skipped → X (regression guard) ─────────────────────────────────

  test('AC-5: pool_status "skipped" → A1 shows X (dt-chk-no-action, regression guard)', async ({ page }) => {
    await setup(page, [buildAlliesSub('skipped')]);
    const cell = await getChecklistCell(page, 'Merit Tester', 'allies_1');
    expect(cell).not.toBeNull();
    expect(cell.className).toContain('dt-chk-no-action');
    expect(cell.className).not.toContain('dt-chk-confirmed');
    expect(cell.text).toBe('X');
  });

  // ── AC-6: no_roll → X (regression guard) ─────────────────────────────────

  test('AC-6: pool_status "no_roll" → A1 shows X (dt-chk-no-action, regression guard)', async ({ page }) => {
    await setup(page, [buildAlliesSub('no_roll')]);
    const cell = await getChecklistCell(page, 'Merit Tester', 'allies_1');
    expect(cell).not.toBeNull();
    expect(cell.className).toContain('dt-chk-no-action');
    expect(cell.text).toBe('X');
  });

  // ── AC-7a: Status column (S1) shows ★ ────────────────────────────────────

  test('AC-7a: Status action "resolved" → S1 shows ★', async ({ page }) => {
    await setup(page, [buildStatusSub('resolved')]);
    const cell = await getChecklistCell(page, 'Merit Tester', 'status_1');
    expect(cell).not.toBeNull();
    expect(cell.className).toContain('dt-chk-confirmed');
    expect(cell.text).toBe('★');
  });

  // ── AC-7b: Retainers column (R1) shows ★ ─────────────────────────────────

  test('AC-7b: Retainer action "resolved" → R1 shows ★', async ({ page }) => {
    await setup(page, [buildRetainerSub('resolved')]);
    const cell = await getChecklistCell(page, 'Merit Tester', 'retainers_1');
    expect(cell).not.toBeNull();
    expect(cell.className).toContain('dt-chk-confirmed');
    expect(cell.text).toBe('★');
  });

  // ── AC-7c: Contacts column (C1) shows ★ ──────────────────────────────────

  test('AC-7c: Contacts action "resolved" → C1 shows ★', async ({ page }) => {
    await setup(page, [buildContactsSub('resolved')]);
    const cell = await getChecklistCell(page, 'Merit Tester', 'contacts_1');
    expect(cell).not.toBeNull();
    expect(cell.className).toContain('dt-chk-confirmed');
    expect(cell.text).toBe('★');
  });

  // ── AC-8: Projects path unchanged — validated still → ★ ──────────────────

  test('AC-8: project pool_status "validated" → P1 shows ★ (projects path regression guard)', async ({ page }) => {
    const sub = {
      _id: 'sub-proj-432',
      cycle_id: 'cycle-432',
      character_id: 'char-merit-432',
      character_name: 'Merit Tester',
      player_name: 'Test Player',
      status: 'submitted',
      responses: {},
      _raw: {
        projects: [{ action_type: 'grow', desired_outcome: 'Grow Allies', description: 'Build network', primary_pool: { expression: 'Presence 3 + Persuasion 2 = 5' } }],
        feeding: null,
        sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
      },
      merit_actions: [],
      projects_resolved: [{ pool_status: 'validated', pool_validated: 'Presence 3 + Persuasion 2 = 5' }],
      merit_actions_resolved: [],
      st_review: { territory_overrides: {} },
      acquisitions_resolved: [],
      st_narrative: {},
    };
    await setup(page, [sub]);
    const cell = await getChecklistCell(page, 'Merit Tester', 'project_1');
    expect(cell).not.toBeNull();
    expect(cell.className).toContain('dt-chk-confirmed');
    expect(cell.text).toBe('★');
  });

  // ── AC-9: Unprocessed slot (no pool_status) → O ───────────────────────────

  test('AC-9: unprocessed Allies slot (no pool_status) → A1 shows O (dt-chk-unsighted)', async ({ page }) => {
    await setup(page, [buildAlliesSub(null)]);
    const cell = await getChecklistCell(page, 'Merit Tester', 'allies_1');
    expect(cell).not.toBeNull();
    expect(cell.className).toContain('dt-chk-unsighted');
    expect(cell.className).not.toContain('dt-chk-confirmed');
    expect(cell.text).toBe('O');
  });

});
