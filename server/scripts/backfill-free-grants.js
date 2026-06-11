#!/usr/bin/env node

/**
 * N-2 / ADR-005 Rev 2 D6 (issue #695) — character-data backfill.
 *
 * Moves persisted legacy `m.free_<slug>` flat fields into the new
 * `m.free_grants[<slug>]` slug-keyed map (introduced by N-1 PR #672, merged
 * 2026-06-10). Mirrors STM-13's backfill pattern: idempotent, --dry-run
 * default, dotenv-first per [[feedback_server_scripts_dotenv_path]].
 *
 * Correctness is migration-independent because `meritFreeSum` runtime-guards
 * by summing BOTH the map AND the 14 legacy fields (N-1's union-sum). So a
 * partial backfill state is safe — no character renders wrong while this
 * runs. After this script completes against a database, the legacy fields
 * are gone on every character; a future cleanup story can remove the
 * union-sum fallback from `meritFreeSum`.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Conflict handling — merit-scoped skip
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   For each legacy slug on a merit, compare against `m.free_grants[slug]`:
 *
 *     EITHER absent / 0 in the map  →  copy legacy → map, unset legacy
 *     BOTH non-zero, values EQUAL   →  unset legacy (map already correct)
 *     BOTH non-zero, values DIFFER  →  CONFLICT. Skip the ENTIRE MERIT (not
 *                                      just this slug) so a human can decide
 *                                      which value is canonical before any
 *                                      slug on that merit is touched. The
 *                                      summary lists every conflict by
 *                                      character + merit + slug values.
 *
 *   The whole-merit skip is the load-bearing safety: a conflict on one slug
 *   suggests the merit has data drift somewhere, and migrating its other
 *   slugs in isolation could compound the drift.
 *
 * Idempotency: re-running matches zero docs the second time (every legacy
 * field gets unset on the first apply pass).
 *
 * Usage:
 *   # preview (default — no writes):
 *   node server/scripts/backfill-free-grants.js
 *
 *   # apply:
 *   node server/scripts/backfill-free-grants.js --apply
 *
 *   # scope to a single character (debugging convenience):
 *   node server/scripts/backfill-free-grants.js --character-id 64ab... --apply
 *
 *   # target the test DB:
 *   MONGODB_DB=tm_suite_test node server/scripts/backfill-free-grants.js --apply
 *
 * Locally, run from `server/` so cwd-relative `dotenv/config` picks up
 * `server/.env`. On Render env vars are pre-set (no-op).
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { ObjectId } from 'mongodb';
import { connectDb, getCollection, closeDb } from '../db.js';

/**
 * The 14 legacy `m.free_<slug>` channels from ADR-005's survey. Mirrors the
 * LEGACY_FREE_SLUGS constant in `public/js/data/rules-helpers.js`. Order is
 * irrelevant — alphabetical for diff-stability.
 */
export const LEGACY_FREE_SLUGS = [
  'attache', 'bloodline', 'carthian', 'fwb', 'inv', 'lk', 'mci', 'mdb',
  'ohm', 'pet', 'pt', 'retainer', 'sw', 'vm',
];

/**
 * Backfill a single character's merits in-memory. Returns a summary plus the
 * mutated merits array. Pure compute — no DB access, no module-level state.
 *
 * @param {object} c         - character doc
 * @param {object} [opts]    - { dryRun?: boolean }
 * @returns {{ touched: boolean, meritsTouched: number, fieldsMigrated: number, conflicts: Array, perSlug: object, merits: object[] }}
 */
