// E2E coverage for rlv.7 (#1039 item 2) — persistent per-power modifier
// chips on the Roll tab. A player adds a free-text label+value modifier to
// whatever pool is loaded; it renders as a toggleable chip (reusing
// .effpool-spec styling), persists per (character, power/pool label) in
// localStorage, and restores its last on/off state next time that same
// power is loaded for that same character. See
// specs/stories/rlv-7-persistent-per-power-mod-chips.md for the full spec.
//
// House style follows tests/rlv-4-custom-pool-builder.spec.js exactly:
// serviceWorkers blocked (this app's Service Worker intercepts
// /api/characters ahead of Playwright's own page.route() stubs and can
// serve stale real data — see memory/project-sw-leaks-live-data-in-
// playwright-tests.md), local-test-token auth bypass, window.pickChar(c)
// direct character injection instead of the real API-backed character-list
// flow.

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

// ── Source-fetch smokes ──────────────────────────────────────────────────

test('rlv.7 — power-mod-chips.js exports the expected pure functions', async ({ request }) => {
  const res = await request.get('/js/game/power-mod-chips.js');
  const src = await res.text();
  expect(src).toMatch(/export\s+function\s+clampChipValue\b/);
  expect(src).toMatch(/export\s+function\s+loadChips\b/);
  expect(src).toMatch(/export\s+function\s+addChip\b/);
  expect(src).toMatch(/export\s+function\s+toggleChip\b/);
  expect(src).toMatch(/export\s+function\s+removeChip\b/);
});

test('rlv.7 — roll-v2.js exports addPowerChip/togPowerChip/removePowerChip', async ({ request }) => {
  const res = await request.get('/js/suite/roll-v2.js');
  const src = await res.text();
  expect(src).toMatch(/export\s+function\s+addPowerChip\b/);
  expect(src).toMatch(/export\s+function\s+togPowerChip\b/);
  expect(src).toMatch(/export\s+function\s+removePowerChip\b/);
});

test('rlv.7 — index.html has the static add-mod row inside the breakdown disclosure', async ({ request }) => {
  const res = await request.get('/');
  const src = await res.text();
  expect(src).toMatch(/id="rv2-addmod-row"/);
  expect(src).toMatch(/id="pmc-label"/);
  expect(src).toMatch(/id="pmc-value"/);
});

// ── Live boot flow — no OAuth needed (local-test-token bypass) ──────────

const ST_USER = {
  id: '900000005', username: 'test_st_rlv7', global_name: 'Test ST rlv7',
  avatar: null, role: 'st', player_id: 'p-rlv7', character_ids: [], is_dual_role: false,
};

function attrs(overrides = {}) {
  return {
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 3, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    ...overrides,
  };
}

// Two non-zero skills (Occult, Larceny) so cross-power isolation (AC8) can
// be proven by loading two different real pools on the same character.
const CHIP_CHAR = {
  _id: 'char-rlv7-chip', name: 'Chip Tester', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: attrs(),
  skills: {
    Occult: { dots: 3, bonus: 0, specs: [], nine_again: false },
    Larceny: { dots: 2, bonus: 0, specs: [], nine_again: false },
  },
  disciplines: {}, merits: [], powers: [], ordeals: [],
};

// A second, distinct character for the character-switch regression test —
// deliberately has no Occult (or any of CHIP_CHAR's skills) so a stray
// stale pool tile match is impossible.
const OTHER_CHAR = {
  _id: 'char-rlv7-other', name: 'Switch Target', moniker: null, honorific: null,
  clan: 'Ventrue', covenant: 'Carthian Movement', player: 'Test Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: attrs(),
  skills: { Politics: { dots: 2, bonus: 0, specs: [], nine_again: false } },
  disciplines: {}, merits: [], powers: [], ordeals: [],
};

