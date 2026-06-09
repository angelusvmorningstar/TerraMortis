/**
 * Export all game sessions' attendance and payment data to Excel.
 * One sheet per game. Columns: Player, Character, Attended, Costuming, Downtime, Extra XP, Payment Method, Amount ($).
 *
 * Run: node server/scripts/export-attendance-xlsx.js
 * Output: TM_attendance_export.xlsx in the project root.
 */

import { MongoClient } from 'mongodb';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require   = createRequire(import.meta.url);
const XLSX      = require('../../node_modules/xlsx/xlsx.js');
const __dirname = dirname(fileURLToPath(import.meta.url));

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }

const DB_NAME  = 'tm_suite';
const OUT_PATH = join(__dirname, '../../TM_attendance_export.xlsx');

const METHOD_LABELS = {
  cash:   'Cash',
  payid:  'PayID',
  paypal: 'PayPal',
  exiles: 'Exiles (offset)',
  waived: 'Waived',
  '':     '— Not recorded',
};

function readPaymentMethod(entry) {
  // Support both new payment.method and legacy payment_method field.
  const method = entry?.payment?.method || entry?.payment_method || '';
  const amount = entry?.payment?.amount ?? (entry?.paid ? entry?.payment?.amount : 0) ?? 0;
  return { method, amount };
}

function sheetName(session, usedNames) {
  const parts = [];
  if (session.game_number != null) parts.push(`Game ${session.game_number}`);
  if (session.session_date)        parts.push(session.session_date);
  let base = parts.join(' — ').slice(0, 28);
  if (!base) base = String(session._id).slice(-6);
  let name = base;
  let n = 2;
  while (usedNames.has(name)) { name = `${base} (${n++})`; }
  usedNames.add(name);
  return name;
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const sessions = await db.collection('game_sessions')
    .find({})
    .sort({ game_number: 1 })
    .toArray();

  console.log(`Found ${sessions.length} session(s).`);

  const wb = XLSX.utils.book_new();
  const usedNames = new Set();

  for (const session of sessions) {
    // Skip sessions with no attendance entries (placeholder/test records)
    if (!session.attendance || session.attendance.length === 0) {
      console.log(`  Skipping empty session: game_number=${session.game_number ?? '—'} date=${session.session_date ?? '—'}`);
      continue;
    }

    const name = sheetName(session, usedNames);
    const attendance = (session.attendance || []).sort((a, b) => {
      const pa = (a.player || a.character_display || '').toLowerCase();
      const pb = (b.player || b.character_display || '').toLowerCase();
      return pa.localeCompare(pb);
    });

    const rows = [
      ['Player', 'Character', 'Attended', 'Costuming XP', 'Downtime XP', 'Extra XP', 'Total XP', 'Payment Method', 'Amount ($)'],
    ];

    let totalAttended = 0;
    let totalCollected = 0;

    for (const entry of attendance) {
      const { method, amount } = readPaymentMethod(entry);
      const attended   = entry.attended   ? 'Yes' : 'No';
      const costuming  = entry.costuming  ? 1 : 0;
      const downtime   = entry.downtime   ? 1 : 0;
      const extra      = Number(entry.extra) || 0;
      const attendXP   = entry.attended   ? 1 : 0;
      const totalXP    = attendXP + costuming + downtime + extra;
      const methodLabel = METHOD_LABELS[method] ?? method;

      if (entry.attended) totalAttended++;
      if (['cash', 'payid', 'paypal'].includes(method)) totalCollected += Number(amount) || 0;

      rows.push([
        entry.player || '',
        entry.character_display || entry.character_name || '',
        attended,
        costuming,
        downtime,
        extra,
        totalXP,
        methodLabel,
        Number(amount) || 0,
      ]);
    }

    // Summary row
    rows.push([]);
    rows.push(['', '', `${totalAttended} attended`, '', '', '', '', 'Total collected:', totalCollected]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
      { wch: 22 }, // Player
      { wch: 28 }, // Character
      { wch: 10 }, // Attended
      { wch: 13 }, // Costuming XP
      { wch: 13 }, // Downtime XP
      { wch: 10 }, // Extra XP
      { wch: 10 }, // Total XP
      { wch: 18 }, // Payment Method
      { wch: 12 }, // Amount
    ];

    XLSX.utils.book_append_sheet(wb, ws, name);
    console.log(`  Sheet "${name}": ${attendance.length} entries, ${totalAttended} attended, $${totalCollected} collected.`);
  }

  XLSX.writeFile(wb, OUT_PATH);
  console.log(`\nWritten to: ${OUT_PATH}`);
  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
