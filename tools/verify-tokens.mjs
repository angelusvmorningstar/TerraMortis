/**
 * verify-tokens.mjs — proves the shared design-token layer landed in the
 * RENDERED app, not just the CSS source. See ../../design-token-port.md for
 * why this is measured rather than read: two separate bugs during the TM
 * Admin/TM Story ports were invisible in the source and only showed up in
 * computed geometry.
 *
 * Adapted from TM Story's tools/verify-tokens.mjs (the phablet-viewport-sweep
 * style — TM Game, like TM Story, spreads its in-scope CSS across multiple
 * stylesheets: theme.css, layout.css, components.css, suite.css, all loaded
 * together by index.html). It differs from TM Story's variant in page count,
 * not method: TM Game's *in-scope* surface (the port explicitly excludes
 * admin.html and the three admin-*.css files, per ../../design-token-port.md
 * — that panel is being shed to TM Admin) is functionally ONE page,
 * index.html, a single-page app rather than ~25 static documents. Every
 * other .html in public/ either loads admin-layout.css (login.html,
 * dt-proto.html, admin.html — out of scope) or is a dev/test scratch page
 * (test-downtime.html, pdf-test.html, ranking-preview.html, theme-preview.html,
 * maintenance.html which — same reasoning as TM Story's own exclusion —
 * inlines its own styles ON PURPOSE as the page shown when things are
 * broken). Sweeping those would either mix in admin-layout.css's still-literal
 * Cinzel/px usages (false positives against a file this port never touched)
 * or add pages with nothing to do with this port. So this sweeps index.html
 * only, deliberately, not by oversight.
 *
 * Within index.html, most of the real UI (character sheet, downtime form, ST
 * panels, the roll calculator whose .rv2-eff carries the new
 * --type-size-display-hero token) requires an authenticated session and live
 * Mongo data neither of which this tool has — there is no seeded dev
 * database, and dev-server.mjs's /api proxy 502s instantly with nothing
 * behind it. What IS reachable without auth, and reliably renders under
 * dev-server.mjs, is index.html's own `#login-screen` (`display:none` in the
 * HTML, revealed by app.js's own auth-check catch path the moment the token
 * validation call fails) — `.login-title` and `.login-crim-btn` are real
 * consumers of the exact tokens this port introduced (Cinzel display-lg/bold,
 * --radius-md). That is genuine measured-geometry proof for the mechanism
 * this port depends on (root tokens resolve, Cinzel renders bold-at-display-
 * size not silently un-bold, radii resolve to the 5-value scale), even though
 * it can't reach every one of the ~40 selectors this pass touched. The
 * per-selector CSS diff is the record for the rest; this script is the
 * "not just source" cross-check TM Admin/TM Story's ports both relied on.
 *
 *   node tools/verify-tokens.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = 8794;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  // /api and /auth calls from app.js's own boot sequence: fail fast (no
  // upstream configured for this static-only sweep) so the login-screen
  // catch path reveals itself quickly instead of hanging on a real fetch.
  if (req.url.startsWith('/api/') || req.url.startsWith('/auth/')) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'NO_API_IN_STATIC_SWEEP' }));
  }
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(PORT, r));

const siblingPW = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..',
  'TM Design System', '.ds-sync', 'node_modules', 'playwright-core', 'index.mjs')).href;
let chromium;
for (const spec of [process.env.PLAYWRIGHT_CORE, 'playwright-core', '@playwright/test', siblingPW].filter(Boolean)) {
  try { ({ chromium } = await import(spec)); break; } catch { /* next */ }
}
if (!chromium) { console.error('playwright-core not resolvable; expected at ' + siblingPW); server.close(); process.exit(2); }

// Deliberately ONE page — see the file header for why.
const PAGES = ['index.html'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } }); // phablet width — TM Game is phablet-first in this port's scope

const cinzel = new Map();   // "size/weight" -> example selector
const radii = new Set();
let tokens = null, loginTitle = null, loginBtn = null;

