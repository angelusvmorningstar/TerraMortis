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

// ── gdx-3: 44px effective hit areas (AC1, AC2, AC3, AC5) ──────────────────────
//
// Like the gdx-2 group above, these deliberately do NOT use setupSuite(): that
// helper waits on #app becoming visible and is the root cause of this file's 12
// documented pre-existing failures. A bare page.goto('/') is enough, because the
// stylesheets are <link>ed in <head> and index.html's real #t-<tab> containers
// are in the static markup.
//
// Two things gdx-2's own review flagged, fixed here rather than repeated:
//   1. Fixtures mount inside the REAL #t-<tab> element rather than a synthetic
//      <div class="tab active"> on document.body, so the tab's own padding, its
//      overflow-x:hidden and its width cap all apply to the measurement.
//   2. The assertion is the EFFECTIVE hit area, not the visible box. A test that
//      measured only getBoundingClientRect() would fail every Technique T2 fix
//      and pass every no-op, i.e. it would be exactly backwards.

const GDX3_TAP_MIN = 44;

// Each probe mounts `html` inside the real `#${tab}`, then measures `sel`.
// `tech` records which technique the selector took, so a failure names it.
const GDX3_PROBES = [
  // ── Group 1: the issue's own named targets ──
  { sel: '.svt-btn', tech: 'T3', tab: 't-sheets',
    html: '<div class="sheet-topbar"><div class="svt-toggle"><button class="svt-btn on">Sheet</button><button class="svt-btn">DT Report</button></div></div>' },
  { sel: '.edit-tab', tech: 'T2', tab: 't-edit',
    html: '<div class="edit-header"><div class="edit-tabs"><button class="edit-tab on">Identity</button><button class="edit-tab">Attributes</button><button class="edit-tab">Skills</button></div></div>' },
  { sel: '.pref-dot', tech: 'T1', tab: 't-ordeals',
    html: '<div class="xpl-panel player-prefs-panel"><table class="pref-axes-table"><tr class="pref-axis-row"><td class="pref-axis-lbl">Sexual content</td><td class="pref-dots-cell"><div class="dot-stepper"><span class="pref-dot filled">●</span><span class="pref-dot filled">●</span><span class="pref-dot empty">●</span><span class="pref-dot empty">●</span><span class="pref-dot empty">●</span></div></td></tr></table></div>' },
  { sel: '.tbox', tech: 'T3', tab: 't-stats',
    html: '<div class="sh-tracker-boxes">' + '<div class="tbox"></div>'.repeat(9) + '</div>' },
  { sel: '.sh-tracker-info-btn', tech: 'T2', tab: 't-stats',
    html: '<div class="sh-sec"><span>Health</span><button class="sh-tracker-info-btn">?</button></div>' },
  { sel: '.trk-adj', tech: 'T2', tab: 't-tracker',
    html: '<div class="trk-wrap"><div class="trk-card"><div class="trk-row"><span class="trk-lbl">Vitae</span><div class="trk-ctr"><button class="trk-adj">−</button><span class="trk-cur">7</span><span class="trk-sep">/</span><span class="trk-max">10</span><button class="trk-adj">+</button></div></div></div></div>' },
  { sel: '.trk-adj.sm', tech: 'T2', tab: 't-tracker',
    html: '<div class="trk-wrap"><div class="trk-card"><div class="trk-row trk-row-hp"><span class="trk-lbl">Bashing</span><div class="trk-ctr"><button class="trk-adj sm">−</button><span class="trk-cur">2</span><button class="trk-adj sm">+</button></div></div></div></div>' },
  { sel: '.trk-card-hd', tech: 'T2', tab: 't-tracker',
    html: '<div class="trk-wrap"><div class="trk-card"><button class="trk-card-hd"><span class="trk-name">Aurelia</span><span class="trk-chev">›</span></button></div></div>' },
  { sel: '.trk-chip-rm', tech: 'T2', tab: 't-tracker',
    html: '<div class="trk-wrap"><div class="trk-conds"><div class="trk-cond-card"><div class="trk-cond-card-hdr"><span class="trk-cond-name">Shaken</span><button class="trk-chip-rm">× Resolve</button></div></div></div></div>' },
  { sel: '.trk-cond-sel', tech: 'T3', tab: 't-tracker',
    html: '<div class="trk-wrap"><div class="trk-conds"><div class="trk-cond-row"><select class="trk-cond-sel"><option>Shaken</option></select><button class="trk-cond-add">Add</button></div></div></div>' },
  { sel: '.trk-cond-add', tech: 'T2', tab: 't-tracker',
    html: '<div class="trk-wrap"><div class="trk-conds"><div class="trk-cond-row"><select class="trk-cond-sel"><option>Shaken</option></select><button class="trk-cond-add">Add</button></div></div></div>' },
  { sel: '.trk-reset-btn', tech: 'T2', tab: 't-tracker',
    html: '<div class="trk-wrap"><div class="trk-toolbar"><button class="trk-reset-btn">Reset all</button><span class="trk-toolbar-hint">Tap a card</span></div></div>' },

  // ── Group 2: Dice / Roll tabs ──
  { sel: '.effpool-seg--rote', tech: 'T2', tab: 't-dice',
    html: '<div class="effline"><span class="effpool-seg">Pool 7</span> <span class="effpool-seg--rote">Rote</span></div>' },
  { sel: '.effpool-spec', tech: 'T2', tab: 't-dice',
    html: '<div class="effpool-specs"><span class="effpool-spec">Interrogation</span><span class="effpool-spec on">Streetwise</span><span class="effpool-spec">Occult</span></div>' },
  { sel: '.resist-sel', tech: 'T3', tab: 't-dice',
    html: '<div class="res-hdr"><select class="resist-sel"><option>No resistance</option></select></div>' },
  { sel: '.attr-carousel-badge', tech: 'T2', tab: 't-stats',
    html: '<div class="attr-carousel-badges"><button class="attr-carousel-badge active">Mental</button><button class="attr-carousel-badge">Physical</button><button class="attr-carousel-badge">Social</button></div>' },
  { sel: '.panel-close', tech: 'T2', tab: 't-dice',
    html: '<div class="panel-section"><button class="panel-close">✕ Close</button></div>' },
  { sel: '.panel-section .cp-showall-btn', tech: 'T2', tab: 't-dice',
    html: '<div class="panel-section"><button class="cp-showall-btn">Show all</button></div>' },
  { sel: '.auspex-insight-btn', tech: 'T2', tab: 't-stats',
    html: '<div class="sh-sec"><button class="auspex-insight-btn">Auspex insight</button></div>' },
  { sel: '.rl-sec-hd', tech: 'T2', tab: 't-info',
    html: '<div class="rl-wrap"><div class="rl-section"><button class="rl-sec-hd"><span class="rl-sec-title">Combat</span><span class="rl-sec-chev">›</span></button></div></div>' },
  { sel: '.rules-panel-close', tech: 'T3', tab: 't-info',
    html: '<div class="rules-panel"><button class="rules-panel-close">Close</button></div>' },
  { sel: '#btn-contested', tech: 'T2', tab: 't-roll',
    html: '<button id="btn-contested">Contested Roll</button>' },
  { sel: '.cr-close', tech: 'T3', tab: 't-roll',
    html: '<div class="cr-box"><div class="cr-hdr"><span>Contested</span><button class="cr-close">✕</button></div></div>' },
  { sel: '.cr-type-btn', tech: 'T2', tab: 't-roll',
    html: '<div class="cr-box"><div class="cr-types"><button class="cr-type-btn on">Contested</button><button class="cr-type-btn">Resisted</button></div></div>' },
  { sel: '.cr-adj', tech: 'T3', tab: 't-roll',
    html: '<div class="cr-box"><div class="cr-ctr"><button class="cr-adj">−</button><span>4</span><button class="cr-adj">+</button></div></div>' },
  { sel: '.gcp-collapse-btn', tech: 'T2', tab: 't-roll',
    html: '<div id="roll-char-pools"><button class="gcp-collapse-btn">Hide pools</button></div>' },
  { sel: '.gcp-pool-btn', tech: 'none', tab: 't-roll',
    html: '<div id="roll-char-pools"><button class="gcp-pool-btn"><span class="gcp-pool-lbl">Dominate</span><span class="gcp-stats">7 dice</span></button></div>' },
  { sel: '.hist-clr', tech: 'T2', tab: 't-dice',
    html: '<div class="hhdr"><span>History</span><button class="hist-clr">Clear</button></div>' },
  { sel: '.rv2-adj', tech: 'T2', tab: 't-roll',
    html: '<div class="rv2-row"><button class="rv2-adj">−</button><span class="rv2-val">7</span><button class="rv2-adj">+</button></div>' },
  { sel: '.rv2-again-seg button', tech: 'T2', tab: 't-roll',
    html: '<div class="rv2-again-seg"><button class="on">10</button><button>9</button><button>8</button><button>None</button></div>' },
  { sel: '.rv2-breakdown summary', tech: 'T2', tab: 't-roll',
    html: '<details class="rv2-breakdown"><summary>Breakdown</summary><div>body</div></details>' },
  { sel: '.rv2-stake-btn', tech: 'T2', tab: 't-roll',
    html: '<div class="rv2-stake-note"><button class="rv2-stake-btn">Apply torpor</button></div>' },
  { sel: '.ch-btn', tech: 'T2', tab: 't-roll',
    html: '<div class="oaq-queue-row-wrap"><div class="oaq-queue-btns"><button class="ch-btn ch-btn-accept">Accept</button><button class="ch-btn ch-btn-decline">Decline</button></div></div>' },

  // ── Group 3: Sheet tabs ──
  { sel: '.sheet-topbar button', tech: 'T2', tab: 't-sheets',
    html: '<div class="sheet-topbar"><button>Print</button><button>Export</button></div>' },
  { sel: '.sheet-char-chip', tech: 'T2', tab: 't-sheets',
    html: '<div class="sheet-picker"><div class="sheet-picker-grid"><button class="sheet-char-chip"><span class="sheet-char-chip-icon"></span><span class="sheet-char-chip-name">Aurelia</span></button></div></div>' },
  { sel: '.rules-expander-toggle', tech: 'T2', tab: 't-powers',
    html: '<div class="rules-expander"><button class="rules-expander-toggle"><span class="rules-expander-arr">›</span>Rules</button></div>' },

  // ── Group 4: Status tab ──
  { sel: '.prestige-toggle', tech: 'T3', tab: 't-status',
    html: '<div class="prestige-board"><button class="prestige-toggle"><span>Prestige</span><span>›</span></button></div>' },
  { sel: '.st-char-dismiss', tech: 'T3', tab: 't-status',
    html: '<div class="st-char-row"><span class="prestige-name">Aurelia</span><button class="st-char-dismiss">×</button></div>' },
  { sel: '.cs-edit-close', tech: 'T2', tab: 't-status',
    html: '<div class="cs-edit-panel" style="position:relative;padding:40px"><button class="cs-edit-close">✕</button></div>' },
  // The real .cs-step-btn markup, not an invented .cs-step-row: status.js puts a
  // .cs-edit-val BETWEEN the two buttons of a .cs-edit-stepper, and office-tab.js
  // renders them as an adjacent pair inside .office-merit-stepper /
  // .office-manoeuvre-rank-stepper. The adjacent pair is the tight case and is
  // the one AC2 constrains, so that is what is probed.
  { sel: '.office-merit-stepper .cs-step-btn', tech: 'T2 (AC2 exception 32x40)', tab: 't-office',
    html: '<div class="office-merit-list">' +
      [1, 2, 3, 4].map((i) => '<div class="office-merit-row"><span class="office-merit-chip">Merit ' + i + '</span><span class="office-merit-dots">●○○</span>' +
        '<div class="cs-edit-stepper office-merit-stepper"><button class="cs-step-btn" data-merit-up="m' + i + '">▲</button><button class="cs-step-btn" data-merit-down="m' + i + '">▼</button></div></div>').join('') +
      '</div>' },
  { sel: '.cs-step-btn', tech: 'T2', tab: 't-status',
    html: '<div class="cs-edit-panel" style="position:relative;padding:20px"><div class="cs-edit-stepper"><button class="cs-step-btn">▲</button><div class="cs-edit-val">4</div><button class="cs-step-btn">▼</button></div></div>' },
  { sel: '.status-summary--toggle', tech: 'T2-before', tab: 't-status',
    html: '<div class="status-summary status-summary--toggle" role="button" tabindex="0"><div class="status-summary-pip"><div class="status-summary-shape"><span class="status-summary-n">3</span></div><span class="status-summary-lbl">City</span></div><div class="status-summary-pip"><div class="status-summary-shape"><span class="status-summary-n">2</span></div><span class="status-summary-lbl">Invictus</span></div></div>' },
  { sel: '.status-chip-st', tech: 'T2', tab: 't-status',
    html: '<div class="status-chips"><span class="status-chip status-chip-st">Invictus</span></div>' },
  { sel: '.status-ranking-sel', tech: 'T3', tab: 't-status',
    html: '<div class="status-ranking-row"><select class="status-ranking-sel"><option>Aurelia</option></select><button class="status-ranking-save">Save</button></div>' },
  { sel: '.status-ranking-save', tech: 'T2', tab: 't-status',
    html: '<div class="status-ranking-row"><select class="status-ranking-sel"><option>Aurelia</option></select><button class="status-ranking-save">Save</button></div>' },
  { sel: '.rank-mode-btn', tech: 'T2', tab: 't-status',
    html: '<div class="rank-modes"><button class="rank-mode-btn active">Clan</button><button class="rank-mode-btn">Covenant</button></div>' },
  { sel: '.rank-pill', tech: 'T2', tab: 't-status',
    html: '<div class="rank-pills"><button class="rank-pill active">Ventrue</button><button class="rank-pill">Daeva</button><button class="rank-pill">Mekhet</button></div>' },

  // ── Group 5: Feeding tab ──
  { sel: '.feed-toggle', tech: 'T2', tab: 't-feeding',
    html: '<div class="feed-sec"><button class="feed-toggle"><span class="feed-toggle-label">Feeding</span><span>›</span></button></div>' },
  { sel: '.feed-method-card', tech: 'T2', tab: 't-feeding',
    html: '<div class="feed-method-grid"><button class="feed-method-card">Hunting</button><button class="feed-method-card selected">Herd</button></div>' },
  { sel: '.feed-confirm-btn', tech: 'T2', tab: 't-feeding',
    html: '<button class="feed-confirm-btn">Confirm feeding</button>' },
  { sel: '.feed-reconfirm-btn', tech: 'T2', tab: 't-feeding',
    html: '<div class="feed-sec"><button class="feed-reconfirm-btn">Re-confirm</button></div>' },
  { sel: '.feeding-defer-btn', tech: 'T2', tab: 't-feeding',
    html: '<div class="feed-sec"><button class="feeding-defer-btn">Defer</button></div>' },

  // ── Group 6: Ordeals / XP, Archive, and the shared .qf- form primitives ──
  { sel: '.ordeal-card[data-form]', tech: 'T2', tab: 't-ordeals',
    html: '<div class="ordeal-list"><div class="ordeal-card pending" data-form="ordeal-1"><span class="ordeal-state">Pending</span><span class="ordeal-action">Open</span></div></div>' },
  { sel: '.archive-card', tech: 'T2', tab: 't-archive',
    html: '<div class="archive-grid"><div class="archive-card"><span class="archive-card-name">Kirk Grimm</span><span class="archive-card-meta">Retired</span></div></div>' },
  { sel: '.arc-doc-item', tech: 'T3', tab: 't-archive',
    html: '<div class="arc-doc-group"><div class="arc-doc-item"><span>Session 4 report</span></div><div class="arc-doc-item"><span>Session 5 report</span></div></div>' },
  { sel: '.qf-section-title', tech: 'T2', tab: 't-ordeals',
    html: '<div class="qf-section"><div class="qf-section-title">Details</div></div>' },
  { sel: '.qf-select', tech: 'T3', tab: 't-ordeals',
    html: '<div class="qf-field"><select class="qf-select"><option>Choose</option></select></div>' },
  { sel: '.qf-radio-label', tech: 'T3', tab: 't-ordeals',
    html: '<div class="qf-radio-group"><label class="qf-radio-label"><input type="radio" name="g">Yes</label><label class="qf-radio-label"><input type="radio" name="g">No</label></div>' },
  { sel: '.qf-checkbox-label', tech: 'T2', tab: 't-ordeals',
    html: '<div class="qf-field"><label class="qf-checkbox-label"><input type="checkbox">Agreed</label></div>' },
  { sel: '.qf-btn', tech: 'T2', tab: 't-ordeals',
    html: '<div class="qf-actions"><button class="qf-btn qf-btn-save">Save</button><button class="qf-btn qf-btn-submit">Submit</button></div>' },
  { sel: '.qf-back-btn', tech: 'T2', tab: 't-ordeals',
    html: '<button class="qf-back-btn">‹ Back</button>' },
  { sel: '.qf-dynlist-add', tech: 'T2', tab: 't-ordeals',
    html: '<div class="qf-dynlist"><button class="qf-dynlist-add">+ Add another</button></div>' },
  { sel: '.qf-dynlist-remove', tech: 'T2', tab: 't-ordeals',
    html: '<div class="qf-dynlist"><div class="qf-dynlist-row" style="position:relative;padding:40px"><button class="qf-dynlist-remove">×</button></div></div>' },
  { sel: '.char-picker__option', tech: 'T3', tab: 't-ordeals',
    html: '<div class="char-picker"><div class="char-picker__menu"><div class="char-picker__option">Aurelia</div><div class="char-picker__option">Mammon</div></div></div>' },
  { sel: '.char-picker__chip-remove', tech: 'T2', tab: 't-ordeals',
    html: '<div class="char-picker"><span class="char-picker__chip">Aurelia<button class="char-picker__chip-remove">×</button></span></div>' },
  { sel: '.char-picker__pill-clear', tech: 'T2', tab: 't-ordeals',
    html: '<div class="char-picker"><span class="char-picker__pill">Aurelia<button class="char-picker__pill-clear">×</button></span></div>' },

  // ── Group 7: App chrome ──
  { sel: '.login-crim-btn', tech: 'T2', tab: 't-settings',
    html: '<button class="login-crim-btn">Login with Discord</button>' },
  { sel: '.hdr-icon-wrap.has-menu', tech: 'T2-before', tab: 't-settings',
    html: '<div class="hdr-icon-wrap has-menu"><img class="hdr-icon" alt="" width="24" height="24"></div>' },
  { sel: '.hdr-char-menu-item', tech: 'T3', tab: 't-settings',
    html: '<div class="hdr-icon-wrap"><div class="hdr-char-menu" style="display:block"><button class="hdr-char-menu-item active"><span class="hdr-menu-check">✓</span><span class="hdr-char-name">Aurelia</span></button><button class="hdr-char-menu-item"><span class="hdr-menu-check"></span><span class="hdr-char-name">Mammon</span></button></div></div>' },
  { sel: '.hdr-profile', tech: 'T2', tab: 't-settings',
    html: '<div class="hdr-profile"><span>Player</span></div>' },
  { sel: '.hdr-menu-item', tech: 'T3', tab: 't-settings',
    html: '<div id="hdr-user"><div class="hdr-profile"><span>Player</span></div><div class="hdr-profile-menu"><button class="hdr-menu-item">Settings</button><button class="hdr-menu-item">Log out</button></div></div>' },
  { sel: '.pnl-confirm-btn', tech: 'T2', tab: 't-dice',
    html: '<div class="panel-section"><button class="pnl-confirm-btn">Confirm</button></div>' },
  { sel: '.import-banner-clr', tech: 'T2', tab: 't-settings',
    html: '<div class="import-banner"><span>Imported</span><button class="import-banner-clr">×</button></div>' },
  { sel: '.more-app-icon', tech: 'T2', tab: 't-more',
    html: '<div class="more-app-grid"><button class="more-app-icon"><span class="more-app-icon-svg"></span><span class="more-app-label">Territory</span></button></div>' },
  { sel: '.lifecycle-card', tech: 'T2', tab: 't-dice',
    html: '<div class="lifecycle-wrap"><button class="lifecycle-card"><span class="lifecycle-card-icon"></span><span class="lifecycle-card-text"><span class="lifecycle-card-title">Downtime open</span><span class="lifecycle-card-sub">Cycle 12</span></span><span class="lifecycle-card-arr">›</span></button></div>' },
  { sel: '.settings-toggle-btn', tech: 'T2', tab: 't-settings',
    html: '<div class="settings-toggle-row"><button class="settings-toggle-btn on">Dark</button><button class="settings-toggle-btn">Parchment</button></div>' },
  { sel: '.settings-btn', tech: 'T2', tab: 't-settings',
    html: '<button class="settings-btn">Sign out</button>' },
  { sel: '.settings-checkbox-row', tech: 'T2', tab: 't-settings',
    html: '<label class="settings-checkbox-row"><input type="checkbox">Use the new dice roller</label>' },
  { sel: '.list-filter', tech: 'T3', tab: 't-settings',
    html: '<div class="list-filters"><select class="list-filter"><option>All clans</option></select></div>' },
  { sel: '.form-select', tech: 'T3', tab: 't-office',
    html: '<div class="form-section"><select class="form-select"><option>Choose an office</option></select></div>' },
];

