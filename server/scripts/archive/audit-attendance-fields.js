/**
 * audit-attendance-fields.js — READ ONLY.
 * Dumps the full set of name-ish fields on each Game 1 / Game 2 attendance
 * entry, split by whether character_id matches a current character. Resolves
 * the question: do the unmatched (legacy-id) entries carry a `name` or
 * `display_name` that would let name-based matching (admin grid + game-xp)
 * link them to a current character?
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }
const DB_NAME = 'tm_suite';

async function dump(db, gameNumber) {
  const chars = await db.collection('characters')
    .find({}, { projection: { _id: 1, name: 1 } }).toArray();
  const idSet = new Set(chars.map(c => String(c._id)));
  const nameSet = new Set(chars.map(c => (c.name || '').toLowerCase().trim()));

  const s = await db.collection('game_sessions').findOne({ game_number: gameNumber });
  const att = s.attendance || [];

  console.log('\n' + '='.repeat(100));
  console.log(`GAME ${gameNumber} — ${att.length} entries — field inspection`);
  console.log('='.repeat(100));
  console.log('idx  idMatch  keys present (name-ish)                                   name-resolves?');
  console.log('-'.repeat(100));

  let unmatchedButNameResolves = 0, unmatchedNoResolve = 0;
  for (let i = 0; i < att.length; i++) {
    const e = att[i];
    const idStr = e.character_id != null ? String(e.character_id) : '(none)';
    const idMatch = idSet.has(idStr);

    const nm  = e.name ?? null;
    const cnm = e.character_name ?? null;
    const dn  = e.display_name ?? null;
    const cd  = e.character_display ?? null;

    const candidates = [nm, cnm, dn, cd].filter(Boolean).map(x => String(x).toLowerCase().trim());
    const nameResolves = candidates.some(x => nameSet.has(x));

    if (!idMatch) {
      if (nameResolves) unmatchedButNameResolves++; else unmatchedNoResolve++;
    }

    const parts = [];
    if (nm  != null) parts.push(`name="${nm}"`);
    if (cnm != null) parts.push(`character_name="${cnm}"`);
    if (dn  != null) parts.push(`display_name="${dn}"`);
    if (cd  != null) parts.push(`character_display="${cd}"`);
    const fieldStr = parts.length ? parts.join('  ') : '(no name fields)';

    // Only print the interesting rows: unmatched ones
    if (!idMatch) {
      console.log(`${String(i).padStart(3)}  ${idMatch ? ' Y ' : ' . '}     ${fieldStr.slice(0, 56).padEnd(56)}  ${nameResolves ? 'YES → ' + candidates.find(x => nameSet.has(x)) : 'NO'}`);
    }
  }
  console.log('-'.repeat(100));
  console.log(`Unmatched-by-id entries: name-resolves=${unmatchedButNameResolves}  no-resolve=${unmatchedNoResolve}`);

  // Also: full key set of one unmatched entry, for reference
  const sample = att.find(e => !idSet.has(String(e.character_id)));
  if (sample) {
    console.log(`\n  Sample unmatched entry, ALL keys: ${JSON.stringify(Object.keys(sample))}`);
  }
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  await dump(db, 1);
  await dump(db, 2);
  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
