/**
 * Regression tests for fix.50 — Sheet tab: read-only status summary block
 *
 * Root cause: Sheet tab (desktop) showed no status standings; player had to
 * switch to the Status tab to see City / Clan / Covenant values.
 *
 * Fix: renderSheet() in public/js/suite/sheet.js now builds a read-only
 * status-summary block in infoHtml (desktop path only).
 *
 * AC-1: Desktop sheet renders City, Covenant, and Clan pips
 * AC-2: Other-covenant standings render as compact secondary line
 * AC-3: Status block has no onclick handlers (read-only)
 * AC-4: No empty pips when clan or covenant is absent
 * AC-5: Split-tab phone mode — #sh-content-suite is empty (summary not leaked)
 * AC-6: City pip always present even when city status is 0
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '777000050', username: 'test_st50', global_name: 'Test ST 50',
  avatar: null, role: 'st', player_id: 'p-fix50',
  character_ids: ['char-fix50-001'], is_dual_role: false,
};

function buildChar(overrides = {}) {
  return {
    _id: 'char-fix50-001',
    name: 'Status Summary Tester',
    moniker: null, honorific: null,
    clan: 'Daeva', covenant: 'Carthian Movement', player: 'Test Player',
    blood_potency: 1, humanity: 7, humanity_base: 7,
    court_title: null, retired: false,
    status: { city: 2, clan: 1, covenant: { 'Carthian Movement': 3 } },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {}, disciplines: {}, merits: [], ordeals: [], powers: [],
    xp_log: { spent: 0 },
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setupSuite(page, char) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, ST_USER);

  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
  );
  await page.route('**/api/characters/names', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: char._id, name: char.name, moniker: null, honorific: null }]) })
  );
  await page.route(new RegExp(`/api/characters/${char._id}$`), r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) })
  );
  await page.route('**/api/rules', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

/**
 * Load char into state.chars and call onSheetChar() in desktop mode.
 * onSheetChar un-hides #sh-content-suite and calls renderSheet internally.
 */
async function renderSheetDesktop(page, char) {
  await page.evaluate(async (c) => {
    document.body.classList.add('desktop-mode');
    const stateModule = await import('/js/suite/data.js');
    const state = stateModule.default;
    state.chars = [c];
    const { onSheetChar } = await import('/js/suite/sheet.js');
    onSheetChar(c.name);
  }, char);
  await page.waitForTimeout(200);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.50: Sheet tab status summary block', () => {

  test('AC-1: desktop sheet renders City, Covenant, and Clan pips', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    // #sh-content-suite renders into an inactive tab — check DOM content, not visibility
    const pipTexts = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll('#sh-content-suite .status-summary-pip')
      ).map(el => el.textContent.trim());
    });
    expect(pipTexts).toHaveLength(3);
    expect(pipTexts[0]).toContain('City');
    expect(pipTexts[1]).toContain('Carthian Movement');
    expect(pipTexts[2]).toContain('Daeva');
  });

  test('AC-2: other-covenant standings render as compact secondary line', async ({ page }) => {
    const char = buildChar({
      status: { city: 2, clan: 1, covenant: { 'Carthian Movement': 3, 'Invictus': 1 } },
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const otherText = await page.evaluate(() => {
      const el = document.querySelector('#sh-content-suite .status-summary-other');
      return el ? el.textContent.trim() : null;
    });
    expect(otherText).not.toBeNull();
    expect(otherText).toContain('Invictus');
    expect(otherText).toContain('1');
    expect(otherText).not.toContain('Carthian');
  });

  test('AC-3: status pips have no onclick handlers', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const hasHandlers = await page.evaluate(() => {
      const pips = document.querySelectorAll('#sh-content-suite .status-summary-pip');
      return Array.from(pips).some(pip =>
        pip.onclick !== null || pip.getAttribute('onclick') !== null
      );
    });
    expect(hasHandlers).toBe(false);
  });

  test('AC-4: no covenant pip when covenant is absent', async ({ page }) => {
    const char = buildChar({ covenant: null, status: { city: 1, clan: 0, covenant: {} } });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const sheet = page.locator('#sh-content-suite');
    const pips = sheet.locator('.status-summary-pip');
    // City + Clan only — no covenant pip
    await expect(pips).toHaveCount(2);
    await expect(pips.nth(0)).toContainText('City');
    await expect(pips.nth(1)).toContainText('Daeva');
  });

  test('AC-4: no clan pip when clan is absent', async ({ page }) => {
    const char = buildChar({ clan: null, status: { city: 1, clan: 0, covenant: { 'Carthian Movement': 1 } } });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const sheet = page.locator('#sh-content-suite');
    const pips = sheet.locator('.status-summary-pip');
    // City + Covenant only — no clan pip
    await expect(pips).toHaveCount(2);
    await expect(pips.nth(0)).toContainText('City');
    await expect(pips.nth(1)).toContainText('Carthian Movement');
  });

  test('AC-5: phone mode — #sh-content-suite is empty (no status summary leaked)', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char);

    // Render without desktop-mode — split-tab path
    await page.evaluate(async (c) => {
      document.body.classList.remove('desktop-mode');
      const stateModule = await import('/js/suite/data.js');
      const state = stateModule.default;
      state.chars = [c];
      const { onSheetChar } = await import('/js/suite/sheet.js');
      onSheetChar(c.name);
    }, char);
    await page.waitForTimeout(200);

    // On phone, #sh-content-suite is cleared; status-summary must not be in it
    const summaryCount = await page.locator('#sh-content-suite .status-summary').count();
    expect(summaryCount).toBe(0);
  });

  test('AC-6: City pip present when city status is 0', async ({ page }) => {
    const char = buildChar({ status: { city: 0, clan: 0, covenant: { 'Carthian Movement': 0 } } });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const cityVal = await page.evaluate(() => {
      const pips = document.querySelectorAll('#sh-content-suite .status-summary-pip');
      const cityPip = Array.from(pips).find(p => p.textContent.includes('City'));
      return cityPip ? cityPip.querySelector('.status-summary-n')?.textContent.trim() : null;
    });
    expect(cityVal).not.toBeNull();
    expect(cityVal).toBe('0');
  });

});
