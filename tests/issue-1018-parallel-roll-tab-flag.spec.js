// Smokes for issue #1018 — parallel ROLL tab gated by the
// `tm-use-new-dice-roller` localStorage flag.
//
// The player app is Discord-OAuth-gated, so these are source-fetch smokes
// (same pattern used for issue-1015). They lock in the wiring contract:
//
//   1. `public/js/suite/roll-v2.js` exists as a companion to `roll.js` and
//      exports the same public surface.
//   2. `public/index.html` has both `#t-dice` and `#t-roll` blocks with
//      the same internal id inventory (so external touch-points work
//      unchanged after the DOM-subtree removal at boot).
//   3. `public/js/app.js` reads the flag, imports both roll modules,
//      wires the active one to the internal + window bindings, and
//      removes the inactive DOM subtree at boot.
//   4. Nav swap: renderers skip the inactive tab (`dice` vs `roll`).
//   5. Settings tab has the checkbox with id `settings-use-new-dice-roller`
//      and its change handler writes the flag + reloads.

const { test, expect } = require('@playwright/test');

const ROLL_EXPORTS = [
  'loadPool', 'chgPool', 'chgMod', 'updPool',
  'setAgain', 'togMod', 'togSpec', 'doRoll',
  'clrHist', 'effPool', 'togEquipChip', 'updWeaponRef',
];

test('#1018 — roll-v2.js exists and exports the same public surface as roll.js', async ({ request }) => {
  const [v1Res, v2Res] = await Promise.all([
    request.get('/js/suite/roll.js'),
    request.get('/js/suite/roll-v2.js'),
  ]);
  expect(v2Res.status()).toBe(200);
  const v1 = await v1Res.text();
  const v2 = await v2Res.text();
  for (const sym of ROLL_EXPORTS) {
    expect(v1, `roll.js should export ${sym}`).toMatch(new RegExp(`export\\s+function\\s+${sym}\\b`));
    expect(v2, `roll-v2.js should export ${sym}`).toMatch(new RegExp(`export\\s+function\\s+${sym}\\b`));
  }
});

test('#1018 — index.html has both #t-dice and #t-roll tab blocks', async ({ request }) => {
  const res = await request.get('/index.html');
  const html = await res.text();
  expect(html).toMatch(/<div\s+id="t-dice"\s+class="tab">/);
  expect(html).toMatch(/<div\s+id="t-roll"\s+class="tab">/);
  // Both must contain the load-bearing inner IDs so the same JS + external
  // touch-points work against whichever subtree survives boot.
  for (const id of ['pval', 'mval', 'roll-btn', 'dice-area', 'hlist', 'sc-char-val']) {
    const matches = html.match(new RegExp(`id="${id}"`, 'g')) || [];
    expect(matches.length, `id="${id}" should appear in both tab blocks`).toBeGreaterThanOrEqual(2);
  }
});

test('#1018 — app.js imports both roll modules and gates by flag', async ({ request }) => {
  const res = await request.get('/js/app.js');
  const src = await res.text();
  expect(src).toMatch(/import\s+\*\s+as\s+rollV1\s+from\s+['"]\.\/suite\/roll\.js['"]/);
  expect(src).toMatch(/import\s+\*\s+as\s+rollV2\s+from\s+['"]\.\/suite\/roll-v2\.js['"]/);
  expect(src).toMatch(/tm-use-new-dice-roller/);
  expect(src).toMatch(/USE_NEW_ROLLER\s*\?\s*rollV2\s*:\s*rollV1/);
});

test('#1018 — boot() removes the inactive tab subtree', async ({ request }) => {
  const res = await request.get('/js/app.js');
  const src = await res.text();
  // The removal ties the DOM subtree choice to the flag so getElementById
  // resolves against the visible tab across every touch-point.
  expect(src).toMatch(/getElementById\(\s*USE_NEW_ROLLER\s*\?\s*['"]t-dice['"]\s*:\s*['"]t-roll['"]\s*\)\??\.remove\(\)/);
});

test('#1018 — nav renderers gate dice/roll on the flag', async ({ request }) => {
  const res = await request.get('/js/app.js');
  const src = await res.text();
  // Bottom nav + desktop sidebar primaryTabs both skip the inactive item.
  const gatePattern = /if\s*\(\s*item\.id\s*===\s*['"]dice['"]\s*&&\s*USE_NEW_ROLLER\s*\)\s*continue;/;
  expect(src.match(gatePattern), 'renderBottomNav should skip dice when flag is on').not.toBeNull();
  const gatePattern2 = /if\s*\(\s*item\.id\s*===\s*['"]roll['"]\s*&&\s*!USE_NEW_ROLLER\s*\)\s*continue;/;
  expect(src.match(gatePattern2), 'renderBottomNav should skip roll when flag is off').not.toBeNull();
  // The desktop primaryTabs loop uses `id` (destructured) rather than `item.id`.
  expect(src).toMatch(/if\s*\(\s*id\s*===\s*['"]dice['"]\s*&&\s*USE_NEW_ROLLER\s*\)\s*continue;/);
  expect(src).toMatch(/if\s*\(\s*id\s*===\s*['"]roll['"]\s*&&\s*!USE_NEW_ROLLER\s*\)\s*continue;/);
});

test('#1018 — settings tab has the "Use new dice roller" checkbox with a reload handler', async ({ request }) => {
  const res = await request.get('/js/app.js');
  const src = await res.text();
  expect(src).toMatch(/id="settings-use-new-dice-roller"/);
  expect(src).toMatch(/Use new dice roller/);
  // Change handler writes the flag and reloads.
  const handlerRe = /#settings-use-new-dice-roller[^]*?localStorage\.setItem\(\s*['"]tm-use-new-dice-roller['"][^]*?location\.reload\(\)/;
  expect(src.match(handlerRe), 'change handler should persist + reload').not.toBeNull();
});

// Boot-time smoke: verify no module-level errors and that the correct
// subtree survives in each flag state. Runs against the login screen —
// no Discord auth needed because the module-import phase happens before
// the auth gate.

async function assertSubtreeState(page, flagOn) {
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
  const state = await page.evaluate(() => ({
    hasDice: !!document.getElementById('t-dice'),
    hasRoll: !!document.getElementById('t-roll'),
    pvalCount: document.querySelectorAll('[id="pval"]').length,
  }));
  // Exactly one of the two tab subtrees survives boot.
  if (flagOn) {
    expect(state.hasDice, 'flag ON: #t-dice should be removed').toBeFalsy();
    expect(state.hasRoll, 'flag ON: #t-roll should be present').toBeTruthy();
  } else {
    expect(state.hasDice, 'flag OFF: #t-dice should be present').toBeTruthy();
    expect(state.hasRoll, 'flag OFF: #t-roll should be removed').toBeFalsy();
  }
  expect(state.pvalCount, 'exactly one #pval element should remain').toBe(1);
  // No unrelated module errors.
  const modErrs = errors.filter((e) => /roll-v2|roll\.js|Failed to resolve module|USE_NEW_ROLLER/i.test(e));
  expect(modErrs, `module errors: ${modErrs.join('\n')}`).toEqual([]);
}

test('#1018 — boot with flag OFF: #t-dice survives, #t-roll removed', async ({ page }) => {
  await assertSubtreeState(page, false);
});

test('#1018 — boot with flag ON: #t-roll survives, #t-dice removed', async ({ page }) => {
  await assertSubtreeState(page, true);
});
