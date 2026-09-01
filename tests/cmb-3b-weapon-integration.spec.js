// cmb.3b - equipped-weapon integration into the Attack modal.
//
// House style follows tests/cmb-3a-attack-modal.spec.js (which this story
// extends rather than replaces): Service Workers blocked (this app's sw.js
// intercepts /api/ ahead of page.route() and can serve real production data -
// see memory/project-sw-leaks-live-data-in-playwright-tests.md), every API call
// stubbed, the roster injected straight into suiteState, and initCombatTab()
// driven against our own host rather than through app.js's own nav.
//
// The catalogue is loaded through the REAL cache module (refetchCatalogue() over
// a stubbed GET /api/equipment_catalogue), not by monkey-patching the lookup, so
// what these tests exercise is the same catalogue_id -> getCatalogueEntry path
// editor/sheet.js and suite/roll-v2.js resolve their own weapons through.
//
// WHY THE FIXTURES ARE WHAT THEY ARE - every one of them is chosen so a wrong
// implementation gives a visibly different answer, not an accidentally-correct
// one:
//
//   Wan carries a Machete (melee, +1 Lethal) AND a stashed Greatsword (melee,
//   +3 Lethal). Same type, different name, different rating - so a state filter
//   that leaks `stashed` produces a chip that is impossible to mistake for a
//   correct one (AC2). The same shape again for ranged: a worn Revolver against
//   a `lost` Crossbow.
//
//   Wan's two equipped melee weapons differ in BOTH damage_mod and damage_type
//   (Machete +1 Lethal, Cudgel +2 Bashing), so a chip that renders one weapon's
//   rating against another's name cannot pass.
//
//   The Throwing Knife is +0 Lethal. `damage_mod: 0` is falsy, so an
//   implementation that tests truthiness instead of `!= null` silently drops a
//   real rating - and thrown weapons are exactly where that happens, since the
//   live catalogue has no thrown example at all (this story's Pre-flight check),
//   making this whole fixture synthetic by necessity.
//
//   Wan also carries a worn Flak Jacket (armour-shaped combat_gear), Lockpicks
//   (skill_gear), and one dangling catalogue_id. None may ever surface as a
//   weapon chip: bucket alone is not the discriminator since EQC-1 merged
//   weapons and armour into `combat_gear`.
//
//   REED carries a Greatsword. Weapons come from the ATTACKER, so a "Greatsword"
//   chip appearing while Reed is the target means the wrong character's
//   equipment array is being read.

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block', hasTouch: true });

const MIN_TAP = 44;

// Wan's own numbers, restated so the expectations below read as arithmetic
// rather than as magic constants (same values as cmb.3a's own fixture).
const STR = 4, DEX = 3;
const BRAWL = 3;      // 2 dots + 1 bonus dot, via skTotal
const WEAPONRY = 1;
const FIREARMS = 3;
const ATHLETICS = 2;
const REED_DEF = 4;
const COLE_DEF = 6;

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

// Shaped exactly like the live `tm_game.equipment_catalogue` documents confirmed
// in this story's Pre-flight section: `{ _id, name, bucket: 'combat_gear',
// weapon_type, damage_mod, damage_type, availability, tags }`. The Throwing
// Knife is the one synthetic entry - the live catalogue has no `thrown` example.
const CAT = [
  { _id: 'cat-machete',    name: 'Machete',        bucket: 'combat_gear', weapon_type: 'melee',  damage_mod: 1, damage_type: 'lethal',  availability: 2, tags: [] },
  { _id: 'cat-cudgel',     name: 'Cudgel',         bucket: 'combat_gear', weapon_type: 'melee',  damage_mod: 2, damage_type: 'bashing', availability: 1, tags: [] },
  { _id: 'cat-greatsword', name: 'Greatsword',     bucket: 'combat_gear', weapon_type: 'melee',  damage_mod: 3, damage_type: 'lethal',  availability: 4, tags: [] },
  { _id: 'cat-revolver',   name: 'Revolver',       bucket: 'combat_gear', weapon_type: 'ranged', damage_mod: 2, damage_type: 'lethal',  availability: 3, tags: [] },
  { _id: 'cat-crossbow',   name: 'Crossbow',       bucket: 'combat_gear', weapon_type: 'ranged', damage_mod: 1, damage_type: 'lethal',  availability: 3, tags: [] },
  { _id: 'cat-knife',      name: 'Throwing Knife', bucket: 'combat_gear', weapon_type: 'thrown', damage_mod: 0, damage_type: 'lethal',  availability: 1, tags: [] },
  // Armour-shaped combat_gear: same bucket as every weapon above, no weapon_type.
  { _id: 'cat-flak',       name: 'Flak Jacket',    bucket: 'combat_gear', armour_value: 3, defence_penalty: 1, availability: 2, tags: [] },
  // Right state, wrong bucket entirely.
  { _id: 'cat-lockpicks',  name: 'Lockpicks',      bucket: 'skill_gear', bonus_dice: 2, skill_domain: 'Larceny', availability: 1, tags: [] },
];

