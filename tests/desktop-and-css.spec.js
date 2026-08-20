/**
 * Desktop mode + CSS audit E2E tests
 *
 * Covers:
 *   - Desktop mode toggle (nav-desktop-mode)
 *   - CSS audit: Archive styled, DT Submission dark theme
 *   - CSS audit: two-panel collapses on mobile
 *   - Font harmonisation: buttons use Lato not Cinzel
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const PLAYER_USER = {
  id: '999', username: 'player_test', global_name: 'Player',
  avatar: null, role: 'player', player_id: 'p-002',
  character_ids: ['char-001'], is_dual_role: false,
};

async function setupSuite(page, user = ST_USER) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode'); // start in game mode
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, user);
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

// ── Desktop mode tests ─────────────────────────────────────────────────────────

test('desktop-mode — toggle button visible in header', async ({ page }) => {
  await setupSuite(page);
  await expect(page.locator('#btn-desktop-toggle')).toBeVisible();
});

test('desktop-mode — starts in game mode (no body.desktop-mode)', async ({ page }) => {
  await setupSuite(page);
  const hasClass = await page.evaluate(() => document.body.classList.contains('desktop-mode'));
  expect(hasClass).toBe(false);
});

test('desktop-mode — toggle adds body.desktop-mode and shows sidebar', async ({ page }) => {
  await setupSuite(page);

  await page.click('#btn-desktop-toggle');

  const hasClass = await page.evaluate(() => document.body.classList.contains('desktop-mode'));
  expect(hasClass).toBe(true);

  await expect(page.locator('#desktop-sidebar')).toBeVisible();
});

test('desktop-mode — bottom nav hidden in desktop mode', async ({ page }) => {
  await setupSuite(page);
  await page.click('#btn-desktop-toggle');
  await expect(page.locator('#bnav')).toBeHidden();
});

test('desktop-mode — sidebar has primary tabs (Dice, Sheet, Status)', async ({ page }) => {
  await setupSuite(page);
  await page.click('#btn-desktop-toggle');
  await page.waitForSelector('#desktop-sidebar', { state: 'visible', timeout: 5000 });

  const navText = await page.locator('#desktop-sidebar-nav').textContent();
  expect(navText).toMatch(/Dice/i);
  expect(navText).toMatch(/Sheet/i);
  expect(navText).toMatch(/Status/i);
});

test('desktop-mode — sidebar has section labels', async ({ page }) => {
  await setupSuite(page);
  await page.click('#btn-desktop-toggle');
  await page.waitForSelector('#desktop-sidebar', { state: 'visible', timeout: 5000 });

  const navText = await page.locator('#desktop-sidebar-nav').textContent();
  expect(navText).toMatch(/Game/i);
  expect(navText).toMatch(/Storyteller/i);
  // The Lore section went with #1135 (Primer, Game Guide and Rules were its only
  // three tiles), and both render sites skip a section with no visible apps.
  expect(navText).not.toMatch(/Lore/i);
});

test('desktop-mode — ST sees Tracker and Sign-In in sidebar', async ({ page }) => {
  await setupSuite(page, ST_USER);
  await page.click('#btn-desktop-toggle');
  await page.waitForSelector('#desktop-sidebar', { state: 'visible', timeout: 5000 });

  const navText = await page.locator('#desktop-sidebar-nav').textContent();
  expect(navText).toMatch(/Tracker/i);
  expect(navText).toMatch(/Sign-In/i);
});

test('desktop-mode — tapping sidebar Dice navigates to dice tab', async ({ page }) => {
  await setupSuite(page);
  await page.click('#btn-desktop-toggle');
  await page.waitForSelector('#desktop-sidebar', { state: 'visible', timeout: 5000 });

  // Navigate away first
  await page.evaluate(() => window.goTab('status'));
  await page.waitForTimeout(200);

  // Click Dice in sidebar (now a .sidebar-app-tile in primary grid)
  await page.locator('#desktop-sidebar-nav .sidebar-app-tile').filter({ hasText: /Dice/i }).click();
  await expect(page.locator('#t-dice')).toHaveClass(/active/, { timeout: 5000 });
});

test('desktop-mode — toggling back restores game mode', async ({ page }) => {
  await setupSuite(page);

  await page.click('#btn-desktop-toggle'); // → desktop (header visible)
  // In desktop mode, header is hidden — use JS to toggle back
  await page.evaluate(() => window.toggleDesktopMode()); // → game

  const hasClass = await page.evaluate(() => document.body.classList.contains('desktop-mode'));
  expect(hasClass).toBe(false);

  await expect(page.locator('#bnav')).toBeVisible();
  await expect(page.locator('#desktop-sidebar')).toBeHidden();
});

test('desktop-mode — preference saved to localStorage', async ({ page }) => {
  await setupSuite(page);
  await page.click('#btn-desktop-toggle');

  const mode = await page.evaluate(() => localStorage.getItem('tm-mode'));
  expect(mode).toBe('desktop');
});

test('desktop-mode — preference restored on page load', async ({ page }) => {
  await page.addInitScript((u) => {
    localStorage.setItem('tm-mode', 'desktop');
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, ST_USER);
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

  const hasClass = await page.evaluate(() => document.body.classList.contains('desktop-mode'));
  expect(hasClass).toBe(true);
  await expect(page.locator('#desktop-sidebar')).toBeVisible();
});

test('desktop-mode — app width uncapped in desktop mode', async ({ page }) => {
  await setupSuite(page);
  await page.click('#btn-desktop-toggle');

  const maxWidth = await page.evaluate(() => {
    const app = document.getElementById('app');
    return window.getComputedStyle(app).maxWidth;
  });
  // Should be 'none' or very large — not 600px
  expect(maxWidth).not.toBe('600px');
});

// ── CSS audit tests ────────────────────────────────────────────────────────────

// The Primer TOC css-audit test was retired with #1135: the Primer tab and its
// primer-* rules were both deleted, so there is no TOC left to style.

test('css-audit — viewport meta tag does not disable pinch-zoom (WCAG 1.4.4, gdx.1)', async ({ page }) => {
  // Deliberately NOT setupSuite() here — this is a static <head> tag present
  // on raw HTML load, not app-runtime behaviour, so it doesn't need the full
  // SPA boot (#app visible) that setupSuite() waits on.
  await page.goto('/');
  const content = await page.locator('meta[name="viewport"]').getAttribute('content');
  // review finding (AC1): asserting the exact required value, not just the
  // absence of the two zoom-lock tokens — a substring-absence check alone
  // would pass for a regression that reintroduced zoom restriction through a
  // different token (e.g. minimum-scale), or that accidentally dropped
  // width=device-width/initial-scale=1.0 too.
  expect(content).toBe('width=device-width, initial-scale=1.0');
});

test('css-audit — Archive CSS class is defined in suite.css', async ({ page }) => {
  await setupSuite(page);

  const hasArcDocs = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText === '.arc-docs') return true;
        }
      } catch { /* cross-origin */ }
    }
    return false;
  });
  expect(hasArcDocs).toBe(true);
});

