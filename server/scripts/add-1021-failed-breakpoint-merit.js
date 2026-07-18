#!/usr/bin/env node
/**
 * Issue #1021 — insert 'Failed Breakpoint' merit into purchasable_powers.
 *
 * Narrative-consequence merit at 2 dots (2 XP total under VtR 2e's flat
 * 1 XP/dot merit rule). No mechanical prereqs; description is the exact
 * text supplied on the ticket.
 *
 * Idempotent. Dry-run default; pass --apply to write. If the doc already
 * exists it's a no-op — this script never overwrites.
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'tm_suite';

export const FAILED_BREAKPOINT_DOC = {
  key: 'failed-breakpoint',
  name: 'Failed Breakpoint',
  category: 'merit',
  sub_category: 'general',
  parent: null,
  rank: null,
  rating_range: [2, 2],
  description: 'You have failed a break point that has reduced your humanity',
  pool: null,
  resistance: null,
  cost: null,
  action: null,
  duration: null,
  prereq: null,
  exclusive: null,
  xp_fixed: null,
  bloodline: null,
  offering: null,
  cult: null,
  implemented: false,
};

async function main() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is not set. Run from server/ with server/.env in place.');
    process.exit(1);
  }
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${DB_NAME}`);
  console.log(`Target key: ${FAILED_BREAKPOINT_DOC.key}\n`);

  console.log('--- Document to insert ---');
  console.log(JSON.stringify(FAILED_BREAKPOINT_DOC, null, 2));
  console.log('--- end document ---\n');

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000, tls: true });
  try {
    await client.connect();
    const col = client.db(DB_NAME).collection('purchasable_powers');

    const existing = await col.findOne(
      { key: FAILED_BREAKPOINT_DOC.key },
      { projection: { _id: 1, name: 1 } }
    );
    if (existing) {
      console.log(`Already present (_id=${existing._id}). No-op.`);
      return;
    }

    if (APPLY) {
      const res = await col.insertOne({ ...FAILED_BREAKPOINT_DOC });
      console.log(`Inserted 1 doc (_id=${res.insertedId}).`);
    } else {
      console.log('[DRY RUN] Pass --apply to write.');
    }
  } finally {
    await client.close();
  }
}

const _invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (_invokedDirectly) {
  main().catch(err => { console.error(err); process.exit(1); });
}
