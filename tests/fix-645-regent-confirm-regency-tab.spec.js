/**
 * fix.645 — Regent confirm-feeding and Regency tab cycle-status gating.
 *
 * Root cause: three-way mismatch — DT form used LIVE_STATUSES to find the cycle but showed
 * the confirm button unconditionally; regency-tab.js only picked 'active' cycles so the tab
 * rendered nothing useful for 'game'/'prep' cycles; server gated confirm to 'active' only.
 *
 * Fixes:
 *   regency-tab.js  — widens cycle picker to LIVE_STATUSES; gates confirm button / CTA banner
 *                     on status === 'active' explicitly.
 *   downtime-form.js — gates confirm button in renderRegencySection() on currentCycle.status
 *                      === 'active'; non-active branch shows "not yet open" note instead.
 *
 * NOTE — localhost dev bypass (downtime-form.js:1391):
 *   The DT form coerces any non-active cycle to 'active' on localhost for dev convenience.
 *   Therefore AC-1 (game cycle → no confirm button in DT form) cannot be verified through
 *   Playwright on localhost. That acceptance criterion is instead covered by the regency tab
 *   tests below, which have no equivalent bypass.
 */

const { test, expect } = require('@playwright/test');
const { bootApp, goToTab } = require('./helpers/unified-app.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '987645321', username: 'test_regent_645', global_name: 'Test Regent',
  avatar: null, role: 'player', player_id: 'p-645',
  character_ids: ['char-645'], is_dual_role: false,
};

const CHAR_REGENT = {
  _id: 'char-645', name: 'Rene', moniker: null, honorific: null,
  clan: 'Ventrue', covenant: 'Invictus', player: 'Rene Player',
  blood_potency: 3, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: {
    city: 2, clan: 1,
    covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 2, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
  },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

// Non-regent: same shape but no territory has regent_id pointing to this char.
const CHAR_NON_REGENT = { ...CHAR_REGENT, _id: 'char-646', name: 'Other' };

// Territory whose regent_id matches CHAR_REGENT._id — triggers the regency section.
const TERRITORY_645 = {
  _id: 'terr-645', name: 'The Second City', slug: 'secondcity',
  regent_id: 'char-645', lieutenant_id: null,
  feeding_rights: [], ambience: 'urban',
};

const CYCLE_GAME = {
  _id: 'cycle-645g', cycle_number: 4, status: 'game', label: 'DT4',
  feeding_rights_confirmed: false, regent_confirmations: [],
  phase_signoff: {}, created_at: '2026-06-01T00:00:00Z',
};

const CYCLE_ACTIVE = {
  _id: 'cycle-645a', cycle_number: 4, status: 'active', label: 'DT4',
  feeding_rights_confirmed: false, regent_confirmations: [],
  phase_signoff: {}, created_at: '2026-06-01T00:00:00Z',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setupRegent(page, { cycle, char = CHAR_REGENT, territories = [TERRITORY_645] } = {}) {
  const cycles = cycle ? [cycle] : [];
  const charNames = [{ _id: char._id, name: char.name, moniker: char.moniker, honorific: char.honorific }];
  const user = { ...PLAYER_USER, character_ids: [char._id] };

  await bootApp(page, user, {
    routes: async (p) => {
      await p.route(/\/api\/downtime_cycles/, r => r.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify(cycles),
      }));
      await p.route(/\/api\/downtime_submissions/, r => r.fulfill({
        status: 200, contentType: 'application/json', body: '[]',
      }));
      await p.route(/\/api\/characters\/names/, r => r.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify(charNames),
      }));
      await p.route(/\/api\/characters/, r => r.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify([char]),
      }));
      await p.route(/\/api\/territories/, r => r.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify(territories),
      }));
    },
  });
}

async function openDtTab(page) {
  await page.evaluate(() => window.goTab('downtime'));
  await page.waitForSelector('#t-downtime.active', { timeout: 5000 });
  // Wait for the async form init to complete — regency section is one of the last sections.
  await page.waitForTimeout(1500);
}

async function openRegencyTab(page) {
  await page.evaluate(() => window.goTab('regency'));
  await page.waitForSelector('#t-regency.active', { timeout: 5000 });
  // renderRegencyTab is async: fetches /api/characters/names, /api/downtime_cycles,
  // /api/downtime_submissions. Wait for the feeding-rights grid to confirm render complete.
  await page.waitForSelector('#t-regency .regency-wrap, #t-regency .dt-residency-grid', { timeout: 6000 });
}

// ── DT form Regency section ───────────────────────────────────────────────────

