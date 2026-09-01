// cmb.3a - the Attack modal: target, type, adjustable pool (Errata-correct).
//
// House style follows tests/cmb-1-combat-card-touch-targets.spec.js and
// tests/cmb-2-drag-reorder.spec.js: Service Workers blocked (this app's sw.js
// intercepts /api/ ahead of page.route() and can serve real production data -
// see memory/project-sw-leaks-live-data-in-playwright-tests.md), every API call
// stubbed, the roster injected straight into suiteState, and initCombatTab()
// driven against our own host rather than through app.js's own nav.
//
// This is the epic's highest fingertip-risk surface (Angelus's own framing), so
// AC10/AC11 are measured against real rendered boxes and real dispatched
// pointer/touch/click sequences, never against DOM presence alone.
//
// WHY THE FIXTURE NUMBERS ARE WHAT THEY ARE - every one of them is chosen so a
// wrong implementation gives a different answer, not the same one:
//
//   Wan (the attacker) has Brawl { dots: 2, bonus: 1 }. skTotal() counts the
//   bonus dot, the retired local skDots() did not, so an Unarmed pool of 6
//   instead of 7 means the accessor regressed rather than the fixture changing.
//
//   Wan has Strength 4 and Dexterity 3, deliberately different, because Thrown
//   Weapons is the one formula the Errata moved off Dexterity. A Thrown pool
//   built on Dexterity is one die short of a Thrown pool built on Strength, so
//   the RAW-from-memory mistake this story warns about cannot pass silently.
//
//   Defence is pinned via `derived.defence` (defenceForDisplay's own first
//   branch) so the target numbers are exact rather than a by-product of the
//   armour/rules-cache path.

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block', hasTouch: true });

const MIN_TAP = 44;

// Wan's own numbers, restated here so the expectations below read as arithmetic
// rather than as magic constants.
const STR = 4, DEX = 3;
const BRAWL = 3;      // 2 dots + 1 bonus dot, via skTotal
const WEAPONRY = 1;
const FIREARMS = 3;
const ATHLETICS = 2;
const REED_DEF = 4;
const COLE_DEF = 6;   // big enough that Melee vs Cole floors at 0, and big
                      // enough that a stray Defence subtraction on Ranged would
                      // be impossible to miss

function attrs(over = {}) {
  const base = {
    Intelligence: 2, Wits: 2, Resolve: 2,
    Strength: STR, Dexterity: DEX, Stamina: 2,
    Presence: 2, Manipulation: 2, Composure: 2,
  };
  const out = {};
  for (const [k, v] of Object.entries({ ...base, ...over })) out[k] = { dots: v, bonus: 0 };
  return out;
}

function skills(over = {}) {
  const base = {
    Brawl: { dots: 2, bonus: 1 },
    Weaponry: { dots: WEAPONRY, bonus: 0 },
    Firearms: { dots: FIREARMS, bonus: 0 },
    Athletics: { dots: ATHLETICS, bonus: 0 },
  };
  const out = {};
  for (const [k, v] of Object.entries({ ...base, ...over })) {
    out[k] = { dots: v.dots, bonus: v.bonus || 0, specs: [], nine_again: false };
  }
  return out;
}

const CHARS = [
  {
    _id: 'cmb3-wan', name: 'Wan Zhu', moniker: 'Wan', blood_potency: 2,
    attributes: attrs(), skills: skills(), merits: [], disciplines: {}, equipment: [],
    derived: { defence: 2 },
  },
  {
    _id: 'cmb3-reed', name: 'Reed', moniker: 'Reed', blood_potency: 1,
    attributes: attrs({ Dexterity: 2 }), skills: skills(), merits: [], disciplines: {}, equipment: [],
    derived: { defence: REED_DEF },
  },
  {
    _id: 'cmb3-cole', name: 'Cole', moniker: 'Cole', blood_potency: 1,
    attributes: attrs({ Dexterity: 1 }), skills: skills(), merits: [], disciplines: {}, equipment: [],
    derived: { defence: COLE_DEF },
  },
];

