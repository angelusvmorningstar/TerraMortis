// USF browser smoke + DOM-capture harness.
//
// Drives headless Chromium (Playwright) against a LOCAL static server, using the
// dev-login `local-test-token` bypass + dev-fixtures.js — no Discord OAuth, no
// live data. Reports uncaught page errors and *meaningful* console errors
// (benign "no local backend" noise is filtered), and optionally captures the
// rendered sheet DOM for before/after parity diffing across USF phases.
//
// Prereqs:
//   - Playwright installed (node_modules/playwright) with chromium.
//   - A static server on BASE (default http://localhost:8080):
//       npx http-server public -p 8080 -s
//   - For a FULLY rendered sheet (needed for Phase 1/2 CSS/renderer parity), also
//     run the local API so equipment-catalogue + rules load:
//       cd server && npm run dev        (serves :3000; app hits it via api.js)
//     Without the API, the sheet renders only partially and the benign filter
//     below hides the resulting connection errors — fine for boot smoke, NOT
//     sufficient for sheet DOM parity.
//
// Usage:
//   node specs/qa/harness/usf-smoke.mjs <role: st|player> [captureOutPath]
//   BASE=http://localhost:8080 node specs/qa/harness/usf-smoke.mjs player before.html
//
// Exit code: 0 if no pageErrors and no meaningful console errors; 1 otherwise.

import pkg from 'playwright';
const { chromium } = pkg;
import { writeFileSync } from 'fs';

const role = process.argv[2] || 'player';
const capOut = process.argv[3] || null;
const BASE = process.env.BASE || 'http://localhost:8080';

// Benign console-error patterns produced by running the client without a local
// API/WS backend. These are environmental, not code defects. Anything NOT matching
// is treated as a real signal.
const BENIGN = [
  /ERR_CONNECTION_REFUSED/,
  /Failed to load resource/,
  /equipment-catalogue-cache\] load failed/,
  /preloadRules failed/,
  /WebSocket connection to 'ws:\/\/localhost:3000/,
  /Failed to fetch/,
];

const authUser = {
  id: 'local-test-' + role, username: 'local_' + role,
  global_name: role === 'st' ? 'Dev ST' : 'Dev Player', avatar: null, role,
  player_id: role === 'st' ? null : 'p-dev-001',
  character_ids: role === 'st' ? [] : ['600000000000000000000006'],
  is_dual_role: false,
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const allErrors = [], pageErrors = [];
await ctx.addInitScript(({ user }) => {
  localStorage.setItem('tm_auth_token', 'local-test-token');
  localStorage.setItem('tm_auth_expires', String(2000000000000));
  localStorage.setItem('tm_auth_user', JSON.stringify(user));
}, { user: authUser });

const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') allErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e)));

await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 })
  .catch(e => pageErrors.push('goto: ' + e.message));
await page.waitForTimeout(2500);

const title = await page.title();
const bodyHasContent = await page.evaluate(() => !!document.body && document.body.innerText.trim().length > 0);
const probe = await page.evaluate(() => {
  const ids = ['sheet', 't-chars', 't-editor', 'app-grid', 'nav', 'bottom-nav'];
  const found = {};
  for (const id of ids) { const el = document.getElementById(id); if (el) found[id] = el.outerHTML.length; }
  const sheetEl = document.querySelector('#sheet, .sheet, [id*="sheet"], .sh-sheet');
  return { found, sheetHtmlLen: sheetEl ? sheetEl.outerHTML.length : 0, sheetOuter: sheetEl ? sheetEl.outerHTML : null };
});

if (capOut && probe.sheetOuter) writeFileSync(capOut, probe.sheetOuter);

const meaningfulErrors = allErrors.filter(e => !BENIGN.some(rx => rx.test(e)));
const pass = pageErrors.length === 0 && meaningfulErrors.length === 0;

console.log(JSON.stringify({
  pass, role, title, bodyHasContent,
  pageErrors,
  meaningfulConsoleErrors: meaningfulErrors,
  benignConsoleErrorsFiltered: allErrors.length - meaningfulErrors.length,
  containersFound: probe.found,
  sheetHtmlLen: probe.sheetHtmlLen,
  captured: capOut && probe.sheetOuter ? capOut : null,
}, null, 2));

await browser.close();
process.exit(pass ? 0 : 1);
