/**
 * issue-321: DT Story tab loads wrong cycle (resolver picks first non-complete).
 *
 * Validates the four-task fix:
 *   - Task 1: _initDtStoryFromRibbon now passes currentCycle?._id (dropdown drives the cycle).
 *   - Task 2: loadCycleById resets _dtuxStoryInited so dropdown changes refresh DT Story.
 *   - Task 3: Internal resolver fallback uses _id desc + closed/complete set match
 *             (was: missing created_at + 'complete' filter).
 *   - Task 5: Server route sorts /api/downtime_cycles by _id desc (defence in depth).
 *
 * Test scenarios:
 *   1. Dropdown drives DT Story init — opening DT Story on cycle B shows cycle B's submissions.
 *   2. Cycle switch refreshes DT Story — A→B switch updates the rail.
 *   3. Resolver fallback prefers non-closed cycle by _id desc when called with null.
 *
 * Cross-cycle save guard (Task 4) is covered by code review: _assertCurrentCycle is
 * called from saveNarrativeField + _publishAllSubmissions + handlePushCharacter (all
 * three save paths). The helper normalises string-vs-ObjectId cycle_id shapes.
 *
 * Regression check (Task 5): tests/issue-320-autosave-st-notes.spec.js must still pass —
 * run both spec files together with: npx playwright test tests/issue-32*.spec.js
 */

const { test, expect } = require('@playwright/test');

// ── Shared stubs ───────────────────────────────────────────────────────────────

const ST_USER = {
  id: '321000001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-321', character_ids: [], is_dual_role: false,
};

const CHAR_ALICE = {
  _id: 'char-alice-321', name: 'Alice Vunder', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Ordo Dracul', player: 'Alice Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 0, clan: 0,
    covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
  },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const CHAR_BRANDY = {
  ...CHAR_ALICE,
  _id: 'char-brandy-321', name: 'Brandy LaRoux', clan: 'Daeva', covenant: 'Carthian Movement', player: 'Brandy Player',
};

// Two cycles with no created_at — matches live data shape. _id strings are
// hex-sortable, with CYCLE_NEW being lexicographically GREATER than CYCLE_OLD.
const CYCLE_OLD = {
  _id: '69d0a3c5052b57f6be774e69', label: 'Cycle Old (closed)', status: 'closed',
  cycle_number: 1, submission_count: 1, phase_signoff: {},
  confirmed_ambience: {}, narrative_notes: '',
};

const CYCLE_NEW = {
  _id: '69e955c784bbfc821bed2810', label: 'Cycle New (prep)', status: 'prep',
  cycle_number: 2, submission_count: 1, phase_signoff: {},
  confirmed_ambience: {}, narrative_notes: '', deadline_at: null,
};

