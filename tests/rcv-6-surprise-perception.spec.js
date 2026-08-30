// E2E coverage for rcv.6 — the "Surprise / Perception" Vampire Mechanics tile:
// a second VM_IMMEDIATE entry in char-pools.js (alongside Frenzy Resistance),
// rolling straight away with no panel, and wiring `resistance: 'v Dexterity +
// Stealth'` into the EXISTING resist-target system (shared/resist.js's
// parseResistance()/getResistTokenVal()) rather than any new code.
//
// Placed in its own spec, matching rcv.5's own precedent, since this exercises
// a different concern (the resist-target dropdown) than rcv-3a's own
// Rules-explanation-box file.
//
// Character injection: this app registers a Service Worker (public/sw.js) that
// intercepts /api/characters ahead of Playwright's page.route() stubs and
// serves real cached data (diagnosed during rlv.4). `serviceWorkers: 'block'`
// plus injecting the fixture through the real, exposed `window.pickChar(c)`
// global sidesteps it entirely — same harness as every other rcv spec.

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

const ST_USER = {
  id: '900000016', username: 'test_st_rcv6', global_name: 'Test ST rcv6',
  avatar: null, role: 'st', player_id: 'p-rcv6', character_ids: [], is_dual_role: false,
};

const SP_CHAR = {
  _id: 'char-rcv6-sp', name: 'SP Tester', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: {
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 3, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

// The opposing character whose Dexterity + Stealth the resist-target dropdown
// should compute. Distinct dot values from anything on SP_CHAR so a passing
// assertion cannot be a coincidence.
const ATTACKER = {
  _id: 'char-rcv6-attacker', name: 'SP Attacker', moniker: null, honorific: null,
  clan: 'Nosferatu', covenant: 'Circle of the Crone', player: 'Test Player Two',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: {
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 4, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Stealth: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: {}, merits: [], powers: [], ordeals: [],
};

const SPECIAL_SEC = '#roll-char-pools .gcp-acc-section[data-storage-key="tm_pools_open_special"]';

const BOX  = '#rules-summary-box';
const HEAD = '#rules-summary-box .rules-summary-head';
const BODY = '#rules-summary-body';

// The exact ported copy, split on the same '\n\n' updRulesSummary() splits on.
const SP_P1 = "A character who does not realise they are about to be on the receiving end of violence rolls Wits + Composure to notice the ambush, contested by the attacker's Dexterity + Stealth. Pick the attacking character from the Resistance section below to compute their pool.";
const SP_P2 = 'Failure: your character cannot take an action in the first turn of combat, and cannot apply Defence that turn. Initiative for the second turn is determined as normal.';

async function setupSuite(page, chars) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
    localStorage.setItem('tm_rules_db', JSON.stringify([]));
  }, { user: ST_USER });

  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(/\/api\/game_sessions\/next/, r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chars) }));

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => window.goTab('roll'));
  await page.waitForSelector('#t-roll.active', { state: 'visible', timeout: 5000 });
}

async function pickCharacter(page, char) {
  await page.evaluate((c) => window.pickChar(c), char);
  await expect(page.locator('#roll-char-pools')).toBeVisible({ timeout: 5000 });
}

/**
 * Make a fixture character selectable as a resist target — same technique
 * established in tests/rcv-3a-rules-explanation-box.spec.js's own
 * addResistTarget() for Clash of Wills, reused verbatim here: dev-fixtures.js
 * intercepts window.fetch for /api/characters (a sibling of the Service
 * Worker problem this file's own header names), so the roster is extended the
 * same way app.js's own boot step 2b does — through the real suite/data.js
 * module, not by assigning RESIST_CHAR directly.
 */
async function addResistTarget(page, char) {
  await page.evaluate(async (c) => {
    const st = (await import('/js/suite/data.js')).default;
    if (!st.chars.some(x => x.name === c.name)) st.chars.push(c);
    window._charNames = st.chars.map(x => x.name);
    window._charDisplayMap = { ...(window._charDisplayMap || {}), [c.name]: c.name };
  }, char);
}

async function openSpecialAccordion(page) {
  const sec = page.locator(SPECIAL_SEC);
  if (await sec.getAttribute('data-open') !== 'true') {
    await page.locator(SPECIAL_SEC + ' .gcp-acc-head').click();
  }
}

// ── Source-fetch smoke ───────────────────────────────────────────────────

