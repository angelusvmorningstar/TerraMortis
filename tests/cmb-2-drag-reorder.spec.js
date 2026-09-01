// cmb.2 - drag-to-reorder the turn line, and Reset to Rolled Order.
//
// Every acceptance criterion in this story is about what real pointer events do
// to real rendered boxes, so all of it lives here rather than in a vitest suite:
// there is no layout engine in this repo's node environment and no pointer event
// loop either.
//
//   AC1  a drag reorders _scene.combatants and changes nothing else
//   AC2  no combatant's rolled initiative is ever mutated by a drag
//   AC3  the dragged card lifts; every card passed over keeps its full
//        collapsed height and legibility
//   AC4  the gesture is Pointer Events, not HTML5 mouse drag-and-drop
//   AC5  a release over empty space, or a cancel, leaves the order alone AND
//        never leaves _drag stuck active (cmb.1's own review finding)
//   AC6  expansion still works after a reorder, travelling with the combatant
//   AC7  Reset to Rolled Order restores the dice order, tie-break included
//   AC8  the motivating case end to end: roll, bump, survive a turn/round
//        cycle, reset
//   AC9  the new controls are still real >=44x44px targets
//
// House style follows tests/cmb-1-combat-card-touch-targets.spec.js: Service
// Workers blocked (this app's sw.js intercepts /api/ ahead of page.route() and
// can serve real production data), every API call stubbed, and the roster
// injected straight into suiteState rather than fetched.

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

const MIN_TAP = 44;
const SESSION_KEY = 'tm_combat_scene';

