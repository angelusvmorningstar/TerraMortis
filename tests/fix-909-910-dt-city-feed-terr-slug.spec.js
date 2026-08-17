/**
 * fix #909 + #910 — DT City: feeding territory slug mis-routing
 *
 * Root cause: `_feedTerrIdsForSub` and `recomputeDisciplineProfile` both called
 * `resolveTerrId(slug)` where the feeding_territories keys are already slugs.
 * `resolveTerrId` converts OID→slug, so a slug input returns null, silently
 * dropping every feeding contribution.
 *
 * Fix #909: `recomputeDisciplineProfile` line 3636 — `.map(([k]) => slugToOid.get(k))`
 * Fix #910: `_feedTerrIdsForSub` line 2332 — `ids.add(slug)` (no resolveTerrId call)
 *
 * AC-1 (#909): After Retally, disciplines from validated feeding reviews appear
 *              in the PATCH body sent to discipline_profile
 * AC-2 (#910): Territory Pulse prompt feeders section includes the character name
 *              for a submission with a slug-keyed feeding_territories entry
 * AC-3 (regression): Project-action disciplines (ambience/rote-feed) continue to
 *                    tally correctly after the feeding fix
 * AC-4 (regression): no_feed submissions are still excluded from the feeder list
 * AC-5 (regression): feeding_territories entries with value "none" are still excluded
 */

const { test, expect } = require('@playwright/test');

// ── Shared stubs ────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '333000909', username: 'test_st_909', global_name: 'Test ST 909',
  avatar: null, role: 'st', player_id: 'p-909', character_ids: [], is_dual_role: false,
};

const CHAR = {
  _id: 'char-909', name: 'Feeder Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Feeder Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: { Majesty: { dots: 3 } }, merits: [], powers: [], ordeals: [],
};

// Territory OID must match what slugToOid resolves from cachedTerritories
const TERR_NS = { _id: 'terr-ns-909', slug: 'northshore', name: 'The North Shore', ambience: 'Tended', feeding_rights: [], regent_id: null, lieutenant_id: null };
const TERR_SC = { _id: 'terr-sc-909', slug: 'secondcity', name: 'The Second City', ambience: 'Settled', feeding_rights: [], regent_id: null, lieutenant_id: null };
const ALL_TERRS = [TERR_NS, TERR_SC];

const BASE_CYCLE = {
  _id: 'cycle-909', cycle_number: 6, status: 'active',
  confirmed_ambience: {}, narrative_notes: '', phase_signoff: {},
  territory_pulse: {},
  discipline_profile: {},
};

