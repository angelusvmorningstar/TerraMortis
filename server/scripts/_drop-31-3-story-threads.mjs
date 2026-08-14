// _drop-31-3-story-threads.mjs — Story 31-3 (TM Wiki), the deliberately SEPARATE,
// MANUAL final step of "copy, verify, cut over, then drop."
//
// ⚠ THIS IS THE DESTRUCTIVE STEP. Angelus's own action, ONLY, once he has
// personally confirmed the cutover works end to end against PRODUCTION (not
// just the dev copy the migration's own build-and-verify pass ran against).
// Never run this as part of any automated dev-story/code-review pass, and
// never bundle it with the copy or verify steps.
//
// What this does: drops `tm_suite.story_threads` - and ONLY that collection,
// nothing else in `tm_suite` - after re-confirming, live, that `tm_wiki`'s
// reshaped copy still matches FIELD FOR FIELD (a second, independent
// verification pass, not a re-use of a stale result from earlier). If the
// counts, slugs, OR any document's content disagree, it refuses and drops
// nothing.
//
// BUILT CORRECTLY FROM THE START (Story 31-3's own AC #6), using both real
// defects 31-2's own external review found in ITS drop script rather than
// rediscovering them independently:
//   1. The re-verify does a genuine field-by-field diff, not a count/id-only
//      comparison - mirroring `TM Wiki/server/scripts/
//      migrate-31-3-story-threads.mjs`'s own `diffThreadDocuments`/
//      `compareThreadDocumentSets` (not imported cross-repo - this is TM
//      Suite's own script, so the equivalent logic is reimplemented here,
//      small enough that duplication is cheaper than a cross-repo dependency
//      for one ops script).
//   2. `.env` is loaded from a path resolved against THIS FILE's own
//      location, never the caller's CWD - and the resolved wiki database name
//      is asserted to be EXACTLY `tm_wiki` before `--write` proceeds at all.
//
// KEYED BY `slug`, NOT `_id` (unlike 31-2's verbatim-copy drop script): this
// story's migration mints a fresh `thread_id` and a fresh Mongo `_id` per
// document (a reshape, not a byte-identical copy), so `slug` - canon's own
// natural key, present on both sides - is the only identifier this script can
// compare on. `_id`/`thread_id`/`schema_version`/`rev` are destination-only
// fields with no source counterpart and are excluded from the diff, exactly
// matching the migration script's own AC #4 verify logic.
//
// WHY THIS IS ITS OWN SCRIPT, NOT A FLAG ON THE MIGRATION SCRIPT: the standing
// order (specs/deferred-work.md item 163, TM Wiki) is explicit - "copy,
// verify, cut over, then drop. Never delete the source first." Making the
// drop a separate, distinctly-named, always-manually-invoked script is what
// makes "never delete the source first" structurally true rather than a
// convention someone could bypass with one flag on a familiar command.
//
// Dry run by default.
//   node server/scripts/_drop-31-3-story-threads.mjs           (dry run - report only, drops nothing)
//   node server/scripts/_drop-31-3-story-threads.mjs --write   (drop, ONLY after a clean re-verify)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

// Script-relative, not CWD-relative - the exact 31-2 defect this AC exists to
// avoid rediscovering.
const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(HERE, '..', '..', '.env') });

const WRITE = process.argv.includes('--write');
const COLLECTION = 'story_threads';
const DEST_ONLY_FIELDS = new Set(['_id', 'thread_id', 'schema_version', 'rev']);

// The one thing standing between "verified the dev copy" and "dropped the
// only real copy": this script's entire safety model depends on comparing
// tm_suite against PRODUCTION tm_wiki. Refuse outright if the resolved
// target is anything else, rather than trusting whatever .env happened to
// load.
const WIKI_DB_NAME = process.env.MONGODB_WIKI_DB ?? 'tm_wiki';
if (WIKI_DB_NAME !== 'tm_wiki') {
  console.error(`REFUSING TO RUN: resolved wiki database is "${WIKI_DB_NAME}", not "tm_wiki".`);
  console.error('This script only ever compares against and protects PRODUCTION. If you intended');
  console.error('to test against a dev database, that is not what this script is for - nothing was');
  console.error('read or dropped.');
  process.exit(1);
}

// PURE. Structural equality that treats a Mongo ObjectId (or any BSON type
// exposing .equals()) correctly. Same shape as TM Wiki's own
// migrate-31-3-story-threads.mjs; reimplemented here rather than imported
// across repos, for one small ops script.
//
// KEEP IN SYNC with the identical DEST_ONLY_FIELDS/valuesEqual/
// diffThreadDocuments trio in `TM Wiki/server/scripts/
// migrate-31-3-story-threads.mjs` - confirmed character-for-character
// identical as of 2026-08-14 (code review). Nothing enforces that
// automatically; a future edit to one MUST be mirrored in the other by hand.
//
// `Date` is checked explicitly, BEFORE the generic-object branch (code
// review, 2026-08-14): a Date instance has zero OWN enumerable properties, so
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

