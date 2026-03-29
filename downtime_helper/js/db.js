/**
 * db.js
 * IndexedDB persistence layer for downtime submissions.
 *
 * Stores:
 *   cycles      -- one record per CSV upload (downtime round)
 *   submissions -- one record per character, indexed by name/player/cycle
 *   projects    -- child records per submission
 *   sphere_actions
 *   contacts
 *
 * All public functions return Promises.
 * Call db.init() once on page load before any other operation.
 */

const DB_NAME    = 'terra_mortis_downtime';
const DB_VERSION = 1;

let _db = null;

// ── Open / initialise ────────────────────────────────────────────────────────

function init() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Cycles
      const cycles = db.createObjectStore('cycles', { keyPath: 'id', autoIncrement: true });
      cycles.createIndex('loaded_at', 'loaded_at');

      // Submissions
      const subs = db.createObjectStore('submissions', { keyPath: 'id', autoIncrement: true });
      subs.createIndex('cycle_id',       'cycle_id');
      subs.createIndex('character_name', 'character_name');
      subs.createIndex('player_name',    'player_name');
      subs.createIndex('attended',       'attended');

      // Projects
      const proj = db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
      proj.createIndex('cycle_id',       'cycle_id');
      proj.createIndex('submission_id',  'submission_id');
      proj.createIndex('character_name', 'character_name');
      proj.createIndex('action_type',    'action_type');

      // Sphere actions
      const sphere = db.createObjectStore('sphere_actions', { keyPath: 'id', autoIncrement: true });
      sphere.createIndex('cycle_id',       'cycle_id');
      sphere.createIndex('submission_id',  'submission_id');
      sphere.createIndex('character_name', 'character_name');
      sphere.createIndex('merit_type',     'merit_type');

      // Contacts
      const contacts = db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
      contacts.createIndex('cycle_id',       'cycle_id');
      contacts.createIndex('submission_id',  'submission_id');
      contacts.createIndex('character_name', 'character_name');
      contacts.createIndex('contact_type',   'contact_type');
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ── Generic helpers ──────────────────────────────────────────────────────────

function tx(stores, mode = 'readonly') {
  return _db.transaction(stores, mode);
}

