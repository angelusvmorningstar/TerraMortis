// Full database hard-backup — READ-ONLY. Dumps every collection in tm_suite to
// canonical Extended JSON (preserves ObjectId/Date types, cleanly restorable),
// one file per collection, in a timestamped folder OUTSIDE the git repo.
// Run from repo root:  node server/scripts/full-db-backup.js
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set (expected in root .env)'); process.exit(1); }

const client = new MongoClient(uri);
await client.connect();
const db = client.db('tm_suite');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
// One level above the repo, so branch switches / git clean can never touch it.
const outDir = join('D:/Terra Mortis/db-backups', `tm_suite-full-${stamp}`);
mkdirSync(outDir, { recursive: true });

const names = (await db.listCollections().toArray()).map(c => c.name).sort();
const manifest = { database: 'tm_suite', taken_at: new Date().toISOString(), format: 'canonical-ejson', collections: {} };

let totalDocs = 0;
for (const name of names) {
  const docs = await db.collection(name).find({}).toArray();
  writeFileSync(join(outDir, `${name}.json`), EJSON.stringify(docs, null, 2, { relaxed: false }));
  manifest.collections[name] = docs.length;
  totalDocs += docs.length;
  console.log(`${name.padEnd(28)} ${docs.length}`);
}

writeFileSync(join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nFull hard backup written to:\n  ${outDir}`);
console.log(`Collections: ${names.length} | Documents: ${totalDocs}`);
await client.close();
