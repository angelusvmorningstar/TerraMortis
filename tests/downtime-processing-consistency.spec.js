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
  _id: 'cycle-001', cycle_number: 2, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

/** Character with Allies merit and standard stats */
const CHAR_ALLIES = {
  _id: 'char-allies', name: 'Charlie Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
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
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 1, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
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
    chapter_id: 'cycle-001',
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
    chapter_id: 'cycle-001',
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
    chapter_id: 'cycle-001',
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
    chapter_id: 'cycle-001',
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
    chapter_id: 'cycle-001',
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
  await page.route('**/api/chapters*', route =>
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

async function openActionInPhase(page, phaseKey) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator(`.proc-filter-pill[data-filter-dim="phases"][data-filter-val="${phaseKey}"]`).first().click();
  await page.waitForTimeout(300);
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
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
    await openActionInPhase(page, 'feeding');

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
    await openActionInPhase(page, 'feeding');

    const card = page.locator('.proc-action-detail').first();
    await openDetailsEdit(card, page);
    const options = await card.locator('.proc-feed-blood-sel option').allTextContents();
    expect(options).toEqual(['Human', 'Animal', 'Kindred', 'Ghoul']);
  });

  test('blood type select reflects saved blood_type value', async ({ page }) => {
    await setup(page, [makeFeedingSubmission({ blood_type: 'Kindred' })]);
    await openActionInPhase(page, 'feeding');

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

    await openActionInPhase(page, 'feeding');
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
    await expect(page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="resolve_first"]')).toBeVisible({ timeout: 8000 });
  });

  // fix.617 (Angelus ruling): the sorcery panel was consolidated — tradition is no longer a
  // separate selector; Cruac/Theban appear as <optgroup>s inside the single Rite <select>.
  // The per-tradition options can't be asserted in this harness (rites reference data isn't
  // mocked, so _allRites is empty → no optgroups), so that assertion is retired; the rite
  // dropdown itself is covered by the next test.
  // fix.617: the rite selector is now .proc-rite-select (was .proc-sorc-rite-sel).
  test('rite selector is a select element', async ({ page }) => {
    await setup(page, [makeSorcSubmission()]);
    await openActionInPhase(page, 'resolve_first');

    const card = page.locator('.proc-action-detail').first();
    const riteSel = card.locator('.proc-rite-select');
    await expect(riteSel).toBeVisible({ timeout: 5000 });
    const tagName = await riteSel.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('select');
  });

  // fix.617: sorcery targets now use the unified Connected-Characters typeahead picker
  // (.proc-conn-typeahead / .proc-conn-input), not a multi-select.
  test('targets use the Connected Characters picker', async ({ page }) => {
    await setup(page, [makeSorcSubmission()]);
    await openActionInPhase(page, 'resolve_first');

    const card = page.locator('.proc-action-detail').first();
    const picker = card.locator('.proc-conn-typeahead').first();
    await expect(picker).toBeVisible({ timeout: 5000 });
    await expect(picker.locator('.proc-conn-input')).toBeVisible();
  });

});

// ══════════════════════════════════════════════════════════════════════════════
//  B3 — Contacts info-type selector + subject field
// ══════════════════════════════════════════════════════════════════════════════

