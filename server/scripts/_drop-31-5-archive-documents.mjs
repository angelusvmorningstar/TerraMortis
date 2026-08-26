// _drop-31-5-archive-documents.mjs — Story 31-5 (TM Wiki), the deliberately
// SEPARATE, MANUAL final step of "copy, verify, cut over, then drop."
//
// THIS IS THE DESTRUCTIVE STEP. Angelus's own action, ONLY, once he has
// personally confirmed the cutover works end to end against PRODUCTION (not
// just the dev copy the migration's own build-and-verify pass ran against).
// Never run this as part of any automated dev-story/code-review pass, and
// never bundle it with the copy or verify steps.
//
// What this does: drops the WHOLE of tm_game.archive_documents - all 60
// narrative documents (dossiers, downtime responses, history submissions),
// no field-level split like 31-4's character_dossier - after re-confirming,
// live, that tm_story's copy still matches FIELD FOR FIELD (a second,
// independent verification pass, not a re-use of a stale result from
// earlier). If the counts OR any document's content disagree, it refuses and
// drops nothing.
//
// KEYED BY `_id`, matching TM Story's own migrate-31-5-archive-documents.mjs
// (a verbatim whole-document copy, `_id` included - the simplest shape in
// Epic 31, see that script's own header for why). No destination-only field
// exists to exclude from the diff; the full key union in both directions is
// compared, exactly mirroring that script's own compareDocumentSets.
//
// BUILT CORRECTLY FROM THE START, using the defects the 31-2/31-3/31-4 drop
// scripts' own reviews already found rather than rediscovering them:
//   1. Genuine field-by-field diff, not a count/id-only comparison.
//   2. `.env` is loaded from a path resolved against THIS FILE's own
//      location, never the caller's CWD.
//   3. The resolved wiki database name is asserted to be EXACTLY `tm_story`
//      before `--write` proceeds at all.
//   4. Duplicate `_id`s on either side are detected explicitly rather than
//      silently collapsing in a keyed Map and hiding a lost document.
//   5. `tm_game`, NOT the pre-rebrand `tm_suite` name, resolved the same way
//      server/db.js resolves it - `_trim-31-4-character-dossier.mjs` shipped
//      hardcoded to `tm_suite` on 2026-08-15 (before the 2026-08-21 rebrand)
//      and was still pointed at that now-frozen, unmodified snapshot when
//      this script was written; fixed there in the same pass that added this
//      file, not rediscovered independently a second time.
//   6. `tm_story`, NOT `tm_wiki` (the pre-rebrand wiki-side name). This
//      script's OWN FIRST DRAFT got this wrong too, hardcoding `tm_wiki` by
//      copying it from the older 31-2/31-3/31-4 drop scripts' own comments and
//      `.env`'s `tm_wiki_dev` value, without checking the live cluster - the
//      exact mistake point 5 already names for the suite side. Confirmed via
//      a live `listDatabases` call: `tm_game`/`tm_story` are the two live
//      databases; `tm_suite`/`tm_wiki`/`tm_wiki_dev` all still exist but are
//      not live. Caught before `--write` ever ran, not after.
//
// KEEP IN SYNC BY HAND with `documentKey`/`valuesEqual`/`compareDocumentSets`
// in TM Story's own `server/scripts/migrate-31-5-archive-documents.mjs`. There
// is no shared package across the two repos, so this is a deliberate
// duplication - the same pattern every prior migration's drop script in this
// epic already established.
//
// WHY THIS IS ITS OWN SCRIPT, NOT A FLAG ON THE MIGRATION SCRIPT: the
// standing order (specs/deferred-work.md item 163, TM Wiki) is explicit -
// "copy, verify, cut over, then drop. Never delete the source first." Making
// the drop a separate, distinctly-named, always-manually-invoked script is
// what makes that structurally true rather than a convention one flag could
// bypass.
//
// Dry run by default.
//   node server/scripts/_drop-31-5-archive-documents.mjs           (dry run - report only, drops nothing)
//   node server/scripts/_drop-31-5-archive-documents.mjs --write   (drop, ONLY after a clean re-verify)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

// Script-relative, not CWD-relative - the 31-2 defect this shape exists to
// avoid rediscovering.
const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(HERE, '..', '..', '.env') });

const WRITE = process.argv.includes('--write');
const COLLECTION = 'archive_documents';

// See file header point 5. Resolved the same way server/db.js resolves the
// live database name - never hardcoded to the pre-rebrand `tm_suite`.
const SUITE_DB_NAME = process.env.MONGODB_DB || 'tm_game';

// The one thing standing between "verified the dev copy" and "dropped the
// only real copy": this script's entire safety model depends on comparing
// tm_game against PRODUCTION tm_story. Refuse outright if the resolved target
// is anything else, rather than trusting whatever .env happened to load.
//
// `tm_wiki` was the pre-2026-08-21-rebrand name (TM Story's own config.js
// default is `tm_story`; `tm_wiki`/`tm_wiki_dev` both still exist on the
// cluster as separate, non-live databases - confirmed via a live
// `listDatabases` call against the real cluster, not assumed from an old
// script comment or the dev-only `.env` value). Comparing against either
// would silently verify against the wrong database.
const WIKI_DB_NAME = process.env.MONGODB_WIKI_DB ?? 'tm_story';
if (WIKI_DB_NAME !== 'tm_story') {
  console.error(`REFUSING TO RUN: resolved wiki database is "${WIKI_DB_NAME}", not "tm_story".`);
  console.error('This script only ever compares against and protects PRODUCTION. If you intended');
  console.error('to test against a dev database, that is not what this script is for - nothing was');
  console.error('read or dropped.');
  process.exit(1);
}

