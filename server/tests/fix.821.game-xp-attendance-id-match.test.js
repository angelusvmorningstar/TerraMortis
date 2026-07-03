/**
 * Fix #821 — game-xp attendance id-first matching + string-coerce hardening.
 *
 * Static-analysis mirror-tests verifying:
 *   1. game-xp.js uses two-phase id-first / name-fallback pattern.
 *   2. attendance.js renderGrid uses the same two-phase pattern.
 *   3. attendance.js confirmAddCharacter uses String() coercion on the id comparison.
 *
 * Inline logic tests (no DOM / browser module imports):
 *   - Duplicate display name: id wins over name collision.
 *   - String-coerce edge: ObjectId-like objects stringify correctly.
 *   - Legacy row (no character_id): name fallback runs only when id absent.
 *   - Id-present-no-match: console.warn is called; row is unattributed.
 *   - Regression: mixed fixture with 10 rows reproduces expected per-character XP.
 *
 * Pattern follows fix.943.retireStripDerived.test.js (REPO_ROOT + read helper).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

const gameXpSrc = read('public/js/data/game-xp.js');
const attendanceSrc = read('public/js/admin/attendance.js');

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis: game-xp.js
// ─────────────────────────────────────────────────────────────────────────────

describe('#821 — static: game-xp.js two-phase pattern', () => {
  it('contains String(ch._id) === String(a.character_id) id-first shape', () => {
    expect(gameXpSrc).toContain('String(ch._id) === String(a.character_id)');
  });

  it('contains if (a.character_id) guard before Phase 1', () => {
    expect(gameXpSrc).toMatch(/if\s*\(\s*a\.character_id\s*\)/);
  });

  it('contains console.warn with [game-xp] prefix', () => {
    expect(gameXpSrc).toContain('console.warn(`[game-xp]');
  });

  it('contains if (!c && !a.character_id) guard for Phase 2 name fallback', () => {
    expect(gameXpSrc).toMatch(/if\s*\(\s*!c\s*&&\s*!a\.character_id\s*\)/);
  });

  it('Phase 2 is inside the !a.character_id guard (name fallback not reachable when id present)', () => {
    // Find Phase 2 guard and check the displayName fallback is inside it
    const phase2Idx = gameXpSrc.indexOf('if (!c && !a.character_id)');
    expect(phase2Idx).toBeGreaterThan(-1);
    const displayNameIdx = gameXpSrc.indexOf('displayName(ch)', phase2Idx);
    expect(displayNameIdx).toBeGreaterThan(phase2Idx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis: attendance.js
// ─────────────────────────────────────────────────────────────────────────────

describe('#821 — static: attendance.js renderGrid two-phase pattern', () => {
  it('renderGrid area contains String(ch._id) === String(a.character_id)', () => {
    expect(attendanceSrc).toContain('String(ch._id) === String(a.character_id)');
  });

  it('renderGrid area contains two-phase guard if (!c && !a.character_id)', () => {
    expect(attendanceSrc).toMatch(/if\s*\(\s*!c\s*&&\s*!a\.character_id\s*\)/);
  });

  it('renderGrid console.warn for id-present-no-match', () => {
    expect(attendanceSrc).toContain('console.warn(`[attendance]');
  });

  it('confirmAddCharacter uses String() coercion on id comparison', () => {
    expect(attendanceSrc).toContain('String(ch._id) === String(sel.value)');
  });

  it('getEligibleChars has annotation comment about SameValueZero safety', () => {
    expect(attendanceSrc).toContain('Set.has uses SameValueZero');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Inline two-phase matching logic (pure functions, no DOM)
// Mirrors the fixed loadGameXP logic for unit testing.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal displayName stand-in for tests — mirrors helpers.js logic.
 * honorific + (moniker || name)
 */
function displayName(c) {
  const parts = [];
  if (c.honorific) parts.push(c.honorific);
  parts.push(c.moniker || c.name);
  return parts.join(' ');
}

/**
 * Two-phase match — mirrors the fixed game-xp.js logic.
 * Returns the matched char object or null (never undefined).
 */
function twoPhaseMatch(chars, a) {
  let c = null;
  if (a.character_id) {
    c = chars.find(ch => String(ch._id) === String(a.character_id)) ?? null;
  }
  if (!c && !a.character_id) {
    c = chars.find(ch =>
      ch.name === a.character_name ||
      ch.name === a.name ||
      displayName(ch) === (a.display_name || a.character_display)
    ) ?? null;
  }
  return c;
}

