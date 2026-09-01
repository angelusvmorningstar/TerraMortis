// cmb.1 - the two acceptance criteria that only a real browser can answer:
//
//   AC6  a drag gesture on the card's rail handle never fires the header's
//        expand toggle, and a completed tap on the header never registers as a
//        drag. cmb.2 wires the actual reordering; the isolation has to exist
//        first, and be measured against real events rather than by inspection.
//   AC7  every interactive control measures a real >=44x44px box in the
//        rendered DOM. Asserted with getBoundingClientRect(), not by reading
//        the CSS source - the whole point of the AC is what a thumb meets.
//
// House style follows tests/rlv-7-persistent-mod-chips.spec.js: Service Workers
// blocked (this app's sw.js intercepts /api/ ahead of page.route() and can serve
// real production data - see memory/project-sw-leaks-live-data-in-playwright-
// tests.md), every API call stubbed, and the character data injected directly
// into suiteState rather than fetched.
//
// The Combat tab's own boot path (app.js -> goTab('combat')) is not used here:
// this spec drives initCombatTab() against its own container so the measurement
// is of the card, not of whatever else the app shell happens to be doing.

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

const MIN_TAP = 44;

function attrs(over = {}) {
  const base = {
    Intelligence: 2, Wits: 2, Resolve: 2,
    Strength: 3, Dexterity: 3, Stamina: 2,
    Presence: 2, Manipulation: 2, Composure: 2,
  };
  const merged = { ...base, ...over };
  const out = {};
  for (const [k, v] of Object.entries(merged)) out[k] = { dots: v, bonus: 0 };
  return out;
}

function skills(over = {}) {
  const out = {};
  for (const [k, v] of Object.entries({ Brawl: 3, Weaponry: 2, Firearms: 2, Athletics: 2, ...over })) {
    out[k] = { dots: v, bonus: 0, specs: [], nine_again: false };
  }
  return out;
}

const CHARS = [
  {
    _id: 'cmb1-wan', name: 'Wan', moniker: 'Wan', blood_potency: 2,
    attributes: attrs(), skills: skills(), merits: [], disciplines: {}, equipment: [],
  },
  {
    _id: 'cmb1-reed', name: 'Reed', moniker: 'Reed', blood_potency: 1,
    attributes: attrs({ Dexterity: 2 }), skills: skills(), merits: [], disciplines: {}, equipment: [],
  },
];

/** Boot the page, inject the roster, and render the Combat tab into our own host. */
async function mountCombat(page) {
  await page.route('**/api/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  await page.goto('/');
  // Let the app's own boot finish first. It writes suiteState.chars exactly
  // once (app.js step 2), so injecting after that point is stable.
  await page.waitForTimeout(1500);

  const err = await page.evaluate(async (chars) => {
    try {
      const state = (await import('/js/suite/data.js')).default;
      const combat = await import('/js/game/combat-tab.js');
      sessionStorage.removeItem('tm_combat_scene');
      state.chars = chars;
      const host = document.createElement('div');
      host.id = 'cmb1-host';
      document.body.appendChild(host);
      window.__cmb1 = { state, chars };
      combat.initCombatTab(host);
      return null;
    } catch (e) {
      return String(e && e.stack || e);
    }
  }, CHARS);
  expect(err, 'the Combat tab failed to render in the browser').toBeNull();
}

/** Park both characters and roll initiative, leaving the round view on screen. */
async function rollScene(page) {
  await page.evaluate(() => {
    window.__cmb1.state.chars = window.__cmb1.chars;   // boot must not win a late race
    window.combatAddChar('cmb1-wan');
    window.combatAddChar('cmb1-reed');
    window.combatStart();
    window.combatRollInit();
  });
  await expect(page.locator('.cbt-card')).toHaveCount(2);
}

/** Every matching element's real rendered box. */
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

// ── AC7 - setup screen ───────────────────────────────────────────────────────

test('cmb.1 AC7 - the setup screen character buttons are real 44px targets', async ({ page }) => {
  await mountCombat(page);
  await expect(page.locator('.cbt-char-btn')).toHaveCount(2);
  await expectAllTappable(page, '.cbt-char-btn', 'character pick button');
});

test('cmb.1 AC7 - Roll Initiative is a real 44px target once a combatant is parked', async ({ page }) => {
  await mountCombat(page);
  await page.evaluate(() => window.combatAddChar('cmb1-wan'));
  await expect(page.locator('#cbt-start-btn')).toBeVisible();
  await expectAllTappable(page, '#cbt-start-btn', 'Roll Initiative');
});

// ── AC7 - round view ─────────────────────────────────────────────────────────

test('cmb.1 AC7 - the round toolbar buttons are real 44px targets', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  await expectAllTappable(page, '.cbt-next-btn', 'Next Turn');
  await expectAllTappable(page, '.cbt-round-btn', 'Next Round');
  await expectAllTappable(page, '.cbt-end-btn', 'End Combat');
});

