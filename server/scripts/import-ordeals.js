#!/usr/bin/env node

// OR-1: Import historical ordeal submissions into MongoDB.
//
// Sources:
//   private/ordeal_forms/*.xlsx  — Google Forms response exports (4 ordeal types + character details)
//   private/histories/*.docx     — 4 character history Word doc submissions
//
// Also seeds ordeal_rubrics collection from data/ordeal_rubrics_seed.json if empty.
// Existing Review Data tab comments are imported as draft markings.
//
// Usage:
//   cd server && node scripts/import-ordeals.js           (import all)
//   cd server && node scripts/import-ordeals.js --dry-run (log only, no writes)

import { readFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId } from 'mongodb';
import XLSX from 'xlsx';
import mammoth from 'mammoth';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const PRIVATE = path.join(ROOT, 'private');
const DATA = path.join(ROOT, 'data');

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('[DRY RUN] No writes will be made.\n');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

// ---------------------------------------------------------------------------
// Covenant column ranges within the Covenant Q sheet (0-indexed within allCols,
// where allCols = all columns after Timestamp, Email, CharacterName)
// Derived from block-start analysis: [0(shared Q1), 1(Carthian), 23(Circle), 45(Invictus), 67(Lancea)]
// ---------------------------------------------------------------------------
const COVENANT_BLOCKS = {
  'Carthian Movement': { start: 1, end: 23 },
  'Circle of the Crone': { start: 23, end: 45 },
  'Invictus': { start: 45, end: 67 },
  'Lancea et Sanctum': { start: 67, end: Infinity },
};

// ---------------------------------------------------------------------------
// Name normalisation helpers
// ---------------------------------------------------------------------------

// Known overrides: variations found in form data → canonical DB name fragment
const NAME_OVERRIDES = {
  // Mac/Macheath
  'mac': 'macheath',
  'macheath': 'macheath',
  // Mammon
  'mammon': 'yusuf',
  'yusuf mammon kalusicj': 'yusuf',
  'yusuf "mammon" kalusicj': 'yusuf',
  // Cazz — note DB spells it "Casamir" not "Casimir"
  'cazz': 'casamir',
  'casimir cazz': 'casamir',
  'casimir "cazz"': 'casamir',
  'casimir': 'casamir',
  // Sister Hazel
  'sister hazel': 'hazel',
  'hazel': 'hazel',
  // Jack Fallow
  'jack slick fallow': 'jack fallow',
  // Reed Justice
  'mr reed justice': 'reed justice',
  // René St. Dominique — common misspelling in forms
  'rene st. dominque': 'rené st. dominique',
  'rene st. dominique': 'rené st. dominique',
  // Charlie Ballsack — various spellings + stripped forms
  'charlie ballsack': 'charlie ballsack',
  'charlie balsac': 'charlie ballsack',
  'lord charles balsac': 'charlie ballsack',
  'charles balsac': 'charlie ballsack',
  // Conrad — strip middle name
  'conrad archibald sondergaard': 'conrad sondergaard',
  'inquisitor conrad archibald sondergaard': 'conrad sondergaard',
  // Charles Mercer-Willows — known as "Preacher Charles The Serpent Willows" in form
  'charles the serpent willows': 'charles mercer-willows',
  'preacher charles willows': 'charles mercer-willows',
  'charles willows': 'charles mercer-willows',
  // Don Ezzelino — not in DB, no mapping
};

const HONORIFICS = /^(lord|lady|doctor|dr|sister|sir|miss|mr|mrs|madam|don|preacher|inquisitor|rev|reverend)\s+/i;

