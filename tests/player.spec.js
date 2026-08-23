/**
 * Player-facing E2E against the UNIFIED app (index.html / #app).
 *
 * Rewritten for #626: player.html now redirects to the unified Game App, so these
 * boot via bootApp() (tests/helpers/unified-app.js) and assert the unified DOM.
 * Where the old player.html structure is genuinely gone, the test is re-derived to
 * the current DOM (noted inline) — see the Task-0 DOM map in
 * specs/stories/fix.626.player-portal-spec-rewrites.story.md.
 *   - #player-app -> #app; tabs -> window.goTab(id) + #t-<id>.active
 *   - "Sheet" -> goTab('chars'); default tab is 'roll' (not sheet)
 *   - header username -> #hdr-char-name (active char); user moved to #desktop-sidebar-user
 *   - logout -> Settings (.settings-logout / window.logout); #nav-game removed (app IS the game)
 *   - #nav-admin gated by applyRoleRestrictions (own display: '' for ST, 'none' for player)
 */

const { test, expect } = require('@playwright/test');
const { bootApp, goToTab, PLAYER_USER, ST_USER } = require('./helpers/unified-app.js');

const TEST_CHAR = {
  _id: 'char-001', name: 'Alice Vunder', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Katherine H',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  regent_territory: 'The North Shore', regent_lieutenant: 'Keeper',
  retired: false,
  status: { city: 2, clan: 3, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 2, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 1, bonus: 0 }, Dexterity: { dots: 3, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 }, Composure: { dots: 3, bonus: 0 },
  },
  skills: {
    Athletics: { dots: 2, bonus: 0, specs: [], nine_again: false },
    Stealth: { dots: 3, bonus: 0, specs: ['Crowds'], nine_again: false },
    Occult: { dots: 2, bonus: 0, specs: [], nine_again: false },
  },
  disciplines: { Auspex: 2, Obfuscate: 3 },
  merits: [], powers: [], ordeals: [], // array per schema — the unified app renders the sheet on boot (canRollDice -> ordeals.some)
};

// Spec-specific mocks layered over bootApp's catch-all (these win).
const charRoutes = async (p) => {
  await p.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TEST_CHAR]) }));
  await p.route('**/api/characters/names', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ _id: TEST_CHAR._id, name: TEST_CHAR.name }]) }));
};

// ══════════════════════════════════════
//  AUTH GATE
// ══════════════════════════════════════

test.describe('Unified App — Auth Gate', () => {
  test('login screen hidden when authenticated', async ({ page }) => {
    await bootApp(page, PLAYER_USER, { routes: charRoutes });
    await expect(page.locator('#login-screen')).toBeHidden();
    await expect(page.locator('#app')).toBeVisible();
  });

  test('no login flash (screen never shows when authenticated)', async ({ page }) => {
    await page.addInitScript(() => {
      const obs = new MutationObserver(() => {
        const ls = document.getElementById('login-screen');
        if (ls && getComputedStyle(ls).display !== 'none') window.__loginFlashed = true;
      });
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    });
    await bootApp(page, PLAYER_USER, { routes: charRoutes });
    expect(await page.evaluate(() => window.__loginFlashed || false)).toBe(false);
  });

  test('shows login screen when not authenticated', async ({ page }) => {
    // No auth in localStorage; still catch-all the API so nothing escapes to :3000.
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('/');
    await page.waitForSelector('#login-screen:not([style*="display: none"])', { timeout: 8000 });
    await expect(page.locator('#login-screen')).toBeVisible();
  });
});

// ══════════════════════════════════════
//  HEADER & ROLE
// ══════════════════════════════════════

test.describe('Unified App — Header & role', () => {
  test('active character name shows in the header', async ({ page }) => {
    // Re-derived: the unified header shows the active CHARACTER (#hdr-char-name);
    // the signed-in user moved to #desktop-sidebar-user.
    await bootApp(page, PLAYER_USER, { routes: charRoutes });
    await expect(page.locator('#hdr-char-name')).toContainText('Alice Vunder');
  });

  test('logout affordance is wired (moved to Settings)', async ({ page }) => {
    // Re-derived: no standalone header logout button; logout lives in Settings
    // (.settings-logout) and is exposed as window.logout.
    await bootApp(page, PLAYER_USER, { routes: charRoutes });
    expect(await page.evaluate(() => typeof window.logout === 'function')).toBe(true);
  });

  test('player does NOT get the ST Admin link', async ({ page }) => {
    await bootApp(page, PLAYER_USER, { routes: charRoutes });
    await expect(page.locator('#nav-admin')).toHaveCSS('display', 'none');
  });

  test('ST gets the ST Admin link enabled', async ({ page }) => {
    await bootApp(page, ST_USER, { routes: charRoutes });
    await expect(page.locator('#nav-admin')).not.toHaveCSS('display', 'none');
  });

  // NB removed: "shows Game App nav button" (#nav-game) — obsolete. The unified app
  // IS the game app; there is no separate game-nav button. Not an AC5 product bug.
});

// ══════════════════════════════════════
//  TAB NAVIGATION (via window.goTab + #t-<id>.active)
// ══════════════════════════════════════

test.describe('Unified App — Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page, PLAYER_USER, { routes: charRoutes });
  });

  test('Sheet view is active by default', async ({ page }) => {
    // The unified app opens on the character sheet (#t-sheets) once the active char loads.
    await expect(page.locator('#t-sheets')).toHaveClass(/active/);
  });

  test('Sheet tab activates (goTab "chars" -> #t-sheets)', async ({ page }) => {
    // 'chars' is the Sheet nav id; it activates the #t-sheets panel (not #t-chars).
    await page.evaluate(() => window.goTab('chars'));
    await expect(page.locator('#t-sheets')).toHaveClass(/active/);
  });

  test('Status tab activates', async ({ page }) => {
    await goToTab(page, 'status');
    await expect(page.locator('#t-status')).toHaveClass(/active/);
  });

  test('Downtime tab activates', async ({ page }) => {
    await goToTab(page, 'downtime');
    await expect(page.locator('#t-downtime')).toHaveClass(/active/);
  });

  test('Feeding tab activates', async ({ page }) => {
    await goToTab(page, 'feeding');
    await expect(page.locator('#t-feeding')).toHaveClass(/active/);
  });

  test('Ordeals tab activates', async ({ page }) => {
    await goToTab(page, 'ordeals');
    await expect(page.locator('#t-ordeals')).toHaveClass(/active/);
  });

  // NB removed: "Story tab" — the unified app has NO #t-story panel (the player
  // Story tab was consolidated in the unification; Archive/Relationships/DevLog
  // carry narrative now). Flagged in the story Completion Notes for a coverage glance.

  // NB removed: the fixed "5 visible tabs" count + #tab-btn-regency visibility —
  // the unified nav is a role-built grid (renderDesktopSidebar), not the static
  // player.html .tab-btn bar, so a hardcoded count no longer maps. Tab reachability
  // is covered per-tab above.
});