test('css-audit — DT Submission tab has dark-theme input styles', async ({ page }) => {
  await setupSuite(page);

  // .qf-input override should force dark background
  const hasOverride = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText && rule.selectorText.includes('t-dt-submission') && rule.selectorText.includes('qf-input')) {
            return true;
          }
        }
      } catch { /* cross-origin */ }
    }
    return false;
  });
  expect(hasOverride).toBe(true);
});

test('css-audit — story-split is single column on phone (≤768px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupSuite(page);

  // Inject a story-split element and measure
  const flexDir = await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'story-split';
    document.body.appendChild(el);
    const dir = window.getComputedStyle(el).flexDirection;
    document.body.removeChild(el);
    return dir;
  });
  expect(flexDir).toBe('column');
});

test('css-audit — tab-split is single column on phone (≤768px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupSuite(page);

  const flexDir = await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'tab-split';
    document.body.appendChild(el);
    const dir = window.getComputedStyle(el).flexDirection;
    document.body.removeChild(el);
    return dir;
  });
  expect(flexDir).toBe('column');
});

test('css-audit — dice roll button uses Lato font (not Cinzel)', async ({ page }) => {
  await setupSuite(page);

  const fontFamily = await page.evaluate(() => {
    const btn = document.getElementById('roll-btn');
    if (!btn) return null;
    return window.getComputedStyle(btn).fontFamily;
  });

  if (fontFamily) {
    expect(fontFamily.toLowerCase()).toContain('lato');
    expect(fontFamily.toLowerCase()).not.toContain('cinzel');
  }
});

test('css-audit — modifier chips use Lato font (not Cinzel)', async ({ page }) => {
  await setupSuite(page);

  const fontFamily = await page.evaluate(() => {
    const chip = document.querySelector('.mchip');
    if (!chip) return null;
    return window.getComputedStyle(chip).fontFamily;
  });

  if (fontFamily) {
    expect(fontFamily.toLowerCase()).toContain('lato');
    expect(fontFamily.toLowerCase()).not.toContain('cinzel');
  }
});

test('css-audit — app title retains Cinzel font', async ({ page }) => {
  await setupSuite(page);

  const fontFamily = await page.evaluate(() => {
    const title = document.querySelector('.hdr-title');
    if (!title) return null;
    return window.getComputedStyle(title).fontFamily;
  });

  if (fontFamily) {
    expect(fontFamily.toLowerCase()).toContain('cinzel');
  }
});

// ── gdx-2: type-scale floor audit (AC1, AC2, AC3, AC5) ─────────────────────────
//
// These tests deliberately do NOT use setupSuite(). That helper waits on #app
// becoming visible and is the root cause of this file's 12 documented
// pre-existing failures. Stylesheets are <link>ed in <head>, so
// document.styleSheets is fully populated on a bare page.goto('/') with no app
// boot required.

const GDX2_SHEETS = ['/css/suite.css', '/css/components.css'];

