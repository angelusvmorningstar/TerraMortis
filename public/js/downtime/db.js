/**
 * Downtime data access — API-backed.
 * Replaces Peter's IndexedDB layer with HTTP calls to the Express API.
 */

import { apiGet, apiPost, apiPut } from '../data/api.js';

// ── Cycles ──────────────────────────────────────────────────────────────────

export async function getCycles() {
  return apiGet('/api/downtime_cycles');
}

export async function getActiveCycle() {
  const cycles = await getCycles();
  return cycles.find(c => c.status === 'active') || null;
}

export async function createCycle(label) {
  return apiPost('/api/downtime_cycles', {
    label,
    status: 'active',
    loaded_at: new Date().toISOString(),
    submission_count: 0,
  });
}

export async function updateCycle(id, updates) {
  return apiPut('/api/downtime_cycles/' + id, updates);
}

export async function closeCycle(id) {
  return updateCycle(id, { status: 'closed', closed_at: new Date().toISOString() });
}

// ── Submissions ─────────────────────────────────────────────────────────────

export async function getSubmissionsForCycle(cycleId) {
  return apiGet('/api/downtime_submissions?cycle_id=' + cycleId);
}

export async function updateSubmission(id, updates) {
  return apiPut('/api/downtime_submissions/' + id, updates);
}

/**
 * Upsert parsed submissions into a cycle.
 * Creates the cycle if none active, then posts each submission.
 */
export async function upsertCycle(parsedSubmissions, label) {
  let cycle = await getActiveCycle();
  if (!cycle) {
    cycle = await createCycle(label || 'Cycle ' + new Date().toISOString().slice(0, 10));
  }

  const existing = await getSubmissionsForCycle(cycle._id);
  const existingMap = new Map(existing.map(s => [s.character_name, s]));

  let created = 0, updated = 0, unchanged = 0;

  for (const parsed of parsedSubmissions) {
    const charName = parsed.submission.character_name;
    const doc = {
      cycle_id: cycle._id,
      character_name: charName,
      player_name: parsed.submission.player_name,
      timestamp: parsed.submission.timestamp,
      attended: parsed.submission.attended_last_game,
      _raw: parsed,
      updated_at: new Date().toISOString(),
    };

    const prev = existingMap.get(charName);
    if (prev) {
      await apiPut('/api/downtime_submissions/' + prev._id, doc);
      updated++;
    } else {
      await apiPost('/api/downtime_submissions', doc);
      created++;
    }
  }

  // Update cycle submission count
  await apiPut('/api/downtime_cycles/' + cycle._id, {
    submission_count: (existing.length - updated) + updated + created,
  });

  return { cycle, created, updated, unchanged };
}

// ── Rolls ───────────────────────────────────────────────────────────────────

export async function saveRoll(submissionId, source, index, rollFields) {
  const sub = await apiGet('/api/downtime_submissions?cycle_id=').catch(() => null);
  // Simplified: update the submission's _raw with the roll data
  // Full implementation in Story 4.3 (Feeding Roll Resolution)
  return apiPut('/api/downtime_submissions/' + submissionId, {
    [`_raw.${source}.${index}.roll`]: rollFields,
    updated_at: new Date().toISOString(),
  });
}
