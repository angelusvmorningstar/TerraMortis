/**
 * issue-352: DT Story prompt assembly — missing player vignette + wrong previous-cycle content.
 *
 * Validates both bugs fixed in fix.50:
 *
 *   Bug 1 — buildTouchstoneContext never read personal_story_text. The player's
 *   DT vignette scene was silently absent from the generated Copy Context prompt.
 *
 *   Bug 2 — prevVignetteText fell back to st_narrative.touchstone.response even
 *   when prevStoryMoment existed as a letter (format='letter'). Legacy letter
 *   content ended up in the "previous vignette" slot.
 *
 * Test scenarios:
 *   1. Bug 1 — vignette Copy Context includes player's submission text verbatim.
 *   2. Bug 1 — vignette Copy Context shows sentinel when player has not submitted.
 *   3. Bug 1 — letter Copy Context is not regressed (player text still present).
 *   4. Bug 2 — prev cycle was letter → "Previous vignette" section absent from vignette prompt.
 *   5. Bug 2 — prev cycle was vignette → "Previous vignette" section present with correct text.
 *   6. Bug 2 — prev cycle letter → letter Copy Context still shows prev letter correctly.
 */

const { test, expect } = require('@playwright/test');

// ── Shared stubs ───────────────────────────────────────────────────────────────

const ST_USER = {
  id: '352000001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-352', character_ids: [], is_dual_role: false,
};

const CHAR_REED = {
  _id: 'char-reed-352', name: 'Reed Justice', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Carthian Movement', player: 'Reed Player',
  blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  mask: 'Bon Vivant', dirge: 'Idealist',
  status: {
    city: 1, clan: 0,
    covenant: { 'Carthian Movement': 1, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
  },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  touchstones: [{ name: 'His Mother', humanity: 7, desc: 'Retired schoolteacher' }],
};

// DT2 and DT3 cycles. game_number is used by handleCopyStoryMomentContext to find
// "the cycle with game_number one less than the current one".
const DT2_CYCLE = {
  _id: 'cycle-352-dt2', game_number: 2, status: 'closed',
  cycle_number: 2, submission_count: 1, phase_signoff: {},
  confirmed_ambience: {}, narrative_notes: '', label: 'Downtime 2',
};

const DT3_CYCLE = {
  _id: 'cycle-352-dt3', game_number: 3, status: 'active',
  cycle_number: 3, submission_count: 1, phase_signoff: {},
  confirmed_ambience: {}, narrative_notes: '', label: 'Downtime 3',
};

// ── Submission builders ────────────────────────────────────────────────────────

/** DT3 submission. personal_story_text drives the player-submission section. */
function makeDt3Sub({ personalStoryText = null } = {}) {
  return {
    _id: 'sub-352-dt3-reed',
    cycle_id: DT3_CYCLE._id,
    character_name: 'Reed Justice',
    character_id: CHAR_REED._id,
    player_name: 'Reed Player',
    submitted_at: '2026-05-17T00:00:00Z',
    _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {
      ...(personalStoryText ? { personal_story_text: personalStoryText } : {}),
    },
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
    st_narrative: {},
  };
}

/**
 * DT2 submission. stNarrative shapes the previous-cycle content.
 *
 * Bug 2 trigger: both story_moment (format='letter') AND touchstone.response set.
 * The bug caused touchstone.response to bleed into the vignette slot for DT3.
 */
function makeDt2Sub(stNarrative = {}) {
  return {
    _id: 'sub-352-dt2-reed',
    cycle_id: DT2_CYCLE._id,
    character_name: 'Reed Justice',
    character_id: CHAR_REED._id,
    player_name: 'Reed Player',
    submitted_at: '2026-05-10T00:00:00Z',
    _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {},
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
    st_narrative: stNarrative,
  };
}

// ── Page setup helpers ─────────────────────────────────────────────────────────

/** Stub clipboard so tests can read what was written without permissions. */
function addClipboardStub(page) {
  return page.addInitScript(() => {
    window.__lastClipboardText = null;
    const stub = {
      writeText(text) {
        window.__lastClipboardText = text;
        return Promise.resolve();
      },
      readText() {
        return Promise.resolve(window.__lastClipboardText || '');
      },
    };
    try {
      Object.defineProperty(navigator, 'clipboard', { get: () => stub, configurable: true });
    } catch {
      navigator.clipboard = stub;
    }
  });
}

async function setupPage(page, { dt3Sub, dt2Sub = null } = {}) {
  await addClipboardStub(page);

  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });

    if (url.includes('/api/downtime_submissions')) {
      const m = url.match(/[?&]cycle_id=([^&]+)/);
      if (m) {
        const cid = decodeURIComponent(m[1]);
        if (cid === DT3_CYCLE._id) return ok([dt3Sub]);
        if (cid === DT2_CYCLE._id) return ok(dt2Sub ? [dt2Sub] : []);
      }
      return ok([dt3Sub]);
    }
    if (url.includes('/api/downtime_cycles')) return ok([DT3_CYCLE, DT2_CYCLE]);
    if (url.includes('/api/characters/names')) return ok([
      { _id: CHAR_REED._id, name: CHAR_REED.name, moniker: null, honorific: null },
    ]);
    if (url.includes('/api/characters'))  return ok([CHAR_REED]);
    if (url.includes('/api/territories')) return ok([]);
    if (url.includes('/api/game_sessions')) return ok([]);
    if (url.includes('/api/session_logs')) return ok([]);
    if (url.includes('/api/relationships')) return ok(null);
    if (url.includes('/api/npcs')) return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForSelector('#dt-phase-ribbon', { state: 'visible', timeout: 8000 });

  // Open DT Story tab.
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="story"]');
  await page.waitForSelector('#dt-story-panel', { state: 'visible', timeout: 5000 });

  // Wait for nav rail to populate.
  await page.waitForFunction(() => {
    const rail = document.getElementById('dt-story-nav-rail');
    return rail && rail.querySelector('.dt-story-pill') !== null;
  }, { timeout: 5000 });

  // Select Reed's pill to load the character view.
  await page.locator('.dt-story-pill[data-char-id="char-reed-352"]').click();
  await page.waitForSelector('.dt-story-char-content', { state: 'visible', timeout: 5000 });
}

