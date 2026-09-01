// cmb.3c - the Kindred damage-split calculator on each expanded combat card.
//
// House style follows tests/cmb-3a-attack-modal.spec.js and
// tests/cmb-3b-weapon-integration.spec.js: Service Workers blocked (this app's
// sw.js intercepts /api/ ahead of page.route() and can serve real production
// data - see memory/project-sw-leaks-live-data-in-playwright-tests.md), every
// API call stubbed, the roster injected straight into suiteState, and
// initCombatTab() driven against our own host rather than through app.js's nav.
//
// WHAT THIS FILE ADDS OVER server/tests/cmb-3c-damage-split.test.js. That suite
// owns the formula and the rendered prose against an element stub. Everything
// here needs a real browser: measured >=44x44px boxes (AC8), real dispatched
// taps and clicks, the raw +B/+L/+A/- buttons driven for real alongside the
// calculator (AC6/AC7), and Apply read back out of the real tracker cache.
//
// WHY THE FIXTURE IS WHAT IT IS. Stamina 5 gives calcHealth = Stamina + Size =
// 10, deliberately roomy: `trackerAdj` refuses a positive damage delta once the
// track is already full, and every arithmetic assertion below has to measure the
// SPLIT rather than that pre-existing cap rule. The largest total applied
// anywhere in this file is 9 against a track of 10.

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block', hasTouch: true });

const MIN_TAP = 44;
const MAX_HP = 10;          // Stamina 5 + Size 5

function attrs(over = {}) {
  const base = {
    Intelligence: 2, Wits: 2, Resolve: 2,
    Strength: 3, Dexterity: 3, Stamina: 5,
    Presence: 2, Manipulation: 2, Composure: 2,
  };
  const out = {};
  for (const [k, v] of Object.entries({ ...base, ...over })) out[k] = { dots: v, bonus: 0 };
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
    _id: 'cmb3c-wan', name: 'Wan', moniker: 'Wan', blood_potency: 2,
    attributes: attrs(), skills: skills(), merits: [], disciplines: {}, equipment: [],
  },
  {
    _id: 'cmb3c-reed', name: 'Reed', moniker: 'Reed', blood_potency: 1,
    attributes: attrs({ Dexterity: 2 }), skills: skills(), merits: [], disciplines: {}, equipment: [],
  },
];

const WAN = 'cmb3c-wan';
const REED = 'cmb3c-reed';

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
      const tracker = await import('/js/game/tracker.js');
      sessionStorage.removeItem('tm_combat_scene');
      for (const c of chars) localStorage.removeItem('tm_tracker_local_' + c._id);
      state.chars = chars;
      const host = document.createElement('div');
      host.id = 'cmb3c-host';
      document.body.appendChild(host);
      // Read the real tracker cache back out, so "what did Apply actually
      // write" is answered by the same module the +B/+L buttons write through.
      window.__cmb3c = { state, chars, trackerRead: tracker.trackerRead };
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

async function rollScene(page) {
  await page.evaluate(() => {
    window.__cmb3c.state.chars = window.__cmb3c.chars;   // boot must not win a late race
    window.combatEnd();                                   // clear any scratch state from a prior render
    window.combatAddChar('cmb3c-wan');
    window.combatAddChar('cmb3c-reed');
    window.combatStart();
    window.combatRollInit();
  });
  await expect(page.locator('.cbt-card')).toHaveCount(2);
}

/** The full real sequence an ST performs to reach one card's calculator. */
async function openCard(page, charId = WAN) {
  await mountCombat(page);
  await rollScene(page);
  await page.locator(`[data-cbt-card="${charId}"] .cbt-card-hd`).click();
  await expect(page.locator(`[data-cbt-card="${charId}"] .cbt-card-exp`)).toHaveCount(1);
  await expect(page.locator(`[data-cbt-card="${charId}"] .cbt-split`)).toHaveCount(1);
}

const card = (page, id = WAN) => page.locator(`[data-cbt-card="${id}"]`);
const preview = (page, id = WAN) => card(page, id).locator('[data-cbt-split-preview]');
const applyBtn = (page, id = WAN) => card(page, id).locator(`[data-cbt-split-apply="${id}"]`);
const stepBtn = (page, field, dir, id = WAN) =>
  card(page, id).locator(`[data-cbt-split-step="${field}:${dir}"]`);