async function setupSuite(page, chars) {
  await page.addInitScript((user) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, ST_USER);

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

async function loadSkillPool(page, skillName) {
  await page.locator('#roll-char-pools .gcp-pool-btn', { hasText: skillName }).click();
  // The add-mod row lives inside <details class="rv2-breakdown"> (collapsed
  // by default) alongside #effline — open it so #pmc-label/#pmc-value are
  // actually visible/fillable, matching what a real player has to do.
  const details = page.locator('.rv2-breakdown');
  if (!(await details.evaluate(el => el.open))) {
    await details.locator('summary').click();
  }
}

test('rlv.7 — Occult 3 + Intelligence 3 loads as 6 dice, no chips yet', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await expect(page.locator('#rv2-eff')).toHaveText('6');
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toHaveCount(0);
});

test('rlv.7 — adding a chip via the add-mod row renders it on and bumps the effective pool', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await expect(page.locator('#rv2-eff')).toHaveText('6');

  await page.locator('#pmc-label').fill('Air of Menace');
  await page.locator('#pmc-value').fill('2');
  await page.locator('.rv2-addmod-btn').click();

  const chip = page.locator('#effline .effpool-spec[data-chip]');
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveClass(/\bon\b/);
  await expect(chip).toContainText('Air of Menace');
  await expect(chip).toContainText('+2');
  await expect(page.locator('#rv2-eff')).toHaveText('8');

  // Inputs cleared after a successful add.
  await expect(page.locator('#pmc-label')).toHaveValue('');
  await expect(page.locator('#pmc-value')).toHaveValue('');
});

test('rlv.7 — toggling a chip off/on reduces/restores the effective pool', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await page.locator('#pmc-label').fill('Air of Menace');
  await page.locator('#pmc-value').fill('2');
  await page.locator('.rv2-addmod-btn').click();
  await expect(page.locator('#rv2-eff')).toHaveText('8');

  const chip = page.locator('#effline .effpool-spec[data-chip]');
  // Click near the chip's own label text, not the trailing "×" delete affordance.
  await chip.click({ position: { x: 8, y: 8 } });
  await expect(chip).not.toHaveClass(/\bon\b/);
  await expect(page.locator('#rv2-eff')).toHaveText('6');

  await chip.click({ position: { x: 8, y: 8 } });
  await expect(chip).toHaveClass(/\bon\b/);
  await expect(page.locator('#rv2-eff')).toHaveText('8');
});

test('rlv.7 — a chip persists across reload with its last-known ON state (AC7)', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await page.locator('#pmc-label').fill('Air of Menace');
  await page.locator('#pmc-value').fill('2');
  await page.locator('.rv2-addmod-btn').click();
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toHaveClass(/\bon\b/);

  await page.reload();
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => window.goTab('roll'));
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');

  const chip = page.locator('#effline .effpool-spec[data-chip]');
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveClass(/\bon\b/);
  await expect(chip).toContainText('Air of Menace');
  await expect(page.locator('#rv2-eff')).toHaveText('8');
});

test('rlv.7 — a chip persists across reload with its last-known OFF state (AC7)', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await page.locator('#pmc-label').fill('Bane Weakness');
  await page.locator('#pmc-value').fill('-2');
  await page.locator('.rv2-addmod-btn').click();
  const chip = page.locator('#effline .effpool-spec[data-chip]');
  await chip.click({ position: { x: 8, y: 8 } }); // toggle off
  await expect(chip).not.toHaveClass(/\bon\b/);

  await page.reload();
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => window.goTab('roll'));
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');

  const reloadedChip = page.locator('#effline .effpool-spec[data-chip]');
  await expect(reloadedChip).toHaveCount(1);
  await expect(reloadedChip).not.toHaveClass(/\bon\b/);
  await expect(page.locator('#rv2-eff')).toHaveText('6'); // off chip contributes nothing
});

test('rlv.7 — removing a chip via "×" drops it permanently (AC5)', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await page.locator('#pmc-label').fill('Temporary Mod');
  await page.locator('#pmc-value').fill('1');
  await page.locator('.rv2-addmod-btn').click();
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toHaveCount(1);

  await page.locator('#effline .effpool-spec-del').click();
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toHaveCount(0);
  await expect(page.locator('#rv2-eff')).toHaveText('6');

  await page.reload();
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => window.goTab('roll'));
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toHaveCount(0);
});

