// Smokes for rlv.2 — roll-v2.js promoted to the sole player roller; roll.js,
// the tm-use-new-dice-roller flag and its Settings checkbox retired outright
// (D3 resolved as a direct cutover, not a staged soak — see
// specs/epic-rlv-roller-harmonisation.md and
// specs/stories/rlv-2-promote-roll-v2-retire-roll-v1.md).
//
// These replace tests/issue-1018-parallel-roll-tab-flag.spec.js (deleted —
// its entire premise, a flag-gated parallel #t-dice/#t-roll pair, no longer
// exists) and prove the retirement itself, the same way this project proves
// other superseded-surface removals (e.g. issue-836-legacy-tracker-cache-
// removed.test.js): a source-fetch smoke that a future re-introduction of
// the flag or the old tab would trip.

const { test, expect } = require('@playwright/test');

test('rlv.2 — public/js/suite/roll.js no longer exists', async ({ request }) => {
  const res = await request.get('/js/suite/roll.js');
  expect(res.status()).toBe(404);
});

test('rlv.2 — index.html has exactly one Roll tab (#t-roll), no #t-dice', async ({ request }) => {
  const res = await request.get('/index.html');
  const html = await res.text();
  expect(html).not.toMatch(/id="t-dice"/);
  const rollMatches = html.match(/<div\s+id="t-roll"\s+class="tab">/g) || [];
  expect(rollMatches.length).toBe(1);
  // The load-bearing shared-surface ids still exist exactly once each —
  // nothing was duplicated or dropped by collapsing to a single tab.
  for (const id of ['pval', 'mval', 'roll-btn', 'dice-area', 'hlist', 'sc-char-val', 'rote-c', 'wp-c']) {
    const matches = html.match(new RegExp(`id="${id}"`, 'g')) || [];
    expect(matches.length, `id="${id}" should appear exactly once`).toBe(1);
  }
});

test('rlv.2 — app.js has no flag, no rollV1/rollV2 split, imports roll-v2.js directly', async ({ request }) => {
  const res = await request.get('/js/app.js');
  const src = await res.text();
  // Functional absence, not "never mentioned in a comment" — this file's
  // own header comment legitimately documents the retired flag by name.
  expect(src).not.toMatch(/localStorage\.getItem\(\s*['"]tm-use-new-dice-roller['"]\s*\)/);
  expect(src).not.toMatch(/\bUSE_NEW_ROLLER\b/);
  expect(src).not.toMatch(/\brollV1\b/);
  expect(src).not.toMatch(/\brollV2\b/);
  expect(src).not.toMatch(/from\s+['"]\.\/suite\/roll\.js['"]/);
  expect(src).toMatch(/from\s+['"]\.\/suite\/roll-v2\.js['"]/);
});

test('rlv.2 — settings tab has no "Use new dice roller" checkbox', async ({ request }) => {
  const res = await request.get('/js/app.js');
  const src = await res.text();
  expect(src).not.toMatch(/id="settings-use-new-dice-roller"/);
  expect(src).not.toMatch(/localStorage\.setItem\(\s*['"]tm-use-new-dice-roller['"]/);
  expect(src).not.toMatch(/<span>Use new dice roller<\/span>/);
});

test('rlv.2 — combat-tab.js and contested-roll.js import from roll-v2.js, not roll.js', async ({ request }) => {
  const [combatRes, contestedRes] = await Promise.all([
    request.get('/js/game/combat-tab.js'),
    request.get('/js/game/contested-roll.js'),
  ]);
  const combat = await combatRes.text();
  const contested = await contestedRes.text();
  expect(combat).not.toMatch(/from\s+['"]\.\.\/suite\/roll\.js['"]/);
  expect(combat).toMatch(/from\s+['"]\.\.\/suite\/roll-v2\.js['"]/);
  expect(contested).not.toMatch(/from\s+['"]\.\.\/suite\/roll\.js['"]/);
  expect(contested).toMatch(/from\s+['"]\.\.\/suite\/roll-v2\.js['"]/);
});

// Live boot smoke: confirms the single roller boots clean with no leftover
// flag/tab artefacts, without needing Discord OAuth (module-import + first
// paint happen before the auth gate).

test('rlv.2 — live boot: #t-dice absent, #t-roll present, no roller-related console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await page.waitForTimeout(400);

  const state = await page.evaluate(() => ({
    hasDice: !!document.getElementById('t-dice'),
    hasRoll: !!document.getElementById('t-roll'),
    pvalCount: document.querySelectorAll('[id="pval"]').length,
    hasSettingsRollerToggle: !!document.getElementById('settings-use-new-dice-roller'),
  }));

  expect(state.hasDice, '#t-dice should not exist').toBeFalsy();
  expect(state.hasRoll, '#t-roll should be present').toBeTruthy();
  expect(state.pvalCount, 'exactly one #pval element should exist').toBe(1);
  expect(state.hasSettingsRollerToggle, 'no leftover roller Settings checkbox').toBeFalsy();

  const modErrs = errors.filter((e) => /roll-v2|roll\.js|Failed to resolve module|USE_NEW_ROLLER/i.test(e));
  expect(modErrs, `module errors: ${modErrs.join('\n')}`).toEqual([]);
});