// Selectors deliberately left below the floor by gdx-2 Task 3: the
// components.css EDITOR section (its lines 143 to 511) renders admin.html's
// character editor, a denser surface outside Epic GDX's player-facing remit.
// They were converted px -> rem but keep their authored values.
//
// This list is a RATCHET, not a wishlist. It was generated from the selectors
// actually skipped at the time of the conversion. Any NEW sub-floor selector,
// anywhere in either stylesheet, fails the test. A selector-prefix heuristic
// cannot replace it: 'sh-' prefixed rules exist on both sides of the carve-out
// boundary.
//
// gdx-2 review patch: the list is now every editor-section declaration below the
// 0.75rem BODY floor, not just those below the 0.6875rem micro floor, because the
// floor check became role-aware (see gdx2FloorViolation). It went from 68 entries
// to 110. Every one of the 110 was confirmed to live inside components.css lines
// 143 to 511; suite.css contributes zero, which is the whole point of the
// player-scoped override block at the end of that file.
//
// It is also href-aware now (see gdx2Allowed). An allowlisted selector is a
// legitimate carve-out ONLY when it comes from components.css. The same selector
// text appearing sub-floor in suite.css means the player-scoped override block
// has been deleted or broken, which must fail loudly rather than pass silently.
//
// Note: the subset of these rules that DOES reach the player sheet (via the
// shRender* helpers public/js/suite/sheet.js imports from editor/sheet.js, and
// via public/js/tabs/archive-tab.js calling the editor's whole renderSheet) is
// raised to the floor by that override block, so index.html never renders them
// below the floor. GDX2_PLAYER_OVERRIDES below asserts that positively.
const GDX2_EDITOR_CARVE_OUT = [
  ".attr-bd-input",
  ".attr-bd-ro",
  ".attr-bd-row",
  ".attr-bd-row .bd-lbl",
  ".attr-clan-star",
  ".attr-derived-row",
  ".attr-derived-row .bd-src-lbl",
  ".attr-group-title",
  ".cap-btn",
  ".contacts-dot-src",
  ".derived-note",
  ".dev-add-btn",
  ".dev-add-sel",
  ".dev-prereq",
  ".dev-xp-tag",
  ".disc-bd-row",
  ".disc-bd-row .bd-lbl",
  ".disc-clan-tag",
  ".disc-cp-counter",
  ".dom-attach-lbl",
  ".dom-attach-sel",
  ".dom-cap-info",
  ".dom-cap-warn",
  ".dom-contrib-lbl",
  ".dom-inherited-card-title",
  ".dom-own-view",
  ".dom-partner-rm",
  ".dom-partner-sel",
  ".dom-partner-tag",
  ".dom-qual-error",
  ".dom-qual-hint",
  ".dom-qual-input",
  ".dom-qual-lbl",
  ".dom-row-subtitle",
  ".dom-total-lbl",
  ".edit-dirty",
  ".edit-tab",
  ".gen-granted-tag",
  ".gen-granted-tag-view",
  ".gen-name-select",
  ".gen-qual-input",
  ".grant-pool-rank",
  ".grant-pool-row",
  ".infl-dots-derived",
  ".infl-edit-row .infl-area-fixed",
  ".infl-edit-row .infl-dots-fixed",
  ".infl-edit-row select, .infl-edit-row input[type=\"text\"]",
  ".infl-ghoul-lbl",
  ".infl-mode-btn",
  ".infl-tier-chip",
  ".infl-total",
  ".mci-benefit-input",
  ".mci-benefit-text",
  ".mci-choice-btn",
  ".mci-cult-name",
  ".mci-dot-lbl",
  ".mci-pool-hint",
  ".mci-pool-lbl",
  ".mci-tier-qual",
  ".mci-tier-sel",
  ".mci-toggle-btn",
  ".mci-unassigned",
  ".merit-prereq-fail-tag",
  ".pt-skill-sel",
  ".pt-skill-tag",
  ".sh-attr-pri select",
  ".sh-bane-add",
  ".sh-bh-alert",
  ".sh-bh-field input",
  ".sh-bh-grid",
  ".sh-char-concept .sh-edit-input",
  ".sh-char-player .sh-edit-input",
  ".sh-clan-attr-row",
  ".sh-cp-remaining",
  ".sh-desktop .sh-edit-select-sub",
  ".sh-edit-select-sub",
  ".sh-ordeal",
  ".sh-spec-counter",
  ".sh-spec-counter .sc-bonus",
  ".sh-spec-counter .sc-parts",
  ".sh-spec-counter .sc-xp",
  ".sh-xp-breakdown .sh-xp-ledger-table td",
  ".sh-xp-breakdown .sh-xp-ledger-table th",
  ".sh-xp-breakdown input[type=\"number\"]",
  ".sh-xp-breakdown table",
  ".sh-xp-breakdown table.sh-xp-ledger-table",
  ".sh-xp-breakdown td:nth-child(2n)",
  ".sh-xp-breakdown td:nth-child(2n+1)",
  ".sh-xp-breakdown th",
  ".sk-bd-row",
  ".sk-bd-row .bd-lbl",
  ".sk-spec-add",
  ".sk-spec-input",
  ".skill-flag",
  ".skill-group-title",
  ".skill-name",
  ".skill-spec-input",
  ".td-anchor-empty",
  ".td-anchor-lbl",
  ".td-anchor-locked",
  ".td-anchor-sel",
  ".td-anchor-warn",
  ".topbar-action",
  ".topbar-btn",
  ".wa-picker-dot",
  ".wa-picker-empty",
  ".wa-picker-lbl",
  ".wa-picker-sel",
  ".wa-picker-warn",
  ".xp-title",
];

