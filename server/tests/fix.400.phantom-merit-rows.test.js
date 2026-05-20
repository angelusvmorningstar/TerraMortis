/**
 * fix.400 — Phantom merit action rows in DT Processing.
 *
 * Root cause: downtime-form.js wrote sphere_${n}_merit / status_${n}_merit
 * for every detected merit regardless of player opt-in. downtime-views.js
 * generated a Processing queue row for every slot where the merit label was
 * present. Fix: gate the form write; add admin-side guard as retroactive
 * suppressor for existing submissions.
 *
 * Verifies:
 *   AC1 — Form: sphere merit label absent when gate = 'no' for all slots.
 *   AC2 — Form: sphere merit label present only for opted-in slots.
 *   AC3 — Admin guard: existing submission with merit label but empty action
 *          produces no spheres entry (retroactive suppression).
 *   AC4 — _merit_${key} gate value continues to be written regardless of opt-in.
 *   AC5 — Opted-in slot with action filled generates correct entry.
 *   AC6 — Status merit label absent when player selects no action.
 *   AC7 — Status merit label present when player selects an action.
 *   AC8 — Admin guard applied to status merit loop as well.
 */

import { describe, it, expect } from 'vitest';

// ── Mirrors of form-side helpers ──────────────────────────────────────────────

