/**
 * E2E tests for feature.654 — EQ-1: Equipment Schema, Catalogue Module, and CRUD API.
 *
 * These tests cover browser-side concerns:
 *   1. EQUIPMENT_CATALOGUE module exports correctly and has valid entry shapes.
 *   2. App boots without error for a character that has the new equipment/assets fields.
 *   3. App boots without error for a legacy character with no equipment/assets fields.
 *
 * API route logic (GET catalogue, POST/DELETE equipment/assets, auth gating) is fully
 * covered by Vitest in server/tests/equipment.test.js (21 tests). These E2E tests
 * complement by verifying the browser-importable module shape and app-level regression.
 */

const { test, expect } = require('@playwright/test');
const { bootApp, PLAYER_USER } = require('./helpers/unified-app.js');

// ── Minimal character fixtures ────────────────────────────────────────────────

function baseChar(overrides = {}) {
  return {
    _id: 'char-eq654', name: 'Equip Test Char', moniker: null, honorific: null,
    player: 'Test Player', clan: 'Mekhet', covenant: 'Invictus',
    blood_potency: 1, humanity: 7, humanity_base: 7,
    court_title: null, retired: false, pending_approval: false,
    status: { city: 1, clan: 1, covenant: {} },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
    ...overrides,
  };
}

