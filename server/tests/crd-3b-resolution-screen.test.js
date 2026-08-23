/**
 * crd.3b — the real client resolution screen (Epic CRD).
 *
 * Coverage map:
 *   AC1  — initContestedResolve(rootEl, ctx, chars) additive signature
 *   AC2  — missing challenge/character renders a graceful, non-crashing state
 *   AC3  — aspect segmented control shows real effective attribute values
 *   AC4  — Willpower toggle labelled +2, disabled at zero live WP
 *   AC5  — merit chips: narrow 2-merit set only, empty state otherwise
 *   AC6  — every selection change calls PUT .../resolve; a stale response
 *          arriving after a newer one must not overwrite it (generation guard)
 *   AC7  — commit calls PUT .../accept (unmodified) and renders the outcome
 *          via roll-v2.js's own mkColsEl, never re-rolling anything itself
 *   AC9  — "Defending as" banner only for a multi-character player
 *
 * TESTING APPROACH — following crd.2's own precedent exactly
 * (crd-2-pending-queue.test.js's own stated rationale): vi.mock() the
 * browser-only imports and drive the real module against a hand-rolled
 * element stub, the one real behavioural precedent this repo has for driving
 * a browser module in Node (dt-form-territory-fresh-fetch.test.js). No jsdom
 * — adding one is a HALT condition.
 *
 * `tracker.js` and `roll-v2.js` are mocked outright rather than loaded for
 * real: this story's own use of `ensureLoaded`/`trackerRead` is a UX
 * convenience only (the server re-checks live Willpower independently on
 * every crd.3a `/resolve` call regardless of what this screen shows), and
 * `mkColsEl` is a pure DOM-builder this story only needs to prove it CALLS
 * correctly, not re-verify. Neither module's own correctness is this story's
 * concern (gdx-7's own test already proves tracker.js's real read/write
 * behaviour against a live DB).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../public/js/data/api.js', () => ({
  apiGet: vi.fn(),   // pending-queue.js's own dependency, used only via refreshPendingQueueBadge() here
  apiRaw: vi.fn(),   // this story's own resolve/accept calls
}));

vi.mock('../../public/js/data/helpers.js', () => ({
  esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  redactCharName: s => s,
}));

vi.mock('../../public/js/game/tracker.js', () => ({
  ensureLoaded: vi.fn().mockResolvedValue({}),
  trackerRead: vi.fn(() => ({ willpower: 3 })),
}));

vi.mock('../../public/js/suite/roll-v2.js', () => ({
  mkColsEl: vi.fn(() => ({ appendChild: vi.fn() })),
}));

const resolveScreen = await import('../../public/js/game/contested-resolve.js');
const apiModule = await import('../../public/js/data/api.js');
const trackerModule = await import('../../public/js/game/tracker.js');
const rollV2Module = await import('../../public/js/suite/roll-v2.js');
const pendingQueue = await import('../../public/js/game/pending-queue.js');

// ── Element stub — mirrors crd-2's own makeRoot() shape ────────────────────

function makeRoot() {
  const fakeEl = { appendChild: vi.fn() };
  const listeners = [];
  return {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
    // Not real DOM traversal — a stable stand-in, same trick crd-2's own
    // stub uses for [data-cq-body]. Good enough to prove mkColsEl is CALLED
    // with the right data; real pixel rendering is a browser-verification
    // concern, not this stub's job.
    querySelector: sel => (
      sel === '[data-cr-defender-rolls]' || sel === '[data-cr-attacker-rolls]' ? fakeEl : null
    ),
    addEventListener: (type, fn) => listeners.push([type, fn]),
    click(target) { for (const [t, fn] of listeners) if (t === 'click') fn({ target }); },
  };
}

function targetOf(selector, { disabled = false } = {}) {
  return {
    closest: sel => (sel === selector
      ? { dataset: {}, disabled, classList: { contains: c => c === 'disabled' && disabled } }
      : null),
  };
}
function aspectTarget(aspect) {
  return { closest: sel => (sel === '[data-cr-aspect]' ? { dataset: { crAspect: aspect } } : null) };
}
function meritTarget(key) {
  return { closest: sel => (sel === '[data-cr-merit]' ? { dataset: { crMerit: key } } : null) };
}

const CHAR_A = {
  _id: '000000000000000000000a01',
  name: 'Eve Lockridge',
  attributes: {
    Resolve: { dots: 2, bonus: 0 }, Composure: { dots: 3, bonus: 0 }, Stamina: { dots: 1, bonus: 0 },
  },
  merits: [
    { category: 'general', name: 'Indomitable', rule_key: 'indomitable' },
    { category: 'general', name: 'Closed Book', rating: 3, rule_key: 'closed-book' },
    { category: 'general', name: 'Iron Stamina', rule_key: 'iron-stamina' },
  ],
};
const CHAR_B = { _id: '000000000000000000000a02', name: 'Yusuf Kalusicj', attributes: {}, merits: [] };

function pendingDoc(overrides = {}) {
  return {
    _id: 'c9',
    request_type: 'contested_roll',
    status: 'pending',
    challenger_character_id: '000000000000000000000b01',
    challenger_character_name: 'Mammon',
    target_character_id: CHAR_A._id,
    target_character_name: CHAR_A.name,
    roll_type: 'social',
    challenger_pool: 7,
    created_at: '2026-08-23T00:00:00.000Z',
    updated_at: '2026-08-23T00:00:00.000Z',
    ...overrides,
  };
}

async function mountResolved(root, doc = pendingDoc(), chars = [CHAR_A]) {
  // Seeds pending-queue.js's own internal state.rows via its real one-shot
  // fetch — the one real lookup mechanism getPendingChallenge() reads, not
  // re-implemented here.
  apiModule.apiGet.mockResolvedValueOnce([doc]);
  await pendingQueue.refreshPendingQueueBadge();
  resolveScreen.initContestedResolve(root, { challengeId: doc._id }, chars);
}

beforeEach(() => {
  vi.clearAllMocks();
  trackerModule.trackerRead.mockReturnValue({ willpower: 3 });
  globalThis.window = { goTab: vi.fn() };
});

afterEach(() => {
  delete globalThis.window;
});

describe('crd.3b AC2 — missing challenge/character', () => {
  it('renders a graceful, non-crashing state when no context id is given at all', () => {
    const root = makeRoot();
    expect(() => resolveScreen.initContestedResolve(root, undefined, [])).not.toThrow();
    expect(root.innerHTML).toMatch(/can't be resolved/i);
    expect(root.innerHTML).toMatch(/data-cr-back/);
  });

  it('renders the same graceful state when the challenge id does not match anything pending', () => {
    const root = makeRoot();
    expect(() => resolveScreen.initContestedResolve(root, { challengeId: 'nope' }, [CHAR_A])).not.toThrow();
    expect(root.innerHTML).toMatch(/can't be resolved/i);
  });

  it('renders the graceful state when the challenge exists but the target character is missing from chars', async () => {
    const root = makeRoot();
    await mountResolved(root, pendingDoc(), []); // real challenge, but empty chars
    expect(root.innerHTML).toMatch(/can't be resolved/i);
  });
});

describe('crd.3b AC3 — aspect segmented control, real effective values', () => {
  it('shows each aspect\'s real attribute name and effective dots+bonus', async () => {
    const root = makeRoot();
    await mountResolved(root);
    expect(root.innerHTML).toContain('Resolve · 2');
    expect(root.innerHTML).toContain('Composure · 3');
    expect(root.innerHTML).toContain('Stamina · 1');
  });

  it('selecting an aspect calls PUT .../resolve with that aspect', async () => {
    const root = makeRoot();
    await mountResolved(root);
    apiModule.apiRaw.mockResolvedValueOnce({ ok: true, status: 200, body: { defender_pool: 3 } });
    root.click(aspectTarget('social'));
    await Promise.resolve(); await Promise.resolve();
    expect(apiModule.apiRaw).toHaveBeenCalledWith(
      'PUT',
      '/api/contested_roll_requests/c9/resolve',
      expect.objectContaining({ defender_aspect: 'social', defender_wp_spent: false, defender_merit_ids: [] })
    );
    expect(root.innerHTML).toContain('3');
  });
});

describe('crd.3b AC4 — Willpower toggle', () => {
  it('is disabled and shows unavailable when live Willpower is 0', async () => {
    trackerModule.trackerRead.mockReturnValue({ willpower: 0 });
    const root = makeRoot();
    await mountResolved(root);
    await Promise.resolve();
    expect(root.innerHTML).toMatch(/cr-wp-toggle[^"]*disabled/);
    expect(root.innerHTML).toMatch(/No Willpower available/);
  });

  it('a disabled toggle click does not call resolve or flip state', async () => {
    trackerModule.trackerRead.mockReturnValue({ willpower: 0 });
    const root = makeRoot();
    await mountResolved(root);
    await Promise.resolve();
    apiModule.apiRaw.mockClear();
    root.click(targetOf('[data-cr-wp]', { disabled: true }));
    expect(apiModule.apiRaw).not.toHaveBeenCalled();
  });

  it('toggling Willpower on (with WP available) calls resolve with defender_wp_spent: true', async () => {
    const root = makeRoot();
    await mountResolved(root);
    apiModule.apiRaw.mockResolvedValueOnce({ ok: true, status: 200, body: { defender_pool: 2 } });
    root.click(aspectTarget('mental')); // pick an aspect first
    await Promise.resolve(); await Promise.resolve();
    apiModule.apiRaw.mockResolvedValueOnce({ ok: true, status: 200, body: { defender_pool: 4 } });
    root.click(targetOf('[data-cr-wp]'));
    await Promise.resolve(); await Promise.resolve();
    expect(apiModule.apiRaw).toHaveBeenLastCalledWith(
      'PUT', '/api/contested_roll_requests/c9/resolve',
      expect.objectContaining({ defender_wp_spent: true })
    );
  });
});

describe('crd.3b AC5 — merit chips, narrow 2-merit set', () => {
  it('renders a chip only for indomitable/closed-book, never the third owned merit', async () => {
    const root = makeRoot();
    await mountResolved(root);
    expect(root.innerHTML).toContain('Indomitable');
    expect(root.innerHTML).toContain('Closed Book');
    expect(root.innerHTML).not.toContain('Iron Stamina');
  });

  it('shows the empty-state note for a character with neither merit', async () => {
    const root = makeRoot();
    await mountResolved(root, pendingDoc({ target_character_id: CHAR_B._id, target_character_name: CHAR_B.name }), [CHAR_B]);
    expect(root.innerHTML).toMatch(/no merits that apply/i);
  });

  it('toggling a merit chip calls resolve with that merit id included', async () => {
    const root = makeRoot();
    await mountResolved(root);
    apiModule.apiRaw.mockResolvedValueOnce({ ok: true, status: 200, body: { defender_pool: 2 } });
    root.click(aspectTarget('mental'));
    await Promise.resolve(); await Promise.resolve();
    apiModule.apiRaw.mockResolvedValueOnce({ ok: true, status: 200, body: { defender_pool: 4 } });
    root.click(meritTarget('indomitable'));
    await Promise.resolve(); await Promise.resolve();
    expect(apiModule.apiRaw).toHaveBeenLastCalledWith(
      'PUT', '/api/contested_roll_requests/c9/resolve',
      expect.objectContaining({ defender_merit_ids: ['indomitable'] })
    );
  });
});

describe('crd.3b AC6 — resolve call sequencing (generation guard)', () => {
  it('a slower, stale response landing after a newer one does not overwrite the newer pool', async () => {
    const root = makeRoot();
    await mountResolved(root);

    let resolveFirst;
    const firstCall = new Promise(r => { resolveFirst = r; });
    apiModule.apiRaw.mockImplementationOnce(() => firstCall);
    root.click(aspectTarget('mental')); // fires the first (slow) resolve

    apiModule.apiRaw.mockResolvedValueOnce({ ok: true, status: 200, body: { defender_pool: 3 } });
    root.click(aspectTarget('social')); // fires a second (fast) resolve
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(root.innerHTML).toContain('>3<');

    // The stale first call now lands — must NOT overwrite the newer pool.
    resolveFirst({ ok: true, status: 200, body: { defender_pool: 1 } });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(root.innerHTML).toContain('>3<');
    expect(root.innerHTML).not.toContain('>1<');
  });

  it('a 409 (e.g. insufficient Willpower) shows the server message and clears the pool, no crash', async () => {
    const root = makeRoot();
    await mountResolved(root);
    apiModule.apiRaw.mockResolvedValueOnce({ ok: false, status: 409, body: { error: 'CONFLICT', message: 'Not enough Willpower to spend' } });
    root.click(aspectTarget('mental'));
    await Promise.resolve(); await Promise.resolve();
    expect(root.innerHTML).toMatch(/Not enough Willpower to spend/);
    expect(root.innerHTML).toMatch(/Choose how to resist/);
  });

  it('a rejected (not just non-OK) resolve call still clears the resolving flag and shows an error, no unhandled rejection', async () => {
    const root = makeRoot();
    await mountResolved(root);
    apiModule.apiRaw.mockRejectedValueOnce(new Error('network down'));
    root.click(aspectTarget('mental'));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(root.innerHTML).toMatch(/Could not reach the server/);
    // Resolving must not be latched — a subsequent click still works.
    apiModule.apiRaw.mockResolvedValueOnce({ ok: true, status: 200, body: { defender_pool: 2 } });
    root.click(aspectTarget('mental'));
    await Promise.resolve(); await Promise.resolve();
    expect(root.innerHTML).toContain('>2<');
  });

  it('a resolve call from a PRIOR mount landing after a NEW mount (even a different challenge) does not paint the new screen — even if the new mount never itself calls resolve', async () => {
    // Deliberately reuses the SAME root object for both mounts — matching
    // production reality (app.js's goTab never unmounts a tab, the same
    // #t-contested-resolve div is remounted onto every time) — and does NOT
    // click anything on mount B: the _resolveGen-only check alone would
    // coincidentally catch this if B's own click also advanced the counter.
    // This proves the SEPARATE _mountGen guard, not just the pre-existing
    // per-mount ordering one.
    const root = makeRoot();
    await mountResolved(root, pendingDoc({ _id: 'c9' }));
    let resolveStale;
    apiModule.apiRaw.mockImplementationOnce(() => new Promise(r => { resolveStale = r; }));
    root.click(aspectTarget('mental')); // mount A's resolve, left pending

    await mountResolved(root, pendingDoc({ _id: 'c10' }), [CHAR_A]); // remount, same root
    expect(root.innerHTML).toContain('>-<'); // no aspect chosen yet on the new mount

    // Mount A's stale resolve finally lands — must not touch the new mount's screen.
    resolveStale({ ok: true, status: 200, body: { defender_pool: 1 } });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(root.innerHTML).toContain('>-<');
    expect(root.innerHTML).not.toContain('>1<');
  });

  it('an /accept call from a PRIOR mount landing after a NEW mount does not render that outcome on the new screen', async () => {
    const root = makeRoot();
    await mountResolved(root, pendingDoc({ _id: 'c9' }));
    apiModule.apiRaw.mockResolvedValueOnce({ ok: true, status: 200, body: { defender_pool: 3 } });
    root.click(aspectTarget('mental'));
    await Promise.resolve(); await Promise.resolve();

    let resolveAccept;
    apiModule.apiRaw.mockImplementationOnce(() => new Promise(r => { resolveAccept = r; }));
    root.click(targetOf('[data-cr-accept]')); // mount A's accept, left pending

    await mountResolved(root, pendingDoc({ _id: 'c10' }), [CHAR_A]); // remount, same root

    resolveAccept({
      ok: true, status: 200,
      body: { outcome: {
        attacker: { name: 'Mammon', pool: 7, successes: 0, rolls: [] },
        defender: { name: 'Eve Lockridge', pool: 3, successes: 3, rolls: [] },
        outcome: 'defender', margin: 3,
      } },
    });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(root.innerHTML).not.toMatch(/You Won/);
  });
});

describe('crd.3b AC7 — commit calls the existing /accept and renders via mkColsEl only', () => {
  it('calls PUT .../accept and feeds mkColsEl exactly the server-returned rolls, never generating its own', async () => {
    const root = makeRoot();
    await mountResolved(root);
    apiModule.apiRaw.mockResolvedValueOnce({ ok: true, status: 200, body: { defender_pool: 3 } });
    root.click(aspectTarget('mental'));
    await Promise.resolve(); await Promise.resolve();

    const outcome = {
      attacker: { name: 'Mammon', pool: 7, successes: 2, rolls: [{ r: { v: 8, s: true, x: false }, ch: [] }] },
      defender: { name: 'Eve Lockridge', pool: 3, successes: 3, rolls: [{ r: { v: 9, s: true, x: false }, ch: [] }] },
      outcome: 'defender',
      margin: 1,
    };
    apiModule.apiRaw.mockResolvedValueOnce({ ok: true, status: 200, body: { outcome } });
    root.click(targetOf('[data-cr-accept]'));
    await Promise.resolve(); await Promise.resolve();

    expect(apiModule.apiRaw).toHaveBeenLastCalledWith('PUT', '/api/contested_roll_requests/c9/accept', {});
    expect(rollV2Module.mkColsEl).toHaveBeenCalledWith(outcome.defender.rolls, 0);
    expect(rollV2Module.mkColsEl).toHaveBeenCalledWith(outcome.attacker.rolls, outcome.defender.rolls.length);
    expect(root.innerHTML).toMatch(/You Won/);
  });

  it('an accept failure (e.g. stale 409) shows an error and does not render an outcome', async () => {
    const root = makeRoot();
    await mountResolved(root);
    apiModule.apiRaw.mockResolvedValueOnce({ ok: true, status: 200, body: { defender_pool: 3 } });
    root.click(aspectTarget('mental'));
    await Promise.resolve(); await Promise.resolve();

    apiModule.apiRaw.mockResolvedValueOnce({ ok: false, status: 409, body: { error: 'CONFLICT', message: 'Challenge is no longer pending' } });
    root.click(targetOf('[data-cr-accept]'));
    await Promise.resolve(); await Promise.resolve();
    expect(root.innerHTML).toMatch(/Challenge is no longer pending/);
    expect(rollV2Module.mkColsEl).not.toHaveBeenCalled();
  });

  it('the accept button is never client-disabled just because no pool has resolved yet — the server\'s own guard is what protects it (AC7)', async () => {
    const root = makeRoot();
    await mountResolved(root); // no aspect chosen, state.pool is still null
    expect(root.innerHTML).not.toMatch(/data-cr-accept[^>]*disabled/);

    apiModule.apiRaw.mockResolvedValueOnce({
      ok: false, status: 409,
      body: { error: 'CONFLICT', message: 'This challenge has no defender pool yet and cannot be accepted. The defender must resolve their own pool first.' },
    });
    root.click(targetOf('[data-cr-accept]'));
    await Promise.resolve(); await Promise.resolve();
    expect(apiModule.apiRaw).toHaveBeenCalledWith('PUT', '/api/contested_roll_requests/c9/accept', {});
    expect(root.innerHTML).toMatch(/must resolve their own pool first/);
  });

  it('a successful accept removes the challenge from the pending queue immediately (no stale tappable row on return)', async () => {
    const root = makeRoot();
    await mountResolved(root);
    apiModule.apiRaw.mockResolvedValueOnce({ ok: true, status: 200, body: { defender_pool: 3 } });
    root.click(aspectTarget('mental'));
    await Promise.resolve(); await Promise.resolve();

    expect(pendingQueue.getPendingChallenge('c9')).not.toBeNull();
    apiModule.apiRaw.mockResolvedValueOnce({
      ok: true, status: 200,
      body: { outcome: {
        attacker: { name: 'Mammon', pool: 7, successes: 1, rolls: [] },
        defender: { name: 'Eve Lockridge', pool: 3, successes: 2, rolls: [] },
        outcome: 'defender', margin: 1,
      } },
    });
    root.click(targetOf('[data-cr-accept]'));
    await Promise.resolve(); await Promise.resolve();

    expect(pendingQueue.getPendingChallenge('c9')).toBeNull();
  });
});

describe('crd.3b AC9 — "Defending as" banner', () => {
  it('renders only when the player controls more than one character', async () => {
    const root = makeRoot();
    await mountResolved(root, pendingDoc(), [CHAR_A, CHAR_B]);
    expect(root.innerHTML).toMatch(/Defending as/);
  });

  it('is absent for a single-character player', async () => {
    const root = makeRoot();
    await mountResolved(root, pendingDoc(), [CHAR_A]);
    expect(root.innerHTML).not.toMatch(/Defending as/);
  });
});

describe('crd.3b — back navigation and back button', () => {
  it('data-cr-back routes to the pending queue', async () => {
    const root = makeRoot();
    await mountResolved(root);
    root.click(targetOf('[data-cr-back]'));
    expect(globalThis.window.goTab).toHaveBeenCalledWith('contested-queue');
  });
});

describe('crd.3b — no client-side dice generation', () => {
  it('never imports the shared dice-rolling engine (d10/rollPool would be a second, illegitimate roll)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public/js/game/contested-resolve.js'), 'utf8');
    // Real import statements only — this file's own comments explain WHY
    // shared/dice.js must never be imported, which would otherwise false-
    // positive a bare string/identifier match against its own explanation.
    const importLines = src.split('\n').filter(l => /^\s*import\b/.test(l));
    expect(importLines.some(l => l.includes('shared/dice'))).toBe(false);
    expect(importLines.some(l => /\brollPool\b|\bd10\b/.test(l))).toBe(false);
  });
});
