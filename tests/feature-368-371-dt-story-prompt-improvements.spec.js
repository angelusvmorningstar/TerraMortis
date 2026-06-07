/**
 * E2E tests for features 368–371: DT Story prompt improvements
 *
 * feature.368 — Updated rubric strings (word-ceiling, anti-periphrasis, Use house style)
 * feature.369 — Category-specific framing (attendance gate, ambience, covenant filter)
 * feature.370 — Missing context fields (correspondent, discipline, XP spend, self-feed status)
 * feature.371 — Per-character Voice calibration panel (render, pre-fill, save, injection)
 */

const { test, expect } = require('@playwright/test');

// ── Shared stubs ───────────────────────────────────────────────────────────────

const ST_USER = {
  id: '368000001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-368', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-368-dt3', game_number: 3, status: 'active',
  cycle_number: 3, submission_count: 1, phase_signoff: {},
  confirmed_ambience: {}, narrative_notes: '', label: 'Downtime 3',
};

const PREV_CYCLE = {
  _id: 'cycle-368-dt2', game_number: 2, status: 'closed',
  cycle_number: 2, submission_count: 0, phase_signoff: {},
  confirmed_ambience: {}, narrative_notes: '', label: 'Downtime 2',
};

const TERRITORY_HARBOUR = {
  _id: 'terr-harbour-368', slug: 'harbour', name: 'The Harbour',
  regent: null, ambience: 3,
};

const CHAR_INVICTUS = {
  _id: 'char-inv-368', name: 'Elara Voss', moniker: null, honorific: null,
  clan: 'Ventrue', covenant: 'Invictus', player: 'Elara Player',
  blood_potency: 3, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  mask: 'Director', dirge: 'Monster',
  status: { city: 2, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 2, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: { Auspex: { dots: 2 } }, merits: [], powers: [], ordeals: [],
  touchstones: [{ name: 'The Sister', humanity: 7, desc: 'Anchor' }],
};

// Character with pre-saved voice calibration (feature.371)
const CHAR_WITH_CAL = {
  ...CHAR_INVICTUS,
  _id: 'char-cal-371', name: 'René Marchaud', moniker: null, honorific: null,
  dt_story_calibration: 'Formal cadence. Never use contractions. René speaks in measured, deliberate sentences.',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSub(char, opts = {}) {
  return {
    _id: `sub-${char._id}-dt3`,
    cycle_id: ACTIVE_CYCLE._id,
    character_name: char.name,
    character_id: char._id,
    player_name: char.player,
    submitted_at: '2026-06-01T00:00:00Z',
    _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: { ...(opts.responses || {}) },
    projects_resolved: opts.projects_resolved || [],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
    st_narrative: opts.st_narrative || {},
  };
}

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

async function setupPage(page, { characters, submissions, territories = [], relationships = {}, npcs = [] } = {}) {
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

    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });

    if (url.includes('/api/downtime_submissions')) {
      const m = url.match(/[?&]cycle_id=([^&]+)/);
      if (m) {
        const cid = decodeURIComponent(m[1]);
        if (cid === PREV_CYCLE._id) return ok([]);
        return ok(submissions.filter(s => s.cycle_id === ACTIVE_CYCLE._id));
      }
      return ok(submissions);
    }

    if (url.includes('/api/downtime_cycles')) return ok([ACTIVE_CYCLE, PREV_CYCLE]);
    if (url.includes('/api/territories'))     return ok(territories);
    if (url.includes('/api/game_sessions'))   return ok([]);
    if (url.includes('/api/session_logs'))    return ok([]);
    if (url.includes('/api/npcs'))            return ok(npcs);

    // Relationships: /api/relationships/:id
    const relMatch = url.match(/\/api\/relationships\/([^?&/]+)/);
    if (relMatch) {
      const relId = decodeURIComponent(relMatch[1]);
      return ok(relationships[relId] || null);
    }

    const charIds = characters.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific }));
    if (url.includes('/api/characters/names')) return ok(charIds);
    if (url.includes('/api/characters'))       return ok(characters);
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

async function copyProjectContext(page, projIdx = 0) {
  const copyBtn = page.locator('.dt-story-section[data-section="project_responses"] .dt-story-copy-ctx-btn').nth(projIdx);
  await copyBtn.click();
  await expect(copyBtn).toHaveText('Copied!', { timeout: 5000 });
  return page.evaluate(() => window.__lastClipboardText);
}

