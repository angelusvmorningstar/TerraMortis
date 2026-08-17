/**
 * Feature #590 — a confirmed dice pool names the active specialisation.
 *
 * The .proc-pool-total initial render now augments with rev.active_feed_specs via
 * _augmentPoolWithSpecs, and that helper qualifies cross-skill (Interdisciplinary)
 * specs with their source skill: "Coward Punch (Stealth)".
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: '123000590', username: 'test_st_590', global_name: 'Test ST 590',
  avatar: null, role: 'st', player_id: 'p-590', character_ids: [], is_dual_role: false,
};

function mkChar(specs) {
  return {
    _id: 'char-590', name: 'Spec Haver', moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Invictus', player: 'P', blood_potency: 2,
    humanity: 6, humanity_base: 7, court_title: null, retired: false,
    status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
    attributes: {
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    // Stealth carries the "Coward Punch" spec; the Interdisciplinary merit makes it
    // usable cross-skill (so isSpecs yields { spec: 'Coward Punch', fromSkill: 'Stealth' }).
    skills: { Stealth: { dots: 2, bonus: 0, specs: specs, nine_again: false }, Investigation: { dots: 3, bonus: 0, specs: [], nine_again: false } },
    disciplines: {},
    merits: [{ name: 'Interdisciplinary Specialty', qualifier: 'Coward Punch', category: 'general', rating: 1 }],
    powers: [], ordeals: [],
  };
}

const TEST_CYCLE = { _id: 'cycle-590', cycle_number: 3, status: 'active', confirmed_ambience: {}, narrative_notes: '' };
const TITLE = 'Night Work';

function sub(activeFeedSpecs) {
  return {
    _id: 'sub-590',
    chapter_id: 'cycle-590',
    character_name: 'Spec Haver',
    character_id: 'char-590',
    player_name: 'P',
    submitted_at: '2026-06-05T00:00:00Z',
    _raw: {
      projects: [{ action_type: 'investigate', title: TITLE, desired_outcome: TITLE, detail: 'Scour.', primary_pool: { expression: 'Wits 3 + Investigation 3 = 6' } }],
      feeding: { method: 'predator', territory: '', violence: 'kiss' },
      sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: { project_1_action: 'investigate', project_1_title: TITLE, _feed_method: 'predator' },
    projects_resolved: [],
    feeding_review: {
      pool_player: 'Wits + Stealth',
      pool_validated: 'Wits 3 + Stealth 2 = 5',
      pool_status: 'confirmed',
      active_feed_specs: activeFeedSpecs,
      pool_mod_spec: activeFeedSpecs.length,
      roll_mode: 'player',
      notes_thread: [],
      story_context: '',
    },
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

async function setup(page, char, submission) {
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
    if (url.includes('/api/downtime_submissions')) return ok([submission]);
    if (url.includes('/api/chapters'))      return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: char._id, name: char.name, moniker: char.moniker, honorific: char.honorific }]);
    if (url.includes('/api/characters'))           return ok([char]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openFeeding(page) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-action-row', { hasText: 'Feeding' }).first().click();
  await page.waitForSelector('.proc-action-detail .proc-pool-total', { timeout: 8000 });
}

const poolTotal = (page) => page.locator('.proc-action-detail .proc-pool-total').first();

test.describe('Feature #590 — confirmed pool names the specialisation', () => {

  test('confirmed pool with a cross-skill spec shows "Coward Punch (Stealth)"', async ({ page }) => {
    await setup(page, mkChar(['Coward Punch']), sub(['Coward Punch']));
    await openFeeding(page);
    await expect(poolTotal(page)).toContainText('Coward Punch (Stealth)');
  });

  test('confirmed pool with no active spec is unchanged (no spec suffix)', async ({ page }) => {
    await setup(page, mkChar(['Coward Punch']), sub([]));
    await openFeeding(page);
    await expect(poolTotal(page)).not.toContainText('Coward Punch');
  });

  // QA top-up (AC2): a native spec (not an Interdisciplinary cross-skill one) shows
  // just its name, with NO "(Skill)" qualifier. Here 'Shadowing' is native (in
  // Stealth.specs) but the Interdisciplinary merit qualifies 'Coward Punch' only.
  test('native spec shows just the name, no skill qualifier', async ({ page }) => {
    await setup(page, mkChar(['Shadowing']), sub(['Shadowing']));
    await openFeeding(page);
    await expect(poolTotal(page)).toContainText('Shadowing');
    await expect(poolTotal(page)).not.toContainText('Shadowing (');
  });

});
