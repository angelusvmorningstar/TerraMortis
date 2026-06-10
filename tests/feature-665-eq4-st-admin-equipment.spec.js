/**
 * E2E tests — feature.665 EQ-4: ST admin UI for assigning equipment to characters.
 *
 * Tests cover the edit-mode management panel added to shRenderEquipment():
 * remove buttons on existing items, inline add forms for equipment and assets,
 * bucket filter DOM manipulation, and CRUD handler behaviour.
 *
 * Covered:
 *   AC-1   Equipment & Assets section renders in edit mode (even when empty)
 *   AC-2   Player-facing suite sheet still absent when no items (view mode guard unchanged)
 *   AC-3   Existing equipment entry shows name, state, notes in edit mode
 *   AC-4   Add equipment form present; bucket filter populates item select
 *   AC-5   Remove button present for equipment items, correct index
 *   AC-6   Existing asset entry shows name + description in edit mode
 *   AC-7   Add asset form present with all fields
 *   AC-8   Remove button present for asset items, correct index
 *   AC-9   acquired_cycle input pre-fills with a non-negative integer
 *   AC-10  Legacy character (no equipment/assets): section renders with add forms, no crash
 */

const { test, expect } = require('@playwright/test');

// ── Character builder ─────────────────────────────────────────────────────────

function buildChar(overrides = {}) {
  return {
    _id: 'char-eq665-001',
    name: 'EQ4 Admin Tester',
    moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Invictus', player: 'Test ST',
    blood_potency: 1, humanity: 7, humanity_base: 7,
    court_title: null, retired: false,
    status: { city: 1, clan: 1, covenant: {} },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
    xp_log: { spent: 0 },
    ...overrides,
  };
}

const ST_USER = {
  id: '777000665', username: 'test_st665', global_name: 'Test ST 665',
  avatar: null, role: 'st', player_id: 'p-fix665',
  character_ids: ['char-eq665-001'], is_dual_role: false,
};

// ── Base route setup ──────────────────────────────────────────────────────────

