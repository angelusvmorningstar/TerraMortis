// Smokes for issue #1024 — ROLL v2 slice A (anchor) + D (segmented Again).
//
// Source-fetch smokes plus a live boot smoke that confirms the new
// anchor + seg control are present and functional in the `flag ON`
// state without needing Discord OAuth. DICE (#t-dice) markup is
// asserted unchanged (safety-net for the flag-off path).

const { test, expect } = require('@playwright/test');

test('#1024 — #t-roll has the new anchor + segmented Again elements', async ({ request }) => {
  const res = await request.get('/index.html');
  const html = await res.text();

  // Slice A: anchor (huge effective count) + always-visible sub-line.
  expect(html).toMatch(/id="rv2-eff"/);
  expect(html).toMatch(/id="rv2-eff-unit"/);
  expect(html).toMatch(/id="rv2-sub"/);

  // Slice D: exactly one segmented Again pill with the four options.
  expect(html).toMatch(/id="rv2-again-seg"/);
  for (const v of ['10', '9', '8', 'none']) {
    expect(html).toMatch(new RegExp(`data-again="${v}"`));
  }

  // Compact steppers reuse #pval / #mval for state (roll-v2 writes them).
  expect(html).toMatch(/class="rv2-stepper-row"/);

  // Sticky roll button carries the new class.
  expect(html).toMatch(/id="roll-btn"[^>]*class="rv2-roll-btn"/);
});

test('#1024 — #t-roll no longer has the old a8/a9/na-c chips', async ({ request }) => {
  const res = await request.get('/index.html');
  const html = await res.text();

  // Locate just the #t-roll block so we don't accidentally hit #t-dice.
  const start = html.indexOf('<div id="t-roll"');
  expect(start).toBeGreaterThan(0);
  const end = html.indexOf('</div>\n\n    <!-- ═══ TERRITORY', start);
  expect(end).toBeGreaterThan(start);
  const rollBlock = html.slice(start, end);

  expect(rollBlock).not.toMatch(/id="a8"/);
  expect(rollBlock).not.toMatch(/id="a9"/);
  expect(rollBlock).not.toMatch(/id="na-c"/);
});

