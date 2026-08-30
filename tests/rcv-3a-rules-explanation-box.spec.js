// E2E coverage for rcv.3a — the "Rules explanation" disclosure on the Roll
// tab, a sibling to the existing "Pool breakdown" disclosure. It shows the
// currently-loaded power's cost / action / duration / effect, plus the shared
// #994 rules_text expander when that power has real, page-cited rulebook text.
// See specs/stories/rcv-3a-rules-explanation-disciplines-rites.md.
//
// Character injection: this app registers a Service Worker (public/sw.js) that
// intercepts /api/characters ahead of Playwright's page.route() stubs and
// serves real cached data from whatever real ST session last used this origin
// (diagnosed during rlv.4 — see that spec's own header). `serviceWorkers:
// 'block'` plus injecting the fixture character through the real, exposed
// `window.pickChar(c)` global sidesteps it entirely: real app code, real
// renderCharPools()/loadPool() wiring, no network fetch for the SW to hijack.

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

const ST_USER = {
  id: '900000011', username: 'test_st_rcv3a', global_name: 'Test ST rcv3a',
  avatar: null, role: 'st', player_id: 'p-rcv3a', character_ids: [], is_dual_role: false,
};

function attrs(overrides = {}) {
  return {
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    ...overrides,
  };
}

// Two synthetic Auspex powers seeded into the rules cache, both inside the
// fixture character's Auspex 2 so both render as tiles. Deliberately fictional
// names so nothing here depends on live purchasable_powers content — and,
// critically, so the WITHOUT-rules_text case is a guaranteed, stable fixture
// rather than a live power that a later uplift top-up could quietly fill in.
// `key` must be the slug of `name` — that is what shared/pools.js's getPool()
// looks the rule up by.
const SEEDED_RULES = [
  {
    // Legacy free-text `cost` only (no structured vitae_cost/willpower_cost),
    // plus real rules_text + rules_source — the "full house" case.
    key: 'rcv3a-bright-sight', name: 'Rcv3a Bright Sight', category: 'discipline',
    parent: 'Auspex', rank: 1, pool: { attr: 'Wits', skill: 'Occult' },
    cost: '1 Vitae',
    action: 'Instant action',
    duration: 'One scene',
    description: 'The Kindred perceives the unseen edges of a room.',
    rules_text: 'Spend one Vitae and roll the pool.\n\nOn a success the character sees clearly through the dark for the rest of the scene.\n\n---\n**TM Errata:** Ranged use is capped at ten yards.',
    rules_source: 'VtR 2e p.123',
  },
  {
    // Structured costs only (gdx.6 shape), and deliberately NO rules_text —
    // the genuine coverage gap the box must degrade gracefully into.
    key: 'rcv3a-dim-sight', name: 'Rcv3a Dim Sight', category: 'discipline',
    parent: 'Auspex', rank: 2, pool: { attr: 'Wits', skill: 'Occult' },
    vitae_cost: 2, willpower_cost: 1,
    action: 'Reflexive action',
    duration: 'One turn',
    description: 'A brief flicker of borrowed sight.',
  },
  {
    // Review fix regression (Blind Hunter, High): rules_text WITHOUT any of
    // effect/action/duration/cost used to fail the visibility gate entirely,
    // silently hiding a power whose only real content is its full rules text.
    key: 'rcv3a-clouded-sight', name: 'Rcv3a Clouded Sight', category: 'discipline',
    parent: 'Auspex', rank: 2, pool: { attr: 'Wits', skill: 'Occult' },
    rules_text: 'The vampire\'s sight clouds the minds of onlookers nearby.',
    rules_source: 'VtR 2e p.124',
  },
  {
    // Review fix regression (Edge Case Hunter/Acceptance Auditor, High/Medium):
    // getPool() did not originally thread cost_note onto `pi`, so a power
    // costing "1 V per effect" showed as a bare "1 Vitae" here while the
    // Sheet tab (fmtCostLine called with the raw rule doc) showed the
    // qualifier correctly. Mirrors a real live shape (gdx-6-structured-
    // power-costs.mjs's own Celerity/Resilience/Vigour "per effect" rows).
    key: 'rcv3a-fleeting-glimpse', name: 'Rcv3a Fleeting Glimpse', category: 'discipline',
    parent: 'Auspex', rank: 1, pool: { attr: 'Wits', skill: 'Occult' },
    vitae_cost: 1, willpower_cost: 0, cost_note: 'per effect',
    action: 'Instant action',
    duration: 'One turn',
    description: 'A momentary, unbidden flash of insight.',
  },
  // rcv.3b: Devotion-category fixtures. `key` MUST carry the `devotion-`
  // prefix — getPool()'s own lookup only reaches this third fallback branch
  // (shared/pools.js:34, `getRuleByKey('devotion-' + slug)`) after its first
  // two tries (a bare slug, then `rite-` + slug) miss, so a same-shaped
  // discipline fixture wearing a `category: 'devotion'` label would NOT
  // actually exercise this path — the key prefix is what does.
  {
    // No duration at all — the exact coverage gap rcv.3b's own rescoping
    // investigated: proves this already degrades silently (no placeholder
    // text, no extra empty bullet), matching sheet-helpers.js's own
    // fmtRuleStats() precedent, not a Devotion-specific fallback.
    key: 'devotion-rcv3b-quiet-ledger', name: 'Rcv3b Quiet Ledger', category: 'devotion',
    pool: { attr: 'Manipulation', skill: 'Subterfuge' },
    vitae_cost: 1, willpower_cost: 0,
    action: 'Instant action',
    description: 'The vampire quietly rewrites a small debt owed between two mortals.',
  },
  {
    // Real rules_text on a Devotion — proves the shared expander is
    // genuinely category-agnostic, not coincidentally correct only for the
    // Discipline/Rite shapes rcv.3a's own fixtures happened to cover.
    key: 'devotion-rcv3b-borrowed-face', name: 'Rcv3b Borrowed Face', category: 'devotion',
    pool: { attr: 'Wits', skill: 'Subterfuge' },
    vitae_cost: 2, willpower_cost: 1,
    action: 'Instant action',
    duration: 'One scene',
    description: 'The vampire briefly wears a stolen face.',
    rules_text: 'Combines two disciplines into a single devotion.\n\nSpend the listed Vitae and Willpower, then roll the pool.',
    rules_source: 'Terra Mortis Errata',
  },
];

