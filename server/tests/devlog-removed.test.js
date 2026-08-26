/**
 * Regression guard — Devlog admin authoring stays deleted (ADMR-2).
 *
 * Unlike Bloodlines (ADMR-1), this is a FULL retirement: no route survives at
 * all. Deleting server/tests/api-devlog.test.js removed the only runtime
 * proof that /api/devlog is gone, matching a gap an external Codex review
 * found: nothing stopped the route quietly coming back.
 *
 * This is deliberately a STATIC guard, not a runtime 404 assertion, mirroring
 * tests/tickets-removed.test.js exactly. Asserting a 404 against
 * tests/helpers/test-app.js would prove nothing, because that harness builds
 * its own router table; the only meaningful subject is the real mount table
 * in server/index.js. So this reads the source instead, which needs no
 * database and no live server.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(serverRoot, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(serverRoot, p));

describe('ADMR-2 — Devlog admin authoring is gone and stays gone', () => {
  it('server/index.js mounts no /api/devlog route', () => {
    const src = read('index.js');
    expect(src).not.toMatch(/['"`]\/api\/devlog['"`]/);
    expect(src).not.toMatch(/devlogRouter/);
  });

  it('server/tests/helpers/test-app.js mounts no /api/devlog route', () => {
    const src = read('tests/helpers/test-app.js');
    expect(src).not.toMatch(/['"`]\/api\/devlog['"`]/);
    expect(src).not.toMatch(/devlogRouter/);
  });

  it('the devlog route and schema files do not exist', () => {
    expect(exists('routes/devlog.js')).toBe(false);
    expect(exists('schemas/devlog_entry.schema.js')).toBe(false);
  });

  it('no server route file references the removed devlog module', () => {
    const dir = path.join(serverRoot, 'routes');
    const offenders = fs.readdirSync(dir)
      .filter(f => f.endsWith('.js'))
      .filter(f => /require\(.*devlog|from\s+['"].*devlog/.test(read(path.join('routes', f))));
    expect(offenders).toEqual([]);
  });
});
