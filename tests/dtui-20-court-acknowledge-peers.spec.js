/**
 * E2E coverage for dtui-20 (FR3) — Court "Acknowledge Peers" chip grid.
 *
 * Covers:
 *   - AC1: all roster characters render as .dt-chip inside .dt-chip-grid (no
 *     search box/combobox)
 *   - AC2: non-attendees are visibly disabled (disabled + aria-disabled + title)
 *   - AC3: attendee chips toggle selected on/off and sync the hidden input
 *   - AC4: the 3-pick cap ignores a 4th selection
 *   - AC5: an empty attendance response falls back to "everyone enabled"
 *   - AC6: a saved selection restores, including a pick who is no longer an
 *     attendee this cycle (stays selected AND disabled)
 *
 * Test approach mirrors tests/dt-vitae-projection.spec.js: mount
 * renderDowntimeTab() into a sandbox div directly, bypassing the app's own
 * character-picker chrome. The Court section is gated on `attended: 'yes'`
 * (see /api/attendance mock), so every scenario here is an attendee of the
 * game session being asked about, by construction.
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654322',
  username: 'test_player_dtui20',
  global_name: 'Test Player DTUI20',
  avatar: null,
  role: 'player',
  player_id: 'p-dtui20',
  character_ids: ['char-self'],
  is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-dtui20',
  status: 'active',
  label: 'Test Cycle',
  feeding_rights_confirmed: true,
  is_chapter_finale: false,
  created_at: '2026-08-25T00:00:00.000Z',
};

function buildChar(overrides = {}) {
  return {
    _id: 'char-self',
    name: 'Self Subject',
    moniker: null,
    honorific: null,
    clan: 'Mekhet',
    covenant: 'Invictus',
    player: 'Test Player DTUI20',
    blood_potency: 1,
    humanity: 7,
    humanity_base: 7,
    court_title: null,
    retired: false,
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {},
    disciplines: {},
    merits: [],
    powers: [],
    ordeals: [],
    ...overrides,
  };
}

// Five other characters — Alice/Bob/Dana/Eve attended, Charlie did not.
const OTHER_CHARS = [
  { _id: 'char-alice', name: 'Alice Vunder', moniker: null, player: 'p-a' },
  { _id: 'char-bob', name: 'Bob Smith', moniker: null, player: 'p-b' },
  { _id: 'char-charlie', name: 'Charlie Doe', moniker: null, player: 'p-c' },
  { _id: 'char-dana', name: 'Dana Reyes', moniker: null, player: 'p-d' },
  { _id: 'char-eve', name: 'Eve Okafor', moniker: null, player: 'p-e' },
];
const ATTENDEE_IDS = ['char-alice', 'char-bob', 'char-dana', 'char-eve']; // Charlie did not attend

async function setupSuite(page, char, { attendees = ATTENDEE_IDS, priorResponses = null } = {}) {
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
  await page.route(/\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
  );
  await page.route(/\/api\/characters\/char-self$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) })
  );
  // allCharacters source (downtime-form.js:1571-1579) — full roster minus self.
  await page.route('**/api/characters/names', r =>
    r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: char._id, name: char.name }, ...OTHER_CHARS]),
    })
  );
  await page.route('**/api/chapters', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) })
  );
  // lastGameAttendees source (downtime-form.js:1558-1568).
  await page.route(/\/api\/attendance/, r =>
    r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        attended: true,
        attendees: attendees.map(id => ({ id, name: OTHER_CHARS.find(c => c._id === id)?.name || id })),
        session_id: 'sess-dtui20',
      }),
    })
  );
  // Prior submission (AC6) — omit route entirely (falls through to the
  // catch-all '[]') when priorResponses is null.
  if (priorResponses) {
    await page.route(/\/api\/downtime_submissions\?chapter_id=/, r =>
      r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ _id: 'sub-dtui20', character_id: char._id, chapter_id: ACTIVE_CYCLE._id, responses: priorResponses }]),
      })
    );
  }

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function openCourtSection(page, char) {
  await page.evaluate(async (c) => {
    const sandbox = document.createElement('div');
    sandbox.id = 'dt-sandbox';
    sandbox.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:99999;overflow:auto;';
    document.body.appendChild(sandbox);
    const mod = await import('/js/tabs/downtime-form.js');
    await mod.renderDowntimeTab(sandbox, c, []);
  }, char);
  await page.waitForSelector('#dt-sandbox .qf-section[data-section-key="court"]', { timeout: 10000 });
  await page.locator('#dt-sandbox .qf-section[data-section-key="court"] .qf-section-title').click();
  await expect(page.locator('#dt-sandbox .qf-section[data-section-key="court"]')).not.toHaveClass(/collapsed/);
}

