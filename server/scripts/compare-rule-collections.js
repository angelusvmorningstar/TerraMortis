#!/usr/bin/env node

/**
 * Deep content-compare of all rule_* collections between two DBs.
 * Strips _id and timestamps; groups docs by canonical content key
 * so we can see what's the same, what's different, what's only in one.
 *
 * Usage:
 *   node server/scripts/compare-rule-collections.js
 *   node server/scripts/compare-rule-collections.js --left=tm_suite --right=tm_suite_test
 *   node server/scripts/compare-rule-collections.js --json
 *   node server/scripts/compare-rule-collections.js --collection=rule_grant   # one only
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }

function arg(name, fallback) {
  const f = process.argv.find(a => a.startsWith(`--${name}=`));
  return f ? f.split('=', 2)[1] : fallback;
}
const flag = n => process.argv.includes(`--${n}`);

const LEFT = arg('left', 'tm_suite');
const RIGHT = arg('right', 'tm_suite_test');
const ONE = arg('collection', '');
const JSON_OUT = flag('json');

const RULE_COLLECTIONS = [
  'rule_grant',
  'rule_speciality_grant',
  'rule_skill_bonus',
  'rule_nine_again',
  'rule_disc_attr',
  'rule_derived_stat_modifier',
  'rule_tier_budget',
  'rule_status_floor',
];

const STRIP_FIELDS = new Set(['_id', 'created_at', 'updated_at', 'createdAt', 'updatedAt']);

// Recursively strip ephemeral fields and produce a stable JSON key.
function canonical(obj) {
  if (Array.isArray(obj)) return obj.map(canonical);
  if (obj && typeof obj === 'object' && obj.constructor === Object) {
    const out = {};
    for (const k of Object.keys(obj).sort()) {
      if (STRIP_FIELDS.has(k)) continue;
      out[k] = canonical(obj[k]);
    }
    return out;
  }
  return obj;
}

function key(obj) { return JSON.stringify(canonical(obj)); }

const uri = MONGODB_URI.replace(/[&?]ssl=[^&]*/g, '');
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, tls: true });

async function loadAll(db, coll) {
  try {
    return await db.collection(coll).find({}).toArray();
  } catch {
    return [];
  }
}

async function compareOne(name, leftDb, rightDb) {
  const [L, R] = await Promise.all([loadAll(leftDb, name), loadAll(rightDb, name)]);

  // Check existence
  const leftCollExists = (await leftDb.listCollections({ name }).toArray()).length > 0;
  const rightCollExists = (await rightDb.listCollections({ name }).toArray()).length > 0;

  // Group by canonical content
  const lMap = new Map(); // key -> docs[]
  const rMap = new Map();
  for (const d of L) { const k = key(d); if (!lMap.has(k)) lMap.set(k, []); lMap.get(k).push(d); }
  for (const d of R) { const k = key(d); if (!rMap.has(k)) rMap.set(k, []); rMap.get(k).push(d); }

  const inBoth = [];
  const onlyLeft = [];
  const onlyRight = [];
  for (const [k, docs] of lMap) {
    if (rMap.has(k)) inBoth.push({ key: k, leftDocs: docs, rightDocs: rMap.get(k) });
    else onlyLeft.push({ key: k, docs });
  }
  for (const [k, docs] of rMap) {
    if (!lMap.has(k)) onlyRight.push({ key: k, docs });
  }

  return {
    name,
    leftCollExists, rightCollExists,
    leftCount: L.length, rightCount: R.length,
    distinctContent: { inBoth: inBoth.length, onlyLeft: onlyLeft.length, onlyRight: onlyRight.length },
    onlyLeft: onlyLeft.map(g => ({ count: g.docs.length, sample: canonical(g.docs[0]) })),
    onlyRight: onlyRight.map(g => ({ count: g.docs.length, sample: canonical(g.docs[0]) })),
    duplicatedInLeft: [...lMap.values()].filter(arr => arr.length > 1).map(arr => ({ count: arr.length, sample: canonical(arr[0]) })),
    duplicatedInRight: [...rMap.values()].filter(arr => arr.length > 1).map(arr => ({ count: arr.length, sample: canonical(arr[0]) })),
  };
}

function printOne(r) {
  console.log(`\n========== ${r.name} ==========`);
  console.log(`exists: LEFT=${r.leftCollExists}  RIGHT=${r.rightCollExists}`);
  console.log(`docs:   LEFT=${r.leftCount}      RIGHT=${r.rightCount}`);
  console.log(`distinct content: in-both=${r.distinctContent.inBoth}  only-LEFT=${r.distinctContent.onlyLeft}  only-RIGHT=${r.distinctContent.onlyRight}`);
  if (r.duplicatedInLeft.length)  console.log(`!! LEFT has ${r.duplicatedInLeft.length} duplicate content groups`);
  if (r.duplicatedInRight.length) console.log(`!! RIGHT has ${r.duplicatedInRight.length} duplicate content groups`);

  if (r.onlyLeft.length) {
    console.log(`\n--- ONLY in LEFT (${r.name}) ---`);
    for (const g of r.onlyLeft) {
      console.log(`  [${g.count}x] ${JSON.stringify(g.sample)}`);
    }
  }
  if (r.onlyRight.length) {
    console.log(`\n--- ONLY in RIGHT (${r.name}) ---`);
    for (const g of r.onlyRight) {
      console.log(`  [${g.count}x] ${JSON.stringify(g.sample)}`);
    }
  }
}

async function main() {
  await client.connect();
  const leftDb = client.db(LEFT);
  const rightDb = client.db(RIGHT);

  const targets = ONE ? [ONE] : RULE_COLLECTIONS;
  const results = [];
  for (const name of targets) {
    process.stderr.write(`comparing ${name}... `);
    const r = await compareOne(name, leftDb, rightDb);
    process.stderr.write(`L=${r.leftCount} R=${r.rightCount} same=${r.distinctContent.inBoth}\n`);
    results.push(r);
  }

  console.log(`\n=== Rule collection content comparison: ${LEFT} (LEFT) vs ${RIGHT} (RIGHT) ===`);
  if (JSON_OUT) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) printOne(r);
  }

  await client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
