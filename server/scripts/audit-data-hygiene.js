/**
 * audit-data-hygiene.js — READ ONLY.
 *
 * Comprehensive data-hygiene sweep across every collection in tm_game.
 * Goal: find FRAGMENTATION — the same logical value stored in inconsistent
 * shapes — which is the root cause behind the territory-key (#496), cycle_id
 * (#497), attendance (#551/#552) and payment_method (#547/#550) bug classes.
 *
 * For every field path in every collection it records:
 *   - the set of BSON types seen           -> TYPE fragmentation when >1
 *   - for string values, a format class    -> FORMAT fragmentation when >1
 *       (objectid_hex / iso_datetime / snake_slug / flat_lower /
 *        display_name / numeric_string / json_string / email / discord_id / other)
 *   - when a string parses as a JSON object, the format classes of its KEYS
 *     (this is how influence_spend / feeding_territories key-format drift is caught)
 *
 * Indexed/dynamic key segments are collapsed (project_1_territory,
 * project_2_territory -> project_N_territory) so the report stays signal-dense.
 *
 * ── 2026-09-02 fixes (carried in from TM Story's ported/refined version,
 *    server/scripts/audit-data-hygiene.mjs in the TM Story repo) ──────────
 * The 2026-06-03 campaign ("CAMPAIGN COMPLETE" update in
 * specs/data-hygiene-audit-2026-06-03.md) found this engine over-flagged by
 * roughly 3x, from two systematic causes, both now fixed IN THIS SCRIPT
 * rather than relying on a manual read-through every run:
 *
 *   1. It counted test/orphan docs as production data. Every document is now
 *      swept (word-boundary match against test/fixture/dummy/sandbox on every
 *      string field, at any depth up to MAX_DEPTH) BEFORE profiling. Word-
 *      boundary, not substring — a naive `.includes('test')` flags
 *      "contested"/"protest"/"testament" as test data (this exact failure
 *      mode was hit live building TM Story's own copy of this fix). Excluded
 *      docs are never silently dropped: every one is counted and a sample is
 *      written to the report's `excluded_sample` for verification.
 *   2. Its format classifier counted WORD-COUNT as format — a two-word enum
 *      value ('no_roll') classed differently from a one-word value
 *      ('resolved') from the SAME coherent enum, reading as "fragmented" when
 *      it was never mixed at all. A field is now never reported as format-
 *      fragmented until its DISTINCT VALUES are enumerated: at or below
 *      DISTINCT_VALUE_ENUM_CEILING (20) distinct values, a field is presumed
 *      a coherent enum/reference set, full stop, regardless of which regex
 *      class each value happens to hit. Free-text-shaped field names (name,
 *      reason, notes, pronouns, etc.) are additionally never format-profiled
 *      at all — word variety there is expected, not drift.
 *
 * Output:
 *   - a ranked console summary (most-fragmented fields first)
 *   - a full JSON report written to st-working/audit/data-hygiene-<date>.json
 *
 * Run (same way as the other audit scripts, with .env loaded):
 *   node -r dotenv/config server/scripts/audit-data-hygiene.js
 *   (or: MONGODB_URI=... node server/scripts/audit-data-hygiene.js)
 *
 * Flags:
 *   --include-test   Skip the test/orphan sweep (profile every doc as-is).
 *                     Excluded docs are still counted/reported either way
 *                     when this flag is absent.
 *
 * Touches nothing. No writes to the database.
 */

import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

// Optional: auto-load .env if dotenv is present; harmless if it isn't.
try { await import('dotenv/config'); } catch { /* env already set by caller */ }

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI / MONGODB_URI not set'); process.exit(1); }
const DB_NAME = process.env.MONGODB_DB || 'tm_game';
const INCLUDE_TEST = process.argv.includes('--include-test');

// Scan all docs for collections at/under this size; sample for larger ones.
const FULL_SCAN_LIMIT = 5000;
const SAMPLE_SIZE = 3000;
// Stop descending past this depth to bound runtime on deep docs.
const MAX_DEPTH = 6;

// At or below this many distinct string values, a field is presumed a
// coherent enum/reference set and is NEVER reported as format-fragmented,
// regardless of which regex classes its individual values happen to hit.
// Direct fix for the word-count-as-format bug (2026-06-03 campaign finding).
const DISTINCT_VALUE_ENUM_CEILING = 20;
// Cap how many distinct raw values we retain per field path (memory bound on
// high-cardinality free-text fields); doesn't affect the enum-ceiling check
// itself since anything over the cap is already well past the ceiling.
const MAX_DISTINCT_VALUES_TRACKED = 500;

