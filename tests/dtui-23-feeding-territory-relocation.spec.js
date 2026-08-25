/**
 * E2E coverage for dtui-23 (FR7/FR8) — Feeding: Territory relocated below the
 * pool, grouped with Blood Type and Method of Feeding.
 *
 * Covers:
 *   - AC1: Territory & Influence section carries only the influence grid
 *     (regression guard — this was already true before this story)
 *   - AC2: the Territory/Blood Type/Method of Feeding group renders after
 *     the FEED_METHODS cards and pool (not just after the method cards), not
 *     before them
 *   - AC3: Blood Type and Method of Feeding are real .dt-ticker fieldsets;
 *     Territory keeps its own established .dt-terr-pill rendering
 *   - AC4: Blood Type is a native single-select radiogroup; the selection
 *     persists as a one-element JSON array (existing consumers' shape);
 *     AC4b is a Codex-review regression test — a Blood Type pick must
 *     survive an immediately-following Method of Feeding pick, since the
 *     latter's own change handler triggers a synchronous re-render
 *   - AC5: Method of Feeding pre-selects from FEED_VIOLENCE_DEFAULTS and an
 *     explicit pick overrides the default. AC5b/AC5c do NOT assert the
 *     "Pre-selected based on your method" hint text appears — it does not,
 *     confirmed unreachable pre-existing behaviour, see the story's own AC5
 *     correction. Only AC5a's "does not pre-select" hint is ever asserted.
 *
 * Test approach mirrors tests/dtui-20-court-acknowledge-peers.spec.js: mount
 * renderDowntimeTab() into a sandbox div directly. Persistence (AC4/AC5) is
 * verified via the 800ms localStorage draft mirror (draft-persist.js),
 * since collectResponses() itself is not exported.
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654323',
  username: 'test_player_dtui23',
  global_name: 'Test Player DTUI23',
  avatar: null,
  role: 'player',
  player_id: 'p-dtui23',
  character_ids: ['char-self'],
  is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-dtui23',
  status: 'active',
  label: 'Test Cycle',
  feeding_rights_confirmed: true,
  is_chapter_finale: false,
  created_at: '2026-08-25T00:00:00.000Z',
};

const CHAR = {
  _id: 'char-self',
  name: 'Self Subject',
  moniker: null,
  honorific: null,
  clan: 'Mekhet',
  covenant: 'Invictus',
  player: 'Test Player DTUI23',
  blood_potency: 1,
  humanity: 7,
  humanity_base: 7,
  court_title: null,
  retired: false,
  status: { city: 0, clan: 0, covenant: {} },
  attributes: {
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {},
  disciplines: {},
  merits: [],
  powers: [],
  ordeals: [],
};

async function setupSuite(page, { priorResponses = null } = {}) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);

  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) })
  );
  await page.route(/\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CHAR]) })
  );
  await page.route(/\/api\/characters\/char-self$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHAR) })
  );
  await page.route('**/api/chapters', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) })
  );
  if (priorResponses) {
    await page.route(/\/api\/downtime_submissions\?chapter_id=/, r =>
      r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ _id: 'sub-dtui23', character_id: CHAR._id, chapter_id: ACTIVE_CYCLE._id, responses: priorResponses }]),
      })
    );
  }

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

// Territory & Influence is not in MINIMAL_SECTIONS (downtime-form.js) — it
// only renders in Advanced mode. AC1 needs it visible to assert on.
async function openSection(page, key, { advanced = false } = {}) {
  await page.evaluate(async (c) => {
    const sandbox = document.createElement('div');
    sandbox.id = 'dt-sandbox';
    sandbox.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:99999;overflow:auto;';
    document.body.appendChild(sandbox);
    const mod = await import('/js/tabs/downtime-form.js');
    await mod.renderDowntimeTab(sandbox, c, []);
  }, CHAR);
  if (advanced) {
    await page.locator('#dt-sandbox [data-dt-mode="advanced"]').click();
  }
  await page.waitForSelector(`#dt-sandbox .qf-section[data-section-key="${key}"]`, { timeout: 10000 });
  await page.locator(`#dt-sandbox .qf-section[data-section-key="${key}"] .qf-section-title`).click();
  await expect(page.locator(`#dt-sandbox .qf-section[data-section-key="${key}"]`)).not.toHaveClass(/collapsed/);
}

const sb = (page) => page.locator('#dt-sandbox');
const feedCardWrap = (page) => sb(page).locator('.dt-feed-card-wrap');

