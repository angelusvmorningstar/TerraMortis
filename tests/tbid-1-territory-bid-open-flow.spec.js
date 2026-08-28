/**
 * TBID.1 — Territory Bids open-flow, in a real browser.
 *
 * The vitest suite (server/tests/tbid-1-territory-bid-open-flow.test.js) drives
 * the module's logic against a stand-in DOM. This spec exists for the half that
 * cannot: that the markup actually composes against the REAL suite.css, in both
 * themes, and that the Reopen button's colour/border now renders at all (the
 * --text3 typo AC10 fixes was silently dropping it, and no structural test can
 * see that).
 *
 * The Territory tab is reached by activating it directly rather than through
 * the ST nav, because this repo's own nav specs for the suite app are already
 * failing at base (see CLAUDE.md's known-failures list) and this story is not
 * scoped to fix them. territory.js makes no network calls at all, so nothing
 * here depends on API fixtures.
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

const SHOTS = process.env.TBID_SHOT_DIR || '';
const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
};

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST', avatar: null,
  role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const CHAR_NAMES = ['Alice Vunder', 'Brandy LaRoux', 'Eve Lockridge', 'Reed Justice'];

async function openTerritoryTab(page, { seed = null, theme = null } = {}) {
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) }));
  await page.route('**/api/characters*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.addInitScript(({ user, seed, theme }) => {
    // Keep the service worker out of the way; it has been caught serving stale
    // and live payloads ahead of route stubs in this repo before.
    try {
      if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve();
    } catch (e) { /* ignore */ }
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
    if (seed) localStorage.setItem('tm_bids_v2', JSON.stringify(seed));
    else localStorage.removeItem('tm_bids_v2');
    if (theme) localStorage.setItem('tm_theme', theme);
  }, { user: ST_USER, seed, theme });

  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window._mountTerr === 'function', null, { timeout: 30000 });

  await page.evaluate(({ names, theme }) => {
    window._charNames = names;
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    const gate = document.getElementById('auth-gate');
    if (gate) gate.style.display = 'none';
    const app = document.getElementById('app');
    if (app) app.style.display = '';
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    document.getElementById('t-territory').classList.add('active');
    window._mountTerr();
  }, { names: CHAR_NAMES, theme });

  await expect(page.locator('#terr-root .toolbar')).toBeVisible();
}