const RICH_CHAR = {
  _id: 'char-rcv3a-rich', name: 'Rules Box Tester', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: attrs(),
  skills: {
    Occult: { dots: 3, bonus: 0, specs: [], nine_again: false },
    Athletics: { dots: 2, bonus: 0, specs: [], nine_again: false },
  },
  disciplines: { Auspex: { dots: 2 } },
  merits: [],
  // rcv.3b: Devotion tiles come from char.powers (category: 'devotion'), not
  // discipline dots — char-pools.js:215-216 pushes these into the same
  // derivedPowers array as the rank-gated Auspex powers above, through the
  // identical getPool()/tile-building loop.
  powers: [
    { name: 'Rcv3b Quiet Ledger', category: 'devotion' },
    { name: 'Rcv3b Borrowed Face', category: 'devotion' },
  ],
  ordeals: [],
};

// rcv.3c: Clash of Wills' "Their Discipline" chip row populates from
// suiteState.RESIST_CHAR (app.js:1175-1194) — a DISCLOSED gdx-11 limitation:
// the panel cannot pick a target itself, so an opposing character has to
// already be selected via the existing #resist-sel dropdown. This fixture is
// that opponent; its Dominate dots are what the "Their Discipline" chips read.
const CLASH_OPPONENT = {
  _id: 'char-rcv3c-opponent', name: 'Clash Opponent', moniker: null, honorific: null,
  clan: 'Ventrue', covenant: 'Invictus', player: 'Test Player Two',
  blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: attrs(),
  skills: {},
  disciplines: { Dominate: { dots: 3 } },
  merits: [],
  powers: [],
  ordeals: [],
};

const SKILLS_SEC  = '#roll-char-pools .gcp-acc-section[data-storage-key="tm_pools_open_skills"]';
const DISC_SEC    = '#roll-char-pools .gcp-acc-section[data-storage-key="tm_pools_open_disc"]';
// rcv.3c: the "Special" accordion (char-pools.js:261) holds the Vampire
// Mechanics tiles — Lash Out, Clash of Wills and Blood Bond Resistance are
// {opensPanel} choice tiles, so tapping one opens a scoped panel rather than
// loading a pool directly (unlike every Discipline tile loadPower() uses).
const SPECIAL_SEC = '#roll-char-pools .gcp-acc-section[data-storage-key="tm_pools_open_special"]';

const BOX  = '#rules-summary-box';
const HEAD = '#rules-summary-box .rules-summary-head';
const COST = '#rules-summary-cost';
const BODY = '#rules-summary-body';

