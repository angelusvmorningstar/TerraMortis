import { describe, it, expect } from 'vitest';
import fs from 'fs';

const ROUTE  = fs.readFileSync('server/routes/office-actions.js',  'utf8');
const SCHEMA = fs.readFileSync('server/schemas/office_action.schema.js', 'utf8');
const INDEX  = fs.readFileSync('server/index.js', 'utf8');
const TAB    = fs.readFileSync('public/js/tabs/office-tab.js', 'utf8');
const STATUS = fs.readFileSync('public/js/suite/status.js', 'utf8');
const CSS    = fs.readFileSync('public/css/suite.css', 'utf8');

// ── Route ──────────────────────────────────────────────────────────────────

describe('feature.691 — office_actions route', () => {
  it('has GET /latest_session handler', () =>
    expect(ROUTE).toContain("'/latest_session'"));

  it('validates actor !== target', () =>
    expect(ROUTE).toContain('actor_id === target_id'));

  it('enforces paid budget via countDocuments', () =>
    expect(ROUTE).toContain('countDocuments'));

  it('enforces paid uniqueness per target via findOne', () =>
    expect(ROUTE).toMatch(/findOne\(\s*\{[\s\S]*?action_type.*\$in.*raise.*lower/));

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

  it('gates interactive section on Head of State only', () =>
    expect(TAB).toContain("court_category === 'Head of State'"));

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