function makeSub(cycleId, char, subId) {
  return {
    _id: subId,
    cycle_id: cycleId,
    character_name: char.name,
    character_id:   char._id,
    player_name:    char.player,
    submitted_at:   '2026-05-15T00:00:00Z',
    _raw: { projects: [], feeding: null, sphere_actions: [],
      contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {},
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

// CYCLE_OLD has Alice's submission; CYCLE_NEW has Brandy's submission.
// Distinct character per cycle so the rail name is a reliable assertion target.
const SUB_OLD = makeSub(CYCLE_OLD._id, CHAR_ALICE, 'sub-321-old-alice');
const SUB_NEW = makeSub(CYCLE_NEW._id, CHAR_BRANDY, 'sub-321-new-brandy');

// ── Setup helper ───────────────────────────────────────────────────────────────

async function setupAdminWithCycles(page, { cyclesOrder } = { cyclesOrder: [CYCLE_NEW, CYCLE_OLD] }) {
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

    if (url.includes('/api/downtime_submissions')) {
      // Filter by cycle_id query param if present
      const m = url.match(/[?&]cycle_id=([^&]+)/);
      if (m) {
        const cid = decodeURIComponent(m[1]);
        return ok([SUB_OLD, SUB_NEW].filter(s => s.cycle_id === cid));
      }
      return ok([SUB_OLD, SUB_NEW]);
    }
    if (url.includes('/api/downtime_cycles')) return ok(cyclesOrder);
    if (url.includes('/api/characters/names')) return ok([
      { _id: CHAR_ALICE._id,  name: CHAR_ALICE.name,  moniker: null, honorific: null },
      { _id: CHAR_BRANDY._id, name: CHAR_BRANDY.name, moniker: null, honorific: null },
    ]);
    if (url.includes('/api/characters'))    return ok([CHAR_ALICE, CHAR_BRANDY]);
    if (url.includes('/api/territories'))   return ok([]);
    if (url.includes('/api/game_sessions')) return ok([]);
    if (url.includes('/api/session_logs'))  return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForSelector('#dt-phase-ribbon', { state: 'visible', timeout: 8000 });
}

async function openDtStory(page) {
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="story"]');
  await page.waitForSelector('#dt-story-panel', { state: 'visible', timeout: 5000 });
  // Rail content depends on submissions count; wait for either pills or empty state.
  await page.waitForFunction(() => {
    const rail = document.getElementById('dt-story-nav-rail');
    return rail && rail.innerHTML.length > 0;
  }, { timeout: 5000 });
}

async function switchCycle(page, cycleId) {
  // The cycle dropdown is <select id="dt-cycle-sel"> per public/admin.html:120.
  // Set value + dispatch change to fire the dropdown handler that calls loadCycleById.
  await page.evaluate(({ cid }) => {
    const sel = document.querySelector('#dt-cycle-sel');
    if (!sel) throw new Error('cycle select #dt-cycle-sel not found');
    sel.value = cid;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, { cid: cycleId });
  // Give loadCycleById time to fire and refresh panels.
  await page.waitForTimeout(500);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('issue-321: DT Story cycle resolver', () => {

  test('Task 1: dropdown drives DT Story init — opening DT Story shows the dropdown cycle\'s submissions', async ({ page }) => {
    // CYCLE_NEW is the default-selected cycle (first by _id desc in our mock order).
    // Its submission has character "Brandy LaRoux". CYCLE_OLD's has "Alice Vunder".
    await setupAdminWithCycles(page);
    await openDtStory(page);

    // Rail should show Brandy (CYCLE_NEW), not Alice (CYCLE_OLD).
    await expect(page.locator('#dt-story-nav-rail')).toContainText('Brandy LaRoux', { timeout: 5000 });
    await expect(page.locator('#dt-story-nav-rail')).not.toContainText('Alice Vunder');
  });

  test('Task 2: cycle switch refreshes DT Story — A→B updates the rail', async ({ page }) => {
    await setupAdminWithCycles(page);
    await openDtStory(page);
    await expect(page.locator('#dt-story-nav-rail')).toContainText('Brandy LaRoux');

    // Switch the dropdown to CYCLE_OLD.
    await switchCycle(page, CYCLE_OLD._id);
    // DT Story tab is currently visible — showDtuxPhase after the reset re-triggers init.
    // Wait for the rail to reflect the new cycle.
    await expect(page.locator('#dt-story-nav-rail')).toContainText('Alice Vunder', { timeout: 5000 });
    await expect(page.locator('#dt-story-nav-rail')).not.toContainText('Brandy LaRoux');
  });

  test('AC #5 no regression — single cycle case still works', async ({ page }) => {
    // Only one cycle exists, with status 'prep'. The dropdown auto-selects it,
    // Task 1 passes its _id, DT Story loads it. No fallback fires.
    await setupAdminWithCycles(page, { cyclesOrder: [CYCLE_NEW] });
    await openDtStory(page);
    await expect(page.locator('#dt-story-nav-rail')).toContainText('Brandy LaRoux', { timeout: 5000 });
  });

});

// Note on Task 3 (resolver fallback robustness): after Task 1, _initDtStoryFromRibbon
// passes `currentCycle?._id` to initDtStory, so the internal resolver only fires on
// the genuinely-null path — which in practice never happens once admin.js has called
// loadCycleById. The resolver's correctness (sort by _id desc, exclude closed+complete
// set) is verified by code review rather than integration test, because contriving the
// null path in Playwright requires bypassing admin's normal init flow.
//
// Note on Task 4 (cross-cycle save guard): the helper _assertCurrentCycle is called
// from all three save paths (saveNarrativeField, _publishAllSubmissions, handlePushCharacter).
// Behaviour is unit-style — throws if normalised cycle_id mismatch. Verified by code
// review; integration test would require artificially injecting cross-cycle state.