// The .dt-ticker radio is visually hidden (clip-rect pattern); the visible,
// clickable surface is the <label class="dt-ticker__pill"> wrapping it —
// click that, matching how a real player interacts.
const tickerPill = (page, name, value) =>
  feedCardWrap(page).locator(`label.dt-ticker__pill:has(input[name="${name}"][value="${value}"])`);

async function readDraft(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('tm-dt-draft-char-self-cycle-dtui23');
    return raw ? JSON.parse(raw).responses : null;
  });
}

test.describe('dtui-23 — Feeding territory relocation + grouping', () => {
  test('AC1: Territory & Influence carries only the influence grid (regression guard)', async ({ page }) => {
    await setupSuite(page);
    await openSection(page, 'territory', { advanced: true });

    // Codex review (Low): the original version only checked the section
    // BODY was visible, not that it actually contains an influence grid —
    // that passed even if the influence grid itself were broken/missing.
    const territorySection = sb(page).locator('.qf-section[data-section-key="territory"]');
    await expect(territorySection.locator('[data-terr-single], .dt-feed-terr-pills, .dt-terr-pills')).toHaveCount(0);
    await expect(territorySection.locator('.dt-influence-grid')).toBeVisible();
  });

  test('AC2: Territory/Blood Type/Method of Feeding group renders after the FEED_METHODS cards and pool', async ({ page }) => {
    await setupSuite(page);
    await openSection(page, 'feeding');

    // MINIMAL mode (the default) always renders its pool readout div, even
    // before a method is picked ("Pick a method above..." placeholder) — a
    // real marker for "the pool", not just the method-card container that
    // precedes it. Codex review (Medium): the original version of this test
    // only checked Territory against the method-CARDS index, never against
    // the pool itself, so it could pass even if the group moved to sit
    // between the cards and the pool rather than after both.
    const html = await feedCardWrap(page).innerHTML();
    const methodsIdx = html.indexOf('dt-feed-methods');
    const poolIdx = html.indexOf('dt-feed-min-pool');
    const terrIdx = html.indexOf('dt-feed-terr-pills');
    const bloodIdx = html.indexOf('name="dt-feed_blood_type"');
    const violenceIdx = html.indexOf('name="dt-feed_violence"');
    const descIdx = html.indexOf('dt-feeding_description');

    expect(methodsIdx).toBeGreaterThan(-1);
    expect(poolIdx).toBeGreaterThan(methodsIdx);
    expect(terrIdx).toBeGreaterThan(poolIdx);
    expect(bloodIdx).toBeGreaterThan(terrIdx);
    expect(violenceIdx).toBeGreaterThan(bloodIdx);
    expect(descIdx).toBeGreaterThan(violenceIdx);
  });

  test('AC3: Blood Type and Method of Feeding are .dt-ticker fieldsets; Territory keeps its own rendering', async ({ page }) => {
    await setupSuite(page);
    await openSection(page, 'feeding');

    const bloodTicker = feedCardWrap(page).locator('fieldset.dt-ticker', { hasText: 'Blood Type' });
    await expect(bloodTicker).toBeVisible();
    await expect(bloodTicker.locator('input[type="radio"][name="dt-feed_blood_type"]')).toHaveCount(3);

    const methodTicker = feedCardWrap(page).locator('fieldset.dt-ticker', { hasText: 'Method of Feeding' });
    await expect(methodTicker).toBeVisible();
    await expect(methodTicker.locator('input[type="radio"][name="dt-feed_violence"]')).toHaveCount(2);
    await expect(methodTicker.locator('label.dt-ticker__pill')).toContainText(['The Kiss (subtle)', 'The Assault (violent)']);

    // Territory still uses its own established pill rendering, not a bare .dt-ticker.
    await expect(feedCardWrap(page).locator('.dt-feed-terr-pills .dt-terr-pill').first()).toBeVisible();
    await expect(feedCardWrap(page).locator('fieldset.dt-ticker', { hasText: 'Where does your character hunt' })).toHaveCount(0);
  });

  test('AC4: Blood Type is a native single-select radiogroup; selection persists as a one-element array', async ({ page }) => {
    await setupSuite(page);
    await openSection(page, 'feeding');

    const human = feedCardWrap(page).locator('input[name="dt-feed_blood_type"][value="Human"]');
    const animal = feedCardWrap(page).locator('input[name="dt-feed_blood_type"][value="Animal"]');

    // The radio itself is visually hidden (clip-rect pattern) — click its
    // <label class="dt-ticker__pill"> instead, matching a real player.
    await tickerPill(page, 'dt-feed_blood_type', 'Human').click();
    await expect(human).toBeChecked();
    await expect(animal).not.toBeChecked();

    // Native radio behaviour handles single-select — no manual JS toggling needed.
    await tickerPill(page, 'dt-feed_blood_type', 'Animal').click();
    await expect(animal).toBeChecked();
    await expect(human).not.toBeChecked();

    await page.waitForTimeout(900);
    const draft = await readDraft(page);
    expect(draft._feed_blood_types).toBe(JSON.stringify(['Animal']));
  });

  // Codex review (High): the Method of Feeding radio's own change handler
  // calls renderForm() synchronously (to keep its hint text accurate). That
  // rebuild reads Blood Type back out of responseDoc.responses, so a Blood
  // Type pick that only relies on the later debounced collectResponses() to
  // reach responseDoc gets silently overwritten by a Method of Feeding pick
  // that arrives first. Confirmed present in base commit 361716b6 too (the
  // old button-toggle handler had the same gap) — patched here since dtui-23
  // already rewrites this exact pair of controls.
  test('AC4b (Codex regression): a Blood Type pick survives an immediately-following Method of Feeding pick', async ({ page }) => {
    await setupSuite(page);
    await openSection(page, 'feeding');

    const human = feedCardWrap(page).locator('input[name="dt-feed_blood_type"][value="Human"]');
    await tickerPill(page, 'dt-feed_blood_type', 'Human').click();
    await expect(human).toBeChecked();

    // Fires before the 800ms draft debounce — this is the exact race.
    await tickerPill(page, 'dt-feed_violence', 'kiss').click();

    await expect(human).toBeChecked();
    await page.waitForTimeout(900);
    const draft = await readDraft(page);
    expect(draft._feed_blood_types).toBe(JSON.stringify(['Human']));
  });

  test('AC5a: no method picked (live) — neither option checked, "does not pre-select" hint', async ({ page }) => {
    await setupSuite(page);
    await openSection(page, 'feeding');

    // Stalking has no violence default (FEED_VIOLENCE_DEFAULTS.stalking = null).
    await feedCardWrap(page).locator('[data-feed-method="stalking"]').click();
    await expect(feedCardWrap(page).locator('input[name="dt-feed_violence"]:checked')).toHaveCount(0);
    await expect(sb(page).locator('.dt-feed-vi-hint')).toHaveText(/does not pre-select/i);
  });

  // Pre-existing hydration (fix.48, downtime-form.js:1614-1620) backfills
  // responseDoc.responses.feed_violence from FEED_VIOLENCE_DEFAULTS BEFORE
  // the first render whenever a saved method has a default and no explicit
  // violence is saved yet — the same way a live method-card click's own
  // collectResponses() call does (see AC5c). This makes the ticker's
  // "Pre-selected based on your method..." hint text unreachable in both
  // load and live-click flows: persistedViolence is already truthy by the
  // time this render case's hint logic runs. Confirmed pre-existing, not
  // introduced by this story — dtui-23 only changed the markup the (already
  // correctly pre-checked) radio renders as, not this hydration timing. Not
  // fixed here; out of scope for a Feeding-restructure story.
  test('AC5b: a loaded method default pre-checks its ticker option (hint text is unreachable, confirmed pre-existing)', async ({ page }) => {
    await setupSuite(page, { priorResponses: { _feed_method: 'seduction' } });
    await openSection(page, 'feeding');

    const kiss = feedCardWrap(page).locator('input[name="dt-feed_violence"][value="kiss"]');
    await expect(kiss).toBeChecked();
    await expect(sb(page).locator('.dt-feed-vi-hint')).toHaveCount(0);
  });

  test('AC5c: an explicit pick overrides the default, clears the hint, and persists', async ({ page }) => {
    await setupSuite(page, { priorResponses: { _feed_method: 'seduction' } });
    await openSection(page, 'feeding');

    const kiss = feedCardWrap(page).locator('input[name="dt-feed_violence"][value="kiss"]');
    const violent = feedCardWrap(page).locator('input[name="dt-feed_violence"][value="violent"]');
    await expect(kiss).toBeChecked();

    await tickerPill(page, 'dt-feed_violence', 'violent').click();
    await expect(violent).toBeChecked();
    await expect(kiss).not.toBeChecked();
    await expect(sb(page).locator('.dt-feed-vi-hint')).toHaveCount(0);

    await page.waitForTimeout(900);
    const draft = await readDraft(page);
    expect(draft.feed_violence).toBe('violent');
  });
});
