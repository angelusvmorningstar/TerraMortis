/**
 * crd.4a — the at-Court City Status advantage gate on PUT /:id/resolve
 * (Epic CRD, specs/stories/crd-4a-defensive-status-choice.md).
 *
 *   AC1 — the three-condition gate (power_name set, game mode active via
 *         currentCycleInGamePhase, both sides attended:true in the current
 *         game session) plus the City-Status-higher requirement, computed
 *         fresh from live data on every call. Each condition tested failing
 *         alone.
 *   AC2 — when the gate is open, the response carries status_choice
 *         { eligible: true, bp_value, city_value } even before a term is
 *         chosen. Omitted when the gate is closed.
 *   AC3 — when the gate is open, defender_status_term becomes required for
 *         the pool to finalise: missing/invalid leaves defender_pool null
 *         (not a 400), a valid choice adds the right term's value once.
 *   AC4 — defender_status_term persists on the document ('bp'|'city'|null).
 *
 * Follows crd-3a-resolve-endpoint.test.js's exact fixture/cleanup/
 * describe.skipIf(!dbAvailable) shape, and otc-2-office-actions-api.test.js's
 * established pattern for seeding a reliably-"current" chapter and game
 * session in a shared test database (fileParallelism: false makes a full
 * defensive wipe of both collections safe within this file's own run).
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
const NAME_PREFIX = 'CRD-4A Probe';
const GAME_NUMBER = 977; // distinctive, well above any other fixture's game_number

async function seedChar({ city = 0, bloodPotency = 3, courtCategory = null } = {}) {
  const { insertedId } = await getCollection('characters').insertOne({
    name: `${NAME_PREFIX} Char ${Date.now()}_${Math.random()}`,
    retired: false,
    attributes: { Resolve: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 } },
    merits: [],
    blood_potency: bloodPotency,
    status: { city },
    court_category: courtCategory,
  });
  return insertedId;
}

async function seedChallenge(defenderOid, challengerOid, overrides = {}) {
  const base = {
    challenger_character_id:   String(challengerOid),
    challenger_character_name: `${NAME_PREFIX} Challenger`,
    target_character_id:       String(defenderOid),
    target_character_name:     `${NAME_PREFIX} Target`,
    roll_type:       'resistance',
    challenger_pool: 5,
    power_name:      'Majesty',
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

// otc-2's own established defensive pattern: currentCycleInGamePhase picks
// the single highest-game_number chapter across the WHOLE shared test
// database, so a leftover from another file could otherwise outrank this
// one — full wipe first, matching that precedent exactly.
async function seedChapter(phase = 'game') {
  await getCollection('chapters').deleteMany({});
  await getCollection('chapters').insertOne({
    label: `${NAME_PREFIX} Cycle`, phase, game_number: GAME_NUMBER,
  });
}

async function seedNoChapter() {
  await getCollection('chapters').deleteMany({});
}

// Mirrors findLatestSession()'s own defensive pattern (otc-2): the gate's
// own attendance lookup sorts game_sessions by session_date desc, so a
// leftover from another file with today's date could otherwise outrank this
// one — clear every session at-or-before today first.
async function seedSession(attendance) {
  const today = new Date().toISOString().slice(0, 10);
  await getCollection('game_sessions').deleteMany({ session_date: { $lte: today } });
  await getCollection('game_sessions').insertOne({
    title: `${NAME_PREFIX} Session`,
    session_date: today,
    game_number: GAME_NUMBER,
    attendance,
  });
}

async function seedNoSession() {
  const today = new Date().toISOString().slice(0, 10);
  await getCollection('game_sessions').deleteMany({ session_date: { $lte: today } });
}

function bothAttended(defenderOid, challengerOid) {
  return [
    { character_id: String(defenderOid),   character_name: `${NAME_PREFIX} Target`,     attended: true },
    { character_id: String(challengerOid), character_name: `${NAME_PREFIX} Challenger`, attended: true },
  ];
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
    ],
  });
  await getCollection('characters').deleteMany({ name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('territories').deleteMany({ name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('chapters').deleteMany({ label: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('game_sessions').deleteMany({ title: { $regex: `^${NAME_PREFIX}` } });
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

describe.skipIf(!dbAvailable)('crd.4a AC1 — the three-condition gate, each tested failing alone', () => {
  it('closed (no status_choice, unchanged behaviour) when power_name is absent — even with game mode active and both sides attended', async () => {
    const defender = await seedChar({ city: 5 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger, { power_name: undefined });

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status_choice).toBeUndefined();
    expect(res.body.defender_pool).toBe(2); // plain Resolve, no gate applied
  });

  it('closed when power_name is an empty string', async () => {
    const defender = await seedChar({ city: 5 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger, { power_name: '' });

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status_choice).toBeUndefined();
  });

  it('closed when no Chapter exists at all (game mode cannot be active)', async () => {
    const defender = await seedChar({ city: 5 });
    const challenger = await seedChar({ city: 1 });
    await seedNoChapter();
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status_choice).toBeUndefined();
  });

  it('closed when the current Chapter is in a non-game phase', async () => {
    const defender = await seedChar({ city: 5 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('prep');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status_choice).toBeUndefined();
  });

  it('closed when no game session exists at all', async () => {
    const defender = await seedChar({ city: 5 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('game');
    await seedNoSession();
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status_choice).toBeUndefined();
  });

  it('closed when the defender did not attend the current session', async () => {
    const defender = await seedChar({ city: 5 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('game');
    await seedSession([
      { character_id: String(defender),   character_name: `${NAME_PREFIX} Target`,     attended: false },
      { character_id: String(challenger), character_name: `${NAME_PREFIX} Challenger`, attended: true },
    ]);
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status_choice).toBeUndefined();
  });

  it('closed when the challenger did not attend the current session (both parties required)', async () => {
    const defender = await seedChar({ city: 5 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('game');
    await seedSession([
      { character_id: String(defender),   character_name: `${NAME_PREFIX} Target`,     attended: true },
      { character_id: String(challenger), character_name: `${NAME_PREFIX} Challenger`, attended: false },
    ]);
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status_choice).toBeUndefined();
  });

  it('closed when the defender\'s City Status is only equal to the challenger\'s', async () => {
    const defender = await seedChar({ city: 3 });
    const challenger = await seedChar({ city: 3 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status_choice).toBeUndefined();
  });

  it('closed when the defender\'s City Status is lower than the challenger\'s', async () => {
    const defender = await seedChar({ city: 1 });
    const challenger = await seedChar({ city: 5 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status_choice).toBeUndefined();
  });

  it('open when all three conditions hold and City Status is strictly higher', async () => {
    const defender = await seedChar({ city: 5, bloodPotency: 2 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status_choice).toEqual({ eligible: true, bp_value: 2, city_value: 4 });
  });
});

describe.skipIf(!dbAvailable)('crd.4a AC2 — status_choice value computation', () => {
  it('bp_value is the defender\'s own blood_potency; city_value is the effective City Status difference', async () => {
    const defender = await seedChar({ city: 8, bloodPotency: 5 });
    const challenger = await seedChar({ city: 2 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status_choice).toEqual({ eligible: true, bp_value: 5, city_value: 6 });
  });

  it('effective City Status is capped at 10 per side before the difference is taken', async () => {
    // court_category 'Head of State' carries a real TITLE_STATUS_BONUS; a
    // high raw status.city plus that bonus pushes the defender's raw total
    // past 10, but calcEffectiveCityStatus clamps each side individually
    // before the difference is computed (this story's own ruled-uncapped
    // decision applies only to the DIFFERENCE, never to either raw side).
    const defender = await seedChar({ city: 9, courtCategory: 'Head of State' });
    const challenger = await seedChar({ city: 0 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status_choice.city_value).toBe(10); // min(9+bonus,10) - 0
  });

  it('status_choice is present but defender_pool is null when the gate is open and no term has been chosen yet', async () => {
    const defender = await seedChar({ city: 5, bloodPotency: 2 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status_choice.eligible).toBe(true);
    expect(res.body.defender_pool, 'AC3: not a 400, but not finalised either').toBeNull();
  });
});

describe.skipIf(!dbAvailable)('crd.4a AC3/AC4 — required-when-eligible validation and persisted term', () => {
  it('an invalid defender_status_term (neither bp nor city) also leaves the pool null, not a 400', async () => {
    const defender = await seedChar({ city: 5, bloodPotency: 2 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(
      id, { defender_aspect: 'mental', defender_status_term: 'nonsense' }, defenderUser(defender)
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBeNull();

    const stored = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(id) });
    expect(stored.defender_status_term).toBeNull();
  });

  it('choosing "bp" adds bp_value exactly once and persists the choice', async () => {
    const defender = await seedChar({ city: 5, bloodPotency: 2 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(
      id, { defender_aspect: 'mental', defender_status_term: 'bp' }, defenderUser(defender)
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBe(4); // 2 (Resolve) + 2 (bp_value)
    expect(res.body.defender_status_term).toBe('bp');

    const stored = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(id) });
    expect(stored.defender_status_term).toBe('bp');
    expect(stored.defender_pool).toBe(4);
  });

  it('choosing "city" adds city_value exactly once, not bp_value', async () => {
    const defender = await seedChar({ city: 5, bloodPotency: 2 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(
      id, { defender_aspect: 'mental', defender_status_term: 'city' }, defenderUser(defender)
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBe(6); // 2 (Resolve) + 4 (city_value)
    expect(res.body.defender_status_term).toBe('city');
  });

  it('re-resolving with a different term fully overwrites, not merges', async () => {
    const defender = await seedChar({ city: 5, bloodPotency: 2 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger);

    const first = await resolveReq(id, { defender_aspect: 'mental', defender_status_term: 'bp' }, defenderUser(defender));
    expect(first.body.defender_pool).toBe(4);

    const second = await resolveReq(id, { defender_aspect: 'mental', defender_status_term: 'city' }, defenderUser(defender));
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(second.body.defender_pool).toBe(6);
    expect(second.body.defender_status_term).toBe('city');
  });

  it('defender_status_term persists as null when the gate never opens for this challenge', async () => {
    const defender = await seedChar({ city: 5 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger, { power_name: undefined });

    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_status_term).toBeNull();

    const stored = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(id) });
    expect(stored.defender_status_term).toBeNull();
  });

  it('the chosen term still respects the collection\'s own 0-30 clamp', async () => {
    const defender = await seedChar({ city: 10, bloodPotency: 3, courtCategory: 'Head of State' });
    const challenger = await seedChar({ city: 0 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    // Push the base pool near the ceiling so the status term tips it over 30.
    const id = await seedChallenge(defender, challenger);
    await getCollection('characters').updateOne({ _id: defender }, { $set: { 'attributes.Resolve.dots': 10, 'attributes.Resolve.bonus': 20 } });

    const res = await resolveReq(id, { defender_aspect: 'mental', defender_status_term: 'city' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBe(30);
  });
});

// External Codex review (2026-08-26), Pass 2, Medium: defender_status_term
// was added to the schema without being added to POST /'s own strip list,
// letting an attacker pre-populate the defender's supposed choice at
// creation time — the same injury crd.1 already fixed for
// defender_aspect/defender_wp_spent/defender_merit_ids. Patched by adding it
// to that same strip list.
describe.skipIf(!dbAvailable)('crd.4a code review — POST / strips a caller-supplied defender_status_term', () => {
  it('an attacker-supplied defender_status_term at creation time is stripped, not stored', async () => {
    const defender = await seedChar({ city: 5 });
    const challenger = await seedChar({ city: 1 });

    const res = await request(app)
      .post('/api/contested_roll_requests')
      .set('X-Test-User', playerUser([challenger.toString()]))
      .send({
        challenger_character_id:   String(challenger),
        challenger_character_name: `${NAME_PREFIX} Challenger`,
        target_character_id:       String(defender),
        target_character_name:     `${NAME_PREFIX} Target`,
        roll_type:       'resistance',
        challenger_pool: 5,
        power_name:      'Majesty',
        defender_status_term: 'city',
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.defender_status_term).toBeUndefined();

    const stored = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(res.body._id) });
    expect(stored.defender_status_term).toBeUndefined();
  });
});

// External Codex review (2026-08-26), Pass 1, High: a schema-violating
// (non-numeric) blood_potency — unreachable through the normal character
// API today (character.schema.js constrains it to an integer), but real
// via legacy/direct-Mongo data — concatenated into the pool total and
// survived the clamp as NaN, which JSON-serialises as null but is NOT
// `== null` when read back from Mongo, defeating /accept's own null-pool
// guard the same way crd.1's original `_roll(undefined)` bug did. Patched
// with an explicit Number.isFinite guard, treating a non-finite total the
// same as "not resolved yet".
describe.skipIf(!dbAvailable)('crd.4a code review — a non-finite pool total never persists as NaN', () => {
  it('a non-numeric blood_potency with defender_status_term "bp" leaves the pool null, not NaN', async () => {
    const defender = await seedChar({ city: 5 });
    const challenger = await seedChar({ city: 1 });
    await getCollection('characters').updateOne({ _id: defender }, { $set: { blood_potency: 'not-a-number' } });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));
    const id = await seedChallenge(defender, challenger);

    const res = await resolveReq(id, { defender_aspect: 'mental', defender_status_term: 'bp' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.defender_pool).toBeNull();
    expect(Number.isNaN(res.body.defender_pool)).toBe(false);

    const stored = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(id) });
    expect(stored.defender_pool).toBeNull();
    expect(Number.isNaN(stored.defender_pool)).toBe(false);

    // The pre-existing crd.1 guard must still see this as unresolved, not
    // silently accept it and roll zero dice.
    const acceptRes = await request(app).put(`/api/contested_roll_requests/${id}/accept`).set('X-Test-User', defenderUser(defender));
    expect(acceptRes.status, JSON.stringify(acceptRes.body)).toBe(409);
  });
});

// External Codex review (2026-08-26), Pass 2, Medium: the gate's own
// session-selection originally mirrored attendance.js's unfiltered "most
// recent by session_date" sort, which a future-dated game_sessions document
// (a real, supported shape — see game-sessions.js's own GET /next) could
// silently outrank. Patched to mirror office-actions.js's own
// findLatestSession instead (session_date <= today, tie-broken by _id).
describe.skipIf(!dbAvailable)('crd.4a code review — a future-dated session never outranks the current one', () => {
  it('a pre-created future game session does not shadow today\'s live attendance', async () => {
    const defender = await seedChar({ city: 5, bloodPotency: 2 });
    const challenger = await seedChar({ city: 1 });
    await seedChapter('game');
    await seedSession(bothAttended(defender, challenger));

    // A future session exists (e.g. the ST pre-created next game's shell)
    // with NO attendance recorded for either character.
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await getCollection('game_sessions').insertOne({
      title: `${NAME_PREFIX} Future Session`,
      session_date: future,
      game_number: GAME_NUMBER + 1,
      attendance: [],
    });

    const id = await seedChallenge(defender, challenger);
    const res = await resolveReq(id, { defender_aspect: 'mental' }, defenderUser(defender));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // Today's session (both attended) must still be the one the gate reads —
    // if the future session shadowed it, status_choice would be absent.
    expect(res.body.status_choice).toEqual({ eligible: true, bp_value: 2, city_value: 4 });

    await getCollection('game_sessions').deleteOne({ title: `${NAME_PREFIX} Future Session` });
  });
});