// Read the AUTHORED value from the CSSOM, never getComputedStyle: computed
// styles resolve rem back to px, which would make the px assertion vacuous.
async function gdx2CollectFontSizes(page) {
  await page.goto('/');
  return page.evaluate(() => {
    const out = [];
    const walk = (rules, href) => {
      for (const rule of rules) {
        // Read first, THEN recurse. With CSS Nesting a plain CSSStyleRule also
        // exposes an (empty) cssRules, so a recurse-first walk silently skips
        // every style rule. Recursing at all is required for @media blocks:
        // suite.css has 11 and components.css has 8.
        if (rule.style && rule.style.fontSize) {
          out.push({
            href,
            selector: rule.selectorText || '',
            value: rule.style.fontSize,
            // Carried so the floor check can tell a micro-label from body text
            // without re-deriving the classification. See gdx2IsMicroRole.
            textTransform: rule.style.textTransform || '',
            letterSpacing: rule.style.letterSpacing || '',
          });
        }
        if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules, href);
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules, sheet.href || ''); } catch { /* cross-origin (Google Fonts) */ }
    }
    return out;
  });
}

function gdx2InScope(decl) {
  return GDX2_SHEETS.some(s => decl.href.endsWith(s));
}

// gdx-2 review patch: the carve-out is only a carve-out in the file it was
// carved out of. A sub-floor declaration for one of these selectors in
// suite.css means the player-scoped override block has gone missing, which is
// exactly the silent revert the ratchet exists to prevent.
const GDX2_CARVE_OUT_SET = new Set(GDX2_EDITOR_CARVE_OUT);
function gdx2Allowed(decl) {
  return decl.href.endsWith('/css/components.css') && GDX2_CARVE_OUT_SET.has(decl.selector);
}

// True when the authored value carries a non-zero absolute px term anywhere.
//
// gdx-2 review patch: the previous shape stripped exactly one leading function
// name and then matched the whole remaining term against /^([\d.]+)px$/, so a px
// nested one level deeper (clamp(1rem, calc(1vw + 4px), 2rem)) was invisible to
// the AC1 ratchet. This walks the whole value string instead.
//
// var() references are removed wholesale first, not only when they lead the
// value: --reading-font-size carries a px fallback and is explicitly out of
// gdx-2's scope. A bare zero has no unit and never matches.
function gdx2HasAbsolutePx(value) {
  let v = value.trim();
  let prev;
  do { prev = v; v = v.replace(/var\([^()]*\)/g, ' '); } while (v !== prev);
  const hits = v.match(/(\d*\.?\d+)px\b/g) || [];
  return hits.some((h) => parseFloat(h) > 0);
}

// px-equivalent of a bare literal value, or null when the value is a token, a
// function or a bare zero. Handles px as well as rem so the floor assertion
// discriminates on its own rather than leaning on the AC1 assertion having
// already passed.
function gdx2LiteralPx(value) {
  const v = value.trim();
  const rem = v.match(/^([\d.]+)rem$/);
  if (rem) {
    const n = parseFloat(rem[1]) * 16;
    return n > 0 ? n : null;
  }
  const px = v.match(/^([\d.]+)px$/);
  if (px) {
    const n = parseFloat(px[1]);
    return n > 0 ? n : null;
  }
  return null;
}

// The story's own classification heuristic, which the shipped conversion was
// independently audited against: uppercase plus letter-spacing of .06em or more
// is a micro-label, chip or pill and takes the 11px floor. Everything else is
// prose, a value, a table cell or button text and takes the 12px body floor.
// Tracking authored in px is normalised against the rule's own font size.
function gdx2IsMicroRole(decl, px) {
  if (!/uppercase/i.test(decl.textTransform || '')) return false;
  const ls = (decl.letterSpacing || '').trim();
  const em = ls.match(/^([\d.]+)em$/);
  if (em) return parseFloat(em[1]) >= 0.06;
  const lsPx = ls.match(/^([\d.]+)px$/);
  if (lsPx) return (parseFloat(lsPx[1]) / px) >= 0.06;
  return false;
}