// Fields whose values are free prose, never worth format-classifying — word
// choice/length varies by definition, so mixed format classes here are
// expected variance, not fragmentation. Ported from the manual "noise
// excluded" list in the 2026-06-03 doc plus TM Story's own ported version,
// adjusted to this schema's own field names.
const FREE_TEXT_FIELD_HINTS = [
  'name', 'label', 'desc', 'description', 'reason', 'note', 'notes', 'narrative',
  'prose', 'text', 'title', 'author', 'moniker', 'summary', 'answer', 'diff',
  'content', 'facts', 'response', 'feedback', 'pronouns', 'mobile', 'phone',
  'address', 'spec', 'specs', 'resident', 'qualifier', 'touchstone', 'aspiration',
  // Dice-pool description free text (e.g. "Intelligence + Stealth") — the
  // same false-positive class TM Story's own ported copy of this engine
  // already found and fixed on its own data (specs/data-hygiene-audit-
  // 2026-09-01.md, TM Story repo): a player/ST-typed pool description, not
  // an enum, despite the "pool_" prefix looking identifier-shaped.
  'pool_player', 'pool_validated', 'pool_committed', 'pool_confirmed',
];

// ── test/orphan sweep ───────────────────────────────────────────────────
// A doc counts as likely test/orphan if any of its own string fields (at any
// depth, up to MAX_DEPTH) contains one of these markers as a whole word.
// Transparent and crude on purpose (the 2026-06-03 campaign found real
// fixtures this way — "Regent Save Test", "test-st-001") — never silent:
// every excluded doc's own matched field/value is recorded in the report.
const TEST_MARKERS = ['test', 'fixture', 'dummy', 'sandbox'];
const TEST_MARKER_RE = new RegExp(`\\b(${TEST_MARKERS.join('|')})\\b`, 'i');
// Real test/fixture markers found live are always short identifier-shaped tokens
// ("test-st-001", "local-test", "Regent Save Test" — all <= ~20 chars). A live
// self-check on this run's own excluded_sample caught the OTHER over-flagging
// direction: narrative/prose fields (ST letters, ordeal essay answers, rubric
// questions) that legitimately use the ordinary English words "test" or
// "fixture" ("...decided to test how long...", "...becoming more of a fixture
// in the community...") were being wrongly swept as test data. Capping the
// checked value length excludes prose from the sweep without needing a
// field-name hint list (some false positives, e.g. `ic_correspondence`,
// `game_recount`, didn't match any hint keyword at all).
const TEST_MARKER_MAX_VALUE_LEN = 30;

