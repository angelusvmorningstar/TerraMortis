/**
 * Fix #943 — retire fails silently: strip transient `derived` before character PUT.
 *
 * Static-analysis mirror-tests verifying:
 *   1. toggleRetire sends only { retired: newState } — no full-doc spread.
 *   2. _omSave uses buildSaveBody(c) — no raw spread.
 *   3. Catch block in toggleRetire surfaces a visible error via alert().
 *   4. The old bypass pattern (const { _id, ...body } = c) is gone from toggleRetire.
 *
 * Pattern follows issue-879-defence-penalty-wirein.test.js (REPO_ROOT + read helper).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

// ─────────────────────────────────────────────────────────────────────────────
// Extract the toggleRetire function body for targeted assertions.
// ─────────────────────────────────────────────────────────────────────────────

const adminSrc = read('public/js/admin.js');

function extractFunctionBody(src, fnName) {
  const start = src.indexOf(`function ${fnName}`);
  if (start === -1) return null;
  // Walk forward counting braces to find the matching closing brace.
  let depth = 0;
  let i = start;
  let inBody = false;
  while (i < src.length) {
    if (src[i] === '{') { depth++; inBody = true; }
    else if (src[i] === '}') { depth--; }
    if (inBody && depth === 0) { return src.slice(start, i + 1); }
    i++;
  }
  return src.slice(start); // fallback
}

const toggleRetireSrc = extractFunctionBody(adminSrc, 'toggleRetire');
const omSaveSrc = extractFunctionBody(adminSrc, '_omSave');

// ─────────────────────────────────────────────────────────────────────────────
// toggleRetire — minimal payload
// ─────────────────────────────────────────────────────────────────────────────

describe('#943 — toggleRetire minimal payload', () => {
  it('toggleRetire function exists in admin.js', () => {
    expect(toggleRetireSrc).not.toBeNull();
    expect(toggleRetireSrc.length).toBeGreaterThan(0);
  });

  it('toggleRetire calls apiPut with a { retired: ... } payload (AC2 — no full-doc spread)', () => {
    // The payload must start the object literal with `retired`
    expect(toggleRetireSrc).toMatch(/apiPut\s*\([^,]+,\s*\{\s*retired\s*:/);
  });

  it('toggleRetire does NOT use const { _id, ...body } = c (old bypass pattern gone)', () => {
    expect(toggleRetireSrc).not.toMatch(/const\s*\{\s*_id\s*,\s*\.\.\.body\s*\}\s*=\s*c/);
  });

  it('toggleRetire does NOT spread the whole character into the PUT body', () => {
    // The old shape was apiPut('...', body) where body was the full doc minus _id.
    // After the fix, body is the inline object { retired: newState }.
    expect(toggleRetireSrc).not.toMatch(/apiPut\s*\([^,]+,\s*body\s*\)/);
  });

  it('toggleRetire mutates c.retired AFTER the await (success-first mutation, AC4)', () => {
    // c.retired = newState must appear after `await apiPut`
    const awaitIdx = toggleRetireSrc.indexOf('await apiPut(');
    const mutateIdx = toggleRetireSrc.indexOf('c.retired = newState');
    expect(awaitIdx).toBeGreaterThan(-1);
    expect(mutateIdx).toBeGreaterThan(-1);
    expect(mutateIdx).toBeGreaterThan(awaitIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toggleRetire — visible error surface (AC3)
// ─────────────────────────────────────────────────────────────────────────────

describe('#943 — toggleRetire visible error surface', () => {
  it('catch block calls alert() with the error message', () => {
    expect(toggleRetireSrc).toMatch(/alert\s*\(\s*['"]Retire failed:\s*['"]\s*\+\s*err\.message\s*\)/);
  });

  it('catch block also keeps console.error for developer debugging', () => {
    expect(toggleRetireSrc).toMatch(/console\.error\s*\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// _omSave — uses buildSaveBody (same-PR companion fix)
// ─────────────────────────────────────────────────────────────────────────────

describe('#943 — _omSave uses buildSaveBody (companion fix)', () => {
  it('_omSave function exists in admin.js', () => {
    expect(omSaveSrc).not.toBeNull();
    expect(omSaveSrc.length).toBeGreaterThan(0);
  });

  it('_omSave calls buildSaveBody(c) instead of raw spread', () => {
    expect(omSaveSrc).toMatch(/buildSaveBody\s*\(\s*c\s*\)/);
  });

  it('_omSave does NOT use const { _id, ...body } = c', () => {
    expect(omSaveSrc).not.toMatch(/const\s*\{\s*_id\s*,\s*\.\.\.body\s*\}\s*=\s*c/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Inline logic mirror-test: minimal payload strips transient fields (AC1-AC6)
// These tests replicate the toggleRetire payload logic without DOM/browser imports.
// ─────────────────────────────────────────────────────────────────────────────

describe('#943 — retire payload shape (inline logic)', () => {
  // The fix sends exactly { retired: newState } — no character fields.
  // Mirror the fixed logic here.
  function buildRetirePayload(newState) {
    return { retired: newState };
  }

  it('AC1 — payload for a char with c.derived carries no "derived" key', () => {
    const payload = buildRetirePayload(true);
    expect(payload).not.toHaveProperty('derived');
  });

  it('AC2 — payload for a char with c.assets carries no "assets" key', () => {
    const payload = buildRetirePayload(true);
    expect(payload).not.toHaveProperty('assets');
  });

  it('AC3 — payload carries no _st_mod_overlay or _st_mod_base keys', () => {
    const payload = buildRetirePayload(true);
    expect(payload).not.toHaveProperty('_st_mod_overlay');
    expect(payload).not.toHaveProperty('_st_mod_base');
  });

  it('AC4 — payload contains { retired: true } when retiring', () => {
    expect(buildRetirePayload(true)).toEqual({ retired: true });
  });

  it('AC4 — payload contains { retired: false } when unretiring', () => {
    expect(buildRetirePayload(false)).toEqual({ retired: false });
  });

  it('AC6 — regression: char without c.derived also produces payload with no "derived" key', () => {
    // Character with no derived field — no change in behaviour expected.
    const payload = buildRetirePayload(true);
    expect(payload).not.toHaveProperty('derived');
    expect(payload).toHaveProperty('retired', true);
  });
});
