#!/usr/bin/env node

// One-time import: load Google Forms history CSV into history_responses collection.
// Matches rows to characters by email → questionnaire_responses → character_id.
//
// Usage: cd server && node import-history.js

import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

const CSV_PATH = new URL('../History Responses.csv', import.meta.url);

// Parse CSV respecting quoted fields with commas and newlines
function parseCSV(text) {
  const rows = [];
  let i = 0;
  while (i < text.length) {
    const row = [];
    while (i < text.length) {
      if (text[i] === '"') {
        i++;
        let val = '';
        while (i < text.length) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { val += '"'; i += 2; }
            else { i++; break; }
          } else { val += text[i]; i++; }
        }
        row.push(val);
        if (text[i] === ',') i++;
        else if (text[i] === '\r') { i++; if (text[i] === '\n') i++; break; }
        else if (text[i] === '\n') { i++; break; }
        else if (i >= text.length) break;
      } else {
        let val = '';
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          val += text[i]; i++;
        }
        row.push(val);
        if (text[i] === ',') i++;
        else if (text[i] === '\r') { i++; if (text[i] === '\n') i++; break; }
        else if (text[i] === '\n') { i++; break; }
        else if (i >= text.length) break;
      }
    }
    if (row.length > 1 || (row.length === 1 && row[0].trim())) rows.push(row);
  }
  return rows;
}

async function run() {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCSV(raw);
  const dataRows = rows.slice(1); // skip header

  console.log(`Parsed ${dataRows.length} history response rows`);

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db('tm_suite');

  // Build email → character mapping from questionnaire_responses
  const qResponses = await db.collection('questionnaire_responses').find().toArray();
  const characters = await db.collection('characters').find({}, {
    projection: { _id: 1, name: 1, player: 1 }
  }).toArray();
  const players = await db.collection('players').find().toArray();

  // Map email (from questionnaire CSV) to character_id
  // The questionnaire import stored player_name in responses — match via that
  // Actually we need email → character. Let's build email → questionnaire response → character_id
  // The history CSV only has email. The questionnaire CSV had email + character name.
  // So we need to read the questionnaire CSV to build the email → character mapping.
  const qCsvPath = new URL('../Questionnaire Data.csv', import.meta.url);
  const qRaw = readFileSync(qCsvPath, 'utf-8');
  const qRows = parseCSV(qRaw);
  const qDataRows = qRows.slice(1);

  // Manual email → character name overrides for unmatched entries
  const MANUAL_EMAIL_MAP = {
    'george.tomossy@gmail.com': 'Jack Fallow',
    'andrewgrech990@gmail.com': 'Kirk Grimm',
    'm.bennett87@gmail.com': 'René St. Dominique',
    'pkalt1970@gmail.com': 'Yusuf Kalusicj',
    'arnie.walsh2@gmail.com': 'Conrad Sondergaard',
  };

  // Build email → character name from questionnaire CSV
  const emailToCharName = new Map();
  for (const [email, name] of Object.entries(MANUAL_EMAIL_MAP)) {
    emailToCharName.set(email.toLowerCase(), name);
  }
  for (const row of qDataRows) {
    const email = (row[1] || '').trim().toLowerCase();
    const charName = (row[7] || '').trim(); // column 7 = character name
    if (email && charName && !emailToCharName.has(email)) emailToCharName.set(email, charName);
  }

  // Build character name → { charId, playerId } lookup (same as questionnaire import)
  const charLookup = new Map();
  for (const c of characters) {
    const playerDoc = players.find(p =>
      (p.character_ids || []).some(id => id.toString() === c._id.toString())
    );
    const entry = { charId: c._id, playerId: playerDoc?._id || null };
    charLookup.set(c.name?.toLowerCase(), entry);
  }

  // Also index by questionnaire character names (which may have titles)
  for (const row of qDataRows) {
    const charName = (row[7] || '').trim();
    const email = (row[1] || '').trim().toLowerCase();
    if (!charName) continue;
    // Try to find matching character
    for (const [key, entry] of charLookup) {
      if (charName.toLowerCase().includes(key)) {
        emailToCharName.set(email, key); // normalise to DB name
        break;
      }
    }
  }

  // Drop existing
  await db.collection('history_responses').drop().catch(() => {});

  const docs = [];
  let matched = 0, unmatched = 0;

  for (const row of dataRows) {
    // Columns: 0=Timestamp, 1=Email, 2=Upload Option, 3=Form Option
    const email = (row[1] || '').trim().toLowerCase();
    const uploadLink = (row[2] || '').trim();
    const formText = (row[3] || '').trim();

    if (!email) continue;
    if (!uploadLink && !formText) continue;

    // Look up character via email
    const charName = emailToCharName.get(email);
    const lookup = charName ? charLookup.get(charName.toLowerCase()) || charLookup.get(charName) : null;

    if (!lookup) {
      console.log(`  No match: ${email}`);
      unmatched++;
      continue;
    }

    const now = new Date().toISOString();
    docs.push({
      character_id: lookup.charId,
      player_id: lookup.playerId,
      status: 'submitted',
      responses: {
        backstory_text: formText,
        backstory_link: uploadLink,
      },
      created_at: row[0] || now,
      updated_at: now,
      submitted_at: row[0] || now,
    });

    matched++;
  }

  if (docs.length) {
    const result = await db.collection('history_responses').insertMany(docs);
    console.log(`Imported ${result.insertedCount} history responses`);
  }
  console.log(`Matched: ${matched}, Unmatched: ${unmatched}`);

  await client.close();
  console.log('Done.');
}

run().catch(err => { console.error('Import failed:', err); process.exit(1); });