test('rlv.7 — a different pool on the same character shows no chips (AC8, per-power key)', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await page.locator('#pmc-label').fill('Occult-only chip');
  await page.locator('#pmc-value').fill('2');
  await page.locator('.rv2-addmod-btn').click();
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toHaveCount(1);

  await loadSkillPool(page, 'Larceny');
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toHaveCount(0);

  // Switching back to Occult still shows its own chip — proves the switch
  // above didn't clobber Occult's stored chips, only changed the view.
  await loadSkillPool(page, 'Occult');
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toHaveCount(1);
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toContainText('Occult-only chip');
});

test('rlv.7 — a value above +10 is clamped to +10 once added (AC9)', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');

  await page.locator('#pmc-label').fill('Absurd Bonus');
  await page.locator('#pmc-value').fill('99');
  await page.locator('.rv2-addmod-btn').click();

  const chip = page.locator('#effline .effpool-spec[data-chip]');
  await expect(chip).toContainText('+10');
  await expect(chip).not.toContainText('+99');
  await expect(page.locator('#rv2-eff')).toHaveText('16'); // 6 base + 10 clamped
});

// ── Review fix regression (Pass 2/3b): combat quick-rolls must not hide
// a persisted chip. combat-tab.js's quickRoll() calls exactly
// loadPool(pool, label, { total: pool }) — a pi with no .attr at all.
// updPool() used to `return` before the chip-rendering block for any pool
// with no .attr, so a chip's value was already folded into the roll
// (loadPool() itself doesn't gate on .attr) but never rendered — a hidden
// dice modifier the ST could not see, toggle, or remove.
test('rlv.7 — a persisted chip stays visible on a combat-quick-roll-shaped pool with no .attr (review fix)', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await page.locator('#pmc-label').fill('Combat Mod');
  await page.locator('#pmc-value').fill('2');
  await page.locator('.rv2-addmod-btn').click();
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toHaveCount(1);

  // Simulate combat-tab.js's quickRoll() exactly: loadPool(pool, label,
  // { total: pool }) — same power name ("Occult"), no .attr on the pi.
  await page.evaluate(() => window.loadPool(5, 'Occult', { total: 5 }));

  const chip = page.locator('#effline .effpool-spec[data-chip]');
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveClass(/\bon\b/);
  await expect(chip).toContainText('Combat Mod');
  await expect(page.locator('#rv2-eff')).toHaveText('7'); // 5 base + 2 chip

  // The add-mod row must also stay live (enabled), not stuck from before.
  await expect(page.locator('#pmc-label')).toBeEnabled();
});

// ── Review fix regression (Pass 2/3a/3b): switching character must clear
// the previous character's stale pool/chip state, not leave it live under
// the new character. Without this, a stale chip badge stays clickable and
// (since togPowerChip/removePowerChip read state.rollChar fresh) a click
// would persist the OLD character's chip data into the NEW character's own
// localStorage slot for a pool the new character never loaded — a real
// cross-character data leak, reproduced live during the Codex review.
test('rlv.7 — switching character clears the previous character\'s pool/chips (review fix, AC1)', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR, OTHER_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await page.locator('#pmc-label').fill('Air of Menace');
  await page.locator('#pmc-value').fill('2');
  await page.locator('.rv2-addmod-btn').click();
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toHaveCount(1);
  await expect(page.locator('#rv2-eff')).toHaveText('8');

  // Switch to a different character WITHOUT loading a pool for them.
  await pickCharacter(page, OTHER_CHAR);

  // No stale chip badge, no stale effective-pool number, add row disabled.
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toHaveCount(0);
  await expect(page.locator('#rv2-eff')).not.toHaveText('8');
  await expect(page.locator('#pmc-label')).toBeDisabled();

  // Loading a pool for the NEW character shows no chips — proves the old
  // character's chip was never silently carried over/persisted onto B.
  await loadSkillPool(page, 'Politics');
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toHaveCount(0);
});
