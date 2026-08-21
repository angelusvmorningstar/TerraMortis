/**
 * DBO-2 - stamp a durable opaque `fact_key` onto every `character_dossier`
 * fact that does not already have one. Manual, ST-invoked, one-off. Nothing
 * calls this on server boot and nothing calls it in test setup; the vitest
 * suite imports its exported functions and runs them against `tm_suite_test`
 * only.
 *
 * NOTE FOR ANYONE TIDYING THIS FILE: there is deliberately NO
 * `#!/usr/bin/env node` shebang, for the same reason
 * `dbo-1-purchasable-powers-field-cleanup.mjs` and
 * `dbo-8-orphaned-touchstone-edges-cleanup.mjs` have none - a shebang breaks
 * vitest's transform for any file importing this one.
 *
 * ==========================================================================
 *   RUNNING THIS FOR REAL IS ANGELUS'S ACTION, NOT AN AGENT'S.
 * ==========================================================================
 *
 *   Connection comes from `../db.js` (MONGODB_URI via config.js, database
 *   name from MONGODB_DB, defaulting to `tm_suite`). Running this bare from
 *   `server/` with `server/.env` in place therefore targets LIVE Atlas. What
 *   makes that survivable is the DRY-RUN DEFAULT: without `--apply` this only
 *   reads, and prints exactly what it would do.
 *
 *   Per epic-dbo's own hard constraint, do not run `--apply` against live
 *   `tm_suite` before the 2026-08-15 game (no migration/backfill/restructure
 *   against production before it).
 *
 * BACKGROUND (specs/stories/dbo-2-character-dossier-schema-and-reveal.md):
 * TM Wiki's fact-level reveal mechanism is built and shipped but gated dark
 * behind `wiki_config.fact_level_enabled: false`, for exactly one documented
 * reason - `character_dossier.facts[]` is POSITIONALLY addressed with no
 * stable key, so any reorder / insert / delete silently repoints every
 * reference. Their spec names an upstream TM Suite mint of a durable opaque
 * per-fact key as "the single dependency this foundation cannot satisfy
 * itself". This script is the one-off backfill half of that mint; the schema
 * half is `../schemas/character_dossier.schema.js`.
 *
 * WHEN THIS HAS BEEN RUN WITH `--apply`, TM WIKI MUST BE TOLD, so they can
 * backfill-verify and decide when to flip `wiki_config.fact_level_enabled`.
 * That flag is their repo, their database, their action - never this one's.
 *
 * WHAT IT DOES, per document in `character_dossier`, per fact:
 *   - fact has no VALID `fact_key` (missing, null, non-string, or the empty
 *                                string) -> $set exactly that one field to a
 *                                fresh `randomUUID()`.
 *   - fact already has a valid one (any non-empty string) -> NEVER touched.
 *                                Never overwritten, never regenerated, never
 *                                normalised.
 * A document with nothing to stamp is omitted from the plan entirely - an
 * empty plan means nothing to do, the same "empty = clean" contract the two
 * prior DBO cleanup scripts use.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it never touches `st_hidden` (all 442
 * live facts are `true`, and that is Angelus's stated intent, not a bug), it
 * never writes `revealed_to`, and it never $sets the whole `facts` array.
 *
 * WRITE SHAPE, AND THIS IS LOAD-BEARING RATHER THAN STYLE. The whole problem
 * `fact_key` exists to solve is that `facts[]` is positionally addressed, so
 * this migration must not itself be vulnerable to the hazard it is fixing.
 * `applyBackfill` therefore RE-DERIVES which fact positions to stamp from the
 * fresh backup read, using `needsKey` - it never iterates the plan's own
 * `indices`, which describe a possibly-superseded array layout. The plan is
 * used only to choose which DOCUMENTS to look at. Each write is then per-index
 * and filtered on a "still has no valid key" predicate, which makes it
 * self-guarding: a no-op if that slot gained a valid key since the read, and a
 * single-field $set so it can never clobber a concurrent edit to any other
 * field of that fact.
 *
 * SAFETY: DRY-RUN BY DEFAULT. `--apply` writes a full-document JSON backup to
 * `server/scripts/_backups/dbo-2-dossier-fact-key-<ISO>.json` BEFORE issuing
 * any update, and aborts (writes nothing) if the backup write throws. The
 * write decisions - both WHICH positions and WHETHER each one still needs a
 * key - come from that same fresh read, never from the possibly-stale plan.
 * Idempotent: re-running `planBackfill` after a successful `--apply` returns
 * an empty array.
 *
 * Usage, from `server/` so that cwd-relative `dotenv/config` picks up
 * `server/.env`:
 *
 *   # preview against the configured database, no writes (the default):
 *   node scripts/dbo-2-dossier-fact-key-backfill.mjs
 *
 *   # write:
 *   node scripts/dbo-2-dossier-fact-key-backfill.mjs --apply
 *
 *   # write to the throwaway test database instead of live:
 *   MONGODB_DB=tm_suite_test node scripts/dbo-2-dossier-fact-key-backfill.mjs --apply
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connectDb, getCollection, closeDb } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, '_backups');

/**
 * The mint. `randomUUID()` from `node:crypto`: built in, no new dependency,
 * available under this repo's declared `engines.node: ">=20.19.0"`. Opaque by
 * construction - it encodes neither the fact's position nor its value, which
 * is the whole point (see the schema's header for the three invariants).
 *
 * @returns {string}
 */
