#!/usr/bin/env node

// One-time import: load Google Forms questionnaire CSV into questionnaire_responses collection.
// Matches rows to characters by character name.
//
// Usage: cd server && node import-questionnaire.js

import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

const CSV_PATH = new URL('../Questionnaire Data.csv', import.meta.url);

// Mask/Dirge archetype names in column order
const MD_ARCHETYPES = [
  'Authoritarian', 'Child', 'Competitor', 'Conformist', 'Conspirator',
  'Courtesan', 'Cult Leader', 'Deviant', 'Follower', 'Guru',
  'Idealist', 'Jester', 'Junkie', 'Martyr', 'Masochist',
  'Monster', 'Nomad', 'Nurturer', 'Penitent', 'Perfectionist',
  'Questioner', 'Rebel', 'Scholar', 'Social Chameleon', 'Spy',
  'Survivor', 'Visionary',
];

// Parse CSV respecting quoted fields with commas and newlines
function parseCSV(text) {
  const rows = [];
  let i = 0;
  while (i < text.length) {
    const row = [];
    while (i < text.length) {
      if (text[i] === '"') {
        // Quoted field
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
        // Unquoted field
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

// Extract clean clan name from "Gangrel - savage survivalists" format
function cleanClan(raw) {
  if (!raw) return '';
  const match = raw.match(/^(\w+)/);
  return match ? match[1] : raw;
}

// Extract clean covenant name from the full label
function cleanCovenant(raw) {
  if (!raw) return '';
  const map = {
    'carthian': 'Carthian Movement',
    'circle': 'Circle of the Crone',
    'invictus': 'Invictus',
    'lancea': 'Lancea et Sanctum',
    'unaligned': 'Unaligned',
  };
  const lower = raw.toLowerCase();
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key)) return val;
  }
  return raw;
}

// Extract beast type from conflict approach
function cleanConflict(raw) {
  if (!raw) return '';
  if (raw.includes('Intimidation')) return 'Monstrous';
  if (raw.includes('Manipulation')) return 'Seductive';
  if (raw.includes('Superiority')) return 'Competitive';
  return '';
}

// Extract mask and dirge from the 27 matrix columns
function extractMaskDirge(row, startCol) {
  let mask = '', dirge = '';
  for (let j = 0; j < MD_ARCHETYPES.length; j++) {
    const val = (row[startCol + j] || '').trim();
    if (val === 'Mask') mask = MD_ARCHETYPES[j];
    if (val === 'Dirge') dirge = MD_ARCHETYPES[j];
  }
  return { mask, dirge };
}

async function run() {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCSV(raw);
  const headers = rows[0];
  const dataRows = rows.slice(1);

  console.log(`Parsed ${dataRows.length} response rows, ${headers.length} columns`);

  // Find the column index where Mask/Dirge matrix starts (first "12. Mask and Dirge" column)
  const mdStart = headers.findIndex(h => h.includes('Mask and Dirge'));
  console.log(`Mask/Dirge matrix starts at column ${mdStart}`);

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db('tm_suite');

  // Build character name → _id + player_id lookup
  const characters = await db.collection('characters').find({}, {
    projection: { _id: 1, name: 1, moniker: 1, honorific: 1, player: 1 }
  }).toArray();

  const players = await db.collection('players').find().toArray();

  // Map player display_name to player _id
  const playerByName = new Map();
  for (const p of players) playerByName.set(p.display_name, p._id);

  // Map character name (various forms) to { charId, playerId }
  const charLookup = new Map();
  for (const c of characters) {
    const playerDoc = players.find(p =>
      (p.character_ids || []).some(id => id.toString() === c._id.toString())
    );
    const entry = { charId: c._id, playerId: playerDoc?._id || null };
    // Index by name, moniker, and honorific+name
    charLookup.set(c.name?.toLowerCase(), entry);
    if (c.moniker) charLookup.set(c.moniker.toLowerCase(), entry);
    const full = [c.honorific, c.moniker || c.name].filter(Boolean).join(' ');
    charLookup.set(full.toLowerCase(), entry);
  }

  // Drop existing questionnaire_responses
  await db.collection('questionnaire_responses').drop().catch(() => {});

  const docs = [];
  let matched = 0, unmatched = 0;

  for (const row of dataRows) {
    const charName = (row[7] || '').trim(); // column 7 = "1. Character Name"
    if (!charName) continue;

    // Try to match character: exact name, then stripped title, then by player name
    let lookup = charLookup.get(charName.toLowerCase())
      || charLookup.get(charName.replace(/^(Lord|Lady|Doctor|Sister|Sir|Miss|Mr|Mrs|Madam|Don|Preacher|Inquisitor)\s+/i, '').toLowerCase());

    // Fuzzy: check if any DB character name appears within the CSV name
    if (!lookup) {
      for (const [key, entry] of charLookup) {
        if (key.length > 2 && charName.toLowerCase().includes(key)) {
          lookup = entry;
          break;
        }
      }
    }

    // Last resort: match by player name from CSV to player name on character
    if (!lookup) {
      const csvPlayer = (row[2] || '').trim().toLowerCase();
      const charByPlayer = characters.find(c =>
        c.player && c.player.toLowerCase().startsWith(csvPlayer.split(' ')[0].toLowerCase())
      );
      if (charByPlayer) {
        const playerDoc2 = players.find(p =>
          (p.character_ids || []).some(id => id.toString() === charByPlayer._id.toString())
        );
        lookup = { charId: charByPlayer._id, playerId: playerDoc2?._id || null };
      }
    }

    if (!lookup) {
      console.log(`  No match: "${charName}" (player: ${row[2]})`);
      unmatched++;
      continue;
    }

    const { mask, dirge } = extractMaskDirge(row, mdStart);

    // Column mapping (0-indexed):
    // 0=Timestamp, 1=Email, 2=Player Name, 3=Facebook, 4=Discord,
    // 5=Gaming prefs, 6=Support, 7=Char Name, 8=High Concept, 9=Clan,
    // 10=Bloodline, 11=Bloodline rationale, 12=Covenant, 13=Cov Factions,
    // 14=Embrace, 15=BP, 16=Apparent Age, 17=Conflict approach,
    // 18..44=Mask/Dirge matrix (27 cols),
    // 45=Court motivation, 46=Ambitions, 47=Why Sydney,
    // 48=Why covenant, 49=Cov goals, 50=Clan goals,
    // 51=Aspired position, 52=View traditions, 53=Elysium, 54=Mortals/ghouls,
    // 55=Embrace story, 56=Sire, 57=Early nights, 58=Last city,
    // 59=Mortal family, 60=Touchstones, 61=Hunting style, 62=First kill,
    // 63=Common indulgences, 64=Allies, 65=Coterie, 66=Enemies,
    // 67=Opposed covenant, 68=Intolerable, 69=Boons, 70=Secrets

    const postMD = mdStart + MD_ARCHETYPES.length; // first column after mask/dirge matrix

    const responses = {
      player_name: row[2] || '',
      facebook_name: row[3] || '',
      discord_nickname: row[4] || '',
      gaming_preferences: row[5] || '',
      support_preferences: row[6] || '',
      character_name: row[7] || '',
      high_concept: row[8] || '',
      clan: cleanClan(row[9]),
      bloodline: row[10] || '',
      bloodline_rationale: row[11] || '',
      covenant: cleanCovenant(row[12]),
      covenant_factions: row[13] || '',
      embrace_date: row[14] || '',
      blood_potency: row[15] || '',
      apparent_age: row[16] || '',
      conflict_approach: cleanConflict(row[17]),
      mask,
      dirge,
      court_motivation: row[postMD] || '',
      ambitions_sydney: row[postMD + 1] || '',
      why_sydney: row[postMD + 2] || '',
      why_covenant: row[postMD + 3] || '',
      covenant_goals: row[postMD + 4] || '',
      clan_goals: row[postMD + 5] || '',
      aspired_position: row[postMD + 6] || '',
      view_traditions: row[postMD + 7] || '',
      view_elysium: row[postMD + 8] || '',
      view_mortals: row[postMD + 9] || '',
      embrace_story: row[postMD + 10] || '',
      sire: row[postMD + 11] || '',
      early_nights: row[postMD + 12] || '',
      last_city_politics: row[postMD + 13] || '',
      mortal_family: row[postMD + 14] || '',
      touchstones: row[postMD + 15] || '',
      hunting_style: row[postMD + 16] || '',
      first_kill: row[postMD + 17] || '',
      common_indulgences: row[postMD + 18] || '',
      allies: row[postMD + 19] || '',
      coterie: row[postMD + 20] || '',
      enemies: row[postMD + 21] || '',
      opposed_covenant: row[postMD + 22] || '',
      intolerable_behaviours: row[postMD + 23] || '',
      boons_debts: row[postMD + 24] || '',
      secrets: row[postMD + 25] || '',
    };

    const now = new Date().toISOString();
    docs.push({
      character_id: lookup.charId,
      player_id: lookup.playerId,
      status: 'submitted',
      responses,
      created_at: row[0] || now,
      updated_at: now,
      submitted_at: row[0] || now,
    });

    matched++;
  }

  if (docs.length) {
    const result = await db.collection('questionnaire_responses').insertMany(docs);
    console.log(`Imported ${result.insertedCount} questionnaire responses`);
  }
  console.log(`Matched: ${matched}, Unmatched: ${unmatched}`);

  await client.close();
  console.log('Done.');
}

run().catch(err => { console.error('Import failed:', err); process.exit(1); });
