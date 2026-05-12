/**
 * Regression tests for fix.48 — feeding method card highlights without violence registering
 *
 * Root cause: on load, responseDoc.responses.feed_violence is empty even when a method with
 * a default violence is saved. The render-path completeness check reads saved responses
 * directly (not collectResponses()), so the banner falsely shows "choose Kiss or Violent".
 *
 * Fix: backfill feed_violence from FEED_VIOLENCE_DEFAULTS on restore when absent.
 *
 * AC-1: method with default violence saved, no feed_violence → banner does NOT show violence error
 * AC-2: no prior method → banner DOES show violence error
 * AC-3: clicking a default-violence card immediately clears the violence error
 * AC-4: null-default methods (stalking, other) still require explicit violence pick
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '777000048', username: 'test_player48', global_name: 'Test Player 48',
  avatar: null, role: 'player', player_id: 'p-fix48',
  character_ids: ['char-fix48'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-fix48', status: 'active', label: 'Test Cycle FIX48',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-05-07T00:00:00.000Z',
};

function buildChar() {
  return {
    _id: 'char-fix48', name: 'Violence Sync Tester', moniker: null, honorific: null,
    clan: 'Daeva', covenant: 'Carthian Movement', player: 'Test Player',
    blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {
      Persuasion: { dots: 2, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: {}, merits: [], ordeals: [], powers: [],
  };
}

function buildSavedSubmission(char, responses = {}) {
  return {
    _id: 'sub-fix48',
    cycle_id: ACTIVE_CYCLE._id,
    character_id: char._id,
    status: 'draft',
    responses,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setupSuite(page, char, savedResponses = null) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);

  const savedSub = savedResponses !== null
    ? buildSavedSubmission(char, savedResponses)
    : null;

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
  await page.route(/\/api\/downtime_submissions/, r => {
    const method = r.request().method();
    if (method === 'GET') {
      const body = savedSub ? JSON.stringify([savedSub]) : '[]';
      return r.fulfill({ status: 200, contentType: 'application/json', body });
    }
    // POST / PUT — echo back a draft document
    const reqBody = JSON.parse(r.request().postData() || '{}');
    return r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        _id: 'sub-fix48', cycle_id: ACTIVE_CYCLE._id, character_id: char._id,
        status: 'draft', responses: reqBody.responses || {},
      }),
    });
  });

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

async function switchToAdvanced(page) {
  await page.locator('#dt-sandbox [data-dt-mode="advanced"]').click();
  await page.waitForSelector('#dt-sandbox [data-dt-mode="advanced"][aria-pressed="true"]', { timeout: 5000 });
}

async function expandFeedingSection(page) {
  const titleSel = '#dt-sandbox [data-section-key="feeding"] .qf-section-title';
  await page.locator(titleSel).click();
  await page.waitForFunction(() => {
    const el = document.querySelector('#dt-sandbox [data-section-key="feeding"]');
    return el && !el.classList.contains('collapsed');
  }, { timeout: 5000 });
}

/** Returns the text content of the minimum-complete banner, or null if not shown. */
async function getBannerText(page) {
  const banner = page.locator('#dt-sandbox .dt-min-banner');
  const count = await banner.count();
  if (!count) return null;
  return banner.textContent();
}

const VIOLENCE_ERROR = 'choose Kiss or Violent';

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.48: feeding method card violence sync on load', () => {

  test('AC-1: seduction saved (default kiss), no feed_violence → banner omits violence error', async ({ page }) => {
    const char = buildChar();
    // Saved submission: method selected, violence not saved (pre-DTFP-5 style)
    await setupSuite(page, char, { _feed_method: 'seduction' });
    await openDowntimeForm(page, char);

    const bannerText = await getBannerText(page);
    if (bannerText) {
      expect(bannerText).not.toContain(VIOLENCE_ERROR);
    }
    // If banner is absent entirely, form is fully complete — also passes.
  });

  test('AC-2: no prior method → banner includes violence error', async ({ page }) => {
    const char = buildChar();
    // No saved submission at all → fresh form, method and violence both absent
    await setupSuite(page, char, null);
    await openDowntimeForm(page, char);

    const bannerText = await getBannerText(page);
    // Banner must be present (form is below minimum) and must include violence requirement
    expect(bannerText).toBeTruthy();
    expect(bannerText).toContain(VIOLENCE_ERROR);
  });

  test('AC-3: clicking a default-violence method card immediately clears violence error', async ({ page }) => {
    const char = buildChar();
    // Start fresh (no saved method)
    await setupSuite(page, char, null);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandFeedingSection(page);

    // Before click: violence error should be present
    const before = await getBannerText(page);
    expect(before).toContain(VIOLENCE_ERROR);

    // Click the 'force' card (default: violent) — any non-null-default method works
    await page.locator('#dt-sandbox [data-feed-method="force"]').click();
    // Re-render happens synchronously after click; wait briefly for DOM update
    await page.waitForTimeout(500);

    const after = await getBannerText(page);
    if (after) {
      expect(after).not.toContain(VIOLENCE_ERROR);
    }
  });

  test('AC-4: stalking (null default) still requires explicit violence pick', async ({ page }) => {
    const char = buildChar();
    // stalking method saved, no feed_violence — fix.48 must NOT backfill (null default)
    await setupSuite(page, char, { _feed_method: 'stalking' });
    await openDowntimeForm(page, char);

    const bannerText = await getBannerText(page);
    // Banner must still show violence as required
    expect(bannerText).toBeTruthy();
    expect(bannerText).toContain(VIOLENCE_ERROR);
  });

});