const sb = (page) => page.locator('#dt-sandbox');
const grid = (page) => sb(page).locator('[data-shoutout-grid]');
const chip = (page, id) => grid(page).locator(`[data-shoutout-chip][data-char-id="${id}"]`);
const hiddenInput = (page) => sb(page).locator('#dt-rp_shoutout');

test.describe('dtui-20 — Court Acknowledge Peers chip grid', () => {
  test('AC1: every roster character renders as a chip inside .dt-chip-grid, no search box', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openCourtSection(page, char);

    await expect(grid(page)).toBeVisible();
    for (const c of OTHER_CHARS) {
      await expect(chip(page, c._id)).toHaveText(c.name);
    }
    await expect(grid(page).locator('[data-shoutout-chip]')).toHaveCount(OTHER_CHARS.length);
    // No combobox/search input for this question.
    await expect(sb(page).locator('[data-cp-site="shoutout"]')).toHaveCount(0);
  });

  test('AC2: Charlie (non-attendee) is disabled with a reason', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openCourtSection(page, char);

    const charlie = chip(page, 'char-charlie');
    await expect(charlie).toBeDisabled();
    await expect(charlie).toHaveAttribute('aria-disabled', 'true');
    await expect(charlie).toHaveAttribute('title', /last game session/i);
  });

  test('AC3: clicking an attendee toggles selection and syncs the hidden input', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openCourtSection(page, char);

    const alice = chip(page, 'char-alice');
    await expect(alice).not.toHaveClass(/dt-chip--selected/);
    await alice.click();
    await expect(alice).toHaveClass(/dt-chip--selected/);
    await expect(hiddenInput(page)).toHaveValue(JSON.stringify(['char-alice']));

    await alice.click();
    await expect(alice).not.toHaveClass(/dt-chip--selected/);
    await expect(hiddenInput(page)).toHaveValue(JSON.stringify([]));
  });

  test('AC4: a 4th pick is ignored once 3 attendees are selected', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await openCourtSection(page, char);

    await chip(page, 'char-alice').click();
    await chip(page, 'char-bob').click();
    await chip(page, 'char-dana').click();
    await expect(hiddenInput(page)).toHaveValue(JSON.stringify(['char-alice', 'char-bob', 'char-dana']));

    // Eve is a genuine attendee (enabled) — but the cap must still ignore her.
    await chip(page, 'char-eve').click();
    await expect(chip(page, 'char-eve')).not.toHaveClass(/dt-chip--selected/);
    await expect(hiddenInput(page)).toHaveValue(JSON.stringify(['char-alice', 'char-bob', 'char-dana']));
  });

  test('AC5: an empty attendee list enables every chip (fallback preserved)', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, { attendees: [] });
    await openCourtSection(page, char);

    for (const c of OTHER_CHARS) {
      await expect(chip(page, c._id)).toBeEnabled();
    }
  });

  test('AC6: a saved selection restores, including a pick who is no longer an attendee', async ({ page }) => {
    const char = buildChar();
    // Bob is a current attendee; Charlie was picked previously but did not
    // attend this cycle's game session.
    await setupSuite(page, char, { priorResponses: { rp_shoutout: JSON.stringify(['char-bob', 'char-charlie']) } });
    await openCourtSection(page, char);

    await expect(chip(page, 'char-bob')).toHaveClass(/dt-chip--selected/);
    await expect(chip(page, 'char-bob')).toBeEnabled();

    await expect(chip(page, 'char-charlie')).toHaveClass(/dt-chip--selected/);
    await expect(chip(page, 'char-charlie')).toBeDisabled();
  });
});
