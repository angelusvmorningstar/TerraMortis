/**
 * Feature #589 — flow player Connected Characters to the ST side (project actions).
 *
 * The player picks connected characters on a Project action -> stored as
 * responses.project_N_connected_chars (JSON array of _ids). buildProcessingQueue
 * maps them to sortName keys (entry.connectedCharKeys) and the ST Connected
 * Characters typeahead seeds from them override-aware (#586 pattern).
 *
 * These cover the ST-seed half (Tasks 2+3). The player-capture widget (Task 1) is
 * exercised by the form harness separately.
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: '123000589', username: 'test_st_589', global_name: 'Test ST 589',
  avatar: null, role: 'st', player_id: 'p-589', character_ids: [], is_dual_role: false,
};

function mkChar(id, name) {
  return {
    _id: id, name, moniker: null, honorific: null,
    clan: 'Gangrel', covenant: 'Invictus', player: 'P', blood_potency: 2,
    humanity: 6, humanity_base: 7, court_title: null, retired: false,
    status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
    attributes: {
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: { Investigation: { dots: 3, bonus: 0, specs: [], nine_again: false } },
    disciplines: {}, merits: [], powers: [], ordeals: [],
  };
}

const EINAR = mkChar('char-einar', 'Einar Test');   // the submitting character
const RYAN  = mkChar('char-ryan',  'Ryan Ambrose');
const EVE   = mkChar('char-eve',   'Eve Test');
const RETIRED = mkChar('char-retired', 'Old Ghost'); RETIRED.retired = true;
const ALL_CHARS = [EINAR, RYAN, EVE, RETIRED];

const TEST_CYCLE = { _id: 'cycle-589', cycle_number: 3, status: 'active', confirmed_ambience: {}, narrative_notes: '' };
const TITLE = 'Hunting the Hunter';

// Project investigate action, parameterised by the player connected-chars value and ST review.
function projectSub({ connected = '["char-ryan"]', projectsResolved = [] } = {}) {
  return {
    _id: 'sub-589',
    chapter_id: 'cycle-589',
    character_name: 'Einar Test',
    character_id: 'char-einar',
    player_name: 'P',
    submitted_at: '2026-06-05T00:00:00Z',
    _raw: {
      projects: [{ action_type: 'investigate', title: TITLE, desired_outcome: TITLE, detail: 'Scour.', primary_pool: { expression: 'Wits 3 + Investigation 3 = 6' } }],
      feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action: 'investigate',
      project_1_title: TITLE,
      project_1_description: 'Scour.',
      project_1_connected_chars: connected,
      project_1_pool_expr: 'Wits 3 + Investigation 3 = 6',
    },
    projects_resolved: projectsResolved,
    feeding_review: null, merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

async function setup(page, submissions) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/chapters'))      return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))     return ok(ALL_CHARS.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))           return ok(ALL_CHARS);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openAction(page) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-action-row', { hasText: TITLE }).first().click();
  await page.waitForSelector('.proc-action-detail .proc-targeting-group', { timeout: 8000 });
}

const connChip = (page) =>
  page.locator('.proc-action-detail .proc-conn-typeahead[data-ta-save="connected_chars"] .proc-conn-chip');

test.describe('Feature #589 — connected characters flow to ST', () => {

  test('player connected character seeds the ST box', async ({ page }) => {
    await setup(page, [projectSub()]); // player connected = Ryan, ST untouched
    await openAction(page);
    await expect(connChip(page)).toHaveCount(1);
    await expect(connChip(page)).toContainText('Ryan Ambrose');
  });

  test('ST clear wins — player value is NOT re-seeded', async ({ page }) => {
    await setup(page, [projectSub({ projectsResolved: [{ connected_chars: [] }] })]);
    await openAction(page);
    await expect(connChip(page)).toHaveCount(0);
  });

  test('ST set wins — shows ST connected, not player value', async ({ page }) => {
    await setup(page, [projectSub({ projectsResolved: [{ connected_chars: ['eve test'] }] })]);
    await openAction(page);
    await expect(connChip(page)).toHaveCount(1);
    await expect(connChip(page)).toContainText('Eve Test');
    await expect(connChip(page)).not.toContainText('Ryan Ambrose');
  });

  test('unresolved id degrades gracefully (no chip, no crash)', async ({ page }) => {
    await setup(page, [projectSub({ connected: '["char-ghost"]' })]);
    await openAction(page);
    await expect(page.locator('.proc-action-detail .proc-targeting-group').first()).toBeVisible();
    await expect(connChip(page)).toHaveCount(0);
  });

  test('retired character is not seeded (no chip)', async ({ page }) => {
    await setup(page, [projectSub({ connected: '["char-retired"]' })]);
    await openAction(page);
    await expect(connChip(page)).toHaveCount(0);
  });

  test('multiple connected characters all seed', async ({ page }) => {
    await setup(page, [projectSub({ connected: '["char-ryan","char-eve"]' })]);
    await openAction(page);
    await expect(connChip(page)).toHaveCount(2);
  });

});