// Desktop-sidebar chrome. Not reachable at 360px (the sidebar is desktop-mode
// only), so it is measured in its own desktop-width test rather than folded
// into the 360px sweep.
const GDX3_SIDEBAR_PROBES = [
  { sel: '.sidebar-app-tile', tech: 'T2', mount: 'desktop-sidebar-nav',
    html: '<div class="sidebar-app-grid">' + [1, 2, 3].map((i) =>
      '<button class="sidebar-app-tile"><span class="sidebar-app-tile-icon"><svg width="18" height="18"></svg></span><span class="sidebar-app-tile-label">App ' + i + '</span></button>').join('') + '</div>' },
  // The real static node index.html ships, inside its real .sidebar-header-top.
  { sel: '.sidebar-collapse-btn', tech: 'T2', realId: 'sb-collapse-btn' },
];

// Mount each fixture in the REAL tab container, measure, restore. Returns the
// element's own box, its effective hit area, and the result of hit-testing the
// four edge midpoints of that hit area.
//
// The effective hit area is the larger of the element's own border box and the
// used box of a generated, TAPPABLE pseudo-element. pointer-events:none on the
// overlay disqualifies it: an untappable overlay would otherwise pass the size
// assertion while fixing nothing.
//
// The hit test is what actually proves AC1 and AC2 together. elementFromPoint
// respects ancestor clipping (so a T2 overlay swallowed by an overflow:hidden
// parent fails here even though its computed size says 44px) and respects paint
// order (so an overlay covered by a neighbouring control fails too). The samples
// are EDGE MIDPOINTS rather than corners on purpose: a corner sample on a
// rounded box resolves to the parent and would report a false failure.
async function gdx3Measure(page, probes) {
  return page.evaluate((list) => {
    // app.js boots on load, finds no auth token and paints the login overlay
    // over everything, which would make every hit test resolve to .login-box.
    // Reveal the real app shell instead. This is display plumbing only: no tab
    // markup, padding or width cap is touched, so the ancestor chain the
    // fixtures mount into is the one index.html actually ships.
    const login = document.getElementById('login-screen');
    if (login) login.style.display = 'none';
    const app = document.getElementById('app');
    if (app) app.style.display = 'flex';

    // app.js:1670 removes whichever of #t-dice / #t-roll the
    // tm-use-new-dice-roller preference is not using, so one of the two is
    // always absent from a booted page. Recreate it exactly as index.html
    // declares it, inside the real .tab-wrap, so the ancestor chain still holds.
    const ensureTab = (id) => {
      const found = document.getElementById(id);
      if (found) return found;
      const wrap = document.querySelector('.tab-wrap');
      if (!wrap) return null;
      const made = document.createElement('div');
      made.id = id;
      made.className = 'tab';
      wrap.appendChild(made);
      return made;
    };

    // Every .tab is position:absolute;inset:0, so two active tabs perfectly
    // overlap and the later one in the DOM wins the hit test. index.html ships
    // #t-stats with class="tab active" already on it, and it sits near the end
    // of .tab-wrap, so without this it silently swallowed the hit test for
    // every probe mounted in an earlier tab. Park them all, restore at the end.
    const parked = [...document.querySelectorAll('.tab.active')];
    for (const t of parked) t.classList.remove('active');

    const results = [];
    for (const p of list) {
      const tab = ensureTab(p.tab);
      if (!tab) { results.push({ sel: p.sel, tech: p.tech, error: 'no #' + p.tab + ' and no .tab-wrap in index.html' }); continue; }
      const saved = { cls: tab.className, html: tab.innerHTML };
      tab.className = 'tab active';
      // The fixture is inset inside the tab rather than flush against its
      // scroll edges. Without this every probe sits at the tab's own top-left
      // corner, where .tab{overflow-x:hidden} plus the top of the scroll box
      // clip the expanded area - a property of the fixture, not of the CSS, and
      // it would report a false failure on every selector at once. Real
      // surfaces sit inside a padded panel; 60px vertical is simply more than
      // half of --tap-min so the expansion always has room above and below.
      // position:relative so any absolutely-positioned menu in a fixture
      // anchors to the host the way it anchors to #hdr-user in the real DOM.
      tab.innerHTML = '<div id="gdx3-host" style="padding:60px 16px;position:relative">' + p.html + '</div>';

      const el = tab.querySelector(p.sel);
      if (!el) {
        tab.className = saved.cls; tab.innerHTML = saved.html;
        results.push({ sel: p.sel, tech: p.tech, error: 'fixture did not produce ' + p.sel });
        continue;
      }
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();

      let w = r.width, h = r.height, pseudo = null;
      for (const which of ['::after', '::before']) {
        const cs = getComputedStyle(el, which);
        if (!cs.content || cs.content === 'none' || cs.content === 'normal') continue;
        if (cs.pointerEvents === 'none') continue;
        const pw = parseFloat(cs.width), ph = parseFloat(cs.height);
        if (Number.isFinite(pw) && pw > w) { w = pw; pseudo = which; }
        if (Number.isFinite(ph) && ph > h) { h = ph; pseudo = which; }
      }

      // The overlay is top:50%/left:50% + translate(-50%,-50%), which centres it
      // on the PADDING box, not the border box. .edit-tab.on carries a 2px
      // border-bottom, so sampling from the border-box centre put the bottom
      // probe exactly 1px outside the overlay and reported a false failure.
      const cs = getComputedStyle(el);
      const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
      const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
      const cx = r.left + bl + (r.width - bl - br) / 2;
      const cy = r.top + bt + (r.height - bt - bb) / 2;
      const pts = [
        ['centre', cx, cy],
        ['top', cx, cy - h / 2 + 1],
        ['bottom', cx, cy + h / 2 - 1],
        ['left', cx - w / 2 + 1, cy],
        ['right', cx + w / 2 - 1, cy],
      ];
      const missed = [];
      for (const [name, x, y] of pts) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(hit === el || el.contains(hit))) {
          missed.push(name + ' -> ' + (hit ? (hit.tagName.toLowerCase() + '.' + (hit.className || '').toString().split(' ')[0]) : 'null'));
        }
      }

      tab.className = saved.cls; tab.innerHTML = saved.html;
      results.push({
        sel: p.sel, tech: p.tech, pseudo,
        boxW: Math.round(r.width * 100) / 100, boxH: Math.round(r.height * 100) / 100,
        hitW: Math.round(w * 100) / 100, hitH: Math.round(h * 100) / 100,
        missed,
      });
    }
    for (const t of parked) t.classList.add('active');
    return results;
  }, probes);
}

