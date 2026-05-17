/**
 * issue-320: Autosave ST notes on DT Processing panel.
 *
 * Validates the third-pass live coverage added during Quinn QA discovery:
 *   - `.proc-feed-desc-ta` (project/feeding) → saves `description` on blur
 *   - `.proc-merit-desc-ta`                  → saves `description` on blur
 *   - `.proc-sorc-notes-input`               → saves `sorc_notes` on blur
 *
 * All three flow through a shared `_handleProcFieldBlur(ta, field)` that
 * dispatches `saveEntryReview(entry, { [field]: value.trim() })`. Tests
 * focus on the project-context path (single submission stub) since the
 * other contexts exercise the same shared handler.
 *
 * Scope deliberately excludes second-pass dormant handlers
 * (`.dt-proj-note`/`.dt-proj-writeup`/`.dt-merit-note`/`.dt-narr-textarea`) —
 * those target dead render functions and have no live surface to drive
 * from the test harness.
 *
 * Test scenarios:
 *   1. Project description blur-save dispatches PUT with `description` field.
 *   2. Cancel-button-preserves typed content (new behaviour — was discard).
 *   3. Status span flashes "Saved ✓" on successful save.
 *   4. No-op guard: blur with unchanged value does NOT fire a PUT.
 */

const { test, expect } = require('@playwright/test');

// ── Shared stubs ───────────────────────────────────────────────────────────────

const ST_USER = {
  id: '320000001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-320', character_ids: [], is_dual_role: false,
};

