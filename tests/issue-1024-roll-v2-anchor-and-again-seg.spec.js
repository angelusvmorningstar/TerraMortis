// Smokes for issue #1024 — ROLL v2 slice A (anchor) + D (segmented Again).
//
// Source-fetch smokes plus a live boot smoke that confirm the anchor + seg
// control are present and functional, without needing Discord OAuth.
// rlv.2 (2026-08-24) promoted roll-v2.js to the sole player roller and
// deleted roll.js/#t-dice outright, so the flag-conditional tests this file
// used to carry ("flag ON" vs "flag OFF", the #t-dice safety net) are gone —
// there is only one state to assert now. See
// tests/rlv-2-single-roller-retirement.spec.js for the retirement proof
// itself (no #t-dice, no flag, no toggle).

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

  // Locate just the #t-roll block (index.html is CRLF — found pre-existing
  // and fixed here: the old \n\n-only delimiter never matched on this
  // checkout, same CRLF/LF family as this project's other documented
  // line-ending gremlins).
  const start = html.indexOf('<div id="t-roll"');
  expect(start).toBeGreaterThan(0);
  const territoryMatch = /<\/div>\r?\n\r?\n\s*<!-- ═══ TERRITORY/.exec(html.slice(start));
  expect(territoryMatch).not.toBeNull();
  const end = start + territoryMatch.index;
  expect(end).toBeGreaterThan(start);
  const rollBlock = html.slice(start, end);

  expect(rollBlock).not.toMatch(/id="a8"/);
  expect(rollBlock).not.toMatch(/id="a9"/);
  expect(rollBlock).not.toMatch(/id="na-c"/);
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

// ── Live boot smokes: confirm the ROLL tab's anchor + seg pill actually
//    render and behave. No OAuth needed — the tab markup + rv2 painters
//    run pre-login.

async function bootApp(page) {
  await page.goto('/');
  await page.waitForTimeout(400);
}

test('#1024 — anchor + seg pill are in the live DOM', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await bootApp(page);

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
  expect(state.dice, '#t-dice should not exist').toBeFalsy();
  expect(state.roll, '#t-roll should be present').toBeTruthy();

  // No module errors from the rewired painter.
  const relevant = errors.filter((e) =>
    /roll-v2|setAgainSeg|updPool|rv2/i.test(e)
  );
  expect(relevant).toEqual([]);
});

test('#1024 — clicking a seg button flips the .on class exclusively', async ({ page }) => {
  await bootApp(page);
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

test('#1024 — sticky Roll button label reflects effective count', async ({ page }) => {
  await bootApp(page);
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