const WAN_EQUIPMENT = [
  { catalogue_id: 'cat-machete',    state: 'carried', notes: '' },   // melee  +1 Lethal   -> chip
  { catalogue_id: 'cat-greatsword', state: 'stashed', notes: '' },   // melee  +3 Lethal   -> NEVER (AC2)
  { catalogue_id: 'cat-cudgel',     state: 'active',  notes: '' },   // melee  +2 Bashing  -> chip
  { catalogue_id: 'cat-revolver',   state: 'worn',    notes: '' },   // ranged +2 Lethal   -> chip
  { catalogue_id: 'cat-crossbow',   state: 'lost',    notes: '' },   // ranged +1 Lethal   -> NEVER (AC2)
  { catalogue_id: 'cat-knife',      state: 'carried', notes: '' },   // thrown +0 Lethal   -> chip
  { catalogue_id: 'cat-flak',       state: 'worn',    notes: '' },   // armour-shaped      -> NEVER
  { catalogue_id: 'cat-lockpicks',  state: 'carried', notes: '' },   // skill_gear         -> NEVER
  { catalogue_id: 'cat-not-in-catalogue', state: 'carried', notes: '' },  // dangling -> NEVER, no crash
];

const CHARS = [
  {
    _id: 'cmb3b-wan', name: 'Wan Zhu', moniker: 'Wan', blood_potency: 2,
    attributes: attrs(), skills: skills(), merits: [], disciplines: {},
    equipment: WAN_EQUIPMENT,
    // Pinned so the Flak Jacket's own defence_penalty cannot quietly move the
    // arithmetic these tests assert (defenceForDisplay reads derived.defence
    // first). Wan is the attacker, so his own Defence never enters a pool here
    // anyway - this keeps it that way if the fixture is ever reused.
    derived: { defence: 2 },
  },
  {
    _id: 'cmb3b-reed', name: 'Reed', moniker: 'Reed', blood_potency: 1,
    attributes: attrs({ Dexterity: 2 }), skills: skills(), merits: [], disciplines: {},
    // The target's own weapon. It must never appear among the attacker's chips.
    equipment: [{ catalogue_id: 'cat-greatsword', state: 'carried', notes: '' }],
    derived: { defence: REED_DEF },
  },
  {
    // Carries nothing at all - the AC4 "no matching weapon is not an error"
    // attacker.
    _id: 'cmb3b-cole', name: 'Cole', moniker: 'Cole', blood_potency: 1,
    attributes: attrs({ Dexterity: 1 }), skills: skills(), merits: [], disciplines: {},
    equipment: [],
    derived: { defence: COLE_DEF },
  },
];