/** Boot the page, inject the roster, render the Combat tab into our own host. */
async function mountCombat(page) {
  await page.route('**/api/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  await page.goto('/');
  await page.waitForTimeout(1500);   // let app.js's own boot write suiteState.chars once

  const err = await page.evaluate(async (chars) => {
    try {
      const state = (await import('/js/suite/data.js')).default;
      const combat = await import('/js/game/combat-tab.js');
      sessionStorage.removeItem('tm_combat_scene');
      state.chars = chars;
      const host = document.createElement('div');
      host.id = 'cmb3-host';
      document.body.appendChild(host);
      window.__cmb3 = { state, chars };
      // Record navigation instead of performing it: the Roll hand-off is what
      // we assert on, and letting the real tab swap run would tear the Combat
      // tab's own host out from under the rest of the test.
      window.__nav = [];
      window.goTab = t => { window.__nav.push(t); };
      combat.initCombatTab(host);
      return null;
    } catch (e) {
      return String(e && e.stack || e);
    }
  }, CHARS);
  expect(err, 'the Combat tab failed to render in the browser').toBeNull();
}

/** Park all three and roll initiative, leaving the round view on screen. */
async function rollScene(page) {
  await page.evaluate(() => {
    window.__cmb3.state.chars = window.__cmb3.chars;   // boot must not win a late race
    window.combatAddChar('cmb3-wan');
    window.combatAddChar('cmb3-reed');
    window.combatAddChar('cmb3-cole');
    window.combatStart();
    window.combatRollInit();
  });
  await expect(page.locator('.cbt-card')).toHaveCount(3);
}

/** Expand Wan's card. Cards render in rolled-initiative order, so find by id. */
async function expandWan(page) {
  await page.locator('[data-cbt-card="cmb3-wan"] .cbt-card-hd').click();
  await expect(page.locator('[data-cbt-card="cmb3-wan"] .cbt-card-exp')).toHaveCount(1);
}

/** The full real sequence an ST performs to get the modal on screen. */
async function openModal(page) {
  await mountCombat(page);
  await rollScene(page);
  await expandWan(page);
  await page.locator('[data-cbt-attack="cmb3-wan"]').click();
  await expect(page.locator('.cbt-atk-overlay')).toBeVisible();
}

const poolOf = page => page.locator('[data-cbt-atk-pool]');
const typeRow = (page, key) => page.locator(`[data-cbt-atk-type="${key}"]`);
const targetPill = (page, id) => page.locator(`[data-cbt-atk-target="${id}"]`);

/** The stepper's current value as a number, with the trailing "d" stripped. */
async function poolValue(page) {
  const txt = await poolOf(page).innerText();
  return Number(String(txt).replace(/[^0-9-]/g, ''));
}

async function boxes(page, selector) {
  return page.$$eval(selector, els => els.map(el => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 };
  }));
}

async function expectAllTappable(page, selector, label) {
  const measured = await boxes(page, selector);
  expect(measured.length, `${label} (${selector}) rendered nothing to measure`).toBeGreaterThan(0);
  for (const box of measured) {
    expect(box.w, `${label} (${selector}) is ${box.w}px wide`).toBeGreaterThanOrEqual(MIN_TAP);
    expect(box.h, `${label} (${selector}) is ${box.h}px tall`).toBeGreaterThanOrEqual(MIN_TAP);
  }
}

// ── AC1 - the Attack button replaces the preset pool buttons ─────────────────

test('cmb.3a AC1 - the expanded card offers one Attack button and no preset pool buttons', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  await expandWan(page);

  await expect(page.locator('.cbt-pool-btn')).toHaveCount(0);
  await expect(page.locator('.cbt-pool-row')).toHaveCount(0);
  await expect(page.locator('[data-cbt-attack="cmb3-wan"]')).toHaveCount(1);
  await expect(page.locator('[data-cbt-attack="cmb3-wan"]')).toHaveText('Attack');
});

test('cmb.3a AC1 - tapping Attack opens the modal', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  await expandWan(page);
  await expect(page.locator('.cbt-atk-overlay')).toHaveCount(0);

  await page.locator('[data-cbt-attack="cmb3-wan"]').click();
  await expect(page.locator('.cbt-atk-overlay')).toBeVisible();
  await expect(page.locator('.cbt-atk-title')).toContainText('Wan');
});

// ── AC2 - the Target section ─────────────────────────────────────────────────

