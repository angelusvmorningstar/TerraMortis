/**
 * crd.3a — real behavioural coverage for the server-side resolve endpoint
 * (Epic CRD, specs/stories/crd-3a-server-resolve-endpoint.md).
 *
 *   AC1 — PUT /:id/resolve exists, reuses _findChallenge (404/409), and
 *         requires target-character ownership (403), mirroring accept/decline.
 *   AC2 — computes the base pool as the EFFECTIVE (dots + bonus) value of the
 *         Resistance Attribute matching defender_aspect, read fresh from the
 *         defender's LIVE character document.
 *   AC3/AC9 — a true defender_wp_spent re-checks CURRENT live Willpower
 *         (tracker_state, never cached/submitted), 409s at <= 0, else +2 (not
 *         +3); only a strict boolean true triggers a spend.
 *   AC4/AC5 — defender_merit_ids validated against the character's REAL
 *         merits[] on rule_key; an unowned id is silently dropped; only
 *         Indomitable (+2 flat) and Closed Book (+rating) contribute — any
 *         other owned merit contributes 0 but is not dropped.
 *   AC6/AC7 — writes defender_pool/aspect/wp_spent/merit_ids, status stays
 *         'pending', and re-resolving fully recomputes and overwrites.
 *   AC8 — the crd.1 accept-route guard still 409s an unresolved challenge,
 *         and accepts normally once resolved through this endpoint.
 *
 * Follows crd-1-contested-roll-request-shape.test.js's exact fixture/cleanup/
 * describe.skipIf(!dbAvailable) shape. No browser, no Playwright — this
 * story has no client-visible surface.
 *
 * DB-backed: real MongoDB required. See db-setup.js.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';

const dbAvailable = await isDbAvailable();

let app;
const NAME_PREFIX = 'CRD-3A Probe';
const CHALLENGER_ID = '000000000000000000000e01';

const seededDefenderIds = [];

const ATTR_NAMES = [
  'Intelligence', 'Wits', 'Resolve', 'Strength', 'Dexterity',
  'Stamina', 'Presence', 'Manipulation', 'Composure',
];

function fullAttributes(overrides = {}) {
  const attrs = {};
  for (const a of ATTR_NAMES) attrs[a] = { dots: 1, bonus: 0 };
  for (const [k, v] of Object.entries(overrides)) attrs[k] = { dots: 1, bonus: 0, ...v };
  return attrs;
}

async function seedDefender({ attrs = {}, merits = [] } = {}) {
  const { insertedId } = await getCollection('characters').insertOne({
    name: `${NAME_PREFIX} Defender ${Date.now()}_${Math.random()}`,
    retired: false,
    attributes: fullAttributes(attrs),
    merits,
  });
  seededDefenderIds.push(insertedId);
  return insertedId;
}

async function seedChallenge(targetOid, overrides = {}) {
  const base = {
    challenger_character_id:   CHALLENGER_ID,
    challenger_character_name: `${NAME_PREFIX} Challenger`,
    target_character_id:       targetOid.toString(),
    target_character_name:     `${NAME_PREFIX} Target`,
    roll_type:       'social',
    challenger_pool: 5,
    request_type:    'contested_roll',
    status:          'pending',
    outcome:         null,
    created_at:      new Date().toISOString(),
    updated_at:      new Date().toISOString(),
    ...overrides,
  };
  const { insertedId } = await getCollection('contested_roll_requests').insertOne(base);
  return String(insertedId);
}

async function setTrackerWp(targetOid, willpower) {
  await getCollection('tracker_state').updateOne(
    { character_id: targetOid.toString() },
    { $set: { character_id: targetOid.toString(), willpower } },
    { upsert: true }
  );
}

function defenderUser(targetOid) { return playerUser([targetOid.toString()]); }

function resolveReq(id, body, user) {
  return request(app).put(`/api/contested_roll_requests/${id}/resolve`).set('X-Test-User', user).send(body);
}

async function cleanup() {
  await getCollection('contested_roll_requests').deleteMany({
    $or: [
      { challenger_character_name: { $regex: `^${NAME_PREFIX}` } },
      { target_character_name:     { $regex: `^${NAME_PREFIX}` } },
      { actor_name:                { $regex: `^${NAME_PREFIX}` } },
    ],
  });
  await getCollection('characters').deleteMany({ name: { $regex: `^${NAME_PREFIX}` } });
  if (seededDefenderIds.length) {
    await getCollection('tracker_state').deleteMany({
      character_id: { $in: seededDefenderIds.map(String) },
    });
  }
}

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
  await cleanup();
});

afterAll(async () => {
  if (!dbAvailable) return;
  await cleanup();
  await teardownDb();
});

describe.skipIf(!dbAvailable)('crd.3a AC1 — route, pending guard, ownership', () => {
  it('400s on an invalid id format', async () => {
    const res = await resolveReq('not-an-id', { defender_aspect: 'mental' }, defenderUser(new ObjectId()));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('404s on a missing challenge', async () => {
    const res = await resolveReq(new ObjectId().toString(), { defender_aspect: 'mental' }, defenderUser(new ObjectId()));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('404s a status_action document sharing this collection, exactly like accept/decline/void', async () => {
    const { insertedId } = await getCollection('contested_roll_requests').insertOne({
      request_type: 'status_action', status: 'pending',
      actor_name: `${NAME_PREFIX} Actor`,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    const res = await resolveReq(String(insertedId), { defender_aspect: 'mental' }, defenderUser(new ObjectId()));
    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });

  it('409s a challenge that is no longer pending', async () => {
    const defender = await seedDefender();
    const id = await seedChallenge(defender, { status: 'resolved' });
    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  it('403s a caller who is not the target character', async () => {
    const defender = await seedDefender();
    const id = await seedChallenge(defender);
    const res = await resolveReq(id, { defender_aspect: 'mental' }, playerUser(['000000000000000000000f99']));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('the ownership check runs before aspect validation — wrong owner still gets 403, not 400', async () => {
    const defender = await seedDefender();
    const id = await seedChallenge(defender);
    const res = await resolveReq(id, { defender_aspect: 'spiritual' }, playerUser(['000000000000000000000f98']));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('400s an off-enum defender_aspect for the actual owner', async () => {
    const defender = await seedDefender();
    const id = await seedChallenge(defender);
    const res = await resolveReq(id, { defender_aspect: 'spiritual' }, defenderUser(defender));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // Codex code review (Pass 2/3a): ASPECT_ATTR is a plain object; a truthy
  // *indexed* lookup accepts inherited Object.prototype keys. These must 400
  // exactly like any other off-enum value, never resolve to a real attribute.
  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'rejects the inherited Object.prototype key %s as an off-enum aspect, not a real attribute',
    async (aspect) => {
      const defender = await seedDefender({ attrs: { Resolve: { dots: 9, bonus: 0 } } });
      const id = await seedChallenge(defender);
      const res = await resolveReq(id, { defender_aspect: aspect }, defenderUser(defender));
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    }
  );

  it('an empty request body 400s on aspect validation rather than 500ing', async () => {
    const defender = await seedDefender();
    const id = await seedChallenge(defender);
    const res = await request(app).put(`/api/contested_roll_requests/${id}/resolve`).set('X-Test-User', defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

describe.skipIf(!dbAvailable)('crd.3a AC2 — live effective-attribute pool, per aspect', () => {
  it.each([
    ['mental',   'Resolve',   { dots: 3, bonus: 1 }, 4],
    ['social',   'Composure', { dots: 2, bonus: 0 }, 2],
    ['physical', 'Stamina',   { dots: 4, bonus: 2 }, 6],
  ])('%s maps to %s, read as dots + bonus', async (aspect, _attr, attrVal, expectedPool) => {
    const defender = await seedDefender({ attrs: { [_attr]: attrVal } });
    const id = await seedChallenge(defender);
    const res = await resolveReq(id, { defender_aspect: aspect }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBe(expectedPool);
    expect(res.body.defender_aspect).toBe(aspect);
    expect(res.body.status, 'resolving is not accepting').toBe('pending');
  });

  it('re-reads the character fresh — a stat change between two resolves is picked up', async () => {
    const defender = await seedDefender({ attrs: { Resolve: { dots: 1, bonus: 0 } } });
    const id = await seedChallenge(defender);
    const first = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(first.body.defender_pool).toBe(1);

    await getCollection('characters').updateOne({ _id: defender }, { $set: { 'attributes.Resolve.dots': 5 } });
    const second = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(second.body.defender_pool, 'must never trust a value cached from the first resolve').toBe(5);
  });
});

describe.skipIf(!dbAvailable)('crd.3a AC3/AC9 — live Willpower re-check and the real +2 bonus', () => {
  it('grants +2 (not +3) when Willpower is spent and available', async () => {
    const defender = await seedDefender({ attrs: { Resolve: { dots: 2, bonus: 0 } } });
    await setTrackerWp(defender, 3);
    const id = await seedChallenge(defender);
    const res = await resolveReq(id, { defender_aspect: 'mental', defender_wp_spent: true }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBe(4);
    expect(res.body.defender_wp_spent).toBe(true);
  });

  it('rejects with 409 CONFLICT when live Willpower is 0, and does not write a pool', async () => {
    const defender = await seedDefender({ attrs: { Resolve: { dots: 2, bonus: 0 } } });
    await setTrackerWp(defender, 0);
    const id = await seedChallenge(defender);
    const res = await resolveReq(id, { defender_aspect: 'mental', defender_wp_spent: true }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('CONFLICT');

    const stored = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(id) });
    expect(stored.defender_pool, 'a refused resolve must not write a pool').toBeUndefined();
    expect(stored.status).toBe('pending');
  });

  it('a defender who has never touched the live tracker gets full Willpower by default (no tracker_state doc)', async () => {
    const defender = await seedDefender({ attrs: { Resolve: { dots: 2, bonus: 0 }, Composure: { dots: 3, bonus: 0 } } });
    const id = await seedChallenge(defender);
    const res = await resolveReq(id, { defender_aspect: 'mental', defender_wp_spent: true }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBe(4); // 2 base + 2 WP bonus
  });

  it('never re-checks Willpower at all when defender_wp_spent is false — a 0-WP character is unaffected', async () => {
    const defender = await seedDefender({ attrs: { Resolve: { dots: 2, bonus: 0 } } });
    await setTrackerWp(defender, 0);
    const id = await seedChallenge(defender);
    const res = await resolveReq(id, { defender_aspect: 'mental', defender_wp_spent: false }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBe(2);
  });

  it('rejects a non-boolean defender_wp_spent with 400, rather than silently coercing it (AC9\'s literal wording)', async () => {
    const defender = await seedDefender({ attrs: { Resolve: { dots: 2, bonus: 0 } } });
    await setTrackerWp(defender, 0); // would 409 if the (wrongly) coerced value ran the WP check
    const id = await seedChallenge(defender);
    const res = await resolveReq(id, { defender_aspect: 'mental', defender_wp_spent: 'true' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');

    const stored = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(id) });
    expect(stored.defender_pool, 'a rejected resolve must not write a pool').toBeUndefined();
  });

  it('an omitted defender_wp_spent is treated as false, not rejected', async () => {
    const defender = await seedDefender({ attrs: { Resolve: { dots: 2, bonus: 0 } } });
    const id = await seedChallenge(defender);
    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBe(2);
    expect(res.body.defender_wp_spent).toBe(false);
  });

  it('a tracker document that EXISTS but has no willpower field re-checks against the live max, not a stale pass-through', async () => {
    // A character with genuinely 0 max Willpower discriminates this: the old
    // `trackerDoc ? trackerDoc.willpower : max` ternary read `undefined` off a
    // document that has OTHER fields but no `willpower` key (tracker_state's
    // own PUT route is an unvalidated partial upsert), and `undefined <= 0` is
    // false — so the check wrongly PASSED regardless of the character's real
    // Willpower. `?? ` falls through to the live max on a missing FIELD too.
    const defender = await seedDefender({ attrs: { Resolve: { dots: 0, bonus: 0 }, Composure: { dots: 0, bonus: 0 } } });
    await getCollection('tracker_state').updateOne(
      { character_id: defender.toString() },
      { $set: { character_id: defender.toString(), vitae: 7 } },
      { upsert: true }
    );
    const id = await seedChallenge(defender);
    const res = await resolveReq(id, { defender_aspect: 'mental', defender_wp_spent: true }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });
});

describe.skipIf(!dbAvailable)('crd.3a AC4/AC5 — merit validation, keyed on rule_key', () => {
  it('silently drops an id the character does not own — no 400, contributes nothing', async () => {
    const defender = await seedDefender({ attrs: { Resolve: { dots: 2, bonus: 0 } }, merits: [] });
    const id = await seedChallenge(defender);
    const res = await resolveReq(
      id, { defender_aspect: 'mental', defender_merit_ids: ['indomitable'] }, defenderUser(defender)
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBe(2);
    expect(res.body.defender_merit_ids).toEqual([]);
  });

  it('Indomitable contributes a flat +2', async () => {
    const defender = await seedDefender({
      attrs: { Resolve: { dots: 2, bonus: 0 } },
      merits: [{ category: 'general', name: 'Indomitable', rule_key: 'indomitable' }],
    });
    const id = await seedChallenge(defender);
    const res = await resolveReq(
      id, { defender_aspect: 'mental', defender_merit_ids: ['indomitable'] }, defenderUser(defender)
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBe(4);
    expect(res.body.defender_merit_ids).toEqual(['indomitable']);
  });

  it('Closed Book contributes the character\'s own rating', async () => {
    const defender = await seedDefender({
      attrs: { Resolve: { dots: 2, bonus: 0 } },
      merits: [{ category: 'general', name: 'Closed Book', rating: 3, rule_key: 'closed-book' }],
    });
    const id = await seedChallenge(defender);
    const res = await resolveReq(
      id, { defender_aspect: 'mental', defender_merit_ids: ['closed-book'] }, defenderUser(defender)
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBe(5);
  });

  it('an owned merit outside the 2-merit lookup is kept (not dropped) but contributes 0', async () => {
    const defender = await seedDefender({
      attrs: { Resolve: { dots: 2, bonus: 0 } },
      merits: [{ category: 'general', name: 'Iron Stamina', rule_key: 'iron-stamina' }],
    });
    const id = await seedChallenge(defender);
    const res = await resolveReq(
      id, { defender_aspect: 'mental', defender_merit_ids: ['iron-stamina'] }, defenderUser(defender)
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool, 'known, deliberate limitation — see Dev Notes').toBe(2);
    expect(res.body.defender_merit_ids, 'genuinely owned, so not silently dropped').toEqual(['iron-stamina']);
  });

  it('duplicate ids in the submission cannot double-count the bonus', async () => {
    const defender = await seedDefender({
      attrs: { Resolve: { dots: 2, bonus: 0 } },
      merits: [{ category: 'general', name: 'Indomitable', rule_key: 'indomitable' }],
    });
    const id = await seedChallenge(defender);
    const res = await resolveReq(
      id, { defender_aspect: 'mental', defender_merit_ids: ['indomitable', 'indomitable'] }, defenderUser(defender)
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBe(4);
    expect(res.body.defender_merit_ids).toEqual(['indomitable']);
  });

  it('two character merit rows sharing one rule_key cannot double-count the bonus (data anomaly, not prevented by any schema)', async () => {
    const defender = await seedDefender({
      attrs: { Resolve: { dots: 2, bonus: 0 } },
      merits: [
        { category: 'general', name: 'Indomitable', rule_key: 'indomitable' },
        { category: 'general', name: 'Indomitable (dup row)', rule_key: 'indomitable' },
      ],
    });
    const id = await seedChallenge(defender);
    const res = await resolveReq(
      id, { defender_aspect: 'mental', defender_merit_ids: ['indomitable'] }, defenderUser(defender)
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool, 'must count the +2 bonus once, not once per duplicate row').toBe(4);
  });
});

describe.skipIf(!dbAvailable)('crd.3a — pool is clamped to the collection\'s own declared 0-30 domain', () => {
  it('a schema-valid but very large attribute bonus does not persist a pool above 30', async () => {
    // attrObj's own schema caps `dots` at 10 but declares NO maximum on
    // `bonus` — this route has no validate() middleware, so nothing else
    // would otherwise stop a legitimately-written character from driving the
    // computed pool past the collection's own declared domain.
    const defender = await seedDefender({
      attrs: { Resolve: { dots: 10, bonus: 25 } },
      merits: [{ category: 'general', name: 'Closed Book', rating: 10, rule_key: 'closed-book' }],
    });
    await setTrackerWp(defender, 5);
    const id = await seedChallenge(defender);
    const res = await resolveReq(
      id,
      { defender_aspect: 'mental', defender_wp_spent: true, defender_merit_ids: ['closed-book'] },
      defenderUser(defender)
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBe(30);
  });
});

describe.skipIf(!dbAvailable)('crd.3a AC6/AC7 — write shape and re-resolve idempotency', () => {
  it('writes an integer defender_pool and leaves status pending', async () => {
    const defender = await seedDefender({ attrs: { Resolve: { dots: 0, bonus: 0 } } });
    const id = await seedChallenge(defender);
    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(Number.isInteger(res.body.defender_pool)).toBe(true);
    expect(res.body.defender_pool).toBe(0);
    expect(res.body.status).toBe('pending');
  });

  it('re-resolving fully recomputes and overwrites, not merges', async () => {
    const defender = await seedDefender({
      attrs: { Resolve: { dots: 2, bonus: 0 }, Composure: { dots: 5, bonus: 0 } },
      merits: [{ category: 'general', name: 'Indomitable', rule_key: 'indomitable' }],
    });
    await setTrackerWp(defender, 3);
    const id = await seedChallenge(defender);

    const first = await resolveReq(
      id,
      { defender_aspect: 'mental', defender_wp_spent: true, defender_merit_ids: ['indomitable'] },
      defenderUser(defender)
    );
    expect(first.body.defender_pool).toBe(6); // 2 + 2 (WP) + 2 (Indomitable)

    const second = await resolveReq(
      id,
      { defender_aspect: 'social', defender_wp_spent: false, defender_merit_ids: [] },
      defenderUser(defender)
    );
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(second.body.defender_pool, 'must fully overwrite, not merge with the first resolve').toBe(5);
    expect(second.body.defender_aspect).toBe('social');
    expect(second.body.defender_wp_spent).toBe(false);
    expect(second.body.defender_merit_ids).toEqual([]);
  });
});

describe.skipIf(!dbAvailable)('crd.3a AC8 — the crd.1 accept-route guard, proven both ways', () => {
  it('an unresolved challenge still 409s /accept exactly as crd.1 built it', async () => {
    const defender = await seedDefender();
    const id = await seedChallenge(defender);
    const res = await request(app).put(`/api/contested_roll_requests/${id}/accept`).set('X-Test-User', defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  it('a challenge resolved through this endpoint now accepts normally through the existing, unmodified /accept route', async () => {
    const defender = await seedDefender({ attrs: { Resolve: { dots: 3, bonus: 0 } } });
    const id = await seedChallenge(defender);

    const resolved = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(200);
    expect(resolved.body.defender_pool).toBe(3);

    const accepted = await request(app).put(`/api/contested_roll_requests/${id}/accept`).set('X-Test-User', defenderUser(defender));
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.status).toBe('resolved');
    expect(accepted.body.outcome.defender.pool).toBe(3);
    expect(accepted.body.outcome.defender.rolls.length).toBe(3);
  });
});
