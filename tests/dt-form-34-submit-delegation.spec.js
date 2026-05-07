/**
 * E2E tests for dt-form.34 — Submit button delegation fix (GH #95)
 *
 * Verifies that #dt-btn-submit's click handler survives container.innerHTML
 * re-renders (mode toggle, feed pool selector change) because the handler is
 * now delegated to the stable container element rather than bound directly to
 * the button element that gets replaced on every renderForm() call.
 *
 * Also verifies the POST-vs-PUT guard checks responseDoc?._id (not !responseDoc)
 * so a mode-toggle-created in-memory responseDoc routes to POST, not PUT /undefined.
 *
 * Technique: mounts the form module directly in a sandbox overlay via
 * page.evaluate (same approach as dt-vitae-projection.spec.js). The submit
 * button click is confirmed by the validation toast that appears when
 * submitForm() runs but feeding territory is unselected — a signal that the
 * handler fired even though no full submission is made.
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-002',
  character_ids: ['char-001'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-dt34', status: 'active', label: 'Test Cycle DT34',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-05-06T00:00:00.000Z',
};

function buildChar(overrides = {}) {
  return {
    _id: 'char-001', name: 'Test Subject', moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
    blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: {
      city: 1, clan: 1,
      covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
    },
    attributes: {
      Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {
      Stealth: { dots: 2, bonus: 0, specs: [], nine_again: false },
      Persuasion: { dots: 2, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: { Auspex: { dots: 2 } },
    merits: [], powers: [], ordeals: [],
    ...overrides,
  };
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function setupSuite(page, char) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    // Use 'fake-test-token' to hit mocked /api/auth/me instead of the
    // local-test-token dev-fixtures path that bypasses Playwright's route mocks.
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);

  // Catch-all first — last-registered wins in Playwright, so specific routes
  // registered below take precedence over this fallback.
  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) })
  );
  await page.route(/\/api\/characters\/char-001$/, r =>
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
  // Submissions: GET returns empty (no prior submission), POST returns a saved doc with _id
  await page.route('**/api/downtime_submissions', r => {
    if (r.request().method() === 'POST') {
      return r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          _id: 'sub-dt34-new', cycle_id: ACTIVE_CYCLE._id,
          character_id: char._id, status: 'submitted', responses: {},
        }),
      });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

// Mount the downtime form directly in a full-page sandbox overlay using the same
// technique as dt-vitae-projection.spec.js. This bypasses the app's character
// picker and mounts the module's exported renderDowntimeTab directly.
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

// Helper: click the submit button and expect the validation toast to appear.
// The toast "Please complete required fields … Feeding Territory" proves
// submitForm() was invoked — the handler fired even if the form isn't fully
// complete. Used for tests where we only need to confirm the click delegation
// works, not that a full submission is made.
async function expectSubmitHandlerFired(page) {
  await page.locator('#dt-sandbox #dt-btn-submit').click();
  await expect(page.locator('#dt-toast')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#dt-toast')).toContainText('required fields');
}

// ── dt-form.34: Delegated handler survives re-renders ─────────────────────────

test.describe('dt-form.34: #dt-btn-submit handler survives re-renders', () => {

  test('submit fires on fresh form with no prior re-render (regression)', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);

    // No re-render has occurred yet. This confirms the baseline still works and
    // acts as a regression check: the delegated path handles the first render too.
    await expectSubmitHandlerFired(page);
  });

  test('submit fires after MINIMAL→ADVANCED mode toggle (first re-render)', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);

    // Mode toggle replaces container.innerHTML — a direct listener on the old
    // button element would be lost here; the delegated listener survives.
    await page.locator('#dt-sandbox [data-dt-mode="advanced"]').click();
    // The Submit Final button only appears in ADVANCED — its presence confirms
    // the re-render completed before we click submit.
    await page.waitForSelector('#dt-sandbox #dt-btn-submit-final', { timeout: 5000 });

    await expectSubmitHandlerFired(page);
  });

  test('submit fires after feed pool attribute selector change (second re-render path)', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);

    // The feed pool attribute selector (#dt-feed-custom-attr) is a <select> in
    // the always-rendered feeding section. A change event on it triggers
    // renderForm() via the container's delegated change listener.
    const selectorFound = await page.evaluate(() => {
      const sel = document.querySelector('#dt-sandbox #dt-feed-custom-attr');
      if (!sel || sel.options.length < 2) return false;
      sel.selectedIndex = 1;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    });
    expect(selectorFound).toBe(true);
    await page.waitForTimeout(150); // renderForm() is synchronous but allow paint

    await expectSubmitHandlerFired(page);
  });

  test('submit fires after ADVANCED→MINIMAL mode toggle (consecutive re-renders)', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);

    // First re-render: switch to ADVANCED
    await page.locator('#dt-sandbox [data-dt-mode="advanced"]').click();
    await page.waitForSelector('#dt-sandbox #dt-btn-submit-final', { timeout: 5000 });

    // Second re-render: switch back to MINIMAL
    await page.locator('#dt-sandbox [data-dt-mode="minimal"]').click();
    // Submit Final is ADVANCED-only — its absence confirms the re-render completed
    await expect(page.locator('#dt-sandbox #dt-btn-submit-final')).toHaveCount(0);

    await expectSubmitHandlerFired(page);
  });

});

// ── dt-form.34: POST-vs-PUT guard uses responseDoc?._id ───────────────────────

test.describe('dt-form.34: POST-vs-PUT guard uses responseDoc?._id', () => {

  test('submit POSTs when mode-toggle created in-memory responseDoc with no _id', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);

    // Mode toggle creates responseDoc = { responses: cur } with no _id (no prior
    // server submission existed). Old guard: !responseDoc → false → PUT /undefined.
    // Fixed guard: !responseDoc?._id → true → POST /api/downtime_submissions.
    await page.locator('#dt-sandbox [data-dt-mode="advanced"]').click();
    await page.waitForSelector('#dt-sandbox #dt-btn-submit-final', { timeout: 5000 });

    // Pre-fill the feeding territory hidden input so validation passes and the
    // API call is actually reached. The hidden input is always in the DOM
    // (feeding section has no gate); its ID is 'feed-val-the_academy'.
    await page.evaluate(() => {
      const el = document.getElementById('feed-val-the_academy');
      if (el) el.value = 'poaching';
    });

    // Capture the outgoing request. waitForRequest must be registered before the
    // action that triggers it — Promise.all handles both concurrently.
    const [request] = await Promise.all([
      page.waitForRequest(
        req => req.url().includes('/api/downtime_submissions') && req.method() === 'POST',
        { timeout: 5000 }
      ),
      page.locator('#dt-sandbox #dt-btn-submit').click(),
    ]);

    expect(request).toBeTruthy();
    expect(request.method()).toBe('POST');
    // The specific bug: old code sent PUT to /api/downtime_submissions/undefined
    expect(request.url()).not.toMatch(/\/undefined$/);
  });

});
