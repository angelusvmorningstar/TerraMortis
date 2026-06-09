#!/usr/bin/env node
/**
 * One-off migration: rekey all territory identifiers in
 * downtime_submissions.responses from legacy slug / display-name formats
 * to canonical ObjectId strings. Implements issue #496 AC 6, story 496.3.
 *
 * Fields handled:
 *
 *   JSON-key fields (the JSON object's keys are territory identifiers):
 *     responses.feeding_territories       — long-slug keys  → OID
 *     responses.feeding_territories_rote  — long-slug keys  → OID
 *     responses.influence_spend           — long-slug keys  → OID
 *     responses.influence_territories     — display-name keys → OID (DT1 legacy)
 *
 *   String-value fields (the field's string value is a territory identifier):
 *     responses.sphere_N_territory        — short-slug → OID  (N = 1..5)
 *     responses.project_N_ambience_target — short-slug → OID  (N = 1..5)
 *     responses.project_N_target_terr     — short-slug → OID  (N = 1..5)
 *     responses.project_N_territory       — short-slug → OID  (N = 1..5, expected 0 docs)
 *
 * Barrens handling:
 *   Keys where key.toLowerCase().includes('barrens') are preserved as-is.
 *   Barrens has no canonical ObjectId; both sentinel variants in the wild
 *   (single- and double-underscore) are covered by this check.
 *
 * Usage:
 *   cd server && node scripts/migrate-submission-territory-keys.js          # dry-run
 *   cd server && node scripts/migrate-submission-territory-keys.js --apply  # backup + mutate
 *
 * Behaviour:
 *   - Dry-run by default. --apply writes a JSON backup then mutates.
 *   - Idempotent: OID-keyed fields are skipped (counted as already-migrated).
 *   - Backup written to server/scripts/_backups/ BEFORE any DB mutation.
 *   - Safety abort (exit 2) if any non-Barrens key cannot be resolved to an OID.
 *   - Safety guard: requires ≥ 5 real territories (prevents accidental run
 *     against a test DB with an empty territories collection).
 *
 * Exit codes:
 *   0  success / dry-run / already-migrated
 *   1  config error (MONGODB_URI missing)
 *   2  safety abort (unresolvable key, territories count < 5)
 *
 * Run history:
 *   (populated on each --apply run)
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Constants ──────────────────────────────────────────────────────────────

const HEX24 = /^[a-f0-9]{24}$/i;

/** True if `s` is a 24-char lowercase hex ObjectId string. */
export const isOidShaped = s => typeof s === 'string' && HEX24.test(s);

/**
 * True for any territory key that is a Barrens sentinel.
 * Two variants live in the wild (from the 496.1 + 496.3 pre-flight audits):
 *   the_barrens_no_territory_  (single underscore — DT2)
 *   the_barrens__no_territory_ (double underscore — DT1)
 * The broad includes('barrens') check covers both and any future variants.
 */
export const isBarrens = s => typeof s === 'string' && s.toLowerCase().includes('barrens');

/** JSON-key fields: the object's KEYS are territory identifiers. */
export const JSON_KEY_FIELDS = [
  'feeding_territories',
  'feeding_territories_rote',
  'influence_spend',
  'influence_territories',
];

const VALUE_FIELD_TEMPLATES = [
  n => `project_${n}_territory`,
  n => `project_${n}_target_terr`,
  n => `project_${n}_ambience_target`,
  n => `sphere_${n}_territory`,
];
const MAX_SLOTS = 5;

/** All string-value territory field names for slots 1–5. */
export function buildValueFieldNames() {
  const names = [];
  for (const tmpl of VALUE_FIELD_TEMPLATES) {
    for (let n = 1; n <= MAX_SLOTS; n++) names.push(tmpl(n));
  }
  return names;
}

export const VALUE_FIELDS = buildValueFieldNames();

// ── Territory lookup helpers (inlined from deleted territory-key-resolver.js) ─
// These are only needed during migration runs; after --apply all keys are OIDs.