async function setupSuite(page, chars) {
  await page.addInitScript(({ user, rules }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
    // loadRulesFromApi() falls back to this key when /api/rules returns an
    // empty array (which the blanket **/api/** stub below does).
    localStorage.setItem('tm_rules_db', JSON.stringify(rules));
  }, { user: ST_USER, rules: SEEDED_RULES });

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

/** Open the Disciplines accordion and tap one seeded power tile. */
async function loadPower(page, label) {
  const sec = page.locator(DISC_SEC);
  if (await sec.getAttribute('data-open') !== 'true') {
    await page.locator(DISC_SEC + ' .gcp-acc-head').click();
  }
  await page.locator(DISC_SEC + ' .gcp-pool-btn', { hasText: label }).click();
  await expect(page.locator('#pool-banner')).toContainText(label);
}

/**
 * rcv.3c: open the Special accordion and tap one Vampire Mechanics choice
 * tile, waiting for the scoped panel it opens. Same open-if-closed shape as
 * loadPower() above (every accordion defaults closed, char-pools.js:313).
 */
async function openSpecialTile(page, label) {
  const sec = page.locator(SPECIAL_SEC);
  if (await sec.getAttribute('data-open') !== 'true') {
    await page.locator(SPECIAL_SEC + ' .gcp-acc-head').click();
  }
  await page.locator(SPECIAL_SEC + ' .gcp-pool-btn', { hasText: label }).click();
  await page.waitForSelector('#panel', { state: 'visible', timeout: 10000 });
}

/**
 * rcv.3c: make a fixture character selectable as a resist target.
 *
 * Clash of Wills' "Their Discipline" chip row reads suiteState.RESIST_CHAR
 * (app.js:1175-1194), and the only thing that sets it is updResist() looking
 * a name up in suiteState.chars off the real #resist-sel dropdown — which
 * showResistSec() builds from window._charNames. None of that comes from
 * whatever pickChar() was handed, and none of it can be stubbed by
 * page.route(): verified while writing this test, public/js/dev-fixtures.js
 * (dynamically imported whenever tm_auth_token === 'local-test-token', which
 * setupSuite must set to pass the auth gate) monkey-patches window.fetch and
 * answers GET /api/characters from its own baked 31-character blob, so that
 * request never reaches the network for Playwright to intercept — a sibling
 * of the Service Worker problem in this file's own header.
 *
 * So the roster is extended the same way boot itself extends it: app.js's own
 * step 2b (app.js:842-846) pushes combat-only characters — fetched separately,
 * precisely so resist targets have attributes/disciplines to read — onto
 * suiteState.chars and then refreshes the two window globals. This does
 * exactly that, through the real shared state module, and leaves the dropdown
 * population, updResist() and the Clash panel's own chip row all running
 * untouched production code. Assigning RESIST_CHAR directly would skip all
 * three and prove nothing.
 */
async function addResistTarget(page, char) {
  await page.evaluate(async (c) => {
    const st = (await import('/js/suite/data.js')).default;
    if (!st.chars.some(x => x.name === c.name)) st.chars.push(c);
    window._charNames = st.chars.map(x => x.name);
    window._charDisplayMap = { ...(window._charDisplayMap || {}), [c.name]: c.name };
  }, char);
}

const isOpen = (page) => page.locator(BOX).evaluate(el => el.open);

// ── Source-fetch smokes ──────────────────────────────────────────────────

test('rcv.3a — index.html carries the static rules-summary disclosure before the breakdown', async ({ request }) => {
  const res = await request.get('/index.html');
  const html = await res.text();
  expect(html).toMatch(/<details class="rules-summary" id="rules-summary-box" style="display:none">/);
  expect(html).toMatch(/id="rules-summary-cost"/);
  expect(html).toMatch(/id="rules-summary-body"/);
  expect(html).toMatch(/class="rules-summary-label">Rules explanation</);
  // AC1: it sits BEFORE the existing Pool breakdown disclosure, not inside it.
  expect(html.indexOf('id="rules-summary-box"')).toBeLessThan(html.indexOf('class="rv2-breakdown"'));
  expect(html.indexOf('id="rules-summary-body"')).toBeLessThan(html.indexOf('class="rv2-breakdown"'));
});

test('rcv.3a — roll-v2.js wires the shared rules-text component into loadPool, not updPool', async ({ request }) => {
  const res = await request.get('/js/suite/roll-v2.js');
  const src = await res.text();
  expect(src).toMatch(/export\s+function\s+updRulesSummary\(/);
  // AC7: both imports present, esc folded onto the existing hasAoE line.
  expect(src).toMatch(/import\s*\{\s*hasAoE,\s*esc\s*\}\s*from\s*'\.\.\/data\/helpers\.js';/);
  expect(src).toMatch(/import\s*\{\s*renderRulesExpander\s*\}\s*from\s*'\.\.\/shared\/rules-text\.js';/);
  // AC5: the cost line reuses the existing single-source formatter.
  expect(src).toMatch(/import\s*\{\s*fmtCostLine\s*\}\s*from\s*'\.\/sheet-helpers\.js';/);
  expect(src).toMatch(/fmtCostLine\(pi\)/);
  // AC2: called from loadPool()...
  expect(src).toMatch(/updRulesSummary\(state\.POOL_INFO\);/);
  // ...and NOT from inside updPool(), whose repaints must never collapse it.
  const updPoolBody = src.slice(src.indexOf('export function updPool()'), src.indexOf('// ── SPECIALTY TOGGLE'));
  expect(updPoolBody.length).toBeGreaterThan(100);
  expect(updPoolBody).not.toContain('updRulesSummary');
});

test('rcv.3a — suite.css carries the ported rules-summary rules, all scoped under .rules-summary', async ({ request }) => {
  const res = await request.get('/css/suite.css');
  const css = await res.text();
  for (const cls of [
    '.rules-summary{',
    '.rules-summary-head{',
    '.rules-summary-head:focus-visible{',
    '.rules-summary-label{',
    '.rules-summary-body{',
    '.rules-summary .rules-chevron{',
    // Review fix: these three used to be bare/global — a hygiene risk a
    // blind reviewer correctly flagged even with no live collision found —
    // now scoped under .rules-summary so a future same-named class anywhere
    // else in this 3000+ line stylesheet can never reach into this box.
    '.rules-summary .power-cost{',
    '.rules-summary .power-meta{',
    '.rules-summary .power-desc{',
  ]) {
    expect(css.includes(cls), `${cls} missing from suite.css`).toBe(true);
  }
  // Review fix: the chevron rule and its markup class are both `.rules-chevron`
  // now, never a bare `.chevron{}` that could bleed in from (or out to)
  // anywhere else in the stylesheet.
  expect(css.includes('\n.chevron{')).toBe(false);
  expect(css.includes('.rules-summary-head .chevron{')).toBe(false);
});

// ── AC3: hidden until a real power is loaded ─────────────────────────────

test('rcv.3a — the box is hidden before any pool is loaded', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  // Review fix (Blind Hunter): toBeHidden() alone also passes if the element
  // is entirely absent from the DOM, so this test would stay green even if
  // Task 1's markup were deleted outright. toHaveCount(1) anchors that the
  // element genuinely exists and is merely hidden.
  await expect(page.locator(BOX)).toHaveCount(1);
  await expect(page.locator(BOX)).toBeHidden();
});

test('rcv.3a — a plain Skill pool leaves the box hidden', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  await page.locator(SKILLS_SEC + ' .gcp-acc-head').click();
  await page.locator(SKILLS_SEC + ' .gcp-pool-btn', { hasText: 'Occult' }).click();
  await expect(page.locator('#pool-banner')).toContainText('Occult');

  await expect(page.locator(BOX)).toBeHidden();
  expect(await page.locator(BODY).innerHTML()).toBe('');
});

