/**
 * migrate-dt1.js
 *
 * Import Downtime 1 historical data into MongoDB.
 *
 * Creates a downtime_cycles document for Downtime 1 (closed),
 * then inserts 26 submission documents mapped from TM_downtime1_submissions.json.
 *
 * Usage:
 *   node server/migrate-dt1.js           — dry run
 *   node server/migrate-dt1.js --apply   — write to MongoDB
 *   node server/migrate-dt1.js --apply --force — overwrite existing
 */

import 'dotenv/config';
import fs from 'fs';
import { MongoClient, ObjectId } from 'mongodb';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

const DRY_RUN = !process.argv.includes('--apply');
const FORCE   = process.argv.includes('--force');

// ── Character ID fixes — DT1 source had blank character_id for these ─────────
const CHAR_ID_FIXES = {
  'Charles Mercer-Willows': '69cf7da860b712b5eb996250',
  'Eve Lockridge':          '69cf7da860b712b5eb996256',
  'Ivana Horvat':           '69cf7da860b712b5eb996257',
  'Kirk Grimm':             '69cf7da860b712b5eb99625b',
  'Tegan Groves':           '69cf7da860b712b5eb996266',
};

// ── Cycle document ────────────────────────────────────────────────────────────
const DT1_CYCLE = {
  label:            'Downtime 1',
  game_number:      1,
  status:           'closed',
  loaded_at:        '2026-02-28T00:00:00.000Z',
  deadline_at:      null,
  closed_at:        '2026-03-13T23:59:59.000Z',
  submission_count: 26,
};

// ── Build published_outcome markdown from st_narrative ────────────────────────
function buildPublishedOutcome(raw) {
  const n  = raw.st_narrative || {};
  const fr = raw.feeding_review || {};
  const sections = [];

  // Feeding section — parsed by feeding history pane
  const feedLines = [];
  if (fr.method)       feedLines.push(fr.method);
  if (fr.dice_pool)    feedLines.push(fr.dice_pool);
  if (fr.territories && fr.best_ambience) {
    feedLines.push(`${fr.territories} — ${fr.best_ambience}`);
  } else if (fr.territories) {
    feedLines.push(fr.territories);
  }
  if (feedLines.length) sections.push('## Feeding\n' + feedLines.join('\n'));

  // Projects
  const projLines = [];
  for (const pr of (n.project_responses || [])) {
    if (!pr.response) continue;
    const title = (raw.projects_resolved || [])[pr.project_index]?.title || `Project ${pr.project_index + 1}`;
    projLines.push(`### ${title}\n${pr.response}`);
  }
  if (projLines.length) sections.push('## Projects\n' + projLines.join('\n\n'));

  // Merit / action responses
  const actLines = [];
  for (const ar of (n.action_responses || [])) {
    if (!ar.response) continue;
    const title = ar.title || `Action ${ar.action_index + 1}`;
    actLines.push(`### ${title}\n${ar.response}`);
  }
  if (actLines.length) sections.push('## Merit Actions\n' + actLines.join('\n\n'));

  // Touchstone
  if (n.touchstone) sections.push('## Touchstone\n' + n.touchstone);

  // Letter from home
  if (n.letter_from_home) sections.push('## Letter\n' + n.letter_from_home);

  // Territory reports
  const terrLines = [];
  for (const t of (n.territory_reports || [])) {
    if (!t.response) continue;
    terrLines.push(`### ${t.territory_name || t.territory_id}\n${t.response}`);
  }
  if (terrLines.length) sections.push('## Territory Reports\n' + terrLines.join('\n\n'));

  return sections.join('\n\n');
}

// ── Map a DT1 raw record to the app's downtime_submission schema ──────────────
function mapSubmission(raw, cycleOid) {
  const charIdStr = raw.character_id || CHAR_ID_FIXES[raw.character_name] || '';
  const charOid = new ObjectId(charIdStr);
  const now     = new Date().toISOString();
  const publishedOutcome = buildPublishedOutcome(raw);

  // Map projects_resolved into st_review.resolved_actions format
  const resolvedActions = (raw.projects_resolved || []).map((p, i) => ({
    action_type:     p.action_type || 'misc',
    title:           p.title || p.name || `Project ${i + 1}`,
    pool_player:     p.pool_player || '',
    pool_validated:  p.pool_validated || '',
    pool_status:     p.pool_status || 'resolved',
    st_note:         p.st_note || '',
    notes_thread:    p.notes_thread || [],
    player_feedback: p.player_feedback || '',
  }));

  return {
    character_id:     charOid,
    character_name:   raw.character_name,
    player_name:      raw.player_name,
    cycle_id:         cycleOid,
    status:           'submitted',
    responses:        {},   // DT1 was pre-app; no structured form responses
    feeding_review: {
      pool_status:     'resolved',
      pool_player:     raw.feeding_review?.dice_pool  || '',
      pool_validated:  raw.feeding_review?.dice_pool  || '',
      notes_thread:    [],
      player_feedback: '',
    },
    st_review: {
      outcome_text:       publishedOutcome,
      outcome_visibility: 'published',
      resolved_actions:   resolvedActions,
    },
    published_outcome: publishedOutcome,
    created_at:  '2026-02-28T00:00:00.000Z',
    updated_at:  now,
  };
}