function findTestMarker(value, path, depth) {
  if (depth > MAX_DEPTH) return null;
  if (typeof value === 'string') {
    if (value.length > TEST_MARKER_MAX_VALUE_LEN) return null;
    const m = value.match(TEST_MARKER_RE);
    return m ? { field: path, value: value.slice(0, 120), marker: m[1].toLowerCase() } : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findTestMarker(item, path + '[]', depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object' && !(value instanceof Date) && !value._bsontype) {
    for (const [k, v] of Object.entries(value)) {
      const hit = findTestMarker(v, path ? `${path}.${k}` : k, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function docLooksLikeTest(doc) {
  return findTestMarker(doc, '', 0);
}

// ── string format classifier ────────────────────────────────────────────
function classifyString(s) {
  if (s === '') return 'empty_string';
  if (/^[a-f0-9]{24}$/i.test(s)) return 'objectid_hex';
  if (/^\d{17,20}$/.test(s)) return 'discord_id';          // snowflake (check before numeric)
  if (/^-?\d+$/.test(s)) return 'numeric_string';
  if (/^-?\d+\.\d+$/.test(s)) return 'numeric_string';
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(s)) return 'iso_datetime';
  if (/^[{\[]/.test(s)) { try { JSON.parse(s); return 'json_string'; } catch { /* not json */ } }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return 'email';
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(s)) return 'snake_slug';      // the_north_shore
  if (/^[a-z0-9]+$/.test(s)) return 'flat_lower';                   // northshore
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(s)) return 'kebab_slug';
  if (/[A-Z]/.test(s) || /\s/.test(s)) return 'display_name';       // "The North Shore"
  return 'other_string';
}

function isFreeTextField(path) {
  // Array-typed fields walk to `...fieldName.[]` — the trailing `[]` segment
  // isn't the real field name, so strip it before taking the leaf. Without
  // this, an array-of-strings free-text field (e.g. `active_feed_specs.[]`)
  // never matches FREE_TEXT_FIELD_HINTS at all, because `[]` is checked
  // instead of `active_feed_specs` (found live: this exact field slipped
  // past the hint list on the first pass of this fix).
  const segs = path.split('.').filter((s) => s !== '[]');
  const leaf = (segs.pop() || '').replace(/N$/, '');
  const leafLower = leaf.toLowerCase();
  return FREE_TEXT_FIELD_HINTS.some((hint) => leafLower.includes(hint));
}

// Collapse indexed/dynamic segments so paths aggregate. project_1_territory
// -> project_N_territory; pure-number array indices -> [].
function normSeg(seg) {
  if (/^\d+$/.test(seg)) return '[]';
  return seg.replace(/\d+/g, 'N');
}

function bsonType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date) return 'date';
  const t = typeof v;
  if (t === 'object') {
    if (v._bsontype === 'ObjectID' || v._bsontype === 'ObjectId') return 'objectId';
    if (v._bsontype) return v._bsontype.toLowerCase();
    return 'object';
  }
  return t; // string | number | boolean
}

// acc: Map<normPath, { types:Map<type,count>, formats:Map<fmt,count>,
//                      keyFormats:Map<fmt,count>, examples:Set, total:count,
//                      values:Set<string> (bounded, for the enum-ceiling check) }>
function rec(acc, path, kind, key, example) {
  let e = acc.get(path);
  if (!e) { e = { types: new Map(), formats: new Map(), keyFormats: new Map(), examples: new Map(), total: 0, values: new Set() }; acc.set(path, e); }
  const bucket = e[kind];
  bucket.set(key, (bucket.get(key) || 0) + 1);
  if (kind === 'types') e.total++;
  if (example !== undefined && e.examples.size < 60) {
    const exKey = kind === 'types' ? key : `${kind}:${key}`;
    if (!e.examples.has(exKey)) e.examples.set(exKey, String(example).slice(0, 80));
  }
}

function walk(acc, path, value, depth) {
  const t = bsonType(value);
  rec(acc, path, 'types', t, t === 'string' ? value : undefined);

  if (t === 'string') {
    const fmt = classifyString(value);
    rec(acc, path, 'formats', fmt, value);
    const e = acc.get(path);
    if (e.values.size < MAX_DISTINCT_VALUES_TRACKED) e.values.add(value);
    // Descend into JSON-string objects to profile their KEY formats (#496 class).
    if (fmt === 'json_string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const k of Object.keys(parsed)) rec(acc, path, 'keyFormats', classifyString(k), k);
        }
      } catch { /* ignore */ }
    }
    return;
  }
  if (depth >= MAX_DEPTH) return;
  if (t === 'array') {
    for (const item of value) walk(acc, path + '.[]', item, depth + 1);
    return;
  }
  if (t === 'object') {
    for (const [k, v] of Object.entries(value)) {
      walk(acc, path === '' ? normSeg(k) : path + '.' + normSeg(k), v, depth + 1);
    }
  }
}

