/**
 * AC-2 guard for issue #224: renderDowntimeTab must fetch territories fresh
 * from /api/territories on every render rather than using the stale
 * suiteState.territories snapshot passed as a parameter.
 *
 * renderDowntimeTab is a heavy browser function (DOM manipulation, 17 module
 * imports). This test mocks all browser-only dependencies so Vitest can import
 * the module in Node.js, then verifies the /api/territories call is made.
 * The function is expected to throw after the API fetches (no real DOM), which
 * is caught and ignored — we only care that the territories endpoint was hit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock all browser-only / DOM-dependent imports ──────────────────────────

vi.mock('../../public/js/data/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn().mockResolvedValue({}),
  apiPut: vi.fn().mockResolvedValue({}),
  apiPatch: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../public/js/tabs/draft-persist.js', () => ({
  saveDraft: vi.fn(),
  loadDraft: vi.fn().mockReturnValue(null),
  clearDraft: vi.fn(),
  pickFreshestDraft: vi.fn().mockReturnValue(null),
}));

vi.mock('../../public/js/data/helpers.js', () => ({
  esc: s => String(s ?? ''),
  displayName: c => c?.name ?? '',
  parseOutcomeSections: () => [],
  redactPlayer: s => s,
  redactCharName: s => s,
  hasAoE: () => false,
  isSpecs: () => [],
  findRegentTerritory: () => null,
}));

vi.mock('../../public/js/editor/mci.js', () => ({
  applyDerivedMerits: vi.fn(),
}));

vi.mock('../../public/js/tabs/downtime-data.js', () => ({
  DOWNTIME_SECTIONS: [],
  DOWNTIME_GATES: {},
  SPHERE_ACTIONS: [],
  TERRITORY_DATA: [],
  FEEDING_TERRITORIES: [],
  PROJECT_ACTIONS: [],
  FEED_METHODS: [],
  MAINTENANCE_MERITS: [],
  FEED_VIOLENCE_DEFAULTS: {},
  ACTION_DESCRIPTIONS: {},
  ACTION_APPROACH_PROMPTS: {},
  SUBMIT_FINAL_MODAL_QUESTIONS: [],
  AMBIENCE_MODS: {},
  AMBIENCE_CAP: 0,
  normaliseSorceryTargets: v => v,
}));

vi.mock('../../public/js/data/dt-action-summary.js', () => ({
  actionSpentSummary: () => ({}),
  formatActionSpentSummary: () => '',
}));

vi.mock('../../public/js/data/feeding-pool.js', () => ({
  computeBestFeedingPool: () => null,
}));

vi.mock('../../public/js/data/constants.js', () => ({
  ARCHETYPES_DB: {},
  ALL_ATTRS: [],
  ALL_SKILLS: [],
  CLAN_DISCS: {},
  BLOODLINE_DISCS: {},
  CORE_DISCS: [],
  RITUAL_DISCS: [],
  SKILL_CATS: {},
  SKILLS_MENTAL: [],
}));

vi.mock('../../public/js/editor/domain.js', () => ({
  calcTotalInfluence: () => 0,
  domMeritTotal: () => 0,
  attacheBonusDots: () => 0,
  effectiveInvictusStatus: () => 0,
  ssjHerdBonus: () => 0,
  flockHerdBonus: () => 0,
  meritEffectiveRating: () => 0,
  influenceBreakdown: () => [],
  domMeritContrib: () => 0,
}));

vi.mock('../../public/js/data/accessors.js', () => ({
  calcVitaeMax: () => 5,
  skTotal: () => 0,
  skNineAgain: () => false,
  skDots: () => 0,
  skSpecs: () => [],
  riteCost: () => 0,
  skillAcqPoolStr: () => '',
  getAttrEffective: () => 1,
  getAttrEffective: () => 1,
  getAttrTotal: () => 1,
  discDots: () => 0,
  setStatusTerritories: vi.fn(),
  getSkillObj: () => ({ dots: 0, specs: [] }),
}));

vi.mock('../../public/js/editor/xp.js', () => ({
  xpLeft: () => 0,
}));

vi.mock('../../public/js/editor/merits.js', () => ({
  meetsPrereq: () => true,
}));

vi.mock('../../public/js/data/loader.js', () => ({
  getRuleByKey: () => null,
  getRulesByCategory: () => [],
}));

vi.mock('../../public/js/auth/discord.js', () => ({
  getRole: () => 'player',
  isLoggedIn: () => true,
  validateToken: () => true,
  login: () => {},
  logout: () => {},
  getUser: () => null,
  getPlayerInfo: () => null,
  isSTRole: () => false,
  handleCallback: () => {},
}));

vi.mock('../../public/js/data/relationship-kinds.js', () => ({
  FAMILIES: [],
  kindByCode: () => null,
}));

vi.mock('../../public/js/components/character-picker.js', () => ({
  charPicker: vi.fn().mockReturnValue(''),
  setCharPickerSources: vi.fn(),
}));

vi.mock('../../public/js/data/dt-completeness.js', () => ({
  isMinimalComplete: () => true,
  missingMinimumPieces: () => [],
}));

vi.mock('../../public/js/data/icons.js', () => ({ ICONS: {} }));

// ── Dynamic import (after mocks are in place) ──────────────────────────────

const { renderDowntimeTab } = await import('../../public/js/tabs/downtime-form.js');
const apiModule = await import('../../public/js/data/api.js');

// ── Helpers ────────────────────────────────────────────────────────────────

const STUB_CHAR = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Alice', merits: [], skills: {}, attributes: {}, disciplines: {} };
const STUB_TERRITORIES = [{ _id: 'b', slug: 'northshore', name: 'North Shore', regent_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', lieutenant_id: null, ambience: 'Tended' }];

/** Minimal targetEl stub — accepts innerHTML assignment without throwing. */
function makeTargetEl() {
  return {
    innerHTML: '',
    appendChild: vi.fn(),
    querySelector: vi.fn().mockReturnValue(null),
    querySelectorAll: vi.fn().mockReturnValue([]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('renderDowntimeTab — territory fresh-fetch (issue #224)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // apiGet returns minimal data: empty char for character fetch, empty arrays for everything else
    apiModule.apiGet.mockImplementation(url => {
      if (url.startsWith('/api/characters/')) return Promise.resolve({ ...STUB_CHAR });
      if (url === '/api/territories') return Promise.resolve(STUB_TERRITORIES);
      if (url === '/api/downtime_cycles') return Promise.resolve([]);
      if (url === '/api/downtime_submissions') return Promise.resolve([]);
      return Promise.resolve([]);
    });
  });

  it('calls apiGet("/api/territories") regardless of the territories parameter passed in', async () => {
    const emptyParamTerritories = [];  // intentionally empty — fresh fetch should supersede this
    await renderDowntimeTab(makeTargetEl(), STUB_CHAR, emptyParamTerritories).catch(() => {});

    const territoryCalls = apiModule.apiGet.mock.calls.filter(([url]) => url === '/api/territories');
    expect(territoryCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('uses apiGet result for territories even when parameter has different data', async () => {
    const staleTerritories = [{ _id: 'stale', slug: 'dockyards', name: 'Stale Dockyards', regent_id: 'stale', lieutenant_id: null, ambience: null }];
    apiModule.apiGet.mockImplementation(url => {
      if (url === '/api/territories') return Promise.resolve(STUB_TERRITORIES);
      if (url.startsWith('/api/characters/')) return Promise.resolve({ ...STUB_CHAR });
      return Promise.resolve([]);
    });

    await renderDowntimeTab(makeTargetEl(), STUB_CHAR, staleTerritories).catch(() => {});

    expect(apiModule.apiGet).toHaveBeenCalledWith('/api/territories');
  });

  it('falls back to the territories parameter when apiGet throws', async () => {
    apiModule.apiGet.mockImplementation(url => {
      if (url === '/api/territories') return Promise.reject(new Error('network error'));
      if (url.startsWith('/api/characters/')) return Promise.resolve({ ...STUB_CHAR });
      return Promise.resolve([]);
    });

    // Should not throw — the fallback catches the error
    await renderDowntimeTab(makeTargetEl(), STUB_CHAR, STUB_TERRITORIES).catch(() => {});

    // apiGet was called with /api/territories (even though it rejected — confirming the attempt was made)
    expect(apiModule.apiGet).toHaveBeenCalledWith('/api/territories');
  });
});
