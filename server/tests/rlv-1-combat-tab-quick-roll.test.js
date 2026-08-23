/**
 * rlv.1 — combat-tab.js's Quick Roll no longer silently no-ops when the new
 * dice roller (`tm-use-new-dice-roller`) is active.
 *
 * Root cause (confirmed live, Phase 0 audit §4c, specs/dice-roller-harmonisation-audit.md):
 * quickRoll() always called `loadPool` from roll.js and always navigated via
 * `goTab('dice')`, which targets `#t-dice` — removed from the DOM at boot
 * whenever the new roller is active (only `#t-roll` exists then), so the tap
 * silently did nothing and the pool it loaded was invisible.
 *
 * combat-tab.js's other imports (accessors.js, equipment-derivation.js,
 * tracker.js, data/helpers.js) are unrelated to quickRoll() itself and mocked
 * outright to keep this test isolated to the function under test — the same
 * approach crd-3b's own test takes with tracker.js/roll-v2.js. `../app.js` is
 * mocked too rather than loaded for real: combat-tab.js importing FROM app.js
 * (which already imports combat-tab.js) is this codebase's first circular
 * module reference, and app.js's own import graph pulls in the entire
 * admin/editor surface — mocking avoids ever evaluating any of it.
 *
 * `suite/data.js` (suiteState) has no imports of its own and is loaded for
 * real; only its plain-object fields are exercised here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadPoolV1 = vi.fn();
const loadPoolV2 = vi.fn();
let mockUseNewRoller = false;

vi.mock('../../public/js/suite/roll.js', () => ({
  loadPool: loadPoolV1,
  doRoll: vi.fn(),
}));
vi.mock('../../public/js/suite/roll-v2.js', () => ({
  loadPool: loadPoolV2,
}));
vi.mock('../../public/js/app.js', () => ({
  get USE_NEW_ROLLER() { return mockUseNewRoller; },
}));
vi.mock('../../public/js/data/accessors.js', () => ({
  getAttrEffective: vi.fn(() => 0),
  calcDefence: vi.fn(() => 0),
  calcHealth: vi.fn(() => 0),
}));
vi.mock('../../public/js/data/equipment-derivation.js', () => ({
  defenceForDisplay: vi.fn(() => 0),
}));
vi.mock('../../public/js/data/helpers.js', () => ({
  esc: s => String(s ?? ''),
}));
vi.mock('../../public/js/game/tracker.js', () => ({
  trackerAdj: vi.fn(),
  trackerRead: vi.fn(() => null),
}));

// combat-tab.js attaches combatQuickRoll (and its siblings) onto `window` at
// module-load time — `window` must exist before this import runs.
globalThis.window = globalThis.window || {};

await import('../../public/js/game/combat-tab.js');
const suiteState = (await import('../../public/js/suite/data.js')).default;

const CHAR = { _id: 'char-1', moniker: 'Test Char' };

beforeEach(() => {
  vi.clearAllMocks();
  mockUseNewRoller = false;
  suiteState.chars = [CHAR];
  suiteState.rollChar = null;
  window.goTab = vi.fn();
});

describe('rlv.1 AC1/AC2 — Quick Roll navigates to the tab that actually exists', () => {
  it('flag OFF (legacy roller): navigates to goTab(\'dice\') — unchanged existing behaviour', () => {
    mockUseNewRoller = false;
    window.combatQuickRoll(String(CHAR._id), 7, 'Brawl');
    expect(window.goTab).toHaveBeenCalledWith('dice');
  });

  it('flag ON (new roller): navigates to goTab(\'roll\'), the tab that actually exists in the DOM', () => {
    mockUseNewRoller = true;
    window.combatQuickRoll(String(CHAR._id), 7, 'Brawl');
    expect(window.goTab).toHaveBeenCalledWith('roll');
  });
});

describe('rlv.1 AC3/AC4 — the pool is loaded into whichever roller is actually active', () => {
  it('flag OFF: loads the pool via roll.js, not roll-v2.js', () => {
    mockUseNewRoller = false;
    window.combatQuickRoll(String(CHAR._id), 7, 'Brawl');
    expect(loadPoolV1).toHaveBeenCalledWith(7, 'Brawl', { total: 7 });
    expect(loadPoolV2).not.toHaveBeenCalled();
  });

  it('flag ON: loads the pool via roll-v2.js, not roll.js — so the visible #t-roll tab shows it', () => {
    mockUseNewRoller = true;
    window.combatQuickRoll(String(CHAR._id), 7, 'Brawl');
    expect(loadPoolV2).toHaveBeenCalledWith(7, 'Brawl', { total: 7 });
    expect(loadPoolV1).not.toHaveBeenCalled();
  });
});

describe('rlv.1 — regression: existing guards untouched', () => {
  it('sets suiteState.rollChar to the resolved character before loading the pool', () => {
    window.combatQuickRoll(String(CHAR._id), 7, 'Brawl');
    expect(suiteState.rollChar).toBe(CHAR);
  });

  it('an unknown character id is a no-op — no navigation, no pool load', () => {
    window.combatQuickRoll('does-not-exist', 7, 'Brawl');
    expect(window.goTab).not.toHaveBeenCalled();
    expect(loadPoolV1).not.toHaveBeenCalled();
    expect(loadPoolV2).not.toHaveBeenCalled();
  });
});
