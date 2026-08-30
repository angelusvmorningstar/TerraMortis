// E2E coverage for rcv.2 — Skills / Disciplines / Special as three
// INDEPENDENT accordions on the Roll tab's pool picker, replacing gdx-11's
// single "▸ Pools" collapse toggle, plus the relocation of "+ Custom Pool"
// out of the tile grid into a standalone button below the accordion group.
// See specs/stories/rcv-2-three-independent-accordions.md.
//
// Character injection: this app registers a Service Worker (public/sw.js)
// that intercepts /api/characters ahead of Playwright's page.route() stubs
// and serves real cached data from whatever real ST session last used this
// origin (see tests/rlv-4-custom-pool-builder.spec.js's own header for the
// original diagnosis). `serviceWorkers: 'block'` plus injecting the fixture
// character through the real, exposed `window.pickChar(c)` global sidesteps
// it entirely — real app code, real renderCharPools() wiring, no network
// fetch for the SW to hijack.

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

const ST_USER = {
  id: '900000009', username: 'test_st_rcv2', global_name: 'Test ST rcv2',
  avatar: null, role: 'st', player_id: 'p-rcv2', character_ids: [], is_dual_role: false,
};

function attrs(overrides = {}) {
  return {
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  ...overrides,
  };
}

// Two synthetic Auspex powers seeded into the rules cache, straddling the
// fixture character's Auspex 2: rank 1 is inside the gate, rank 3 is outside
// it. Deliberately fictional names so nothing here depends on the live
// purchasable_powers content. `key` must be the slug of `name` — that is what
// shared/pools.js's getPool() looks the rule up by.
const SEEDED_RULES = [
  {
    key: 'rcv2-shallow-sight', name: 'Rcv2 Shallow Sight', category: 'discipline',
    parent: 'Auspex', rank: 1, pool: { attr: 'Wits', skill: 'Occult' },
  },
  {
    key: 'rcv2-deep-sight', name: 'Rcv2 Deep Sight', category: 'discipline',
    parent: 'Auspex', rank: 3, pool: { attr: 'Wits', skill: 'Occult' },
  },
];

// Non-zero skills AND a rank-gated discipline, so all three accordions render.
const RICH_CHAR = {
  _id: 'char-rcv2-rich', name: 'Accordion Tester', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: attrs(),
  skills: {
    Occult: { dots: 3, bonus: 0, specs: [], nine_again: false },
    Athletics: { dots: 2, bonus: 0, specs: [], nine_again: false },
  },
  disciplines: { Auspex: { dots: 2 } },
  merits: [], powers: [], ordeals: [],
};

// A second character, used for the "state survives a character switch" test.
const OTHER_CHAR = {
  _id: 'char-rcv2-other', name: 'Second Tester', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: attrs(),
  skills: { Occult: { dots: 1, bonus: 0, specs: [], nine_again: false } },
  disciplines: { Auspex: { dots: 2 } },
  merits: [], powers: [], ordeals: [],
};

// Zero skills, zero disciplines — only Special renders, but "+ Custom Pool"
// must still be there (AC4: always visible, outside the accordion group).
const EMPTY_CHAR = {
  _id: 'char-rcv2-empty', name: 'Blank Slate', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: attrs(),
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const SKILLS_SEC  = '#roll-char-pools .gcp-acc-section[data-storage-key="tm_pools_open_skills"]';
const DISC_SEC    = '#roll-char-pools .gcp-acc-section[data-storage-key="tm_pools_open_disc"]';
const SPECIAL_SEC = '#roll-char-pools .gcp-acc-section[data-storage-key="tm_pools_open_special"]';

async function setupSuite(page, chars, seedOpenKeys = {}) {
  await page.addInitScript(({ user, rules, openKeys }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
    // loadRulesFromApi() falls back to this key when /api/rules returns an
    // empty array (which the blanket **/api/** stub below does).
    localStorage.setItem('tm_rules_db', JSON.stringify(rules));
    for (const [k, v] of Object.entries(openKeys)) localStorage.setItem(k, v);
  }, { user: ST_USER, rules: SEEDED_RULES, openKeys: seedOpenKeys });

  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(/\/api\/game_sessions\/next/, r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chars) }));

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.evaluate(() => window.goTab('roll'));
  await page.waitForSelector('#t-roll.active', { state: 'visible', timeout: 5000 });
}

