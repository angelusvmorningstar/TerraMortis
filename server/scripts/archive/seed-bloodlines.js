/**
 * BL-1 (issue #1008) — seed the `bloodlines` collection from the static
 * constants, and put a unique index on `name`.
 *
 * Follows the #826-hardened pattern of `backfill-free-grants.js`: --dry-run is
 * the default, --apply is required to write, the run is idempotent, and dotenv
 * is loaded first per [[feedback_server_scripts_dotenv_path]].
 *
 * Source of truth for the seed is `public/js/data/constants.js`:
 *   BLOODLINE_DISCS  — name -> four disciplines
 *   BLOODLINE_CLANS  — clan -> the names that clan claims
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why the integrity gate comes first
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   Those two structures are hand-maintained and can disagree. That is not
 *   hypothetical: it is the defect this epic was filed from. Ocka Keats
 *   carried bloodline "Hounds of Actaeon" in production for two weeks while
 *   the constant defining it sat unmerged, so `clanDiscList` fell through to
 *   the plain Gangrel list and her disciplines cost 4 XP/dot instead of 3
 *   (data-map.md drift pattern #15 — a missing lookup degrading to a
 *   plausible neighbouring value, which is why nobody saw it).
 *
 *   Seeding a disagreement would bake that drift into the database, so every
 *   check runs BEFORE anything is written, in dry-run and apply alike, and any
 *   failure aborts with a non-zero exit having written nothing.
 *
 * The live cross-check (how many characters carry a bloodline, and how many of
 * those values resolve against the seed set) is reported, never enforced. It
 * is the evidence BL-5 needs before it can turn validation on, captured while
 * someone is looking at it.
 *
 * Usage — run these FROM `server/`, so cwd-relative `dotenv/config` picks up
 * the local .env. Running them from the repo root loads a different .env (or
 * none) and can point the write at an unintended database.
 *
 *   # preview (default — no writes):
 *   node scripts/seed-bloodlines.js
 *
 *   # apply:
 *   node scripts/seed-bloodlines.js --apply
 *
 *   # target the test DB:
 *   MONGODB_DB=tm_suite_test node scripts/seed-bloodlines.js --apply
 *
 * NEVER run --apply against live during development; the real seed is an
 * operational act for the ST.
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import Ajv from 'ajv';
import { connectDb, getCollection, closeDb } from '../db.js';
import { bloodlineSchema } from '../schemas/bloodline.schema.js';
import { CLAN_NAMES } from '../schemas/character.schema.js';
import { deriveSlug } from '../lib/bloodline-slug.js';
import { ensureBloodlineNameIndex } from '../lib/bloodline-name-index.js';
import { BLOODLINE_DISCS, BLOODLINE_CLANS, CORE_DISCS, RITUAL_DISCS } from '../../public/js/data/constants.js';

const COLLECTION = 'bloodlines';
const REQUIRED_DISCIPLINES = 4;

/**
 * Every discipline a bloodline could legitimately grant. Checked by the
 * integrity gate, deliberately NOT baked into the JSON schema: the whole point
 * of this epic is that reference data stops requiring a deploy, and an enum in
 * the schema would put the discipline list back behind one. The gate protects
 * the hand-maintained constants, which is where the drift actually happens.
 */
const KNOWN_DISCIPLINES = [...CORE_DISCS, ...RITUAL_DISCS];

/**
 * Re-exported so this script's existing callers and its own suite keep their
 * import site. The implementation moved to `server/lib/bloodline-slug.js` in
 * BL-4 (#1008), because the write route needs the identical derivation and
 * BL-3b retires this file to `scripts/archive/`. One implementation, two
 * importers, no copy left behind when the archive move happens.
 */
export { deriveSlug };

/**
 * Verify the two source structures agree with each other and with the clan
 * enum, before a single document is built.
 *
 * @param {object} args
 * @param {object} args.discs      - BLOODLINE_DISCS shape (name -> string[])
 * @param {object} args.clans      - BLOODLINE_CLANS shape (clan -> name[])
 * @param {string[]} args.clanNames - the five clans
 * @returns {{ errors: string[], count: number, clanOf: object }}
 */
