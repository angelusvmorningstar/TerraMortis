/**
 * cmb.1 - the card-based combatant tracker shell in
 * `public/js/game/combat-tab.js`.
 *
 * Coverage map (story specs/stories/cmb-1-card-tracker-shell.md):
 *   AC1  - every non-retired character can still be parked from setup
 *   AC2  - Roll Initiative is still initBase + 1d10, sorted desc with the
 *          initBase tie-break
 *   AC3  - the collapsed card is Name + tags + Health only, with the rolled
 *          initiative in the rail
 *   AC4  - the expanded card carries Vitae/Willpower tracks (trackerRead-backed),
 *          the existing health box-track, DEF/MOVE chips, the existing
 *          attack-pool buttons and the existing damage controls
 *   AC5  - at most one card is expanded at a time
 *   AC6  - (DOM-shape half) the drag handle is a sibling of the header button,
 *          never its child. The real gesture isolation is measured in
 *          tests/cmb-1-combat-card-touch-targets.spec.js, which has a real
 *          event loop.
 *   AC8  - every pre-existing behaviour still works: park, roll, next turn
 *          (skipping the incapacitated), next round, defence toggle, remove,
 *          end combat, damage/track writes through trackerAdj
 *
 * AC7 (real computed >=44px boxes) cannot be measured here at all - there is no
 * layout engine in this environment - and lives entirely in the Playwright spec
 * named above.
 *
 * TESTING APPROACH - the precedent this repo already set in
 * `crd-3b-resolution-screen.test.js` and `crd-2-pending-queue.test.js`: mock the
 * browser-only imports and drive the real module against a hand-rolled element
 * stub. There is no jsdom in this repo and adding one is a halt condition, so
 * the assertions here are made against the rendered HTML string, which is what
 * this file actually produces.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Character-derived numbers. Fixed per attribute/derivation so the initiative
// arithmetic below is exact rather than approximate.
const ATTRS = { Dexterity: 3, Composure: 2, Strength: 4, Wits: 2, Stamina: 2 };

vi.mock('../../public/js/data/accessors.js', () => ({
  getAttrEffective: vi.fn((c, attr) => (c._attrs || ATTRS)[attr] || 0),
  calcDefence: vi.fn(() => 2),
  calcHealth: vi.fn(() => 7),
  calcVitaeMax: vi.fn(() => 10),
  calcWillpowerMax: vi.fn(() => 5),
  calcSpeed: vi.fn(() => 9),
  // cmb.3a: the Attack modal's pool maths reads the real bonus-inclusive skill
  // accessor. combat-tab.js imports it at module load, so the mock has to
  // provide it or the import itself fails.
  skTotal: vi.fn((c, skill) => (c._skills || {})[skill] || 0),
}));
// cmb.3b: combat-tab.js now also reads the two shared equipment predicates at
// module load, so the mock has to provide them or the import itself fails. Real
// implementations, not stubs - they are pure and tiny, and a stub that always
// said "yes" would let a broken filter pass here silently. The weapon-chip
// behaviour itself is covered by tests/cmb-3b-weapon-integration.spec.js, which
// has a real DOM and a real catalogue cache.
vi.mock('../../public/js/data/equipment-derivation.js', () => ({
  defenceForDisplay: vi.fn(() => 2),
  isEquipmentOnMe: item => !!item && (item.state === 'carried' || item.state === 'worn' || item.state === 'active'),
  isCombatGearWeaponShaped: entry => !!entry &&
    (entry.weapon_type != null || entry.damage_mod != null || entry.damage_type != null),
}));
// cmb.3b: no catalogue is loaded in this environment, so every lookup misses and
// no character resolves a weapon - which is exactly the "nothing equipped" path
// the modal has to stay usable on (AC4). The populated path lives in Playwright.
vi.mock('../../public/js/data/equipment-catalogue-cache.js', () => ({
  getCatalogueEntry: vi.fn(() => null),
}));
vi.mock('../../public/js/data/helpers.js', () => ({
  esc: s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
}));

// tracker_state stand-in. The card must read through trackerRead and write
// through trackerAdj - never a second, parallel mechanism - so both are spies
// over one mutable store.
const TRACKER = {};
const trackerAdj = vi.fn(async (charId, field, delta) => {
  const cs = TRACKER[charId];
  if (!cs) return;
  cs[field] = Math.max(0, (cs[field] || 0) + delta);
});
const trackerRead = vi.fn(charId => TRACKER[charId] || null);
vi.mock('../../public/js/game/tracker.js', () => ({
  trackerAdj: (...a) => trackerAdj(...a),
  trackerRead: (...a) => trackerRead(...a),
}));

const loadPool = vi.fn();
vi.mock('../../public/js/suite/roll-v2.js', () => ({ loadPool }));

// combat-tab.js attaches its window.combatX functions at module-load time and
// reads sessionStorage / document on every render.
const _session = new Map();
globalThis.window = globalThis.window || {};
globalThis.sessionStorage = {
  getItem: k => (_session.has(k) ? _session.get(k) : null),
  setItem: (k, v) => _session.set(k, String(v)),
  removeItem: k => _session.delete(k),
};
globalThis.document = globalThis.document || { getElementById: () => null };

const combatTab = await import('../../public/js/game/combat-tab.js');
const suiteState = (await import('../../public/js/suite/data.js')).default;

// ── Fixtures ─────────────────────────────────────────────────────────────────

function char(id, name, extra = {}) {
  return { _id: id, name, moniker: name, ...extra };
}

const WAN = char('c-wan', 'Wan');
const REED = char('c-reed', 'Reed');
const GONE = char('c-gone', 'Retired Rita', { retired: true });

/** Element stub - only innerHTML is exercised by combat-tab.js's render path. */
function makeEl() {
  return {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
    // _wireCardHandles() bails out cleanly when this is absent, which is the
    // documented no-real-DOM path; the Playwright spec covers the wired one.
  };
}