async function pickCharacter(page, char) {
  await page.evaluate((c) => window.pickChar(c), char);
  await expect(page.locator('#roll-char-pools')).toBeVisible({ timeout: 5000 });
}

// ── Source-fetch smokes ──────────────────────────────────────────────────

test('rcv.2 — char-pools.js builds three independently-keyed accordion sections', async ({ request }) => {
  const res = await request.get('/js/game/char-pools.js');
  const src = await res.text();
  expect(src).toMatch(/function accordionSection\(/);
  expect(src).toMatch(/tm_pools_open_skills/);
  expect(src).toMatch(/tm_pools_open_disc/);
  expect(src).toMatch(/tm_pools_open_special/);
  expect(src).toMatch(/gcp-freebuild-btn/);
  // AC6: the old single-toggle key is retired outright, no migration read.
  expect(src).not.toMatch(/localStorage\.(get|set)Item\('tm_pools_collapsed'/);
});

test('rcv.2 — suite.css carries the accordion + freebuild rules and drops the retired ones', async ({ request }) => {
  const res = await request.get('/css/suite.css');
  const css = await res.text();
  for (const cls of [
    '.gcp-accordions',
    '.gcp-acc-section',
    '.gcp-acc-head',
    '.gcp-acc-label',
    '.gcp-acc-count',
    '.gcp-chevron',
    '.gcp-acc-body-wrap',
    '.gcp-acc-body-inner',
    '.gcp-freebuild-btn',
  ]) {
    expect(css.includes(cls), `${cls} missing from suite.css`).toBe(true);
  }
  // AC9 — the rules this restructure kills, gone as selectors (the words may
  // still appear in the explanatory comment, so match on selector syntax).
  for (const dead of ['.gcp-section-hd{', '.gcp-collapse-btn{', '.gcp-collapse-btn,', '.gcp-collapse-btn::after,', '.gcp-all-collapsed ']) {
    expect(css.includes(dead), `${dead} should have been removed from suite.css`).toBe(false);
  }
  // .gcp-pool-grid stays — every accordion body still uses it.
  expect(css.includes('.gcp-pool-grid{')).toBe(true);
});

// ── AC1: three sections, all closed by default ───────────────────────────

test('rcv.2 — all three sections render and default to closed on a fresh device', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  await expect(page.locator('#roll-char-pools .gcp-acc-section')).toHaveCount(3);
  for (const sec of [SKILLS_SEC, DISC_SEC, SPECIAL_SEC]) {
    await expect(page.locator(sec)).toHaveAttribute('data-open', 'false');
    await expect(page.locator(sec + ' .gcp-acc-head')).toHaveAttribute('aria-expanded', 'false');
  }
  // Order is Skills, Disciplines, Special (the mockup's own secSkills/secDisc/
  // secSpecial order).
  const labels = await page.locator('#roll-char-pools .gcp-acc-label').allInnerTexts();
  expect(labels.map(t => t.split('\n')[0].trim().split(' ')[0])).toEqual(['Skills', 'Disciplines', 'Special']);
});

// ── AC8: real counts, not hardcoded ──────────────────────────────────────

test("rcv.2 — each count badge shows the real tile count for its own section", async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  // Occult + Athletics = 2 skill tiles.
  await expect(page.locator(SKILLS_SEC + ' .gcp-acc-count')).toHaveText('2');
  // Only the rank-1 seeded Auspex power passes the rank gate at Auspex 2.
  await expect(page.locator(DISC_SEC + ' .gcp-acc-count')).toHaveText('1');
  // Frenzy Resistance, Lash Out, Clash of Wills, Blood Bond Resistance,
  // Humanity Check — rcv.1's own already-shipped five — plus rcv.5's own
  // Detecting Blood Sympathy (5 -> 6) and rcv.6's own Surprise/Perception
  // (6 -> 7). That the number keeps tracking each new tile is precisely
  // AC8's point.
  await expect(page.locator(SPECIAL_SEC + ' .gcp-acc-count')).toHaveText('7');

  // The badge is not a hardcoded literal — it tracks the tiles actually built.
  for (const [sec, expected] of [[SKILLS_SEC, 2], [DISC_SEC, 1], [SPECIAL_SEC, 7]]) {
    await page.locator(sec + ' .gcp-acc-head').click();
    await expect(page.locator(sec + ' .gcp-pool-btn')).toHaveCount(expected);
    await page.locator(sec + ' .gcp-acc-head').click();
  }
});

