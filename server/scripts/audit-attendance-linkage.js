/**
 * audit-attendance-linkage.js  — READ ONLY. Makes no writes.
 *
 * Exposes the true shape of attendance data across all game_sessions:
 *   - character_id representation per entry (ObjectId vs string vs name)
 *   - within-session duplicates (same character appearing more than once)
 *   - linkage check: does each character_id match a real characters._id?
 *   - per-entry data completeness (attended / costuming / downtime / extra / payment / paid)
 *
 * Run: node --env-file=../.env scripts/audit-attendance-linkage.js
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }
const DB_NAME = 'tm_suite';

function idKind(v) {
  if (v == null) return 'null';
  if (typeof v === 'object' && v._bsontype === 'ObjectId') return 'ObjectId';
  if (typeof v === 'string') {
    if (/^[0-9a-fA-F]{24}$/.test(v)) return 'string-oid';
    return 'string-other';
  }
  return typeof v;
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  // Build a lookup of real character documents
  const chars = await db.collection('characters')
    .find({}, { projection: { _id: 1, name: 1, moniker: 1, player: 1, retired: 1 } })
    .toArray();
  const charIdSet = new Set(chars.map(c => String(c._id)));
  const charByName = new Map();
  for (const c of chars) {
    charByName.set((c.name || '').toLowerCase().trim(), c);
  }
  console.log(`characters collection: ${chars.length} documents\n`);

  const sessions = await db.collection('game_sessions').find({}).toArray();
  sessions.sort((a, b) => (a.game_number ?? 0) - (b.game_number ?? 0));

  const globalIdKinds = {};

  for (const s of sessions) {
    const att = s.attendance || [];
    console.log('='.repeat(72));
    console.log(`Game ${s.game_number ?? '?'} — ${s.session_date} — ${att.length} entries  (_id ${s._id})`);
    console.log('='.repeat(72));

    // Duplicate detection by character_name (case-insensitive)
    const byName = new Map();
    for (const e of att) {
      const key = (e.character_name || e.character_display || '(no name)').toLowerCase().trim();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(e);
    }
    const dups = [...byName.entries()].filter(([, arr]) => arr.length > 1);
    if (dups.length) {
      console.log(`\n  ⚠ ${dups.length} duplicated character name(s):`);
      for (const [name, arr] of dups) {
        console.log(`    "${name}" × ${arr.length}`);
        arr.forEach((e, i) => {
          console.log(`      [${i}] id=${idKind(e.character_id)} attended=${!!e.attended} cost=${!!e.costuming} dt=${!!e.downtime} extra=${e.extra ?? 0} paid=${!!e.paid} method=${e.payment?.method || e.payment_method || ''}`);
        });
      }
    } else {
      console.log('\n  No duplicate character names.');
    }

    // character_id representation tally + linkage
    const kinds = {};
    let unmatched = 0;
    const unmatchedNames = [];
    for (const e of att) {
      const k = idKind(e.character_id);
      kinds[k] = (kinds[k] || 0) + 1;
      globalIdKinds[k] = (globalIdKinds[k] || 0) + 1;
      const idStr = e.character_id != null ? String(e.character_id) : null;
      const matches = idStr && charIdSet.has(idStr);
      if (!matches) {
        unmatched++;
        unmatchedNames.push(`${e.character_name || e.character_display || '?'} (id=${idStr})`);
      }
    }
    console.log(`\n  character_id kinds: ${JSON.stringify(kinds)}`);
    console.log(`  entries whose character_id does NOT match any characters._id: ${unmatched}/${att.length}`);
    if (unmatched && unmatched <= 12) {
      unmatchedNames.forEach(n => console.log(`    - ${n}`));
    }

    // Completeness summary
    const attended = att.filter(e => e.attended).length;
    const costumed  = att.filter(e => e.costuming).length;
    const dt        = att.filter(e => e.downtime).length;
    const paid      = att.filter(e => e.paid).length;
    const withMethod = att.filter(e => (e.payment?.method || e.payment_method || '')).length;
    console.log(`\n  attended=${attended} costuming=${costumed} downtime=${dt} paid=${paid} hasPaymentMethod=${withMethod}`);
    console.log('');
  }

  console.log('='.repeat(72));
  console.log('GLOBAL character_id representation across all sessions:');
  console.log('  ' + JSON.stringify(globalIdKinds));
  console.log('='.repeat(72));

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
