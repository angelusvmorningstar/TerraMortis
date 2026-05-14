/**
 * Issue #313 — Haven should be a shareable Domain merit like Safe Place
 *
 * Root cause: 'Haven' was in `_noShare` in sheet.js, preventing the partner
 * chips and "+ Add shared partner..." dropdown from rendering for Haven.
 *
 * Fix: removed 'Haven' from `_noShare`; updated `_capTotalDots` formula to
 * include partner contributions up to the Safe Place cap when Haven is shared;
 * fixed `is_shared` bug in export-character.js (was an undeclared variable).
 *
 * AC coverage:
 *   AC-2 — Haven shows "+ Add shared partner..." dropdown in ST editor
 *   AC-3 — Adding partner to Haven stores shared_with on both characters
 *   AC-4 — Removing partner clears shared_with on both sides
 *   AC-5 — attached_to (Safe Place) is preserved after adding a partner
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '777000313', username: 'test_st313', global_name: 'Test ST 313',
  avatar: null, role: 'st', player_id: 'p-313',
  character_ids: ['char-313-a', 'char-313-b'], is_dual_role: false,
};

function buildCharA() {
  return {
    _id: 'char-313-a',
    name: 'Azalea Haven Tester',
    moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Ordo Dracul', player: 'Test Player A',
    blood_potency: 2, humanity: 6, humanity_base: 7,
    court_title: null, retired: false,
    status: { city: 1, clan: 1, covenant: {} },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: { Stealth: { dots: 2, bonus: 0, specs: [], nine_again: false } },
    disciplines: {},
    // Domain merits in order: SP at di=0, Haven at di=1
    merits: [
      { category: 'domain', name: 'Safe Place', qualifier: 'The Manse', cp: 2, xp: 0, free: 0, free_mci: 0, free_bloodline: 0, free_pet: 0, free_vm: 0, free_lk: 0, free_inv: 0, rating: 0 },
      { category: 'domain', name: 'Haven', attached_to: 'Safe Place (The Manse)', cp: 2, xp: 0, free: 0, free_mci: 0, free_bloodline: 0, free_pet: 0, free_vm: 0, free_lk: 0, free_inv: 0, rating: 0 },
    ],
    powers: [], ordeals: [],
    xp_log: { spent: 0 },
  };
}

function buildCharB() {
  return {
    _id: 'char-313-b',
    name: 'Brennan Partner Tester',
    moniker: null, honorific: null,
    clan: 'Ventrue', covenant: 'Invictus', player: 'Test Player B',
    blood_potency: 1, humanity: 7, humanity_base: 7,
    court_title: null, retired: false,
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: { Persuasion: { dots: 1, bonus: 0, specs: [], nine_again: false } },
    disciplines: {},
    merits: [],
    powers: [], ordeals: [],
    xp_log: { spent: 0 },
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setupSuite(page, charA, charB) {
  await page.addInitScript((u) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, ST_USER);

  // Catch-all first — specific routes registered after take priority (LIFO)
  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([charA, charB]) })
  );
  await page.route('**/api/characters/names', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([
        { _id: charA._id, name: charA.name, moniker: null, honorific: null },
        { _id: charB._id, name: charB.name, moniker: null, honorific: null },
      ]),
    })
  );
  await page.route(new RegExp(`/api/characters/${charA._id}$`), r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charA) })
  );
  await page.route(new RegExp(`/api/characters/${charB._id}$`), r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charB) })
  );
  await page.route('**/api/rules', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
}

async function openCharInEditMode(page, char) {
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])');
  await page.waitForSelector(`[data-id="${char._id}"]`, { timeout: 5000 });
  await page.click(`[data-id="${char._id}"]`);
  await page.waitForSelector('#cd-edit-toggle', { timeout: 5000 });
  await page.click('#cd-edit-toggle');
  await page.waitForTimeout(300);
  await page.waitForSelector('#cd-save-api:not([style*="display: none"])', { timeout: 5000 });
}

