#!/usr/bin/env node
/**
 * Fix #1013 — Indomitable merit missing rules_text.
 *
 * The #992 uplift script (uplift-power-rules-text.js) skipped Indomitable
 * with reason `multiple_book_sources` because the merit is defined in both
 * `Vampire the Requiem 2e Rulebook.md` and `Chronicles of Darkness Rulebook.md`.
 * The safety default is correct in general; for Indomitable the campaign
 * preference is unambiguous — the VtR 2e version names "Kindred Dominate"
 * specifically and is the campaign's canonical book.
 *
 * This one-off script writes rules_text and rules_source for the single
 * Indomitable purchasable_powers document, sourced from the VtR 2e block.
 * It reuses the uplift script's `loadAllBlocks` + `normalizeName` helpers
 * so parsing stays a single source of truth.
 *
 * Idempotent. Dry-run default; pass --apply to write.
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { loadAllBlocks, normalizeName } from './uplift-power-rules-text.js';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'tm_suite';

const TARGET_KEY = 'indomitable';
const PREFERRED_BOOK = 'VtR 2e Rulebook';

export function resolveBlock(blocks, targetName, preferredBook) {
  const norm = normalizeName(targetName);
  const candidates = blocks.filter(b => b.normName === norm && !b.isErrata);
  const preferred = candidates.find(b => b.book === preferredBook);
  return preferred || null;
}

async function main() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is not set. Run from server/ with server/.env in place.');
    process.exit(1);
  }
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${DB_NAME}`);
  console.log(`Target power: key=${TARGET_KEY}`);
  console.log(`Preferred book: ${PREFERRED_BOOK}\n`);

  const { allBlocks } = loadAllBlocks();
  const block = resolveBlock(allBlocks, 'Indomitable', PREFERRED_BOOK);
  if (!block) {
    console.error(`No ${PREFERRED_BOOK} block found for Indomitable. Aborting.`);
    process.exit(1);
  }
  const rulesText = block.rulesText;
  if (!rulesText || !rulesText.trim()) {
    console.error(`Resolved block has empty rulesText. Aborting.`);
    process.exit(1);
  }

  console.log(`Resolved block: ${block.book} (${block.file})`);
  console.log(`--- rules_text preview (${rulesText.length} chars) ---`);
  console.log(rulesText);
  console.log(`--- end preview ---\n`);

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000, tls: true });
  try {
    await client.connect();
    const col = client.db(DB_NAME).collection('purchasable_powers');

    const doc = await col.findOne(
      { key: TARGET_KEY },
      { projection: { key: 1, name: 1, rules_text: 1, rules_source: 1 } }
    );
    if (!doc) {
      console.error(`purchasable_powers.${TARGET_KEY} NOT FOUND — aborting`);
      process.exit(1);
    }

    const currentLen = (doc.rules_text || '').length;
    const currentSource = doc.rules_source || '(none)';
    console.log(`Current: rules_text=${currentLen} chars, rules_source=${currentSource}`);
    console.log(`New:     rules_text=${rulesText.length} chars, rules_source=${block.book}`);

    if (doc.rules_text === rulesText && doc.rules_source === block.book) {
      console.log('\nAlready correct — no write needed. Exiting.');
      return;
    }

    if (APPLY) {
      const res = await col.updateOne(
        { _id: doc._id },
        { $set: { rules_text: rulesText, rules_source: block.book } }
      );
      console.log(`\nWrote ${res.modifiedCount} doc(s).`);
    } else {
      console.log('\n[DRY RUN] Pass --apply to write.');
    }
  } finally {
    await client.close();
  }
}

const _invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (_invokedDirectly) {
  main().catch(err => { console.error(err); process.exit(1); });
}
