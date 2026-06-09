#!/usr/bin/env node

// Seed the players collection with the 3 STs and all known player-character
// mappings from the characters collection.
//
// - Looks up character _ids by name+player from the existing characters collection
// - Creates ST player records for Angelus, Symon, and Kurtis
// - Creates player records for every unique player name in the characters collection
// - Idempotent: drops and re-inserts the players collection
//
// Usage: cd server && node migrate-players.js

import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

// Known ST Discord IDs
const STS = [
  { discord_id: '694104767298797618', display_name: 'Angelus', player_name: null },
  { discord_id: '405594065841946624', display_name: 'Symon G', player_name: 'Symon' },
  { discord_id: '977695064392343652', display_name: 'Kurtis W', player_name: 'Kurtis W' },
];

async function migrate() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db('tm_suite');
  const now = new Date().toISOString();

  // Fetch all characters to build player-character mappings
  const characters = await db.collection('characters').find({}, { projection: { _id: 1, name: 1, player: 1 } }).toArray();
  console.log(`Found ${characters.length} characters in the database`);

  // Group characters by player name
  const byPlayer = new Map();
  for (const c of characters) {
    const pName = c.player || 'Unknown';
    if (!byPlayer.has(pName)) byPlayer.set(pName, []);
    byPlayer.get(pName).push(c._id);
  }

  const players = [];

  // Create ST records
  for (const st of STS) {
    const charIds = st.player_name ? (byPlayer.get(st.player_name) || []) : [];
    players.push({
      discord_id: st.discord_id,
      display_name: st.display_name,
      role: 'st',
      character_ids: charIds,
      ordeals: {},
      created_at: now,
      last_login: now,
    });
    // Remove from the map so we don't create duplicate player records
    if (st.player_name) byPlayer.delete(st.player_name);
  }

  // Create player records for everyone else (no Discord ID yet — to be filled in)
  for (const [playerName, charIds] of byPlayer) {
    players.push({
      discord_id: null,
      display_name: playerName,
      role: 'player',
      character_ids: charIds,
      ordeals: {},
      created_at: now,
      last_login: null,
    });
  }

  // Drop and re-insert
  await db.collection('players').drop().catch(() => {});
  const result = await db.collection('players').insertMany(players);
  console.log(`Inserted ${result.insertedCount} player records:`);
  console.log(`  ${STS.length} STs (with Discord IDs)`);
  console.log(`  ${players.length - STS.length} players (Discord IDs to be added later)`);

  // Create index on discord_id for auth lookups (partial: only index non-null values)
  await db.collection('players').createIndex(
    { discord_id: 1 },
    { unique: true, partialFilterExpression: { discord_id: { $type: 'string' } } }
  );
  console.log('Created unique index on discord_id');

  await client.close();
  console.log('Done.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
