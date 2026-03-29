/**
 * db.js
 * IndexedDB persistence layer for downtime submissions.
 *
 * Stores:
 *   cycles        -- one record per downtime round (active or closed)
 *   submissions   -- one record per character per cycle, upserted on re-upload
 *   projects      -- child records, replaced wholesale on submission update
 *   sphere_actions
 *   contacts
 *
 * Upsert key: (cycle_id, character_name) -- unique compound index on submissions.
 * Re-uploading a growing CSV updates existing characters and adds new ones.
 */

const DB_NAME    = 'terra_mortis_downtime';
const DB_VERSION = 2;

let _db = null;

// ── Open / initialise ────────────────────────────────────────────────────────

function init() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db  = e.target.result;
      const old = e.oldVersion;

      // Wipe v1 stores if upgrading -- early dev, no migration needed
      if (old < 2) {
        ['cycles','submissions','projects','sphere_actions','contacts']
          .filter(s => db.objectStoreNames.contains(s))
          .forEach(s => db.deleteObjectStore(s));
      }

      // cycles
      const cycles = db.createObjectStore('cycles', { keyPath: 'id', autoIncrement: true });
      cycles.createIndex('loaded_at', 'loaded_at');
      cycles.createIndex('status',    'status');

      // submissions -- compound unique index enables upsert by (cycle_id, character_name)
      const subs = db.createObjectStore('submissions', { keyPath: 'id', autoIncrement: true });
      subs.createIndex('cycle_id',       'cycle_id');
      subs.createIndex('character_name', 'character_name');
      subs.createIndex('player_name',    'player_name');
      subs.createIndex('attended',       'attended');
      subs.createIndex('cycle_char',     ['cycle_id', 'character_name'], { unique: true });

      // projects
      const proj = db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
      proj.createIndex('cycle_id',      'cycle_id');
      proj.createIndex('submission_id', 'submission_id');
      proj.createIndex('character_name','character_name');
      proj.createIndex('action_type',   'action_type');

      // sphere_actions
      const sphere = db.createObjectStore('sphere_actions', { keyPath: 'id', autoIncrement: true });
      sphere.createIndex('cycle_id',      'cycle_id');
      sphere.createIndex('submission_id', 'submission_id');
      sphere.createIndex('character_name','character_name');
      sphere.createIndex('merit_type',    'merit_type');

      // contacts
      const contacts = db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
      contacts.createIndex('cycle_id',      'cycle_id');
      contacts.createIndex('submission_id', 'submission_id');
      contacts.createIndex('character_name','character_name');
      contacts.createIndex('contact_type',  'contact_type');
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ── Generic helpers ──────────────────────────────────────────────────────────

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function getAll(store) {
  return idbRequest(_db.transaction([store]).objectStore(store).getAll());
}

function getAllByIndex(store, indexName, value) {
  return idbRequest(_db.transaction([store]).objectStore(store).index(indexName).getAll(value));
}

function clearStore(store) {
  return idbRequest(_db.transaction([store], 'readwrite').objectStore(store).clear());
}