// gdx-2 review patch: role-aware. The original only ever checked the 0.6875rem
// micro floor, so a body-role declaration authored in the 11 to 11.9px dead zone
// passed unnoticed even though AC2 puts its floor at 0.75rem.
function gdx2FloorViolation(decl) {
  const px = gdx2LiteralPx(decl.value);
  if (px === null) return null;
  const micro = gdx2IsMicroRole(decl, px);
  const floor = micro ? 11 : 12;
  return px < floor ? { px, floor, role: micro ? 'micro' : 'body' } : null;
}

function gdx2Describe(d) {
  return d.href.split('/').pop() + ' { ' + d.selector + ' } font-size:' + d.value;
}

test('css-audit — no absolute px font-size in suite.css or components.css (gdx-2 AC1)', async ({ page }) => {
  const decls = (await gdx2CollectFontSizes(page)).filter(gdx2InScope);
  expect(decls.length).toBeGreaterThan(1000); // guard: the walk really found both sheets

  const offenders = decls.filter((d) => gdx2HasAbsolutePx(d.value)).map(gdx2Describe);
  expect(offenders, 'absolute px font-size ignores the OS text-size preference').toEqual([]);
});

test('css-audit — no font-size below its role floor outside the admin-editor carve-out (gdx-2 AC2)', async ({ page }) => {
  const decls = (await gdx2CollectFontSizes(page)).filter(gdx2InScope);

  const offenders = [];
  for (const d of decls) {
    const v = gdx2FloorViolation(d);
    if (!v || gdx2Allowed(d)) continue;
    offenders.push(gdx2Describe(d) + ' (' + v.role + ' role, floor ' + v.floor + 'px, is ' + v.px + 'px)');
  }
  expect(offenders, 'sub-floor type on a player surface').toEqual([]);
});

// gdx-2 review patch, the other half of making the ratchet honest. The negative
// assertion above cannot see the player-scoped override block at all: every
// selector in it is also a legitimate components.css carve-out entry, so
// deleting the block would leave the suite above green while the player sheet
// silently reverted to 9 and 10px text. This asserts the block positively, in
// the real player DOM, so a deletion or a specificity loss fails loudly.
//
// Probed by computed style rather than by CSSOM presence: that catches the block
// being outranked as well as the block being removed.
const GDX2_PLAYER_OVERRIDE_PROBES = [
  { cls: 'derived-note', floor: 12 },
  { cls: 'dev-add-btn', floor: 12 },
  { cls: 'gen-granted-tag', floor: 12 },
  { cls: 'gen-granted-tag-view', floor: 12 },
  { cls: 'infl-ghoul-lbl', floor: 12 },
  { cls: 'infl-tier-chip', floor: 12 },
  { cls: 'dom-attach-lbl', floor: 12 },
  { cls: 'dom-cap-warn', floor: 12 },
  { cls: 'dom-contrib-lbl', floor: 12 },
  { cls: 'dom-partner-tag', floor: 12 },
  { cls: 'dom-qual-error', floor: 12 },
  { cls: 'dom-qual-hint', floor: 12 },
  { cls: 'dom-row-subtitle', floor: 12 },
  { cls: 'dom-total-lbl', floor: 12 },
  { cls: 'sh-bh-alert', floor: 12 },
  { cls: 'grant-pool-rank', floor: 12 },
  { cls: 'grant-pool-row', floor: 12 },
  { cls: 'mci-dot-lbl', floor: 12 },
  { cls: 'pt-skill-tag', floor: 12 },
  { cls: 'sk-spec-add', floor: 12 },
  { cls: 'dom-inherited-card-title', floor: 11 },
];

test('css-audit — the player-scoped floor override actually raises the shared editor rules (gdx-2 AC2)', async ({ page }) => {
  await page.goto('/');
  const measured = await page.evaluate((probes) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const out = [];
    for (const p of probes) {
      const el = document.createElement('span');
      el.className = p.cls;
      host.appendChild(el);
      out.push({ cls: p.cls, floor: p.floor, px: parseFloat(getComputedStyle(el).fontSize) });
    }
    // The three compound selectors in the block need their ancestor and their
    // element type to match, so they are built rather than class-stamped.
    const row = document.createElement('div');
    row.className = 'infl-edit-row';
    row.innerHTML = '<select></select><input type="text"><span class="infl-area-fixed"></span>';
    host.appendChild(row);
    out.push({ cls: '.infl-edit-row select', floor: 12, px: parseFloat(getComputedStyle(row.querySelector('select')).fontSize) });
    out.push({ cls: '.infl-edit-row input[type=text]', floor: 12, px: parseFloat(getComputedStyle(row.querySelector('input')).fontSize) });
    out.push({ cls: '.infl-edit-row .infl-area-fixed', floor: 12, px: parseFloat(getComputedStyle(row.querySelector('.infl-area-fixed')).fontSize) });
    document.body.removeChild(host);
    return out;
  }, GDX2_PLAYER_OVERRIDE_PROBES);

  const under = measured
    .filter((m) => m.px < m.floor)
    .map((m) => m.cls + ' renders at ' + m.px + 'px, floor is ' + m.floor + 'px');
  expect(under, 'player-scoped floor override missing or outranked').toEqual([]);
});