async function copyStoryMomentContext(page) {
  const copyBtn = page.locator('.dt-story-section[data-section="story_moment"] .dt-story-copy-ctx-btn');
  await copyBtn.click();
  await expect(copyBtn).toHaveText('Copied!', { timeout: 8000 });
  return page.evaluate(() => window.__lastClipboardText);
}

// ── feature.368 — Rubric strings ──────────────────────────────────────────────

test.describe('feature.368 — Updated rubric strings in copy context', () => {

  test('Project context rubric uses word-ceiling phrasing and anti-periphrasis directive', async ({ page }) => {
    const sub = makeSub(CHAR_INVICTUS, {
      responses: { project_1_title: 'The Harbour Push' },
      projects_resolved: [{ action_type: 'investigate', pool_status: 'rolled', pool_validated: '5', pool_player: '5', roll: null, notes_thread: [] }],
    });
    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub] });
    await selectChar(page, CHAR_INVICTUS._id);

    const text = await copyProjectContext(page);
    expect(text).toContain('No more than 120 words; shorter is better');
    expect(text).toContain('Do not open with atmosphere or mood-setting');
    expect(text).toContain('Use house style');
    expect(text).not.toMatch(/80.120 words/);
    expect(text).not.toContain('One paragraph');
  });

  test('Vignette copy context uses 200-word ceiling and begin-in-scene directive', async ({ page }) => {
    const sub = makeSub(CHAR_INVICTUS, {
      responses: { personal_story_text: 'The city exhaled.' },
    });
    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub] });
    await selectChar(page, CHAR_INVICTUS._id);

    await page.locator('input[name="story-moment-format"][value="vignette"]').check();
    const text = await copyStoryMomentContext(page);
    expect(text).toContain('No more than 200 words; shorter is better');
    expect(text).toContain('Begin in scene');
    expect(text).toContain('no mood-setting preamble');
    expect(text).toContain('Use house style');
    expect(text).not.toMatch(/100.300 words/);
  });

  test('Maintenance copy context uses 80-word ceiling and no-scene-setting directive', async ({ page }) => {
    const sub = makeSub(CHAR_INVICTUS, {
      responses: { project_1_title: 'Maintain PT' },
      projects_resolved: [{ action_type: 'maintenance', pool_status: 'maintenance', pool_validated: '', pool_player: '', roll: null, notes_thread: [] }],
    });
    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub] });
    await selectChar(page, CHAR_INVICTUS._id);

    const text = await copyProjectContext(page);
    expect(text).toContain('No more than 80 words; shorter is better');
    expect(text).toContain('No scene-setting opener');
    expect(text).toContain('Use house style');
    expect(text).not.toMatch(/50.80 words/);
  });

});

// ── feature.369 — Category-specific framing rules ─────────────────────────────

test.describe('feature.369 — Category framing in copy context', () => {

  test('Vignette context flags absence when attended_game is missing', async ({ page }) => {
    const sub = makeSub(CHAR_INVICTUS, {
      responses: { personal_story_text: 'The city exhaled.' /* no attended_game */ },
    });
    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub] });
    await selectChar(page, CHAR_INVICTUS._id);

    await page.locator('input[name="story-moment-format"][value="vignette"]').check();
    const text = await copyStoryMomentContext(page);
    expect(text).toContain('not physically present at game this cycle');
    expect(text).toContain('must not depict in-person encounters');
  });

  test('Vignette context flags presence when attended_game is yes', async ({ page }) => {
    const sub = makeSub(CHAR_INVICTUS, {
      responses: { personal_story_text: 'The city exhaled.', attended_game: 'yes' },
    });
    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub] });
    await selectChar(page, CHAR_INVICTUS._id);

    await page.locator('input[name="story-moment-format"][value="vignette"]').check();
    const text = await copyStoryMomentContext(page);
    expect(text).toContain('Character was present at game this cycle');
    expect(text).not.toContain('not physically present');
  });

  test('Ambience project context includes territorial politics framing line', async ({ page }) => {
    const sub = makeSub(CHAR_INVICTUS, {
      responses: { project_1_ambience_target: 'terr-harbour-368' },
      projects_resolved: [{ action_type: 'ambience_increase', pool_status: 'rolled', pool_validated: '4', pool_player: '4', roll: null, notes_thread: [] }],
    });
    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub], territories: [TERRITORY_HARBOUR] });
    await selectChar(page, CHAR_INVICTUS._id);

    const text = await copyProjectContext(page);
    expect(text).toContain('covenant investment in or destabilisation of a feeding ground');
    expect(text).toContain('territorial politics');
  });

});

