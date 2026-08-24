/**
 * rlv.7 (#1039 item 2) — persistent per-power modifier chips.
 *
 * Unit tests for public/js/game/power-mod-chips.js's pure, browser-global-
 * free functions: clampChipValue (pool-cap enforcement, AC9) and the
 * localStorage-backed add/toggle/remove/load cycle (AC4-AC8). This module
 * only touches `localStorage` and `crypto.randomUUID`, both real Node 20+
 * globals — no location/document stub harness needed (contrast
 * gdx-7-apply-costs-on-roll.test.js, which imports roll-v2.js directly and
 * therefore needs one).
 *
 * A fresh in-memory localStorage fake is installed per test (afterEach
 * clears it) so tests never share state across the file, matching the
 * existing pattern used elsewhere for testing localStorage-backed modules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const hadLocalStorage = 'localStorage' in globalThis;
let store;

beforeEach(() => {
  store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
});

afterEach(() => {
  if (!hadLocalStorage) delete globalThis.localStorage;
});

const {
  clampChipValue, loadChips, addChip, toggleChip, removeChip,
} = await import('../../public/js/game/power-mod-chips.js');

// ── addPowerChip integration (roll-v2.js), same stub harness as
// gdx-7-apply-costs-on-roll.test.js — importing roll-v2.js transitively
// reaches location.hostname (tracker.js, app-settings.js) and touches
// `document` on every updPool() repaint. This block only imports roll-v2.js
// once and shares `state` (suite/data.js's singleton) across its own tests,
// matching gdx-7's own dynamic-import pattern (server/tests/gdx-7-apply-
// costs-on-roll.test.js:334,411).
const hadLocation = 'location' in globalThis;
const hadDocument = 'document' in globalThis;
if (!hadLocation) globalThis.location = { hostname: 'test', pathname: '/' };
function _fakeElement() {
  return {
    _html: '', _text: '', disabled: false, value: '',
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; },
    get textContent() { return this._text; }, set textContent(v) { this._text = v; },
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    querySelectorAll: () => [],
    querySelector: () => null,
  };
}
if (!hadDocument) {
  globalThis.document = {
    getElementById: () => _fakeElement(),
    createElement: () => _fakeElement(),
  };
}

const { addPowerChip } = await import('../../public/js/suite/roll-v2.js');
const { default: state } = await import('../../public/js/suite/data.js');

describe('rlv.7 — addPowerChip (roll-v2.js integration, MOD/persistence must never disagree)', () => {
  beforeEach(() => {
    state.rollChar = { _id: 'char-integration' };
    state.POOL_NAME = 'Nightmare';
    state.MOD = 0;
    state.powerChips = [];
  });

  it('a valid label+value adds a chip and applies its value to MOD', () => {
    addPowerChip('Air of Menace', 2);
    expect(state.MOD).toBe(2);
    expect(state.powerChips).toHaveLength(1);
    expect(state.powerChips[0]).toMatchObject({ label: 'Air of Menace', value: 2, on: true });
  });

  it('regression: an empty-label submission with a valid value must NOT inflate MOD (bug found and fixed during this story\'s own review — addChip() rejects the chip but addPowerChip() used to add MOD unconditionally anyway)', () => {
    addPowerChip('', 3);
    expect(state.MOD).toBe(0);
    expect(state.powerChips).toHaveLength(0);
  });

  it('regression: a whitespace-only label submission must NOT inflate MOD', () => {
    addPowerChip('   ', 3);
    expect(state.MOD).toBe(0);
    expect(state.powerChips).toHaveLength(0);
  });

  it('a 0-value submission is rejected before ever reaching addChip (existing early guard)', () => {
    addPowerChip('Some Label', 0);
    expect(state.MOD).toBe(0);
    expect(state.powerChips).toHaveLength(0);
  });

  it('no-ops entirely when no character is loaded', () => {
    state.rollChar = null;
    addPowerChip('Air of Menace', 2);
    expect(state.MOD).toBe(0);
    expect(state.powerChips).toHaveLength(0);
  });
});

describe('rlv.7 — clampChipValue (AC9, pool-cap enforcement)', () => {
  it('passes through in-range values unchanged', () => {
    expect(clampChipValue(3)).toBe(3);
    expect(clampChipValue(-7)).toBe(-7);
    expect(clampChipValue(0)).toBe(0);
  });
  it('clamps above +10 down to +10', () => {
    expect(clampChipValue(11)).toBe(10);
    expect(clampChipValue(999)).toBe(10);
  });
  it('clamps below -10 up to -10', () => {
    expect(clampChipValue(-11)).toBe(-10);
    expect(clampChipValue(-999)).toBe(-10);
  });
  it('truncates non-integer input toward zero', () => {
    expect(clampChipValue(2.9)).toBe(2);
    expect(clampChipValue(-2.9)).toBe(-2);
  });
  it('treats non-numeric input as 0', () => {
    expect(clampChipValue('abc')).toBe(0);
    expect(clampChipValue(undefined)).toBe(0);
    expect(clampChipValue(null)).toBe(0);
  });
});

describe('rlv.7 — addChip (AC2, AC9)', () => {
  it('rejects an empty label', () => {
    const chips = addChip('char-1', 'Nightmare', '', 2);
    expect(chips).toEqual([]);
  });
  it('rejects a whitespace-only label', () => {
    const chips = addChip('char-1', 'Nightmare', '   ', 2);
    expect(chips).toEqual([]);
  });
  it('rejects a 0 value', () => {
    const chips = addChip('char-1', 'Nightmare', 'Air of Menace', 0);
    expect(chips).toEqual([]);
  });
  it('accepts a valid label+value, added on by default', () => {
    const chips = addChip('char-1', 'Nightmare', 'Air of Menace', 2);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ label: 'Air of Menace', value: 2, on: true });
    expect(typeof chips[0].id).toBe('string');
    expect(chips[0].id.length).toBeGreaterThan(0);
  });
  it('truncates a label over 40 chars rather than rejecting it', () => {
    const longLabel = 'x'.repeat(60);
    const chips = addChip('char-1', 'Nightmare', longLabel, 1);
    expect(chips).toHaveLength(1);
    expect(chips[0].label).toHaveLength(40);
  });
  it('clamps an out-of-range value on entry', () => {
    const chips = addChip('char-1', 'Nightmare', 'Huge Bonus', 99);
    expect(chips[0].value).toBe(10);
  });
});

describe('rlv.7 — toggleChip (AC4)', () => {
  it('flips on for the matching id only, leaves other chips untouched', () => {
    let chips = addChip('char-1', 'Nightmare', 'Chip A', 2);
    chips = addChip('char-1', 'Nightmare', 'Chip B', 3);
    const [a, b] = chips;
    const toggled = toggleChip('char-1', 'Nightmare', a.id);
    const ta = toggled.find(c => c.id === a.id);
    const tb = toggled.find(c => c.id === b.id);
    expect(ta.on).toBe(false);
    expect(tb.on).toBe(true);
  });
  it('a not-found id returns the list unchanged', () => {
    const chips = addChip('char-1', 'Nightmare', 'Chip A', 2);
    const result = toggleChip('char-1', 'Nightmare', 'nonexistent-id');
    expect(result).toEqual(chips);
  });
});

describe('rlv.7 — removeChip (AC5)', () => {
  it('drops the matching chip only', () => {
    let chips = addChip('char-1', 'Nightmare', 'Chip A', 2);
    chips = addChip('char-1', 'Nightmare', 'Chip B', 3);
    const [a, b] = chips;
    const result = removeChip('char-1', 'Nightmare', a.id);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(b.id);
  });
  it('a not-found id returns the list unchanged', () => {
    const chips = addChip('char-1', 'Nightmare', 'Chip A', 2);
    const result = removeChip('char-1', 'Nightmare', 'nonexistent-id');
    expect(result).toEqual(chips);
  });
});

describe('rlv.7 — loadChips (AC6, AC7)', () => {
  it('returns [] for a charId/powerName with nothing stored', () => {
    expect(loadChips('char-1', 'Nightmare')).toEqual([]);
  });
  it('returns [] (not a throw) for a corrupted stored payload', () => {
    localStorage.setItem('tm-rlv7-chips-char-1-Nightmare', 'not json{{{');
    expect(() => loadChips('char-1', 'Nightmare')).not.toThrow();
    expect(loadChips('char-1', 'Nightmare')).toEqual([]);
  });
  it('returns [] for a wrong-version stored payload', () => {
    localStorage.setItem('tm-rlv7-chips-char-1-Nightmare', JSON.stringify({ v: 999, chips: [{ id: 'x', label: 'x', value: 1, on: true }] }));
    expect(loadChips('char-1', 'Nightmare')).toEqual([]);
  });
  it('round-trips a real addChip write correctly', () => {
    addChip('char-1', 'Nightmare', 'Air of Menace', 2);
    const loaded = loadChips('char-1', 'Nightmare');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].label).toBe('Air of Menace');
  });
  it('returns [] for missing charId or powerName', () => {
    expect(loadChips(null, 'Nightmare')).toEqual([]);
    expect(loadChips('char-1', null)).toEqual([]);
  });
});

describe('rlv.7 — composite-key isolation (AC8)', () => {
  it('chips added under (charA, powerX) do not appear under (charA, powerY)', () => {
    addChip('char-A', 'Nightmare', 'Only for Nightmare', 2);
    expect(loadChips('char-A', 'Intimidation')).toEqual([]);
  });
  it('chips added under (charA, powerX) do not appear under (charB, powerX)', () => {
    addChip('char-A', 'Nightmare', 'Only for char A', 2);
    expect(loadChips('char-B', 'Nightmare')).toEqual([]);
  });
  it('each (char, power) pair keeps its own independent chip list', () => {
    addChip('char-A', 'Nightmare', 'A-Nightmare chip', 2);
    addChip('char-A', 'Intimidation', 'A-Intimidation chip', 3);
    addChip('char-B', 'Nightmare', 'B-Nightmare chip', 4);
    expect(loadChips('char-A', 'Nightmare')).toHaveLength(1);
    expect(loadChips('char-A', 'Nightmare')[0].label).toBe('A-Nightmare chip');
    expect(loadChips('char-A', 'Intimidation')).toHaveLength(1);
    expect(loadChips('char-A', 'Intimidation')[0].label).toBe('A-Intimidation chip');
    expect(loadChips('char-B', 'Nightmare')).toHaveLength(1);
    expect(loadChips('char-B', 'Nightmare')[0].label).toBe('B-Nightmare chip');
  });
});
