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
  it('switchDomain() no longer has an engine branch', () => {
    expect(src).not.toMatch(/domain\s*===\s*['"]engine['"]/);
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
