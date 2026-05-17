/**
 * Issue #332 — Territory Pulse: Influence Contributors and Exceptional Project Successes
 *
 * _buildTerritoryPulsePromptText appends influence and exceptional-ambience sections.
 * Updated in #338: influence is now aggregated by covenant (not per-character), negative
 * contributor names are suppressed, and the exceptional section is split into
 * "Direct hands — Positive (named)" and "Direct hands — Negative (unnamed — count only)".
 *
 * AC1 — Positive influence contributor appears with covenant name and weight;
 *        contributor below +10 is NOT named individually
 * AC2 — Negative influence contributor appears as covenant + weight; name is suppressed
 * AC3 — Validated exceptional positive ambience project contributor appears with name/clan/cov
 * AC4 — Sections with no data render "None this cycle."
 * AC5 — Non-exceptional ambience project does NOT appear in Direct hands section
 */

const { test, expect } = require('@playwright/test');

// ── Shared stubs ────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '332000001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-332', character_ids: [], is_dual_role: false,
};

const CHAR_YUSUF = {
  _id: 'char-yusuf-332', name: 'Yusuf al-Khatib', moniker: null, honorific: null,
  clan: 'Mehket', covenant: 'Circle of the Crone', player: 'Peter P',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 0, clan: 0, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 1, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const TEST_CYCLE = {
  _id: 'cycle-332', cycle_number: 4, status: 'game',
  confirmed_ambience: {}, narrative_notes: '', phase_signoff: {},
  discipline_profile: {}, territory_pulse: {},
};

const TERR_ACADEMY   = { _id: 'terr-academy-332',   slug: 'academy',    name: 'The Academy',    ambience: 'Curated',  feeding_rights: [], regent_id: null, lieutenant_id: null };
const TERR_HARBOUR   = { _id: 'terr-harbour-332',   slug: 'harbour',    name: 'The Harbour',    ambience: 'Untended', feeding_rights: [], regent_id: null, lieutenant_id: null };
const TERR_NS        = { _id: 'terr-ns-332',        slug: 'northshore', name: 'The North Shore', ambience: 'Tended',  feeding_rights: [], regent_id: null, lieutenant_id: null };
const TERR_DOCKYARDS = { _id: 'terr-dock-332',      slug: 'dockyards',  name: 'The Dockyards',  ambience: 'Settled',  feeding_rights: [], regent_id: null, lieutenant_id: null };
const TERR_SC        = { _id: 'terr-sc-332',        slug: 'secondcity', name: 'The Second City', ambience: 'Tended',  feeding_rights: [], regent_id: null, lieutenant_id: null };
const ALL_TERRS      = [TERR_ACADEMY, TERR_HARBOUR, TERR_NS, TERR_DOCKYARDS, TERR_SC];

// ── Submission builders ─────────────────────────────────────────────────────────

/** AC1: Positive influence spend (+2) on The Academy. */
function makePosInfluenceSub() {
  return {
    _id: 'sub-pos-inf-332',
    cycle_id: 'cycle-332',
    character_name: 'Yusuf al-Khatib',
    character_id: 'char-yusuf-332',
    player_name: 'Peter P',
    submitted_at: '2026-05-16T00:00:00Z',
    _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {
      influence_spend: JSON.stringify({ the_academy: 2 }),
    },
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

/** AC2: Negative influence spend (-1) on The Harbour. */
function makeNegInfluenceSub() {
  return {
    _id: 'sub-neg-inf-332',
    cycle_id: 'cycle-332',
    character_name: 'Yusuf al-Khatib',
    character_id: 'char-yusuf-332',
    player_name: 'Peter P',
    submitted_at: '2026-05-16T00:00:00Z',
    _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {
      influence_spend: JSON.stringify({ the_harbour: -1 }),
    },
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

/** AC3: Validated exceptional positive ambience project on The North Shore. */
function makeExceptionalAmbSub() {
  return {
    _id: 'sub-exc-amb-332',
    cycle_id: 'cycle-332',
    character_name: 'Yusuf al-Khatib',
    character_id: 'char-yusuf-332',
    player_name: 'Peter P',
    submitted_at: '2026-05-16T00:00:00Z',
    _raw: { projects: [{ action_type: 'ambience_increase', desired_outcome: 'Improve the mood', detail: '', primary_pool: { expression: '' } }], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {
      project_1_action: 'ambience_increase',
      project_1_territory: 'the_north_shore',
    },
    projects_resolved: [{
      pool_status: 'validated',
      pool_validated: [],
      roll: { exceptional: true, successes: 5 },
      action_type: 'ambience_increase',
      action_type_override: null,
    }],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

/** AC5: Non-exceptional ambience project on The North Shore — should NOT appear in Direct hands section. */
function makeNonExceptionalAmbSub() {
  return {
    _id: 'sub-nonexc-amb-332',
    cycle_id: 'cycle-332',
    character_name: 'Yusuf al-Khatib',
    character_id: 'char-yusuf-332',
    player_name: 'Peter P',
    submitted_at: '2026-05-16T00:00:00Z',
    _raw: { projects: [{ action_type: 'ambience_increase', desired_outcome: 'Improve the mood', detail: '', primary_pool: { expression: '' } }], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {
      project_1_action: 'ambience_increase',
      project_1_territory: 'the_north_shore',
    },
    projects_resolved: [{
      pool_status: 'validated',
      pool_validated: [],
      roll: { exceptional: false, successes: 2 },
      action_type: 'ambience_increase',
      action_type_override: null,
    }],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

// ── Setup + navigation helpers ──────────────────────────────────────────────────

async function setup(page, submission) {
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
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_YUSUF._id, name: CHAR_YUSUF.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR_YUSUF]);
    if (url.includes('/api/territories'))          return ok(ALL_TERRS);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);
}

/** Navigate to the city phase, reveal the prompt for the named territory, and return its textarea. */
async function openPulsePrompt(page, territoryName) {
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="city"]');
  await page.waitForTimeout(500);

  const pulseList = page.locator('.dt-territory-pulse-list');
  await pulseList.waitFor({ state: 'visible', timeout: 8000 });

  const pulseRow = page.locator('.dt-territory-pulse-row').filter({
    has: page.locator('.dt-territory-pulse-name', { hasText: territoryName }),
  });
  await pulseRow.waitFor({ state: 'visible', timeout: 5000 });

  const toggleBtn = pulseRow.locator('.dt-territory-pulse-toggle-btn');
  await toggleBtn.click();
  await page.waitForTimeout(300);

  const ta = pulseRow.locator('.dt-territory-pulse-prompt-ta');
  await ta.waitFor({ state: 'visible', timeout: 3000 });
  return ta;
}

// ── AC1: Positive influence contributor ────────────────────────────────────────

test.describe('Issue #332 — AC1: Positive influence contributor in prompt', () => {

  test('Academy prompt covenant fingerprint positive heading present', async ({ page }) => {
    await setup(page, makePosInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('Covenant fingerprints — Positive:');
  });

  test('Academy prompt positive section includes covenant name', async ({ page }) => {
    await setup(page, makePosInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const posIdx = text.indexOf('Covenant fingerprints — Positive:');
    const posSection = text.slice(posIdx, posIdx + 500);
    expect(posSection).toContain('Circle of the Crone');
  });

  test('Academy prompt positive section does NOT name contributor below +10', async ({ page }) => {
    // makePosInfluenceSub gives +2 — below the +10 individual naming threshold
    await setup(page, makePosInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const posIdx = text.indexOf('Covenant fingerprints — Positive:');
    const posSection = text.slice(posIdx, posIdx + 500);
    expect(posSection).not.toContain('Yusuf al-Khatib');
  });

  test('Academy prompt positive section shows spend total', async ({ page }) => {
    await setup(page, makePosInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('total +2');
  });

  test('Academy prompt negative section shows None this cycle. when only positive spend exists', async ({ page }) => {
    await setup(page, makePosInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const negIdx = text.indexOf('Covenant fingerprints — Negative (no names — covenant only):');
    expect(negIdx).toBeGreaterThan(-1);
    const negSection = text.slice(negIdx, negIdx + 200);
    expect(negSection).toContain('None this cycle.');
  });

});

// ── AC2: Negative influence contributor ────────────────────────────────────────

test.describe('Issue #332 — AC2: Negative influence contributor in prompt', () => {

  test('Harbour prompt covenant fingerprint negative heading present', async ({ page }) => {
    await setup(page, makeNegInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    expect(text).toContain('Covenant fingerprints — Negative (no names — covenant only):');
  });

  test('Harbour prompt negative section includes covenant name', async ({ page }) => {
    await setup(page, makeNegInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    const negIdx = text.indexOf('Covenant fingerprints — Negative (no names — covenant only):');
    const negSection = text.slice(negIdx, negIdx + 500);
    expect(negSection).toContain('Circle of the Crone');
  });

  test('Harbour prompt negative section does NOT include contributor name', async ({ page }) => {
    await setup(page, makeNegInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    const negIdx = text.indexOf('Covenant fingerprints — Negative (no names — covenant only):');
    const negSection = text.slice(negIdx, negIdx + 500);
    expect(negSection).not.toContain('Yusuf al-Khatib');
  });

  test('Harbour prompt negative section shows spend total', async ({ page }) => {
    await setup(page, makeNegInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    expect(text).toContain('total -1');
  });

  test('Harbour prompt positive section shows None this cycle. when only negative spend exists', async ({ page }) => {
    await setup(page, makeNegInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    const posIdx = text.indexOf('Covenant fingerprints — Positive:');
    expect(posIdx).toBeGreaterThan(-1);
    const posToNeg = text.slice(posIdx, text.indexOf('Covenant fingerprints — Negative'));
    expect(posToNeg).toContain('None this cycle.');
  });

});

// ── AC3: Exceptional ambience project success ──────────────────────────────────

test.describe('Issue #332 — AC3: Exceptional ambience project appears in Direct hands section', () => {

  test('North Shore prompt Direct hands positive heading present', async ({ page }) => {
    await setup(page, makeExceptionalAmbSub());
    const ta = await openPulsePrompt(page, 'The North Shore');
    const text = await ta.inputValue();
    expect(text).toContain('Direct hands — Positive (named):');
  });

  test('North Shore prompt lists exceptional contributor by identity', async ({ page }) => {
    await setup(page, makeExceptionalAmbSub());
    const ta = await openPulsePrompt(page, 'The North Shore');
    const text = await ta.inputValue();
    const excIdx = text.indexOf('Direct hands — Positive (named):');
    expect(excIdx).toBeGreaterThan(-1);
    const excSection = text.slice(excIdx, excIdx + 300);
    expect(excSection).toContain('Yusuf al-Khatib');
    expect(excSection).toContain('Mehket');
    expect(excSection).toContain('Circle of the Crone');
  });

  test('North Shore Direct hands positive section does NOT show None this cycle.', async ({ page }) => {
    await setup(page, makeExceptionalAmbSub());
    const ta = await openPulsePrompt(page, 'The North Shore');
    const text = await ta.inputValue();
    const excIdx = text.indexOf('Direct hands — Positive (named):');
    // Slice only up to the start of the Negative section to avoid its "None this cycle."
    const negIdx = text.indexOf('Direct hands — Negative (unnamed — count only):', excIdx);
    const excSection = text.slice(excIdx, negIdx > -1 ? negIdx : excIdx + 200);
    expect(excSection).not.toContain('None this cycle.');
  });

});

// ── AC4: Empty sections fall back to "None this cycle." ────────────────────────

test.describe('Issue #332 — AC4: Sections with no activity show "None this cycle."', () => {

  test('All four new sections present in prompt for every territory', async ({ page }) => {
    await setup(page, makeNegInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('Covenant fingerprints — Positive:');
    expect(text).toContain('Covenant fingerprints — Negative (no names — covenant only):');
    expect(text).toContain('Direct hands — Positive (named):');
    expect(text).toContain('Direct hands — Negative (unnamed — count only):');
  });

  test('Academy shows None this cycle. in all four sections when only Harbour has spend', async ({ page }) => {
    // makeNegInfluenceSub puts spend on Harbour; Academy has none
    await setup(page, makeNegInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const noneMatches = text.match(/None this cycle\./g) || [];
    expect(noneMatches.length).toBeGreaterThanOrEqual(4);
  });

  test('Harbour shows None this cycle. in positive section when only negative spend exists', async ({ page }) => {
    await setup(page, makeNegInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    const posIdx  = text.indexOf('Covenant fingerprints — Positive:');
    const negIdx  = text.indexOf('Covenant fingerprints — Negative (no names — covenant only):');
    const posSection = text.slice(posIdx, negIdx);
    expect(posSection).toContain('None this cycle.');
  });

  test('Harbour shows None this cycle. in Direct hands negative when no negative exceptional exists', async ({ page }) => {
    await setup(page, makeNegInfluenceSub());
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    const negDHIdx = text.indexOf('Direct hands — Negative (unnamed — count only):');
    expect(negDHIdx).toBeGreaterThan(-1);
    const negDHSection = text.slice(negDHIdx, negDHIdx + 200);
    expect(negDHSection).toContain('None this cycle.');
  });

});

// ── AC5: Non-exceptional project excluded from Direct hands section ──────────────

test.describe('Issue #332 — AC5: Non-exceptional ambience project excluded from Direct hands section', () => {

  test('North Shore with non-exceptional project shows None this cycle. in Direct hands positive section', async ({ page }) => {
    await setup(page, makeNonExceptionalAmbSub());
    const ta = await openPulsePrompt(page, 'The North Shore');
    const text = await ta.inputValue();
    const excIdx = text.indexOf('Direct hands — Positive (named):');
    expect(excIdx).toBeGreaterThan(-1);
    const excSection = text.slice(excIdx, excIdx + 100);
    expect(excSection).toContain('None this cycle.');
  });

  test('Non-exceptional project contributor does NOT appear in Direct hands positive section', async ({ page }) => {
    await setup(page, makeNonExceptionalAmbSub());
    const ta = await openPulsePrompt(page, 'The North Shore');
    const text = await ta.inputValue();
    const excIdx = text.indexOf('Direct hands — Positive (named):');
    const excSection = text.slice(excIdx, excIdx + 300);
    expect(excSection).not.toContain('Yusuf al-Khatib');
  });

});