test.describe('B3 — Contacts info-type selector', () => {

  test('contacts panel renders in the Contacts phase', async ({ page }) => {
    await setup(page, [makeContactsSubmission()]);
    await expect(page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="contacts"]')).toBeVisible({ timeout: 8000 });
  });

  test('info-type selector is a select with the four secrecy tiers', async ({ page }) => {
    await setup(page, [makeContactsSubmission()]);
    await openActionInPhase(page, 'contacts');

    const card = page.locator('.proc-action-detail').first();
    const infoTypeSel = card.locator('.proc-contacts-info-type-sel');
    await expect(infoTypeSel).toBeVisible({ timeout: 5000 });

    const options = await infoTypeSel.locator('option').allTextContents();
    expect(options).toContain('Public');
    expect(options).toContain('Internal');
    expect(options).toContain('Confidential');
    expect(options).toContain('Restricted');
  });

  // fix.617: the "Subject" field was renamed to "Target" (.proc-contacts-target-input).
  test('target field is a text input', async ({ page }) => {
    await setup(page, [makeContactsSubmission()]);
    await openActionInPhase(page, 'contacts');

    const card = page.locator('.proc-action-detail').first();
    const targetInput = card.locator('.proc-contacts-target-input');
    await expect(targetInput).toBeVisible({ timeout: 5000 });
    const tagName = await targetInput.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('input');
  });

  test('info-type selector reflects saved value', async ({ page }) => {
    await setup(page, [makeContactsSubmission('Tell me about murders', { contacts_info_type: 'Confidential' })]);
    await openActionInPhase(page, 'contacts');

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
    await expect(page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="patrol"]')).toBeVisible({ timeout: 8000 });
  });

  test('detail level selector is present', async ({ page }) => {
    await setup(page, [makeMeritSubmission('patrol_scout')]);
    await openActionInPhase(page, 'patrol');

    const card = page.locator('.proc-action-detail').first();
    const detailSel = card.locator('.proc-patrol-detail-sel');
    await expect(detailSel).toBeVisible({ timeout: 5000 });
  });

  test('observed textarea is present', async ({ page }) => {
    await setup(page, [makeMeritSubmission('patrol_scout')]);
    await openActionInPhase(page, 'patrol');

    const card = page.locator('.proc-action-detail').first();
    const observedTa = card.locator('.proc-patrol-observed-ta');
    await expect(observedTa).toBeVisible({ timeout: 5000 });
  });

  test('detail level options cover 1 through 5+', async ({ page }) => {
    await setup(page, [makeMeritSubmission('patrol_scout')]);
    await openActionInPhase(page, 'patrol');

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
    await expect(page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="misc"]')).toBeVisible({ timeout: 8000 });
  });

  test('rumour detail level selector is present', async ({ page }) => {
    await setup(page, [makeMeritSubmission('rumour')]);
    await openActionInPhase(page, 'misc');

    const card = page.locator('.proc-action-detail').first();
    const detailSel = card.locator('.proc-rumour-detail-sel');
    await expect(detailSel).toBeVisible({ timeout: 5000 });
  });

  test('rumour content textarea is present', async ({ page }) => {
    await setup(page, [makeMeritSubmission('rumour')]);
    await openActionInPhase(page, 'misc');

    const card = page.locator('.proc-action-detail').first();
    const contentTa = card.locator('.proc-rumour-content-ta');
    await expect(contentTa).toBeVisible({ timeout: 5000 });
  });

  test('saved rumour content pre-fills the textarea', async ({ page }) => {
    await setup(page, [makeMeritSubmission('rumour', { rumour_content: 'The Prince is meeting someone tonight.' })]);
    await openActionInPhase(page, 'misc');

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
    await expect(page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="support"]')).toBeVisible({ timeout: 8000 });
  });

  test('support target selector is a select element', async ({ page }) => {
    await setup(page, [makeMeritSubmission('support')]);
    await openActionInPhase(page, 'support');

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

    // Open support action via flat-wall filter pill
    await openActionInPhase(page, 'support');

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
    await expect(page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="misc"]')).toBeVisible({ timeout: 8000 });
  });

  // fix.617 (Angelus ruling): the explicit "Confirm Block" step was intentionally removed —
  // blocks now auto-resolve and render as an automatic effect. The former tests for the
  // Block Resolution panel / Confirm Block button / "Auto-blocks" label / PATCH-on-confirm
  // are retired. Follow-up product issue (separate): a player block must surface in relevant
  // cross-reference intelligence, with STs always able to override.

});

// ══════════════════════════════════════════════════════════════════════════════
//  E2 — Block has no pool builder (Committed pool-status state removed — fix.617)
// ══════════════════════════════════════════════════════════════════════════════
//
// fix.617 (Angelus ruling): the "Committed" pool-status state (badge, Committed button,
// locked pool builder, committed row chip) was intentionally removed from DT processing.
// Every test asserting that surface is retired. The one durable behaviour kept is that an
// auto action (block) has no pool builder.

test.describe('E2 — Block has no pool builder', () => {

  test('block panel (no roll) does NOT have a pool builder', async ({ page }) => {
    // block uses mode: auto, poolFormula: none — right panel shows block resolution, not pool builder
    await setup(page, [makeMeritSubmission('block')]);
    await openActionInPhase(page, 'misc');

    const leftCol = page.locator('.proc-feed-left').first();
    // No pool builder should be present for a block entry
    await expect(leftCol.locator('.proc-pool-builder')).toHaveCount(0);
  });

});