test('cmb.3a AC2 - every OTHER combatant is a target pill showing their Defence', async ({ page }) => {
  await openModal(page);

  await expect(page.locator('.cbt-atk-pill')).toHaveCount(2);
  await expect(targetPill(page, 'cmb3-wan')).toHaveCount(0);   // never yourself
  await expect(targetPill(page, 'cmb3-reed')).toContainText('Reed');
  await expect(targetPill(page, 'cmb3-reed')).toContainText(`DEF ${REED_DEF}`);
  await expect(targetPill(page, 'cmb3-cole')).toContainText(`DEF ${COLE_DEF}`);
  // Nobody has spent their Defence yet, so nothing is marked - the negative
  // control for the test below.
  await expect(page.locator('.cbt-atk-def-used')).toHaveCount(0);
});

test('cmb.3a AC2 - a combatant whose Defence is already spent is marked as such', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  // Spend Reed's Defence through the tab's own existing control, before the
  // modal is opened against it.
  await page.evaluate(() => window.combatToggleDef('cmb3-reed'));
  await expandWan(page);
  await page.locator('[data-cbt-attack="cmb3-wan"]').click();
  await expect(page.locator('.cbt-atk-overlay')).toBeVisible();

  const spent = targetPill(page, 'cmb3-reed').locator('.cbt-atk-def-used');
  await expect(spent).toHaveCount(1);
  // Marked, not hidden: the number is still legible, it is struck through.
  await expect(spent).toContainText(`DEF ${REED_DEF}`);
  await expect(spent).toHaveCSS('text-decoration-line', 'line-through');
  // Cole's is untouched, so this is a per-combatant state and not a blanket one.
  await expect(targetPill(page, 'cmb3-cole').locator('.cbt-atk-def-used')).toHaveCount(0);
});

// ── AC3 - the Attack Type section and its Errata-correct pools ───────────────

test('cmb.3a AC3 - all five types are listed', async ({ page }) => {
  await openModal(page);
  await expect(page.locator('.cbt-atk-type')).toHaveCount(5);
  for (const [key, label] of [
    ['unarmed', 'Unarmed Combat'], ['melee', 'Melee Combat'], ['ranged', 'Ranged Combat'],
    ['thrown', 'Thrown Weapons'], ['other', 'Other'],
  ]) {
    await expect(typeRow(page, key)).toContainText(label);
  }
});

test('cmb.3a AC3 - each type computes its Errata-correct pool against the selected target', async ({ page }) => {
  await openModal(page);
  await targetPill(page, 'cmb3-reed').click();

  await typeRow(page, 'unarmed').click();
  expect(await poolValue(page), 'Unarmed = Strength + Brawl - Defence').toBe(STR + BRAWL - REED_DEF);

  await typeRow(page, 'melee').click();
  expect(await poolValue(page), 'Melee = Strength + Weaponry - Defence').toBe(STR + WEAPONRY - REED_DEF);

  await typeRow(page, 'ranged').click();
  expect(await poolValue(page), 'Ranged = Dexterity + Firearms, no Defence').toBe(DEX + FIREARMS);

  await typeRow(page, 'thrown').click();
  // The Errata's own formula. Core RAW's Dexterity + Athletics would give one
  // die fewer here, which is exactly why Strength and Dexterity differ on Wan.
  expect(await poolValue(page), 'Thrown = STRENGTH + Athletics - Defence (Errata)')
    .toBe(STR + ATHLETICS - REED_DEF);
  expect(STR + ATHLETICS - REED_DEF).not.toBe(DEX + ATHLETICS - REED_DEF);

  await typeRow(page, 'other').click();
  expect(await poolValue(page), 'Other has no formula and starts at 0').toBe(0);
});

test('cmb.3a AC3 - the pool uses skTotal, so a skill bonus dot really counts', async ({ page }) => {
  await openModal(page);
  // No target, so the whole pool is the attacker's own attribute + skill.
  await typeRow(page, 'unarmed').click();
  // Brawl is 2 dots + 1 bonus dot. The retired local skDots() shortcut would
  // have produced STR + 2 = 6 here.
  expect(await poolValue(page)).toBe(STR + BRAWL);
  expect(await poolValue(page)).not.toBe(STR + 2);
});

