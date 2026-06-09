/**
 * audit-attendance-populations.js  — READ ONLY.
 *
 * Dumps Game 1 and Game 2 attendance entry-by-entry to expose the two
 * id-populations: which entries match a current character._id, which carry
 * the rich data (costuming/payment), and whether the unmatched (legacy-id)
 * entries can be re-linked to a current character by player or name.
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }
const DB_NAME = 'tm_suite';

async function dumpGame(db, gameNumber) {
  const chars = await db.collection('characters')
    .find({}, { projection: { _id: 1, name: 1, player: 1 } }).toArray();
  const byId = new Map(chars.map(c => [String(c._id), c]));

  const s = await db.collection('game_sessions').findOne({ game_number: gameNumber });
  if (!s) { console.log(`Game ${gameNumber} not found`); return; }
  const att = s.attendance || [];

  console.log('\n' + '='.repeat(100));
  console.log(`GAME ${gameNumber} — ${s.session_date} — ${att.length} entries`);
  console.log('='.repeat(100));
  console.log('idx  match  rich  cost dt paid  extra  method            char_id                   name / player');
  console.log('-'.repeat(100));

  let matched = 0, unmatched = 0, rich = 0, thin = 0;
  for (let i = 0; i < att.length; i++) {
    const e = att[i];
    const idStr = e.character_id != null ? String(e.character_id) : '(none)';
    const hit = byId.get(idStr);
    const isMatch = !!hit;
    if (isMatch) matched++; else unmatched++;

    const method = e.payment?.method || e.payment_method || '';
    const isRich = !!(e.costuming || method || e.downtime);
    if (isRich) rich++; else thin++;

    const nameField = e.character_name || e.character_display || '';
    const resolved = hit ? hit.name : '';
    const player = e.player || (hit ? hit.player : '') || '';

    console.log(
      `${String(i).padStart(3)}  ${isMatch ? ' Y ' : ' . '}   ${isRich ? 'RICH' : 'thin'}  ` +
      `${e.costuming ? 'C' : '.'}   ${e.downtime ? 'D' : '.'}  ${e.paid ? 'P' : '.'}    ` +
      `${String(e.extra ?? 0)}     ${method.padEnd(16)}  ${idStr.padEnd(24)}  ` +
      `${(nameField || resolved || '?')} / ${player}`
    );
  }
  console.log('-'.repeat(100));
  console.log(`matched=${matched} unmatched=${unmatched} | rich=${rich} thin=${thin}`);

  // Cross-tabulate: do matched entries tend to be thin, unmatched rich?
  let matchRich = 0, matchThin = 0, unmatchRich = 0, unmatchThin = 0;
  for (const e of att) {
    const idStr = e.character_id != null ? String(e.character_id) : '(none)';
    const isMatch = byId.has(idStr);
    const method = e.payment?.method || e.payment_method || '';
    const isRich = !!(e.costuming || method || e.downtime);
    if (isMatch && isRich) matchRich++;
    else if (isMatch && !isRich) matchThin++;
    else if (!isMatch && isRich) unmatchRich++;
    else unmatchThin++;
  }
  console.log(`\n  Cross-tab (id-match × data-richness):`);
  console.log(`    matched + RICH:   ${matchRich}`);
  console.log(`    matched + thin:   ${matchThin}`);
  console.log(`    unmatched + RICH: ${unmatchRich}`);
  console.log(`    unmatched + thin: ${unmatchThin}`);
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  await dumpGame(db, 1);
  await dumpGame(db, 2);
  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
