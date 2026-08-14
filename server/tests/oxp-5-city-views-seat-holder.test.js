/**
 * oxp.5 — direct unit coverage for `city-views.js`'s three pure, DOM-free
 * court-panel functions: `seatHolder`, `courtSlotOptions`, `computeCourtChanges`.
 *
 * Written after an external Codex review (2026-08-13) found a real High-severity
 * bug in this area: `courtSlotOptions` used to build its options from `active`
 * (non-retired) characters alone, so a seat held by a RETIRED character had no
 * matching option, the `<select>` silently fell back to its first entry —
 * "— Vacant —" — and an unrelated Save on that row then read the row as a
 * deliberate change and fired a real handover: it cleared the retired holder's
 * court fields and permanently destroyed the seat's manoeuvre XP.
 *
 * `oxp-5-handover-logic.test.js` only pins the SOURCE of these functions via
 * regex (this project has no jsdom), which cannot exercise their actual logic.
 * These functions are exported and DOM-free specifically so they can be driven
 * directly — see the doc comment on `computeCourtChanges` in city-views.js
 * itself — so this suite does exactly that, with plain fixture objects, no DB
 * and no server. Same browser-shim technique already used to import other
 * `public/js/` modules directly from server/tests (COLLECTIVE-1/2, #1137,
 * N-7a/b/c): stub the handful of globals the import chain touches, dynamic
 * `import()` the real file, done.
 */

// Browser shims — city-views.js pulls api.js's `location` reference and
// mci.js's derived-merit helpers transitively, same pattern as #1137's suite.
globalThis.location = {
  origin: 'http://localhost:8080',
  hostname: 'localhost',
  href: 'http://localhost:8080/admin',
};
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; },
};
globalThis.window = globalThis.window || globalThis;
globalThis.document = globalThis.document || {
  getElementById: () => null,
  createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }),
};

import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

let seatHolder, courtSlotOptions, computeCourtChanges;

beforeAll(async () => {
  const modPath = path.join(REPO_ROOT, 'public', 'js', 'admin', 'city-views.js');
  const mod = await import(pathToFileURL(modPath).href);
  ({ seatHolder, courtSlotOptions, computeCourtChanges } = mod);
});

const SEAT = { _id: 'seat1', office_category: 'Enforcer', holder_id: 'retiredchar', seat_label: null };
const VACANT_SEAT = { _id: 'seat2', office_category: 'Primogen', holder_id: null, seat_label: null };

const RETIRED = { _id: 'retiredchar', name: 'Old Guard', moniker: null, retired: true, court_title: 'Enforcer' };
const ACTIVE_A = { _id: 'activea', name: 'Newcomer A', moniker: null, retired: false };
const ACTIVE_B = { _id: 'activeb', name: 'Newcomer B', moniker: null, retired: false };

const ALL_CHARS = [RETIRED, ACTIVE_A, ACTIVE_B];
const ACTIVE = [ACTIVE_A, ACTIVE_B];

describe('oxp.5 city-views.js: seatHolder', () => {
  it('finds a retired holder — searches ALL characters, not just active ones', () => {
    expect(seatHolder(SEAT, ALL_CHARS)?._id).toBe('retiredchar');
  });

  it('returns null for a vacant seat', () => {
    expect(seatHolder(VACANT_SEAT, ALL_CHARS)).toBeNull();
  });

  it('returns null when holder_id resolves to no character at all', () => {
    const orphanSeat = { ...SEAT, holder_id: 'ghost' };
    expect(seatHolder(orphanSeat, ALL_CHARS)).toBeNull();
  });
});

