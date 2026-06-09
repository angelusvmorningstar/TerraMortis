/**
 * merge-attendance.js
 *
 * Collapses fragmented attendance for Games 1-3 to one entry per character,
 * all keyed by the current character_id.
 *
 * Resolution logic is copied verbatim from preview-attendance-merge.js
 * (which was validated against live data before this script was written).
 *
 * Per-game policy:
 *   Game 1  — payment/attendance from current-id (re-entered) population.
 *             Every attended entry gets costuming=true, downtime=true.
 *   Games 2/3 — all fields from richest (legacy) entry; relinked to current id.
 *   All games — attended=true if ANY source says so; paid derived from method.
 *
 * Run: node --env-file=../.env scripts/merge-attendance.js          (dry run)
 *      node --env-file=../.env scripts/merge-attendance.js --apply  (write)
 */

import { MongoClient, ObjectId } from 'mongodb';

const DRY_RUN  = !process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }

const DB_NAME    = 'tm_suite';
const GAME4_ID   = new ObjectId('69e998779061c095792fd40c'); // must NOT be touched
const PAID_METHODS = new Set(['cash', 'payid', 'paypal', 'transfer']);

// ── Name resolution helpers (verbatim from preview-attendance-merge.js) ──────

const MANUAL_NAME_MAP = {
  'julia':      'Julia Dolancia',
  'lady julia': 'Julia Dolancia',
};

function normaliseMethod(raw) {
  if (!raw) return { value: '', flag: null };
  const s = String(raw).trim().toLowerCase();
  if (s === 'cash')                return { value: 'cash',     flag: null };
  if (s.startsWith('payid'))       return { value: 'payid',    flag: null };
  if (s.startsWith('paypal'))      return { value: 'paypal',   flag: null };
  if (s.startsWith('exiles'))      return { value: 'exiles',   flag: null };
  if (s.startsWith('transfer'))    return { value: 'transfer', flag: null };
  if (s.startsWith('waived'))      return { value: 'waived',   flag: null };
  return { value: '', flag: `UNKNOWN: "${raw}"` };
}

function buildResolver(chars) {
  const byId     = new Map(chars.map(c => [String(c._id), c]));
  const byName   = new Map();
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
    if (nm && byName.has(nm))    return { c: byName.get(nm),    via: 'name' };
    if (nm && byMoniker.has(nm)) return { c: byMoniker.get(nm), via: 'moniker' };
    const mapped = MANUAL_NAME_MAP[nm] || MANUAL_NAME_MAP[dn];
    if (mapped) {
      const c = chars.find(x => x.name === mapped);
      if (c) return { c, via: 'manual-map' };
    }
    return { c: null, via: null };
  };
}

// ── Field-merge policy (verbatim from preview-attendance-merge.js:95-128) ───

const richness = e =>
  (e.attended ? 1 : 0) + (e.costuming ? 1 : 0) + (e.downtime ? 1 : 0) +
  ((e.payment?.method || e.payment_method) ? 1 : 0) + (Number(e.extra) || 0);

function mergeFields(gameNumber, entries) {
  const idEntry = entries.find(x => x.via === 'id')?.e;
  const base    = [...entries].map(x => x.e).sort((a, b) => richness(b) - richness(a))[0];
  const attended = entries.some(x => x.e.attended);

  if (gameNumber === 1) {
    const pay = idEntry || base;
    const { value, flag } = normaliseMethod(pay.payment?.method || pay.payment_method || '');
    return {
      attended,
      costuming: attended ? true : !!base.costuming,
      downtime:  attended ? true : !!base.downtime,
      extra:     Math.max(...entries.map(x => Number(x.e.extra) || 0)),
      method:    value,
      flag,
    };
  } else {
    const { value, flag } = normaliseMethod(base.payment?.method || base.payment_method || '');
    return {
      attended,
      costuming: !!base.costuming,
      downtime:  !!base.downtime,
      extra:     Number(base.extra) || 0,
      method:    value,
      flag,
    };
  }
}

// ── Build write-ready attendance entry ───────────────────────────────────────

function buildEntry(c, merged, sessionRate) {
  const amount = PAID_METHODS.has(merged.method) ? (sessionRate || 0) : 0;
  return {
    character_id:      String(c._id),
    character_name:    c.name,
    character_display: c.moniker || c.name,
    name:              c.name,           // kept for admin grid fallback
    display_name:      c.moniker || c.name,
    player:            c.player || '',
    attended:          merged.attended,
    costuming:         merged.costuming,
    downtime:          merged.downtime,
    extra:             merged.extra,
    payment: {
      method: merged.method,
      amount,
    },
    payment_method: merged.method,       // kept for admin tab compat
    paid:           PAID_METHODS.has(merged.method),
  };
}

