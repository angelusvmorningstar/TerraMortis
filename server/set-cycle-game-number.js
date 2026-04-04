#!/usr/bin/env node
// One-off: set game_number on the active downtime cycle.
// Usage: cd server && node set-cycle-game-number.js [number]
// Defaults to game_number=2 if no argument given.

import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

const gameNumber = parseInt(process.argv[2] || '2', 10);
if (isNaN(gameNumber) || gameNumber < 1) {
  console.error('Invalid game number. Usage: node set-cycle-game-number.js 2');
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');
const col = db.collection('downtime_cycles');

const active = await col.findOne({ status: 'active' });
if (!active) {
  console.log('No active downtime cycle found.');
  await client.close();
  process.exit(0);
}

console.log(`Found active cycle: "${active.label}" (_id: ${active._id})`);

const result = await col.updateOne(
  { _id: active._id },
  { $set: { game_number: gameNumber, label: 'Downtime ' + gameNumber } }
);

console.log(`Updated: game_number=${gameNumber}, label="Downtime ${gameNumber}" (matched: ${result.matchedCount}, modified: ${result.modifiedCount})`);
await client.close();