/** Boot the page, load the catalogue, inject the roster, render the tab. */
async function mountCombat(page) {
  await page.route('**/api/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  // Registered second, so it wins over the catch-all above for this one path.
  await page.route('**/api/equipment_catalogue**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(CAT),
  }));
  await page.goto('/');
  await page.waitForTimeout(1500);   // let app.js's own boot write suiteState.chars once

  const err = await page.evaluate(async ({ chars }) => {
    try {
      const state = (await import('/js/suite/data.js')).default;
      const cache = await import('/js/data/equipment-catalogue-cache.js');
      const combat = await import('/js/game/combat-tab.js');
      // The real cache, over the real API path - app.js's own boot already
      // called loadCatalogue() against the empty catch-all stub, so this is the
      // refetch the WS update path uses, not a bespoke back door.
      await cache.refetchCatalogue();
      if (!cache.getCatalogueEntry('cat-machete')) throw new Error('catalogue fixture did not load');
      sessionStorage.removeItem('tm_combat_scene');
      state.chars = chars;
      const host = document.createElement('div');
      host.id = 'cmb3b-host';
      document.body.appendChild(host);
      window.__cmb3b = { state, chars };
      // Record navigation instead of performing it - see cmb.3a's own note.
      window.__nav = [];
      window.goTab = t => { window.__nav.push(t); };
      combat.initCombatTab(host);
      return null;
    } catch (e) {
      return String(e && e.stack || e);
    }
  }, { chars: CHARS });
  expect(err, 'the Combat tab failed to render in the browser').toBeNull();
}

async function rollScene(page) {
  await page.evaluate(() => {
    window.__cmb3b.state.chars = window.__cmb3b.chars;   // boot must not win a late race
    window.combatAddChar('cmb3b-wan');
    window.combatAddChar('cmb3b-reed');
    window.combatAddChar('cmb3b-cole');
    window.combatStart();
    window.combatRollInit();
  });
  await expect(page.locator('.cbt-card')).toHaveCount(3);
}

/** The full real sequence an ST performs to get the modal open for one attacker. */
async function openModalFor(page, charId) {
  await mountCombat(page);
  await rollScene(page);
  await page.locator(`[data-cbt-card="${charId}"] .cbt-card-hd`).click();
  await expect(page.locator(`[data-cbt-card="${charId}"] .cbt-card-exp`)).toHaveCount(1);
  await page.locator(`[data-cbt-attack="${charId}"]`).click();
  await expect(page.locator('.cbt-atk-overlay')).toBeVisible();
}

const openModal = page => openModalFor(page, 'cmb3b-wan');

const poolOf = page => page.locator('[data-cbt-atk-pool]');
const typeRow = (page, key) => page.locator(`[data-cbt-atk-type="${key}"]`);
const targetPill = (page, id) => page.locator(`[data-cbt-atk-target="${id}"]`);
const weaponChips = page => page.locator('.cbt-atk-weapon');
const weaponNamed = (page, name) => page.locator('.cbt-atk-weapon', { hasText: name });

async function poolValue(page) {
  const txt = await poolOf(page).innerText();
  return Number(String(txt).replace(/[^0-9-]/g, ''));
}

/** The chip labels as rendered, whitespace-normalised. */
async function chipTexts(page) {
  return page.$$eval('.cbt-atk-weapon', els =>
    els.map(el => el.innerText.replace(/\s+/g, ' ').trim()));
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

// ── AC1 - equipped weapons of the selected type appear, named and rated ──────

test('cmb.3b AC1 - Melee lists every equipped melee weapon, named and rated', async ({ page }) => {
  await openModal(page);
  // Nothing before a type is chosen - the chips belong to a type, not to the
  // modal at large.
  await expect(weaponChips(page)).toHaveCount(0);

  await typeRow(page, 'melee').click();
  await expect(weaponChips(page)).toHaveCount(2);
  expect(await chipTexts(page)).toEqual(['Machete +1 Lethal', 'Cudgel +2 Bashing']);
});

test('cmb.3b AC1 - Ranged lists the equipped ranged weapon only', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'ranged').click();
  await expect(weaponChips(page)).toHaveCount(1);
  expect(await chipTexts(page)).toEqual(['Revolver +2 Lethal']);
  // The melee weapons are genuinely filtered out by type, not merely reordered.
  await expect(weaponNamed(page, 'Machete')).toHaveCount(0);
  await expect(weaponNamed(page, 'Cudgel')).toHaveCount(0);
});

test('cmb.3b AC1 - Thrown lists the thrown weapon, +0 rating and all', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'thrown').click();
  await expect(weaponChips(page)).toHaveCount(1);
  // damage_mod 0 is falsy. A truthiness check instead of `!= null` renders
  // "Throwing Knife Lethal" here and this assertion is what catches it.
  expect(await chipTexts(page)).toEqual(['Throwing Knife +0 Lethal']);
});