function attrs(over = {}) {
  const base = {
    Intelligence: 2, Wits: 2, Resolve: 2,
    Strength: 3, Dexterity: 3, Stamina: 2,
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

// Three combatants with three DIFFERENT initiative bases (Dexterity +
// Composure), so the rolled order is decidable from the fixture alone and the
// initBase tie-break has something real to break with.
//   Alpha 5+4 = 9   Bravo 4+3 = 7   Cass 3+2 = 5
const CHARS = [
  { _id: 'cmb2-alpha', name: 'Alpha', moniker: 'Alpha', blood_potency: 2,
    attributes: attrs({ Dexterity: 5, Composure: 4 }), skills: skills(), merits: [], disciplines: {}, equipment: [] },
  { _id: 'cmb2-bravo', name: 'Bravo', moniker: 'Bravo', blood_potency: 1,
    attributes: attrs({ Dexterity: 4, Composure: 3 }), skills: skills(), merits: [], disciplines: {}, equipment: [] },
  { _id: 'cmb2-cass', name: 'Cass', moniker: 'Cass', blood_potency: 1,
    attributes: attrs({ Dexterity: 3, Composure: 2 }), skills: skills(), merits: [], disciplines: {}, equipment: [] },
];

const ALPHA = 'cmb2-alpha';
const BRAVO = 'cmb2-bravo';
const CASS  = 'cmb2-cass';

// ── Mounting ─────────────────────────────────────────────────────────────────

async function mountCombat(page) {
  await page.route('**/api/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  await page.goto('/');
  // Let the app's own boot finish first; it writes suiteState.chars exactly once.
  await page.waitForTimeout(1500);

  const err = await page.evaluate(async (chars) => {
    try {
      const state = (await import('/js/suite/data.js')).default;
      const combat = await import('/js/game/combat-tab.js');
      sessionStorage.removeItem('tm_combat_scene');
      state.chars = chars;
      const host = document.createElement('div');
      host.id = 'cmb2-host';
      document.body.appendChild(host);
      window.__cmb2 = { state, chars };
      combat.initCombatTab(host);
      return null;
    } catch (e) {
      return String((e && e.stack) || e);
    }
  }, CHARS);
  expect(err, 'the Combat tab failed to render in the browser').toBeNull();
}

/**
 * Park all three and roll, with the d10 forced so the resulting order is known.
 * `dice` is consumed in park order (Alpha, Bravo, Cass), which is the order
 * rollInitiative() itself iterates in.
 */
async function rollScene(page, dice = [5, 5, 5]) {
  await page.evaluate((d) => {
    window.__cmb2.state.chars = window.__cmb2.chars;  // boot must not win a late race
    window.combatAddChar('cmb2-alpha');
    window.combatAddChar('cmb2-bravo');
    window.combatAddChar('cmb2-cass');
    window.combatStart();
    const orig = Math.random;
    let i = 0;
    Math.random = () => {
      const die = d[Math.min(i++, d.length - 1)];
      return (die - 1) / 10 + 0.01;   // d10() floors this * 10, so it lands on `die`
    };
    try { window.combatRollInit(); } finally { Math.random = orig; }
  }, dice);
  await expect(page.locator('.cbt-card')).toHaveCount(3);
}

// ── Reading the truth back ───────────────────────────────────────────────────

/** The order as actually rendered. */
function domOrder(page) {
  return page.$$eval('[data-cbt-card]', els => els.map(e => e.getAttribute('data-cbt-card')));
}

/** The persisted scene - proves the drag went through the existing _save(). */
function savedScene(page) {
  return page.evaluate(k => JSON.parse(sessionStorage.getItem(k) || 'null'), SESSION_KEY);
}

/** Every combatant keyed by charId, for a field-by-field before/after compare. */
async function combatantsById(page) {
  const scene = await savedScene(page);
  const out = {};
  for (const cb of (scene ? scene.combatants : [])) out[cb.charId] = cb;
  return out;
}

function rectOf(page, selector) {
  return page.$eval(selector, el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, bottom: r.bottom };
  });
}

function cardHeights(page) {
  return page.$$eval('[data-cbt-card]', els => els.map(e => ({
    id: e.getAttribute('data-cbt-card'),
    h: Math.round(e.getBoundingClientRect().height * 100) / 100,
  })));
}

/**
 * Wait for the page to stop moving on its own before measuring anything.
 *
 * Measured during this story's own dev pass: a freshly-rendered card is 106px
 * tall and settles to 102px roughly a second later as the web fonts swap in,
 * with no drag anywhere near it. Taking a "before" baseline inside that window
 * makes an AC3 comparison read a 4px font reflow as a drag-induced compression.
 * The double measurement below is the real guard - it fails loudly if the page
 * is still moving, rather than letting the AC assert against a moving target.
 */
async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const a = await cardHeights(page);
  await page.waitForTimeout(400);
  const b = await cardHeights(page);
  expect(b, 'the page is still reflowing on its own, so no height measurement here means anything').toEqual(a);
  return b;
}

// ── The gesture, as real dispatched Pointer Events ───────────────────────────

const PID = 1;
const grip = id => `[data-cbt-card="${id}"] .cbt-grip`;

async function pointerDownOnGrip(page, id) {
  const g = await rectOf(page, grip(id));
  await page.locator(grip(id)).dispatchEvent('pointerdown',
    { pointerId: PID, isPrimary: true, clientX: g.cx, clientY: g.cy });
  return g;
}

async function pointerTo(page, id, type, x, y) {
  await page.locator(grip(id)).dispatchEvent(type,
    { pointerId: PID, isPrimary: true, clientX: x, clientY: y });
}

/** A complete drag of `fromId` onto `ontoId`'s slot. */
async function dragOnto(page, fromId, ontoId) {
  await pointerDownOnGrip(page, fromId);
  const t = await rectOf(page, `[data-cbt-card="${ontoId}"]`);
  await pointerTo(page, fromId, 'pointermove', t.cx, t.cy);
  await pointerTo(page, fromId, 'pointerup', t.cx, t.cy);
}

/** A point below the last card, inside the page but over no card at all. */
async function emptyPoint(page) {
  return page.$$eval('[data-cbt-card]', els => {
    let bottom = 0, cx = 0;
    for (const e of els) {
      const r = e.getBoundingClientRect();
      bottom = Math.max(bottom, r.bottom);
      cx = r.x + r.width / 2;
    }
    return { x: cx, y: bottom + 60 };
  });
}