test('cmb.1 AC7 - the collapsed card header and its drag handle are real 44px targets', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  await expectAllTappable(page, '.cbt-card-hd', 'card expand header');
  await expectAllTappable(page, '.cbt-grip', 'drag handle');
});

test('cmb.1 AC7 - every control on the expanded card is a real 44px target', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  await page.locator('.cbt-card').first().locator('.cbt-card-hd').click();
  await expect(page.locator('.cbt-card-exp')).toHaveCount(1);

  await expectAllTappable(page, '.cbt-track-btn', 'Vitae/Willpower adjust');
  await expectAllTappable(page, '.cbt-dmg-btn', 'damage button');
  // cmb.3a replaced cmb.1's preset .cbt-pool-btn run with the single Attack
  // button that opens the attack modal. Same AC, new control.
  await expectAllTappable(page, '.cbt-atk-open-btn', 'Attack button');
  await expectAllTappable(page, '.cbt-def-toggle', 'defence-used toggle');

  // There are four damage buttons and four track buttons on one card; the AC
  // asks for real targets, so prove the run is really there rather than one
  // element standing in for the set.
  expect((await boxes(page, '.cbt-dmg-btn')).length).toBe(4);
  expect((await boxes(page, '.cbt-track-btn')).length).toBe(4);
});

test('cmb.1 AC7 - no two adjacent controls overlap each other', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  await page.locator('.cbt-card').first().locator('.cbt-card-hd').click();
  const rects = await page.$$eval('.cbt-dmg-btn, .cbt-track-btn, .cbt-atk-open-btn, .cbt-def-toggle',
    els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlaps, `controls ${i} and ${j} overlap, so one steals the other's taps`).toBe(false);
    }
  }
});

// ── AC6 - the handle and the header never fight ──────────────────────────────

test('cmb.1 AC6 - a drag gesture on the handle does not expand the card', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  const card = page.locator('.cbt-card').first();

  await card.locator('.cbt-grip').dispatchEvent('pointerdown');
  expect(await page.evaluate(() => window.combatDragState().active)).toBe(true);
  await expect(page.locator('.cbt-card-exp')).toHaveCount(0);
  await expect(card.locator('.cbt-card-hd')).toHaveAttribute('aria-expanded', 'false');

  await card.locator('.cbt-grip').dispatchEvent('pointerup');
  expect(await page.evaluate(() => window.combatDragState())).toEqual({ active: false, charId: null });
  await expect(page.locator('.cbt-card-exp')).toHaveCount(0);
});

test('cmb.1 AC6 - a full click on the handle still never expands the card', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  // A real mouse press/release on the grip: pointerdown, mousedown, mouseup,
  // click. None of it may reach the header's toggle.
  await page.locator('.cbt-card').first().locator('.cbt-grip').click();
  await expect(page.locator('.cbt-card-exp')).toHaveCount(0);
  expect(await page.evaluate(() => window.combatDragState())).toEqual({ active: false, charId: null });
});

test('cmb.1 AC6 - a completed tap on the header expands and starts no drag', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  const card = page.locator('.cbt-card').first();

  await card.locator('.cbt-card-hd').click();
  await expect(card.locator('.cbt-card-hd')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.cbt-card-exp')).toHaveCount(1);
  expect(await page.evaluate(() => window.combatDragState())).toEqual({ active: false, charId: null });
});

test('cmb.1 AC5 - expanding a second card collapses the first, in the real DOM', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  const cards = page.locator('.cbt-card');

  await cards.nth(0).locator('.cbt-card-hd').click();
  await expect(page.locator('.cbt-card-exp')).toHaveCount(1);
  await expect(cards.nth(0).locator('.cbt-card-hd')).toHaveAttribute('aria-expanded', 'true');

  await cards.nth(1).locator('.cbt-card-hd').click();
  await expect(page.locator('.cbt-card-exp')).toHaveCount(1);
  await expect(cards.nth(0).locator('.cbt-card-hd')).toHaveAttribute('aria-expanded', 'false');
  await expect(cards.nth(1).locator('.cbt-card-hd')).toHaveAttribute('aria-expanded', 'true');
});