test('cmb.3b AC1 - the chips come from the ATTACKER, never from the target', async ({ page }) => {
  await openModal(page);
  await targetPill(page, 'cmb3b-reed').click();   // Reed carries a Greatsword
  await typeRow(page, 'melee').click();
  await expect(weaponChips(page)).toHaveCount(2);
  await expect(weaponNamed(page, 'Greatsword')).toHaveCount(0);
});

// ── AC2 - stashed and lost never appear ─────────────────────────────────────

test('cmb.3b AC2 - a stashed weapon of the matching type never appears', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'melee').click();

  // The Greatsword IS in Wan's equipment[] and IS a melee weapon. It is stashed,
  // so it is not a chip - while the carried Machete beside it in the same array
  // is, which is what makes this a filter test rather than a rendering one.
  await expect(weaponNamed(page, 'Greatsword')).toHaveCount(0);
  await expect(weaponNamed(page, 'Machete')).toHaveCount(1);
  const present = await page.evaluate(() => {
    const wan = window.__cmb3b.chars.find(c => c._id === 'cmb3b-wan');
    const g = wan.equipment.find(e => e.catalogue_id === 'cat-greatsword');
    return { inArray: !!g, state: g && g.state };
  });
  expect(present, 'the stashed weapon must really be in the fixture for this to prove anything')
    .toEqual({ inArray: true, state: 'stashed' });
});

test('cmb.3b AC2 - a lost weapon of the matching type never appears', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'ranged').click();
  await expect(weaponNamed(page, 'Crossbow')).toHaveCount(0);
  await expect(weaponNamed(page, 'Revolver')).toHaveCount(1);
});

test('cmb.3b AC2 - all three on-me states qualify, and only those three', async ({ page }) => {
  await openModal(page);
  // carried (Machete) and active (Cudgel) both qualify...
  await typeRow(page, 'melee').click();
  expect((await chipTexts(page)).length).toBe(2);
  // ...and so does worn (Revolver).
  await typeRow(page, 'ranged').click();
  expect(await chipTexts(page)).toEqual(['Revolver +2 Lethal']);
});

test('cmb.3b AC2 - armour, skill gear and a dangling catalogue_id are never weapon chips', async ({ page }) => {
  await openModal(page);
  for (const key of ['melee', 'ranged', 'thrown']) {
    await typeRow(page, key).click();
    // The Flak Jacket is worn AND in the combat_gear bucket - only the
    // weapon-shape predicate excludes it.
    await expect(weaponNamed(page, 'Flak Jacket')).toHaveCount(0);
    await expect(weaponNamed(page, 'Lockpicks')).toHaveCount(0);
    await expect(weaponNamed(page, 'cat-not-in-catalogue')).toHaveCount(0);
  }
  // And the dangling id did not take the modal down with it.
  await expect(page.locator('.cbt-atk-overlay')).toBeVisible();
  await expect(page.locator('[data-cbt-atk-roll]')).toBeEnabled();
});

// ── AC3 - selection marks one chip and moves no dice ────────────────────────

test('cmb.3b AC3 - selecting a chip marks it, and only it', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'melee').click();
  await expect(page.locator('.cbt-atk-weapon[aria-pressed="true"]')).toHaveCount(0);

  await weaponNamed(page, 'Machete').click();
  await expect(weaponNamed(page, 'Machete')).toHaveAttribute('aria-pressed', 'true');
  await expect(weaponNamed(page, 'Machete')).toHaveClass(/cbt-atk-weapon-on/);
  await expect(weaponNamed(page, 'Cudgel')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.cbt-atk-weapon[aria-pressed="true"]')).toHaveCount(1);

  // Picking the other one swaps rather than adds - one weapon is current.
  await weaponNamed(page, 'Cudgel').click();
  await expect(weaponNamed(page, 'Cudgel')).toHaveAttribute('aria-pressed', 'true');
  await expect(weaponNamed(page, 'Machete')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.cbt-atk-weapon[aria-pressed="true"]')).toHaveCount(1);
});

