/**
 * fix.394 — Overfeeding column must count poaching and rote-poach feeds.
 *
 * Mirrors the _getSubFedTerrs and _computeMatrixFeederCounts logic from
 * public/js/admin/downtime-views.js inline (same pattern as
 * build-merit-actions-contacts-retainers.test.js) so tests run without
 * browser globals.
 *
 * Verifies:
 *   AC1 — A territory with rights + poaching submissions shows a feeder
 *          count that includes both (rights + poaching combined).
 *   AC2 — A territory with only poaching shows a non-zero feeder count.
 *   AC3 — Rote-feed-poaching (rote project slot + poaching territory grid)
 *          contributes a second feed count for that territory (capped at 2).
 *   AC4 — 'none' and falsy statuses are excluded from counts.
 *   AC5 — The -2 per-overfeed formula is separate from feeder count input
 *          (structural guard: byTerrId is a plain integer count).
 */

import { describe, it, expect } from 'vitest';

// ── Minimal reference data (subset of TERRITORY_SLUG_MAP + MATRIX_TERRS) ──────
// Keep in sync with public/js/admin/downtime-constants.js:119 and
// public/js/admin/downtime-views.js:9936.

const TERRITORY_SLUG_MAP = {
  // Slug keys from responses.feeding_territories JSON
  the_harbour:    'harbour',
  the_dockyards:  'dockyards',
  the_academy:    'academy',
  // Display-name variants used by resolveTerrId
  'The Harbour':   'harbour',
  'The Dockyards': 'dockyards',
  'The Academy':   'academy',
};

const MATRIX_TERRS = [
  { csvKey: 'The Harbour',   label: 'Harbour'   },
  { csvKey: 'The Dockyards', label: 'Dockyards' },
  { csvKey: 'The Academy',   label: 'Academy'   },
];

// ── Mirror of resolveTerrId() ─────────────────────────────────────────────────
// Keep in sync with public/js/admin/downtime-views.js:3710.

function resolveTerrId(raw) {
  if (!raw) return null;
  if (Object.prototype.hasOwnProperty.call(TERRITORY_SLUG_MAP, raw)) return TERRITORY_SLUG_MAP[raw];
  return null;
}

// ── Mirror of _getSubFedTerrs() ───────────────────────────────────────────────
// Keep in sync with public/js/admin/downtime-views.js:10003.

function getSubFedTerrs(sub) {
  const fed = new Map(); // csvKey → feed count (0–2)
  let grid = null;

  const overrideArr = sub.st_review?.territory_overrides?.feeding;
  const hasOverride = Array.isArray(overrideArr) && overrideArr.length > 0;

  if (hasOverride) {
    for (const tid of overrideArr) {
      if (!tid) continue;
      const mt = MATRIX_TERRS.find(m => TERRITORY_SLUG_MAP[m.csvKey] === tid);
      if (mt) fed.set(mt.csvKey, (fed.get(mt.csvKey) || 0) + 1);
    }
  }

  if (!hasOverride) {
    if (sub.responses?.feeding_territories) {
      try { grid = JSON.parse(sub.responses.feeding_territories); } catch { grid = null; }
    }
    if (grid) {
      for (const [slug, status] of Object.entries(grid)) {
        if (!status || status === 'none' || status === 'Not feeding here') continue;
        const tid = Object.prototype.hasOwnProperty.call(TERRITORY_SLUG_MAP, slug)
          ? TERRITORY_SLUG_MAP[slug] : undefined;
        if (tid === undefined) continue;
        const mt = MATRIX_TERRS.find(m => TERRITORY_SLUG_MAP[m.csvKey] === tid);
        if (mt) fed.set(mt.csvKey, (fed.get(mt.csvKey) || 0) + 1);
      }
    }
  }

  // Rote-feed project slot — adds a second feed, capped at 2 per territory.
  const hasRoteSlot = [1, 2, 3, 4].some(n => {
    const a = sub.responses?.[`project_${n}_action`];
    return a === 'rote' || a === 'feed';
  });
  if (hasRoteSlot) {
    const roteOvrArr = sub.st_review?.territory_overrides?.feeding_rote;
    if (Array.isArray(roteOvrArr) && roteOvrArr.length > 0) {
      for (const tid of roteOvrArr) {
        if (!tid) continue;
        const mt = MATRIX_TERRS.find(m => TERRITORY_SLUG_MAP[m.csvKey] === tid);
        if (!mt) continue;
        const current = fed.get(mt.csvKey) || 0;
        if (current < 2) fed.set(mt.csvKey, current + 1);
      }
    } else if (sub.responses?.feeding_territories_rote) {
      let roteGrid = null;
      try { roteGrid = JSON.parse(sub.responses.feeding_territories_rote); } catch { roteGrid = null; }
      if (roteGrid) {
        for (const [slug, status] of Object.entries(roteGrid)) {
          if (!status || status === 'none' || status === 'Not feeding here') continue;
          const tid = Object.prototype.hasOwnProperty.call(TERRITORY_SLUG_MAP, slug)
            ? TERRITORY_SLUG_MAP[slug] : undefined;
          if (tid === undefined) continue;
          const mt = MATRIX_TERRS.find(m => TERRITORY_SLUG_MAP[m.csvKey] === tid);
          if (!mt) continue;
          const current = fed.get(mt.csvKey) || 0;
          if (current < 2) fed.set(mt.csvKey, current + 1);
        }
      }
    }
  }

  return fed;
}

