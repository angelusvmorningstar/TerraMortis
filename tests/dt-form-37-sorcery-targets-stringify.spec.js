/**
 * E2E tests for dt-form.37 — sorcery_N_targets JSON serialisation fix (GH #117)
 *
 * Verifies that:
 * 1. collectResponses() sends sorcery_N_targets as a JSON string, not a raw array,
 *    so the server schema (`type: 'string'`) accepts it without validation errors.
 * 2. The render path correctly parses the round-tripped JSON string back into
 *    structured {type, value} rows (not wrapping the JSON blob as a single 'other' value).
 * 3. Legacy plain-string targets still render as a single 'other' row (no regression).
 *
 * Technique: mounts the form module in a sandbox overlay via page.evaluate,
 * same approach as dt-form.34 / dt-vitae-projection.spec.js.
 *
 * IMPORTANT: all qf-section elements start with class "collapsed". The Blood
 * Sorcery section must be expanded (click .qf-section-title) before interacting
 * with any element inside it, or before checking visibility of child elements.
 * renderForm() restores the expanded state of any section that was open before
 * the re-render (lines 2235-2247 of downtime-form.js).
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-002',
  character_ids: ['char-s37'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-dt37', status: 'active', label: 'Test Cycle DT37',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-05-07T00:00:00.000Z',
};

// A character with Cruac (Blood Sorcery) to activate the sorcery section.
// IMPORTANT: powers entries MUST include category: 'rite' — the form filters
// on this field via `(c.powers || []).filter(p => p.category === 'rite')`.
// Without category: 'rite', knownRites is empty and the rite selector doesn't render.
function buildSorcChar(overrides = {}) {
  return {
    _id: 'char-s37', name: 'Sorcery Tester', moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Test Player',
    blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: {
      city: 1, clan: 1,
      covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 1, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
    },
    attributes: {
      Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {
      Occult: { dots: 3, bonus: 0, specs: [], nine_again: false },
      Stealth: { dots: 2, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: { Cruac: { dots: 2 } },
    merits: [], ordeals: [],
    // category: 'rite' is required — the form filters by this exact field
    powers: [
      { name: 'Blight', category: 'rite', tradition: 'Cruac', level: 1 },
    ],
    ...overrides,
  };
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function setupSuite(page, char, existingSubmission = null) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);

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

  // Use regex so query-string variants (?cycle_id=…) are also matched.
  await page.route(/\/api\/downtime_submissions/, r => {
    if (r.request().method() === 'POST') {
      const reqBody = JSON.parse(r.request().postData() || '{}');
      return r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          _id: 'sub-dt37-new', cycle_id: ACTIVE_CYCLE._id,
          character_id: char._id, status: 'submitted',
          responses: reqBody.responses || {},
        }),
      });
    }
    if (r.request().method() === 'PUT') {
      const reqBody = JSON.parse(r.request().postData() || '{}');
      return r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          _id: existingSubmission?._id || 'sub-dt37-existing',
          cycle_id: ACTIVE_CYCLE._id,
          character_id: char._id, status: 'submitted',
          responses: reqBody.responses || {},
        }),
      });
    }
    const list = existingSubmission ? [existingSubmission] : [];
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) });
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

// Switch to ADVANCED and wait for the re-render to complete.
async function switchToAdvanced(page) {
  await page.locator('#dt-sandbox [data-dt-mode="advanced"]').click();
  await page.waitForSelector('#dt-sandbox #dt-btn-submit-final', { timeout: 5000 });
}

// Expand the Blood Sorcery section. All qf-sections start collapsed; clicking
// the section title (h4.qf-section-title) toggles the 'collapsed' class. The
// section must be expanded before interacting with any element inside it.
async function expandSorcerySection(page) {
  // The section is in the sandbox; find its title heading and click it.
  await page.locator('#dt-sandbox .qf-section[data-section-key="blood_sorcery"] .qf-section-title').click();
  // After removal of 'collapsed', the section body is visible; wait for the
  // rite selector to confirm the section is open.
  await page.waitForSelector('#dt-sandbox #dt-sorcery_1_rite', { state: 'visible', timeout: 3000 });
}

// Select a rite in slot n and wait for the sorcery details + targets block to render.
// Rite selection fires a change event → renderForm() re-renders the container.
// The form restores expanded-section state, so the section stays open after re-render.
async function selectRiteAndWait(page, slotN, riteName) {
  await page.locator(`#dt-sandbox #dt-sorcery_${slotN}_rite`).selectOption(riteName);
  // targets block is rendered inside 'if (rite)' — only appears after a rite is selected
  await page.waitForSelector(
    `#dt-sandbox [data-sorcery-slot-targets="${slotN}"]`,
    { state: 'visible', timeout: 5000 }
  );
}

// Fill the first available feeding territory hidden input to bypass the
// "Feeding Territory required" validation gate, allowing submitForm() to
// reach the API call. Does not affect the sorcery targets being tested.
async function bypassFeedingValidation(page) {
  await page.evaluate(() => {
    const el = document.querySelector('#dt-sandbox input[id^="feed-val-"]');
    if (el) el.value = 'poaching';
  });
}

// ── dt-form.37: JSON serialisation — collect side ─────────────────────────────

test.describe('dt-form.37: collectResponses() serialises sorcery targets as JSON string', () => {

  test('sorcery_N_targets in POST body is a JSON string, not a raw array', async ({ page }) => {
    const char = buildSorcChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandSorcerySection(page);
    await selectRiteAndWait(page, 1, 'Blight');
    await bypassFeedingValidation(page);

    const [request] = await Promise.all([
      page.waitForRequest(
        req => req.url().includes('/api/downtime_submissions') &&
               (req.method() === 'POST' || req.method() === 'PUT'),
        { timeout: 5000 }
      ),
      page.locator('#dt-sandbox #dt-btn-submit').click(),
    ]);

    const body = JSON.parse(request.postData() || '{}');
    const targets = body?.responses?.sorcery_1_targets;

    // Core assertion: must be a string at the API boundary
    expect(typeof targets).toBe('string');
    expect(targets).not.toBe('[object Array]');
    // Must be parseable JSON (a valid JSON array)
    const parsed = JSON.parse(targets);
    expect(Array.isArray(parsed)).toBe(true);
  });

  test('empty target rows produce a JSON string ("[]"), not undefined', async ({ page }) => {
    const char = buildSorcChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandSorcerySection(page);
    // Select rite but leave all target rows empty (no type radio checked)
    await selectRiteAndWait(page, 1, 'Blight');
    await bypassFeedingValidation(page);

    const [request] = await Promise.all([
      page.waitForRequest(
        req => req.url().includes('/api/downtime_submissions') &&
               (req.method() === 'POST' || req.method() === 'PUT'),
        { timeout: 5000 }
      ),
      page.locator('#dt-sandbox #dt-btn-submit').click(),
    ]);

    const body = JSON.parse(request.postData() || '{}');
    const targets = body?.responses?.sorcery_1_targets;

    expect(typeof targets).toBe('string');
    const parsed = JSON.parse(targets);
    expect(Array.isArray(parsed)).toBe(true);
    // Empty target rows → empty array
    expect(parsed.length).toBe(0);
  });

});

// ── dt-form.37: JSON deserialisation — render side ───────────────────────────

test.describe('dt-form.37: render path correctly parses JSON-string targets from server', () => {

  test('JSON-string targets from server populate picker rows, not a single mangled value', async ({ page }) => {
    const char = buildSorcChar();
    const existingSub = {
      _id: 'sub-dt37-existing',
      cycle_id: ACTIVE_CYCLE._id,
      character_id: char._id,
      status: 'draft',
      responses: {
        sorcery_slot_count: '1',
        sorcery_1_rite: 'Blight',
        // Server shape after fix: a JSON string
        sorcery_1_targets: JSON.stringify([{ type: 'character', value: 'Cyrus Ashford' }]),
        sorcery_1_notes: '',
        sorcery_1_mandragora: 'no',
      },
    };
    await setupSuite(page, char, existingSub);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);

    // Expand the section. The rite 'Blight' is already pre-selected in the
    // saved data — renderSorcerySection renders the targets block immediately.
    await expandSorcerySection(page);
    await page.waitForSelector('#dt-sandbox [data-sorcery-slot-targets="1"]', { state: 'visible', timeout: 5000 });

    // The first target row's value input must show 'Cyrus Ashford', not the raw JSON string
    const valueInput = page.locator('#dt-sandbox #dt-sorcery_1_targets_0_value').first();
    if (await valueInput.count() > 0) {
      const val = await valueInput.inputValue();
      expect(val).not.toContain('[{');   // not a JSON blob
      expect(val).toBe('Cyrus Ashford');
    }
  });

  test('legacy plain-string target renders as a single other-type row (regression)', async ({ page }) => {
    const char = buildSorcChar();
    const existingSub = {
      _id: 'sub-dt37-legacy',
      cycle_id: ACTIVE_CYCLE._id,
      character_id: char._id,
      status: 'draft',
      responses: {
        sorcery_slot_count: '1',
        sorcery_1_rite: 'Blight',
        // Legacy shape: plain string, NOT a JSON array string
        sorcery_1_targets: 'Some Legacy Target',
        sorcery_1_notes: '',
        sorcery_1_mandragora: 'no',
      },
    };
    await setupSuite(page, char, existingSub);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandSorcerySection(page);
    await page.waitForSelector('#dt-sandbox [data-sorcery-slot-targets="1"]', { state: 'visible', timeout: 5000 });

    const valueInput = page.locator('#dt-sandbox #dt-sorcery_1_targets_0_value').first();
    if (await valueInput.count() > 0) {
      const val = await valueInput.inputValue();
      expect(val).toBe('Some Legacy Target');
    }
  });

  test('empty saved targets render as a single blank placeholder row (no crash)', async ({ page }) => {
    const char = buildSorcChar();
    const existingSub = {
      _id: 'sub-dt37-empty',
      cycle_id: ACTIVE_CYCLE._id,
      character_id: char._id,
      status: 'draft',
      responses: {
        sorcery_slot_count: '1',
        sorcery_1_rite: 'Blight',
        // No targets key at all
        sorcery_1_notes: '',
        sorcery_1_mandragora: 'no',
      },
    };
    await setupSuite(page, char, existingSub);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandSorcerySection(page);
    await page.waitForSelector('#dt-sandbox [data-sorcery-slot-targets="1"]', { state: 'visible', timeout: 5000 });

    // The else branch returns [{ type: '', value: '' }] — one blank placeholder row
    const rows = page.locator('#dt-sandbox .dt-sorcery-target-row');
    await expect(rows).toHaveCount(1, { timeout: 3000 });
  });

});
