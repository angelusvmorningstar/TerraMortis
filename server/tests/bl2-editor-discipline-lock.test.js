/**
 * BL-2 (issue #1008) — the editor refuses discipline edits for a character
 * whose bloodline does not resolve.
 *
 * AC 5, 9. The banner tells a human the number on screen is wrong. This stops
 * the wrong number being written to the document while they deal with it.
 *
 * The guard is asserted at the HANDLER, not at the markup. Locking only the
 * markup is theatre: the same data-lock that produced this story found clan
 * and bloodline each have two independent editing surfaces, so a rule enforced
 * in one template is a rule that holds on one screen. `shEditDiscPt` is the
 * single write path for discipline CP and XP (and `dots` is derived from
 * them), so gating it covers the whole costing surface.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const api = vi.hoisted(() => ({ get: null }));
vi.mock('../../public/js/data/api.js', () => ({
  apiGet: async (...a) => api.get(...a),
  apiPost: async () => ({}), apiPut: async () => ({}), apiDelete: async () => ({}),
  apiRaw: async () => ({ status: 200, ok: true, body: null }),
  apiBase: () => '',
  headers: () => ({}),
}));

globalThis.location ??= { hostname: 'localhost', pathname: '/admin.html' };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const DOCS = [
  { _id: '1', name: 'Kerberos', slug: 'kerberos', clan: 'Gangrel', disciplines: ['Animalism', 'Majesty', 'Protean', 'Resilience'] },
];

async function freshEditor({ load = true } = {}) {
  vi.resetModules();
  api.get = async () => DOCS;
  const cache = await import('../../public/js/data/bloodlines-cache.js');
  const accessors = await import('../../public/js/data/accessors.js');
  const state = (await import('../../public/js/data/state.js')).default;
  const edit = await import('../../public/js/editor/edit.js');
  edit.registerCallbacks(() => {}, () => {});
  if (load) await cache.loadBloodlines();
  return { cache, accessors, state, edit };
}

function charWith(bloodline) {
  return {
    name: 'Subject', clan: 'Gangrel', bloodline,
    disciplines: { Animalism: { dots: 0, cp: 0, free: 0, xp: 0, rule_key: null } },
  };
}

beforeEach(() => { api.get = null; });

describe('BL-2 — bloodlineUnresolved', () => {
  it('is false for a character with no bloodline', async () => {
    const { accessors } = await freshEditor();
    expect(accessors.bloodlineUnresolved({ clan: 'Gangrel' })).toBe(false);
  });

  it('is false when the bloodline resolves', async () => {
    const { accessors } = await freshEditor();
    expect(accessors.bloodlineUnresolved({ clan: 'Gangrel', bloodline: 'Kerberos' })).toBe(false);
  });

  it('is true when the bloodline is unknown', async () => {
    const { accessors } = await freshEditor();
    expect(accessors.bloodlineUnresolved({ name: 'X', clan: 'Gangrel', bloodline: 'Nope' })).toBe(true);
  });

  it('is true when the cache has not loaded', async () => {
    const { accessors } = await freshEditor({ load: false });
    expect(accessors.bloodlineUnresolved({ name: 'X', clan: 'Gangrel', bloodline: 'Kerberos' })).toBe(true);
  });
});

describe('BL-2 — shEditDiscPt refuses to write for an unresolved character', () => {
  it('writes normally when the bloodline resolves', async () => {
    const { state, edit } = await freshEditor();
    state.chars = [charWith('Kerberos')];
    state.editIdx = 0;
    edit.shEditDiscPt('Animalism', 'cp', 2);
    expect(state.chars[0].disciplines.Animalism.cp).toBe(2);
  });

  it('does NOT write when the bloodline is unknown', async () => {
    const { state, edit } = await freshEditor();
    state.chars = [charWith('Not A Bloodline')];
    state.editIdx = 0;
    edit.shEditDiscPt('Animalism', 'cp', 2);
    expect(state.chars[0].disciplines.Animalism.cp).toBe(0);
  });

  it('does NOT write XP either — the multiplier is what is untrustworthy', async () => {
    const { state, edit } = await freshEditor();
    state.chars = [charWith('Not A Bloodline')];
    state.editIdx = 0;
    edit.shEditDiscPt('Animalism', 'xp', 12);
    expect(state.chars[0].disciplines.Animalism.xp).toBe(0);
    expect(state.chars[0].disciplines.Animalism.dots).toBe(0);
  });

  it('does NOT write while the cache is unloaded, then does once it loads', async () => {
    const { cache, state, edit } = await freshEditor({ load: false });
    state.chars = [charWith('Kerberos')];
    state.editIdx = 0;

    edit.shEditDiscPt('Animalism', 'cp', 2);
    expect(state.chars[0].disciplines.Animalism.cp).toBe(0);

    await cache.loadBloodlines();
    edit.shEditDiscPt('Animalism', 'cp', 2);
    expect(state.chars[0].disciplines.Animalism.cp).toBe(2);
  });

  it('does not create a discipline entry as a side effect of being refused', async () => {
    const { state, edit } = await freshEditor();
    const c = charWith('Not A Bloodline');
    delete c.disciplines;
    state.chars = [c];
    state.editIdx = 0;
    edit.shEditDiscPt('Auspex', 'cp', 1);
    expect(state.chars[0].disciplines).toBeUndefined();
  });

  it('leaves a character with NO bloodline fully editable', async () => {
    const { state, edit } = await freshEditor();
    const c = charWith(null);
    state.chars = [c];
    state.editIdx = 0;
    edit.shEditDiscPt('Animalism', 'cp', 1);
    expect(state.chars[0].disciplines.Animalism.cp).toBe(1);
  });
});

describe('BL-2 — the lock is visible in the editor, not just enforced', () => {
  it('the sheet states the reason inline when a bloodline is unresolved', () => {
    const src = read('public/js/editor/sheet.js');
    expect(src).toMatch(/bloodlineUnresolved/);
    expect(src).toMatch(/bl-disc-locked/);
  });

  it('the lock note has a token-only style in the shared stylesheet', () => {
    const css = read('public/css/components.css');
    expect(css).toMatch(/\.bl-disc-locked\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Review follow-ups (internal 3-layer review, 2026-08-10)
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-2 review — AC 5 requires the inputs be DISABLED, not merely ignored', () => {
  const src = read('public/js/editor/sheet.js');

  it('the discipline CP and XP inputs carry a conditional disabled attribute', () => {
    // The first cut enforced the lock only in the handler, so an ST could type
    // a value, watch it sit in the box looking accepted, and have it silently
    // discarded. AC 5 asked for both halves.
    expect(src).toMatch(/_discLockAttr/);
    expect(src).toMatch(/bloodlineUnresolved\(c\)\s*\?\s*' disabled/);
  });

  it('both discipline inputs get the attribute, not just the first', () => {
    const line = src.split('\n').find(l => l.includes('disc-bd-panel'));
    expect(line).toBeTruthy();
    expect((line.match(/_discLockAttr/g) || [])).toHaveLength(2);
  });

  it('a refused write re-renders, so the input snaps back instead of lying', () => {
    const edit = read('public/js/editor/edit.js');
    const guard = edit.slice(edit.indexOf('if (bloodlineUnresolved(c))'), edit.indexOf('if (bloodlineUnresolved(c))') + 700);
    expect(guard).toMatch(/_renderSheet\(c\)/);
  });
});

describe('BL-2 review — the audit does not invent build violations', () => {
  const src = read('public/js/data/audit.js');

  it('the two in-clan CP gates are suppressed while the bloodline is unresolved', () => {
    // With an empty in-clan list every CP counts as out-of-clan, so both gates
    // would fire on every affected character at once, reporting a
    // character-build violation that does not exist.
    expect(src).toMatch(/bloodlineUnresolved/);
    expect(src).toMatch(/discCPOut > 1 && !_blUnresolved/);
    expect(src).toMatch(/discCPIn < 2 && discCPTotal > 0 && !_blUnresolved/);
  });

  it('it says why the gates could not be checked, rather than staying silent', () => {
    expect(src).toMatch(/disc_bloodline_unresolved/);
  });
});
