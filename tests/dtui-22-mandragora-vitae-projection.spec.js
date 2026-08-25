/**
 * E2E coverage for dtui-22 (Epic DTUI, Wave 4): Mandragora Garden checkbox
 * visibility + Vitae Projection Mandragora contribution calculation.
 *
 * Implements FR5/FR6 (specs/epic-dtui-downtime-form-ux-refactor.md):
 *   FR5 — "Park in Mandragora Garden" checkbox (Blood Sorcery section) is
 *         shown only for characters with EFFECTIVE Mandragora Garden dots
 *         >= 1, not merely for characters who own the merit entry.
 *   FR6 — the Vitae Projection panel's Mandragora Garden contribution
 *         (Blood Fruit line) uses the same effectiveDomainDots() calculation
 *         as the Blood Sorcery section's checkbox/capacity gate, so the two
 *         surfaces never disagree about a character's Mandragora dots.
 *
 * Technique: mounts the form module in a sandbox overlay via page.evaluate,
 * same approach as dt-form-37-sorcery-targets-stringify.spec.js and
 * dt-vitae-projection.spec.js (both of which this story's own Context
 * section cites as the closest existing precedent for the two sections
 * under test here).
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-002',
  character_ids: ['char-dtui22'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-dtui22', status: 'active', label: 'Test Cycle DTUI-22',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-08-25T00:00:00.000Z',
};

// A character with Cruac (Blood Sorcery) so the Blood Sorcery section gates
// open (DOWNTIME_SECTIONS' blood_sorcery entry gates on has_sorcery, which
// downtime-form.js derives from discDots(c, 'Cruac') > 0). powers entries
// MUST carry category: 'rite' — the form filters knownRites on this field.
function buildChar(overrides = {}) {
  return {
    _id: 'char-dtui22', name: 'Garden Tester', moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Test Player',
    blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: {
      city: 0, clan: 0,
      covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
    },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {
      Occult: { dots: 3, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: { Cruac: { dots: 2 } },
    merits: [],
    powers: [
      { name: 'Blight', category: 'rite', tradition: 'Cruac', level: 1 },
    ],
    ordeals: [],
    ...overrides,
  };
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function setupSuite(page, char, existingSubmission = null) {
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
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
  );
  await page.route('**/api/characters/names', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: char._id, name: char.name }]) })
  );
  await page.route('**/api/chapters', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) })
  );
  // Same pattern as dt-form-37-sorcery-targets-stringify.spec.js: return the
  // supplied existing submission (if any) as this character's prior
  // downtime response document, so a test can pre-seed saved sorcery/mandragora
  // state without driving the form UI to create it.
  await page.route(/\/api\/downtime_submissions/, r => {
    const list = existingSubmission ? [existingSubmission] : [];
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) });
  });

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function openDowntimeForm(page, char) {
  await page.evaluate(async (c) => {
    const sandbox = document.createElement('div');
    sandbox.id = 'dt-sandbox';
    sandbox.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#1a1208;z-index:99999;overflow:auto;';
    document.body.appendChild(sandbox);
    const mod = await import('/js/tabs/downtime-form.js');
    await mod.renderDowntimeTab(sandbox, c, []);
  }, char);
  await page.waitForSelector('#dt-sandbox #dt-btn-submit', { timeout: 10000 });
}

// The Blood Sorcery section only renders in ADVANCED mode (it is not in
// downtime-form.js's MINIMAL_SECTIONS set); switch before expanding it.
async function switchToAdvanced(page) {
  await page.locator('#dt-sandbox [data-dt-mode="advanced"]').click();
  await page.waitForSelector('#dt-sandbox #dt-btn-submit-final', { timeout: 5000 });
}

// Expand the Blood Sorcery section. All qf-sections start collapsed.
async function expandSorcerySection(page) {
  await page.locator('#dt-sandbox .qf-section[data-section-key="blood_sorcery"] .qf-section-title').click();
  await expect(page.locator('#dt-sandbox .qf-section[data-section-key="blood_sorcery"]')).not.toHaveClass(/collapsed/);
}

