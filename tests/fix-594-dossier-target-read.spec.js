/**
 * Fix #594 — DT "This Cycle" dossier should read the target override-aware.
 *
 * Sibling of #586: the picker pre-populates from the player's submitted target
 * (entry.targetCharKeys) without writing rev, but the dossier
 * (_renderSnapshotTargetIntel) read rev.investigate_target_char only — so it showed
 * "Target not set" while the picker showed the target. Fix: seed override-aware,
 * mirroring #586 (rev value wins once touched, incl. a clear to null).
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: '123000594', username: 'test_st_594', global_name: 'Test ST 594',
  avatar: null, role: 'st', player_id: 'p-594', character_ids: [], is_dual_role: false,
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
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  };
}

const EINAR = mkChar('char-einar', 'Einar Test');
const RYAN  = mkChar('char-ryan',  'Ryan Ambrose');
const ALL_CHARS = [EINAR, RYAN];

const TEST_CYCLE = { _id: 'cycle-594', cycle_number: 3, status: 'active', confirmed_ambience: {}, narrative_notes: '' };
const TITLE = 'Hunting the Hunter';

function investigateSub({ projectsResolved = [] } = {}) {
  return {
    _id: 'sub-594',
    chapter_id: 'cycle-594',
    character_name: 'Einar Test',
    character_id: 'char-einar',
    player_name: 'P',
    submitted_at: '2026-06-05T00:00:00Z',
    _raw: {
      projects: [{ action_type: 'investigate', title: TITLE, desired_outcome: TITLE, detail: 'Scour the Harbour.', primary_pool: { expression: 'Wits 3 + Investigation 3 = 6' } }],
      feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action: 'investigate',
      project_1_title: TITLE,
      project_1_description: 'Scour the Harbour.',
      project_1_target_type: 'character',
      project_1_target_value: 'char-ryan',
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

async function openInvestigate(page) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-action-row', { hasText: TITLE }).first().click();
  await page.waitForSelector('.proc-action-detail .proc-snapshot-panel', { timeout: 8000 });
}

const snapshot = (page) => page.locator('.proc-action-detail .proc-snapshot-panel').first();

test.describe('Fix #594 — dossier target read', () => {

  test('player-seeded target shows in the dossier (no "Target not set")', async ({ page }) => {
    await setup(page, [investigateSub()]); // player target = Ryan, ST untouched
    await openInvestigate(page);
    await expect(snapshot(page)).toContainText('Target: Ryan Ambrose');
    await expect(snapshot(page).locator('.proc-snap-ti-unset')).toHaveCount(0);
  });

  test('ST clear wins — dossier shows "Target not set"', async ({ page }) => {
    await setup(page, [investigateSub({ projectsResolved: [{ investigate_target_char: null }] })]);
    await openInvestigate(page);
    await expect(snapshot(page).locator('.proc-snap-ti-unset')).toHaveCount(1);
    await expect(snapshot(page)).not.toContainText('Target: Ryan Ambrose');
  });

  // QA top-up: the dossier handles BOTH investigate and attack — cover attack too.
  test('attack: player-seeded target shows in the dossier', async ({ page }) => {
    const attackSub = {
      _id: 'sub-594-atk', chapter_id: 'cycle-594',
      character_name: 'Einar Test', character_id: 'char-einar', player_name: 'P',
      submitted_at: '2026-06-05T00:00:00Z',
      _raw: { projects: [{ action_type: 'attack', title: 'Ambush', desired_outcome: 'Ambush', detail: 'Strike.', primary_pool: { expression: 'Strength 2 + Brawl 2 = 4' } }], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
      responses: { project_1_action: 'attack', project_1_title: 'Ambush', project_1_description: 'Strike.', project_1_target_type: 'character', project_1_target_value: 'char-ryan' },
      projects_resolved: [], feeding_review: null, merit_actions_resolved: [], st_review: { territory_overrides: {} },
    };
    await setup(page, [attackSub]);
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });
    await page.locator('.proc-action-row', { hasText: 'Ambush' }).first().click();
    await page.waitForSelector('.proc-action-detail .proc-snapshot-panel', { timeout: 8000 });
    await expect(snapshot(page)).toContainText('Target: Ryan Ambrose');
    await expect(snapshot(page).locator('.proc-snap-ti-unset')).toHaveCount(0);
  });

});