/** Read the clipboard stub value after a Copy Context click. */
async function captureCtxClick(page, format) {
  // Select the radio for this format.
  await page.locator(`input[name="story-moment-format"][value="${format}"]`).check();

  const copyBtn = page.locator('.dt-story-section[data-section="story_moment"] .dt-story-copy-ctx-btn');
  await copyBtn.click();

  // Wait for the success feedback — clipboard write is async.
  await expect(copyBtn).toHaveText('Copied!', { timeout: 5000 });

  return page.evaluate(() => window.__lastClipboardText);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('issue-352: DT Story prompt assembly', () => {

  test('Bug 1 — vignette Copy Context includes player submission text verbatim', async ({ page }) => {
    const dt3Sub = makeDt3Sub({ personalStoryText: 'The call connects on the second ring. You hear her voice, thin and bright.' });
    await setupPage(page, { dt3Sub });

    const text = await captureCtxClick(page, 'vignette');

    expect(text).toContain('Player-submitted narrative:');
    expect(text).toContain('The call connects on the second ring. You hear her voice, thin and bright.');
    expect(text).not.toContain('[No player narrative submitted this cycle]');
  });

  test('Bug 1 — vignette Copy Context shows sentinel when player has not submitted', async ({ page }) => {
    const dt3Sub = makeDt3Sub({ personalStoryText: null });
    await setupPage(page, { dt3Sub });

    const text = await captureCtxClick(page, 'vignette');

    expect(text).toContain('Player-submitted narrative:');
    expect(text).toContain('[No player narrative submitted this cycle]');
  });

  test('Bug 1 — letter Copy Context still shows player letter (regression check)', async ({ page }) => {
    const dt3Sub = makeDt3Sub({ personalStoryText: 'Dear Mother,\n\nI am well.\n\nYours, Reed' });
    await setupPage(page, { dt3Sub });

    const text = await captureCtxClick(page, 'letter');

    expect(text).toContain('Player-submitted letter:');
    expect(text).toContain('Dear Mother,');
    expect(text).not.toContain('[No player letter submitted]');
  });

  test('Bug 2 — prev cycle was letter: "Previous vignette" section absent from vignette prompt', async ({ page }) => {
    // DT2 was a letter. Legacy touchstone.response also set — this was the bug trigger.
    const dt2Sub = makeDt2Sub({
      story_moment: { format: 'letter', response: 'Dear Marcus,\n\nYours, Reed.', status: 'complete' },
      touchstone:   { response: 'Dear Marcus,\n\nYours, Reed (legacy copy).' },
    });
    const dt3Sub = makeDt3Sub({ personalStoryText: 'You watch the warehouse from across the street.' });
    await setupPage(page, { dt3Sub, dt2Sub });

    const text = await captureCtxClick(page, 'vignette');

    expect(text).not.toContain('Previous vignette with this touchstone');
    // Specifically verify the letter content did not bleed through.
    expect(text).not.toContain('Yours, Reed');
  });

  test('Bug 2 — prev cycle was vignette: "Previous vignette" section present with correct text', async ({ page }) => {
    const dt2Sub = makeDt2Sub({
      story_moment: { format: 'vignette', response: 'You stand at the chain-link fence, watching the lights go out one by one.', status: 'complete' },
    });
    const dt3Sub = makeDt3Sub({ personalStoryText: 'You watch the warehouse from across the street.' });
    await setupPage(page, { dt3Sub, dt2Sub });

    const text = await captureCtxClick(page, 'vignette');

    expect(text).toContain('Previous vignette with this touchstone (Downtime 2):');
    expect(text).toContain('You stand at the chain-link fence, watching the lights go out one by one.');
  });

  test('Bug 2 — prev cycle was letter: letter Copy Context still shows prev letter (regression)', async ({ page }) => {
    const dt2Sub = makeDt2Sub({
      story_moment: { format: 'letter', response: 'Dear Reed,\n\nYours, Marcus.', status: 'complete' },
    });
    const dt3Sub = makeDt3Sub({ personalStoryText: 'Dear Marcus,\n\nI have been thinking.' });
    await setupPage(page, { dt3Sub, dt2Sub });

    const text = await captureCtxClick(page, 'letter');

    expect(text).toContain('Previous letter from this correspondent (Downtime 2):');
    expect(text).toContain('Yours, Marcus.');
  });

});
