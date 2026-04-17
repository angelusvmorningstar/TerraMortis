#!/usr/bin/env node

// Migrates court title data from the old single-field system to the new two-field system.
//
// OLD: court_title = 'Premier' | 'Primogen' | 'Administrator' | 'Harpy' | 'Protector'
// NEW: court_category = 'Head of State' | 'Primogen' | 'Administrator' | 'Socialite' | 'Enforcer'
//      court_title    = free-text epithet (e.g. 'Premier', 'Harpy', 'Protector')
//
// Mapping applied:
//   court_title 'Premier'      → court_category 'Head of State', court_title 'Premier'
//   court_title 'Harpy'        → court_category 'Socialite',     court_title 'Harpy'
//   court_title 'Protector'    → court_category 'Enforcer',      court_title 'Protector'
//   honorific   'Premier'      → court_category 'Head of State', court_title 'Premier'  (if court_title null)
//   honorific   'Harpy'        → court_category 'Socialite',     court_title 'Harpy'    (if court_title null)
//   honorific   'Protector'    → court_category 'Enforcer',      court_title 'Protector' (if court_title null)
//
// For Primogens and Administrators: court_category must be set manually via the City tab editor.
//
// Also fixes the 'harbour' territory document: sets name = 'The Harbour' if missing.
//
// Safe to run multiple times — already-migrated characters (court_category set) are skipped.
//
// Usage:
//   cd server && node migrate-court-titles.js           (prompts for confirmation)
//   cd server && node migrate-court-titles.js --confirm (skip prompt)

import { createInterface } from 'node:readline';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

// Old court_title values → new court_category + court_title epithet
const TITLE_MIGRATION = {
  'Premier':   { category: 'Head of State', epithet: 'Premier' },
  'Harpy':     { category: 'Socialite',     epithet: 'Harpy' },
  'Protector': { category: 'Enforcer',      epithet: 'Protector' },
};

// Honorific values that indicate a court position (copied if court_title is null)
const HONORIFIC_MIGRATION = {
  'Premier':   { category: 'Head of State', epithet: 'Premier' },
  'Harpy':     { category: 'Socialite',     epithet: 'Harpy' },
  'Protector': { category: 'Enforcer',      epithet: 'Protector' },
};

async function confirm() {
  if (process.argv.includes('--confirm')) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => {
    rl.question(
      '\nThis script will:\n' +
      '  1. Set court_category on characters with known court_title values (Premier, Harpy, Protector)\n' +
      '  2. Fall back to honorific for characters with court_title null\n' +
      '  3. Set name = "The Harbour" on the harbour territory if missing\n\n' +
      'Already-migrated characters (court_category already set) are skipped.\n\n' +
      'Type YES to continue: ',
      answer => {
        rl.close();
        if (answer.trim() === 'YES') resolve();
        else { console.log('Aborted.'); process.exit(0); }
      }
    );
  });
}

async function run() {
  await confirm();

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();
    const chars = db.collection('characters');
    const territories = db.collection('territories');

    // ── Migrate characters ──────────────────────────────────────────────────

    const all = await chars.find({}).toArray();
    let migrated = 0;
    let skipped = 0;

    for (const c of all) {
      // Skip already migrated
      if (c.court_category) { skipped++; continue; }

      let mapping = null;

      // 1. Try existing court_title
      if (c.court_title && TITLE_MIGRATION[c.court_title]) {
        mapping = TITLE_MIGRATION[c.court_title];
      }
      // 2. Fall back to honorific
      else if (!c.court_title && c.honorific && HONORIFIC_MIGRATION[c.honorific]) {
        mapping = HONORIFIC_MIGRATION[c.honorific];
      }

      if (!mapping) { skipped++; continue; }

      await chars.updateOne(
        { _id: c._id },
        { $set: { court_category: mapping.category, court_title: mapping.epithet } }
      );
      console.log(`  Migrated: ${c.name} → category="${mapping.category}", epithet="${mapping.epithet}"`);
      migrated++;
    }

    console.log(`\nCharacters: ${migrated} migrated, ${skipped} skipped.`);

    // ── Fix harbour territory name ──────────────────────────────────────────

    const harbour = await territories.findOne({ id: 'harbour' });
    if (!harbour) {
      console.log('\nHarbour territory document not found — skipping.');
    } else if (harbour.name) {
      console.log(`\nHarbour territory already has name="${harbour.name}" — skipping.`);
    } else {
      await territories.updateOne({ id: 'harbour' }, { $set: { name: 'The Harbour' } });
      console.log('\nFixed: harbour territory name set to "The Harbour".');
    }

    console.log('\nDone.');
  } finally {
    await client.close();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
