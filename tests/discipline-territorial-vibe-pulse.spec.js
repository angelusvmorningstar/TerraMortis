/**
 * Discipline territorial vibe reference in Territory Pulse prompt
 *
 * _buildTerritoryPulsePromptText appends a "Territorial vibe effects" section
 * listing atmospheric keywords for each discipline recorded in the territory,
 * giving the LLM mood context to weave into the pulse prose.
 *
 * AC1 — A discipline with known effects produces a vibe line in the section
 * AC2 — No disciplines recorded → section shows "None recorded this cycle."
 * AC3 — A combat discipline (no territorial effect) → "None with known territorial effects."
 * AC4 — Multiple disciplines each produce their own vibe line
 * AC5 — Section heading always present
 */

const { test, expect } = require('@playwright/test');

// ── Shared stubs ────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '333000001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-vibe', character_ids: [], is_dual_role: false,
};

const CHAR_STUB = {
  _id: 'char-vibe-stub', name: 'Vibe Tester', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Tester',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 0, clan: 0, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

// Territory IDs match what _terrOidForSlug resolves from cachedTerritories
const TERR_ACADEMY   = { _id: 'terr-academy-vibe',   slug: 'academy',    name: 'The Academy',    ambience: 'Curated',  feeding_rights: [], regent_id: null, lieutenant_id: null };
const TERR_HARBOUR   = { _id: 'terr-harbour-vibe',   slug: 'harbour',    name: 'The Harbour',    ambience: 'Untended', feeding_rights: [], regent_id: null, lieutenant_id: null };
const TERR_NS        = { _id: 'terr-ns-vibe',        slug: 'northshore', name: 'The North Shore', ambience: 'Tended',  feeding_rights: [], regent_id: null, lieutenant_id: null };
const TERR_DOCKYARDS = { _id: 'terr-dock-vibe',      slug: 'dockyards',  name: 'The Dockyards',  ambience: 'Settled',  feeding_rights: [], regent_id: null, lieutenant_id: null };
const TERR_SC        = { _id: 'terr-sc-vibe',        slug: 'secondcity', name: 'The Second City', ambience: 'Tended',  feeding_rights: [], regent_id: null, lieutenant_id: null };
const ALL_TERRS      = [TERR_ACADEMY, TERR_HARBOUR, TERR_NS, TERR_DOCKYARDS, TERR_SC];

// ── Cycle builders ──────────────────────────────────────────────────────────────

/** Cycle with Auspex x2 on Academy (OID-keyed per ADR-002). */
function makeCycleWithAuspex() {
  return {
    _id: 'cycle-vibe-1', cycle_number: 5, status: 'game',
    confirmed_ambience: {}, narrative_notes: '', phase_signoff: {},
    territory_pulse: {},
    discipline_profile: { 'terr-academy-vibe': { Auspex: 2 } },
  };
}

/** Cycle with no disciplines recorded on Academy. */
function makeCycleNoDisciplines() {
  return {
    _id: 'cycle-vibe-2', cycle_number: 5, status: 'game',
    confirmed_ambience: {}, narrative_notes: '', phase_signoff: {},
    territory_pulse: {},
    discipline_profile: {},
  };
}

/** Cycle with Celerity on Academy — a combat discipline with no territorial effect entry. */
function makeCycleWithCelerity() {
  return {
    _id: 'cycle-vibe-3', cycle_number: 5, status: 'game',
    confirmed_ambience: {}, narrative_notes: '', phase_signoff: {},
    territory_pulse: {},
    discipline_profile: { 'terr-academy-vibe': { Celerity: 3 } },
  };
}

/** Cycle with Nightmare x1 and Majesty x2 on Academy. */
function makeCycleMultipleDiscs() {
  return {
    _id: 'cycle-vibe-4', cycle_number: 5, status: 'game',
    confirmed_ambience: {}, narrative_notes: '', phase_signoff: {},
    territory_pulse: {},
    discipline_profile: { 'terr-academy-vibe': { Nightmare: 1, Majesty: 2 } },
  };
}

const EMPTY_SUB = {
  _id: 'sub-vibe-empty',
  cycle_id: 'cycle-vibe-1',
  character_name: 'Vibe Tester',
  character_id: 'char-vibe-stub',
  player_name: 'Tester',
  submitted_at: '2026-05-17T00:00:00Z',
  _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
  responses: {},
  projects_resolved: [],
  feeding_review: null,
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// ── Setup + navigation helpers ──────────────────────────────────────────────────

async function setup(page, cycle) {
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
    if (url.includes('/api/downtime_submissions')) return ok([{ ...EMPTY_SUB, cycle_id: cycle._id }]);
    if (url.includes('/api/downtime_cycles'))      return ok([cycle]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_STUB._id, name: CHAR_STUB.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR_STUB]);
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

// ── AC5: Section heading always present ────────────────────────────────────────

test.describe('Discipline vibe — AC5: Section heading always present in prompt', () => {

  test('Heading appears when disciplines are recorded', async ({ page }) => {
    await setup(page, makeCycleWithAuspex());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('Territorial vibe effects of disciplines used');
  });

  test('Heading appears even when no disciplines recorded', async ({ page }) => {
    await setup(page, makeCycleNoDisciplines());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('Territorial vibe effects of disciplines used');
  });

});

// ── AC1: Known discipline produces vibe line ───────────────────────────────────

test.describe('Discipline vibe — AC1: Known discipline produces vibe line', () => {

  test('Auspex on Academy → vibe line contains Auspex effects', async ({ page }) => {
    await setup(page, makeCycleWithAuspex());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const vibeIdx = text.indexOf('Territorial vibe effects of disciplines used');
    const vibeSection = text.slice(vibeIdx);
    expect(vibeSection).toContain('Auspex:');
    expect(vibeSection).toContain('paranoia');
    expect(vibeSection).toContain('ghost sightings');
  });

  test('Auspex vibe section does NOT show "None recorded this cycle."', async ({ page }) => {
    await setup(page, makeCycleWithAuspex());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const vibeIdx = text.indexOf('Territorial vibe effects of disciplines used');
    const nextSectionIdx = text.indexOf('\nPlayers who fed here', vibeIdx);
    const vibeSection = text.slice(vibeIdx, nextSectionIdx);
    expect(vibeSection).not.toContain('None recorded this cycle.');
  });

});

// ── AC2: No disciplines → "None recorded this cycle." ─────────────────────────

test.describe('Discipline vibe — AC2: No disciplines recorded falls back correctly', () => {

  test('Empty discipline profile → vibe section shows None recorded this cycle.', async ({ page }) => {
    await setup(page, makeCycleNoDisciplines());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const vibeIdx = text.indexOf('Territorial vibe effects of disciplines used');
    const vibeSection = text.slice(vibeIdx);
    expect(vibeSection.trim()).toContain('None recorded this cycle.');
  });

});

// ── AC3: Combat discipline → "None with known territorial effects." ─────────────

test.describe('Discipline vibe — AC3: Combat discipline has no territorial effect entry', () => {

  test('Celerity only → vibe section shows None with known territorial effects.', async ({ page }) => {
    await setup(page, makeCycleWithCelerity());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const vibeIdx = text.indexOf('Territorial vibe effects of disciplines used');
    const vibeSection = text.slice(vibeIdx);
    expect(vibeSection).toContain('None with known territorial effects.');
  });

  test('Disciplines used section still lists Celerity even though vibe is blank', async ({ page }) => {
    await setup(page, makeCycleWithCelerity());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('Celerity (used 3 times)');
  });

});

// ── AC4: Multiple disciplines each produce their own vibe line ─────────────────

test.describe('Discipline vibe — AC4: Multiple disciplines produce separate vibe lines', () => {

  test('Nightmare and Majesty each appear as separate vibe lines', async ({ page }) => {
    await setup(page, makeCycleMultipleDiscs());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    const vibeIdx = text.indexOf('Territorial vibe effects of disciplines used');
    const vibeSection = text.slice(vibeIdx);
    expect(vibeSection).toContain('Nightmare:');
    expect(vibeSection).toContain('Fear, dread, paranoia');
    expect(vibeSection).toContain('Majesty:');
    expect(vibeSection).toContain('lasciviousness');
  });

  test('Both Nightmare and Majesty appear in the disciplines used section', async ({ page }) => {
    await setup(page, makeCycleMultipleDiscs());
    const ta = await openPulsePrompt(page, 'The Academy');
    const text = await ta.inputValue();
    expect(text).toContain('Nightmare (used 1 time)');
    expect(text).toContain('Majesty (used 2 times)');
  });

});