// Delete all child records for a given submission_id from a store
function deleteBySubmissionId(store, submissionId) {
  return new Promise((resolve, reject) => {
    const tx    = _db.transaction([store], 'readwrite');
    const index = tx.objectStore(store).index('submission_id');
    const req   = index.getAll(submissionId);
    req.onsuccess = () => {
      const records = req.result;
      let pending   = records.length;
      if (!pending) { resolve(); return; }
      for (const r of records) {
        const del = tx.objectStore(store).delete(r.id);
        del.onsuccess = () => { if (--pending === 0) resolve(); };
        del.onerror   = (e) => reject(e.target.error);
      }
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

// ── Cycle management ─────────────────────────────────────────────────────────

/** Returns all cycles newest-first. */
async function getCycles() {
  const all = await getAll('cycles');
  return all.sort((a, b) => b.loaded_at.localeCompare(a.loaded_at));
}

/** Returns the current active cycle, or null. */
async function getActiveCycle() {
  const cycles = await getCycles();
  return cycles.find(c => c.status === 'active') || null;
}

/** Creates a new active cycle and closes the previous one. */
async function newCycle(label) {
  // Close any open cycle
  const active = await getActiveCycle();
  if (active) {
    await idbRequest(
      _db.transaction(['cycles'], 'readwrite')
         .objectStore('cycles')
         .put({ ...active, status: 'closed' })
    );
  }

  return idbRequest(
    _db.transaction(['cycles'], 'readwrite')
       .objectStore('cycles')
       .add({ label, loaded_at: new Date().toISOString(), status: 'active', submission_count: 0 })
  );
}

/** Ensures an active cycle exists; creates one if not. Returns cycle id. */
async function ensureActiveCycle(defaultLabel) {
  const active = await getActiveCycle();
  if (active) return active.id;
  return newCycle(defaultLabel);
}

/** Updates the submission_count on a cycle. */
async function updateCycleCount(cycleId) {
  const rows  = await getAllByIndex('submissions', 'cycle_id', cycleId);
  const cycle = await idbRequest(_db.transaction(['cycles']).objectStore('cycles').get(cycleId));
  await idbRequest(
    _db.transaction(['cycles'], 'readwrite')
       .objectStore('cycles')
       .put({ ...cycle, submission_count: rows.length })
  );
}

// ── Upsert a single submission ────────────────────────────────────────────────

/**
 * Upserts one submission into the active cycle.
 * Returns { status: 'inserted' | 'updated' | 'unchanged', submissionId }
 */
async function upsertSubmission(cycleId, s) {
  const characterName = s.submission.character_name;
  const rawHash       = JSON.stringify(s);

  // Look up existing record by compound key
  const existing = await idbRequest(
    _db.transaction(['submissions'])
       .objectStore('submissions')
       .index('cycle_char')
       .get([cycleId, characterName])
  );

  // Unchanged check
  if (existing && existing._rawHash === rawHash) {
    return { status: 'unchanged', submissionId: existing.id };
  }

  const record = {
    cycle_id:           cycleId,
    character_name:     characterName,
    player_name:        s.submission.player_name,
    timestamp:          s.submission.timestamp,
    attended:           s.submission.attended_last_game,
    is_regent:          s.regency.is_regent,
    regent_territory:   s.regency.territory,
    has_rituals:        s.ritual_casting.has_rituals,
    has_acquisitions:   s.acquisitions.has_acquisitions,
    xp_spend:           s.meta.xp_spend,
    st_notes:           s.meta.st_notes,
    updated_at:         new Date().toISOString(),
    _raw:               s,
    _rawHash:           rawHash,
  };

  let submissionId;
  let status;

  if (existing) {
    // Update existing record in place
    record.id = existing.id;
    await idbRequest(
      _db.transaction(['submissions'], 'readwrite').objectStore('submissions').put(record)
    );
    submissionId = existing.id;
    status = 'updated';
  } else {
    submissionId = await idbRequest(
      _db.transaction(['submissions'], 'readwrite').objectStore('submissions').add(record)
    );
    status = 'inserted';
  }

  // Replace child records wholesale
  await deleteBySubmissionId('projects', submissionId);
  await deleteBySubmissionId('sphere_actions', submissionId);
  await deleteBySubmissionId('contacts', submissionId);

  const projTx = _db.transaction(['projects'], 'readwrite').objectStore('projects');
  for (const p of s.projects) {
    projTx.add({
      cycle_id: cycleId, submission_id: submissionId,
      character_name: characterName,
      action_type: p.action_type, primary_pool: p.primary_pool,
      secondary_pool: p.secondary_pool, desired_outcome: p.desired_outcome,
      description: p.description,
    });
  }

  const sphereTx = _db.transaction(['sphere_actions'], 'readwrite').objectStore('sphere_actions');
  for (const a of s.sphere_actions) {
    sphereTx.add({
      cycle_id: cycleId, submission_id: submissionId,
      character_name: characterName,
      merit_type: a.merit_type, action_type: a.action_type,
      desired_outcome: a.desired_outcome, description: a.description,
    });
  }

  const contactTx = _db.transaction(['contacts'], 'readwrite').objectStore('contacts');
  for (const req of s.contact_actions.requests) {
    const m    = req.match(/contact\s+type\s*:\s*([^\n]+)/i);
    const type = m ? m[1].trim() : '(unspecified)';
    contactTx.add({
      cycle_id: cycleId, submission_id: submissionId,
      character_name: characterName,
      contact_type: type, request: req,
    });
  }

  return { status, submissionId };
}

// ── Batch upsert ─────────────────────────────────────────────────────────────

/**
 * Upserts a full submissions array into the active cycle.
 * Creates the active cycle if none exists.
 *
 * @returns {{ cycleId, inserted, updated, unchanged }}
 */
async function upsertCycle(submissions, defaultLabel) {
  const cycleId = await ensureActiveCycle(defaultLabel);
  let inserted = 0, updated = 0, unchanged = 0;

  for (const s of submissions) {
    const { status } = await upsertSubmission(cycleId, s);
    if (status === 'inserted')  inserted++;
    if (status === 'updated')   updated++;
    if (status === 'unchanged') unchanged++;
  }

  await updateCycleCount(cycleId);
  return { cycleId, inserted, updated, unchanged };
}

// ── Read / query ─────────────────────────────────────────────────────────────

async function getRawSubmissionsForCycle(cycleId) {
  const rows = await getAllByIndex('submissions', 'cycle_id', cycleId);
  return rows.map(r => r._raw);
}

function getProjectsForCycle(cycleId) {
  return getAllByIndex('projects', 'cycle_id', cycleId);
}

function getSphereActionsForCycle(cycleId) {
  return getAllByIndex('sphere_actions', 'cycle_id', cycleId);
}

function getContactsForCycle(cycleId) {
  return getAllByIndex('contacts', 'cycle_id', cycleId);
}

async function searchSubmissions(query) {
  const q   = query.toLowerCase();
  const all = await getAll('submissions');
  return all.filter(s =>
    s.character_name.toLowerCase().includes(q) ||
    s.player_name.toLowerCase().includes(q)
  );
}

async function searchProjects(query) {
  const q   = query.toLowerCase();
  const all = await getAll('projects');
  return all.filter(p =>
    p.action_type.toLowerCase().includes(q) ||
    (p.description     || '').toLowerCase().includes(q) ||
    (p.desired_outcome || '').toLowerCase().includes(q)
  );
}

async function getSummary() {
  const [cycles, subs, proj, sphere, contacts] = await Promise.all([
    getAll('cycles'), getAll('submissions'), getAll('projects'),
    getAll('sphere_actions'), getAll('contacts'),
  ]);
  return {
    cycles:         cycles.length,
    submissions:    subs.length,
    projects:       proj.length,
    sphere_actions: sphere.length,
    contacts:       contacts.length,
  };
}

async function clearAll() {
  await Promise.all([
    clearStore('cycles'),     clearStore('submissions'),
    clearStore('projects'),   clearStore('sphere_actions'),
    clearStore('contacts'),
  ]);
}

// ── Public API ────────────────────────────────────────────────────────────────

const db = {
  init,
  // Cycles
  getCycles, getActiveCycle, newCycle,
  // Upsert
  upsertCycle,
  // Read
  getRawSubmissionsForCycle,
  getProjectsForCycle, getSphereActionsForCycle, getContactsForCycle,
  // Search
  searchSubmissions, searchProjects,
  // Util
  getSummary, clearAll,
};
