/**
 * Regression tests for fix #713 — allies merit actions absent from DT processing queue.
 *
 * Root cause (two-part):
 *   A. collectResponses() in downtime-form.js gated sphere_N_merit on a merit-toggle
 *      'yes'/'no' radio that was removed when the tabbed sphere UI shipped. The gate
 *      was never 'yes', so sphere_N_merit was never written. All DT4 Allies submissions
 *      have sphere_N_action set but sphere_N_merit absent.
 *   B. buildProcessingQueue() in downtime-views.js required sphere_N_merit to be
 *      non-empty; if absent, the entry was skipped entirely.
 *
 * Fix A: collectResponses() writes sphere_N_merit when action is set (mirrors Status).
 * Fix B: buildProcessingQueue() derives merit label from character's N-th Allies merit
 *        when sphere_N_merit is missing, so existing DT4 submissions surface correctly.
 *
 * AC-1: DT4 submission (sphere_N_action set, sphere_N_merit absent) → action row appears in queue
 * AC-2: Source filter "Allies" returns non-zero results for the above
 * AC-3: Action row text contains the derived merit qualifier ("Criminal")
 * AC-4: DT3 regression — submission with explicit sphere_N_merit in responses still works
 * AC-5: DT3 regression — Source filter "Allies" still works when merit label is present
 * AC-6: No regression — contacts/retainers unaffected; their entries still render
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000713', username: 'test_st_713', global_name: 'Test ST 713',
  avatar: null, role: 'st', player_id: 'p-713', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-713', cycle_number: 4, status: 'active',
  phase_signoff: {}, confirmed_ambience: {},
};

// Character with Allies ●●● (Criminal) and Contacts ● (Media) — covers both merits.
const CHAR = {
  _id: 'char-713',
  name: 'Allies Test Char', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  home_territory: null, retired: false,
  status: { city: 1, clan: 1, covenant: { Invictus: 1 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {},
  merits: [
    { name: 'Allies',   category: 'influence', rating: 3, area: 'Criminal' },
    { name: 'Contacts', category: 'influence', rating: 1, area: 'Media'    },
  ],
  powers: [], ordeals: [],
};

function baseSub(id) {
  return {
    _id: id,
    cycle_id: 'cycle-713',
    character_id: 'char-713',
    character_name: 'Allies Test Char',
    player_name: 'Test Player',
    status: 'submitted',
    submitted_at: '2026-06-12T00:00:00Z',
    _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {},
    projects_resolved: [],
    merit_actions_resolved: [],
    acquisitions_resolved: [],
    feeding_review: { pool_status: 'no_feed' },
    st_review: { territory_overrides: {} },
    st_narrative: { story_moment: { status: 'complete' } },
  };
}

// ── AC-1/2/3: DT4 pattern — action set, merit label absent (the bug scenario) ──
const SUB_DT4_NO_MERIT_LABEL = {
  ...baseSub('sub-713-dt4-no-label'),
  responses: {
    // sphere_1_merit is intentionally absent — this is the DT4 bug shape
    sphere_1_action:  'investigate',
    sphere_1_outcome: 'Investigate rivals in the docks',
  },
};

// ── AC-4/5: DT3 regression — merit label present in responses (old shape) ──
const SUB_DT3_WITH_MERIT_LABEL = {
  ...baseSub('sub-713-dt3-with-label'),
  responses: {
    sphere_1_merit:   'Allies ●●● (Criminal)',
    sphere_1_action:  'investigate',
    sphere_1_outcome: 'Investigate rivals in the docks',
  },
};

// ── AC-6: Combined — Allies + Contacts, DT4 pattern ──
const SUB_DT4_ALLIES_AND_CONTACTS = {
  ...baseSub('sub-713-dt4-combo'),
  responses: {
    // Allies: no merit label (DT4 bug shape)
    sphere_1_action:   'hide_protect',
    sphere_1_outcome:  'Shield criminal network',
    // Contacts: present as expected
    contact_1_request: 'Who is watching the harbour?',
    contact_1_merit:   'Contacts ● (Media)',
  },
};

// ── Setup ──────────────────────────────────────────────────────────────────────

async function setup(page, submissions) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url    = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (['PUT', 'PATCH', 'POST'].includes(method)) return ok({ ok: true });

    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/downtime_cycles'))      return ok([ACTIVE_CYCLE]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR._id, name: CHAR.name, moniker: CHAR.moniker, honorific: CHAR.honorific }]);
    if (url.includes('/api/characters'))           return ok([CHAR]);
    if (url.includes('/api/territories'))          return ok([]);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    if (url.includes('/api/st_mods'))              return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('fix.713: allies sphere actions absent from queue and filter', () => {

  // AC-1 ────────────────────────────────────────────────────────────────────────

  test('AC-1: DT4 submission (no sphere_N_merit) — Allies action row appears in queue', async ({ page }) => {
    await setup(page, [SUB_DT4_NO_MERIT_LABEL]);
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });

    const rows = page.locator('.proc-action-row');
    await expect(rows).not.toHaveCount(0);

    // At least one row should relate to Allies
    const rowTexts = await rows.allTextContents();
    const hasAllies = rowTexts.some(t => /allies/i.test(t));
    expect(hasAllies).toBe(true);
  });

  // AC-2 ────────────────────────────────────────────────────────────────────────

  test('AC-2: Source filter "Allies" returns non-zero results for DT4 submission', async ({ page }) => {
    await setup(page, [SUB_DT4_NO_MERIT_LABEL]);
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });

    // Click the Allies source filter pill
    const alliesPill = page.locator('.proc-filter-pill[data-filter-dim="sources"][data-filter-val="allies"]');
    await expect(alliesPill).toBeVisible({ timeout: 5000 });
    await alliesPill.click();
    await page.waitForTimeout(300);

    // Queue must not be empty after filtering
    const rows = page.locator('.proc-action-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  // AC-3 ────────────────────────────────────────────────────────────────────────

  test('AC-3: Action row text contains the derived merit qualifier ("Criminal")', async ({ page }) => {
    await setup(page, [SUB_DT4_NO_MERIT_LABEL]);
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });

    // The processing label is built as "Allies ●●● (Criminal): Investigate"
    const alliesRow = page.locator('.proc-action-row', { hasText: 'Criminal' });
    await expect(alliesRow).toBeVisible({ timeout: 5000 });
  });

  // AC-4 ────────────────────────────────────────────────────────────────────────

  test('AC-4: DT3 regression — explicit sphere_N_merit in responses still surfaces correctly', async ({ page }) => {
    await setup(page, [SUB_DT3_WITH_MERIT_LABEL]);
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });

    const rows = page.locator('.proc-action-row');
    const rowTexts = await rows.allTextContents();
    const hasAllies = rowTexts.some(t => /allies/i.test(t));
    expect(hasAllies).toBe(true);
  });

  // AC-5 ────────────────────────────────────────────────────────────────────────

  test('AC-5: DT3 regression — Source filter "Allies" still works when merit label present', async ({ page }) => {
    await setup(page, [SUB_DT3_WITH_MERIT_LABEL]);
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });

    const alliesPill = page.locator('.proc-filter-pill[data-filter-dim="sources"][data-filter-val="allies"]');
    await expect(alliesPill).toBeVisible({ timeout: 5000 });
    await alliesPill.click();
    await page.waitForTimeout(300);

    const count = await page.locator('.proc-action-row').count();
    expect(count).toBeGreaterThan(0);
  });

  // AC-6 ────────────────────────────────────────────────────────────────────────

  test('AC-6: Contacts entry still renders when Allies is present (no regression)', async ({ page }) => {
    await setup(page, [SUB_DT4_ALLIES_AND_CONTACTS]);
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });

    // Filter to Contacts source
    const contactsPill = page.locator('.proc-filter-pill[data-filter-dim="sources"][data-filter-val="contacts"]');
    await expect(contactsPill).toBeVisible({ timeout: 5000 });
    await contactsPill.click();
    await page.waitForTimeout(300);

    const count = await page.locator('.proc-action-row').count();
    expect(count).toBeGreaterThan(0);
  });

});
