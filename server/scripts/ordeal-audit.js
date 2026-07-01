// Generalised ordeal-pilot audit (READ-ONLY). Usage: node server/scripts/ordeal-audit.js <lore|rules|covenant>
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const SHORT = process.argv[2] || 'lore';
const LONG = { rules: 'rules_mastery', lore: 'lore_mastery', covenant: 'covenant_questionnaire' }[SHORT];
if (!LONG) { console.error('type must be rules|lore|covenant'); process.exit(1); }

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');
const tally = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});

const resAll = await db.collection('ordeal_responses')
  .find({ $or: [{ type: SHORT }, { ordeal_type: SHORT }] }).project({ character_id: 1, status: 1, marking: 1, responses: 1 }).toArray();
const respLen = r => r.responses ? (Array.isArray(r.responses) ? r.responses.length : Object.keys(r.responses).length) : 0;

const subAll = await db.collection('ordeal_submissions')
  .find({ ordeal_type: LONG }).project({ character_id: 1, character_name: 1, marking: 1, responses: 1 }).toArray();

const rubric = await db.collection('ordeal_rubrics').findOne({ ordeal_type: LONG });
const qs = rubric?.questions || [];
const expOf = q => (q?.expected_answer ?? '').toString();

const chars = await db.collection('characters')
  .find({ 'ordeals.name': { $regex: SHORT, $options: 'i' } }).project({ name: 1, moniker: 1, ordeals: 1 }).toArray();

console.log(JSON.stringify({
  type: { short: SHORT, long: LONG },
  ordeal_responses: {
    total: resAll.length,
    by_status: tally(resAll, r => r.status || '(none)'),
    by_marking: tally(resAll, r => r.marking?.status || '(unmarked)'),
    answer_lengths: resAll.map(r => ({ id: String(r._id), character_id: String(r.character_id || ''), n: respLen(r) })),
  },
  ordeal_submissions: {
    total: subAll.length,
    by_marking: tally(subAll, s => s.marking?.status || '(unmarked)'),
    chars: subAll.map(s => ({ id: String(s._id), name: s.character_name, n: respLen(s) })),
  },
  ordeal_rubric: rubric ? {
    found: true, question_count: qs.length,
    with_expected: qs.filter(q => expOf(q).trim() && !expOf(q).startsWith('[PLACEHOLDER')).length,
    placeholder_or_empty: qs.filter(q => !expOf(q).trim() || expOf(q).startsWith('[PLACEHOLDER')).length,
  } : { found: false },
  characters_complete: chars.map(c => ({ name: c.moniker || c.name, complete: (c.ordeals || []).some(o => new RegExp(SHORT, 'i').test(o.name) && o.complete) })),
}, null, 2));
await client.close();
