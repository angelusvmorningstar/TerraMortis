#!/usr/bin/env node

/**
 * Compare two MongoDB databases (default: tm_suite vs tm_suite_test).
 *
 * Read-only. Reports for each common collection:
 *   - document count difference
 *   - top-level field-set differences (keys present in one but not the other,
 *     based on a sampled scan)
 *   - _ids present in one but not the other (capped sample)
 *   - _ids present in both whose content differs (capped sample, with a
 *     short JSON path list of changed fields)
 *
 * Also reports collections present in only one DB (so you can see the
 * non-overlap, but the body of the report focuses on the intersection).
 *
 * Usage:
 *   node server/scripts/compare-tm-suite-dbs.js
 *   node server/scripts/compare-tm-suite-dbs.js --left=tm_suite --right=tm_suite_test
 *   node server/scripts/compare-tm-suite-dbs.js --collections=characters,territories
 *   node server/scripts/compare-tm-suite-dbs.js --sample=20         # cap of per-collection sample (default 10)
 *   node server/scripts/compare-tm-suite-dbs.js --json              # machine-readable output
 *
 * Requires MONGODB_URI in env (same URI, both DBs live on same cluster).
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set.');
  process.exit(1);
}

function arg(name, fallback) {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=', 2)[1] : fallback;
}
const flag = name => process.argv.includes(`--${name}`);

const LEFT = arg('left', 'tm_suite');
const RIGHT = arg('right', 'tm_suite_test');
const SAMPLE = Math.max(1, parseInt(arg('sample', '10'), 10));
const ONLY = (arg('collections', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const JSON_OUT = flag('json');

const uri = MONGODB_URI.replace(/[&?]ssl=[^&]*/g, '');
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, tls: true });

// Walk an object; return a sorted set of dotted paths to leaf values.
// Arrays collapse: arr -> "arr[]", arr[].field -> "arr[].field".
function fieldPaths(obj, prefix = '') {
  const paths = new Set();
  if (obj === null || obj === undefined) {
    if (prefix) paths.add(prefix);
    return paths;
  }
  if (Array.isArray(obj)) {
    paths.add(`${prefix}[]`);
    for (const item of obj) {
      for (const p of fieldPaths(item, `${prefix}[]`)) paths.add(p);
    }
    return paths;
  }
  if (typeof obj === 'object' && obj.constructor === Object) {
    for (const [k, v] of Object.entries(obj)) {
      const next = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
        for (const p of fieldPaths(v, next)) paths.add(p);
      } else {
        paths.add(next);
      }
    }
    return paths;
  }
  if (prefix) paths.add(prefix);
  return paths;
}

// Compare two docs. Return list of dotted paths whose values differ
// (ignoring _id, ignoring undefined-vs-missing).
function diffDocs(a, b, prefix = '') {
  const out = [];
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    if (k === '_id') continue;
    const path = prefix ? `${prefix}.${k}` : k;
    const av = a?.[k];
    const bv = b?.[k];
    if (av === undefined && bv === undefined) continue;
    if (av === undefined || bv === undefined) { out.push(path); continue; }
    if (av instanceof Date || bv instanceof Date) {
      if (String(av) !== String(bv)) out.push(path);
      continue;
    }
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (JSON.stringify(av) !== JSON.stringify(bv)) out.push(`${path}[]`);
      continue;
    }
    if (av && bv && typeof av === 'object' && typeof bv === 'object') {
      out.push(...diffDocs(av, bv, path));
      continue;
    }
    if (av !== bv) out.push(path);
  }
  return out;
}

async function sampleFieldUnion(coll, limit = 50) {
  const union = new Set();
  const cursor = coll.find({}, { limit }).project({});
  for await (const doc of cursor) {
    for (const p of fieldPaths(doc)) union.add(p);
  }
  return union;
}