export function checkIntegrity({ discs, clans, clanNames = CLAN_NAMES }) {
  const errors = [];
  const names = Object.keys(discs);

  // 1. Exactly four disciplines, each a real discipline name, no repeats.
  //    The count is a rule of the game — a three-discipline entry is invalid,
  //    not a draft. The name check matters just as much: a typo like "Vigor"
  //    is drift pattern #15 arriving through the discipline field instead of
  //    the bloodline field, and it degrades exactly as quietly.
  for (const name of names) {
    const list = discs[name];
    if (!Array.isArray(list)) {
      errors.push(`"${name}" has a ${typeof list} where an array of ${REQUIRED_DISCIPLINES} disciplines is required.`);
      continue;
    }
    if (list.length !== REQUIRED_DISCIPLINES) {
      errors.push(`"${name}" has ${list.length} disciplines; exactly ${REQUIRED_DISCIPLINES} are required.`);
    }
    const seen = new Set();
    for (const d of list) {
      if (typeof d !== 'string' || !d.trim()) {
        errors.push(`"${name}" has an empty or non-string discipline entry.`);
        continue;
      }
      if (seen.has(d)) errors.push(`"${name}" lists "${d}" more than once.`);
      seen.add(d);
      if (!KNOWN_DISCIPLINES.includes(d)) {
        errors.push(`"${name}" lists "${d}", which is not a known discipline.`);
      }
    }
  }

  // 2. Every clan key is one of the five.
  for (const clan of Object.keys(clans)) {
    if (!clanNames.includes(clan)) {
      errors.push(`"${clan}" is not one of the five clans (${clanNames.join(', ')}).`);
    }
  }

  // 3. The two structures name the same set, and each name has exactly one clan.
  const clanOf = Object.create(null);
  for (const [clan, list] of Object.entries(clans)) {
    if (list != null && !Array.isArray(list)) {
      // Without this, `for...of` over a string silently iterates characters and
      // reports one bogus error per letter; over a number it throws a raw
      // TypeError instead of the designed "nothing written" report.
      errors.push(`BLOODLINE_CLANS.${clan} is a ${typeof list} where an array of names is required.`);
      continue;
    }
    for (const name of list || []) {
      if (clanOf[name]) {
        errors.push(clanOf[name] === clan
          ? `"${name}" is listed twice under ${clan}.`
          : `"${name}" is claimed by more than one clan: ${clanOf[name]} and ${clan}.`);
        continue;
      }
      clanOf[name] = clan;
      if (!Object.prototype.hasOwnProperty.call(discs, name)) {
        errors.push(`"${name}" is in BLOODLINE_CLANS (${clan}) but has no BLOODLINE_DISCS entry.`);
      }
    }
  }
  for (const name of names) {
    if (!clanOf[name]) {
      errors.push(`"${name}" is in BLOODLINE_DISCS but no clan claims it in BLOODLINE_CLANS.`);
    }
  }

  // 4. No two names collapse to the same slug. Slugs are meant to be stable
  //    identifiers; a collision now would be a silent one later.
  const bySlug = new Map();
  for (const name of names) {
    const slug = deriveSlug(name);
    if (!slug) {
      errors.push(`"${name}" derives an empty slug.`);
      continue;
    }
    if (bySlug.has(slug)) {
      errors.push(`slug collision: "${bySlug.get(slug)}" and "${name}" both derive "${slug}".`);
      continue;
    }
    bySlug.set(slug, name);
  }

  return { errors, count: names.length, clanOf };
}

/**
 * Build the seed documents. Throws if the source does not pass the integrity
 * gate: silently dropping an unclaimed name would emit exactly the partial
 * truth the gate exists to prevent, and this function is exported, so a future
 * caller must not be able to get documents out of a bad source.
 */
