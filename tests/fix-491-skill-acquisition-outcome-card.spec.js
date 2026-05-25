/**
 * Regression tests for fix #491 — Skill acquisition actions show Outcome card
 * instead of Validation Status card, and outcome_summary flows to Allies & Asset Summary.
 *
 * Root causes:
 *   A. downtime-views.js:9108 — Validation Status condition included `entry.source === 'acquisition'`
 *      because only `entry.source === 'merit'` was excluded. Skill acquisitions fell through
 *      and got Validation Status (Pending/Validated/No Roll Needed/Skip) instead of Outcome
 *      (Approved/Partial/Failed + narrative).
 *   B. downtime-story.js:2321 — renderMeritSummary read outcome_summary from merit_actions_resolved[i]
 *      for skill acquisitions, but the processing panel saves outcomes to acquisitions_resolved[0].
 *      The lookup hit the wrong array → always blank → "Outcome not yet recorded".
 *
 * Fix A: `isSkillAcq` guard added to Validation Status condition; _renderMeritOutcomeZone
 *        called after pool columns for skill acquisitions.
 * Fix B: renderMeritSummary now reads acquisitions_resolved[0].outcome_summary first for
 *        resources-category entries, before falling through to notes_thread fallback.
 *
 * Test coverage:
 *   Part 1 — DT Story panel (downtime-story.js fix B)
 *     AC-1: Skill acq with acquisitions_resolved[0].outcome_summary → outcome shown in Resources group
 *     AC-2: Skill acq without outcome_summary → "Outcome not yet recorded" placeholder shown
 *     AC-3: Skill acq with outcome_summary + pool_status validated → "All outcomes recorded" badge
 *     AC-4: Allies with outcome_summary still reads from merit_actions_resolved (regression guard)
 *
 *   Part 2 — DT Processing panel (downtime-views.js fix A)
 *     AC-5: Skill acq action row → renders .proc-merit-outcome-zone (Outcome card)
 *     AC-6: Skill acq action row → does NOT render .proc-val-status (Validation Status)
 *     AC-7: Resources (non-skill) acq action row → still renders .proc-val-status (no regression)
 *
 * NOTE: initDtStory always rebuilds merit_actions via buildMeritActions(sub) at load time.
 * Do NOT pre-populate merit_actions in fixtures — use responses/acq fields that buildMeritActions reads.
 * buildMeritActions reads `resp['skill_acquisitions']` (blob) or `resp['acq_skill_rows']` (JSON).
 * Skill acquisitions → deriveMeritCategory('Skill Acquisition') = 'resources' → 'Resources' group.
 * Skill acquisitions go to phaseNum 7 → PHASE_NUM_TO_LABEL[7] = 'misc' → 'Step 10 — Miscellaneous'.
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000491', username: 'test_st_491', global_name: 'Test ST 491',
  avatar: null, role: 'st', player_id: 'p-491', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-491', cycle_number: 3, status: 'active',
  phase_signoff: {}, confirmed_ambience: {},
};

const CHAR = {
  _id: 'char-491',
  name: 'Menace Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  home_territory: null, retired: false,
  status: { city: 1, clan: 1, covenant: { Invictus: 1 } },
  attributes: {
    Strength:      { dots: 2, bonus: 0 }, Dexterity:     { dots: 2, bonus: 0 }, Stamina:    { dots: 2, bonus: 0 },
    Intelligence:  { dots: 2, bonus: 0 }, Wits:          { dots: 2, bonus: 0 }, Resolve:    { dots: 2, bonus: 0 },
    Presence:      { dots: 3, bonus: 0 }, Manipulation:  { dots: 2, bonus: 0 }, Composure:  { dots: 2, bonus: 0 },
  },
  skills: { Intimidation: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: {},
  merits: [
    { name: 'Allies',    category: 'influence', rating: 2, qualifier: 'Police' },
    { name: 'Resources', category: 'general',   rating: 2 },
  ],
  powers: [], ordeals: [],
};

// ── Submission builders ───────────────────────────────────────────────────────

function baseSub(id) {
  return {
    _id: id,
    cycle_id: 'cycle-491',
    character_id: 'char-491',
    character_name: 'Menace Test',
    player_name: 'Test Player',
    status: 'submitted',
    responses: {},
    _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    projects_resolved: [],
    merit_actions_resolved: [],
    acquisitions_resolved: [],
    st_review: {},
    st_narrative: { story_moment: { status: 'complete' } },
    feeding_review: { pool_status: 'no_feed' },
  };
}

// ── Part 1 fixtures (story panel) ─────────────────────────────────────────────

// AC-1: Skill acquisition with outcome_summary recorded in acquisitions_resolved.
// buildMeritActions reads responses['skill_acquisitions'] blob → merit_actions contains
// { merit_type: 'Skill Acquisition', action_type: 'acquisition' }.
// renderMeritSummary fix: reads acquisitions_resolved[0].outcome_summary for resources category.
const SUB_SKILL_ACQ_WITH_OUTCOME = {
  ...baseSub('sub-491-skill-outcome'),
  responses: { skill_acquisitions: 'Air of Menace' },
  acquisitions_resolved: [
    { outcome_summary: 'Mastered the intimidating stance without incident.' },
  ],
  merit_actions_resolved: [],
};

// AC-2: Skill acquisition with no outcome recorded yet → "not yet recorded" shown.
const SUB_SKILL_ACQ_NO_OUTCOME = {
  ...baseSub('sub-491-skill-no-outcome'),
  responses: { skill_acquisitions: 'Air of Menace' },
  acquisitions_resolved: [],
  merit_actions_resolved: [],
};

// AC-3: Skill acquisition with outcome_summary AND pool_status validated
// → meritSummaryComplete returns true → "All outcomes recorded" badge.
const SUB_SKILL_ACQ_VALIDATED = {
  ...baseSub('sub-491-skill-validated'),
  responses: { skill_acquisitions: 'Air of Menace' },
  acquisitions_resolved: [
    { pool_status: 'validated', outcome_summary: 'Air of Menace successfully acquired.' },
  ],
  merit_actions_resolved: [],
};

// AC-4: Allies merit with outcome_summary in merit_actions_resolved[0].
// buildMeritActions reads sphere_1_* → merit_actions[0] = Allies.
// merit_actions_resolved[0].outcome_summary must still drive the Allies group display.
const SUB_ALLIES_ONLY = {
  ...baseSub('sub-491-allies-only'),
  responses: {
    sphere_1_merit:   'Allies ●● (Police)',
    sphere_1_action:  'patrol_scout',
    sphere_1_outcome: 'Scout the harbour district',
    sphere_1_description: 'Watch the docks.',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Police allies reported suspicious vessel activity.' },
  ],
  acquisitions_resolved: [],
};

// ── Part 2 fixtures (processing panel) ───────────────────────────────────────

// AC-5/6: Skill acquisition → .proc-merit-outcome-zone must be present, .proc-val-status absent.
const SUB_PROC_SKILL_ACQ = {
  ...baseSub('sub-491-proc-skill'),
  responses: {
    skill_acquisitions: 'Air of Menace',
    skill_acq_pool_skill: 'Intimidation',
  },
  _raw: {
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
    acquisitions: { skill_acquisitions: 'Air of Menace' },
  },
  acquisitions_resolved: [],
  merit_actions_resolved: [],
};

// AC-7: Resources (non-skill) acquisition → .proc-val-status still present (no regression).
const SUB_PROC_RESOURCE_ACQ = {
  ...baseSub('sub-491-proc-resource'),
  responses: { resources_acquisitions: 'Buy a Retainer' },
  _raw: {
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
    acquisitions: { resource_acquisitions: 'Buy a Retainer' },
  },
  acquisitions_resolved: [],
  merit_actions_resolved: [],
};

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function setupStoryPanel(page, submissions) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CHAR]) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: CHAR._id, name: CHAR.name, moniker: CHAR.moniker, honorific: CHAR.honorific }]) })
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
  await page.route('**/api/st_mods*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForSelector('button[data-phase="story"]', { state: 'visible', timeout: 10000 });
  await page.click('button[data-phase="story"]');
  await page.waitForSelector('#dt-story-nav-rail', { timeout: 10000 });
  await page.click('.dt-story-pill');
  await page.waitForSelector('.dt-story-char-content', { timeout: 5000 });
  await page.waitForTimeout(300);
}

