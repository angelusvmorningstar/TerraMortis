/**
 * `server/ws.js`'s shared `_fanOut` fault isolation.
 *
 * ADMR-1 (2026-08-26) relocated this test here from `bl4-bloodlines-admin-
 * view.test.js`, which was deleted wholesale when the Bloodlines admin
 * screen it belonged to retired to TM Admin. This test itself is NOT
 * bloodline-specific - found by an external Codex review of that story,
 * which is right: one bad client socket must not abort a broadcast, or the
 * write it accompanies, for ANY of this app's broadcasters (tracker, ST
 * mods, the equipment catalogue - `broadcastBloodlineUpdate` has since been
 * removed from this list, see below). Losing it as a side effect of an
 * unrelated screen's retirement would have been a real, silent coverage
 * gap in shared infrastructure every other write path depends on.
 *
 * `broadcastBloodlineUpdate` is deliberately NOT in the checked broadcaster
 * list below any more - ADMR-1 removed it from `server/ws.js` entirely, since
 * its only callers were the routes that story also removed.
 * `broadcastSettingsUpdate` (added by gdx.5, after this test was originally
 * written) is also not in the list - out of scope for this relocation, which
 * preserves exactly the coverage that existed, not a new audit of every
 * current broadcaster.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

describe('server/ws.js — one client that throws on send cannot abort the broadcast, or the write', () => {
  it('_fanOut guards ws.send with a try/catch, and no broadcaster keeps its own unguarded loop', () => {
    // Every broadcaster is called after the Mongo mutation and before the HTTP
    // response, so an unguarded `ws.send` that throws both skips the remaining
    // clients and rejects the route handler — Express 5 forwards that, and the
    // caller sees a 500 for a write that succeeded. Originally found by BL-4's
    // own review; all broadcasters shared the gap, so they share one guarded
    // fan-out.
    const serverWs = read('server/ws.js');
    expect(serverWs).toMatch(/function _fanOut\(msg\)/);
    const fanOut = serverWs.slice(serverWs.indexOf('function _fanOut(msg)'), serverWs.indexOf('Broadcast a tracker update'));
    expect(fanOut).toMatch(/try\s*\{[\s\S]*ws\.send\(msg\)[\s\S]*\}\s*catch/);
    // No broadcaster may keep its own unguarded loop.
    const sends = serverWs.match(/ws\.send\(/g) || [];
    expect(sends, 'ws.send must appear only inside the guarded fan-out').toHaveLength(1);
    for (const fn of ['broadcastTrackerUpdate', 'broadcastStModUpdate', 'broadcastCatalogueUpdate']) {
      const start = serverWs.indexOf(`export function ${fn}(`);
      expect(start, `expected ${fn}`).toBeGreaterThan(0);
      expect(serverWs.slice(start, start + 500), `${fn} must fan out through the guarded helper`).toContain('_fanOut(');
    }
  });
});
