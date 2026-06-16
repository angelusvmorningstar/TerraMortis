/**
 * audit-data-hygiene.js — READ ONLY.
 *
 * Comprehensive data-hygiene sweep across every collection in tm_suite.
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
 * Output:
 *   - a ranked console summary (most-fragmented fields first)
 *   - a full JSON report written to st-working/audit/data-hygiene-<date>.json
 *
 * Run (same way as the other audit scripts, with .env loaded):
 *   node -r dotenv/config server/scripts/audit-data-hygiene.js
 *   (or: MONGODB_URI=... node server/scripts/audit-data-hygiene.js)
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
const DB_NAME = 'tm_suite';

// Scan all docs for collections at/under this size; sample for larger ones.
const FULL_SCAN_LIMIT = 5000;
const SAMPLE_SIZE = 3000;
// Stop descending past this depth to bound runtime on deep docs.
const MAX_DEPTH = 6;

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
//                      keyFormats:Map<fmt,count>, examples:Set, total:count }>
function rec(acc, path, kind, key, example) {
  let e = acc.get(path);
  if (!e) { e = { types: new Map(), formats: new Map(), keyFormats: new Map(), examples: new Map(), total: 0 }; acc.set(path, e); }
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

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const collInfos = await db.listCollections().toArray();
  const collNames = collInfos.map(c => c.name).filter(n => !n.startsWith('system.')).sort();

  const report = { db: DB_NAME, generated: new Date().toISOString(), collections: [] };

  for (const name of collNames) {
    const coll = db.collection(name);
    const total = await coll.estimatedDocumentCount();
    const scan = total <= FULL_SCAN_LIMIT;
    const cursor = scan
      ? coll.find({})
      : coll.aggregate([{ $sample: { size: SAMPLE_SIZE } }]);
    const acc = new Map();
    let scanned = 0;
    for await (const doc of cursor) { walk(acc, '', doc, 0); scanned++; }

    const fields = [];
    for (const [path, e] of acc) {
      const typeCount = nonNullTypeCount(e.types);
      const fmtCount = nonTrivialFormatCount(e.formats);
      const keyFmtCount = nonTrivialFormatCount(e.keyFormats);
      const typeFrag = typeCount > 1;
      const formatFrag = fmtCount > 1;
      const keyFrag = keyFmtCount > 1;
      if (!typeFrag && !formatFrag && !keyFrag) continue; // only report fragmented fields
      // Severity heuristic: type frag worst, then key frag (JSON blob keys), then value format frag.
      const severity = (typeFrag ? 100 : 0) + (keyFrag ? 50 : 0) + (formatFrag ? 25 : 0)
        + Math.min(typeCount + fmtCount + keyFmtCount, 20);
      fields.push({
        path,
        observed: e.total,
        typeFrag, formatFrag, keyFrag, severity,
        types: Object.fromEntries(e.types),
        formats: Object.fromEntries(e.formats),
        keyFormats: keyFmtCount ? Object.fromEntries(e.keyFormats) : undefined,
        examples: Object.fromEntries(e.examples),
      });
    }
    fields.sort((a, b) => b.severity - a.severity);
    report.collections.push({ name, total, scanned, scanMode: scan ? 'full' : 'sample', fragmentedFields: fields });
  }

  await client.close();

  // ── console summary ─────────────────────────────────────────────────
  console.log('\n' + '='.repeat(96));
  console.log(`DATA HYGIENE AUDIT — ${DB_NAME} — ${report.generated}`);
  console.log('='.repeat(96));
  const allFrag = report.collections.flatMap(c => c.fragmentedFields.map(f => ({ coll: c.name, ...f })));
  allFrag.sort((a, b) => b.severity - a.severity);
  console.log(`Collections: ${report.collections.length}   Fragmented fields found: ${allFrag.length}\n`);
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
  console.log('Per-collection field counts (only collections with fragmentation):');
  for (const c of report.collections) {
    if (c.fragmentedFields.length) {
      console.log(`  ${c.name.padEnd(28)} ${String(c.total).padStart(7)} docs (${c.scanMode})  ${c.fragmentedFields.length} fragmented fields`);
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