// ── AC2: independence ────────────────────────────────────────────────────

test('rcv.2 — opening one section leaves the other two untouched', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  await page.locator(SKILLS_SEC + ' .gcp-acc-head').click();
  await expect(page.locator(SKILLS_SEC)).toHaveAttribute('data-open', 'true');
  await expect(page.locator(DISC_SEC)).toHaveAttribute('data-open', 'false');
  await expect(page.locator(SPECIAL_SEC)).toHaveAttribute('data-open', 'false');

  // A second section opens alongside the first — no accordion-group exclusivity.
  await page.locator(DISC_SEC + ' .gcp-acc-head').click();
  await expect(page.locator(SKILLS_SEC)).toHaveAttribute('data-open', 'true');
  await expect(page.locator(DISC_SEC)).toHaveAttribute('data-open', 'true');
  await expect(page.locator(SPECIAL_SEC)).toHaveAttribute('data-open', 'false');

  // And Special opens without disturbing either.
  await page.locator(SPECIAL_SEC + ' .gcp-acc-head').click();
  await expect(page.locator(SKILLS_SEC)).toHaveAttribute('data-open', 'true');
  await expect(page.locator(DISC_SEC)).toHaveAttribute('data-open', 'true');
  await expect(page.locator(SPECIAL_SEC)).toHaveAttribute('data-open', 'true');

  // Closing the middle one closes only itself.
  await page.locator(DISC_SEC + ' .gcp-acc-head').click();
  await expect(page.locator(SKILLS_SEC)).toHaveAttribute('data-open', 'true');
  await expect(page.locator(DISC_SEC)).toHaveAttribute('data-open', 'false');
  await expect(page.locator(SPECIAL_SEC)).toHaveAttribute('data-open', 'true');
});

test('rcv.2 — no shared collapse-everything toggle remains', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  await expect(page.locator('#roll-char-pools .gcp-collapse-btn')).toHaveCount(0);
  await expect(page.locator('#roll-char-pools .gcp-pools-wrap')).toHaveCount(0);
  await expect(page.locator('#roll-char-pools .gcp-section-hd')).toHaveCount(0);
});

// The accordion collapses via the grid-template-rows 0fr->1fr technique the
// mockup uses (app.css:176-178), NOT display:none — the body is clipped to
// zero height by `.gcp-acc-body{overflow:hidden;min-height:0}`. Playwright's
// own toBeVisible() ignores ancestor overflow clipping, so a tile inside a
// closed section still reports as "visible" even though nothing is painted.
// Assert on the clipped body's rendered height instead, which is what
// actually distinguishes open from closed here.
async function bodyHeight(page, sectionSel) {
  return page.locator(sectionSel + ' .gcp-acc-body').evaluate(el => el.getBoundingClientRect().height);
}

test("rcv.2 — a closed section collapses its body to zero height and an open one does not", async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  expect(await bodyHeight(page, SKILLS_SEC)).toBe(0);
  expect(await bodyHeight(page, SPECIAL_SEC)).toBe(0);

  await page.locator(SKILLS_SEC + ' .gcp-acc-head').click();
  // Wait out the 0.22s grid-template-rows transition before measuring.
  await expect.poll(() => bodyHeight(page, SKILLS_SEC), { timeout: 3000 }).toBeGreaterThan(0);
  // The other sections stay collapsed.
  expect(await bodyHeight(page, SPECIAL_SEC)).toBe(0);
  expect(await bodyHeight(page, DISC_SEC)).toBe(0);

  // And closing it again collapses it back.
  await page.locator(SKILLS_SEC + ' .gcp-acc-head').click();
  await expect.poll(() => bodyHeight(page, SKILLS_SEC), { timeout: 3000 }).toBe(0);
});