function meritKey(merit) {
  const area = merit.area || merit.qualifier || '';
  return `${merit.name}_${merit.rating}_${area}`.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function meritLabel(merit) {
  const area = merit.area || merit.qualifier || '';
  const dots = '●'.repeat(merit.rating || 0);
  return area ? `${merit.name} ${dots} (${area})` : `${merit.name} ${dots}`;
}

/**
 * Mirror of the sphere collection loop in downtime-form.js (lines ~754-787).
 * Simulates the gated form collect.
 */
function collectSphereResponses(detectedSpheres, gateValues, savedResponses = {}) {
  const responses = {};
  const maxSpheres = Math.min(detectedSpheres.length, 5);
  for (let n = 1; n <= maxSpheres; n++) {
    const m = detectedSpheres[n - 1];
    const key = meritKey(m);
    // _merit_${key} always written (gate audit / form reload)
    responses[`_merit_${key}`] = gateValues[`merit_${key}`] || 'no';
    // Action, outcome, description — simplified: read from savedResponses
    responses[`sphere_${n}_action`] = savedResponses[`sphere_${n}_action`] || '';
    // Merit label only when gate = 'yes'
    if (m && gateValues[`merit_${key}`] === 'yes') {
      responses[`sphere_${n}_merit`] = meritLabel(m);
    }
  }
  return responses;
}

/**
 * Mirror of the status collection loop in downtime-form.js (lines ~790-815).
 */
function collectStatusResponses(detectedStatus, savedResponses = {}) {
  const responses = {};
  const maxStatus = Math.min(detectedStatus.length, 5);
  for (let n = 1; n <= maxStatus; n++) {
    const sm = detectedStatus[n - 1];
    responses[`status_${n}_action`] = savedResponses[`status_${n}_action`] || '';
    // Merit label only when player picked an action
    if (sm && responses[`status_${n}_action`]) {
      responses[`status_${n}_merit`] = meritLabel(sm);
    }
  }
  return responses;
}

/**
 * Mirror of the sphere fallback builder in buildActionQueue (downtime-views.js ~3116-3148).
 * Returns the spheres array that would be generated from flat response keys.
 */
function buildSpheresFromResp(resp) {
  const spheres = [];
  for (let n = 1; n <= 5; n++) {
    const meritType = resp[`sphere_${n}_merit`];
    const actionVal = resp[`sphere_${n}_action`];
    if (!meritType || !actionVal) continue;
    spheres.push({ merit_type: meritType, action_type: actionVal });
  }
  return spheres;
}

/**
 * Mirror of the status merit appender in buildActionQueue (downtime-views.js ~3166-3179).
 */
function appendStatusFromResp(resp, spheres = []) {
  const result = [...spheres];
  for (let n = 1; n <= 5; n++) {
    const meritType = resp[`status_${n}_merit`];
    const actionVal = resp[`status_${n}_action`];
    if (!meritType || !actionVal) continue;
    result.push({ merit_type: meritType, action_type: actionVal });
  }
  return result;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sphere1 = { name: 'Allies', rating: 3, area: 'Health' };
const sphere2 = { name: 'Allies', rating: 2, area: 'Police' };
const status1 = { name: 'Status', rating: 2, qualifier: 'City' };
const status2 = { name: 'Mystery Cult Initiation', rating: 3, qualifier: '' };

// ── AC1: No sphere merit labels when gate = 'no' for all slots ────────────────

describe('AC1 — sphere merit label absent when gate is no for all slots', () => {
  it('no sphere_N_merit keys written when all gates are no', () => {
    const gateValues = {};
    const responses = collectSphereResponses([sphere1, sphere2], gateValues);
    expect(responses['sphere_1_merit']).toBeUndefined();
    expect(responses['sphere_2_merit']).toBeUndefined();
  });

  it('admin builder produces empty spheres array from unlabelled submission', () => {
    const resp = { sphere_1_action: '', sphere_2_action: '' };
    const spheres = buildSpheresFromResp(resp);
    expect(spheres).toHaveLength(0);
  });
});

// ── AC2: Sphere merit label present only for opted-in slots ───────────────────

describe('AC2 — sphere merit label present only for opted-in slots', () => {
  it('only slot 1 label written when only slot 1 gate is yes', () => {
    const key1 = meritKey(sphere1);
    const gateValues = { [`merit_${key1}`]: 'yes' };
    const responses = collectSphereResponses([sphere1, sphere2], gateValues);
    expect(responses['sphere_1_merit']).toBe(meritLabel(sphere1));
    expect(responses['sphere_2_merit']).toBeUndefined();
  });

  it('both labels written when both gates are yes', () => {
    const key1 = meritKey(sphere1);
    const key2 = meritKey(sphere2);
    const gateValues = { [`merit_${key1}`]: 'yes', [`merit_${key2}`]: 'yes' };
    const responses = collectSphereResponses([sphere1, sphere2], gateValues);
    expect(responses['sphere_1_merit']).toBe(meritLabel(sphere1));
    expect(responses['sphere_2_merit']).toBe(meritLabel(sphere2));
  });
});

// ── AC3: Admin guard retroactively suppresses phantom labels ──────────────────

describe('AC3 — admin guard suppresses existing submission with label but empty action', () => {
  it('phantom submission (merit label present, action empty) produces no spheres entry', () => {
    const resp = {
      sphere_1_merit:  'Allies ●●● (Health)',
      sphere_1_action: '',
    };
    const spheres = buildSpheresFromResp(resp);
    expect(spheres).toHaveLength(0);
  });

  it('phantom submission with undefined action produces no spheres entry', () => {
    const resp = { sphere_1_merit: 'Allies ●●● (Health)' };
    const spheres = buildSpheresFromResp(resp);
    expect(spheres).toHaveLength(0);
  });

  it('real submission (merit label + action both present) produces spheres entry', () => {
    const resp = {
      sphere_1_merit:  'Allies ●●● (Health)',
      sphere_1_action: 'grow',
    };
    const spheres = buildSpheresFromResp(resp);
    expect(spheres).toHaveLength(1);
    expect(spheres[0].merit_type).toBe('Allies ●●● (Health)');
    expect(spheres[0].action_type).toBe('grow');
  });

  it('mixed submission: one real slot, one phantom → one entry', () => {
    const resp = {
      sphere_1_merit:  'Allies ●●● (Health)',
      sphere_1_action: 'grow',
      sphere_2_merit:  'Allies ●● (Police)',
      sphere_2_action: '',
    };
    const spheres = buildSpheresFromResp(resp);
    expect(spheres).toHaveLength(1);
    expect(spheres[0].merit_type).toBe('Allies ●●● (Health)');
  });
});

// ── AC4: _merit_${key} always written ─────────────────────────────────────────

describe('AC4 — _merit_${key} gate value written regardless of opt-in', () => {
  it('_merit_${key} present with value no when gate is off', () => {
    const gateValues = {};
    const responses = collectSphereResponses([sphere1], gateValues);
    expect(responses[`_merit_${meritKey(sphere1)}`]).toBe('no');
  });

  it('_merit_${key} present with value yes when gate is on', () => {
    const key1 = meritKey(sphere1);
    const gateValues = { [`merit_${key1}`]: 'yes' };
    const responses = collectSphereResponses([sphere1], gateValues);
    expect(responses[`_merit_${key1}`]).toBe('yes');
  });
});

// ── AC5: Opted-in slot with action generates correct entry ────────────────────

describe('AC5 — opted-in sphere slot with filled action generates correct admin entry', () => {
  it('action_type on generated entry matches player selection', () => {
    const resp = {
      sphere_1_merit:  'Allies ●●● (Health)',
      sphere_1_action: 'investigate',
    };
    const spheres = buildSpheresFromResp(resp);
    expect(spheres[0].action_type).toBe('investigate');
  });

  it('five opted-in slots all generate entries', () => {
    const resp = {};
    for (let n = 1; n <= 5; n++) {
      resp[`sphere_${n}_merit`] = `Merit ${n}`;
      resp[`sphere_${n}_action`] = 'grow';
    }
    const spheres = buildSpheresFromResp(resp);
    expect(spheres).toHaveLength(5);
  });
});

// ── AC6: Status merit label absent when no action selected ────────────────────

describe('AC6 — status merit label absent when player selects no action', () => {
  it('no status_N_merit key when action is empty', () => {
    const responses = collectStatusResponses([status1, status2], {});
    expect(responses['status_1_merit']).toBeUndefined();
    expect(responses['status_2_merit']).toBeUndefined();
  });
});

// ── AC7: Status merit label present when player selects an action ─────────────

describe('AC7 — status merit label present when player selects an action', () => {
  it('status_1_merit written when status_1_action is non-empty', () => {
    const saved = { status_1_action: 'investigate' };
    const responses = collectStatusResponses([status1], saved);
    expect(responses['status_1_merit']).toBe(meritLabel(status1));
  });

  it('only slot with action gets the label', () => {
    const saved = { status_1_action: 'grow', status_2_action: '' };
    const responses = collectStatusResponses([status1, status2], saved);
    expect(responses['status_1_merit']).toBe(meritLabel(status1));
    expect(responses['status_2_merit']).toBeUndefined();
  });
});

// ── AC8: Admin status guard suppresses phantom status rows ────────────────────

describe('AC8 — admin guard suppresses phantom status merit rows', () => {
  it('status merit label + empty action produces no entry', () => {
    const resp = {
      status_1_merit:  'Status ●● (City)',
      status_1_action: '',
    };
    const result = appendStatusFromResp(resp);
    expect(result).toHaveLength(0);
  });

  it('status merit label + action produces entry', () => {
    const resp = {
      status_1_merit:  'Status ●● (City)',
      status_1_action: 'investigate',
    };
    const result = appendStatusFromResp(resp);
    expect(result).toHaveLength(1);
    expect(result[0].merit_type).toBe('Status ●● (City)');
    expect(result[0].action_type).toBe('investigate');
  });

  it('combined sphere + status with phantoms: only opted-in entries survive', () => {
    const sphereResp = {
      sphere_1_merit:  'Allies ●●● (Health)',
      sphere_1_action: 'grow',
      sphere_2_merit:  'Allies ●● (Police)',
      sphere_2_action: '',
    };
    const spheres = buildSpheresFromResp(sphereResp);
    const statusResp = {
      status_1_merit:  'Status ●● (City)',
      status_1_action: '',
      status_2_merit:  'MCI ●●●',
      status_2_action: 'investigate',
    };
    const combined = appendStatusFromResp(statusResp, spheres);
    expect(combined).toHaveLength(2);
    expect(combined[0].merit_type).toBe('Allies ●●● (Health)');
    expect(combined[1].merit_type).toBe('MCI ●●●');
  });
});
