/**
 * E2E — FIN epic: Check-In (fin.3)
 *
 * Covers:
 *   fin.3 — Check-In tab label, payment methods, amount input, DNA grey-out, footer total
 *
 * The fin.4 Finance tab tests were retired with #1135, which deleted the Finance
 * tab from the Game App. The check-in survives and is what this file now covers.
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: 'test-st-001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-st-001', character_ids: [], is_dual_role: false,
};

const SESSION = {
  _id: 'sess-fin-001',
  session_date: '2099-02-01',
  title: 'FIN Test',
  attendance: [
    { character_id: 'c1', character_name: 'Alice',  player: 'AlicePlayer', attended: true,  payment: { method: 'cash',  amount: 15 } },
    { character_id: 'c2', character_name: 'Bob',    player: 'BobPlayer',   attended: true,  payment: { method: 'payid', amount: 15 } },
    { character_id: 'c3', character_name: 'Carol',  player: 'CarolPlayer', attended: false, payment: { method: 'did_not_attend', amount: 0 } },
    { character_id: 'c4', character_name: 'Dave',   player: 'DavePlayer',  attended: true,  payment: { method: 'exiles', amount: 0 } },
  ],
  finances: {
    expenses:  [{ category: 'venue', amount: 20 }],
    transfers: [{ to: 'conan', amount: 10 }],
  },
};

async function setup(page, extraRoutes = {}) {
  await page.addInitScript((u) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, ST_USER);

  await page.route('http://localhost:3000/api/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/api/game_sessions') && method === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([SESSION]) });
    } else if (url.includes('/api/game_sessions') && method === 'PUT') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION) });
    } else if (url.includes('/api/characters') && !url.includes('names')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(extraRoutes[url] || []) });
    }
  });

  // <900px forces phablet mode so #bnav (bottom nav) is visible
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await page.waitForSelector('#bnav', { timeout: 10000 });
}

// ── fin.3 — Check-In tab ─────────────────────────────────────────────────────

test('fin.3: nav shows Check-In label (not Sign-In)', async ({ page }) => {
  await setup(page);
  // The ST can see the renamed tab
  const label = await page.locator('#n-signin').textContent();
  expect(label).toContain('Check-In');
  expect(label).not.toContain('Sign-In');
});

test('fin.3: payment method dropdown uses fin.2 enum values', async ({ page }) => {
  await setup(page);
  await page.locator('#n-signin').click();
  await page.waitForSelector('.si-pay-sel');
  const options = await page.locator('.si-pay-sel').first().locator('option').allTextContents();
  expect(options.some(o => /Cash/i.test(o))).toBe(true);
  expect(options.some(o => /PayID/i.test(o))).toBe(true);
  expect(options.some(o => /PayPal/i.test(o))).toBe(true);
  expect(options.some(o => /Exiles/i.test(o))).toBe(true);
  expect(options.some(o => /Waived/i.test(o))).toBe(true);
  // 'Did Not Attend' was retired in FIN-6; canonical signal is the attended checkbox.
});