test('css-audit — the two type-floor tokens are declared in theme.css :root (gdx-2 AC5)', async ({ page }) => {
  await page.goto('/');
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      body: cs.getPropertyValue('--fs-floor-body').trim(),
      micro: cs.getPropertyValue('--fs-floor-micro').trim(),
    };
  });
  expect(tokens.body).toBe('0.75rem');
  expect(tokens.micro).toBe('0.6875rem');
});

// ── gdx-2 AC3: nothing clipped or unreachable at a narrow viewport ─────────────
//
// .tab is overflow-x:hidden and html,body is overflow:hidden, so over-wide
// content does not produce a scrollbar, it silently clips and becomes
// unreachable. The honest assertion is therefore "the tab's scrollWidth never
// exceeds its clientWidth", plus "the offending child takes the overflow
// itself".

const GDX2_SHORTCUT_ROW_HTML = [
  '<div class="shortcut-row">',
  '<button class="sc-btn" id="sc-char"><span class="sc-label">Character</span><span class="sc-val">Aurelia</span></button>',
  '<button class="sc-btn" id="sc-disc"><span class="sc-label">Discipline</span><span class="sc-val">Dominate</span></button>',
  '<button class="sc-btn" id="sc-common"><span class="sc-label">Common</span></button>',
  '<button class="sc-btn sc-btn-auspex" id="sc-auspex"><span class="sc-label">Auspex</span></button>',
  '</div>',
].join('');

async function gdx2MeasureInTab(page, innerHtml, probeSelector) {
  return page.evaluate(({ html, sel }) => {
    const tab = document.createElement('div');
    tab.id = 't-dice';
    tab.className = 'tab active';
    tab.style.display = 'flex';
    tab.innerHTML = html;
    document.body.appendChild(tab);
    const probe = tab.querySelector(sel);
    const cs = probe ? window.getComputedStyle(probe) : null;
    const out = {
      tabScrollWidth: tab.scrollWidth,
      tabClientWidth: tab.clientWidth,
      probeOverflowX: cs ? cs.overflowX : null,
      probeScrollWidth: probe ? probe.scrollWidth : null,
      probeClientWidth: probe ? probe.clientWidth : null,
    };
    document.body.removeChild(tab);
    return out;
  }, { html: innerHtml, sel: probeSelector });
}

for (const gdx2Width of [360, 414, 768]) {
  test('css-audit — .shortcut-row with four buttons is reachable at ' + gdx2Width + 'px (gdx-2 AC3, closes #1191)', async ({ page }) => {
    await page.setViewportSize({ width: gdx2Width, height: 800 });
    await page.goto('/');
    const m = await gdx2MeasureInTab(page, GDX2_SHORTCUT_ROW_HTML, '.shortcut-row');

    // The row takes the overflow itself, so the clipping .tab is never overrun.
    expect(m.tabScrollWidth).toBeLessThanOrEqual(m.tabClientWidth);
    expect(['auto', 'scroll']).toContain(m.probeOverflowX);
    // And the row never grows past the space it has, so nothing spills sideways.
    expect(m.probeClientWidth).toBeLessThanOrEqual(m.tabClientWidth);
  });
}

// gdx-2 review patch, the assertion that actually closes #1191. The test above
// only proves the ROW behaves; it says nothing about the fourth button, which was
// measured 0px visible at 320/360/375px after Task 5's change. Making the row a
// scroll container did not help because .sc-btn kept its default min-width:auto,
// and the scrollbar is hidden with no affordance to reach the overflow. This
// asserts #sc-auspex is on screen without any scrolling at all.
for (const gdx2ScWidth of [320, 360, 375, 414]) {
  test('css-audit — the fourth shortcut button is visible without scrolling at ' + gdx2ScWidth + 'px (gdx-2 AC3, closes #1191)', async ({ page }) => {
    await page.setViewportSize({ width: gdx2ScWidth, height: 800 });
    await page.goto('/');
    const m = await page.evaluate((html) => {
      const tab = document.createElement('div');
      tab.id = 't-dice';
      tab.className = 'tab active';
      tab.style.display = 'flex';
      tab.innerHTML = html;
      document.body.appendChild(tab);
      const row = tab.querySelector('.shortcut-row');
      const btn = tab.querySelector('#sc-auspex');
      const rowRect = row.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      const out = {
        btnWidth: btnRect.width,
        // The row's visible box, ignoring anything only reachable by scrolling.
        overhangRight: btnRect.right - (rowRect.left + row.clientWidth),
        overhangLeft: rowRect.left - btnRect.left,
        rowScrollWidth: row.scrollWidth,
        rowClientWidth: row.clientWidth,
        scrollLeft: row.scrollLeft,
      };
      document.body.removeChild(tab);
      return out;
    }, GDX2_SHORTCUT_ROW_HTML);

    expect(m.scrollLeft).toBe(0);
    expect(m.btnWidth, '#sc-auspex has no visible width').toBeGreaterThan(0);
    expect(m.overhangLeft, '#sc-auspex starts before the row').toBeLessThanOrEqual(0);
    expect(m.overhangRight, '#sc-auspex is only reachable by scrolling').toBeLessThanOrEqual(0);
    // min-width:0 lets flex do its job, so from 360px up no scrolling is needed
    // in the first place. Below that the unbreakable .sc-label words ("Character",
    // "Discipline") still overrun their button by a few px, which is precisely
    // what the row's overflow-x:auto safety net and its two scrollbar-hiding
    // rules are for. AC3's own target is 360px.
    if (gdx2ScWidth >= 360) {
      expect(m.rowScrollWidth).toBeLessThanOrEqual(m.rowClientWidth);
    }
  });
}

