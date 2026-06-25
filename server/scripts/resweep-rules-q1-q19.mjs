// resweep-rules-q1-q19.mjs — re-grade ONLY Q1 and Q19 of already-graded (complete) rules_mastery
// ordeals against the CORRECTED rubric keys (the old keys mis-scored them: Q1 wrongly required a
// Discipline in a mundane pool; Q19 conflated fear-frenzy with wound penalties). Suite ST-ops tool,
// same class as fix-rubric.mjs — ST-authorised, dry-run by default.
//
// TWO PHASES:
//   1) DUMP (default, READ-ONLY): pull every complete rules_mastery ordeal, align answers to the
//      rubric by question NUMBER, and print + write `_resweep-q1q19-dump.json` with each ordeal's
//      Q1/Q19 player answer + currently-stored verdict/feedback, plus the full marking for context.
//      I grade from this dump and author `_resweep-decisions.json`.
//   2) APPLY: read `_resweep-decisions.json` (the new verdicts), show a per-ordeal before/after diff
//      of marking.answers, and with --apply OVERWRITE the stored Q1/Q19 verdict+feedback in
//      tm_suite. Dry-run by default; --apply commits. Idempotent (writes only when the value differs).
//
//   Dump (read-only):   node server/scripts/resweep-rules-q1-q19.mjs
//   Apply dry-run:      node server/scripts/resweep-rules-q1-q19.mjs --apply-mode
//   Apply (writes):     node server/scripts/resweep-rules-q1-q19.mjs --apply-mode --apply
//
// SAFETY: phase 2 NEVER writes without --apply. It touches ONLY the marking.answers entries for the
// Q1 and Q19 rubric indices; it does not recompute XP/pass-fail (these ordeals are already complete —
// XP is per-completed-ordeal, not per-answer; the per-answer verdicts are the feedback record). The
// dump surfaces xp_awarded/status so any pass-fail concern is visible before applying.

import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MongoClient, ObjectId } from 'mongodb';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const args = process.argv.slice(2);
const APPLY_MODE = args.includes('--apply-mode');
const APPLY = args.includes('--apply');
const DUMP_OUT = join(__dirname, '_resweep-q1q19-dump.json');
const DECISIONS_IN = join(__dirname, '_resweep-decisions.json');

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('No MONGODB_URI (root .env or env var).'); process.exit(1); }

