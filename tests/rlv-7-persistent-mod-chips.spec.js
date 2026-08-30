// E2E coverage for rlv.7 (#1039 item 2) — persistent per-power modifier
// chips on the Roll tab. A player adds a free-text label+value modifier to
// whatever pool is loaded; it renders as a toggleable chip (reusing
// .effpool-spec styling), persists per (character, power/pool label) in
// localStorage, and restores its last on/off state next time that same
// power is loaded for that same character. See
// specs/stories/rlv-7-persistent-per-power-mod-chips.md for the full spec.
//
// rcv.4 (specs/stories/rcv-4-surface-mod-chips.md) relocated the rendered
// chips and the add-mod row OUT of the collapsed <details class="rv2-breakdown">
// disclosure into an always-visible #rv2-mods-wrap section sitting between the
// breakdown and the Roll button. The chip logic itself (power-mod-chips.js,
// the storage key, add/toggle/remove) is untouched, so every behavioural
// assertion below is rlv.7's original one — only the container selector moved
// (#effline -> #rv2-power-chips), plus the rcv.4 placement tests at the foot
// of this file.
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

// rcv.4 renamed this from "...inside the breakdown disclosure" — the add-mod
// row is the same static markup with the same ids, it just no longer lives
// inside <details class="rv2-breakdown">.
test('rlv.7 — index.html has the static add-mod row (rcv.4: now in #rv2-mods-wrap)', async ({ request }) => {
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

// rcv.4: this used to have to open <details class="rv2-breakdown"> before the
// add-mod row was fillable, because #rv2-addmod-row lived inside that
// collapsed disclosure. It no longer does — the mods section is always
// visible, so every test below now exercises the real player path with the
// breakdown left CLOSED. That the whole helper works with no disclosure
// interaction at all is itself the load-bearing part of this story.
// The Skills accordion. rcv.2 (Epic RCV) replaced gdx-11 AC9's single "Pools"
// collapse toggle with three independent accordions (Skills / Disciplines /
// Special), all collapsed by default — so a skill pool button is no longer
// clickable until its own section is expanded. rcv.2 updated
// tests/rlv-4-custom-pool-builder.spec.js for that change but not this file,
// leaving every test here timing out on an intercepted click. Fixed here.
const SKILLS_SEC = '#roll-char-pools .gcp-acc-section[data-storage-key="tm_pools_open_skills"]';

async function loadSkillPool(page, skillName) {
  const skills = page.locator(SKILLS_SEC);
  if ((await skills.getAttribute('data-open')) !== 'true') {
    await skills.locator('.gcp-acc-head').click();
    await expect(skills).toHaveAttribute('data-open', 'true');
  }
  await page.locator('#roll-char-pools .gcp-pool-btn', { hasText: skillName }).click();
  await expect(page.locator('#pmc-label')).toBeVisible();
}

test('rlv.7 — Occult 3 + Intelligence 3 loads as 6 dice, no chips yet', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await expect(page.locator('#rv2-eff')).toHaveText('6');
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveCount(0);
});

test('rlv.7 — adding a chip via the add-mod row renders it on and bumps the effective pool', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await expect(page.locator('#rv2-eff')).toHaveText('6');

  await page.locator('#pmc-label').fill('Air of Menace');
  await page.locator('#pmc-value').fill('2');
  await page.locator('.rv2-addmod-btn').click();

  const chip = page.locator('#rv2-power-chips .effpool-spec[data-chip]');
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

  const chip = page.locator('#rv2-power-chips .effpool-spec[data-chip]');
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
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveClass(/\bon\b/);

  await page.reload();
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => window.goTab('roll'));
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');

  const chip = page.locator('#rv2-power-chips .effpool-spec[data-chip]');
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
  const chip = page.locator('#rv2-power-chips .effpool-spec[data-chip]');
  await chip.click({ position: { x: 8, y: 8 } }); // toggle off
  await expect(chip).not.toHaveClass(/\bon\b/);

  await page.reload();
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => window.goTab('roll'));
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');

  const reloadedChip = page.locator('#rv2-power-chips .effpool-spec[data-chip]');
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
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveCount(1);

  // dispatchEvent, not click(): gdx-3's 44px touch-target overlay
  // (`.effpool-spec::after`, suite.css:3190/3239-3248 — position:absolute,
  // centred, min-width/height:var(--tap-min), no pointer-events:none by
  // design) covers the whole chip INCLUDING this "×" child, so a real
  // pointer click at the ×'s centre lands on the parent chip's own
  // togPowerChip handler instead of removePowerChip.
  //
  // Measured, not assumed, and PRE-EXISTING — not caused by rcv.4's
  // re-parent: document.elementFromPoint at the ×'s centre returns the
  // parent `.effpool-spec` identically whether the chip renders in
  // #effline (rlv.7's old home) or in #rv2-power-chips (rcv.4's new one).
  // The overlay is anchored to the chip itself, so it is container-
  // independent. The underlying "the × is not pointer-reachable" defect is
  // real but belongs to gdx-3's touch-target work, and fixing it needs CSS,
  // which rcv.4 explicitly does not touch. Flagged for its own story.
  await page.locator('#rv2-power-chips .effpool-spec-del').dispatchEvent('click');
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveCount(0);
  await expect(page.locator('#rv2-eff')).toHaveText('6');

  await page.reload();
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => window.goTab('roll'));
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveCount(0);
});

