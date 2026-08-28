/**
 * TBID.1 — Territory Bids: open-flow board, resolved-collapse, wipe, CSS/token cleanup.
 *
 * Covers AC1-AC13 of specs/stories/tbid-1-territory-bid-open-flow.md.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why the harness looks like this
 * ──────────────────────────────────────────────────────────────────────────
 *
 * `public/js/suite/territory.js` is a browser-only, no-build-step module: it
 * assigns its handlers onto `window` at import time, reads/writes
 * `localStorage`, and rebuilds `#terr-root`'s innerHTML on every change. There
 * is no jsdom in this runner (BL-2/BL-4/BL-5's own suites already record that,
 * and adding one is a dependency this story did not budget for either).
 *
 * So rather than fall back to pure source-text assertions — the pattern that
 * has already rotted three suites in this repo (see CLAUDE.md's known-failures
 * list) — this file installs a two-method `document` stand-in:
 *
 *   - `createElement` returns an object whose `innerHTML` getter escapes its
 *     `textContent`, which is precisely and only what `esc()` uses it for;
 *   - `getElementById` hands back a fake `#terr-root` whose `innerHTML` we can
 *     read, plus fake modal fields for the submit handler.
 *
 * That is enough to drive the REAL functions and assert on the REAL rendered
 * markup and the REAL persisted payload. Only the CSS-file assertions at the
 * bottom are static, because a stylesheet has no behaviour to exercise.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const KEY = 'tm_bids_v2';

const CHAR_NAMES = ['Alice Vunder', 'Brandy LaRoux', 'Eve Lockridge', 'Reed Justice'];

// ═════════════════════════════════════════════════════════════════════════════
//  Harness
// ═════════════════════════════════════════════════════════════════════════════

const escapeText = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

let store;   // localStorage backing map
let root;    // fake #terr-root
let fields;  // fake modal inputs, by id

function installGlobals() {
  store = new Map();
  root = { innerHTML: '' };
  fields = new Map();
  fields.set('modal-err', { textContent: '' });

  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };

  globalThis.document = {
    createElement: () => ({
      _t: '',
      set textContent(v) { this._t = String(v); },
      get textContent() { return this._t; },
      get innerHTML() { return escapeText(this._t); },
    }),
    getElementById: id => (id === 'terr-root' ? root : (fields.get(id) || null)),
  };

  globalThis.window = globalThis;
  globalThis._charNames = CHAR_NAMES.slice();
  globalThis.confirm = vi.fn(() => true);
}

async function boot(saved) {
  vi.resetModules();
  installGlobals();
  if (saved !== undefined) store.set(KEY, JSON.stringify(saved));
  const mod = await import('../../public/js/suite/territory.js');
  mod.mountTerr();
  return mod;
}

/** Let persist()'s 500ms debounce fire so localStorage holds the new payload. */
function flush() {
  vi.advanceTimersByTime(600);
}

function saved() {
  const raw = store.get(KEY);
  return raw == null ? null : JSON.parse(raw);
}

function html() {
  return root.innerHTML;
}

/** Drive the Regent-confirm modal's submit with a chosen name. */
function submitRegent(name) {
  fields.set('modal-regent', { value: name });
  fields.set('modal-err', { textContent: '' });
  window.terrModalSubmit();
}

const territoriesNow = () => (saved() || {}).territories || [];

const PRE_TBID_SAVE = {
  phase: 'final',
  peek: false,
  territories: [
    {
      id: 'academy',
      name: 'The Academy',
      defaultRegent: 'Jack Fallow',
      ambience: 'Curated',
      ambienceMod: 3,
      regent: 'Alice Vunder',
      regentInput: 'Alice Vunder',
      bids: [{ id: '1', claimant: 'Brandy LaRoux', seconder: 'Eve Lockridge', backing: [{ id: '2', player: 'Eve Lockridge', amount: 4 }], rulerAdjust: 0 }],
      resolved: false,
      winnerId: null,
    },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ═════════════════════════════════════════════════════════════════════════════
//  AC1, AC2 — the board starts empty, the open control is always there
// ═════════════════════════════════════════════════════════════════════════════

describe('TBID.1 AC2 — state.territories defaults to []', () => {
  it('renders zero territory cards on a fresh tm_bids_v2', async () => {
    await boot();
    expect(html()).not.toMatch(/class="tc[ "]/);
    expect(html()).not.toContain('The Academy');
    expect(html()).not.toContain('The Dockyards');
  });

  it('persists an empty territories array, not the old always-five seed', async () => {
    await boot();
    window.terrTogglePeek();
    flush();
    expect(saved().territories).toEqual([]);
  });

  it('keeps TERRS as the static five-entry catalogue, consumed by the picker', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    for (const n of ['The Academy', 'The Dockyards', 'The Harbour', 'The North Shore', 'The Second City']) {
      expect(html()).toContain(n);
    }
  });

  it('shows an empty-board hint instead of a bare grid', async () => {
    await boot();
    expect(html()).toMatch(/terr-empty/);
  });
});