// Submission: validated feeding in North Shore using Majesty
const SUB_FEEDING_MAJESTY = {
  _id: 'sub-909-feed',
  chapter_id: 'cycle-909',
  character_name: 'Feeder Test',
  character_id: 'char-909',
  player_name: 'Feeder Player',
  submitted_at: '2026-06-19T00:00:00Z',
  _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
  responses: {
    // slug key — this is the format the player form writes
    feeding_territories: '{"northshore": "feeding_rights"}',
    feeding_method: 'seduction',
  },
  projects_resolved: [],
  feeding_review: {
    pool_status: 'validated',
    pool_validated: 'Wits 3 + Empathy 2 + Majesty 3 = 8',
    pool_player: 'Wits + Empathy + Majesty = 8',
    nine_again: false, eight_again: false,
    notes_thread: [], player_feedback: '',
  },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// Submission: validated ambience project in North Shore using Majesty (regression guard)
const SUB_AMBIENCE_PROJECT = {
  _id: 'sub-909-proj',
  chapter_id: 'cycle-909',
  character_name: 'Feeder Test',
  character_id: 'char-909',
  player_name: 'Feeder Player',
  submitted_at: '2026-06-19T00:00:00Z',
  _raw: { projects: [{ action_type: 'ambience_change', desired_outcome: 'Raise ambience', detail: 'Presence + Majesty' }], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
  responses: { project_1_action: 'ambience_change', project_1_territory: 'northshore' },
  projects_resolved: [
    {
      pool_status: 'validated',
      pool_validated: 'Presence 3 + Expression 2 + Majesty 3 = 8',
      action_type: 'ambience_change',
      roll: { successes: 2, exceptional: false },
    },
  ],
  feeding_review: { pool_status: 'no_feed' },
  merit_actions_resolved: [],
  // Territory override routes project[0] to northshore slug
  st_review: { territory_overrides: { 0: 'northshore' } },
};

// Submissions: ambience projects with terminal statuses (AC-3b/3c/3d — Bug B coverage)
// These use the ST territory override so territory resolution is independent of Bug C.
const SUB_AMBIENCE_OBVIOUS = {
  ...SUB_AMBIENCE_PROJECT,
  _id: 'sub-912-obvious',
  projects_resolved: [{ pool_status: 'obvious', pool_validated: 'Presence 3 + Expression 2 + Majesty 3 = 8', action_type: 'ambience_change', roll: { successes: 3, exceptional: false } }],
};
const SUB_AMBIENCE_NEUTRAL = {
  ...SUB_AMBIENCE_PROJECT,
  _id: 'sub-912-neutral',
  projects_resolved: [{ pool_status: 'neutral', pool_validated: 'Presence 3 + Expression 2 + Majesty 3 = 8', action_type: 'ambience_change', roll: { successes: 2, exceptional: false } }],
};
const SUB_AMBIENCE_SUBTLE = {
  ...SUB_AMBIENCE_PROJECT,
  _id: 'sub-912-subtle',
  projects_resolved: [{ pool_status: 'subtle', pool_validated: 'Presence 3 + Expression 2 + Majesty 3 = 8', action_type: 'ambience_change', roll: { successes: 1, exceptional: false } }],
};

// Submission: ambience_target slug field, no ST territory override (AC-3e — Bug C coverage)
const SUB_AMBIENCE_TARGET_SLUG = {
  _id: 'sub-912-ambtarget',
  chapter_id: 'cycle-909',
  character_name: 'Feeder Test',
  character_id: 'char-909',
  player_name: 'Feeder Player',
  submitted_at: '2026-06-19T00:00:00Z',
  _raw: { projects: [{ action_type: 'ambience_change', desired_outcome: 'Raise ambience', detail: 'Presence + Majesty' }], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
  // dt-form.25+: ambience rows write project_N_ambience_target (slug), NOT project_N_territory
  responses: { project_1_action: 'ambience_change', project_1_ambience_target: 'northshore' },
  projects_resolved: [{ pool_status: 'validated', pool_validated: 'Presence 3 + Expression 2 + Majesty 3 = 8', action_type: 'ambience_change', roll: { successes: 2, exceptional: false } }],
  feeding_review: { pool_status: 'no_feed' },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} }, // no override — must resolve via ambience_target
};

// Submission: no_feed — should be excluded from feeders (AC-4)
const SUB_NO_FEED = {
  _id: 'sub-909-nofeed',
  chapter_id: 'cycle-909',
  character_name: 'Feeder Test',
  character_id: 'char-909',
  player_name: 'Feeder Player',
  submitted_at: '2026-06-19T00:00:00Z',
  _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
  responses: { feeding_territories: '{"northshore": "feeding_rights"}' },
  projects_resolved: [],
  feeding_review: { pool_status: 'no_feed' },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// Submission: feeding_territories value = "none" — should be excluded (AC-5)
const SUB_TERR_NONE = {
  _id: 'sub-909-none',
  chapter_id: 'cycle-909',
  character_name: 'Feeder Test',
  character_id: 'char-909',
  player_name: 'Feeder Player',
  submitted_at: '2026-06-19T00:00:00Z',
  _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
  responses: { feeding_territories: '{"northshore": "none"}' },
  projects_resolved: [],
  feeding_review: { pool_status: 'validated', pool_validated: 'Wits + Majesty = 6', notes_thread: [], player_feedback: '' },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// ── Setup helpers ───────────────────────────────────────────────────────────────

async function setup(page, submissions, cycleOverride, terrsOverride) {
  const cycle = cycleOverride || BASE_CYCLE;
  const terrs = terrsOverride || ALL_TERRS;
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
    if (url.includes('/api/chapters'))      return ok([cycle]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR._id, name: CHAR.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR]);
    if (url.includes('/api/territories'))          return ok(terrs);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);
}

async function navigateToCityPhase(page) {
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="city"]');
  await page.waitForTimeout(600);
}

