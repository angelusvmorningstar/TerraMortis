// Rules-ordeal pilot audit — READ-ONLY. Counts backlog, finds the calibration
// set (already-complete Rules ordeals), and reports the ordeal_rubrics state.
// No writes. Run from repo root:  node server/scripts/ordeal-rules-audit.js
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set (expected in root .env)'); process.exit(1); }

const client = new MongoClient(uri);
await client.connect();
const db = client.db('tm_suite');

const out = {};

// ── ordeal_responses (portal form; type ∈ rules/lore/covenant) ──────────────
const resAll = await db.collection('ordeal_responses')
  .find({ $or: [{ type: 'rules' }, { ordeal_type: 'rules' }] })
  .project({ character_id: 1, player_id: 1, status: 1, marking: 1, responses: 1 })
  .toArray();

const respCount = r => r.responses
  ? (Array.isArray(r.responses) ? r.responses.length : Object.keys(r.responses).length)
  : 0;

out.ordeal_responses = {
  total: resAll.length,
  by_status: tally(resAll, r => r.status || '(none)'),
  by_marking_status: tally(resAll, r => r.marking?.status || '(unmarked)'),
  unreviewed_backlog: resAll
    .filter(r => r.status === 'submitted' && (r.marking?.status || 'pending') !== 'complete')
    .map(r => ({ id: String(r._id), character_id: String(r.character_id || ''), answers: respCount(r) })),
  complete_calibration: resAll
    .filter(r => r.marking?.status === 'complete' || r.status === 'approved')
    .map(r => ({ id: String(r._id), character_id: String(r.character_id || ''), answers: respCount(r) })),
};

// ── ordeal_submissions (CSV-import shape; ordeal_type = rules_mastery) ───────
const subAll = await db.collection('ordeal_submissions')
  .find({ ordeal_type: 'rules_mastery' })
  .project({ character_id: 1, player_id: 1, marking: 1, responses: 1 })
  .toArray();

out.ordeal_submissions = {
  total: subAll.length,
  by_marking_status: tally(subAll, s => s.marking?.status || '(unmarked)'),
  unreviewed_backlog: subAll
    .filter(s => (s.marking?.status || 'pending') !== 'complete')
    .map(s => ({ id: String(s._id), character_id: String(s.character_id || ''), answers: respCount(s) })),
  complete_calibration: subAll
    .filter(s => s.marking?.status === 'complete')
    .map(s => ({ id: String(s._id), character_id: String(s.character_id || ''), answers: respCount(s) })),
};

// ── ordeal_rubrics (is the Rules expected-answer key populated?) ─────────────
const rubric = await db.collection('ordeal_rubrics')
  .findOne({ ordeal_type: 'rules_mastery' });

if (rubric) {
  const qs = rubric.questions || rubric.expected_answers || [];
  const expectedOf = q => (q?.expected_answer ?? q?.expected ?? q?.answer ?? '').toString();
  out.ordeal_rubric = {
    found: true,
    title: rubric.title || '',
    question_count: qs.length,
    with_expected_answer: qs.filter(q => expectedOf(q).trim() && !expectedOf(q).startsWith('[PLACEHOLDER')).length,
    placeholder_or_empty: qs.filter(q => !expectedOf(q).trim() || expectedOf(q).startsWith('[PLACEHOLDER')).length,
  };
} else {
  out.ordeal_rubric = { found: false, note: 'No ordeal_rubrics doc with ordeal_type=rules_mastery' };
}

// ── existing per-answer result vocabulary in use (does 'close' exist?) ──────
const resultTally = {};
for (const r of [...resAll, ...subAll]) {
  for (const a of (r.marking?.answers || [])) {
    const v = a?.result || '(none)';
    resultTally[v] = (resultTally[v] || 0) + 1;
  }
}
out.existing_result_values = resultTally; // e.g. { yes: 40, close: 3, no: 12 } — if 'close' present, value rename needs a migration

// ── character.ordeals[] (the XP-cascade reader) ─────────────────────────────
const chars = await db.collection('characters')
  .find({ 'ordeals.name': { $regex: 'rule', $options: 'i' } })
  .project({ name: 1, moniker: 1, ordeals: 1 })
  .toArray();
out.characters_with_rules_ordeal = chars.map(c => ({
  name: c.moniker || c.name,
  rules_ordeals: (c.ordeals || []).filter(o => /rule/i.test(o.name || '')).map(o => ({ name: o.name, complete: !!o.complete })),
}));

console.log(JSON.stringify(out, null, 2));
await client.close();

function tally(arr, keyFn) {
  const m = {};
  for (const x of arr) { const k = keyFn(x); m[k] = (m[k] || 0) + 1; }
  return m;
}
