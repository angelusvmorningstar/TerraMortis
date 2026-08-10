/**
 * BL-2 (issue #1008) — the cache is primed, and the banner mounted, in BOTH
 * apps at boot.
 *
 * AC 6, 7, 9. Static analysis: `admin.js` and `app.js` are ~1400 and ~1300
 * line boot scripts that touch the DOM, the WS and localStorage on import, so
 * they are not importable in this runner. What matters here is wiring, and
 * wiring is exactly what a grep can confirm.
 *
 * AC 7 is the load-bearing one: the transient "cache not loaded" miss is the
 * dangerous one because it hits every bloodline character at once and heals on
 * reload. Both boot paths therefore AWAIT the load before anything renders, so
 * the miss can only fire when the fetch genuinely failed.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/**
 * Source with comments removed.
 *
 * Non-negotiable for every assertion below. The first cut of this file grepped
 * raw source for `loadBloodlines()`, and both apps mention that call BY NAME in
 * the comments explaining it — so the test passed against prose and would have
 * stayed green with the actual call deleted. A wiring guard that a comment can
 * satisfy is not a guard.
 */
function code(rel) {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const APPS = [
  ['public/js/app.js', 'player app'],
  ['public/js/admin.js', 'ST admin'],
];

describe('BL-2 — both apps prime the cache and mount the banner', () => {
  for (const [file, label] of APPS) {
    it(`${label} imports the cache loader and the banner`, () => {
      const src = code(file);
      expect(src).toMatch(/from\s+['"][./]*data\/bloodlines-cache\.js['"]/);
      expect(src).toMatch(/from\s+['"][./]*components\/bloodline-warn-banner\.js['"]/);
    });

    it(`${label} actually calls loadBloodlines(), in code and not in a comment`, () => {
      expect(code(file)).toMatch(/loadBloodlines\(\)/);
    });

    it(`${label} mounts the warning banner`, () => {
      expect(code(file)).toMatch(/mountBloodlineWarnBanner\(\)/);
    });
  }

  it('the comment-stripper works — these greps would otherwise pass on prose alone', () => {
    // Proof the guard above is real: both apps DO mention loadBloodlines() in
    // their comments, so a raw-source grep is satisfied without any call.
    for (const [file] of APPS) {
      const raw = read(file);
      const stripped = code(file);
      const rawHits = (raw.match(/loadBloodlines\(\)/g) || []).length;
      const codeHits = (stripped.match(/loadBloodlines\(\)/g) || []).length;
      expect(rawHits).toBeGreaterThan(codeHits);
    }
  });
});

describe('BL-2 — AC 7: nothing is costed against an unloaded cache', () => {
  it('the player app awaits the load inside its boot Promise.allSettled', () => {
    const src = code('public/js/app.js');
    const at = src.indexOf('Promise.allSettled([');
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf(']);', at));
    expect(block).toMatch(/loadBloodlines\(\)/);
    expect(src).toMatch(/await Promise\.allSettled\(\[/);
  });

  it('the admin app awaits the load before it fetches and renders characters', () => {
    const src = code('public/js/admin.js');
    const loadAt = src.indexOf('await loadBloodlines()');
    const charsAt = src.indexOf("chars = await apiGet('/api/characters')");
    expect(loadAt).toBeGreaterThan(-1);
    expect(charsAt).toBeGreaterThan(-1);
    expect(loadAt).toBeLessThan(charsAt);
  });
});

describe('BL-2 — the failure is surfaced, not just logged (drift #16)', () => {
  it('neither app routes the bloodline warning through the dead app-status-banner', () => {
    // `app-status-banner` has no element and no CSS anywhere in the repo. The
    // rules-engine path still references it; this story must not add a second
    // caller to a surface that does not exist.
    // Proximity is the wrong instrument here: the pre-existing rules-engine
    // block that legitimately (if uselessly) references app-status-banner sits
    // close to the boot code. Assert the RELATIONSHIP instead — no line that
    // touches the dead id may also be part of the bloodline path.
    for (const [file, label] of APPS) {
      const offenders = code(file)
        .split('\n')
        .filter(l => /app-status-banner/.test(l) && /bloodline/i.test(l));
      expect(offenders, `${label} must not route the bloodline warning through app-status-banner`).toEqual([]);
    }
  });
});
