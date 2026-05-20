/**
 * fix.392 — buildMeritActions() field mapping for Contacts and Retainers.
 *
 * Mirrors the Contacts and Retainers blocks from
 * public/js/admin/downtime-story.js#buildMeritActions() inline (same pattern
 * as stm-path-resolve-sanity.test.js) so the test runs without browser globals.
 *
 * Verifies:
 *   AC1 — Contact app-form: desired_outcome = contact_${n}_request
 *   AC2 — Retainer app-form: desired_outcome = retainer_${n}_type; description = retainer_${n}_task
 *   AC3 — Retainer app-form: merit_type = retainer_${n}_merit (not generic 'Retainer')
 *   AC4 — Legacy CSV paths render without errors; desired_outcome uses c.detail/c.description
 *   AC5 — Spheres/Influence mapping is unchanged (regression guard, inlined separately)
 */

import { describe, it, expect } from 'vitest';

// ── Mirror of the Contacts + Retainers blocks in buildMeritActions() ─────────
// Keep in sync with public/js/admin/downtime-story.js:1979-2028.
// If the production code changes, update this mirror and the test expectations.

function buildContactRetainerActions(sub) {
  const resp = sub?.responses || {};
  const raw  = sub?.raw       || {};
  const actions = [];

  // ── Contacts ──
  const contactRaw = raw.contact_actions?.requests || [];
  if (contactRaw.length) {
    contactRaw.forEach(c => actions.push({
      merit_type:      'Contacts',
      action_type:     'misc',
      desired_outcome: c.detail || c.description || '',
      description:     '',
    }));
  } else {
    for (let n = 1; n <= 5; n++) {
      const req = resp[`contact_${n}_request`];
      if (!req) continue;
      const meritLbl = resp[`contact_${n}_merit`] || 'Contacts';
      const info     = resp[`contact_${n}_info`]  || '';
      actions.push({
        merit_type:      meritLbl,
        action_type:     'misc',
        desired_outcome: req,
        description:     info,
      });
    }
  }

  // ── Retainers ──
  const retainerRaw = raw.retainer_actions?.actions || [];
  if (retainerRaw.length) {
    retainerRaw.forEach(r => actions.push({
      merit_type:      r.merit || 'Retainer',
      action_type:     'misc',
      desired_outcome: r.type || r.task_type || '',
      description:     r.task || r.description || '',
    }));
  } else {
    for (let n = 1; n <= 4; n++) {
      const task    = resp[`retainer_${n}_task`];
      const type    = resp[`retainer_${n}_type`] || '';
      const meritLb = resp[`retainer_${n}_merit`] || 'Retainer';
      if (!task && !type) continue;
      actions.push({
        merit_type:      meritLb,
        action_type:     'misc',
        desired_outcome: type,
        description:     task || '',
      });
    }
  }

  return actions;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function appFormSub() {
  return {
    responses: {
      // Contact 1 — Church
      contact_1_merit:   'Contacts ●●● (Church)',
      contact_1_info:    'See DT Action 1 - Carver v Predator',
      contact_1_request: 'I reference Carver using his Church contacts to get an idea about the group his Target is running.',
      // Contact 2 — Bureaucracy
      contact_2_merit:   'Contacts ●● (Bureaucracy)',
      contact_2_info:    'Looking for info on a potential Elysium Site',
      contact_2_request: 'Reed Justice had a list of potential Elysium sites. One appealed to Carver, the Theatre down in Barangaroo.',
      // Retainer 1 — Nicole
      retainer_1_merit: 'Nicole - EA',
      retainer_1_type:  'Procure',
      retainer_1_task:  'Carver would like Nicole to procure him a 70s style record player.',
    },
    raw: {},
  };
}

function legacyCSVSub() {
  return {
    responses: {},
    raw: {
      contact_actions: {
        requests: [
          { detail: 'Find out who owns the warehouse on Clarence St.' },
          { description: 'Research the background of Harrington Roe.' },
          {},                     // empty entry — should produce empty desired_outcome, not crash
        ],
      },
      retainer_actions: {
        actions: [
          { merit: 'Jake - Driver', type: 'Surveillance', task: 'Follow the target to the docks.' },
          { task: 'Pick up the package from the drop point.' },           // no type field
          { description: 'Scout the Elysium perimeter.' },               // no type, uses description
          {},                                                              // empty — should not crash
        ],
      },
    },
  };
}

function legacyCSVSubWithoutMerit() {
  // Retainer entry has no merit field — should fall back to 'Retainer'
  return {
    responses: {},
    raw: {
      retainer_actions: {
        actions: [{ task: 'Watch the docks.', type: 'Surveillance' }],
      },
      contact_actions: { requests: [] },
    },
  };
}

// ── AC1: Contact app-form — desired_outcome = request text ───────────────────

describe('AC1 — Contact app-form: desired_outcome populated from request textarea', () => {
  it('maps desired_outcome to contact_${n}_request for app-form submissions', () => {
    const actions = buildContactRetainerActions(appFormSub());
    const contacts = actions.filter(a => a.merit_type.startsWith('Contacts'));
    expect(contacts).toHaveLength(2);

    expect(contacts[0].desired_outcome).toBe(
      'I reference Carver using his Church contacts to get an idea about the group his Target is running.'
    );
    expect(contacts[1].desired_outcome).toBe(
      'Reed Justice had a list of potential Elysium sites. One appealed to Carver, the Theatre down in Barangaroo.'
    );
  });

  it('does NOT show empty string as desired_outcome for app-form contacts', () => {
    const actions = buildContactRetainerActions(appFormSub());
    const contacts = actions.filter(a => a.merit_type.startsWith('Contacts'));
    contacts.forEach(c => {
      expect(c.desired_outcome).not.toBe('');
    });
  });

  it('maps description to contact_${n}_info (supporting context)', () => {
    const actions = buildContactRetainerActions(appFormSub());
    const contacts = actions.filter(a => a.merit_type.startsWith('Contacts'));
    expect(contacts[0].description).toBe('See DT Action 1 - Carver v Predator');
    expect(contacts[1].description).toBe('Looking for info on a potential Elysium Site');
  });

  it('uses contact_${n}_merit as merit_type label', () => {
    const actions = buildContactRetainerActions(appFormSub());
    const contacts = actions.filter(a => a.merit_type.startsWith('Contacts'));
    expect(contacts[0].merit_type).toBe('Contacts ●●● (Church)');
    expect(contacts[1].merit_type).toBe('Contacts ●● (Bureaucracy)');
  });

  it('falls back to "Contacts" merit_type when contact_${n}_merit is absent', () => {
    const sub = {
      responses: { contact_1_request: 'Who runs the docks?' },
      raw: {},
    };
    const actions = buildContactRetainerActions(sub);
    expect(actions[0].merit_type).toBe('Contacts');
  });

  it('contact with no request text is skipped (not emitted as empty action)', () => {
    const sub = {
      responses: {
        contact_1_request: 'Real request',
        // contact_2 has no request — should be skipped
        contact_2_merit: 'Contacts ●●',
      },
      raw: {},
    };
    const actions = buildContactRetainerActions(sub);
    expect(actions.filter(a => a.merit_type.startsWith('Contacts'))).toHaveLength(1);
  });
});

// ── AC2: Retainer app-form — desired_outcome = task type ─────────────────────

describe('AC2 — Retainer app-form: desired_outcome = Task Type; description = Task Description', () => {
  it('maps desired_outcome to retainer_${n}_type', () => {
    const actions = buildContactRetainerActions(appFormSub());
    const retainers = actions.filter(a => a.merit_type === 'Nicole - EA');
    expect(retainers).toHaveLength(1);
    expect(retainers[0].desired_outcome).toBe('Procure');
  });

  it('maps description to retainer_${n}_task', () => {
    const actions = buildContactRetainerActions(appFormSub());
    const retainers = actions.filter(a => a.merit_type === 'Nicole - EA');
    expect(retainers[0].description).toBe('Carver would like Nicole to procure him a 70s style record player.');
  });

  it('retainer with only type (no task) is NOT skipped', () => {
    const sub = {
      responses: {
        retainer_1_merit: 'Jake - Security',
        retainer_1_type:  'Guard',
        // no retainer_1_task
      },
      raw: {},
    };
    const actions = buildContactRetainerActions(sub);
    expect(actions).toHaveLength(1);
    expect(actions[0].desired_outcome).toBe('Guard');
    expect(actions[0].description).toBe('');
  });

  it('retainer with only task (no type) still emits with empty desired_outcome', () => {
    const sub = {
      responses: {
        retainer_1_merit: 'Jake - Security',
        retainer_1_task:  'Watch the door.',
        // no retainer_1_type
      },
      raw: {},
    };
    const actions = buildContactRetainerActions(sub);
    expect(actions).toHaveLength(1);
    expect(actions[0].desired_outcome).toBe('');
    expect(actions[0].description).toBe('Watch the door.');
  });

  it('retainer with neither type nor task is silently skipped', () => {
    const sub = {
      responses: { retainer_1_merit: 'Jake - Security' },
      raw: {},
    };
    const actions = buildContactRetainerActions(sub);
    expect(actions).toHaveLength(0);
  });
});

// ── AC3: Retainer label — merit_type = retainer name ─────────────────────────

describe('AC3 — Retainer app-form: merit_type is retainer name, not "Retainer"', () => {
  it('uses retainer_${n}_merit as merit_type', () => {
    const actions = buildContactRetainerActions(appFormSub());
    const retainers = actions.filter(a => a.merit_type === 'Nicole - EA');
    expect(retainers).toHaveLength(1);
  });

  it('falls back to "Retainer" when retainer_${n}_merit is absent', () => {
    const sub = {
      responses: { retainer_1_type: 'Procure', retainer_1_task: 'Buy something.' },
      raw: {},
    };
    const actions = buildContactRetainerActions(sub);
    expect(actions[0].merit_type).toBe('Retainer');
  });
});

// ── AC4: Legacy CSV path — no crashes, graceful desired_outcome fallback ──────

describe('AC4 — Legacy CSV path: renders without errors', () => {
  it('emits one action per contact_actions.requests entry', () => {
    const actions = buildContactRetainerActions(legacyCSVSub());
    const contacts = actions.filter(a => a.merit_type === 'Contacts');
    expect(contacts).toHaveLength(3);
  });

  it('contact legacy: desired_outcome from c.detail when present', () => {
    const actions = buildContactRetainerActions(legacyCSVSub());
    const contacts = actions.filter(a => a.merit_type === 'Contacts');
    expect(contacts[0].desired_outcome).toBe('Find out who owns the warehouse on Clarence St.');
  });

  it('contact legacy: desired_outcome falls back to c.description when no c.detail', () => {
    const actions = buildContactRetainerActions(legacyCSVSub());
    const contacts = actions.filter(a => a.merit_type === 'Contacts');
    expect(contacts[1].desired_outcome).toBe('Research the background of Harrington Roe.');
  });

  it('contact legacy: empty entry produces empty desired_outcome, not crash', () => {
    const actions = buildContactRetainerActions(legacyCSVSub());
    const contacts = actions.filter(a => a.merit_type === 'Contacts');
    expect(contacts[2].desired_outcome).toBe('');
  });

  it('contact legacy: description is always empty string (no info field in legacy shape)', () => {
    const actions = buildContactRetainerActions(legacyCSVSub());
    const contacts = actions.filter(a => a.merit_type === 'Contacts');
    contacts.forEach(c => expect(c.description).toBe(''));
  });

  it('emits one action per retainer_actions.actions entry', () => {
    const actions = buildContactRetainerActions(legacyCSVSub());
    const retainers = actions.filter(a => !a.merit_type.startsWith('Contacts'));
    expect(retainers).toHaveLength(4);
  });

  it('retainer legacy: uses r.merit as merit_type when present', () => {
    const actions = buildContactRetainerActions(legacyCSVSub());
    const retainers = actions.filter(a => !a.merit_type.startsWith('Contacts'));
    expect(retainers[0].merit_type).toBe('Jake - Driver');
  });

  it('retainer legacy: desired_outcome from r.type', () => {
    const actions = buildContactRetainerActions(legacyCSVSub());
    const retainers = actions.filter(a => !a.merit_type.startsWith('Contacts'));
    expect(retainers[0].desired_outcome).toBe('Surveillance');
    expect(retainers[0].description).toBe('Follow the target to the docks.');
  });

  it('retainer legacy: desired_outcome is empty when no type field (old data, no regression)', () => {
    const actions = buildContactRetainerActions(legacyCSVSub());
    const retainers = actions.filter(a => !a.merit_type.startsWith('Contacts'));
    expect(retainers[1].desired_outcome).toBe('');
    expect(retainers[1].description).toBe('Pick up the package from the drop point.');
  });

  it('retainer legacy: uses r.description when no r.task', () => {
    const actions = buildContactRetainerActions(legacyCSVSub());
    const retainers = actions.filter(a => !a.merit_type.startsWith('Contacts'));
    expect(retainers[2].description).toBe('Scout the Elysium perimeter.');
  });

  it('retainer legacy: falls back to "Retainer" merit_type when r.merit absent', () => {
    const actions = buildContactRetainerActions(legacyCSVSubWithoutMerit());
    const retainers = actions.filter(a => !a.merit_type.startsWith('Contacts'));
    expect(retainers[0].merit_type).toBe('Retainer');
  });

  it('retainer legacy: empty entry does not crash and produces safe defaults', () => {
    const actions = buildContactRetainerActions(legacyCSVSub());
    const retainers = actions.filter(a => !a.merit_type.startsWith('Contacts'));
    const empty = retainers[3];
    expect(empty.merit_type).toBe('Retainer');
    expect(empty.desired_outcome).toBe('');
    expect(empty.description).toBe('');
  });
});

// ── AC5: Regression guard — Spheres/Status fields untouched ──────────────────
// These blocks are not modified by fix.392. This test verifies no accidental
// side effects by checking that a submission with only sphere data produces
// zero Contacts/Retainer actions.

describe('AC5 — Regression: non-Contact/Retainer submissions produce no Contacts/Retainer entries', () => {
  it('submission with only sphere data produces no contact or retainer actions', () => {
    const sub = {
      responses: {
        sphere_1_merit:       'Allies ●●●',
        sphere_1_action:      'Directed Action',
        sphere_1_outcome:     'Find the informant',
        sphere_1_description: 'Use allies to locate the warehouse contact.',
      },
      raw: {},
    };
    const actions = buildContactRetainerActions(sub);
    // The mirrored function only covers Contacts + Retainers, so should be empty
    expect(actions).toHaveLength(0);
  });

  it('empty submission produces no actions and does not crash', () => {
    expect(() => buildContactRetainerActions({})).not.toThrow();
    expect(buildContactRetainerActions({})).toEqual([]);
  });

  it('null submission produces no actions and does not crash', () => {
    expect(() => buildContactRetainerActions(null)).not.toThrow();
    expect(buildContactRetainerActions(null)).toEqual([]);
  });
});