async function setupProcessingPanel(page, submissions) {
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
    if (url.includes('/api/downtime_cycles'))        return ok([ACTIVE_CYCLE]);
    if (url.includes('/api/characters/names'))       return ok([{ _id: CHAR._id, name: CHAR.name, moniker: CHAR.moniker, honorific: CHAR.honorific }]);
    if (url.includes('/api/characters'))             return ok([CHAR]);
    if (url.includes('/api/territories'))            return ok([]);
    if (url.includes('/api/game_sessions'))          return ok([]);
    if (url.includes('/api/session_logs'))           return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openFirstActionInPhase(page, phaseLabel) {
  await page.waitForSelector('.proc-phase-section', { timeout: 8000 });
  const phaseHeader = page.locator('.proc-phase-header').filter({ hasText: phaseLabel }).first();
  const toggle = phaseHeader.locator('.proc-phase-toggle');
  const toggleText = await toggle.textContent().catch(() => '');
  if (toggleText.includes('Show')) await phaseHeader.click();
  await page.waitForTimeout(200);
  const phase = page.locator('.proc-phase-section').filter({ hasText: phaseLabel }).first();
  const firstRow = phase.locator('.proc-action-row').first();
  await firstRow.click();
  await page.waitForTimeout(400);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getMeritGroupHtml(page, label) {
  return page.evaluate((lbl) => {
    const groups = document.querySelectorAll('.dt-merit-summary-group');
    for (const g of groups) {
      if (g.querySelector('.dt-merit-summary-group-label')?.textContent?.trim() === lbl) {
        return g.innerHTML;
      }
    }
    return null;
  }, label);
}

async function getMeritSummaryHtml(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.dt-story-section[data-section="merit_summary"]');
    return el ? el.innerHTML : null;
  });
}