test.describe('fix.645: DT form Regency section — cycle status gating', () => {

  test('active cycle: confirm button is present for unconfirmed regent', async ({ page }) => {
    await setupRegent(page, { cycle: CYCLE_ACTIVE });
    await openDtTab(page);

    // The regency section should render for this regent.
    await expect(page.locator('[data-section-key="regency"]')).toBeVisible();
    // Confirm button must be present when status is 'active'.
    await expect(page.locator('#dt-btn-confirm-regency')).toBeVisible();
    // "Open Regency tab" button always present for regent.
    await expect(page.locator('[data-open-regency-tab]').first()).toBeVisible();
    // The "not yet open" note must NOT appear.
    await expect(page.locator('[data-section-key="regency"]')).not.toContainText('not yet open');
  });

  test('prep cycle + past auto_open_at: confirm button present (auto-opened)', async ({ page }) => {
    // fix(645b): renderRegencySection now treats a cycle as effectively open when
    // auto_open_at has passed, matching the form gate's _autoOpenPassed bypass.
    // NOTE: on localhost the dev bypass (downtime-form.js:1391) coerces prep→active
    // before renderRegencySection runs, so this test passes by both mechanisms.
    // The new code path fires exclusively in production where the bypass is absent.
    const CYCLE_PREP_AUTOOPENED = {
      _id: 'cycle-645pa', cycle_number: 4, status: 'prep', label: 'DT4',
      feeding_rights_confirmed: false, regent_confirmations: [],
      auto_open_at: '2026-06-01T00:00:00Z', // past — auto-opened
      phase_signoff: {}, created_at: '2026-06-01T00:00:00Z',
    };
    await setupRegent(page, { cycle: CYCLE_PREP_AUTOOPENED });
    await openDtTab(page);

    await expect(page.locator('[data-section-key="regency"]')).toBeVisible();
    await expect(page.locator('#dt-btn-confirm-regency')).toBeVisible();
    await expect(page.locator('[data-section-key="regency"]')).not.toContainText('not yet open');
  });

  test('non-regent char: regency section is absent entirely', async ({ page }) => {
    // No territory has regent_id matching CHAR_NON_REGENT — section must not render.
    await setupRegent(page, { cycle: CYCLE_ACTIVE, char: CHAR_NON_REGENT, territories: [] });
    await openDtTab(page);

    await expect(page.locator('[data-section-key="regency"]')).toHaveCount(0);
    await expect(page.locator('#dt-btn-confirm-regency')).toHaveCount(0);
  });

});

// ── Regency tab ───────────────────────────────────────────────────────────────

test.describe('fix.645: Regency tab — cycle status gating', () => {

  test('game cycle: feeding-rights grid renders; no confirm button; no CTA banner', async ({ page }) => {
    await setupRegent(page, { cycle: CYCLE_GAME });
    await openRegencyTab(page);

    // Feeding-rights grid must render (regent can prepare selections).
    await expect(page.locator('.dt-residency-grid')).toBeVisible();
    // Save button always present.
    await expect(page.locator('#reg-save')).toBeVisible();
    // Confirm button must NOT appear — cycle is not active.
    await expect(page.locator('#reg-confirm')).toHaveCount(0);
    // CTA banner must NOT appear — only shown when status is 'active'.
    await expect(page.locator('.reg-cta-banner')).toHaveCount(0);
    // Confirmed-badge must NOT appear.
    await expect(page.locator('.reg-confirmed-badge')).toHaveCount(0);
  });

  test('active cycle: confirm button and CTA banner are present when unconfirmed', async ({ page }) => {
    await setupRegent(page, { cycle: CYCLE_ACTIVE });
    await openRegencyTab(page);

    // Feeding-rights grid must render.
    await expect(page.locator('.dt-residency-grid')).toBeVisible();
    // Confirm button must be present.
    await expect(page.locator('#reg-confirm')).toBeVisible();
    // CTA action-required banner must be present.
    await expect(page.locator('.reg-cta-banner')).toBeVisible();
    await expect(page.locator('.reg-cta-banner')).toContainText('Action required');
    // Save button still present.
    await expect(page.locator('#reg-save')).toBeVisible();
  });

  test('no cycle: tab renders without crash; no confirm button', async ({ page }) => {
    await setupRegent(page, { cycle: null });
    await openRegencyTab(page);

    // The grid renders (regent can view their territory even without a cycle).
    await expect(page.locator('.dt-residency-grid')).toBeVisible();
    // No confirm button — no cycle to confirm against.
    await expect(page.locator('#reg-confirm')).toHaveCount(0);
    // No CTA banner.
    await expect(page.locator('.reg-cta-banner')).toHaveCount(0);
  });

  test('prep cycle: feeding-rights grid renders; no confirm button; no CTA banner', async ({ page }) => {
    const CYCLE_PREP = { ...CYCLE_GAME, _id: 'cycle-645p', status: 'prep', label: 'DT4 Prep' };
    await setupRegent(page, { cycle: CYCLE_PREP });
    await openRegencyTab(page);

    await expect(page.locator('.dt-residency-grid')).toBeVisible();
    await expect(page.locator('#reg-confirm')).toHaveCount(0);
    await expect(page.locator('.reg-cta-banner')).toHaveCount(0);
  });

  test('active cycle already confirmed: confirmed-badge shown, no confirm button', async ({ page }) => {
    // feeding_rights_confirmed: true = the ST has globally closed the feeding gate.
    // regent_confirmations entry for this territory = this regent confirmed individually.
    // Both are needed for the badge branch: cycleConfirmed && myConfirmation.
    const CYCLE_CONFIRMED = {
      ...CYCLE_ACTIVE,
      _id: 'cycle-645c',
      feeding_rights_confirmed: true,
      regent_confirmations: [{
        territory_id: 'terr-645',
        confirmed_by: 'char-645',
        confirmed_at: '2026-06-09T10:00:00Z',
        rights: [],
      }],
    };
    await setupRegent(page, { cycle: CYCLE_CONFIRMED });
    await openRegencyTab(page);

    // Confirm button should not be present (regent already confirmed).
    await expect(page.locator('#reg-confirm')).toHaveCount(0);
    // CTA banner should not be present (no pending action).
    await expect(page.locator('.reg-cta-banner')).toHaveCount(0);
    // Confirmed-badge should be visible.
    await expect(page.locator('.reg-confirmed-badge')).toBeVisible();
  });

});