test('cmb.3a AC3 - the live formula preview names the real numbers behind the pool', async ({ page }) => {
  await openModal(page);
  await targetPill(page, 'cmb3-reed').click();
  await typeRow(page, 'unarmed').click();
  const note = page.locator('[data-cbt-atk-note]');
  await expect(note).toContainText(`Strength ${STR}`);
  await expect(note).toContainText(`Brawl ${BRAWL}`);
  await expect(note).toContainText(`Defence ${REED_DEF}`);
});

test('cmb.3a AC3 - a pool that would go negative floors at 0 rather than showing a negative', async ({ page }) => {
  await openModal(page);
  await targetPill(page, 'cmb3-cole').click();     // Defence 6
  await typeRow(page, 'melee').click();            // 4 + 1 - 6 = -1
  expect(await poolValue(page)).toBe(0);
});

// ── AC4 - the stepper, tested per type ───────────────────────────────────────

for (const key of ['unarmed', 'melee', 'ranged', 'thrown', 'other']) {
  test(`cmb.3a AC4 - the stepper moves the ${key} pool to any non-negative integer, including 0`, async ({ page }) => {
    await openModal(page);
    await targetPill(page, 'cmb3-reed').click();
    await typeRow(page, key).click();

    const start = await poolValue(page);
    expect(start).toBeGreaterThanOrEqual(0);

    // Up, freely.
    const inc = page.locator('[data-cbt-atk-step="1"]');
    const dec = page.locator('[data-cbt-atk-step="-1"]');
    for (let i = 0; i < 3; i++) await inc.click();
    expect(await poolValue(page)).toBe(start + 3);

    // All the way down to 0, from whatever this type's own preset was.
    for (let i = 0; i < start + 3; i++) await dec.click();
    expect(await poolValue(page), `${key} could not be stepped down to 0`).toBe(0);

    // And 0 is the floor, not a waypoint to a negative number.
    await dec.click();
    await dec.click();
    expect(await poolValue(page)).toBe(0);

    // Still freely adjustable after bottoming out.
    await inc.click();
    expect(await poolValue(page)).toBe(1);
  });
}

// ── AC5 - "Other" is a peer, not a fallback ─────────────────────────────────

test('cmb.3a AC5 - Other is always visible and tappable whatever else is selected', async ({ page }) => {
  await openModal(page);
  const other = typeRow(page, 'other');
  await expect(other).toBeVisible();

  await typeRow(page, 'ranged').click();
  await expect(other).toBeVisible();
  await expect(other).toBeEnabled();

  // Same visual weight as a formula-backed row: same class, same measured box
  // width, and a tap target no smaller than any other type.
  const rows = await boxes(page, '.cbt-atk-type');
  const widths = new Set(rows.map(r => r.w));
  expect(widths.size, 'the type rows are not all the same width').toBe(1);

  await other.click();
  expect(await poolValue(page)).toBe(0);
  await expect(other).toHaveAttribute('aria-pressed', 'true');
});

test('cmb.3a AC5 - Other shows no formula, only an invitation to set the pool', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'other').click();
  const note = page.locator('[data-cbt-atk-note]');
  await expect(note).not.toContainText('Strength');
  await expect(note).not.toContainText('Dexterity');
  await expect(note).not.toContainText('Defence');
  await expect(typeRow(page, 'other')).toContainText('Set your own pool');
});

test('cmb.3a AC5 - Roll works identically from Other as from a preset type', async ({ page }) => {
  await openModal(page);
  await targetPill(page, 'cmb3-reed').click();
  await typeRow(page, 'other').click();
  for (let i = 0; i < 5; i++) await page.locator('[data-cbt-atk-step="1"]').click();
  expect(await poolValue(page)).toBe(5);

  await page.locator('[data-cbt-atk-roll]').click();
  await expect(page.locator('.cbt-atk-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => window.__nav)).toContain('roll');
  await expect(page.locator('#pool-banner')).toContainText('Other vs Reed');
  await expect(page.locator('#pool-banner')).toContainText('5d');
});

// ── AC6 - Ranged never subtracts Defence, and says so ───────────────────────

test('cmb.3a AC6 - Ranged ignores even a very large Defence', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'ranged').click();
  const noTarget = await poolValue(page);
  expect(noTarget).toBe(DEX + FIREARMS);

  await targetPill(page, 'cmb3-cole').click();     // Defence 6
  expect(await poolValue(page), 'a Defence 6 target changed a Ranged pool').toBe(noTarget);

  await targetPill(page, 'cmb3-cole').click();     // deselect
  await targetPill(page, 'cmb3-reed').click();     // Defence 4
  expect(await poolValue(page)).toBe(noTarget);
});