// Known display-name and long-slug aliases that don't derive from a territory
// document's canonical name or slug. Drawn from the DT1/DT2 audit in 496.1.
const _NAME_ALIASES = {
  'The Shore':          'northshore',
  'The City Harbour':   'harbour',
  'The Docklands':      'dockyards',
  'The Northern Shore': 'northshore',
  'Academy':            'academy',
  'Harbour':            'harbour',
  'Dockyards':          'dockyards',
  'Second City':        'secondcity',
  'North Shore':        'northshore',
};

const _LONG_SLUG_ALIASES = {
  the_city_harbour:    'harbour',
  the_docklands:       'dockyards',
  the_northern_shore:  'northshore',
};

/**
 * Build slug/name lookup maps from a territory document array.
 * Exported so the migration test can create MAPS without importing the
 * (now-deleted) territory-key-resolver.js module.
 * @param {object[]} territories
 */
export function buildTerritoryLookupMaps(territories) {
  const bySlug = {};     // short slug ('harbour') → OID
  const byLongSlug = {}; // long slug ('the_harbour') → OID
  const byName = {};     // display name ('The Harbour') → OID

  for (const t of territories) {
    if (!t.slug || t.slug.startsWith('regent_save_')) continue;
    const oid = String(t._id);
    bySlug[t.slug] = oid;
    if (t.name) {
      byName[t.name] = oid;
      const longSlug = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      byLongSlug[longSlug] = oid;
    }
  }

  for (const [alias, slug] of Object.entries(_NAME_ALIASES)) {
    if (bySlug[slug] && !byName[alias]) byName[alias] = bySlug[slug];
  }
  for (const [alias, slug] of Object.entries(_LONG_SLUG_ALIASES)) {
    if (bySlug[slug] && !byLongSlug[alias]) byLongSlug[alias] = bySlug[slug];
  }

  return { bySlug, byLongSlug, byName };
}

/** Resolve a territory key string to a canonical OID string (or null). */
export function resolveSubmissionTerritoryKey(key, maps) {
  if (!key || typeof key !== 'string') return null;
  if (isOidShaped(key)) return key;
  return maps.bySlug[key] || maps.byLongSlug[key] || maps.byName[key] || null;
}

// ── Pure helpers (exported for unit testing) ────────────────────────────────

/**
 * Parse a territory JSON field stored as a JSON string (or already an object).
 * Returns the parsed object, or null if absent, empty, or unparseable.
 * @param {string|object|null|undefined} raw
 * @returns {object|null}
 */
export function parseJsonField(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch { return null; }
}

/**
 * Audit a single JSON-key field: classify each key as already-OID, Barrens
 * (preserve), needs-migration, or unresolvable.
 *
 * Returns null when the field is absent or unparseable.
 * @param {string|object|null} raw
 * @param {object} maps   Output of `buildTerritoryLookupMaps()`.
 * @returns {{ needsMigration: boolean, remapped: object, barrensKept: number,
 *             alreadyOid: number, unresolvable: string[] } | null}
 */
export function auditJsonKeyField(raw, maps) {
  const obj = parseJsonField(raw);
  if (!obj || typeof obj !== 'object') return null;

  const entries = Object.entries(obj);
  if (entries.length === 0) return null;

  let barrensKept = 0;
  let alreadyOid  = 0;
  const unresolvable = [];
  const remapped = {};

  for (const [k, v] of entries) {
    if (isBarrens(k)) {
      barrensKept++;
      remapped[k] = v;
      continue;
    }
    if (isOidShaped(k)) {
      alreadyOid++;
      remapped[k] = v;
      continue;
    }
    const oid = resolveSubmissionTerritoryKey(k, maps);
    if (!oid) {
      unresolvable.push(k);
      remapped[k] = v; // preserved only until caller aborts
    } else {
      remapped[oid] = v;
    }
  }

  // needsMigration: any key changed
  const needsMigration = entries.some(([k], i) => k !== Object.keys(remapped)[i]);

  return { needsMigration, remapped, barrensKept, alreadyOid, unresolvable };
}