// ── Part 1: DT Story panel tests ─────────────────────────────────────────────

test.describe('fix.491 Part 1: DT Story — skill acquisition outcome_summary display', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────

  test('AC-1: skill acq with acquisitions_resolved[0].outcome_summary → outcome shown in Resources group', async ({ page }) => {
    await setupStoryPanel(page, [SUB_SKILL_ACQ_WITH_OUTCOME]);

    const resourcesHtml = await getMeritGroupHtml(page, 'Resources');
    expect(resourcesHtml).not.toBeNull();
    expect(resourcesHtml).toContain('Mastered the intimidating stance without incident.');
    expect(resourcesHtml).not.toContain('Outcome not yet recorded');
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────

  test('AC-2: skill acq with no outcome_summary → "Outcome not yet recorded" shown in Resources group', async ({ page }) => {
    await setupStoryPanel(page, [SUB_SKILL_ACQ_NO_OUTCOME]);

    const resourcesHtml = await getMeritGroupHtml(page, 'Resources');
    expect(resourcesHtml).not.toBeNull();
    expect(resourcesHtml).toContain('Outcome not yet recorded');
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────

  test('AC-3: skill acq with outcome_summary + pool_status validated → "All outcomes recorded" badge', async ({ page }) => {
    await setupStoryPanel(page, [SUB_SKILL_ACQ_VALIDATED]);

    const html = await getMeritSummaryHtml(page);
    expect(html).not.toBeNull();
    expect(html).toContain('All outcomes recorded');

    const resourcesHtml = await getMeritGroupHtml(page, 'Resources');
    expect(resourcesHtml).toContain('Air of Menace successfully acquired.');
    expect(resourcesHtml).not.toContain('Outcome not yet recorded');
  });

  // AC-4 ──────────────────────────────────────────────────────────────────────

  test('AC-4: Allies outcome still reads from merit_actions_resolved (regression guard)', async ({ page }) => {
    await setupStoryPanel(page, [SUB_ALLIES_ONLY]);

    const alliesHtml = await getMeritGroupHtml(page, 'Allies');
    expect(alliesHtml).not.toBeNull();
    expect(alliesHtml).toContain('Police allies reported suspicious vessel activity.');
    expect(alliesHtml).not.toContain('Outcome not yet recorded');

    const html = await getMeritSummaryHtml(page);
    expect(html).toContain('All outcomes recorded');
  });

});

// ── Part 2: DT Processing panel tests ────────────────────────────────────────

test.describe('fix.491 Part 2: DT Processing — skill acquisition renders Outcome card', () => {

  // AC-5 / AC-6 ───────────────────────────────────────────────────────────────

  test('AC-5/6: skill acq action row → Outcome card present, Validation Status absent', async ({ page }) => {
    await setupProcessingPanel(page, [SUB_PROC_SKILL_ACQ]);
    // Skill acquisitions → phaseNum 7 → 'Step 10 — Miscellaneous'
    await openFirstActionInPhase(page, 'Step 10 — Miscellaneous');

    const detailHtml = await page.evaluate(() => {
      const panel = document.querySelector('.proc-detail-panel') || document.querySelector('.proc-entry-detail');
      return panel ? panel.innerHTML : document.querySelector('.proc-action-detail')?.innerHTML || null;
    });

    // Fallback: check within any expanded detail area
    const hasOutcomeZone = await page.evaluate(() =>
      !!document.querySelector('.proc-merit-outcome-zone')
    );
    const hasValStatus = await page.evaluate(() =>
      !!document.querySelector('.proc-val-status')
    );

    expect(hasOutcomeZone).toBe(true);
    expect(hasValStatus).toBe(false);
  });

  // AC-6 variant: Outcome card has the right buttons ──────────────────────────

  test('AC-6: skill acq Outcome card has Approved / Partial / Failed buttons', async ({ page }) => {
    await setupProcessingPanel(page, [SUB_PROC_SKILL_ACQ]);
    await openFirstActionInPhase(page, 'Step 10 — Miscellaneous');

    const outcomeZone = page.locator('.proc-merit-outcome-zone').first();
    await expect(outcomeZone).toBeVisible({ timeout: 5000 });
    await expect(outcomeZone.locator('.proc-merit-outcome-btn', { hasText: 'Approved' })).toBeVisible();
    await expect(outcomeZone.locator('.proc-merit-outcome-btn', { hasText: 'Partial' })).toBeVisible();
    await expect(outcomeZone.locator('.proc-merit-outcome-btn', { hasText: 'Failed' })).toBeVisible();
    await expect(outcomeZone.locator('.proc-outcome-summary-input')).toBeVisible();
  });

  // AC-7 ──────────────────────────────────────────────────────────────────────

  test('AC-7: resources (non-skill) acq action row → Validation Status still present (regression guard)', async ({ page }) => {
    await setupProcessingPanel(page, [SUB_PROC_RESOURCE_ACQ]);
    // Resources acquisitions → phaseNum 14 → PHASE_NUM_TO_LABEL[14] = 'resources' → 'Resources'
    await openFirstActionInPhase(page, 'Resources');

    const hasValStatus = await page.evaluate(() =>
      !!document.querySelector('.proc-val-status')
    );
    const hasOutcomeZone = await page.evaluate(() =>
      !!document.querySelector('.proc-merit-outcome-zone')
    );

    expect(hasValStatus).toBe(true);
    expect(hasOutcomeZone).toBe(false);
  });

});