async function openPulsePrompt(page, territoryName) {
  const pulseList = page.locator('.dt-territory-pulse-list');
  await pulseList.waitFor({ state: 'visible', timeout: 8000 });

  const pulseRow = page.locator('.dt-territory-pulse-row').filter({
    has: page.locator('.dt-territory-pulse-name', { hasText: territoryName }),
  });
  await pulseRow.waitFor({ state: 'visible', timeout: 5000 });
  await pulseRow.locator('.dt-territory-pulse-toggle-btn').click();
  await page.waitForTimeout(300);

  const ta = pulseRow.locator('.dt-territory-pulse-prompt-ta');
  await ta.waitFor({ state: 'visible', timeout: 3000 });
  return ta;
}

// ── AC-1 (#909): Retally writes feeding disciplines to discipline_profile ────────

test.describe('fix.909: Retally counts disciplines from feeding submissions', () => {

  test('AC-1: Retally PUT body includes Majesty under North Shore OID for validated feeding', async ({ page }) => {
    await setup(page, [SUB_FEEDING_MAJESTY]);
    await navigateToCityPhase(page);

    await page.waitForSelector('#disc-retally-btn', { timeout: 8000 });

    // Capture the PATCH sent by recomputeDisciplineProfile
    const putPromise = page.waitForRequest(req =>
      req.method() === 'PUT' && req.url().includes('/api/chapters/')
    );
    await page.click('#disc-retally-btn');
    const putReq = await putPromise;

    const body = putReq.postDataJSON();
    const profile = body?.discipline_profile;
    expect(profile).toBeTruthy();
    // TERR_NS._id is 'terr-ns-909' — slug 'northshore' must resolve to this OID
    expect(profile['terr-ns-909']).toBeTruthy();
    expect(profile['terr-ns-909']['Majesty']).toBe(1);
  });

  test('AC-1b: Feeding with no discipline in pool_validated contributes no entries', async ({ page }) => {
    const plainSub = {
      ...SUB_FEEDING_MAJESTY,
      _id: 'sub-909-plain',
      feeding_review: {
        ...SUB_FEEDING_MAJESTY.feeding_review,
        pool_validated: 'Wits 3 + Empathy 2 = 5', // no discipline name
      },
    };
    await setup(page, [plainSub]);
    await navigateToCityPhase(page);
    await page.waitForSelector('#disc-retally-btn', { timeout: 8000 });

    const putPromise = page.waitForRequest(req =>
      req.method() === 'PUT' && req.url().includes('/api/chapters/')
    );
    await page.click('#disc-retally-btn');
    const putReq = await putPromise;

    const profile = putReq.postDataJSON()?.discipline_profile;
    expect(profile).toBeTruthy();
    // Territory entry may be initialised as {} but must contain no discipline keys
    const terrEntry = profile['terr-ns-909'] || {};
    expect(Object.keys(terrEntry).length).toBe(0);
  });

});

// ── AC-2 (#910): Territory Pulse feeder list populated ──────────────────────────