function diffThreadDocuments(source, dest) {
  const keys = new Set([...Object.keys(source), ...Object.keys(dest)].filter((k) => !DEST_ONLY_FIELDS.has(k)));
  const diffs = [];
  for (const key of keys) {
    if (!valuesEqual(source[key], dest[key])) diffs.push(key);
  }
  return diffs;
}

// Code review (internal, 2026-08-14): the slug-keyed Maps below silently
// COLLAPSE a duplicate slug (later document wins), which could leave
// `missing`/`mismatched` both empty even though a real document was lost -
// the drop refusal below must not be a function of the deduplicated Maps
// alone. Mirrors migrate-31-3-story-threads.mjs's own
// compareThreadDocumentSets fix.
function findDuplicateSlugs(docs) {
  const seen = new Set();
  const dupes = new Set();
  for (const d of docs) {
    if (seen.has(d.slug)) dupes.add(d.slug); else seen.add(d.slug);
  }
  return [...dupes];
}

const suite = new MongoClient(process.env.MONGODB_URI);
const wiki = new MongoClient(process.env.MONGODB_WIKI_URI ?? process.env.MONGODB_URI);
await suite.connect();
await wiki.connect();

const suiteDb = suite.db('tm_suite');
const wikiDb = wiki.db(WIKI_DB_NAME);

console.log(`Re-verifying tm_wiki ("${WIKI_DB_NAME}") matches tm_suite, live, right now, FIELD BY FIELD, BY SLUG`);
console.log('(not trusting an earlier result, and not just counting ids)...\n');

const [suiteDocs, wikiDocs] = await Promise.all([
  suiteDb.collection(COLLECTION).find({}).toArray(),
  wikiDb.collection(COLLECTION).find({}).toArray(),
]);
const duplicateSuiteSlugs = findDuplicateSlugs(suiteDocs);
const duplicateWikiSlugs = findDuplicateSlugs(wikiDocs);
const bySuite = new Map(suiteDocs.map((d) => [d.slug, d]));
const byWiki = new Map(wikiDocs.map((d) => [d.slug, d]));
const missing = [...bySuite.keys()].filter((slug) => !byWiki.has(slug));
const mismatched = [];
for (const [slug, doc] of bySuite) {
  if (!byWiki.has(slug)) continue;
  const diffs = diffThreadDocuments(doc, byWiki.get(slug));
  if (diffs.length) mismatched.push({ slug, diffs });
}

console.log(`${COLLECTION}: tm_suite=${suiteDocs.length} tm_wiki=${wikiDocs.length}`);
if (duplicateSuiteSlugs.length) console.log(`  DUPLICATE slug(s) in tm_suite: ${duplicateSuiteSlugs.length}`, duplicateSuiteSlugs);
if (duplicateWikiSlugs.length) console.log(`  DUPLICATE slug(s) in tm_wiki: ${duplicateWikiSlugs.length}`, duplicateWikiSlugs);
if (missing.length) console.log(`  MISSING FROM tm_wiki: ${missing.length}`, missing);
if (mismatched.length) {
  console.log(`  CONTENT MISMATCH: ${mismatched.length} document(s)`);
  for (const m of mismatched) console.log(`    ${m.slug}: ${m.diffs.join(', ')}`);
}
if (!duplicateSuiteSlugs.length && !duplicateWikiSlugs.length && !missing.length && !mismatched.length) {
  console.log('  every document present in tm_wiki AND matches field for field (by slug).');
}

const allClean = duplicateSuiteSlugs.length === 0 && duplicateWikiSlugs.length === 0 && missing.length === 0 && mismatched.length === 0;

if (!allClean) {
  console.error('\nREFUSING TO DROP: tm_wiki does not clearly match tm_suite right now. Re-run the migration');
  console.error('script (--write, then --verify) from TM Wiki first. Nothing was dropped.');
  await suite.close();
  await wiki.close();
  process.exit(1);
}

if (!WRITE) {
  console.log('\nRe-verify CLEAN. DRY RUN — nothing dropped. Re-run with --write to actually drop');
  console.log('tm_suite.story_threads. THIS IS IRREVERSIBLE.');
  await suite.close();
  await wiki.close();
  process.exit(0);
}

console.log('\nRe-verify CLEAN. Dropping tm_suite.story_threads now...');
await suiteDb.collection(COLLECTION).drop();
console.log(`  dropped tm_suite.${COLLECTION}`);
console.log('\nDone. story_threads no longer exists in tm_suite.');

await suite.close();
await wiki.close();
