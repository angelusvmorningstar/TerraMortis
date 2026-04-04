const { test, expect } = require('@playwright/test');

// ── Auth + mock data ──

const ST_USER = {
  id: '123456789',
  username: 'test_st',
  global_name: 'Test ST',
  avatar: null,
  role: 'st',
  player_id: 'p-001',
  character_ids: [],
  is_dual_role: false,
};

const PLAYER_USER = {
  id: '987654321',
  username: 'test_player',
  global_name: 'Test Player',
  avatar: null,
  role: 'player',
  player_id: 'p-002',
  character_ids: [],
  is_dual_role: false,
};

const TEST_CHARS = [
  {
    _id: 'char-001', name: 'Alice Vunder', moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Katherine H',
    blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
    regent_territory: 'The North Shore', regent_lieutenant: 'Keeper',
    retired: false,
    status: { city: 2, clan: 3, covenant: 2 },
    attributes: { Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 }, Strength: { dots: 1, bonus: 0 }, Dexterity: { dots: 3, bonus: 0 }, Stamina: { dots: 2, bonus: 0 }, Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 }, Composure: { dots: 3, bonus: 0 } },
    skills: {}, disciplines: { Auspex: 2, Obfuscate: 3 }, merits: [], powers: [], ordeals: {},
  },
  {
    _id: 'char-002', name: 'Eve Lockridge', moniker: null, honorific: null,
    clan: 'Daeva', covenant: 'Carthian Movement', player: 'Jamie',
    blood_potency: 1, humanity: 6, humanity_base: 7, court_title: 'Premier',
    retired: false,
    status: { city: 3, clan: 1, covenant: 2 },
    attributes: { Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 }, Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 }, Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 }, Composure: { dots: 2, bonus: 0 } },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
  },
  {
    _id: 'char-003', name: 'Brandy LaRoux', moniker: null, honorific: null,
    clan: 'Gangrel', covenant: 'Circle of the Crone', player: 'Ashley K',
    blood_potency: 1, humanity: 5, humanity_base: 7, court_title: 'Harpy',
    retired: false,
    status: { city: 1, clan: 2, covenant: 1 },
    attributes: { Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 }, Strength: { dots: 3, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 3, bonus: 0 }, Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 } },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
  },
];

async function loginAsST(page) {
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_CHARS) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_CHARS.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific }))) })
  );
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/downtime_cycles*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/downtime_submissions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/territories*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/session_logs*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/players*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });
}

// ══════════════════════════════════════
//  AUTH GATE
// ══════════════════════════════════════

test.describe('Admin — Auth Gate', () => {
  test('shows login screen when not authenticated', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForSelector('#login-screen');
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#admin-app')).toBeHidden();
  });

  test('shows app when authenticated as ST', async ({ page }) => {
    await loginAsST(page);
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
    await expect(page.locator('#admin-app')).toBeVisible();
  });

  test('player gets redirected away from admin', async ({ page }) => {
    await page.route('**/api/auth/me', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) })
    );
    await page.addInitScript(({ user }) => {
      localStorage.setItem('tm_auth_token', 'fake-test-token');
      localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
      localStorage.setItem('tm_auth_user', JSON.stringify(user));
    }, { user: PLAYER_USER });
    await page.goto('/admin.html');
    // Player should be redirected to /player
    await page.waitForURL('**/player*', { timeout: 5000 });
  });
});

// ══════════════════════════════════════
//  SIDEBAR NAVIGATION
// ══════════════════════════════════════

test.describe('Admin — Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
  });

  test('domain buttons visible', async ({ page }) => {
    const btns = page.locator('.sidebar-btn[data-domain]');
    const count = await btns.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('Player domain active by default', async ({ page }) => {
    await expect(page.locator('.sidebar-btn[data-domain="player"]')).toHaveClass(/on/);
    await expect(page.locator('#d-player')).toHaveClass(/active/);
  });

  test('clicking City switches domain', async ({ page }) => {
    await page.click('.sidebar-btn[data-domain="city"]');
    await expect(page.locator('.sidebar-btn[data-domain="city"]')).toHaveClass(/on/);
    await expect(page.locator('#d-city')).toHaveClass(/active/);
    await expect(page.locator('#d-player')).not.toHaveClass(/active/);
  });

  test('clicking Engine switches domain', async ({ page }) => {
    await page.click('.sidebar-btn[data-domain="engine"]');
    await expect(page.locator('#d-engine')).toHaveClass(/active/);
  });

  test('cross-app nav buttons exist', async ({ page }) => {
    await expect(page.locator('.sidebar-app-nav .app-nav-btn')).toHaveCount(2);
    await expect(page.locator('.sidebar-app-nav .app-nav-btn >> text=Game App')).toBeVisible();
    await expect(page.locator('.sidebar-app-nav .app-nav-btn >> text=Player')).toBeVisible();
  });
});

// ══════════════════════════════════════
//  ENGINE DOMAIN — NEXT SESSION PANEL
// ══════════════════════════════════════

const NEXT_SESSION = {
  _id: 'sess-001',
  session_date: '2099-06-07',
  doors_open: '18:00',
  game_number: 12,
  downtime_deadline: 'Midnight, Friday 5 June 2099',
};

