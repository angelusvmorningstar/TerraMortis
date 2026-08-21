// fix-rubric.mjs — reusable, data-driven rubric corrections for ordeal_rubrics.
//
// Replaces the per-question one-offs. Reads corrections from _rubric-corrections.json and applies them
// to tm_suite.ordeal_rubrics, targeting each question by NUMBER (the leading "N." in its text) — NOT
// the array index, because a retired question makes index and number drift. IDEMPOTENT: only writes a
// field when the live value differs, so re-running is safe and shows what (if anything) is left to do.
//
// Corrections file shape: an array of
//   { ordeal_type, question_number, set:{ question?, expected_answer?, marking_notes? },
//     app_label_sync?, note? }
// Only `question`, `expected_answer`, `marking_notes` are ever written; any other keys in `set` are
// ignored. `app_label_sync` is a REMINDER printed when a question's TEXT changes (the player-facing
// label in public/js/tabs/rules-data.js must be kept in sync by hand).
//
// SAFETY: dry-run by default — prints a per-field before/after diff + the revert value, writes NOTHING.
// Pass --apply to commit. Scope it with --type=<ordeal_type> and/or --q=<number>.
//
//   Dry run (all):   node server/scripts/fix-rubric.mjs
//   One question:    node server/scripts/fix-rubric.mjs --type=rules_mastery --q=19
//   Apply:           node server/scripts/fix-rubric.mjs --apply

import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MongoClient } from 'mongodb';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const onlyType = (args.find((a) => a.startsWith('--type=')) || '').split('=')[1] || null;
const onlyQ = (args.find((a) => a.startsWith('--q=')) || '').split('=')[1];
const onlyQNum = onlyQ != null && onlyQ !== '' ? Number(onlyQ) : null;

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('No MONGODB_URI (root .env or env var).'); process.exit(1); }

const WRITABLE = ['question', 'expected_answer', 'marking_notes'];
const qnum = (q) => { const m = String(q.question || '').match(/^\s*(\d+)\./); return m ? +m[1] : null; };

let corrections;
try { corrections = JSON.parse(readFileSync(join(__dirname, '_rubric-corrections.json'), 'utf8')); }
catch (e) { console.error('Could not read _rubric-corrections.json:', e.message); process.exit(1); }

corrections = corrections.filter((c) =>
  (!onlyType || c.ordeal_type === onlyType) && (onlyQNum == null || c.question_number === onlyQNum));

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 10000 });
let nChanged = 0, nAlready = 0, nMissing = 0, nSyncReminders = 0;
try {
  await client.connect();
  const col = client.db(process.env.MONGODB_DB || 'tm_game').collection('ordeal_rubrics');
  console.log(`\n=== Rubric corrections — ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'} ===`);
  console.log(`corrections in scope: ${corrections.length}\n`);

  const rubricCache = new Map();
  for (const c of corrections) {
    if (!rubricCache.has(c.ordeal_type)) rubricCache.set(c.ordeal_type, await col.findOne({ ordeal_type: c.ordeal_type }));
    const rubric = rubricCache.get(c.ordeal_type);
    const tag = `${c.ordeal_type} Q${c.question_number}`;
    if (!rubric) { console.log(`-- ${tag}: rubric NOT FOUND -- skipped`); nMissing++; continue; }

    const pos = (rubric.questions || []).findIndex((q) => qnum(q) === c.question_number);
    if (pos < 0) { console.log(`-- ${tag}: question number not found -- skipped`); nMissing++; continue; }
    const q = rubric.questions[pos];

    const diffs = [];
    for (const f of WRITABLE) {
      if (!(f in (c.set || {}))) continue;
      const cur = q[f] ?? '';
      if (String(cur) !== String(c.set[f])) diffs.push({ f, before: cur, after: c.set[f] });
    }

    if (!diffs.length) { console.log(`== ${tag}: already matches -- no change${c.note ? '  (' + c.note + ')' : ''}`); nAlready++; continue; }

    console.log(`++ ${tag} (array idx ${q.index}, pos ${pos})${c.note ? '  -- ' + c.note : ''}`);
    for (const d of diffs) {
      console.log(`   [${d.f}]`);
      console.log(`     before: ${String(d.before).slice(0, 200)}`);
      console.log(`     after : ${String(d.after).slice(0, 200)}`);
    }
    if (diffs.some((d) => d.f === 'question') && c.app_label_sync) {
      console.log(`   ! APP SYNC: ${c.app_label_sync}`); nSyncReminders++;
    }

    if (APPLY) {
      const $set = {};
      for (const d of diffs) $set[`questions.${pos}.${d.f}`] = d.after;
      const res = await col.updateOne({ _id: rubric._id }, { $set });
      console.log(`   -> written (modified ${res.modifiedCount})`);
      rubricCache.delete(c.ordeal_type); // refetch next time so later corrections see fresh state
    }
    nChanged++;
    console.log('');
  }

  console.log(`\nSummary: ${nChanged} ${APPLY ? 'applied' : 'to change'}, ${nAlready} already current, ${nMissing} missing.`);
  if (nSyncReminders) console.log(`${nSyncReminders} question-text change(s) need the app label synced (see APP SYNC above).`);
  if (!APPLY && nChanged) console.log('Re-run with --apply to commit. Then re-run scripts/export-ordeals.mjs (cockpit).');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
