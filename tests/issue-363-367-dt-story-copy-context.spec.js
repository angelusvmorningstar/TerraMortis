/**
 * Tests for fix.363–367: DT Story copy-context bug fixes
 *
 * fix.363 — _currentSub snapshot in handleCopyProjectContext prevents stale read
 *           when ST switches characters during the async API fetch
 * fix.364 — same snapshot in handleCopyStoryMomentContext + handleCopyTerritoryContext;
 *           extend prev-cycle lookup to include legacy touchstone.response (DT2 vignettes)
 * fix.365 — add player narrative field to buildTouchstoneContext (covered by fix to
 *           issue-352 tests — label updated from "Player's vignette:" to "Player-submitted narrative:")
 * fix.366 — patrol reads project_N_target_terr; ambience reads project_N_ambience_target
 * fix.367 — remove redundant char?.honorific prefix from _compactCharHeader
 *           (displayName already includes the honorific)
 */

const { test, expect } = require('@playwright/test');

// ── Shared stubs ───────────────────────────────────────────────────────────────

const ST_USER = {
  id: '363000001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-363', character_ids: [], is_dual_role: false,
};

const DT3_CYCLE = {
  _id: 'cycle-363-dt3', game_number: 3, status: 'active',
  cycle_number: 3, submission_count: 2, phase_signoff: {},
  confirmed_ambience: {}, narrative_notes: '', label: 'Downtime 3',
};

const DT2_CYCLE = {
  _id: 'cycle-363-dt2', game_number: 2, status: 'closed',
  cycle_number: 2, submission_count: 1, phase_signoff: {},
  confirmed_ambience: {}, narrative_notes: '', label: 'Downtime 2',
};

// Character with honorific — fix.367 subject
const CHAR_LORD = {
  _id: 'char-lord-367', name: 'Marcus Blackwood', moniker: null, honorific: 'Lord',
  clan: 'Ventrue', covenant: 'Invictus', concept: 'The Patrician', player: 'Marcus Player',
  blood_potency: 3, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  mask: 'Director', dirge: 'Monster',
  status: { city: 2, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 2, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 3, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 4, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  touchstones: [{ name: 'Lady Ashgrove', humanity: 7, desc: 'Old flame' }],
};

// Character without honorific — used as the "other character" in race test
const CHAR_REED = {
  _id: 'char-reed-363', name: 'Reed Justice', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Carthian Movement', player: 'Reed Player',
  blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  mask: 'Bon Vivant', dirge: 'Idealist',
  status: { city: 1, clan: 0, covenant: { 'Carthian Movement': 1, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  touchstones: [],
};

// ── Submission builders ────────────────────────────────────────────────────────

function makeStoryMomentSub(char, opts = {}) {
  return {
    _id: `sub-${char._id}-dt3`,
    cycle_id: DT3_CYCLE._id,
    character_name: char.name,
    character_id: char._id,
    player_name: char.player,
    submitted_at: '2026-05-17T00:00:00Z',
    _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: { ...(opts.responses || {}) },
    projects_resolved: opts.projects_resolved || [],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
    st_narrative: opts.st_narrative || {},
  };
}

// ── Clipboard stub ─────────────────────────────────────────────────────────────

function addClipboardStub(page) {
  return page.addInitScript(() => {
    window.__lastClipboardText = null;
    const stub = {
      writeText(text) { window.__lastClipboardText = text; return Promise.resolve(); },
      readText()      { return Promise.resolve(window.__lastClipboardText || ''); },
    };
    try { Object.defineProperty(navigator, 'clipboard', { get: () => stub, configurable: true }); }
    catch { navigator.clipboard = stub; }
  });
}

// ── Page setup ─────────────────────────────────────────────────────────────────

async function setupPage(page, { characters, submissions, routeDelay = 0 } = {}) {
  await addClipboardStub(page);

  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', async route => {
    const url    = route.request().url();
    const method = route.request().method();
    const ok = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    const okDelayed = async (body, ms) => {
      await new Promise(r => setTimeout(r, ms));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    };

    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });

    if (url.includes('/api/downtime_submissions')) {
      const m = url.match(/[?&]cycle_id=([^&]+)/);
      if (m) {
        const cid = decodeURIComponent(m[1]);
        if (cid === DT2_CYCLE._id) return ok([]);
        return ok(submissions.filter(s => s.cycle_id === DT3_CYCLE._id));
      }
      return ok(submissions);
    }

    if (url.includes('/api/downtime_cycles')) {
      return routeDelay > 0
        ? okDelayed([DT3_CYCLE, DT2_CYCLE], routeDelay)
        : ok([DT3_CYCLE, DT2_CYCLE]);
    }

    const charIds = characters.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific }));
    if (url.includes('/api/characters/names')) return ok(charIds);
    if (url.includes('/api/characters'))       return ok(characters);
    if (url.includes('/api/territories'))      return ok([]);
    if (url.includes('/api/game_sessions'))    return ok([]);
    if (url.includes('/api/session_logs'))     return ok([]);
    if (url.includes('/api/relationships'))    return ok(null);
    if (url.includes('/api/npcs'))             return ok([]);
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
    return rail && rail.querySelector('.dt-story-pill') !== null;
  }, { timeout: 5000 });
}

