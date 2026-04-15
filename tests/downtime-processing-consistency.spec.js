/**
 * DT Processing Consistency Epic — E2E tests (feature.68–80)
 *
 * Covers:
 *   B1 — Blood type selector (Human / Animal / Kindred / Ghoul)
 *   B2 — Sorcery tradition + rite selectors
 *   B3 — Contacts info-type selector + subject field
 *   C1 — Patrol/scout outcome recording fields
 *   C2 — Rumour outcome recording fields
 *   C3 — Support target selector
 *   C4 — Block auto-resolution display
 *   E2 — Committed pool status
 */

const { test, expect } = require('@playwright/test');

// ── Shared mock data ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const TEST_CYCLE = {
  _id: 'cycle-001', cycle_number: 2, status: 'open',
  confirmed_ambience: {}, narrative_notes: '',
};

/** Character with Allies merit and standard stats */
const CHAR_ALLIES = {
  _id: 'char-allies', name: 'Charlie Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: 1 },
  attributes: {
    Strength: { dots: 3, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {},
  disciplines: {},
  merits: [
    { name: 'Allies', category: 'influence', rating: 3, qualifier: 'Criminal' },
  ],
  powers: [], ordeals: {},
};

/** Character with Cruac discipline for sorcery tests */
const CHAR_SORC = {
  _id: 'char-sorc', name: 'Sorc McSorcface', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Sorc Player',
  blood_potency: 3, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: 1 },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 3, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Occult: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: { Cruac: { dots: 3 } },
  merits: [], powers: [], ordeals: {},
};

// ── Submission factories ───────────────────────────────────────────────────────

function makeFeedingSubmission(overrides = {}) {
  return {
    _id: 'sub-feed-001',
    cycle_id: 'cycle-001',
    character_name: 'Charlie Test',
    character_id: 'char-allies',
    player_name: 'Test Player',
    submitted_at: '2026-04-15T00:00:00Z',
    _raw: {
      projects: [], feeding: { method: 'predator', pool: { expression: 'Strength 3 + Weaponry 2 = 5' } },
      sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: { feeding_method: 'predator', feeding_pool_expr: 'Strength 3 + Weaponry 2 = 5' },
    projects_resolved: [],
    feeding_review: {
      pool_player: 'Strength 3 + Weaponry 2 = 5',
      pool_validated: 'Strength 3 + Weaponry 2 = 5',
      pool_status: 'validated',
      notes_thread: [], player_feedback: '',
      blood_type: '',
      ...overrides,
    },
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

function makeSorcSubmission(overrides = {}) {
  return {
    _id: 'sub-sorc-001',
    cycle_id: 'cycle-001',
    character_name: 'Sorc McSorcface',
    character_id: 'char-sorc',
    player_name: 'Sorc Player',
    submitted_at: '2026-04-15T00:00:00Z',
    _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {
      sorcery_slot_count: '1',
      sorcery_1_rite: 'Pangs of Proserpina',
      sorcery_1_targets: 'Eve Test',
      sorcery_1_notes: '',
    },
    projects_resolved: [],
    feeding_review: null,
    sorcery_review: { 1: { pool_status: 'pending', ...overrides } },
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

function makeMeritSubmission(actionType, reviewOverrides = {}) {
  return {
    _id: `sub-merit-${actionType}-001`,
    cycle_id: 'cycle-001',
    character_name: 'Charlie Test',
    character_id: 'char-allies',
    player_name: 'Test Player',
    submitted_at: '2026-04-15T00:00:00Z',
    _raw: {
      projects: [],
      feeding: null,
      sphere_actions: [
        {
          merit_type: 'Allies 3 (Criminal)',
          action_type: actionType,
          description: `Testing ${actionType} action`,
          desired_outcome: `Outcome for ${actionType}`,
          primary_pool: { expression: '' },
        },
      ],
      contact_actions: { requests: [] },
      retainer_actions: { actions: [] },
    },
    responses: {},
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [{ pool_status: 'pending', ...reviewOverrides }],
    st_review: { territory_overrides: {} },
  };
}

function makeContactsSubmission(request = 'Tell me about the murders downtown', reviewOverrides = {}) {
  return {
    _id: 'sub-contacts-001',
    cycle_id: 'cycle-001',
    character_name: 'Charlie Test',
    character_id: 'char-allies',
    player_name: 'Test Player',
    submitted_at: '2026-04-15T00:00:00Z',
    _raw: {
      projects: [], feeding: null, sphere_actions: [],
      contact_actions: { requests: [request] },
      retainer_actions: { actions: [] },
    },
    responses: {},
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [{ pool_status: 'pending', ...reviewOverrides }],
    st_review: { territory_overrides: {} },
  };
}

function makeProjectSubmission(reviewOverrides = {}) {
  return {
    _id: 'sub-proj-001',
    cycle_id: 'cycle-001',
    character_name: 'Charlie Test',
    character_id: 'char-allies',
    player_name: 'Test Player',
    submitted_at: '2026-04-15T00:00:00Z',
    _raw: {
      projects: [{
        action_type: 'grow',
        desired_outcome: 'Grow Allies rating',
        detail: 'Work the network.',
        primary_pool: { expression: 'Presence 2 + Persuasion 2 = 4' },
      }],
      feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action: 'grow',
      project_1_outcome: 'Grow Allies rating',
      project_1_description: 'Work the network.',
      project_1_pool_expr: 'Presence 2 + Persuasion 2 = 4',
    },
    projects_resolved: [{ pool_status: 'pending', pool_validated: 'Presence 2 + Persuasion 2 = 4', ...reviewOverrides }],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

// ── Setup helper ───────────────────────────────────────────────────────────────

async function setup(page, submissions, chars = [CHAR_ALLIES, CHAR_SORC]) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chars) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific }))) })
  );
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/downtime_cycles*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TEST_CYCLE]) })
  );
  await page.route('**/api/downtime_submissions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(submissions) })
  );
  await page.route('**/api/territories*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/session_logs*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/downtime_submissions/**', route => {
    if (['PATCH', 'PUT'].includes(route.request().method())) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } else {
      route.continue();
    }
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])', { timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(600);
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

