/**
 * fix.402 — spliceCurrent writes c.current into PUT payload; schema rejects it.
 *
 * Root cause: buildSaveBody in admin.js only strips `_`-prefixed ephemeral
 * fields. c.current (set by spliceCurrent) has no underscore prefix, so it
 * leaks into the PUT request body, and the character schema
 * (additionalProperties: false) returns 400.
 *
 * Fix: add `|| k === 'current'` to the skip condition in buildSaveBody.
 *
 * Verifies:
 *   AC1 — c.current present → stripped from save body
 *   AC2 — c.current absent → body unchanged
 *   AC3 — _st_mod_overlay and _st_mod_base stripped (regression guard)
 *   AC4 — _id and _-prefixed keys stripped (existing behaviour)
 *   AC5 — legacy creation fields stripped
 *   AC6 — only canonical fields survive; current does not
 *   AC7 — spliceCurrent still populates c.current correctly (Story AC3)
 *   AC8 — end-to-end: spliceCurrent writes; buildSaveBody strips
 */

import { describe, it, expect } from 'vitest';

// ── Mirror of spliceCurrent from public/js/data/st-mods.js ──────────────────

function spliceCurrent(c, tracker, { calcWillpowerMax, calcVitaeMax } = {}) {
  c.current = {
    damage_bashing:    tracker?.bashing    ?? 0,
    damage_lethal:     tracker?.lethal     ?? 0,
    damage_aggravated: tracker?.aggravated ?? 0,
    willpower:         tracker?.willpower  ?? (calcWillpowerMax ? calcWillpowerMax(c) : 0),
    vitae:             tracker?.vitae      ?? (calcVitaeMax ? calcVitaeMax(c) : 0),
  };
}

// ── Mirror of buildSaveBody from public/js/admin.js ──────────────────────────

const _LEGACY_FIELDS = new Set([
  'attr_creation', 'skill_creation', 'disc_creation', 'merit_creation',
]);

function buildSaveBody(c) {
  // Strip _id (goes in URL), all ephemeral _-prefixed runtime fields, legacy v2 fields,
  // and c.current (tracker-state namespace written by spliceCurrent — not a schema field).
  const body = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === '_id' || k.startsWith('_') || k === 'current' || _LEGACY_FIELDS.has(k)) continue;
    body[k] = v;
  }
  return body;
}

// ── AC1: c.current stripped when present ─────────────────────────────────────

describe('AC1 — c.current stripped from save body when present', () => {
  it('current key absent from result when spliceCurrent has run', () => {
    const c = {
      _id: 'abc123',
      name: 'Yusuf',
      current: {
        damage_bashing: 0,
        damage_lethal: 1,
        damage_aggravated: 0,
        willpower: 5,
        vitae: 3,
      },
    };
    const body = buildSaveBody(c);
    expect(body.current).toBeUndefined();
  });

  it('other canonical fields survive alongside current being stripped', () => {
    const c = {
      _id: 'abc123',
      name: 'Yusuf',
      clan: 'Mekhet',
      current: { damage_bashing: 2, willpower: 4, vitae: 1 },
    };
    const body = buildSaveBody(c);
    expect(body.name).toBe('Yusuf');
    expect(body.clan).toBe('Mekhet');
    expect(body.current).toBeUndefined();
  });
});

// ── AC2: body unchanged when c.current absent ────────────────────────────────

describe('AC2 — body unchanged when c.current not set', () => {
  it('canonical fields pass through unaltered when no current', () => {
    const c = {
      _id: 'abc123',
      name: 'Gelasio',
      covenant: 'Invictus',
      humanity: 7,
    };
    const body = buildSaveBody(c);
    expect(body.name).toBe('Gelasio');
    expect(body.covenant).toBe('Invictus');
    expect(body.humanity).toBe(7);
    expect(Object.keys(body)).not.toContain('_id');
  });
});

// ── AC3: _st_mod_overlay and _st_mod_base stripped (regression guard) ────────

describe('AC3 — _st_mod_overlay and _st_mod_base continue to be stripped', () => {
  it('_st_mod_overlay stripped', () => {
    const c = {
      _id: 'x',
      name: 'Livia',
      _st_mod_overlay: { 'attrs.intelligence.dots': { base: 3, delta: 1, final: 4 } },
    };
    const body = buildSaveBody(c);
    expect(body._st_mod_overlay).toBeUndefined();
    expect(body.name).toBe('Livia');
  });

  it('_st_mod_base stripped', () => {
    const c = {
      _id: 'x',
      name: 'Livia',
      _st_mod_base: { 'attrs.intelligence.dots': 3 },
    };
    const body = buildSaveBody(c);
    expect(body._st_mod_base).toBeUndefined();
  });
});

// ── AC4: _id and _-prefixed keys stripped ────────────────────────────────────

