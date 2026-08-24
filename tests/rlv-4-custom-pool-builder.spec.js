// E2E coverage for rlv.4 — the "+ Custom Pool" ad-hoc Attribute x Skill x
// Discipline builder on the Roll tab. Adapts gdx-11's stranded dev-branch
// Custom Pool builder (git commit 922f357e) directly onto main; see
// specs/stories/rlv-4-port-builder-ux-into-unified-roller.md for the full
// adaptation spec. House style follows
// tests/rlv-2-single-roller-retirement.spec.js: source-fetch smokes for
// static assertions, plus a live-boot flow for the interactive path.
//
// Character injection: this app registers a Service Worker (public/sw.js)
// that intercepts /api/characters ahead of Playwright's page.route() stubs
// and serves real cached data from whatever real ST session last used this
// origin — confirmed by direct diagnosis during this story's dev-story pass
// (a real, pre-existing test-infrastructure gap, out of this story's scope
// to fix broadly). This suite sidesteps it entirely by injecting the fixture
// character via the same exposed `window.pickChar(c)` global the real
// character-list panel itself calls — real app code, real renderCharPools()
// wiring, just skipping the network fetch that the SW hijacks. Matches the
// precedent already set by tests/feature-662-eq3-roll-calc-equipment-chips
// .spec.js's direct `suite/data.js` state injection for the same reason.

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

// ── Source-fetch smokes ──────────────────────────────────────────────────

test('rlv.4 — shared/pools.js exports unskilledPenalty', async ({ request }) => {
  const res = await request.get('/js/shared/pools.js');
  const src = await res.text();
  expect(src).toMatch(/export\s+function\s+unskilledPenalty\b/);
});

test('rlv.4 — char-pools.js builds the "+ Custom Pool" choice tile', async ({ request }) => {
  const res = await request.get('/js/game/char-pools.js');
  const src = await res.text();
  expect(src).toMatch(/opensPanel:\s*'custom'/);
  expect(src).toMatch(/\+ Custom Pool/);
  expect(src).toMatch(/function choiceBtn\(/);
});

test('rlv.4 — app.js has the custom panel mode and routes opensPanel tiles', async ({ request }) => {
  const res = await request.get('/js/app.js');
  const src = await res.text();
  expect(src).toMatch(/mode === 'custom'/);
  expect(src).toMatch(/if \(p\.opensPanel\) \{ openPanel\(p\.opensPanel\); return; \}/);
  // Not the retired gdx-11 dev-branch scope — this story ports Custom Pool
  // only, not the rest of that commit.
  expect(src).not.toMatch(/lashOutPool|bloodBondPool|isStakeWeapon/);
});

test('rlv.4 — suite.css contains the scoped-panel and choice-tile classes', async ({ request }) => {
  const res = await request.get('/css/suite.css');
  const css = await res.text();
  for (const cls of [
    '.vm-chip-wrap',
    '.panel-total',
    '.pnl-confirm-btn',
    '.gcp-pool-btn.gcp-choice',
    '.gcp-choice-wide',
  ]) {
    expect(css.includes(cls), `${cls} missing from suite.css`).toBe(true);
  }
});

// ── Live boot flow — no OAuth needed (local-test-token bypass) ──────────

const ST_USER = {
  id: '900000004', username: 'test_st_rlv4', global_name: 'Test ST rlv4',
  avatar: null, role: 'st', player_id: 'p-rlv4', character_ids: [], is_dual_role: false,
};

function attrs(overrides = {}) {
  return {
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    ...overrides,
  };
}

// Has one non-zero skill (Occult) and one discipline (Auspex) — used for the
// interactive attribute+skill+discipline formula tests. Intelligence/Occult/
// Auspex are deliberately chosen because none of them are boosted by this
// app's discipline-enhances-attribute rule (Celerity->Dex, Vigour->Str,
// Resilience->Sta only), so getAttrEffective's total is predictable without
// depending on the rules-cache fallback.
const RICH_CHAR = {
  _id: 'char-rlv4-rich', name: 'Custom Pool Tester', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: attrs(),
  skills: { Occult: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: { Auspex: { dots: 2 } },
  merits: [], powers: [], ordeals: [],
};

// Has Professional Training 5 with Occult as an asset skill — used for the
// Rote-eligibility regression test (AC5, Codex Pass 3a finding, patched
// during this story's own review).
const ROTE_CHAR = {
  _id: 'char-rlv4-rote', name: 'Rote Tester', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: attrs(),
  skills: { Occult: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: {},
  merits: [{ category: 'general', name: 'Professional Training', rating: 5, asset_skills: ['Occult'] }],
  powers: [], ordeals: [],
};

// Zero non-zero skills, zero disciplines — used for the "tile visible even
// with nothing built up yet" AC2 test.
const EMPTY_CHAR = {
  _id: 'char-rlv4-empty', name: 'Blank Slate', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: attrs(),
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

async function setupSuite(page, chars) {
  await page.addInitScript((user) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, ST_USER);

  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(/\/api\/game_sessions\/next/, r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chars) }));

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  // Land on the Roll tab explicitly — boot()'s default-landing tab depends on
  // viewport width and prior character selection state, neither of which
  // this test wants to depend on.
  await page.evaluate(() => window.goTab('roll'));
  await page.waitForSelector('#t-roll.active', { state: 'visible', timeout: 5000 });
}

// Injects the fixture character via the real, exposed `window.pickChar(c)`
// global rather than driving the character-list panel's real API-backed
// flow — see the file header comment for why.
async function pickCharacter(page, char) {
  await page.evaluate((c) => window.pickChar(c), char);
  await expect(page.locator('#roll-char-pools')).toBeVisible({ timeout: 5000 });
}

test('rlv.4 — Select a character first, when no character is loaded', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await page.evaluate(() => window.openPanel('custom'));
  await page.waitForSelector('#panel', { state: 'visible', timeout: 10000 });
  await expect(page.locator('#panel-body')).toContainText('Select a character first');
});