let el;

function trackerSeed(id, over = {}) {
  TRACKER[id] = { vitae: 6, willpower: 4, bashing: 0, lethal: 0, aggravated: 0, ...over };
}

/** Park both fixtures and roll initiative with a fixed die. */
function startScene(die = 5) {
  window.combatAddChar('c-wan');
  window.combatAddChar('c-reed');
  window.combatStart();
  vi.spyOn(Math, 'random').mockReturnValue((die - 1) / 10 + 0.01);
  window.combatRollInit();
  Math.random.mockRestore();
}

beforeEach(() => {
  vi.clearAllMocks();
  _session.clear();
  for (const k of Object.keys(TRACKER)) delete TRACKER[k];
  trackerSeed('c-wan');
  trackerSeed('c-reed');
  suiteState.chars = [WAN, REED, GONE];
  window.goTab = vi.fn();
  el = makeEl();
  combatTab.initCombatTab(el);
});

// ── AC1 ──────────────────────────────────────────────────────────────────────

describe('cmb.1 AC1 - the setup screen still parks every non-retired character', () => {
  it('renders one pick button per active character and none for a retired one', () => {
    expect(el.innerHTML).toContain("combatAddChar('c-wan')");
    expect(el.innerHTML).toContain("combatAddChar('c-reed')");
    expect(el.innerHTML).not.toContain("c-gone");
    expect(el.innerHTML).toContain("cbt-char-btn");
  });

  it('parking a character that is not on the roster is a no-op', () => {
    window.combatAddChar('not-a-character');
    window.combatStart();
    expect(el.innerHTML).not.toContain("not-a-character");
  });

  it('parking the same character twice does not duplicate it', () => {
    window.combatAddChar('c-wan');
    window.combatAddChar('c-wan');
    window.combatStart();
    expect(el.innerHTML.match(/combatRemove\(.c-wan.\)/g)).toHaveLength(1);
  });
});

// ── AC2 ──────────────────────────────────────────────────────────────────────

