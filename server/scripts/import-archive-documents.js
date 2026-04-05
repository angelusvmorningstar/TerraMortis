#!/usr/bin/env node

// AR-1: Import dossiers, downtime responses, and history submissions into
// the archive_documents MongoDB collection as HTML.
//
// Usage: cd server && node scripts/import-archive-documents.js
// Re-run safe: upserts on { character_id, type, cycle } — re-converts and
// overwrites content_html on each run.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import mammoth from 'mammoth';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../../');
const PRIVATE   = path.join(ROOT, 'private');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

// ── Known name overrides ─────────────────────────────────────────────────────
// Maps normalised file stem → search term (name or moniker, lower-case).
// null = skip with warning.
const NAME_OVERRIDES = {
  'casimir cazz':           'cazz',
  'dr margaret kane':       'margaret kane',
  'charlie balsac':         'charlie ballsack',
  'charlie ballsack':       'charlie ballsack',
  'sister hazel':           'hazel',
  'rene meyer':             'rene meyer',        // DB has René — match via regex
  'rene st dominique':      'rene st',           // partial, avoids period
  'charles mercer willows': 'mercer',            // hyphen stripped in file
  'mac':                    'mac',               // moniker for Macheath
  'mammon':                 'mammon',
  'cazz':                   'cazz',
  'ludica':                 'ludica',
  'lothaire dubois':        null,        // never played — skip permanently
};