async function main() {
  const srcPath = join(__dirname, '../TM_downtime1_submissions.json');
  if (!fs.existsSync(srcPath)) {
    console.error('Source file not found:', srcPath);
    process.exit(1);
  }
  const rawSubmissions = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  console.log(`Loaded ${rawSubmissions.length} DT1 submissions\n`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log('Connected to MongoDB\n');

  const db      = client.db('tm_suite');
  const cycCol  = db.collection('downtime_cycles');
  const subCol  = db.collection('downtime_submissions');

  console.log(DRY_RUN ? '=== DRY RUN — no changes written ===\n' : '=== APPLYING CHANGES ===\n');

  // ── Step 1: cycle ────────────────────────────────────────────────────────────
  const existingCycle = await cycCol.findOne({ game_number: 1 });
  let cycleOid;

  if (existingCycle) {
    if (!FORCE) {
      console.log(`Cycle already exists: "${existingCycle.label}" (${existingCycle._id})`);
      console.log('Add --force to overwrite.\n');
      cycleOid = existingCycle._id;
    } else {
      console.log(`UPDATING cycle: Downtime 1`);
      if (!DRY_RUN) {
        await cycCol.updateOne({ _id: existingCycle._id }, { $set: DT1_CYCLE });
      }
      cycleOid = existingCycle._id;
    }
  } else {
    console.log(`${DRY_RUN ? 'WOULD INSERT' : 'INSERTING'} cycle: Downtime 1`);
    if (!DRY_RUN) {
      const res = await cycCol.insertOne(DT1_CYCLE);
      cycleOid = res.insertedId;
      console.log(`  → _id: ${cycleOid}\n`);
    } else {
      cycleOid = new ObjectId(); // placeholder for dry run
    }
  }

  // ── Step 2: submissions ──────────────────────────────────────────────────────
  let inserted = 0, updated = 0, skipped = 0;

  for (const raw of rawSubmissions) {
    const charIdStr = raw.character_id || CHAR_ID_FIXES[raw.character_name] || '';
    if (!charIdStr) {
      console.log(`  SKIP (no character_id) | ${raw.character_name}`);
      skipped++; continue;
    }
    const charOid  = new ObjectId(charIdStr);
    const existing = await subCol.findOne({ character_id: charOid, cycle_id: cycleOid });

    if (existing && !FORCE) {
      console.log(`  SKIP (exists)          | ${raw.character_name}`);
      skipped++; continue;
    }

    const doc    = mapSubmission(raw, cycleOid);
    const action = existing
      ? (DRY_RUN ? 'WOULD UPDATE' : 'UPDATING ')
      : (DRY_RUN ? 'WOULD INSERT' : 'INSERTING');

    // Show feeding summary
    const fr = raw.feeding_review || {};
    console.log(`  ${action} | ${raw.character_name}`);
    console.log(`            Feeding: ${fr.territories || '—'} (${fr.best_ambience || '—'})`);
    console.log(`            Projects: ${(raw.projects_resolved || []).length}`);

    if (!DRY_RUN) {
      if (existing) {
        await subCol.updateOne({ _id: existing._id }, { $set: doc });
        updated++;
      } else {
        await subCol.insertOne(doc);
        inserted++;
      }
    } else {
      if (existing) updated++; else inserted++;
    }
  }

  console.log(`\n${DRY_RUN ? 'Would insert' : 'Inserted'}: ${inserted}  |  ${DRY_RUN ? 'Would update' : 'Updated'}: ${updated}  |  Skipped: ${skipped}`);

  if (DRY_RUN) {
    console.log('\nRe-run with --apply to write changes.');
    console.log('Add --force to overwrite existing records.');
  }

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
