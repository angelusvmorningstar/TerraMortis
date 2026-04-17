#!/usr/bin/env node

// Inserts 20 missing devotions into the purchasable_powers collection.
// Devotion data sourced from TM_rules_devotion_missing.json at project root.
//
// Idempotent — any key that already exists is skipped.
// _id values from the source file are stripped; MongoDB assigns fresh ones.
//
// Usage:
//   cd server && node migrate-devotions-missing.js           (prompts for confirmation)
//   cd server && node migrate-devotions-missing.js --confirm (skip prompt)

import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(__dirname, '../TM_rules_devotion_missing.json');

const raw = JSON.parse(readFileSync(SOURCE, 'utf8'));

// Strip _id — let MongoDB assign fresh ObjectIds
const devotions = raw.map(({ _id, ...rest }) => rest);

async function run(skipPrompt) {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'tm_suite');
  const col = db.collection('purchasable_powers');

  // Check which keys already exist
  const existingKeys = new Set(
    (await col.find({ key: { $in: devotions.map(d => d.key) } }, { projection: { key: 1 } }).toArray())
      .map(d => d.key)
  );

  const toInsert = devotions.filter(d => !existingKeys.has(d.key));
  const skipped  = devotions.filter(d =>  existingKeys.has(d.key));

  console.log(`\nSource: ${SOURCE}`);
  console.log(`Total devotions in file: ${devotions.length}`);
  console.log(`Already in DB (will skip): ${skipped.length}`);
  if (skipped.length) console.log('  ' + skipped.map(d => d.key).join('\n  '));
  console.log(`To insert: ${toInsert.length}`);
  if (toInsert.length) console.log('  ' + toInsert.map(d => d.key).join('\n  '));

  if (!toInsert.length) {
    console.log('\nNothing to do.');
    await client.close();
    return;
  }

  if (!skipPrompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => rl.question('\nProceed? (y/N) ', ans => {
      rl.close();
      if (ans.toLowerCase() !== 'y') { console.log('Aborted.'); process.exit(0); }
      resolve();
    }));
  }

  const result = await col.insertMany(toInsert, { ordered: false });
  console.log(`\nInserted: ${result.insertedCount}`);
  console.log('Done.');

  await client.close();
}

const skipPrompt = process.argv.includes('--confirm');
run(skipPrompt).catch(err => { console.error(err); process.exit(1); });