test('css-audit — the touch-target token is declared in theme.css :root as 44px (gdx-3 AC5)', async ({ page }) => {
  await page.goto('/');
  const tap = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tap-min').trim());
  expect(tap).toBe('44px');
});

// AC2's evidenced-exception list, added by the gdx-3 code review (2026-08-20).
//
// AC2 outranks AC1: where a 44px expansion would reach into a neighbouring
// control's own box, the expansion stops instead and AC1 is NOT claimed for that
// selector. Every entry here was proven necessary by the sibling-overlap test
// below, which mounts a realistic RUN of siblings rather than a single control.
//
// `minH: 'box'` means the vertical expansion is dropped entirely (the overlay is
// exactly the element's own box tall), which is the pre-gdx-3 hit behaviour, so
// the guarantee asserted is "never smaller than the visible box" rather than a
// hard-coded pixel height that would drift with the type scale. `.edit-tab`'s
// documented 28-vs-30px surprise is why these are not literals.
const GDX3_AC2_EXCEPTIONS = {
  '.effpool-spec': { minW: 44, minH: 'box' },
  '.trk-chip-rm': { minW: 44, minH: 'box' },
  '.trk-card-hd': { minW: 44, minH: 'box' },
  '.trk-adj.sm': { minW: 44, minH: 'box' },
  '.sh-tracker-info-btn': { minW: 44, minH: 'box' },
  '.rl-sec-hd': { minW: 44, minH: 'box' },
  '.status-chip-st': { minW: 44, minH: 'box' },
  '.rank-pill': { minW: 44, minH: 'box' },
  '.settings-btn': { minW: 44, minH: 'box' },
  '.settings-checkbox-row': { minW: 44, minH: 'box' },
  '.rules-expander-toggle': { minW: 44, minH: 'box' },
  '.qf-checkbox-label': { minW: 44, minH: 'box' },
  '.char-picker__chip-remove': { minW: 44, minH: 'box' },
  // The one case with a pitch that is declared in CSS rather than derived from
  // content height, so AC2's midpoint rule gives an exact answer:
  // 26px button + 6px stepper gap = 32 across, 26px + 4+4 row padding + 6px list
  // gap = 40 down.
  '.office-merit-stepper .cs-step-btn': { minW: 32, minH: 40 },
};