const dragState = page => page.evaluate(() => window.combatDragState());

// ── AC1 / AC2 ────────────────────────────────────────────────────────────────

test('cmb.2 AC1 - a drag reorders the line and touches nothing else', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  expect(await domOrder(page)).toEqual([ALPHA, BRAVO, CASS]);

  const before = await combatantsById(page);
  await dragOnto(page, CASS, ALPHA);

  expect(await domOrder(page), 'Cass should now hold the top slot').toEqual([CASS, ALPHA, BRAVO]);
  expect((await savedScene(page)).combatants.map(c => c.charId),
    'the reorder must persist through the existing _save()').toEqual([CASS, ALPHA, BRAVO]);

  // Field-by-field, for EVERY combatant and not just the one that moved.
  const after = await combatantsById(page);
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  for (const id of Object.keys(before)) {
    expect(after[id], `${id} changed a field it had no business changing`).toEqual(before[id]);
  }
});

test('cmb.2 AC2 - no combatant rolled initiative is mutated by a reorder', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);

  const before = await combatantsById(page);
  const rolled = Object.fromEntries(Object.entries(before).map(([id, cb]) => [id, cb.initiative]));
  // Alpha 9 + 5, Bravo 7 + 5, Cass 5 + 5 - asserted so a silent fixture change
  // cannot make this test vacuously true.
  expect(rolled).toEqual({ [ALPHA]: 14, [BRAVO]: 12, [CASS]: 10 });

  await dragOnto(page, CASS, ALPHA);
  await dragOnto(page, BRAVO, CASS);

  const after = await combatantsById(page);
  for (const id of Object.keys(rolled)) {
    expect(after[id].initiative, `${id}'s rolled initiative moved`).toBe(rolled[id]);
    expect(after[id].initBase, `${id}'s initiative base moved`).toBe(before[id].initBase);
  }
  // And the rail still shows the untouched number next to each name.
  const rail = await page.$$eval('[data-cbt-card]', els => els.map(e => ({
    id: e.getAttribute('data-cbt-card'),
    init: Number(e.querySelector('.cbt-init-slot').textContent.trim()),
  })));
  for (const r of rail) expect(r.init).toBe(rolled[r.id]);
});

// ── AC3 ──────────────────────────────────────────────────────────────────────

test('cmb.2 AC3 - the dragged card lifts and every card passed over keeps its height', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);

  const before = await settle(page);
  expect(before).toHaveLength(3);

  // Hold the drag open over Bravo rather than completing it, and measure there.
  await pointerDownOnGrip(page, CASS);
  const bravo = await rectOf(page, `[data-cbt-card="${BRAVO}"]`);
  await pointerTo(page, CASS, 'pointermove', bravo.cx, bravo.cy);

  const during = await cardHeights(page);
  expect(during.map(c => c.id), 'the list itself must not have reordered mid-drag')
    .toEqual(before.map(c => c.id));
  for (let i = 0; i < before.length; i++) {
    expect(during[i].h, `${before[i].id} changed height mid-drag (${before[i].h} -> ${during[i].h})`)
      .toBe(before[i].h);
  }

  // The dragged card is the only one that looks different.
  const painted = await page.$$eval('[data-cbt-card]', els => els.map(e => ({
    id: e.getAttribute('data-cbt-card'),
    dragging: e.classList.contains('cbt-card-dragging'),
    target: e.classList.contains('cbt-drop-target'),
    opacity: getComputedStyle(e).opacity,
    shadow: getComputedStyle(e).boxShadow,
  })));
  const dragged = painted.find(p => p.id === CASS);
  expect(dragged.dragging, 'the dragged card carries no lift treatment').toBe(true);
  expect(Number(dragged.opacity), 'the dragged card is not visibly lifted').toBeLessThan(1);
  expect(dragged.shadow, 'the dragged card has no shadow').not.toBe('none');
  expect(painted.filter(p => p.dragging), 'more than one card is lifted').toHaveLength(1);
  expect(painted.find(p => p.id === BRAVO).target, 'the drop target is not signposted').toBe(true);

  // Legibility, not just geometry: the passed-over card still shows the Name
  // and Health a drop decision is made on.
  const passed = page.locator(`[data-cbt-card="${BRAVO}"]`);
  await expect(passed.locator('.cbt-name')).toBeVisible();
  await expect(passed.locator('.cbt-name')).toHaveText('Bravo');
  await expect(passed.locator('.cbt-mini-hp')).toBeVisible();
  await expect(passed.locator('.cbt-init-slot')).toBeVisible();
  const clipped = await page.$eval(`[data-cbt-card="${BRAVO}"] .cbt-card-hd`,
    el => el.scrollHeight > el.clientHeight + 1);
  expect(clipped, 'the passed-over card header is clipped mid-drag').toBe(false);

  await pointerTo(page, CASS, 'pointerup', bravo.cx, bravo.cy);
});