// Expand the Feeding section (houses the Vitae Projection container).
async function expandFeedingSection(page) {
  await page.locator('#dt-sandbox .qf-section[data-section-key="feeding"] .qf-section-title').click();
  await expect(page.locator('#dt-sandbox .qf-section[data-section-key="feeding"]')).not.toHaveClass(/collapsed/);
}

const sb = (page) => page.locator('#dt-sandbox');

// ── AC1/AC2 — checkbox visibility gate ─────────────────────────────────────────

test.describe('dtui-22 FR5: Mandragora Garden checkbox visibility', () => {
  test('AC2: no Mandragora Garden merit — checkbox and "+3 dice" notice both absent', async ({ page }) => {
    const char = buildChar({ merits: [] });
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandSorcerySection(page);

    await expect(sb(page).locator('#dt-sorcery_1_mandragora')).toHaveCount(0);
    await expect(sb(page).locator('.qf-section[data-section-key="blood_sorcery"]')).not.toContainText('Mandragora Garden grants +3 dice');
    await expect(sb(page).locator('.qf-section[data-section-key="blood_sorcery"]')).not.toContainText('Garden capacity');
  });

  test('AC1: Mandragora Garden with effective dots >= 1 — checkbox and "+3 dice" notice both visible', async ({ page }) => {
    const char = buildChar({
      merits: [{ category: 'domain', name: 'Mandragora Garden', cp: 2, xp: 0 }],
    });
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandSorcerySection(page);

    await expect(sb(page).locator('#dt-sorcery_1_mandragora')).toHaveCount(1);
    await expect(sb(page).locator('.qf-section[data-section-key="blood_sorcery"]')).toContainText('Mandragora Garden grants +3 dice');
    await expect(sb(page).locator('.qf-section[data-section-key="blood_sorcery"]')).toContainText('Garden capacity: 0 / 2');
  });

  test('regression: Mandragora Garden merit present but 0 effective dots — checkbox and "+3 dice" notice both hidden', async ({ page }) => {
    // Before dtui-22, this exact shape (a Mandragora Garden merit entry with
    // no dots actually allocated) would still show the checkbox and the
    // "+3 dice" notice, because the old gate only checked whether the merit
    // NAME existed in c.merits, not how many dots it carried. This is the
    // regression this story's own fix (effectiveDomainDots() gate) prevents.
    const char = buildChar({
      merits: [{ category: 'domain', name: 'Mandragora Garden', cp: 0, xp: 0 }],
    });
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandSorcerySection(page);

    await expect(sb(page).locator('#dt-sorcery_1_mandragora')).toHaveCount(0);
    await expect(sb(page).locator('.qf-section[data-section-key="blood_sorcery"]')).not.toContainText('Mandragora Garden grants +3 dice');
    await expect(sb(page).locator('.qf-section[data-section-key="blood_sorcery"]')).not.toContainText('Garden capacity');
  });
});

// ── FR6 — Vitae Projection Mandragora consistency ──────────────────────────────

test.describe('dtui-22 FR6: Vitae Projection Mandragora Garden contribution', () => {
  test('effective dots >= 1: Blood Fruit line shows the same dot count the checkbox gate uses', async ({ page }) => {
    const char = buildChar({
      merits: [{ category: 'domain', name: 'Mandragora Garden', cp: 2, xp: 0 }],
    });
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);

    // Confirm the Blood Sorcery gate is open (checkbox visible) for this char.
    await expandSorcerySection(page);
    await expect(sb(page).locator('#dt-sorcery_1_mandragora')).toHaveCount(1);

    // Now confirm the Vitae Projection panel reports the matching dot count.
    await expandFeedingSection(page);
    const budget = sb(page).locator('.dt-vitae-budget');
    const mandCostRow = budget.locator('.dt-vitae-cost', { hasText: 'Mandragora Garden' });
    await expect(mandCostRow).toHaveCount(0); // dtlt-10: no vitae cost, ever
    const fruitRow = budget.locator('.dt-vitae-note', { hasText: 'Blood Fruit produced' });
    await expect(fruitRow).toBeVisible();
    await expect(fruitRow.locator('span').last()).toHaveText('2');
  });

  test('0 effective dots (merit present, no dots allocated): Blood Fruit line does not render, matching the hidden checkbox', async ({ page }) => {
    const char = buildChar({
      merits: [{ category: 'domain', name: 'Mandragora Garden', cp: 0, xp: 0 }],
    });
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);

    await expandSorcerySection(page);
    await expect(sb(page).locator('#dt-sorcery_1_mandragora')).toHaveCount(0);

    await expandFeedingSection(page);
    const budget = sb(page).locator('.dt-vitae-budget');
    // Codex review (Medium, Pass 1): assert the budget panel itself actually
    // rendered before asserting the Blood Fruit note's absence within it —
    // otherwise a totally broken Vitae Projection render (e.g. a JS
    // exception during that container's own build) would make the "absent"
    // assertion below pass for the wrong reason.
    await expect(budget).toBeVisible();
    const fruitRow = budget.locator('.dt-vitae-note', { hasText: 'Blood Fruit produced' });
    await expect(fruitRow).toHaveCount(0);
  });
});