test('cmb.3b AC3 - selecting a weapon does not change the pool, for any type', async ({ page }) => {
  await openModal(page);
  await targetPill(page, 'cmb3b-reed').click();

  for (const [key, expected] of [
    ['melee',  STR + WEAPONRY - REED_DEF],
    ['ranged', DEX + FIREARMS],
    ['thrown', STR + ATHLETICS - REED_DEF],
  ]) {
    await typeRow(page, key).click();
    expect(await poolValue(page), `${key} preset before any weapon is picked`).toBe(expected);
    const chips = weaponChips(page);
    const n = await chips.count();
    expect(n, `${key} rendered no chips to select`).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await chips.nth(i).click();
      expect(await poolValue(page), `${key}: chip ${i} moved the dice pool`).toBe(expected);
    }
  }
});

test('cmb.3b AC3 - a weapon rating is never folded into the pool, however large', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'melee').click();
  const bare = await poolValue(page);
  expect(bare).toBe(STR + WEAPONRY);

  // The Cudgel is +2. If the rating leaked into the pool this would read 8.
  await weaponNamed(page, 'Cudgel').click();
  expect(await poolValue(page)).toBe(bare);
  expect(await poolValue(page)).not.toBe(bare + 2);
  // And the state object agrees with the display.
  const st = await page.evaluate(() => window.combatAttackState());
  expect(st.pool).toBe(bare);
  expect(st.manual, 'picking a weapon must not be recorded as a manual pool edit').toBe(false);
});

// ── AC4 - no matching weapon is not an error state ──────────────────────────

test('cmb.3b AC4 - an attacker carrying nothing gets a fully usable modal', async ({ page }) => {
  await openModalFor(page, 'cmb3b-cole');   // Cole's equipment[] is empty
  await targetPill(page, 'cmb3b-reed').click();

  for (const [key, expected] of [
    ['melee',  STR + WEAPONRY - REED_DEF],
    ['ranged', 1 + FIREARMS],                   // Cole's Dexterity is 1
    ['thrown', STR + ATHLETICS - REED_DEF],
  ]) {
    await typeRow(page, key).click();
    // No chips, no placeholder, no empty-state row at all.
    await expect(weaponChips(page)).toHaveCount(0);
    await expect(page.locator('.cbt-atk-weapons')).toHaveCount(0);
    await expect(page.locator('.cbt-atk-weapons-lbl')).toHaveCount(0);
    // ...and the bare formula still computes and the stepper still moves.
    expect(await poolValue(page), `${key} lost its formula when no weapon existed`).toBe(expected);
    await expect(page.locator('[data-cbt-atk-step="1"]')).toBeEnabled();
    await expect(page.locator('[data-cbt-atk-roll]')).toBeEnabled();
  }

  await page.locator('[data-cbt-atk-step="1"]').click();
  await page.locator('[data-cbt-atk-roll]').click();
  await expect(page.locator('.cbt-atk-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => window.__nav)).toContain('roll');
  await expect(page.locator('#pool-banner')).toContainText('Thrown Weapons vs Reed');
  // No weapon, so no parenthesised weapon name either.
  await expect(page.locator('#pool-banner')).not.toContainText('(');
});

test('cmb.3b AC4 - a type with no matching weapon shows nothing while another type does', async ({ page }) => {
  await openModal(page);
  // Wan has melee, ranged and thrown weapons - so to get an empty type on a
  // stocked attacker, spend the ranged one by asking for Unarmed and back.
  await typeRow(page, 'ranged').click();
  await expect(weaponChips(page)).toHaveCount(1);
  await typeRow(page, 'unarmed').click();
  await expect(weaponChips(page)).toHaveCount(0);
  expect(await poolValue(page)).toBe(STR + BRAWL);
  await expect(page.locator('[data-cbt-atk-roll]')).toBeEnabled();
});

// ── AC5 - a type change clears the weapon ───────────────────────────────────

test('cmb.3b AC5 - switching type clears the previous type\'s weapon selection', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'melee').click();
  await weaponNamed(page, 'Machete').click();
  expect(await page.evaluate(() => window.combatAttackState().weapon)).not.toBeNull();

  await typeRow(page, 'ranged').click();
  await expect(page.locator('.cbt-atk-weapon[aria-pressed="true"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.combatAttackState().weapon)).toBeNull();

  // Coming back to Melee does not resurrect the old selection either.
  await typeRow(page, 'melee').click();
  await expect(page.locator('.cbt-atk-weapon[aria-pressed="true"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.combatAttackState().weapon)).toBeNull();
});

test('cmb.3b AC5 - a cleared weapon is gone from the roll label too, not just the chip', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'melee').click();
  await weaponNamed(page, 'Machete').click();
  await typeRow(page, 'ranged').click();
  await page.locator('[data-cbt-atk-roll]').click();
  await expect(page.locator('#pool-banner')).toContainText('Ranged Combat');
  await expect(page.locator('#pool-banner')).not.toContainText('Machete');
});

test('cmb.3b AC5 - changing the TARGET keeps the weapon, which is a property of the attacker', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'melee').click();
  await weaponNamed(page, 'Cudgel').click();
  await targetPill(page, 'cmb3b-reed').click();
  await expect(weaponNamed(page, 'Cudgel')).toHaveAttribute('aria-pressed', 'true');
  await targetPill(page, 'cmb3b-cole').click();
  await expect(weaponNamed(page, 'Cudgel')).toHaveAttribute('aria-pressed', 'true');
});