// ── Mirror of _computeMatrixFeederCounts().byTerrId aggregation ───────────────
// Keep in sync with public/js/admin/downtime-views.js:3737.

function computeByTerrId(submissions) {
  const byTerrId = {};
  for (const s of submissions) {
    const fedMap = getSubFedTerrs(s);
    for (const [csvKey, count] of fedMap) {
      const tid = resolveTerrId(csvKey);
      if (tid) byTerrId[tid] = (byTerrId[tid] || 0) + count;
    }
  }
  return byTerrId;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function rightsFeedSub(terrSlug) {
  return {
    responses: {
      feeding_territories: JSON.stringify({ [terrSlug]: 'feeding_rights' }),
    },
  };
}

function poachingSub(terrSlug) {
  return {
    responses: {
      feeding_territories: JSON.stringify({ [terrSlug]: 'poaching' }),
    },
  };
}

function rotePoachSub(mainTerrSlug, roteTerrSlug) {
  return {
    responses: {
      feeding_territories:      JSON.stringify({ [mainTerrSlug]: 'feeding_rights' }),
      feeding_territories_rote: JSON.stringify({ [roteTerrSlug]: 'poaching' }),
      project_1_action:         'rote',
    },
  };
}

// ── AC1: Rights + poaching combined ──────────────────────────────────────────

describe('AC1 — territory with rights and poaching submissions shows combined feeder count', () => {
  it('counts both a rights feeder and a poaching feeder in the same territory', () => {
    const subs = [rightsFeedSub('the_harbour'), poachingSub('the_harbour')];
    const byTerrId = computeByTerrId(subs);
    expect(byTerrId['harbour']).toBe(2);
  });

  it('correctly attributes rights and poaching across different territories', () => {
    const subs = [
      rightsFeedSub('the_harbour'),
      poachingSub('the_dockyards'),
      poachingSub('the_harbour'),
    ];
    const byTerrId = computeByTerrId(subs);
    expect(byTerrId['harbour']).toBe(2);
    expect(byTerrId['dockyards']).toBe(1);
  });
});

// ── AC2: Poaching-only territory shows non-zero count ────────────────────────

describe('AC2 — territory with only poaching submissions shows non-zero feeder count', () => {
  it('single poacher produces count of 1', () => {
    const subs = [poachingSub('the_dockyards')];
    const byTerrId = computeByTerrId(subs);
    expect(byTerrId['dockyards']).toBe(1);
    expect(byTerrId['dockyards']).toBeGreaterThan(0);
  });

  it('two poachers in same territory produce count of 2', () => {
    const subs = [poachingSub('the_harbour'), poachingSub('the_harbour')];
    const byTerrId = computeByTerrId(subs);
    expect(byTerrId['harbour']).toBe(2);
  });

  it('poaching territory that appears nowhere in rights subs still gets counted', () => {
    const subs = [
      rightsFeedSub('the_academy'),  // rights in a different territory
      poachingSub('the_harbour'),    // poaching in harbour
    ];
    const byTerrId = computeByTerrId(subs);
    expect(byTerrId['harbour']).toBe(1);
    expect(byTerrId['academy']).toBe(1);
  });
});

// ── AC3: Rote-feed-poaching adds a second count ───────────────────────────────

describe('AC3 — rote-feed-poaching contributes a second feed count for that territory', () => {
  it('rote slot with rote territory adds a second count to the same territory', () => {
    const subs = [rotePoachSub('the_harbour', 'the_harbour')];
    const byTerrId = computeByTerrId(subs);
    expect(byTerrId['harbour']).toBe(2);
  });

  it('rote slot targeting a different territory adds to that territory independently', () => {
    const subs = [rotePoachSub('the_harbour', 'the_dockyards')];
    const byTerrId = computeByTerrId(subs);
    expect(byTerrId['harbour']).toBe(1);
    expect(byTerrId['dockyards']).toBe(1);
  });

  it('rote count is capped at 2 per character per territory even with two rote slots', () => {
    // Two separate subs for the same character would not occur; this tests the cap
    // on a single sub with rote grid selecting a territory already at count 1.
    const sub = {
      responses: {
        feeding_territories:      JSON.stringify({ the_harbour: 'feeding_rights' }),
        feeding_territories_rote: JSON.stringify({ the_harbour: 'poaching' }),
        project_1_action: 'rote',
      },
    };
    const fedMap = getSubFedTerrs(sub);
    expect(fedMap.get('The Harbour')).toBe(2); // capped at 2
  });

  it('no rote slot means rote grid is ignored', () => {
    const sub = {
      responses: {
        feeding_territories:      JSON.stringify({ the_harbour: 'feeding_rights' }),
        feeding_territories_rote: JSON.stringify({ the_harbour: 'poaching' }),
        // no project_${n}_action === 'rote'
      },
    };
    const fedMap = getSubFedTerrs(sub);
    expect(fedMap.get('The Harbour')).toBe(1); // rote grid not applied
  });
});

// ── AC4: 'none' and falsy statuses excluded ───────────────────────────────────

describe('AC4 — none and falsy statuses produce zero feeder count', () => {
  it('"none" status is excluded', () => {
    const sub = {
      responses: {
        feeding_territories: JSON.stringify({ the_harbour: 'none' }),
      },
    };
    const byTerrId = computeByTerrId([sub]);
    expect(byTerrId['harbour']).toBeUndefined();
  });

  it('"Not feeding here" status is excluded', () => {
    const sub = {
      responses: {
        feeding_territories: JSON.stringify({ the_harbour: 'Not feeding here' }),
      },
    };
    const byTerrId = computeByTerrId([sub]);
    expect(byTerrId['harbour']).toBeUndefined();
  });

  it('falsy (empty string) status is excluded', () => {
    const sub = {
      responses: {
        feeding_territories: JSON.stringify({ the_harbour: '' }),
      },
    };
    const byTerrId = computeByTerrId([sub]);
    expect(byTerrId['harbour']).toBeUndefined();
  });

  it('null feeding_territories produces zero counts', () => {
    const sub = { responses: {} };
    const byTerrId = computeByTerrId([sub]);
    expect(Object.keys(byTerrId)).toHaveLength(0);
  });

  it('empty submission does not crash', () => {
    expect(() => computeByTerrId([{}])).not.toThrow();
    expect(computeByTerrId([{}])).toEqual({});
  });
});

// ── AC5: byTerrId values are plain integer counts (formula input guard) ───────

describe('AC5 — byTerrId values are plain integers usable as -2 per-overfeed formula input', () => {
  it('byTerrId values are numbers', () => {
    const subs = [rightsFeedSub('the_harbour'), poachingSub('the_harbour')];
    const byTerrId = computeByTerrId(subs);
    expect(typeof byTerrId['harbour']).toBe('number');
  });

  it('feeder count multiplied by -2 produces the overfeeding penalty', () => {
    const subs = [rightsFeedSub('the_harbour'), poachingSub('the_harbour')];
    const byTerrId = computeByTerrId(subs);
    const penalty = byTerrId['harbour'] * -2;
    expect(penalty).toBe(-4); // 2 feeders × -2 = -4
  });

  it('zero feeders produce zero count (no overfeeding penalty)', () => {
    const byTerrId = computeByTerrId([]);
    expect(byTerrId['harbour'] ?? 0).toBe(0);
  });
});
