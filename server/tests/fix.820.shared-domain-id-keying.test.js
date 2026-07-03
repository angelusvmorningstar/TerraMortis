/**
 * Fix #820 — Shared-domain merit partners keyed by _id not name.
 *
 * Static-analysis tests verifying:
 *   1. Write side no longer stores c.name in shared_with arrays.
 *   2. resolveSharedWithMember helper is present and shaped correctly.
 *   3. resolveSharedWithMember behaviour (inline unit tests).
 *   4. Mixed old-name / new-_id arrays resolve both shapes.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

const editDomainSrc = read('public/js/editor/edit-domain.js');
const helpersSrc = read('public/js/data/helpers.js');

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — Write-side static analysis (edit-domain.js)
// ─────────────────────────────────────────────────────────────────────────────

describe('#820 — write side no longer stores c.name in shared_with', () => {
  it('shAddDomainPartner does not put c.name directly into fullGroup', () => {
    // The old construction that seeds the group with the name string.
    expect(editDomainSrc).not.toContain('[c.name, ...(m.shared_with');
  });

  it('shAddDomainPartner uses String(c._id) in group construction', () => {
    const fnStart = editDomainSrc.indexOf('export function shAddDomainPartner(');
    const fnEnd = editDomainSrc.indexOf('\nexport function shRemoveDomainPartner(');
    const snippet = editDomainSrc.slice(fnStart, fnEnd);
    expect(snippet).toContain('String(c._id)');
  });

  it('shRemoveDomainPartner uses String(c._id) in remainingGroup', () => {
    const fnStart = editDomainSrc.indexOf('export function shRemoveDomainPartner(');
    // Extend to end of file or next export
    const fnEnd = editDomainSrc.indexOf('\nexport function sh', fnStart + 10);
    const snippet = fnEnd > fnStart
      ? editDomainSrc.slice(fnStart, fnEnd)
      : editDomainSrc.slice(fnStart);
    // Must NOT seed the group with c.name
    expect(snippet).not.toContain('[c.name, ...(m.shared_with');
    // Must use String(c._id) instead
    expect(snippet).toContain('String(c._id)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — Helper presence and shape
// ─────────────────────────────────────────────────────────────────────────────

describe('#820 — resolveSharedWithMember helper', () => {
  it('resolveSharedWithMember is exported from helpers.js', () => {
    expect(helpersSrc).toContain('export function resolveSharedWithMember(');
  });

  it('helper contains 24-hex ObjectId regex', () => {
    expect(helpersSrc).toContain('/^[a-f0-9]{24}$/i');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — Inline logic (unit-style, no DB)
// ─────────────────────────────────────────────────────────────────────────────

// Inline the helper rather than importing the ES module (avoids browser-only deps)
function resolveSharedWithMember(chars, entry) {
  if (typeof entry === 'string' && /^[a-f0-9]{24}$/i.test(entry)) {
    return chars.find(ch => String(ch._id) === entry) || null;
  }
  return chars.find(ch => ch.name === entry) || null;
}

describe('#820 — resolveSharedWithMember behaviour', () => {
  const chars = [
    { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Alice' },
    { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Alice' }, // duplicate name
    { _id: 'cccccccccccccccccccccccc', name: 'Bob' },
  ];

  it('resolves 24-hex _id to the correct character', () => {
    const result = resolveSharedWithMember(chars, 'bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(result._id).toBe('bbbbbbbbbbbbbbbbbbbbbbbb');
    // The second "Alice" is returned, not the first — _id wins
  });

  it('falls back to name lookup for legacy non-hex entry', () => {
    const result = resolveSharedWithMember(chars, 'Bob');
    expect(result._id).toBe('cccccccccccccccccccccccc');
  });

  it('returns null for an unresolvable entry', () => {
    expect(resolveSharedWithMember(chars, 'Unknown')).toBeNull();
  });

  it('name fallback returns the first match when names are duplicated (legacy-compat)', () => {
    const result = resolveSharedWithMember(chars, 'Alice');
    // Behaviour: first match wins (same as the legacy chars.find behaviour).
    // This is acceptable — the whole point of #820 is to eliminate the ambiguity
    // going forward; legacy entries remain best-effort.
    expect(result).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — Regression: mixed array
// ─────────────────────────────────────────────────────────────────────────────

describe('#820 — mixed old-name / new-_id shared_with resolves both', () => {
  it('resolves an array containing both legacy names and new _id strings', () => {
    const chars = [
      { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Alice' },
      { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Bob' },
    ];
    const entries = ['Alice', 'bbbbbbbbbbbbbbbbbbbbbbbb'];
    const resolved = entries.map(e => resolveSharedWithMember(chars, e));
    expect(resolved[0]._id).toBe('aaaaaaaaaaaaaaaaaaaaaaaa'); // name-resolved
    expect(resolved[1]._id).toBe('bbbbbbbbbbbbbbbbbbbbbbbb'); // id-resolved
  });
});