test('rlv.7 — a different pool on the same character shows no chips (AC8, per-power key)', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await page.locator('#pmc-label').fill('Occult-only chip');
  await page.locator('#pmc-value').fill('2');
  await page.locator('.rv2-addmod-btn').click();
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveCount(1);

  await loadSkillPool(page, 'Larceny');
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveCount(0);

  // Switching back to Occult still shows its own chip — proves the switch
  // above didn't clobber Occult's stored chips, only changed the view.
  await loadSkillPool(page, 'Occult');
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveCount(1);
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toContainText('Occult-only chip');
});

test('rlv.7 — a value above +10 is clamped to +10 once added (AC9)', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');

  await page.locator('#pmc-label').fill('Absurd Bonus');
  await page.locator('#pmc-value').fill('99');
  await page.locator('.rv2-addmod-btn').click();

  const chip = page.locator('#rv2-power-chips .effpool-spec[data-chip]');
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
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveCount(1);

  // Simulate combat-tab.js's quickRoll() exactly: loadPool(pool, label,
  // { total: pool }) — same power name ("Occult"), no .attr on the pi.
  await page.evaluate(() => window.loadPool(5, 'Occult', { total: 5 }));

  const chip = page.locator('#rv2-power-chips .effpool-spec[data-chip]');
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
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveCount(1);
  await expect(page.locator('#rv2-eff')).toHaveText('8');

  // Switch to a different character WITHOUT loading a pool for them.
  await pickCharacter(page, OTHER_CHAR);

  // No stale chip badge, no stale effective-pool number, add row disabled.
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveCount(0);
  await expect(page.locator('#rv2-eff')).not.toHaveText('8');
  await expect(page.locator('#pmc-label')).toBeDisabled();

  // Loading a pool for the NEW character shows no chips — proves the old
  // character's chip was never silently carried over/persisted onto B.
  await loadSkillPool(page, 'Politics');
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveCount(0);
});

// ══ rcv.4 — placement: the mods section is always visible ═════════════════
//
// rlv.7's chips were real and working but rendered as the last thing inside
// #effline, which lives inside a collapsed "Pool breakdown" disclosure. A
// player had no reason to open a dice-math panel to find a modifier they had
// themselves turned on. rcv.4 re-parents the chips and the add-mod row into
// #rv2-mods-wrap, a static always-visible section between the breakdown and
// the Roll button. These tests assert PLACEMENT; the behavioural assertions
// above (add/toggle/persist/remove/clamp/isolation) are unchanged rlv.7.