async function compareCollection(name, leftDb, rightDb) {
  const lc = leftDb.collection(name);
  const rc = rightDb.collection(name);
  const [leftCount, rightCount] = await Promise.all([lc.countDocuments(), rc.countDocuments()]);

  const [leftFields, rightFields] = await Promise.all([
    sampleFieldUnion(lc),
    sampleFieldUnion(rc),
  ]);
  const fieldsOnlyLeft = [...leftFields].filter(f => !rightFields.has(f)).sort();
  const fieldsOnlyRight = [...rightFields].filter(f => !leftFields.has(f)).sort();

  // _id intersection / difference. Project only _id.
  const [leftIdsCur, rightIdsCur] = [lc.find({}, { projection: { _id: 1 } }), rc.find({}, { projection: { _id: 1 } })];
  const leftIds = new Map(); // string -> _id
  for await (const d of leftIdsCur) leftIds.set(String(d._id), d._id);
  const rightIds = new Map();
  for await (const d of rightIdsCur) rightIds.set(String(d._id), d._id);

  const onlyLeft = [...leftIds.keys()].filter(id => !rightIds.has(id));
  const onlyRight = [...rightIds.keys()].filter(id => !leftIds.has(id));
  const inBoth = [...leftIds.keys()].filter(id => rightIds.has(id));

  // Content diffs for inBoth: sample up to SAMPLE.
  const sampleIds = inBoth.slice(0, SAMPLE);
  const contentDiffs = [];
  for (const idStr of sampleIds) {
    const _id = leftIds.get(idStr);
    const [a, b] = await Promise.all([lc.findOne({ _id }), rc.findOne({ _id })]);
    const paths = diffDocs(a, b);
    if (paths.length) contentDiffs.push({ _id: idStr, changedPaths: paths });
  }

  return {
    name,
    counts: { left: leftCount, right: rightCount, delta: leftCount - rightCount },
    fields: { onlyLeft: fieldsOnlyLeft, onlyRight: fieldsOnlyRight },
    ids: {
      onlyLeft: onlyLeft.slice(0, SAMPLE),
      onlyLeftTotal: onlyLeft.length,
      onlyRight: onlyRight.slice(0, SAMPLE),
      onlyRightTotal: onlyRight.length,
      inBothTotal: inBoth.length,
    },
    sampleContentDiffs: contentDiffs,
  };
}

function printReport(report) {
  const { left, right, common, leftOnly, rightOnly, perCollection } = report;
  console.log(`\n=== Database comparison: ${left} (LEFT) vs ${right} (RIGHT) ===\n`);
  console.log(`Collections only in ${left}:  ${leftOnly.join(', ') || '(none)'}`);
  console.log(`Collections only in ${right}: ${rightOnly.join(', ') || '(none)'}`);
  console.log(`Common collections (${common.length}): ${common.join(', ')}\n`);

  for (const r of perCollection) {
    console.log(`--- ${r.name} ---`);
    console.log(`  count: LEFT=${r.counts.left}  RIGHT=${r.counts.right}  Δ=${r.counts.delta}`);
    if (r.fields.onlyLeft.length) console.log(`  fields only in LEFT (sampled):  ${r.fields.onlyLeft.join(', ')}`);
    if (r.fields.onlyRight.length) console.log(`  fields only in RIGHT (sampled): ${r.fields.onlyRight.join(', ')}`);
    console.log(`  _ids: in both=${r.ids.inBothTotal}  only-LEFT=${r.ids.onlyLeftTotal}  only-RIGHT=${r.ids.onlyRightTotal}`);
    if (r.ids.onlyLeft.length) console.log(`    only-LEFT sample: ${r.ids.onlyLeft.join(', ')}`);
    if (r.ids.onlyRight.length) console.log(`    only-RIGHT sample: ${r.ids.onlyRight.join(', ')}`);
    if (r.sampleContentDiffs.length) {
      console.log(`  content diffs (sampled ${SAMPLE} of in-both):`);
      for (const d of r.sampleContentDiffs) {
        console.log(`    _id ${d._id}: ${d.changedPaths.join(', ')}`);
      }
    } else if (r.ids.inBothTotal > 0) {
      console.log(`  content diffs in sample: none`);
    }
    console.log('');
  }
}

async function main() {
  await client.connect();
  const leftDb = client.db(LEFT);
  const rightDb = client.db(RIGHT);

  const [leftCollsRaw, rightCollsRaw] = await Promise.all([
    leftDb.listCollections({}, { nameOnly: true }).toArray(),
    rightDb.listCollections({}, { nameOnly: true }).toArray(),
  ]);
  const leftColls = new Set(leftCollsRaw.map(c => c.name));
  const rightColls = new Set(rightCollsRaw.map(c => c.name));

  let common = [...leftColls].filter(n => rightColls.has(n)).sort();
  if (ONLY.length) common = common.filter(n => ONLY.includes(n));

  const leftOnly = [...leftColls].filter(n => !rightColls.has(n)).sort();
  const rightOnly = [...rightColls].filter(n => !leftColls.has(n)).sort();

  const perCollection = [];
  for (const name of common) {
    process.stderr.write(`comparing ${name}... `);
    const r = await compareCollection(name, leftDb, rightDb);
    process.stderr.write(`L=${r.counts.left} R=${r.counts.right}\n`);
    perCollection.push(r);
  }

  const report = { left: LEFT, right: RIGHT, common, leftOnly, rightOnly, perCollection };
  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  await client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
