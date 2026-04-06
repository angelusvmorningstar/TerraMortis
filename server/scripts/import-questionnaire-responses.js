#!/usr/bin/env node

// Import questionnaire_responses.json into MongoDB questionnaire_responses collection.
// Resolves character_name → character_id by matching against the characters collection.
// Upserts by character_id — safe to re-run; existing documents are updated, not duplicated.
//
// Usage: cd server && node scripts/import-questionnaire-responses.js

import { readFileSync } from 'node:fs';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

const DATA_PATH = new URL('../../data/questionnaire_responses.json', import.meta.url);

async function run() {
  const raw = readFileSync(DATA_PATH, 'utf-8');
  const docs = JSON.parse(raw);

  if (!Array.isArray(docs)) {
    console.error('Expected questionnaire_responses.json to be an array.');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db('tm_suite');
    const chars = db.collection('characters');
    const col  = db.collection('questionnaire_responses');

    // Build a name → _id lookup from the characters collection.
    // Matches on moniker OR name (same logic as displayName/sortName).
    const allChars = await chars.find({}, { projection: { name: 1, moniker: 1 } }).toArray();
    const nameMap = new Map();
    for (const c of allChars) {
      if (c.moniker) nameMap.set(c.moniker.toLowerCase(), c._id);
      nameMap.set(c.name.toLowerCase(), c._id);
    }

    let matched = 0;
    let unmatched = 0;
    let upserted = 0;

    for (const doc of docs) {
      const rawName = (doc.character_name || '').toLowerCase().trim();
      // Also try the moniker extracted from "Name 'Moniker' Surname" format
      const monikerMatch = doc.character_name?.match(/'([^']+)'/);
      const extractedMoniker = monikerMatch ? monikerMatch[1].toLowerCase() : null;
      const charId = nameMap.get(rawName) || (extractedMoniker ? nameMap.get(extractedMoniker) : null) || null;

      if (!charId) {
        console.warn(`  [UNMATCHED] "${doc.character_name}" — no character found. Skipping.`);
        unmatched++;
        continue;
      }

      matched++;

      const record = {
        character_id:  charId,
        character_name: doc.character_name,
        status:        doc.status || 'submitted',
        responses:     doc.responses || {},
        submitted_at:  doc.submitted_at || null,
        created_at:    doc.submitted_at || new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      };

      await col.updateOne(
        { character_id: charId },
        { $set: record },
        { upsert: true }
      );
      upserted++;
      console.log(`  [OK] ${doc.character_name}`);
    }

    console.log(`\nDone. ${matched} matched, ${upserted} upserted, ${unmatched} skipped.`);
  } finally {
    await client.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