test('css-audit — every in-scope control has a >=44px effective hit area at 360px (gdx-3 AC1)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/');
  const measured = await gdx3Measure(page, GDX3_PROBES);
  expect(measured.length).toBe(GDX3_PROBES.length);

  const offenders = measured
    .filter((m) => {
      if (m.error) return true;
      const exc = GDX3_AC2_EXCEPTIONS[m.sel];
      const wantW = exc ? exc.minW : GDX3_TAP_MIN;
      const wantH = exc ? (exc.minH === 'box' ? m.boxH : exc.minH) : GDX3_TAP_MIN;
      return m.hitW + 0.5 < wantW || m.hitH + 0.5 < wantH;
    })
    .map((m) => (m.error ? m.sel + ': ' + m.error
      : m.sel + ' [' + m.tech + '] hit area ' + m.hitW + 'x' + m.hitH + ' (box ' + m.boxW + 'x' + m.boxH + ')'));
  expect(offenders, 'sub-44px hit area on a player game-night control').toEqual([]);
});

test('css-audit — every in-scope hit area is genuinely tappable across its full 44px at 360px (gdx-3 AC1, AC2)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/');
  const measured = await gdx3Measure(page, GDX3_PROBES);

  const offenders = measured
    .filter((m) => m.error || m.missed.length)
    .map((m) => (m.error ? m.sel + ': ' + m.error
      : m.sel + ' [' + m.tech + '] not tappable at ' + m.missed.join(', ')));
  expect(offenders, 'hit area clipped by an ancestor or covered by a neighbour').toEqual([]);
});

