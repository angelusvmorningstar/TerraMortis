/**
 * N-5 (issue #697, MNEC Trap Door dual-anchor / triple-anchor).
 *
 * Acceptance gates:
 *   1. validateTrapDoorAnchor invalid when attached_to has no territory.
 *   2. validateTrapDoorAnchor invalid when picked Territory is NOT in the
 *      Necropolis-infected union.
 *   3. validateTrapDoorAnchor valid when picked Territory IS in the union.
 *   4. Server middleware rejects Trap Door saves missing any of origin /
 *      destination / territory (presence-only schema-level check; the
 *      "currently infected" check stays render-time per ADR-005 D7).
 *   5. Partial-body tolerance — touchstone-only PATCH skips the validator.
 *   6. Non-Trap-Door merits unaffected by the Trap Door middleware.
 *   7. Legacy string-form attached_to rejected for Trap Door (object form required).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { validateTrapDoorAnchor } from '../../public/js/data/rules-helpers.js';

let app;
const TEST_FLAG = { _test_n5: true };

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  await getCollection('characters').deleteMany(TEST_FLAG);
});

afterAll(async () => {
  await getCollection('characters').deleteMany(TEST_FLAG);
  await teardownDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure-function: validateTrapDoorAnchor
// ─────────────────────────────────────────────────────────────────────────────

describe('N-5 — validateTrapDoorAnchor', () => {
  // A minimal chars[] where Alice has Sepulcher + White Ants covering 'terr-a',
  // 'terr-b'; Bob has Sepulcher + 'terr-c'. Union = {terr-a, terr-b, terr-c}.
  const owner = (name, sepDots, waTerritories) => ({
    name,
    merits: [
      { name: 'Necropolis Sepulcher', cp: sepDots, xp: 0 },
      { name: 'White Ants', cp: waTerritories.length, xp: 0, territories: waTerritories },
    ],
  });
  const chars = [
    owner('Alice', 2, ['terr-a', 'terr-b']),
    owner('Bob',   1, ['terr-c']),
  ];

  const trapDoor = (territory) => ({
    name: 'Trap Door',
    attached_to: { origin: 'Necropolis Sepulcher', destination: 'Safe Place (Penthouse)', territory },
  });

  it('valid when picked Territory is in the Necropolis-infected union', () => {
    const c = chars[0];
    const m = trapDoor('terr-a');
    const v = validateTrapDoorAnchor(c, m, chars);
    expect(v.valid).toBe(true);
    expect(v.reason).toBeUndefined();
  });

  it('valid when the Territory comes from a DIFFERENT Sepulcher owner', () => {
    // Alice's Trap Door points at terr-c (Bob's pick). That's still in the
    // union, so the constraint holds — collective sharing, not owner-only.
    const c = chars[0];
    const m = trapDoor('terr-c');
    expect(validateTrapDoorAnchor(c, m, chars).valid).toBe(true);
  });

  it('invalid when picked Territory is NOT in the union', () => {
    const c = chars[0];
    const m = trapDoor('terr-z');
    const v = validateTrapDoorAnchor(c, m, chars);
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/No White Ants coverage/i);
  });

  it('invalid when attached_to has no territory field', () => {
    const c = chars[0];
    const m = { name: 'Trap Door', attached_to: { origin: 'Necropolis Sepulcher', destination: 'Safe Place (X)' } };
    const v = validateTrapDoorAnchor(c, m, chars);
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/No Territory selected/i);
  });

  it('invalid when attached_to is null / missing', () => {
    expect(validateTrapDoorAnchor(chars[0], { name: 'Trap Door' }, chars).valid).toBe(false);
    expect(validateTrapDoorAnchor(chars[0], { name: 'Trap Door', attached_to: null }, chars).valid).toBe(false);
  });

  it('invalid when no Sepulcher owners exist (union is empty)', () => {
    // Edge: all characters lose their Sepulcher. The union collapses; any
    // Trap Door's previously-valid Territory drops out → non-functional.
    const orphaned = [{ name: 'Solo', merits: [{ name: 'Trap Door', cp: 1, xp: 0, attached_to: { origin: 'Necropolis Sepulcher', destination: 'X', territory: 'terr-a' } }] }];
    const v = validateTrapDoorAnchor(orphaned[0], orphaned[0].merits[0], orphaned);
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/No White Ants coverage/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Server middleware: presence-only schema-level check
// ─────────────────────────────────────────────────────────────────────────────

describe('N-5 — PUT /api/characters/:id Trap Door anchor presence', () => {
  let charId;

  beforeAll(async () => {
    const ins = await getCollection('characters').insertOne({
      ...TEST_FLAG,
      name: 'N5_Validator_Char',
      merits: [
        { name: 'Necropolis Sepulcher', category: 'general', cp: 1, xp: 0 },
        // pre-existing Safe Place so the destination value is meaningful
        { name: 'Safe Place', category: 'domain', cp: 1, xp: 0, qualifier: 'Penthouse' },
      ],
    });
    charId = ins.insertedId;
  });

  it('accepts a Trap Door save with full object-form attached_to', async () => {
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({
        merits: [
          { name: 'Necropolis Sepulcher', category: 'general', cp: 1, xp: 0 },
          { name: 'Safe Place', category: 'domain', cp: 1, xp: 0, qualifier: 'Penthouse' },
          {
            name: 'Trap Door', category: 'general', cp: 1, xp: 0,
            attached_to: { origin: 'Necropolis Sepulcher', destination: 'Safe Place (Penthouse)', territory: 'terr-a' },
          },
        ],
      });
    expect(res.status).toBe(200);
  });

  it('rejects Trap Door missing territory', async () => {
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({
        merits: [
          {
            name: 'Trap Door', category: 'general', cp: 1, xp: 0,
            attached_to: { origin: 'Necropolis Sepulcher', destination: 'Safe Place (Penthouse)' },
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/territory/i);
    expect(res.body.detail).toMatchObject({ missing: ['territory'] });
  });

  it('rejects Trap Door missing destination', async () => {
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({
        merits: [
          {
            name: 'Trap Door', category: 'general', cp: 1, xp: 0,
            attached_to: { origin: 'Necropolis Sepulcher', territory: 'terr-a' },
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.detail).toMatchObject({ missing: ['destination'] });
  });

  it('rejects Trap Door with legacy string-form attached_to (must be object)', async () => {
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({
        merits: [
          { name: 'Trap Door', category: 'general', cp: 1, xp: 0, attached_to: 'Safe Place (Penthouse)' },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/object-form/i);
  });

  it('partial body that omits merits skips the validator', async () => {
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({ humanity: 6 });
    expect(res.status).toBe(200);
  });

  it('non-Trap-Door merits unaffected by the middleware', async () => {
    // Haven's legacy string-form attached_to stays valid for Haven — only
    // Trap Door is structurally constrained.
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({
        merits: [
          { name: 'Necropolis Sepulcher', category: 'general', cp: 1, xp: 0 },
          { name: 'Safe Place', category: 'domain', cp: 1, xp: 0, qualifier: 'Penthouse' },
          { name: 'Haven', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Penthouse)' },
        ],
      });
    expect(res.status).toBe(200);
  });
});