test('#1024 — #t-dice block is untouched (safety net for flag-off path)', async ({ request }) => {
  const res = await request.get('/index.html');
  const html = await res.text();

  const start = html.indexOf('<div id="t-dice"');
  const end = html.indexOf('<!-- ═══ ROLL TAB', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const diceBlock = html.slice(start, end);

  // DICE keeps the legacy controls exactly.
  expect(diceBlock).toMatch(/id="a8"/);
  expect(diceBlock).toMatch(/id="a9"/);
  expect(diceBlock).toMatch(/id="na-c"/);
  expect(diceBlock).toMatch(/id="pval"/);
  expect(diceBlock).toMatch(/id="mval"/);
  // And has none of the v2 anchor bits.
  expect(diceBlock).not.toMatch(/id="rv2-eff"/);
  expect(diceBlock).not.toMatch(/id="rv2-again-seg"/);
});

test('#1024 — roll-v2.js exports setAgainSeg', async ({ request }) => {
  const res = await request.get('/js/suite/roll-v2.js');
  const src = await res.text();
  expect(src).toMatch(/export\s+function\s+setAgainSeg\b/);
  // setAgain still exported so loadPool() keeps working.
  expect(src).toMatch(/export\s+function\s+setAgain\b/);
});

test('#1024 — suite.css contains the .rv2-* styles', async ({ request }) => {
  const res = await request.get('/css/suite.css');
  const css = await res.text();
  for (const cls of [
    '.rv2-anchor',
    '.rv2-eff',
    '.rv2-sub',
    '.rv2-stepper-row',
    '.rv2-again-seg',
    '.rv2-roll-btn',
    '.rv2-breakdown',
  ]) {
    expect(css.includes(cls), `${cls} missing from suite.css`).toBe(true);
  }
  // Tokens only — the new block introduces no bare hex color values or
  // theme-blind rgba() (project standard). Anchor via the block header
  // comment so we don't accidentally match unrelated CSS.
  const rvIdx = css.indexOf('Roll v2 — anchor layout + segmented Again rule');
  expect(rvIdx).toBeGreaterThan(0);
  const rvBlock = css.slice(rvIdx);
  // Color-value context: `: #abc123;` etc. (skips issue refs in comments).
  expect(rvBlock).not.toMatch(/:\s*#[0-9a-fA-F]{3,8}\b/);
  expect(rvBlock).not.toMatch(/rgba\(\s*255\s*,/);
});

// ── Live boot smokes: reload the app with the flag set, confirm the
//    ROLL tab's anchor + seg pill actually render and behave.
//    No OAuth needed — the tab markup + rv2 painters run pre-login.

async function bootWithFlag(page, on) {
  await page.goto('/');
  await page.evaluate((flag) => {
    if (flag) localStorage.setItem('tm-use-new-dice-roller', '1');
    else localStorage.removeItem('tm-use-new-dice-roller');
  }, on);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

test('#1024 — flag ON: anchor + seg pill are in the live DOM', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await bootWithFlag(page, true);

  const state = await page.evaluate(() => ({
    hasEff: !!document.getElementById('rv2-eff'),
    hasSub: !!document.getElementById('rv2-sub'),
    hasSeg: !!document.getElementById('rv2-again-seg'),
    segButtons: Array.from(
      document.querySelectorAll('#rv2-again-seg [data-again]')
    ).map((b) => b.dataset.again),
    dice: !!document.getElementById('t-dice'),
    roll: !!document.getElementById('t-roll'),
  }));

  expect(state.hasEff, 'rv2-eff should be present').toBeTruthy();
  expect(state.hasSub, 'rv2-sub should be present').toBeTruthy();
  expect(state.hasSeg, 'rv2-again-seg should be present').toBeTruthy();
  expect(state.segButtons).toEqual(['10', '9', '8', 'none']);
  expect(state.dice, '#t-dice should be removed at boot').toBeFalsy();
  expect(state.roll, '#t-roll should survive at boot').toBeTruthy();

  // No module errors from the rewired painter.
  const relevant = errors.filter((e) =>
    /roll-v2|setAgainSeg|updPool|rv2/i.test(e)
  );
  expect(relevant).toEqual([]);
});

test('#1024 — flag OFF: v1 DICE tab remains, no v2 elements leak', async ({ page }) => {
  await bootWithFlag(page, false);
  const state = await page.evaluate(() => ({
    hasEff: !!document.getElementById('rv2-eff'),
    hasSeg: !!document.getElementById('rv2-again-seg'),
    hasA8: !!document.getElementById('a8'),
    dice: !!document.getElementById('t-dice'),
    roll: !!document.getElementById('t-roll'),
  }));
  expect(state.hasEff, 'rv2-eff should NOT exist when flag off').toBeFalsy();
  expect(state.hasSeg, 'rv2-again-seg should NOT exist when flag off').toBeFalsy();
  expect(state.hasA8, '#a8 (v1 chip) should exist when flag off').toBeTruthy();
  expect(state.dice, '#t-dice should survive at boot').toBeTruthy();
  expect(state.roll, '#t-roll should be removed at boot').toBeFalsy();
});

test('#1024 — flag ON: clicking a seg button flips the .on class exclusively', async ({ page }) => {
  await bootWithFlag(page, true);
  // Directly invoke the exposed global — bypasses the login gate.
  await page.evaluate(() => window.setAgainSeg('8'));
  const state = await page.evaluate(() => {
    const btns = Array.from(
      document.querySelectorAll('#rv2-again-seg [data-again]')
    );
    return btns.map((b) => ({ v: b.dataset.again, on: b.classList.contains('on') }));
  });
  expect(state.find((s) => s.v === '8').on).toBe(true);
  expect(state.filter((s) => s.v !== '8').every((s) => !s.on)).toBe(true);

  // Now flip to "none".
  await page.evaluate(() => window.setAgainSeg('none'));
  const state2 = await page.evaluate(() => {
    const btns = Array.from(
      document.querySelectorAll('#rv2-again-seg [data-again]')
    );
    return btns.map((b) => ({ v: b.dataset.again, on: b.classList.contains('on') }));
  });
  expect(state2.find((s) => s.v === 'none').on).toBe(true);
  expect(state2.filter((s) => s.v !== 'none').every((s) => !s.on)).toBe(true);
});

test('#1024 — flag ON: sticky Roll button label reflects effective count', async ({ page }) => {
  await bootWithFlag(page, true);
  // Set base pool to 7 via chgPool. Fresh state has PS=5 (roll-v2 default).
  await page.evaluate(() => {
    window.chgPool(2);
    window.updPool();
  });
  const label = await page.evaluate(
    () => document.getElementById('roll-btn').textContent
  );
  expect(label).toMatch(/ROLL 7 DICE/);

  // Drop to chance.
  await page.evaluate(() => {
    window.chgPool(-10);
    window.updPool();
  });
  const label2 = await page.evaluate(
    () => document.getElementById('roll-btn').textContent
  );
  expect(label2).toMatch(/ROLL CHANCE DIE/);
});