test('rcv.3a — a Custom Pool leaves the box hidden, and clears a power already shown', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  // Show it first, so this also proves the box is actively cleared, not just
  // never populated.
  await loadPower(page, 'Rcv3a Bright Sight');
  await expect(page.locator(BOX)).toBeVisible();

  await page.locator('#roll-char-pools .gcp-freebuild-btn').click();
  await page.waitForSelector('#panel', { state: 'visible', timeout: 10000 });
  await page.locator('.cp-attr-chip[data-a="Intelligence"]').click();
  await page.locator('.cp-skill-chip[data-s="Occult"]').click();
  await page.locator('#cp-load').click();

  await expect(page.locator(BOX)).toBeHidden();
  expect(await page.locator(BODY).innerHTML()).toBe('');
});

// ── AC5/AC6: what a loaded power actually shows ──────────────────────────

test('rcv.3a — a power with rules_text shows cost, meta, effect and a working expander', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  await loadPower(page, 'Rcv3a Bright Sight');

  await expect(page.locator(BOX)).toBeVisible();
  // AC4: collapsed on load.
  expect(await isOpen(page)).toBe(false);
  await expect(page.locator(BOX + ' .rules-summary-label')).toHaveText('Rules explanation');
  // AC5: legacy free-text cost, with fmtCostLine's "Cost: " prefix stripped
  // for this compact chip.
  await expect(page.locator(COST)).toHaveText('1 Vitae');

  await page.locator(HEAD).click();
  expect(await isOpen(page)).toBe(true);

  const meta = page.locator(BODY + ' .power-meta span');
  await expect(meta).toHaveCount(2);
  await expect(meta.nth(0)).toHaveText('Instant action');
  await expect(meta.nth(1)).toHaveText('One scene');
  await expect(page.locator(BODY + ' .power-desc')).toHaveText('The Kindred perceives the unseen edges of a room.');

  // AC6: the shared #994 expander, collapsed, then toggling open.
  const expander = page.locator(BODY + ' .rules-expander');
  await expect(expander).toHaveCount(1);
  const expBody = page.locator('#rules-body-rules-summary-expander');
  await expect(expBody).not.toHaveClass(/\bvisible\b/);

  await page.locator(BODY + ' .rules-expander-toggle').click();
  await expect(expBody).toHaveClass(/\bvisible\b/);
  await expect(expBody).toContainText('Spend one Vitae and roll the pool.');
  await expect(expBody).toContainText('Source: VtR 2e p.123');
  // The markdown-lite transforms the shared renderer promises.
  await expect(expBody.locator('strong')).toHaveText('TM Errata:');
  await expect(expBody.locator('.rules-text-hr')).toHaveCount(1);

  await page.locator(BODY + ' .rules-expander-toggle').click();
  await expect(expBody).not.toHaveClass(/\bvisible\b/);
});