const typeBtn = (page, type, id = WAN) => card(page, id).locator(`[data-cbt-split-type="${type}"]`);
const numOf = (page, field, id = WAN) => card(page, id).locator(`[data-cbt-split-${field}]`);

/** Drive the calculator the way an ST does - by tapping the real controls. */
async function setSplit(page, { successes = 0, rating = 0, type = null, id = WAN } = {}) {
  for (let i = 0; i < successes; i++) await stepBtn(page, 'successes', '1', id).click();
  for (let i = 0; i < rating; i++) await stepBtn(page, 'rating', '1', id).click();
  if (type) await typeBtn(page, type, id).click();
}

/** The real tracker row, as the +B/+L/+A buttons themselves write it. */
async function damageOf(page, id = WAN) {
  return page.evaluate(charId => {
    const ts = window.__cmb3c.trackerRead(charId) || {};
    return { bashing: ts.bashing || 0, lethal: ts.lethal || 0, aggravated: ts.aggravated || 0 };
  }, id);
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

// ── AC1 - the calculator exists, beside the damage controls ─────────────────

test('cmb.3c AC1 - the expanded card carries both steppers, the type toggle and a live preview', async ({ page }) => {
  await openCard(page);
  await expect(stepBtn(page, 'successes', '1')).toHaveCount(1);
  await expect(stepBtn(page, 'successes', '-1')).toHaveCount(1);
  await expect(stepBtn(page, 'rating', '1')).toHaveCount(1);
  await expect(stepBtn(page, 'rating', '-1')).toHaveCount(1);
  await expect(typeBtn(page, 'lethal')).toHaveCount(1);
  await expect(typeBtn(page, 'aggravated')).toHaveCount(1);
  await expect(applyBtn(page)).toHaveCount(1);

  // It is BESIDE the raw controls, in the same expanded body - not instead of
  // them and not somewhere else on the page.
  await expect(card(page).locator('.cbt-card-exp .cbt-dmg-ctrl')).toHaveCount(1);
  await expect(card(page).locator('.cbt-card-exp .cbt-split')).toHaveCount(1);
});

test('cmb.3c AC1 - the steppers move, floor at zero, and update the preview live', async ({ page }) => {
  await openCard(page);
  await expect(numOf(page, 'successes')).toHaveText('0');
  await expect(numOf(page, 'rating')).toHaveText('0');
  await expect(preview(page)).toHaveText('0 successes, rating 0 → nothing to apply.');

  await stepBtn(page, 'successes', '1').click();
  await expect(numOf(page, 'successes')).toHaveText('1');
  await expect(preview(page)).toContainText('1 success, rating 0');

  await stepBtn(page, 'successes', '1').click();
  await stepBtn(page, 'rating', '1').click();
  await expect(numOf(page, 'successes')).toHaveText('2');
  await expect(numOf(page, 'rating')).toHaveText('1');
  await expect(preview(page)).toContainText('2 successes, rating 1');

  // 0 is the floor, not a waypoint to a negative number.
  for (let i = 0; i < 5; i++) await stepBtn(page, 'successes', '-1').click();
  for (let i = 0; i < 5; i++) await stepBtn(page, 'rating', '-1').click();
  await expect(numOf(page, 'successes')).toHaveText('0');
  await expect(numOf(page, 'rating')).toHaveText('0');
});

test('cmb.3c AC1 - each card owns its own calculator', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 4, rating: 2 });
  await expect(preview(page, WAN)).toContainText('4 successes, rating 2');

  // Opening Reed collapses Wan (cmb.1 AC5), and Reed's calculator starts clean.
  await page.locator(`[data-cbt-card="${REED}"] .cbt-card-hd`).click();
  await expect(numOf(page, 'successes', REED)).toHaveText('0');
  await expect(preview(page, REED)).toContainText('0 successes, rating 0');

  // Wan's is still exactly where it was left when his card comes back.
  await page.locator(`[data-cbt-card="${WAN}"] .cbt-card-hd`).click();
  await expect(numOf(page, 'successes', WAN)).toHaveText('4');
  await expect(numOf(page, 'rating', WAN)).toHaveText('2');
});

// ── AC2 - rating > 0 is purely additive ─────────────────────────────────────