// ── AC4 ──────────────────────────────────────────────────────────────────────

test('cmb.2 AC4 - the reorder is driven by Pointer Events, not HTML5 drag-and-drop', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);

  // A complete mouse-only HTML5 sequence must do nothing at all: if this
  // reordered anything, the implementation would be the desktop-only API this
  // story rules out, and a touchscreen would never fire it.
  await page.evaluate(({ from, to }) => {
    const src = document.querySelector(`[data-cbt-card="${from}"] .cbt-grip`);
    const dst = document.querySelector(`[data-cbt-card="${to}"]`);
    for (const [el, type] of [[src, 'dragstart'], [dst, 'dragenter'], [dst, 'dragover'], [dst, 'drop'], [src, 'dragend']]) {
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    }
  }, { from: CASS, to: ALPHA });
  expect(await domOrder(page), 'an HTML5 drag sequence moved a card').toEqual([ALPHA, BRAVO, CASS]);

  // The same move, as real Pointer Events, does work.
  await dragOnto(page, CASS, ALPHA);
  expect(await domOrder(page)).toEqual([CASS, ALPHA, BRAVO]);
});

// ── AC5 - the gap cmb.1's review left open ───────────────────────────────────

test('cmb.2 AC5 - releasing over empty space changes nothing and clears the gesture', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);

  await pointerDownOnGrip(page, CASS);
  expect(await dragState(page)).toEqual({ active: true, charId: CASS });

  const empty = await emptyPoint(page);
  await pointerTo(page, CASS, 'pointermove', empty.x, empty.y);
  await pointerTo(page, CASS, 'pointerup', empty.x, empty.y);

  expect(await domOrder(page), 'a drop into empty space reordered the line').toEqual([ALPHA, BRAVO, CASS]);
  expect(await dragState(page), 'the gesture stayed stuck active').toEqual({ active: false, charId: null });
  expect(await page.locator('.cbt-card-dragging').count(), 'the lift treatment was left behind').toBe(0);
});

test('cmb.2 AC5 - a cancelled gesture changes nothing and clears the gesture', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);

  await pointerDownOnGrip(page, CASS);
  const alpha = await rectOf(page, `[data-cbt-card="${ALPHA}"]`);
  await pointerTo(page, CASS, 'pointermove', alpha.cx, alpha.cy);
  await pointerTo(page, CASS, 'pointercancel', alpha.cx, alpha.cy);

  expect(await domOrder(page), 'a cancelled drag still moved a card').toEqual([ALPHA, BRAVO, CASS]);
  expect(await dragState(page)).toEqual({ active: false, charId: null });
  expect(await page.locator('.cbt-drop-target').count()).toBe(0);
});