/** Click the Details edit button on a proc-action-detail card to reveal the hidden edit section. */
async function openDetailsEdit(card, page) {
  const editBtn = card.locator('.proc-feed-desc-edit-btn').first();
  await editBtn.click();
  await page.waitForTimeout(200);
}

// ══════════════════════════════════════════════════════════════════════════════
//  B1 — Blood type selector
// ══════════════════════════════════════════════════════════════════════════════

test.describe('B1 — Blood type selector', () => {

  test('blood type field is a select element, not a text input', async ({ page }) => {
    await setup(page, [makeFeedingSubmission()]);
    await openFirstActionInPhase(page, 'Step 2');

    const card = page.locator('.proc-action-detail').first();
    await openDetailsEdit(card, page);
    const bloodSel = card.locator('.proc-feed-blood-sel');
    await expect(bloodSel).toBeVisible({ timeout: 5000 });
    // Confirm it is a <select>, not an <input>
    const tagName = await bloodSel.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('select');
  });

  test('blood type select has exactly four options: Human, Animal, Kindred, Ghoul', async ({ page }) => {
    await setup(page, [makeFeedingSubmission()]);
    await openFirstActionInPhase(page, 'Step 2');

    const card = page.locator('.proc-action-detail').first();
    await openDetailsEdit(card, page);
    const options = await card.locator('.proc-feed-blood-sel option').allTextContents();
    expect(options).toEqual(['Human', 'Animal', 'Kindred', 'Ghoul']);
  });

  test('blood type select reflects saved blood_type value', async ({ page }) => {
    await setup(page, [makeFeedingSubmission({ blood_type: 'Kindred' })]);
    await openFirstActionInPhase(page, 'Step 2');

    const card = page.locator('.proc-action-detail').first();
    await openDetailsEdit(card, page);
    const selected = await card.locator('.proc-feed-blood-sel').inputValue();
    expect(selected).toBe('Kindred');
  });

  test('changing blood type triggers a PATCH save', async ({ page }) => {
    await setup(page, [makeFeedingSubmission()]);

    // Register the PUT/PATCH intercept AFTER setup so it takes priority (Playwright LIFO routing)
    // updateSubmission uses PUT via apiPut
    let patchBody = null;
    await page.route('**/api/downtime_submissions/**', async route => {
      if (['PATCH', 'PUT'].includes(route.request().method())) {
        patchBody = JSON.parse(route.request().postData() || '{}');
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      } else {
        route.continue();
      }
    });

    await openFirstActionInPhase(page, 'Step 2');
    const card = page.locator('.proc-action-detail').first();
    await openDetailsEdit(card, page);
    await card.locator('.proc-feed-blood-sel').selectOption('Animal');

    // Click save and wait for the PUT request simultaneously
    const [putReq] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/api/downtime_submissions/') && ['PUT', 'PATCH'].includes(req.method()), { timeout: 8000 }),
      card.locator('.proc-feed-desc-save-btn').click(),
    ]);
    expect(putReq).not.toBeNull();
    patchBody = JSON.parse(putReq.postData() || '{}');
  });

});