test('cmb.3c AC2 - 5 successes with a rating-1 weapon is 1 Lethal + 5 Bashing', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 5, rating: 1 });
  // The story's own worked sentence, word for word.
  await expect(preview(page)).toHaveText(
    '5 successes, rating 1 → 1 Lethal (a mortal takes this too) + 5 Bashing to Kindred (a mortal would take these as Lethal too).'
  );
  // Six points of damage in total. A "successes minus rating" reading gives 4,
  // a "rating caps successes" reading gives 1 - neither can pass this.
  const st = await page.evaluate(id => window.combatSplitState(id), WAN);
  expect(st.ratedPoints + st.bashingPoints).toBe(6);
  expect(st).toMatchObject({ ratedPoints: 1, bashingPoints: 5 });
});

test('cmb.3c AC2 - a bigger rating is delivered whole, on top of every success', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 3, rating: 3 });
  await expect(preview(page)).toContainText('3 Lethal (a mortal takes these too)');
  await expect(preview(page)).toContainText('3 Bashing to Kindred');
  expect(await page.evaluate(id => window.combatSplitState(id), WAN))
    .toMatchObject({ ratedPoints: 3, bashingPoints: 3 });
});

test('cmb.3c AC2 - zero successes with a rating still delivers the rating alone', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { rating: 2 });
  await expect(preview(page)).toHaveText('0 successes, rating 2 → 2 Lethal (a mortal takes these too).');
  await expect(preview(page)).not.toContainText('Bashing to Kindred');
  // The calculator does not gate on "was this actually a hit" - Apply is live.
  await expect(applyBtn(page)).toBeEnabled();
});

// ── AC3 - rating = 0, the off-by-one branch ─────────────────────────────────

test('cmb.3c AC3 - rating 0 with ONE success is 1 Lethal and no Bashing', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 1 });
  await expect(preview(page)).toHaveText('1 success, rating 0 → 1 Lethal (a mortal takes this too).');
  await expect(preview(page)).not.toContainText('Bashing');
  expect(await page.evaluate(id => window.combatSplitState(id), WAN))
    .toMatchObject({ ratedPoints: 1, bashingPoints: 0 });
});

test('cmb.3c AC3 - rating 0 with FIVE successes is 1 Lethal + 4 Bashing, never 1 + 5', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 5 });
  await expect(preview(page)).toHaveText(
    '5 successes, rating 0 → 1 Lethal (a mortal takes this too) + 4 Bashing to Kindred (a mortal would take these as Lethal too).'
  );
  // The exact bug the story flags: reusing the rating > 0 shape here invents a
  // sixth point of damage out of nothing.
  await expect(preview(page)).not.toContainText('+ 5 Bashing');
  const st = await page.evaluate(id => window.combatSplitState(id), WAN);
  expect(st).toMatchObject({ ratedPoints: 1, bashingPoints: 4 });
  expect(st.ratedPoints + st.bashingPoints, 'a 0-rated hit totals exactly the successes rolled').toBe(5);
});

test('cmb.3c AC3 - rating 0 with no successes has nothing to apply, and says so', async ({ page }) => {
  await openCard(page);
  await expect(preview(page)).toHaveText('0 successes, rating 0 → nothing to apply.');
  await expect(applyBtn(page)).toBeDisabled();
  // ...and the raw buttons beside it are emphatically NOT disabled with it.
  await expect(card(page).locator('.cbt-dmg-btn.bash')).toBeEnabled();
  await expect(card(page).locator('.cbt-dmg-btn.let')).toBeEnabled();
});

test('cmb.3c AC3 - the whole formula, swept, with rating 0 as its own branch', async ({ page }) => {
  await openCard(page);
  // The pure helper, exhaustively - the UI samples it, this proves it.
  const wrong = await page.evaluate(() => {
    const bad = [];
    for (let s = 0; s <= 10; s++) {
      for (let r = 0; r <= 5; r++) {
        const got = window.combatSplitCompute(s, r);
        const want = r > 0
          ? { ratedPoints: r, bashingPoints: s }
          : { ratedPoints: s >= 1 ? 1 : 0, bashingPoints: s >= 1 ? s - 1 : 0 };
        const total = got.ratedPoints + got.bashingPoints;
        const wantTotal = r > 0 ? s + r : s;
        if (got.ratedPoints !== want.ratedPoints || got.bashingPoints !== want.bashingPoints || total !== wantTotal) {
          bad.push({ s, r, got, want, total, wantTotal });
        }
      }
    }
    return bad;
  });
  expect(wrong, 'computeKindredSplit disagreed with the Errata formula').toEqual([]);

  // The five worked examples from the story, checked one more time by name.
  const worked = await page.evaluate(() => ([
    window.combatSplitCompute(5, 1),
    window.combatSplitCompute(5, 0),
    window.combatSplitCompute(1, 0),
    window.combatSplitCompute(0, 0),
    window.combatSplitCompute(0, 2),
  ]));
  expect(worked).toEqual([
    { ratedPoints: 1, bashingPoints: 5 },
    { ratedPoints: 1, bashingPoints: 4 },
    { ratedPoints: 1, bashingPoints: 0 },
    { ratedPoints: 0, bashingPoints: 0 },
    { ratedPoints: 2, bashingPoints: 0 },
  ]);
});

