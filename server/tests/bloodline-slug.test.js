/**
 * `server/lib/bloodline-slug.js` — `deriveSlug`.
 *
 * ADMR-1 (2026-08-26) relocated this suite here from `bl4-bloodlines-write-
 * api.test.js`, which was deleted wholesale when the ST-facing bloodlines
 * write route it belonged to retired to TM Admin. `deriveSlug` itself is NOT
 * dead code even though the live write route is gone: `server/scripts/
 * archive/seed-bloodlines.js` — frozen, but still smoke-tested by
 * `bl3b-archived-seed-smoke.test.js` for exactly this reason — still imports
 * it, so this repo keeps both the function and its own dedicated unit
 * coverage, independent of any HTTP route.
 *
 * The "the route derives the same slug the seed would" integration test that
 * used to live alongside these is NOT relocated: there is no live route left
 * to compare against. The "derives a schema-legal slug for every migrated
 * bloodline" test below already covers the deeper thing that test was really
 * proving — this implementation agrees with the data as originally migrated.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveSlug } from '../lib/bloodline-slug.js';
import { bloodlineSchema } from '../schemas/bloodline.schema.js';
import { BLOODLINE_FIXTURES } from './helpers/bloodline-fixtures.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every `.js` under `dir`, skipping `node_modules`. */
function walkJs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'node_modules') walkJs(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.js')) out.push(path.join(dir, e.name));
  }
  return out;
}

/** A source grep must not pass (or fail) on prose. */
const stripComments = src => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('deriveSlug has exactly one implementation', () => {
  it('no file under server/ outside scripts/archive defines a second slug derivation', () => {
    const SERVER = path.join(REPO_ROOT, 'server');
    const offenders = [];
    for (const file of walkJs(SERVER)) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      if (rel === 'server/lib/bloodline-slug.js') continue;       // the one implementation
      if (rel.startsWith('server/scripts/archive/')) continue;    // retired, frozen, not live
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      if (/(function|const|let|var)\s+deriveSlug\b/.test(src)) offenders.push(rel);
    }
    expect(offenders, 'deriveSlug must have exactly one live implementation').toEqual([]);
  });

  it('everything that CALLS deriveSlug imports the shared module', () => {
    // Call sites, not mentions. A file that invokes `deriveSlug(...)` without
    // importing it is either a second implementation or a ReferenceError
    // waiting to happen.
    const SERVER = path.join(REPO_ROOT, 'server');
    const offenders = [];
    for (const file of walkJs(SERVER)) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      if (rel === 'server/lib/bloodline-slug.js') continue;
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      if (!/(^|[^.\w])deriveSlug\s*\(/.test(src)) continue;
      if (!/bloodline-slug\.js/.test(src)) offenders.push(rel);
    }
    expect(offenders, 'these call deriveSlug without importing lib/bloodline-slug.js').toEqual([]);
  });
});

describe('deriveSlug', () => {
  it('lowercases a single word', () => {
    expect(deriveSlug('Khaibit')).toBe('khaibit');
  });

  it('hyphenates spaces', () => {
    expect(deriveSlug('Order of Sir Martin')).toBe('order-of-sir-martin');
    expect(deriveSlug('Scions of the First City')).toBe('scions-of-the-first-city');
    expect(deriveSlug('Hounds of Actaeon')).toBe('hounds-of-actaeon');
  });

  it('strips diacritics rather than hyphenating through them', () => {
    // Naive non-alphanumeric replacement would give "lid-rc", which is a legal
    // kebab string but a nonsense identifier.
    expect(deriveSlug('Lidérc')).toBe('liderc');
  });

  it('collapses runs of separators and trims the ends', () => {
    expect(deriveSlug("  The O'Hara  Line  ")).toBe('the-o-hara-line');
  });

  it('derives a schema-legal slug for every migrated bloodline', () => {
    const slugPattern = new RegExp(bloodlineSchema.properties.slug.pattern);
    expect(BLOODLINE_FIXTURES).toHaveLength(23);
    for (const { name, slug } of BLOODLINE_FIXTURES) {
      const derived = deriveSlug(name);
      expect(slugPattern.test(derived), `slug "${derived}" from "${name}" is not schema-legal`).toBe(true);
      // ...and it still agrees with the slug the migration actually wrote.
      expect(derived, `derivation drifted for "${name}"`).toBe(slug);
    }
  });
});