/**
 * Audit a single string-value territory field.
 *
 * Returns null when the field is absent, null, or empty string.
 * @param {string|null|undefined} raw
 * @param {object} maps
 * @returns {{ needsMigration: boolean, newValue: string,
 *             alreadyOid: boolean, unresolvable: boolean } | null}
 */
export function auditValueField(raw, maps) {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return null;
  if (isOidShaped(raw)) {
    return { needsMigration: false, newValue: raw, alreadyOid: true, unresolvable: false };
  }
  const oid = resolveSubmissionTerritoryKey(raw, maps);
  if (!oid) {
    return { needsMigration: false, newValue: raw, alreadyOid: false, unresolvable: true };
  }
  return { needsMigration: true, newValue: oid, alreadyOid: false, unresolvable: false };
}

// ── Core migration logic (exported for integration testing) ─────────────────

/**
 * Audit all submissions and build a migration plan.
 * Does NOT write to the database — pure read + classification pass.
 *
 * Throws an error with `code: 'SAFETY_ABORT'` if:
 *   - The territories collection has fewer than 5 real territories.
 *   - Any non-Barrens territory key is unresolvable.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<{ plan, submissionUpdates, territories, submissions }>}
 */
export async function auditSubmissions(db) {
  const territories = await db.collection('territories').find().toArray();
  const realTerritories = territories.filter(
    t => t.slug && !t.slug.startsWith('regent_save_')
  );

  if (realTerritories.length < 5) {
    throw Object.assign(
      new Error(
        `Safety check failed: only ${realTerritories.length} real territories found ` +
        `(expected ≥ 5). Are you connected to the right database?`
      ),
      { code: 'SAFETY_ABORT' },
    );
  }

  const maps = buildTerritoryLookupMaps(territories);
  const submissions = await db.collection('downtime_submissions').find().toArray();

  const plan = {
    total: submissions.length,
    alreadyMigrated: 0,
    toMigrate: 0,
    byField: {},
  };
  for (const f of [...JSON_KEY_FIELDS, ...VALUE_FIELDS]) {
    plan.byField[f] = { mutations: 0, alreadyOid: 0, barrensKept: 0 };
  }

  const submissionUpdates = []; // { _id, sets }
  const safetyAborts = [];      // { _id, aborts }

  for (const sub of submissions) {
    const r = sub.responses || {};
    let subNeedsMigration = false;
    const subSets = {};
    const subAborts = [];

    for (const field of JSON_KEY_FIELDS) {
      if (!(field in r)) continue;
      const result = auditJsonKeyField(r[field], maps);
      if (!result) continue;

      plan.byField[field].barrensKept += result.barrensKept;
      plan.byField[field].alreadyOid  += result.alreadyOid;

      if (result.unresolvable.length > 0) {
        subAborts.push({ field, keys: result.unresolvable });
      }

      if (result.needsMigration) {
        plan.byField[field].mutations++;
        subNeedsMigration = true;
        subSets[`responses.${field}`] = JSON.stringify(result.remapped);
      }
    }

    for (const field of VALUE_FIELDS) {
      if (!(field in r)) continue;
      const result = auditValueField(r[field], maps);
      if (!result) continue;

      if (result.unresolvable) {
        subAborts.push({ field, keys: [r[field]] });
      }

      if (result.needsMigration) {
        plan.byField[field].mutations++;
        subNeedsMigration = true;
        subSets[`responses.${field}`] = result.newValue;
      } else if (result.alreadyOid) {
        plan.byField[field].alreadyOid++;
      }
    }

    if (subAborts.length > 0) {
      safetyAborts.push({ _id: String(sub._id), aborts: subAborts });
    }

    if (subNeedsMigration) {
      plan.toMigrate++;
      submissionUpdates.push({ _id: sub._id, sets: subSets });
    } else {
      plan.alreadyMigrated++;
    }
  }

  if (safetyAborts.length > 0) {
    throw Object.assign(
      new Error(
        `Safety check failed: ${safetyAborts.length} submission(s) have unresolvable territory keys`
      ),
      { code: 'SAFETY_ABORT', safetyAborts },
    );
  }

  return { plan, submissionUpdates, territories, submissions };
}

