/**
 * Fix #685 — Shared domain merit min-dot gate + three-tier dot display
 *
 * A character must have ≥1 own dot (cp, xp, or any free_* channel)
 * before receiving partner-contributed "shared" dots.
 *
 * Three-tier display in read-only sheet:
 *   ● filled            — inherent (cp + xp)
 *   ○ hollow            — bonus (free_* channels, e.g. free_mci)
 *   ○ underlined        — shared (partner contribution, .dot-shared class)
 *
 * Fixtures use Safe Place (MULTI_INSTANCE_DOMAIN) because its effective rating
 * is computed by domMeritTotalSingle — which includes partner contribution —
 * making the gate and three-tier display directly observable in the sheet.
 * Haven is CAP_DOMAIN (effective = min(stored, cap)), so its display was never
 * wrong; the gate there matters for domMeritAccess / prereq checking only.
 *
 * AC coverage:
 *   AC-1 — 0-dot stub (no cp, xp, free_*) → 0 effective dots, gate blocks partner
 *   AC-2 — ≥1 own dot → full partner contribution added
 *   AC-3 — Primary owner effective total unchanged by 0-dot partners
 *   AC-4 — Partner dots render as .dot-shared (underlined hollow ○)
 *   AC-4b — All three tiers distinct: ● inherent, ○ bonus, underlined ○ shared
 *   AC-5 — Edit-mode domain block contains no .dot-shared elements
 */

const { test, expect } = require('@playwright/test');

// ── Constants ─────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '777000685', username: 'test_st685', global_name: 'Test ST 685',
  avatar: null, role: 'st', player_id: 'p-685',
  character_ids: ['char-685-einar', 'char-685-rene'],
  is_dual_role: false,
};

// Both characters must share the same SP qualifier so domKey() matches in the
// partner lookup inside domMeritTotalSingle.
const SP_QUALIFIER = 'The Lair';

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeSP(opts = {}) {
  return {
    category: 'domain',
    name: 'Safe Place',
    qualifier: SP_QUALIFIER,
    cp:            opts.cp       ?? 0,
    xp:            opts.xp       ?? 0,
    free:          0,
    free_mci:      opts.free_mci ?? 0,
    free_bloodline: 0,
    free_pet:      0,
    free_vm:       0,
    free_lk:       0,
    free_inv:      0,
    rating:        opts.cp ?? 0,
    shared_with:   opts.shared_with ?? [],
  };
}

function baseAttrs() {
  const a = {};
  for (const n of ['Intelligence','Wits','Resolve','Strength','Dexterity','Stamina','Presence','Manipulation','Composure'])
    a[n] = { dots: 2, bonus: 0 };
  return a;
}

function buildChar(id, name, spOpts = {}) {
  return {
    _id: id,
    name,
    moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Ordo Dracul', player: 'Test Player',
    blood_potency: 2, humanity: 7, humanity_base: 7,
    court_title: null, retired: false,
    status: { city: 0, clan: 0, covenant: {} },
    attributes: baseAttrs(),
    skills: {},
    disciplines: {},
    merits: Object.keys(spOpts).length ? [makeSP(spOpts)] : [],
    powers: [], ordeals: [],
    xp_log: { spent: 0 },
  };
}

// ── Test harness ──────────────────────────────────────────────────────────────

async function setupAdmin(page, chars) {
  await page.addInitScript((u) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, ST_USER);

  // Catch-all first; specific routes registered after take priority (LIFO)
  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chars) })
  );
  await page.route('**/api/characters/names', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(chars.map(c => ({ _id: c._id, name: c.name, moniker: null, honorific: null }))),
    })
  );
  for (const c of chars) {
    await page.route(new RegExp(`/api/characters/${c._id}$`), r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(c) })
    );
  }
  await page.route('**/api/rules', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
}

async function openCharReadOnly(page, char) {
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])');
  await page.waitForSelector(`[data-id="${char._id}"]`, { timeout: 5000 });
  await page.click(`[data-id="${char._id}"]`);
  await page.waitForSelector('#cd-edit-toggle', { timeout: 5000 });
  await page.waitForTimeout(400);
}