// A character with a specialty on Occult, so the "#effline still renders its
// own attr/skill/SPEC segments" regression guard has a real spec chip to find.
const SPEC_CHAR = {
  ...CHIP_CHAR,
  _id: 'char-rcv4-spec', name: 'Spec Tester',
  skills: {
    Occult: { dots: 3, bonus: 0, specs: ['Rituals'], nine_again: false },
    Larceny: { dots: 2, bonus: 0, specs: [], nine_again: false },
  },
};

/** The disclosure must be genuinely shut for these assertions to mean
 *  anything — a <details> that happened to be open would make "the chip is
 *  visible" trivially true and prove nothing about the re-parent. */
async function expectBreakdownClosed(page) {
  await expect(page.locator('.rv2-breakdown')).not.toHaveAttribute('open', /.*/);
}

test('rcv.4 — a chip is visible and toggleable with the Pool breakdown still closed (AC1, AC3)', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await expectBreakdownClosed(page);

  await page.locator('#pmc-label').fill('Air of Menace');
  await page.locator('#pmc-value').fill('2');
  await page.locator('.rv2-addmod-btn').click();

  // Visible — not merely present in the DOM — while the disclosure is shut.
  const chip = page.locator('#rv2-power-chips .effpool-spec[data-chip]');
  await expect(chip).toBeVisible();
  await expect(chip).toHaveClass(/\bon\b/);
  await expect(page.locator('#rv2-eff')).toHaveText('8');
  await expectBreakdownClosed(page);

  // And fully interactive from there: toggle off, toggle back on.
  await chip.click({ position: { x: 8, y: 8 } });
  await expect(chip).not.toHaveClass(/\bon\b/);
  await expect(page.locator('#rv2-eff')).toHaveText('6');
  await chip.click({ position: { x: 8, y: 8 } });
  await expect(chip).toHaveClass(/\bon\b/);
  await expect(page.locator('#rv2-eff')).toHaveText('8');
  await expectBreakdownClosed(page);
});

test('rcv.4 — the add-mod row is reachable without opening the Pool breakdown (AC1, AC4)', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);
  await loadSkillPool(page, 'Occult');
  await expectBreakdownClosed(page);

  // The whole row and all three controls, visible with the disclosure shut.
  await expect(page.locator('#rv2-addmod-row')).toBeVisible();
  await expect(page.locator('#pmc-label')).toBeVisible();
  await expect(page.locator('#pmc-value')).toBeVisible();
  await expect(page.locator('#pmc-add-btn')).toBeVisible();

  // AC4: the enabled/disabled painting still runs off the id lookup, which
  // is independent of the element's new DOM position.
  await expect(page.locator('#pmc-label')).toBeEnabled();
  await expect(page.locator('#pmc-add-btn')).toBeEnabled();

  // It lives in the new wrap, not inside the disclosure any more.
  await expect(page.locator('#rv2-mods-wrap #rv2-addmod-row')).toHaveCount(1);
  await expect(page.locator('.rv2-breakdown #rv2-addmod-row')).toHaveCount(0);
  await expect(page.locator('.rv2-breakdown #rv2-power-chips')).toHaveCount(0);
});

