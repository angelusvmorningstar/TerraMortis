/**
 * Feature #599 — Vitae Tally shows "Herd (Flock) +n (+x)" when Flock contributes.
 *
 * The Vitae Tally is in the feeding entry's right panel (_renderFeedRightPanel).
 * herdVitae = domMeritContrib(char,'Herd') already includes the Flock bonus, so the
 * ST change is the label + the "(+x)" breakdown.
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: '123000599', username: 'test_st_599', global_name: 'Test ST 599',
  avatar: null, role: 'st', player_id: 'p-599', character_ids: [], is_dual_role: false,
};

function mkChar(id, name, merits) {
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
    disciplines: {}, merits, powers: [], ordeals: [],
  };
}

const HERD = { category: 'domain', name: 'Herd', rating: 2, cp: 2, dots: 2 };
const FLOCK = { category: 'general', name: 'Flock', rating: 3, cp: 3, dots: 3 };

const TEST_CYCLE = { _id: 'cycle-599', cycle_number: 3, status: 'active', confirmed_ambience: {}, narrative_notes: '' };
const TITLE = 'Hunt the Night';

function sub(charId, charName) {
  return {
    _id: `sub-${charId}`,
    cycle_id: 'cycle-599',
    character_name: charName,
    character_id: charId,
    player_name: 'P',
    submitted_at: '2026-06-05T00:00:00Z',
    _raw: {
      projects: [{ action_type: 'investigate', title: TITLE, desired_outcome: TITLE, detail: 'Scour.', primary_pool: { expression: 'Wits 3 = 3' } }],
      feeding: { method: 'predator', territory: '', violence: 'kiss' },
      sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: { project_1_action: 'investigate', project_1_title: TITLE, project_1_description: 'Scour.', _feed_method: 'predator' },
    projects_resolved: [], feeding_review: null, merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

async function setup(page, char) {
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
    if (url.includes('/api/downtime_submissions')) return ok([sub(char._id, char.name)]);
    if (url.includes('/api/downtime_cycles'))      return ok([TEST_CYCLE]);
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
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
}

// The Vitae Tally Herd row.
const herdRow = (page) =>
  page.locator('.proc-action-detail .proc-mod-row', { hasText: 'Herd' }).first();

test.describe('Feature #599 — Flock Herd in the Vitae Tally', () => {

  test('Flock character shows "Herd (Flock)" with the (+x) portion', async ({ page }) => {
    await setup(page, mkChar('char-flock', 'Flock Haver', [HERD, FLOCK]));
    await openFeeding(page);
    await expect(herdRow(page)).toContainText('Herd (Flock)');
    await expect(herdRow(page)).toContainText('(+3)');
  });

  test('character without Flock shows plain "Herd", no "(Flock)"', async ({ page }) => {
    await setup(page, mkChar('char-noflock', 'No Flock', [HERD]));
    await openFeeding(page);
    await expect(herdRow(page)).toContainText('Herd');
    await expect(herdRow(page)).not.toContainText('(Flock)');
    await expect(herdRow(page)).not.toContainText('(+');
  });

  // QA top-up (AC3): Flock pushes Herd over the +5 cap — total is the real number,
  // not clamped. Herd 5 + Flock 3 = 8.
  test('Flock over the +5 cap shows the real total (+8), not clamped', async ({ page }) => {
    const HERD5 = { category: 'domain', name: 'Herd', rating: 5, cp: 5, dots: 5 };
    await setup(page, mkChar('char-overcap', 'Over Cap', [HERD5, FLOCK]));
    await openFeeding(page);
    await expect(herdRow(page)).toContainText('Herd (Flock)');
    await expect(herdRow(page)).toContainText('+8 (+3)');
  });

});