test.describe('fix.910: Territory Pulse feeder list includes characters who fed', () => {

  test('AC-2: Prompt shows character name in feeders section for slug-keyed feeding_territories entry', async ({ page }) => {
    await setup(page, [SUB_FEEDING_MAJESTY]);
    await navigateToCityPhase(page);
    const ta = await openPulsePrompt(page, 'The North Shore');
    const text = await ta.inputValue();

    const feedersIdx = text.indexOf('Players who fed here this cycle:');
    expect(feedersIdx).toBeGreaterThan(-1);
    const feedersSection = text.slice(feedersIdx);
    expect(feedersSection).toContain('Feeder Test');
    expect(feedersSection).not.toContain('None recorded this cycle.');
  });

  test('AC-2b: Character fed in North Shore does not appear in Second City feeders', async ({ page }) => {
    await setup(page, [SUB_FEEDING_MAJESTY]);
    await navigateToCityPhase(page);
    const ta = await openPulsePrompt(page, 'The Second City');
    const text = await ta.inputValue();

    const feedersIdx = text.indexOf('Players who fed here this cycle:');
    expect(feedersIdx).toBeGreaterThan(-1);
    const feedersSection = text.slice(feedersIdx);
    expect(feedersSection).toContain('None recorded this cycle.');
  });

});

// ── AC-3: Project-action disciplines still tally (regression guard) ─────────────

test.describe('fix.909 regression: project-action disciplines still count', () => {

  test('AC-3: Retally still records Majesty from a validated ambience project', async ({ page }) => {
    await setup(page, [SUB_AMBIENCE_PROJECT]);
    await navigateToCityPhase(page);
    await page.waitForSelector('#disc-retally-btn', { timeout: 8000 });

    const putPromise = page.waitForRequest(req =>
      req.method() === 'PUT' && req.url().includes('/api/chapters/')
    );
    await page.click('#disc-retally-btn');
    const putReq = await putPromise;

    const profile = putReq.postDataJSON()?.discipline_profile;
    expect(profile).toBeTruthy();
    expect(profile['terr-ns-909']).toBeTruthy();
    expect(profile['terr-ns-909']['Majesty']).toBeGreaterThanOrEqual(1);
  });

});

// ── AC-3b/3c/3d (#912 Bug B): 'obvious', 'neutral', 'subtle' pool_status counted ──

test.describe('fix.912 Bug B: ambience projects with terminal non-validated statuses still count', () => {

  test('AC-3b: pool_status "obvious" counts Majesty in discipline profile', async ({ page }) => {
    await setup(page, [SUB_AMBIENCE_OBVIOUS]);
    await navigateToCityPhase(page);
    await page.waitForSelector('#disc-retally-btn', { timeout: 8000 });
    const putPromise = page.waitForRequest(req =>
      req.method() === 'PUT' && req.url().includes('/api/chapters/')
    );
    await page.click('#disc-retally-btn');
    const putReq = await putPromise;
    const profile = putReq.postDataJSON()?.discipline_profile;
    expect(profile).toBeTruthy();
    expect(profile['terr-ns-909']).toBeTruthy();
    expect(profile['terr-ns-909']['Majesty']).toBeGreaterThanOrEqual(1);
  });

  test('AC-3c: pool_status "neutral" counts Majesty in discipline profile', async ({ page }) => {
    await setup(page, [SUB_AMBIENCE_NEUTRAL]);
    await navigateToCityPhase(page);
    await page.waitForSelector('#disc-retally-btn', { timeout: 8000 });
    const putPromise = page.waitForRequest(req =>
      req.method() === 'PUT' && req.url().includes('/api/chapters/')
    );
    await page.click('#disc-retally-btn');
    const putReq = await putPromise;
    const profile = putReq.postDataJSON()?.discipline_profile;
    expect(profile).toBeTruthy();
    expect(profile['terr-ns-909']).toBeTruthy();
    expect(profile['terr-ns-909']['Majesty']).toBeGreaterThanOrEqual(1);
  });

  test('AC-3d: pool_status "subtle" counts Majesty in discipline profile', async ({ page }) => {
    await setup(page, [SUB_AMBIENCE_SUBTLE]);
    await navigateToCityPhase(page);
    await page.waitForSelector('#disc-retally-btn', { timeout: 8000 });
    const putPromise = page.waitForRequest(req =>
      req.method() === 'PUT' && req.url().includes('/api/chapters/')
    );
    await page.click('#disc-retally-btn');
    const putReq = await putPromise;
    const profile = putReq.postDataJSON()?.discipline_profile;
    expect(profile).toBeTruthy();
    expect(profile['terr-ns-909']).toBeTruthy();
    expect(profile['terr-ns-909']['Majesty']).toBeGreaterThanOrEqual(1);
  });

});