test('rcv.4 — #effline keeps its attr/skill/spec breakdown and gains no duplicate chip (AC2, AC6)', async ({ page }) => {
  await setupSuite(page, [SPEC_CHAR]);
  await pickCharacter(page, SPEC_CHAR);
  await loadSkillPool(page, 'Occult');

  await page.locator('#pmc-label').fill('Air of Menace');
  await page.locator('#pmc-value').fill('2');
  await page.locator('.rv2-addmod-btn').click();
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveCount(1);

  // Open the disclosure by hand — the breakdown itself is unchanged.
  await page.locator('.rv2-breakdown summary').click();
  await expect(page.locator('.rv2-breakdown')).toHaveAttribute('open', /.*/);

  const effline = page.locator('#effline');
  await expect(effline).toBeVisible();
  await expect(effline).toContainText('Intelligence');
  await expect(effline).toContainText('Occult');
  // Skill specialty chips still render inside #effline, untouched by Task 2.
  await expect(page.locator('#effline .effpool-spec[data-spec="Rituals"]')).toHaveCount(1);

  // The chips render in exactly ONE place: the new wrap, never both.
  await expect(page.locator('#effline .effpool-spec[data-chip]')).toHaveCount(0);
  await expect(page.locator('.effpool-spec[data-chip]')).toHaveCount(1);
});

// ── Storage-key regression class (rcv.4 AC5, Sally/Dana's party-mode flag) ──
//
// The key is `tm-rlv7-chips-${encodeURIComponent(charId)}|${encodeURIComponent(
// powerName)}` (power-mod-chips.js:23-25). The `|` separator was chosen over
// the original `-` precisely because encodeURIComponent escapes it (to %7C),
// so it can never appear literally inside either encoded component.
//
// Is a `|` in a real power name actually reachable? Yes, in principle:
// server/schemas/purchasable_power.schema.js:78 declares `name` as
// `{ type: 'string', minLength: 1 }` with no pattern/enum/charset constraint,
// and every POOL_NAME either is a hardcoded literal, a fixed JS constant, or
// exactly that DB field (roll-v2.js:316 is the sole setter). No player-typed
// free text reaches it — the Custom Pool builder composes its label from
// chip-selected ALL_ATTRS/ALL_SKILLS/owned-disciplines values, not an input —
// but an ST authoring a power in TM Admin could type one, so this is a real
// (if unlikely) case rather than an unreachable one, and is worth asserting.
//
// rcv.4 does not touch the key format (AC5); this is a guard that it stayed
// untouched, not a test of new behaviour.
test('rcv.4 — a power name containing "|" still gets its own independent storage entry (AC5)', async ({ page }) => {
  await setupSuite(page, [CHIP_CHAR]);
  await pickCharacter(page, CHIP_CHAR);

  // Two pool names that a naive, non-encoding `|` split would conflate.
  await page.evaluate(() => window.loadPool(5, 'Obfuscate|Touch of Shadow', { total: 5 }));
  await page.locator('#pmc-label').fill('Piped Pool Mod');
  await page.locator('#pmc-value').fill('2');
  await page.locator('.rv2-addmod-btn').click();
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toContainText('Piped Pool Mod');

  await page.evaluate(() => window.loadPool(5, 'Obfuscate', { total: 5 }));
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toHaveCount(0);
  await page.locator('#pmc-label').fill('Plain Pool Mod');
  await page.locator('#pmc-value').fill('3');
  await page.locator('.rv2-addmod-btn').click();
  await expect(page.locator('#rv2-power-chips .effpool-spec[data-chip]')).toContainText('Plain Pool Mod');

  // Back to the piped pool: its own chip, unclobbered by the plain one.
  await page.evaluate(() => window.loadPool(5, 'Obfuscate|Touch of Shadow', { total: 5 }));
  const piped = page.locator('#rv2-power-chips .effpool-spec[data-chip]');
  await expect(piped).toHaveCount(1);
  await expect(piped).toContainText('Piped Pool Mod');
  await expect(piped).not.toContainText('Plain Pool Mod');

  // And at the storage layer: two distinct keys, each with exactly ONE
  // literal `|` — the power name's own pipe is escaped to %7C, so the
  // separator stays unambiguous and the key stays injective.
  const keys = await page.evaluate(() =>
    Object.keys(localStorage).filter(k => k.startsWith('tm-rlv7-chips-')).sort());
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(2);
  for (const k of keys) {
    expect(k.split('|')).toHaveLength(2);
  }
  expect(keys.some(k => k.includes('%7C'))).toBe(true);
});