async function openCharInEditMode(page, char) {
  await openCharReadOnly(page, char);
  await page.click('#cd-edit-toggle');
  await page.waitForSelector('#cd-save-api:not([style*="display: none"])', { timeout: 5000 });
  await page.waitForTimeout(300);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix-685: shared merit min-dot gate + three-tier display', () => {

  test('AC-1: 0-dot stub receives 0 effective dots — gate blocks partner contribution', async ({ page }) => {
    // Einar: 1 cp in SP, shared with Rene
    // Rene:  0 cp/xp/free — gate must prevent her from inheriting Einar's dot
    const einar = buildChar('char-685-einar', 'Einar',  { cp: 1, shared_with: ['Rene M'] });
    const rene  = buildChar('char-685-rene',  'Rene M', { cp: 0, shared_with: ['Einar'] });
    await setupAdmin(page, [einar, rene]);
    await openCharReadOnly(page, rene);

    // dp is set on Rene's SP (shared_with=['Einar']), so _shHtml renders.
    // own=0 → gate blocks → partnerTotal=0 → de=0 → shDotsThreeTier(0,0,0) → empty trait-dots.
    // The .dom-total-view container is in the DOM even though it has no content (empty span = 0px).
    await expect(page.locator('.dom-total-view')).toBeAttached({ timeout: 5000 });
    // No shared dots — the gate blocked all partner contribution
    await expect(page.locator('.dom-total-view .dot-shared')).toHaveCount(0);
    // Trait-dots span textContent is empty (0 effective dots)
    const traitText = await page.locator('.dom-total-view .trait-dots').evaluate(el => el.textContent);
    expect(traitText).toBe('');
  });

  test('AC-2: 1-own-dot character receives full partner contribution', async ({ page }) => {
    // Rene has 1 cp — gate passes — Einar's 1 shareable dot is added: de=2
    const einar = buildChar('char-685-einar', 'Einar',  { cp: 1, shared_with: ['Rene M'] });
    const rene  = buildChar('char-685-rene',  'Rene M', { cp: 1, shared_with: ['Einar'] });
    await setupAdmin(page, [einar, rene]);
    await openCharReadOnly(page, rene);

    // de=2: shDotsThreeTier(1, 0, 1) → '●' + '<span class="dot-shared">○</span>'
    // textContent = '●○' — 2 characters
    const domView = page.locator('.dom-total-view .trait-dots');
    await expect(domView).toBeVisible({ timeout: 5000 });
    const text = await domView.evaluate(el => el.textContent);
    expect(text.length).toBe(2);
  });

  test('AC-3: primary owner effective total is unchanged by a 0-dot partner', async ({ page }) => {
    // Einar owns 1 dot; Rene contributes 0 shareable → Einar stays at 1
    const einar = buildChar('char-685-einar', 'Einar',  { cp: 1, shared_with: ['Rene M'] });
    const rene  = buildChar('char-685-rene',  'Rene M', { cp: 0, shared_with: ['Einar'] });
    await setupAdmin(page, [einar, rene]);
    await openCharReadOnly(page, einar);

    // own=1, Rene's shareable=0 → de=1; shDotsThreeTier(1,0,0) → '●'
    const domView = page.locator('.dom-total-view .trait-dots');
    await expect(domView).toBeVisible({ timeout: 5000 });
    const text = await domView.evaluate(el => el.textContent);
    expect(text).toBe('●');
  });

  test('AC-4: partner dots render as .dot-shared spans', async ({ page }) => {
    // Rene 1 cp + Einar 1 shareable → 1 partner dot → exactly 1 .dot-shared in the view
    const einar = buildChar('char-685-einar', 'Einar',  { cp: 1, shared_with: ['Rene M'] });
    const rene  = buildChar('char-685-rene',  'Rene M', { cp: 1, shared_with: ['Einar'] });
    await setupAdmin(page, [einar, rene]);
    await openCharReadOnly(page, rene);

    await expect(page.locator('.dom-total-view .dot-shared')).toHaveCount(1, { timeout: 5000 });
  });

  test('AC-4b: three tiers all distinct — inherent ●, bonus ○, shared underlined ○', async ({ page }) => {
    // Rene: 1 inherent (cp=1) + 1 bonus (free_mci=1) + 1 shared (Einar cp=1) = de=3
    // _sh3Inherent=1, _sh3Bonus=1, _sh3Shared=1
    const einar = buildChar('char-685-einar', 'Einar',  { cp: 1, shared_with: ['Rene M'] });
    const rene  = buildChar('char-685-rene',  'Rene M', { cp: 1, free_mci: 1, shared_with: ['Einar'] });
    await setupAdmin(page, [einar, rene]);
    await openCharReadOnly(page, rene);

    const domView = page.locator('.dom-total-view .trait-dots');
    await expect(domView).toBeVisible({ timeout: 5000 });
    // textContent = '●○○' (inherent + bonus + shared — shared renders as ○ via .dot-shared span)
    const text = await domView.evaluate(el => el.textContent);
    expect(text.length).toBe(3);
    // Exactly one .dot-shared span (the partner dot)
    await expect(page.locator('.dom-total-view .dot-shared')).toHaveCount(1);
  });

  test('AC-5: edit-mode domain block contains no .dot-shared elements', async ({ page }) => {
    // In edit mode the "My dots" stepper shows own dots only; partner dots must not appear
    const einar = buildChar('char-685-einar', 'Einar',  { cp: 1, shared_with: ['Rene M'] });
    const rene  = buildChar('char-685-rene',  'Rene M', { cp: 1, shared_with: ['Einar'] });
    await setupAdmin(page, [einar, rene]);
    await openCharInEditMode(page, rene);

    await expect(page.locator('.dom-edit-block')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.dom-edit-block .dot-shared')).toHaveCount(0);
  });

});
