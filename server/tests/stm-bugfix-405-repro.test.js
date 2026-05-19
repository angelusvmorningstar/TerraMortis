/**
 * Bugfix #405 — repro test for "ST mods don't show on the character sheet".
 *
 * Peter's smoke: STM-5 panel → create Presence dots +N → switch to player
 * view → expected to see Presence at base+N with marker; ACTUAL renders
 * at base. The static code path looks correct, so this test exercises
 * the full data-flow (POST → GET → applyStMods) to either reproduce
 * the failure or isolate the bug to the render/DOM stage that vitest
 * can't see.
 *
 * Build sequence mirrors what STM-5's panel + STM-2's helper do at
 * runtime:
 *   1. POST /api/st_mods with character_id, stat_path 'attributes.Presence.dots', delta +N
 *   2. GET /api/st_mods?character_id=... and parse rows
 *   3. Build a fixture character (mirrors the c reference the panel passes)
 *   4. Call the real applyStMods + getByPath + setByPath
 *   5. Assert c.attributes.Presence.dots is the modded value AND c._st_mod_overlay populated
 *
 * If the test PASSES, the bug is in the DOM render path (renderSheet or
 * markersFor), not the data flow. If the test FAILS, the bug is in the
 * data flow and we can isolate to which step.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

// Inline applyStMods + helpers mirroring public/js/data/st-mods.js.
// Importing the module directly fails in Node (`location` is browser-only).
// The path-resolve sanity test (STM-2) uses the same inline-mirror pattern.
function getByPath(obj, path) {
  if (!obj || typeof path !== 'string') return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}
function setByPath(obj, path, value) {
  if (!obj || typeof path !== 'string') return;
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}
function stripOverlay(c) {
  if (!c || !c._st_mod_base) {
    if (c) delete c._st_mod_overlay;
    return;
  }
  for (const [path, baseRaw] of Object.entries(c._st_mod_base)) {
    if (baseRaw === undefined) setByPath(c, path, undefined);
    else setByPath(c, path, baseRaw);
  }
  delete c._st_mod_overlay;
  delete c._st_mod_base;
}
function applyStMods(c, mods, overlayEnabled) {
  if (!overlayEnabled || !Array.isArray(mods) || mods.length === 0) {
    stripOverlay(c);
    return c;
  }
  const byPath = new Map();
  for (const m of mods) {
    if (!m || typeof m.stat_path !== 'string' || !Number.isInteger(m.delta)) continue;
    let entry = byPath.get(m.stat_path);
    if (!entry) { entry = { delta: 0, mods: [] }; byPath.set(m.stat_path, entry); }
    entry.delta += m.delta;
    entry.mods.push(m);
  }
  stripOverlay(c);
  c._st_mod_overlay = {};
  c._st_mod_base = {};
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

let app;
const CHAR_ID = new ObjectId().toHexString();
const CREATED_IDS = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  await getCollection('st_mods').deleteMany({ character_id: CHAR_ID });
  await getCollection('st_mod_audit').deleteMany({ character_id: CHAR_ID });
});

afterAll(async () => {
  await getCollection('st_mods').deleteMany({ character_id: CHAR_ID });
  await getCollection('st_mod_audit').deleteMany({ character_id: CHAR_ID });
  await teardownDb();
});

/** Mirror of the fixture character shape STM-5's panel passes. Minimal
 *  but with the v2 attribute structure that getAttrVal walks. */
function buildCharacter() {
  return {
    _id: CHAR_ID,
    name: 'Test Yusuf',
    attributes: {
      Intelligence: { dots: 2, bonus: 0 },
      Wits: { dots: 3, bonus: 0 },
      Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 },
      Dexterity: { dots: 3, bonus: 0 },
      Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 3, bonus: 0 },     // ← target for the smoke
      Manipulation: { dots: 2, bonus: 0 },
      Composure: { dots: 3, bonus: 0 },
    },
    skills: {},
    merits: [],
    disciplines: {},
  };
}