test('rlv.4 — "+ Custom Pool" tile renders even with zero skills and zero disciplines', async ({ page }) => {
  await setupSuite(page, [EMPTY_CHAR]);
  await pickCharacter(page, EMPTY_CHAR);
  await expect(page.locator('#roll-char-pools .gcp-choice')).toBeVisible();
  await expect(page.locator('#roll-char-pools .gcp-choice')).toContainText('Custom Pool');
});

test('rlv.4 — tapping the tile opens the Custom Pool panel with three chip groups', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  await page.locator('#roll-char-pools .gcp-choice').click();
  await page.waitForSelector('#panel', { state: 'visible', timeout: 10000 });
  await expect(page.locator('#panel-title')).toHaveText('Custom Pool');
  await expect(page.locator('.cp-attr-chip')).toHaveCount(9);
  // Occult is RICH_CHAR's only non-zero skill — shown by default.
  await expect(page.locator('.cp-skill-chip[data-s="Occult"]')).toBeVisible();
  await expect(page.locator('.cp-disc-chip[data-d="Auspex"]')).toBeVisible();
  // No "Load Pool" until an Attribute is picked.
  await expect(page.locator('#cp-load')).toHaveCount(0);
});

test('rlv.4 — picking Attribute+Skill+Discipline computes the live total and loads the pool', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  await page.locator('#roll-char-pools .gcp-choice').click();
  await page.waitForSelector('#panel', { state: 'visible', timeout: 10000 });

  await page.locator('.cp-attr-chip[data-a="Intelligence"]').click();
  await page.locator('.cp-skill-chip[data-s="Occult"]').click();
  await page.locator('.cp-disc-chip[data-d="Auspex"]').click();

  // Intelligence 3 + Occult 3 + Auspex 2 = 8.
  await expect(page.locator('.panel-total')).toContainText('Intelligence 3');
  await expect(page.locator('.panel-total')).toContainText('Occult 3');
  await expect(page.locator('.panel-total')).toContainText('Auspex 2');
  await expect(page.locator('.panel-total b')).toHaveText('8');

  await page.locator('#cp-load').click();

  // Panel closes on Load Pool (loadPool() calls closePanel()).
  await expect(page.locator('#panel-overlay')).not.toHaveClass(/\bon\b/);

  await expect(page.locator('#pool-banner')).toContainText('Intelligence + Occult + Auspex');
  await expect(page.locator('#pool-banner')).toContainText('8d');
  await expect(page.locator('#rv2-eff')).toHaveText('8');
  await expect(page.locator('#effline')).toContainText('Intelligence');
  await expect(page.locator('#effline')).toContainText('Occult');
  await expect(page.locator('#effline')).toContainText('Auspex');
});

test('rlv.4 — a 0-dot skill applies unskilledPenalty and the total floors at 0', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  await page.locator('#roll-char-pools .gcp-choice').click();
  await page.waitForSelector('#panel', { state: 'visible', timeout: 10000 });

  // Investigation (Mental, 0 dots) is hidden by default — reveal via "show all".
  await expect(page.locator('.cp-skill-chip[data-s="Investigation"]')).toHaveCount(0);
  await page.locator('#cp-showall').click();
  await expect(page.locator('.cp-skill-chip[data-s="Investigation"]')).toBeVisible();

  await page.locator('.cp-attr-chip[data-a="Wits"]').click();
  await page.locator('.cp-skill-chip[data-s="Investigation"]').click();

  // Wits 2 + Investigation -3 (unskilled Mental) = -1, floored to 0.
  await expect(page.locator('.panel-total')).toContainText('unskilled');
  await expect(page.locator('.panel-total b')).toHaveText('0');

  await page.locator('#cp-load').click();
  await expect(page.locator('#pool-banner')).toContainText('0d');
});