test('css-audit — .xpl-panel scrolls its table rather than clipping at 360px (gdx-2 AC3)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const html = [
    '<div class="xpl-panel"><table class="xpl-table"><tbody>',
    '<tr><td>Attributes purchased during character creation</td><td class="xpl-n">120</td><td class="xpl-n">120</td></tr>',
    '<tr><td>Skills purchased after the chronicle began</td><td class="xpl-n">64</td><td class="xpl-n">64</td></tr>',
    '</tbody></table></div>',
  ].join('');
  const m = await gdx2MeasureInTab(page, html, '.xpl-panel');
  expect(m.tabScrollWidth).toBeLessThanOrEqual(m.tabClientWidth);
  expect(['auto', 'scroll']).toContain(m.probeOverflowX);
});

// 320px is included deliberately. A global box-sizing:border-box means the old
// flat min-width:360px measured exactly 360px at a 360px viewport, so it fitted
// there by a hair and 360px alone would not discriminate. Below 360px it did
// overflow, which is what min(360px, 100%) actually buys.
for (const gdx2ModalWidth of [320, 360]) {
  test('css-audit — .npcr-modal fits a ' + gdx2ModalWidth + 'px viewport (gdx-2 AC3)', async ({ page }) => {
    await page.setViewportSize({ width: gdx2ModalWidth, height: 800 });
    await page.goto('/');
    const m = await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.className = 'npcr-modal-overlay';
      overlay.innerHTML = '<div class="npcr-modal"><div class="npcr-modal-title">Confirm</div></div>';
      document.body.appendChild(overlay);
      const out = {
        width: overlay.querySelector('.npcr-modal').getBoundingClientRect().width,
        overlayScrollWidth: overlay.scrollWidth,
        overlayClientWidth: overlay.clientWidth,
      };
      document.body.removeChild(overlay);
      return out;
    });
    expect(m.width).toBeLessThanOrEqual(gdx2ModalWidth);
    expect(m.overlayScrollWidth).toBeLessThanOrEqual(m.overlayClientWidth);
  });
}

// gdx-2 AC4: the two grids the 360px sweep proved broken. .prestige-row and
// .sidebar-app-grid were checked in the same sweep and needed no fix, so they
// get no rule and no test here.
//
// gdx-2 review patch: the .more-section-grid fixture now carries the REAL label
// set from MORE_APPS (public/js/app.js), not invented ones. The invented set
// happened to omit "Emergency", the worst case, which is how a live overflow of
// the .more-app-icon box got past this test the first time.
const GDX2_MORE_APP_LABELS = [
  'Feeding', 'Territory', 'Approval Queue', 'Downtime', 'Ordeals', 'Tracker',
  'Combat', 'Spheres', 'Check-In', 'Emergency', 'Regency', 'Office', 'Story',
];

// Mirrors what renderMoreTab (public/js/app.js) actually emits, .more-grid-wrap
// and its 16px side padding included. The earlier fixture omitted the wrapper,
// which gave the grid 32px more room than it has in the real app and is the
// second reason the "Emergency" spill went unmeasured.
function gdx2MoreGridHtml() {
  return '<div class="more-grid-wrap"><div class="more-section"><div class="more-section-label">Chronicle</div><div class="more-section-grid">'
    + GDX2_MORE_APP_LABELS
      .map((l) => '<button class="more-app-icon"><span class="more-app-icon-svg"><svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20"/></svg></span><span class="more-app-label">' + l + '</span></button>')
      .join('')
    + '</div></div></div>';
}

const GDX2_AC4_CASES = {
  '.more-section-grid': {
    tabId: 't-more',
    html: gdx2MoreGridHtml(),
  },
  '.sheet-picker-grid': {
    tabId: 't-sheets',
    html: '<div class="sheet-picker"><div class="sheet-picker-grid">'
      + ['Aurelia Vasquez-Moreau', 'Bartholomew', 'Ceriden', 'Domitia', 'Erasmus', 'Fjodor']
        .map((n) => '<button class="sheet-char-chip"><span class="sheet-char-chip-icon"></span><span class="sheet-char-chip-name">' + n + '</span></button>')
        .join('')
      + '</div></div>',
  },
};

