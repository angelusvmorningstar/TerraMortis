/**
 * Issue #338 — Territory Pulse: Prompt Structure and Filtering Redesign
 *
 * _buildTerritoryPulsePromptText now:
 *  - Includes feeder cap, feeder count, and crowding gap as labelled lines
 *  - Filters disciplines to 2+ uses only; omits the section entirely if none qualify
 *  - Aggregates influence by covenant with weight labels; positive contributors
 *    below +10 are folded into the covenant aggregate without naming
 *  - Suppresses negative contributor names (covenant + weight only)
 *  - Removes the "any rumours" directive from the framing string
 *  - Names positive exceptional ambience successes; shows negative as a count only
 *
 * AC1 — Prompt includes Feeder cap, Feeder count, and Crowding gap lines
 * AC2 — Discipline used only once does NOT appear; discipline used twice DOES
 * AC3 — Positive influence aggregated by covenant; contributor below +10 not named
 * AC4 — Negative contributor's name absent from prompt; covenant + weight present
 * AC5 — Framing string does not contain "rumours"
 * AC6 — Positive exceptional ambience success is named; negative is a count only
 */

const { test, expect } = require('@playwright/test');

// ── Shared stubs ──────────────────────────────────────────────────────────────

const ST_USER = {
  id: '338000001', username: 'test_st_338', global_name: 'Test ST 338',
  avatar: null, role: 'st', player_id: 'p-338', character_ids: [], is_dual_role: false,
};

