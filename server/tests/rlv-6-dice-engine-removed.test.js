/**
 * rlv.6 — dice-engine.js and its dead sidecar wiring removed.
 *
 * dice-engine.js was already fully unreachable before this story (no
 * admin-nav entry, no #engine-content mount point — the Engine domain's own
 * nav entry was already gone from admin.html, per a 2026-06-17 investigation
 * note, issue #846, "zero callers, confirmed"). This story deletes the file
 * itself plus its now-pointless import and no-op switchDomain() branch in
 * admin.js, and the orphaned #dice-engine/#feeding-engine CSS block.
 *
 * Structured as source-text checks (not a live import) for the same reason
 * as server/tests/issue-836-legacy-tracker-cache-removed.test.js: admin.js
 * transitively pulls in browser globals (location via api.js) and cannot be
 * imported in a node test environment.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(REPO_ROOT, rel)); }

describe('rlv.6 — dice-engine.js removed', () => {
  it('public/js/admin/dice-engine.js no longer exists', () => {
    expect(exists('public/js/admin/dice-engine.js')).toBe(false);
  });
});

describe('rlv.6 — admin.js drops dead Engine-domain wiring', () => {
  const src = read('public/js/admin.js');
  it('no longer imports initDiceEngine', () => {
    expect(src).not.toMatch(/import\s*\{\s*initDiceEngine\s*\}/);
    expect(src).not.toMatch(/from\s*['"]\.\/admin\/dice-engine\.js['"]/);
  });
  // gdx.8 (#989) deliberately reintroduces a `domain === 'engine'` branch for
  // an unrelated feature (persisted roll history / live ST roll feed, via
  // initRollFeed in public/js/admin/roll-feed.js). Per this repo's "a test
  // asserts the behaviour this story changes" convention, this assertion is
  // corrected rather than deleted: rlv.6's real intent was guarding against
  // the DELETED dice-engine.js wiring coming back, not against the 'engine'
  // domain id itself ever being reused for something new.
  it("switchDomain()'s engine branch never re-wires the deleted dice-engine.js", () => {
    // Review fix (Blind Hunter): the original three regexes only matched one
    // exact shape (`import { initDiceEngine }` / `from './admin/dice-engine.js'`)
    // — an aliased import (`{ initDiceEngine as x }`) or a dynamic
    // `import('./admin/dice-engine.js')` would defeat them while still
    // re-wiring the deleted module. Since dice-engine.js no longer exists on
    // disk at all (previous test), the broadest reliable guard is the
    // literal path string itself — no import syntax can reference the
    // module without it. A bare `initDiceEngine` substring would also match
    // admin.js's own rlv.6 removal comment (line 37), so that one stays
    // scoped to real import/call shapes rather than widened the same way.
    expect(src).not.toContain('/admin/dice-engine.js');
    expect(src).not.toMatch(/import\s*\{\s*initDiceEngine(\s+as\s+\w+)?\s*\}/);
    expect(src).not.toMatch(/initDiceEngine\s*\(/);
  });
});

describe('rlv.6 — admin-layout.css drops dead Engine-domain rules', () => {
  const css = read('public/css/admin-layout.css');
  it('no longer contains #dice-engine rules', () => {
    expect(css).not.toMatch(/#dice-engine/);
  });
  it('no longer contains #feeding-engine rules', () => {
    expect(css).not.toMatch(/#feeding-engine/);
  });
});

describe('rlv.6 — tests/admin.spec.js drops the stale Engine Domain describe block', () => {
  const src = read('tests/admin.spec.js');
  it('no longer has an "Admin — Engine Domain" describe block', () => {
    expect(src).not.toMatch(/Admin — Engine Domain/);
  });
  it('no longer has a "clicking Engine switches domain" test', () => {
    expect(src).not.toMatch(/clicking Engine switches domain/);
  });
  // The "Admin — Next Session Panel" block's own data-domain="engine" clicks
  // are a separate, pre-existing, out-of-scope bug (flagged in the story's
  // own "What this story is NOT") — deliberately NOT asserted against here.
});