// ── Codex review regression: orphaned parked rite ──────────────────────────────

test.describe('dtui-22 regression (Codex Pass 2/3a): orphaned Mandragora-parked rite', () => {
  test('a rite parked while the garden had capacity stays visible and untick-able after effective dots fall to zero', async ({ page }) => {
    // Before this patch, once effective Mandragora Garden dots dropped to 0
    // (e.g. an ST edit revoked the dots after the player had already parked
    // a rite), the "Park in Mandragora Garden" checkbox for that ALREADY-
    // parked slot simply stopped rendering (hasMandragora gates the whole
    // checkbox). collectResponses() preserves the prior 'yes' when no
    // checkbox element exists in the DOM (downtime-form.js's
    // `sorcery_N_mandragora` branch), so the parked state became permanently
    // stuck: unrepresentable in the UI, but still mechanically active
    // (still skipping that rite's Vitae cost in the projection below).
    const char = buildChar({
      merits: [{ category: 'domain', name: 'Mandragora Garden', cp: 0, xp: 0 }],
    });
    const existingSubmission = {
      _id: 'sub-dtui22-orphan',
      chapter_id: ACTIVE_CYCLE._id,
      character_id: char._id,
      status: 'submitted',
      responses: {
        _mode: 'advanced',
        sorcery_slot_count: '1',
        sorcery_1_rite: 'Blight',
        sorcery_1_mandragora: 'yes',
      },
    };
    await setupSuite(page, char, existingSubmission);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandSorcerySection(page);

    // The checkbox must still be present (not hidden by the now-false
    // hasMandragora gate) BECAUSE this slot already has a saved 'yes'...
    const cb = sb(page).locator('#dt-sorcery_1_mandragora');
    await expect(cb).toHaveCount(1);
    // ...rendered checked (reflecting the preserved prior state)...
    await expect(cb).toBeChecked();
    // ...and NOT disabled, so the player can untick it to release the stale park.
    await expect(cb).toBeEnabled();
    // The explanatory title lives on the wrapping <label>, not the <input>.
    await expect(sb(page).locator('label.dt-mand-label')).toHaveAttribute('title', /no longer has capacity/i);

    // The section-level "+3 dice"/capacity notices stay hidden — the garden
    // itself has no current capacity; only this one stale slot is exposed.
    await expect(sb(page).locator('.qf-section[data-section-key="blood_sorcery"]')).not.toContainText('Mandragora Garden grants +3 dice');

    // Unticking must actually work: collectResponses() reads the live
    // checkbox state once it exists (rather than falling back to the
    // preserved prior value), so after the click sorcery_1_mandragora
    // becomes 'no' and mandSaved is now false too. With hasMandragora
    // already false (0 effective dots) and mandSaved now also false, this
    // slot's checkbox correctly stops rendering on the resulting re-render
    // — a plain .click() (not .uncheck(), which would wait forever for a
    // post-click "unchecked" state on an element that no longer exists).
    await cb.click();
    await expect(sb(page).locator('#dt-sorcery_1_mandragora')).toHaveCount(0);
  });
});
