/**
 * Tests for server/scripts/rules-verify/verify-no-bonus-writes.js — TM Admin
 * Story tm-admin.10.1 AC2/AC3 (bonus write-freeze guard).
 *
 * Two groups:
 *   1. Real-repo run — confirms the guard is clean against the real manifest
 *      (3-item allowlist, including the TEMPORARY shAdjMeritBonus entry
 *      added 2026-08-31 with Angelus's explicit sign-off — see
 *      bonus-write-allowlist.json's own $comment and Story tm-admin.10.1's
 *      Dev Agent Record), AND independently re-proves the detector still
 *      finds that exact write site when the temporary entry isn't present
 *      — so this regression test still catches the underlying bug class
 *      even though it is currently allowlisted, and stops silently
 *      "passing" if the write site's shape ever changes underneath the
 *      allowlist entry.
 *   2. Synthetic fixtures — prove the detector's true-positive/true-negative
 *      boundary (literal-zero writes allowed, pass-through object-literal
 *      construction not flagged, excluded dirs never scanned) without
 *      depending on real source staying exactly as-is.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyNoBonusWrites, loadManifest } from '../scripts/rules-verify/verify-no-bonus-writes.js';

describe('verify-no-bonus-writes — real repo state', () => {
  it('is clean against the real (3-item) manifest', () => {
    const result = verifyNoBonusWrites();
    expect(result.filesScanned).toBeGreaterThan(100); // sanity: server/ + public/js/ both scanned
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('still detects shAdjMeritBonus underneath the temporary allowlist entry (regression guard on the entry itself)', () => {
    const realManifest = loadManifest();
    const withoutTemporaryEntry = {
      ...realManifest,
      allowlist: realManifest.allowlist.filter(a => a.path !== 'public/js/editor/edit.js'),
    };
    const result = verifyNoBonusWrites(undefined, withoutTemporaryEntry);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: 'public/js/editor/edit.js',
        kind: 'assignment',
      }),
    ]);
    expect(result.violations[0].text).toContain('m.bonus = Math.max(0, (m.bonus || 0) + delta)');
    expect(result.ok).toBe(false);
  });
});

describe('verify-no-bonus-writes — synthetic fixtures', () => {
  let tmpRoot;

  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  function makeFixture(files) {
    tmpRoot = mkdtempSync(join(tmpdir(), 'bonus-guard-test-'));
    for (const [relPath, content] of Object.entries(files)) {
      const full = join(tmpRoot, relPath);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, content, 'utf8');
    }
    return tmpRoot;
  }

  it('flags a direct nonzero assignment to .bonus', () => {
    const root = makeFixture({
      'public/js/bad.js': `export function f(c) { c.attributes.Presence.bonus = 5; }\n`,
    });
    const result = verifyNoBonusWrites(root);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].kind).toBe('assignment');
  });

  it('flags a compound assignment to .bonus', () => {
    const root = makeFixture({
      'public/js/bad.js': `export function f(m, delta) { m.bonus += delta; }\n`,
    });
    const result = verifyNoBonusWrites(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0].kind).toBe('assignment');
  });

  it('flags a nonzero Mongo dot-path $set key ending in .bonus', () => {
    const root = makeFixture({
      'server/routes/bad.js': `const doc = { $set: { 'attributes.Presence.bonus': delta } };\n`,
    });
    const result = verifyNoBonusWrites(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0].kind).toBe('dot-path-key');
  });

  it('allows a literal-zero direct assignment (zeroing is the safe direction)', () => {
    const root = makeFixture({
      'public/js/ok.js': `export function f(m) { if (m.bonus === undefined) m.bonus = 0; }\n`,
    });
    const result = verifyNoBonusWrites(root);
    expect(result.ok).toBe(true);
  });

  it('allows a literal-zero Mongo dot-path $set key', () => {
    const root = makeFixture({
      'server/scripts_not_excluded/ok.js': `const doc = { $set: { 'attributes.Presence.bonus': 0 } };\n`,
    });
    const result = verifyNoBonusWrites(root);
    expect(result.ok).toBe(true);
  });

  it('does not flag a read (?./|| 0) or object-literal pass-through construction', () => {
    const root = makeFixture({
      'public/js/ok.js': [
        `export function getAttrBonus(c, attr) { return c.attributes?.[attr]?.bonus || 0; }`,
        `export function setAttrVal(c, attr, dots, bonus) {`,
        `  c.attributes[attr] = { ...(c.attributes[attr] || {}), dots, bonus: bonus || 0 };`,
        `}`,
        '',
      ].join('\n'),
    });
    const result = verifyNoBonusWrites(root);
    expect(result.ok).toBe(true);
  });

  it('does not scan excluded directories (server/tests/**, server/scripts/**) even when they contain a real violation', () => {
    const root = makeFixture({
      'server/tests/fixture-seed.test.js': `col.updateOne({}, { $set: { 'attributes.Presence.bonus': 5 } });\n`,
      'server/scripts/one-off.mjs': `c.attributes.Presence.bonus = 5;\n`,
    });
    const result = verifyNoBonusWrites(root);
    expect(result.ok).toBe(true);
    expect(result.filesScanned).toBe(0);
  });

  it('does not scan *.test.js files anywhere', () => {
    const root = makeFixture({
      'public/js/weird.test.js': `c.attributes.Presence.bonus = 5;\n`,
    });
    const result = verifyNoBonusWrites(root);
    expect(result.ok).toBe(true);
  });

  it('an allowlisted file path is never flagged even if it writes a nonzero bonus', () => {
    // Real allowlist entries live in TM Admin's tree (outside this repo's
    // own scan_roots), so they never actually match during a real TM-Game
    // scan — that is the intended, documented behaviour (see the manifest's
    // own $comment). This test exercises the allowlist-matching mechanism
    // itself in isolation, via a manifest override, rather than relying on
    // the real entries' cross-repo paths lining up with a local fixture.
    const root = makeFixture({
      'server/routes/allowed.js': `c.attributes.Presence.bonus = 2;\n`,
    });
    const manifestOverride = {
      scan_roots: ['server', 'public/js'],
      exclude_globs: [],
      allowlist: [{ path: 'server/routes/allowed.js', repo: 'test', status: 'test', reason: 'test' }],
    };
    const result = verifyNoBonusWrites(root, manifestOverride);
    expect(result.ok).toBe(true);
    expect(result.filesScanned).toBe(1); // file was found, just skipped via allowlist
  });
});