// ── AC2: no two in-scope hit areas overlap ────────────────────────────────────
//
// Added by the gdx-3 code review. The probes above mount ONE control (or one
// short un-wrapped row), which cannot see the failure mode AC2 is actually
// about: a run of the SAME control stacked or wrapped on a pitch shorter than
// 44px, where the later sibling's overlay reaches back over the earlier
// sibling's own visible box and steals its taps. Fourteen selectors were doing
// exactly that and were caught only once realistic sibling runs were mounted.
//
// Each fixture is a run of real siblings in its real container class. The test
// asserts two things: no pair of effective hit areas intersects, and every
// sibling's own four edge midpoints still resolve to itself.
const GDX3_SIBLING_PROBES = [
  { sel: '.rank-pill', tab: 't-status',
    html: '<div class="status-ranking-section"><div class="rank-org-section"><div class="rank-pills">' +
      ['Daeva', 'Gangrel', 'Mekhet', 'Nosferatu', 'Ventrue'].map((c, i) => '<button class="rank-pill' + (i ? '' : ' active') + '">' + c + ' <span class="rank-voter-count">3</span></button>').join('') +
      '</div></div></div>' },
  { sel: '.effpool-spec', tab: 't-dice',
    html: '<div class="effpool-specs">' + ['Interrogation', 'Streetwise', 'Occult', 'Politics', 'Subterfuge', 'Intimidation'].map((s) => '<span class="effpool-spec">' + s + '</span>').join('') + '</div>' },
  { sel: '.qf-checkbox-label', tab: 't-ordeals',
    html: '<div class="qf-checkbox-group">' + ['Blood', 'Status', 'Territory', 'Influence', 'Herd', 'Retainer', 'Haven', 'Allies'].map((s) => '<label class="qf-checkbox-label"><input type="checkbox">' + s + '</label>').join('') + '</div>' },
  { sel: '.status-chip-st', tab: 't-status',
    html: '<div class="status-chips">' + ['Invictus', 'Ventrue', 'City', 'Praxis', 'Harpy', 'Sheriff'].map((s) => '<span class="status-chip status-chip-st">' + s + '</span>').join('') + '</div>' },
  { sel: '.settings-checkbox-row', tab: 't-settings',
    html: '<div class="settings-section">' + ['Use the new dice roller', 'Show rules text inline', 'Compact sheet'].map((s) => '<label class="settings-checkbox-row"><input type="checkbox">' + s + '</label>').join('') + '</div>' },
  { sel: '.rules-expander-toggle', tab: 't-powers',
    html: [1, 2, 3].map((i) => '<div class="rules-expander"><button class="rules-expander-toggle"><span class="rules-expander-arr">›</span>Rules ' + i + '</button><div class="rules-expander-body">x</div></div>').join('') },
  { sel: '.attr-carousel-badge', tab: 't-stats',
    html: '<div class="attr-carousel-badges"><button class="attr-carousel-badge active">Mental</button><button class="attr-carousel-badge">Physical</button><button class="attr-carousel-badge">Social</button></div>' },
  { sel: '.rank-mode-btn', tab: 't-status',
    html: '<div class="rank-modes"><button class="rank-mode-btn active">Clan</button><button class="rank-mode-btn">Covenant</button><button class="rank-mode-btn">City</button><button class="rank-mode-btn">Political</button></div>' },
  { sel: '.trk-chip-rm', tab: 't-tracker',
    html: '<div class="trk-conds">' + [1, 2, 3].map((i) => '<div class="trk-cond-card"><div class="trk-cond-card-hdr"><span class="trk-cond-name">Cond ' + i + '</span><button class="trk-chip-rm">× Resolve</button></div></div>').join('') + '</div>' },
  { sel: '.trk-adj', tab: 't-tracker',
    html: '<div class="trk-card">' + [1, 2, 3].map((i) => '<div class="trk-row"><span class="trk-lbl">Row ' + i + '</span><div class="trk-ctr"><button class="trk-adj">−</button><span class="trk-cur">7</span><span class="trk-sep">/</span><span class="trk-max">10</span><button class="trk-adj">+</button></div></div>').join('') + '</div>' },
  { sel: '.trk-adj.sm', tab: 't-tracker',
    html: '<div class="trk-card"><div class="trk-row trk-row-hp"><span class="trk-lbl">Bashing</span><div class="trk-ctr"><button class="trk-adj sm">−</button><span class="trk-cur">2</span><button class="trk-adj sm">+</button></div><span class="trk-lbl">Lethal</span><div class="trk-ctr"><button class="trk-adj sm">−</button><span class="trk-cur">1</span><button class="trk-adj sm">+</button></div></div></div>' },
  { sel: '.trk-card-hd', tab: 't-tracker',
    html: '<div class="trk-wrap">' + [1, 2, 3].map((i) => '<div class="trk-card"><button class="trk-card-hd"><span class="trk-name">Char ' + i + '</span><span class="trk-chev">›</span></button></div>').join('') + '</div>' },
  { sel: '.sheet-char-chip', tab: 't-sheets',
    html: '<div class="sheet-picker"><div class="sheet-picker-grid">' + [1, 2, 3, 4, 5, 6, 7, 8].map((i) => '<button class="sheet-char-chip"><span class="sheet-char-chip-icon"></span><span class="sheet-char-chip-name">Char ' + i + '</span></button>').join('') + '</div></div>' },
  { sel: '.feed-method-card', tab: 't-feeding',
    html: '<div class="feed-methods">' + [1, 2, 3, 4].map((i) => '<button class="feed-method-card">Method ' + i + '</button>').join('') + '</div>' },
  { sel: '.ordeal-card[data-form]', tab: 't-ordeals',
    html: '<div class="ordeal-list">' + [1, 2, 3].map((i) => '<div class="ordeal-card pending" data-form="o' + i + '"><span class="ordeal-state">Pending</span><span class="ordeal-action">Open</span></div>').join('') + '</div>' },
  { sel: '.archive-card', tab: 't-archive',
    html: '<div class="archive-grid">' + [1, 2, 3, 4].map((i) => '<div class="archive-card"><span class="archive-card-name">Char ' + i + '</span><span class="archive-card-meta">Retired</span></div>').join('') + '</div>' },
  { sel: '.qf-btn', tab: 't-ordeals',
    html: '<div class="qf-actions"><button class="qf-btn qf-btn-save">Save</button><button class="qf-btn qf-btn-submit">Submit</button><button class="qf-btn">Cancel</button></div>' },
  { sel: '.settings-btn', tab: 't-settings',
    html: '<div class="settings-section">' + [1, 2, 3].map((i) => '<button class="settings-btn">Action ' + i + '</button>').join('') + '</div>' },
  { sel: '.settings-toggle-btn', tab: 't-settings',
    html: '<div class="settings-toggle-row"><button class="settings-toggle-btn on">Dark</button><button class="settings-toggle-btn">Parchment</button></div>' },
  { sel: '.qf-section-title', tab: 't-ordeals',
    html: [1, 2, 3].map((i) => '<div class="qf-section"><div class="qf-section-title">Section ' + i + '</div><p>body</p></div>').join('') },
  { sel: '.char-picker__chip-remove', tab: 't-ordeals',
    html: '<div class="char-picker"><div class="char-picker__chips">' + [1, 2, 3, 4].map((i) => '<span class="char-picker__chip">Char ' + i + '<button class="char-picker__chip-remove">×</button></span>').join('') + '</div></div>' },
  { sel: '.rl-sec-hd', tab: 't-info',
    html: '<div class="rl-wrap">' + [1, 2, 3].map((i) => '<div class="rl-section"><button class="rl-sec-hd"><span class="rl-sec-title">Section ' + i + '</span><span class="rl-sec-chev">›</span></button></div>').join('') + '</div>' },
  { sel: '.lifecycle-card', tab: 't-dice',
    html: '<div class="lifecycle-wrap">' + [1, 2].map((i) => '<button class="lifecycle-card"><span class="lifecycle-card-icon"></span><span class="lifecycle-card-text"><span class="lifecycle-card-title">Item ' + i + '</span><span class="lifecycle-card-sub">Cycle 12</span></span><span class="lifecycle-card-arr">›</span></button>').join('') + '</div>' },
  { sel: '.cs-step-btn', tab: 't-office',
    html: '<div class="office-merit-list">' + [1, 2, 3, 4].map((i) => '<div class="office-merit-row"><span class="office-merit-chip">Merit ' + i + '</span><span class="office-merit-dots">●○○</span>' +
      '<div class="cs-edit-stepper office-merit-stepper"><button class="cs-step-btn" data-merit-up="m' + i + '">▲</button><button class="cs-step-btn" data-merit-down="m' + i + '">▼</button></div></div>').join('') + '</div>' },
  { sel: '.sh-tracker-info-btn', tab: 't-stats',
    html: [1, 2, 3].map((i) => '<div class="sh-tracker-row"><span class="sh-tracker-lbl">Track ' + i + '</span><button class="sh-tracker-info-btn">?</button></div>').join('') },
  { sel: '.qf-dynlist-add', tab: 't-ordeals',
    html: '<div class="qf-dynlist"><div class="qf-dynlist-entry">a</div><button class="qf-dynlist-add">+ Add another</button></div><div class="qf-dynlist"><div class="qf-dynlist-entry">b</div><button class="qf-dynlist-add">+ Add another</button></div>' },
  { sel: '.pref-dot', tab: 't-ordeals',
    html: '<div class="xpl-panel player-prefs-panel"><table class="pref-axes-table">' +
      ['Sexual content', 'Violence'].map((lbl) => '<tr class="pref-axis-row"><td class="pref-axis-lbl">' + lbl + '</td><td class="pref-dots-cell"><div class="dot-stepper">' +
        '<span class="pref-dot filled">●</span><span class="pref-dot filled">●</span><span class="pref-dot empty">●</span><span class="pref-dot empty">●</span><span class="pref-dot empty">●</span></div></td></tr>').join('') +
      '</table></div>' },
];

