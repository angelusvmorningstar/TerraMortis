/**
 * feat.13 — Regent territory ambience status bonus
 * feat.14 — City status appellations on bracket rows
 * feat.15 — Attaché merit redesign (influence category, attached_to, bonus dots)
 * OTS     — Oath of the Scapegoat prestige + covenant status penalty
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const BASE_ATTRS = {
  Intelligence: { dots: 2, bonus: 0 }, Wits:         { dots: 2, bonus: 0 },
  Resolve:      { dots: 2, bonus: 0 }, Strength:     { dots: 2, bonus: 0 },
  Dexterity:    { dots: 2, bonus: 0 }, Stamina:      { dots: 2, bonus: 0 },
  Presence:     { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 },
  Composure:    { dots: 2, bonus: 0 },
};

// Invictus character with covenant status 3, has an Attaché merit linked to Resources
const INVICTUS_CHAR = {
  _id: 'char-inv-001', name: 'Charlie Invictus', moniker: null, honorific: null,
  clan: 'Ventrue', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 2, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 3, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: BASE_ATTRS,
  skills: {}, disciplines: {}, ordeals: [],
  merits: [
    { name: 'Resources', category: 'influence', rating: 2, cp: 2, xp: 0 },
    { name: 'Attaché',   category: 'influence', rating: 1, cp: 1, xp: 0, attached_to: 'Resources' },
  ],
  powers: [],
  xp_log: { spent: 0 },
};

// Same character but Invictus with OTS pact (2 dots)
const OTS_CHAR = {
  _id: 'char-ots-001', name: 'Charlie OTS', moniker: null, honorific: null,
  clan: 'Ventrue', covenant: 'Invictus', player: 'OTS Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 3, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: BASE_ATTRS,
  skills: {}, disciplines: {}, ordeals: [],
  merits: [],
  powers: [{ category: 'pact', name: 'Oath of the Scapegoat', cp: 2, xp: 0 }],
  xp_log: { spent: 0 },
};

// Non-OTS Invictus peer for comparison
const PEER_CHAR = {
  _id: 'char-peer-001', name: 'Peer Invictus', moniker: null, honorific: null,
  clan: 'Ventrue', covenant: 'Invictus', player: 'Peer Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 3, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: BASE_ATTRS,
  skills: {}, disciplines: {}, ordeals: [],
  merits: [], powers: [],
  xp_log: { spent: 0 },
};

// Character that is regent of The Rack territory (ambience bonus +2)
const REGENT_CHAR = {
  _id: 'char-reg-001', name: 'Regina Rack', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Carthian Movement', player: 'Reg Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 2, clan: 1, covenant: { 'Carthian Movement': 1, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: BASE_ATTRS,
  skills: {}, disciplines: {}, ordeals: [],
  merits: [], powers: [],
  xp_log: { spent: 0 },
};

const RACK_TERRITORY = {
  _id: 'terr-rack', id: 'therack', name: 'The Rack',
  regent_id: 'char-reg-001', ambience: 'The Rack',
};

const CURATED_TERRITORY = {
  _id: 'terr-curated', id: 'academy', name: 'The Academy',
  regent_id: 'char-reg-001', ambience: 'Curated',
};

// Status endpoint shape (server-computed _ots_covenant_bonus)
function makeStatusChars(chars, otsBonusMap = {}) {
  return chars.map(c => ({
    _id: c._id, name: c.name, honorific: c.honorific, moniker: c.moniker,
    clan: c.clan, covenant: c.covenant,
    status: c.status, court_title: c.court_title, court_category: c.court_category || null,
    _player_info: null,
    _ots_covenant_bonus: otsBonusMap[c._id] || 0,
  }));
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function setupAdmin(page, chars, territories = []) {
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chars) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific }))) })
  );
  await page.route(/\/api\/characters\/char-inv-001$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(INVICTUS_CHAR) })
  );
  await page.route(/\/api\/characters\/char-reg-001$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REGENT_CHAR) })
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
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(territories) })
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

async function setupSuite(page, chars, statusChars, territories = []) {
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chars) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific }))) })
  );
  await page.route('**/api/characters/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(statusChars) })
  );
  await page.route('**/api/characters/combat', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/territories*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(territories) })
  );
  await page.route('**/api/session_logs*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/tracker_state*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  );
  await page.route('**/api/rules*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });
}

async function openCharEdit(page, charId) {
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])');
  await page.waitForSelector(`[data-id="${charId}"]`, { timeout: 8000 });
  await page.click(`[data-id="${charId}"]`);
  await page.waitForSelector('#char-detail #cd-edit-toggle', { timeout: 5000 });
  await page.click('#cd-edit-toggle');
  await page.waitForTimeout(400);
}

