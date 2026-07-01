// READ-ONLY grading worksheet for ANY ordeal type. Pulls one submission's
// answers alongside the matching rubric key, aligned by rubric index and robust
// across the three response shapes (dense array, sparse array, q-keyed object).
// Usage:
//   node server/scripts/ordeal-grade-worksheet.js <submission _id>
//   node server/scripts/ordeal-grade-worksheet.js "<character name>" [rules|lore|covenant]
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const arg = process.argv[2] || 'Einar';
const TYPE = process.argv[3] || 'rules';
const LONG = { rules: 'rules_mastery', lore: 'lore_mastery', covenant: 'covenant_questionnaire' };

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');

const byId = /^[0-9a-f]{24}$/i.test(arg);
let sub = null, coll = 'ordeal_submissions';
if (byId) {
  sub = await db.collection('ordeal_submissions').findOne({ _id: new ObjectId(arg) });
  if (!sub) { sub = await db.collection('ordeal_responses').findOne({ _id: new ObjectId(arg) }); coll = 'ordeal_responses'; }
} else {
  sub = await db.collection('ordeal_submissions').findOne({ ordeal_type: LONG[TYPE], character_name: { $regex: arg, $options: 'i' } });
  if (!sub) { sub = await db.collection('ordeal_responses').findOne({ $or: [{ type: TYPE }, { ordeal_type: TYPE }] }); coll = 'ordeal_responses'; }
}
if (!sub) { console.log(`No submission matching "${arg}"`); process.exit(0); }

const rubricType = LONG[sub.ordeal_type || sub.type] || sub.ordeal_type || sub.type;
const rubricQuery = { ordeal_type: rubricType };
if (rubricType === 'covenant_questionnaire') {
  // Covenant is branch-conditional: pick the covenant-specific rubric via the
  // character's covenant (the submission itself may not carry one).
  let cov = sub.covenant;
  if (!cov && sub.character_id) {
    try { const ch = await db.collection('characters').findOne({ _id: new ObjectId(String(sub.character_id)) }, { projection: { covenant: 1 } }); cov = ch?.covenant; } catch {}
  }
  const covMap = { 'Carthian Movement': 'Carthian', 'Circle of the Crone': 'Circle', 'Invictus': 'Invictus', 'Lancea et Sanctum': 'Lancea' };
  const short = covMap[cov] || cov;
  if (short) rubricQuery.covenant = short;
  console.log(`(covenant: ${cov} -> rubric covenant ${short})`);
}
const rubric = await db.collection('ordeal_rubrics').findOne(rubricQuery);
if (!rubric) { console.log(`No rubric for ${JSON.stringify(rubricQuery)}`); process.exit(0); }

const qKey = (text) => {
  const t = String(text || '');
  const m = t.match(/^\s*(\d+)/);
  if (!m) return null;
  if (/\[\s*a/i.test(t)) return m[1] + 'a';
  if (/\[\s*b/i.test(t)) return m[1] + 'b';
  return m[1];
};
const rubricQs = (rubric.questions || []).slice().sort((a, b) => a.index - b.index);
const idxByKey = new Map(rubricQs.map(q => [qKey(q.question), q.index]));

const ansByIndex = new Map();
const r = sub.responses;
let shape;
if (Array.isArray(r)) {
  if (r.length === rubricQs.length) {
    shape = 'array/positional(dense)';
    r.forEach((e, i) => ansByIndex.set(rubricQs[i].index, e.answer));
  } else {
    shape = 'array/by-question-number(sparse)';
    for (const e of r) { const i = idxByKey.get(qKey(e.question)); if (i != null) ansByIndex.set(i, e.answer); }
  }
} else if (r && typeof r === 'object') {
  shape = 'object/q-keyed';
  for (const [k, v] of Object.entries(r)) {
    const m = String(k).match(/^q0*(\d+)/i);
    if (!m) continue;
    let kk = m[1];
    if (m[1] === '10' && /addiction|vitae/i.test(k)) kk = '10a';
    else if (m[1] === '10' && /bond/i.test(k)) kk = '10b';
    const i = idxByKey.get(kk);
    if (i != null) ansByIndex.set(i, v);
  }
}

const answeredCount = [...ansByIndex.values()].filter(v => String(v ?? '').trim()).length;
console.log(`SUBMISSION ${sub._id}  | character: ${sub.character_name || sub.character_id || '?'}  | type: ${rubricType}  | collection: ${coll}  | answered: ${answeredCount}  | pairing: ${shape}`);
console.log('='.repeat(80));
rubricQs.forEach((q) => {
  const scored = q.scored === false ? 'NON-SCORING' : 'scored';
  const ans = ansByIndex.get(q.index) ?? '';
  console.log(`\n[${q.index}] (${scored}) ${q.question || ''}`);
  console.log(`  EXPECTED: ${q.expected_answer || '(none)'}`);
  console.log(`  PLAYER:   ${ans.toString().trim() || '(no answer)'}`);
});
await client.close();