export function backfillCharacterMerits(c, opts = {}) {
  const dryRun = !!opts.dryRun;
  const result = {
    touched: false,
    meritsTouched: 0,
    fieldsMigrated: 0,
    conflicts: [],
    perSlug: Object.create(null),
    merits: c.merits,
  };
  if (!Array.isArray(c.merits) || !c.merits.length) return result;

  // Shallow-clone merits so the in-memory dryRun pass doesn't mutate the input
  // (caller may want to re-read). On apply we still produce a new array; the
  // caller writes it back as the canonical merits.
  const next = c.merits.map(m => ({ ...m, ...(m && m.free_grants ? { free_grants: { ...m.free_grants } } : {}) }));

  for (let i = 0; i < next.length; i++) {
    const m = next[i];
    if (!m || typeof m !== 'object') continue;

    // Per-merit pass: collect legacy slugs to migrate + detect conflicts.
    const planned = [];
    const conflicts = [];
    for (const slug of LEGACY_FREE_SLUGS) {
      const flatKey = 'free_' + slug;
      const flatVal = m[flatKey];
      // Skip if absent or zero — nothing to migrate, no map entry to create.
      if (typeof flatVal !== 'number' || flatVal <= 0) continue;

      const mapVal = (m.free_grants && typeof m.free_grants === 'object') ? m.free_grants[slug] : undefined;
      const mapPopulated = typeof mapVal === 'number' && mapVal > 0;

      if (mapPopulated && mapVal !== flatVal) {
        // Differ → real conflict. Whole-merit skip.
        conflicts.push({ slug, mapVal, legacyVal: flatVal });
      } else {
        // Equal-or-empty → safe to migrate. Map gets the value; legacy gets unset.
        planned.push({ slug, value: flatVal });
      }
    }

    if (conflicts.length > 0) {
      result.conflicts.push({
        char_id: c._id ? String(c._id) : null,
        char_name: c.name || '(unnamed)',
        merit_index: i,
        merit_name: m.name || '(unnamed)',
        conflicts,
      });
      continue; // SKIP MERIT entirely — safety guard.
    }

    if (!planned.length) continue;

    if (!dryRun) {
      if (!m.free_grants || typeof m.free_grants !== 'object') m.free_grants = {};
      for (const { slug, value } of planned) {
        m.free_grants[slug] = value;
        delete m['free_' + slug];
      }
    }
    result.meritsTouched += 1;
    result.fieldsMigrated += planned.length;
    for (const { slug } of planned) {
      result.perSlug[slug] = (result.perSlug[slug] || 0) + 1;
    }
    result.touched = true;
  }

  if (result.touched) result.merits = next;
  return result;
}

/**
 * Drive the backfill against MongoDB. Returns the aggregate summary.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun]
 * @param {string}  [opts.characterId]
 * @param {boolean} [opts.log]
 */
export async function backfill(opts = {}) {
  const { dryRun = true, characterId, log = true } = opts;
  const col = getCollection('characters');
  const filter = characterId ? { _id: new ObjectId(characterId) } : {};
  const chars = await col.find(filter).toArray();

  const totals = {
    charsScanned: chars.length,
    charsTouched: 0,
    meritsTouched: 0,
    fieldsMigrated: 0,
    perSlug: Object.create(null),
    conflicts: [],
  };

  for (const c of chars) {
    const r = backfillCharacterMerits(c, { dryRun });
    if (r.conflicts.length) totals.conflicts.push(...r.conflicts);
    if (!r.touched) continue;
    totals.charsTouched += 1;
    totals.meritsTouched += r.meritsTouched;
    totals.fieldsMigrated += r.fieldsMigrated;
    for (const [slug, n] of Object.entries(r.perSlug)) {
      totals.perSlug[slug] = (totals.perSlug[slug] || 0) + n;
    }
    if (!dryRun) {
      await col.updateOne({ _id: c._id }, { $set: { merits: r.merits } });
    }
  }

  if (log) {
    const verb = dryRun ? '[DRY RUN] would touch' : 'touched';
    console.log(`Scanned ${totals.charsScanned} character(s); ${verb} ${totals.charsTouched} char(s), ${totals.meritsTouched} merit(s), ${totals.fieldsMigrated} field(s).`);
    if (Object.keys(totals.perSlug).length) {
      console.log('Per-slug:');
      for (const slug of LEGACY_FREE_SLUGS) {
        const n = totals.perSlug[slug] || 0;
        if (n > 0) console.log(`  ${slug.padEnd(10)} ${n}`);
      }
    }
    if (totals.conflicts.length) {
      console.log(`\nCONFLICTS (${totals.conflicts.length}) — these merits were SKIPPED for human review:`);
      for (const c of totals.conflicts) {
        const lines = c.conflicts.map(x =>
          `      ${x.slug}: map=${x.mapVal}, legacy=${x.legacyVal}`,
        );
        console.log(`  ${c.char_name} (${c.char_id || '?'}) → merit[${c.merit_index}] "${c.merit_name}":`);
        for (const l of lines) console.log(l);
      }
    }
  }
  return totals;
}

export async function main(argv = process.argv) {
  const dryRun = !argv.includes('--apply');
  const cidIdx = argv.indexOf('--character-id');
  const characterId = cidIdx >= 0 ? argv[cidIdx + 1] : null;

  console.log(`Mode: ${dryRun ? 'DRY RUN (read only; pass --apply to write)' : 'APPLY (will write)'}`);
  console.log(`Target DB: ${process.env.MONGODB_DB || 'tm_suite'}`);
  if (characterId) console.log(`Scoped to character: ${characterId}`);
  console.log('');

  await connectDb();
  try {
    await backfill({ dryRun, characterId });
  } finally {
    await closeDb();
  }

  console.log('\nIdempotency check (after --apply): re-run with no flag and confirm "touched 0 char(s)".');
}

// Auto-run only when invoked directly (not when imported by a test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(1); });
}