// ── AC-3e (#912 Bug C): project_N_ambience_target read for territory ─────────────

test.describe('fix.912 Bug C: project_N_ambience_target resolves territory for ambience rows', () => {

  test('AC-3e: ambience project with project_1_ambience_target slug (no override) resolves Majesty to North Shore', async ({ page }) => {
    await setup(page, [SUB_AMBIENCE_TARGET_SLUG]);
    await navigateToCityPhase(page);
    await page.waitForSelector('#disc-retally-btn', { timeout: 8000 });
    const putPromise = page.waitForRequest(req =>
      req.method() === 'PUT' && req.url().includes('/api/chapters/')
    );
    await page.click('#disc-retally-btn');
    const putReq = await putPromise;
    const profile = putReq.postDataJSON()?.discipline_profile;
    expect(profile).toBeTruthy();
    // territory must resolve to terr-ns-909 via ambience_target slug 'northshore'
    expect(profile['terr-ns-909']).toBeTruthy();
    expect(profile['terr-ns-909']['Majesty']).toBeGreaterThanOrEqual(1);
  });

});

// ── AC-3f: pool_status 'resolved' is counted (#912 Bug B) ───────────────────────

test.describe('fix.912 Bug B: pool_status "resolved" also counted in discipline profile', () => {

  const SUB_AMBIENCE_RESOLVED = {
    ...SUB_AMBIENCE_PROJECT,
    _id: 'sub-912-resolved',
    projects_resolved: [{ pool_status: 'resolved', pool_validated: 'Presence 3 + Expression 2 + Majesty 3 = 8', action_type: 'ambience_change', roll: { successes: 2, exceptional: false } }],
  };

  test('AC-3f: pool_status "resolved" counts Majesty in discipline profile', async ({ page }) => {
    await setup(page, [SUB_AMBIENCE_RESOLVED]);
    await navigateToCityPhase(page);
    await page.waitForSelector('#disc-retally-btn', { timeout: 8000 });
    const putPromise = page.waitForRequest(req =>
      req.method() === 'PUT' && req.url().includes('/api/chapters/')
    );
    await page.click('#disc-retally-btn');
    const putReq = await putPromise;
    const profile = putReq.postDataJSON()?.discipline_profile;
    expect(profile).toBeTruthy();
    expect(profile['terr-ns-909']).toBeTruthy();
    expect(profile['terr-ns-909']['Majesty']).toBeGreaterThanOrEqual(1);
  });

});

// ── AC-3g: excluded pool_status values produce no discipline entries (#912 Bug B) ─

test.describe('fix.912 Bug B: excluded pool_status values do not count', () => {

  const SUB_AMBIENCE_SKIPPED = {
    ...SUB_AMBIENCE_PROJECT,
    _id: 'sub-912-skipped',
    projects_resolved: [{ pool_status: 'skipped', pool_validated: 'Presence 3 + Expression 2 + Majesty 3 = 8', action_type: 'ambience_change', roll: null }],
  };

  test('AC-3g: pool_status "skipped" does not contribute to discipline profile', async ({ page }) => {
    await setup(page, [SUB_AMBIENCE_SKIPPED]);
    await navigateToCityPhase(page);
    await page.waitForSelector('#disc-retally-btn', { timeout: 8000 });
    const putPromise = page.waitForRequest(req =>
      req.method() === 'PUT' && req.url().includes('/api/chapters/')
    );
    await page.click('#disc-retally-btn');
    const putReq = await putPromise;
    const profile = putReq.postDataJSON()?.discipline_profile;
    // Profile may be empty or have an initialised entry, but must contain no Majesty count
    const terrEntry = (profile || {})['terr-ns-909'] || {};
    expect(terrEntry['Majesty'] || 0).toBe(0);
  });

});