async function setupPage(page, char) {
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

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('feature.665 EQ-4 — ST admin equipment management UI', () => {

  // ── AC-1: Section renders in edit mode even when no items ───────────────────

  test('AC-10: legacy char (no equipment/assets) renders section with add forms in edit mode', async ({ page }) => {
    const char = buildChar(); // no equipment or assets
    await setupPage(page, char);

    const result = await page.evaluate(async (c) => {
      const { shRenderEquipment } = await import('/js/editor/sheet.js');
      const html = shRenderEquipment(c, true);
      return {
        hasSectionTitle: html.includes('Equipment &amp; Assets'),
        hasAddEquipForm: html.includes('shAddEquip'),
        hasAddAssetForm: html.includes('shAddAsset'),
        hasError: html.toLowerCase().includes('error') || html.includes('undefined'),
      };
    }, char);

    expect(result.hasSectionTitle).toBe(true);
    expect(result.hasAddEquipForm).toBe(true);
    expect(result.hasAddAssetForm).toBe(true);
    expect(result.hasError).toBe(false);
  });

  // ── AC-2: View mode guard unchanged ────────────────────────────────────────

  test('AC-2: view mode still returns empty string when character has no items', async ({ page }) => {
    const char = buildChar();
    await setupPage(page, char);

    const html = await page.evaluate(async (c) => {
      const { shRenderEquipment } = await import('/js/editor/sheet.js');
      return shRenderEquipment(c, false);
    }, char);

    expect(html).toBe('');
  });

  // ── AC-3: Existing equipment renders correctly in edit mode ─────────────────

  test('AC-3: existing equipment entry shows resolved name, state chip in edit mode', async ({ page }) => {
    const char = buildChar({
      equipment: [
        { catalogue_id: 'machete', state: 'carried', acquired_cycle: 3, notes: 'Sharpened' },
      ],
    });
    await setupPage(page, char);

    const result = await page.evaluate(async (c) => {
      const { shRenderEquipment } = await import('/js/editor/sheet.js');
      const html = shRenderEquipment(c, true);
      return {
        hasName:  html.includes('Machete'),
        hasState: html.includes('Carried'),
        hasNotes: html.includes('Sharpened'),
      };
    }, char);

    expect(result.hasName).toBe(true);
    expect(result.hasState).toBe(true);
    expect(result.hasNotes).toBe(true);
  });

  // ── AC-4: Add equipment form + bucket filter ────────────────────────────────

  test('AC-4: add equipment form has bucket select, item select, state select, Add button', async ({ page }) => {
    const char = buildChar();
    await setupPage(page, char);

    const result = await page.evaluate(async (c) => {
      const { shRenderEquipment } = await import('/js/editor/sheet.js');
      const html = shRenderEquipment(c, true);
      return {
        hasBucketSel: html.includes('eq-add-bucket'),
        hasItemSel:   html.includes('eq-add-item'),
        hasStateSel:  html.includes('eq-add-state'),
        hasCycleIn:   html.includes('eq-add-cycle'),
        hasNotesIn:   html.includes('eq-add-notes'),
        hasAddBtn:    html.includes('shAddEquip()'),
        bucketOptions: ['weapon', 'armour', 'equipment'].every(b => html.includes(b)),
      };
    }, char);

    expect(result.hasBucketSel).toBe(true);
    expect(result.hasItemSel).toBe(true);
    expect(result.hasStateSel).toBe(true);
    expect(result.hasCycleIn).toBe(true);
    expect(result.hasNotesIn).toBe(true);
    expect(result.hasAddBtn).toBe(true);
    expect(result.bucketOptions).toBe(true);
  });

  test('AC-4: shEquipBucketFilter populates item select with weapons when bucket=weapon', async ({ page }) => {
    const char = buildChar();
    await setupPage(page, char);

    // Inject the add-form DOM so shEquipBucketFilter has elements to manipulate
    const weaponCount = await page.evaluate(async (c) => {
      const { shRenderEquipment } = await import('/js/editor/sheet.js');
      const html = shRenderEquipment(c, true);
      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container);

      const bucketSel = document.getElementById('eq-add-bucket');
      const itemSel   = document.getElementById('eq-add-item');
      if (!bucketSel || !itemSel) return -1;

      bucketSel.value = 'weapon';
      const { shEquipBucketFilter } = await import('/js/editor/edit.js');
      shEquipBucketFilter();

      const count = itemSel.options.length - 1; // subtract the "-- select --" placeholder
      document.body.removeChild(container);
      return count;
    }, char);

    // Catalogue has weapons; should be > 0
    expect(weaponCount).toBeGreaterThan(0);
  });

  // ── AC-5: Remove buttons present with correct index ─────────────────────────

  test('AC-5: remove buttons present for each equipment item with correct index', async ({ page }) => {
    const char = buildChar({
      equipment: [
        { catalogue_id: 'knife',   state: 'carried', acquired_cycle: 1, notes: null },
        { catalogue_id: 'machete', state: 'carried', acquired_cycle: 1, notes: null },
      ],
    });
    await setupPage(page, char);

    const result = await page.evaluate(async (c) => {
      const { shRenderEquipment } = await import('/js/editor/sheet.js');
      const html = shRenderEquipment(c, true);
      return {
        hasRemove0: html.includes('shRemoveEquip(0)'),
        hasRemove1: html.includes('shRemoveEquip(1)'),
        removeCount: (html.match(/shRemoveEquip\(/g) || []).length,
      };
    }, char);

    expect(result.hasRemove0).toBe(true);
    expect(result.hasRemove1).toBe(true);
    expect(result.removeCount).toBe(2);
  });

  // ── AC-6: Existing asset entry in edit mode ─────────────────────────────────

  test('AC-6: existing asset entry shows name and description in edit mode', async ({ page }) => {
    const char = buildChar({
      assets: [{
        name: 'Safe House',
        description: 'A rented flat in Surry Hills.',
        location: 'Surry Hills',
        mechanical_effect: null,
        acquired_cycle: 4,
        notes: null,
      }],
    });
    await setupPage(page, char);

    const result = await page.evaluate(async (c) => {
      const { shRenderEquipment } = await import('/js/editor/sheet.js');
      const html = shRenderEquipment(c, true);
      return {
        hasName: html.includes('Safe House'),
        hasDesc: html.includes('rented flat'),
        hasMeta: html.includes('Surry Hills'),
      };
    }, char);

    expect(result.hasName).toBe(true);
    expect(result.hasDesc).toBe(true);
    expect(result.hasMeta).toBe(true);
  });

  // ── AC-7: Add asset form present ────────────────────────────────────────────

  test('AC-7: add asset form has all required fields', async ({ page }) => {
    const char = buildChar();
    await setupPage(page, char);

    const result = await page.evaluate(async (c) => {
      const { shRenderEquipment } = await import('/js/editor/sheet.js');
      const html = shRenderEquipment(c, true);
      return {
        hasNameIn:  html.includes('asset-add-name'),
        hasDescIn:  html.includes('asset-add-desc'),
        hasLocIn:   html.includes('asset-add-loc'),
        hasMechIn:  html.includes('asset-add-mech'),
        hasCycleIn: html.includes('asset-add-cycle'),
        hasNotesIn: html.includes('asset-add-notes'),
        hasAddBtn:  html.includes('shAddAsset()'),
      };
    }, char);

    expect(result.hasNameIn).toBe(true);
    expect(result.hasDescIn).toBe(true);
    expect(result.hasLocIn).toBe(true);
    expect(result.hasMechIn).toBe(true);
    expect(result.hasCycleIn).toBe(true);
    expect(result.hasNotesIn).toBe(true);
    expect(result.hasAddBtn).toBe(true);
  });

  // ── AC-8: Remove button for assets with correct index ──────────────────────

  test('AC-8: remove buttons present for each asset with correct index', async ({ page }) => {
    const char = buildChar({
      assets: [
        { name: 'A1', description: 'First', location: null, mechanical_effect: null, acquired_cycle: 1, notes: null },
        { name: 'A2', description: 'Second', location: null, mechanical_effect: null, acquired_cycle: 2, notes: null },
      ],
    });
    await setupPage(page, char);

    const result = await page.evaluate(async (c) => {
      const { shRenderEquipment } = await import('/js/editor/sheet.js');
      const html = shRenderEquipment(c, true);
      return {
        hasRemove0: html.includes('shRemoveAsset(0)'),
        hasRemove1: html.includes('shRemoveAsset(1)'),
        removeCount: (html.match(/shRemoveAsset\(/g) || []).length,
      };
    }, char);

    expect(result.hasRemove0).toBe(true);
    expect(result.hasRemove1).toBe(true);
    expect(result.removeCount).toBe(2);
  });

  // ── AC-9: acquired_cycle pre-fills ──────────────────────────────────────────

  test('AC-9: acquired_cycle inputs pre-fill with a non-negative integer', async ({ page }) => {
    const char = buildChar();
    await setupPage(page, char);

    const result = await page.evaluate(async (c) => {
      const { shRenderEquipment } = await import('/js/editor/sheet.js');
      const html = shRenderEquipment(c, true);
      // Extract value="N" from the eq-add-cycle input
      const eqMatch    = html.match(/id="eq-add-cycle"[^>]*value="(\d+)"/);
      const assetMatch = html.match(/id="asset-add-cycle"[^>]*value="(\d+)"/);
      return {
        eqCycle:    eqMatch    ? parseInt(eqMatch[1], 10)    : null,
        assetCycle: assetMatch ? parseInt(assetMatch[1], 10) : null,
      };
    }, char);

    expect(result.eqCycle).not.toBeNull();
    expect(result.eqCycle).toBeGreaterThanOrEqual(0);
    expect(result.assetCycle).not.toBeNull();
    expect(result.assetCycle).toBeGreaterThanOrEqual(0);
  });

});