describe('oxp.5 city-views.js: courtSlotOptions', () => {
  it('a retired holder is offered as an extra option, marked retired, and selected', () => {
    const opts = courtSlotOptions(SEAT, ACTIVE, ALL_CHARS);
    const retiredOpt = opts.find(o => o.value === 'retiredchar');
    expect(retiredOpt, JSON.stringify(opts)).toBeDefined();
    expect(retiredOpt.selected).toBe(true);
    expect(retiredOpt.label).toContain('(retired)');
    // Vacant must NOT be selected once the retired holder is representable.
    expect(opts.find(o => o.value === '').selected).toBe(false);
  });

  it('an unknown holder_id (orphaned seat) is offered as an "Unknown character" option', () => {
    const orphanSeat = { ...SEAT, holder_id: 'ghost' };
    const opts = courtSlotOptions(orphanSeat, ACTIVE, ALL_CHARS);
    const opt = opts.find(o => o.value === 'ghost');
    expect(opt, JSON.stringify(opts)).toBeDefined();
    expect(opt.selected).toBe(true);
    expect(opt.label).toMatch(/Unknown character/);
  });

  it('a retired character never appears as a generally-selectable option on a DIFFERENT seat', () => {
    const opts = courtSlotOptions(VACANT_SEAT, ACTIVE, ALL_CHARS);
    expect(opts.some(o => o.value === 'retiredchar')).toBe(false);
  });

  it('an active holder needs no extra option — the active loop already represents them', () => {
    const seatHeldByActive = { ...SEAT, holder_id: 'activea' };
    const opts = courtSlotOptions(seatHeldByActive, ACTIVE, ALL_CHARS);
    expect(opts.filter(o => o.value === 'activea')).toHaveLength(1);
    expect(opts.find(o => o.value === 'activea').selected).toBe(true);
  });
});

describe('oxp.5 city-views.js: computeCourtChanges — the invariant that carries the High fix', () => {
  it('an UNTOUCHED row for a retired holder never fires a change, even though "active" cannot represent them', () => {
    // This is the exact shape of the original bug: the row's rendered <select>
    // carries the retired holder as its own extra option (courtSlotOptions'
    // job), so a row that was never touched still reports its true
    // selectedHolder and optionValues include it.
    const seats = [SEAT];
    const rows = [{
      seatId: 'seat1',
      selectedHolder: 'retiredchar',
      title: 'Enforcer',
      optionValues: ['', 'activea', 'activeb', 'retiredchar'],
    }];
    const changes = computeCourtChanges(rows, seats, ALL_CHARS);
    expect(changes).toEqual([]);
  });

  it('the SAFETY NET: if a row somehow could not represent its retired holder, an apparent "vacate" is swallowed rather than fired', () => {
    // courtSlotOptions always makes the holder representable, so this cannot
    // happen through the real render path today — this pins the fallback the
    // review specifically asked for, in case that guarantee is ever broken by
    // a future change to courtSlotOptions.
    const seats = [SEAT];
    const rows = [{
      seatId: 'seat1',
      selectedHolder: '',
      title: '',
      optionValues: ['', 'activea', 'activeb'], // retiredchar deliberately absent
    }];
    const changes = computeCourtChanges(rows, seats, ALL_CHARS);
    expect(changes).toEqual([]);
  });

  it('a DELIBERATE vacate of a retired holder\'s seat still fires — the safety net only swallows the specific unrepresentable-default shape', () => {
    // Told apart from the case above only by which option the row is ACTUALLY
    // parked on: '' plus a full option list that DOES include the retired
    // holder means an ST truly chose Vacant, not that the row defaulted there.
    const seats = [SEAT];
    const rows = [{
      seatId: 'seat1',
      selectedHolder: '',
      title: '',
      optionValues: ['', 'activea', 'activeb', 'retiredchar'],
    }];
    const changes = computeCourtChanges(rows, seats, ALL_CHARS);
    expect(changes).toEqual([{ seatId: 'seat1', holderId: '', title: '' }]);
  });

  it('a real change to a retired-holder row (reassigning to someone active) is still reported', () => {
    const seats = [SEAT];
    const rows = [{
      seatId: 'seat1',
      selectedHolder: 'activea',
      title: 'Enforcer',
      optionValues: ['', 'activea', 'activeb', 'retiredchar'],
    }];
    const changes = computeCourtChanges(rows, seats, ALL_CHARS);
    expect(changes).toEqual([{ seatId: 'seat1', holderId: 'activea', title: 'Enforcer' }]);
  });

  it('an unchanged vacant seat never fires', () => {
    const seats = [VACANT_SEAT];
    const rows = [{ seatId: 'seat2', selectedHolder: '', title: '', optionValues: ['', 'activea', 'activeb'] }];
    expect(computeCourtChanges(rows, seats, ALL_CHARS)).toEqual([]);
  });

  it('a row naming a seat that no longer exists in the fetched seat list is skipped, not crashed on', () => {
    const rows = [{ seatId: 'ghost-seat', selectedHolder: 'activea', title: '', optionValues: [] }];
    expect(computeCourtChanges(rows, [SEAT, VACANT_SEAT], ALL_CHARS)).toEqual([]);
  });
});
