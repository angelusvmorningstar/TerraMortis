// E2E coverage for rcv.7 — the Humanity Breaking Point rules reference in the
// ST Approval Queue's own Humanity Check row (public/js/suite/office-
// approvals.js's _renderHumanityCheckRow). Reuses the SAME shared, XSS-safe
// renderRulesExpander() component (#994) rcv.3a already wired into the Roll
// tab's Rules-explanation box — this story adds a second, independent call
// site, not a new component.
//
// Character injection: this app registers a Service Worker (public/sw.js)
// that intercepts API calls ahead of Playwright's page.route() stubs
// (diagnosed during rlv.4). `serviceWorkers: 'block'` sidesteps it.

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

const ST_USER = {
  id: '900000017', username: 'test_st_rcv7', global_name: 'Test ST rcv7',
  avatar: null, role: 'st', player_id: 'p-rcv7', character_ids: [], is_dual_role: false,
};

const PENDING_ROWS = [
  {
    _id: 'hc-req-1', request_type: 'humanity_check',
    character_name: 'Alice Vunder', created_at: '2026-08-30T12:00:00.000Z',
  },
  {
    _id: 'hc-req-2', request_type: 'humanity_check',
    character_name: 'Second Tester', created_at: '2026-08-30T13:00:00.000Z',
  },
];

async function setupQueue(page, rows) {
  await page.addInitScript((user) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, ST_USER);

  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(/\/api\/office_actions\/pending/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => window.goTab('office-approvals'));
  await page.waitForSelector('[data-oaq-row]', { state: 'visible', timeout: 10000 });
}

test('rcv.7 — the rules reference renders, collapsed by default, for a Humanity Check row', async ({ page }) => {
  await setupQueue(page, [PENDING_ROWS[0]]);

  const row = page.locator('[data-oaq-row="hc-req-1"]');
  await expect(row).toContainText('Alice Vunder');

  const expander = row.locator('.rules-expander');
  await expect(expander).toHaveCount(1);
  const body = page.locator('#rules-body-hc-rules-hc-req-1');
  await expect(body).not.toHaveClass(/\bvisible\b/);
});

test('rcv.7 — toggling it open reveals the formula and the level table, with real bold rendering', async ({ page }) => {
  await setupQueue(page, [PENDING_ROWS[0]]);

  const row = page.locator('[data-oaq-row="hc-req-1"]');
  await row.locator('.rules-expander-toggle').click();
  const body = page.locator('#rules-body-hc-rules-hc-req-1');
  await expect(body).toHaveClass(/\bvisible\b/);

  await expect(body).toContainText('4 - (Current Humanity - Breaking Point level) + Touchstone modifier');
  await expect(body).toContainText('Dramatic Failure: lose a Humanity dot, gain the Jaded Condition');
  await expect(body).toContainText('killing your Touchstone.');
  // **bold** markers render as real <strong>, matching renderRulesText()'s
  // own established contract (already proven by rcv.3a's own tests).
  await expect(body.locator('strong', { hasText: 'Humanity 1:' })).toHaveCount(1);
  await expect(body.locator('strong', { hasText: 'Sample Breaking Points, by level:' })).toHaveCount(1);
  await expect(body).toContainText('Source: Terra Mortis Errata');
});

test('rcv.7 — the reference is visible before any breaking-point level is chosen', async ({ page }) => {
  await setupQueue(page, [PENDING_ROWS[0]]);

  const row = page.locator('[data-oaq-row="hc-req-1"]');
  // No level picked yet — the select is still on its placeholder option.
  await expect(row.locator('.oaq-hc-level-select')).toHaveValue('');
  await expect(row.locator('.rules-expander')).toBeVisible();
});

test('rcv.7 — two pending rows each get their own independently-toggleable expander', async ({ page }) => {
  await setupQueue(page, PENDING_ROWS);

  const row1 = page.locator('[data-oaq-row="hc-req-1"]');
  const row2 = page.locator('[data-oaq-row="hc-req-2"]');
  await expect(row1.locator('.rules-expander')).toHaveCount(1);
  await expect(row2.locator('.rules-expander')).toHaveCount(1);

  await row1.locator('.rules-expander-toggle').click();
  await expect(page.locator('#rules-body-hc-rules-hc-req-1')).toHaveClass(/\bvisible\b/);
  // The second row's own expander is unaffected — distinct DOM ids, not one
  // shared block.
  await expect(page.locator('#rules-body-hc-rules-hc-req-2')).not.toHaveClass(/\bvisible\b/);
});

test('rcv.7 — the existing level picker, Accept and Decline controls are unchanged', async ({ page }) => {
  await setupQueue(page, [PENDING_ROWS[0]]);

  const row = page.locator('[data-oaq-row="hc-req-1"]');
  const acceptBtn = row.locator('[data-oaq-action="accept"]');
  await expect(acceptBtn).toBeDisabled(); // no level chosen yet

  await row.locator('.oaq-hc-level-select').selectOption('7');
  await expect(acceptBtn).toBeEnabled();
  await expect(row.locator('[data-oaq-action="decline"]')).toBeEnabled();
});