test.describe('Admin — Next Session Panel', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await page.route('**/api/game_sessions/next', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NEXT_SESSION) })
    );
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
    await page.click('.sidebar-btn[data-domain="engine"]');
    await page.waitForSelector('#next-session-content');
  });

  test('panel renders in Engine domain', async ({ page }) => {
    await expect(page.locator('#next-session-content')).toBeVisible();
    await expect(page.locator('#ns-date')).toBeVisible();
    await expect(page.locator('#ns-time')).toBeVisible();
    await expect(page.locator('#ns-game-number')).toBeVisible();
    await expect(page.locator('#ns-deadline')).toBeVisible();
    await expect(page.locator('#ns-save')).toBeVisible();
  });

  test('loads existing session data into fields', async ({ page }) => {
    await expect(page.locator('#ns-date')).toHaveValue('2099-06-07');
    await expect(page.locator('#ns-time')).toHaveValue('18:00');
    await expect(page.locator('#ns-game-number')).toHaveValue('12');
    await expect(page.locator('#ns-deadline')).toHaveValue('Midnight, Friday 5 June 2099');
  });

  test('status shows game number when session loaded', async ({ page }) => {
    await expect(page.locator('#ns-status')).toHaveText('Loaded: Game 12');
  });

  test('Save button triggers PUT and shows confirmation', async ({ page }) => {
    let putCalled = false;
    await page.route('**/api/game_sessions/sess-001', route => {
      putCalled = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...NEXT_SESSION, downtime_deadline: 'Midnight, Friday 5 June 2099' }) });
    });

    await page.click('#ns-save');
    await page.waitForTimeout(300);
    expect(putCalled).toBe(true);
    await expect(page.locator('#ns-saved')).toBeVisible();
  });

  test('shows placeholder message when no upcoming session', async ({ page }) => {
    await page.route('**/api/game_sessions/next', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    );
    await page.reload();
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
    await page.click('.sidebar-btn[data-domain="engine"]');
    await page.waitForSelector('#ns-status');
    await expect(page.locator('#ns-status')).toHaveText(/No upcoming session/);
  });

  test('Save without date shows alert', async ({ page }) => {
    await page.fill('#ns-date', '');
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('date');
      await dialog.accept();
    });
    await page.click('#ns-save');
  });
});

// ══════════════════════════════════════
//  PLAYER DOMAIN (character grid)
// ══════════════════════════════════════

test.describe('Admin — Player Domain', () => {
  // Note: Character card rendering requires deep data (XP calculation).
  // Card rendering is covered by editor.spec.js against the real API.
  // Here we test the structural elements that don't depend on card rendering.
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
  });

  test('player domain is active by default', async ({ page }) => {
    await expect(page.locator('#d-player')).toHaveClass(/active/);
  });

  test('character grid container exists', async ({ page }) => {
    await expect(page.locator('#char-grid')).toBeVisible();
  });

  test('CSV download button exists', async ({ page }) => {
    await expect(page.locator('#btn-csv')).toBeVisible();
  });
});

// ══════════════════════════════════════
//  CITY DOMAIN
// ══════════════════════════════════════

test.describe('Admin — City Domain', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
    await page.click('.sidebar-btn[data-domain="city"]');
    await page.waitForSelector('#city-content .city-split', { timeout: 5000 });
  });

  test('renders two-column layout', async ({ page }) => {
    await expect(page.locator('.city-split')).toBeVisible();
    await expect(page.locator('.city-left')).toBeVisible();
    await expect(page.locator('.city-right')).toBeVisible();
  });

  test('court section shows titled characters', async ({ page }) => {
    const court = page.locator('.court-list');
    await expect(court).toBeVisible();
    const content = await court.textContent();
    expect(content).toContain('Premier');
    expect(content).toContain('Eve Lockridge');
  });

  test('court titles ordered correctly', async ({ page }) => {
    const titles = await page.locator('.court-title').allTextContents();
    const premierIdx = titles.findIndex(t => t === 'Premier');
    const harpyIdx = titles.findIndex(t => t === 'Harpy');
    expect(premierIdx).toBeLessThan(harpyIdx);
  });

  test('territory cards render', async ({ page }) => {
    const cards = page.locator('.terr-card');
    await expect(cards).toHaveCount(5);
  });

  test('territory shows regent', async ({ page }) => {
    const content = await page.locator('.city-right').textContent();
    expect(content).toContain('Alice Vunder');
  });

  test('territory shows lieutenant', async ({ page }) => {
    const content = await page.locator('.city-right').textContent();
    expect(content).toContain('Lieutenant');
  });

  test('eminence and ascendancy section renders', async ({ page }) => {
    const content = await page.locator('.city-left').textContent();
    expect(content).toContain('Eminence');
    expect(content).toContain('Ascendancy');
  });

  test('prestige section shows top characters', async ({ page }) => {
    const prestige = page.locator('.city-left .infl-table');
    await expect(prestige).toBeVisible();
  });
});

// ══════════════════════════════════════
//  ENGINE DOMAIN
// ══════════════════════════════════════

test.describe('Admin — Engine Domain', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
    await page.click('.sidebar-btn[data-domain="engine"]');
    await page.waitForSelector('#engine-content', { timeout: 5000 });
  });

  test('dice engine renders', async ({ page }) => {
    await expect(page.locator('#dice-engine')).toBeVisible();
  });

  test('feeding engine renders', async ({ page }) => {
    await expect(page.locator('#feeding-engine')).toBeVisible();
  });

  test('session tracker renders', async ({ page }) => {
    await expect(page.locator('#session-tracker')).toBeVisible();
  });

  test('dice engine has character selector', async ({ page }) => {
    await expect(page.locator('#de-char')).toBeVisible();
  });

  test('dice engine has roll button', async ({ page }) => {
    await expect(page.locator('#de-roll')).toBeVisible();
  });
});

// ══════════════════════════════════════
//  THEME
// ══════════════════════════════════════

test.describe('Admin — Theme', () => {
  test('CSS custom properties load', async ({ page }) => {
    await loginAsST(page);
    await page.goto('/admin.html');
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    );
    expect(bg).toBe('#0D0B09');
  });
});
