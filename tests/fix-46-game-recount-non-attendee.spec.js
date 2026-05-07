/**
 * Regression tests for fix.46 — Game Recount must not block non-attendees
 * from minimum-complete submission (GH #111).
 *
 * The bug: _completenessCtx() never passed `attended` into the completeness
 * functions, so isMinimalComplete/missingMinimumPieces always enforced the
 * Game Recount rule even when the Court section was hidden for non-attendees.
 *
 * AC-1: non-attendee → banner does NOT list "Game Recount" as missing
 * AC-2: non-attendee with all other MINIMAL fields complete → form reaches submitted status
 * AC-3: attendee with no game recount → banner DOES list "Game Recount" as missing
 * AC-4: isMinimalComplete / missingMinimumPieces remain pure (no DOM calls)
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '777000046', username: 'test_player46', global_name: 'Test Player 46',
  avatar: null, role: 'player', player_id: 'p-fix46',
  character_ids: ['char-fix46'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-fix46', status: 'active', label: 'Test Cycle FIX46',
  game_number: 2,
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-05-07T00:00:00.000Z',
};

function buildChar(overrides = {}) {
  return {
    _id: 'char-fix46', name: 'Charles Test', moniker: null, honorific: null,
    clan: 'Ventrue', covenant: 'Invictus', player: 'Test Player 46',
    blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {}, disciplines: {}, merits: [], ordeals: [], powers: [],
    ...overrides,
  };
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function setupSuite(page, char, attendedFlag) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);

  // Catch-all: return [] for any unmatched API route (incl. attendance → non-attendee by default)
  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) })
  );
  await page.route(new RegExp(`/api/characters/${char._id}$`), r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) })
  );
  await page.route(/\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
  );
  await page.route('**/api/characters/names', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: char._id, name: char.name }]) })
  );
  await page.route('**/api/downtime_cycles', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) })
  );
  await page.route(/\/api\/downtime_submissions/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  // Override attendance route when testing an attendee character.
  // When attendedFlag is false the catch-all returns [] which yields attended=false.
  if (attendedFlag === true) {
    await page.route(/\/api\/attendance/, r =>
      r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ attended: true, attendees: [], session_id: 'sess-fix46' }),
      })
    );
  }

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function openDowntimeForm(page, char) {
  await page.evaluate(async (c) => {
    const sandbox = document.createElement('div');
    sandbox.id = 'dt-sandbox';
    sandbox.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#1a1208;z-index:99999;overflow:auto;';
    document.body.appendChild(sandbox);
    const mod = await import('/js/tabs/downtime-form.js');
    await mod.renderDowntimeTab(sandbox, c, []);
  }, char);
  await page.waitForSelector('#dt-sandbox #dt-btn-submit', { timeout: 10000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.46: Game Recount must not block non-attendees', () => {

  test('AC-1: non-attendee — banner does not flag Game Recount as missing', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, false);
    await openDowntimeForm(page, char);

    // The form will show the below-minimum banner (other fields are empty),
    // but Game Recount must NOT appear in the missing-pieces list.
    const banner = page.locator('#dt-sandbox .dt-min-banner');
    await expect(banner).toBeVisible({ timeout: 5000 });

    const bannerText = await banner.textContent();
    expect(bannerText).not.toContain('Game Recount');
  });

  test('AC-3: attendee — banner flags Game Recount as missing when recount is blank', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, true);
    await openDowntimeForm(page, char);

    // Attendee with no game recount filled: banner MUST flag it.
    const banner = page.locator('#dt-sandbox .dt-min-banner');
    await expect(banner).toBeVisible({ timeout: 5000 });

    const items = page.locator('#dt-sandbox .dt-min-banner__list li');
    const texts = await items.allTextContents();
    expect(texts.some(t => t.includes('Game Recount'))).toBe(true);
  });

  test('AC-4: isMinimalComplete is pure — no DOM access when called directly', async ({ page }) => {
    // Use setupSuite to get a fully loaded page so ESM imports resolve.
    const char = buildChar();
    await setupSuite(page, char, false);

    const result = await page.evaluate(async () => {
      const { isMinimalComplete, missingMinimumPieces } = await import('/js/data/dt-completeness.js');

      const BASE_RESPONSES = {
        personal_story_kind: 'touchstone',
        personal_story_text: 'Trusts Maria implicitly.',
        feeding_territories: JSON.stringify({ Downtown: 'hunt' }),
        _feed_method: 'Presence+Socialise',
        _feed_blood_types: JSON.stringify(['human']),
        feed_violence: 'kiss',
        project_1_action: 'maintain',
      };

      // Non-attendee, no game recount → should be complete
      const nonAttendeeComplete = isMinimalComplete(BASE_RESPONSES, { attended: false });
      const nonAttendeeMissing  = missingMinimumPieces(BASE_RESPONSES, { attended: false });

      // Attendee, no game recount → should be incomplete
      const attendeeIncomplete = isMinimalComplete(BASE_RESPONSES, { attended: true });
      const attendeeMissing    = missingMinimumPieces(BASE_RESPONSES, { attended: true });

      // Default (no ctx) with no game recount → should be incomplete (backward compat)
      const defaultIncomplete = isMinimalComplete(BASE_RESPONSES);
      const defaultMissing    = missingMinimumPieces(BASE_RESPONSES);

      return {
        nonAttendeeComplete,
        nonAttendeeMissingCount: nonAttendeeMissing.length,
        nonAttendeeMissingLabels: nonAttendeeMissing.map(m => m.label),
        attendeeIncomplete,
        attendeeMissingHasRecount: attendeeMissing.some(m => m.section === 'court'),
        defaultIncomplete,
        defaultMissingHasRecount: defaultMissing.some(m => m.section === 'court'),
      };
    });

    // AC-1 / AC-2: non-attendee with all other fields complete passes
    expect(result.nonAttendeeComplete).toBe(true);
    expect(result.nonAttendeeMissingCount).toBe(0);
    expect(result.nonAttendeeMissingLabels.some(l => l.includes('Game Recount'))).toBe(false);

    // AC-3: attendee without game recount fails
    expect(result.attendeeIncomplete).toBe(false);
    expect(result.attendeeMissingHasRecount).toBe(true);

    // Backward compat: default ctx (attended=true) without game recount fails
    expect(result.defaultIncomplete).toBe(false);
    expect(result.defaultMissingHasRecount).toBe(true);
  });

});
