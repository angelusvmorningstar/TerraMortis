/**
 * Tests — feature #687: alternative scoring models for the ranking aggregate.
 *
 * Two test groups:
 *
 * 1. Logic — mirrors applyScoreModel() inline (browser module; can't import
 *    directly in Node) and asserts correct totals + vote breakdowns for all
 *    four models: Linear, Tiered, 1st-Only, Flat.
 *
 * 2. Contract — static grep of status-ranking.js and suite.css to confirm
 *    the key artefacts are present and the module is wired correctly.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Inline mirror of the production code (browser-only module cannot be imported)
// ---------------------------------------------------------------------------

const BORDA_TO_SLOT = { 5: 1, 4: 2, 3: 3, 2: 4, 1: 5 };

const SCORE_MODELS = {
  linear:       { label: 'Linear',   slotPts: { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 } },
  tiered:       { label: 'Tiered',   slotPts: { 1: 2, 2: 2, 3: 1, 4: 1, 5: 1 } },
  'first-only': { label: '1st Only', slotPts: { 1: 2, 2: 1, 3: 1, 4: 1, 5: 1 } },
  flat:         { label: 'Flat',     slotPts: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 } },
};

function applyScoreModel(agg, modelKey) {
  const { slotPts } = SCORE_MODELS[modelKey] || SCORE_MODELS.linear;

  function rescore(votes) {
    const newPts = {}, newVotes = {};
    for (const [cid, contributions] of Object.entries(votes || {})) {
      let total = 0;
      const newContribs = [];
      for (const { pts: bordaPts, voter } of contributions) {
        const slot  = BORDA_TO_SLOT[bordaPts] ?? 0;
        const newPt = slotPts[slot] ?? 0;
        total += newPt;
        if (newPt > 0) newContribs.push({ pts: newPt, voter });
      }
      newPts[cid]   = total;
      newVotes[cid] = newContribs.sort((a, b) => b.pts - a.pts);
    }
    return { pts: newPts, votes: newVotes };
  }

  const clan     = rescore(agg.clan_votes);
  const covenant = rescore(agg.covenant_votes);
  return {
    clan_points:          clan.pts,
    clan_votes:           clan.votes,
    clan_voter_count:     agg.clan_voter_count,
    covenant_points:      covenant.pts,
    covenant_votes:       covenant.votes,
    covenant_voter_count: agg.covenant_voter_count,
  };
}

// ---------------------------------------------------------------------------
// Test fixture — a ranked aggregate as the server returns it (Borda pts)
//
// Setup:
//   VoterA ranked: charA 1st (pts=5), charB 2nd (pts=4)
//   VoterB ranked: charC 1st (pts=5), charA 3rd (pts=3)
//
// Linear expected totals: charA=8, charB=4, charC=5
// ---------------------------------------------------------------------------

const RAW_AGG = {
  clan_points:          { charA: 8, charB: 4, charC: 5 },
  clan_votes: {
    charA: [{ pts: 5, voter: 'VoterA' }, { pts: 3, voter: 'VoterB' }],
    charB: [{ pts: 4, voter: 'VoterA' }],
    charC: [{ pts: 5, voter: 'VoterB' }],
  },
  clan_voter_count:     { Mekhet: 2 },
  covenant_points:      {},
  covenant_votes:       {},
  covenant_voter_count: {},
};

// ---------------------------------------------------------------------------
// 1. Logic tests
// ---------------------------------------------------------------------------

describe('applyScoreModel — Linear (identity pass-through)', () => {
  const result = applyScoreModel(RAW_AGG, 'linear');

  it('charA: slot1(5pts) + slot3(3pts) = 8', () => {
    expect(result.clan_points['charA']).toBe(8);
  });

  it('charB: slot2(4pts) = 4', () => {
    expect(result.clan_points['charB']).toBe(4);
  });

  it('charC: slot1(5pts) = 5', () => {
    expect(result.clan_points['charC']).toBe(5);
  });

  it('vote breakdown for charA preserves descending order', () => {
    expect(result.clan_votes['charA']).toEqual([
      { pts: 5, voter: 'VoterA' },
      { pts: 3, voter: 'VoterB' },
    ]);
  });

  it('voter counts pass through unchanged', () => {
    expect(result.clan_voter_count).toEqual({ Mekhet: 2 });
  });
});

describe('applyScoreModel — Tiered (slots 1+2=2, slots 3-5=1)', () => {
  const result = applyScoreModel(RAW_AGG, 'tiered');

  it('charA: slot1→2 + slot3→1 = 3', () => {
    expect(result.clan_points['charA']).toBe(3);
  });

  it('charB: slot2→2', () => {
    expect(result.clan_points['charB']).toBe(2);
  });

  it('charC: slot1→2', () => {
    expect(result.clan_points['charC']).toBe(2);
  });

  it('vote breakdown for charA reflects rescored pts, sorted desc', () => {
    expect(result.clan_votes['charA']).toEqual([
      { pts: 2, voter: 'VoterA' },
      { pts: 1, voter: 'VoterB' },
    ]);
  });
});

describe('applyScoreModel — 1st Only (slot1=2, others=1)', () => {
  const result = applyScoreModel(RAW_AGG, 'first-only');

  it('charA: slot1→2 + slot3→1 = 3', () => {
    expect(result.clan_points['charA']).toBe(3);
  });

  it('charB: slot2→1 (not 2 — only 1st gets bonus)', () => {
    expect(result.clan_points['charB']).toBe(1);
  });

  it('charC: slot1→2', () => {
    expect(result.clan_points['charC']).toBe(2);
  });

  it('charB vote shows pts=1', () => {
    expect(result.clan_votes['charB']).toEqual([{ pts: 1, voter: 'VoterA' }]);
  });
});

describe('applyScoreModel — Flat (all slots = 1)', () => {
  const result = applyScoreModel(RAW_AGG, 'flat');

  it('charA: 2 votes → 2', () => {
    expect(result.clan_points['charA']).toBe(2);
  });

  it('charB: 1 vote → 1', () => {
    expect(result.clan_points['charB']).toBe(1);
  });

  it('charC: 1 vote → 1', () => {
    expect(result.clan_points['charC']).toBe(1);
  });

  it('all vote entries have pts=1', () => {
    for (const votes of Object.values(result.clan_votes))
      votes.forEach(v => expect(v.pts).toBe(1));
  });
});

describe('applyScoreModel — edge cases', () => {
  it('unknown model key falls back to Linear', () => {
    const result = applyScoreModel(RAW_AGG, 'nonexistent-model');
    expect(result.clan_points['charA']).toBe(8);
  });

  it('empty votes object returns empty totals', () => {
    const emptyAgg = {
      clan_points: {}, clan_votes: {}, clan_voter_count: {},
      covenant_points: {}, covenant_votes: {}, covenant_voter_count: {},
    };
    const result = applyScoreModel(emptyAgg, 'tiered');
    expect(result.clan_points).toEqual({});
    expect(result.clan_votes).toEqual({});
  });

  it('unexpected pts value (not in BORDA_TO_SLOT) scores 0 and is excluded from vote list', () => {
    const weirdAgg = {
      clan_points: {}, clan_votes: { charX: [{ pts: 99, voter: 'Ghost' }] },
      clan_voter_count: {}, covenant_points: {}, covenant_votes: {}, covenant_voter_count: {},
    };
    const result = applyScoreModel(weirdAgg, 'linear');
    expect(result.clan_points['charX']).toBe(0);
    expect(result.clan_votes['charX']).toEqual([]);
  });

  it('does not mutate the original aggregate', () => {
    const original = JSON.parse(JSON.stringify(RAW_AGG));
    applyScoreModel(RAW_AGG, 'tiered');
    expect(RAW_AGG.clan_votes['charA'][0].pts).toBe(original.clan_votes['charA'][0].pts);
  });

  it('clan_voter_count and covenant_voter_count are passed through unchanged for all models', () => {
    for (const model of ['linear', 'tiered', 'first-only', 'flat']) {
      const result = applyScoreModel(RAW_AGG, model);
      expect(result.clan_voter_count).toEqual({ Mekhet: 2 });
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Contract tests — static grep of source files
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dirname, '../../');
const srcRanking = readFileSync(resolve(REPO_ROOT, 'public/js/tabs/status-ranking.js'), 'utf8');
const srcCss     = readFileSync(resolve(REPO_ROOT, 'public/css/suite.css'), 'utf8');

describe('status-ranking.js — scoring model constants present', () => {
  it('defines SCORE_SESSION_KEY', () => {
    expect(srcRanking).toMatch(/SCORE_SESSION_KEY\s*=\s*['"]tm_ranking_score_model['"]/);
  });

  it('defines BORDA_TO_SLOT reverse map', () => {
    expect(srcRanking).toMatch(/BORDA_TO_SLOT/);
    expect(srcRanking).toMatch(/5\s*:\s*1/);  // slot 1 maps from pts=5
  });

  it('defines all four scoring models', () => {
    expect(srcRanking).toMatch(/linear/);
    expect(srcRanking).toMatch(/tiered/);
    expect(srcRanking).toMatch(/first-only/);
    expect(srcRanking).toMatch(/flat/);
  });

  it('exports applyScoreModel function', () => {
    expect(srcRanking).toMatch(/function applyScoreModel/);
  });

  it('renderRankingAggShell renders all five mode buttons (unified toggle, #689)', () => {
    // ALL_MODE_KEYS defines the five unified buttons; presence of all five keys in the array suffices
    expect(srcRanking).toMatch(/ALL_MODE_KEYS\s*=\s*\[/);
    expect(srcRanking).toMatch(/'linear'/);
    expect(srcRanking).toMatch(/'tiered'/);
    expect(srcRanking).toMatch(/'first-only'/);
    expect(srcRanking).toMatch(/'flat'/);
    expect(srcRanking).toMatch(/'political'/);
    // the button template loop uses data-mode= attribute
    expect(srcRanking).toMatch(/data-mode=.*key/);
  });

  it('renderRankingAggShell sets active button from sessionStorage on initial render (#689)', () => {
    expect(srcRanking).toMatch(/ALL_MODE_KEYS\.includes\(stored\)/);
  });

  it('wireRankingAggregate reads activeKey from sessionStorage', () => {
    expect(srcRanking).toMatch(/sessionStorage\.getItem\(SCORE_SESSION_KEY\)/);
  });

  it('wireRankingAggregate writes activeKey to sessionStorage on click', () => {
    expect(srcRanking).toMatch(/sessionStorage\.setItem\(SCORE_SESSION_KEY/);
  });

  it('wireRankingAggregate calls applyScoreModel with activeKey (#689)', () => {
    expect(srcRanking).toMatch(/applyScoreModel\(rankedAgg,\s*activeKey\)/);
  });

  it('getAgg returns politicalAgg directly for political mode (#689)', () => {
    expect(srcRanking).toMatch(/activeKey\s*===\s*['"]political['"]\s*\?\s*politicalAgg/);
  });

  it('sessionStorage validation uses ALL_MODE_KEYS (includes political, #689)', () => {
    expect(srcRanking).toMatch(/ALL_MODE_KEYS/);
    expect(srcRanking).toMatch(/ALL_MODE_KEYS\.includes\(stored\)/);
  });
});

describe('suite.css — unified toggle styles present / removed styles absent', () => {
  it('.rank-mode-btn style still defined (covers all five buttons, #689)', () => {
    expect(srcCss).toMatch(/\.rank-mode-btn\s*\{/);
  });

  it('.rank-mode-btn.active style still defined', () => {
    expect(srcCss).toMatch(/\.rank-mode-btn\.active\s*\{/);
  });

  it('.rank-score-row removed by #689 — must NOT be present', () => {
    expect(srcCss).not.toMatch(/\.rank-score-row\s*\{/);
  });
});