// ---- alignment (inlined from the canonical ordeal-grade-worksheet.js / cockpit align-ordeal.mjs) ----
function qKey(text) {
  const t = String(text || '');
  const m = t.match(/^\s*(\d+)/);
  if (!m) return null;
  if (/\[\s*a/i.test(t)) return m[1] + 'a';
  if (/\[\s*b/i.test(t)) return m[1] + 'b';
  return m[1];
}
function alignOrdeal(submission, rubric) {
  const rubricQs = (rubric?.questions || []).slice().sort((a, b) => a.index - b.index);
  const idxByKey = new Map(rubricQs.map((q) => [qKey(q.question), q.index]));
  const ansByIndex = new Map();
  const r = submission?.responses;
  if (Array.isArray(r)) {
    if (r.length === rubricQs.length) r.forEach((e, i) => ansByIndex.set(rubricQs[i].index, e?.answer));
    else for (const e of r) { const i = idxByKey.get(qKey(e?.question)); if (i != null) ansByIndex.set(i, e?.answer); }
  } else if (r && typeof r === 'object') {
    for (const [k, v] of Object.entries(r)) {
      const m = String(k).match(/^q0*(\d+)/i); if (!m) continue;
      let kk = m[1];
      if (m[1] === '10' && /addiction|vitae/i.test(k)) kk = '10a';
      else if (m[1] === '10' && /bond/i.test(k)) kk = '10b';
      const i = idxByKey.get(kk); if (i != null) ansByIndex.set(i, v);
    }
  }
  const existing = new Map();
  for (const a of submission?.marking?.answers || []) existing.set(a.question_index, a);
  const rows = [];
  for (const q of rubricQs) {
    if (q.scored === false) continue;
    const ans = ansByIndex.has(q.index) ? ansByIndex.get(q.index) : '';
    const ex = existing.get(q.index);
    rows.push({
      index: q.index, number: qKey(q.question), question: q.question || '',
      expected_answer: q.expected_answer || '',
      playerAnswer: (ans == null ? '' : String(ans)).trim(),
      existingResult: ex?.result || null, existingFeedback: ex?.feedback || '',
    });
  }
  return rows;
}

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 15000 });
try {
  await client.connect();
  const db = client.db('tm_suite');

  const rubric = await db.collection('ordeal_rubrics').findOne({ ordeal_type: 'rules_mastery' });
  if (!rubric) { console.error('No rules_mastery rubric found.'); process.exit(1); }
  // Rubric index for Q1 and Q19 (by NUMBER — robust to index/number drift).
  const idxOf = (num) => {
    const q = (rubric.questions || []).find((qq) => qKey(qq.question) === String(num));
    return q ? q.index : null;
  };
  const Q1 = idxOf(1), Q19 = idxOf(19);
  console.log(`Rubric indices -> Q1: ${Q1}, Q19: ${Q19}`);

  // Resolve character names (player-keyed responses lack character_name).
  const chars = await db.collection('characters').find({}, { projection: { _id: 1, name: 1, moniker: 1, honorific: 1, retired: 1 } }).toArray();
  const charName = new Map(chars.map((c) => [String(c._id), [c.honorific, c.moniker || c.name].filter(Boolean).join(' ')]));
  const retired = new Set(chars.filter((c) => c.retired === true).map((c) => String(c._id)));
  const players = await db.collection('players').find({}, { projection: { _id: 1, character_ids: 1 } }).toArray();
  const playerFirstChar = new Map(players.map((p) => [String(p._id), p.character_ids?.[0] ? String(p.character_ids[0]) : null]));
  const resolveCid = (d) => d.character_id ? String(d.character_id) : (d.player_id ? playerFirstChar.get(String(d.player_id)) : null);

  // Complete rules_mastery ordeals across both collections.
  const found = [];
  for (const [coll, typeVals] of [['ordeal_submissions', ['rules_mastery']], ['ordeal_responses', ['rules', 'rules_mastery']]]) {
    const docs = await db.collection(coll).find({ ordeal_type: { $in: typeVals }, 'marking.status': 'complete' }).toArray();
    for (const d of docs) found.push({ coll, d });
  }
  console.log(`Found ${found.length} complete rules_mastery ordeals.\n`);

  const dump = [];
  for (const { coll, d } of found) {
    const cid = resolveCid(d);
    const name = d.character_name || (cid && charName.get(cid)) || `(unresolved ${cid})`;
    const aligned = alignOrdeal(d, rubric);
    const row = (idx) => aligned.find((r) => r.index === idx) || null;
    const q1 = row(Q1), q19 = row(Q19);
    const entry = {
      _id: String(d._id), collection: coll, character: name, character_id: cid,
      retired: cid ? retired.has(cid) : null,
      status: d.marking?.status, xp_awarded: d.marking?.xp_awarded ?? d.xp_awarded ?? null,
      marking_answers_count: (d.marking?.answers || []).length,
      q1: q1 && { index: q1.index, playerAnswer: q1.playerAnswer, existingResult: q1.existingResult, existingFeedback: q1.existingFeedback },
      q19: q19 && { index: q19.index, playerAnswer: q19.playerAnswer, existingResult: q19.existingResult, existingFeedback: q19.existingFeedback },
      full_marking_answers: (d.marking?.answers || []).map((a) => ({ question_index: a.question_index, result: a.result, feedback: (a.feedback || '').slice(0, 80) })),
    };
    dump.push(entry);
    console.log(`### ${name}  [${coll} ${entry._id}]  status=${entry.status} xp=${entry.xp_awarded} answers=${entry.marking_answers_count}${entry.retired ? '  (RETIRED)' : ''}`);
    for (const [lbl, q] of [['Q1', q1], ['Q19', q19]]) {
      if (!q) { console.log(`   ${lbl}: (no aligned row)`); continue; }
      console.log(`   ${lbl} (idx ${q.index})  stored=${q.existingResult || 'YES(implicit/none)'}`);
      console.log(`      answer: ${q.playerAnswer.slice(0, 220) || '(blank)'}`);
      if (q.existingFeedback) console.log(`      old fb: ${q.existingFeedback.slice(0, 160)}`);
    }
    console.log('');
  }

  writeFileSync(DUMP_OUT, JSON.stringify({ generated_at: new Date().toISOString(), Q1_index: Q1, Q19_index: Q19,
    corrected_keys: { q1: rubric.questions.find((q) => qKey(q.question) === '1')?.expected_answer,
                      q19: rubric.questions.find((q) => qKey(q.question) === '19')?.expected_answer }, ordeals: dump }, null, 2));
  console.log(`Dump written -> ${DUMP_OUT}`);

  if (!APPLY_MODE) {
    console.log('\n(DUMP phase only. Author _resweep-decisions.json from this, then run with --apply-mode.)');
  } else {
    // ---- APPLY PHASE ----
    if (!existsSync(DECISIONS_IN)) { console.error(`\nNo ${DECISIONS_IN} — author it from the dump first.`); process.exit(1); }
    const decisions = JSON.parse(readFileSync(DECISIONS_IN, 'utf8'));
    // Scored rubric question indices (skip retired / scored:false) — for grandfather_all_yes.
    const scoredIndices = (rubric.questions || []).filter((q) => q.scored !== false).map((q) => q.index).sort((a, b) => a - b);
    console.log(`\n=== APPLY ${APPLY ? '(WRITING)' : '(DRY RUN)'} — ${decisions.length} decision(s) ===\n`);
    let nChanged = 0;
    for (const dec of decisions) {
      const coll = dec.collection;
      const doc = await db.collection(coll).findOne({ _id: new ObjectId(dec._id) });
      if (!doc) { console.log(`-- ${dec.character}: doc not found (${dec._id}) — skipped`); continue; }
      const answers = (doc.marking?.answers || []).slice();
      const findE = (idx) => answers.findIndex((a) => a.question_index === idx);

      // --- Grandfather: write an explicit YES for every scored question (all-correct record). ---
      if (dec.grandfather_all_yes) {
        const allYes = scoredIndices.map((idx) => ({ question_index: idx, result: 'yes', feedback: '' }));
        const existingNonYes = answers.filter((a) => a.result && a.result !== 'yes');
        const alreadyAllYes = answers.length === allYes.length && answers.every((a) => a.result === 'yes');
        console.log(`++ ${dec.character}  [${coll} ${dec._id}]  GRANDFATHER all-yes`);
        console.log(`   before: ${answers.length} answer entr${answers.length === 1 ? 'y' : 'ies'}${existingNonYes.length ? ` (incl ${existingNonYes.length} near/no — would be overwritten to yes)` : ''}`);
        console.log(`   after : ${allYes.length} entries, all 'yes' (scored questions ${scoredIndices[0]}..${scoredIndices[scoredIndices.length - 1]})`);
        if (alreadyAllYes) { console.log('   == already an explicit all-yes record — no change'); continue; }
        if (APPLY) {
          const res = await db.collection(coll).updateOne({ _id: new ObjectId(dec._id) }, { $set: { 'marking.answers': allYes } });
          console.log(`   -> written (modified ${res.modifiedCount})`);
        }
        nChanged++;
        console.log('');
        continue;
      }

      const plan = [];
      for (const [lbl, idx, d] of [['Q1', Q1, dec.q1], ['Q19', Q19, dec.q19]]) {
        if (!d || idx == null) continue;
        const pos = findE(idx);
        const before = pos >= 0 ? { result: answers[pos].result, feedback: answers[pos].feedback || '' } : { result: 'YES(none)', feedback: '' };
        const after = { result: d.result, feedback: d.feedback || '' };
        const same = String(before.result).toLowerCase().replace('yes(none)', 'yes') === String(after.result).toLowerCase() && (before.feedback || '') === (after.feedback || '');
        if (same) { console.log(`== ${dec.character} ${lbl}: already ${after.result} — no change`); continue; }
        plan.push({ lbl, idx, pos, before, after });
      }
      if (!plan.length) continue;
      console.log(`++ ${dec.character}  [${coll} ${dec._id}]`);
      for (const p of plan) {
        console.log(`   ${p.lbl} (idx ${p.idx}): ${p.before.result} -> ${p.after.result}`);
        if (p.after.feedback) console.log(`      fb: ${p.after.feedback.slice(0, 160)}`);
      }
      if (APPLY) {
        let next = answers.slice();
        for (const p of plan) {
          if (p.after.result === 'yes') {
            // finalized convention TBD from dump: by default upsert an explicit yes entry (no feedback).
            if (p.pos >= 0) next[p.pos] = { question_index: p.idx, result: 'yes', feedback: '' };
            else next.push({ question_index: p.idx, result: 'yes', feedback: '' });
          } else {
            const e = { question_index: p.idx, result: p.after.result, feedback: p.after.feedback || '' };
            if (p.pos >= 0) next[p.pos] = e; else next.push(e);
          }
        }
        const res = await db.collection(coll).updateOne({ _id: new ObjectId(dec._id) }, { $set: { 'marking.answers': next } });
        console.log(`   -> written (modified ${res.modifiedCount})`);
      }
      nChanged++;
      console.log('');
    }
    console.log(`Summary: ${nChanged} ordeal(s) ${APPLY ? 'written' : 'to change'}.`);
    if (!APPLY && nChanged) console.log('Re-run with --apply to commit. Then re-run cockpit scripts/export-ordeals.mjs.');
  }
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