for (const [gdx2Grid, gdx2Case] of Object.entries(GDX2_AC4_CASES)) {
  test('css-audit — ' + gdx2Grid + ' is not clipped at 360px (gdx-2 AC4)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto('/');
    const m = await page.evaluate(({ tabId, html }) => {
      const tab = document.createElement('div');
      tab.id = tabId;
      tab.className = 'tab active';
      tab.style.display = 'block';
      tab.innerHTML = html;
      document.body.appendChild(tab);
      const right = tab.getBoundingClientRect().right;
      let worstChildOverflow = 0;
      for (const el of tab.querySelectorAll('*')) {
        worstChildOverflow = Math.max(worstChildOverflow, el.getBoundingClientRect().right - right);
      }
      const out = { sw: tab.scrollWidth, cw: tab.clientWidth, worstChildOverflow };
      document.body.removeChild(tab);
      return out;
    }, gdx2Case);
    expect(m.sw).toBeLessThanOrEqual(m.cw);
    expect(m.worstChildOverflow).toBeLessThanOrEqual(0);
  });
}

// gdx-2 review patch: body.desktop-mode .sheet-picker-grid is specificity 0,2,0
// and outranked the bare .sheet-picker-grid rule inside the max-width:480px
// block (0,1,0), so a narrow viewport with desktop mode toggled on kept six
// columns and reproduced the exact silent clip the block exists to remove
// (measured 704px scrollWidth against a 360px clientWidth). The fix matches the
// desktop-mode selector inside the media block, so this asserts the narrow case
// with desktop mode on, and the six-column layout still standing above 480px.
test('css-audit — .sheet-picker-grid is not clipped at 360px with desktop mode on (gdx-2 AC4)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/');
  const m = await page.evaluate((html) => {
    document.body.classList.add('desktop-mode');
    const tab = document.createElement('div');
    tab.id = 't-sheets';
    tab.className = 'tab active';
    tab.style.display = 'block';
    tab.innerHTML = html;
    document.body.appendChild(tab);
    const right = tab.getBoundingClientRect().right;
    let worstChildOverflow = 0;
    for (const el of tab.querySelectorAll('*')) {
      worstChildOverflow = Math.max(worstChildOverflow, el.getBoundingClientRect().right - right);
    }
    const grid = tab.querySelector('.sheet-picker-grid');
    const out = {
      sw: tab.scrollWidth,
      cw: tab.clientWidth,
      worstChildOverflow,
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    };
    document.body.removeChild(tab);
    document.body.classList.remove('desktop-mode');
    return out;
  }, GDX2_AC4_CASES['.sheet-picker-grid'].html);
  expect(m.columns, 'desktop mode still forcing six columns below 480px').toBe(4);
  expect(m.sw).toBeLessThanOrEqual(m.cw);
  expect(m.worstChildOverflow).toBeLessThanOrEqual(0);
});

test('css-audit — desktop mode keeps its six-column sheet picker above 480px (gdx-2 AC4)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const columns = await page.evaluate((html) => {
    document.body.classList.add('desktop-mode');
    const tab = document.createElement('div');
    tab.id = 't-sheets';
    tab.className = 'tab active';
    tab.style.display = 'block';
    tab.innerHTML = html;
    document.body.appendChild(tab);
    const n = getComputedStyle(tab.querySelector('.sheet-picker-grid')).gridTemplateColumns.split(' ').length;
    document.body.removeChild(tab);
    document.body.classList.remove('desktop-mode');
    return n;
  }, GDX2_AC4_CASES['.sheet-picker-grid'].html);
  expect(columns).toBe(6);
});

// gdx-2 review patch: .more-app-label had no overflow-wrap, so an unbroken label
// from the real MORE_APPS set ("Emergency" is the worst case, "Territory" close
// behind) spilled past its own .more-app-icon card by 1.2 to 6.2px at 320 to
// 360px. The grid-level test above does not catch this: the card is inside the
// grid track, so the spill is a child overflowing its parent rather than the tab.
for (const gdx2LabelWidth of [320, 360, 375]) {
  test('css-audit — .more-app-label wraps inside its card at ' + gdx2LabelWidth + 'px (gdx-2 AC4)', async ({ page }) => {
    await page.setViewportSize({ width: gdx2LabelWidth, height: 900 });
    await page.goto('/');
    const worst = await page.evaluate((html) => {
      const tab = document.createElement('div');
      tab.id = 't-more';
      tab.className = 'tab active';
      tab.style.display = 'block';
      tab.innerHTML = html;
      document.body.appendChild(tab);
      let worstOverflow = { label: '', px: 0 };
      for (const card of tab.querySelectorAll('.more-app-icon')) {
        const label = card.querySelector('.more-app-label');
        const cardRect = card.getBoundingClientRect();
        const labelRect = label.getBoundingClientRect();
        const px = Math.max(labelRect.right - cardRect.right, cardRect.left - labelRect.left);
        if (px > worstOverflow.px) worstOverflow = { label: label.textContent, px };
      }
      document.body.removeChild(tab);
      return worstOverflow;
    }, gdx2MoreGridHtml());
    expect(worst.px, 'label "' + worst.label + '" spills past its card').toBeLessThanOrEqual(0);
  });
}