describe('cmb.1 AC2 - initiative is still initBase + 1d10, sorted desc', () => {
  it('rolls Dexterity + Composure + 1d10 for every combatant', () => {
    // Dexterity 3 + Composure 2 = 5, plus a forced 7.
    startScene(7);
    expect(el.innerHTML).toContain('<span class="cbt-init-slot">12</span>');
    expect(el.innerHTML.match(/cbt-init-slot">12</g)).toHaveLength(2);
  });

  it('sorts descending on the rolled total, breaking ties on initBase', () => {
    // Reed has the higher base, so on an identical die he must sort first.
    const fastReed = { ...REED, _attrs: { ...ATTRS, Dexterity: 5 } };
    suiteState.chars = [WAN, fastReed];
    el = makeEl();
    combatTab.initCombatTab(el);
    window.combatAddChar('c-wan');
    window.combatAddChar('c-reed');
    window.combatStart();
    // Two rolls, both forced to 1, so only initBase can decide the order.
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    window.combatRollInit();
    Math.random.mockRestore();
    const order = [...el.innerHTML.matchAll(/data-cbt-card="([^"]+)"/g)].map(m => m[1]);
    expect(order).toEqual(['c-reed', 'c-wan']);
  });
});

// ── AC3 ──────────────────────────────────────────────────────────────────────

describe('cmb.1 AC3 - the collapsed card is Name, tags and Health only', () => {
  beforeEach(() => startScene());

  it('renders a card per combatant, collapsed, with the initiative in the rail', () => {
    expect(el.innerHTML).toContain('class="cbt-card"');
    expect(el.innerHTML).toContain("cbt-card-rail");
    expect(el.innerHTML).toContain("cbt-init-slot");
    expect(el.innerHTML.match(/aria-expanded="false"/g)).toHaveLength(2);
  });

  it('shows the name and the used/max health, and nothing from the expanded body', () => {
    trackerSeed('c-wan', { bashing: 2, lethal: 1 });
    window.combatNextTurn();   // any re-render
    expect(el.innerHTML).toContain("Wan");
    expect(el.innerHTML).toContain('<span class="cbt-mini-hp-lbl">H</span>3/7');
    expect(el.innerHTML).not.toContain("cbt-card-exp");
    expect(el.innerHTML).not.toContain("cbt-track-btn");
    expect(el.innerHTML).not.toContain("cbt-dmg-btn");
    expect(el.innerHTML).not.toContain("cbt-atk-open-btn");
  });

  it('keeps the Incapacitated tag visible while collapsed', () => {
    trackerSeed('c-reed', { bashing: 7 });
    window.combatNextRound();
    expect(el.innerHTML).toContain('<span class="cbt-incap-lbl">Incapacitated</span>');
    // Still collapsed - the tag is identity/status, not detail.
    expect(el.innerHTML).not.toContain("cbt-card-exp");
  });

  it('escapes a character name rather than interpolating it raw', () => {
    suiteState.chars = [char('c-x', '<script>Bad</script>')];
    el = makeEl();
    combatTab.initCombatTab(el);
    trackerSeed('c-x');
    window.combatAddChar('c-x');
    window.combatStart();
    window.combatRollInit();
    expect(el.innerHTML).toContain("&lt;script&gt;");
    expect(el.innerHTML).not.toContain("<script>Bad");
  });
});

// ── AC4 ──────────────────────────────────────────────────────────────────────

describe('cmb.1 AC4 - tapping the header expands the full detail', () => {
  beforeEach(() => {
    startScene();
    trackerSeed('c-wan', { vitae: 6, willpower: 4, bashing: 1, lethal: 1, aggravated: 1 });
    window.combatToggleExpand('c-wan');
  });

  it('marks the tapped card expanded and renders its expanded body', () => {
    expect(el.innerHTML).toContain("cbt-card-exp");
    expect(el.innerHTML.match(/aria-expanded="true"/g)).toHaveLength(1);
  });

  it('renders the Vitae and Willpower tracks from trackerRead, with adjust buttons', () => {
    expect(el.innerHTML).toContain(">Vitae<");
    expect(el.innerHTML).toContain(">6/10<");
    expect(el.innerHTML).toContain(">Willpower<");
    expect(el.innerHTML).toContain(">4/5<");
    expect(el.innerHTML).toContain(`combatTrack('c-wan','vitae',1)`);
    expect(el.innerHTML).toContain(`combatTrack('c-wan','vitae',-1)`);
    expect(el.innerHTML).toContain(`combatTrack('c-wan','willpower',1)`);
    expect(el.innerHTML).toContain(`combatTrack('c-wan','willpower',-1)`);
  });

  it('renders Health as the existing colour-coded box-track', () => {
    // 1 agg + 1 lethal + 1 bashing against a health of 7.
    expect(el.innerHTML).toContain("cbt-hp-boxes");
    expect(el.innerHTML.match(/class="cbt-box cbt-agg"/g)).toHaveLength(1);
    expect(el.innerHTML.match(/class="cbt-box cbt-let"/g)).toHaveLength(1);
    expect(el.innerHTML.match(/class="cbt-box cbt-bash"/g)).toHaveLength(1);
    expect(el.innerHTML.match(/class="cbt-box"/g)).toHaveLength(4);
  });

  it('renders Defence and Movement as stat chips from the live accessors', () => {
    expect(el.innerHTML).toContain("DEF <b>2</b>");
    expect(el.innerHTML).toContain("MOVE <b>9</b>");
  });

  // cmb.3a retired the preset pool buttons this originally asserted on. The
  // card's attack affordance is now the single Attack button that opens the
  // modal; the pools themselves are covered by cmb-3a-attack-modal.spec.js.
  it('renders the Attack button that opens the attack modal (cmb.3a)', () => {
    expect(el.innerHTML).toContain(`combatAttack('c-wan')`);
    expect(el.innerHTML).toContain("cbt-atk-open-btn");
    expect(el.innerHTML).toContain(">Attack<");
  });

  it('keeps the existing damage controls wired to combatDmg', () => {
    expect(el.innerHTML).toContain("combatDmg('c-wan','bashing',1)");
    expect(el.innerHTML).toContain("combatDmg('c-wan','lethal',1)");
    expect(el.innerHTML).toContain("combatDmg('c-wan','aggravated',1)");
    expect(el.innerHTML).toContain("combatDmg('c-wan','bashing',-1)");
  });

  it('tapping the same header again collapses it', () => {
    window.combatToggleExpand('c-wan');
    expect(el.innerHTML).not.toContain("cbt-card-exp");
    expect(el.innerHTML.match(/aria-expanded="true"/g)).toBeNull();
  });

  it('a Vitae adjustment writes through trackerAdj, not a parallel mechanism', async () => {
    await window.combatTrack('c-wan', 'vitae', -1);
    expect(trackerAdj).toHaveBeenCalledWith('c-wan', 'vitae', -1);
    expect(TRACKER['c-wan'].vitae).toBe(5);
  });

  it('a Willpower adjustment writes through the same call', async () => {
    await window.combatTrack('c-wan', 'willpower', 1);
    expect(trackerAdj).toHaveBeenCalledWith('c-wan', 'willpower', 1);
  });
});

// ── AC5 ──────────────────────────────────────────────────────────────────────

describe('cmb.1 AC5 - at most one card is expanded at a time', () => {
  it('expanding B collapses A', () => {
    startScene();
    window.combatToggleExpand('c-wan');
    expect(el.innerHTML.match(/aria-expanded="true"/g)).toHaveLength(1);
    window.combatToggleExpand('c-reed');
    const open = [...el.innerHTML.matchAll(/data-cbt-toggle="([^"]+)"[^>]*aria-expanded="true"/g)].map(m => m[1]);
    expect(open).toEqual(['c-reed']);
    expect(el.innerHTML.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(el.innerHTML.match(/cbt-card-exp/g)).toHaveLength(1);
  });

  it('the expanded state survives a re-render (Next Turn) rather than resetting', () => {
    startScene();
    window.combatToggleExpand('c-reed');
    window.combatNextTurn();
    const open = [...el.innerHTML.matchAll(/data-cbt-toggle="([^"]+)"[^>]*aria-expanded="true"/g)].map(m => m[1]);
    expect(open).toEqual(['c-reed']);
  });

  it('toggling a combatant that is not in the scene does nothing', () => {
    startScene();
    window.combatToggleExpand('c-nobody');
    expect(el.innerHTML.match(/aria-expanded="true"/g)).toBeNull();
  });
});

// ── AC6 (DOM-shape half) ─────────────────────────────────────────────────────

describe('cmb.1 AC6 - the drag handle is structurally outside the header button', () => {
  it('renders the grip as a sibling of the header, never nested inside it', () => {
    startScene();
    const html = el.innerHTML;
    const grip = html.indexOf('data-cbt-grip');
    const hdOpen = html.indexOf('<button class="cbt-card-hd"');
    const hdClose = html.indexOf('</button>', hdOpen);
    expect(grip).toBeGreaterThan(-1);
    expect(hdOpen).toBeGreaterThan(-1);
    // The grip must not sit between the header button's own tags.
    expect(grip < hdOpen || grip > hdClose).toBe(true);
  });

  it('exposes the handle gesture state, which starts clean', () => {
    startScene();
    expect(window.combatDragState()).toEqual({ active: false, charId: null });
  });
});

// ── AC8 ──────────────────────────────────────────────────────────────────────

describe('cmb.1 AC8 - every pre-existing behaviour survives the re-skin', () => {
  it('Next Turn advances the active card', () => {
    startScene();
    expect(el.innerHTML.indexOf('cbt-card cbt-active')).toBeGreaterThan(-1);
    const firstActive = /data-cbt-card="([^"]+)"/.exec(
      el.innerHTML.slice(el.innerHTML.indexOf('cbt-card cbt-active'))
    )[1];
    window.combatNextTurn();
    const nextActive = /data-cbt-card="([^"]+)"/.exec(
      el.innerHTML.slice(el.innerHTML.indexOf('cbt-card cbt-active'))
    )[1];
    expect(nextActive).not.toBe(firstActive);
  });

  it('Next Turn skips an incapacitated combatant', () => {
    startScene();
    // Put everyone but Wan down; the active card can then only ever be Wan.
    trackerSeed('c-reed', { bashing: 7 });
    window.combatNextTurn();
    const active = /data-cbt-card="([^"]+)"/.exec(
      el.innerHTML.slice(el.innerHTML.indexOf('cbt-card cbt-active'))
    )[1];
    expect(active).toBe('c-wan');
  });

  it('Next Round increments the round and clears every defence-used flag', () => {
    startScene();
    window.combatToggleDef('c-wan');
    window.combatToggleExpand('c-wan');
    expect(el.innerHTML).toContain("cbt-chip cbt-chip-used");
    window.combatNextRound();
    expect(el.innerHTML).toContain("Round 2");
    window.combatToggleExpand('c-wan');
    expect(el.innerHTML).not.toContain("cbt-chip cbt-chip-used");
  });

  it('the defence toggle still flips defence-used on the expanded card', () => {
    startScene();
    window.combatToggleExpand('c-wan');
    expect(el.innerHTML).toContain("DEF <b>2</b>");
    expect(el.innerHTML).not.toContain("cbt-chip cbt-chip-used");
    window.combatToggleDef('c-wan');
    expect(el.innerHTML).toContain("cbt-chip cbt-chip-used");
  });

  it('a damage button still writes through trackerAdj', async () => {
    startScene();
    await window.combatDmg('c-wan', 'lethal', 1);
    expect(trackerAdj).toHaveBeenCalledWith('c-wan', 'lethal', 1);
  });

  it('removing a combatant drops its card', () => {
    startScene();
    window.combatRemove('c-reed');
    expect(el.innerHTML).not.toContain('data-cbt-card="c-reed"');
    expect(el.innerHTML).toContain('data-cbt-card="c-wan"');
  });

  it('End Combat clears the scene and returns to setup', () => {
    startScene();
    window.combatEnd();
    expect(el.innerHTML).toContain("cbt-setup");
    expect(el.innerHTML).not.toContain("cbt-card-rail");
    expect(_session.get('tm_combat_scene')).toBeUndefined();
  });

  it('the scene, including which card is open, persists to sessionStorage', () => {
    startScene();
    window.combatToggleExpand('c-reed');
    const saved = JSON.parse(_session.get('tm_combat_scene'));
    expect(saved.combatants.find(cb => cb.charId === 'c-reed').expanded).toBe(true);
    expect(saved.combatants.find(cb => cb.charId === 'c-wan').expanded).toBe(false);
  });

  /* cmb.1's Task 8 guard asserted `window.combatQuickRoll` survived its
     re-skin. cmb.3a deliberately retires it, so the guard is re-pointed at the
     behaviour it was actually protecting: the hand-off to the Roll tab is still
     loadPool(pool, label, { total: pool }) followed by goTab('roll'), with the
     roller character set first. Same contract, new front door. */
  it('the roll hand-off is unchanged - loadPool + goTab(\'roll\') (was Task 8\'s quick-roll guard)', () => {
    startScene();
    window.combatAttack('c-wan');
    window.combatAttackType('unarmed');
    expect(window.combatAttackRoll()).toBe(true);
    expect(loadPool).toHaveBeenCalledWith(expect.any(Number), 'Unarmed Combat', expect.any(Object));
    expect(window.goTab).toHaveBeenCalledWith('roll');
    expect(suiteState.rollChar).toBe(WAN);
    // The retired preset-pool entry point is genuinely gone, not renamed.
    expect(window.combatQuickRoll).toBeUndefined();
  });
});