async function selectChar(page, charId) {
  await page.locator(`.dt-story-pill[data-char-id="${charId}"]`).click();
  await page.waitForSelector('.dt-story-char-content', { state: 'visible', timeout: 5000 });
}

// ── fix.367: Honorific not doubled ────────────────────────────────────────────

test.describe('fix.367 — double honorific in _compactCharHeader', () => {

  test('Story Moment vignette prompt header reads "Lord Marcus Blackwood" not "Lord Lord …"', async ({ page }) => {
    const sub = makeStoryMomentSub(CHAR_LORD, {
      responses: { personal_story_text: 'An evening at the opera.' },
    });
    await setupPage(page, { characters: [CHAR_LORD], submissions: [sub] });
    await selectChar(page, CHAR_LORD._id);

    await page.locator('input[name="story-moment-format"][value="vignette"]').check();
    const copyBtn = page.locator('.dt-story-section[data-section="story_moment"] .dt-story-copy-ctx-btn');
    await copyBtn.click();
    await expect(copyBtn).toHaveText('Copied!', { timeout: 5000 });

    const text = await page.evaluate(() => window.__lastClipboardText);
    expect(text).toContain('Lord Marcus Blackwood');
    expect(text).not.toContain('Lord Lord');
  });

});

// ── fix.366: Territory field mismatch ─────────────────────────────────────────

test.describe('fix.366 — territory field name mismatch', () => {

  test('Patrol copy context reads project_1_target_terr and shows "The Harbour"', async ({ page }) => {
    const sub = makeStoryMomentSub(CHAR_REED, {
      responses: {
        project_1_target_terr: 'harbour',  // modern DT form patrol field
        project_1_territory:   '',          // legacy field — empty (triggers bug without fix)
      },
      projects_resolved: [{
        action_type: 'patrol_scout',
        pool_status: 'rolled',
        pool_validated: '7',
        pool_player: '7',
        roll: null,
        notes_thread: [],
      }],
    });
    await setupPage(page, { characters: [CHAR_REED], submissions: [sub] });
    await selectChar(page, CHAR_REED._id);

    const copyBtn = page.locator('.dt-story-section[data-section="project_responses"] .dt-story-copy-ctx-btn').first();
    await copyBtn.click();
    await expect(copyBtn).toHaveText('Copied!', { timeout: 5000 });

    const text = await page.evaluate(() => window.__lastClipboardText);
    expect(text).toContain('Territory: The Harbour');
    expect(text).not.toContain('Territory: Unknown');
  });

  test('Ambience copy context reads project_1_ambience_target and shows "The Harbour"', async ({ page }) => {
    const sub = makeStoryMomentSub(CHAR_REED, {
      responses: {
        project_1_ambience_target: 'harbour',  // modern DT form ambience field
        project_1_territory:       '',          // legacy field — empty (triggers bug without fix)
      },
      projects_resolved: [{
        action_type: 'ambience_increase',
        pool_status: 'rolled',
        pool_validated: '5',
        pool_player: '5',
        roll: null,
        notes_thread: [],
      }],
    });
    await setupPage(page, { characters: [CHAR_REED], submissions: [sub] });
    await selectChar(page, CHAR_REED._id);

    const copyBtn = page.locator('.dt-story-section[data-section="project_responses"] .dt-story-copy-ctx-btn').first();
    await copyBtn.click();
    await expect(copyBtn).toHaveText('Copied!', { timeout: 5000 });

    const text = await page.evaluate(() => window.__lastClipboardText);
    expect(text).toContain('Territory: The Harbour');
    expect(text).not.toContain('Territory: Unknown');
  });

});

// ── fix.364: Legacy touchstone.response prev-cycle path ───────────────────────