function normaliseName(raw) {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();
  // Strip honorifics (may appear multiple times, e.g. "Inquisitor Lord")
  let prev;
  do { prev = s; s = s.replace(HONORIFICS, '').trim(); } while (s !== prev);
  // Strip curly/Unicode quotes and ASCII quotes around nicknames
  s = s.replace(/[\u2018\u2019\u201C\u201D'""][^\u2018\u2019\u201C\u201D'""\n]+[\u2018\u2019\u201C\u201D'""]/g, '').trim();
  // Strip parenthetical
  s = s.replace(/\(.*?\)/g, '').trim();
  // Collapse multiple spaces
  s = s.replace(/\s{2,}/g, ' ').trim();
  // Check override map (before and after middle-name stripping)
  if (NAME_OVERRIDES[s]) return NAME_OVERRIDES[s];
  // Try stripping middle name: "Conrad Archibald Sondergaard" → "Conrad Sondergaard"
  const words = s.split(' ');
  if (words.length === 3) {
    const firstLast = `${words[0]} ${words[2]}`;
    if (NAME_OVERRIDES[firstLast]) return NAME_OVERRIDES[firstLast];
  }
  return s;
}

function buildCharLookup(chars) {
  // Map normalised name fragments → character doc
  const map = new Map();
  for (const c of chars) {
    const names = [c.name, c.moniker].filter(Boolean);
    for (const n of names) {
      map.set(n.toLowerCase(), c);
      map.set(normaliseName(n), c);
    }
  }
  return map;
}

function resolveCharByName(raw, lookup) {
  if (!raw) return null;
  const norm = normaliseName(raw);
  // Direct lookup
  if (lookup.has(norm)) return lookup.get(norm);
  // Partial match: does any key start with the normalised name?
  for (const [key, char] of lookup) {
    if (key && norm && (key.startsWith(norm) || norm.startsWith(key))) return char;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Build email → character doc lookup from Character Details xlsx
// ---------------------------------------------------------------------------
function buildEmailLookup(charDetails, charLookup) {
  const map = new Map();
  for (const row of charDetails) {
    const email = row['Email Address']?.toLowerCase()?.trim();
    const charName = row['1. Character Name']?.trim();
    if (!email || !charName) continue;
    const char = resolveCharByName(charName, charLookup);
    if (char) {
      map.set(email, char);
    } else {
      console.log(`  [warn] Character Details: no DB match for "${charName}" (${email})`);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Load Excel sheet as array of row objects
// ---------------------------------------------------------------------------
function loadSheet(filePath, sheetName) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[sheetName || wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws);
}

function loadSheetRaw(filePath, sheetName) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[sheetName || wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1 });
}

// ---------------------------------------------------------------------------
// Build a flat responses array from a form row for simple ordeals
// (Lore Mastery, Rules Mastery, Character History)
// questions = string[] of question texts
// row = object with question text as key
// ---------------------------------------------------------------------------
function extractResponses(questions, row) {
  return questions.map(q => ({
    question: q.trim(),
    answer: (row[q] ?? '').toString().trim(),
  }));
}

// ---------------------------------------------------------------------------
// Covenant Q: extract only the relevant covenant's questions + shared Q1
// ---------------------------------------------------------------------------
function extractCovenantResponses(allHeaders, row, covenant) {
  const block = COVENANT_BLOCKS[covenant];
  if (!block) return [];

  // Shared Q1 is allHeaders[0]
  const sharedQ = allHeaders[0];
  const responses = [{ question: sharedQ.trim(), answer: (row[sharedQ] ?? '').toString().trim() }];

  // Covenant-specific questions
  const end = block.end === Infinity ? allHeaders.length : block.end;
  for (let i = block.start; i < end && i < allHeaders.length; i++) {
    const q = allHeaders[i];
    responses.push({ question: q.trim(), answer: (row[q] ?? '').toString().trim() });
  }
  return responses;
}

// ---------------------------------------------------------------------------
// Parse Review Data tab → Map<charName, markingAnswers[]>
// Returns { charName, answers: [{ question, answer, feedback }] }
// ---------------------------------------------------------------------------
function parseReviewData(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['Review Data'];
  if (!ws) return new Map();

  const rows = XLSX.utils.sheet_to_json(ws).filter(r => r['Character Name']);
  const byChar = new Map();

  for (const r of rows) {
    const name = r['Character Name']?.toString().trim();
    const question = r['Questions']?.toString().trim() ?? '';
    const answer = r['Response']?.toString().trim() ?? '';
    const feedback = r['Reviewer Comment']?.toString().trim() ?? '';
    if (!name) continue;
    if (!byChar.has(name)) byChar.set(name, []);
    byChar.get(name).push({ question, answer, feedback });
  }
  return byChar;
}

// ---------------------------------------------------------------------------
// Convert review data entries into marking.answers array
// Matches review entries to responses by question substring
// ---------------------------------------------------------------------------
function buildMarkingAnswers(responses, reviewEntries) {
  const answers = [];
  for (const entry of reviewEntries) {
    const idx = responses.findIndex(r =>
      r.question.includes(entry.question.slice(0, 40)) ||
      entry.question.includes(r.question.slice(0, 40))
    );
    answers.push({
      question_index: idx >= 0 ? idx : null,
      result: null,
      feedback: entry.feedback,
    });
  }
  return answers;
}

// ---------------------------------------------------------------------------
// Import a simple ordeal type (Lore Mastery, Rules Mastery, Character History)
// Returns { docs, reviewDocs } where reviewDocs are submissions built purely
// from Review Data for chars who didn't submit via the form
// ---------------------------------------------------------------------------
function importSimpleOrdeal({ rows, allHeaders, questions, emailLookup, charLookup, reviewByChar, ordealType }) {
  const stats = { imported: 0, skipped: 0, reviewOnly: 0 };
  const docs = [];
  const handledChars = new Set();

  for (const row of rows) {
    const email = row['Email Address']?.toLowerCase()?.trim();
    const char = emailLookup.get(email);
    if (!char) { stats.skipped++; continue; }

    const responses = extractResponses(questions, row);
    const timestamp = row['Timestamp'];
    const submittedAt = timestamp
      ? new Date(Math.round((timestamp - 25569) * 86400 * 1000)).toISOString()
      : new Date().toISOString();

    // Check for Review Data draft markings
    const charNameKeys = [char.name, char.moniker].filter(Boolean);
    let reviewEntries = [];
    for (const [rName, entries] of reviewByChar) {
      const norm = normaliseName(rName);
      if (charNameKeys.some(n => normaliseName(n) === norm || norm.includes(normaliseName(n)))) {
        reviewEntries = entries;
        reviewByChar.delete(rName); // mark as consumed
        break;
      }
    }

    const markingAnswers = reviewEntries.length > 0
      ? buildMarkingAnswers(responses, reviewEntries)
      : [];

    docs.push({
      character_id: char._id,
      player_id: null, // populated when Epic 5 players collection is built
      ordeal_type: ordealType,
      covenant: null,
      submitted_at: submittedAt,
      source: 'google_form',
      responses,
      marking: {
        status: markingAnswers.length > 0 ? 'in_progress' : 'unmarked',
        marked_by: null,
        marked_at: null,
        overall_feedback: '',
        xp_awarded: null,
        answers: markingAnswers,
      },
    });
    handledChars.add(char._id.toString());
    stats.imported++;
  }

  // Characters in Review Data who didn't have a form submission
  for (const [rName, entries] of reviewByChar) {
    if (entries.length === 0) continue;
    const char = resolveCharByName(rName, charLookup);
    if (!char) {
      console.log(`  [warn] Review Data (${ordealType}): no DB match for "${rName}"`);
      stats.skipped++;
      continue;
    }
    if (handledChars.has(char._id.toString())) continue;

    // Reconstruct responses from the review entries themselves
    const responses = entries.map(e => ({ question: e.question, answer: e.answer }));
    const markingAnswers = entries.map((e, i) => ({
      question_index: i,
      result: null,
      feedback: e.feedback,
    }));

    docs.push({
      character_id: char._id,
      player_id: null,
      ordeal_type: ordealType,
      covenant: null,
      submitted_at: null,
      source: 'google_form',
      responses,
      marking: {
        status: 'in_progress',
        marked_by: null,
        marked_at: null,
        overall_feedback: '',
        xp_awarded: null,
        answers: markingAnswers,
      },
    });
    stats.reviewOnly++;
  }

  return { docs, stats };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db('tm_suite');

  // Load characters
  const chars = await db.collection('characters').find({}, {
    projection: { _id: 1, name: 1, moniker: 1, honorific: 1, covenant: 1, player: 1 },
  }).toArray();
  const charLookup = buildCharLookup(chars);

  // Load Character Details form for email → character mapping
  const detailsPath = path.join(PRIVATE, 'ordeal_forms', 'Terra Mortis - Character Details (Responses).xlsx');
  const charDetails = loadSheet(detailsPath);
  const emailLookup = buildEmailLookup(charDetails, charLookup);
  console.log(`Built email lookup: ${emailLookup.size} known player emails`);

  const summary = {
    lore_mastery: { imported: 0, skipped: 0, reviewOnly: 0 },
    rules_mastery: { imported: 0, skipped: 0, reviewOnly: 0 },
    covenant_questionnaire: { imported: 0, skipped: 0, reviewOnly: 0 },
    character_history: { imported: 0, skipped: 0, reviewOnly: 0 },
    word_doc: { imported: 0, errors: 0 },
    rubrics: { seeded: false },
  };

  const allDocs = [];

  // -------------------------------------------------------------------------
  // Lore Mastery
  // -------------------------------------------------------------------------
  console.log('\n--- Lore Mastery ---');
  {
    const filePath = path.join(PRIVATE, 'ordeal_forms', 'Lore Mastery (Responses).xlsx');
    const rawHeaders = loadSheetRaw(filePath)[0];
    const questions = rawHeaders.slice(3).filter(Boolean);
    const rows = loadSheet(filePath);
    const reviewByChar = parseReviewData(filePath);
    const { docs, stats } = importSimpleOrdeal({
      rows, allHeaders: rawHeaders, questions, emailLookup, charLookup,
      reviewByChar, ordealType: 'lore_mastery',
    });
    console.log(`  Form: ${stats.imported} imported, ${stats.skipped} skipped (non-player)`);
    console.log(`  Review Data only: ${stats.reviewOnly} additional submissions reconstructed`);
    Object.assign(summary.lore_mastery, stats);
    allDocs.push(...docs);
  }

  // -------------------------------------------------------------------------
  // Rules Mastery
  // -------------------------------------------------------------------------
  console.log('\n--- Rules Mastery ---');
  {
    const filePath = path.join(PRIVATE, 'ordeal_forms', 'Rules Mastery (Responses).xlsx');
    const rawHeaders = loadSheetRaw(filePath)[0];
    const questions = rawHeaders.slice(3).filter(Boolean);
    const rows = loadSheet(filePath);
    const reviewByChar = parseReviewData(filePath);
    const { docs, stats } = importSimpleOrdeal({
      rows, allHeaders: rawHeaders, questions, emailLookup, charLookup,
      reviewByChar, ordealType: 'rules_mastery',
    });
    console.log(`  Form: ${stats.imported} imported, ${stats.skipped} skipped`);
    console.log(`  Review Data only: ${stats.reviewOnly} additional`);
    Object.assign(summary.rules_mastery, stats);
    allDocs.push(...docs);
  }

  // -------------------------------------------------------------------------
  // Covenant Questionnaire
  // -------------------------------------------------------------------------
  console.log('\n--- Covenant Questionnaire ---');
  {
    const filePath = path.join(PRIVATE, 'ordeal_forms', 'Covenant Questionnaire (Responses).xlsx');
    const rawRows = loadSheetRaw(filePath);
    const allHeaders = rawRows[0].slice(3).filter(Boolean);
    const rows = loadSheet(filePath);
    const reviewByChar = parseReviewData(filePath);
    let imported = 0, skipped = 0, reviewOnly = 0;
    const docs = [];
    const handledChars = new Set();

    for (const row of rows) {
      const charName = row['Character Name']?.toString().trim();
      const email = row['Email Address']?.toLowerCase()?.trim();
      const char = emailLookup.get(email) ?? resolveCharByName(charName, charLookup);
      if (!char) { skipped++; continue; }

      const covenant = char.covenant;
      const responses = extractCovenantResponses(allHeaders, row, covenant);
      const timestamp = row['Timestamp'];
      const submittedAt = timestamp
        ? new Date(Math.round((timestamp - 25569) * 86400 * 1000)).toISOString()
        : new Date().toISOString();

      let reviewEntries = [];
      const charNameKeys = [char.name, char.moniker].filter(Boolean);
      for (const [rName, entries] of reviewByChar) {
        const norm = normaliseName(rName);
        if (charNameKeys.some(n => normaliseName(n) === norm || norm.includes(normaliseName(n)))) {
          reviewEntries = entries;
          reviewByChar.delete(rName);
          break;
        }
      }

      docs.push({
        character_id: char._id,
        player_id: null,
        ordeal_type: 'covenant_questionnaire',
        covenant,
        submitted_at: submittedAt,
        source: 'google_form',
        responses,
        marking: {
          status: reviewEntries.length > 0 ? 'in_progress' : 'unmarked',
          marked_by: null,
          marked_at: null,
          overall_feedback: '',
          xp_awarded: null,
          answers: reviewEntries.length > 0
            ? buildMarkingAnswers(responses, reviewEntries)
            : [],
        },
      });
      handledChars.add(char._id.toString());
      imported++;
    }

    // Review Data only
    for (const [rName, entries] of reviewByChar) {
      if (!entries.length) continue;
      const char = resolveCharByName(rName, charLookup);
      if (!char || handledChars.has(char._id.toString())) continue;
      const responses = entries.map(e => ({ question: e.question, answer: e.answer }));
      docs.push({
        character_id: char._id,
        player_id: null,
        ordeal_type: 'covenant_questionnaire',
        covenant: char.covenant,
        submitted_at: null,
        source: 'google_form',
        responses,
        marking: {
          status: 'in_progress',
          marked_by: null,
          marked_at: null,
          overall_feedback: '',
          xp_awarded: null,
          answers: entries.map((e, i) => ({ question_index: i, result: null, feedback: e.feedback })),
        },
      });
      reviewOnly++;
    }

    console.log(`  Form: ${imported} imported, ${skipped} skipped`);
    console.log(`  Review Data only: ${reviewOnly} additional`);
    summary.covenant_questionnaire = { imported, skipped, reviewOnly };
    allDocs.push(...docs);
  }

  // -------------------------------------------------------------------------
  // Character History (form submissions — text and external links)
  // -------------------------------------------------------------------------
  console.log('\n--- Character History (form) ---');
  {
    const filePath = path.join(PRIVATE, 'ordeal_forms', 'Character History (Responses).xlsx');
    const rows = loadSheet(filePath);
    let imported = 0, skipped = 0;
    const docs = [];

    for (const row of rows) {
      const email = row['Email Address']?.toLowerCase()?.trim();
      const char = emailLookup.get(email);
      if (!char) { skipped++; continue; }

      const uploadOption = (row['Upload Option'] ?? '').toString().trim();
      const formOption = (row['Form Option'] ?? '').toString().trim();

      // Determine answer content and source note
      let answer = '';
      if (formOption) answer = formOption;
      else if (uploadOption) answer = `[Submitted via link: ${uploadOption}]`;

      const timestamp = row['Timestamp'];
      const submittedAt = timestamp
        ? new Date(Math.round((timestamp - 25569) * 86400 * 1000)).toISOString()
        : new Date().toISOString();

      docs.push({
        character_id: char._id,
        player_id: null,
        ordeal_type: 'character_history',
        covenant: null,
        submitted_at: submittedAt,
        source: 'google_form',
        responses: [{ question: 'Character History', answer }],
        marking: {
          status: 'unmarked',
          marked_by: null,
          marked_at: null,
          overall_feedback: '',
          xp_awarded: null,
          answers: [],
        },
      });
      imported++;
    }

    console.log(`  Form: ${imported} imported, ${skipped} skipped`);
    summary.character_history = { imported, skipped, reviewOnly: 0 };
    allDocs.push(...docs);
  }

  // -------------------------------------------------------------------------
  // Word doc history submissions (4 files)
  // -------------------------------------------------------------------------
  console.log('\n--- Character History (Word docs) ---');
  {
    const HISTORY_DOCS = [
      { file: 'Carver - LS Lasombra Concept - Archer Witkowski.docx', charName: 'Carver' },
      { file: 'Edna Judge - Arlo Valmai.docx', charName: 'Edna Judge' },
      { file: 'René Meyer - Luca Venn - Luca Venn.docx', charName: 'René Meyer' },
      { file: 'Story (Ryan Ambrose) - Battle-rite.docx', charName: 'Ryan Ambrose' },
    ];

    for (const { file, charName } of HISTORY_DOCS) {
      const filePath = path.join(PRIVATE, 'histories', file);
      if (!existsSync(filePath)) {
        console.log(`  [warn] Not found: ${file}`);
        summary.word_doc.errors++;
        continue;
      }
      const char = resolveCharByName(charName, charLookup);
      if (!char) {
        console.log(`  [warn] No DB match for "${charName}"`);
        summary.word_doc.errors++;
        continue;
      }

      try {
        const result = await mammoth.convertToHtml({ path: filePath });
        // Strip empty paragraphs from mammoth output
        const html = result.value.replace(/<p><\/p>/g, '').trim();
        allDocs.push({
          character_id: char._id,
          player_id: null,
          ordeal_type: 'character_history',
          covenant: null,
          submitted_at: null,
          source: 'word_doc',
          responses: [{ question: 'Character History', answer: html }],
          marking: {
            status: 'unmarked',
            marked_by: null,
            marked_at: null,
            overall_feedback: '',
            xp_awarded: null,
            answers: [],
          },
        });
        console.log(`  Converted: ${file}`);
        summary.word_doc.imported++;
      } catch (err) {
        console.log(`  [error] ${file}: ${err.message}`);
        summary.word_doc.errors++;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Write to MongoDB
  // -------------------------------------------------------------------------
  if (!DRY_RUN) {
    console.log('\n--- Writing to MongoDB ---');
    const col = db.collection('ordeal_submissions');
    await col.drop().catch(() => {}); // idempotent
    if (allDocs.length) {
      const result = await col.insertMany(allDocs);
      console.log(`  Inserted ${result.insertedCount} ordeal_submissions documents`);
      await col.createIndex({ character_id: 1, ordeal_type: 1 });
    }

    // Seed ordeal_rubrics if empty
    const rubricCol = db.collection('ordeal_rubrics');
    const existing = await rubricCol.countDocuments();
    if (existing === 0) {
      const seedPath = path.join(DATA, 'ordeal_rubrics_seed.json');
      if (existsSync(seedPath)) {
        const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
        const rubricDocs = [
          { ordeal_type: 'lore_mastery', covenant: null, questions: seed.lore_mastery },
          { ordeal_type: 'rules_mastery', covenant: null, questions: seed.rules_mastery },
          ...seed.covenant_questionnaire.map(b => ({
            ordeal_type: 'covenant_questionnaire',
            covenant: b.covenant,
            questions: b.questions,
          })),
        ];
        await rubricCol.insertMany(rubricDocs);
        console.log(`  Seeded ${rubricDocs.length} ordeal_rubrics documents`);
        summary.rubrics.seeded = true;
      }
    } else {
      console.log(`  ordeal_rubrics already seeded (${existing} docs) — skipping`);
    }
  } else {
    console.log(`\n[DRY RUN] Would insert ${allDocs.length} ordeal_submissions documents`);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n=== Summary ===');
  for (const [type, s] of Object.entries(summary)) {
    if (type === 'rubrics') {
      console.log(`  ordeal_rubrics: ${s.seeded ? 'seeded' : 'skipped (already exists)'}`);
    } else if (type === 'word_doc') {
      console.log(`  character_history (word_doc): ${s.imported} imported, ${s.errors} errors`);
    } else {
      console.log(`  ${type}: ${s.imported} form + ${s.reviewOnly} review-only imported, ${s.skipped} skipped`);
    }
  }
  console.log(`  Total documents: ${allDocs.length}`);

  await client.close();
  console.log('\nDone.');
}

run().catch(err => { console.error('Import failed:', err); process.exit(1); });