test('cmb.2 AC5 - a release that lands nowhere near the grip still ends the drag', async ({ page }) => {
  // The exact shape cmb.1's Senior Developer Review flagged: the grip's own
  // element-scoped pointerup can never fire, because a real reorder drag ends
  // with the finger somewhere else entirely.
  await mountCombat(page);
  await rollScene(page);

  await pointerDownOnGrip(page, CASS);
  expect(await dragState(page)).toEqual({ active: true, charId: CASS });

  const alpha = await rectOf(page, `[data-cbt-card="${ALPHA}"]`);
  await page.evaluate(({ x, y, pid }) => {
    // Dispatched on <body>, never on the grip, and never on the card either.
    document.body.dispatchEvent(new PointerEvent('pointerup',
      { bubbles: true, cancelable: true, composed: true, pointerId: pid, clientX: x, clientY: y }));
  }, { x: alpha.cx, y: alpha.cy, pid: PID });

  expect(await dragState(page), 'the drag stayed active after an off-element release')
    .toEqual({ active: false, charId: null });
  expect(await domOrder(page), 'the off-element release should still complete the drop')
    .toEqual([CASS, ALPHA, BRAVO]);
});

test('cmb.2 AC5 - a second drag still works after an abandoned one', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);

  await pointerDownOnGrip(page, CASS);
  const empty = await emptyPoint(page);
  await pointerTo(page, CASS, 'pointerup', empty.x, empty.y);
  expect(await domOrder(page)).toEqual([ALPHA, BRAVO, CASS]);

  await dragOnto(page, CASS, ALPHA);
  expect(await domOrder(page), 'the stuck-gesture state blocked the next drag').toEqual([CASS, ALPHA, BRAVO]);
});

// ── AC6 ──────────────────────────────────────────────────────────────────────

test('cmb.2 AC6 - the expanded state travels with the combatant across a reorder', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);

  await page.locator(`[data-cbt-card="${CASS}"] .cbt-card-hd`).click();
  await expect(page.locator('.cbt-card-exp')).toHaveCount(1);
  await expect(page.locator(`[data-cbt-card="${CASS}"] .cbt-card-hd`)).toHaveAttribute('aria-expanded', 'true');

  await dragOnto(page, CASS, ALPHA);
  expect(await domOrder(page)).toEqual([CASS, ALPHA, BRAVO]);

  // Cass moved to index 0 and is still the open one - the state followed the
  // combatant, not the slot Cass used to sit in.
  await expect(page.locator('.cbt-card-exp')).toHaveCount(1);
  await expect(page.locator(`[data-cbt-card="${CASS}"] .cbt-card-hd`)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(`[data-cbt-card="${ALPHA}"] .cbt-card-hd`)).toHaveAttribute('aria-expanded', 'false');

  // And cmb.1's single-expanded-card rule still holds after the reorder.
  await page.locator(`[data-cbt-card="${ALPHA}"] .cbt-card-hd`).click();
  await expect(page.locator('.cbt-card-exp')).toHaveCount(1);
  await expect(page.locator(`[data-cbt-card="${ALPHA}"] .cbt-card-hd`)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(`[data-cbt-card="${CASS}"] .cbt-card-hd`)).toHaveAttribute('aria-expanded', 'false');

  await page.locator(`[data-cbt-card="${ALPHA}"] .cbt-card-hd`).click();
  await expect(page.locator('.cbt-card-exp')).toHaveCount(0);
});

// ── AC7 ──────────────────────────────────────────────────────────────────────

test('cmb.2 AC7 - Reset to Rolled Order restores the dice order after real drags', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  expect(await domOrder(page)).toEqual([ALPHA, BRAVO, CASS]);

  await dragOnto(page, CASS, ALPHA);
  await dragOnto(page, BRAVO, CASS);
  const scrambled = await domOrder(page);
  expect(scrambled, 'the list was never actually dragged out of rolled order')
    .not.toEqual([ALPHA, BRAVO, CASS]);

  await page.locator('.cbt-reset-btn').click();
  expect(await domOrder(page)).toEqual([ALPHA, BRAVO, CASS]);
  expect((await savedScene(page)).combatants.map(c => c.charId)).toEqual([ALPHA, BRAVO, CASS]);
});