test.describe('fix.364 — legacy vignette prev-cycle path', () => {

  test('Vignette prompt surfaces prev-cycle content from legacy touchstone.response when story_moment is absent', async ({ page }) => {
    // DT3 sub for the character
    const dt3Sub = makeStoryMomentSub(CHAR_REED, {
      responses: { personal_story_text: 'The warehouse lights go dark one by one.' },
    });

    // DT2 sub — processed as a vignette using the legacy touchstone field (pre-consolidation)
    const dt2Sub = {
      _id: 'sub-reed-dt2-364',
      cycle_id: DT2_CYCLE._id,
      character_name: CHAR_REED.name,
      character_id: CHAR_REED._id,
      player_name: CHAR_REED.player,
      submitted_at: '2026-05-10T00:00:00Z',
      _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
      responses: {},
      projects_resolved: [],
      feeding_review: null,
      merit_actions_resolved: [],
      st_review: { territory_overrides: {} },
      // Legacy shape: touchstone.response set, no story_moment field
      st_narrative: {
        touchstone: { response: 'You stand at the chain-link fence, watching.' },
      },
    };

    await page.route('http://localhost:3000/**', async route => {
      const url    = route.request().url();
      const method = route.request().method();
      const ok = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (method !== 'GET') return ok({ ok: true });
      if (url.includes('/api/downtime_submissions')) {
        const m = url.match(/[?&]cycle_id=([^&]+)/);
        if (m) {
          const cid = decodeURIComponent(m[1]);
          if (cid === DT2_CYCLE._id) return ok([dt2Sub]);
          return ok([dt3Sub]);
        }
        return ok([dt3Sub]);
      }
      if (url.includes('/api/downtime_cycles'))    return ok([DT3_CYCLE, DT2_CYCLE]);
      if (url.includes('/api/characters/names'))   return ok([{ _id: CHAR_REED._id, name: CHAR_REED.name, moniker: null, honorific: null }]);
      if (url.includes('/api/characters'))         return ok([CHAR_REED]);
      if (url.includes('/api/territories'))        return ok([]);
      if (url.includes('/api/game_sessions'))      return ok([]);
      if (url.includes('/api/session_logs'))       return ok([]);
      if (url.includes('/api/relationships'))      return ok(null);
      if (url.includes('/api/npcs'))               return ok([]);
      return ok([]);
    });

    await addClipboardStub(page);
    await page.addInitScript(({ user }) => {
      localStorage.setItem('tm_auth_token', 'local-test-token');
      localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
      localStorage.setItem('tm_auth_user', JSON.stringify(user));
    }, { user: ST_USER });

    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
    await page.click('[data-domain="downtime"]');
    await page.waitForSelector('#dt-phase-ribbon', { state: 'visible', timeout: 8000 });
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="story"]');
    await page.waitForSelector('#dt-story-panel', { state: 'visible', timeout: 5000 });
    await page.waitForFunction(() => {
      const rail = document.getElementById('dt-story-nav-rail');
      return rail && rail.querySelector('.dt-story-pill') !== null;
    }, { timeout: 5000 });
    await selectChar(page, CHAR_REED._id);

    await page.locator('input[name="story-moment-format"][value="vignette"]').check();
    const copyBtn = page.locator('.dt-story-section[data-section="story_moment"] .dt-story-copy-ctx-btn');
    await copyBtn.click();
    await expect(copyBtn).toHaveText('Copied!', { timeout: 8000 });

    const text = await page.evaluate(() => window.__lastClipboardText);
    expect(text).toContain('Previous vignette with this touchstone (Downtime 2):');
    expect(text).toContain('You stand at the chain-link fence, watching.');
  });

});

// ── fix.367: No-honorific character has clean header ─────────────────────────

test.describe('fix.367 — no-honorific character header is unchanged', () => {

  test('Character without honorific has clean "Reed Justice" header — no leading space', async ({ page }) => {
    const sub = makeStoryMomentSub(CHAR_REED, {
      responses: { personal_story_text: 'The warehouse lights.' },
    });
    await setupPage(page, { characters: [CHAR_REED], submissions: [sub] });
    await selectChar(page, CHAR_REED._id);

    await page.locator('input[name="story-moment-format"][value="vignette"]').check();
    const copyBtn = page.locator('.dt-story-section[data-section="story_moment"] .dt-story-copy-ctx-btn');
    await copyBtn.click();
    await expect(copyBtn).toHaveText('Copied!', { timeout: 5000 });

    const text = await page.evaluate(() => window.__lastClipboardText);
    expect(text).toContain('Reed Justice');
    // No honorific means no extra words before the name
    expect(text).not.toMatch(/\w+ Reed Justice/);
  });

});

// ── fix.364: No-prev-cycle → prev field absent ────────────────────────────────

test.describe('fix.364 — no previous cycle submission', () => {

  test('Vignette prompt has no "Previous vignette" section when character has no DT2 submission', async ({ page }) => {
    const dt3Sub = makeStoryMomentSub(CHAR_REED, {
      responses: { personal_story_text: 'Something brief.' },
    });
    // setupPage returns empty array for DT2 cycle_id by default
    await setupPage(page, { characters: [CHAR_REED], submissions: [dt3Sub] });
    await selectChar(page, CHAR_REED._id);

    await page.locator('input[name="story-moment-format"][value="vignette"]').check();
    const copyBtn = page.locator('.dt-story-section[data-section="story_moment"] .dt-story-copy-ctx-btn');
    await copyBtn.click();
    await expect(copyBtn).toHaveText('Copied!', { timeout: 5000 });

    const text = await page.evaluate(() => window.__lastClipboardText);
    expect(text).not.toContain('Previous vignette with this touchstone');
  });

});