const CHAR_YUSUF = {
  _id: 'char-338-yusuf', name: 'Yusuf al-Khatib', moniker: null, honorific: null,
  clan: 'Mehket', covenant: 'Circle of the Crone', player: 'Peter P',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 0, clan: 0, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 1, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const TERR_ACADEMY   = { _id: 'terr-338-academy',   slug: 'academy',    name: 'The Academy',     ambience: 'Curated',  feeding_rights: [], regent_id: null, lieutenant_id: null };
const TERR_HARBOUR   = { _id: 'terr-338-harbour',   slug: 'harbour',    name: 'The Harbour',     ambience: 'Untended', feeding_rights: [], regent_id: null, lieutenant_id: null };
const TERR_NS        = { _id: 'terr-338-ns',        slug: 'northshore', name: 'The North Shore',  ambience: 'Tended',   feeding_rights: [], regent_id: null, lieutenant_id: null };
const TERR_DOCKYARDS = { _id: 'terr-338-dock',      slug: 'dockyards',  name: 'The Dockyards',   ambience: 'Settled',  feeding_rights: [], regent_id: null, lieutenant_id: null };
const TERR_SC        = { _id: 'terr-338-sc',        slug: 'secondcity', name: 'The Second City',  ambience: 'Tended',   feeding_rights: [], regent_id: null, lieutenant_id: null };
const ALL_TERRS = [TERR_ACADEMY, TERR_HARBOUR, TERR_NS, TERR_DOCKYARDS, TERR_SC];

const BASE_CYCLE = {
  _id: 'cycle-338', cycle_number: 3, status: 'game',
  confirmed_ambience: {}, narrative_notes: '', phase_signoff: {},
  discipline_profile: {}, territory_pulse: {},
};

// ── Submission builders ───────────────────────────────────────────────────────

function makeFeedingSub(charId, charName, terrKey, idSuffix = '') {
  return {
    _id: `sub-feed-338-${charId}${idSuffix}`,
    cycle_id: 'cycle-338',
    character_name: charName,
    character_id: charId,
    player_name: 'Test Player',
    submitted_at: '2026-05-17T00:00:00Z',
    _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: { feeding_territories: JSON.stringify({ [terrKey]: 'lure' }) },
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

function makePosInfluenceSub(amount) {
  return {
    _id: 'sub-338-pos-inf',
    cycle_id: 'cycle-338',
    character_name: 'Yusuf al-Khatib',
    character_id: 'char-338-yusuf',
    player_name: 'Peter P',
    submitted_at: '2026-05-17T00:00:00Z',
    _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: { influence_spend: JSON.stringify({ the_academy: amount }) },
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

function makeNegInfluenceSub() {
  return {
    _id: 'sub-338-neg-inf',
    cycle_id: 'cycle-338',
    character_name: 'Yusuf al-Khatib',
    character_id: 'char-338-yusuf',
    player_name: 'Peter P',
    submitted_at: '2026-05-17T00:00:00Z',
    _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: { influence_spend: JSON.stringify({ the_harbour: -1 }) },
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

function makeExceptionalPosSub() {
  return {
    _id: 'sub-338-exc-pos',
    cycle_id: 'cycle-338',
    character_name: 'Yusuf al-Khatib',
    character_id: 'char-338-yusuf',
    player_name: 'Peter P',
    submitted_at: '2026-05-17T00:00:00Z',
    _raw: { projects: [{ action_type: 'ambience_increase', desired_outcome: 'Improve ambience', detail: '', primary_pool: { expression: '' } }], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: { project_1_action: 'ambience_increase', project_1_territory: 'the_north_shore' },
    projects_resolved: [{
      pool_status: 'validated', pool_validated: [],
      roll: { exceptional: true, successes: 5 },
      action_type: 'ambience_increase', action_type_override: null,
    }],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

function makeExceptionalNegSub() {
  return {
    _id: 'sub-338-exc-neg',
    cycle_id: 'cycle-338',
    character_name: 'Yusuf al-Khatib',
    character_id: 'char-338-yusuf',
    player_name: 'Peter P',
    submitted_at: '2026-05-17T00:00:00Z',
    _raw: { projects: [{ action_type: 'ambience_decrease', desired_outcome: 'Worsen ambience', detail: '', primary_pool: { expression: '' } }], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: { project_1_action: 'ambience_decrease', project_1_territory: 'the_harbour' },
    projects_resolved: [{
      pool_status: 'validated', pool_validated: [],
      roll: { exceptional: true, successes: 5 },
      action_type: 'ambience_decrease', action_type_override: null,
    }],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

/** Minimal submission with no influence, feeding, or projects — used as a "at least one sub" stub. */
function makeDummySub() {
  return {
    _id: 'sub-338-dummy',
    cycle_id: 'cycle-338',
    character_name: 'Dummy',
    character_id: 'char-338-dummy',
    player_name: 'Dummy',
    submitted_at: '2026-05-17T00:00:00Z',
    _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {},
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

// ── Setup helper ──────────────────────────────────────────────────────────────

async function setup(page, { cycle = BASE_CYCLE, subs = [] } = {}) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url    = route.request().url();
    const method = route.request().method();
    const ok = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
    if (url.includes('/api/downtime_submissions')) return ok(subs);
    if (url.includes('/api/downtime_cycles'))      return ok([cycle]);
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

async function openPulsePrompt(page, territoryName) {
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="city"]');
  await page.waitForTimeout(500);
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

// ── AC1: Feeder cap / count / crowding gap ────────────────────────────────────

test.describe('Issue #338 — AC1: Feeder cap, count, and crowding gap in prompt', () => {

  test('AC1a — Academy prompt includes Feeder cap line', async ({ page }) => {
    await setup(page, { subs: [makeFeedingSub('char-338-yusuf', 'Yusuf al-Khatib', 'the_academy')] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('Feeder cap:');
    // Academy feeder_cap = 4 in TERRITORY_DATA
    const capLine = text.split('\n').find(l => l.trim().startsWith('Feeder cap:'));
    expect(capLine).toContain('4');
  });

  test('AC1b — Academy prompt Feeder count matches actual feeder count', async ({ page }) => {
    await setup(page, { subs: [makeFeedingSub('char-338-yusuf', 'Yusuf al-Khatib', 'the_academy')] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const feedLine = text.split('\n').find(l => l.trim().startsWith('Feeder count:'));
    expect(feedLine).toBeTruthy();
    expect(feedLine).toContain('1');
  });

  test('AC1c — Academy prompt Crowding gap is negative when under cap', async ({ page }) => {
    // 1 feeder, cap 4 → gap −3
    await setup(page, { subs: [makeFeedingSub('char-338-yusuf', 'Yusuf al-Khatib', 'the_academy')] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const gapLine = text.split('\n').find(l => l.trim().startsWith('Crowding gap:'));
    expect(gapLine).toBeTruthy();
    expect(gapLine).toContain('-3');
  });

  test('AC1d — Academy prompt Crowding gap is positive when overcrowded (5 feeders, cap 4)', async ({ page }) => {
    // Five subs with the same character_id — counts as 5 feeders for the crowding calc
    const subs = [1, 2, 3, 4, 5].map(i =>
      makeFeedingSub('char-338-yusuf', 'Yusuf al-Khatib', 'the_academy', `-oc${i}`)
    );
    await setup(page, { subs });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const gapLine = text.split('\n').find(l => l.trim().startsWith('Crowding gap:'));
    expect(gapLine).toBeTruthy();
    expect(gapLine).toContain('+1');
  });

});

// ── AC2: Discipline threshold ──────────────────────────────────────────────────

test.describe('Issue #338 — AC2: Discipline threshold (2+ uses only)', () => {

  test('AC2a — Discipline used once does NOT appear in prompt', async ({ page }) => {
    const cycle = { ...BASE_CYCLE, discipline_profile: { 'terr-338-academy': { 'Animalism': 1 } } };
    await setup(page, { cycle, subs: [makeDummySub()] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).not.toContain('Animalism');
  });

  test('AC2b — Discipline section absent entirely when no discipline reaches threshold', async ({ page }) => {
    const cycle = { ...BASE_CYCLE, discipline_profile: { 'terr-338-academy': { 'Dominate': 1, 'Majesty': 1 } } };
    await setup(page, { cycle, subs: [makeDummySub()] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).not.toContain('Disciplines used twice or more');
    expect(text).not.toContain('Territorial vibe effects');
  });

  test('AC2c — Discipline used twice DOES appear in prompt', async ({ page }) => {
    const cycle = { ...BASE_CYCLE, discipline_profile: { 'terr-338-academy': { 'Animalism': 2 } } };
    await setup(page, { cycle, subs: [makeDummySub()] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('Animalism');
    expect(text).toContain('Disciplines used twice or more');
  });

  test('AC2d — Discipline at threshold included; discipline below excluded from same territory', async ({ page }) => {
    const cycle = { ...BASE_CYCLE, discipline_profile: { 'terr-338-academy': { 'Majesty': 3, 'Dominate': 1 } } };
    await setup(page, { cycle, subs: [makeDummySub()] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('Majesty');
    expect(text).not.toContain('Dominate');
  });

});

// ── AC3: Covenant aggregation — positive contributor below +10 not named ───────

test.describe('Issue #338 — AC3: Positive influence covenant aggregation', () => {

  test('AC3a — Covenant fingerprint positive heading present', async ({ page }) => {
    await setup(page, { subs: [makePosInfluenceSub(2)] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('Covenant fingerprints — Positive:');
  });

  test('AC3b — Covenant name appears in positive section', async ({ page }) => {
    await setup(page, { subs: [makePosInfluenceSub(2)] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const posIdx = text.indexOf('Covenant fingerprints — Positive:');
    const posSection = text.slice(posIdx, posIdx + 500);
    expect(posSection).toContain('Circle of the Crone');
  });

  test('AC3c — Contributor below +10 is NOT named in positive section', async ({ page }) => {
    // Yusuf spends +2 — below the +10 naming threshold
    await setup(page, { subs: [makePosInfluenceSub(2)] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const posIdx = text.indexOf('Covenant fingerprints — Positive:');
    const posSection = text.slice(posIdx, posIdx + 500);
    expect(posSection).not.toContain('Yusuf al-Khatib');
  });

  test('AC3d — Spend total appears in positive line', async ({ page }) => {
    await setup(page, { subs: [makePosInfluenceSub(2)] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('total +2');
  });

  test('AC3e — Weight label present in positive line', async ({ page }) => {
    // +2 is "light" (1–5)
    await setup(page, { subs: [makePosInfluenceSub(2)] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('weight: light');
  });

});

// ── AC4: Negative contributor names suppressed ────────────────────────────────

test.describe('Issue #338 — AC4: Negative influence names suppressed', () => {

  test('AC4a — Negative covenant section heading present', async ({ page }) => {
    await setup(page, { subs: [makeNegInfluenceSub()] });
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    expect(text).toContain('Covenant fingerprints — Negative (no names — covenant only):');
  });

  test('AC4b — Negative contributor name NOT in the prompt', async ({ page }) => {
    await setup(page, { subs: [makeNegInfluenceSub()] });
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    const negIdx = text.indexOf('Covenant fingerprints — Negative (no names — covenant only):');
    const negSection = text.slice(negIdx, negIdx + 500);
    expect(negSection).not.toContain('Yusuf al-Khatib');
  });

  test('AC4c — Covenant name IS present in negative section', async ({ page }) => {
    await setup(page, { subs: [makeNegInfluenceSub()] });
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    const negIdx = text.indexOf('Covenant fingerprints — Negative (no names — covenant only):');
    const negSection = text.slice(negIdx, negIdx + 500);
    expect(negSection).toContain('Circle of the Crone');
  });

  test('AC4d — Negative total appears without a personal name', async ({ page }) => {
    await setup(page, { subs: [makeNegInfluenceSub()] });
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    expect(text).toContain('total -1');
  });

});

// ── AC5: No rumours directive in framing ──────────────────────────────────────

test.describe('Issue #338 — AC5: "Rumours" directive removed from framing', () => {

  test('AC5a — Prompt does not contain the word "rumours"', async ({ page }) => {
    await setup(page, { subs: [makeDummySub()] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text.toLowerCase()).not.toContain('rumours');
  });

  test('AC5b — Framing contains the three-beat instruction', async ({ page }) => {
    await setup(page, { subs: [makeDummySub()] });
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('Cover, in order:');
    expect(text).toContain('Blood quality and feeding pressure');
    expect(text).toContain('Discipline residue');
    expect(text).toContain('Covenant fingerprints and direct hands');
  });

});

// ── AC6: Positive exceptional named; negative exceptional count only ───────────

test.describe('Issue #338 — AC6: Exceptional ambience — positive named, negative count only', () => {

  test('AC6a — Positive exceptional section heading present', async ({ page }) => {
    await setup(page, { subs: [makeExceptionalPosSub()] });
    const ta = await openPulsePrompt(page, 'The North Shore');
    const text = await ta.inputValue();
    expect(text).toContain('Direct hands — Positive (named):');
  });

  test('AC6b — Positive exceptional contributor IS named in Direct hands section', async ({ page }) => {
    await setup(page, { subs: [makeExceptionalPosSub()] });
    const ta = await openPulsePrompt(page, 'The North Shore');
    const text = await ta.inputValue();
    const posIdx = text.indexOf('Direct hands — Positive (named):');
    expect(posIdx).toBeGreaterThan(-1);
    const posSection = text.slice(posIdx, posIdx + 300);
    expect(posSection).toContain('Yusuf al-Khatib');
  });

  test('AC6c — Negative exceptional section heading present', async ({ page }) => {
    await setup(page, { subs: [makeExceptionalNegSub()] });
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    expect(text).toContain('Direct hands — Negative (unnamed — count only):');
  });

  test('AC6d — Negative exceptional contributor name NOT in Direct hands negative section', async ({ page }) => {
    await setup(page, { subs: [makeExceptionalNegSub()] });
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    const negIdx = text.indexOf('Direct hands — Negative (unnamed — count only):');
    expect(negIdx).toBeGreaterThan(-1);
    const negSection = text.slice(negIdx, negIdx + 300);
    expect(negSection).not.toContain('Yusuf al-Khatib');
  });

  test('AC6e — Negative exceptional count string present (not "None this cycle.")', async ({ page }) => {
    await setup(page, { subs: [makeExceptionalNegSub()] });
    const ta = await openPulsePrompt(page, 'The Harbour');
    const text = await ta.inputValue();
    const negIdx = text.indexOf('Direct hands — Negative (unnamed — count only):');
    const negSection = text.slice(negIdx, negIdx + 300);
    expect(negSection).toContain('negative exceptional ambience success');
    expect(negSection).not.toContain('None this cycle.');
  });

});