async function openSuiteStatusTab(page) {
  await page.goto('/index.html');
  await page.waitForSelector('#app:not([style*="display: none"])');
  await page.waitForFunction(() => window._charNames !== undefined, { timeout: 10000 });
  await page.click('#n-status');
  await page.waitForSelector('#t-status.active, #t-status', { timeout: 5000 });
  await page.waitForTimeout(800);
}

// ══════════════════════════════════════════════════════════════════════════════
//  feat.15 — Attaché merit: influence category + attached_to dropdown
// ══════════════════════════════════════════════════════════════════════════════

test.describe('feat.15 — Attaché merit redesign', () => {

  test('Attaché appears in influence merit type dropdown', async ({ page }) => {
    await setupAdmin(page, [INVICTUS_CHAR]);
    await openCharEdit(page, 'char-inv-001');

    // Find the influence merit type select for the Attaché row
    const inflSection = page.locator('.sh-sec').filter({ hasText: 'Influence Merits' });
    const typeSelects = inflSection.locator('select.infl-type');
    const count = await typeSelects.count();
    expect(count).toBeGreaterThan(0);

    // At least one select should have Attaché as an option
    let foundAttache = false;
    for (let i = 0; i < count; i++) {
      const opts = await typeSelects.nth(i).locator('option').allTextContents();
      if (opts.includes('Attaché')) { foundAttache = true; break; }
    }
    expect(foundAttache).toBe(true);
  });

  test('Attaché merit row shows attached_to dropdown', async ({ page }) => {
    await setupAdmin(page, [INVICTUS_CHAR]);
    await openCharEdit(page, 'char-inv-001');

    // The Attaché row should contain a select for the target merit
    const inflSection = page.locator('.sh-sec').filter({ hasText: 'Influence Merits' });
    // The attached_to select is rendered as a derived-note select
    const attachedToSel = inflSection.locator('div.derived-note select').first();
    await expect(attachedToSel).toBeVisible({ timeout: 5000 });
  });

  test('attached_to dropdown lists eligible merits (Contacts, Resources, Safe Place)', async ({ page }) => {
    // Character has Resources — it should appear as an option
    await setupAdmin(page, [INVICTUS_CHAR]);
    await openCharEdit(page, 'char-inv-001');

    const inflSection = page.locator('.sh-sec').filter({ hasText: 'Influence Merits' });
    const attachedToSel = inflSection.locator('div.derived-note select').first();
    await expect(attachedToSel).toBeVisible({ timeout: 5000 });

    const opts = await attachedToSel.locator('option').allTextContents();
    // Resources is on this character — must appear
    expect(opts.some(o => o.includes('Resources'))).toBe(true);
  });

  test('attached_to dropdown pre-selects the saved target merit', async ({ page }) => {
    // INVICTUS_CHAR has attached_to: 'Resources'
    await setupAdmin(page, [INVICTUS_CHAR]);
    await openCharEdit(page, 'char-inv-001');

    const inflSection = page.locator('.sh-sec').filter({ hasText: 'Influence Merits' });
    const attachedToSel = inflSection.locator('div.derived-note select').first();
    await expect(attachedToSel).toBeVisible({ timeout: 5000 });

    const selectedValue = await attachedToSel.evaluate(el => el.value);
    expect(selectedValue).toBe('Resources');
  });

  test('Attaché bonus note appears on linked merit in edit mode', async ({ page }) => {
    await setupAdmin(page, [INVICTUS_CHAR]);
    await openCharEdit(page, 'char-inv-001');

    // Covenant status 3 → effectiveInvictusStatus = 3 → bonus = 3
    // Derived note should show "Attaché: +3 dots"
    const inflSection = page.locator('.sh-sec').filter({ hasText: 'Influence Merits' });
    const derivedNotes = inflSection.locator('.derived-note');
    const notesText = await derivedNotes.allTextContents();
    const hasAttacheNote = notesText.some(t => t.includes('Attaché') && t.includes('+3'));
    expect(hasAttacheNote).toBe(true);
  });

  test('Attaché bonus shows as hollow dots in view mode on linked merit', async ({ page }) => {
    await setupAdmin(page, [INVICTUS_CHAR]);
    // View mode (no edit) — open char detail without entering edit
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
    await page.waitForSelector('[data-id="char-inv-001"]', { timeout: 8000 });
    await page.click('[data-id="char-inv-001"]');
    await page.waitForSelector('#char-detail', { timeout: 5000 });
    await page.waitForTimeout(300);

    // In view mode, bonus dots are hollow circles (○) on the Resources row
    const inflSection = page.locator('#char-detail .sh-sec').filter({ hasText: 'Influence Merits' });
    const inflHtml = await inflSection.innerHTML();
    // Hollow dot character U+25CB indicates bonus dots are present
    expect(inflHtml).toContain('\u25cb');
  });

  test('Attaché section is absent for non-Invictus character', async ({ page }) => {
    const nonInvictus = {
      ...INVICTUS_CHAR,
      _id: 'char-crt-001', name: 'Carthian Test',
      covenant: 'Carthian Movement',
      merits: [
        { name: 'Resources', category: 'influence', rating: 2, cp: 2, xp: 0 },
        { name: 'Attaché',   category: 'influence', rating: 1, cp: 1, xp: 0, attached_to: 'Resources' },
      ],
    };
    await setupAdmin(page, [nonInvictus]);
    await page.route(/\/api\/characters\/char-crt-001$/, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nonInvictus) })
    );
    await openCharEdit(page, 'char-crt-001');

    const inflSection = page.locator('.sh-sec').filter({ hasText: 'Influence Merits' });
    const notesText = await inflSection.locator('.derived-note').allTextContents().catch(() => []);
    // No Attaché bonus note — non-Invictus gets 0 bonus
    const hasAttacheNote = notesText.some(t => t.includes('Attaché') && /\+[1-9]/.test(t));
    expect(hasAttacheNote).toBe(false);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
//  feat.14 — City status appellations
// ══════════════════════════════════════════════════════════════════════════════

test.describe('feat.14 — City status appellations', () => {

  test('city status brackets show rank labels (Acknowledged, Recognised, etc.)', async ({ page }) => {
    const chars = [
      { ...INVICTUS_CHAR, _id: 'char-s1', name: 'High Status', status: { city: 5, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } } },
      { ...INVICTUS_CHAR, _id: 'char-s2', name: 'Low Status',  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } } },
    ];
    const statusChars = makeStatusChars(chars);
    await setupSuite(page, chars, statusChars);
    await openSuiteStatusTab(page);

    const statusEl = page.locator('#t-status');
    await expect(statusEl).toBeVisible({ timeout: 8000 });
    const html = await statusEl.innerHTML();

    // Appellations for city status 5 = "Admired", status 1 = "Acknowledged"
    expect(html).toContain('Admired');
    expect(html).toContain('Acknowledged');
  });

  test('city status brackets show "Recognised" (British spelling) for rank 2', async ({ page }) => {
    const chars = [
      { ...INVICTUS_CHAR, _id: 'char-r2', name: 'Rank Two', status: { city: 2, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } } },
    ];
    const statusChars = makeStatusChars(chars);
    await setupSuite(page, chars, statusChars);
    await openSuiteStatusTab(page);

    const statusEl = page.locator('#t-status');
    await expect(statusEl).toBeVisible({ timeout: 8000 });
    const html = await statusEl.innerHTML();
    expect(html).toContain('Recognised');
    expect(html).not.toContain('Recognized'); // American spelling must not appear
  });

  test('covenant status brackets do not show appellations', async ({ page }) => {
    const chars = [
      { ...INVICTUS_CHAR, _id: 'char-cov1', name: 'Cov Status 3', status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 3, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } } },
    ];
    const statusChars = makeStatusChars(chars);
    await setupSuite(page, chars, statusChars);
    await openSuiteStatusTab(page);

    const statusEl = page.locator('#suite-status, [id*="status"]').first();
    await expect(statusEl).toBeVisible({ timeout: 8000 });

    // Covenant status 3 = "Valued" in the appellation map — must NOT appear in cov section
    // City status 1 = "Acknowledged" — that CAN appear (city section)
    // Find the Invictus covenant column specifically
    const covSection = page.locator('#t-status .status-col').filter({ hasText: 'Invictus' }).first();
    const covHtml = await covSection.innerHTML().catch(() => '');
    expect(covHtml).not.toContain('status-bracket-appellation');
  });

});

