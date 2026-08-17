/**
 * Fix #586 — DT Processing target picker pre-populates from the player's submitted target.
 *
 * Player stores a character target as responses.project_${n}_target_type='character'
 * + project_${n}_target_value=<charId>. buildProcessingQueue resolves it to
 * entry.targetCharKeys (sortName keys). The investigate/attack/block pickers seed
 * from the player's target when the ST has not touched the rev field; ST value
 * (including a deliberate clear to null) wins once present in rev.
 *
 * AC1: investigate + player character target -> Target picker shows that character chip.
 * AC2: same throughline for attack and block (block previously rendered NO picker).
 * AC3: ST clear (rev.investigate_target_char = null) wins -> no chip re-seeded.
 *      ST set wins -> the ST's character shows, not the player's.
 * AC5: non-character (territory) target -> no chip, "Submitted target" line surfaces it.
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: '123000586', username: 'test_st_586', global_name: 'Test ST 586',
  avatar: null, role: 'st', player_id: 'p-586', character_ids: [], is_dual_role: false,
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
const EVE   = mkChar('char-eve',   'Eve Test');
const RETIRED = mkChar('char-retired', 'Old Ghost'); RETIRED.retired = true;
const ALL_CHARS = [EINAR, RYAN, EVE, RETIRED];

const TEST_CYCLE = { _id: 'cycle-586', cycle_number: 3, status: 'active', confirmed_ambience: {}, narrative_notes: '' };

// One project submission, parameterised by action type and target.
function projectSub({ action = 'investigate', title = 'Hunting the Hunter', targetType = 'character', targetValue = 'char-ryan', targetTerr = '', projectsResolved = [] } = {}) {
  return {
    _id: 'sub-586',
    chapter_id: 'cycle-586',
    character_name: 'Einar Test',
    character_id: 'char-einar',
    player_name: 'P',
    submitted_at: '2026-06-05T00:00:00Z',
    _raw: {
      projects: [{ action_type: action, title, desired_outcome: title, detail: 'Detail.', primary_pool: { expression: 'Wits 3 + Investigation 3 = 6' } }],
      feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action: action,
      project_1_title: title,
      project_1_description: 'Detail.',
      project_1_investigate_lead: 'A known lead.',
      project_1_target_type: targetType,
      project_1_target_value: targetValue,
      project_1_target_terr: targetTerr,
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

async function openAction(page, title) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-action-row', { hasText: title }).first().click();
  await page.waitForSelector('.proc-action-detail .proc-targeting-group', { timeout: 8000 });
}

// Chip scoped to a specific target typeahead by its save field (not Connected Characters).
const targetChip = (page, saveField) =>
  page.locator(`.proc-action-detail .proc-conn-typeahead[data-ta-save="${saveField}"] .proc-conn-chip`);

test.describe('Fix #586 — target pre-population', () => {

  test('investigate seeds the player character target', async ({ page }) => {
    await setup(page, [projectSub()]); // investigate, player target = Ryan, no ST review
    await openAction(page, 'Hunting the Hunter');
    await expect(targetChip(page, 'investigate_target_char')).toHaveCount(1);
    await expect(targetChip(page, 'investigate_target_char')).toContainText('Ryan Ambrose');
  });

  test('attack seeds the player character target', async ({ page }) => {
    await setup(page, [projectSub({ action: 'attack', title: 'Ambush' })]);
    await openAction(page, 'Ambush');
    await expect(targetChip(page, 'attack_target_char')).toHaveCount(1);
    await expect(targetChip(page, 'attack_target_char')).toContainText('Ryan Ambrose');
  });

  test('block seeds the player character target (picker newly added)', async ({ page }) => {
    await setup(page, [projectSub({ action: 'block', title: 'Stonewall' })]);
    await openAction(page, 'Stonewall');
    await expect(targetChip(page, 'block_target_char')).toHaveCount(1);
    await expect(targetChip(page, 'block_target_char')).toContainText('Ryan Ambrose');
  });

  test('ST clear wins — player target is NOT re-seeded', async ({ page }) => {
    await setup(page, [projectSub({ projectsResolved: [{ investigate_target_char: null }] })]);
    await openAction(page, 'Hunting the Hunter');
    await expect(targetChip(page, 'investigate_target_char')).toHaveCount(0);
  });

  test('ST set wins — shows ST target, not player target', async ({ page }) => {
    await setup(page, [projectSub({ projectsResolved: [{ investigate_target_char: 'eve test' }] })]);
    await openAction(page, 'Hunting the Hunter');
    await expect(targetChip(page, 'investigate_target_char')).toHaveCount(1);
    await expect(targetChip(page, 'investigate_target_char')).toContainText('Eve Test');
    await expect(targetChip(page, 'investigate_target_char')).not.toContainText('Ryan Ambrose');
  });

  test('non-character (territory) target surfaces read-only, no chip', async ({ page }) => {
    await setup(page, [projectSub({ targetType: 'territory', targetValue: '', targetTerr: 'The Harbour' })]);
    await openAction(page, 'Hunting the Hunter');
    await expect(targetChip(page, 'investigate_target_char')).toHaveCount(0);
    const group = page.locator('.proc-action-detail .proc-targeting-group').first();
    await expect(group).toContainText('Submitted target');
    await expect(group).toContainText('The Harbour');
  });

  // QA top-up (AC4 graceful degrade): an unresolvable character id (e.g. a deleted
  // character) must not crash the card and must produce no seeded chip.
  test('unresolved character id degrades gracefully (no chip, no crash)', async ({ page }) => {
    await setup(page, [projectSub({ targetValue: 'char-ghost' })]);
    await openAction(page, 'Hunting the Hunter'); // resolves only if the detail rendered
    await expect(page.locator('.proc-action-detail .proc-targeting-group').first()).toBeVisible();
    await expect(targetChip(page, 'investigate_target_char')).toHaveCount(0);
  });

  // QA top-up (AC4): a retired character target is skipped the same way (no chip).
  test('retired character target is not seeded (no chip)', async ({ page }) => {
    await setup(page, [projectSub({ targetValue: 'char-retired' })]);
    await openAction(page, 'Hunting the Hunter');
    await expect(targetChip(page, 'investigate_target_char')).toHaveCount(0);
  });

});
