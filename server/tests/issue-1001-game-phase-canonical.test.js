import { describe, it, expect, beforeAll } from 'vitest';

/**
 * #1001 regression: getGamePhaseCycle / isInGamePhase must resolve game phase
 * through deriveCycleStatus (game_phase wins over legacy `status`). The incident:
 * a cycle carried game_phase='game' while its legacy status still pointed
 * elsewhere, so the raw `status === 'game'` reader missed it and feeding night
 * saw "no downtime input" for everyone.
 *
 * db.js is browser code (imports ../data/api.js which reads `location`), so we
 * stub the minimal browser globals and dynamic-import it, then exercise the pure
 * derivation + the fetch-backed getGamePhaseCycle against a mocked cycles list.
 */

let deriveCycleStatus, isInGamePhase, getGamePhaseCycle;
let fetchImpl = async () => ({ status: 200, ok: true, json: async () => [] });

beforeAll(async () => {
  globalThis.location = { hostname: 'test-host' };
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.fetch = (...args) => fetchImpl(...args);
  const mod = await import('../../public/js/downtime/db.js');
  deriveCycleStatus = mod.deriveCycleStatus;
  isInGamePhase = mod.isInGamePhase;
  getGamePhaseCycle = mod.getGamePhaseCycle;
});

describe('#1001 — deriveCycleStatus / isInGamePhase (dual-field)', () => {
  it('divergence: game_phase=game + status=active is in-game', () => {
    const cycle = { game_phase: 'game', status: 'active' };
    expect(deriveCycleStatus(cycle)).toBe('game');
    expect(isInGamePhase(cycle)).toBe(true);
  });

  it('reverse divergence: stale status=game + game_phase=downtime is NOT in-game', () => {
    const cycle = { game_phase: 'downtime', status: 'game' };
    expect(deriveCycleStatus(cycle)).toBe('active');
    expect(isInGamePhase(cycle)).toBe(false);
  });

  it('game_phase=processing is closed, not in-game', () => {
    expect(isInGamePhase({ game_phase: 'processing', status: 'game' })).toBe(false);
  });

  it('legacy cycle (no game_phase) still honours status=game via fallback derivation', () => {
    // No game_phase, no city sign-off → legacy derivation returns 'game'.
    expect(isInGamePhase({ phase_signoff: { prep: { at: 'x' } } })).toBe(true);
  });

  it('plain active cycle is not in-game', () => {
    expect(isInGamePhase({ status: 'active' })).toBe(false);
  });
});

describe('#1001 — getGamePhaseCycle picks by derived phase', () => {
  it('finds the game_phase=game cycle even when its status=active, ignoring a stale status=game cycle', async () => {
    const cycles = [
      { _id: '1', label: 'Game 5', game_phase: 'game', status: 'active' },      // truly in game
      { _id: '2', label: 'Game 6', game_phase: 'downtime', status: 'game' },    // stale legacy status
    ];
    fetchImpl = async () => ({ status: 200, ok: true, json: async () => cycles });
    const found = await getGamePhaseCycle();
    expect(found).not.toBeNull();
    expect(found._id).toBe('1');
  });

  it('returns null when no cycle is in game phase', async () => {
    const cycles = [{ _id: '3', game_phase: 'downtime', status: 'active' }];
    fetchImpl = async () => ({ status: 200, ok: true, json: async () => cycles });
    expect(await getGamePhaseCycle()).toBeNull();
  });
});
