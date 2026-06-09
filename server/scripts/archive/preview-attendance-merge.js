/**
 * preview-attendance-merge.js — READ ONLY. Makes no writes.
 *
 * Shows what a merge-and-relink would produce for Games 1-3: one entry per
 * character, keyed by the current character_id, with fields combined per the
 * agreed per-game policy. Flags anything that does not reconcile so it can be
 * reviewed before any data is changed.
 *
 * Policy:
 *   Game 1 — authoritative = current-id (re-entered) population.
 *            Rule: every attended entry gets costuming=true, downtime=true.
 *            Payment taken from the current-id entry.
 *   Game 2/3 — authoritative = legacy/rich (name-matched) population.
 *            costuming/downtime/extra/payment taken from it; relinked to current id.
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }
const DB_NAME = 'tm_suite';

// Names that do not match characters.name directly.
const MANUAL_NAME_MAP = {
  'julia': 'Julia Dolancia',
  'lady julia': 'Julia Dolancia',
};

function normaliseMethod(raw) {
  if (!raw) return { value: '', flag: null };
  const s = String(raw).trim().toLowerCase();
  if (s === 'cash') return { value: 'cash', flag: null };
  if (s.startsWith('payid')) return { value: 'payid', flag: null };
  if (s.startsWith('paypal')) return { value: 'paypal', flag: null };
  if (s.startsWith('exiles')) return { value: 'exiles', flag: null };
  if (s.startsWith('waived')) return { value: 'waived', flag: null };
  if (s.startsWith('transfer')) return { value: 'transfer', flag: null };
  if (s === 'transfer') return { value: 'transfer', flag: null };
  return { value: '??', flag: `UNKNOWN: "${raw}"` };
}

function buildResolver(chars) {
  const byId = new Map(chars.map(c => [String(c._id), c]));
  const byName = new Map();
  const byMoniker = new Map();
  for (const c of chars) {
    if (c.name)    byName.set(c.name.toLowerCase().trim(), c);
    if (c.moniker) byMoniker.set(c.moniker.toLowerCase().trim(), c);
  }
  return function resolve(entry) {
    const idStr = entry.character_id != null ? String(entry.character_id) : '';
    if (byId.has(idStr)) return { c: byId.get(idStr), via: 'id' };
    const nm = (entry.name || entry.character_name || '').toLowerCase().trim();
    const dn = (entry.display_name || entry.character_display || '').toLowerCase().trim();
    if (nm && byName.has(nm)) return { c: byName.get(nm), via: 'name' };
    if (nm && byMoniker.has(nm)) return { c: byMoniker.get(nm), via: 'moniker' };
    const mapped = MANUAL_NAME_MAP[nm] || MANUAL_NAME_MAP[dn];
    if (mapped) {
      const c = chars.find(x => x.name === mapped);
      if (c) return { c, via: 'manual-map' };
    }
    return { c: null, via: null };
  };
}

async function previewGame(db, gameNumber, chars) {
  const resolve = buildResolver(chars);
  const s = await db.collection('game_sessions').findOne({ game_number: gameNumber });
  if (!s) { console.log(`Game ${gameNumber} not found`); return; }
  const att = s.attendance || [];

  // Group entries by resolved character _id
  const groups = new Map(); // charId -> { c, entries: [] }
  const unresolved = [];
  for (const e of att) {
    const { c, via } = resolve(e);
    if (!c) { unresolved.push(e); continue; }
    const key = String(c._id);
    if (!groups.has(key)) groups.set(key, { c, entries: [] });
    groups.get(key).entries.push({ e, via });
  }

  console.log('\n' + '='.repeat(96));
  console.log(`GAME ${gameNumber} — ${s.session_date} — ${att.length} raw entries → ${groups.size} unique characters`);
  console.log('='.repeat(96));

  const flags = [];
  let dupCount = 0;
  console.log('character                          src  attnd cost dt extra  method      (xp)');
  console.log('-'.repeat(96));

  for (const { c, entries } of [...groups.values()].sort((a, b) => (a.c.name || '').localeCompare(b.c.name || ''))) {
    if (entries.length > 1) dupCount++;

    const idEntry = entries.find(x => x.via === 'id')?.e;
    // Richest entry per character = most complete data; used as the field source
    // so a thin duplicate can never mask a populated one (fixes Keeper).
    const richness = e => (e.attended ? 1 : 0) + (e.costuming ? 1 : 0) + (e.downtime ? 1 : 0)
      + ((e.payment?.method || e.payment_method) ? 1 : 0) + (Number(e.extra) || 0);
    const base = [...entries].map(x => x.e).sort((a, b) => richness(b) - richness(a))[0];
    const attended = entries.some(x => x.e.attended);   // attended if ANY source says so

    let merged;
    if (gameNumber === 1) {
      // Policy: attended ⇒ full base XP. Non-attendee keeps recorded flags
      // (a DT submission can grant downtime XP without attendance).
      // Payment authoritative from the re-entered (id) entry.
      const pay = idEntry || base;
      const { value, flag } = normaliseMethod(pay.payment?.method || pay.payment_method || '');
      if (flag) flags.push(`${c.name}: ${flag}`);
      merged = {
        attended,
        costuming: attended ? true : !!base.costuming,
        downtime:  attended ? true : !!base.downtime,
        extra: Math.max(...entries.map(x => Number(x.e.extra) || 0)),
        method: value,
      };
    } else {
      // Games 2/3: per-player recorded values from the richest entry; relink to current id.
      const { value, flag } = normaliseMethod(base.payment?.method || base.payment_method || '');
      if (flag) flags.push(`${c.name}: ${flag}`);
      merged = {
        attended,
        costuming: !!base.costuming,
        downtime: !!base.downtime,
        extra: Number(base.extra) || 0,
        method: value,
      };
    }

    const xp = (merged.attended ? 1 : 0) + (merged.costuming ? 1 : 0) + (merged.downtime ? 1 : 0) + merged.extra;
    const srcTag = entries.map(x => x.via[0]).join('+'); // e.g. "i+n" = id + name (a duplicate)
    console.log(
      `${(c.name || '?').slice(0, 32).padEnd(34)} ${srcTag.padEnd(4)} ` +
      `${merged.attended ? ' Y ' : ' . '}  ${merged.costuming ? 'C' : '.'}   ${merged.downtime ? 'D' : '.'}  ` +
      `${String(merged.extra).padEnd(5)}  ${merged.method.padEnd(10)}  (${xp})`
    );
  }

  console.log('-'.repeat(96));
  console.log(`Characters with >1 source entry (duplicates to collapse): ${dupCount}`);
  if (unresolved.length) {
    console.log(`\n  ⚠ UNRESOLVED entries (no character match): ${unresolved.length}`);
    unresolved.forEach(e => console.log(`    - name="${e.name || e.character_name || '?'}" id=${e.character_id}`));
  }
  if (flags.length) {
    console.log(`\n  ⚠ PAYMENT flags:`);
    [...new Set(flags)].forEach(f => console.log(`    - ${f}`));
  }
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const chars = await db.collection('characters')
    .find({}, { projection: { _id: 1, name: 1, moniker: 1 } }).toArray();
  console.log(`Resolving against ${chars.length} character documents.`);
  for (const g of [1, 2, 3]) await previewGame(db, g, chars);
  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