test('rcv.3a — a power with NO rules_text still shows its summary, with no expander', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  await loadPower(page, 'Rcv3a Dim Sight');

  await expect(page.locator(BOX)).toBeVisible();
  // AC5 fallback: no legacy `cost`, but real structured vitae/willpower costs.
  await expect(page.locator(COST)).toHaveText('2 Vitae & 1 Willpower');

  await page.locator(HEAD).click();
  const meta = page.locator(BODY + ' .power-meta span');
  await expect(meta).toHaveCount(2);
  await expect(meta.nth(0)).toHaveText('Reflexive action');
  await expect(meta.nth(1)).toHaveText('One turn');
  await expect(page.locator(BODY + ' .power-desc')).toHaveText('A brief flicker of borrowed sight.');
  // renderRulesExpander() self-guards to '' — nothing rendered, no empty shell.
  await expect(page.locator(BODY + ' .rules-expander')).toHaveCount(0);
  await expect(page.locator(BODY + ' .rules-expander-toggle')).toHaveCount(0);
});

// ── Review fix regressions ────────────────────────────────────────────────

test('rcv.3a — a power whose only content is rules_text still shows the box (review fix, Blind Hunter High)', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  await loadPower(page, 'Rcv3a Clouded Sight');

  // Before the fix, hasRules checked only effect/action/duration/cost, so a
  // power carrying ONLY rules_text was hidden entirely — the box's own most
  // valuable output (the full rulebook text) was unreachable.
  await expect(page.locator(BOX)).toBeVisible();
  await expect(page.locator(COST)).toHaveText('');
  await page.locator(HEAD).click();
  await expect(page.locator(BODY + ' .power-meta')).toHaveCount(0);
  await expect(page.locator(BODY + ' .power-desc')).toHaveCount(0);
  const expander = page.locator(BODY + ' .rules-expander');
  await expect(expander).toHaveCount(1);
  await page.locator(BODY + ' .rules-expander-toggle').click();
  await expect(page.locator('#rules-body-rules-summary-expander')).toContainText(
    "The vampire's sight clouds the minds of onlookers nearby."
  );
});

test('rcv.3a — a qualified structured cost shows its note (review fix, Edge Case Hunter/Acceptance Auditor High/Medium)', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  await loadPower(page, 'Rcv3a Fleeting Glimpse');

  // Before the fix, getPool() never threaded cost_note onto `pi`, so
  // fmtCostLine(pi) could never reach its own note-suffix branch — this
  // rendered as a bare "1 Vitae", silently dropping the "per effect"
  // qualifier the Sheet tab shows correctly for the same rule doc.
  await expect(page.locator(COST)).toHaveText('1 Vitae (per effect)');
});

test('rcv.3a — a character switch clears a shown box via pickChar()`s own resetRollPool() call', async ({ page }) => {
  const secondChar = { ...RICH_CHAR, _id: 'char-rcv3a-second', name: 'Second Tester' };
  await setupSuite(page, [RICH_CHAR, secondChar]);
  await pickCharacter(page, RICH_CHAR);
  await loadPower(page, 'Rcv3a Bright Sight');
  await expect(page.locator(BOX)).toBeVisible();

  // pickChar()'s own character-switch path unconditionally calls
  // resetRollPool(), never loadPool() — AC8 names only loadPool() as a call
  // site; this proves the second, undeclared-but-necessary one too, via the
  // real production path rather than reaching into an internal directly.
  await pickCharacter(page, secondChar);

  await expect(page.locator(BOX)).toBeHidden();
  expect(await page.locator(BODY).innerHTML()).toBe('');
});

