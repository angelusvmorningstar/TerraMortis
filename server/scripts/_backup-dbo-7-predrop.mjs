// _backup-dbo-7-predrop.mjs — Story dbo-7, pre-trim/pre-drop safety snapshot.
//
// Same standing convention as dbo-5/dbo-6's own pre-drop backups
// (server/scripts/_backups/dbo-5-6-predrop-*.json): dump the FULL live
// contents of both collections this story's destructive scripts touch, to a
// timestamped local JSON file, before either _trim-31-4-character-dossier.mjs
// or _drop-31-5-archive-documents.mjs is ever run with --write. Read-only -
// this script itself never writes to tm_game.
//
//   node server/scripts/_backup-dbo-7-predrop.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(HERE, '..', '..', '.env') });

const SUITE_DB_NAME = process.env.MONGODB_DB || 'tm_game';
const COLLECTIONS = ['character_dossier', 'archive_documents'];
const BACKUP_DIR = path.resolve(HERE, '_backups');

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(SUITE_DB_NAME);

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

try {
  for (const collection of COLLECTIONS) {
    const docs = await db.collection(collection).find({}).toArray();
    const file = path.join(BACKUP_DIR, `dbo-7-predrop-${collection}-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify(docs, null, 2));
    console.log(`  backed up ${SUITE_DB_NAME}.${collection}: ${docs.length} document(s) -> ${file}`);
  }
  console.log('\nDone. Safe to proceed with the trim/drop scripts.');
} finally {
  await client.close();
}