test('cmb.3a AC6 - the Defence chip is visibly marked not-applicable under Ranged', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'unarmed').click();
  await expect(targetPill(page, 'cmb3-cole').locator('.cbt-atk-def-na')).toHaveCount(0);

  await typeRow(page, 'ranged').click();
  const na = targetPill(page, 'cmb3-cole').locator('.cbt-atk-def-na');
  await expect(na).toHaveCount(1);
  await expect(na).toContainText('N/A');
  await expect(na).toContainText(`DEF ${COLE_DEF}`);   // the number stays legible
  await expect(na).toHaveCSS('text-decoration-line', 'line-through');
  // Every pill is marked, not only the selected one - the rule is about the
  // attack type, not about who happens to be picked.
  await expect(page.locator('.cbt-atk-def-na')).toHaveCount(2);

  // Switching back off Ranged clears the marking again.
  await typeRow(page, 'thrown').click();
  await expect(page.locator('.cbt-atk-def-na')).toHaveCount(0);
});

// ── AC7 - recompute on target/type change (documented behaviour) ─────────────

test('cmb.3a AC7 - changing the target recomputes the preview from the formula', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'unarmed').click();
  expect(await poolValue(page)).toBe(STR + BRAWL);

  await targetPill(page, 'cmb3-reed').click();
  expect(await poolValue(page)).toBe(STR + BRAWL - REED_DEF);

  await targetPill(page, 'cmb3-cole').click();
  expect(await poolValue(page)).toBe(STR + BRAWL - COLE_DEF);
});

test('cmb.3a AC7 - a manual adjustment is discarded by a later target/type change (built behaviour)', async ({ page }) => {
  await openModal(page);
  await targetPill(page, 'cmb3-reed').click();
  await typeRow(page, 'unarmed').click();
  await page.locator('[data-cbt-atk-step="1"]').click();
  await page.locator('[data-cbt-atk-step="1"]').click();
  expect(await poolValue(page)).toBe(STR + BRAWL - REED_DEF + 2);

  // Changing the type is a preview recompute, per this story's own AC7 wording.
  await typeRow(page, 'melee').click();
  expect(await poolValue(page)).toBe(STR + WEAPONRY - REED_DEF);

  // ...and so is changing the target.
  await page.locator('[data-cbt-atk-step="1"]').click();
  expect(await poolValue(page)).toBe(STR + WEAPONRY - REED_DEF + 1);
  await targetPill(page, 'cmb3-cole').click();
  expect(await poolValue(page)).toBe(0);   // 4 + 1 - 6, floored
});

test('cmb.3a AC7 - manual adjustment is never blocked, and is what actually gets rolled', async ({ page }) => {
  await openModal(page);
  await targetPill(page, 'cmb3-reed').click();
  await typeRow(page, 'unarmed').click();
  for (let i = 0; i < 4; i++) await page.locator('[data-cbt-atk-step="1"]').click();
  const adjusted = STR + BRAWL - REED_DEF + 4;
  expect(await poolValue(page)).toBe(adjusted);

  await page.locator('[data-cbt-atk-roll]').click();
  // The submitted pool is the stepper's value, not a fresh recomputation.
  await expect(page.locator('#pool-banner')).toContainText(`${adjusted}d`);
});

// ── AC8 - what Roll requires ────────────────────────────────────────────────

test('cmb.3a AC8 - Roll is disabled only while no type is selected', async ({ page }) => {
  await openModal(page);
  const roll = page.locator('[data-cbt-atk-roll]');
  await expect(roll).toBeDisabled();

  // A target alone is still not enough - the type is the gate.
  await targetPill(page, 'cmb3-reed').click();
  await expect(roll).toBeDisabled();

  await typeRow(page, 'unarmed').click();
  await expect(roll).toBeEnabled();
});