test('cmb.3b AC5 - reopening the modal starts with no weapon selected', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'melee').click();
  await weaponNamed(page, 'Machete').click();
  await page.locator('[data-cbt-atk-cancel]').click();

  await page.locator('[data-cbt-attack="cmb3b-wan"]').click();
  await expect(page.locator('.cbt-atk-overlay')).toBeVisible();
  await expect(weaponChips(page)).toHaveCount(0);          // no type selected yet
  expect(await page.evaluate(() => window.combatAttackState().weapon)).toBeNull();
});

// ── AC6 - Unarmed and Other never show chips ────────────────────────────────

test('cmb.3b AC6 - Unarmed and Other show no weapon chips at all', async ({ page }) => {
  await openModal(page);
  for (const key of ['unarmed', 'other']) {
    await typeRow(page, key).click();
    await expect(weaponChips(page), `${key} rendered weapon chips`).toHaveCount(0);
    await expect(page.locator('.cbt-atk-weapons-lbl')).toHaveCount(0);
  }
  // And this is a property of the type, not of the attacker being unarmed -
  // switching straight to Melee brings the same attacker's chips back.
  await typeRow(page, 'melee').click();
  await expect(weaponChips(page)).toHaveCount(2);
});

test('cmb.3b AC6 - Unarmed and Other still roll normally with no weapon available', async ({ page }) => {
  await openModal(page);
  await targetPill(page, 'cmb3b-reed').click();
  await typeRow(page, 'unarmed').click();
  expect(await poolValue(page)).toBe(STR + BRAWL - REED_DEF);
  await page.locator('[data-cbt-atk-roll]').click();
  await expect(page.locator('#pool-banner')).toContainText('Unarmed Combat vs Reed');
  await expect(page.locator('#pool-banner')).not.toContainText('(');
});

// ── AC7 - the stepper keeps its full free range with a weapon selected ──────