test('rcv.6 — char-pools.js carries the second VM_IMMEDIATE entry with resistance/effect/action', async ({ request }) => {
  const src = await (await request.get('/js/game/char-pools.js')).text();
  const immBlock = src.slice(src.indexOf('const VM_IMMEDIATE = ['), src.indexOf('for (const m of VM_IMMEDIATE)'));
  expect(immBlock).toContain('Surprise / Perception');
  expect(immBlock).toContain("resistance: 'v Dexterity + Stealth'");
  // AC2: additive only — Frenzy Resistance's own entry carries neither field.
  const frenzyLine = immBlock.split('\n').find(l => l.includes('Frenzy Resistance'));
  expect(frenzyLine).not.toContain('resistance');
  expect(frenzyLine).not.toContain('effect');
});

// ── AC1/AC3: an immediate roll, no panel ─────────────────────────────────

test('rcv.6 — the tile appears in the Special accordion and rolls immediately, no panel', async ({ page }) => {
  await setupSuite(page, [SP_CHAR]);
  await pickCharacter(page, SP_CHAR);
  await openSpecialAccordion(page);

  const tile = page.locator(SPECIAL_SEC + ' .gcp-pool-btn', { hasText: 'Surprise / Perception' });
  await expect(tile).toBeVisible();
  // Not a {opensPanel} choice tile — no "tap to choose" subtitle, no
  // gcp-choice class (the four VM_CHOICE tiles all carry it).
  await expect(tile).not.toHaveClass(/gcp-choice/);
  await expect(tile).not.toContainText('tap to choose');

  // Wits 3 + Composure 3 = 6, and it loads straight away.
  await tile.click();
  await expect(page.locator('#panel-overlay')).not.toHaveClass(/\bon\b/);
  await expect(page.locator('#pool-banner')).toContainText('Surprise / Perception');
  await expect(page.locator('#rv2-eff')).toHaveText('6');
});

// ── AC6: Frenzy Resistance is unaffected ─────────────────────────────────

test('rcv.6 — Frenzy Resistance keeps its own unchanged shape (no resistance, no Rules box)', async ({ page }) => {
  await setupSuite(page, [SP_CHAR]);
  await pickCharacter(page, SP_CHAR);
  await openSpecialAccordion(page);

  await page.locator(SPECIAL_SEC + ' .gcp-pool-btn', { hasText: 'Frenzy Resistance' }).click();
  await expect(page.locator('#pool-banner')).toContainText('Frenzy Resistance');
  // No resist section (no resistance string on this tile, same as before rcv.6).
  await expect(page.locator('#resist-sec')).toBeHidden();
  // No Rules-explanation box (no effect/action on this tile, rcv.1's own
  // deliberate "no replacement note yet" scope, unchanged by this story).
  await expect(page.locator(BOX)).toBeHidden();
});

// ── AC4: the resist-target dropdown, using the real Dexterity+Stealth math ──

test('rcv.6 — the resist-target dropdown computes the real attacker Dexterity + Stealth pool', async ({ page }) => {
  await setupSuite(page, [SP_CHAR, ATTACKER]);
  await pickCharacter(page, SP_CHAR);
  await addResistTarget(page, ATTACKER);
  await openSpecialAccordion(page);

  await page.locator(SPECIAL_SEC + ' .gcp-pool-btn', { hasText: 'Surprise / Perception' }).click();
  await expect(page.locator('#pool-banner')).toContainText('Surprise / Perception');

  await expect(page.locator('#resist-sec')).toBeVisible();
  await page.selectOption('#resist-sel', ATTACKER.name);
  // Dexterity 4 + Stealth 3 = 7 — the same parseResistance()/getResistTokenVal()
  // machinery Clash of Wills already exercises live, unmodified by this story.
  await expect(page.locator('#resist-line')).toContainText('7');
  await expect(page.locator('#resist-line')).toContainText('dice');
});

// ── AC5: the Rules-explanation box ───────────────────────────────────────

test('rcv.6 — the Rules box shows the ported copy as two separate paragraphs, no expander', async ({ page }) => {
  await setupSuite(page, [SP_CHAR]);
  await pickCharacter(page, SP_CHAR);
  await openSpecialAccordion(page);

  await page.locator(SPECIAL_SEC + ' .gcp-pool-btn', { hasText: 'Surprise / Perception' }).click();
  await expect(page.locator(BOX)).toBeVisible();

  await page.locator(HEAD).click();
  const paras = page.locator(BODY + ' .power-desc');
  await expect(paras).toHaveCount(2);
  await expect(paras.nth(0)).toHaveText(SP_P1);
  await expect(paras.nth(1)).toHaveText(SP_P2);
  await expect(page.locator(BODY + ' .power-meta span')).toHaveText(['Instant action']);
  // No purchasable_powers doc backs this mechanic — no rules_text, no expander.
  await expect(page.locator(BODY + ' .rules-expander')).toHaveCount(0);
});