async function mountChar(page, char) {
  await page.route(/\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
  );
  await page.route(new RegExp(`/api/characters/${char._id}$`), r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) })
  );
  await page.route(/\/api\/characters\/names/, r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: char._id, name: char.name }]) })
  );
  // Catalogue endpoint — return a minimal stub so any consumer calling it
  // in future (EQ-2/EQ-3) doesn't receive an empty 200 from the catch-all.
  await page.route('**/api/equipment/catalogue', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([
        { id: 'knife',      bucket: 'weapon',    name: 'Knife',       availability: 1, tags: ['melee'] },
        { id: 'flashlight', bucket: 'equipment', name: 'Flashlight',  availability: 1, tags: ['mental', 'tools'] },
        { id: 'ballistic-vest', bucket: 'armour', name: 'Ballistic Vest', availability: 2, tags: ['armour'] },
        { id: 'haven-apartment', bucket: 'asset', name: 'Haven (Apartment)', availability: 2, tags: ['haven'] },
      ]) })
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('feature.654 EQ-1 — EQUIPMENT_CATALOGUE module shape', () => {

  test('EQUIPMENT_CATALOGUE is a non-empty array importable in the browser', async ({ page }) => {
    await bootApp(page, PLAYER_USER, {
      routes: async (p) => mountChar(p, baseChar()),
      navigate: true,
    });

    const result = await page.evaluate(async () => {
      try {
        const mod = await import('/js/data/equipment-data.js');
        const cat = mod.EQUIPMENT_CATALOGUE;
        if (!Array.isArray(cat) || cat.length === 0) return { ok: false, error: 'Not a non-empty array' };
        return { ok: true, length: cat.length };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });

    expect(result.ok).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test('every entry has id, bucket, name, description, availability, tags', async ({ page }) => {
    await bootApp(page, PLAYER_USER, {
      routes: async (p) => mountChar(p, baseChar()),
      navigate: true,
    });

    const result = await page.evaluate(async () => {
      const mod = await import('/js/data/equipment-data.js');
      const VALID_BUCKETS = ['weapon', 'armour', 'equipment', 'asset'];
      const bad = [];
      for (const e of mod.EQUIPMENT_CATALOGUE) {
        if (typeof e.id !== 'string' || !e.id) bad.push(`${e.id}: missing id`);
        if (!VALID_BUCKETS.includes(e.bucket)) bad.push(`${e.id}: invalid bucket '${e.bucket}'`);
        if (typeof e.name !== 'string') bad.push(`${e.id}: missing name`);
        if (typeof e.description !== 'string') bad.push(`${e.id}: missing description`);
        if (typeof e.availability !== 'number') bad.push(`${e.id}: invalid availability`);
        if (!Array.isArray(e.tags)) bad.push(`${e.id}: tags not array`);
      }
      return { ok: bad.length === 0, bad: bad.slice(0, 5) };
    });

    expect(result.ok).toBe(true);
  });

  test('catalogue has at least one entry per bucket', async ({ page }) => {
    await bootApp(page, PLAYER_USER, {
      routes: async (p) => mountChar(p, baseChar()),
      navigate: true,
    });

    const buckets = await page.evaluate(async () => {
      const mod = await import('/js/data/equipment-data.js');
      return [...new Set(mod.EQUIPMENT_CATALOGUE.map(e => e.bucket))];
    });

    expect(buckets).toContain('weapon');
    expect(buckets).toContain('armour');
    expect(buckets).toContain('equipment');
    expect(buckets).toContain('asset');
  });

  test('equipment entries have skill_domain and bonus_dice; weapon entries have damage fields', async ({ page }) => {
    await bootApp(page, PLAYER_USER, {
      routes: async (p) => mountChar(p, baseChar()),
      navigate: true,
    });

    const result = await page.evaluate(async () => {
      const mod = await import('/js/data/equipment-data.js');
      const cat = mod.EQUIPMENT_CATALOGUE;

      const eqEntry  = cat.find(e => e.bucket === 'equipment');
      const wpEntry  = cat.find(e => e.bucket === 'weapon');
      const arEntry  = cat.find(e => e.bucket === 'armour');

      if (!eqEntry) return { ok: false, error: 'No equipment entry found' };
      if (!wpEntry) return { ok: false, error: 'No weapon entry found' };
      if (!arEntry) return { ok: false, error: 'No armour entry found' };

      // equipment: must have skill_domain + bonus_dice; weapon/armour fields null
      if (typeof eqEntry.skill_domain !== 'string') return { ok: false, error: `equipment entry '${eqEntry.id}' missing skill_domain` };
      if (typeof eqEntry.bonus_dice !== 'number')   return { ok: false, error: `equipment entry '${eqEntry.id}' missing bonus_dice` };
      if (eqEntry.damage_mod !== null)              return { ok: false, error: `equipment entry '${eqEntry.id}' damage_mod should be null` };

      // weapon: must have damage_mod, damage_type, weapon_type; skill_domain null
      const DAMAGE_TYPES  = ['bashing', 'lethal', 'aggravated'];
      const WEAPON_TYPES  = ['melee', 'ranged', 'thrown'];
      if (typeof wpEntry.damage_mod !== 'number')         return { ok: false, error: `weapon entry '${wpEntry.id}' missing damage_mod` };
      if (!DAMAGE_TYPES.includes(wpEntry.damage_type))    return { ok: false, error: `weapon entry '${wpEntry.id}' invalid damage_type` };
      if (!WEAPON_TYPES.includes(wpEntry.weapon_type))    return { ok: false, error: `weapon entry '${wpEntry.id}' invalid weapon_type` };
      if (wpEntry.skill_domain !== null)                  return { ok: false, error: `weapon entry '${wpEntry.id}' skill_domain should be null` };

      // armour: must have armour_value + defence_penalty
      if (typeof arEntry.armour_value !== 'number')      return { ok: false, error: `armour entry '${arEntry.id}' missing armour_value` };
      if (typeof arEntry.defence_penalty !== 'number')   return { ok: false, error: `armour entry '${arEntry.id}' missing defence_penalty` };

      return { ok: true };
    });

    expect(result.ok).toBe(true);
  });

  test('getCatalogueEntry() returns the correct entry by id', async ({ page }) => {
    await bootApp(page, PLAYER_USER, {
      routes: async (p) => mountChar(p, baseChar()),
      navigate: true,
    });

    const result = await page.evaluate(async () => {
      const mod = await import('/js/data/equipment-data.js');
      const entry = mod.getCatalogueEntry('knife');
      if (!entry) return { ok: false, error: 'knife not found' };
      if (entry.bucket !== 'weapon') return { ok: false, error: `bucket should be weapon, got ${entry.bucket}` };
      const missing = mod.getCatalogueEntry('does-not-exist-xyz');
      if (missing !== undefined) return { ok: false, error: 'non-existent id should return undefined' };
      return { ok: true };
    });

    expect(result.ok).toBe(true);
  });

  test('getCatalogueByBucket() filters correctly', async ({ page }) => {
    await bootApp(page, PLAYER_USER, {
      routes: async (p) => mountChar(p, baseChar()),
      navigate: true,
    });

    const result = await page.evaluate(async () => {
      const mod = await import('/js/data/equipment-data.js');
      const weapons = mod.getCatalogueByBucket('weapon');
      if (!Array.isArray(weapons) || weapons.length === 0) return { ok: false, error: 'no weapons returned' };
      if (weapons.some(e => e.bucket !== 'weapon'))        return { ok: false, error: 'non-weapon in weapon bucket results' };
      return { ok: true };
    });

    expect(result.ok).toBe(true);
  });

});

test.describe('feature.654 EQ-1 — app regression: characters load with new schema fields', () => {

  test('character WITH equipment and assets fields boots the app without error', async ({ page }) => {
    const charWithEquip = baseChar({
      equipment: [
        { catalogue_id: 'knife',      state: 'carried', acquired_cycle: 1, notes: null },
        { catalogue_id: 'flashlight', state: 'stashed', acquired_cycle: 0, notes: 'backup' },
      ],
      assets: [
        {
          name: 'Marrickville Safehouse', description: 'A warehouse in the inner west.',
          location: 'Marrickville', mechanical_effect: null, acquired_cycle: 2, notes: null,
        },
      ],
    });

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await bootApp(page, PLAYER_USER, {
      routes: async (p) => mountChar(p, charWithEquip),
      navigate: true,
    });

    // App must be visible
    await expect(page.locator('#app')).toBeVisible();

    // No uncaught JS errors from the new schema fields
    const equipErrors = errors.filter(e =>
      e.includes('equipment') || e.includes('assets') || e.includes('catalogue')
    );
    expect(equipErrors).toHaveLength(0);
  });

  test('character WITHOUT equipment or assets fields boots the app without error (legacy data)', async ({ page }) => {
    // Simulate a character document that predates EQ-1 — no equipment/assets fields at all.
    const legacyChar = baseChar();
    delete legacyChar.equipment;
    delete legacyChar.assets;

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await bootApp(page, PLAYER_USER, {
      routes: async (p) => mountChar(p, legacyChar),
      navigate: true,
    });

    await expect(page.locator('#app')).toBeVisible();

    const equipErrors = errors.filter(e =>
      e.includes('equipment') || e.includes('assets') || e.includes('catalogue')
    );
    expect(equipErrors).toHaveLength(0);
  });

  test('character with old-schema equipment field (weapon/armour flat shape) boots without crash', async ({ page }) => {
    // Some live characters may still have old-format equipment data before migration.
    // The app must not crash — it should tolerate the unexpected shape gracefully.
    const oldSchemaChar = baseChar({
      equipment: [
        { type: 'weapon', name: 'Silver Dagger', damage_rating: 1, damage_type: 'L',
          attack_skill: 'Weaponry', tags: [], notes: 'Custom blade' },
      ],
    });

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await bootApp(page, PLAYER_USER, {
      routes: async (p) => mountChar(p, oldSchemaChar),
      navigate: true,
    });

    await expect(page.locator('#app')).toBeVisible();
  });

});