/**
 * Apply a set of submission updates to the database.
 * @param {import('mongodb').Db} db
 * @param {{ _id, sets }[]} updates
 * @returns {Promise<number>} count of applied updates
 */
export async function applyUpdates(db, updates) {
  for (const { _id, sets } of updates) {
    await db.collection('downtime_submissions').updateOne({ _id }, { $set: sets });
  }
  return updates.length;
}

/**
 * Count remaining non-OID legacy keys across all submissions (post-state check).
 * @param {import('mongodb').Db} db
 * @returns {Promise<number>}
 */
export async function countLegacyKeysRemaining(db) {
  const subs = await db.collection('downtime_submissions').find().toArray();
  let remaining = 0;
  for (const sub of subs) {
    const r = sub.responses || {};
    for (const field of JSON_KEY_FIELDS) {
      if (!(field in r)) continue;
      const obj = parseJsonField(r[field]);
      if (!obj) continue;
      for (const k of Object.keys(obj)) {
        if (!isOidShaped(k) && !isBarrens(k)) remaining++;
      }
    }
    for (const field of VALUE_FIELDS) {
      const v = r[field];
      if (!v || typeof v !== 'string' || v.trim() === '') continue;
      if (!isOidShaped(v)) remaining++;
    }
  }
  return remaining;
}

// ── CLI entry point ─────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const APPLY = process.argv.includes('--apply');
  const HELP  = process.argv.includes('--help') || process.argv.includes('-h');

  if (HELP) {
    console.log('Usage: node scripts/migrate-submission-territory-keys.js [--apply]');
    console.log('  Default is DRY-RUN. --apply writes a backup then mutates the database.');
    process.exit(0);
  }

  const URI = process.env.MONGODB_URI;
  if (!URI) {
    console.error('MONGODB_URI missing — populate server/.env before running.');
    process.exit(1);
  }

  const client = new MongoClient(URI);

  try {
    await client.connect();
    const db = client.db('tm_suite');

    // Step 1: audit pass (read-only)
    let auditResult;
    try {
      auditResult = await auditSubmissions(db);
    } catch (err) {
      if (err.code === 'SAFETY_ABORT') {
        console.error(`\nSAFETY ABORT: ${err.message}`);
        if (err.safetyAborts) {
          for (const { _id, aborts } of err.safetyAborts) {
            for (const { field, keys } of aborts) {
              console.error(`  ${_id}  ${field}: ${keys.join(', ')}`);
            }
          }
        }
        process.exit(2);
      }
      throw err;
    }

    const { plan, submissionUpdates, territories, submissions } = auditResult;

    console.log(`Territories: ${territories.filter(t => t.slug && !t.slug.startsWith('regent_save_')).length} real`);
    for (const t of territories.filter(t => t.slug && !t.slug.startsWith('regent_save_'))) {
      console.log(`  ${t.slug} → ${String(t._id)}  (${t.name})`);
    }
    console.log(`\nSubmissions loaded: ${submissions.length}`);
    console.log('\n--- Audit ---');
    console.log(JSON.stringify(plan, null, 2));

    if (plan.toMigrate === 0) {
      console.log('\nalready-migrated: true   nothing to do.');
      process.exit(0);
    }

    if (!APPLY) {
      console.log('\nDRY-RUN — re-run with --apply to execute.');
      process.exit(0);
    }

    // Step 2: write backup BEFORE any mutation
    const here = dirname(fileURLToPath(import.meta.url));
    const backupDir = join(here, '_backups');
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDir, `submission-territory-migration-${stamp}.json`);
    writeFileSync(backupPath, JSON.stringify({ capturedAt: stamp, submissions }, null, 2));
    console.log(`\nBackup → ${backupPath}`);

    // Step 3: apply mutations
    const applied = await applyUpdates(db, submissionUpdates);
    console.log(`\nApplied ${applied} submission updates.`);

    // Step 4: post-state validation
    const remaining = await countLegacyKeysRemaining(db);
    console.log(`\nPost-state: ${remaining} non-OID keys remaining across all submissions (expected 0).`);

  } finally {
    await client.close();
  }
}