// ── History doc list (same as fix-history-worddocs.js) ───────────────────────
const HISTORY_DOCS = [
  { file: 'Carver - LS Lasombra Concept - Archer Witkowski.docx', charName: 'Carver' },
  { file: 'Edna Judge - Arlo Valmai.docx',                        charName: 'Edna Judge' },
  { file: 'René Meyer - Luca Venn - Luca Venn.docx',              charName: 'René Meyer' },
  { file: 'Story (Ryan Ambrose) - Battle-rite.docx',              charName: 'Ryan Ambrose' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseStem(stem) {
  return stem.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function convertDocx(filePath) {
  const result = await mammoth.convertToHtml({ path: filePath });
  // Strip empty paragraphs and base64 images
  let html = result.value
    .replace(/<img[^>]*>/gi, '')
    .replace(/<p><\/p>/g, '')
    .trim();
  return html;
}

function deaccent(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function resolveChar(db, searchTerm) {
  // Load all and match in JS so we can deaccent both sides
  const all = await db.collection('characters').find({}).toArray();
  const needle = deaccent(searchTerm).toLowerCase();
  return all.find(c => {
    const name    = deaccent(c.name    || '').toLowerCase();
    const moniker = deaccent(c.moniker || '').toLowerCase();
    return name.includes(needle) || moniker.includes(needle);
  }) || null;
}

async function upsertDoc(col, doc) {
  const filter = {
    character_id: doc.character_id,
    type:         doc.type,
    cycle:        doc.cycle ?? null,
  };
  await col.updateOne(filter, {
    $set:         { content_html: doc.content_html, title: doc.title, visible_to_player: doc.visible_to_player },
    $setOnInsert: { created_at: new Date().toISOString() },
  }, { upsert: true });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db  = client.db('tm_suite');
  const col = db.collection('archive_documents');

  const counts = { dossiers: 0, downtime: 0, histories: 0, skipped: 0, errors: 0 };

  // ── Dossiers ──────────────────────────────────────────────────────
  console.log('\n── Dossiers ──');
  const dossierDir = path.join(PRIVATE, 'dossiers');
  const dossierFiles = readdirSync(dossierDir).filter(f => f.endsWith('.docx'));

  for (const file of dossierFiles) {
    const stem = file.replace(/_Dossier\.docx$/i, '');
    const norm = normaliseStem(stem);

    let searchTerm = NAME_OVERRIDES.hasOwnProperty(norm) ? NAME_OVERRIDES[norm] : norm;
    if (searchTerm === null) {
      console.log(`[SKIP] ${file} — no matching character (known override)`);
      counts.skipped++;
      continue;
    }
    if (!NAME_OVERRIDES.hasOwnProperty(norm)) {
      // No override: use first token of the normalised name as a safe search
      searchTerm = norm.split(' ')[0];
      // But for multi-word names that should match exactly, just use norm
      searchTerm = norm;
    }

    const char = await resolveChar(db, searchTerm);
    if (!char) {
      console.log(`[SKIP] ${file} — no character found for "${searchTerm}"`);
      counts.skipped++;
      continue;
    }

    let html;
    try {
      html = await convertDocx(path.join(dossierDir, file));
    } catch (err) {
      console.log(`[ERROR] ${file}: ${err.message}`);
      counts.errors++;
      continue;
    }

    await upsertDoc(col, {
      character_id:      char._id,
      type:              'dossier',
      cycle:             null,
      title:             'Dossier',
      content_html:      html,
      visible_to_player: true,
    });
    console.log(`[OK] ${file} → ${char.name || char.moniker} (${html.length} chars)`);
    counts.dossiers++;
  }

  // ── Downtime 1 responses ──────────────────────────────────────────
  console.log('\n── Downtime 1 Responses ──');
  const downtimeDir = path.join(PRIVATE, 'downtime');
  const downtimeFiles = readdirSync(downtimeDir).filter(f => f.endsWith('.docx'));

  for (const file of downtimeFiles) {
    const stem = file.replace(/_Downtime1\.docx$/i, '');
    const norm = normaliseStem(stem);

    let searchTerm = NAME_OVERRIDES.hasOwnProperty(norm) ? NAME_OVERRIDES[norm] : norm;
    if (searchTerm === null) {
      console.log(`[SKIP] ${file} — no matching character (known override)`);
      counts.skipped++;
      continue;
    }

    const char = await resolveChar(db, searchTerm);
    if (!char) {
      console.log(`[SKIP] ${file} — no character found for "${searchTerm}"`);
      counts.skipped++;
      continue;
    }

    let html;
    try {
      html = await convertDocx(path.join(downtimeDir, file));
    } catch (err) {
      console.log(`[ERROR] ${file}: ${err.message}`);
      counts.errors++;
      continue;
    }

    await upsertDoc(col, {
      character_id:      char._id,
      type:              'downtime_response',
      cycle:             1,
      title:             'Downtime 1 Response',
      content_html:      html,
      visible_to_player: true,
    });
    console.log(`[OK] ${file} → ${char.name || char.moniker} (${html.length} chars)`);
    counts.downtime++;
  }

  // ── Character history Word docs ───────────────────────────────────
  console.log('\n── Character Histories ──');
  const historiesDir = path.join(PRIVATE, 'histories');

  for (const { file, charName } of HISTORY_DOCS) {
    const char = await resolveChar(db, charName);
    if (!char) {
      console.log(`[SKIP] ${file} — no character found for "${charName}"`);
      counts.skipped++;
      continue;
    }

    let html;
    try {
      html = await convertDocx(path.join(historiesDir, file));
    } catch (err) {
      console.log(`[ERROR] ${file}: ${err.message}`);
      counts.errors++;
      continue;
    }

    await upsertDoc(col, {
      character_id:      char._id,
      type:              'history_submission',
      cycle:             null,
      title:             'Character History',
      content_html:      html,
      visible_to_player: true,
    });
    console.log(`[OK] ${file} → ${char.name} (${html.length} chars)`);
    counts.histories++;
  }

  await client.close();

  console.log('\n── Summary ──');
  console.log(`Dossiers imported:         ${counts.dossiers}`);
  console.log(`Downtime responses:        ${counts.downtime}`);
  console.log(`History submissions:       ${counts.histories}`);
  console.log(`Skipped (no char match):   ${counts.skipped}`);
  console.log(`Errors:                    ${counts.errors}`);
  console.log('\nDone.');
}

run().catch(err => { console.error(err); process.exit(1); });