// ── rcv.3b: same box, proven against a genuine Devotion, not a discipline ──

test('rcv.3b — a Devotion with no duration renders correctly, degrading silently (not a discipline-only behaviour)', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  await loadPower(page, 'Rcv3b Quiet Ledger');

  // Rescoped from "needs an explicit fallback" after tracing char-pools.js's
  // shared tile loop: a Devotion runs through the identical getPool()/
  // updRulesSummary() path as a Discipline, so a missing `duration` already
  // degrades the same way — silently, no placeholder text, matching
  // sheet-helpers.js's own fmtRuleStats() precedent on the Sheet tab.
  await expect(page.locator(BOX)).toBeVisible();
  await expect(page.locator(COST)).toHaveText('1 Vitae');

  await page.locator(HEAD).click();
  const meta = page.locator(BODY + ' .power-meta span');
  await expect(meta).toHaveCount(1); // action only - no duration bullet, no placeholder
  await expect(meta.nth(0)).toHaveText('Instant action');
  await expect(page.locator(BODY + ' .power-desc')).toHaveText(
    'The vampire quietly rewrites a small debt owed between two mortals.'
  );
  await expect(page.locator(BODY + ' .rules-expander')).toHaveCount(0);
});

test('rcv.3b — a Devotion with real rules_text shows a working expander (the shared component is category-agnostic)', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  await loadPower(page, 'Rcv3b Borrowed Face');

  await expect(page.locator(BOX)).toBeVisible();
  await expect(page.locator(COST)).toHaveText('2 Vitae & 1 Willpower');

  await page.locator(HEAD).click();
  const expander = page.locator(BODY + ' .rules-expander');
  await expect(expander).toHaveCount(1);
  await page.locator(BODY + ' .rules-expander-toggle').click();
  await expect(page.locator('#rules-body-rules-summary-expander')).toContainText(
    'Combines two disciplines into a single devotion.'
  );
  await expect(page.locator('#rules-body-rules-summary-expander')).toContainText('Source: Terra Mortis Errata');
});

// ── AC4: never inherit the previous power's open state ───────────────────

test('rcv.3a — switching powers resets an open box to closed', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);

  await loadPower(page, 'Rcv3a Bright Sight');
  await page.locator(HEAD).click();
  expect(await isOpen(page)).toBe(true);

  await loadPower(page, 'Rcv3a Dim Sight');
  expect(await isOpen(page)).toBe(false);
  // And it is genuinely the new power's content, not the old one's.
  await expect(page.locator(COST)).toHaveText('2 Vitae & 1 Willpower');
  await expect(page.locator(BODY + ' .rules-expander')).toHaveCount(0);
});

// ── The whole reason this is painted from loadPool(), not updPool() ──────

test('rcv.3a — an open box survives an unrelated updPool() repaint (WP chip)', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  await loadPower(page, 'Rcv3a Bright Sight');

  await page.locator(HEAD).click();
  expect(await isOpen(page)).toBe(true);
  // Leave the shared expander open too — its state lives in the same innerHTML
  // that a rebuild-inside-updPool() implementation would have wiped.
  await page.locator(BODY + ' .rules-expander-toggle').click();
  await expect(page.locator('#rules-body-rules-summary-expander')).toHaveClass(/\bvisible\b/);

  // togMod('wp') -> updPool(): repaints #effline, the sub-line, the roll button.
  await page.locator('#wp-c').click();
  await expect(page.locator('#rv2-sub')).toContainText('WP +3');

  expect(await isOpen(page)).toBe(true);
  await expect(page.locator('#rules-body-rules-summary-expander')).toHaveClass(/\bvisible\b/);
  await expect(page.locator(BODY + ' .power-desc')).toHaveText('The Kindred perceives the unseen edges of a room.');

  // A second repaint (Rote chip) is equally harmless.
  await page.locator('#rote-c').click();
  await expect(page.locator('#rv2-sub')).toContainText('rote');
  expect(await isOpen(page)).toBe(true);
});

// ── rcv.3c: the three Vampire Mechanics tiles now carry real copy ─────────
//
// Same box, same updRulesSummary() path — the only new wiring is `effect`/
// `action` on each mechanic's own pi (shared/resist.js for Lash Out and Blood
// Bond Resistance, an inline object literal for Clash of Wills), plus the
// blank-line paragraph split in updRulesSummary(). No rules_text for any of
// the three: none of them has a purchasable_powers doc to cite (the schema's
// own categoryEnum has no category for a universal core mechanic), so the
// expander must stay absent on all three.