/**
 * Simulate loadGameXP logic over a set of sessions.
 * Returns a Map of char._id -> accumulated XP.
 */
function simulateLoadGameXP(chars, gameSessions) {
  const xpMap = new Map(chars.map(c => [c._id, 0]));
  for (const s of gameSessions) {
    for (const a of s.attendance || []) {
      const xp = (a.attended ? 1 : 0) + (a.costuming ? 1 : 0) + (a.downtime ? 1 : 0) + (a.extra || 0);
      if (xp === 0) continue;
      const c = twoPhaseMatch(chars, a);
      if (c) {
        xpMap.set(c._id, (xpMap.get(c._id) || 0) + xp);
      }
    }
  }
  return xpMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: two-phase id/name logic (unit)
// ─────────────────────────────────────────────────────────────────────────────

describe('#821 — two-phase match unit tests', () => {
  const chars = [
    { _id: 'aaa111', name: 'Alice', honorific: null, moniker: null },
    { _id: 'bbb222', name: 'Bob',   honorific: null, moniker: null },
    { _id: 'ccc333', name: 'James', honorific: null, moniker: null },
    { _id: 'ddd444', name: 'James', honorific: null, moniker: null }, // duplicate name
  ];

  it('id present, unique name — resolves correct character by id', () => {
    const a = { character_id: 'aaa111', character_name: 'Alice' };
    expect(twoPhaseMatch(chars, a)?._id).toBe('aaa111');
  });

  it('id present, duplicate name, correct id wins — bbb222 row goes to bbb222 not first-in-array', () => {
    // Two chars named "James": ccc333 and ddd444. Row's character_id points at ddd444.
    const a = { character_id: 'ddd444', character_name: 'James' };
    const result = twoPhaseMatch(chars, a);
    expect(result?._id).toBe('ddd444');
    expect(result?._id).not.toBe('ccc333');
  });

  it('id absent, unique name — falls through to name-phase, resolves correct character', () => {
    const a = { character_id: null, character_name: 'Bob' };
    expect(twoPhaseMatch(chars, a)?._id).toBe('bbb222');
  });

  it('id absent, duplicate name — resolves to first match in array (documented behaviour)', () => {
    // Both ccc333 and ddd444 are named "James"; first in array wins
    const a = { character_id: null, character_name: 'James' };
    expect(twoPhaseMatch(chars, a)?._id).toBe('ccc333');
  });

  it('id present, no match — returns null, XP unattributed', () => {
    const a = { character_id: 'xyz999', character_name: 'Alice' };
    expect(twoPhaseMatch(chars, a)).toBeNull();
  });

  it('id absent, no name match — returns null', () => {
    const a = { character_id: null, character_name: 'Nobody' };
    expect(twoPhaseMatch(chars, a)).toBeNull();
  });

  it('name fallback does NOT run when character_id is present and matched', () => {
    // Give Alice a unique id but wrong character_name; id-match wins, name is irrelevant
    const a = { character_id: 'aaa111', character_name: 'Bob' };
    expect(twoPhaseMatch(chars, a)?._id).toBe('aaa111');
  });

  it('name fallback does NOT run when character_id is present and unmatched', () => {
    // character_id present but stale; name would match Alice. Must not fall through.
    const a = { character_id: 'stale-id', character_name: 'Alice' };
    expect(twoPhaseMatch(chars, a)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: String-coerce edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('#821 — String() coercion edge cases', () => {
  it('char._id as string "abc123" matches row character_id as string "abc123"', () => {
    const chars = [{ _id: 'abc123', name: 'Test', honorific: null, moniker: null }];
    const a = { character_id: 'abc123', character_name: 'Test' };
    expect(twoPhaseMatch(chars, a)?._id).toBe('abc123');
  });

  it('char._id as object with .toString() "abc123" matches string character_id "abc123"', () => {
    // Simulates MongoDB ObjectId behaviour if a non-serialised id is in the chars array
    const objectId = { toString: () => 'abc123', valueOf: () => 'abc123' };
    // String(objectId) calls .toString() => 'abc123'
    const chars = [{ _id: objectId, name: 'Test', honorific: null, moniker: null }];
    const a = { character_id: 'abc123', character_name: 'Test' };
    const result = twoPhaseMatch(chars, a);
    expect(result).not.toBeNull();
    expect(String(result?._id)).toBe('abc123');
  });

  it('does not match when string ids differ despite same name', () => {
    const chars = [{ _id: 'aaa', name: 'Alice', honorific: null, moniker: null }];
    const a = { character_id: 'bbb', character_name: 'Alice' };
    expect(twoPhaseMatch(chars, a)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: console.warn emitted for id-present-no-match
// ─────────────────────────────────────────────────────────────────────────────

describe('#821 — warn on id-present-no-match', () => {
  let warnSpy;
  beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { warnSpy.mockRestore(); });

  /**
   * Two-phase match with warn — mirrors the actual game-xp.js path including the warn call.
   */
  function twoPhaseMatchWithWarn(chars, a) {
    let c = null;
    if (a.character_id) {
      c = chars.find(ch => String(ch._id) === String(a.character_id)) ?? null;
      if (!c) {
        console.warn(`[game-xp] attendance row with character_id=${a.character_id} matched no character — XP unattributed`);
      }
    }
    if (!c && !a.character_id) {
      c = chars.find(ch =>
        ch.name === a.character_name ||
        ch.name === a.name ||
        displayName(ch) === (a.display_name || a.character_display)
      ) ?? null;
    }
    return c;
  }

  it('emits console.warn when character_id present but no char matches', () => {
    const chars = [{ _id: 'abc', name: 'Alice', honorific: null, moniker: null }];
    const a = { character_id: 'xyz', character_name: 'Alice' };
    const result = twoPhaseMatchWithWarn(chars, a);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('[game-xp]');
    expect(warnSpy.mock.calls[0][0]).toContain('xyz');
  });

  it('does NOT warn when character_id absent (name-fallback path)', () => {
    const chars = [{ _id: 'abc', name: 'Alice', honorific: null, moniker: null }];
    const a = { character_id: null, character_name: 'Alice' };
    twoPhaseMatchWithWarn(chars, a);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT warn when character_id present and matches', () => {
    const chars = [{ _id: 'abc', name: 'Alice', honorific: null, moniker: null }];
    const a = { character_id: 'abc', character_name: 'Alice' };
    twoPhaseMatchWithWarn(chars, a);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: Regression — XP totals over mixed fixture
// ─────────────────────────────────────────────────────────────────────────────

describe('#821 — XP totals regression (mixed fixture)', () => {
  // 5 chars with unique names (no collision risk in this regression suite)
  const chars = [
    { _id: 'c1', name: 'Valerius',  honorific: null, moniker: null },
    { _id: 'c2', name: 'Seraphina', honorific: null, moniker: null },
    { _id: 'c3', name: 'Mordecai',  honorific: null, moniker: null },
    { _id: 'c4', name: 'Isadora',   honorific: null, moniker: null },
    { _id: 'c5', name: 'Theron',    honorific: null, moniker: null },
  ];

  // 10 attendance rows: 7 with character_id, 3 without (name-fallback)
  // Hand-computed expected XP:
  //   c1: attended(1) + costuming(1) + downtime(1) = 3
  //   c2: attended(1) = 1  [row has character_id]
  //   c3: attended(1) + extra(2) = 3  [row has character_id]
  //   c4: attended(1) + costuming(1) = 2  [two rows, both have character_id]
  //   c5: attended(1) = 1  [no character_id, name match]
  //   c1 also gets 1 more from a name-only legacy row: attended(1) = 1 => c1 total = 4
  // unmatched: 1 row with stale character_id 'stale' => 0 XP attributed

  const gameSessions = [
    {
      title: 'Game 1',
      session_date: '2025-01-01',
      attendance: [
        { character_id: 'c1', character_name: 'Valerius',  attended: true,  costuming: true,  downtime: true,  extra: 0 },
        { character_id: 'c2', character_name: 'Seraphina', attended: true,  costuming: false, downtime: false, extra: 0 },
        { character_id: 'c3', character_name: 'Mordecai',  attended: true,  costuming: false, downtime: false, extra: 2 },
        { character_id: 'c4', character_name: 'Isadora',   attended: true,  costuming: true,  downtime: false, extra: 0 },
        { character_id: 'c4', character_name: 'Isadora',   attended: false, costuming: false, downtime: false, extra: 0 }, // xp=0, skip
      ],
    },
    {
      title: 'Game 2',
      session_date: '2025-02-01',
      attendance: [
        // Legacy rows (no character_id)
        { character_id: null, character_name: 'Theron',    attended: true,  costuming: false, downtime: false, extra: 0 },
        { character_id: null, character_name: 'Valerius',  attended: true,  costuming: false, downtime: false, extra: 0 },
        // Row with stale character_id — should be unattributed
        { character_id: 'stale-id-xyz', character_name: 'Seraphina', attended: true, costuming: false, downtime: false, extra: 0 },
        // Three more id-rows
        { character_id: 'c3', character_name: 'Mordecai',  attended: false, costuming: false, downtime: false, extra: 0 }, // xp=0, skip
        { character_id: 'c5', character_name: 'Theron',    attended: false, costuming: false, downtime: false, extra: 0 }, // xp=0, skip
      ],
    },
  ];

  it('c1 (Valerius) accumulates 4 XP: 3 from Game 1 + 1 legacy row Game 2', () => {
    const xpMap = simulateLoadGameXP(chars, gameSessions);
    expect(xpMap.get('c1')).toBe(4);
  });

  it('c2 (Seraphina) accumulates 1 XP from Game 1 id-row; stale-id row is unattributed', () => {
    const xpMap = simulateLoadGameXP(chars, gameSessions);
    expect(xpMap.get('c2')).toBe(1);
  });

  it('c3 (Mordecai) accumulates 3 XP from Game 1 (extra=2 + attended)', () => {
    const xpMap = simulateLoadGameXP(chars, gameSessions);
    expect(xpMap.get('c3')).toBe(3);
  });

  it('c4 (Isadora) accumulates 2 XP from Game 1 (attended + costuming; second row xp=0 skipped)', () => {
    const xpMap = simulateLoadGameXP(chars, gameSessions);
    expect(xpMap.get('c4')).toBe(2);
  });

  it('c5 (Theron) accumulates 1 XP from Game 2 legacy row (no character_id)', () => {
    const xpMap = simulateLoadGameXP(chars, gameSessions);
    expect(xpMap.get('c5')).toBe(1);
  });

  it('total attributed XP across all chars equals 11 (stale row unattributed)', () => {
    const xpMap = simulateLoadGameXP(chars, gameSessions);
    const total = [...xpMap.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(11); // 3+1+3+2+1+1 = 11; stale row (1 XP) is dropped
  });

  it('no character absorbs XP from more rows than legitimately belong to it', () => {
    const xpMap = simulateLoadGameXP(chars, gameSessions);
    // The maximum any single char can earn in these two sessions is bounded by their rows
    expect(xpMap.get('c1')).toBeLessThanOrEqual(4);
    expect(xpMap.get('c2')).toBeLessThanOrEqual(1);
    expect(xpMap.get('c3')).toBeLessThanOrEqual(3);
    expect(xpMap.get('c4')).toBeLessThanOrEqual(2);
    expect(xpMap.get('c5')).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: Duplicate display name (synthetic fixture per story spec)
// ─────────────────────────────────────────────────────────────────────────────

describe('#821 — duplicate display name synthetic fixture', () => {
  // Two chars with identical name "James"
  const chars = [
    { _id: 'aaa111', name: 'James', honorific: null, moniker: null },
    { _id: 'bbb222', name: 'James', honorific: null, moniker: null },
  ];

  it('row with character_id=bbb222 resolves to bbb222 regardless of array order', () => {
    const a = { character_id: 'bbb222', character_name: 'James', attended: true };
    expect(twoPhaseMatch(chars, a)?._id).toBe('bbb222');
  });

  it('row without character_id resolves to aaa111 (first in array by name)', () => {
    const a = { character_id: null, character_name: 'James', attended: true };
    expect(twoPhaseMatch(chars, a)?._id).toBe('aaa111');
  });

  it('XP totals: each "James" gets exactly 1 XP from their respective rows', () => {
    const gameSessions = [{
      title: 'Game 1',
      session_date: '2025-01-01',
      attendance: [
        { character_id: 'bbb222', character_name: 'James', attended: true, costuming: false, downtime: false, extra: 0 },
        { character_id: null,    character_name: 'James', attended: true, costuming: false, downtime: false, extra: 0 },
      ],
    }];
    const xpMap = simulateLoadGameXP(chars, gameSessions);
    expect(xpMap.get('aaa111')).toBe(1);
    expect(xpMap.get('bbb222')).toBe(1);
  });
});
