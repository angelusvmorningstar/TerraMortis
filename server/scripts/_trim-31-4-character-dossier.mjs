// _trim-31-4-character-dossier.mjs — Story 31-4 (TM Wiki), the deliberately
// SEPARATE, MANUAL final step of "copy, verify, cut over, then drop."
//
// THIS IS THE DESTRUCTIVE STEP. Angelus's own action, ONLY, once he has
// personally confirmed the cutover works end to end against PRODUCTION (not
// just the dev copy the migration's own build-and-verify pass ran against).
// Never run this as part of any automated dev-story/code-review pass, and never
// bundle it with the copy or verify steps.
//
// TRIM, NOT DROP - and that is the whole reason this script differs from
// _drop-31-2-location-data.mjs and _drop-31-3-story-threads.mjs. Story 31-4
// splits `character_dossier`'s POPULATION by a field-level rule instead of
// moving the whole collection, so `tm_suite.character_dossier` stays alive
// afterwards. What this does, per source document:
//
//   1. computes the facts that SHOULD have migrated (the eligibility
//      classifier below),
//   2. re-verifies, live and right now, that every one of them is present in
//      `tm_wiki` and matches FIELD FOR FIELD (not counts, not ids - 31-2's own
//      external-review lesson, inherited from the start),
//   3. and ONLY THEN removes exactly those facts from the source document,
//      leaving the touchstone-coupled ones untouched,
//   4. deleting the whole document if its `facts[]` is empty afterwards (a
//      document existing solely to hold now-migrated facts serves nothing).
//
// If ANY document's eligible facts are missing from `tm_wiki`, or disagree on
// content, it refuses and removes nothing at all - not "skips that one".
//
// THE CLASSIFIER, RE-IMPLEMENTED RATHER THAN IMPORTED. A fact stays in
// `tm_suite` if and only if its `sheet_field` is `touchstones` - the one sheet
// field with a genuine live-play mechanic behind it (`validateTouchstones` in
// server/routes/characters.js enforces the six-entry cap and the Humanity 1-10
// range on every character save). `sheet_field: 'date_of_embrace'` is not
// (nothing under server/routes/ reads it), so those facts migrate.
//
// KEEP IN SYNC BY HAND with `isMigrationEligible`/`valuesEqual`/`diffFacts` in
// TM Wiki's own `server/scripts/migrate-31-4-character-dossier.mjs`. There is
// no shared package across the two repos, so this is a deliberate duplication -
// the same pattern Story 31-3's drop script already established. Confirmed
// character-for-character equivalent as of 2026-08-15; nothing enforces that
// automatically, so a future edit to one MUST be mirrored in the other.
//
// WHY THIS IS ITS OWN SCRIPT, NOT A FLAG ON THE MIGRATION SCRIPT: the standing
// order (specs/deferred-work.md item 163, TM Wiki) is explicit - "copy, verify,
// cut over, then drop. Never delete the source first." Making the destructive
// half a separate, distinctly-named, always-manually-invoked script is what
// makes that structurally true rather than a convention one flag could bypass.
//
// Dry run by default.
//   node server/scripts/_trim-31-4-character-dossier.mjs           (dry run - report only, removes nothing)
//   node server/scripts/_trim-31-4-character-dossier.mjs --write   (trim, ONLY after a clean re-verify)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

// Script-relative, not CWD-relative - the exact 31-2 defect this shape exists
// to avoid rediscovering.
const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(HERE, '..', '..', '.env') });

const WRITE = process.argv.includes('--write');
const COLLECTION = 'character_dossier';
const SHEET_FIELD_THAT_STAYS = 'touchstones';

// `fact_key` is minted by TM Wiki's migration and has no source counterpart.
const FACT_DEST_ONLY_FIELDS = new Set(['fact_key']);
// `_id` differs by construction; `facts` is compared fact by fact.
const DOC_FIELDS_COMPARED_SEPARATELY = new Set(['_id', 'facts']);