test('css-audit — no two sibling hit areas overlap at 360px (gdx-3 AC2)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/');
  const measured = await page.evaluate((list) => {
    const login = document.getElementById('login-screen');
    if (login) login.style.display = 'none';
    const app = document.getElementById('app');
    if (app) app.style.display = 'flex';
    const parked = [...document.querySelectorAll('.tab.active')];
    for (const t of parked) t.classList.remove('active');

    const out = [];
    for (const p of list) {
      const tab = document.getElementById(p.tab);
      if (!tab) { out.push({ sel: p.sel, error: 'no #' + p.tab }); continue; }
      const saved = { cls: tab.className, html: tab.innerHTML };
      tab.className = 'tab active';
      tab.innerHTML = '<div id="gdx3-host" style="padding:60px 16px;position:relative">' + p.html + '</div>';
      const els = [...tab.querySelectorAll(p.sel)];
      if (els.length < 2) {
        tab.className = saved.cls; tab.innerHTML = saved.html;
        out.push({ sel: p.sel, error: 'fixture produced ' + els.length + ' of ' + p.sel + ', need at least 2' });
        continue;
      }
      const zones = els.map((el) => {
        const r = el.getBoundingClientRect();
        let w = r.width, h = r.height;
        for (const which of ['::after', '::before']) {
          const cs = getComputedStyle(el, which);
          if (!cs.content || cs.content === 'none' || cs.content === 'normal') continue;
          if (cs.pointerEvents === 'none') continue;
          const pw = parseFloat(cs.width), ph = parseFloat(cs.height);
          if (Number.isFinite(pw) && pw > w) w = pw;
          if (Number.isFinite(ph) && ph > h) h = ph;
        }
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        return { el, r, cx, cy, l: cx - w / 2, rt: cx + w / 2, t: cy - h / 2, b: cy + h / 2 };
      });
      const overlaps = [];
      for (let i = 0; i < zones.length; i++) {
        for (let j = i + 1; j < zones.length; j++) {
          const a = zones[i], b = zones[j];
          const ox = Math.min(a.rt, b.rt) - Math.max(a.l, b.l);
          const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
          if (ox > 0.5 && oy > 0.5) overlaps.push('[' + i + ',' + j + '] by ' + Math.round(ox * 10) / 10 + 'x' + Math.round(oy * 10) / 10);
        }
      }
      const missed = [];
      zones.forEach((z, i) => {
        // Skip siblings the fixture pushed outside the viewport: elementFromPoint
        // returns null there, which is a property of the fixture, not the CSS.
        if (z.t < 0 || z.b > window.innerHeight || z.l < 0 || z.rt > window.innerWidth) return;
        for (const [n, x, y] of [['top', z.cx, z.t + 1], ['bottom', z.cx, z.b - 1], ['left', z.l + 1, z.cy], ['right', z.rt - 1, z.cy]]) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || !(hit === z.el || z.el.contains(hit))) {
            missed.push('#' + i + ' ' + n + ' -> ' + (hit ? hit.tagName.toLowerCase() + '.' + String(hit.className || '').split(' ')[0] : 'null'));
          }
        }
      });
      tab.className = saved.cls; tab.innerHTML = saved.html;
      out.push({ sel: p.sel, n: els.length, overlaps, missed });
    }
    for (const t of parked) t.classList.add('active');
    return out;
  }, GDX3_SIBLING_PROBES);

  const offenders = measured
    .filter((m) => m.error || m.overlaps.length || m.missed.length)
    .map((m) => (m.error ? m.sel + ': ' + m.error
      : m.sel + ' (' + m.n + ' siblings) overlaps ' + JSON.stringify(m.overlaps) + ' misses ' + JSON.stringify(m.missed)));
  expect(offenders, 'a hit area reaches into a sibling control (AC2)').toEqual([]);
});

// Run in BOTH sidebar states. The collapsed strip is the one that matters and
// the one the first version of this test missed: it only added body.desktop-mode
// and read computed sizes, so it measured the 66px expanded tile and never
// hit-tested. In the collapsed strip the tile is 40x40 and carries its own
// overflow:hidden, which silently swallowed the whole 44px overlay - a false
// green that the review round's added elementFromPoint sweep turns red.
test('css-audit — the desktop sidebar chrome has a >=44px hit area, expanded and collapsed (gdx-3 AC1)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const measured = await page.evaluate((list) => {
    const login = document.getElementById('login-screen');
    if (login) login.style.display = 'none';
    const app = document.getElementById('app');
    if (app) app.style.display = 'flex';
    document.body.classList.add('desktop-mode');
    const sidebar = document.getElementById('desktop-sidebar');
    const out = [];
    for (const mode of ['expanded', 'collapsed']) {
      if (mode === 'collapsed') {
        // Exactly what toggleSidebarCollapse() sets.
        document.body.classList.add('sidebar-collapsed');
        sidebar.classList.add('collapsed');
      }
      for (const p of list) {
        if (!sidebar) { out.push({ sel: p.sel, mode, error: 'no #desktop-sidebar' }); continue; }
        // Mount inside the real container the app renders this control into
        // (#desktop-sidebar-nav for the app tiles), or use the real static node
        // index.html already ships (#sb-collapse-btn), rather than appending a
        // bare host to the sidebar root: the root has no padding, so a 44px
        // expansion on a control flush against its left edge sampled off-screen
        // and reported a meaningless null.
        let el, host = null;
        if (p.realId) {
          el = document.getElementById(p.realId);
          if (!el) { out.push({ sel: p.sel, mode, error: 'no #' + p.realId + ' in index.html' }); continue; }
        } else {
          host = document.createElement('div');
          host.innerHTML = p.html;
          (document.getElementById(p.mount) || sidebar).appendChild(host);
          el = host.querySelector(p.sel);
        }
        const r = el.getBoundingClientRect();
        let w = r.width, h = r.height;
        const cs = getComputedStyle(el, '::after');
        if (cs.content && cs.content !== 'none' && cs.pointerEvents !== 'none') {
          w = Math.max(w, parseFloat(cs.width) || 0);
          h = Math.max(h, parseFloat(cs.height) || 0);
        }
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const missed = [];
        // 2px inset rather than 1px, only here: the collapsed strip is exactly
        // 56px wide and #desktop-sidebar carries overflow:hidden, so the
        // collapse button's 44px overlay ends flush with that clip edge and the
        // final pixel is subpixel-unreliable. Measured: the button is hit
        // continuously from x=12 to x=54 inside a 12..56 overlay.
        for (const [n, x, y] of [['centre', cx, cy], ['top', cx, cy - h / 2 + 2], ['bottom', cx, cy + h / 2 - 2], ['left', cx - w / 2 + 2, cy], ['right', cx + w / 2 - 2, cy]]) {
          // A sample outside the viewport is a property of the fixture, not the
          // CSS: elementFromPoint returns null there whatever the overlay does.
          if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
          const hit = document.elementFromPoint(x, y);
          if (!hit || !(hit === el || el.contains(hit))) missed.push(n + ' -> ' + (hit ? hit.tagName.toLowerCase() + '.' + String(hit.className || '').split(' ')[0] : 'null'));
        }
        out.push({ sel: p.sel, mode, boxW: Math.round(r.width * 100) / 100, boxH: Math.round(r.height * 100) / 100, hitW: Math.round(w * 100) / 100, hitH: Math.round(h * 100) / 100, missed });
        if (host) host.remove();
      }
    }
    document.body.classList.remove('desktop-mode', 'sidebar-collapsed');
    sidebar.classList.remove('collapsed');
    return out;
  }, GDX3_SIDEBAR_PROBES);

  const offenders = measured
    .filter((m) => m.error || m.hitW < GDX3_TAP_MIN || m.hitH < GDX3_TAP_MIN || m.missed.length)
    .map((m) => m.error || (m.sel + ' [' + m.mode + '] hit area ' + m.hitW + 'x' + m.hitH + ' (box ' + m.boxW + 'x' + m.boxH + ')' + (m.missed.length ? ' not tappable at ' + m.missed.join(', ') : '')));
  expect(offenders).toEqual([]);
});