// ── Per-session processor ────────────────────────────────────────────────────

async function processGame(db, gameNumber, chars, sessionRate) {
  const resolve = buildResolver(chars);
  const s = await db.collection('game_sessions').findOne({ game_number: gameNumber });
  if (!s) { console.error(`ABORT: Game ${gameNumber} not found`); process.exit(1); }

  // Guard: never touch Game 4
  if (String(s._id) === String(GAME4_ID)) {
    console.error('ABORT: Attempted to process Game 4 — this is forbidden.'); process.exit(1);
  }

  const att = s.attendance || [];
  const rate = s.session_rate ?? sessionRate ?? 0;

  // Group by resolved character
  const groups   = new Map();
  const unresolved = [];
  for (const e of att) {
    const { c, via } = resolve(e);
    if (!c) { unresolved.push(e); continue; }
    const key = String(c._id);
    if (!groups.has(key)) groups.set(key, { c, entries: [] });
    groups.get(key).entries.push({ e, via });
  }

  if (unresolved.length) {
    console.error(`ABORT: Game ${gameNumber} has ${unresolved.length} unresolved entries:`);
    unresolved.forEach(e => console.error(`  name="${e.name || e.character_name || '?'}" id=${e.character_id}`));
    process.exit(1);
  }

  // Build merged array
  const mergedArr = [];
  const flags = [];
  for (const { c, entries } of groups.values()) {
    const merged = mergeFields(gameNumber, entries);
    if (merged.flag) flags.push(`${c.name}: ${merged.flag}`);
    mergedArr.push(buildEntry(c, merged, rate));
  }

  // Safety checks
  const idSet = new Set(mergedArr.map(e => e.character_id));
  if (idSet.size !== mergedArr.length) {
    console.error('ABORT: Merged array has duplicate character_ids — logic error.'); process.exit(1);
  }
  if (mergedArr.length > att.length) {
    console.error('ABORT: Merged array is larger than original — logic error.'); process.exit(1);
  }

  // Summary
  const label = `Game ${gameNumber} — ${s.session_date}`;
  const dupsBefore = att.length - groups.size;

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] ${label}`);
    console.log(`  Before: ${att.length} entries  After: ${mergedArr.length} entries  Collapse: ${dupsBefore}`);
    console.log(`  Unresolved: 0  Flags: ${flags.length}`);
    flags.forEach(f => console.log(`    ⚠ ${f}`));
    const attended  = mergedArr.filter(e => e.attended).length;
    const costumed  = mergedArr.filter(e => e.costuming).length;
    const downtime  = mergedArr.filter(e => e.downtime).length;
    const paid      = mergedArr.filter(e => e.paid).length;
    console.log(`  Attended: ${attended}  Costuming: ${costumed}  Downtime: ${downtime}  Paid: ${paid}`);
  } else {
    await db.collection('game_sessions').updateOne(
      { _id: s._id },
      { $set: { attendance: mergedArr } }
    );

    // Verify the write
    const updated = await db.collection('game_sessions').findOne({ _id: s._id }, { projection: { attendance: 1 } });
    const newAtt = updated.attendance || [];
    const idSetNew = new Set(newAtt.map(e => e.character_id));
    const unmatchedCount = newAtt.filter(e => !chars.some(c => String(c._id) === e.character_id)).length;
    const dupCount = newAtt.length - idSetNew.size;

    console.log(`\n[APPLY] ${label}`);
    console.log(`  Before: ${att.length} entries  After: ${newAtt.length} entries  Collapsed: ${dupsBefore}`);
    console.log(`  Unmatched (should be 0): ${unmatchedCount}`);
    console.log(`  Duplicates remaining (should be 0): ${dupCount}`);
    const attended  = newAtt.filter(e => e.attended).length;
    const costumed  = newAtt.filter(e => e.costuming).length;
    const downtime  = newAtt.filter(e => e.downtime).length;
    const paid      = newAtt.filter(e => e.paid).length;
    console.log(`  Attended: ${attended}  Costuming: ${costumed}  Downtime: ${downtime}  Paid: ${paid}`);

    if (unmatchedCount > 0 || dupCount > 0) {
      console.error('  ⚠ VERIFICATION FAILED — inspect data manually before proceeding.');
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const chars = await db.collection('characters')
    .find({}, { projection: { _id: 1, name: 1, moniker: 1, player: 1 } })
    .toArray();
  console.log(`${DRY_RUN ? '[DRY RUN]' : '[APPLY]'} Resolving against ${chars.length} character documents.\n`);

  for (const g of [1, 2, 3]) {
    await processGame(db, g, chars, 15);
  }

  if (DRY_RUN) {
    console.log('\nRun with --apply to execute.');
  } else {
    console.log('\nDone. Run audit-attendance-linkage.js to verify the final state.');
  }

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