function nonNullTypeCount(types) {
  return [...types.keys()].filter(k => k !== 'null').length;
}
function nonTrivialFormatCount(formats) {
  return [...formats.keys()].filter(k => k !== 'empty_string').length;
}
function nonTrivialFormatKeys(formats) {
  return [...formats.keys()].filter(k => k !== 'empty_string');
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const collInfos = await db.listCollections().toArray();
  const collNames = collInfos.map(c => c.name).filter(n => !n.startsWith('system.')).sort();

  const report = { db: DB_NAME, generated: new Date().toISOString(), includeTest: INCLUDE_TEST, collections: [] };

  for (const name of collNames) {
    const coll = db.collection(name);
    const total = await coll.estimatedDocumentCount();
    const scan = total <= FULL_SCAN_LIMIT;
    const cursor = scan
      ? coll.find({})
      : coll.aggregate([{ $sample: { size: SAMPLE_SIZE } }]);
    const acc = new Map();
    let scanned = 0;
    let excludedCount = 0;
    const excludedSample = [];
    for await (const doc of cursor) {
      scanned++;
      if (!INCLUDE_TEST) {
        const hit = docLooksLikeTest(doc);
        if (hit) {
          excludedCount++;
          if (excludedSample.length < 10) excludedSample.push({ id: doc._id ? String(doc._id) : null, ...hit });
          continue;
        }
      }
      walk(acc, '', doc, 0);
    }
    const profiledCount = scanned - excludedCount;

    const fields = [];
    for (const [path, e] of acc) {
      const typeCount = nonNullTypeCount(e.types);
      const keyFmtCount = nonTrivialFormatCount(e.keyFormats);
      const typeFrag = typeCount > 1;
      const keyFrag = keyFmtCount > 1;

      // FORMAT fragmentation only counts once distinct values are enumerated
      // and past the enum ceiling, and never on a free-text-shaped field —
      // the direct fix for the word-count-as-format bug.
      let formatFrag = false;
      let fmtCount = 0;
      if (!isFreeTextField(path) && e.values.size > DISTINCT_VALUE_ENUM_CEILING) {
        fmtCount = nonTrivialFormatCount(e.formats);
        formatFrag = fmtCount > 1;
        // Same word-count-as-format bug, a second manifestation of it that the
        // enum ceiling alone doesn't catch (it fires only above the ceiling,
        // where high-cardinality identifier/slug fields live). kebab_slug is
        // definitionally flat_lower-plus-a-dash — a single-word identifier
        // ("awe", "ankou") can never classify as kebab_slug regardless of
        // convention, so a field mixing ONLY these two classes is virtually
        // always one coherent kebab-case convention whose single-word members
        // simply have no dash to show, not two competing conventions. Live-
        // verified against full distinct-value dumps for 5 fields this run
        // flagged this way (bloodlines.slug, purchasable_powers.key,
        // characters.powers/merits.rule_key, equipment_catalogue.tags) —
        // every one was single-word-vs-multi-word noise, zero real drift.
        // Contrast: `territories.slug` in the 2026-06-03 campaign (flat_lower
        // vs SNAKE_slug) was real — a multi-word territory name encoded
        // sometimes with no separator, sometimes with one — so this narrow
        // rule intentionally does NOT extend to the snake_slug pairing.
        if (formatFrag) {
          const fmtKeys = new Set(nonTrivialFormatKeys(e.formats));
          if (fmtKeys.size === 2 && fmtKeys.has('flat_lower') && fmtKeys.has('kebab_slug')) {
            formatFrag = false;
          }
        }
      }

      if (!typeFrag && !formatFrag && !keyFrag) continue; // only report fragmented fields
      // Severity heuristic: type frag worst, then key frag (JSON blob keys), then value format frag.
      const severity = (typeFrag ? 100 : 0) + (keyFrag ? 50 : 0) + (formatFrag ? 25 : 0)
        + Math.min(typeCount + fmtCount + keyFmtCount, 20);
      fields.push({
        path,
        observed: e.total,
        distinctValues: e.values.size,
        typeFrag, formatFrag, keyFrag, severity,
        types: Object.fromEntries(e.types),
        formats: formatFrag ? Object.fromEntries(e.formats) : undefined,
        keyFormats: keyFmtCount ? Object.fromEntries(e.keyFormats) : undefined,
        examples: Object.fromEntries(e.examples),
      });
    }
    fields.sort((a, b) => b.severity - a.severity);
    report.collections.push({
      name, total, scanned, scanMode: scan ? 'full' : 'sample',
      excludedCount, excludedSample, profiledCount,
      fragmentedFields: fields,
    });
  }

  await client.close();

  // ── console summary ─────────────────────────────────────────────────
  console.log('\n' + '='.repeat(96));
  console.log(`DATA HYGIENE AUDIT — ${DB_NAME} — ${report.generated}${INCLUDE_TEST ? ' (--include-test)' : ''}`);
  console.log('='.repeat(96));
  const allFrag = report.collections.flatMap(c => c.fragmentedFields.map(f => ({ coll: c.name, ...f })));
  allFrag.sort((a, b) => b.severity - a.severity);
  const totalExcluded = report.collections.reduce((s, c) => s + c.excludedCount, 0);
  console.log(`Collections: ${report.collections.length}   Fragmented fields found: ${allFrag.length}   Docs swept as test/orphan: ${totalExcluded}\n`);
  console.log('SEV  KIND          COLLECTION.field                                          shapes');
  console.log('-'.repeat(96));
  for (const f of allFrag) {
    const kind = [f.typeFrag && 'TYPE', f.keyFrag && 'KEY', f.formatFrag && 'FMT'].filter(Boolean).join('+');
    const shapes = f.typeFrag
      ? Object.entries(f.types).filter(([k]) => k !== 'null').map(([k, n]) => `${k}:${n}`).join(' ')
      : f.keyFrag
        ? 'keys=' + Object.keys(f.keyFormats).join('/')
        : Object.keys(f.formats).filter(k => k !== 'empty_string').join('/');
    console.log(
      `${String(f.severity).padStart(3)}  ${kind.padEnd(12)}  ${(f.coll + '.' + f.path).slice(0, 54).padEnd(54)}  ${shapes.slice(0, 30)}`
    );
  }
  console.log('-'.repeat(96));
  console.log('Per-collection field counts (only collections with fragmentation or exclusions):');
  for (const c of report.collections) {
    if (c.fragmentedFields.length || c.excludedCount) {
      console.log(`  ${c.name.padEnd(28)} ${String(c.total).padStart(7)} docs (${c.scanMode})  ${c.fragmentedFields.length} fragmented fields  ${c.excludedCount} swept as test/orphan`);
    }
  }

  // ── JSON artifact ───────────────────────────────────────────────────
  const stamp = report.generated.slice(0, 10);
  const outPath = `st-working/audit/data-hygiene-${stamp}.json`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nFull JSON report written to: ${outPath}`);
  console.log('(hand that file back to Claude to build the ranked hygiene doc)');
}

main().catch(err => { console.error(err); process.exit(1); });
