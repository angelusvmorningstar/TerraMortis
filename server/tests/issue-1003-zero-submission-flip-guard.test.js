import { describe, it, expect, beforeAll } from 'vitest';

/**
 * #1003 guard: flipping a cycle to game phase must warn when the target has zero
 * downtime submissions while another non-closed cycle has some — the 2026-07-16
 * incident (empty "Game 6" flipped live while "Game 5" held 27 submissions,
 * silently defaulting every feeding roll to Barrens -4).
 *
 * db.js is browser code (imports ../data/api.js which reads `location`), so we
 * stub the minimal browser globals and dynamic-import it, then exercise the pure
 * decision function with injected submission counts.
 */

let zeroSubmissionFlipWarning, zeroSubmissionFlipMessage, cycleDisplayName;

beforeAll(async () => {
  globalThis.location = { hostname: 'test-host' };
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => [] });
  const mod = await import('../../public/js/downtime/db.js');
  zeroSubmissionFlipWarning = mod.zeroSubmissionFlipWarning;
  zeroSubmissionFlipMessage = mod.zeroSubmissionFlipMessage;
  cycleDisplayName = mod.cycleDisplayName;
});

// counts: map of cycleId -> submission count. countSubs closes over it.
const countsFn = (counts) => async (id) => counts[String(id)] ?? 0;

describe('#1003 — zeroSubmissionFlipWarning', () => {
  const game6 = { _id: '6', label: 'Game 6', status: 'active' };
  const game5 = { _id: '5', label: 'Game 5', status: 'active' };

  it('fires on the 0-vs-many condition (target empty, rival has submissions)', async () => {
    const warn = await zeroSubmissionFlipWarning(game6, [game6, game5], countsFn({ '6': 0, '5': 27 }));
    expect(warn).not.toBeNull();
    expect(warn.target._id).toBe('6');
    expect(warn.targetCount).toBe(0);
    expect(warn.rival._id).toBe('5');
    expect(warn.rivalCount).toBe(27);
  });

  it('does NOT fire when the target has submissions (normal flip)', async () => {
    const warn = await zeroSubmissionFlipWarning(game5, [game6, game5], countsFn({ '6': 0, '5': 27 }));
    expect(warn).toBeNull();
  });

  it('does NOT fire when no other cycle has submissions', async () => {
    const warn = await zeroSubmissionFlipWarning(game6, [game6, game5], countsFn({ '6': 0, '5': 0 }));
    expect(warn).toBeNull();
  });

  it('ignores a rival that is closed even if it has submissions', async () => {
    const closed = { _id: '4', label: 'Game 4', status: 'closed' };
    const warn = await zeroSubmissionFlipWarning(game6, [game6, closed], countsFn({ '6': 0, '4': 30 }));
    expect(warn).toBeNull();
  });

  it('treats game_phase=processing rival as closed (ignored)', async () => {
    const processing = { _id: '4', label: 'Game 4', status: 'active', game_phase: 'processing' };
    const warn = await zeroSubmissionFlipWarning(game6, [game6, processing], countsFn({ '6': 0, '4': 30 }));
    expect(warn).toBeNull();
  });

  it('does not count the target as its own rival', async () => {
    const warn = await zeroSubmissionFlipWarning(game6, [game6], countsFn({ '6': 0 }));
    expect(warn).toBeNull();
  });

  it('handles null target gracefully', async () => {
    expect(await zeroSubmissionFlipWarning(null, [game5], countsFn({ '5': 3 }))).toBeNull();
  });
});

describe('#1003 — zeroSubmissionFlipMessage / cycleDisplayName', () => {
  it('names both cycles with the rival count, no em-dash', () => {
    const warn = { target: { label: 'Game 6' }, targetCount: 0, rival: { label: 'Game 5' }, rivalCount: 27 };
    const msg = zeroSubmissionFlipMessage(warn);
    expect(msg).toContain('Game 6');
    expect(msg).toContain('Game 5');
    expect(msg).toContain('27');
    expect(msg).toContain('no downtime submissions');
    expect(msg).not.toContain('—'); // no em-dash
  });

  it('falls back to Game N when label absent', () => {
    expect(cycleDisplayName({ game_number: 7 })).toBe('Game 7');
    expect(cycleDisplayName({ label: 'Downtime 7', game_number: 7 })).toBe('Downtime 7');
    expect(cycleDisplayName(null)).toBe('this cycle');
  });
});
