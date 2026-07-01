/**
 * Restore accidentally deleted Downtime 1 submissions for Charles Mercer-Willows and Cyrus Reynolds.
 * Source: st-working/downtime/dt1/TM_downtime1_submissions.json
 * Run: node server/scripts/restore-dt1-charles-cyrus.js [--apply]
 */

import { MongoClient, ObjectId } from 'mongodb';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !process.argv.includes('--apply');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }

const DB_NAME        = 'tm_suite';
const CYCLE_ID       = new ObjectId('69f2dc48a77e2f00eb39a43c'); // Downtime 1
const CHARLES_CID    = new ObjectId('69d73ea49162ece35897a481');
const CYRUS_CID      = new ObjectId('69d73ea49162ece35897a484');
const SOURCE_PATH    = join(__dirname, '../../st-working/downtime/dt1/TM_downtime1_submissions.json');

function compileOutcomeText(sub) {
  const nar = sub.st_narrative || {};
  const projectsResolved = sub.projects_resolved || [];
  const parts = [];

  for (const pr of (nar.project_responses || [])) {
    if (!pr.response?.trim()) continue;
    const idx = pr.project_index ?? 0;
    const title = projectsResolved[idx]?.title || projectsResolved[idx]?.name || `Project ${idx + 1}`;
    parts.push(`## ${title}\n\n${pr.response.trim()}`);
  }
  for (const ar of (nar.action_responses || [])) {
    if (!ar.response?.trim()) continue;
    const label = ar.label || ar.merit_type || 'Action';
    parts.push(`## ${label}\n\n${ar.response.trim()}`);
  }
  if (nar.letter_from_home?.trim()) parts.push(`## Letter From Home\n\n${nar.letter_from_home.trim()}`);
  if (nar.touchstone?.trim()) parts.push(`## Touchstone\n\n${nar.touchstone.trim()}`);
  for (const tr of (nar.territory_reports || [])) {
    if (!tr.response?.trim()) continue;
    const heading = tr.territory_name || tr.territory_id || 'Territory';
    parts.push(`## ${heading}\n\n${tr.response.trim()}`);
  }
  return parts.join('\n\n');
}

async function main() {
  const source = JSON.parse(readFileSync(SOURCE_PATH, 'utf8'));

  const charlesRaw = source.find(s => s.character_name === 'Charles Mercer-Willows');
  const cyrusRaw   = source.find(s => s.character_name === 'Cyrus Reynolds');

  if (!charlesRaw) { console.error('Charles Mercer-Willows not found in source JSON'); process.exit(1); }
  if (!cyrusRaw)   { console.error('Cyrus Reynolds not found in source JSON');          process.exit(1); }

  const docs = [
    {
      character_name:         'Charles Mercer-Willows',
      player_name:            charlesRaw.player_name || '',
      character_id:           CHARLES_CID,
      cycle_id:               CYCLE_ID,
      status:                 'complete',
      feeding_review:         charlesRaw.feeding_review         || {},
      projects_resolved:      charlesRaw.projects_resolved      || [],
      merit_actions_resolved: charlesRaw.merit_actions_resolved || [],
      st_narrative:           charlesRaw.st_narrative           || {},
      st_review: {
        outcome_text:        compileOutcomeText(charlesRaw),
        outcome_visibility:  'published',
        published_at:        new Date().toISOString(),
      },
    },
    {
      character_name:         'Cyrus Reynolds',
      player_name:            cyrusRaw.player_name || '',
      character_id:           CYRUS_CID,
      cycle_id:               CYCLE_ID,
      status:                 'complete',
      feeding_review:         cyrusRaw.feeding_review         || {},
      projects_resolved:      cyrusRaw.projects_resolved      || [],
      merit_actions_resolved: cyrusRaw.merit_actions_resolved || [],
      st_narrative:           cyrusRaw.st_narrative           || {},
      st_review: {
        outcome_text:        compileOutcomeText(cyrusRaw),
        outcome_visibility:  'published',
        published_at:        new Date().toISOString(),
      },
    },
  ];

  if (DRY_RUN) {
    console.log('DRY RUN — pass --apply to insert.\n');
    for (const d of docs) {
      console.log(`Would insert: ${d.character_name}`);
      console.log(`  character_id: ${d.character_id}`);
      console.log(`  cycle_id:     ${d.cycle_id}`);
      console.log(`  projects_resolved: ${d.projects_resolved.length}`);
      console.log(`  merit_actions_resolved: ${d.merit_actions_resolved.length}`);
      console.log(`  outcome_text length: ${d.st_review.outcome_text.length} chars`);
      console.log();
    }
    return;
  }

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const col = client.db(DB_NAME).collection('downtime_submissions');

  // Safety: confirm neither already exists
  for (const d of docs) {
    const existing = await col.findOne({ cycle_id: CYCLE_ID, character_id: d.character_id });
    if (existing) {
      console.error(`ABORT: ${d.character_name} already has a DT1 submission (_id: ${existing._id}). Nothing inserted.`);
      await client.close();
      process.exit(1);
    }
  }

  const result = await col.insertMany(docs);
  console.log(`Inserted ${result.insertedCount} document(s):`);
  for (const [i, id] of Object.entries(result.insertedIds)) {
    console.log(`  ${docs[i].character_name} → _id: ${id}`);
  }

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
