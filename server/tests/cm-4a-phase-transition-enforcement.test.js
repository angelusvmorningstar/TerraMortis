/**
 * CM-4a — the phase-transition invariant, enforced server-side.
 *
 * The tracker slate-wipe stops being a courtesy the admin Cycle tab extends
 * (two independent HTTP calls, only one of which touches the cycle document)
 * and becomes a consequence of the phase write itself, performed by the route
 * that mutates `chapters.phase`, inside one Mongo transaction.
 *
 * Ruling document: D:/Terra Mortis/cycle-model.md Rev 3 sections 7 and 11a;
 * story: specs/stories/cm-4a-phase-transition-server-enforcement.md.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'fs';
import request from 'supertest';
import { ObjectId } from 'mongodb';

import {
  resetOnTransition,
  transitionFromPhase,
} from '../../public/js/downtime/cycle-phase.js';

// AC6's atomicity probe needs a failure INSIDE the transaction, after the
// phase write. The wipe is the last operation in that callback, so making
// tracker_state's deleteMany throw is the natural injection point and needs
// no test-only hook in production code. The flag lives on globalThis because
// vi.mock's factory is hoisted above every local declaration in this file.
//
// CM-4a review finding P3: the injected failure also RECORDS the arguments the
// route passed to deleteMany. On the transactions-unsupported fallback path the
// wipe runs BEFORE the phase write and without a session, so the injected throw
// would fire before anything was written and both atomicity assertions would
// pass vacuously - proving nothing about the transaction. Capturing the call
// lets the test assert the session path was the one exercised.
globalThis.__cm4aFailTrackerWipe = false;
globalThis.__cm4aWipeCalls = [];
vi.mock('../db.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getCollection: (name) => {
      if (name === 'tracker_state' && globalThis.__cm4aFailTrackerWipe) {
        return {
          deleteMany: async (...args) => {
            globalThis.__cm4aWipeCalls.push(args);
            throw new Error('cm-4a injected wipe failure');
          },
        };
      }
      return actual.getCollection(name);
    },
  };
});

// cycle-views.js's only non-pure dependency is data/api.js (directly and via
// downtime/db.js), which reads `location`/`localStorage` at module load. Mock
// that one module and the real cycle-views.js imports cleanly, so review
// finding P2's fix can be DRIVEN rather than grepped (this project has no
// jsdom, so the click handler itself is out of reach - the decision it makes
// is exported instead, per the oxp.5 convention).
vi.mock('../../public/js/data/api.js', () => ({
  apiGet: vi.fn(async () => []),
  apiPut: vi.fn(async () => ({})),
  apiPost: vi.fn(async () => ({})),
  apiPatch: vi.fn(async () => ({})),
  apiDelete: vi.fn(async () => ({})),
  apiRaw: vi.fn(async () => ({})),
}));

import { phaseToggleTarget } from '../../public/js/admin/cycle-views.js';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
// cm-2b: cyclesRouter and its three helpers moved to routes/chapters.js.
import { isTransactionsUnsupported } from '../routes/chapters.js';

const PHASE_MODULE = fs.readFileSync('../public/js/downtime/cycle-phase.js', 'utf8');
const ROUTE  = fs.readFileSync('routes/chapters.js', 'utf8');
const VIEWS  = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');

// The five values a transition can move between, `null` included (a
// clear-to-neutral is a phase-keyed write - buildPhaseUpdate writes
// `phase: null` explicitly).
const PHASES = [null, 'downtime', 'processing', 'prep', 'game'];

// ── AC3: one shared "from phase" reader ──────────────────────────────────────

describe('cm-4a — transitionFromPhase (the single from-phase reader)', () => {
  it('reads a known `phase` value first', () => {
    for (const p of ['downtime', 'processing', 'prep', 'game']) {
      expect(transitionFromPhase({ phase: p })).toBe(p);
    }
  });

  it('falls back to a known legacy `game_phase` when `phase` is absent', () => {
    expect(transitionFromPhase({ game_phase: 'game' })).toBe('game');
    expect(transitionFromPhase({ game_phase: 'downtime' })).toBe('downtime');
  });

  // The AC3 divergence, in its dangerous direction: the client's uiPhase said
  // 'game' (so -> prep showed no dialog) while the server's cyclePhase said
  // 'processing' (so -> prep WOULD have wiped). One reader, one answer.
  it('the legacy shape {game_phase:"game", status:"closed"} resolves to game, not processing', () => {
    expect(transitionFromPhase({ game_phase: 'game', status: 'closed' })).toBe('game');
    expect(resetOnTransition(transitionFromPhase({ game_phase: 'game', status: 'closed' }), 'prep')).toBe(false);
  });

  it('falls back to statusToPhase when neither phase field is set', () => {
    expect(transitionFromPhase({ status: 'active' })).toBe('downtime');
    expect(transitionFromPhase({ status: 'open' })).toBe('downtime');
    expect(transitionFromPhase({ status: 'closed' })).toBe('processing');
    expect(transitionFromPhase({ status: 'game' })).toBe('game');
  });

  // Legacy status 'prep' means "the ST is setting the cycle up" - the START of
  // a cycle - never the phase named 'prep' near its end. statusToPhase's own
  // contract; re-pinned here because this reader now decides a WIPE.
  it('legacy status "prep" does NOT resolve to phase "prep"', () =>
    expect(transitionFromPhase({ status: 'prep' })).toBe(null));

  it('a hand-edited junk phase resolves to null rather than leaking', () => {
    expect(transitionFromPhase({ phase: 'feeding' })).toBe(null);
    expect(transitionFromPhase({ game_phase: 'feeding' })).toBe(null);
    // Junk in `phase` still lets the legacy fields answer.
    expect(transitionFromPhase({ phase: 'feeding', status: 'active' })).toBe('downtime');
  });

  it('a missing, null or empty cycle resolves to null', () => {
    expect(transitionFromPhase(null)).toBe(null);
    expect(transitionFromPhase(undefined)).toBe(null);
    expect(transitionFromPhase({})).toBe(null);
    expect(transitionFromPhase({ phase: null, game_phase: null, status: null })).toBe(null);
  });

  it('is pure: the module still declares and keeps its no-imports contract', () => {
    expect(PHASE_MODULE).toContain('PURE MODULE: no imports');
    expect(PHASE_MODULE).not.toMatch(/^\s*import\s/m);
  });
});

// ── AC2 / AC9: one implementation of the matrix, one honest comment ─────────

describe('cm-4a — the route reuses the predicate and states its residual', () => {
  it('imports both shared names from the pure module, on the existing line', () => {
    const line = ROUTE.split('\n').find(l => l.startsWith('import ') && l.includes('public/js/downtime/cycle-phase.js'));
    expect(line).toBeTruthy();
    expect(line).toContain('resetOnTransition');
    expect(line).toContain('transitionFromPhase');
  });

  // AC2: the transition matrix must appear in exactly ONE place in the
  // codebase after this story, as it did before it.
  it('does not reimplement the matrix anywhere else', () => {
    expect(PHASE_MODULE).toContain('export function resetOnTransition');
    expect(ROUTE).not.toContain('function resetOnTransition');
    expect(VIEWS).not.toContain('function resetOnTransition');
    // No second from/to comparison living in the route. CM-4a review finding
    // P6: this used to read `not.toMatch(/toPhase\s*===/)`, which matched no
    // identifier the route has ever contained (the route's variable is
    // `updates.phase`) and so would have passed against any reimplementation.
    // Match what an inlined matrix would ACTUALLY look like here.
    expect(ROUTE).not.toMatch(/updates\.phase\s*===\s*['"](prep|game|downtime|processing)['"]/);
    expect(ROUTE).not.toMatch(/body\.phase\s*===\s*['"](prep|game|downtime|processing)['"]/);
    // Exactly one call site, and it feeds the shared reader straight into the
    // shared predicate (mentions inside comments do not count as a second
    // implementation, so match the call shape rather than the bare name).
    expect(ROUTE.split('resetOnTransition(transitionFromPhase(').length - 1).toBe(1);
  });

  // AC1's load-bearing condition, pinned in source as well as behaviour: the
  // gate is an own `phase` key, never a derived-status comparison.
  it('gates on an own `phase` property of the request body', () => {
    // Matched on the literal 'phase' key, not the bare hasOwnProperty call:
    // the submissions PUT above already uses the same idiom over a key list,
    // so a looser match would pass vacuously.
    expect(ROUTE).toContain("Object.prototype.hasOwnProperty.call(req.body || {}, 'phase')");
  });

  // AC9: the guarantee is stated with its limit, not glossed. §11a's
  // "regardless of caller" over-reaches on the direct-Mongo case.
  it('the route comment names the residual direct-Mongo gap', () => {
    const idx = ROUTE.indexOf('CM-4a');
    expect(idx).toBeGreaterThan(-1);
    const preamble = ROUTE.slice(idx, ROUTE.indexOf("cyclesRouter.put('/:id'", idx));
    expect(preamble).toMatch(/direct/i);
    expect(preamble).toMatch(/credential/i);
    expect(preamble).toMatch(/Cockpit/i);
  });
});

// ── AC6: the fallback guard is narrow ────────────────────────────────────────

describe('cm-4a — isTransactionsUnsupported (the fallback guard)', () => {
  it('recognises a standalone mongod refusing a transaction', () => {
    const err = Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), { code: 20 });
    expect(isTransactionsUnsupported(err)).toBe(true);
  });

  // CM-4a review finding P6: the guard used to carry a code-20-AND-message
  // branch immediately above an identical message-only one, so it could never
  // be the deciding return. These two pin what actually decides - the message -
  // so the simplification is behaviour-neutral and stays that way.
  it('decides on the message, not the code (code 20 alone is not enough)', () => {
    const wrongMessage = Object.assign(new Error('some other code-20 failure'), { code: 20 });
    expect(isTransactionsUnsupported(wrongMessage)).toBe(false);
    const noCode = new Error('Transaction numbers are only allowed on a replica set member or mongos');
    expect(isTransactionsUnsupported(noCode)).toBe(true);
  });

  it('recognises the driver-side compatibility error', () => {
    const err = Object.assign(new Error('Current topology does not support sessions or transactions'), { name: 'MongoCompatibilityError' });
    expect(isTransactionsUnsupported(err)).toBe(true);
  });

  // The whole point of the narrow guard: a real failure must NOT be laundered
  // into a silent non-atomic write, which is the defect this story removes.
  it('does NOT swallow a write conflict, a timeout, or an ordinary error', () => {
    expect(isTransactionsUnsupported(Object.assign(new Error('WriteConflict'), { code: 112 }))).toBe(false);
    expect(isTransactionsUnsupported(new Error('operation exceeded time limit'))).toBe(false);
    expect(isTransactionsUnsupported(new Error('cm-4a injected wipe failure'))).toBe(false);
    expect(isTransactionsUnsupported(null)).toBe(false);
    expect(isTransactionsUnsupported(undefined)).toBe(false);
  });
});

// ── AC3: the client delegates to it ──────────────────────────────────────────

describe('cm-4a — cycle-views.js uiPhase delegates to the shared reader', () => {
  it('imports transitionFromPhase from the pure module', () =>
    expect(VIEWS).toMatch(/import\s*\{[^}]*transitionFromPhase[^}]*\}\s*from\s*'\.\.\/downtime\/cycle-phase\.js'/));

  it('uiPhase calls it and keeps the label-map guard', () => {
    const start = VIEWS.indexOf('function uiPhase');
    expect(start).toBeGreaterThan(-1);
    const body = VIEWS.slice(start, VIEWS.indexOf('}', VIEWS.indexOf('return', start)) + 1);
    expect(body).toContain('transitionFromPhase(cy)');
    expect(body).toContain('PHASE_LABELS[p] ? p : null');
  });

  // CM-4a review finding P5. The original of this assertion forbade the literal
  // string 'cy.phase || cy.game_phase' and was satisfied only by an accident of
  // syntax: `declaresPhase` IS a second resolution order, written with optional
  // chaining (`cy?.phase || cy?.game_phase`), and slipped past the pattern.
  //
  // The second reader is real, necessary and sanctioned - it answers a
  // DIFFERENT question (what does this document DECLARE, no `status` fallback)
  // and, since P2, has a real job: the phase buttons' toggle target, which must
  // NOT follow uiPhase's widened read. So the assertion is rewritten to what it
  // always meant: exactly ONE inline `phase || game_phase` resolution in this
  // file, and it must live inside the named `declaredPhase`.
  it('has exactly one sanctioned second resolution order, and it is declaredPhase', () => {
    const inline = VIEWS.match(/\bcy\??\.phase\s*\|\|\s*cy\??\.game_phase\b/g) || [];
    expect(inline).toHaveLength(1);

    const start = VIEWS.indexOf('function declaredPhase');
    expect(start).toBeGreaterThan(-1);
    const end = VIEWS.indexOf('\n}', start) + 2;
    expect(VIEWS.slice(start, end)).toMatch(/\bcy\??\.phase\s*\|\|\s*cy\??\.game_phase\b/);
    // Narrow on purpose: the declared read must never grow a status fallback,
    // or it stops being distinguishable from uiPhase and P2's bug returns.
    expect(VIEWS.slice(start, end)).not.toContain('status');
  });

  it('buildPhaseCell drives its buttons off the declared phase, not uiPhase', () => {
    const start = VIEWS.indexOf('function buildPhaseCell');
    expect(start).toBeGreaterThan(-1);
    const body = VIEWS.slice(start, VIEWS.indexOf('\n// ── Prep Access', start));
    expect(body).toContain('phaseToggleTarget(cy, phase)');
    expect(body).not.toContain('uiPhase(');
  });
});

// ── CM-4a review finding P2: the phase-button toggle, driven ────────────────
//
// uiPhase widened in CM-4a so the client's wipe dialog asks the same question
// the server's enforcement asks (AC3). That widening is right for the
// transition decision and WRONG for the buttons' own active/toggle state, and
// it was left feeding both. On a real legacy shape - `{status:'active'}`, no
// phase fields at all - uiPhase resolves to 'downtime', so the Downtime button
// rendered active and clicking it wrote `phase: null` (a clear) rather than
// `phase: 'downtime'`. Worse, the re-derived status stayed 'active', so the
// button re-lit immediately and `downtime` became impossible to set on that
// cycle from the UI at all. Same shape for status 'closed' -> Processing and
// status 'game' -> Game.
describe('cm-4a — phaseToggleTarget (the button toggle reads the DECLARED phase)', () => {
  it('a legacy status-only cycle can still be moved to its status-equivalent phase', () => {
    // The regression. Before the fix each of these returned null (a clear).
    expect(phaseToggleTarget({ status: 'active' }, 'downtime')).toBe('downtime');
    expect(phaseToggleTarget({ status: 'closed' }, 'processing')).toBe('processing');
    expect(phaseToggleTarget({ status: 'game' }, 'game')).toBe('game');
  });

  it('a legacy status-only cycle sets any other phase normally', () => {
    expect(phaseToggleTarget({ status: 'active' }, 'prep')).toBe('prep');
    expect(phaseToggleTarget({ status: 'active' }, 'game')).toBe('game');
  });

  it('a DECLARED phase still toggles off to neutral (the behaviour that must survive)', () => {
    expect(phaseToggleTarget({ phase: 'downtime' }, 'downtime')).toBe(null);
    expect(phaseToggleTarget({ phase: 'game' }, 'game')).toBe(null);
    // The legacy game_phase declaration counts as declared, as it always did.
    expect(phaseToggleTarget({ game_phase: 'processing' }, 'processing')).toBe(null);
  });

  it('a declared phase still switches to a different phase', () => {
    expect(phaseToggleTarget({ phase: 'downtime' }, 'prep')).toBe('prep');
    expect(phaseToggleTarget({ phase: 'prep' }, 'game')).toBe('game');
  });

  it('a junk declared value never renders a button active', () => {
    for (const p of ['downtime', 'processing', 'prep', 'game']) {
      expect(phaseToggleTarget({ phase: 'feeding' }, p)).toBe(p);
    }
  });

  it('a cycle with no fields at all sets whatever is clicked', () => {
    for (const p of ['downtime', 'processing', 'prep', 'game']) {
      expect(phaseToggleTarget({}, p)).toBe(p);
      expect(phaseToggleTarget(null, p)).toBe(p);
    }
  });
});

// ── DB-backed: the route itself ──────────────────────────────────────────────
//
// issue-1143's convention: probe once at module load and describe.skipIf, so
// an unreachable MongoDB reports a clean skip rather than a failed beforeAll.
// A SKIPPED suite is not a passing suite (CLAUDE.md) - read the summary line.
const dbAvailable = await isDbAvailable();

let app;
const LABEL_PREFIX = 'CM-4a Probe';
const TRACKER_MARK = 'cm4a-probe';

const cycles = () => getCollection('chapters');
const tracker = () => getCollection('tracker_state');

async function makeCycle(fields = {}) {
  const doc = { label: `${LABEL_PREFIX} ${Math.random().toString(36).slice(2, 8)}`, ...fields };
  const { insertedId } = await cycles().insertOne(doc);
  return insertedId;
}

/** Seed live tracker documents, the thing a wipe destroys. */
async function seedTracker(n = 3) {
  const docs = Array.from({ length: n }, (_, i) => ({
    character_id: `${TRACKER_MARK}-${i}`,
    vitae: 5 + i,
    willpower: 4,
    _cm4a_probe: true,
  }));
  await tracker().insertMany(docs);
  return n;
}