test('cmb.2 AC7 - Reset re-applies the initBase tie-break, not just a stable sort', async ({ page }) => {
  await mountCombat(page);
  // Alpha 9 + 5 = 14, Bravo 7 + 7 = 14, Cass 5 + 5 = 10. Alpha and Bravo tie on
  // the rolled total, so only the initBase tie-break can separate them - which
  // is the half of rollInitiative()'s comparator a naive reset would drop.
  await rollScene(page, [5, 7, 5]);
  const rolled = await combatantsById(page);
  expect(rolled[ALPHA].initiative).toBe(14);
  expect(rolled[BRAVO].initiative).toBe(14);
  expect(await domOrder(page)).toEqual([ALPHA, BRAVO, CASS]);

  await dragOnto(page, BRAVO, ALPHA);
  expect(await domOrder(page)).toEqual([BRAVO, ALPHA, CASS]);

  await page.locator('.cbt-reset-btn').click();
  expect(await domOrder(page), 'the tie was not broken on initBase descending')
    .toEqual([ALPHA, BRAVO, CASS]);
});

// ── AC8 ──────────────────────────────────────────────────────────────────────

test('cmb.2 AC8 - roll, bump, hold through a turn and round cycle, then reset', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);
  const rolled = await combatantsById(page);
  expect(await domOrder(page)).toEqual([ALPHA, BRAVO, CASS]);
  await expect(page.locator('.cbt-round-lbl')).toHaveText('Round 1');

  // The temporary bump: Cass acts first this round.
  await dragOnto(page, CASS, ALPHA);
  expect(await domOrder(page)).toEqual([CASS, ALPHA, BRAVO]);
  // The turn cursor followed the combatant whose turn it was, not the slot.
  await expect(page.locator(`[data-cbt-card="${ALPHA}"]`)).toHaveClass(/cbt-active/);

  await page.locator('.cbt-next-btn').click();          // Next Turn
  expect(await domOrder(page), 'Next Turn disturbed the bump').toEqual([CASS, ALPHA, BRAVO]);
  await page.locator('.cbt-round-btn').click();         // Next Round
  await expect(page.locator('.cbt-round-lbl')).toHaveText('Round 2');
  expect(await domOrder(page), 'Next Round disturbed the bump').toEqual([CASS, ALPHA, BRAVO]);

  // The dice result was never lost while the bump was in force.
  const bumped = await combatantsById(page);
  for (const id of [ALPHA, BRAVO, CASS]) expect(bumped[id].initiative).toBe(rolled[id].initiative);

  await page.locator('.cbt-reset-btn').click();
  expect(await domOrder(page), 'the bump survived the reset').toEqual([ALPHA, BRAVO, CASS]);
  await expect(page.locator('.cbt-round-lbl'), 'reset must not restart the encounter').toHaveText('Round 2');
  const reset = await combatantsById(page);
  for (const id of [ALPHA, BRAVO, CASS]) expect(reset[id].initiative).toBe(rolled[id].initiative);
});

// ── AC9 ──────────────────────────────────────────────────────────────────────

test('cmb.2 AC9 - the Reset button and the drag handle are real 44px targets', async ({ page }) => {
  await mountCombat(page);
  await rollScene(page);

  const measured = await page.$$eval('.cbt-reset-btn, .cbt-grip', els => els.map(el => {
    const r = el.getBoundingClientRect();
    return { cls: el.className, w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 };
  }));
  expect(measured.length, 'nothing rendered to measure').toBe(4);   // one Reset, three grips
  for (const b of measured) {
    expect(b.w, `${b.cls} is ${b.w}px wide`).toBeGreaterThanOrEqual(MIN_TAP);
    expect(b.h, `${b.cls} is ${b.h}px tall`).toBeGreaterThanOrEqual(MIN_TAP);
  }

  // And the new toolbar button does not sit on top of its neighbours.
  const rects = await page.$$eval('.cbt-next-btn, .cbt-round-btn, .cbt-reset-btn, .cbt-end-btn',
    els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlaps, `toolbar buttons ${i} and ${j} overlap`).toBe(false);
    }
  }
});