// The one thing standing between "verified the dev copy" and "trimmed the only
// real copy": this script's entire safety model depends on comparing tm_game
// against PRODUCTION tm_story. Refuse outright if the resolved target is
// anything else, rather than trusting whatever .env happened to load.
//
// `tm_wiki` was the pre-2026-08-21-rebrand name (TM Story's own config.js
// default is `tm_story`; `tm_wiki`/`tm_wiki_dev` both still exist on the
// cluster as separate, non-live databases - `tm_wiki` a frozen pre-rebrand
// snapshot, `tm_wiki_dev` the dev database, confirmed via a live
// `listDatabases` call, not assumed from an old script comment). Comparing
// against either would silently verify against the wrong database.
const WIKI_DB_NAME = process.env.MONGODB_WIKI_DB ?? 'tm_story';
if (WIKI_DB_NAME !== 'tm_story') {
  console.error(`REFUSING TO RUN: resolved wiki database is "${WIKI_DB_NAME}", not "tm_story".`);
  console.error('This script only ever compares against and protects PRODUCTION. If you intended');
  console.error('to test against a dev database, that is not what this script is for - nothing was');
  console.error('read or removed.');
  process.exit(1);
}

// PURE. See "THE CLASSIFIER" above. Exact string equality: a near miss
// (`Touchstones`, `touchstone`, a trailing space) is not the live field name.
function isMigrationEligible(fact) {
  return fact?.sheet_field !== SHEET_FIELD_THAT_STAYS;
}

function partitionFacts(facts) {
  if (!Array.isArray(facts)) return { eligible: [], ineligible: [] };
  const eligible = [];
  const ineligible = [];
  for (const fact of facts) (isMigrationEligible(fact) ? eligible : ineligible).push(fact);
  return { eligible, ineligible };
}

// PURE. Structural equality that treats a Mongo ObjectId (or any BSON type
// exposing .equals()) correctly. `Date` is checked explicitly and BEFORE the
// generic-object branch: a Date instance has zero OWN enumerable properties, so
// the generic key-union comparison would otherwise report any two Dates as
// vacuously equal regardless of the moment each represents.
function valuesEqual(a, b) {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === 'object' && typeof a.equals === 'function' && typeof b === 'object' && typeof b.equals === 'function') {
    try { return a.equals(b); } catch { return false; }
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => valuesEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => valuesEqual(a[k], b[k]));
  }
  return false;
}

function diffFacts(sourceFact, destFact) {
  const keys = new Set(
    [...Object.keys(sourceFact ?? {}), ...Object.keys(destFact ?? {})].filter((k) => !FACT_DEST_ONLY_FIELDS.has(k)),
  );
  const diffs = [];
  for (const key of keys) {
    if (!valuesEqual(sourceFact?.[key], destFact?.[key])) diffs.push(key);
  }
  return diffs;
}

// All 30 live source documents store character_id as a BSON ObjectId; the
// migrated copies carry it verbatim. String-normalise before matching, the same
// convention TM Wiki's own factsForCharacter uses.
const characterKey = (doc) => String(doc?.character_id);

function findDuplicateCharacterIds(docs) {
  const seen = new Set();
  const dupes = new Set();
  for (const d of docs) {
    const key = characterKey(d);
    if (seen.has(key)) dupes.add(key); else seen.add(key);
  }
  return [...dupes];
}

// `tm_suite` was the pre-2026-08-21-rebrand name. The live database is `tm_game`
// (server/db.js's own default) - `tm_suite` itself still exists but is a frozen,
// unmodified snapshot from the moment of that rebrand (Phase 3's drop was never
// run; see TM Admin/specs/rebrand-game-story-admin.md). Hardcoding `tm_suite`
// here would trim a database nothing reads or writes any more while leaving the
// real live collection completely untouched - resolve the same way db.js does.
const SUITE_DB_NAME = process.env.MONGODB_DB || 'tm_game';

const suite = new MongoClient(process.env.MONGODB_URI);
const wiki = new MongoClient(process.env.MONGODB_WIKI_URI ?? process.env.MONGODB_URI);
await suite.connect();
await wiki.connect();

const suiteDb = suite.db(SUITE_DB_NAME);
const wikiDb = wiki.db(WIKI_DB_NAME);

