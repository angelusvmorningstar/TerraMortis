// align-app-questions.mjs — sync the PLAYER-FACING ordeal question labels (TM Suite app) to the rubric
// corrections in _rubric-corrections.json. Companion to fix-rubric.mjs: that fixes the GRADING side
// (ordeal_rubrics), this fixes the player-facing side (public/js/tabs/<type>-data.js) so a reworded
// question stays in sync across both. No database — edits the app source file only.
//
// For each correction that has `set.question`, it finds the matching `{ key:'q<N>', label:'...' }` entry
// in the mapped data file and replaces the label. Labels are single-quoted JS strings with `\'`
// escaping, so it matches/escapes accordingly. IDEMPOTENT: only rewrites a label that actually differs.
//
// SAFETY: dry-run by default (prints before/after), --apply to write the file(s).
//
//   Dry run:  node server/scripts/align-app-questions.mjs
//   Apply:    node server/scripts/align-app-questions.mjs --apply

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const APPLY = process.argv.includes('--apply');

// ordeal_type -> player-facing question data file (the label the player sees on the form).
const FILES = {
  rules_mastery: 'public/js/tabs/rules-data.js',
  lore_mastery: 'public/js/tabs/lore-data.js',
  covenant_questionnaire: 'public/js/tabs/covenant-data.js',
  character_history: 'public/js/tabs/history-data.js',
};

// single-quoted JS string helpers
const jsUnescape = (s) => s.replace(/\\(['\\])/g, '$1'); // \' -> ' , \\ -> \
const jsEscape = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

let corrections;
try { corrections = JSON.parse(readFileSync(join(__dirname, '_rubric-corrections.json'), 'utf8')); }
catch (e) { console.error('Could not read _rubric-corrections.json:', e.message); process.exit(1); }
corrections = corrections.filter((c) => c.set && typeof c.set.question === 'string');

console.log(`\n=== Align app question labels — ${APPLY ? 'APPLY (writing files)' : 'DRY RUN (no writes)'} ===`);
console.log(`question-text corrections in scope: ${corrections.length}\n`);

let nChanged = 0, nAlready = 0, nMissing = 0;
const fileCache = new Map(); // abs -> content (accumulate multiple edits to one file)

for (const c of corrections) {
  const rel = FILES[c.ordeal_type];
  const tag = `${c.ordeal_type} q${c.question_number}`;
  if (!rel) { console.log(`-- ${tag}: no app file mapped -- skipped`); nMissing++; continue; }
  const abs = join(ROOT, rel);
  if (!fileCache.has(abs)) {
    try { fileCache.set(abs, readFileSync(abs, 'utf8')); }
    catch { console.log(`-- ${tag}: ${rel} not readable -- skipped`); nMissing++; continue; }
  }
  const content = fileCache.get(abs);
  // { key: 'qN', label: '<single-quoted, \' escaped>' }
  const re = new RegExp(`(key:\\s*'q${c.question_number}'\\s*,\\s*label:\\s*)'((?:[^'\\\\]|\\\\.)*)'`);
  const m = content.match(re);
  if (!m) { console.log(`-- ${tag}: q${c.question_number} label not found in ${rel} -- skipped`); nMissing++; continue; }

  const curRaw = jsUnescape(m[2]);
  const newRaw = c.set.question;
  if (curRaw === newRaw) { console.log(`== ${tag}: already matches -- no change`); nAlready++; continue; }

  console.log(`++ ${tag} in ${rel}`);
  console.log(`   before: ${curRaw}`);
  console.log(`   after : ${newRaw}`);
  fileCache.set(abs, content.replace(re, (_, g1) => `${g1}'${jsEscape(newRaw)}'`));
  nChanged++;
}

if (APPLY && nChanged) {
  for (const [abs, content] of fileCache) writeFileSync(abs, content);
  console.log(`\n-> wrote ${nChanged} change(s). Commit + deploy the app for players to see it.`);
}
console.log(`\nSummary: ${nChanged} ${APPLY ? 'written' : 'to change'}, ${nAlready} already current, ${nMissing} skipped/missing.`);
if (!APPLY && nChanged) console.log('Re-run with --apply to write the file(s).');