function mint() {
  return randomUUID();
}

/**
 * The single "does this fact still need a key?" test, shared by `planBackfill`
 * and by `applyBackfill`'s re-derivation so the two can never disagree.
 *
 * VALIDITY, NOT MERE PRESENCE, and that distinction is deliberate. The schema
 * this story ships (`../schemas/character_dossier.schema.js`) declares
 * `fact_key` as `{ type: 'string', minLength: 1 }`, so `null`, `''`, a number
 * or an object are all values that schema rejects. A presence-only test would
 * treat such a fact as permanently complete: the migration would skip it, no
 * re-run could ever repair it, and the collection would keep a fact the shipped
 * schema calls invalid.
 *
 * This does NOT weaken AC5's "never overwrite an existing fact_key" invariant.
 * That invariant protects a fact's STABLE IDENTITY, and identity is what a
 * non-empty string key carries. An invalid value carries no identity for any
 * reveal reference to have been built on, so minting a fresh key over it is
 * healing, not overwriting. Any non-empty string is left strictly alone -
 * including keys minted by something other than this script.
 *
 * (Live data as of 2026-08-14 has zero facts with a `fact_key` of any value at
 * all, 0 of 442, so this is a correctness guard against a state that could only
 * arise later - hand-editing, or some future writer's bug - not a live fix.)
 *
 * @param {unknown} fact
 * @returns {boolean}
 */
function needsKey(fact) {
  if (!fact || typeof fact !== 'object') return false;
  return typeof fact.fact_key !== 'string' || fact.fact_key.length === 0;
}

/**
 * The database-side mirror of `needsKey` for one fact position: matches when
 * `facts.N.fact_key` is missing, null, not a string, or the empty string, and
 * never when it is a non-empty string. This is the second, DB-level guard on
 * each update, closing the gap between the fresh read and the write itself.
 *
 * @param {number} i
 * @returns {object} a Mongo query fragment
 */
function needsKeyFilter(i) {
  const field = `facts.${i}.fact_key`;
  return { $or: [{ [field]: { $not: { $type: 'string' } } }, { [field]: '' }] };
}

/**
 * Classify every document in `character_dossier`. PURE: reads only, no
 * writes, no side effects, so `main()` can print the whole plan before anyone
 * decides whether to run it.
 *
 * The collection is taken as an ARGUMENT rather than resolved internally, so
 * a test can hand over a `tm_suite_test` collection and this can never reach
 * live data by accident.
 *
 * A document with no unkeyed fact is omitted entirely - an empty result means
 * nothing to do.
 *
 * @param {import('mongodb').Collection} collection
 * @returns {Promise<Array<{_id:*, character_id:*, indices:number[]}>>}
 */
export async function planBackfill(collection) {
  const docs = await collection.find({}).toArray();
  const rows = [];

  for (const doc of docs) {
    const facts = Array.isArray(doc.facts) ? doc.facts : [];
    const indices = [];
    facts.forEach((fact, i) => {
      if (needsKey(fact)) indices.push(i);
    });

    if (!indices.length) continue;
    rows.push({ _id: doc._id, character_id: doc.character_id, indices });
  }

  return rows;
}

/**
 * Carry out (or, by default, merely narrate) the plan.
 *
 * @param {import('mongodb').Collection} collection
 * @param {Array<object>} rows - the output of `planBackfill`
 * @param {{ apply?: boolean, log?: Function }} opts
 * @returns {Promise<{documentsTouched:number, factsStamped:number, backedUp:number}>}
 */