const LASH_OUT_P1 = 'Lash out with an aspect of the Beast: Monstrous (Strength), Seductive (Presence), or Competitive (Intelligence), to force compliance or provoke fear.';
const LASH_OUT_P2 = 'Costs 1 Willpower against Kindred; free against a mortal. If the target fights back, they roll their own Power Attribute + Blood Potency; more successes flips who gains the Condition.';

test('rcv.3c — source: the three pi objects carry effect/action, and updRulesSummary splits on a blank line', async ({ request }) => {
  const resistSrc = await (await request.get('/js/shared/resist.js')).text();
  expect(resistSrc).toContain("action: 'Instant action',");
  expect(resistSrc).toContain("action: 'Instant · reactive',");
  expect(resistSrc).toContain('Lash out with an aspect of the Beast');
  expect(resistSrc).toContain('Any time a point or more of Vitae is imbibed');
  // AC6 / "What this story is NOT": no rules_text on any of the three.
  expect(resistSrc).not.toContain('rules_text');

  const appSrc = await (await request.get('/js/app.js')).text();
  expect(appSrc).toContain("action: 'Instant · contested',");
  expect(appSrc).toContain('When two Disciplines directly oppose each other');

  const rollSrc = await (await request.get('/js/suite/roll-v2.js')).text();
  // AC4: one <p class="power-desc"> per blank-line-separated paragraph,
  // reusing shared/rules-text.js's convention rather than a second one.
  expect(rollSrc).toMatch(/pi\.effect\s*\n?\s*\?\s*pi\.effect\.split\('\\n\\n'\)/);
  expect(rollSrc).toContain('<p class="power-desc">${esc(p)}</p>');
});

test('rcv.3c — Lash Out (Kindred) shows two paragraphs, its action, and the 1 Willpower cost', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR, CLASH_OPPONENT]);
  await pickCharacter(page, RICH_CHAR);

  await openSpecialTile(page, 'Lash Out');
  await page.locator('.la-aspect-chip', { hasText: 'Monstrous' }).click();
  // Kindred is the panel's own default, but tapped explicitly so this test
  // asserts a chosen state rather than an initial one.
  await page.locator('.la-kindred-chip', { hasText: 'Kindred' }).click();
  await page.locator('#lashout-load').click();
  await expect(page.locator('#pool-banner')).toContainText('Lash Out');

  // Before rcv.3c this tile loaded a pi with willpower_cost but no effect/
  // action at all — the box appeared with a bare cost chip and an empty body.
  await expect(page.locator(BOX)).toBeVisible();
  await expect(page.locator(COST)).toHaveText('1 Willpower');

  await page.locator(HEAD).click();
  const meta = page.locator(BODY + ' .power-meta span');
  await expect(meta).toHaveCount(1); // action only, no duration
  await expect(meta.nth(0)).toHaveText('Instant action');

  // AC4: two SEPARATE <p> elements, not one squashed paragraph.
  const paras = page.locator(BODY + ' .power-desc');
  await expect(paras).toHaveCount(2);
  await expect(paras.nth(0)).toHaveText(LASH_OUT_P1);
  await expect(paras.nth(1)).toHaveText(LASH_OUT_P2);

  await expect(page.locator(BODY + ' .rules-expander')).toHaveCount(0);
});

test('rcv.3c — Lash Out (Mortal) shows the same copy with no cost chip', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR, CLASH_OPPONENT]);
  await pickCharacter(page, RICH_CHAR);

  await openSpecialTile(page, 'Lash Out');
  await page.locator('.la-aspect-chip', { hasText: 'Seductive' }).click();
  await page.locator('.la-kindred-chip', { hasText: 'Mortal' }).click();
  await page.locator('#lashout-load').click();
  await expect(page.locator('#pool-banner')).toContainText('Lash Out');

  // willpower_cost 0 with no vitae_cost is fmtCostLine()'s "confirmed free"
  // case — an empty chip. The box must still show, because effect/action
  // now carry real content of their own (AC5's whole point).
  await expect(page.locator(BOX)).toBeVisible();
  await expect(page.locator(COST)).toHaveText('');

  await page.locator(HEAD).click();
  const paras = page.locator(BODY + ' .power-desc');
  await expect(paras).toHaveCount(2);
  await expect(paras.nth(0)).toHaveText(LASH_OUT_P1);
  await expect(paras.nth(1)).toHaveText(LASH_OUT_P2);
  await expect(page.locator(BODY + ' .power-meta span')).toHaveText(['Instant action']);
});