// ── feature.370 — Missing context fields ──────────────────────────────────────

test.describe('feature.370 — Context fields in copy context', () => {

  test('Letter context shows Correspondent before Touchstones section', async ({ page }) => {
    const NPC_ID = 'npc-corr-370';
    const REL_ID = 'rel-corr-370';
    const sub = makeSub(CHAR_INVICTUS, {
      responses: {
        personal_story_text: 'To Lady Hargrove…',
        story_moment_relationship_id: REL_ID,
      },
    });
    const relationships = {
      [REL_ID]: {
        kind: 'family',
        custom_label: null,
        a: { type: 'pc', id: CHAR_INVICTUS._id },
        b: { type: 'npc', id: NPC_ID },
      },
    };
    const npcs = [{ _id: NPC_ID, name: 'Lady Hargrove' }];

    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub], relationships, npcs });
    await selectChar(page, CHAR_INVICTUS._id);

    await page.locator('input[name="story-moment-format"][value="letter"]').check();
    const text = await copyStoryMomentContext(page);
    expect(text).toContain('Correspondent: Lady Hargrove');
    // Correspondent must appear before the Touchstones section
    const corrIdx       = text.indexOf('Correspondent:');
    const touchstoneIdx = text.indexOf('Touchstones:');
    expect(corrIdx).toBeGreaterThanOrEqual(0);
    if (touchstoneIdx >= 0) expect(corrIdx).toBeLessThan(touchstoneIdx);
  });

  test('Investigation context extracts Discipline name from validated pool string', async ({ page }) => {
    const sub = makeSub(CHAR_INVICTUS, {
      responses: { project_1_title: 'Read the Room' },
      projects_resolved: [{
        action_type: 'investigate',
        pool_status: 'rolled',
        pool_validated: 'Wits + Empathy + Auspex (7)',
        pool_player: 'Wits + Empathy + Auspex (7)',
        roll: null,
        notes_thread: [],
      }],
    });
    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub] });
    await selectChar(page, CHAR_INVICTUS._id);

    const text = await copyProjectContext(page);
    expect(text).toContain('Discipline: Auspex');
  });

  test('Project context includes XP spend block when xp_rows is populated', async ({ page }) => {
    const sub = makeSub(CHAR_INVICTUS, {
      responses: {
        project_1_title: 'The Push',
        xp_rows: JSON.stringify([{ item: 'Auspex 3', cost: 4 }]),
      },
      projects_resolved: [{ action_type: 'investigate', pool_status: 'rolled', pool_validated: '5', pool_player: '5', roll: null, notes_thread: [] }],
    });
    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub] });
    await selectChar(page, CHAR_INVICTUS._id);

    const text = await copyProjectContext(page);
    expect(text).toContain('XP spend this cycle:');
    expect(text).toContain('Auspex 3');
    expect(text).toContain('4 XP');
  });

  test('Patrol context shows Self: Resident when character feeds in the patrol territory', async ({ page }) => {
    const sub = makeSub(CHAR_INVICTUS, {
      responses: {
        project_1_target_terr: 'terr-harbour-368',
        feeding_territories: JSON.stringify({ 'terr-harbour-368': 'resident' }),
      },
      projects_resolved: [{ action_type: 'patrol_scout', pool_status: 'rolled', pool_validated: '6', pool_player: '6', roll: null, notes_thread: [] }],
    });
    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub], territories: [TERRITORY_HARBOUR] });
    await selectChar(page, CHAR_INVICTUS._id);

    const text = await copyProjectContext(page);
    expect(text).toContain('Self: Resident');
  });

  test('Patrol context shows Self: Not feeding here when character has no entry for the territory', async ({ page }) => {
    const sub = makeSub(CHAR_INVICTUS, {
      responses: {
        project_1_target_terr: 'terr-harbour-368',
        feeding_territories: JSON.stringify({}),
      },
      projects_resolved: [{ action_type: 'patrol_scout', pool_status: 'rolled', pool_validated: '5', pool_player: '5', roll: null, notes_thread: [] }],
    });
    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub], territories: [TERRITORY_HARBOUR] });
    await selectChar(page, CHAR_INVICTUS._id);

    const text = await copyProjectContext(page);
    expect(text).toContain('Self: Not feeding here');
  });

});

