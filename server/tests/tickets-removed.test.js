/**
 * Regression guard — the ticket system stays deleted (#1135).
 *
 * AC8 of issue-1135 is "a call to /api/tickets returns 404". That was verified
 * once against a real booted server; what was missing was anything to stop it
 * silently coming back.
 *
 * This is deliberately a STATIC guard, not a runtime 404 assertion. Asserting a
 * 404 against `tests/helpers/test-app.js` would prove nothing, because that
 * harness builds its own router table and never mounted tickets in the first
 * place; the only meaningful subject is the real mount table in server/index.js.
 * So this reads the source instead, which needs no database and no live server.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(serverRoot, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(serverRoot, p));

describe('#1135 — the ticket system is gone and stays gone', () => {
  it('server/index.js mounts no /api/tickets route', () => {
    const src = read('index.js');
    expect(src).not.toMatch(/['"`]\/api\/tickets['"`]/);
    expect(src).not.toMatch(/ticketsRouter/);
  });

  it('the ticket route and schema files do not exist', () => {
    expect(exists('routes/tickets.js')).toBe(false);
    expect(exists('schemas/ticket.schema.js')).toBe(false);
  });

  it('no server route file references the removed ticket module', () => {
    const dir = path.join(serverRoot, 'routes');
    const offenders = fs.readdirSync(dir)
      .filter(f => f.endsWith('.js'))
      .filter(f => /require\(.*tickets|from\s+['"].*tickets/.test(read(path.join('routes', f))));
    expect(offenders).toEqual([]);
  });
});
