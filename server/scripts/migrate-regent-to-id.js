#!/usr/bin/env node

/**
 * Migrate regent assignment from character fields to territory documents.
 *
 * Before: character.regent_territory = "The North Shore" (name string)
 * After:  territory.regent_id = "67d3a503..." (character _id string)
 *
 * Steps:
 * 1. Read all characters with regent_territory set
 * 2. For each, upsert the matching territory doc with regent_id = char._id
 * 3. If regent_lieutenant is set, resolve to _id and set lieutenant_id
 * 4. Unset regent_territory and regent_lieutenant from ALL character docs
 *
 * Usage:
 *   node scripts/migrate-regent-to-id.js --dry-run   # default
 *   node scripts/migrate-regent-to-id.js --apply
 *
 *   DB_NAME=tm_suite node scripts/migrate-regent-to-id.js --apply
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }

const DB_NAME = process.env.DB_NAME || 'tm_suite';
const APPLY = process.argv.includes('--apply');

const TERRITORY_IDS = {
  'The Academy':    'academy',
  'The Dockyards':  'dockyards',
  'The Harbour':    'harbour',
  'The North Shore': 'northshore',
  'The Second City': 'secondcity',
};

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Database: ${DB_NAME}\n`);

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const charCol = db.collection('characters');
    const terrCol = db.collection('territories');

    // Load all characters for name→_id resolution
    const allChars = await charCol.find({}, { projection: { _id: 1, name: 1, moniker: 1 } }).toArray();
    const nameToId = new Map();
    for (const c of allChars) {
      nameToId.set(c.name, String(c._id));
      if (c.moniker) nameToId.set(c.moniker, String(c._id));
    }

    // Find regents
    const regents = await charCol.find(
      { regent_territory: { $ne: null } },
      { projection: { name: 1, regent_territory: 1, regent_lieutenant: 1 } }
    ).toArray();

    console.log(`Found ${regents.length} regent(s):\n`);

    for (const r of regents) {
      const terrName = r.regent_territory;
      const terrId = TERRITORY_IDS[terrName];
      if (!terrId) {
        console.log(`  WARNING: ${r.name} — unknown territory "${terrName}", skipping`);
        continue;
      }

      const regentId = String(r._id);
      let lieutenantId = null;
      if (r.regent_lieutenant) {
        lieutenantId = nameToId.get(r.regent_lieutenant) || null;
        if (!lieutenantId) console.log(`  WARNING: ${r.name} — lieutenant "${r.regent_lieutenant}" not found`);
      }

      console.log(`  ${r.name} → ${terrName} (${terrId})`);
      console.log(`    regent_id: ${regentId}`);
      if (lieutenantId) console.log(`    lieutenant_id: ${lieutenantId}`);

      if (APPLY) {
        await terrCol.updateOne(
          { id: terrId },
          {
            $set: { regent_id: regentId, lieutenant_id: lieutenantId },
            $unset: { regent: '', lieutenant: '' },
            $setOnInsert: { id: terrId, name: terrName },
          },
          { upsert: true }
        );
      }
    }

    // Unset regent fields from ALL characters
    if (APPLY) {
      const res = await charCol.updateMany(
        {},
        { $unset: { regent_territory: '', regent_lieutenant: '' } }
      );
      console.log(`\nCleared regent_territory/regent_lieutenant from ${res.modifiedCount} character(s).`);
    } else {
      const count = await charCol.countDocuments({
        $or: [
          { regent_territory: { $exists: true } },
          { regent_lieutenant: { $exists: true } },
        ],
      });
      console.log(`\nWould clear regent_territory/regent_lieutenant from ${count} character(s).`);
    }

    console.log(APPLY ? '\nDone.' : '\nDry run — no changes. Re-run with --apply.');
  } finally {
    await client.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