for (const key of ['melee', 'ranged', 'thrown']) {
  test(`cmb.3b AC7 - with a weapon selected, the ${key} stepper still reaches any non-negative integer`, async ({ page }) => {
    await openModal(page);
    await targetPill(page, 'cmb3b-reed').click();
    await typeRow(page, key).click();
    await weaponChips(page).first().click();
    await expect(page.locator('.cbt-atk-weapon[aria-pressed="true"]')).toHaveCount(1);

    const start = await poolValue(page);
    const inc = page.locator('[data-cbt-atk-step="1"]');
    const dec = page.locator('[data-cbt-atk-step="-1"]');
    await expect(inc).toBeEnabled();
    await expect(dec).toBeEnabled();

    for (let i = 0; i < 3; i++) await inc.click();
    expect(await poolValue(page)).toBe(start + 3);

    for (let i = 0; i < start + 3; i++) await dec.click();
    expect(await poolValue(page), `${key} could not be stepped down to 0 with a weapon selected`).toBe(0);

    // 0 is the floor, not a waypoint to a negative number...
    await dec.click();
    await dec.click();
    expect(await poolValue(page)).toBe(0);

    // ...and it is still freely adjustable afterwards.
    await inc.click();
    expect(await poolValue(page)).toBe(1);

    // The weapon stayed selected through all of that, and Roll never locked.
    await expect(page.locator('.cbt-atk-weapon[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('[data-cbt-atk-roll]')).toBeEnabled();
  });
}

test('cmb.3b AC7 - a weapon selection never gates Roll, and no weapon never gates it either', async ({ page }) => {
  await openModal(page);
  const roll = page.locator('[data-cbt-atk-roll]');

  // Still the type, and only the type, that gates Roll (cmb.3a AC8 unchanged).
  await expect(roll).toBeDisabled();
  await typeRow(page, 'melee').click();
  await expect(roll, 'Roll must not require a weapon selection').toBeEnabled();
  await expect(weaponChips(page)).toHaveCount(2);

  await weaponNamed(page, 'Machete').click();
  await expect(roll).toBeEnabled();

  // Deselecting the weapon again leaves everything just as usable.
  await weaponNamed(page, 'Machete').click();
  await expect(page.locator('.cbt-atk-weapon[aria-pressed="true"]')).toHaveCount(0);
  await expect(roll).toBeEnabled();

  // Nothing anywhere in the modal became disabled because a weapon exists.
  const disabled = await page.$$eval('.cbt-atk-modal button[disabled]', els =>
    els.map(el => el.className));
  expect(disabled, 'a control was disabled while a weapon was in play').toEqual([]);
});

test('cmb.3b AC7 - a manually adjusted pool survives picking a weapon', async ({ page }) => {
  await openModal(page);
  await targetPill(page, 'cmb3b-reed').click();
  await typeRow(page, 'melee').click();
  for (let i = 0; i < 4; i++) await page.locator('[data-cbt-atk-step="1"]').click();
  const adjusted = STR + WEAPONRY - REED_DEF + 4;
  expect(await poolValue(page)).toBe(adjusted);

  // Choosing a weapon is not a recompute trigger - it changes no selection the
  // formula reads, so the ST's own number stands.
  await weaponNamed(page, 'Machete').click();
  expect(await poolValue(page)).toBe(adjusted);
  await weaponNamed(page, 'Cudgel').click();
  expect(await poolValue(page)).toBe(adjusted);

  await page.locator('[data-cbt-atk-roll]').click();
  await expect(page.locator('#pool-banner')).toContainText(`${adjusted}d`);
});

// ── AC8 - the roll label names the weapon ───────────────────────────────────

test('cmb.3b AC8 - the roll label is "Melee Combat vs Reed (Machete)"', async ({ page }) => {
  await openModal(page);
  await targetPill(page, 'cmb3b-reed').click();
  await typeRow(page, 'melee').click();
  await weaponNamed(page, 'Machete').click();

  await page.locator('[data-cbt-atk-roll]').click();
  await expect(page.locator('.cbt-atk-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => window.__nav)).toContain('roll');
  await expect(page.locator('#pool-banner')).toContainText('Melee Combat vs Reed (Machete)');
  await expect(page.locator('#pool-banner')).toContainText(`${STR + WEAPONRY - REED_DEF}d`);
});

test('cmb.3b AC8 - the label names the weapon that is selected, not the first one listed', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'melee').click();
  await weaponNamed(page, 'Machete').click();
  await weaponNamed(page, 'Cudgel').click();     // swap
  await page.locator('[data-cbt-atk-roll]').click();
  await expect(page.locator('#pool-banner')).toContainText('Melee Combat (Cudgel)');
  await expect(page.locator('#pool-banner')).not.toContainText('Machete');
});

test('cmb.3b AC8 - with no target the label is still type plus weapon', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'thrown').click();
  await weaponNamed(page, 'Throwing Knife').click();
  await page.locator('[data-cbt-atk-roll]').click();
  await expect(page.locator('#pool-banner')).toContainText('Thrown Weapons (Throwing Knife)');
  await expect(page.locator('#pool-banner')).not.toContainText(' vs ');
  await expect(page.locator('#pool-banner')).toContainText(`${STR + ATHLETICS}d`);
});

