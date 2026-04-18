/**
 * Clears old Attaché retainer-pool fields from all character merits.
 * Sets Attaché merit category to 'influence'.
 * Run once after deploying feat.15: node server/scripts/migrate-attache-redesign.js
 */

import { MongoClient } from 'mongodb';
import { config } from '../config.js';

async function run() {
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const db = client.db('tm_suite');
  const chars = db.collection('characters');

  const all = await chars.find({}).toArray();
  let updated = 0;

  for (const c of all) {
    const merits = c.merits || [];
    let fieldsCleared = 0;
    const meritUpdates = [];

    for (let i = 0; i < merits.length; i++) {
      const m = merits[i];
      const unset = {};
      if (m.attache_key !== undefined)    { unset[`merits.${i}.attache_key`]     = ''; fieldsCleared++; }
      if (m.retainer_source !== undefined) { unset[`merits.${i}.retainer_source`] = ''; fieldsCleared++; }
      if (m.free_attache !== undefined)    { unset[`merits.${i}.free_attache`]    = ''; fieldsCleared++; }
      if (Object.keys(unset).length) meritUpdates.push({ $unset: unset });

      if (m.name === 'Attach\u00e9' && m.category !== 'influence') {
        meritUpdates.push({ $set: { [`merits.${i}.category`]: 'influence' } });
        fieldsCleared++;
      }
    }

    if (meritUpdates.length) {
      for (const op of meritUpdates) {
        await chars.updateOne({ _id: c._id }, op);
      }
      updated++;
      console.log(`  ${c.name || c._id}: ${fieldsCleared} field(s) cleared/updated`);
    }
  }

  console.log(`\nDone. ${updated} character(s) updated.`);
  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