test('cmb.3a AC8 - Roll works with a type and no target at all', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'thrown').click();
  await expect(page.locator('[data-cbt-atk-roll]')).toBeEnabled();

  await page.locator('[data-cbt-atk-roll]').click();
  await expect(page.locator('.cbt-atk-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => window.__nav)).toContain('roll');
  await expect(page.locator('#pool-banner')).toContainText('Thrown Weapons');
  await expect(page.locator('#pool-banner')).not.toContainText('vs');
  await expect(page.locator('#pool-banner')).toContainText(`${STR + ATHLETICS}d`);
});

test('cmb.3a AC8 - a 0 pool is still rollable', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'other').click();
  expect(await poolValue(page)).toBe(0);
  await expect(page.locator('[data-cbt-atk-roll]')).toBeEnabled();
  await page.locator('[data-cbt-atk-roll]').click();
  expect(await page.evaluate(() => window.__nav)).toContain('roll');
});

// ── AC9 - the preset system is genuinely gone ───────────────────────────────

test('cmb.3a AC9 - combatQuickRoll, _attackPools and cbt-pool-btn no longer exist', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  await expandWan(page);

  expect(await page.evaluate(() => typeof window.combatQuickRoll)).toBe('undefined');
  await expect(page.locator('.cbt-pool-btn')).toHaveCount(0);

  // The retired per-combatant preset array is gone from the persisted scene
  // shape too, not merely unrendered.
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('tm_combat_scene')));
  expect(saved.combatants.length).toBe(3);
  for (const cb of saved.combatants) expect(cb.attackPools).toBeUndefined();
});

// ── AC10 - every modal control is a real 44px target ────────────────────────

test('cmb.3a AC10 - every control in the modal measures a real 44x44px box', async ({ page }) => {
  await openModal(page);
  await expectAllTappable(page, '.cbt-atk-pill', 'target pill');
  await expectAllTappable(page, '.cbt-atk-type', 'attack type row');
  await expectAllTappable(page, '[data-cbt-atk-step]', 'pool stepper button');
  await expectAllTappable(page, '[data-cbt-atk-roll]', 'Roll');
  await expectAllTappable(page, '[data-cbt-atk-cancel]', 'Cancel');
  await expectAllTappable(page, '[data-cbt-atk-close]', 'close');

  expect((await boxes(page, '[data-cbt-atk-step]')).length, 'both stepper buttons').toBe(2);
  expect((await boxes(page, '.cbt-atk-type')).length).toBe(5);
});

test('cmb.3a AC10 - the Attack button on the card is a real 44x44px box', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  await expandWan(page);
  await expectAllTappable(page, '.cbt-atk-open-btn', 'Attack button');
});

test('cmb.3a AC10 - no two modal controls overlap each other', async ({ page }) => {
  await openModal(page);
  const rects = await page.$$eval(
    '.cbt-atk-pill, .cbt-atk-type, [data-cbt-atk-step], [data-cbt-atk-roll], [data-cbt-atk-cancel], [data-cbt-atk-close]',
    els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  expect(rects.length).toBeGreaterThan(8);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlaps, `controls ${i} and ${j} overlap, so one steals the other's taps`).toBe(false);
    }
  }
});

test('cmb.3a AC10 - the modal fits a real phone viewport without a horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openModal(page);
  const fits = await page.evaluate(() => {
    const m = document.querySelector('.cbt-atk-modal');
    return { overflow: m.scrollWidth - m.clientWidth, right: m.getBoundingClientRect().right, vw: window.innerWidth };
  });
  expect(fits.overflow).toBeLessThanOrEqual(1);
  expect(fits.right).toBeLessThanOrEqual(fits.vw);
  await expectAllTappable(page, '.cbt-atk-type', 'attack type row at 390px');
  await expectAllTappable(page, '[data-cbt-atk-step]', 'stepper at 390px');
});

// ── AC11 - real touch open/close, not DOM presence ──────────────────────────