test.describe('TBID.1 — Territory Bids open flow (real browser)', () => {
  test('empty board, picker, regent confirm, card, resolved row', async ({ page }) => {
    await openTerritoryTab(page);

    // ── AC1/AC2: empty board, Open Territory Bid present, no Wipe Board ──
    await expect(page.locator('#terr-root .tc')).toHaveCount(0);
    await expect(page.locator('#terr-root .terr-empty')).toBeVisible();
    const openBtn = page.locator('#terr-root button', { hasText: 'Open Territory Bid' });
    await expect(openBtn).toBeVisible();
    await expect(page.locator('#terr-root button', { hasText: 'Wipe Board' })).toHaveCount(0);
    await page.locator('#terr-root .terr-empty').scrollIntoViewIfNeeded();
    await shot(page, '01-empty-board.png');

    // ── AC3: picker step 1 ──
    await openBtn.click();
    await expect(page.locator('#terr-root .modal-title')).toHaveText('Open Territory Bid');
    await expect(page.locator('#terr-root .pick-tile')).toHaveCount(5);
    await expect(page.locator('#terr-root .pick-tile:disabled')).toHaveCount(0);
    await shot(page, '02-picker-step1.png');

    // ── AC4: picker step 2, pre-filled Regent ──
    await page.locator('#terr-root .pick-tile', { hasText: 'The Harbour' }).click();
    const sel = page.locator('#modal-regent');
    await expect(sel).toBeVisible();
    await expect(sel).toHaveValue('Reed Justice');
    await shot(page, '03-picker-step2-regent.png');

    // Overridable.
    await sel.selectOption('Alice Vunder');
    await page.locator('#terr-root .modal-btns .btn-primary').click();

    await expect(page.locator('#terr-root .tc')).toHaveCount(1);
    await expect(page.locator('#terr-root .tc-name')).toHaveText('The Harbour');
    await expect(page.locator('#terr-root .regent-tag')).toContainText('Alice Vunder');
    await expect(page.locator('#terr-root button', { hasText: 'Wipe Board' })).toBeVisible();
    await shot(page, '04-card-added.png');

    // ── AC3: the open territory is disabled in the picker, not hidden ──
    await page.locator('#terr-root button', { hasText: 'Open Territory Bid' }).click();
    await expect(page.locator('#terr-root .pick-tile')).toHaveCount(5);
    const taken = page.locator('#terr-root .pick-tile.pick-taken');
    await expect(taken).toHaveCount(1);
    await expect(taken).toBeDisabled();
    await expect(taken).toContainText('In Contest');
    await shot(page, '05-picker-in-contest.png');
    await page.locator('#terr-root .modal-btns button', { hasText: 'Cancel' }).click();

    // ── AC7: resolve, and the card collapses to a row ──
    await page.locator('#terr-root .tc-foot button', { hasText: '+ Open Bid' }).click();
    await page.locator('#modal-cl').selectOption('Brandy LaRoux');
    await page.locator('#modal-sc').selectOption('Eve Lockridge');
    await page.locator('#terr-root .modal-btns .btn-primary').click();
    await expect(page.locator('#terr-root .bid')).toHaveCount(2);   // + the regent's auto defence bid

    // Back the challenger past the regent's automatic +3, so the winner is a
    // different name from the regent and the reopen pre-fill has to prove it
    // reads the winner rather than the stale regent field.
    await page.locator('#terr-root .bid', { hasText: 'Brandy LaRoux' })
      .locator('button', { hasText: '+ Influence' }).click();
    await page.locator('#modal-pl').selectOption('Eve Lockridge');
    await page.locator('#modal-am').fill('7');
    await page.locator('#terr-root .modal-btns .btn-primary').click();
    await expect(page.locator('#terr-root .back-row')).toHaveCount(1);

    await page.locator('#terr-root .tc-foot button', { hasText: 'Resolve' }).click();
    const row = page.locator('#terr-root .trr');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Resolved');
    await expect(row).toContainText('The Harbour');
    await expect(row).toContainText('Brandy LaRoux');   // the winning Regent
    await expect(page.locator('#terr-root .bid')).toHaveCount(0);
    await expect(page.locator('#terr-root .back-list')).toHaveCount(0);
    await expect(row).not.toContainText('Eve Lockridge');
    await expect(row).not.toContainText('7');
    await shot(page, '06-resolved-collapsed.png');

    // ── AC10: the Reopen button really has a colour and a border now ──
    const reopen = row.locator('button', { hasText: 'Reopen' });
    const style = await reopen.evaluate(el => {
      const cs = getComputedStyle(el);
      return { colour: cs.color, border: cs.borderTopColor, token: getComputedStyle(document.documentElement).getPropertyValue('--txt3').trim() };
    });
    const tokenRgb = await page.evaluate((tok) => {
      const probe = document.createElement('span');
      probe.style.color = tok;
      document.body.appendChild(probe);
      const v = getComputedStyle(probe).color;
      probe.remove();
      return v;
    }, style.token);
    expect(style.colour).toBe(tokenRgb);
    expect(style.border).toBe(tokenRgb);

    // ── AC8: Reopen re-enters the Regent-confirm step ──
    await reopen.click();
    const sel2 = page.locator('#modal-regent');
    await expect(sel2).toBeVisible();
    await expect(sel2).toHaveValue('Brandy LaRoux');   // the previous winner
    await shot(page, '07-reopen-regent-confirm.png');
    await sel2.selectOption('Eve Lockridge');
    await page.locator('#terr-root .modal-btns .btn-primary').click();

    await expect(page.locator('#terr-root .trr')).toHaveCount(0);
    await expect(page.locator('#terr-root .tc')).toHaveCount(1);
    await expect(page.locator('#terr-root .bid')).toHaveCount(0);   // bids cleared
    await expect(page.locator('#terr-root .regent-tag')).toContainText('Eve Lockridge');
    await shot(page, '08-reopened-card.png');
  });

  test('Wipe Board is confirm-gated, and cancelling changes nothing', async ({ page }) => {
    await openTerritoryTab(page);
    await page.locator('#terr-root button', { hasText: 'Open Territory Bid' }).click();
    await page.locator('#terr-root .pick-tile', { hasText: 'The Academy' }).click();
    await page.locator('#terr-root .modal-btns .btn-primary').click();
    await expect(page.locator('#terr-root .tc')).toHaveCount(1);

    let asked = '';
    page.once('dialog', async d => { asked = d.message(); await d.dismiss(); });
    await page.locator('#terr-root button', { hasText: 'Wipe Board' }).click();
    expect(asked).toBe('Wipe the entire board? This removes all territories and bids.');
    await expect(page.locator('#terr-root .tc')).toHaveCount(1);
    await shot(page, '09-wipe-confirm-cancelled.png');

    page.once('dialog', async d => { await d.accept(); });
    await page.locator('#terr-root button', { hasText: 'Wipe Board' }).click();
    await expect(page.locator('#terr-root .tc')).toHaveCount(0);
    await expect(page.locator('#terr-root .terr-empty')).toBeVisible();
    await expect(page.locator('#terr-root button', { hasText: 'Wipe Board' })).toHaveCount(0);
  });

  test('a pre-TBID.1 save is still on the board after this deploy', async ({ page }) => {
    await openTerritoryTab(page, {
      seed: {
        phase: 'open',
        peek: false,
        territories: [{
          id: 'northshore', name: 'The North Shore', defaultRegent: 'Alice Vunder',
          ambience: 'Tended', ambienceMod: 2,
          regent: 'Alice Vunder', regentInput: 'Alice Vunder',
          bids: [{ id: '9', claimant: 'Brandy LaRoux', seconder: 'Eve Lockridge', backing: [{ id: '8', player: 'Eve Lockridge', amount: 5 }], rulerAdjust: 0 }],
          resolved: false, winnerId: null,
        }],
      },
    });
    await expect(page.locator('#terr-root .tc-name')).toHaveText('The North Shore');
    await expect(page.locator('#terr-root .bid-claimant')).toHaveText('Brandy LaRoux');
    await shot(page, '10-grandfathered-board.png');
  });

  for (const theme of ['dark', 'light']) {
    test(`the ${theme} theme renders the picker and the resolved row through tokens`, async ({ page }) => {
      await openTerritoryTab(page, { theme });
      await page.locator('#terr-root button', { hasText: 'Open Territory Bid' }).click();
      await expect(page.locator('#terr-root .pick-tile')).toHaveCount(5);
      await shot(page, `11-${theme}-picker.png`);
      await page.locator('#terr-root .pick-tile', { hasText: 'The Dockyards' }).click();
      await page.locator('#terr-root .modal-btns .btn-primary').click();
      await page.locator('#terr-root .tc-foot button', { hasText: '+ Open Bid' }).click();
      await page.locator('#modal-cl').selectOption('Brandy LaRoux');
      await page.locator('#modal-sc').selectOption('Eve Lockridge');
      await page.locator('#terr-root .modal-btns .btn-primary').click();
      await page.locator('#terr-root .tc-foot button', { hasText: 'Resolve' }).click();
      const row = page.locator('#terr-root .trr');
      await expect(row).toBeVisible();

      // The Reopen button's colour/border must resolve to this theme's own
      // --txt3, not to the button default. AC10's --text3 typo failed exactly
      // this check silently, in both themes.
      const seen = await row.locator('button', { hasText: 'Reopen' }).evaluate(el => {
        const cs = getComputedStyle(el);
        return { colour: cs.color, border: cs.borderTopColor };
      });
      const tokenRgb = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--txt3)';
        document.body.appendChild(probe);
        const v = getComputedStyle(probe).color;
        probe.remove();
        return v;
      });
      expect(seen.colour).toBe(tokenRgb);
      expect(seen.border).toBe(tokenRgb);
      await shot(page, `12-${theme}-resolved.png`);
    });
  }
});