// ── fix.366: Generic project action reads _territory unchanged ────────────────

test.describe('fix.366 — generic project action still reads _territory', () => {

  test('Investigate action reads project_1_territory and shows "The Harbour"', async ({ page }) => {
    const sub = makeStoryMomentSub(CHAR_REED, {
      responses: {
        project_1_territory:       'harbour',  // generic field — investigate uses this
        project_1_target_terr:     '',          // patrol-specific field — should NOT be read
        project_1_ambience_target: '',          // ambience-specific field — should NOT be read
      },
      projects_resolved: [{
        action_type: 'investigate',
        pool_status: 'rolled',
        pool_validated: '6',
        pool_player: '6',
        roll: null,
        notes_thread: [],
      }],
    });
    await setupPage(page, { characters: [CHAR_REED], submissions: [sub] });
    await selectChar(page, CHAR_REED._id);

    const copyBtn = page.locator('.dt-story-section[data-section="project_responses"] .dt-story-copy-ctx-btn').first();
    await copyBtn.click();
    await expect(copyBtn).toHaveText('Copied!', { timeout: 5000 });

    const text = await page.evaluate(() => window.__lastClipboardText);
    expect(text).toContain('Territory: The Harbour');
  });

});

// ── fix.363: No-draft → Existing Draft section absent ────────────────────────

test.describe('fix.363 — no prior draft means no Existing Draft section', () => {

  test('Project copy context omits Existing Draft section when no ST draft saved', async ({ page }) => {
    const sub = makeStoryMomentSub(CHAR_REED, {
      responses: { project_1_title: 'The Empty Project' },
      projects_resolved: [{
        action_type: 'investigate',
        pool_status: 'rolled',
        pool_validated: '5',
        pool_player: '5',
        roll: null,
        notes_thread: [],
      }],
      // No st_narrative.project_responses — no draft saved
    });
    await setupPage(page, { characters: [CHAR_REED], submissions: [sub] });
    await selectChar(page, CHAR_REED._id);

    const copyBtn = page.locator('.dt-story-section[data-section="project_responses"] .dt-story-copy-ctx-btn').first();
    await copyBtn.click();
    await expect(copyBtn).toHaveText('Copied!', { timeout: 5000 });

    const text = await page.evaluate(() => window.__lastClipboardText);
    expect(text).not.toContain('Existing draft');
  });

});

// ── fix.363: Async snapshot — race condition guard ────────────────────────────

test.describe('fix.363 — _currentSub snapshot prevents stale read during async fetch', () => {

  test('Project copy context for char A uses A\'s draft even when ST switches to char B during API fetch', async ({ page }) => {
    const CHAR_A = CHAR_LORD;
    const CHAR_B = CHAR_REED;

    // Char A has a saved ST draft for their project
    const subA = makeStoryMomentSub(CHAR_A, {
      responses: { project_1_title: 'Blackwood Manoeuvre' },
      projects_resolved: [{
        action_type: 'investigate',
        pool_status: 'rolled',
        pool_validated: '8',
        pool_player: '8',
        roll: null,
        notes_thread: [],
      }],
      st_narrative: {
        project_responses: [{ response: "Lord Marcus's unique draft content — should appear in prompt." }],
      },
    });

    // Char B has no project draft
    const subB = makeStoryMomentSub(CHAR_B, {
      responses: {},
      projects_resolved: [],
    });

    // Slow route for cycles — gives the test time to switch characters mid-fetch
    await setupPage(page, {
      characters: [CHAR_A, CHAR_B],
      submissions: [subA, subB],
      routeDelay: 400,
    });

    await selectChar(page, CHAR_A._id);

    // Click copy context for Char A's project, then immediately switch to Char B
    const projCopyBtn = page.locator('.dt-story-section[data-section="project_responses"] .dt-story-copy-ctx-btn').first();
    await projCopyBtn.click();

    // Switch characters while the API fetch is in flight
    await page.locator(`.dt-story-pill[data-char-id="${CHAR_B._id}"]`).click();

    // Wait for clipboard to be written (fetch completes after ~400ms delay)
    await page.waitForFunction(() => window.__lastClipboardText !== null, { timeout: 6000 });

    const text = await page.evaluate(() => window.__lastClipboardText);

    // With the snapshot fix: clipboard reflects Char A's draft (clicked character)
    expect(text).toContain("Lord Marcus's unique draft content — should appear in prompt.");
  });

});