const trackerCount = () => tracker().countDocuments({});

async function cleanup() {
  await cycles().deleteMany({ label: { $regex: `^${LABEL_PREFIX}` } });
  await tracker().deleteMany({});
}

describe.skipIf(!dbAvailable)('cm-4a — route enforcement (real DB)', () => {
  beforeAll(async () => {
    await setupDb();
    app = createTestApp();
    await cleanup();
  });
  beforeEach(async () => { await cleanup(); });
  afterAll(async () => { await cleanup(); await teardownDb(); });

  const put = (id, body, user = stUser()) =>
    request(app).put(`/api/chapters/${id}`).set('X-Test-User', user).send(body);

  // ── AC4: every ordered pair, exhaustively. ────────────────────────────────
  describe('the 25-pair transition table', () => {
    for (const from of PHASES) {
      for (const to of PHASES) {
        const expected = resetOnTransition(from, to);
        it(`${from === null ? '(none)' : from} -> ${to === null ? '(none)' : to} ${expected ? 'WIPES' : 'preserves'} the tracker`, async () => {
          const id = await makeCycle({ phase: from });
          const seeded = await seedTracker();
          const res = await put(id, { phase: to });
          expect(res.status).toBe(200);
          expect(res.body.phase).toBe(to);
          expect(await trackerCount()).toBe(expected ? 0 : seeded);
        });
      }
    }
  });

  // ── AC4: the legacy document shapes AC3 exists for. ──────────────────────
  describe('legacy document shapes', () => {
    it('{game_phase:"game", status:"closed"} -> prep does NOT wipe (the client/server divergence)', async () => {
      const id = await makeCycle({ game_phase: 'game', status: 'closed' });
      const seeded = await seedTracker();
      const res = await put(id, { phase: 'prep' });
      expect(res.status).toBe(200);
      // Reading this through the server's older `cyclePhase` would have said
      // 'processing' and wiped, with no dialog ever shown to the ST.
      expect(await trackerCount()).toBe(seeded);
    });

    it('{status:"active"} with no phase fields at all -> prep DOES wipe', async () => {
      const id = await makeCycle({ status: 'active' });
      await seedTracker();
      const res = await put(id, { phase: 'prep' });
      expect(res.status).toBe(200);
      expect(await trackerCount()).toBe(0);
    });

    it('a hand-edited junk phase does not leak into the matrix', async () => {
      // 'feeding' is not a phase. The known legacy game_phase answers instead,
      // so this is prep -> game: non-destructive. If the junk value leaked
      // through as the from-phase, resetOnTransition would wipe here.
      const id = await makeCycle({ phase: 'feeding', game_phase: 'prep' });
      const seeded = await seedTracker();
      const res = await put(id, { phase: 'game' });
      expect(res.status).toBe(200);
      expect(await trackerCount()).toBe(seeded);
    });

    it('a junk TO-phase writes through without wiping (this PUT is unvalidated, as before)', async () => {
      const id = await makeCycle({ phase: 'downtime' });
      const seeded = await seedTracker();
      const res = await put(id, { phase: 'feeding' });
      expect(res.status).toBe(200);
      expect(await trackerCount()).toBe(seeded);
    });
  });

  // ── AC5: caller-independence. ────────────────────────────────────────────
  describe('caller-independence (no client code involved)', () => {
    it('a raw PUT {phase:"game"} on a downtime cycle wipes, with no preceding DELETE', async () => {
      const id = await makeCycle({ phase: 'downtime' });
      await seedTracker();
      const res = await put(id, { phase: 'game' });
      expect(res.status).toBe(200);
      expect(res.body.phase).toBe('game');
      expect(await trackerCount()).toBe(0);
    });

    it('the same raw PUT on a prep cycle leaves seeded tracker documents untouched', async () => {
      const id = await makeCycle({ phase: 'prep' });
      const seeded = await seedTracker();
      const res = await put(id, { phase: 'game' });
      expect(res.status).toBe(200);
      const survivors = await tracker().find({ _cm4a_probe: true }).toArray();
      expect(survivors).toHaveLength(seeded);
      expect(survivors[0].vitae).toBe(5);
    });

    it('a non-phase body never touches tracker_state, at any phase (AC1)', async () => {
      for (const phase of PHASES) {
        await cleanup();
        const id = await makeCycle({ phase });
        const seeded = await seedTracker();
        const res = await put(id, { label: `${LABEL_PREFIX} renamed` });
        expect(res.status).toBe(200);
        expect(res.body.label).toBe(`${LABEL_PREFIX} renamed`);
        expect(res.body.phase ?? null).toBe(phase);
        expect(await trackerCount()).toBe(seeded);
      }
    });

    // The AC1 trap, end to end: signoffPhase writes a derived `status` on
    // every sign-off toggle, and deriveCycleStatus returns 'game' from the
    // legacy ladder. A status-keyed implementation would wipe here.
    it('a sign-off shaped body (phase_signoff + status) never wipes', async () => {
      const id = await makeCycle({ phase: 'downtime', status: 'active' });
      const seeded = await seedTracker();
      const res = await put(id, { phase_signoff: { prep: true }, status: 'game' });
      expect(res.status).toBe(200);
      expect(await trackerCount()).toBe(seeded);
    });

    it('a player cannot reach the wipe through this route', async () => {
      const id = await makeCycle({ phase: 'downtime' });
      const seeded = await seedTracker();
      const res = await put(id, { phase: 'game' }, playerUser());
      expect(res.status).toBe(403);
      expect(await trackerCount()).toBe(seeded);
    });

    it('unchanged error shapes: 400 on a malformed id, 404 on a missing one', async () => {
      const seeded = await seedTracker();
      const bad = await put('not-an-id', { phase: 'game' });
      expect(bad.status).toBe(400);
      expect(bad.body.error).toBe('VALIDATION_ERROR');

      const missing = await put(new ObjectId().toHexString(), { phase: 'game' });
      expect(missing.status).toBe(404);
      expect(missing.body.error).toBe('NOT_FOUND');

      const missingNoPhase = await put(new ObjectId().toHexString(), { label: 'x' });
      expect(missingNoPhase.status).toBe(404);
      expect(missingNoPhase.body.error).toBe('NOT_FOUND');

      // A 404 must not have wiped anything on the way past.
      expect(await trackerCount()).toBe(seeded);
    });

    it('writes every field of a phase-keyed body, not just phase (the mirror trio)', async () => {
      const id = await makeCycle({ phase: 'downtime' });
      await seedTracker();
      const res = await put(id, { phase: 'game', game_phase: 'game', status: 'game' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ phase: 'game', game_phase: 'game', status: 'game' });
      expect(await trackerCount()).toBe(0);
    });
  });

  // ── AC6: atomicity. ──────────────────────────────────────────────────────
  describe('atomicity (one transaction, both writes or neither)', () => {
    it('a failure after the phase write rolls the phase back AND leaves the tracker intact', async () => {
      const id = await makeCycle({ phase: 'downtime' });
      const seeded = await seedTracker();

      // CM-4a review P3: watch for the fallback's own warning as well as the
      // call shape, so this test fails loudly if it is silently exercising the
      // non-transactional path instead of the real transaction.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      globalThis.__cm4aWipeCalls = [];
      globalThis.__cm4aFailTrackerWipe = true;
      let res;
      try {
        res = await put(id, { phase: 'game' });
      } finally {
        globalThis.__cm4aFailTrackerWipe = false;
      }

      expect(res.status).toBe(500);
      const after = await cycles().findOne({ _id: id });
      expect(after.phase).toBe('downtime');           // (a) phase unchanged
      expect(await trackerCount()).toBe(seeded);      // (b) wipe did not half-apply

      // (c) — and the two above mean something, because this WAS the session
      // path. Without it the wipe runs first, unsessioned, and throws before
      // the phase write has happened at all: (a) and (b) would then be true of
      // a route that does nothing atomically whatsoever.
      expect(globalThis.__cm4aWipeCalls).toHaveLength(1);
      expect(globalThis.__cm4aWipeCalls[0][1]?.session).toBeTruthy();
      const cm4aWarnings = warnSpy.mock.calls.filter(c => String(c[0]).includes('[cm-4a]'));
      expect(cm4aWarnings).toHaveLength(0);
      warnSpy.mockRestore();
    });

    it('a successful wipe still commits both sides', async () => {
      const id = await makeCycle({ phase: 'downtime' });
      await seedTracker();
      await put(id, { phase: 'game' });
      const after = await cycles().findOne({ _id: id });
      expect(after.phase).toBe('game');
      expect(await trackerCount()).toBe(0);
    });
  });
});
