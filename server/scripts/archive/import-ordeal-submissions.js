#!/usr/bin/env node

// OR-1b: Import ordeal submissions from pre-processed JSON files into MongoDB.
//
// Sources (all in data/):
//   lore_mastery.json            — 15 submissions, 45 questions
//   rules_mastery.json           — 9 submissions, 56 questions
//   covenant_questionnaire.json  — 12 submissions, 22 questions per covenant branch
//   character_histories.json     — 14 submissions, single narrative text
//
// Also seeds ordeal_rubrics from data/ordeal_rubrics_seed.json if collection is empty.
//
// Upserts by (character_id, ordeal_type) — safe to re-run.
//
// Usage: cd server && node scripts/import-ordeal-submissions.js
//        cd server && node scripts/import-ordeal-submissions.js --dry-run

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const DATA = path.join(ROOT, 'data');

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('[DRY RUN] No writes will be made.\n');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

function readJson(file) {
  return JSON.parse(readFileSync(path.join(DATA, file), 'utf-8'));
}

// ── Name resolution ──────────────────────────────────────────────────────────

const HONORIFICS = /^(lord|lady|doctor|dr|sister|sir|miss|mr|mrs|madam|don|preacher|inquisitor|rev|reverend)\s+/i;

function normaliseName(raw) {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();
  let prev;
  do { prev = s; s = s.replace(HONORIFICS, '').trim(); } while (s !== prev);
  s = s.replace(/[\u2018\u2019\u201C\u201D'""][^\u2018\u2019\u201C\u201D'""\n]+[\u2018\u2019\u201C\u201D'""]/g, '').trim();
  s = s.replace(/\(.*?\)/g, '').trim();
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}

function buildCharLookup(chars) {
  const map = new Map();
  for (const c of chars) {
    for (const n of [c.name, c.moniker].filter(Boolean)) {
      map.set(n.toLowerCase(), c);
      map.set(normaliseName(n), c);
    }
  }
  return map;
}

function resolveChar(rawName, lookup) {
  if (!rawName) return null;
  const norm = normaliseName(rawName);
  if (lookup.has(norm)) return lookup.get(norm);
  // Partial prefix match
  for (const [key, char] of lookup) {
    if (key && norm && (key.startsWith(norm) || norm.startsWith(key))) return char;
  }
  return null;
}

// ── Convert keyed answers → ordered responses array ─────────────────────────

function buildResponses(questionReference, answers) {
  return questionReference.map(q => ({
    question: q.text.trim(),
    answer:   (answers[q.key] ?? '').toString().trim(),
  }));
}

// ── Blank marking block ──────────────────────────────────────────────────────

function blankMarking() {
  return {
    status:           'unmarked',
    marked_by:        null,
    marked_at:        null,
    overall_feedback: '',
    xp_awarded:       null,
    answers:          [],
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db  = client.db('tm_suite');
  const col = db.collection('ordeal_submissions');

  const chars = await db.collection('characters').find(
    {}, { projection: { _id: 1, name: 1, moniker: 1, honorific: 1, covenant: 1 } }
  ).toArray();
  const lookup = buildCharLookup(chars);

  const allDocs = [];
  const unmatched = [];

  // ── Lore Mastery ────────────────────────────────────────────────────────────
  console.log('\n--- Lore Mastery ---');
  {
    const data = readJson('lore_mastery.json');
    let ok = 0;
    for (const sub of data.submissions) {
      const char = resolveChar(sub.character_name, lookup);
      if (!char) { unmatched.push({ type: 'lore_mastery', name: sub.character_name }); continue; }
      allDocs.push({
        character_id:  char._id,
        player_id:     null,
        ordeal_type:   'lore_mastery',
        covenant:      null,
        submitted_at:  sub.submitted_at || null,
        source:        'google_form',
        responses:     buildResponses(data.question_reference, sub.answers),
        marking:       blankMarking(),
      });
      console.log(`  [OK] ${sub.character_name}`);
      ok++;
    }
    console.log(`  ${ok} imported, ${data.submissions.length - ok} skipped`);
  }

  // ── Rules Mastery ───────────────────────────────────────────────────────────
  console.log('\n--- Rules Mastery ---');
  {
    const data = readJson('rules_mastery.json');
    let ok = 0;
    for (const sub of data.submissions) {
      const char = resolveChar(sub.character_name, lookup);
      if (!char) { unmatched.push({ type: 'rules_mastery', name: sub.character_name }); continue; }
      allDocs.push({
        character_id:  char._id,
        player_id:     null,
        ordeal_type:   'rules_mastery',
        covenant:      null,
        submitted_at:  sub.submitted_at || null,
        source:        'google_form',
        responses:     buildResponses(data.question_reference, sub.answers),
        marking:       blankMarking(),
      });
      console.log(`  [OK] ${sub.character_name}`);
      ok++;
    }
    console.log(`  ${ok} imported, ${data.submissions.length - ok} skipped`);
  }

  // ── Covenant Questionnaire ──────────────────────────────────────────────────
  console.log('\n--- Covenant Questionnaire ---');
  {
    const data = readJson('covenant_questionnaire.json');
    let ok = 0;
    for (const sub of data.submissions) {
      const char = resolveChar(sub.character_name, lookup);
      if (!char) { unmatched.push({ type: 'covenant_questionnaire', name: sub.character_name }); continue; }

      // question_references is keyed by covenant slug
      const qRef = data.question_references[sub.covenant] || [];
      allDocs.push({
        character_id:  char._id,
        player_id:     null,
        ordeal_type:   'covenant_questionnaire',
        covenant:      sub.covenant,      // slug: 'carthian', 'crone', etc.
        submitted_at:  sub.submitted_at || null,
        source:        'google_form',
        responses:     buildResponses(qRef, sub.answers),
        marking:       blankMarking(),
      });
      console.log(`  [OK] ${sub.character_name} (${sub.covenant})`);
      ok++;
    }
    console.log(`  ${ok} imported, ${data.submissions.length - ok} skipped`);
  }

  // ── Character Histories ─────────────────────────────────────────────────────
  console.log('\n--- Character Histories ---');
  {
    const docs = readJson('character_histories.json');
    let ok = 0;
    for (const sub of docs) {
      const char = resolveChar(sub.character_name, lookup);
      if (!char) { unmatched.push({ type: 'character_history', name: sub.character_name }); continue; }
      allDocs.push({
        character_id:  char._id,
        player_id:     null,
        ordeal_type:   'character_history',
        covenant:      null,
        submitted_at:  sub.submitted_at || null,
        source:        'google_form',
        responses:     [{ question: 'Character History', answer: sub.history_text || '' }],
        marking:       blankMarking(),
      });
      console.log(`  [OK] ${sub.character_name}`);
      ok++;
    }
    console.log(`  ${ok} imported, ${docs.length - ok} skipped`);
  }

  if (unmatched.length) {
    console.log('\n[UNMATCHED] No character found for:');
    for (const u of unmatched) console.log(`  [${u.type}] "${u.name}"`);
  }

  // ── Write ────────────────────────────────────────────────────────────────────
  if (!DRY_RUN && allDocs.length) {
    // Upsert each doc by (character_id, ordeal_type) — preserves existing marking progress
    let upserted = 0;
    for (const doc of allDocs) {
      const result = await col.updateOne(
        { character_id: doc.character_id, ordeal_type: doc.ordeal_type },
        { $setOnInsert: doc },  // only write if no existing doc — preserves marking
        { upsert: true }
      );
      if (result.upsertedCount) upserted++;
    }
    await col.createIndex({ character_id: 1, ordeal_type: 1 });
    console.log(`\nUpserted ${upserted} new, ${allDocs.length - upserted} already existed (marking preserved).`);
  } else if (!DRY_RUN) {
    console.log('\nNothing to import.');
  } else {
    console.log(`\n[DRY RUN] Would upsert ${allDocs.length} documents.`);
  }

  // ── Seed ordeal_rubrics ──────────────────────────────────────────────────────
  console.log('\n--- Ordeal Rubrics ---');
  if (!DRY_RUN) {
    const rubricCol = db.collection('ordeal_rubrics');
    const existing  = await rubricCol.countDocuments();
    if (existing === 0) {
      const seed = readJson('ordeal_rubrics_seed.json');
      const rubricDocs = [
        { ordeal_type: 'lore_mastery',   covenant: null, questions: seed.lore_mastery },
        { ordeal_type: 'rules_mastery',  covenant: null, questions: seed.rules_mastery },
        ...seed.covenant_questionnaire.map(b => ({
          ordeal_type: 'covenant_questionnaire',
          covenant:    b.covenant,
          questions:   b.questions,
        })),
      ];
      await rubricCol.insertMany(rubricDocs);
      console.log(`  Seeded ${rubricDocs.length} rubric documents.`);
    } else {
      console.log(`  Already seeded (${existing} docs) — skipping.`);
    }
  } else {
    console.log('  [DRY RUN] Would seed rubrics if empty.');
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n=== Done ===');
  console.log(`Total documents prepared: ${allDocs.length}`);
  console.log(`Unmatched: ${unmatched.length}`);

  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
