/**
 * rlv.1 — combat-tab.js's Quick Roll must target the roller that actually
 * exists in the DOM.
 *
 * Original root cause (confirmed live, Phase 0 audit §4c,
 * specs/dice-roller-harmonisation-audit.md): quickRoll() always called
 * `loadPool` from the legacy `roll.js` and always navigated via
 * `goTab('dice')`, which targeted `#t-dice` — removed from the DOM at boot
 * whenever the new roller (`roll-v2.js`) was active, so the tap silently did
 * nothing and the pool it loaded was invisible.
 *
 * Rewritten 2026-08-24 against post-rlv.2 `main`: rlv.2 deleted `roll.js`,
 * the `tm-use-new-dice-roller` flag, and `app.js`'s `USE_NEW_ROLLER` export
 * outright — there is only one roller now, so the two-way flag-branching
 * this test originally exercised (PR #1196, closed unmerged as superseded —
 * its own fix predates and is fully subsumed by rlv.2's unconditional
 * `roll-v2.js`/`goTab('roll')` wiring) no longer applies. This keeps the
 * regression coverage for the underlying bug class (pool target and nav
 * target must agree) without the dead flag machinery.
 *
 * combat-tab.js's other imports (accessors.js, equipment-derivation.js,
 * tracker.js, data/helpers.js) are unrelated to quickRoll() itself and
 * mocked outright to keep this test isolated to the function under test —
 * same approach crd-3b's own test takes with tracker.js/roll-v2.js.
 *
 * `suite/data.js` (suiteState) has no imports of its own and is loaded for
 * real; only its plain-object fields are exercised here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadPoolV2 = vi.fn();

vi.mock('../../public/js/suite/roll-v2.js', () => ({
  loadPool: loadPoolV2,
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
  suiteState.chars = [CHAR];
  suiteState.rollChar = null;
  window.goTab = vi.fn();
});

describe('rlv.1 (rewritten post-rlv.2) — Quick Roll always targets roll-v2.js/#t-roll', () => {
  it('navigates to goTab(\'roll\') — the only Roll tab that exists now', () => {
    window.combatQuickRoll(String(CHAR._id), 7, 'Brawl');
    expect(window.goTab).toHaveBeenCalledWith('roll');
  });

  it('loads the pool via roll-v2.js so the visible #t-roll tab shows it', () => {
    window.combatQuickRoll(String(CHAR._id), 7, 'Brawl');
    expect(loadPoolV2).toHaveBeenCalledWith(7, 'Brawl', { total: 7 });
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
    expect(loadPoolV2).not.toHaveBeenCalled();
  });
});
