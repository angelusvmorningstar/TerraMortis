/**
 * issue-922: DT Story push — Territory Pulse dropped for real-territory feeders.
 *
 * Root cause: `_feedTerrEntries()` (downtime-story.js) resolved feeding-grid keys
 * via `TERRITORY_SLUG_MAP[slug]` only. Post-ADR-002 the keys are Mongo _ids (24-hex),
 * absent from that map, so every real-territory feed collapsed to `{ id: 'barrens' }`.
 *
 * Live consequence (the player-facing bug this story actually fixes): in
 * `compilePushOutcome` the Territory Pulse loop does `continue` when
 * `terr.id === 'barrens'` (downtime-story.js:3572). So pre-fix, every real-territory
 * feeder had their Territory Pulse silently dropped from the pushed downtime report.
 *
 * Fix: `_feedTerrEntries` falls back to the existing `resolveTerrId(slug)` helper
 * (_id -> slug via _currentTerritories) when the slug map misses.
 *
 * NOTE: Einar's original "feeding tab says Barrens" complaint is a SEPARATE surface
 * (public/js/tabs/feeding-tab.js computeVitateTally) already fixed by #920 on main.
 * This spec covers the downtime-story.js pulse path only.
 *
 * AC-1: Real territory by _id key — Territory Pulse for that territory is included in the push.
 * AC-2: Genuine Barrens — no Territory Pulse heading (correctly skipped).
 * AC-3: Legacy slug key — still resolves; pulse included (no regression).
 *
 * Run with: npx playwright test tests/issue-922-dt-story-pulse-territory-resolve.spec.js
 */

const { test, expect } = require('@playwright/test');

// ── Identity ────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '922000001', username: 'test_st_922', global_name: 'Test ST 922',
  avatar: null, role: 'st', player_id: 'p-922', character_ids: [], is_dual_role: false,
};

// ── Territories (live shape: _id + slug) ─────────────────────────────────────

const TERR_SECOND_CITY = {
  _id: '69d9e54c00815d471503bea8', slug: 'secondcity', name: 'The Second City',
  ambience: 'Curated', ambienceMod: 3, regent_id: null,
};
const ALL_TERRS = [TERR_SECOND_CITY];

// ── Characters ───────────────────────────────────────────────────────────────

function mkChar(id, name) {
  return {
    _id: id, name, moniker: null, honorific: null,
    clan: 'Ventrue', covenant: 'Carthian Movement', player: 'Test Player',
    blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
    status: { city: 0, clan: 0, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
    attributes: {
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  };
}

const CHAR_EINAR    = mkChar('char-922-einar',    'Einar Solveig');
const CHAR_ANICHKA  = mkChar('char-922-anichka',  'Anichka Test');
const CHAR_MACHEATH = mkChar('char-922-macheath', 'Macheath Test');
const ALL_CHARS = [CHAR_EINAR, CHAR_ANICHKA, CHAR_MACHEATH];

// Cycle carries a Territory Pulse draft keyed by the Second City _id (post-ADR-002 shape).
const CYCLE_922 = {
  _id: 'cycle-922', cycle_number: 4, status: 'active', label: 'Downtime 4',
  confirmed_ambience: {}, narrative_notes: '', phase_signoff: {}, deadline_at: null,
  territory_pulse: {
    '69d9e54c00815d471503bea8': { draft: 'The Second City hums with quiet industry this cycle.' },
  },
};

function mkSub(id, char, feedingTerritories) {
  return {
    _id: id,
    cycle_id: CYCLE_922._id,
    character_name: char.name,
    character_id: char._id,
    player_name: char.player,
    submitted_at: '2026-06-15T00:00:00Z',
    _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: { feeding_territories: JSON.stringify(feedingTerritories) },
    projects_resolved: [],
    // feeding outcome present so compilePushOutcome has content and the pulse loop runs.
    feeding_review: { pool_status: 'validated', outcome: 'You feed where the crowds are thickest.', player_facing_note: '' },
    merit_actions_resolved: [],
    st_narrative: {},
    st_review: { territory_overrides: {} },
  };
}

// Einar — real territory by ObjectID key (the bug scenario).
const SUB_EINAR    = mkSub('sub-922-einar',    CHAR_EINAR,    { '69d9e54c00815d471503bea8': 'feeding_rights' });
// Anichka — genuine Barrens.
const SUB_ANICHKA  = mkSub('sub-922-anichka',  CHAR_ANICHKA,  { the_barrens_no_territory_: 'barrens' });
// Macheath — legacy slug key (regression; resolves via TERRITORY_SLUG_MAP).
const SUB_MACHEATH = mkSub('sub-922-macheath', CHAR_MACHEATH, { the_second_city: 'feeding_rights' });

// ── Setup ────────────────────────────────────────────────────────────────────

async function setup(page, submissions) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (['PUT', 'PATCH', 'POST'].includes(method)) return ok({ ok: true });
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/downtime_cycles'))      return ok([CYCLE_922]);
    if (url.includes('/api/territories'))          return ok(ALL_TERRS);
    if (url.includes('/api/characters/names'))     return ok(ALL_CHARS.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))           return ok(ALL_CHARS);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForSelector('#dt-phase-ribbon', { state: 'visible', timeout: 8000 });
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="story"]');
  await page.waitForSelector('#dt-story-panel', { state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => {
    const rail = document.getElementById('dt-story-nav-rail');
    return rail && rail.innerHTML.length > 0;
  }, { timeout: 5000 });
}

/** Click a character's Push button and return the compiled outcome_text from the PUT body. */
async function pushAndCaptureOutcome(page, subId) {
  const putPromise = page.waitForRequest(
    req => req.method() === 'PUT' && req.url().includes(`/api/downtime_submissions/${subId}`),
    { timeout: 8000 },
  );
  await page.click(`.dt-story-push-btn[data-sub-id="${subId}"]`);
  const req = await putPromise;
  return req.postDataJSON()['st_review.outcome_text'] || '';
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('issue-922: Territory Pulse resolves real territory in pushed outcome', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────
  test('AC-1: real territory by _id key — Territory Pulse included in push', async ({ page }) => {
    await setup(page, [SUB_EINAR]);
    const md = await pushAndCaptureOutcome(page, 'sub-922-einar');
    // The fix: real territory resolves, so its pulse is emitted (pre-fix it was skipped as Barrens).
    expect(md).toContain('## Territory Pulse — The Second City');
    expect(md).toContain('hums with quiet industry');
    // And it must not have collapsed to a Barrens label.
    expect(md).not.toContain('The Barrens');
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────
  test('AC-2: genuine Barrens — no Territory Pulse heading (correctly skipped)', async ({ page }) => {
    await setup(page, [SUB_ANICHKA]);
    const md = await pushAndCaptureOutcome(page, 'sub-922-anichka');
    expect(md).not.toContain('Territory Pulse');
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────
  test('AC-3: legacy slug key — pulse still resolves (no regression)', async ({ page }) => {
    await setup(page, [SUB_MACHEATH]);
    const md = await pushAndCaptureOutcome(page, 'sub-922-macheath');
    expect(md).toContain('## Territory Pulse — The Second City');
  });

});
