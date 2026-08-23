// rlv.1 — combat-tab.js's Quick Roll no longer silently no-ops when the new
// dice roller (`tm-use-new-dice-roller`) is active.
//
// The Combat tab itself is behind Discord OAuth, so (matching issue-1018's
// own established precedent for this exact area) this is a source-fetch
// smoke plus a boot-time check, not a full interactive click-through.
//
// The boot-time part matters beyond "does the page still load": rlv.1 makes
// combat-tab.js import `USE_NEW_ROLLER` from app.js, which already imports
// combat-tab.js — this codebase's first circular module reference. The
// import statement for combat-tab.js sits well before app.js's own
// `export const USE_NEW_ROLLER = ...` line, so this proves in a real browser
// (not just reasoned about) that the live binding resolves correctly rather
// than throwing a temporal-dead-zone error at module-evaluation time.

const { test, expect } = require('@playwright/test');

test('rlv.1 — combat-tab.js reads the shared USE_NEW_ROLLER flag, not a second inline check', async ({ request }) => {
  const res = await request.get('/js/game/combat-tab.js');
  const src = await res.text();
  expect(src).toMatch(/import\s*\{\s*USE_NEW_ROLLER\s*\}\s*from\s*['"]\.\.\/app\.js['"]/);
  expect(src).not.toMatch(/localStorage\.getItem\(\s*['"]tm-use-new-dice-roller['"]\s*\)/);
});

test('rlv.1 — quickRoll() loads the pool into whichever roller is active and navigates there', async ({ request }) => {
  const res = await request.get('/js/game/combat-tab.js');
  const src = await res.text();
  expect(src).toMatch(/import\s*\{\s*loadPool\s+as\s+loadPoolV1\s*,\s*doRoll\s*\}\s*from\s*['"]\.\.\/suite\/roll\.js['"]/);
  expect(src).toMatch(/import\s*\{\s*loadPool\s+as\s+loadPoolV2\s*\}\s*from\s*['"]\.\.\/suite\/roll-v2\.js['"]/);
  expect(src).toMatch(/USE_NEW_ROLLER\s*\?\s*loadPoolV2\s*:\s*loadPoolV1/);
  expect(src).toMatch(/window\.goTab\(\s*USE_NEW_ROLLER\s*\?\s*['"]roll['"]\s*:\s*['"]dice['"]\s*\)/);
});

test('rlv.1 — app.js exports USE_NEW_ROLLER for this one call site', async ({ request }) => {
  const res = await request.get('/js/app.js');
  const src = await res.text();
  expect(src).toMatch(/export\s+const\s+USE_NEW_ROLLER\s*=\s*localStorage\.getItem\(\s*['"]tm-use-new-dice-roller['"]\s*\)\s*===\s*['"]1['"]/);
});

// Boot-time smoke: the circular import (combat-tab.js -> app.js -> combat-tab.js)
// must not throw at module-evaluation time in either flag state. Runs against
// the login screen, same as issue-1018's own boot smoke — module-import phase
// happens before the Discord auth gate.
async function assertBootsCleanly(page, flagOn) {
  await page.goto('/');
  await page.evaluate((on) => {
    if (on) localStorage.setItem('tm-use-new-dice-roller', '1');
    else localStorage.removeItem('tm-use-new-dice-roller');
  }, flagOn);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const modErrs = errors.filter((e) => /USE_NEW_ROLLER|combat-tab|Cannot access.*before initialization|circular/i.test(e));
  expect(modErrs, `module errors: ${modErrs.join('\n')}`).toEqual([]);
}

test('rlv.1 — boots cleanly with the new roller OFF (no circular-import error)', async ({ page }) => {
  await assertBootsCleanly(page, false);
});

test('rlv.1 — boots cleanly with the new roller ON (no circular-import error)', async ({ page }) => {
  await assertBootsCleanly(page, true);
});