// The whole run lives in a function so an early exit can `return` and still fall
// through the caller's `finally` (a bare `process.exit()` at module top level
// skips every cleanup path there is). Code-review patch, 2026-08-15.
async function run() {
  console.log(`Re-verifying tm_story ("${WIKI_DB_NAME}") holds every MIGRATED fact of ${SUITE_DB_NAME}.${COLLECTION},`);
  console.log('live, right now, FIELD BY FIELD, BY character_id (not trusting an earlier result,');
  console.log('and not just counting facts)...\n');

  const [suiteDocs, wikiDocs] = await Promise.all([
    suiteDb.collection(COLLECTION).find({}).toArray(),
    wikiDb.collection(COLLECTION).find({}).toArray(),
  ]);

  const duplicateSuite = findDuplicateCharacterIds(suiteDocs);
  const duplicateWiki = findDuplicateCharacterIds(wikiDocs);
  const byWiki = new Map(wikiDocs.map((d) => [characterKey(d), d]));

  const missing = [];
  const mismatched = [];
  const leaked = [];
  const plan = []; // { key, doc, eligible, ineligible }
  let eligibleTotal = 0;
  let ineligibleTotal = 0;
  let noEligibleDocs = 0;

  for (const doc of suiteDocs) {
    const key = characterKey(doc);
    const { eligible, ineligible } = partitionFacts(doc.facts);
    eligibleTotal += eligible.length;
    ineligibleTotal += ineligible.length;

    const wikiDoc = byWiki.get(key);
    const wikiFacts = Array.isArray(wikiDoc?.facts) ? wikiDoc.facts : [];

    // The inverse check, and the one specific to a SPLIT rather than a whole-
    // collection move: a touchstone-coupled fact must never have reached tm_wiki.
    // If one did, the classifiers on the two sides disagree, and trimming here
    // would delete a fact from tm_suite that tm_wiki is holding a copy of under a
    // rule this repo does not share.
    //
    // CODE-REVIEW PATCH (2026-08-15): this runs for EVERY source document, before
    // the "nothing here to remove" skip below. It used to sit after it, which made
    // it unreachable for precisely the document shape most likely to need it - one
    // whose remaining facts are ALL touchstone-coupled, either on an initial run or
    // on any re-run after a first trim.
    const leakedFacts = wikiFacts.filter((f) => !isMigrationEligible(f));
    if (leakedFacts.length) leaked.push({ key, count: leakedFacts.length });

    // Nothing of this document ever left, so there is nothing here to remove -
    // either every one of its facts is touchstone-coupled, or a previous run
    // already trimmed it (this script is safe to re-run).
    if (!eligible.length) { noEligibleDocs += 1; continue; }

    if (!wikiDoc) { missing.push(key); continue; }

    const diffs = [];
    const docKeys = new Set(
      [...Object.keys(doc), ...Object.keys(wikiDoc)].filter((k) => !DOC_FIELDS_COMPARED_SEPARATELY.has(k)),
    );
    for (const k of docKeys) {
      if (!valuesEqual(doc[k], wikiDoc[k])) diffs.push(k);
    }

    if (wikiFacts.length !== eligible.length) {
      diffs.push(`facts.length (${SUITE_DB_NAME} eligible ${eligible.length}, tm_story ${wikiFacts.length})`);
    }
    const shared = Math.min(wikiFacts.length, eligible.length);
    for (let i = 0; i < shared; i += 1) {
      for (const field of diffFacts(eligible[i], wikiFacts[i])) diffs.push(`facts[${i}].${field}`);
    }
    if (diffs.length) mismatched.push({ key, diffs });

    plan.push({ key, doc, eligible, ineligible });
  }

  console.log(`${COLLECTION}: ${SUITE_DB_NAME}=${suiteDocs.length} doc(s) tm_story=${wikiDocs.length} doc(s)`);
  console.log(`  ${SUITE_DB_NAME} facts: ${eligibleTotal} migrated (to be removed here), ${ineligibleTotal} touchstone-coupled (stay)`);
  if (duplicateSuite.length) console.log(`  DUPLICATE character_id(s) in ${SUITE_DB_NAME}: ${duplicateSuite.length}`, duplicateSuite);
  if (duplicateWiki.length) console.log(`  DUPLICATE character_id(s) in tm_story: ${duplicateWiki.length}`, duplicateWiki);
  if (missing.length) console.log(`  MISSING FROM tm_story: ${missing.length} character(s)`, missing);
  if (mismatched.length) {
    console.log(`  CONTENT MISMATCH: ${mismatched.length} document(s)`);
    for (const m of mismatched) console.log(`    ${m.key}: ${m.diffs.join(', ')}`);
  }
  if (leaked.length) {
    console.log(`  TOUCHSTONE-COUPLED FACTS PRESENT IN tm_story (must be zero): ${leaked.length} document(s)`);
    for (const l of leaked) console.log(`    ${l.key}: ${l.count} fact(s)`);
  }

  const allClean = duplicateSuite.length === 0 && duplicateWiki.length === 0
    && missing.length === 0 && mismatched.length === 0 && leaked.length === 0;

  if (allClean) {
    console.log('  every migrated fact is present in tm_story AND matches field for field (by character_id).');
  }

  // CODE-REVIEW PATCH (2026-08-15): a document that FAILED the re-verify on
  // content (not merely absence) is excluded from the trim/delete buckets too.
  // It used to stay in `plan` and be counted as "would be TRIMMED", so the dry
  // run's own summary contradicted the refusal printed a few lines later.
  const verifyFailed = new Set([...mismatched.map((m) => m.key), ...leaked.map((l) => l.key)]);
  const actionable = plan.filter((p) => !verifyFailed.has(p.key));
  const toEmpty = actionable.filter((p) => p.ineligible.length === 0);
  const toTrim = actionable.filter((p) => p.ineligible.length > 0);
  console.log(`\n  ${toTrim.length} document(s) would be TRIMMED (keeping their touchstone-coupled facts).`);
  console.log(`  ${toEmpty.length} document(s) would be DELETED (nothing left after the migrated facts are removed).`);
  console.log(`  ${noEligibleDocs} document(s) untouched (no migrated facts of their own, or already trimmed).`);
  const notAccountedFor = suiteDocs.length - actionable.length - noEligibleDocs;
  if (notAccountedFor > 0) {
    console.log(`  ${notAccountedFor} document(s) NOT ACCOUNTED FOR in either bucket - they failed the re-verify above (missing from tm_story, a content mismatch, or a leaked touchstone-coupled fact).`);
  }

  if (!allClean) {
    console.error(`\nREFUSING TO TRIM: tm_story does not clearly hold ${SUITE_DB_NAME}'s migrated facts right now.`);
    console.error('Re-run the migration script (--write, then --verify) from TM Story first. Nothing was removed.');
    process.exitCode = 1;
    return;
  }

  if (!WRITE) {
    console.log('\nRe-verify CLEAN. DRY RUN - nothing removed. Re-run with --write to actually trim');
    console.log(`${SUITE_DB_NAME}.${COLLECTION}. THIS IS IRREVERSIBLE.`);
    return;
  }

  console.log(`\nRe-verify CLEAN. Trimming ${SUITE_DB_NAME}.${COLLECTION} now...`);
  let trimmed = 0;
  let deleted = 0;
  let attempted = 0;
  // PROGRESS IS PRINTED PER DOCUMENT, not only as a final tally (code-review
  // patch). This is the one irreversible, human-run-once step in the whole
  // migration, so a crash on document k of 30 must still leave a readable record
  // in the terminal of exactly which documents were already changed.
  try {
    for (const { key, doc, ineligible } of actionable) {
      attempted += 1;
      if (ineligible.length) {
        // Replace `facts[]` with exactly the facts that stay. Written as a whole-
        // array set rather than a `$pull` on a matcher, so what lands is precisely
        // what this script verified rather than whatever a query happens to match.
        await suiteDb.collection(COLLECTION).updateOne({ _id: doc._id }, { $set: { facts: ineligible } });
        trimmed += 1;
        console.log(`  [${attempted}/${actionable.length}] TRIMMED ${key} (_id ${doc._id}) - ${ineligible.length} touchstone-coupled fact(s) kept`);
      } else {
        await suiteDb.collection(COLLECTION).deleteOne({ _id: doc._id });
        deleted += 1;
        console.log(`  [${attempted}/${actionable.length}] DELETED ${key} (_id ${doc._id}) - nothing left once the migrated facts were removed`);
      }
    }
  } catch (err) {
    console.error(`\nSTOPPED PART-WAY at document ${attempted} of ${actionable.length}: ${err.message}`);
    console.error(`  ${trimmed} document(s) trimmed and ${deleted} deleted BEFORE this failure. Those changes are already applied and are NOT rolled back.`);
    console.error('  Safe to re-run: an already-trimmed document has no eligible facts left, so it is skipped rather than trimmed twice.');
    throw err;
  }
  console.log(`  trimmed ${trimmed} document(s), deleted ${deleted} empty document(s).`);
  console.log(`\nDone. ${SUITE_DB_NAME}.${COLLECTION} now holds only the touchstone-coupled facts.`);
}

try {
  await run();
} catch (err) {
  console.error(`\nTRIM FAILED: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exitCode = 1;
} finally {
  // Both clients close on EVERY path, including an unhandled failure mid-loop -
  // previously a throw left both connections open and the process hanging on
  // them (code-review patch).
  await suite.close().catch(() => {});
  await wiki.close().catch(() => {});
}