export async function applyBackfill(collection, rows, { apply = false, log = () => {} } = {}) {
  if (!rows.length) {
    log('Nothing to backfill - every fact already carries a valid fact_key.');
    return { documentsTouched: 0, factsStamped: 0, backedUp: 0 };
  }

  if (!apply) {
    let wouldStamp = 0;
    for (const row of rows) {
      wouldStamp += row.indices.length;
      log(`  [DRY RUN] would stamp ${row.indices.length} fact(s) on character_dossier/${row._id} (character ${row.character_id})`);
    }
    log(`\n${wouldStamp} fact(s) across ${rows.length} document(s) would gain a fact_key. Re-run with --apply to write.`);
    return { documentsTouched: 0, factsStamped: 0, backedUp: 0 };
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, `dbo-2-dossier-fact-key-${stamp}.json`);
  const originals = await collection.find({ _id: { $in: rows.map(r => r._id) } }).toArray();
  writeFileSync(backupPath, JSON.stringify(originals, null, 2));
  log(`Backup written: ${backupPath}`);

  // Re-derive what to stamp from `originals` (fetched just now), not from
  // `rows` (fetched by planBackfill, which may be stale by the time we get
  // here) - the same pattern DBO-1's and DBO-8's own reviews established.
  //
  // AND THAT RE-DERIVATION INCLUDES THE POSITIONS THEMSELVES, which is the
  // whole point. `row.indices` describes the array layout as it stood at PLAN
  // time; if anything inserted, removed or moved a fact since, those positions
  // now name different facts. Iterating them would stamp whatever has shifted
  // into a planned slot while silently missing the fact that was actually
  // planned. So `row` contributes exactly one thing here - WHICH DOCUMENT to
  // look at - and every write decision inside the document comes from
  // `current.facts` via `needsKey`. Whatever is genuinely unkeyed in the fresh
  // read gets stamped, full stop, which is AC5's literal requirement that the
  // read producing the backup is the read the write decisions come from.
  //
  // `needsKeyFilter` on each update is then a second, DB-level guard against
  // the remaining gap between this re-read and the write itself, so a slot
  // that gained a valid key out of band is silently skipped rather than
  // re-minted.
  const byId = new Map(originals.map(doc => [String(doc._id), doc]));

  let documentsTouched = 0;
  let factsStamped = 0;

  for (const row of rows) {
    const current = byId.get(String(row._id));
    if (!current) continue; // deleted since planning

    const facts = Array.isArray(current.facts) ? current.facts : [];
    let stampedHere = 0;

    const freshIndices = [];
    facts.forEach((fact, i) => {
      if (needsKey(fact)) freshIndices.push(i);
    });

    for (const i of freshIndices) {
      const result = await collection.updateOne(
        { _id: row._id, ...needsKeyFilter(i) },
        { $set: { [`facts.${i}.fact_key`]: mint() } }
      );
      if (result.modifiedCount === 1) stampedHere += 1;
    }

    if (stampedHere) {
      documentsTouched += 1;
      factsStamped += stampedHere;
      log(`  stamped ${stampedHere} fact(s) on ${row._id}`);
    }
  }

  return { documentsTouched, factsStamped, backedUp: originals.length };
}

export async function main(argv = process.argv) {
  const apply = argv.includes('--apply');
  const dbName = process.env.MONGODB_DB || 'tm_game';

  console.log(`Mode     : ${apply ? 'APPLY (will backup + write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${dbName}`);
  console.log('');

  await connectDb();
  try {
    const collection = getCollection('character_dossier');
    const rows = await planBackfill(collection);
    const factCount = rows.reduce((n, r) => n + r.indices.length, 0);
    // Print the collection's own size alongside the work count. MongoDB will
    // happily select a database that does not exist, so a typo'd MONGODB_DB
    // (`tm_sutie`) reads an absent collection and reports the same clean
    // `0 document(s) / 0 fact(s)` a genuinely finished migration reports. Seen
    // next to `0 document(s) in the collection total` that is obviously an
    // empty target; next to `30 document(s) in the collection total` it is a
    // real completion. Report path only - this changes nothing about what gets
    // planned or written.
    const totalDocs = await collection.countDocuments({});
    console.log(`character_dossier: ${rows.length} document(s) / ${factCount} fact(s) need a fact_key.`);
    console.log(`character_dossier: ${totalDocs} document(s) in the collection total.`);
    console.log('');

    const result = await applyBackfill(collection, rows, { apply, log: msg => console.log(msg) });
    console.log('');
    console.log(`Totals: ${result.factsStamped} fact(s) stamped across ${result.documentsTouched} document(s), ${result.backedUp} document(s) backed up.`);
    if (apply) {
      console.log('Idempotency check: re-run with --apply and confirm "0 document(s) / 0 fact(s) need a fact_key".');
      console.log('Then tell TM Wiki the mint has landed, so they can backfill-verify and decide when to flip wiki_config.fact_level_enabled.');
    }
  } finally {
    await closeDb();
  }
}

// Auto-run only when invoked directly, never when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
