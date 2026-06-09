/**
 * E2E tests — feature.656 EQ-2: Equipment & Assets character sheet display.
 *
 * shRenderEquipment() renders catalogue-ref equipment[] and freeform assets[]
 * in the character sheet, grouped by bucket with sub-title headers.
 *
 * Covered:
 *   AC-1/2  Section renders with items; grouped sub-sections
 *   AC-3    Unknown catalogue_id falls back to raw id (no crash)
 *   AC-4    State chips show human-readable labels
 *   AC-5/6  Weapon and armour details display correctly
 *   AC-7    Equipment pool-modifier label
 *   AC-8    Asset freeform entry
 *   AC-9    Characters with no equipment/assets: section absent
 *   AC-10   Edit mode shows same read-only view (no inline inputs)
 */

const { test, expect } = require('@playwright/test');

// ── Shared auth user ──────────────────────────────────────────────────────────

const ST_USER = {
  id: '777000656', username: 'test_st656', global_name: 'Test ST 656',
  avatar: null, role: 'st', player_id: 'p-fix656',
  character_ids: ['char-eq656-001'], is_dual_role: false,
};

// ── Character builder ─────────────────────────────────────────────────────────

function buildChar(overrides = {}) {
  return {
    _id: 'char-eq656-001',
    name: 'Equipment Sheet Tester',
    moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
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

async function renderSheetDesktop(page, char) {
  await page.evaluate(async (c) => {
    document.body.classList.add('desktop-mode');
    const stateModule = await import('/js/suite/data.js');
    const state = stateModule.default;
    state.chars = [c];
    const { onSheetChar } = await import('/js/suite/sheet.js');
    onSheetChar(c.name);
  }, char);
  await page.waitForTimeout(200);
}

function sheetHtml(page) {
  return page.evaluate(() =>
    document.querySelector('#sh-content-suite')?.innerHTML || ''
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('feature.656 EQ-2 — Equipment & Assets sheet display', () => {

  test('AC-9: no Equipment & Assets section when character has no equipment or assets', async ({ page }) => {
    const char = buildChar(); // no equipment / assets fields
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await sheetHtml(page);
    expect(html).not.toContain('Equipment &amp; Assets');
  });

  test('AC-1/2: section heading and sub-section headers present when items exist', async ({ page }) => {
    const char = buildChar({
      equipment: [
        { catalogue_id: 'knife',        state: 'carried', acquired_cycle: 1, notes: null },
        { catalogue_id: 'reinforced-clothing', state: 'worn', acquired_cycle: 1, notes: null },
        { catalogue_id: 'flashlight',   state: 'stashed', acquired_cycle: 2, notes: null },
      ],
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await sheetHtml(page);
    expect(html).toContain('Equipment &amp; Assets');
    expect(html).toContain('Weapons');
    expect(html).toContain('Armour');
    expect(html).toContain('Equipment');
    // no assets -- should not show Assets sub-section
    expect(html).not.toMatch(/class="sh-sub-title">Assets/);
  });

  test('AC-4: state chips render human-readable labels', async ({ page }) => {
    const char = buildChar({
      equipment: [
        { catalogue_id: 'knife',          state: 'carried',  acquired_cycle: 1, notes: null },
        { catalogue_id: 'reinforced-clothing', state: 'worn', acquired_cycle: 1, notes: null },
        { catalogue_id: 'flashlight',     state: 'stashed',  acquired_cycle: 2, notes: null },
      ],
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await sheetHtml(page);
    expect(html).toContain('Carried');
    expect(html).toContain('Worn');
    expect(html).toContain('Stashed');
  });

  test('AC-5: weapon entry shows name, damage qualifier, state chip', async ({ page }) => {
    const char = buildChar({
      equipment: [
        { catalogue_id: 'machete', state: 'carried', acquired_cycle: 1, notes: null },
      ],
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await sheetHtml(page);
    // Machete: damage_mod 1, damage_type lethal, weapon_type melee
    expect(html).toContain('Machete');
    expect(html).toContain('+1');
    expect(html).toContain('Lethal');
    expect(html).toContain('Melee');
    expect(html).toContain('Carried');
  });

  test('AC-6: armour entry shows AR value and defence in base(reduced) format', async ({ page }) => {
    // armoured-vest: armour_value 3, defence_penalty 1
    // character has Wits 2, Dexterity 2 → calcDefence = min(2,2) = 2
    // display: "AR 3 · Defence 2(1)"
    const char = buildChar({
      equipment: [
        { catalogue_id: 'armoured-vest', state: 'worn', acquired_cycle: 2, notes: null },
      ],
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await sheetHtml(page);
    expect(html).toContain('Armoured Vest');
    expect(html).toContain('AR 3');
    // base=2, penalty=1 → 2(1)
    expect(html).toContain('Defence 2(1)');
    expect(html).toContain('Worn');
  });

  test('AC-7: equipment entry shows skill pool modifier label', async ({ page }) => {
    // flashlight: skill_domain "Investigation", bonus_dice 1
    const char = buildChar({
      equipment: [
        { catalogue_id: 'flashlight', state: 'carried', acquired_cycle: 1, notes: null },
      ],
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await sheetHtml(page);
    expect(html).toContain('Flashlight');
    expect(html).toContain('+1 dice');
  });

  test('AC-8: asset entry shows name, description, and metadata', async ({ page }) => {
    const char = buildChar({
      assets: [{
        name: 'Warehouse',
        description: 'A disused warehouse on the docks.',
        location: 'North Shore',
        mechanical_effect: 'Feeding roll +2',
        acquired_cycle: 3,
        notes: 'Shared with Praxis',
      }],
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await sheetHtml(page);
    expect(html).toContain('Assets');
    expect(html).toContain('Warehouse');
    expect(html).toContain('disused warehouse on the docks');
    expect(html).toContain('North Shore');
    expect(html).toContain('Cycle 3');
  });

  test('AC-3: unknown catalogue_id renders as fallback display name without crashing', async ({ page }) => {
    const char = buildChar({
      equipment: [
        { catalogue_id: 'legacy-unknown-item', state: 'stashed', acquired_cycle: 0, notes: null },
      ],
    });
    await setupSuite(page, char);
    await renderSheetDesktop(page, char);

    const html = await sheetHtml(page);
    // Falls back to rendering catalogue_id as the name; section still present
    expect(html).toContain('Equipment &amp; Assets');
    expect(html).toContain('legacy-unknown-item');
    expect(html).toContain('Stashed');
  });

  test('AC-10: edit mode shows same read-only view with no inline inputs', async ({ page }) => {
    const char = buildChar({
      equipment: [
        { catalogue_id: 'knife', state: 'carried', acquired_cycle: 1, notes: null },
      ],
    });
    await setupSuite(page, char);

    // Render in edit mode via the editor's sheet function directly
    const result = await page.evaluate(async (c) => {
      const { shRenderEquipment } = await import('/js/editor/sheet.js');
      const html = shRenderEquipment(c, true /* editMode */);
      const hasInputs = /<input|<select/.test(html);
      const hasAddBtn = /add.*equip|shAddEquip/i.test(html);
      return { html, hasInputs, hasAddBtn };
    }, char);

    expect(result.hasInputs).toBe(false);
    expect(result.hasAddBtn).toBe(false);
    expect(result.html).toContain('Knife');
    expect(result.html).toContain('Carried');
  });

});
