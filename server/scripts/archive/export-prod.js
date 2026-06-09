#!/usr/bin/env node

// Exports the current state of tm_suite characters to a dated backup JSON.
// Run this before any migration or schema work to preserve app-edited data.
//
// Usage: cd server && node scripts/export-prod.js
// Output: data/backup/chars_<YYYY-MM-DD>.json

import { writeFileSync, mkdirSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Run from server/ directory with a valid .env');
  process.exit(1);
}

const DB_NAME = process.env.MONGODB_DB || 'tm_suite';

async function exportProd() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const chars = await db.collection('characters').find({}).toArray();
    console.log(`Exporting ${chars.length} characters from ${DB_NAME}...`);

    const date = new Date().toISOString().slice(0, 10);
    const outDir = new URL('../../data/backup/', import.meta.url);
    mkdirSync(outDir, { recursive: true });

    const outPath = new URL(`../../data/backup/chars_${date}.json`, import.meta.url);
    writeFileSync(outPath, JSON.stringify(chars, null, 2), 'utf-8');

    console.log(`Saved: data/backup/chars_${date}.json`);
  } finally {
    await client.close();
  }
}

exportProd().catch(err => {
  console.error('Export failed:', err.message);
  process.exit(1);
});
