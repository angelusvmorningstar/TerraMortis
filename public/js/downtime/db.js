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

export async function createCycle(gameNumber, deadlineAt = null) {
  const body = {
    label: 'Downtime ' + gameNumber,
    game_number: gameNumber,
    status: 'active',
    loaded_at: new Date().toISOString(),
    submission_count: 0,
  };
  if (deadlineAt) body.deadline_at = deadlineAt;
  return apiPost('/api/downtime_cycles', body);
}

/** Derive the game number for a new cycle: closed cycle count + 1 for current, +1 for next. */
async function nextGameNumber() {
  const all = await getCycles();
  const closedCount = all.filter(c => c.status === 'closed').length;
  const active = all.find(c => c.status === 'active');
  if (active?.game_number) return active.game_number + 1;
  // Fallback: closed cycles = past games, active = one more → next is one more again
  return closedCount + 2;
}

export async function updateCycle(id, updates) {
  return apiPut('/api/downtime_cycles/' + id, updates);
}

export async function closeCycle(id) {
  return updateCycle(id, { status: 'closed', closed_at: new Date().toISOString() });
}

export async function openGamePhase(id) {
  return updateCycle(id, { status: 'game', game_phase_at: new Date().toISOString() });
}

/** Get the cycle currently in game phase (status === 'game'). */
export async function getGamePhaseCycle() {
  const cycles = await getCycles();
  return cycles.find(c => c.status === 'game') || null;
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
export async function upsertCycle(parsedSubmissions, characters) {
  let cycle = await getActiveCycle();
  if (!cycle) {
    const all = await getCycles();
    const gameNum = all.filter(c => c.status === 'closed').length + 1;
    cycle = await createCycle(gameNum);
  }

  const existing = await getSubmissionsForCycle(cycle._id);
  // Index by character_name AND character_id so portal submissions (which lack character_name)
  // are still found when a CSV row matches the same character.
  const byName = new Map(existing.filter(s => s.character_name).map(s => [s.character_name, s]));
  const byId   = new Map(existing.filter(s => s.character_id).map(s => [String(s.character_id), s]));

  let created = 0, updated = 0, unchanged = 0;

  for (const parsed of parsedSubmissions) {
    const charName = parsed.submission.character_name;
    const charId   = parsed._character_id ? String(parsed._character_id) : null;
    const doc = {
      cycle_id: cycle._id,
      character_id: parsed._character_id ? String(parsed._character_id) : null,
      character_name: charName,
      player_name: parsed.submission.player_name,
      status: 'submitted',
      timestamp: parsed.submission.timestamp,
      attended: parsed.submission.attended_last_game,
      _raw: parsed,
      responses: mapRawToResponses(parsed, characters || null),
      updated_at: new Date().toISOString(),
    };

    // Match by name first (CSV-sourced), then by character_id (portal-sourced)
    const prev = byName.get(charName) || (charId ? byId.get(charId) : null);
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

// ── CSV → responses mapping ────────────────────────────────────────────────

/**
 * Normalise a free-text feeding method to the form's enum ID.
 */
function normaliseFeedMethod(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (/seduc/i.test(s)) return 'seduction';
  if (/stalk|hunt/i.test(s)) return 'stalking';
  if (/force|attack/i.test(s)) return 'force';
  if (/familiar|animal|beast/i.test(s)) return 'familiar';
  if (/intimid/i.test(s)) return 'intimidation';
  return 'other';
}

/**
 * Normalise a CSV sphere action string to the schema enum.
 */
function normaliseSphereAction(raw) {
  if (!raw) return '';
  const s = raw.trim().toLowerCase();
  if (/ambience.*increase|make.*delicious/i.test(s)) return 'ambience_increase';
  if (/ambience.*decrease/i.test(s)) return 'ambience_decrease';
  if (/attack/i.test(s)) return 'attack';
  if (/block/i.test(s)) return 'block';
  if (/hide|protect/i.test(s)) return 'hide_protect';
  if (/investigat/i.test(s)) return 'investigate';
  if (/patrol|scout/i.test(s)) return 'patrol_scout';
  if (/rumour|rumor/i.test(s)) return 'rumour';
  if (/support/i.test(s)) return 'support';
  if (/grow/i.test(s)) return 'grow';
  if (/acqui/i.test(s)) return 'acquisition';
  if (/misc/i.test(s)) return 'misc';
  return '';
}

/**
 * Normalise CSV territory grid to the form's { slug: status } JSON format.
 */
function normaliseTerritoryGrid(rawTerrs) {
  if (!rawTerrs || typeof rawTerrs !== 'object') return null;
  const nameToSlug = {
    'The Academy':              'the_academy',
    'The Harbour':              'the_harbour',
    'The City Harbour':         'the_harbour',         // legacy
    'The Dockyards':            'the_dockyards',
    'The Docklands':            'the_dockyards',       // legacy
    'The Second City':          'the_second_city',
    'The North Shore':          'the_north_shore',
    'The Northern Shore':       'the_north_shore',     // legacy
    'The Barrens (No Territory)': 'the_barrens__no_territory_',
    'The Barrens':              'the_barrens__no_territory_', // legacy
  };
  const statusMap = { 'Resident': 'resident', 'Poaching': 'poach', 'Feeding': 'feed', 'Not feeding here': 'none' };
  const result = {};
  for (const [name, val] of Object.entries(rawTerrs)) {
    const slug = nameToSlug[name];
    if (!slug) continue;
    result[slug] = statusMap[val] || 'none';
  }
  return JSON.stringify(result);
}

/**
 * Map a parsed CSV submission object into flat responses matching the player
 * portal form format. Characters array is optional — used for name→ID
 * resolution in shoutout picks.
 */
export function mapRawToResponses(parsed, characters) {
  const r = {};

  // Court / narrative
  const n = parsed.narrative || {};
  if (n.travel_description) r.travel = n.travel_description;
  if (n.game_recount) r.game_recount = n.game_recount;
  if (n.ic_correspondence) r.correspondence = n.ic_correspondence;
  if (n.most_trusted_pc) r.trust = n.most_trusted_pc;
  if (n.actively_harming_pc) r.harm = n.actively_harming_pc;
  if (n.aspirations) r.aspirations = n.aspirations;
  // Shoutout: resolve names to IDs when possible
  if (n.standout_rp) {
    const names = n.standout_rp.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
    const resolved = names.map(name => {
      if (!characters) return name;
      const c = characters.find(ch =>
        ch.name === name || ch.moniker === name ||
        (ch.name || '').toLowerCase() === name.toLowerCase()
      );
      return c ? String(c._id) : name;
    });
    r.rp_shoutout = JSON.stringify(resolved);
  }

  // Regency
  const reg = parsed.regency || {};
  r._gate_is_regent = reg.is_regent ? 'yes' : 'no';
  if (reg.territory) r.regent_territory = reg.territory;
  if (reg.regency_action) r.regency_action = reg.regency_action;

  // Feeding
  const f = parsed.feeding || {};
  if (f.method) {
    r._feed_method = normaliseFeedMethod(f.method);
    if (r._feed_method === 'other') r.feeding_description = f.method;
  }
  if (f.territories) r.feeding_territories = normaliseTerritoryGrid(f.territories);

  // Influence territory amounts — numeric values (positive = increase, negative = decrease)
  const inf = parsed.influence || {};
  const infNonZero = Object.fromEntries(Object.entries(inf).filter(([, v]) => v !== 0));
  if (Object.keys(infNonZero).length) r.influence_territories = JSON.stringify(infNonZero);

  // Projects (up to 4)
  const projects = parsed.projects || [];
  projects.forEach((p, i) => {
    const n = i + 1;
    if (p.action_type) r[`project_${n}_action`] = p.action_type;
    if (p.project_name) r[`project_${n}_title`] = p.project_name;
    if (p.desired_outcome) r[`project_${n}_outcome`] = p.desired_outcome;
    if (p.detail || p.description) r[`project_${n}_description`] = p.detail || p.description;
    if (p.primary_pool?.expression) r[`project_${n}_pool_expr`] = p.primary_pool.expression;
    if (p.secondary_pool?.expression) r[`project_${n}_pool2_expr`] = p.secondary_pool.expression;
    if (p.characters) r[`project_${n}_cast`] = typeof p.characters === 'string' ? p.characters : JSON.stringify(p.characters);
    if (p.merits) r[`project_${n}_merits`] = p.merits;
    if (p.xp_spend != null) r[`project_${n}_xp`] = String(p.xp_spend);
  });

  // Sphere actions (up to 5)
  (parsed.sphere_actions || []).forEach((s, i) => {
    const n = i + 1;
    if (s.merit_type) r[`sphere_${n}_merit`] = s.merit_type;
    if (s.action_type) r[`sphere_${n}_action`] = normaliseSphereAction(s.action_type);
    if (s.desired_outcome) r[`sphere_${n}_outcome`] = s.desired_outcome;
    if (s.description) r[`sphere_${n}_description`] = s.description;
  });

  // Contacts
  (parsed.contact_actions?.requests || []).forEach((req, i) => {
    r[`contact_${i + 1}_request`] = req;
  });

  // Retainers
  (parsed.retainer_actions?.actions || []).forEach((task, i) => {
    r[`retainer_${i + 1}_task`] = task;
  });

  // Sorcery
  if (parsed.ritual_casting?.casting) r.sorcery_1_rite = parsed.ritual_casting.casting;

  // Meta
  const m = parsed.meta || {};
  if (m.xp_spend) r.xp_spend = m.xp_spend;
  if (m.lore_questions) r.lore_request = m.lore_questions;
  if (m.st_notes) r.vamping = m.st_notes;
  if (m.form_comments) r.form_feedback = m.form_comments;

  return r;
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