// AC3, the other half of the story: the hit area grew, the VISIBLE box did not.
//
// Measured at 1280px, where none of the three Technique T3 media-query rules
// apply, so every one of these boxes must still be exactly what its own rule
// authored. A future "simplification" that swaps a T2 overlay for a min-height
// turns this red, which is the whole point: T2 exists precisely because these
// boxes are painted and must not grow.
const GDX3_UNCHANGED_AT_DESKTOP = [
  { sel: '.svt-btn', tab: 't-sheets', h: 24 },
  { sel: '.edit-tab', tab: 't-edit', h: 30 },
  { sel: '.tbox', tab: 't-stats', w: 34, h: 30 },

  { sel: '.rv2-adj', tab: 't-roll', w: 36, h: 36 },
  { sel: '.trk-adj', tab: 't-tracker', w: 28, h: 28 },
  { sel: '.sh-tracker-info-btn', tab: 't-stats', w: 16, h: 16 },
];

test('css-audit — the T1/T2 fixes did not grow the visible box on desktop (gdx-3 AC3)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const byName = new Map(GDX3_PROBES.map((p) => [p.sel, p]));
  const probes = GDX3_UNCHANGED_AT_DESKTOP.map((u) => ({ ...byName.get(u.sel), tab: u.tab }));
  const measured = await gdx3Measure(page, probes);

  const drift = [];
  measured.forEach((m, i) => {
    const want = GDX3_UNCHANGED_AT_DESKTOP[i];
    if (m.error) { drift.push(m.sel + ': ' + m.error); return; }
    if (want.w !== undefined && Math.abs(m.boxW - want.w) > 0.5) drift.push(m.sel + ' visible width ' + m.boxW + ', expected ' + want.w);
    if (want.h !== undefined && Math.abs(m.boxH - want.h) > 0.5) drift.push(m.sel + ' visible height ' + m.boxH + ', expected ' + want.h);
  });
  expect(drift, 'a hit-area fix changed the visible box on desktop').toEqual([]);
});

// AC3 for .pref-dot. It shipped as T1 (38 -> 44 box plus a compensating negative
// margin) and the code review moved it to T2, so the guarantee is now the strong
// one AC3 actually asks for: the ELEMENT's own box is unchanged at 38x38, and
// the layout it sits in is unchanged too. Both are asserted, because the box
// assertion is what stops a future revert to the margin trick.
test('css-audit — .pref-dot keeps its pre-gdx-3 box, pitch and row height (gdx-3 AC3, AC4)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/');
  const m = await page.evaluate((html) => {
    const login = document.getElementById('login-screen');
    if (login) login.style.display = 'none';
    const app = document.getElementById('app');
    if (app) app.style.display = 'flex';
    const tab = document.getElementById('t-ordeals');
    const saved = { cls: tab.className, html: tab.innerHTML };
    tab.className = 'tab active';
    tab.innerHTML = html;
    const rects = [...tab.querySelectorAll('.pref-dot')].map((d) => d.getBoundingClientRect());
    const row = tab.querySelector('.pref-axis-row .pref-dots-cell').getBoundingClientRect();
    const stepper = tab.querySelector('.pref-dots-cell .dot-stepper').getBoundingClientRect();
    const out = {
      boxW: Math.round(rects[0].width * 100) / 100,
      boxH: Math.round(rects[0].height * 100) / 100,
      pitch: Math.round((rects[1].left - rects[0].left) * 100) / 100,
      firstGlyphOffset: Math.round((rects[0].left + rects[0].width / 2 - stepper.left) * 100) / 100,
      rowHeight: Math.round(row.height * 100) / 100,
      overlaps: rects.slice(1).filter((r, i) => r.left < rects[i].right - 0.5).length,
    };
    tab.className = saved.cls; tab.innerHTML = saved.html;
    return out;
  }, GDX3_PROBES.find((p) => p.sel === '.pref-dot').html);

  expect(m.boxW, '.pref-dot own box width drifted from its pre-gdx-3 38px (AC3)').toBeCloseTo(38, 1);
  expect(m.boxH, '.pref-dot own box height drifted from its pre-gdx-3 38px (AC3)').toBeCloseTo(38, 1);
  expect(m.pitch, 'glyph pitch drifted from its pre-gdx-3 46px').toBeCloseTo(46, 1);
  expect(m.firstGlyphOffset, 'the first dot glyph shifted from its pre-gdx-3 19px inset').toBeCloseTo(19, 1);
  expect(m.rowHeight, 'the preference row got taller than its pre-gdx-3 66px').toBeCloseTo(66, 1);
  expect(m.overlaps, 'two .pref-dot hit areas overlap').toBe(0);
});

// ── gdx-4: CSS standards cleanup (issue #985, absorbing #859) ─────────────────
//
// AC4 and AC6 are computed-style properties, so they live here rather than in
// `server/tests/gdx-4-css-standards-grep.test.js`, which owns the source-text
// half (AC1, AC2, AC3). Two AC4 assertions already existed before this story and
// keep working for free: `story-split is single column on phone` and its
// `tab-split` twin, above.
//
// None of these uses `setupSuite()`. That helper waits on `#app` becoming
// visible and is the root cause of the 12 pre-existing failures CLAUDE.md
// documents for this file; gdx-1, gdx-2 and gdx-3 all used a bare `page.goto()`
// for the same reason.

/**
 * Mount a probe node, read computed values off it, then remove it.
 *
 * Appending to `document.body` is safe for every selector below: none of them
 * depends on an ancestor's padding or width cap (the gdx-1/gdx-2 viewport trap),
 * because each is a flex/grid container or a colour-only rule measured on itself.
 */
async function gdx4Probe(page, className, props, theme) {
  return page.evaluate(({ className, props, theme }) => {
    const root = document.documentElement;
    const had = root.getAttribute('data-theme');
    if (theme) root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');

    const el = document.createElement('div');
    el.className = className;
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of props) out[p] = cs[p];
    // Read the tokens off :root in the SAME call and under the SAME theme, so
    // the expectation survives a token retune instead of pinning rgb literals.
    const rootCs = getComputedStyle(root);
    out._tokens = {
      crim: rootCs.getPropertyValue('--crim').trim(),
      txtOnDark: rootCs.getPropertyValue('--txt-on-dark').trim(),
      crim2: rootCs.getPropertyValue('--crim2').trim(),
    };
    document.body.removeChild(el);

    if (had === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', had);
    return out;
  }, { className, props, theme });
}

/** Resolve a hex/keyword colour to the `rgb(...)` string getComputedStyle returns. */
async function gdx4Resolve(page, value) {
  return page.evaluate((v) => {
    const el = document.createElement('div');
    el.style.color = v;
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    document.body.removeChild(el);
    return c;
  }, value);
}