// ── AC5/AC6: per-section persistence via independent localStorage keys ───

test('rcv.2 — each section writes only its own localStorage key', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  await page.locator(DISC_SEC + ' .gcp-acc-head').click();
  const stored = await page.evaluate(() => ({
    skills:  localStorage.getItem('tm_pools_open_skills'),
    disc:    localStorage.getItem('tm_pools_open_disc'),
    special: localStorage.getItem('tm_pools_open_special'),
  }));
  expect(stored).toEqual({ skills: null, disc: '1', special: null });

  await page.locator(DISC_SEC + ' .gcp-acc-head').click();
  expect(await page.evaluate(() => localStorage.getItem('tm_pools_open_disc'))).toBe('0');
});

test('rcv.2 — an open section survives a re-render of the same character', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  await page.locator(SPECIAL_SEC + ' .gcp-acc-head').click();
  await expect(page.locator(SPECIAL_SEC)).toHaveAttribute('data-open', 'true');

  // Re-render from scratch — renderCharPools() runs again and must rebuild the
  // section already open.
  await pickCharacter(page, RICH_CHAR);
  await expect(page.locator(SPECIAL_SEC)).toHaveAttribute('data-open', 'true');
  await expect(page.locator(SPECIAL_SEC + ' .gcp-acc-head')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(SKILLS_SEC)).toHaveAttribute('data-open', 'false');
  await expect(page.locator(DISC_SEC)).toHaveAttribute('data-open', 'false');
});

test('rcv.2 — open state survives a character switch', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR, OTHER_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  await page.locator(SKILLS_SEC + ' .gcp-acc-head').click();
  await pickCharacter(page, OTHER_CHAR);

  await expect(page.locator(SKILLS_SEC)).toHaveAttribute('data-open', 'true');
  await expect(page.locator(DISC_SEC)).toHaveAttribute('data-open', 'false');
  await expect(page.locator(SPECIAL_SEC)).toHaveAttribute('data-open', 'false');
});

test("rcv.2 — a prior 1 stored in a section key opens that section on first render", async ({ page }) => {
  await setupSuite(page, [RICH_CHAR], { tm_pools_open_disc: '1' });
  await pickCharacter(page, RICH_CHAR);

  await expect(page.locator(DISC_SEC)).toHaveAttribute('data-open', 'true');
  await expect(page.locator(SKILLS_SEC)).toHaveAttribute('data-open', 'false');
  await expect(page.locator(SPECIAL_SEC)).toHaveAttribute('data-open', 'false');
});

test('rcv.2 — a stale tm_pools_collapsed value is ignored, not migrated (AC6)', async ({ page }) => {
  // '0' was the old key's "user un-collapsed manually" value. Under rcv.2 it
  // must have no effect at all: all three sections still default to closed.
  await setupSuite(page, [RICH_CHAR], { tm_pools_collapsed: '0' });
  await pickCharacter(page, RICH_CHAR);

  for (const sec of [SKILLS_SEC, DISC_SEC, SPECIAL_SEC]) {
    await expect(page.locator(sec)).toHaveAttribute('data-open', 'false');
  }
});

// ── AC3: the rank-gate filter still applies inside the new accordion ─────

test('rcv.2 — the Disciplines accordion still respects the rank gate', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  await page.locator(DISC_SEC + ' .gcp-acc-head').click();
  const body = page.locator(DISC_SEC + ' .gcp-acc-body-inner');
  // Auspex 2: the rank-1 power is in, the rank-3 power is filtered out.
  await expect(body).toContainText('Rcv2 Shallow Sight');
  await expect(body).not.toContainText('Rcv2 Deep Sight');
  await expect(page.locator(DISC_SEC + ' .gcp-pool-btn')).toHaveCount(1);
});