for (const p of PAGES) {
  await page.goto(`http://127.0.0.1:${PORT}/${p}`);
  // Give app.js's own auth-check catch path time to fail the /api call and
  // flip #login-screen visible (see header).
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const tok = (n) => root.getPropertyValue(n).trim() || '(UNDEFINED)';
    const out = { cinzel: [], radii: [], tokens: null, loginTitle: null, loginBtn: null };

    out.tokens = {
      radiusSm: tok('--radius-sm'), radiusMd: tok('--radius-md'), radiusLg: tok('--radius-lg'), radiusPill: tok('--radius-pill'),
      ctlSm: tok('--control-height-sm'), ctlMd: tok('--control-height-md'), ctlLg: tok('--control-height-lg'),
      chipTag: tok('--chip-tag-height'), chipStatus: tok('--chip-status-height'),
      tracking: tok('--type-letter-spacing-label'),
      displayLg: tok('--type-size-display-lg'), displaySm: tok('--type-size-display-sm'), displayHero: tok('--type-size-display-hero'),
      density: document.documentElement.getAttribute('data-density'),
    };

    const loginScreen = document.getElementById('login-screen');
    const loginTitleEl = document.querySelector('.login-title');
    const loginBtnEl = document.getElementById('login-btn');
    out.loginScreenVisible = loginScreen && getComputedStyle(loginScreen).display !== 'none';
    if (loginTitleEl) {
      const cs = getComputedStyle(loginTitleEl);
      out.loginTitle = { fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight };
    }
    if (loginBtnEl) {
      const cs = getComputedStyle(loginBtnEl);
      out.loginBtn = { radius: cs.borderTopLeftRadius, fontFamily: cs.fontFamily };
    }

    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetParent !== null;
      if (!visible) continue;
      if (cs.borderTopLeftRadius && cs.borderTopLeftRadius !== '0px') out.radii.push(cs.borderTopLeftRadius);
      if (el.children.length || !(el.textContent || '').trim()) continue;
      if (cs.fontFamily.split(',')[0].replace(/['"]/g, '') === 'Cinzel') {
        out.cinzel.push([Math.round(parseFloat(cs.fontSize)) + 'px/' + cs.fontWeight,
          (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase())]);
      }
    }
    return out;
  });
  tokens ??= r.tokens; loginTitle ??= r.loginTitle; loginBtn ??= r.loginBtn;
  r.radii.forEach(x => radii.add(x));
  r.cinzel.forEach(([k, sel]) => { if (!cinzel.has(k)) cinzel.set(k, sel); });
  if (!r.loginScreenVisible) console.warn(`  WARNING: #login-screen never became visible on ${p} — Cinzel/radius sweep below only covers whatever chrome WAS visible.`);
}
await browser.close(); server.close();

const ok = (b) => (b ? 'PASS' : 'FAIL');
const ALLOWED_RADII = ['4px', '8px', '12px', '999px', '50%'];
const badRadii = [...radii].filter(r => !ALLOWED_RADII.includes(r) && !r.includes('%'));
// Allowed Cinzel tiers: display-lg (24/700), display-sm (18/700), display-hero (64/700, TM-Game-
// specific extension for .rv2-eff — not reachable by this static sweep, see file header).
const badCinzel = [...cinzel.keys()].filter(k => !['24px/700', '18px/700', '64px/700'].includes(k));

console.log(`\n============ TM GAME TOKEN VERIFICATION ============`);
console.log(`  swept ${PAGES.length} page (index.html) at a 420px phablet viewport — see file header for why not more\n`);
console.log(`${ok(tokens.radiusSm === '4px' && tokens.radiusMd === '8px' && tokens.radiusLg === '12px' && tokens.radiusPill === '999px')}  radius scale defined              -> sm ${tokens.radiusSm}, md ${tokens.radiusMd}, lg ${tokens.radiusLg}, pill ${tokens.radiusPill}`);
console.log(`${ok(tokens.ctlSm === '36px' && tokens.ctlMd === '44px' && tokens.ctlLg === '52px')}  PHABLET control height (no desktop opt-out) -> sm ${tokens.ctlSm} / md ${tokens.ctlMd} / lg ${tokens.ctlLg}`);
console.log(`${ok(tokens.density === null)}  no data-density attr (correct here) -> ${tokens.density ?? '(none)'}`);
console.log(`${ok(tokens.chipTag === '20px' && tokens.chipStatus === '30px' && tokens.tracking === '0.06em')}  chip + tracking tokens             -> tag ${tokens.chipTag}, status ${tokens.chipStatus}, tracking ${tokens.tracking}`);
console.log(`${ok(tokens.displayLg === '24px' && tokens.displaySm === '18px' && tokens.displayHero === '64px')}  type-size display tiers            -> lg ${tokens.displayLg}, sm ${tokens.displaySm}, hero ${tokens.displayHero}`);
console.log(`${ok(!!loginTitle && loginTitle.fontFamily.includes('Cinzel') && loginTitle.fontSize === '24px' && loginTitle.fontWeight === '700')}  .login-title: Cinzel, 24px, bold   -> ${loginTitle ? `${loginTitle.fontFamily} ${loginTitle.fontSize} ${loginTitle.fontWeight}` : '(not found — #login-screen never revealed)'}`);
console.log(`${ok(!!loginBtn && loginBtn.radius === '8px' && !loginBtn.fontFamily.includes('Cinzel'))}  .login-crim-btn: radius-md, not Cinzel -> ${loginBtn ? `${loginBtn.radius} ${loginBtn.fontFamily}` : '(not found)'}`);
console.log(`${ok(badRadii.length === 0)}  visible radii on the 5-value scale -> ${badRadii.length ? 'STRAGGLERS: ' + badRadii.join(' ') : [...radii].join(' ') || '(none rendered)'}`);
console.log(`${ok(badCinzel.length === 0)}  Cinzel display-tier + bold only    -> ${badCinzel.length ? 'BELOW TIER: ' + badCinzel.map(k => k + ' ' + cinzel.get(k)).join('  ') : [...cinzel.keys()].sort().join('  ') || '(none rendered)'}`);
console.log('======================================================\n');