test('css-audit — .story-split keeps gap:16px at 390px after the duplicate-block merge (gdx-4 AC4)', async ({ page }) => {
  // The highest-value assertion in the story. `.story-split` was declared TWICE,
  // thirty lines apart: block one with `gap: 20px`, block two with `gap: 16px`
  // and `!important`. Block two won, so 16px is the shipped value. A merge that
  // keeps block one's 20px is a silent 4px shift on every phone downtime report
  // and nothing else in the suite would catch it.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const m = await gdx4Probe(page, 'story-split', ['display', 'flexDirection', 'rowGap', 'columnGap']);
  expect(m.display).toBe('flex');
  expect(m.flexDirection).toBe('column');
  expect(m.rowGap, 'the merge picked up the losing block 20px value').toBe('16px');
  expect(m.columnGap).toBe('16px');
});

test('css-audit — .story-split is a two-track grid with a 28px gutter at 900px (gdx-4 AC4)', async ({ page }) => {
  // The desktop half of the merge, and the assertion that proves dropping
  // `!important` from the media block did not drop the media block with it.
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/');
  const m = await gdx4Probe(page, 'story-split', ['display', 'gridTemplateColumns', 'columnGap', 'alignItems']);
  expect(m.display).toBe('grid');
  expect(m.columnGap).toBe('28px');
  expect(m.alignItems).toBe('start');
  // Two tracks, equal to each other. Compared rather than pinned, because the
  // resolved px depends on the probe's own width.
  const tracks = m.gridTemplateColumns.split(/\s+/).filter(Boolean).map(parseFloat);
  expect(tracks, 'not two tracks').toHaveLength(2);
  expect(tracks[0]).toBeCloseTo(tracks[1], 1);
});

test('css-audit — .sh-attr-grid and .skill-grid are single-track at 390px without !important (gdx-4 AC4)', async ({ page }) => {
  // Both rules dropped a redundant `!important` that only ever beat a
  // components.css rule of identical specificity which index.html already loads
  // first. If source order were not in fact deciding it, these go to three
  // tracks (`.sh-attr-grid`) or two (`.skill-grid`).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const cls of ['sh-attr-grid', 'skill-grid']) {
    const m = await gdx4Probe(page, cls, ['gridTemplateColumns', 'rowGap']);
    const tracks = m.gridTemplateColumns.split(/\s+/).filter(Boolean);
    expect(tracks, `.${cls} is no longer single-column at 390px`).toHaveLength(1);
    expect(m.rowGap, `.${cls} lost its 12px gap`).toBe('12px');
  }
});

test('css-audit — #bnav keeps a resolved opaque mask stop at 390px after tokenising (gdx-4 AC3)', async ({ page }) => {
  // `var()` inside a gradient resolves at computed-value time, so a token that
  // does not exist shows up here as `none` or as an unresolved string rather
  // than as a broken pixel someone has to notice by eye.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const mask = await page.evaluate(() => {
    const el = document.getElementById('bnav');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return cs.maskImage && cs.maskImage !== 'none' ? cs.maskImage : cs.webkitMaskImage;
  });
  expect(mask, '#bnav is missing from the page').not.toBeNull();
  expect(mask).toContain('linear-gradient');
  expect(mask, 'the --ink-black token did not resolve inside the gradient').not.toContain('var(');
  expect(mask, 'the opaque stops are gone').toMatch(/rgb\(0,\s*0,\s*0\)|#000|black/i);
});

test('css-audit — .city-stat-glyph resolves to --txt-on-dark in both themes (gdx-4 AC6)', async ({ page }) => {
  // Was `#fff`. The token is theme-invariant Parchment cream (#F4EFE4), so the
  // Parchment theme gets a small deliberate warm shift; the assertion reads the
  // token off :root in the same call rather than hard-coding rgb(244,239,228),
  // so a retune of the token does not turn this red for the wrong reason.
  await page.goto('/');
  for (const theme of [null, 'dark']) {
    const m = await gdx4Probe(page, 'city-stat-glyph', ['color'], theme);
    const want = await gdx4Resolve(page, m._tokens.txtOnDark);
    expect(m.color, `theme=${theme || 'parchment'}`).toBe(want);
  }
});

test('css-audit — .feed-confirm-btn.is-error matches --crim on --txt-on-dark in both themes (gdx-4 AC1, AC6)', async ({ page }) => {
  // Replaces `btn.style.background = 'var(--crim)'` + `btn.style.color = '#fff'`
  // with one class toggle, so the pair moved into CSS together. --crim DOES flip
  // between themes (#7A0000 Parchment / #8B0000 dark), which is exactly why the
  // expectation is read from the token rather than pinned.
  await page.goto('/');
  for (const theme of [null, 'dark']) {
    const m = await gdx4Probe(page, 'feed-confirm-btn is-error', ['backgroundColor', 'color'], theme);
    expect(m.backgroundColor, `background, theme=${theme || 'parchment'}`)
      .toBe(await gdx4Resolve(page, m._tokens.crim));
    expect(m.color, `text, theme=${theme || 'parchment'}`)
      .toBe(await gdx4Resolve(page, m._tokens.txtOnDark));
  }
});

test('css-audit — .dt-equipment-tweak-warn is declared and resolves to --crim2 (gdx-4 AC2, AC6)', async ({ page }) => {
  // The class the EQC-4 markup already carried but which no stylesheet declared,
  // which is why its colour was inlined as `#b23`. --crim2 is the repo's soft
  // warning red and the #854 precedent for this exact case.
  await page.goto('/');
  for (const theme of [null, 'dark']) {
    const m = await gdx4Probe(page, 'dt-equipment-tweak-warn', ['color', 'marginLeft'], theme);
    expect(m.color, `theme=${theme || 'parchment'}`).toBe(await gdx4Resolve(page, m._tokens.crim2));
    expect(m.marginLeft).toBe('6px');
  }
});

test('css-audit — .ns-field-grid and .dev-preview-btn are declared in admin-layout.css (gdx-4 AC4, AC6)', async ({ page }) => {
  // Both are admin-only classes and `index.html` does not load
  // `admin-layout.css`, so this one test navigates to the admin app. It stops at
  // the login screen without auth, which is fine: the stylesheets are linked in
  // the document head and the CSSOM is populated regardless.
  await page.goto('/admin.html');

  const found = await page.evaluate(() => {
    const want = new Set(['.ns-field-grid', '.dev-preview-btn']);
    const hit = {};

    // CSSOM walk trap, paid for once by gdx-2 and re-warned by gdx-3: with CSS
    // Nesting a plain CSSStyleRule ALSO exposes an empty `cssRules` list, so the
    // obvious `if (rule.cssRules) { recurse; continue; }` shape silently skips
    // every style rule in the sheet. Read the declaration FIRST, then recurse
    // only when there is genuinely something to recurse into.
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.selectorText && want.has(rule.selectorText)) {
          hit[rule.selectorText] = rule.style.cssText;
        }
        if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules); } catch { /* cross-origin (Google Fonts) */ }
    }
    return hit;
  });

  expect(found['.ns-field-grid'], '.ns-field-grid is not declared').toBeTruthy();
  expect(found['.ns-field-grid']).toContain('grid');
  expect(found['.ns-field-grid']).toContain('160px');

  // The one declared AC6 exception: this button's hard-coded dark greys
  // (#333/#aaa/#555) became tokens, so it changes appearance in the default
  // Parchment theme. That is the fix, not a regression - it renders only when
  // location.hostname === 'localhost', so no deployed user sees either version.
  expect(found['.dev-preview-btn'], '.dev-preview-btn is not declared').toBeTruthy();
  expect(found['.dev-preview-btn']).toContain('var(--surf2)');
  expect(found['.dev-preview-btn']).toContain('var(--txt3)');
  expect(found['.dev-preview-btn']).toContain('var(--bdr2)');
  expect(found['.dev-preview-btn'], 'a literal grey came back').not.toMatch(/#[0-9a-f]{3,8}/i);
});