test('cmb.3b AC8 - deselecting the weapon takes it back out of the label', async ({ page }) => {
  await openModal(page);
  await typeRow(page, 'ranged').click();
  await weaponNamed(page, 'Revolver').click();
  await weaponNamed(page, 'Revolver').click();   // tap again to clear
  await expect(page.locator('.cbt-atk-weapon[aria-pressed="true"]')).toHaveCount(0);
  await page.locator('[data-cbt-atk-roll]').click();
  await expect(page.locator('#pool-banner')).toContainText('Ranged Combat');
  await expect(page.locator('#pool-banner')).not.toContainText('Revolver');
});

// ── AC9 - real catalogue shape, including the synthetic Thrown fixture ──────

test('cmb.3b AC9 - the chips resolve through the real catalogue cache, by catalogue_id', async ({ page }) => {
  await openModal(page);
  // The character document carries no weapon name or stats of its own - proving
  // the chip text can only have come from the catalogue document.
  const stored = await page.evaluate(() => {
    const wan = window.__cmb3b.chars.find(c => c._id === 'cmb3b-wan');
    return wan.equipment.map(e => Object.keys(e).sort().join(','));
  });
  for (const keys of stored) expect(keys).toBe('catalogue_id,notes,state');

  await typeRow(page, 'melee').click();
  await expect(weaponNamed(page, 'Machete')).toContainText('+1 Lethal');
});

test('cmb.3b AC9 - the synthetic Thrown weapon behaves like any other', async ({ page }) => {
  await openModal(page);
  await targetPill(page, 'cmb3b-reed').click();
  await typeRow(page, 'thrown').click();

  const chip = weaponNamed(page, 'Throwing Knife');
  await expect(chip).toHaveCount(1);
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  // The Errata's Strength-based Thrown pool is untouched by the weapon, and the
  // aerodynamic Dexterity-or-Strength choice is explicitly NOT implemented here
  // (no schema field exists for it) - so a Dexterity-based pool would be wrong.
  expect(await poolValue(page)).toBe(STR + ATHLETICS - REED_DEF);
  expect(await poolValue(page)).not.toBe(DEX + ATHLETICS - REED_DEF);
});

// ── AC10 - the chips are real tap targets ───────────────────────────────────

test('cmb.3b AC10 - every weapon chip measures a real 44x44px box, for every type', async ({ page }) => {
  await openModal(page);
  for (const key of ['melee', 'ranged', 'thrown']) {
    await typeRow(page, key).click();
    await expectAllTappable(page, '.cbt-atk-weapon', `${key} weapon chip`);
  }
});

test('cmb.3b AC10 - the chips are still real tap targets on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openModal(page);
  await typeRow(page, 'melee').click();
  await expectAllTappable(page, '.cbt-atk-weapon', 'weapon chip at 390px');

  const fits = await page.evaluate(() => {
    const m = document.querySelector('.cbt-atk-modal');
    return { overflow: m.scrollWidth - m.clientWidth, right: m.getBoundingClientRect().right, vw: window.innerWidth };
  });
  expect(fits.overflow).toBeLessThanOrEqual(1);
  expect(fits.right).toBeLessThanOrEqual(fits.vw);
});

test('cmb.3b AC10 - no weapon chip overlaps any other control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openModal(page);
  await typeRow(page, 'melee').click();
  const rects = await page.$$eval(
    '.cbt-atk-weapon, .cbt-atk-pill, .cbt-atk-type, [data-cbt-atk-step], [data-cbt-atk-roll], [data-cbt-atk-cancel], [data-cbt-atk-close]',
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

test('cmb.3b AC10 - a real touchscreen tap selects a weapon chip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openModal(page);
  await typeRow(page, 'melee').tap();
  await weaponNamed(page, 'Cudgel').tap();
  await expect(weaponNamed(page, 'Cudgel')).toHaveAttribute('aria-pressed', 'true');
  // A tap on a chip does not dismiss the dialog it lives in.
  await expect(page.locator('.cbt-atk-overlay')).toBeVisible();

  // The full press/release/click sequence a finger really produces.
  const machete = weaponNamed(page, 'Machete');
  await machete.dispatchEvent('pointerdown');
  await machete.dispatchEvent('pointerup');
  await machete.click();
  await expect(machete).toHaveAttribute('aria-pressed', 'true');
  await expect(weaponNamed(page, 'Cudgel')).toHaveAttribute('aria-pressed', 'false');
});