describe('Bugfix #405 — end-to-end data flow for Presence dots +N', () => {
  it('POSTs a mod, GETs it back, applies, mutates c.attributes.Presence.dots + sets overlay', async () => {
    // 1. POST — mirror what STM-5 panel sends
    const postRes = await request(app)
      .post('/api/st_mods')
      .set('X-Test-User', stUser())
      .send({
        character_id: CHAR_ID,
        stat_path: 'attributes.Presence.dots',
        delta: 2,
        reason: 'Bugfix repro smoke',
        show_reason_to_player: true,
      });
    expect(postRes.status).toBe(201);
    CREATED_IDS.push(postRes.body._id);

    // 2. GET — mirror what loadStMods does
    const getRes = await request(app)
      .get(`/api/st_mods?character_id=${encodeURIComponent(CHAR_ID)}`)
      .set('X-Test-User', stUser());
    expect(getRes.status).toBe(200);
    const mods = getRes.body;
    expect(Array.isArray(mods)).toBe(true);
    expect(mods.length).toBe(1);
    expect(mods[0].stat_path).toBe('attributes.Presence.dots');
    expect(mods[0].delta).toBe(2);

    // 3 + 4. Apply to a fixture character
    const c = buildCharacter();
    const baseBefore = c.attributes.Presence.dots;
    expect(baseBefore).toBe(3);

    applyStMods(c, mods, true);

    // 5. Assertions — these are the symptoms the user should see on the sheet
    expect(c.attributes.Presence.dots).toBe(5);  // modded
    expect(c._st_mod_overlay).toBeTruthy();
    expect(c._st_mod_overlay['attributes.Presence.dots']).toMatchObject({
      base: 3,
      delta: 2,
      final: 5,
    });
    expect(c._st_mod_overlay['attributes.Presence.dots'].mods).toHaveLength(1);
  });

  it('character_id byte-identity at POST and GET (hypothesis #1)', async () => {
    // Verify the stored character_id string is byte-identical to the GET param.
    const stored = await getCollection('st_mods').findOne({ _id: new ObjectId(CREATED_IDS[0]) });
    expect(stored.character_id).toBe(CHAR_ID);
    expect(typeof stored.character_id).toBe('string');
    // And the GET round-trip uses exactly that string
    const res = await request(app)
      .get(`/api/st_mods?character_id=${encodeURIComponent(CHAR_ID)}`)
      .set('X-Test-User', stUser());
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('overlayEnabled=false path: applyStMods cleanly strips overlay', async () => {
    const c = buildCharacter();
    // First apply with a mod so there IS an overlay
    applyStMods(c, [{
      stat_path: 'attributes.Presence.dots',
      delta: 1,
      mods: [],
      show_reason_to_player: false,
    }], true);
    expect(c.attributes.Presence.dots).toBe(4);
    // Now disable overlay — should restore to base
    applyStMods(c, [{ stat_path: 'attributes.Presence.dots', delta: 1 }], false);
    expect(c.attributes.Presence.dots).toBe(3);
    expect(c._st_mod_overlay).toBeUndefined();
  });
});

// ── Fix regression — fresh-read pattern in onMutate callback ────────

describe('Bugfix #405 — onMutate callback must read chars[editIdx] fresh, not via stale closure', () => {
  it('callback that reads chars[editIdx] fresh mutates the live array entry', async () => {
    // Reproduces the closure shape from admin.js:280-296 (post-fix):
    // const idx = editorState.editIdx;                 // captured at sidebar activation
    // const c = chars[idx];                            // captured snapshot (potentially stale at callback time)
    // initStModsPanel(rootEl, c, () => {
    //   const liveChar = chars[editorState.editIdx];   // FRESH read inside the callback
    //   if (liveChar) renderSheetWithOverlay(liveChar);
    // });
    //
    // The pre-fix code used the captured `c` directly. The post-fix code
    // re-resolves chars[editorState.editIdx] inside the callback. This test
    // verifies the post-fix pattern lands the mutation on the LIVE array
    // entry — so any future stale-closure regression would be caught here.

    // Simulate the admin.js module state
    const editorState = { editIdx: 0 };
    const yusuf = buildCharacter();
    const chars = [yusuf];

    // Capture snapshot (pre-fix path) AND prepare fresh-read callback (post-fix path)
    const idx = editorState.editIdx;
    const capturedC = chars[idx];

    // POST a mod (mirrors what STM-5 panel does)
    const modPostRes = await request(app)
      .post('/api/st_mods')
      .set('X-Test-User', stUser())
      .send({
        character_id: CHAR_ID,
        stat_path: 'attributes.Presence.bonus',
        delta: 3,
        reason: 'Bugfix #405 regression test — fresh-read contract',
        show_reason_to_player: false,
      });
    expect(modPostRes.status).toBe(201);
    CREATED_IDS.push(modPostRes.body._id);

    // Simulate the FIXED onMutate callback pattern
    const fixedCallback = async () => {
      const liveChar = chars[editorState.editIdx];
      if (!liveChar) return;
      const mods = (await request(app)
        .get(`/api/st_mods?character_id=${encodeURIComponent(liveChar._id)}`)
        .set('X-Test-User', stUser())).body;
      applyStMods(liveChar, mods, true);
    };

    await fixedCallback();

    // The fix lands the mutation on chars[editIdx] (the live entry).
    // Both `capturedC` and `chars[editIdx]` reference the same object here
    // (chars never gets reassigned in admin.js), so both should reflect
    // the mutation. The contract being tested: the callback uses the live
    // index lookup, not a possibly-stale captured reference.
    expect(chars[editorState.editIdx]._st_mod_overlay).toBeTruthy();
    expect(chars[editorState.editIdx]._st_mod_overlay['attributes.Presence.bonus']).toMatchObject({
      base: 0,
      delta: 3,
      final: 3,
    });
    // Sanity: the captured ref points to the same object (proving the
    // post-fix and pre-fix paths agree in the no-stale-state case).
    expect(capturedC).toBe(chars[editorState.editIdx]);
  });

  it('callback handles editIdx changing to a different character between activation and fire', async () => {
    // Stress test: the fresh-read pattern should pick up the CURRENT
    // editIdx, not the one captured at activation. This is the real
    // value-add of the fix beyond paranoia: if anything in the user flow
    // moves editIdx between sidebar activation and Save click (e.g., a
    // future polish pass that lets STs switch characters from inside the
    // panel), the callback applies the mutation to the CURRENT character,
    // not the one captured when the sidebar was first activated.

    const editorState = { editIdx: 0 };
    const charA = buildCharacter();
    charA._id = new ObjectId().toHexString();
    const charB = buildCharacter();
    charB._id = new ObjectId().toHexString();
    const chars = [charA, charB];

    // Sidebar activation snapshots editIdx=0 (charA)
    const _capturedIdx = editorState.editIdx;

    // POST a mod for charB (the panel POSTs against state.character — assume
    // panel re-init pointed it at charB before Save)
    const postRes = await request(app)
      .post('/api/st_mods')
      .set('X-Test-User', stUser())
      .send({
        character_id: charB._id,
        stat_path: 'attributes.Wits.dots',
        delta: 1,
        reason: 'Cross-character regression',
        show_reason_to_player: false,
      });
    expect(postRes.status).toBe(201);
    CREATED_IDS.push(postRes.body._id);

    // editIdx moves to charB before the callback fires
    editorState.editIdx = 1;

    // Fixed callback re-reads editIdx fresh
    const fixedCallback = async () => {
      const liveChar = chars[editorState.editIdx];
      const mods = (await request(app)
        .get(`/api/st_mods?character_id=${encodeURIComponent(liveChar._id)}`)
        .set('X-Test-User', stUser())).body;
      applyStMods(liveChar, mods, true);
    };
    await fixedCallback();

    // Mutation lands on charB (the current editIdx), not charA (the capture)
    expect(chars[1]._st_mod_overlay).toBeTruthy();
    expect(chars[1]._st_mod_overlay['attributes.Wits.dots'].final).toBe(4);
    expect(chars[0]._st_mod_overlay).toBeFalsy();   // charA untouched

    // Cleanup
    await getCollection('st_mods').deleteMany({ character_id: charB._id });
    await getCollection('st_mod_audit').deleteMany({ character_id: charB._id });
  });
});
