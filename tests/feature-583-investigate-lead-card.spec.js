/**
 * Feature #583 — investigate lead on the DT Processing details card.
 *
 * The player DT form captures a mandatory "What is your lead on this investigation?"
 * field (responses.project_${n}_investigate_lead). It is already plumbed to the
 * processing queue entry as entry.projInvestigateLead (downtime-views.js:3109) but
 * was never drawn on the Details card. This adds a read-only Lead row between Title
 * and Description, gated to investigate actions.
 *
 * AC1: investigate project with a lead -> Details card shows a "Lead" row with the text.
 * AC2: Lead row only for investigate actions (a non-investigate action shows none).
 * Order: Title -> Lead -> Description.
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: '123000583', username: 'test_st_583', global_name: 'Test ST 583',
  avatar: null, role: 'st', player_id: 'p-583', character_ids: [], is_dual_role: false,
};

const CHAR = {
  _id: 'char-583', name: 'Einar Test', moniker: null, honorific: null,
  clan: 'Gangrel', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Investigation: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: { Auspex: { dots: 2 } }, merits: [], powers: [], ordeals: [],
};

const TEST_CYCLE = { _id: 'cycle-583', cycle_number: 3, status: 'active', confirmed_ambience: {}, narrative_notes: '' };

const LEAD_TEXT  = 'Ryan attacked a member of Einar coterie last month, a known starting point.';
const TITLE_TEXT = 'Hunting the Hunter';
const DESC_TEXT  = 'Einar will scour The Harbour district in raven form using Acute Senses.';

function investigateSub() {
  return {
    _id: 'sub-inv-583',
    cycle_id: 'cycle-583',
    character_name: 'Einar Test',
    character_id: 'char-583',
    player_name: 'Test Player',
    submitted_at: '2026-06-05T00:00:00Z',
    _raw: {
      projects: [{
        action_type: 'investigate',
        title: TITLE_TEXT,
        desired_outcome: TITLE_TEXT,
        detail: DESC_TEXT,
        primary_pool: { expression: 'Wits 3 + Investigation 3 = 6' },
      }],
      feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action: 'investigate',
      project_1_title: TITLE_TEXT,
      project_1_description: DESC_TEXT,
      project_1_investigate_lead: LEAD_TEXT,
      project_1_pool_expr: 'Wits 3 + Investigation 3 = 6',
    },
    projects_resolved: [], feeding_review: null, merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

// A non-investigate project (ambience) — must NOT show a Lead row.
function ambienceSub() {
  return {
    _id: 'sub-amb-583',
    cycle_id: 'cycle-583',
    character_name: 'Einar Test',
    character_id: 'char-583',
    player_name: 'Test Player',
    submitted_at: '2026-06-05T00:00:00Z',
    _raw: {
      projects: [{
        action_type: 'ambience_increase',
        title: 'Patrol',
        desired_outcome: 'Raise Harbour ambience',
        detail: 'Walk the district.',
        primary_pool: { expression: '' },
      }],
      feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action: 'ambience_increase',
      project_1_title: 'Patrol',
      project_1_description: 'Walk the district.',
      // Note: an investigate_lead key that should be IGNORED for a non-investigate action.
      project_1_investigate_lead: LEAD_TEXT,
    },
    projects_resolved: [], feeding_review: null, merit_actions_resolved: [],
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
    if (url.includes('/api/downtime_cycles'))      return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR._id, name: CHAR.name, moniker: CHAR.moniker, honorific: CHAR.honorific }]);
    if (url.includes('/api/characters'))           return ok([CHAR]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

// Open the specific action row by visible text (the queue also renders an
// auto-generated Feeding row, so .first() is not reliable).
async function openActionDetail(page, rowText) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  const row = page.locator('.proc-action-row', { hasText: rowText }).first();
  await row.click();
  await page.waitForSelector('.proc-action-detail .proc-feed-desc-view', { timeout: 8000 });
}

test.describe('Feature #583 — investigate lead on the Details card', () => {

  test('investigate action shows a Lead row with the player text', async ({ page }) => {
    await setup(page, [investigateSub()]);
    await openActionDetail(page, TITLE_TEXT);

    const view = page.locator('.proc-action-detail .proc-feed-desc-view').first();
    const leadField = view.locator('.proc-proj-field', { hasText: 'Lead' }).first();
    await expect(leadField).toBeVisible({ timeout: 5000 });
    await expect(leadField).toContainText(LEAD_TEXT);
  });

  test('Lead row sits between Title and Description', async ({ page }) => {
    await setup(page, [investigateSub()]);
    await openActionDetail(page, TITLE_TEXT);

    // Collect the field-label order in the view-mode details card.
    const labels = await page.locator('.proc-action-detail .proc-feed-desc-view .proc-proj-field .proc-feed-lbl')
      .allTextContents();
    const iTitle = labels.findIndex(l => l.trim() === 'Title');
    const iLead  = labels.findIndex(l => l.trim() === 'Lead');
    const iDesc  = labels.findIndex(l => l.trim() === 'Description');
    expect(iTitle).toBeGreaterThanOrEqual(0);
    expect(iLead).toBeGreaterThan(iTitle);
    expect(iDesc).toBeGreaterThan(iLead);
  });

  test('non-investigate action does NOT show a Lead row', async ({ page }) => {
    await setup(page, [ambienceSub()]);
    await openActionDetail(page, 'Patrol');

    const leadField = page.locator('.proc-action-detail .proc-feed-desc-view .proc-proj-field .proc-feed-lbl', { hasText: 'Lead' });
    await expect(leadField).toHaveCount(0);
  });

  // QA top-up (AC3 empty-state): a lead-only action (no title, no description) shows
  // the Lead row and must NOT fall through to "— No details recorded".
  test('lead-only action shows the Lead row, not the empty-state', async ({ page }) => {
    const leadOnly = investigateSub();
    leadOnly._raw.projects[0].title = '';
    leadOnly._raw.projects[0].desired_outcome = '';
    leadOnly._raw.projects[0].detail = '';
    leadOnly.responses.project_1_title = '';
    leadOnly.responses.project_1_description = '';
    // keep project_1_investigate_lead
    await setup(page, [leadOnly]);
    await openActionDetail(page, 'Investigate');

    const view = page.locator('.proc-action-detail .proc-feed-desc-view').first();
    await expect(view.locator('.proc-proj-field', { hasText: 'Lead' }).first()).toContainText(LEAD_TEXT);
    await expect(view).not.toContainText('No details recorded');
  });

});
