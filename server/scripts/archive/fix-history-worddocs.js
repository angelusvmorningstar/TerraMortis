#!/usr/bin/env node

// Fix character history entries for the 4 characters whose histories were
// submitted as Word documents. Overwrites the current ordeal_submissions
// character_history entry with the converted Word doc HTML.
//
// Usage: cd server && node scripts/fix-history-worddocs.js

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import mammoth from 'mammoth';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../../');
const PRIVATE   = path.join(ROOT, 'private', 'histories');

const HISTORY_DOCS = [
  { file: 'Carver - LS Lasombra Concept - Archer Witkowski.docx', charName: 'Carver' },
  { file: 'Edna Judge - Arlo Valmai.docx',                        charName: 'Edna Judge' },
  { file: 'René Meyer - Luca Venn - Luca Venn.docx',              charName: 'René Meyer' },
  { file: 'Story (Ryan Ambrose) - Battle-rite.docx',              charName: 'Ryan Ambrose' },
];

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

async function run() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db  = client.db('tm_suite');
  const col = db.collection('ordeal_submissions');

  for (const { file, charName } of HISTORY_DOCS) {
    const filePath = path.join(PRIVATE, file);

    // Resolve character
    const char = await db.collection('characters').findOne({
      $or: [
        { name:    { $regex: charName, $options: 'i' } },
        { moniker: { $regex: charName, $options: 'i' } },
      ],
    });
    if (!char) { console.log(`[SKIP] No character found for "${charName}"`); continue; }

    // Convert Word doc to HTML
    let html;
    try {
      const result = await mammoth.convertToHtml({ path: filePath });
      html = result.value.replace(/<p><\/p>/g, '').trim();
    } catch (err) {
      console.log(`[ERROR] ${file}: ${err.message}`);
      continue;
    }

    // Update the existing character_history entry
    const result = await col.updateOne(
      { character_id: char._id, ordeal_type: 'character_history' },
      { $set: {
          'responses.0.answer': html,
          source: 'word_doc',
      }},
    );

    if (result.matchedCount === 0) {
      console.log(`[SKIP] No ordeal_submission found for ${charName} — run the main import first`);
    } else {
      console.log(`[OK] ${charName} — updated with Word doc HTML (${html.length} chars)`);
    }
  }

  await client.close();
  console.log('\nDone.');
}

run().catch(err => { console.error(err); process.exit(1); });