// ── AC4 - the Aggravated toggle ─────────────────────────────────────────────

test('cmb.3c AC4 - Aggravated relabels the rated half only, the maths is identical', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 5, rating: 1 });
  const asLethal = await page.evaluate(id => window.combatSplitState(id), WAN);

  await typeBtn(page, 'aggravated').click();
  await expect(typeBtn(page, 'aggravated')).toHaveAttribute('aria-pressed', 'true');
  await expect(typeBtn(page, 'lethal')).toHaveAttribute('aria-pressed', 'false');
  await expect(preview(page)).toHaveText(
    '5 successes, rating 1 → 1 Aggravated (a mortal takes this too) + 5 Bashing to Kindred (a mortal would take these as Lethal too).'
  );

  const asAgg = await page.evaluate(id => window.combatSplitState(id), WAN);
  expect(asAgg.ratedPoints).toBe(asLethal.ratedPoints);
  expect(asAgg.bashingPoints).toBe(asLethal.bashingPoints);
  // The Bashing half is never upgraded with it.
  await expect(preview(page)).toContainText('5 Bashing to Kindred');
});

test('cmb.3c AC4 - Lethal is the default and the toggle goes both ways', async ({ page }) => {
  await openCard(page);
  await expect(typeBtn(page, 'lethal')).toHaveAttribute('aria-pressed', 'true');
  await expect(typeBtn(page, 'aggravated')).toHaveAttribute('aria-pressed', 'false');
  await typeBtn(page, 'aggravated').click();
  await expect(typeBtn(page, 'aggravated')).toHaveAttribute('aria-pressed', 'true');
  await typeBtn(page, 'lethal').click();
  await expect(typeBtn(page, 'lethal')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page).locator('[data-cbt-split-type][aria-pressed="true"]')).toHaveCount(1);
});

test('cmb.3c AC4 - Aggravated writes to the aggravated field, never to lethal', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 5, rating: 1, type: 'aggravated' });
  await applyBtn(page).click();
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 5, lethal: 0, aggravated: 1 });
});

test('cmb.3c AC4 - Aggravated relabels the rating = 0 upgrade too', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 4, type: 'aggravated' });
  await expect(preview(page)).toContainText('1 Aggravated (a mortal takes this too) + 3 Bashing to Kindred');
  await applyBtn(page).click();
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 3, lethal: 0, aggravated: 1 });
});

// ── AC5 - Apply commits through the same path, additively ───────────────────

test('cmb.3c AC5 - Apply writes both halves through the same tracker path', async ({ page }) => {
  await openCard(page);
  expect(await damageOf(page)).toEqual({ bashing: 0, lethal: 0, aggravated: 0 });
  await setSplit(page, { successes: 5, rating: 1 });
  await applyBtn(page).click();
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 5, lethal: 1, aggravated: 0 });
  // Six points marked on a track of ten - the card's own Health readout agrees.
  await expect(card(page).locator('.cbt-track-val').last()).toHaveText(`6/${MAX_HP}`);
});

test('cmb.3c AC5 - Apply is ADDITIVE - pre-existing damage survives it', async ({ page }) => {
  await openCard(page);
  // Pre-damage with the raw buttons, exactly as an ST would have earlier in the
  // fight: 2 Bashing and 1 Lethal.
  await card(page).locator('.cbt-dmg-btn.bash').click();
  await card(page).locator('.cbt-dmg-btn.bash').click();
  await card(page).locator('.cbt-dmg-btn.let').click();
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 2, lethal: 1, aggravated: 0 });

  await setSplit(page, { successes: 5, rating: 1 });
  await applyBtn(page).click();
  // 2B + 1L already there, plus this split's 1L + 5B. Nothing was reset.
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 7, lethal: 2, aggravated: 0 });
});

