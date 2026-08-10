/**
 * BL-4 (issue #1008) — the bloodlines admin screen and its wiring.
 *
 * AC 11, 12, 13, 14. Two halves, for the reason BL-2's banner suite gives:
 * there is no DOM in this runner (no jsdom, and adding it is a dependency this
 * story did not budget for either).
 *
 *   1. The pure decisions the screen makes are exported and tested directly:
 *      the holder join, and the no-partial-save refusal.
 *   2. Static analysis for the things drift pattern #16 says get missed: does
 *      the sidebar button exist, does the section it targets exist, does
 *      `switchDomain` actually call the init, and is the WS frame wired in
 *      BOTH apps rather than only the admin one. BL-2's banner found two
 *      mount/CSS failures that had gone unnoticed for three months by asking
 *      exactly these questions.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// api.js reads `location` at module scope, which does not exist in this
// runner. Nothing under test fetches; stub the module out entirely, as the
// BL-2 banner suite and the ECM-1 tests do.
vi.mock('../../public/js/data/api.js', () => ({
  apiGet: async () => [],
  apiPost: async () => ({}),
  apiPatch: async () => ({}),
  apiRaw: async () => ({ status: 204, ok: true, body: null }),
}));

import { buildHoldersIndex, validationRefusal, deleteDisabledReason, REQUIRED_DISCIPLINES } from '../../public/js/admin/bloodlines-admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const FOUR = ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'];

// ─────────────────────────────────────────────────────────────────────────────
//  The holder join (AC 12)
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 12 — the client-side holder count', () => {
  it('counts holders per bloodline', () => {
    const idx = buildHoldersIndex([
      { bloodline: 'Khaibit' },
      { bloodline: 'Khaibit' },
      { bloodline: 'Zelani' },
    ]);
    expect(idx.get('khaibit')).toBe(2);
    expect(idx.get('zelani')).toBe(1);
  });

  it('matches on the normalised key, so the count agrees with the delete gate', () => {
    // The server refuses the delete on the trim + case-folded key. A count
    // that disagreed would show an enabled Delete button on a bloodline the
    // API will refuse to delete.
    const idx = buildHoldersIndex([
      { bloodline: 'Khaibit' },
      { bloodline: '  khaibit ' },
      { bloodline: 'KHAIBIT' },
    ]);
    expect(idx.get('khaibit')).toBe(3);
  });

  it('ignores characters with no bloodline, and a missing character array', () => {
    expect(buildHoldersIndex([{ bloodline: null }, { bloodline: '' }, {}]).size).toBe(0);
    expect(buildHoldersIndex(null).size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  The Delete affordance mirrors the whole gate (AC 12)
//
//  BL-4 disabled Delete on the client-side holder count alone, so a bloodline
//  with no holders but a `rule_grant` reference offered an enabled Delete and
//  took the ST through a destructive confirmation for an operation the API
//  refuses. Found by this story's review.
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 12 — Delete is disabled for every kind of reference', () => {
  it('offers Delete only when nothing references the bloodline', () => {
    expect(deleteDisabledReason(0, 0)).toBeNull();
    expect(deleteDisabledReason(undefined, undefined)).toBeNull();
  });

  it('refuses on holders, and says how many', () => {
    expect(deleteDisabledReason(2, 0)).toMatch(/held by 2 characters/i);
    expect(deleteDisabledReason(1, 0)).toMatch(/held by 1 character\b/i);
  });

  it('refuses on a grant reference with no holders at all, and points at the Rules Engine', () => {
    const msg = deleteDisabledReason(0, 1);
    expect(msg).toMatch(/grant rule/i);
    expect(msg).toMatch(/rules engine/i);
  });

  it('names both when both apply', () => {
    const msg = deleteDisabledReason(3, 2);
    expect(msg).toMatch(/3 characters/);
    expect(msg).toMatch(/2 bloodline grant rules/);
  });

  it('the row reads the grant count the admin list read supplies', () => {
    const view = read('public/js/admin/bloodlines-admin.js');
    expect(view).toMatch(/deleteDisabledReason\(holdersCount, b\.grant_rule_count\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  No partial save (AC 12, and AC 2's client mirror)
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 — save is refused until the bloodline is valid, and the refusal says why', () => {
  it('four is the required count', () => {
    expect(REQUIRED_DISCIPLINES).toBe(4);
  });

  it('refuses a missing name on create, and does not ask for one on edit', () => {
    const values = { name: '', clan: 'Mekhet', disciplines: FOUR };
    expect(validationRefusal(values, { requireName: true })).toMatch(/name is required/i);
    expect(validationRefusal(values, { requireName: false })).toBeNull();
  });

  it('refuses fewer than four disciplines and says how many are chosen', () => {
    const msg = validationRefusal(
      { name: 'X', clan: 'Mekhet', disciplines: ['Auspex', 'Celerity', 'Vigour'] },
      { requireName: true },
    );
    expect(msg).toMatch(/exactly 4/i);
    expect(msg).toMatch(/3 chosen/i);
    // The count is a rule of the game, so the refusal must not read like a
    // form nag about an unfinished draft.
    expect(msg).toMatch(/not a draft/i);
  });

  it('refuses more than four, and refuses a repeat', () => {
    expect(validationRefusal({ name: 'X', clan: 'Mekhet', disciplines: [...FOUR, 'Dominate'] }, { requireName: true })).toBeTruthy();
    expect(validationRefusal({ name: 'X', clan: 'Mekhet', disciplines: ['Auspex', 'Auspex', 'Celerity', 'Vigour'] }, { requireName: true }))
      .toMatch(/all be different/i);
  });

  it('refuses a missing clan', () => {
    expect(validationRefusal({ name: 'X', clan: '', disciplines: FOUR }, { requireName: true })).toMatch(/clan is required/i);
  });

  it('accepts a complete bloodline', () => {
    expect(validationRefusal({ name: 'X', clan: 'Mekhet', disciplines: FOUR }, { requireName: true })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Mount points (AC 12) — drift pattern #16
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 12 — the screen is actually reachable', () => {
  const adminHtml = read('public/admin.html');
  const adminJs = read('public/js/admin.js');

  it('has a sidebar button for the domain', () => {
    expect(adminHtml).toContain('data-domain="bloodlines"');
  });

  it('has the section the button targets, and the container the init writes into', () => {
    expect(adminHtml).toContain('id="d-bloodlines"');
    expect(adminHtml).toContain('id="bloodlines-content"');
  });

  it('switchDomain calls the init with the character set', () => {
    expect(adminJs).toMatch(/domain === 'bloodlines'\)\s*initBloodlinesAdmin\(document\.getElementById\('bloodlines-content'\), chars\)/);
  });

  it('imports the module', () => {
    expect(adminJs).toContain("from './admin/bloodlines-admin.js'");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  The WS frame, in BOTH apps (AC 11)
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 11 — writes broadcast and both apps listen', () => {
  it('the server exports a bloodline broadcaster with the agreed frame shape', () => {
    const serverWs = read('server/ws.js');
    expect(serverWs).toContain('export function broadcastBloodlineUpdate');
    expect(serverWs).toContain("type: 'bloodline'");
    expect(serverWs).toContain('bloodline_id');
  });

  it('EACH write handler fires it, with its own op', () => {
    // The original assertion was file-wide: three calls anywhere, and each op
    // string anywhere. It stayed green if all three calls sat in one handler,
    // or if a write path lost its broadcast while another gained a duplicate.
    // Sliced per handler instead, which is what AC 11 actually says.
    const route = read('server/routes/bloodlines.js');
    const handlers = [
      ['create', "router.post('/'", "router.patch('/:id'"],
      ['update', "router.patch('/:id'", "router.delete('/:id'"],
      ['delete', "router.delete('/:id'", '  return router;'],
    ];
    for (const [op, from, to] of handlers) {
      const start = route.indexOf(from);
      const end = route.indexOf(to, start + 1);
      expect(start, `could not locate the ${op} handler`).toBeGreaterThan(0);
      expect(end).toBeGreaterThan(start);
      const handler = route.slice(start, end);
      const calls = handler.match(/broadcastBloodlineUpdate\(/g) || [];
      expect(calls, `the ${op} handler must broadcast exactly once`).toHaveLength(1);
      expect(handler, `the ${op} handler must broadcast op '${op}'`).toMatch(
        new RegExp(`broadcastBloodlineUpdate\\([^)]*'${op}'\\)`)
      );
    }
    expect(route.match(/broadcastBloodlineUpdate\(/g)).toHaveLength(3);
  });

  it('one client that throws on send cannot abort the broadcast, or the write', () => {
    // Every broadcaster is called after the Mongo mutation and before the HTTP
    // response, so an unguarded `ws.send` that throws both skips the remaining
    // clients and rejects the route handler — Express 5 forwards that, and the
    // ST sees a 500 for a write that succeeded. Found by this story's review;
    // all four broadcasters shared the gap, so they share one guarded fan-out.
    const serverWs = read('server/ws.js');
    expect(serverWs).toMatch(/function _fanOut\(msg\)/);
    const fanOut = serverWs.slice(serverWs.indexOf('function _fanOut(msg)'), serverWs.indexOf('Broadcast a tracker update'));
    expect(fanOut).toMatch(/try\s*\{[\s\S]*ws\.send\(msg\)[\s\S]*\}\s*catch/);
    // No broadcaster may keep its own unguarded loop.
    const sends = serverWs.match(/ws\.send\(/g) || [];
    expect(sends, 'ws.send must appear only inside the guarded fan-out').toHaveLength(1);
    for (const fn of ['broadcastTrackerUpdate', 'broadcastStModUpdate', 'broadcastCatalogueUpdate', 'broadcastBloodlineUpdate']) {
      const start = serverWs.indexOf(`export function ${fn}(`);
      expect(start, `expected ${fn}`).toBeGreaterThan(0);
      expect(serverWs.slice(start, start + 500), `${fn} must fan out through the guarded helper`).toContain('_fanOut(');
    }
  });

  it('the client handles the frame and exposes the callback through initWS', () => {
    const clientWs = read('public/js/data/ws.js');
    expect(clientWs).toContain("msg.type === 'bloodline'");
    expect(clientWs).toContain('onBloodlineUpdate');
  });

  it('is wired in the ADMIN app', () => {
    expect(read('public/js/admin.js')).toMatch(/onBloodlineUpdate:\s*\(\)\s*=>\s*\{\s*refetchBloodlines\(\)/);
  });

  it('is wired in the PLAYER app too, because the DT form free-rides on its priming', () => {
    // Missing this one would mean an ST adding a bloodline mid-session does not
    // reach an open DT form until the player reloads, and there is no second
    // chance: the form has no priming of its own.
    expect(read('public/js/app.js')).toMatch(/onBloodlineUpdate:\s*\(\)\s*=>\s*\{\s*refetchBloodlines\(\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Normalised CSS + escaping (AC 12, 13)
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 13 — normalised CSS, reused not re-invented', () => {
  const view = read('public/js/admin/bloodlines-admin.js');
  const css = read('public/css/admin-layout.css');

  it('writes no inline styles, bare hex or rgba() in the rendered markup', () => {
    // Comments are stripped first: this module's own header cites issue #1008
    // and ECM's #873, which a naive hex-colour regex reads as colours.
    const code = view.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/style="/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/rgba?\(/);
  });

  it('reuses the shared reference-data admin chrome rather than a bl- copy', () => {
    for (const cls of ['ec-admin', 'ec-toolbar', 'ec-table', 'ec-form-panel', 'ec-form-grid',
      'ec-form-field', 'ec-form-readonly', 'ec-form-hint', 'ec-impact-banner',
      'ec-btn-primary', 'ec-btn-sm', 'ec-btn-danger', 'ec-form-msg']) {
      expect(view, `expected the screen to reuse .${cls}`).toContain(cls);
    }
    // No duplicated chrome under a second prefix.
    expect(css).not.toContain('.bl-toolbar');
    expect(css).not.toContain('.bl-form-panel');
    expect(css).not.toContain('.bl-table');
  });

  it('defines the two genuinely new classes it uses', () => {
    for (const cls of ['bl-disc-cell', 'bl-disc-grid', 'bl-disc-tag']) {
      expect(view, `expected the view to use .${cls}`).toContain(cls);
      expect(css, `expected .${cls} to exist in admin-layout.css`).toContain(`.${cls}`);
    }
  });

  it('escapes every document-sourced value it interpolates into markup', () => {
    // BL-3a's review found unescaped bloodline names in the two dropdowns.
    // This screen is where those names are now typed in, so it is the last
    // place to be casual about it. Any interpolation reading a field off a
    // bloodline document, a character list or the impact payload must go
    // through esc().
    // Scoped to the markup-producing region. `showFormMsg`, `alert` and
    // `confirm` further down are text sinks (textContent / native dialogs),
    // where escaping would show the entities to the ST rather than protect
    // them.
    const markupStart = view.indexOf('function render(');
    const markupEnd = view.indexOf('function wireFormEvents(');
    expect(markupStart).toBeGreaterThan(0);
    expect(markupEnd).toBeGreaterThan(markupStart);
    const markup = view.slice(markupStart, markupEnd);

    const interpolations = [...markup.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)].map(m => m[1].trim());
    expect(interpolations.length).toBeGreaterThan(10);   // the regex is finding them at all

    const DOCUMENT_SOURCED = /\b(?:b|it|item|initial|impact|c|d|values|dup|clash)\.(?:name|clan|slug|notes|disciplines|bloodline|character_names|grant_rule_labels|message)\b/;
    for (const expr of interpolations) {
      if (!DOCUMENT_SOURCED.test(expr)) continue;
      // Allowed without esc(): the value is escaped, counted, or used only as
      // a comparison whose branches are both string literals in this file
      // (the `selected` attribute pattern), so nothing document-sourced is
      // emitted.
      expect(expr, `unescaped document value interpolated: \${${expr}}`)
        .toMatch(/esc\(|\.map\(esc\)|\.length|\.join\(|\?\s*'[^']*'\s*:\s*'[^']*'/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Async correctness and honest states — added by this story's review
//
//  Static, deliberately: these three live in DOM-driven code paths and there
//  is no jsdom in this runner. Each pins the specific line the review found
//  missing, which is the same method the mount-point block above uses.
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 review — the edit form cannot save one bloodline over another', () => {
  const view = read('public/js/admin/bloodlines-admin.js');

  it('discards an /impact response that is no longer the open edit', () => {
    // Edit(A) then Edit(B) before A resolves: `_editingId` is B, but A's
    // response would render A's clan, disciplines and notes into the form, and
    // Save then PATCHes B with them, silently re-costing every holder of B.
    const start = view.indexOf('async function openEditForm(');
    const end = view.indexOf('function discSelect(');
    expect(start).toBeGreaterThan(0);
    const fn = view.slice(start, end);
    const awaitAt = fn.indexOf('await apiGet(');
    const guardAt = fn.search(/if \(String\(_editingId\) !== String\(id\)\) return;/);
    expect(guardAt, 'expected a staleness guard in openEditForm').toBeGreaterThan(0);
    expect(guardAt, 'the guard must run AFTER the await, not before it').toBeGreaterThan(awaitAt);
    expect(fn.indexOf('renderForm('), 'the guard must run BEFORE the render').toBeGreaterThan(guardAt);
  });
});

describe('BL-4 review — a failed list read is not reported as an empty collection', () => {
  const view = read('public/js/admin/bloodlines-admin.js');

  it('records the failure rather than only emptying the array', () => {
    const start = view.indexOf('async function loadItems(');
    const fn = view.slice(start, view.indexOf('function filteredSorted('));
    expect(fn).toMatch(/_loadError = null/);
    expect(fn).toMatch(/catch[\s\S]*_loadError =/);
  });

  it('renders an error state with a retry, instead of "create one or run the seed"', () => {
    // An expired token or a transient API error used to render "No bloodlines
    // in the collection", which invites an ST to start correcting a collection
    // that is merely unreadable.
    const start = view.indexOf('function render(');
    const markup = view.slice(start, view.indexOf('function renderRow('));
    expect(markup).toMatch(/\$\{_loadError\s*\?/);
    expect(markup).toContain('bl-retry');
    expect(view).toMatch(/\$\('bl-retry'\)\?\.addEventListener/);
  });
});

describe('BL-4 review — no em-dash in anything the screen prints', () => {
  it('has none outside the comments', () => {
    // The story's own Dev Notes: "No em-dashes in any string the app prints."
    // The discipline picker's placeholder shipped as an em-dashed one.
    const view = read('public/js/admin/bloodlines-admin.js');
    const code = view.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('—');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Scope (the story's "What this story is NOT")
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 — scope held', () => {
  const view = read('public/js/admin/bloodlines-admin.js');

  it('offers no rename affordance', () => {
    // `name` is immutable. The edit form renders it read-only with the reason;
    // it must not appear as an input, and the PATCH body must not carry it.
    expect(view).not.toMatch(/id="bl-f-name"[^>]*>\s*`\s*\}\s*:/);
    expect(view).toContain('ec-form-readonly');
    const patchCall = view.slice(view.indexOf('apiPatch('), view.indexOf('apiPatch(') + 260);
    expect(patchCall).not.toContain('name:');
    expect(patchCall).not.toContain('slug:');
  });

  it('offers no active / retire control, and no grant editing', () => {
    const code = view.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // No `active` field, and no reintroduction of one by another name. Ruled
    // 2026-08-10: bloodlines are permanent; the guarded delete is the answer.
    expect(code).not.toMatch(/\bactive\b/);
    expect(code).not.toMatch(/\bretired\b/);
    // Grants are edited in the Rules Engine admin. The screen may SAY so in
    // its impact banner; it must not write to those collections.
    expect(code).not.toMatch(/api\/rules/);
    expect(code).not.toMatch(/rule_grant/);
  });

  it('has no player-facing description field', () => {
    expect(view).not.toContain('bl-f-description');
  });

  it('still reads the ST-gated list, so notes round-trip', () => {
    expect(view).toContain('/api/bloodlines/admin');
  });
});