describe('TBID.1 AC1 — the Open Territory Bid control is unconditional', () => {
  it('is in the toolbar when the board is empty', async () => {
    await boot();
    expect(html()).toContain('Open Territory Bid');
    expect(html()).toContain('terrOpenTerritoryPicker()');
  });

  it('is still in the toolbar once a territory is on the board', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    submitRegent('Reed Justice');
    flush();
    expect(territoriesNow()).toHaveLength(1);
    expect(html()).toContain('terrOpenTerritoryPicker()');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  AC5, AC6 — schemaVersion, and the grandfather path
// ═════════════════════════════════════════════════════════════════════════════

describe('TBID.1 AC5 — a pre-existing populated save is not wiped by this deploy', () => {
  it('keeps an unversioned populated board exactly as saved', async () => {
    await boot(PRE_TBID_SAVE);
    expect(html()).toContain('The Academy');
    expect(html()).toContain('Brandy LaRoux');
  });

  it('stamps schemaVersion 1 into it on the next persist', async () => {
    await boot(PRE_TBID_SAVE);
    window.terrTogglePeek();
    flush();
    expect(saved().schemaVersion).toBe(1);
    expect(saved().territories).toHaveLength(1);
    expect(saved().territories[0].bids).toHaveLength(1);
  });

  it('preserves the saved phase across the migration', async () => {
    await boot(PRE_TBID_SAVE);
    window.terrTogglePeek();
    flush();
    expect(saved().phase).toBe('final');
  });

  it('does NOT grandfather an unversioned save whose board is empty', async () => {
    await boot({ phase: 'open', peek: false, territories: [] });
    expect(html()).toMatch(/terr-empty/);
    window.terrTogglePeek();
    flush();
    expect(saved().territories).toEqual([]);
  });

  it('round-trips an already-versioned save without dropping its territories', async () => {
    await boot({ schemaVersion: 1, ...PRE_TBID_SAVE });
    expect(html()).toContain('The Academy');
    window.terrTogglePeek();
    flush();
    expect(saved().territories).toHaveLength(1);
  });
});

describe('TBID.1 AC6 — persist() always writes schemaVersion', () => {
  it('writes it alongside phase/peek/territories', async () => {
    await boot();
    window.terrTogglePeek();
    flush();
    const payload = saved();
    expect(payload.schemaVersion).toBe(1);
    expect(payload).toHaveProperty('phase');
    expect(payload).toHaveProperty('peek');
    expect(payload).toHaveProperty('territories');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  AC3, AC4 — the two-step picker
// ═════════════════════════════════════════════════════════════════════════════

describe('TBID.1 AC3 — picker step 1 lists all five, disabling the ones in contest', () => {
  it('renders five selectable tiles when the board is empty', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    const tiles = html().match(/class="pick-tile[^"]*"/g) || [];
    expect(tiles).toHaveLength(5);
    expect(html()).not.toContain('In Contest');
    expect(html()).not.toContain('disabled');
  });

  it('shows an already-open territory disabled and labelled In Contest, not hidden', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    submitRegent('Reed Justice');
    flush();

    window.terrOpenTerritoryPicker();
    const markup = html();
    expect(markup).toContain('The Harbour');           // present, not removed
    expect(markup).toContain('In Contest');
    expect(markup).toMatch(/pick-taken/);
    expect(markup).toMatch(/disabled/);
    expect((markup.match(/class="pick-tile[^"]*"/g) || [])).toHaveLength(5);
  });

  it('disables a RESOLVED territory in the picker too', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('academy');
    submitRegent('Alice Vunder');
    window.terrAddBid('academy', 'Brandy LaRoux', 'Eve Lockridge');
    window.terrResolve('academy');
    flush();
    expect(territoriesNow()[0].resolved).toBe(true);

    window.terrOpenTerritoryPicker();
    expect(html()).toContain('In Contest');
    expect(html()).toMatch(/pick-taken/);
  });

  it('refuses to advance on a territory already on the board', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    submitRegent('Reed Justice');
    flush();

    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    expect(html()).not.toContain('modal-regent');   // still on step 1
  });
});

describe('TBID.1 AC4 — picker step 2 confirms the Regent, and only that adds the card', () => {
  it('advances to a Regent field pre-selected to the defaultRegent', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    const markup = html();
    expect(markup).toContain('modal-regent');
    expect(markup).toContain('The Harbour');
    expect(markup).toMatch(/<option value="Reed Justice" selected>/);
  });

  it('pre-fills a defaultRegent that is not in the character list', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('academy');   // Jack Fallow is not in CHAR_NAMES
    expect(html()).toMatch(/<option value="Jack Fallow" selected>/);
  });

  it('picking a territory alone does NOT add it to the board', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    flush();
    expect(territoriesNow()).toEqual([]);
  });

  it('confirming pushes a correctly-shaped entry, closes the modal and persists', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    submitRegent('Alice Vunder');
    flush();

    const ts = territoriesNow();
    expect(ts).toHaveLength(1);
    expect(ts[0]).toMatchObject({
      id: 'harbour',
      name: 'The Harbour',
      defaultRegent: 'Reed Justice',
      ambience: 'Untended',
      ambienceMod: -2,
      regent: 'Alice Vunder',
      regentInput: 'Alice Vunder',
      bids: [],
      resolved: false,
      winnerId: null,
    });
    expect(html()).not.toContain('class="overlay"');
    expect(html()).toContain('The Harbour');
  });

  it('rejects an empty Regent rather than creating a regent-less card', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    submitRegent('');
    flush();
    expect(territoriesNow()).toEqual([]);
    expect(fields.get('modal-err').textContent).toMatch(/regent/i);
  });

  it('the confirmed Regent still drives terrAddBid\'s automatic +3 defence bid', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    submitRegent('Alice Vunder');
    window.terrAddBid('harbour', 'Brandy LaRoux', 'Eve Lockridge');
    flush();
    const bids = territoriesNow()[0].bids;
    expect(bids).toHaveLength(2);
    expect(bids[1].claimant).toBe('Alice Vunder');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  AC7, AC8 — resolved collapse and Reopen
// ═════════════════════════════════════════════════════════════════════════════

async function bootWithResolved() {
  await boot();
  window.terrOpenTerritoryPicker();
  window.terrPickTerritory('harbour');
  submitRegent('Alice Vunder');
  window.terrAddBid('harbour', 'Brandy LaRoux', 'Eve Lockridge');
  flush();
  const bidId = territoriesNow()[0].bids[0].id;
  window.terrAddBack('harbour', bidId, 'Eve Lockridge', 7);
  window.terrResolve('harbour');
  flush();
  return territoriesNow()[0];
}

describe('TBID.1 AC7 — a resolved territory stays on the board as a compact row', () => {
  it('stays in state.territories', async () => {
    const t = await bootWithResolved();
    expect(t.resolved).toBe(true);
    expect(territoriesNow()).toHaveLength(1);
  });

  it('renders the collapsed row, not the full bid card', async () => {
    await bootWithResolved();
    const markup = html();
    expect(markup).toMatch(/trr/);
    expect(markup).toContain('Resolved');
    expect(markup).toContain('The Harbour');
    expect(markup).toContain('Reopen');
  });

  it('does not show bid amounts or the challenger list', async () => {
    await bootWithResolved();
    const markup = html();
    expect(markup).not.toContain('back-list');
    expect(markup).not.toContain('bid-score');
    expect(markup).not.toContain('bid-claimant');
    expect(markup).not.toContain('bid-seconder');
    // Eve Lockridge is the seconder and the backer, never the winner: if she
    // shows up, the challenger/backing detail leaked into the collapsed row.
    expect(markup).not.toContain('Eve Lockridge');
    expect(markup).not.toContain('+7');
  });

  it('names the winning Regent on the row', async () => {
    const t = await bootWithResolved();
    const winner = t.bids.find(b => b.id === t.winnerId);
    expect(html()).toContain(winner.claimant);
  });
});

describe('TBID.1 AC8 — Reopen re-enters the Regent-confirm step', () => {
  it('opens the Regent-confirm modal pre-filled with the previous winner', async () => {
    const t = await bootWithResolved();
    const winner = t.bids.find(b => b.id === t.winnerId);
    window.terrReopen('harbour');
    expect(html()).toContain('modal-regent');
    expect(html()).toMatch(new RegExp(`<option value="${winner.claimant}" selected>`));
  });

  it('does not change any state until the confirm is submitted', async () => {
    await bootWithResolved();
    window.terrReopen('harbour');
    flush();
    expect(territoriesNow()[0].resolved).toBe(true);
  });

  it('resets bids/resolved/winnerId on the SAME entry, in place', async () => {
    await bootWithResolved();
    const before = territoriesNow();
    window.terrReopen('harbour');
    submitRegent('Eve Lockridge');
    flush();

    const after = territoriesNow();
    expect(after).toHaveLength(before.length);
    expect(after[0].id).toBe('harbour');
    expect(after[0].resolved).toBe(false);
    expect(after[0].winnerId).toBeNull();
    expect(after[0].bids).toEqual([]);
    expect(after[0].regent).toBe('Eve Lockridge');
    expect(after[0].regentInput).toBe('Eve Lockridge');
  });

  it('keeps position when other territories sit around it', async () => {
    await boot();
    for (const [tid, regent] of [['academy', 'Alice Vunder'], ['harbour', 'Reed Justice'], ['northshore', 'Eve Lockridge']]) {
      window.terrOpenTerritoryPicker();
      window.terrPickTerritory(tid);
      submitRegent(regent);
    }
    window.terrAddBid('harbour', 'Brandy LaRoux', 'Eve Lockridge');
    window.terrResolve('harbour');
    flush();
    expect(territoriesNow().map(t => t.id)).toEqual(['academy', 'harbour', 'northshore']);

    window.terrReopen('harbour');
    submitRegent('Brandy LaRoux');
    flush();
    expect(territoriesNow().map(t => t.id)).toEqual(['academy', 'harbour', 'northshore']);
    expect(territoriesNow()[1].resolved).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  AC9 — Wipe Board
// ═════════════════════════════════════════════════════════════════════════════

describe('TBID.1 AC9 — Wipe Board replaces Reset All, gated behind a confirm', () => {
  it('is not rendered while the board is empty', async () => {
    await boot();
    expect(html()).not.toContain('Wipe Board');
    expect(html()).not.toContain('terrWipeBoard()');
  });

  it('appears once the board has something on it', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    submitRegent('Reed Justice');
    flush();
    expect(html()).toContain('Wipe Board');
    expect(html()).toContain('terrWipeBoard()');
  });

  it('the old Reset All label and handler are gone', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    submitRegent('Reed Justice');
    flush();
    expect(html()).not.toContain('Reset All');
    expect(window.terrResetAll).toBeUndefined();
  });

  it('prompts with the static wording, no dynamic count', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    submitRegent('Reed Justice');
    flush();
    window.terrWipeBoard();
    expect(globalThis.confirm).toHaveBeenCalledWith('Wipe the entire board? This removes all territories and bids.');
  });

  it('changes nothing on cancel', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    submitRegent('Reed Justice');
    flush();
    globalThis.confirm.mockReturnValueOnce(false);
    window.terrWipeBoard();
    flush();
    expect(territoriesNow()).toHaveLength(1);
    expect(html()).toContain('The Harbour');
  });

  it('clears the whole board on confirm, and resets phase/peek', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    submitRegent('Reed Justice');
    window.terrAdvance();
    window.terrTogglePeek();
    flush();
    expect(saved().phase).toBe('final');
    expect(saved().peek).toBe(true);

    window.terrWipeBoard();
    flush();
    expect(saved().territories).toEqual([]);
    expect(saved().phase).toBe('open');
    expect(saved().peek).toBe(false);
    expect(saved().schemaVersion).toBe(1);
    expect(html()).toMatch(/terr-empty/);
  });

  it('does not carry the old regents back onto a reseeded five-territory board', async () => {
    await boot();
    window.terrOpenTerritoryPicker();
    window.terrPickTerritory('harbour');
    submitRegent('Reed Justice');
    flush();
    window.terrWipeBoard();
    flush();
    expect(territoriesNow()).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  AC10, AC11, AC12 — CSS and token hygiene
// ═════════════════════════════════════════════════════════════════════════════

describe('TBID.1 AC10/AC11 — no inline styles, no phantom token', () => {
  const js = read('public/js/suite/territory.js');
  const css = read('public/css/suite.css');

  it('territory.js has no inline style attribute left anywhere', () => {
    expect(js).not.toMatch(/style\s*=\s*["']/);
  });

  it('territory.js never touches el.style either', () => {
    expect(js).not.toMatch(/\.style\s*[.[=]/);
  });

  it('the phantom --text3 token is gone from the whole repo-facing surface', () => {
    expect(js).not.toContain('--text3');
    expect(css).not.toContain('--text3');
  });

  it('the Reopen button colour now lives in a class, using the real --txt3 token', () => {
    expect(css).toMatch(/#t-territory\s+\.res-bar\s+\.btn-sm\s*\{[^}]*color:\s*var\(--txt3\)[^}]*\}/);
    expect(css).toMatch(/#t-territory\s+\.res-bar\s+\.btn-sm\s*\{[^}]*border-color:\s*var\(--txt3\)[^}]*\}/);
  });

  it('the card-footer flex:1 and the ruler Reset padding moved into scoped rules', () => {
    expect(css).toMatch(/#t-territory\s+\.tc-foot\s+button\s*\{[^}]*flex:\s*1/);
    expect(css).toMatch(/#t-territory\s+\.ruler-row\s+\.btn-sm\s*\{[^}]*padding:\s*3px 8px/);
    expect(css).toMatch(/#t-territory\s+\.ruler-row\s+\.btn-sm\s*\{[^}]*margin-left:\s*4px/);
  });

  it('selStyle is deleted and the modal fields use the shared component classes', () => {
    expect(js).not.toContain('selStyle');
    expect(js).toMatch(/id="modal-cl"[^>]*class="form-select"/);
    expect(js).toMatch(/id="modal-sc"[^>]*class="form-select"/);
    expect(js).toMatch(/id="modal-pl"[^>]*class="form-select"/);
    expect(js).toMatch(/id="modal-regent"[^>]*class="form-select"/);
    expect(js).toMatch(/id="modal-am"[^>]*class="form-input"/);
  });

  it('.form-select/.form-input are still declared in components.css (reused, not forked)', () => {
    const comp = read('public/css/components.css');
    expect(comp).toMatch(/\.form-select\s*\{/);
    expect(comp).toMatch(/\.form-input\s*\{/);
    expect(css).not.toMatch(/^\.form-select\s*\{/m);
  });
});

describe('TBID.1 AC12 — every #t-territory value resolves through a real theme token', () => {
  it('has no bare hex or rgba() in the territory block', () => {
    const block = read('public/css/suite.css').split('\n').filter(l => l.includes('#t-territory')).join('\n');
    expect(block).not.toMatch(/#[0-9A-Fa-f]{3,8}(?![0-9A-Za-z_-])/);
    expect(block).not.toMatch(/rgba?\(/);
  });

  it('uses no token that theme.css does not define — the exact bug AC10 fixes', () => {
    const theme = read('public/css/theme.css');
    const defined = new Set([...theme.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map(m => m[1]));
    const block = read('public/css/suite.css').split('\n').filter(l => l.includes('#t-territory')).join('\n');
    const used = new Set([...block.matchAll(/var\((--[A-Za-z0-9_-]+)/g)].map(m => m[1]));
    const missing = [...used].filter(t => !defined.has(t));
    expect(missing).toEqual([]);
  });

  it('declares the new picker/resolved/empty chrome under scoped #t-territory classes', () => {
    const css = read('public/css/suite.css');
    for (const sel of ['.pick-grid', '.pick-tile', '.pick-taken', '.pick-tag', '.terr-empty', '.trr']) {
      expect(css).toMatch(new RegExp(`#t-territory[^{\\n]*\\${sel}`));
    }
  });
});

describe('TBID.1 AC13 — the DB-backed territory API is untouched', () => {
  it('territory.js makes no network call at all', () => {
    const js = read('public/js/suite/territory.js');
    expect(js).not.toMatch(/\bfetch\s*\(/);
    expect(js).not.toMatch(/apiGet|apiPost|apiPut|apiPatch|apiDelete/);
    expect(js).not.toMatch(/\/api\//);
  });
});
