// E2E coverage for rcv.5 — the "Detecting Blood Sympathy" Vampire Mechanics
// tile: a fourth {opensPanel} choice tile in char-pools.js's VM_CHOICE, opening
// a new `bloodsympathy` mode on the EXISTING #panel/#panel-overlay sheet (not a
// new modal component). Two independent chip groups, both visible at once
// (Relation, Approach), a live total, and a Load Pool button that only appears
// once both are picked — the same shape as the Lash Out panel.
//
// Placed in its own spec rather than bolted onto rcv-3a-rules-explanation-box:
// that file covers the shared Rules-explanation box; this one is mostly panel
// INTERACTION (chip gating, per-tier arithmetic, both cost paths), which would
// have doubled that file's length for a different concern. The story's own
// Task 3 explicitly invites this judgement call. The Rules-box assertions here
// deliberately mirror rcv-3c's own Lash Out tests so the two stay comparable.
//
// Character injection: this app registers a Service Worker (public/sw.js) that
// intercepts /api/characters ahead of Playwright's page.route() stubs and
// serves real cached data (diagnosed during rlv.4). `serviceWorkers: 'block'`
// plus injecting the fixture through the real, exposed `window.pickChar(c)`
// global sidesteps it entirely — same harness as rcv-3a's own spec.

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

const ST_USER = {
  id: '900000015', username: 'test_st_rcv5', global_name: 'Test ST rcv5',
  avatar: null, role: 'st', player_id: 'p-rcv5', character_ids: [], is_dual_role: false,
};

// Wits 3 + Blood Potency 2 is chosen so every tier lands on a distinct total
// (8 / 7 / 6 / 5) — an off-by-one in the tier mod cannot hide behind a
// coincidence, which a Wits-2/BP-1 fixture would have allowed.
const SYM_CHAR = {
  _id: 'char-rcv5-sympathy', name: 'Sympathy Tester', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: {
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Occult: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: { Auspex: { dots: 2 } },
  merits: [],
  powers: [],
  ordeals: [],
};

const SPECIAL_SEC = '#roll-char-pools .gcp-acc-section[data-storage-key="tm_pools_open_special"]';

const BOX  = '#rules-summary-box';
const HEAD = '#rules-summary-box .rules-summary-head';
const COST = '#rules-summary-cost';
const BODY = '#rules-summary-body';

// The exact ported copy, split on the same '\n\n' updRulesSummary() splits on.
const BS_P1 = "Detects a blood relative within the same city: sire or childe (+3), sibling, grandsire, or grandchilde (+2), cousin, a sire's sibling, or great-grandsire/childe (+1), or a clanmate (+0). Passive detection is free and ambient; forcing a connection to a specific target costs 1 Willpower. This roll cannot dramatically fail, regardless of pool size.";
const BS_P2 = "Success: a vague impression of the relative's mental state and general direction. Exceptional success: also their rough distance, whether they have reached torpor or Final Death, and a single short sentence through the blood tie.";

async function setupSuite(page, chars) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
    localStorage.setItem('tm_rules_db', JSON.stringify([]));
  }, { user: ST_USER });

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

/** Open the Special accordion (closed by default) and tap one choice tile. */
async function openSpecialTile(page, label) {
  const sec = page.locator(SPECIAL_SEC);
  if (await sec.getAttribute('data-open') !== 'true') {
    await page.locator(SPECIAL_SEC + ' .gcp-acc-head').click();
  }
  await page.locator(SPECIAL_SEC + ' .gcp-pool-btn', { hasText: label }).click();
  await page.waitForSelector('#panel', { state: 'visible', timeout: 10000 });
}

/** Close the sheet via its own real Close control, so a test can reopen it. */
async function closePanel(page) {
  await page.locator('#panel .panel-close').click();
  await expect(page.locator('#panel-overlay')).toBeHidden();
}

/** Open the panel and pick one Relation tier + one Approach, then Load Pool. */
async function loadSympathy(page, tierKey, forced) {
  await openSpecialTile(page, 'Detecting Blood Sympathy');
  await page.locator(`.bs-tier-chip[data-t="${tierKey}"]`).click();
  await page.locator(`.bs-force-chip[data-f="${forced ? '1' : '0'}"]`).click();
  await page.locator('#bloodsym-load').click();
  await expect(page.locator('#pool-banner')).toContainText('Detecting Blood Sympathy');
}

// ── Source-fetch smokes ──────────────────────────────────────────────────