// ── AC-3h: legacy MongoDB slug alias resolves via TERRITORY_SLUG_MAP (#912 Bug A) ─

test.describe('fix.912 Bug A: TERRITORY_SLUG_MAP alias path resolves legacy MongoDB slugs', () => {

  // Territory stored with legacy slug 'the_north_shore' instead of canonical 'northshore'.
  // T1's fix: iterates cachedTerritories → sets both 'the_north_shore' and 'northshore' → same OID.
  const TERR_NS_LEGACY = { _id: 'terr-ns-leg-912', slug: 'the_north_shore', name: 'The North Shore', ambience: 'Tended', feeding_rights: [], regent_id: null, lieutenant_id: null };

  const SUB_FEED_LEGACY_TERR = {
    ...SUB_FEEDING_MAJESTY,
    _id: 'sub-912-legacyterr',
    responses: { feeding_territories: '{"northshore": "feeding_rights"}', feeding_method: 'seduction' },
  };

  test('AC-3h: territory with legacy slug "the_north_shore" still resolves Majesty feed to correct OID', async ({ page }) => {
    await setup(page, [SUB_FEED_LEGACY_TERR], undefined, [TERR_NS_LEGACY, TERR_SC]);
    await navigateToCityPhase(page);
    await page.waitForSelector('#disc-retally-btn', { timeout: 8000 });
    const putPromise = page.waitForRequest(req =>
      req.method() === 'PUT' && req.url().includes('/api/chapters/')
    );
    await page.click('#disc-retally-btn');
    const putReq = await putPromise;
    const profile = putReq.postDataJSON()?.discipline_profile;
    expect(profile).toBeTruthy();
    // OID is 'terr-ns-leg-912' — the alias path must map 'northshore' → this OID
    expect(profile['terr-ns-leg-912']).toBeTruthy();
    expect(profile['terr-ns-leg-912']['Majesty']).toBeGreaterThanOrEqual(1);
  });

});

// ── AC-4: no_feed excluded from feeders ─────────────────────────────────────────

test.describe('fix.910 regression: no_feed submissions excluded from feeder list', () => {

  test('AC-4: no_feed submission → "None recorded this cycle." for the territory', async ({ page }) => {
    await setup(page, [SUB_NO_FEED]);
    await navigateToCityPhase(page);
    const ta = await openPulsePrompt(page, 'The North Shore');
    const text = await ta.inputValue();

    const feedersIdx = text.indexOf('Players who fed here this cycle:');
    expect(feedersIdx).toBeGreaterThan(-1);
    expect(text.slice(feedersIdx)).toContain('None recorded this cycle.');
  });

});

// ── AC-5: feeding_territories value "none" excluded ─────────────────────────────

test.describe('fix.910 regression: feeding_territories "none" value excluded', () => {

  test('AC-5: Territory marked "none" in feeding_territories → character absent from feeders', async ({ page }) => {
    await setup(page, [SUB_TERR_NONE]);
    await navigateToCityPhase(page);
    const ta = await openPulsePrompt(page, 'The North Shore');
    const text = await ta.inputValue();

    const feedersIdx = text.indexOf('Players who fed here this cycle:');
    expect(feedersIdx).toBeGreaterThan(-1);
    expect(text.slice(feedersIdx)).toContain('None recorded this cycle.');
  });

});