// Haven is the second domain merit in buildCharA() fixtures (di=1 in domain-filtered index)
const HAVEN_DI = 1;

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('issue-313: Haven shared domain merit', () => {

  test('AC-2: Haven shows "+ Add shared partner..." dropdown', async ({ page }) => {
    const charA = buildCharA();
    const charB = buildCharB();
    await setupSuite(page, charA, charB);
    await openCharInEditMode(page, charA);

    // Char B is available as a partner so avP is non-empty for both SP and Haven.
    // Before the fix only SP had a dropdown; after the fix Haven also gets one.
    // Haven is the second .dom-edit-block (di=1 in the rendered list).
    const havenBlock = page.locator('.dom-edit-block').nth(HAVEN_DI);
    await expect(havenBlock.locator('.dom-add-partner-row')).toBeVisible({ timeout: 5000 });
  });

  test('AC-3: Adding a partner stores shared_with on both characters', async ({ page }) => {
    const charA = buildCharA();
    const charB = buildCharB();
    await setupSuite(page, charA, charB);

    let savedA = null;
    let savedB = null;

    // Override char routes to capture PUTs (LIFO -- these win over setupSuite's routes)
    await page.route(new RegExp(`/api/characters/${charA._id}$`), r => {
      if (r.request().method() === 'PUT') {
        savedA = JSON.parse(r.request().postData() || '{}');
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charA) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charA) });
    });
    await page.route(new RegExp(`/api/characters/${charB._id}$`), r => {
      if (r.request().method() === 'PUT') {
        savedB = JSON.parse(r.request().postData() || '{}');
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charB) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charB) });
    });

    await openCharInEditMode(page, charA);

    // Add Char B as partner on Haven (di=1)
    await page.evaluate(
      ({ di, pName }) => window.shAddDomainPartner(di, pName),
      { di: HAVEN_DI, pName: charB.name }
    );
    await page.waitForTimeout(200);

    // Save triggers the cascade save for dirty partners
    await page.click('#cd-save-api');
    await page.waitForTimeout(800);

    // Char A's Haven should list Char B in shared_with
    expect(savedA).not.toBeNull();
    const havenA = (savedA.merits || []).find(m => m.category === 'domain' && m.name === 'Haven');
    expect(havenA).toBeDefined();
    expect(havenA.shared_with).toContain(charB.name);

    // Char B gets a cascade save with a Haven entry listing Char A in shared_with
    expect(savedB).not.toBeNull();
    const havenB = (savedB.merits || []).find(m => m.category === 'domain' && m.name === 'Haven');
    expect(havenB).toBeDefined();
    expect(havenB.shared_with).toContain(charA.name);
  });

  test('AC-4: Removing a partner clears shared_with on both sides', async ({ page }) => {
    // Start from a pre-shared state
    const charA = buildCharA();
    charA.merits[1].shared_with = [buildCharB().name];

    const charB = buildCharB();
    // Char B has Haven cp=1 (non-zero so it won't be auto-removed on unlink)
    charB.merits = [{
      category: 'domain', name: 'Haven',
      attached_to: 'Safe Place (The Manse)',
      cp: 1, xp: 0, free: 0, free_mci: 0, free_bloodline: 0, free_pet: 0, free_vm: 0, free_lk: 0, free_inv: 0,
      rating: 0, shared_with: [charA.name],
    }];

    await setupSuite(page, charA, charB);

    let savedA = null;
    let savedB = null;

    await page.route(new RegExp(`/api/characters/${charA._id}$`), r => {
      if (r.request().method() === 'PUT') {
        savedA = JSON.parse(r.request().postData() || '{}');
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charA) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charA) });
    });
    await page.route(new RegExp(`/api/characters/${charB._id}$`), r => {
      if (r.request().method() === 'PUT') {
        savedB = JSON.parse(r.request().postData() || '{}');
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charB) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charB) });
    });

    await openCharInEditMode(page, charA);

    await page.evaluate(
      ({ di, pName }) => window.shRemoveDomainPartner(di, pName),
      { di: HAVEN_DI, pName: charB.name }
    );
    await page.waitForTimeout(200);

    await page.click('#cd-save-api');
    await page.waitForTimeout(800);

    // Char A's Haven shared_with should no longer include Char B
    expect(savedA).not.toBeNull();
    const havenA = (savedA.merits || []).find(m => m.category === 'domain' && m.name === 'Haven');
    expect(havenA).toBeDefined();
    expect(havenA.shared_with || []).not.toContain(charB.name);

    // Char B's Haven shared_with should no longer include Char A
    expect(savedB).not.toBeNull();
    const havenB = (savedB.merits || []).find(m => m.category === 'domain' && m.name === 'Haven');
    expect(havenB).toBeDefined();
    expect(havenB.shared_with || []).not.toContain(charA.name);
  });

  test('AC-5: attached_to is preserved after adding a partner', async ({ page }) => {
    const charA = buildCharA();
    const charB = buildCharB();
    await setupSuite(page, charA, charB);

    let savedA = null;
    await page.route(new RegExp(`/api/characters/${charA._id}$`), r => {
      if (r.request().method() === 'PUT') {
        savedA = JSON.parse(r.request().postData() || '{}');
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charA) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charA) });
    });
    await page.route(new RegExp(`/api/characters/${charB._id}$`), r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(charB) })
    );

    await openCharInEditMode(page, charA);

    await page.evaluate(
      ({ di, pName }) => window.shAddDomainPartner(di, pName),
      { di: HAVEN_DI, pName: charB.name }
    );
    await page.waitForTimeout(200);

    await page.click('#cd-save-api');
    await page.waitForTimeout(800);

    expect(savedA).not.toBeNull();
    const havenA = (savedA.merits || []).find(m => m.category === 'domain' && m.name === 'Haven');
    expect(havenA).toBeDefined();
    // Safe Place link must survive the partner add
    expect(havenA.attached_to).toBe('Safe Place (The Manse)');
    // And shared_with was also set
    expect(havenA.shared_with).toContain(charB.name);
  });

});