test('cmb.3c AC5 - Apply writes the rating = 0 split as 1 + (successes - 1)', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 5 });
  await applyBtn(page).click();
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 4, lethal: 1, aggravated: 0 });
  // Five points total, not six.
  await expect(card(page).locator('.cbt-track-val').last()).toHaveText(`5/${MAX_HP}`);
});

test('cmb.3c AC5 - Apply lands on the card it belongs to, never on another combatant', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 3, rating: 1 });
  await applyBtn(page).click();
  await expect.poll(() => damageOf(page, WAN)).toEqual({ bashing: 3, lethal: 1, aggravated: 0 });
  expect(await damageOf(page, REED)).toEqual({ bashing: 0, lethal: 0, aggravated: 0 });
});

test('cmb.3c AC5 - Apply leaves the inputs in place, so a repeat hit needs no retyping', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 2, rating: 1 });
  await applyBtn(page).click();
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 2, lethal: 1, aggravated: 0 });
  await expect(numOf(page, 'successes')).toHaveText('2');
  await expect(numOf(page, 'rating')).toHaveText('1');

  // Applying again stacks, because it is the same additive path as the buttons.
  await applyBtn(page).click();
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 4, lethal: 2, aggravated: 0 });
});

test('cmb.3c AC5 - Apply does nothing when there is nothing to apply', async ({ page }) => {
  await openCard(page);
  await expect(applyBtn(page)).toBeDisabled();
  const before = await damageOf(page);
  await applyBtn(page).click({ force: true });
  await page.waitForTimeout(200);
  expect(await damageOf(page)).toEqual(before);

  // One success is enough to arm it.
  await stepBtn(page, 'successes', '1').click();
  await expect(applyBtn(page)).toBeEnabled();
});

// ── AC6 - the raw +B/+L/+A/- buttons are untouched and independent ───────────

test('cmb.3c AC6 - all four raw damage buttons still work on their own', async ({ page }) => {
  await openCard(page);
  await card(page).locator('.cbt-dmg-btn.bash').click();
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 1, lethal: 0, aggravated: 0 });
  await card(page).locator('.cbt-dmg-btn.let').click();
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 1, lethal: 1, aggravated: 0 });
  await card(page).locator('.cbt-dmg-btn.agg').click();
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 1, lethal: 1, aggravated: 1 });
  await card(page).locator('.cbt-dmg-btn.heal').click();
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 0, lethal: 1, aggravated: 1 });

  // Nothing the raw buttons did touched the calculator either.
  await expect(numOf(page, 'successes')).toHaveText('0');
  await expect(numOf(page, 'rating')).toHaveText('0');
});

test('cmb.3c AC6 - the raw buttons work with a fully populated calculator sitting unused', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 7, rating: 3, type: 'aggravated' });
  await expect(preview(page)).toContainText('7 successes, rating 3');

  // A typed-but-never-applied split contributes exactly nothing.
  await card(page).locator('.cbt-dmg-btn.bash').click();
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 1, lethal: 0, aggravated: 0 });
  await expect(numOf(page, 'successes')).toHaveText('7');
  await expect(numOf(page, 'rating')).toHaveText('3');
});

test('cmb.3c AC6 - no control on the card is ever disabled because of the calculator', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 5, rating: 1 });
  const disabled = await page.$$eval(
    `[data-cbt-card="${'cmb3c-wan'}"] button[disabled]`,
    els => els.map(el => el.className));
  expect(disabled, 'a card control was disabled while the calculator was in use').toEqual([]);
});

// ── AC7 - the calculator gates nothing else on the card ─────────────────────

test('cmb.3c AC7 - collapsing, expanding, Attack and the tracks all still work mid-edit', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 6, rating: 2, type: 'aggravated' });

  // Collapse and re-expand: the card still folds, and the values come back.
  await card(page).locator('.cbt-card-hd').click();
  await expect(card(page).locator('.cbt-card-exp')).toHaveCount(0);
  await card(page).locator('.cbt-card-hd').click();
  await expect(numOf(page, 'successes')).toHaveText('6');
  await expect(numOf(page, 'rating')).toHaveText('2');
  await expect(typeBtn(page, 'aggravated')).toHaveAttribute('aria-pressed', 'true');

  // The Attack modal still opens and closes.
  await card(page).locator('[data-cbt-attack]').click();
  await expect(page.locator('.cbt-atk-overlay')).toBeVisible();
  await page.locator('[data-cbt-atk-cancel]').click();
  await expect(page.locator('.cbt-atk-overlay')).toHaveCount(0);

  // The Vitae / Willpower tracks still adjust.
  const wpBefore = await page.evaluate(() => (window.__cmb3c.trackerRead('cmb3c-wan') || {}).willpower);
  await card(page).locator('.cbt-track-btn[aria-label="Lower Willpower"]').click();
  await expect.poll(() => page.evaluate(() => (window.__cmb3c.trackerRead('cmb3c-wan') || {}).willpower))
    .toBe(wpBefore - 1);

  // And the calculator came through all of it unchanged.
  await expect(numOf(page, 'successes')).toHaveText('6');
});