const CHAR_ALICE = {
  _id: 'char-alice-320', name: 'Alice Vunder', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Ordo Dracul', player: 'Alice Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null,
  retired: false,
  status: {
    city: 0, clan: 0,
    covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
  },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const TEST_CYCLE = {
  _id: 'cycle-320', cycle_number: 3, status: 'active',
  confirmed_ambience: {}, narrative_notes: '', phase_signoff: {},
};

// Project with patrol_scout action — known to land in Step 9 Support & Patrol per
// the issue-317 baseline. Any project action type would do; using a known-working one.
function makeProjSub(overrides = {}) {
  return {
    _id: 'sub-320-proj',
    cycle_id: 'cycle-320',
    character_name: 'Alice Vunder',
    character_id:   'char-alice-320',
    player_name:    'Alice Player',
    submitted_at:   '2026-05-15T00:00:00Z',
    _raw: {
      projects: [
        { action_type: 'patrol_scout', desired_outcome: 'Scout the docks', detail: '', primary_pool: { expression: '' } },
      ],
      feeding: null, sphere_actions: [],
      contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action: 'patrol_scout',
      project_1_title: 'Dock patrol',
      project_1_desired_outcome: 'Scout the docks',
    },
    projects_resolved: overrides.projects_resolved || [{}],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

// ── Setup helper ───────────────────────────────────────────────────────────────

async function setup(page, submissions) {
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
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/downtime_cycles'))      return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_ALICE._id, name: CHAR_ALICE.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR_ALICE]);
    if (url.includes('/api/territories'))          return ok([]);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForSelector('#dt-phase-ribbon', { state: 'visible', timeout: 8000 });
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
  // Step 1: expand the phase (action rows visible).
  // Step 2: expand the action row (action-detail visible, includes desc card).
  // Step 3: click Edit on the desc card so the textarea is exposed.
  await page.waitForSelector('[data-toggle-phase="support_patrol"]', { state: 'visible', timeout: 10000 });
  await page.locator('[data-toggle-phase="support_patrol"]').first().click();
  await page.waitForSelector('.proc-action-row', { state: 'visible', timeout: 5000 });
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-feed-desc-edit-btn', { state: 'visible', timeout: 5000 });
  await page.locator('.proc-feed-desc-edit-btn').first().click();
  await page.waitForSelector('.proc-feed-desc-ta', { state: 'visible', timeout: 5000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('issue-320: ST-input autosave (third pass — live processing queue)', () => {

  test('project description: blur-save dispatches PUT with `description` field, preserving existing entry fields', async ({ page }) => {
    // Seed an existing resolved entry so we can verify the non-clobber merge
    // (saveEntryReview spreads `current` before applying the patch).
    const sub = makeProjSub({
      projects_resolved: [{
        action_type: 'patrol_scout',
        pool_status: 'confirmed',
        pool_validated: 'Wits 3 + Stealth 2',
        notes_thread: [{ author_id: '1', author_name: 'ST', text: 'pre-existing note', created_at: '2026-05-15T12:00:00Z' }],
      }],
    });
    await setup(page, [sub]);

    const reqPromise = page.waitForRequest(
      req => req.method() === 'PUT'
        && req.url().includes('/api/downtime_submissions/sub-320-proj')
        && (req.postDataJSON()?.projects_resolved?.[0]?.description === 'Description typed by ST'),
      { timeout: 5000 },
    );

    await page.locator('.proc-feed-desc-ta').first().fill('Description typed by ST');
    await page.locator('#dt-phase-ribbon').click();

    const req = await reqPromise;
    const body = req.postDataJSON();
    expect(body.projects_resolved).toBeTruthy();
    expect(body.projects_resolved[0].description).toBe('Description typed by ST');
    // Non-clobber: pre-existing fields survive the merge.
    expect(body.projects_resolved[0].action_type).toBe('patrol_scout');
    expect(body.projects_resolved[0].pool_status).toBe('confirmed');
    expect(body.projects_resolved[0].pool_validated).toBe('Wits 3 + Stealth 2');
    expect(body.projects_resolved[0].notes_thread).toHaveLength(1);
    expect(body.projects_resolved[0].notes_thread[0].text).toBe('pre-existing note');
  });

  test('Cancel button: typed content persists (new behaviour — was discard)', async ({ page }) => {
    await setup(page, [makeProjSub()]);

    const reqPromise = page.waitForRequest(
      req => req.method() === 'PUT'
        && req.url().includes('/api/downtime_submissions/sub-320-proj')
        && (req.postDataJSON()?.projects_resolved?.[0]?.description === 'Should still save on cancel'),
      { timeout: 5000 },
    );

    await page.locator('.proc-feed-desc-ta').first().fill('Should still save on cancel');
    // Click Cancel — focus leaves the textarea, blur fires, save lands.
    await page.locator('.proc-feed-desc-cancel-btn').first().click();

    const req = await reqPromise;
    const body = req.postDataJSON();
    expect(body.projects_resolved[0].description).toBe('Should still save on cancel');
  });

  test('Status span flashes "Saved ✓" after a successful save', async ({ page }) => {
    await setup(page, [makeProjSub()]);

    await page.locator('.proc-feed-desc-ta').first().fill('Status check');
    await page.locator('#dt-phase-ribbon').click();

    // Span lives in the same .proc-proj-field wrapper, keyed on data-field="description".
    const statusEl = page.locator('.dt-autosave-status[data-field="description"]').first();
    await expect(statusEl).toHaveText('Saved ✓', { timeout: 3000 });
  });

  test('No-op guard: blur with unchanged value does NOT fire PUT', async ({ page }) => {
    // Seed the resolved entry with a saved description matching what we'll re-blur.
    const sub = makeProjSub({
      projects_resolved: [{ action_type: 'patrol_scout', description: 'Pre-existing description' }],
    });
    await setup(page, [sub]);

    let putCount = 0;
    page.on('request', req => {
      if (req.method() === 'PUT'
        && req.url().includes('/api/downtime_submissions/sub-320-proj')) {
        putCount++;
      }
    });

    // Focus, then blur without changing the value.
    await page.locator('.proc-feed-desc-ta').first().focus();
    await page.locator('#dt-phase-ribbon').click();
    await page.waitForTimeout(750);

    expect(putCount).toBe(0);
  });

});
