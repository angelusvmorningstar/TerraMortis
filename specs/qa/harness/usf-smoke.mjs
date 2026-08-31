// USF browser smoke + DOM + COMPUTED-STYLE capture harness (Phase 1 gate, ADR-007 D15).
//
// Drives headless Chromium (Playwright) against a LOCAL server, using the dev-login
// `local-test-token` bypass. Reports uncaught pageErrors and *meaningful* console
// errors (benign "no backend" noise filtered). With --classes it navigates the
// relevant tabs (goTab) and captures getComputedStyle for elements carrying the
// affected classes — the D15 gate for CSS-promotion parity (a DOM-structure diff
// alone misses a cascade-order change that leaves the DOM identical but the
// computed value different).
//
// Prereqs for FULL render + meaningful computed capture (Phase 1):
//   npx http-server public -p 8080 -s          # static
//   cd server && npm run dev                    # API on :3000 — accepts local-test-token
//                                               # (server/middleware/auth.js:21, NODE_ENV!=production)
// Boot smoke alone works without the API (computed capture of tab families will be
// empty because those tabs never fetch/mount — run the API for Phase 1 parity).
//
// Usage:
//   node specs/qa/harness/usf-smoke.mjs <role> [--capture out.json] [--classes-file f] [--surfaces a,b,c]
//   node specs/qa/harness/usf-smoke.mjs st --capture before.json --classes-file /tmp/tier0.txt
//
// Parity workflow (per shard): capture on base branch and shard branch, then
//   diff before.json after.json   (expect empty for a non-behavioural shard)
//
// Exit code: 0 if boot clean (no pageErrors / meaningful console errors); 1 otherwise.

import pkg from 'playwright';
const { chromium } = pkg;
import { writeFileSync, readFileSync, existsSync } from 'fs';

const argv = process.argv.slice(2);
const role = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'player';
const opt = (name, def = null) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const BASE = process.env.BASE || 'http://localhost:8080';
const capOut = opt('capture');
const classesFile = opt('classes-file');
const classesInline = opt('classes');
// goTab ids where the Phase-1 overlapping families render (feeding/proj/dt/story) + default view.
const surfaces = (opt('surfaces', 'feeding,downtime,story') || '').split(',').map(s => s.trim()).filter(Boolean);

const classes = [];
if (classesInline) classes.push(...classesInline.split(',').map(s => s.trim()).filter(Boolean));
if (classesFile && existsSync(classesFile)) {
  for (const line of readFileSync(classesFile, 'utf8').split('\n')) {
    const c = line.replace(/^[\s.]+/, '').trim().split(/[\s.:>]/)[0]; // take leading class token
    if (c && !c.startsWith('---') && !classes.includes(c)) classes.push(c);
  }
}

// Curated high-signal visual properties a CSS promotion can change.
const PROPS = [
  'color','background-color','background-image','opacity','visibility','display','position',
  'top','right','bottom','left','z-index','width','height','min-width','max-width','min-height','max-height',
  'margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left',
  'border-top-width','border-right-width','border-bottom-width','border-left-width',
  'border-top-style','border-top-color','border-radius','box-shadow','outline',
  'font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-transform','text-decoration','white-space',
  'flex-direction','flex-wrap','justify-content','align-items','gap','flex-grow','flex-shrink','flex-basis',
  'overflow','cursor','transform',
];

const BENIGN = [/ERR_CONNECTION_REFUSED/,/Failed to load resource/,/equipment-catalogue-cache\] load failed/,/preloadRules failed/,/WebSocket connection to 'ws:\/\/localhost:3000/,/Failed to fetch/];

const authUser = {
  id: 'local-test-' + role, username: 'local_' + role,
  global_name: role === 'st' ? 'Dev ST' : 'Dev Player', avatar: null, role,
  player_id: role === 'st' ? null : 'p-dev-001',
  character_ids: role === 'st' ? [] : ['69d720427fdd1b1f9498b0d4'],
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

await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => pageErrors.push('goto: ' + e.message));
await page.waitForTimeout(2500);
const title = await page.title();

// Computed-style capture across surfaces (only when classes requested).
const computed = {};
if (classes.length) {
  const visit = ['__default__', ...surfaces];
  for (const surf of visit) {
    if (surf !== '__default__') {
      const ok = await page.evaluate(id => { if (typeof goTab === 'function') { try { goTab(id); return true; } catch (e) { return false; } } return false; }, surf);
      if (!ok) continue;
      await page.waitForTimeout(800);
    }
    const snap = await page.evaluate(({ classes, props, surf }) => {
      const out = {};
      for (const cls of classes) {
        const els = Array.from(document.querySelectorAll('.' + CSS.escape(cls)));
        if (!els.length) continue;
        out[cls] = els.map(el => {
          const cs = getComputedStyle(el); const s = {};
          for (const p of props) s[p] = cs.getPropertyValue(p);
          return s;
        });
      }
      return out;
    }, { classes, props: PROPS, surf });
    for (const [cls, arr] of Object.entries(snap)) {
      // keep the first surface where a class renders (stable, avoids dup across tab re-renders)
      if (!computed[cls]) computed[cls] = { surface: surf, elements: arr };
    }
  }
}

const meaningful = allErrors.filter(e => !BENIGN.some(rx => rx.test(e)));
const pass = pageErrors.length === 0 && meaningful.length === 0;
const classesRendered = Object.keys(computed).length;

if (capOut) {
  writeFileSync(capOut, JSON.stringify({ role, surfaces, classesRequested: classes.length, computed }, null, 2));
}

console.log(JSON.stringify({
  pass, role, title,
  pageErrors, meaningfulConsoleErrors: meaningful, benignFiltered: allErrors.length - meaningful.length,
  classesRequested: classes.length, classesRendered,
  classesNotRendered: classes.filter(c => !computed[c]).slice(0, 40),
  captured: capOut || null,
}, null, 2));

await browser.close();
process.exit(pass ? 0 : 1);
