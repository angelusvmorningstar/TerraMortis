#!/usr/bin/env node

// Seeds tm_suite_dev with Yusuf's character only and creates ST player records.
// Run ONCE to set up the dev database, then update Render's MONGODB_DB=tm_suite_dev.
//
// Usage: cd server && node scripts/seed-dev.js
//
// What it does:
//   - Connects to the same Atlas cluster as production
//   - Creates/resets the tm_suite_dev database
//   - Seeds characters from data/chars_dev.json (Yusuf only)
//   - Creates a players collection with Peter (ST) pre-seeded
//   - Clears all other collections (downtime, sessions, territories)

import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Run from server/ directory with a valid .env');
  process.exit(1);
}

const DB_NAME = 'tm_suite_dev';
const DATA_PATH = new URL('../../data/chars_dev.json', import.meta.url);

const PETER_DISCORD_ID  = '469356244398899201';
const ANGELUS_DISCORD_ID = '694104767298797618';

async function seed() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    await client.connect();
    console.log(`Connected to Atlas. Seeding database: ${DB_NAME}`);

    const db = client.db(DB_NAME);

    // ── Characters ──────────────────────────────────────────────────────────
    const chars = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
    const charCol = db.collection('characters');
    await charCol.deleteMany({});
    const charResult = await charCol.insertMany(chars);
    console.log(`  characters: inserted ${charResult.insertedCount}`);

    // Capture Yusuf's _id for the player record
    const yusuf = await charCol.findOne({ name: 'Yusuf Kalusicj' });

    // ── Players ─────────────────────────────────────────────────────────────
    const playerCol = db.collection('players');
    await playerCol.deleteMany({});

    const now = new Date().toISOString();
    const players = [
      {
        discord_id:       PETER_DISCORD_ID,
        discord_username: 'peterk',
        display_name:     'Peter K',
        role:             'st',
        character_ids:    yusuf ? [yusuf._id] : [],
        ordeals:          {},
        created_at:       now,
        last_login:       null,
      },
      {
        discord_id:       ANGELUS_DISCORD_ID,
        discord_username: 'angelus',
        display_name:     'Angelus',
        role:             'st',
        character_ids:    [],
        ordeals:          {},
        created_at:       now,
        last_login:       null,
      },
    ];

    const playerResult = await playerCol.insertMany(players);
    console.log(`  players: inserted ${playerResult.insertedCount}`);

    // ── Clear other collections (start fresh for dev) ────────────────────────
    const toClear = [
      'downtime_cycles',
      'downtime_submissions',
      'game_sessions',
      'session_logs',
      'territories',
      'ordeal_submissions',
    ];

    for (const name of toClear) {
      const result = await db.collection(name).deleteMany({});
      if (result.deletedCount > 0) {
        console.log(`  ${name}: cleared ${result.deletedCount} documents`);
      }
    }

    console.log(`\nDone. Dev database '${DB_NAME}' is ready.`);
    console.log('\nNext steps:');
    console.log('  1. In Render dashboard: set MONGODB_DB=tm_suite_dev');
    console.log('  2. Peter logs in via Discord OAuth — his ST role is pre-seeded.');
    console.log('  3. When dev work is complete, remove MONGODB_DB from Render to restore production.');

  } finally {
    await client.close();
  }
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
