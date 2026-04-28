/**
 * Unit tests — JDT-5 compilePushOutcome joint injection.
 *
 * `compilePushOutcome(sub, char, cycle)` lives in the browser admin module
 * `public/js/admin/downtime-story.js`. We dynamic-import it here after
 * stubbing the browser globals it touches at module-load (location,
 * localStorage). The function is otherwise pure — it takes the submission,
 * its character, and the cycle, and produces the published outcome markdown.
 *
 * Coverage:
 *   - Lead's published outcome carries the joint heading + outcome
 *   - Support's published outcome interleaves personal_notes
 *   - Decoupled support reverts to the solo project_responses path
 *   - Cancelled joint reverts to the solo project_responses path
 *   - Empty st_joint_outcome shows the gap-text placeholder
 *   - Non-participant submissions are unaffected
 */

// ── Browser shims (must run before the module import) ───────────────────────
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
  addEventListener: () => {},
  createElement: () => ({ style: {}, addEventListener: () => {}, appendChild: () => {} }),
  getElementById: () => null,
};

import { describe, it, expect, beforeAll } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';

let compilePushOutcome;

beforeAll(async () => {
  const moduleUrl = pathToFileURL(
    pathResolve(__dirname, '..', '..', 'public', 'js', 'admin', 'downtime-story.js')
  ).href;
  const mod = await import(moduleUrl);
  compilePushOutcome = mod.compilePushOutcome;
});

// ── Fixtures ────────────────────────────────────────────────────────────────

const LEAD_SUB_ID = 'sub_lead_001';
const SUPPORT_SUB_ID = 'sub_support_001';
const SUPPORT2_SUB_ID = 'sub_support_002';
const NON_PARTICIPANT_SUB_ID = 'sub_other_001';

const LEAD_CHAR_ID = 'char_lead_001';
const SUPPORT_CHAR_ID = 'char_support_001';
const SUPPORT2_CHAR_ID = 'char_support_002';
const OTHER_CHAR_ID = 'char_other_001';

function makeJoint(overrides = {}) {
  return {
    _id: 'joint_001',
    lead_character_id: LEAD_CHAR_ID,
    lead_submission_id: LEAD_SUB_ID,
    lead_project_slot: 1,
    description: 'Burn down the abandoned warehouse on the docks.',
    action_type: 'attack',
    target_type: 'territory',
    target_value: 'dockyards',
    description_updated_at: null,
    st_joint_outcome: 'The warehouse goes up in green flame; witnesses dispersed before sunrise.',
    participants: [
      {
        invitation_id: 'inv_001',
        character_id: SUPPORT_CHAR_ID,
        submission_id: SUPPORT_SUB_ID,
        project_slot: 2,
        joined_at: '2026-04-27T10:00:00Z',
        decoupled_at: null,
        description_change_acknowledged_at: '2026-04-27T10:00:00Z',
      },
    ],
    created_at: '2026-04-27T09:00:00Z',
    cancelled_at: null,
    cancelled_reason: null,
    ...overrides,
  };
}

function makeCycle(joint) {
  return {
    _id: 'cycle_test_001',
    label: 'JDT-5 Test Cycle',
    status: 'active',
    joint_projects: joint ? [joint] : [],
  };
}

// Minimal sub: only the projects_resolved + responses paths matter for the
// project_responses section. We use only the field set the function reads.
//
// `forceHasContent` injects a general_notes value so compilePushOutcome
// returns its assembled parts even when every other section produces only
// gap-text (the function returns '' when nothing flips hasContent=true).
// Use this on cases that test gap-text presence — without it, the gap-text
// is correctly assembled internally but the function emits '' as the publish
// no-op.
function makeSub({ _id, charId, projectsResolved = [], responses = {}, forceHasContent = false }) {
  return {
    _id,
    character_id: charId,
    cycle_id: 'cycle_test_001',
    status: 'submitted',
    responses,
    projects_resolved: projectsResolved,
    merit_actions: [],
    merit_actions_resolved: [],
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
    feeding_review: { pool_status: 'no_feed' },
    st_narrative: {
      project_responses: [],
      ...(forceHasContent ? { general_notes: '_test general notes_' } : {}),
    },
  };
}

