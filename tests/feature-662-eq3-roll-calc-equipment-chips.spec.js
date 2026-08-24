/**
 * E2E tests — feature.662 EQ-3: Roll calculator equipment bonus chips and weapon reference.
 *
 * Equipment items with bonus_dice appear as toggleable chips in the effpool breakdown.
 * One chip active at a time; activating a second auto-deactivates the first.
 * Weapon reference panel shows for combat skills when character has carried/worn weapons.
 *
 * Covered:
 *   AC-1  Equipment chips appear when pi.skill matches skill_domain on carried/worn items
 *   AC-2  Chip toggle adds/removes bonus_dice from MOD
 *   AC-3  Only one chip active at a time
 *   AC-4  state.activeEquipBonus cleared by loadPool()
 *   AC-5  Only bucket === 'equipment' eligible (weapon/armour/asset excluded)
 *   AC-6  Only carried/worn eligible (stashed/lost excluded)
 *   AC-7  Weapon reference panel for combat skills with weapons
 *   AC-8  Weapon selector shows name; selecting shows damage_mod + damage_type
 *   AC-9  Weapon panel absent when no combat skill or no weapons
 *   AC-10 Existing specialty chip behaviour unaffected
 */

const { test, expect } = require('@playwright/test');

// ── Shared auth user ──────────────────────────────────────────────────────────

const ST_USER = {
  id: '777000662', username: 'test_st662', global_name: 'Test ST 662',
  avatar: null, role: 'st', player_id: 'p-fix662',
  character_ids: ['char-eq662-001'], is_dual_role: false,
};

// ── Character builder ─────────────────────────────────────────────────────────