// ── feature.371 — Per-character Voice calibration panel ───────────────────────

test.describe('feature.371 — Voice calibration panel', () => {

  test('Calibration panel renders in character view', async ({ page }) => {
    const sub = makeSub(CHAR_INVICTUS, { responses: { personal_story_text: 'Something.' } });
    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub] });
    await selectChar(page, CHAR_INVICTUS._id);

    await expect(page.locator('.dt-story-calibration-panel')).toBeVisible();
    await expect(page.locator('.dt-story-calibration-ta')).toBeAttached();
  });

  test('Calibration textarea is pre-filled with char.dt_story_calibration', async ({ page }) => {
    const sub = makeSub(CHAR_WITH_CAL, { responses: { personal_story_text: 'Something.' } });
    await setupPage(page, { characters: [CHAR_WITH_CAL], submissions: [sub] });
    await selectChar(page, CHAR_WITH_CAL._id);

    const ta = page.locator('.dt-story-calibration-ta');
    await expect(ta).toHaveValue(CHAR_WITH_CAL.dt_story_calibration);
  });

  test('Empty calibration shows (none) hint and collapsed body', async ({ page }) => {
    const sub = makeSub(CHAR_INVICTUS, { responses: { personal_story_text: 'Something.' } });
    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub] });
    await selectChar(page, CHAR_INVICTUS._id);

    await expect(page.locator('.dt-story-calibration-hint')).toContainText('none');
    await expect(page.locator('.dt-story-calibration-body')).toHaveClass(/hidden/);
  });

  test('Save Calibration button sends PATCH to /api/characters/:id and shows Saved', async ({ page }) => {
    const sub = makeSub(CHAR_INVICTUS, { responses: { personal_story_text: 'Something.' } });
    await setupPage(page, { characters: [CHAR_INVICTUS], submissions: [sub] });
    await selectChar(page, CHAR_INVICTUS._id);

    const patchPromise = page.waitForRequest(req =>
      req.method() === 'PATCH' && req.url().includes(`/api/characters/${CHAR_INVICTUS._id}`)
    );

    // Open collapsed panel then type and save
    await page.locator('.dt-story-calibration-header').click();
    await page.locator('.dt-story-calibration-ta').fill('Speak in terse, clipped sentences. No flourishes.');
    await page.locator('.dt-story-calibration-save-btn').click();

    const req = await patchPromise;
    const body = JSON.parse(req.postData() || '{}');
    expect(body).toMatchObject({ dt_story_calibration: 'Speak in terse, clipped sentences. No flourishes.' });

    await expect(page.locator('.dt-story-calibration-status')).toHaveText('Saved', { timeout: 5000 });
  });

  test('Calibration text is injected into project copy context', async ({ page }) => {
    const sub = makeSub(CHAR_WITH_CAL, {
      responses: { project_1_title: 'A Quiet Manoeuvre' },
      projects_resolved: [{ action_type: 'investigate', pool_status: 'rolled', pool_validated: '5', pool_player: '5', roll: null, notes_thread: [] }],
    });
    await setupPage(page, { characters: [CHAR_WITH_CAL], submissions: [sub] });
    await selectChar(page, CHAR_WITH_CAL._id);

    const text = await copyProjectContext(page);
    expect(text).toContain('Voice calibration (apply throughout):');
    expect(text).toContain(CHAR_WITH_CAL.dt_story_calibration);
  });

  test('Calibration text is injected into vignette copy context', async ({ page }) => {
    const sub = makeSub(CHAR_WITH_CAL, {
      responses: { personal_story_text: 'The rain fell.' },
    });
    await setupPage(page, { characters: [CHAR_WITH_CAL], submissions: [sub] });
    await selectChar(page, CHAR_WITH_CAL._id);

    await page.locator('input[name="story-moment-format"][value="vignette"]').check();
    const text = await copyStoryMomentContext(page);
    expect(text).toContain('Voice calibration (apply throughout):');
    expect(text).toContain(CHAR_WITH_CAL.dt_story_calibration);
  });

});