describe('AC4 — _id and all _-prefixed ephemeral fields stripped', () => {
  it('_id absent from body', () => {
    const c = { _id: 'deadbeef', name: 'Mammon' };
    expect(buildSaveBody(c)._id).toBeUndefined();
  });

  it('arbitrary _-prefixed field stripped', () => {
    const c = { _id: 'x', name: 'Mammon', _someRuntime: true };
    expect(buildSaveBody(c)._someRuntime).toBeUndefined();
  });
});

// ── AC5: legacy creation fields stripped ─────────────────────────────────────

describe('AC5 — legacy creation fields stripped', () => {
  it.each(['attr_creation', 'skill_creation', 'disc_creation', 'merit_creation'])(
    '%s stripped from body',
    (field) => {
      const c = { _id: 'x', name: 'Kirk', [field]: [{ dots: 2, xp: 4 }] };
      expect(buildSaveBody(c)[field]).toBeUndefined();
    },
  );
});

// ── AC7: spliceCurrent still populates c.current correctly (Story AC3) ───────

describe('AC7 — spliceCurrent populates c.current with tracker values', () => {
  it('populates all five fields from a tracker object', () => {
    const c = { _id: 'x', name: 'Yusuf' };
    const tracker = { bashing: 2, lethal: 1, aggravated: 0, willpower: 4, vitae: 3 };
    spliceCurrent(c, tracker);
    expect(c.current).toEqual({
      damage_bashing:    2,
      damage_lethal:     1,
      damage_aggravated: 0,
      willpower:         4,
      vitae:             3,
    });
  });

  it('defaults damage to 0 and uses callbacks for willpower/vitae when tracker is null', () => {
    const c = { _id: 'x', name: 'Livia' };
    spliceCurrent(c, null, {
      calcWillpowerMax: () => 6,
      calcVitaeMax:     () => 5,
    });
    expect(c.current.damage_bashing).toBe(0);
    expect(c.current.damage_lethal).toBe(0);
    expect(c.current.damage_aggravated).toBe(0);
    expect(c.current.willpower).toBe(6);
    expect(c.current.vitae).toBe(5);
  });

  it('overwrites prior c.current on successive calls (idempotent)', () => {
    const c = { _id: 'x', name: 'Mammon' };
    spliceCurrent(c, { bashing: 1, lethal: 0, aggravated: 0, willpower: 5, vitae: 2 });
    spliceCurrent(c, { bashing: 3, lethal: 1, aggravated: 0, willpower: 4, vitae: 1 });
    expect(c.current.damage_bashing).toBe(3);
    expect(c.current.willpower).toBe(4);
  });
});

// ── AC8: end-to-end — spliceCurrent writes; buildSaveBody strips ──────────────

describe('AC8 — end-to-end: spliceCurrent then buildSaveBody produces clean body', () => {
  it('c.current absent from PUT payload after full render → save sequence', () => {
    const c = {
      _id:      'abc123',
      name:     'Gelasio',
      clan:     'Gangrel',
      humanity: 7,
    };
    const tracker = { bashing: 0, lethal: 2, aggravated: 0, willpower: 3, vitae: 4 };
    spliceCurrent(c, tracker);
    expect(c.current).toBeDefined();
    const body = buildSaveBody(c);
    expect(body.current).toBeUndefined();
    expect(body.name).toBe('Gelasio');
    expect(body.clan).toBe('Gangrel');
    expect(body.humanity).toBe(7);
  });
});

// ── AC6: combined — only canonical fields survive ─────────────────────────────

describe('AC6 — only canonical fields survive in combined character', () => {
  it('complete character with all ephemeral fields → only schema fields in body', () => {
    const c = {
      _id:              'abc123',
      name:             'Ludica',
      clan:             'Daeva',
      covenant:         'Lancea et Sanctum',
      humanity:         6,
      current:          { damage_bashing: 1, damage_lethal: 0, damage_aggravated: 0, willpower: 4, vitae: 2 },
      _st_mod_overlay:  { 'attrs.presence.dots': { base: 3, delta: 1, final: 4 } },
      _st_mod_base:     { 'attrs.presence.dots': 3 },
      attr_creation:    [{ dots: 5, xp: 0 }],
      _someRuntimeFlag: true,
    };
    const body = buildSaveBody(c);
    expect(Object.keys(body)).toEqual(['name', 'clan', 'covenant', 'humanity']);
    expect(body.name).toBe('Ludica');
    expect(body.current).toBeUndefined();
    expect(body._id).toBeUndefined();
    expect(body._st_mod_overlay).toBeUndefined();
    expect(body._st_mod_base).toBeUndefined();
    expect(body.attr_creation).toBeUndefined();
    expect(body._someRuntimeFlag).toBeUndefined();
  });
});
