/**
 * Regression tests for issue #423 — Resources acquisition falsely blocks
 * Allies & Asset Summary completion (meritSummaryComplete).
 *
 * Root cause: meritSummaryComplete read merit_actions_resolved[i].outcome_summary
 * for all entries, but Resources acquisitions are processed into acquisitions_resolved[],
 * never merit_actions_resolved. Fix checks acquisitions_resolved[0].pool_status for
 * entries whose deriveMeritCategory() returns 'resources'.
 *
 * NOTE: initDtStory (downtime-story.js:170-173) always rebuilds merit_actions via
 * buildMeritActions(sub) — pre-populating merit_actions in fixtures is silently
 * overwritten. Fixtures must provide responses/acq fields that buildMeritActions reads.
 *
 * buildMeritActions ordering: spheres → contacts → retainers → resources → skills → status
 * So responses-only Resources entry → merit_actions[0]; Allies+Resources → [0]=allies, [1]=resources.
 *
 * AC-1: Resources acquisition validated → Allies & Asset Summary section shows green dot
 * AC-2: Resources acquisition validated → "All outcomes recorded" badge shown
 * AC-3: "X outcomes still to record" counter does not count a validated/skipped resources acq
 * AC-4: Resources acquisition not yet validated → section stays amber + counted in missing total
 * AC-5: Non-resources categories (allies, status) still require outcome_summary — no regression
 * AC-6: Submission with no Resources merit action works correctly — no regression
 */

const { test, expect } = require('@playwright/test');

// ── Shared auth / cycle ────────────────────────────────────────────────────────

const ST_USER = {
  id: '999000423', username: 'test_st_423', global_name: 'Test ST 423',
  avatar: null, role: 'st', player_id: 'p-423', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-423', cycle_number: 3, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

// ── Character fixture ─────────────────────────────────────────────────────────

const CHAR_CARVER = {
  _id: 'char-carver-423',
  name: 'Carver', moniker: null, honorific: null,
  clan: 'Ventrue', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 3, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 3, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {},
  disciplines: {},
  merits: [
    { name: 'Resources', category: 'general', rating: 3 },
    { name: 'Allies', category: 'influence', rating: 2, qualifier: 'Police' },
  ],
  powers: [], ordeals: [],
};

// ── Submission builder ─────────────────────────────────────────────────────────
// NOTE: do NOT set merit_actions — initDtStory always overwrites it via buildMeritActions.
// Use responses/acq fields that buildMeritActions reads.

function buildSub(overrides = {}) {
  return {
    _id: 'sub-carver-423',
    cycle_id: 'cycle-423',
    character_id: 'char-carver-423',
    character_name: 'Carver',
    player_name: 'Test Player',
    status: 'submitted',
    responses: { feeding_method: 'seduction' },
    _raw: {},
    projects_resolved: [],
    merit_actions_resolved: [],
    acquisitions_resolved: [],
    st_narrative: {},
    ...overrides,
  };
}

// ── Resources-only fixtures ────────────────────────────────────────────────────
// buildMeritActions reads responses['resources_acquisitions'] blob when no acq_resource_rows.
// With only resources in responses, buildMeritActions → merit_actions[0] = Resources acquisition.

const SUB_RESOURCES_VALIDATED = buildSub({
  responses: { feeding_method: 'seduction', resources_acquisitions: 'Buy a Retainer' },
  merit_actions_resolved: [],                            // empty — outcome_summary never written by acq path
  acquisitions_resolved: [{ pool_status: 'validated' }],
});

const SUB_RESOURCES_SKIPPED = buildSub({
  responses: { feeding_method: 'seduction', resources_acquisitions: 'Buy something' },
  merit_actions_resolved: [],
  acquisitions_resolved: [{ pool_status: 'skipped' }],
});

const SUB_RESOURCES_PENDING = buildSub({
  responses: { feeding_method: 'seduction', resources_acquisitions: 'Buy a Retainer' },
  merit_actions_resolved: [],
  acquisitions_resolved: [],                             // not yet processed
});

// ── Mixed fixtures (Allies + Resources) ──────────────────────────────────────
// buildMeritActions → merit_actions[0]=Allies(Police), merit_actions[1]=Resources
// merit_actions_resolved[0] is for the Allies entry; [1] for Resources (unused by fix)

const SUB_MIXED_COMPLETE = buildSub({
  responses: {
    feeding_method: 'seduction',
    sphere_1_merit: 'Allies (Police)',
    sphere_1_action: 'hide_protect',
    sphere_1_outcome: 'Protect contacts',
    sphere_1_description: 'Keep them safe.',
    resources_acquisitions: 'Buy equipment',
  },
  merit_actions_resolved: [
    { pool_status: 'validated', outcome_summary: 'Police allies shielded the operation.' },
  ],
  acquisitions_resolved: [{ pool_status: 'validated' }],
});

// Allies entry lacks outcome_summary even though resources is validated → still incomplete
const SUB_MIXED_ALLIES_MISSING = buildSub({
  responses: {
    feeding_method: 'seduction',
    sphere_1_merit: 'Allies (Police)',
    sphere_1_action: 'hide_protect',
    sphere_1_outcome: 'Protect contacts',
    sphere_1_description: 'Keep them safe.',
    resources_acquisitions: 'Buy equipment',
  },
  merit_actions_resolved: [
    { pool_status: 'validated' },                        // validated but NO outcome_summary
  ],
  acquisitions_resolved: [{ pool_status: 'validated' }],
});

// ── Allies-only fixtures (regression guard) ────────────────────────────────────

const SUB_ALLIES_COMPLETE = buildSub({
  responses: {
    sphere_1_merit: 'Allies (Police)',
    sphere_1_action: 'patrol_scout',
    sphere_1_outcome: 'Scout district',
    sphere_1_description: 'Watch the streets.',
  },
  merit_actions_resolved: [
    { pool_status: 'validated', outcome_summary: 'Spotted suspicious activity near the docks.' },
  ],
});

const SUB_ALLIES_PENDING = buildSub({
  responses: {
    sphere_1_merit: 'Allies (Police)',
    sphere_1_action: 'patrol_scout',
    sphere_1_outcome: 'Scout district',
    sphere_1_description: 'Watch the streets.',
  },
  merit_actions_resolved: [],                            // no outcome_summary
});

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function setupDtStory(page, submissions, chars) {
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
    if (url.includes('/api/downtime_cycles'))       return ok([ACTIVE_CYCLE]);
    if (url.includes('/api/characters/names'))      return ok(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))            return ok(chars);
    if (url.includes('/api/territories'))           return ok([]);
    if (url.includes('/api/game_sessions'))         return ok([]);
    if (url.includes('/api/session_logs'))          return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);

  await page.click('#dt-phase-ribbon .pr-tab[data-phase="story"]');
  await page.waitForSelector('#dt-story-nav-rail', { timeout: 8000 });
  await page.waitForTimeout(500);
}