test('rcv.3c — Blood Bond Resistance shows two paragraphs, a reactive action, and the 1 Willpower cost', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR, CLASH_OPPONENT]);
  await pickCharacter(page, RICH_CHAR);

  await openSpecialTile(page, 'Blood Bond Resistance');
  await page.locator('.bb-vitae-chip[data-v="1"]').click();
  await page.locator('.bb-attempt-chip[data-a="0"]').click();
  await page.locator('#bloodbond-load').click();
  await expect(page.locator('#pool-banner')).toContainText('Blood Bond Resistance');

  await expect(page.locator(BOX)).toBeVisible();
  // noWP:true means the Willpower is the cost of ATTEMPTING, never a dice
  // bonus — it still belongs in the cost chip, which is exactly what
  // willpower_cost:1 gives here.
  await expect(page.locator(COST)).toHaveText('1 Willpower');

  await page.locator(HEAD).click();
  await expect(page.locator(BODY + ' .power-meta span')).toHaveText(['Instant · reactive']);

  const paras = page.locator(BODY + ' .power-desc');
  await expect(paras).toHaveCount(2);
  await expect(paras.nth(0)).toContainText('Any time a point or more of Vitae is imbibed');
  await expect(paras.nth(0)).toContainText('Mortals have no such defence.');
  // The mockup's "tracked below" was edited out: the live panel's prior-
  // attempts chip row sits ABOVE the Load Pool button, not below the result.
  await expect(paras.nth(1)).toContainText('enter how many prior attempts above.');
  await expect(paras.nth(1)).not.toContainText('tracked below');
  await expect(page.locator(BODY + ' .rules-expander')).toHaveCount(0);
});

test('rcv.3c — Clash of Wills shows two paragraphs and a contested action, with no cost chip', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR, CLASH_OPPONENT]);
  await pickCharacter(page, RICH_CHAR);
  await addResistTarget(page, CLASH_OPPONENT);

  // Load Lash Out purely to surface the real #resist-sel dropdown: it is the
  // cheapest pool carrying a `resistance` string, which is what makes
  // showResistSec() reveal the section at all.
  await openSpecialTile(page, 'Lash Out');
  await page.locator('.la-aspect-chip', { hasText: 'Monstrous' }).click();
  await page.locator('#lashout-load').click();
  await expect(page.locator('#resist-sec')).toBeVisible();
  await page.selectOption('#resist-sel', CLASH_OPPONENT.name);
  await expect(page.locator('#resist-line')).toContainText('dice');

  await openSpecialTile(page, 'Clash of Wills');
  await page.locator('.cow-my-chip', { hasText: 'Auspex' }).click();
  await page.locator('.cow-their-chip', { hasText: 'Dominate' }).click();
  await page.locator('#clash-load').click();
  await expect(page.locator('#pool-banner')).toContainText('Clash of Wills');

  // No vitae_cost/willpower_cost/cost on this pi at all — the chip is empty,
  // and the box shows purely because effect/action now exist.
  await expect(page.locator(BOX)).toBeVisible();
  await expect(page.locator(COST)).toHaveText('');

  await page.locator(HEAD).click();
  await expect(page.locator(BODY + ' .power-meta span')).toHaveText(['Instant · contested']);

  const paras = page.locator(BODY + ' .power-desc');
  await expect(paras).toHaveCount(2);
  await expect(paras.nth(0)).toContainText('When two Disciplines directly oppose each other');
  await expect(paras.nth(0)).toContainText('Ties reroll until someone pulls ahead.');
  await expect(paras.nth(1)).toContainText('Willpower may only bolster this roll');
  // The mockup's "Toggle Contested Roll below" / duration-bonus language was
  // edited out — this live panel has neither control.
  const bodyText = await page.locator(BODY).innerText();
  expect(bodyText).not.toContain('Contested Roll');
  expect(bodyText).not.toContain('duration bonus');
  await expect(page.locator(BODY + ' .rules-expander')).toHaveCount(0);
});

test('rcv.3c — a single-paragraph effect still renders as exactly one <p> (Task 4 regression guard)', async ({ page }) => {
  await setupSuite(page, [RICH_CHAR]);
  await pickCharacter(page, RICH_CHAR);
  await loadPower(page, 'Rcv3a Bright Sight');

  await page.locator(HEAD).click();
  // The split is a strict superset: an effect with no '\n\n' yields one array
  // entry, so every already-shipped Discipline/Rite/Devotion `description`
  // renders exactly as it did before rcv.3c.
  const paras = page.locator(BODY + ' .power-desc');
  await expect(paras).toHaveCount(1);
  await expect(paras).toHaveText('The Kindred perceives the unseen edges of a room.');
});