function baseChar(overrides = {}) {
  return {
    _id: 'char-eq662-001',
    name: 'Gear Tester',
    moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
    blood_potency: 1, humanity: 7, humanity_base: 7,
    court_title: null, retired: false,
    status: { city: 1, clan: 1, covenant: {} },
    attributes: {
      Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 3, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {
      Investigation: { dots: 2, bonus: 0, specs: [], nine_again: false },
      Weaponry: { dots: 2, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: {}, merits: [], powers: [], ordeals: [],
    xp_log: { spent: 0 },
    equipment: [],
    assets: [],
    ...overrides,
  };
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function setupSuite(page, char) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, ST_USER);

  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
  );
  await page.route('**/api/characters/names', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: char._id, name: char.name, moniker: null, honorific: null }]) })
  );
  await page.route(new RegExp(`/api/characters/${char._id}$`), r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) })
  );
  await page.route('**/api/rules', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

// Load a pool into the roll calculator, setting rollChar and calling loadPool,
// then navigate to the Roll tab so chips are visible and clickable.
// goTab is called in a SEPARATE evaluate after loadPool, matching the
// unified-app.js goToTab pattern — avoids a race where renderLifecycleCards()
// (triggered async inside goTab) could resolve while loadPool is still running
// and leave the tab in an indeterminate state.
async function loadRollPool(page, char, skill, attrV, skillV) {
  await page.evaluate(async ({ c, sk, aV, sV }) => {
    const m = await import('/js/suite/data.js');
    m.default.rollChar = c;
    m.default.chars = [c];
    window.loadPool(aV + sV, sk + ' roll', { attr: 'Test', attrV: aV, skill: sk, skillV: sV, total: aV + sV });
  }, { c: char, sk: skill, aV: attrV, sV: skillV });
  await page.evaluate(() => window.goTab('roll'));
  await page.waitForSelector('#t-roll.active', { state: 'visible', timeout: 5000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('feature.662 EQ-3 — Roll calculator equipment chips and weapon reference', () => {

  // crime-scene-kit: bucket=equipment, skill_domain=Investigation, bonus_dice=2
  test('AC-1: equipment chip appears when pi.skill matches skill_domain on carried item', async ({ page }) => {
    const char = baseChar({
      equipment: [
        { catalogue_id: 'crime-scene-kit', state: 'carried', acquired_cycle: 1, notes: null },
      ],
    });
    await setupSuite(page, char);
    await loadRollPool(page, char, 'Investigation', 3, 2);

    const effline = page.locator('#effline');
    await expect(effline.locator('.effpool-spec[data-equip]')).toHaveCount(1);
    await expect(effline.locator('.effpool-spec[data-equip]').first()).toContainText('+');
  });

  test('AC-1 negative: no equipment chips when skill does not match any carried item', async ({ page }) => {
    const char = baseChar({
      equipment: [
        // crime-scene-kit is Investigation; load Weaponry — no match
        { catalogue_id: 'crime-scene-kit', state: 'carried', acquired_cycle: 1, notes: null },
      ],
    });
    await setupSuite(page, char);
    await loadRollPool(page, char, 'Weaponry', 3, 2);

    await expect(page.locator('#effline .effpool-spec[data-equip]')).toHaveCount(0);
  });

  test('AC-2: toggling chip adds bonus_dice to MOD; toggling again removes it', async ({ page }) => {
    // crime-scene-kit: bonus_dice = 2
    const char = baseChar({
      equipment: [
        { catalogue_id: 'crime-scene-kit', state: 'carried', acquired_cycle: 1, notes: null },
      ],
    });
    await setupSuite(page, char);
    await loadRollPool(page, char, 'Investigation', 3, 2);

    const chip = page.locator('#effline .effpool-spec[data-equip]').first();
    await expect(chip).not.toHaveClass(/\bon\b/);

    // Toggle on
    await chip.click();
    await page.waitForTimeout(150);
    await expect(chip).toHaveClass(/\bon\b/);
    const modOn = await page.locator('#mval').textContent();
    expect(parseInt(modOn)).toBeGreaterThan(0);

    // Toggle off
    await chip.click();
    await page.waitForTimeout(150);
    await expect(chip).not.toHaveClass(/\bon\b/);
    const modOff = await page.locator('#mval').textContent();
    expect(modOff.trim()).toBe('0');
  });

  test('AC-3: activating a second chip deactivates the first', async ({ page }) => {
    // crime-scene-kit (Investigation +2) and digital-recorder-1 (Investigation +1)
    const char = baseChar({
      equipment: [
        { catalogue_id: 'crime-scene-kit', state: 'carried', acquired_cycle: 1, notes: null },
        { catalogue_id: 'digital-recorder-1', state: 'worn', acquired_cycle: 1, notes: null },
      ],
    });
    await setupSuite(page, char);
    await loadRollPool(page, char, 'Investigation', 3, 2);

    const chips = page.locator('#effline .effpool-spec[data-equip]');
    await expect(chips).toHaveCount(2);

    // Activate first chip
    await chips.nth(0).click();
    await page.waitForTimeout(150);
    await expect(chips.nth(0)).toHaveClass(/\bon\b/);
    await expect(chips.nth(1)).not.toHaveClass(/\bon\b/);

    // Activate second chip — first deactivates
    await chips.nth(1).click();
    await page.waitForTimeout(150);
    await expect(chips.nth(0)).not.toHaveClass(/\bon\b/);
    await expect(chips.nth(1)).toHaveClass(/\bon\b/);
  });

  test('AC-4: loadPool() clears activeEquipBonus and chip state', async ({ page }) => {
    const char = baseChar({
      equipment: [
        { catalogue_id: 'crime-scene-kit', state: 'carried', acquired_cycle: 1, notes: null },
      ],
    });
    await setupSuite(page, char);
    await loadRollPool(page, char, 'Investigation', 3, 2);

    // Activate chip
    await page.locator('#effline .effpool-spec[data-equip]').first().click();
    await page.waitForTimeout(150);
    await expect(page.locator('#effline .effpool-spec[data-equip]').first()).toHaveClass(/\bon\b/);

    // Load a new pool — chip state clears
    await loadRollPool(page, char, 'Investigation', 3, 2);
    await expect(page.locator('#effline .effpool-spec[data-equip]').first()).not.toHaveClass(/\bon\b/);
    expect((await page.locator('#mval').textContent()).trim()).toBe('0');
  });

  test('AC-5: weapon/armour items do not appear as equipment chips', async ({ page }) => {
    // knife = weapon, armoured-vest = armour — neither is bucket=equipment
    const char = baseChar({
      equipment: [
        { catalogue_id: 'knife', state: 'carried', acquired_cycle: 0, notes: null },
        { catalogue_id: 'armoured-vest', state: 'worn', acquired_cycle: 0, notes: null },
      ],
    });
    await setupSuite(page, char);
    await loadRollPool(page, char, 'Weaponry', 3, 2);

    await expect(page.locator('#effline .effpool-spec[data-equip]')).toHaveCount(0);
  });

  test('AC-6: stashed and lost items do not appear as chips', async ({ page }) => {
    const char = baseChar({
      equipment: [
        { catalogue_id: 'crime-scene-kit', state: 'stashed', acquired_cycle: 1, notes: null },
        { catalogue_id: 'crime-scene-kit', state: 'lost', acquired_cycle: 1, notes: null },
      ],
    });
    await setupSuite(page, char);
    await loadRollPool(page, char, 'Investigation', 3, 2);

    await expect(page.locator('#effline .effpool-spec[data-equip]')).toHaveCount(0);
  });

  test('AC-7: weapon reference panel appears for Weaponry pool with carried weapon', async ({ page }) => {
    const char = baseChar({
      equipment: [
        { catalogue_id: 'knife', state: 'carried', acquired_cycle: 0, notes: null },
      ],
    });
    await setupSuite(page, char);
    await loadRollPool(page, char, 'Weaponry', 3, 2);

    await expect(page.locator('#weapon-ref')).toBeVisible();
    await expect(page.locator('#weapon-sel')).toBeVisible();
  });

  test('AC-8: selecting a weapon shows damage_mod and damage_type', async ({ page }) => {
    // knife: damage_mod 0, damage_type lethal, weapon_type melee
    const char = baseChar({
      equipment: [
        { catalogue_id: 'knife', state: 'carried', acquired_cycle: 0, notes: null },
      ],
    });
    await setupSuite(page, char);
    await loadRollPool(page, char, 'Weaponry', 3, 2);

    await page.locator('#weapon-sel').selectOption('knife');
    await page.waitForTimeout(200);

    const panel = page.locator('#weapon-ref');
    await expect(panel).toContainText('Lethal');
    await expect(panel).toContainText('Melee');
  });

  test('AC-9: weapon panel absent for non-combat skill', async ({ page }) => {
    const char = baseChar({
      equipment: [
        { catalogue_id: 'knife', state: 'carried', acquired_cycle: 0, notes: null },
      ],
    });
    await setupSuite(page, char);
    await loadRollPool(page, char, 'Investigation', 3, 2);

    await expect(page.locator('#weapon-ref')).not.toBeVisible();
  });

  test('AC-9: weapon panel absent when no carried/worn weapons', async ({ page }) => {
    const char = baseChar({
      equipment: [
        { catalogue_id: 'knife', state: 'stashed', acquired_cycle: 0, notes: null },
      ],
    });
    await setupSuite(page, char);
    await loadRollPool(page, char, 'Weaponry', 3, 2);

    await expect(page.locator('#weapon-ref')).not.toBeVisible();
  });

  test('AC-10: specialty chips still work alongside equipment chips', async ({ page }) => {
    const char = baseChar({
      skills: {
        Investigation: { dots: 2, bonus: 0, specs: ['Forensics'], nine_again: false },
        Weaponry: { dots: 2, bonus: 0, specs: [], nine_again: false },
      },
      equipment: [
        { catalogue_id: 'crime-scene-kit', state: 'carried', acquired_cycle: 1, notes: null },
      ],
    });
    await setupSuite(page, char);
    await loadRollPool(page, char, 'Investigation', 3, 2);

    // Both specialty and equipment chips present
    await expect(page.locator('#effline .effpool-spec[data-spec]')).toHaveCount(1);
    await expect(page.locator('#effline .effpool-spec[data-equip]')).toHaveCount(1);

    // Specialty chip still toggles
    await page.locator('#effline .effpool-spec[data-spec]').first().click();
    await page.waitForTimeout(150);
    await expect(page.locator('#effline .effpool-spec[data-spec]').first()).toHaveClass(/\bon\b/);
  });

});
