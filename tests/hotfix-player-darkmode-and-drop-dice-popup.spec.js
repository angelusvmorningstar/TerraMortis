// Hotfix smoke — issues #1009 (dark-mode qf input contrast) and
// #1010 (deprecated dice-modal popup removal).
//
// Verifies:
//   1. player.html + index.html boot with no ES module import errors
//      (proves the dice-modal.js removal did not leave dangling imports).
//   2. The .reading-pane .qf-input shadowing rule that hardcoded
//      rgba(255,255,255,.5) is gone from components.css.
//   3. The popup-only .dm-* selectors, #dice-modal-overlay,
//      @keyframes dm-slide-up, .skill-dice-btn, .disc-power-dice, and
//      .dice-roll-icon are gone from suite.css; .dm-box is no longer in
//      the -webkit-user-select selector list.
//   4. In dark mode the token-driven .reading-pane .qf-input rule
//      resolves to a dark background and light text (readable).

const { test, expect } = require('@playwright/test');

test('player.html boots without ES module errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/player.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const modErrs = errors.filter((e) =>
    /dice-modal|openDiceModal|DICE_ICON_SVG|canRollDice|Failed to resolve module/i.test(e)
  );
  expect(modErrs, `player.html module errors:\n${modErrs.join('\n')}`).toEqual([]);
});

test('index.html boots without ES module errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const modErrs = errors.filter((e) =>
    /dice-modal|openDiceModal|DICE_ICON_SVG|canRollDice|Failed to resolve module/i.test(e)
  );
  expect(modErrs, `index.html module errors:\n${modErrs.join('\n')}`).toEqual([]);
});

test('#1009 — shadowing rgba(255,255,255,.5) qf-input rule removed', async ({ request }) => {
  const res = await request.get('/css/components.css');
  const css = await res.text();
  expect(css).not.toMatch(/background:\s*rgba\(255,\s*255,\s*255,\s*\.5\)/);
  expect(css).not.toMatch(/background:\s*rgba\(255,\s*255,\s*255,\s*\.75\)/);
  const readingRules = css.match(/\.reading-pane \.qf-input[^{]*\{[^}]*\}/g) || [];
  for (const rule of readingRules) {
    expect(rule).not.toMatch(/rgba\(255,\s*255,\s*255/);
  }
});

test('#1010 — popup CSS block removed from suite.css', async ({ request }) => {
  const res = await request.get('/css/suite.css');
  const css = await res.text();
  expect(css).not.toContain('#dice-modal-overlay');
  expect(css).not.toContain('dm-slide-up');
  expect(css).not.toMatch(/\.dice-roll-icon\b/);
  expect(css).not.toMatch(/\.skill-dice-btn\b/);
  expect(css).not.toMatch(/\.disc-power-dice\b/);
  expect(css).not.toMatch(/\.dm-box\b/);
  expect(css).not.toMatch(/\.dm-header\b/);
  expect(css).not.toMatch(/\.dm-close\b/);
  expect(css).not.toMatch(/\.dm-hist-/);
});

test('#1009 — dark-mode .reading-pane .qf-input resolves to dark bg + light text', async ({ page }) => {
  // Navigate to the http-server origin so relative /css paths resolve,
  // then replace document HTML with an isolated harness stamped dark.
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.head.innerHTML = `
      <link rel="stylesheet" href="/css/theme.css">
      <link rel="stylesheet" href="/css/components.css">
    `;
    document.body.innerHTML = `
      <div class="reading-pane">
        <input class="qf-input" id="probe" value="test">
      </div>
    `;
  });
  // Wait for stylesheets to load.
  await page.waitForFunction(() =>
    Array.from(document.styleSheets).some((s) => (s.href || '').endsWith('/css/components.css'))
  );
  const { bg, fg } = await page.evaluate(() => {
    const el = document.getElementById('probe');
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, fg: cs.color };
  });
  const parse = (s) => (s.match(/\d+/g) || []).slice(0, 3).map(Number);
  const [br, bg2, bb] = parse(bg);
  const [fr, fg2, fb] = parse(fg);
  const bgL = (br + bg2 + bb) / 3;
  const fgL = (fr + fg2 + fb) / 3;
  // Background should be a dark surface (avg channel < 128),
  // foreground should be a light text colour (avg channel > 128).
  expect(bgL, `dark-mode qf-input background is ${bg}`).toBeLessThan(128);
  expect(fgL, `dark-mode qf-input color is ${fg}`).toBeGreaterThan(128);
  // And they should be well apart (contrast delta).
  expect(fgL - bgL, `dark-mode qf-input contrast delta bg=${bg} fg=${fg}`).toBeGreaterThan(80);
});

test('#1009 — parchment-mode .reading-pane .qf-input remains readable (dark text on light bg)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.removeAttribute('data-theme');
    document.head.innerHTML = `
      <link rel="stylesheet" href="/css/theme.css">
      <link rel="stylesheet" href="/css/components.css">
    `;
    document.body.innerHTML = `
      <div class="reading-pane">
        <input class="qf-input" id="probe" value="test">
      </div>
    `;
  });
  await page.waitForFunction(() =>
    Array.from(document.styleSheets).some((s) => (s.href || '').endsWith('/css/components.css'))
  );
  const { bg, fg } = await page.evaluate(() => {
    const el = document.getElementById('probe');
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, fg: cs.color };
  });
  const parse = (s) => (s.match(/\d+/g) || []).slice(0, 3).map(Number);
  const [br, bg2, bb] = parse(bg);
  const [fr, fg2, fb] = parse(fg);
  const bgL = (br + bg2 + bb) / 3;
  const fgL = (fr + fg2 + fb) / 3;
  expect(bgL, `parchment qf-input background is ${bg}`).toBeGreaterThan(200);
  expect(fgL, `parchment qf-input color is ${fg}`).toBeLessThan(80);
});
