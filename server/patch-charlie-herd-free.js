#!/usr/bin/env node

// Patch: clear spurious free=5 on Charlie Ballsack's Herd merit.
//
// Root cause: the Excel migration stored the SSJ dynamic Herd bonus as static
// free dots on the merit. All other SSJ characters have free=0 on Herd and rely
// on the ssjHerdBonus() dynamic calculation. Charlie was the only exception.
//
// This script finds Charlie's character document, locates the Herd merit in the
// merits array, sets free=0 on that entry, and writes it back via $set on the
// merits array. No other fields are touched.
//
// Usage: cd server && node patch-charlie-herd-free.js
//        cd server && node patch-charlie-herd-free.js --confirm   (skip prompt)

import { MongoClient } from 'mongodb';
import { createInterface } from 'node:readline';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

async function confirm() {
  if (process.argv.includes('--confirm')) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve, reject) => {
    rl.question(
      '\nThis will set free=0 on the Herd merit for Charlie Ballsack in Atlas.\n' +
      'All other fields are untouched.\n\n' +
      'Type YES to continue: ',
      answer => {
        rl.close();
        if (answer.trim() === 'YES') resolve();
        else { console.log('Aborted.'); process.exit(0); }
      }
    );
  });
}

async function patch() {
  await confirm();
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db  = client.db('tm_suite');
    const col = db.collection('characters');

    const charlie = await col.findOne({ name: 'Charlie Ballsack' });
    if (!charlie) {
      console.error('Character "Charlie Ballsack" not found in characters collection.');
      process.exit(1);
    }

    const merits  = charlie.merits || [];
    const herdIdx = merits.findIndex(m => m.name === 'Herd');
    if (herdIdx === -1) {
      console.error('No Herd merit found on Charlie Ballsack.');
      process.exit(1);
    }

    const before = merits[herdIdx].free;
    if (before === 0) {
      console.log('Herd free is already 0 — nothing to do.');
      return;
    }

    console.log(`Charlie Ballsack — Herd merit: free=${before} → 0`);

    const result = await col.updateOne(
      { _id: charlie._id },
      { $set: { [`merits.${herdIdx}.free`]: 0 } }
    );

    if (result.modifiedCount === 1) {
      console.log('Done. Charlie Ballsack Herd.free patched to 0.');
    } else {
      console.error('Update ran but modifiedCount was not 1 — check manually.');
      process.exit(1);
    }
  } finally {
    await client.close();
  }
}

patch().catch(err => {
  console.error('Patch failed:', err.message);
  process.exit(1);
});