// Minimal char object — compilePushOutcome only needs displayName(c) and
// fields used by getApplicableSections (covenant / clan etc. don't gate
// project_responses, just merit sections we don't touch here).
function makeChar(_id, name) {
  return { _id, name, moniker: '', honorific: '' };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('compilePushOutcome — JDT-5 joint injection', () => {
  it('lead: published outcome carries joint heading + st_joint_outcome', () => {
    const joint = makeJoint();
    const cycle = makeCycle(joint);
    const sub = makeSub({
      _id: LEAD_SUB_ID,
      charId: LEAD_CHAR_ID,
      // Lead's slot 1 is part of the joint. projects_resolved[0] exists so
      // the project_responses iterator visits it.
      projectsResolved: [{ pool: { total: 5, expression: 'Strength + Brawl' } }],
      responses: { project_1_action: 'attack' },
    });
    const out = compilePushOutcome(sub, makeChar(LEAD_CHAR_ID, 'Lead Char'), cycle);

    expect(out).toMatch(/Joint, you led/);
    expect(out).toContain(joint.st_joint_outcome);
    // Lead heading should NOT include the support's contribution paragraph.
    expect(out).not.toMatch(/Your contribution/);
    // Heading should snip the description.
    expect(out).toMatch(/## Burn down the abandoned warehouse on the docks\./);
  });

  it('support: published outcome interleaves personal_notes', () => {
    const joint = makeJoint();
    const cycle = makeCycle(joint);
    const sub = makeSub({
      _id: SUPPORT_SUB_ID,
      charId: SUPPORT_CHAR_ID,
      projectsResolved: [
        null,
        { pool: { total: 4, expression: 'Wits + Larceny' }, joint_id: joint._id, joint_role: 'support' },
      ],
      responses: {
        project_2_action: 'attack',
        project_2_joint_id: joint._id,
        project_2_joint_role: 'support',
        project_2_personal_notes: 'I bring the matches and a getaway car.',
      },
    });
    const out = compilePushOutcome(sub, makeChar(SUPPORT_CHAR_ID, 'Support Char'), cycle);

    expect(out).toMatch(/Joint with /);
    expect(out).toContain(joint.st_joint_outcome);
    expect(out).toMatch(/\*Your contribution: I bring the matches and a getaway car\.\*/);
    // Support should NOT see the lead's "you led" framing.
    expect(out).not.toMatch(/you led/);
  });

  it('support without personal_notes: outcome present, no contribution paragraph', () => {
    const joint = makeJoint();
    const cycle = makeCycle(joint);
    const sub = makeSub({
      _id: SUPPORT_SUB_ID,
      charId: SUPPORT_CHAR_ID,
      projectsResolved: [
        null,
        { joint_id: joint._id, joint_role: 'support' },
      ],
      responses: {
        project_2_action: 'attack',
        project_2_joint_role: 'support',
      },
    });
    const out = compilePushOutcome(sub, makeChar(SUPPORT_CHAR_ID, 'Support Char'), cycle);

    expect(out).toContain(joint.st_joint_outcome);
    expect(out).not.toMatch(/Your contribution/);
  });

  it('decoupled support: reverts to solo project_responses path', () => {
    const joint = makeJoint({
      participants: [
        {
          invitation_id: 'inv_001',
          character_id: SUPPORT_CHAR_ID,
          submission_id: SUPPORT_SUB_ID,
          project_slot: 2,
          joined_at: '2026-04-27T10:00:00Z',
          decoupled_at: '2026-04-27T18:00:00Z', // decoupled
          description_change_acknowledged_at: '2026-04-27T10:00:00Z',
        },
      ],
    });
    const cycle = makeCycle(joint);
    const sub = makeSub({
      _id: SUPPORT_SUB_ID,
      charId: SUPPORT_CHAR_ID,
      projectsResolved: [null, { pool: { total: 3, expression: 'X + Y' } }],
      responses: { project_2_action: 'attack', project_2_title: 'My Solo Slot 2' },
      forceHasContent: true,
    });
    const out = compilePushOutcome(sub, makeChar(SUPPORT_CHAR_ID, 'Support Char'), cycle);

    // No joint heading anywhere — slot reverted to solo path.
    expect(out).not.toMatch(/Joint with/);
    expect(out).not.toMatch(/Joint, you led/);
    expect(out).not.toContain(joint.st_joint_outcome);
    // Solo path produces a gap-text section under the slot title.
    expect(out).toMatch(/## My Solo Slot 2/);
  });

  it('cancelled joint: reverts to solo project_responses path', () => {
    const joint = makeJoint({ cancelled_at: '2026-04-27T20:00:00Z', cancelled_reason: 'st-override' });
    const cycle = makeCycle(joint);
    const sub = makeSub({
      _id: LEAD_SUB_ID,
      charId: LEAD_CHAR_ID,
      projectsResolved: [{ pool: { total: 5, expression: 'A + B' } }],
      responses: { project_1_action: 'attack', project_1_title: 'My Solo Slot 1' },
      forceHasContent: true,
    });
    const out = compilePushOutcome(sub, makeChar(LEAD_CHAR_ID, 'Lead Char'), cycle);

    expect(out).not.toMatch(/Joint, you led/);
    expect(out).not.toMatch(/Joint with/);
    expect(out).not.toContain(joint.st_joint_outcome);
    expect(out).toMatch(/## My Solo Slot 1/);
  });

  it('empty st_joint_outcome: gap text placeholder, joint heading still rendered', () => {
    const joint = makeJoint({ st_joint_outcome: '' });
    const cycle = makeCycle(joint);
    const sub = makeSub({
      _id: LEAD_SUB_ID,
      charId: LEAD_CHAR_ID,
      projectsResolved: [{ pool: { total: 5, expression: 'A + B' } }],
      responses: { project_1_action: 'attack' },
      forceHasContent: true,
    });
    const out = compilePushOutcome(sub, makeChar(LEAD_CHAR_ID, 'Lead Char'), cycle);

    // Heading still renders; outcome body absent.
    expect(out).toMatch(/Joint, you led/);
    expect(out).not.toMatch(/witnesses dispersed before sunrise/);
  });

  it('non-participant submission: untouched, no joint content leaks in', () => {
    const joint = makeJoint();
    const cycle = makeCycle(joint);
    const sub = makeSub({
      _id: NON_PARTICIPANT_SUB_ID,
      charId: OTHER_CHAR_ID,
      projectsResolved: [{ pool: { total: 5, expression: 'A + B' } }],
      responses: { project_1_action: 'investigate', project_1_title: 'Mind My Own Business' },
      forceHasContent: true,
    });
    const out = compilePushOutcome(sub, makeChar(OTHER_CHAR_ID, 'Other Char'), cycle);

    expect(out).not.toMatch(/Joint with/);
    expect(out).not.toMatch(/Joint, you led/);
    expect(out).not.toContain(joint.st_joint_outcome);
    // Solo slot title still renders.
    expect(out).toMatch(/## Mind My Own Business/);
  });

  it('publish no-op: when nothing is complete and no joint outcome, returns empty string', () => {
    // Documents the existing publish-gating behaviour: gap-text alone does
    // not flip hasContent, so compilePushOutcome emits '' as the no-op
    // signal. This applies to joint slots too (empty st_joint_outcome).
    const joint = makeJoint({ st_joint_outcome: '' });
    const cycle = makeCycle(joint);
    const sub = makeSub({
      _id: LEAD_SUB_ID,
      charId: LEAD_CHAR_ID,
      projectsResolved: [{ pool: { total: 5, expression: 'A + B' } }],
      responses: { project_1_action: 'attack' },
      // Note: no forceHasContent — the sub has nothing complete.
    });
    const out = compilePushOutcome(sub, makeChar(LEAD_CHAR_ID, 'Lead Char'), cycle);
    expect(out).toBe('');
  });
});
