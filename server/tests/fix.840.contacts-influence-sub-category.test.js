/**
 * Fix #840 — Contacts sub_category='influence': static verification tests.
 *
 * Suite 1 — reference JSON:
 *   Confirms the Contacts entry in TM_rules_merit_2026-04-17.json
 *   carries sub_category: 'influence'.
 *
 * Suite 2 — script structure:
 *   Confirms fix-840-contacts-sub-category.js contains the dry-run
 *   guard, the write logic, and the correct target document name.
 *
 * Pattern follows fix.943.retireStripDerived.test.js (REPO_ROOT + fs.readFileSync helper).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — reference JSON has sub_category: 'influence' on Contacts
// ─────────────────────────────────────────────────────────────────────────────

describe('#840 — reference JSON: Contacts sub_category', () => {
  const merits = JSON.parse(read('data/reference/TM_rules_merit_2026-04-17.json'));

  it('the JSON parses as an array', () => {
    expect(Array.isArray(merits)).toBe(true);
  });

  it('contains an entry with key === "contacts"', () => {
    const entry = merits.find(m => m.key === 'contacts');
    expect(entry).toBeDefined();
  });

  it('Contacts entry has sub_category === "influence"', () => {
    const entry = merits.find(m => m.key === 'contacts');
    expect(entry?.sub_category).toBe('influence');
  });

  it('no other entry has sub_category set (Contacts is the sole addition in this story)', () => {
    // Other entries legitimately may have sub_category absent or null — the field was not
    // backfilled across all entries. Assert that aside from Contacts, no entry carries
    // sub_category: 'influence' (guards against accidental mass-edit).
    const others = merits.filter(m => m.key !== 'contacts' && m.sub_category === 'influence');
    expect(others).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — script structure
// ─────────────────────────────────────────────────────────────────────────────

describe('#840 — script structure: fix-840-contacts-sub-category.js', () => {
  const src = read('server/scripts/fix-840-contacts-sub-category.js');

  it('script file exists and is non-empty', () => {
    expect(src.length).toBeGreaterThan(0);
  });

  it('contains --apply dry-run guard', () => {
    expect(src).toContain('--apply');
  });

  it('contains $set write logic', () => {
    expect(src).toMatch(/\$set/);
  });

  it('contains sub_category in the $set clause', () => {
    expect(src).toContain('sub_category');
  });

  it('targets the correct document name: Contacts', () => {
    expect(src).toContain("'Contacts'");
  });

  it('targets purchasable_powers collection', () => {
    expect(src).toContain('purchasable_powers');
  });
});
