import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Test runs with cwd=server/. Use REPO_ROOT pattern to make path resolution
// independent of cwd (matches the issue-879 et al. convention).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const ROUTE  = read('server/routes/office-actions.js');
const SCHEMA = read('server/schemas/office_action.schema.js');
const INDEX  = read('server/index.js');
const TAB    = read('public/js/tabs/office-tab.js');
const STATUS = read('public/js/suite/status.js');
const CSS    = read('public/css/suite.css');

// ── Route ──────────────────────────────────────────────────────────────────

describe('feature.691 — office_actions route', () => {
  it('has GET /latest_session handler', () =>
    expect(ROUTE).toContain("'/latest_session'"));

  it('validates actor !== target', () =>
    // issue-1143 (AC4): rewritten from a raw string comparison
    // (actor_id === target_id) to resolved-ObjectId equality, so a
    // hex-case-variant pair of the same id is still caught as a self-target.
    expect(ROUTE).toContain('actorObjectId.equals(targetObjectId)'));

  it('enforces paid budget via an atomic per-actor-per-session counter document', () =>
    // issue-1143: rewritten from a countDocuments() derived count (which two
    // concurrent requests could both read as under-budget) to a single
    // atomic conditional $inc on a dedicated counter document — a real
    // point of write contention MongoDB's transaction conflict detection
    // serializes correctly.
    expect(ROUTE).toContain("getCollection('office_action_budgets')"));

  it('enforces paid uniqueness per target via the partial unique index catching E11000 on insert', () =>
    // issue-1143: rewritten from a racing findOne() dedupe check to relying
    // on the partial unique index (server/index.js) rejecting a duplicate
    // insert outright — a real constraint violation, not a snapshot read.
    expect(ROUTE).toContain("err?.code === 11000"));

  it('atomically updates status.city on target character', () =>
    expect(ROUTE).toContain("'status.city'"));

  it('handles grant_first action type', () =>
    expect(ROUTE).toContain("'grant_first'"));

  it('handles strip_last action type', () =>
    expect(ROUTE).toContain("'strip_last'"));

  it('returns 409 CONFLICT on duplicate paid action', () =>
    expect(ROUTE).toContain('409'));

  it('returns 403 when budget exhausted', () =>
    expect(ROUTE).toContain('Budget exhausted'));
});

// ── Schema ─────────────────────────────────────────────────────────────────

describe('feature.691 — office_action schema', () => {
  it('requires game_session_id', () =>
    expect(SCHEMA).toContain('game_session_id'));

  it('requires actor_id and target_id', () => {
    expect(SCHEMA).toContain('actor_id');
    expect(SCHEMA).toContain('target_id');
  });

  it('enumerates all four action types', () => {
    expect(SCHEMA).toContain('grant_first');
    expect(SCHEMA).toContain('raise');
    expect(SCHEMA).toContain('lower');
    expect(SCHEMA).toContain('strip_last');
  });
});

// ── index.js mount ─────────────────────────────────────────────────────────

describe('feature.691 — server/index.js', () => {
  it('imports officeActionsRouter', () =>
    expect(INDEX).toContain("from './routes/office-actions.js'"));

  it('mounts at /api/office_actions with requireAuth', () =>
    expect(INDEX).toContain("'/api/office_actions'"));
});

// ── Office tab ─────────────────────────────────────────────────────────────

describe('feature.691 — office tab', () => {
  it('accepts chars as third parameter', () =>
    expect(TAB).toMatch(/function renderOfficeTab\s*\(el,\s*char,\s*chars/));

  it('gates interactive section on Head of State only, AND only your own office (otc.3)', () => {
    // otc.3: browsing someone else's Head of State reference must not also
    // gate on the raw category match alone — isOwnOffice must be part of it.
    // Two independent sites carry this gate: the HTML-shell branch that emits
    // the panel's markup, and the call that wires its interactivity. Codex
    // review (Pass 1, 2026-08-12) found the previous unanchored regex only
    // proved ONE of the two sites — a half-applied gate (markup gated,
    // wiring not, or vice versa) would still have passed.
    const gateMatches = [...TAB.matchAll(/category === 'Head of State' && isOwnOffice\)\s*\{/g)];
    expect(gateMatches.length).toBe(2);

    const [htmlGateIdx, wireGateIdx] = gateMatches.map(m => m.index);
    expect(TAB.slice(htmlGateIdx, htmlGateIdx + 400)).toContain('office-budget-line');
    expect(TAB.slice(wireGateIdx, wireGateIdx + 200)).toContain('_wireHosActions(el, char, chars)');
  });

  it('wires HoS actions after innerHTML is set', () =>
    expect(TAB).toContain('_wireHosActions'));

  it('uses charPicker component', () =>
    expect(TAB).toContain('charPicker'));

  it('POSTs to /api/office_actions', () =>
    expect(TAB).toContain('/api/office_actions'));

  it('fetches latest_session from /api/office_actions/latest_session', () =>
    expect(TAB).toContain('/api/office_actions/latest_session'));

  it('self-excludes actor from picker via excludeIds', () =>
    expect(TAB).toContain('excludeIds'));
});

// ── Status tab log ─────────────────────────────────────────────────────────

describe('feature.691 — status tab log', () => {
  it('includes office-log-slot in the HTML template', () =>
    expect(STATUS).toContain('office-log-slot'));

  it('calls appendOfficeActionsLog', () =>
    expect(STATUS).toContain('appendOfficeActionsLog'));

  it('appendOfficeActionsLog fetches latest_session', () =>
    expect(STATUS).toContain('/api/office_actions/latest_session'));

  it('appendOfficeActionsLog fetches actions by game_session_id', () =>
    expect(STATUS).toContain('/api/office_actions?game_session_id='));
});

// ── CSS ────────────────────────────────────────────────────────────────────

describe('feature.691 — suite.css', () => {
  it('adds base office tab styles', () =>
    expect(CSS).toContain('.office-tab'));

  it('office-status-power uses --gold-a6 token for its background', () => {
    // Confirm the tokenised value is present and that office-status-power
    // itself does not carry a bare rgba colour (pre-existing rules elsewhere
    // in the file are not the responsibility of this story).
    expect(CSS).toContain('background: var(--gold-a6)');
    expect(CSS).not.toContain('.office-status-power { font-family: var(--fb); font-size: 14px; color: var(--txt); line-height: 1.7; padding: 14px 16px; background: rgba(');
  });

  it('adds office-section-hd style', () =>
    expect(CSS).toContain('.office-section-hd'));

  it('styles budget exhausted state', () =>
    expect(CSS).toContain('.office-budget-line.exhausted'));

  it('styles office log rows', () =>
    expect(CSS).toContain('.office-log-row'));

  it('styles log actor and target spans', () => {
    expect(CSS).toContain('.office-log-actor');
    expect(CSS).toContain('.office-log-target');
  });
});