export function buildSeedDocs({ discs, clans, now = new Date().toISOString() }) {
  const { errors, clanOf } = checkIntegrity({ discs, clans });
  if (errors.length) {
    throw new Error(`buildSeedDocs refused: ${errors.length} integrity failure(s).\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
  return Object.keys(discs)
    .filter(name => !!clanOf[name])
    .sort((a, b) => a.localeCompare(b))
    .map(name => ({
      name,
      slug: deriveSlug(name),
      clan: clanOf[name],
      disciplines: [...discs[name]],
      notes: null,
      created_at: now,
      updated_at: now,
    }));
}

/**
 * Compare the live `characters.bloodline` values against the seed set.
 * Read-only and reported, never enforced — see the header note.
 *
 * @param {Array<{name?: string, moniker?: string, bloodline: string}>} rows
 * @param {Set<string>} seedNames
 */
export function crossCheckHolders(rows, seedNames) {
  const unresolved = [];
  const distinct = new Set();
  let resolving = 0;
  for (const r of rows) {
    distinct.add(r.bloodline);
    if (seedNames.has(r.bloodline)) {
      resolving += 1;
    } else {
      unresolved.push({ character: r.moniker || r.name || '(unnamed)', bloodline: r.bloodline });
    }
  }
  // AC 6 asks for both counts. They coincide today (13 holders, 13 distinct)
  // but diverge the moment two characters share a bloodline, and the distinct
  // count is the one BL-5 actually has to clear.
  const distinctResolving = [...distinct].filter(v => seedNames.has(v)).length;
  return {
    holders: rows.length,
    distinctValues: distinct.size,
    resolving,
    distinctResolving,
    unresolved,
  };
}

/**
 * Drive the seed. Returns the summary; throws on an integrity or schema
 * failure, having written nothing.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=true]
 * @param {boolean} [opts.log=true]
 */
export async function seedBloodlines(opts = {}) {
  const { dryRun = true, log = true } = opts;

  // ── Gate 1: the two source structures agree ──
  const integrity = checkIntegrity({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS });
  if (log) {
    console.log(`Integrity: ${integrity.count} bloodline(s) in BLOODLINE_DISCS.`);
  }
  if (integrity.errors.length) {
    const detail = integrity.errors.map(e => `  - ${e}`).join('\n');
    throw new Error(`Seed aborted: ${integrity.errors.length} integrity failure(s), nothing written.\n${detail}`);
  }
  if (log) console.log('Integrity: OK (4 known, distinct disciplines each; both structures agree; clans valid; slugs unique).');

  // ── Gate 2: every built document satisfies the schema ──
  const docs = buildSeedDocs({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS });
  const ajv = new Ajv({ allErrors: true, coerceTypes: false });
  const validate = ajv.compile(bloodlineSchema);
  const schemaFailures = [];
  for (const d of docs) {
    if (!validate(d)) {
      schemaFailures.push(`  - ${d.name}: ${JSON.stringify(validate.errors)}`);
    }
  }
  if (schemaFailures.length) {
    throw new Error(`Seed aborted: ${schemaFailures.length} document(s) failed schema validation, nothing written.\n${schemaFailures.join('\n')}`);
  }

  // ──────────────────────────────────────────────────────────────────────
  //   Reconcile against what is already in the collection
  // ──────────────────────────────────────────────────────────────────────
  //
  // The two gates above protect the SOURCE. They cannot see drift that is
  // already in Mongo, and a name-only idempotency check would report a clean
  // run over a document that disagrees with the constants — the #1008 defect
  // wearing the seed script's own green tick. So compare field by field, and
  // report three states the name check alone would miss:
  //
  //   DIFFERS   present under this name but with a different clan, discipline
  //             list or slug. Reported loudly, never silently overwritten:
  //             which side is right is a human call, and BL-4 owns edits.
  //   orphan    in the collection but not in the source (a rename left the old
  //             document behind, and the public route still serves it).
  //   dupe      the same name twice in the collection, which will make
  //             createIndex fail on --apply. Detected in dry-run too, so the
  //             preview does not go green on a run that cannot succeed.
  //
  const col = getCollection(COLLECTION);
  const existing = await col.find({}).toArray();
  const existingByName = new Map();
  const duplicateNames = [];
  for (const d of existing) {
    if (existingByName.has(d.name)) duplicateNames.push(d.name);
    else existingByName.set(d.name, d);
  }

  const sameList = (a, b) => Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((x, i) => x === b[i]);

  const differing = [];
  for (const d of docs) {
    const live = existingByName.get(d.name);
    if (!live) continue;
    const deltas = [];
    if (live.clan !== d.clan) deltas.push(`clan ${JSON.stringify(live.clan)} -> ${JSON.stringify(d.clan)}`);
    if (!sameList(live.disciplines, d.disciplines)) {
      deltas.push(`disciplines ${JSON.stringify(live.disciplines)} -> ${JSON.stringify(d.disciplines)}`);
    }
    if (live.slug !== d.slug) deltas.push(`slug ${JSON.stringify(live.slug)} -> ${JSON.stringify(d.slug)}`);
    if (deltas.length) differing.push({ name: d.name, deltas });
  }

  const sourceNames = new Set(docs.map(d => d.name));
  const orphans = [...existingByName.keys()].filter(n => !sourceNames.has(n));
  const toInsert = docs.filter(d => !existingByName.has(d.name));
  const differingNames = new Set(differing.map(d => d.name));

  if (log) {
    console.log('');
    console.log('  Bloodline                   Clan        Disciplines                                Status');
    console.log('  ' + '-'.repeat(101));
    for (const d of docs) {
      let status;
      if (!existingByName.has(d.name)) status = dryRun ? 'would insert' : 'inserting';
      else if (differingNames.has(d.name)) status = 'DIFFERS';
      else status = 'present';
      console.log(
        '  ' + d.name.padEnd(28) + d.clan.padEnd(12)
        + d.disciplines.join(', ').padEnd(43) + status
      );
    }
  }

  // ── Write ──
  let inserted = 0;
  if (!dryRun) {
    if (duplicateNames.length) {
      throw new Error(`Seed aborted: the collection already holds duplicate name(s), so the unique index cannot be created: ${duplicateNames.join(', ')}. Nothing written.`);
    }
    // Unique index first, so a duplicate cannot slip in underneath the insert.
    // Idempotent, and it upgrades the pre-BL-4 case-sensitive index in place;
    // see `server/lib/bloodline-name-index.js` for why the collation matters.
    await ensureBloodlineNameIndex(col);
    if (toInsert.length) {
      try {
        const result = await col.insertMany(toInsert);
        inserted = result.insertedCount;
      } catch (err) {
        // insertMany is ordered by default, so a mid-batch failure leaves the
        // collection partly written. Say how many landed before rethrowing —
        // otherwise the operator gets a driver stack trace and no idea what
        // state the collection is in.
        const landed = err?.result?.insertedCount ?? err?.insertedCount ?? 0;
        console.error(`Insert failed after ${landed} of ${toInsert.length} document(s). The collection is PARTIALLY seeded; re-run to insert the remainder.`);
        throw err;
      }
    }
  }

  // ── Live cross-check (read-only, reported not enforced) ──
  const holderRows = await getCollection('characters')
    .find({ bloodline: { $nin: [null, ''] } }, { projection: { name: 1, moniker: 1, bloodline: 1 } })
    .toArray();
  const seedNames = new Set(docs.map(d => d.name));
  const crossCheck = crossCheckHolders(holderRows, seedNames);

  const summary = {
    dryRun,
    total: docs.length,
    alreadyPresent: docs.length - toInsert.length,
    wouldInsert: toInsert.length,
    inserted,
    differing,
    orphans,
    duplicateNames,
    crossCheck,
  };

  if (log) {
    console.log('');
    const verb = dryRun ? 'would insert' : 'inserted';
    console.log(`Summary: ${docs.length} bloodline(s) in source; ${summary.alreadyPresent} already present; ${verb} ${inserted || toInsert.length}.`);

    if (differing.length) {
      console.log('');
      console.log(`  DIFFERS (${differing.length}) — present under this name but disagreeing with the constants. NOT overwritten; a human decides which side is right:`);
      for (const d of differing) {
        console.log(`    ${d.name}: ${d.deltas.join('; ')}`);
      }
    }
    if (orphans.length) {
      console.log('');
      console.log(`  ORPHANS (${orphans.length}) — in the collection but not in the source, and still served by GET /api/bloodlines: ${orphans.join(', ')}`);
    }
    if (duplicateNames.length) {
      console.log('');
      console.log(`  DUPLICATE NAMES (${duplicateNames.length}) — the unique index cannot be created until these are resolved: ${duplicateNames.join(', ')}`);
    }

    console.log('');
    console.log(`Live cross-check: ${crossCheck.holders} character(s) carry a bloodline across ${crossCheck.distinctValues} distinct value(s); ${crossCheck.resolving}/${crossCheck.holders} holder(s) and ${crossCheck.distinctResolving}/${crossCheck.distinctValues} distinct value(s) resolve against the seed set.`);
    if (crossCheck.unresolved.length) {
      console.log('  NON-RESOLVING (reported only; BL-5 must clear these before validation can be turned on):');
      for (const u of crossCheck.unresolved) {
        console.log(`    ${u.character}: "${u.bloodline}"`);
      }
    }
  }

  return summary;
}

/**
 * @param {string[]} [argv]
 * @param {object} [opts]
 * @param {boolean} [opts.closeConnection=true] - tests share one connection for
 *        the whole run (vitest singleFork), so they pass false; closing it
 *        mid-run would break every test file that comes after.
 */
export async function main(argv = process.argv, opts = {}) {
  const { closeConnection = true } = opts;
  const dryRun = !argv.includes('--apply');

  console.log(`Mode: ${dryRun ? 'DRY RUN (read only; pass --apply to write)' : 'APPLY (will write)'}`);
  console.log(`Target DB: ${process.env.MONGODB_DB || 'tm_suite'}`);
  console.log('');

  await connectDb();
  try {
    const summary = await seedBloodlines({ dryRun });
    if (!dryRun) {
      console.log('');
      console.log('Idempotency check: re-run with --apply and confirm "inserted 0".');
    }
    return summary;
  } finally {
    if (closeConnection) await closeDb();
  }
}

// Auto-run only when invoked directly (not when imported by a test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(1); });
}