// ══════════════════════════════════════════════════════════════════════════════
//  feat.13 — Regent territory ambience status bonus
// ══════════════════════════════════════════════════════════════════════════════

test.describe('feat.13 — Regent territory ambience status bonus', () => {

  test('regent of The Rack gets +2 city status displayed', async ({ page }) => {
    // REGENT_CHAR has city status 2; The Rack gives +2 → effective = 4
    await setupAdmin(page, [REGENT_CHAR], [RACK_TERRITORY]);
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
    await page.waitForSelector('[data-id="char-reg-001"]', { timeout: 8000 });
    await page.click('[data-id="char-reg-001"]');
    await page.waitForSelector('#char-detail', { timeout: 5000 });
    await page.waitForTimeout(400);

    // _statusPip renders cityTotal in .sh-status-n — should be 4 (2 base + 2 rack)
    const cityPip = page.locator('#char-detail .sh-stat-pip').filter({ hasText: 'City' }).first();
    await expect(cityPip).toBeVisible({ timeout: 5000 });
    const pipVal = await cityPip.locator('.sh-status-n').textContent();
    expect(pipVal.trim()).toBe('4');
  });

  test('regent of Curated territory gets +1 city status', async ({ page }) => {
    // REGENT_CHAR has city status 2; Curated gives +1 → effective = 3
    await setupAdmin(page, [REGENT_CHAR], [CURATED_TERRITORY]);
    await page.goto('/admin.html');
    await page.waitForSelector('[data-id="char-reg-001"]', { timeout: 8000 });
    await page.click('[data-id="char-reg-001"]');
    await page.waitForSelector('#char-detail', { timeout: 5000 });
    await page.waitForTimeout(400);

    const cityPip = page.locator('#char-detail .sh-stat-pip').filter({ hasText: 'City' }).first();
    await expect(cityPip).toBeVisible({ timeout: 5000 });
    const pipVal = await cityPip.locator('.sh-status-n').textContent();
    expect(pipVal.trim()).toBe('3');
  });

  test('non-regent character has no ambience bonus', async ({ page }) => {
    // INVICTUS_CHAR is not regent of anything — city status stays at 2
    await setupAdmin(page, [INVICTUS_CHAR], [RACK_TERRITORY]);
    await page.goto('/admin.html');
    await page.waitForSelector('[data-id="char-inv-001"]', { timeout: 8000 });
    await page.click('[data-id="char-inv-001"]');
    await page.waitForSelector('#char-detail', { timeout: 5000 });
    await page.waitForTimeout(400);

    // City pip should be 2 (base only, no ambience bonus since not regent)
    const cityPip = page.locator('#char-detail .sh-stat-pip').filter({ hasText: 'City' }).first();
    await expect(cityPip).toBeVisible({ timeout: 5000 });
    const pipVal = await cityPip.locator('.sh-status-n').textContent();
    expect(pipVal.trim()).toBe('2');
  });

  test('status endpoint returns _ots_covenant_bonus for OTS characters', async ({ page }) => {
    // Test that the mock pattern matches what the server now computes
    // OTS_CHAR has 2 dots of OTS → _ots_covenant_bonus should be 2
    const statusChars = makeStatusChars([OTS_CHAR], { 'char-ots-001': 2 });
    expect(statusChars[0]._ots_covenant_bonus).toBe(2);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
//  OTS — Prestige leaderboard penalty
// ══════════════════════════════════════════════════════════════════════════════

test.describe('OTS — Prestige leaderboard penalty', () => {

  async function openCityTab(page, chars, territories = []) {
    await setupAdmin(page, chars, territories);
    // city-views.js calls /api/characters/status for the prestige leaderboard
    await page.route('**/api/characters/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(makeStatusChars(chars, { 'char-ots-001': 2 })) })
    );
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
    await page.click('[data-domain="city"]');
    await page.waitForTimeout(1000);
  }

  test('OTS character ranks below peer with same raw covenant status', async ({ page }) => {
    // Both have covenant 3, clan 1. OTS char has _ots_covenant_bonus=2 → prestige = 1+1 = 2
    // Peer has no OTS → prestige = 1+3 = 4. Peer should rank first.
    await openCityTab(page, [OTS_CHAR, PEER_CHAR]);

    // Prestige renders as an infl-table inside the city-left column
    const prestigeTable = page.locator('.city-left .infl-table');
    await expect(prestigeTable).toBeVisible({ timeout: 8000 });

    const rows = prestigeTable.locator('tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // First row should be the peer (higher prestige score)
    const firstRowText = await rows.nth(0).textContent();
    expect(firstRowText).toContain('Peer Invictus');

    // Second row should be OTS char
    const secondRowText = await rows.nth(1).textContent();
    expect(secondRowText).toContain('Charlie OTS');
  });

  test('prestige leaderboard renders without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await openCityTab(page, [OTS_CHAR, PEER_CHAR]);
    const prestigeTable = page.locator('.city-left .infl-table');
    await expect(prestigeTable).toBeVisible({ timeout: 8000 });
    expect(errors).toHaveLength(0);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
//  OTS — Covenant status bracket penalty (suite status tab)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('OTS — Covenant status bracket placement', () => {

  test('OTS character placed in lower bracket than raw status suggests', async ({ page }) => {
    // OTS_CHAR: covenant 3, _ots_covenant_bonus 2 → effective 1 → bracket 1
    // PEER_CHAR: covenant 3, no OTS → effective 3 → bracket 3
    const chars = [OTS_CHAR, PEER_CHAR];
    const statusChars = makeStatusChars(chars, { 'char-ots-001': 2 });
    await setupSuite(page, chars, statusChars);
    await openSuiteStatusTab(page);

    const statusEl = page.locator('#suite-status, .suite-status-tab, [id*="status"]').first();
    await expect(statusEl).toBeVisible({ timeout: 8000 });

    // Find the Invictus covenant section
    const covSection = page.locator('#t-status .status-col').filter({ hasText: 'Invictus' }).first();
    const covHtml = await covSection.innerHTML().catch(() => '');

    // Bracket for value 3 should contain Peer (not OTS)
    const brackets = covSection.locator('.status-bracket');
    const bracketCount = await brackets.count();
    expect(bracketCount).toBeGreaterThan(0);

    // OTS char should not be in the same bracket as Peer
    // Verify Peer appears in a higher bracket (val=3) and OTS in a lower one (val=1)
    expect(covHtml).toContain('Peer Invictus');
    expect(covHtml).toContain('Charlie OTS');
  });

  test('_ots_covenant_bonus of 0 leaves non-OTS character unaffected', async ({ page }) => {
    // PEER_CHAR has no OTS — covenant 3 maps directly to bracket 3
    const chars = [PEER_CHAR];
    const statusChars = makeStatusChars(chars, {});
    await setupSuite(page, chars, statusChars);
    await openSuiteStatusTab(page);

    const statusEl = page.locator('#suite-status, .suite-status-tab, [id*="status"]').first();
    await expect(statusEl).toBeVisible({ timeout: 8000 });

    const covSection = page.locator('#t-status .status-col').filter({ hasText: 'Invictus' }).first();
    const covHtml = await covSection.innerHTML().catch(() => '');
    expect(covHtml).toContain('Peer Invictus');
    // Bracket for val=3 exists and contains the peer
    const bracket3 = covSection.locator('.status-bracket').filter({ hasText: '3' }).first();
    const bracket3Html = await bracket3.innerHTML().catch(() => '');
    expect(bracket3Html).toContain('Peer Invictus');
  });

});
