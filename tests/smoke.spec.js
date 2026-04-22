/**
 * Diagnostic smoke test — checks if admin app becomes visible with local-test-token
 */
const { test, expect } = require('@playwright/test');

test('admin app becomes visible with local-test-token', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));

  await page.addInitScript(() => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify({
      id: '123', username: 'test_st', global_name: 'Test ST',
      avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
    }));
  });

  // Intercept all API calls on localhost:3000
  await page.route('http://localhost:3000/api/**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  // Intercept ALL API calls at localhost:3000
  const intercepted = [];
  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    intercepted.push({ method, url });
    if (url.includes('/api/characters') && !url.includes('names')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
        _id: 'char-pt4', name: 'Charlie Test', moniker: null, honorific: null,
        clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
        blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
        status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
        attributes: { Strength: { dots: 3, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 }, Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 }, Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 } },
        skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
      }]) });
    } else if (url.includes('/api/downtime_cycles')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
        _id: 'cycle-001', cycle_number: 2, status: 'open',
        confirmed_ambience: {}, narrative_notes: '',
      }]) });
    } else if (url.includes('/api/downtime_submissions')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
        _id: 'sub-proj-001', cycle_id: 'cycle-001', character_name: 'Charlie Test',
        character_id: 'char-pt4', player_name: 'Test Player', submitted_at: '2026-04-15T00:00:00Z',
        _raw: { projects: [{ action_type: 'ambience_increase', desired_outcome: 'Test', detail: 'Test detail', primary_pool: { expression: 'Strength 3 = 3' } }], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
        responses: { project_1_action: 'ambience_increase', project_1_outcome: 'Test', project_1_description: 'Test detail', project_1_pool_expr: 'Strength 3 = 3' },
        projects_resolved: [], feeding_review: null, merit_actions_resolved: [], st_review: { territory_overrides: {} },
      }]) });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
  });

  await page.goto('/admin.html');

  // Wait for admin app to become visible
  const adminApp = await page.waitForSelector('#admin-app', { state: 'visible', timeout: 15000 }).catch(() => null);
  console.log('admin-app visible:', !!adminApp);

  if (adminApp) {
    await page.click('[data-domain="downtime"]');
    await page.waitForTimeout(3000);

    const dtContent = await page.$('#dt-submissions');
    const dtHtml = dtContent ? await dtContent.innerHTML() : 'NOT FOUND';
    const hasPhaseSection = dtHtml.includes('proc-phase-section');
    const hasPlaceholder = dtHtml.includes('placeholder');
    console.log('has proc-phase-section:', hasPhaseSection);
    console.log('has placeholder:', hasPlaceholder);
    console.log('dt-submissions first 200 chars:', dtHtml.slice(0, 200));
    console.log('intercepted API calls:', intercepted.map(i => `${i.method} ${i.url}`).join('\n'));
    if (consoleErrors.length) console.log('console errors:', consoleErrors.slice(0, 3).join('\n'));
  }

  expect(!!adminApp).toBe(true);
});