test('rcv.2 — a zero-dot discipline produces no Disciplines accordion at all', async ({ page }) => {
  const NO_DOTS = { ...RICH_CHAR, _id: 'char-rcv2-nodots', disciplines: { Auspex: { dots: 0 } } };
  await setupSuite(page, [NO_DOTS]);
  await pickCharacter(page, NO_DOTS);

  await expect(page.locator(DISC_SEC)).toHaveCount(0);
  await expect(page.locator(SKILLS_SEC)).toHaveCount(1);
  await expect(page.locator(SPECIAL_SEC)).toHaveCount(1);
});

// ── AC4: "+ Custom Pool" relocated, unchanged in behaviour ───────────────

test('rcv.2 — the Custom Pool button sits outside the accordion group and is always visible', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  const btn = page.locator('#roll-char-pools .gcp-freebuild-btn');
  await expect(btn).toHaveCount(1);
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('+ Custom Pool');
  // Not inside any accordion section, and not inside the accordion group.
  await expect(page.locator('#roll-char-pools .gcp-accordions .gcp-freebuild-btn')).toHaveCount(0);
  // It is no longer a grid tile.
  await expect(page.locator('#roll-char-pools .gcp-pool-grid .gcp-freebuild-btn')).toHaveCount(0);

  // Still visible with every section open.
  for (const sec of [SKILLS_SEC, DISC_SEC, SPECIAL_SEC]) await page.locator(sec + ' .gcp-acc-head').click();
  await expect(btn).toBeVisible();
});

test("rcv.2 — the Custom Pool button still opens the same openPanel(custom) flow", async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  await page.locator('#roll-char-pools .gcp-freebuild-btn').click();
  await page.waitForSelector('#panel', { state: 'visible', timeout: 10000 });
  await expect(page.locator('#panel-title')).toHaveText('Custom Pool');
  await expect(page.locator('.cp-attr-chip')).toHaveCount(9);
});

test('rcv.2 — the Custom Pool button renders for a character with no skills and no disciplines', async ({ page }) => {
  await setupSuite(page, [EMPTY_CHAR]);
  await pickCharacter(page, EMPTY_CHAR);

  await expect(page.locator('#roll-char-pools .gcp-freebuild-btn')).toBeVisible();
  // Only Special renders as an accordion for this character.
  await expect(page.locator('#roll-char-pools .gcp-acc-section')).toHaveCount(1);
  await expect(page.locator(SPECIAL_SEC)).toHaveCount(1);
});

// ── AC7: tiles and their routing are unchanged ───────────────────────────

test("rcv.2 — Special still carries the five rcv.1 tiles with their existing routing", async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  await page.locator(SPECIAL_SEC + ' .gcp-acc-head').click();
  const body = page.locator(SPECIAL_SEC + ' .gcp-acc-body-inner');
  for (const label of ['Frenzy Resistance', 'Lash Out', 'Clash of Wills', 'Blood Bond Resistance', 'Humanity Check']) {
    await expect(body).toContainText(label);
  }
  // "Riding the Wave" was removed by rcv.1 and must not have crept back.
  await expect(body).not.toContainText('Riding the Wave');

  // A choice tile still routes to its scoped panel from inside the accordion.
  await page.locator(SPECIAL_SEC + ' .gcp-pool-btn', { hasText: 'Lash Out' }).click();
  await page.waitForSelector('#panel', { state: 'visible', timeout: 10000 });
  await expect(page.locator('#panel-title')).toHaveText(/Lash Out/i);
});

test('rcv.2 — a skill tile inside the accordion still loads its pool', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  await page.locator(SKILLS_SEC + ' .gcp-acc-head').click();
  // Intelligence 3 + Occult 3 = 6.
  await page.locator(SKILLS_SEC + ' .gcp-pool-btn', { hasText: 'Occult' }).click();
  await expect(page.locator('#rv2-eff')).toHaveText('6');
});