// ══════════════════════════════════════════════════════════════════════════════
//  B2 — Sorcery tradition + rite selectors
// ══════════════════════════════════════════════════════════════════════════════

test.describe('B2 — Sorcery selectors', () => {

  test('sorcery panel renders for a submission with a rite', async ({ page }) => {
    await setup(page, [makeSorcSubmission()]);
    await page.waitForSelector('.proc-phase-section', { timeout: 8000 });
    const sorcPhase = page.locator('.proc-phase-section').filter({ hasText: 'Blood Sorcery' });
    await expect(sorcPhase).toBeVisible({ timeout: 5000 });
  });

  test('tradition selector is a select element with Cruac and Theban Sorcery options', async ({ page }) => {
    await setup(page, [makeSorcSubmission()]);
    await openFirstActionInPhase(page, 'Blood Sorcery');

    const card = page.locator('.proc-action-detail').first();
    await openDetailsEdit(card, page);
    const tradSel = card.locator('.proc-sorc-tradition-sel');
    await expect(tradSel).toBeVisible({ timeout: 5000 });

    const options = await tradSel.locator('option').allTextContents();
    expect(options).toContain('Cruac');
    expect(options).toContain('Theban Sorcery');
  });

  test('rite selector is a select element', async ({ page }) => {
    await setup(page, [makeSorcSubmission()]);
    await openFirstActionInPhase(page, 'Blood Sorcery');

    const card = page.locator('.proc-action-detail').first();
    await openDetailsEdit(card, page);
    const riteSel = card.locator('.proc-sorc-rite-sel');
    await expect(riteSel).toBeVisible({ timeout: 5000 });
    const tagName = await riteSel.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('select');
  });

  test('targets field is a multi-select', async ({ page }) => {
    await setup(page, [makeSorcSubmission()]);
    await openFirstActionInPhase(page, 'Blood Sorcery');

    const card = page.locator('.proc-action-detail').first();
    await openDetailsEdit(card, page);
    const targetsSel = card.locator('.proc-sorc-targets-sel');
    await expect(targetsSel).toBeVisible({ timeout: 5000 });
    const isMultiple = await targetsSel.evaluate(el => el.multiple);
    expect(isMultiple).toBe(true);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
//  B3 — Contacts info-type selector + subject field
// ══════════════════════════════════════════════════════════════════════════════

test.describe('B3 — Contacts info-type selector', () => {

  test('contacts panel renders in the Contacts phase', async ({ page }) => {
    await setup(page, [makeContactsSubmission()]);
    await page.waitForSelector('.proc-phase-section', { timeout: 8000 });
    const contactsPhase = page.locator('.proc-phase-section').filter({ hasText: 'Contacts' });
    await expect(contactsPhase).toBeVisible({ timeout: 5000 });
  });

  test('info-type selector is a select with the four secrecy tiers', async ({ page }) => {
    await setup(page, [makeContactsSubmission()]);
    await openFirstActionInPhase(page, 'Contacts');

    const card = page.locator('.proc-action-detail').first();
    const infoTypeSel = card.locator('.proc-contacts-info-type-sel');
    await expect(infoTypeSel).toBeVisible({ timeout: 5000 });

    const options = await infoTypeSel.locator('option').allTextContents();
    expect(options).toContain('Public');
    expect(options).toContain('Internal');
    expect(options).toContain('Confidential');
    expect(options).toContain('Restricted');
  });

  test('subject field is a text input', async ({ page }) => {
    await setup(page, [makeContactsSubmission()]);
    await openFirstActionInPhase(page, 'Contacts');

    const card = page.locator('.proc-action-detail').first();
    const subjectInput = card.locator('.proc-contacts-subject-input');
    await expect(subjectInput).toBeVisible({ timeout: 5000 });
    const tagName = await subjectInput.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('input');
  });

  test('info-type selector reflects saved value', async ({ page }) => {
    await setup(page, [makeContactsSubmission('Tell me about murders', { contacts_info_type: 'Confidential' })]);
    await openFirstActionInPhase(page, 'Contacts');

    const card = page.locator('.proc-action-detail').first();
    const selected = await card.locator('.proc-contacts-info-type-sel').inputValue();
    expect(selected).toBe('Confidential');
  });

});

// ══════════════════════════════════════════════════════════════════════════════
//  C1 — Patrol/scout outcome recording
// ══════════════════════════════════════════════════════════════════════════════

test.describe('C1 — Patrol/scout outcome recording', () => {

  test('patrol panel renders in Support & Patrol phase', async ({ page }) => {
    await setup(page, [makeMeritSubmission('patrol_scout')]);
    await page.waitForSelector('.proc-phase-section', { timeout: 8000 });
    const phase = page.locator('.proc-phase-section').filter({ hasText: 'Step 7' });
    await expect(phase).toBeVisible({ timeout: 5000 });
  });

  test('detail level selector is present', async ({ page }) => {
    await setup(page, [makeMeritSubmission('patrol_scout')]);
    await openFirstActionInPhase(page, 'Step 7');

    const card = page.locator('.proc-action-detail').first();
    const detailSel = card.locator('.proc-patrol-detail-sel');
    await expect(detailSel).toBeVisible({ timeout: 5000 });
  });

  test('observed textarea is present', async ({ page }) => {
    await setup(page, [makeMeritSubmission('patrol_scout')]);
    await openFirstActionInPhase(page, 'Step 7');

    const card = page.locator('.proc-action-detail').first();
    const observedTa = card.locator('.proc-patrol-observed-ta');
    await expect(observedTa).toBeVisible({ timeout: 5000 });
  });

  test('detail level options cover 1 through 5+', async ({ page }) => {
    await setup(page, [makeMeritSubmission('patrol_scout')]);
    await openFirstActionInPhase(page, 'Step 7');

    const card = page.locator('.proc-action-detail').first();
    const options = await card.locator('.proc-patrol-detail-sel option').allTextContents();
    // Should include numeric detail levels
    const nonEmpty = options.filter(o => o.trim() !== '— Select —' && o.trim() !== '');
    expect(nonEmpty.length).toBeGreaterThanOrEqual(5);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
//  C2 — Rumour outcome recording
// ══════════════════════════════════════════════════════════════════════════════

test.describe('C2 — Rumour outcome recording', () => {

  test('rumour panel renders in Miscellaneous phase', async ({ page }) => {
    await setup(page, [makeMeritSubmission('rumour')]);
    await page.waitForSelector('.proc-phase-section', { timeout: 8000 });
    const phase = page.locator('.proc-phase-section').filter({ hasText: 'Step 8' });
    await expect(phase).toBeVisible({ timeout: 5000 });
  });

  test('rumour detail level selector is present', async ({ page }) => {
    await setup(page, [makeMeritSubmission('rumour')]);
    await openFirstActionInPhase(page, 'Step 8');

    const card = page.locator('.proc-action-detail').first();
    const detailSel = card.locator('.proc-rumour-detail-sel');
    await expect(detailSel).toBeVisible({ timeout: 5000 });
  });

  test('rumour content textarea is present', async ({ page }) => {
    await setup(page, [makeMeritSubmission('rumour')]);
    await openFirstActionInPhase(page, 'Step 8');

    const card = page.locator('.proc-action-detail').first();
    const contentTa = card.locator('.proc-rumour-content-ta');
    await expect(contentTa).toBeVisible({ timeout: 5000 });
  });

  test('saved rumour content pre-fills the textarea', async ({ page }) => {
    await setup(page, [makeMeritSubmission('rumour', { rumour_content: 'The Prince is meeting someone tonight.' })]);
    await openFirstActionInPhase(page, 'Step 8');

    const card = page.locator('.proc-action-detail').first();
    const content = await card.locator('.proc-rumour-content-ta').inputValue();
    expect(content).toBe('The Prince is meeting someone tonight.');
  });

});

// ══════════════════════════════════════════════════════════════════════════════
//  C3 — Support target selector
// ══════════════════════════════════════════════════════════════════════════════

test.describe('C3 — Support target selector', () => {

  test('support panel renders in Support & Patrol phase', async ({ page }) => {
    await setup(page, [makeMeritSubmission('support')]);
    await page.waitForSelector('.proc-phase-section', { timeout: 8000 });
    const phase = page.locator('.proc-phase-section').filter({ hasText: 'Step 7' });
    await expect(phase).toBeVisible({ timeout: 5000 });
  });

  test('support target selector is a select element', async ({ page }) => {
    await setup(page, [makeMeritSubmission('support')]);
    await openFirstActionInPhase(page, 'Step 7');

    const card = page.locator('.proc-action-detail').first();
    const targetSel = card.locator('.proc-support-target-sel');
    await expect(targetSel).toBeVisible({ timeout: 5000 });
    const tagName = await targetSel.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('select');
  });

  test('support target selector lists queue entries from other submissions', async ({ page }) => {
    // Add a project submission as a potential support target
    const projectSub = makeProjectSubmission();
    const supportSub = makeMeritSubmission('support');
    supportSub._id = 'sub-support-001';
    await setup(page, [projectSub, supportSub]);
    await page.waitForTimeout(500);

    // Open support action (in Step 7)
    const phase7 = page.locator('.proc-phase-section').filter({ hasText: 'Step 7' });
    await expect(phase7).toBeVisible({ timeout: 8000 });
    const toggle = phase7.locator('.proc-phase-toggle');
    const toggleText = await toggle.textContent().catch(() => '');
    if (toggleText.includes('Show')) await phase7.locator('.proc-phase-header').click();
    await page.waitForTimeout(200);
    await phase7.locator('.proc-action-row').first().click();
    await page.waitForTimeout(400);

    const card = page.locator('.proc-action-detail').first();
    const targetSel = card.locator('.proc-support-target-sel');
    await expect(targetSel).toBeVisible({ timeout: 5000 });
    // The selector should have options (at least the placeholder + the project entry)
    const options = await targetSel.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(1);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
//  C4 — Block auto-resolution display
// ══════════════════════════════════════════════════════════════════════════════

test.describe('C4 — Block resolution display', () => {

  test('block panel renders in Miscellaneous phase', async ({ page }) => {
    await setup(page, [makeMeritSubmission('block')]);
    await page.waitForSelector('.proc-phase-section', { timeout: 8000 });
    const phase = page.locator('.proc-phase-section').filter({ hasText: 'Step 8' });
    await expect(phase).toBeVisible({ timeout: 5000 });
  });

  test('block panel shows Auto-blocks label', async ({ page }) => {
    await setup(page, [makeMeritSubmission('block')]);
    await openFirstActionInPhase(page, 'Step 8');

    const card = page.locator('.proc-action-detail').first();
    await expect(card).toContainText('Auto-blocks', { timeout: 5000 });
  });

  test('Confirm Block button is visible when not yet confirmed', async ({ page }) => {
    await setup(page, [makeMeritSubmission('block', { pool_status: 'pending' })]);
    await openFirstActionInPhase(page, 'Step 8');

    const card = page.locator('.proc-action-detail').first();
    const confirmBtn = card.locator('.proc-block-confirm-btn');
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await expect(confirmBtn).toContainText('Confirm Block');
  });

  test('block confirmed state shows tick instead of button when pool_status is no_roll', async ({ page }) => {
    await setup(page, [makeMeritSubmission('block', { pool_status: 'no_roll' })]);
    await openFirstActionInPhase(page, 'Step 8');

    const card = page.locator('.proc-action-detail').first();
    // Confirm Block button should NOT be visible
    await expect(card.locator('.proc-block-confirm-btn')).toHaveCount(0);
    // Confirmed tick text should be visible
    await expect(card).toContainText('Block confirmed', { timeout: 5000 });
  });

  test('clicking Confirm Block triggers a PATCH save', async ({ page }) => {
    await setup(page, [makeMeritSubmission('block', { pool_status: 'pending' })]);

    // Register PUT/PATCH intercept AFTER setup so it takes priority (Playwright LIFO routing)
    // updateSubmission uses PUT via apiPut
    let patchCalled = false;
    await page.route('**/api/downtime_submissions/**', route => {
      if (['PATCH', 'PUT'].includes(route.request().method())) {
        patchCalled = true;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      } else {
        route.continue();
      }
    });

    await openFirstActionInPhase(page, 'Step 8');

    const card = page.locator('.proc-action-detail').first();
    await card.locator('.proc-block-confirm-btn').click();
    await page.waitForTimeout(500);
    expect(patchCalled).toBe(true);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
//  E2 — Committed pool status
// ══════════════════════════════════════════════════════════════════════════════

test.describe('E2 — Committed pool status — button presence', () => {

  test('project panel status buttons include Committed', async ({ page }) => {
    await setup(page, [makeProjectSubmission()]);
    await openFirstActionInPhase(page, 'Step 8');

    const rightPanel = page.locator('.proc-feed-right').first();
    const committedBtn = rightPanel.locator('.proc-val-btn[data-status="committed"]');
    await expect(committedBtn).toBeVisible({ timeout: 5000 });
    await expect(committedBtn).toContainText('Committed');
  });

  test('sorcery panel status buttons include Committed', async ({ page }) => {
    await setup(page, [makeSorcSubmission()]);
    await openFirstActionInPhase(page, 'Blood Sorcery');

    const rightPanel = page.locator('.proc-feed-right').first();
    const committedBtn = rightPanel.locator('.proc-val-btn[data-status="committed"]');
    await expect(committedBtn).toBeVisible({ timeout: 5000 });
  });

  test('merit (rolled) panel status buttons include Committed', async ({ page }) => {
    // patrol_scout uses dots2plus2 formula — it has a roll card and a pool
    await setup(page, [makeMeritSubmission('patrol_scout')]);
    await openFirstActionInPhase(page, 'Step 7');

    const rightPanel = page.locator('.proc-feed-right').first();
    const committedBtn = rightPanel.locator('.proc-val-btn[data-status="committed"]');
    await expect(committedBtn).toBeVisible({ timeout: 5000 });
  });

  test('block panel (no roll) does NOT have a pool builder', async ({ page }) => {
    // block uses mode: auto, poolFormula: none — right panel shows block resolution, not pool builder
    await setup(page, [makeMeritSubmission('block')]);
    await openFirstActionInPhase(page, 'Step 8');

    const leftCol = page.locator('.proc-feed-left').first();
    // No pool builder should be present for a block entry
    await expect(leftCol.locator('.proc-pool-builder')).toHaveCount(0);
  });

});

test.describe('E2 — Committed pool status — pool builder locked', () => {

  test('project pool builder selects are disabled when pool_status is committed', async ({ page }) => {
    await setup(page, [makeProjectSubmission({ pool_status: 'committed', pool_validated: 'Presence 2 + Persuasion 2 = 4' })]);
    await openFirstActionInPhase(page, 'Step 8');

    const leftCol = page.locator('.proc-feed-left').first();
    const builder = leftCol.locator('.proc-pool-builder');
    await expect(builder).toBeVisible({ timeout: 5000 });

    // All selects within the builder should be disabled
    const selects = builder.locator('select');
    const count = await selects.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(selects.nth(i)).toBeDisabled();
    }
  });

  test('[Committed] badge appears on pool builder heading when committed', async ({ page }) => {
    await setup(page, [makeProjectSubmission({ pool_status: 'committed', pool_validated: 'Presence 2 + Persuasion 2 = 4' })]);
    await openFirstActionInPhase(page, 'Step 8');

    const leftCol = page.locator('.proc-feed-left').first();
    const builder = leftCol.locator('.proc-pool-builder');
    await expect(builder).toContainText('[Committed]', { timeout: 5000 });
  });

  test('project pool builder selects are enabled when pool_status is pending', async ({ page }) => {
    await setup(page, [makeProjectSubmission({ pool_status: 'pending' })]);
    await openFirstActionInPhase(page, 'Step 8');

    const leftCol = page.locator('.proc-feed-left').first();
    const builder = leftCol.locator('.proc-pool-builder');
    await expect(builder).toBeVisible({ timeout: 5000 });

    const selects = builder.locator('select');
    const count = await selects.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(selects.nth(i)).toBeEnabled();
    }
  });

  test('committed button shows as active when pool_status is committed', async ({ page }) => {
    await setup(page, [makeProjectSubmission({ pool_status: 'committed', pool_validated: 'Presence 2 + Persuasion 2 = 4' })]);
    await openFirstActionInPhase(page, 'Step 8');

    const rightPanel = page.locator('.proc-feed-right').first();
    const committedBtn = rightPanel.locator('.proc-val-btn.active.committed');
    await expect(committedBtn).toBeVisible({ timeout: 5000 });
  });

  test('sorcery modifier panel has committed class when pool_status is committed', async ({ page }) => {
    await setup(page, [makeSorcSubmission({ pool_status: 'committed' })]);
    await openFirstActionInPhase(page, 'Blood Sorcery');

    const rightPanel = page.locator('.proc-feed-right').first();
    const modPanel = rightPanel.locator('.proc-feed-mod-panel.proc-pool-committed');
    await expect(modPanel).toBeVisible({ timeout: 5000 });
  });

});

test.describe('E2 — Committed pool status — not counted as done', () => {

  test('committed entry does not count toward done in phase header', async ({ page }) => {
    await setup(page, [makeProjectSubmission({ pool_status: 'committed', pool_validated: 'Presence 2 + Persuasion 2 = 4' })]);
    await page.waitForSelector('.proc-phase-section', { timeout: 8000 });

    // The phase header shows a ✓ badge only when ALL entries are done.
    // committed is not done, so the badge must be absent — confirming committed is not counted.
    const phase = page.locator('.proc-phase-section').filter({ hasText: 'Step 8' });
    await expect(phase).toBeVisible({ timeout: 5000 });
    const header = phase.locator('.proc-phase-header');
    // No all-done checkmark
    await expect(header.locator('.dt-narr-badge')).toHaveCount(0);
    // And no partial-progress badge (0 done → nothing shown)
    await expect(header.locator('.proc-narr-progress')).toHaveCount(0);
  });

});