function put(store, data) {
  return new Promise((resolve, reject) => {
    const req = tx([store], 'readwrite').objectStore(store).add(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function getAll(store) {
  return new Promise((resolve, reject) => {
    const req = tx([store]).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function getAllByIndex(store, indexName, value) {
  return new Promise((resolve, reject) => {
    const req = tx([store]).objectStore(store).index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function clearStore(store) {
  return new Promise((resolve, reject) => {
    const req = tx([store], 'readwrite').objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ── Write submissions ────────────────────────────────────────────────────────

/**
 * Saves a parsed submissions array to the database as a new cycle.
 *
 * @param {object[]} submissions - Array from parseDowntimeCSV()
 * @param {string}   label       - Human-readable cycle name (e.g. filename or date)
 * @returns {Promise<number>} The new cycle ID
 */
async function saveCycle(submissions, label) {
  const cycleId = await put('cycles', {
    label,
    loaded_at:        new Date().toISOString(),
    submission_count: submissions.length,
  });

  for (const s of submissions) {
    const subId = await put('submissions', {
      cycle_id:       cycleId,
      character_name: s.submission.character_name,
      player_name:    s.submission.player_name,
      timestamp:      s.submission.timestamp,
      attended:       s.submission.attended_last_game,
      is_regent:      s.regency.is_regent,
      regent_territory: s.regency.territory,
      has_rituals:    s.ritual_casting.has_rituals,
      has_acquisitions: s.acquisitions.has_acquisitions,
      xp_spend:       s.meta.xp_spend,
      st_notes:       s.meta.st_notes,
      // Store full raw object for round-trip fidelity
      _raw:           s,
    });

    for (const p of s.projects) {
      await put('projects', {
        cycle_id:       cycleId,
        submission_id:  subId,
        character_name: s.submission.character_name,
        action_type:    p.action_type,
        primary_pool:   p.primary_pool,
        secondary_pool: p.secondary_pool,
        desired_outcome: p.desired_outcome,
        description:    p.description,
      });
    }

    for (const a of s.sphere_actions) {
      await put('sphere_actions', {
        cycle_id:       cycleId,
        submission_id:  subId,
        character_name: s.submission.character_name,
        merit_type:     a.merit_type,
        action_type:    a.action_type,
        desired_outcome: a.desired_outcome,
        description:    a.description,
      });
    }

    for (const req of s.contact_actions.requests) {
      const m    = req.match(/contact\s+type\s*:\s*([^\n]+)/i);
      const type = m ? m[1].trim() : '(unspecified)';
      await put('contacts', {
        cycle_id:       cycleId,
        submission_id:  subId,
        character_name: s.submission.character_name,
        contact_type:   type,
        request:        req,
      });
    }
  }

  return cycleId;
}

// ── Read / query ─────────────────────────────────────────────────────────────

/** Returns all cycles, newest first. */
async function getCycles() {
  const all = await getAll('cycles');
  return all.sort((a, b) => b.loaded_at.localeCompare(a.loaded_at));
}

/** Returns all submissions for a given cycle, with their raw object. */
function getSubmissionsForCycle(cycleId) {
  return getAllByIndex('submissions', 'cycle_id', cycleId);
}

/** Returns full raw submission objects for a cycle (for dashboard rendering). */
async function getRawSubmissionsForCycle(cycleId) {
  const rows = await getSubmissionsForCycle(cycleId);
  return rows.map(r => r._raw);
}

/** Returns all projects for a cycle. */
function getProjectsForCycle(cycleId) {
  return getAllByIndex('projects', 'cycle_id', cycleId);
}

/** Returns all sphere actions for a cycle. */
function getSphereActionsForCycle(cycleId) {
  return getAllByIndex('sphere_actions', 'cycle_id', cycleId);
}

/** Returns all contacts for a cycle. */
function getContactsForCycle(cycleId) {
  return getAllByIndex('contacts', 'cycle_id', cycleId);
}

/**
 * Search across submissions by character or player name (case-insensitive substring).
 * Searches all cycles.
 */
async function searchSubmissions(query) {
  const q    = query.toLowerCase();
  const all  = await getAll('submissions');
  return all.filter(s =>
    s.character_name.toLowerCase().includes(q) ||
    s.player_name.toLowerCase().includes(q)
  );
}

/**
 * Search projects by action type or description keyword.
 */
async function searchProjects(query) {
  const q   = query.toLowerCase();
  const all = await getAll('projects');
  return all.filter(p =>
    p.action_type.toLowerCase().includes(q) ||
    (p.description  || '').toLowerCase().includes(q) ||
    (p.desired_outcome || '').toLowerCase().includes(q)
  );
}

/**
 * Returns a flat summary count object for quick stats.
 * { cycles, submissions, projects, sphere_actions, contacts }
 */
async function getSummary() {
  const [cycles, subs, proj, sphere, contacts] = await Promise.all([
    getAll('cycles'),
    getAll('submissions'),
    getAll('projects'),
    getAll('sphere_actions'),
    getAll('contacts'),
  ]);
  return {
    cycles:        cycles.length,
    submissions:   subs.length,
    projects:      proj.length,
    sphere_actions: sphere.length,
    contacts:      contacts.length,
  };
}

/** Wipes all stores. */
async function clearAll() {
  await Promise.all([
    clearStore('cycles'),
    clearStore('submissions'),
    clearStore('projects'),
    clearStore('sphere_actions'),
    clearStore('contacts'),
  ]);
}

// ── Public API ────────────────────────────────────────────────────────────────

const db = {
  init,
  saveCycle,
  getCycles,
  getSubmissionsForCycle,
  getRawSubmissionsForCycle,
  getProjectsForCycle,
  getSphereActionsForCycle,
  getContactsForCycle,
  searchSubmissions,
  searchProjects,
  getSummary,
  clearAll,
};