test('rcv.5 — char-pools.js carries the fourth VM_CHOICE entry, as an {opensPanel} tile', async ({ request }) => {
  const src = await (await request.get('/js/game/char-pools.js')).text();
  expect(src).toContain("{ label: 'Detecting Blood Sympathy', mode: 'bloodsympathy' },");
  // AC1: it sits inside VM_CHOICE, alongside the other three, not in
  // VM_IMMEDIATE (which would have made it a direct-load pool with no panel).
  const choiceBlock = src.slice(src.indexOf('const VM_CHOICE = ['), src.indexOf('for (const m of VM_CHOICE)'));
  expect(choiceBlock).toContain('Detecting Blood Sympathy');
  expect(choiceBlock).toContain('Blood Bond Resistance');
});

test('rcv.5 — app.js adds a bloodsympathy panel mode, reusing #panel (not a new modal)', async ({ request }) => {
  const src = await (await request.get('/js/app.js')).text();
  expect(src).toContain("} else if (mode === 'bloodsympathy') {");
  // "What this story is NOT": no .fb-modal / .fb-overlay / .fb-cell anywhere.
  expect(src).not.toContain('fb-modal');
  expect(src).not.toContain('fb-overlay');
  // AC6: a straight roll, no opposing pool.
  const branch = src.slice(src.indexOf("mode === 'bloodsympathy'"), src.indexOf("mode === 'custom'"));
  expect(branch.length).toBeGreaterThan(500);
  expect(branch).toContain('resistance: null');
  expect(branch).toContain("action: 'Instant action',");
  // The mockup's own two-screen wizard was deliberately NOT ported: nothing in
  // the branch renders a Back-labelled control. (Matched against the generated
  // markup, not the whole branch text, so the branch's own explanatory comment
  // about the mockup cannot false-positive.)
  expect(branch).not.toMatch(/>\s*(&#8592;\s*)?Back\s*</);
});

// ── AC1/AC2: the tile, and the panel it opens ────────────────────────────

test('rcv.5 — the tile appears in the Special accordion and opens the shared panel', async ({ page }) => {
  await setupSuite(page, [SYM_CHAR]);
  await pickCharacter(page, SYM_CHAR);

  const sec = page.locator(SPECIAL_SEC);
  await sec.locator('.gcp-acc-head').click();
  const tile = sec.locator('.gcp-pool-btn', { hasText: 'Detecting Blood Sympathy' });
  await expect(tile).toHaveCount(1);
  // It is a choice tile (opens a panel), not a direct-load pool tile.
  await expect(tile).toHaveClass(/\bgcp-choice\b/);
  await expect(tile.locator('.gcp-pool-sub')).toHaveText('tap to choose');

  await tile.click();
  // AC2: the EXISTING sheet component, and its own overlay — no new modal.
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#panel-overlay')).toBeVisible();
  await expect(page.locator('#panel-title')).toHaveText('Detecting Blood Sympathy');
  await expect(page.locator('.fb-modal')).toHaveCount(0);

  // The four other Vampire Mechanics tiles are untouched (AC8).
  for (const label of ['Frenzy Resistance', 'Lash Out', 'Clash of Wills', 'Blood Bond Resistance', 'Humanity Check']) {
    await expect(sec.locator('.gcp-pool-btn', { hasText: label })).toHaveCount(1);
  }
});

// ── AC3: both chip groups, visible at once ───────────────────────────────

test('rcv.5 — both chip groups render together, with the mockup\'s own four tiers', async ({ page }) => {
  await setupSuite(page, [SYM_CHAR]);
  await pickCharacter(page, SYM_CHAR);
  await openSpecialTile(page, 'Detecting Blood Sympathy');

  // AC3: NOT sequential screens — Relation and Approach are both present in
  // the DOM and visible from the moment the panel opens.
  const sections = page.locator('#panel-body .panel-section');
  await expect(sections).toHaveText(['Relation', 'Approach']);

  const tiers = page.locator('.bs-tier-chip');
  await expect(tiers).toHaveCount(4);
  await expect(tiers.nth(0)).toContainText('Once Removed');
  await expect(tiers.nth(0)).toContainText('Sire or childe');
  await expect(tiers.nth(1)).toContainText('Twice Removed');
  await expect(tiers.nth(1)).toContainText('Sibling, grandsire, or grandchilde');
  await expect(tiers.nth(2)).toContainText('Thrice Removed');
  await expect(tiers.nth(2)).toContainText("Cousin, sire's sibling, or great-grandsire/childe");
  await expect(tiers.nth(3)).toContainText('Four Times Removed');
  await expect(tiers.nth(3)).toContainText('Clanmate');

  const approach = page.locator('.bs-force-chip');
  await expect(approach).toHaveCount(2);
  await expect(approach.nth(0)).toHaveText('Passive (free)');
  await expect(approach.nth(1)).toHaveText('Forced (1 WP)');
  // Neither group is pre-selected — Approach in particular has no default, so
  // "Passive" can never be loaded by accident (unlike Lash Out's Kindred).
  await expect(page.locator('.bs-tier-chip.on')).toHaveCount(0);
  await expect(page.locator('.bs-force-chip.on')).toHaveCount(0);

  // "What this story is NOT": the mockup's own two-screen wizard was adapted
  // away, so the panel has no Back control of any kind.
  await expect(page.locator('#panel-body button', { hasText: /^Back$/ })).toHaveCount(0);
});

test('rcv.5 — both chip groups are independently required before Load Pool appears', async ({ page }) => {
  await setupSuite(page, [SYM_CHAR]);
  await pickCharacter(page, SYM_CHAR);
  await openSpecialTile(page, 'Detecting Blood Sympathy');

  // Nothing picked.
  await expect(page.locator('#bloodsym-load')).toHaveCount(0);
  await expect(page.locator('#panel-body .panel-total')).toHaveCount(0);

  // Relation only — still gated.
  await page.locator('.bs-tier-chip[data-t="once"]').click();
  await expect(page.locator('.bs-tier-chip[data-t="once"]')).toHaveClass(/\bon\b/);
  await expect(page.locator('#bloodsym-load')).toHaveCount(0);
  await expect(page.locator('#panel-body .panel-total')).toHaveCount(0);

  // Approach only — the other half of the gate, proven from a clean panel so
  // this is genuinely "Approach alone", not "Approach after Relation". The
  // panel is reopened from scratch (a tier chip has no deselect), which also
  // proves each open starts with both selections reset.
  await closePanel(page);
  await openSpecialTile(page, 'Detecting Blood Sympathy');
  await expect(page.locator('.bs-tier-chip.on')).toHaveCount(0);
  await page.locator('.bs-force-chip[data-f="0"]').click();
  await expect(page.locator('.bs-force-chip[data-f="0"]')).toHaveClass(/\bon\b/);
  await expect(page.locator('#bloodsym-load')).toHaveCount(0);
  await expect(page.locator('#panel-body .panel-total')).toHaveCount(0);

  // Both — the button and the live total appear.
  await page.locator('.bs-tier-chip[data-t="once"]').click();
  await expect(page.locator('#bloodsym-load')).toHaveCount(1);
  await expect(page.locator('#panel-body .panel-total')).toHaveCount(1);
});

// ── AC4: the live total, per tier ────────────────────────────────────────

test('rcv.5 — the live total is Wits + Blood Potency + tier mod, for each of the four tiers', async ({ page }) => {
  await setupSuite(page, [SYM_CHAR]);
  await pickCharacter(page, SYM_CHAR);
  await openSpecialTile(page, 'Detecting Blood Sympathy');
  await page.locator('.bs-force-chip[data-f="0"]').click();

  const total = page.locator('#panel-body .panel-total');

  // Wits 3 + BP 2, so: +3 -> 8, +2 -> 7, +1 -> 6, +0 -> 5.
  await page.locator('.bs-tier-chip[data-t="once"]').click();
  await expect(total).toHaveText('Wits 3 + Blood Potency 2 + Once Removed +3 = 8 dice');

  await page.locator('.bs-tier-chip[data-t="twice"]').click();
  await expect(total).toHaveText('Wits 3 + Blood Potency 2 + Twice Removed +2 = 7 dice');

  await page.locator('.bs-tier-chip[data-t="thrice"]').click();
  await expect(total).toHaveText('Wits 3 + Blood Potency 2 + Thrice Removed +1 = 6 dice');

  // The +0 tier still renders a signed "+0", not a bare "0" or a "-0".
  await page.locator('.bs-tier-chip[data-t="four"]').click();
  await expect(total).toHaveText('Wits 3 + Blood Potency 2 + Four Times Removed +0 = 5 dice');
});

test('rcv.5 — Load Pool loads the computed total onto the roller (two different tiers)', async ({ page }) => {
  await setupSuite(page, [SYM_CHAR]);
  await pickCharacter(page, SYM_CHAR);

  await loadSympathy(page, 'once', false);
  await expect(page.locator('#rv2-eff')).toHaveText('8');
  // The breakdown line carries the Attribute half of the pool (skill/disc are
  // both null on this pi), so it names Wits, never a stand-in skill.
  await expect(page.locator('#effline')).toContainText('Wits');

  await loadSympathy(page, 'four', false);
  await expect(page.locator('#rv2-eff')).toHaveText('5');
});

// ── AC5: the Willpower cost, via the Rules-box cost chip ─────────────────

test('rcv.5 — Forced costs 1 Willpower', async ({ page }) => {
  await setupSuite(page, [SYM_CHAR]);
  await pickCharacter(page, SYM_CHAR);
  await loadSympathy(page, 'once', true);

  await expect(page.locator(BOX)).toBeVisible();
  await expect(page.locator(COST)).toHaveText('1 Willpower');
});

test('rcv.5 — Passive costs nothing (an empty cost chip, box still shown)', async ({ page }) => {
  await setupSuite(page, [SYM_CHAR]);
  await pickCharacter(page, SYM_CHAR);
  await loadSympathy(page, 'once', false);

  // willpower_cost 0 with no vitae_cost is fmtCostLine()'s "confirmed free"
  // case — an empty chip, exactly as Lash Out (Mortal) already behaves. The
  // box itself must still show, because effect/action carry real content.
  await expect(page.locator(BOX)).toBeVisible();
  await expect(page.locator(COST)).toHaveText('');
});

test('rcv.5 — the Approach choice, not the tier, is what drives the cost', async ({ page }) => {
  await setupSuite(page, [SYM_CHAR]);
  await pickCharacter(page, SYM_CHAR);

  // Same tier, both approaches — isolates willpower_cost from the tier mod.
  await loadSympathy(page, 'thrice', true);
  await expect(page.locator(COST)).toHaveText('1 Willpower');
  await loadSympathy(page, 'thrice', false);
  await expect(page.locator(COST)).toHaveText('');
});

test('rcv.5 — noWP is false, so the separate WP(+3) dice chip still composes additively', async ({ page }) => {
  await setupSuite(page, [SYM_CHAR]);
  await pickCharacter(page, SYM_CHAR);
  await loadSympathy(page, 'once', true);

  // AC5's own reasoning: the 1 WP activation cost and the WP(+3) dice boost
  // are additive, never either/or (unlike Blood Bond Resistance's noWP:true).
  await expect(page.locator('#rv2-eff')).toHaveText('8');
  await page.locator('#wp-c').click();
  await expect(page.locator('#rv2-sub')).toContainText('WP +3');
  await expect(page.locator('#rv2-eff')).toHaveText('11');
});

// ── AC6: no opposing pool ────────────────────────────────────────────────

test('rcv.5 — no resistance: the resist-target section stays hidden', async ({ page }) => {
  await setupSuite(page, [SYM_CHAR]);
  await pickCharacter(page, SYM_CHAR);
  await loadSympathy(page, 'twice', false);

  // Lash Out / Clash of Wills / Blood Bond Resistance all carry a `resistance`
  // string, which is what makes showResistSec() reveal #resist-sec. This tile
  // deliberately does not.
  await expect(page.locator('#resist-sec')).toBeHidden();
});

// ── AC7: the Rules-explanation box ───────────────────────────────────────

test('rcv.5 — the Rules box shows the ported copy as two separate paragraphs', async ({ page }) => {
  await setupSuite(page, [SYM_CHAR]);
  await pickCharacter(page, SYM_CHAR);
  await loadSympathy(page, 'once', true);

  await expect(page.locator(BOX)).toBeVisible();
  await page.locator(HEAD).click();

  await expect(page.locator(BODY + ' .power-meta span')).toHaveText(['Instant action']);

  // The same '\n\n' paragraph split rcv.3a/rcv.3c already rely on: two
  // SEPARATE <p class="power-desc"> elements, not one squashed paragraph.
  const paras = page.locator(BODY + ' .power-desc');
  await expect(paras).toHaveCount(2);
  await expect(paras.nth(0)).toHaveText(BS_P1);
  await expect(paras.nth(1)).toHaveText(BS_P2);

  // AC7: "cannot dramatically fail" is RULES TEXT only — documented, never
  // enforced, because this app's dice engine has no dramatic-failure concept.
  await expect(paras.nth(0)).toContainText('cannot dramatically fail');

  // No purchasable_powers doc to cite, so no rules_text expander — same as
  // the other four Vampire Mechanics tiles.
  await expect(page.locator(BODY + ' .rules-expander')).toHaveCount(0);
});

test('rcv.5 — the same copy shows for Passive, and for a different tier', async ({ page }) => {
  await setupSuite(page, [SYM_CHAR]);
  await pickCharacter(page, SYM_CHAR);
  await loadSympathy(page, 'four', false);

  // pi.effect is static per-tile (the deliberate edit away from the mockup's
  // own dynamic per-selection text), so a different tier and approach must
  // yield byte-identical copy.
  await page.locator(HEAD).click();
  const paras = page.locator(BODY + ' .power-desc');
  await expect(paras).toHaveCount(2);
  await expect(paras.nth(0)).toHaveText(BS_P1);
  await expect(paras.nth(1)).toHaveText(BS_P2);
});
