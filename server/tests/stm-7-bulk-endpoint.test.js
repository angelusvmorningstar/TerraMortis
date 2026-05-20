/**
 * STM-7 (issue #413) — bulk endpoint + applyOverlayToAll regression tests.
 *
 * Covers:
 *   - Bulk GET shape: { [character_id]: [...mods] } with empty arrays
 *     for requested ids that have no mods
 *   - Auth boundary: ST any, player own-only, player non-own → 403
 *   - CSV cap enforcement
 *   - Single-character GET continues to work (backwards-compat)
 *   - applyOverlayToAll mutation contract: per-character st_mods_suppressed
 *     honoured; globalEnabled=false strips overlay across all chars
 *
 * applyOverlayToAll is exercised by inlining the helper (st-mods.js
 * imports the browser-only `location` at module load) — matches the
 * test pattern used in STM-2 path-resolve sanity + STM-4 popover spec.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const CHAR_A = new ObjectId().toHexString();
const CHAR_B = new ObjectId().toHexString();
const CHAR_C = new ObjectId().toHexString();
const CREATED_IDS = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  await getCollection('st_mods').deleteMany({ character_id: { $in: [CHAR_A, CHAR_B, CHAR_C] } });
  await getCollection('st_mod_audit').deleteMany({ character_id: { $in: [CHAR_A, CHAR_B, CHAR_C] } });

  // Seed: 2 mods on CHAR_A, 1 mod on CHAR_B, 0 mods on CHAR_C
  for (const [charId, count] of [[CHAR_A, 2], [CHAR_B, 1]]) {
    for (let i = 0; i < count; i++) {
      const res = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
        character_id: charId,
        stat_path: 'attributes.Presence.dots',
        delta: 1,
        reason: `seed ${charId.slice(-4)} #${i}`,
        show_reason_to_player: false,
      });
      CREATED_IDS.push(res.body._id);
      // Force created_at ordering
      await new Promise(r => setTimeout(r, 3));
    }
  }
});

afterAll(async () => {
  await getCollection('st_mods').deleteMany({ character_id: { $in: [CHAR_A, CHAR_B, CHAR_C] } });
  await getCollection('st_mod_audit').deleteMany({ character_id: { $in: [CHAR_A, CHAR_B, CHAR_C] } });
  await teardownDb();
});

// ── Bulk shape (D9 / AC) ────────────────────────────────────────────

describe('STM-7 — bulk GET /api/st_mods?character_ids=<csv>', () => {
  it('returns { [character_id]: [...mods] } with empty array for chars with no mods', async () => {
    const res = await request(app)
      .get(`/api/st_mods?character_ids=${CHAR_A},${CHAR_B},${CHAR_C}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
    // Every requested id is a key, even with zero mods (caller doesn't
    // need to defend against missing keys).
    expect(Object.keys(res.body).sort()).toEqual([CHAR_A, CHAR_B, CHAR_C].sort());
    expect(res.body[CHAR_A]).toHaveLength(2);
    expect(res.body[CHAR_B]).toHaveLength(1);
    expect(res.body[CHAR_C]).toEqual([]);
  });

  it('sorts each character\'s mods by created_at ascending (matches single-char shape)', async () => {
    const res = await request(app)
      .get(`/api/st_mods?character_ids=${CHAR_A}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    const a = res.body[CHAR_A];
    expect(a).toHaveLength(2);
    expect(new Date(a[0].created_at).getTime()).toBeLessThanOrEqual(new Date(a[1].created_at).getTime());
  });

  it('400 on empty character_ids string', async () => {
    const res = await request(app).get('/api/st_mods?character_ids=').set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });

  it('400 on CSV exceeding the cap', async () => {
    // Cap is 200; build 201 dummy ids
    const ids = Array.from({ length: 201 }, () => new ObjectId().toHexString()).join(',');
    const res = await request(app).get(`/api/st_mods?character_ids=${ids}`).set('X-Test-User', stUser());
    expect(res.status).toBe(400);
    expect(res.body.cap).toBe(200);
    expect(res.body.received).toBe(201);
  });

  it('200 at the cap exactly (200 ids)', async () => {
    const ids = Array.from({ length: 200 }, () => new ObjectId().toHexString()).join(',');
    const res = await request(app).get(`/api/st_mods?character_ids=${ids}`).set('X-Test-User', stUser());
    expect(res.status).toBe(200);
  });
});

// ── Auth (per-id ownership) ─────────────────────────────────────────

describe('STM-7 — bulk endpoint auth (per-id canAccessMods, atomic)', () => {
  it('200 to player for CSV of own characters', async () => {
    const res = await request(app)
      .get(`/api/st_mods?character_ids=${CHAR_A},${CHAR_B}`)
      .set('X-Test-User', playerUser([CHAR_A, CHAR_B]));
    expect(res.status).toBe(200);
    expect(res.body[CHAR_A]).toHaveLength(2);
    expect(res.body[CHAR_B]).toHaveLength(1);
  });

  it('403 to player when ANY id is not their own (atomic — no partial results)', async () => {
    // Player owns CHAR_A but not CHAR_B
    const res = await request(app)
      .get(`/api/st_mods?character_ids=${CHAR_A},${CHAR_B}`)
      .set('X-Test-User', playerUser([CHAR_A]));
    expect(res.status).toBe(403);
    expect(res.body.character_id).toBe(CHAR_B);
  });

  it('401 unauthenticated', async () => {
    const res = await request(app).get(`/api/st_mods?character_ids=${CHAR_A}`);
    expect(res.status).toBe(401);
  });
});

// ── Backwards-compat: single-character GET still works ──────────────

describe('STM-7 — single-character GET still works (backwards-compat with STM-1 / #410)', () => {
  it('?character_id=<id> returns bare array', async () => {
    const res = await request(app)
      .get(`/api/st_mods?character_id=${CHAR_A}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });
});

// ── applyOverlayToAll contract ──────────────────────────────────────

// Inline mirror of public/js/data/st-mods.js (browser-only `location` at
// module load prevents direct import in Node). Same pattern as
// stm-path-resolve-sanity / stm-popover-spec / stm-bugfix-405-repro.

function getByPath(obj, path) {
  if (!obj || typeof path !== 'string') return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) { if (cur == null) return undefined; cur = cur[part]; }
  return cur;
}
function setByPath(obj, path, value) {
  if (!obj || typeof path !== 'string') return;
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}
function stripOverlay(c) {
  if (!c || !c._st_mod_base) { if (c) delete c._st_mod_overlay; return; }
  for (const [path, baseRaw] of Object.entries(c._st_mod_base)) {
    if (baseRaw === undefined) setByPath(c, path, undefined);
    else setByPath(c, path, baseRaw);
  }
  delete c._st_mod_overlay; delete c._st_mod_base;
}
function applyStMods(c, mods, overlayEnabled) {
  if (!overlayEnabled || !Array.isArray(mods) || mods.length === 0) { stripOverlay(c); return c; }
  const byPath = new Map();
  for (const m of mods) {
    if (!m || typeof m.stat_path !== 'string' || !Number.isInteger(m.delta)) continue;
    let e = byPath.get(m.stat_path);
    if (!e) { e = { delta: 0, mods: [] }; byPath.set(m.stat_path, e); }
    e.delta += m.delta;
    e.mods.push(m);
  }
  stripOverlay(c);
  c._st_mod_overlay = {}; c._st_mod_base = {};
  for (const [path, { delta, mods: contributing }] of byPath) {
    const baseRaw = getByPath(c, path);
    const base = typeof baseRaw === 'number' ? baseRaw : 0;
    const final = base + delta;
    c._st_mod_base[path] = baseRaw;
    setByPath(c, path, final);
    c._st_mod_overlay[path] = { base, delta, final, mods: contributing };
  }
  return c;
}
async function applyOverlayToAll(chars, globalEnabled, fetchBulk) {
  if (!Array.isArray(chars) || chars.length === 0) return chars;
  const ids = chars.map(c => c?._id).filter(Boolean);
  const modsByChar = await fetchBulk(ids);
  for (const c of chars) {
    if (!c) continue;
    const overlayEnabled = !!globalEnabled && !c.st_mods_suppressed;
    const mods = modsByChar[String(c._id)] || [];
    applyStMods(c, mods, overlayEnabled);
  }
  return chars;
}

function fixtureChar(id, presence = 3) {
  return {
    _id: id,
    attributes: { Presence: { dots: presence, bonus: 0 } },
  };
}

describe('STM-7 — applyOverlayToAll contract', () => {
  it('applies overlay to each character from a single bulk fetch', async () => {
    const chars = [fixtureChar(CHAR_A, 3), fixtureChar(CHAR_B, 4), fixtureChar(CHAR_C, 5)];
    const fetchBulk = async (ids) => {
      const res = await request(app)
        .get(`/api/st_mods?character_ids=${ids.join(',')}`)
        .set('X-Test-User', stUser());
      return res.body;
    };
    await applyOverlayToAll(chars, true, fetchBulk);

    // CHAR_A had 2 mods (delta +1 each) on Presence.dots → +2 final
    expect(chars[0].attributes.Presence.dots).toBe(5);
    expect(chars[0]._st_mod_overlay['attributes.Presence.dots']).toMatchObject({ base: 3, delta: 2, final: 5 });

    // CHAR_B had 1 mod (delta +1) → +1 final
    expect(chars[1].attributes.Presence.dots).toBe(5);

    // CHAR_C had 0 mods → no overlay
    expect(chars[2].attributes.Presence.dots).toBe(5);
    expect(chars[2]._st_mod_overlay).toBeFalsy();
  });

  it('honours per-character st_mods_suppressed flag', async () => {
    const chars = [fixtureChar(CHAR_A, 3), fixtureChar(CHAR_B, 4)];
    chars[0].st_mods_suppressed = true;  // CHAR_A suppressed
    const fetchBulk = async (ids) => {
      const res = await request(app).get(`/api/st_mods?character_ids=${ids.join(',')}`).set('X-Test-User', stUser());
      return res.body;
    };
    await applyOverlayToAll(chars, true, fetchBulk);

    // CHAR_A: suppressed → base value, no overlay
    expect(chars[0].attributes.Presence.dots).toBe(3);
    expect(chars[0]._st_mod_overlay).toBeFalsy();
    // CHAR_B: unsuppressed → modded
    expect(chars[1].attributes.Presence.dots).toBe(5);
  });

  it('globalEnabled=false strips overlay across all characters', async () => {
    const chars = [fixtureChar(CHAR_A, 3), fixtureChar(CHAR_B, 4)];
    const fetchBulk = async (ids) => {
      const res = await request(app).get(`/api/st_mods?character_ids=${ids.join(',')}`).set('X-Test-User', stUser());
      return res.body;
    };
    await applyOverlayToAll(chars, false, fetchBulk);

    // Both characters fall through to stripOverlay (no _st_mod_base existed,
    // so the strip is a no-op; the base values stay canonical).
    expect(chars[0].attributes.Presence.dots).toBe(3);
    expect(chars[0]._st_mod_overlay).toBeUndefined();
    expect(chars[1].attributes.Presence.dots).toBe(4);
    expect(chars[1]._st_mod_overlay).toBeUndefined();
  });

  it('empty chars array returns immediately without fetch', async () => {
    let called = false;
    const fetchBulk = async () => { called = true; return {}; };
    const out = await applyOverlayToAll([], true, fetchBulk);
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it('null/undefined entries in chars array are skipped', async () => {
    const chars = [null, fixtureChar(CHAR_A, 3), undefined];
    const fetchBulk = async (ids) => {
      // Should only receive the one valid id
      expect(ids).toEqual([CHAR_A]);
      const res = await request(app).get(`/api/st_mods?character_ids=${ids.join(',')}`).set('X-Test-User', stUser());
      return res.body;
    };
    await applyOverlayToAll(chars, true, fetchBulk);
    expect(chars[1].attributes.Presence.dots).toBe(5);
  });
});