async function openCharacter(page, charId) {
  await page.click(`.dt-story-pill[data-char-id="${charId}"]`);
  await page.waitForSelector('.dt-story-section', { timeout: 8000 });
  await page.waitForTimeout(300);
}

async function getMeritSummaryDotClass(page) {
  return page.evaluate(() => {
    const section = document.querySelector('.dt-story-section[data-section="merit_summary"]');
    if (!section) return null;
    const dot = section.querySelector('.dt-story-completion-dot');
    return dot ? dot.className : null;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.423: Resources acquisition merit summary completion', () => {

  // ── AC-1: Resources validated → green dot ─────────────────────────────────

  test('AC-1: resources acquisition validated → merit summary section shows green (complete) dot', async ({ page }) => {
    await setupDtStory(page, [SUB_RESOURCES_VALIDATED], [CHAR_CARVER]);
    await openCharacter(page, 'char-carver-423');

    const dotClass = await getMeritSummaryDotClass(page);
    expect(dotClass).not.toBeNull();
    expect(dotClass).toContain('dt-story-dot-complete');
    expect(dotClass).not.toContain('dt-story-dot-pending');
  });

  // ── AC-2/3: validated → badge shown, no counter ───────────────────────────

  test('AC-2: resources acquisition validated → "All outcomes recorded" badge is shown', async ({ page }) => {
    await setupDtStory(page, [SUB_RESOURCES_VALIDATED], [CHAR_CARVER]);
    await openCharacter(page, 'char-carver-423');

    const section = page.locator('.dt-story-section[data-section="merit_summary"]');
    await expect(section).toContainText('All outcomes recorded');
  });

  test('AC-3: resources acquisition validated → "still to record" counter is not shown', async ({ page }) => {
    await setupDtStory(page, [SUB_RESOURCES_VALIDATED], [CHAR_CARVER]);
    await openCharacter(page, 'char-carver-423');

    const section = page.locator('.dt-story-section[data-section="merit_summary"]');
    await expect(section).not.toContainText('still to record');
  });

  // ── AC-1 variant: skipped acquisition also completes ─────────────────────

  test('resources acquisition skipped → merit summary section shows green (complete) dot', async ({ page }) => {
    await setupDtStory(page, [SUB_RESOURCES_SKIPPED], [CHAR_CARVER]);
    await openCharacter(page, 'char-carver-423');

    const dotClass = await getMeritSummaryDotClass(page);
    expect(dotClass).not.toBeNull();
    expect(dotClass).toContain('dt-story-dot-complete');
  });

  // ── AC-4: not yet validated → still amber + counted ───────────────────────

  test('AC-4: resources acquisition not yet validated → merit summary section shows amber (pending) dot', async ({ page }) => {
    await setupDtStory(page, [SUB_RESOURCES_PENDING], [CHAR_CARVER]);
    await openCharacter(page, 'char-carver-423');

    const dotClass = await getMeritSummaryDotClass(page);
    expect(dotClass).not.toBeNull();
    expect(dotClass).toContain('dt-story-dot-pending');
    expect(dotClass).not.toContain('dt-story-dot-complete');
  });

  test('AC-4: resources acquisition not yet validated → "still to record" counter shown', async ({ page }) => {
    await setupDtStory(page, [SUB_RESOURCES_PENDING], [CHAR_CARVER]);
    await openCharacter(page, 'char-carver-423');

    const section = page.locator('.dt-story-section[data-section="merit_summary"]');
    await expect(section).toContainText('still to record');
    await expect(section).not.toContainText('All outcomes recorded');
  });

  // ── AC-5: non-resources categories unaffected ─────────────────────────────

  test('AC-5: allies with outcome_summary + resources validated → merit summary complete', async ({ page }) => {
    await setupDtStory(page, [SUB_MIXED_COMPLETE], [CHAR_CARVER]);
    await openCharacter(page, 'char-carver-423');

    const dotClass = await getMeritSummaryDotClass(page);
    expect(dotClass).not.toBeNull();
    expect(dotClass).toContain('dt-story-dot-complete');
  });

  test('AC-5: allies missing outcome_summary (even with resources validated) → merit summary pending', async ({ page }) => {
    await setupDtStory(page, [SUB_MIXED_ALLIES_MISSING], [CHAR_CARVER]);
    await openCharacter(page, 'char-carver-423');

    const dotClass = await getMeritSummaryDotClass(page);
    expect(dotClass).not.toBeNull();
    expect(dotClass).toContain('dt-story-dot-pending');
  });

  test('AC-5: allies-only submission with outcome_summary → merit summary complete (regression)', async ({ page }) => {
    await setupDtStory(page, [SUB_ALLIES_COMPLETE], [CHAR_CARVER]);
    await openCharacter(page, 'char-carver-423');

    const dotClass = await getMeritSummaryDotClass(page);
    expect(dotClass).not.toBeNull();
    expect(dotClass).toContain('dt-story-dot-complete');
  });

  test('AC-5: allies-only submission without outcome_summary → merit summary pending (regression)', async ({ page }) => {
    await setupDtStory(page, [SUB_ALLIES_PENDING], [CHAR_CARVER]);
    await openCharacter(page, 'char-carver-423');

    const dotClass = await getMeritSummaryDotClass(page);
    expect(dotClass).not.toBeNull();
    expect(dotClass).toContain('dt-story-dot-pending');
  });

  // ── AC-6: no Resources merit → no regression ─────────────────────────────

  test('AC-6: submission with no merit actions → Allies & Asset Summary section not shown', async ({ page }) => {
    const subNoMerits = buildSub({ responses: { feeding_method: 'seduction' } });
    await setupDtStory(page, [subNoMerits], [CHAR_CARVER]);
    await openCharacter(page, 'char-carver-423');

    const section = page.locator('.dt-story-section[data-section="merit_summary"]');
    await expect(section).toHaveCount(0);
  });

});
