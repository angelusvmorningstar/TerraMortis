// Ordeal backup — READ-ONLY export. Dumps the collections the Rules pilot
// will write to, so every subsequent write is reversible at the DB level.
// Run from repo root:  node server/scripts/ordeal-backup.js
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
const client = new MongoClient(uri);
await client.connect();
const db = client.db('tm_suite');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = join(dirname(fileURLToPath(import.meta.url)), '_backups');
mkdirSync(dir, { recursive: true });

const dump = {
  taken_at: new Date().toISOString(),
  ordeal_rubrics:      await db.collection('ordeal_rubrics').find({}).toArray(),
  ordeal_submissions:  await db.collection('ordeal_submissions').find({}).toArray(),
  ordeal_responses:    await db.collection('ordeal_responses').find({}).toArray(),
  // only the ordeals[] field of each character — the XP-cascade target
  characters_ordeals:  await db.collection('characters')
    .find({}, { projection: { name: 1, moniker: 1, ordeals: 1 } }).toArray(),
};

const file = join(dir, `ordeal-backup-${stamp}.json`);
writeFileSync(file, JSON.stringify(dump, null, 2));
console.log('Backup written:', file);
console.log('Counts:', {
  rubrics: dump.ordeal_rubrics.length,
  submissions: dump.ordeal_submissions.length,
  responses: dump.ordeal_responses.length,
  characters: dump.characters_ordeals.length,
});
await client.close();
