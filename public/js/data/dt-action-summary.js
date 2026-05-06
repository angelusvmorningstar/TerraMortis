/**
 * Action-spent summary for the Submit Final modal (ADR-003 §Q5,
 * story dt-form.31). Walks `responses` and the caller-supplied totals
 * to produce a structured `{ used, total }` count per category.
 *
 * Pure ESM. No DOM. The caller (downtime-form.js) supplies the
 * total counts since they depend on character-derived state
 * (detectedMerits, projectSlots, dynamic acquisition/equipment
 * slot counts) that lives in the form module.
 *
 * Per ADR §Q9: an ADVANCED player who only filled MINIMAL still
 * sees the modal — their counts will read mostly 0/N. The helper
 * makes that legible rather than exceptional.
 *
 * Returned shape:
 *   {
 *     personal_actions: { used, total },
 *     sphere_actions:   { used, total },
 *     status_actions:   { used, total },
 *     contact_actions:  { used, total },
 *     retainer_actions: { used, total },
 *     acquisition_slots:{ used, total },
 *     sorcery_slots:    { used, total },
 *     equipment_slots:  { used, total },
 *     xp_spend_slots:   { used, total },  // projects whose action === 'xp_spend'
 *   }
 */

function _nonEmpty(v) {
  return typeof v === 'string' ? v.trim().length > 0 : !!v;
}

/**
 * @param {object} responses              — submission.responses
 * @param {object} totals                 — caller-supplied per-category caps
 * @param {number} totals.projectSlots
 * @param {number} totals.sphereSlots
 * @param {number} totals.statusSlots
 * @param {number} totals.contactSlots
 * @param {number} totals.retainerSlots
 * @param {number} totals.acquisitionSlots
 * @param {number} totals.sorcerySlots
 * @param {number} totals.equipmentSlots
 */
export function actionSpentSummary(responses, totals = {}) {
  const r = responses || {};
  const t = {
    projectSlots:     totals.projectSlots     ?? 4,
    sphereSlots:      totals.sphereSlots      ?? 0,
    statusSlots:      totals.statusSlots      ?? 0,
    contactSlots:     totals.contactSlots     ?? 0,
    retainerSlots:    totals.retainerSlots    ?? 0,
    acquisitionSlots: totals.acquisitionSlots ?? 1,
    sorcerySlots:     totals.sorcerySlots     ?? 0,
    equipmentSlots:   totals.equipmentSlots   ?? 0,
  };

  let projectsUsed = 0;
  let xpSpendUsed = 0;
  for (let n = 1; n <= t.projectSlots; n++) {
    const action = r[`project_${n}_action`];
    if (_nonEmpty(action)) {
      projectsUsed++;
      if (action === 'xp_spend') xpSpendUsed++;
    }
  }

  let spheresUsed = 0;
  for (let n = 1; n <= t.sphereSlots; n++) {
    if (_nonEmpty(r[`sphere_${n}_action`])) spheresUsed++;
  }

  let statusUsed = 0;
  for (let n = 1; n <= t.statusSlots; n++) {
    if (_nonEmpty(r[`status_${n}_action`])) statusUsed++;
  }

  let contactsUsed = 0;
  for (let n = 1; n <= t.contactSlots; n++) {
    if (_nonEmpty(r[`contact_${n}_request`]) || _nonEmpty(r[`contact_${n}_info`])) contactsUsed++;
  }

  let retainersUsed = 0;
  for (let n = 1; n <= t.retainerSlots; n++) {
    if (_nonEmpty(r[`retainer_${n}_task`]) || _nonEmpty(r[`retainer_${n}_type`])) retainersUsed++;
  }

  let acquisitionsUsed = 0;
  for (let n = 1; n <= t.acquisitionSlots; n++) {
    if (_nonEmpty(r[`acq_${n}_description`])) acquisitionsUsed++;
  }
  // Legacy single-slot fallback for pre-multi-slot acquisitions.
  if (acquisitionsUsed === 0 && _nonEmpty(r.acq_description)) acquisitionsUsed = 1;

  let sorceriesUsed = 0;
  for (let n = 1; n <= t.sorcerySlots; n++) {
    if (_nonEmpty(r[`sorcery_${n}_rite`])) sorceriesUsed++;
  }

  let equipmentUsed = 0;
  for (let n = 1; n <= t.equipmentSlots; n++) {
    if (_nonEmpty(r[`equipment_${n}_name`])) equipmentUsed++;
  }

  return {
    personal_actions:  { used: projectsUsed,     total: t.projectSlots     },
    sphere_actions:    { used: spheresUsed,      total: t.sphereSlots      },
    status_actions:    { used: statusUsed,       total: t.statusSlots      },
    contact_actions:   { used: contactsUsed,     total: t.contactSlots     },
    retainer_actions:  { used: retainersUsed,    total: t.retainerSlots    },
    acquisition_slots: { used: acquisitionsUsed, total: t.acquisitionSlots },
    sorcery_slots:     { used: sorceriesUsed,    total: t.sorcerySlots     },
    equipment_slots:   { used: equipmentUsed,    total: t.equipmentSlots   },
    xp_spend_slots:    { used: xpSpendUsed,      total: t.projectSlots     },
  };
}

/**
 * Render the summary as a flat list of "used/total Label" strings,
 * skipping categories with total === 0 so the modal isn't padded with
 * irrelevant rows for characters who have no contacts merits, etc.
 */
export function formatActionSpentSummary(summary) {
  const labels = {
    personal_actions:  'Personal Actions',
    sphere_actions:    'Sphere actions',
    status_actions:    'Status actions',
    contact_actions:   'Contact actions',
    retainer_actions:  'Retainer actions',
    acquisition_slots: 'Acquisition slots',
    sorcery_slots:     'Blood Sorcery slots',
    equipment_slots:   'Equipment items',
  };
  const out = [];
  for (const [key, label] of Object.entries(labels)) {
    const cell = summary[key];
    if (!cell || cell.total === 0) continue;
    out.push(`${cell.used}/${cell.total} ${label}`);
  }
  return out;
}