test('cmb.3a AC11 - a real touch tap opens the modal and a real touch tap closes it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountCombat(page);
  await rollScene(page);
  await expandWan(page);

  // page.tap() is a genuine touchscreen tap (hasTouch is on for this file),
  // not a synthesised click - this is the gesture an ST actually performs.
  await page.locator('[data-cbt-attack="cmb3-wan"]').tap();
  await expect(page.locator('.cbt-atk-overlay')).toBeVisible();

  await page.locator('[data-cbt-atk-close]').tap();
  await expect(page.locator('.cbt-atk-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => window.combatAttackState())).toBeNull();
});

test('cmb.3a AC11 - a full pointerdown/pointerup/click sequence drives target, type and stepper', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openModal(page);

  // Drive each control the way a finger does: press, release, then the click
  // the browser synthesises from the pair.
  for (const sel of ['[data-cbt-atk-target="cmb3-reed"]', '[data-cbt-atk-type="unarmed"]', '[data-cbt-atk-step="1"]']) {
    const el = page.locator(sel);
    await el.dispatchEvent('pointerdown');
    await el.dispatchEvent('pointerup');
    await el.click();
  }

  await expect(targetPill(page, 'cmb3-reed')).toHaveAttribute('aria-pressed', 'true');
  await expect(typeRow(page, 'unarmed')).toHaveAttribute('aria-pressed', 'true');
  expect(await poolValue(page)).toBe(STR + BRAWL - REED_DEF + 1);
});

test('cmb.3a AC11 - a tap inside the dialog never dismisses it, a tap on the backdrop does', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openModal(page);

  // Several real taps on real controls, none of which may close the modal.
  await targetPill(page, 'cmb3-reed').tap();
  await typeRow(page, 'melee').tap();
  await page.locator('[data-cbt-atk-step="1"]').tap();
  await page.locator('.cbt-atk-title').tap();
  await expect(page.locator('.cbt-atk-overlay')).toBeVisible();

  // A tap on the backdrop itself, well clear of the dialog box.
  const box = await page.locator('.cbt-atk-modal').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, Math.max(4, box.y / 2));
  await expect(page.locator('.cbt-atk-overlay')).toHaveCount(0);
});

test('cmb.3a AC11 - Cancel and Escape both close cleanly, leaving the card list usable', async ({ page }) => {
  await openModal(page);
  await page.locator('[data-cbt-atk-cancel]').click();
  await expect(page.locator('.cbt-atk-overlay')).toHaveCount(0);

  // The tab underneath is still live: reopen, then close with the keyboard.
  await page.locator('[data-cbt-attack="cmb3-wan"]').click();
  await expect(page.locator('.cbt-atk-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cbt-atk-overlay')).toHaveCount(0);

  // And the card list still responds after all of that.
  await page.locator('[data-cbt-card="cmb3-reed"] .cbt-card-hd').click();
  await expect(page.locator('[data-cbt-card="cmb3-reed"] .cbt-card-exp')).toHaveCount(1);
});

test('cmb.3a AC11 - the modal reopens with a clean slate after a cancel', async ({ page }) => {
  await openModal(page);
  await targetPill(page, 'cmb3-reed').click();
  await typeRow(page, 'unarmed').click();
  await page.locator('[data-cbt-atk-step="1"]').click();
  await page.locator('[data-cbt-atk-cancel]').click();

  await page.locator('[data-cbt-attack="cmb3-wan"]').click();
  await expect(page.locator('.cbt-atk-overlay')).toBeVisible();
  expect(await poolValue(page)).toBe(0);
  await expect(page.locator('[data-cbt-atk-roll]')).toBeDisabled();
  await expect(page.locator('.cbt-atk-overlay [aria-pressed="true"]')).toHaveCount(0);
});

test('cmb.3a AC11 - the modal sits above the card list, not clipped inside it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openModal(page);
  const placed = await page.evaluate(() => {
    const ov = document.querySelector('.cbt-atk-overlay');
    const host = document.getElementById('cmb3-host');
    return {
      inHost: !!(host && host.contains(ov)),
      onBody: !!(ov && ov.closest('body')),
      position: getComputedStyle(ov).position,
      hitsItself: document.elementFromPoint(2, 2) === ov,
    };
  });
  // Parented outside the tab host, so render() replacing the card list cannot
  // destroy it and .cbt-wrap's overflow:hidden cannot clip it.
  expect(placed.inHost).toBe(false);
  expect(placed.onBody).toBe(true);
  expect(placed.position).toBe('fixed');
  expect(placed.hitsItself, 'something is painted over the modal backdrop').toBe(true);
});