test('cmb.3c AC7 - the drag handle still starts a real gesture with the calculator populated', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 5, rating: 1 });

  const grip = card(page).locator('[data-cbt-grip]');
  await grip.dispatchEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
  expect(await page.evaluate(() => window.combatDragState()))
    .toMatchObject({ active: true, charId: WAN });
  await page.evaluate(() => document.dispatchEvent(
    new PointerEvent('pointercancel', { pointerId: 1, clientX: 10, clientY: 10, bubbles: true })));
  expect(await page.evaluate(() => window.combatDragState())).toMatchObject({ active: false });
});

test('cmb.3c AC7 - the turn controls still work and the calculator survives the re-render', async ({ page }) => {
  await openCard(page);
  await setSplit(page, { successes: 5, rating: 1 });
  await page.locator('.cbt-next-btn').click();     // Next Turn
  await expect(numOf(page, 'successes')).toHaveText('5');
  await page.locator('.cbt-round-btn').click();    // Next Round
  await expect(preview(page)).toContainText('5 successes, rating 1');
  await expect(page.locator('.cbt-round-lbl')).toHaveText('Round 2');
});

// ── AC8 - every new control is a real 44x44px tap target ────────────────────

test('cmb.3c AC8 - the steppers, the type toggle and Apply all measure a real 44px box', async ({ page }) => {
  await openCard(page);
  await expectAllTappable(page, '[data-cbt-split-step]', 'split stepper');
  await expectAllTappable(page, '[data-cbt-split-type]', 'split type toggle');
  await expectAllTappable(page, '[data-cbt-split-apply]', 'Apply Split');
});

test('cmb.3c AC8 - still real tap targets on a phone viewport, with a populated preview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCard(page);
  await setSplit(page, { successes: 5, rating: 1 });
  await expectAllTappable(page, '[data-cbt-split-step]', 'split stepper at 390px');
  await expectAllTappable(page, '[data-cbt-split-type]', 'split type toggle at 390px');
  await expectAllTappable(page, '[data-cbt-split-apply]', 'Apply Split at 390px');

  // The long both-audiences sentence must not push the card off the screen.
  const fits = await page.evaluate(() => {
    const c = document.querySelector('[data-cbt-card="cmb3c-wan"]');
    return { right: c.getBoundingClientRect().right, vw: window.innerWidth,
             overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(fits.right).toBeLessThanOrEqual(fits.vw + 1);
  expect(fits.overflow).toBeLessThanOrEqual(1);
});

test('cmb.3c AC8 - no calculator control overlaps another control on the card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCard(page);
  await setSplit(page, { successes: 5, rating: 1 });
  const rects = await page.$$eval(
    '[data-cbt-card="cmb3c-wan"] [data-cbt-split-step], [data-cbt-card="cmb3c-wan"] [data-cbt-split-type], [data-cbt-card="cmb3c-wan"] [data-cbt-split-apply], [data-cbt-card="cmb3c-wan"] .cbt-dmg-btn, [data-cbt-card="cmb3c-wan"] [data-cbt-attack]',
    els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  expect(rects.length).toBeGreaterThan(10);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlaps, `controls ${i} and ${j} overlap, so one steals the other's taps`).toBe(false);
    }
  }
});

test('cmb.3c AC8 - a real touchscreen tap drives the whole calculator', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCard(page);
  await stepBtn(page, 'successes', '1').tap();
  await stepBtn(page, 'successes', '1').tap();
  await stepBtn(page, 'rating', '1').tap();
  await typeBtn(page, 'aggravated').tap();
  await expect(preview(page)).toContainText('2 successes, rating 1 → 1 Aggravated');
  await applyBtn(page).tap();
  await expect.poll(() => damageOf(page)).toEqual({ bashing: 2, lethal: 0, aggravated: 1 });
});
