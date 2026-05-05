/**
 * Issue #24 — Story section: free-text NPC name + interaction note
 *
 * Verifies that the personal_story section of the player downtime form renders
 * two free-text fields (name input + note textarea) instead of the former
 * relationship <select> dropdown.
 *
 * Uses the Game App (index.html). player.html is a redirect stub → go directly
 * to index.html. The downtime tab is #t-downtime; nav button is #n-downtime.
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-002',
  character_ids: ['char-001'], is_dual_role: false,
};

const TEST_CHAR = {
  _id: 'char-001', name: 'Alice Vunder', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Test Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 2, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 1, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 1, bonus: 0 }, Dexterity: { dots: 3, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 }, Composure: { dots: 3, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const ACTIVE_CYCLE = {
  _id: 'cycle-test', cycle_number: 3, status: 'active',
  label: 'Test Cycle 3', created_at: new Date().toISOString(),
};

async function loginAsPlayer(page) {
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TEST_CHAR]) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ _id: TEST_CHAR._id, name: TEST_CHAR.name }]) })
  );
  await page.route('**/api/characters/public', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/characters/game-xp', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/characters/combat', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/rules/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/rules', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/tracker_state/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  );
  await page.route('**/api/tracker_state', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  );
  await page.route('**/api/players*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/downtime_cycles*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) })
  );
  await page.route('**/api/downtime_submissions*', route => {
    if (route.request().method() === 'POST' || route.request().method() === 'PUT') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ _id: 'sub-test', responses: {} }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/territories*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/relationships*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/npcs*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: PLAYER_USER });
}

async function openStorySection(page) {
  await page.goto('/index.html');
  await page.waitForSelector('#app', { state: 'visible', timeout: 35000 });
  await page.evaluate(() => goTab('downtime'));
  await page.waitForSelector('#t-downtime.active', { timeout: 8000 });

  // Wait for async initDowntimeTab to render the form
  const storySection = page.locator('.qf-section[data-section-key="personal_story"]');
  await storySection.waitFor({ timeout: 8000 });
  await storySection.locator('.qf-section-title').click();
  await page.waitForTimeout(300);
}

test.describe('Issue #24: Story section free-text NPC fields', () => {

  test('Story section has no relationship <select> dropdown', async ({ page }) => {
    await loginAsPlayer(page);
    await openStorySection(page);

    const select = page.locator('#dt-story_moment_relationship_id');
    await expect(select).toHaveCount(0);
  });

  test('Story section has a free-text NPC name input', async ({ page }) => {
    await loginAsPlayer(page);
    await openStorySection(page);

    const nameInput = page.locator('#dt-personal_story_npc_name_free');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveAttribute('type', 'text');
  });

  test('Story section has an interaction note textarea', async ({ page }) => {
    await loginAsPlayer(page);
    await openStorySection(page);

    const noteArea = page.locator('#dt-personal_story_note');
    await expect(noteArea).toBeVisible();
  });

  test('typing an NPC name syncs to the hidden personal_story_npc_name field', async ({ page }) => {
    await loginAsPlayer(page);
    await openStorySection(page);

    await page.fill('#dt-personal_story_npc_name_free', 'Marcus the Shepherd');
    await page.press('#dt-personal_story_npc_name_free', 'Tab');
    await page.waitForTimeout(200);

    const hidden = page.locator('#dt-personal_story_npc_name');
    await expect(hidden).toHaveValue('Marcus the Shepherd');
  });

  test('typing a name and note marks the section tick visible', async ({ page }) => {
    await loginAsPlayer(page);
    await openStorySection(page);

    await page.fill('#dt-personal_story_npc_name_free', 'Marcus the Shepherd');
    await page.fill('#dt-personal_story_note', 'A quiet conversation by the river.');
    await page.waitForTimeout(300);

    const tick = page.locator('.qf-section[data-section-key="personal_story"] .qf-section-tick');
    await expect(tick).toHaveClass(/visible/);
  });

  test('saved personal_story_npc_name pre-populates the name input on re-render', async ({ page }) => {
    // loginAsPlayer first so its downtime_submissions handler is registered before the
    // test-specific override — Playwright evaluates in LIFO, so the override (registered
    // last) takes priority and returns the saved submission on GET.
    await loginAsPlayer(page);

    await page.route('**/api/downtime_submissions*', route => {
      if (route.request().method() !== 'GET' && route.request().method() !== 'HEAD') {
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ _id: 'sub-saved', responses: {} }) });
      }
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{
          _id: 'sub-saved', cycle_id: ACTIVE_CYCLE._id,
          character_id: TEST_CHAR._id, status: 'draft',
          responses: { personal_story_npc_name: 'Elara the Merchant', personal_story_note: 'Trade secrets.' },
        }]),
      });
    });

    await openStorySection(page);

    await expect(page.locator('#dt-personal_story_npc_name_free')).toHaveValue('Elara the Merchant');
  });

});