// PURE. Structural equality that treats a Mongo ObjectId (or any BSON type
// exposing .equals()) correctly. Same shape as every prior drop script in
// this epic; reimplemented here rather than imported across repos, for one
// small ops script.
//
// `Date` is checked explicitly, BEFORE the generic-object branch (31-3's
// code-review lesson, inherited): a Date instance has zero OWN enumerable
// properties, so the generic key-union comparison would otherwise report any
// two Dates as vacuously equal regardless of the moment each represents.
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

// PURE. `_id` is copied verbatim by the migration, so both sides hold the
// same value; `String()` normalises the ObjectId to something usable as a Map
// key without changing what is compared (the raw values still go through
// valuesEqual).
const documentKey = (doc) => String(doc?._id);

function findDuplicateIds(docs) {
  const seen = new Set();
  const dupes = new Set();
  for (const d of docs) {
    const key = documentKey(d);
    if (seen.has(key)) dupes.add(key); else seen.add(key);
  }
  return [...dupes];
}

// PURE. Mirrors migrate-31-5-archive-documents.mjs's own compareDocumentSets:
// full key union in both directions, no field excluded - this is a verbatim
// copy and there is no minted or derived field to forgive.
function diffDocuments(source, dest) {
  const keys = new Set([...Object.keys(source), ...Object.keys(dest)]);
  const diffs = [];
  for (const key of keys) {
    if (!valuesEqual(source[key], dest[key])) diffs.push(key);
  }
  return diffs;
}

const suite = new MongoClient(process.env.MONGODB_URI);
const wiki = new MongoClient(process.env.MONGODB_WIKI_URI ?? process.env.MONGODB_URI);
await suite.connect();
await wiki.connect();

const suiteDb = suite.db(SUITE_DB_NAME);
const wikiDb = wiki.db(WIKI_DB_NAME);

console.log(`Re-verifying tm_story ("${WIKI_DB_NAME}") matches ${SUITE_DB_NAME}, live, right now, FIELD BY FIELD, BY _id`);
console.log('(not trusting an earlier result, and not just counting documents)...\n');

const [suiteDocs, wikiDocs] = await Promise.all([
  suiteDb.collection(COLLECTION).find({}).toArray(),
  wikiDb.collection(COLLECTION).find({}).toArray(),
]);
const duplicateSuiteIds = findDuplicateIds(suiteDocs);
const duplicateWikiIds = findDuplicateIds(wikiDocs);
const bySuite = new Map(suiteDocs.map((d) => [documentKey(d), d]));
const byWiki = new Map(wikiDocs.map((d) => [documentKey(d), d]));
const missing = [...bySuite.keys()].filter((key) => !byWiki.has(key));
const mismatched = [];
for (const [key, doc] of bySuite) {
  if (!byWiki.has(key)) continue;
  const diffs = diffDocuments(doc, byWiki.get(key));
  if (diffs.length) mismatched.push({ key, diffs });
}

console.log(`${COLLECTION}: ${SUITE_DB_NAME}=${suiteDocs.length} tm_story=${wikiDocs.length}`);
if (duplicateSuiteIds.length) console.log(`  DUPLICATE _id(s) in ${SUITE_DB_NAME}: ${duplicateSuiteIds.length}`, duplicateSuiteIds);
if (duplicateWikiIds.length) console.log(`  DUPLICATE _id(s) in tm_story: ${duplicateWikiIds.length}`, duplicateWikiIds);
if (missing.length) console.log(`  MISSING FROM tm_story: ${missing.length}`, missing);
if (mismatched.length) {
  console.log(`  CONTENT MISMATCH: ${mismatched.length} document(s)`);
  for (const m of mismatched) console.log(`    ${m.key}: ${m.diffs.join(', ')}`);
}
if (!duplicateSuiteIds.length && !duplicateWikiIds.length && !missing.length && !mismatched.length) {
  console.log('  every document present in tm_story AND matches field for field (by _id).');
}

const allClean = duplicateSuiteIds.length === 0 && duplicateWikiIds.length === 0 && missing.length === 0 && mismatched.length === 0;

if (!allClean) {
  console.error(`\nREFUSING TO DROP: tm_story does not clearly match ${SUITE_DB_NAME} right now. Re-run the migration`);
  console.error('script (--write, then --verify) from TM Story first. Nothing was dropped.');
  await suite.close();
  await wiki.close();
  process.exit(1);
}

if (!WRITE) {
  console.log('\nRe-verify CLEAN. DRY RUN — nothing dropped. Re-run with --write to actually drop');
  console.log(`${SUITE_DB_NAME}.archive_documents. THIS IS IRREVERSIBLE.`);
  await suite.close();
  await wiki.close();
  process.exit(0);
}

console.log(`\nRe-verify CLEAN. Dropping ${SUITE_DB_NAME}.archive_documents now...`);
await suiteDb.collection(COLLECTION).drop();
console.log(`  dropped ${SUITE_DB_NAME}.${COLLECTION}`);
console.log('\nDone. archive_documents no longer exists in ' + SUITE_DB_NAME + '.');

await suite.close();
await wiki.close();