test('rlv.4 — chips deselect on a second tap', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  await page.locator('#roll-char-pools .gcp-choice').click();
  await page.waitForSelector('#panel', { state: 'visible', timeout: 10000 });

  const attrChip = page.locator('.cp-attr-chip[data-a="Intelligence"]');
  await attrChip.click();
  await expect(attrChip).toHaveClass(/\bon\b/);
  await expect(page.locator('#cp-load')).toBeVisible();

  await attrChip.click();
  await expect(attrChip).not.toHaveClass(/\bon\b/);
  // No Attribute picked -> no Load Pool button.
  await expect(page.locator('#cp-load')).toHaveCount(0);
});

// Regression guard (Codex Pass 2 finding, patched during this story's own
// review): renderCharPools() is called for two independently-mounted
// containers (#gcp-panel on Sheets, #roll-char-pools on Roll), each
// possibly showing a different character. The pools array these buttons
// resolve their index against must be scoped per render call, not a shared
// module-level singleton — otherwise a button still attached from an
// earlier render in one container can resolve against a LATER render's
// array in a different container once that render replaces the shared
// state, silently loading the wrong pool (or receiving `undefined` if the
// stale index is now out of range).
test('rlv.4 — a pool button in one container is unaffected by a later render in another container', async ({ page }) => {
  const CHAR_A = {
    _id: 'char-guard-a', name: 'Guard Character A',
    attributes: attrs(),
    skills: { Occult: { dots: 3, bonus: 0, specs: [], nine_again: false } },
    disciplines: {}, merits: [], powers: [],
  };
  const CHAR_B = {
    _id: 'char-guard-b', name: 'Guard Character B',
    attributes: attrs(),
    skills: {}, disciplines: {}, merits: [], powers: [],
  };

  await setupSuite(page, [CHAR_A]);

  const result = await page.evaluate(async ({ a, b }) => {
    const mod = await import('/js/game/char-pools.js');
    const container1 = document.createElement('div'); document.body.appendChild(container1);
    const container2 = document.createElement('div'); document.body.appendChild(container2);

    let capturedFromContainer1 = 'NOT_CALLED';
    mod.renderCharPools(container1, a, (p) => { capturedFromContainer1 = p; });
    // A has one skill pool (Occult) + the Custom Pool tile -> Custom Pool is at index 1.
    const aCustomBtn = Array.from(container1.querySelectorAll('button'))
      .find(btn => btn.textContent.includes('Custom Pool'));

    // Render B into a SEPARATE container. B has zero skill pools -> its
    // Custom Pool tile is at index 0 in the (shared, if buggy) array.
    mod.renderCharPools(container2, b, () => {});

    // Click A's still-attached button from container1 — this must resolve
    // against A's own pool, not whatever container2's render left behind.
    aCustomBtn.click();

    return {
      isPlainObject: typeof capturedFromContainer1 === 'object' && capturedFromContainer1 !== null,
      opensPanel: capturedFromContainer1?.opensPanel,
      label: capturedFromContainer1?.label,
    };
  }, { a: CHAR_A, b: CHAR_B });

  expect(result.isPlainObject).toBe(true);
  expect(result.opensPanel).toBe('custom');
  expect(result.label).toBe('+ Custom Pool');
});

// AC5 promises the Rote badge applies to a Custom Pool exactly as it does
// to any named pool. Rote eligibility (PT dot-5 + asset skill) is specific
// to the chosen Skill, computable independent of how the pool was built.
test('rlv.4 — Rote eligibility (PT dot-5 asset skill) applies to a Custom Pool exactly as a named pool', async ({ page }) => {
  await setupSuite(page, [ROTE_CHAR]);
  await pickCharacter(page, ROTE_CHAR);
  await page.locator('#roll-char-pools .gcp-choice').click();
  await page.waitForSelector('#panel', { state: 'visible', timeout: 10000 });

  await page.locator('.cp-attr-chip[data-a="Intelligence"]').click();
  await page.locator('.cp-skill-chip[data-s="Occult"]').click();
  await page.locator('#cp-load').click();

  // #effline lives inside a collapsed <details class="rv2-breakdown"> by
  // design — open it before asserting visibility.
  await page.locator('.rv2-breakdown > summary').click();
  await expect(page.locator('#effline .effpool-seg--rote')).toBeVisible();
  await expect(page.locator('#effline .effpool-seg--rote')).toContainText('Rote');
});
