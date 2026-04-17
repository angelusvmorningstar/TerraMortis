/**
 * migrate-dt1-submissions.js
 *
 * One-time import: load Downtime 1 historical submissions from
 * TM_downtime1_submissions.json into the downtime_submissions collection.
 *
 * Creates a 'Downtime 1' cycle record if one does not already exist,
 * then inserts one submission per character with:
 *   - Real character_id (ObjectId from players collection)
 *   - st_review.outcome_text compiled from st_narrative sections
 *   - st_review.outcome_visibility: 'published'
 *
 * Usage:
 *   node server/migrate-dt1-submissions.js           — dry run
 *   node server/migrate-dt1-submissions.js --apply   — write to MongoDB
 */

import 'dotenv/config';
import fs from 'fs';
import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

const DRY_RUN = !process.argv.includes('--apply');

// ── Character name (as in DT1 JSON) → real MongoDB character ObjectId ─────────
// Derived from: chars_v2.json player field → players collection character_ids
const CHAR_ID_MAP = {
  'Alice Vunder':           '69cf7da860b712b5eb99624b', // Katherine H
  'Anichka':                '69cf7da860b712b5eb99624c', // Katie H
  'Brandy LaRoux':          '69cf7da860b712b5eb99624d', // Ashley K
  'Carver':                 '69cf7da860b712b5eb99624e', // Archer
  'Cazz':                   '69cf7da860b712b5eb99624f', // Brae C
  'Charles Mercer-Willows': '69cf7da860b712b5eb996250', // Leo T
  'Charlie Ballsack':       '69cf7da860b712b5eb996251', // Kurtis W
  'Conrad Sondergaard':     '69cf7da860b712b5eb996252', // Arnold W
  'Cyrus Reynolds':         '69cf7da860b712b5eb996253', // Bill C
  'Dr Margaret Kane':       '69cf7da860b712b5eb996260', // Jessica BC (moniker: Doc)
  'Edna Judge':             '69cf7da860b712b5eb996254', // Arlo V
  'Einar Solveig':          '69cf7da860b712b5eb996255', // Nathan H
  'Eve Lockridge':          '69cf7da860b712b5eb996256', // Jamie H
  'Ivana Horvat':           '69cf7da860b712b5eb996257', // Lyn
  'Jack Fallow':            '69cf7da860b712b5eb996258', // George T
  'Keeper':                 '69cf7da860b712b5eb99625a', // Symon G
  'Kirk Grimm':             '69cf7da860b712b5eb99625b', // Phillip G — no player record yet; ID inferred from sequential batch
  'Livia':                  '69cf7da860b712b5eb99625c', // Clair H
  'Ludica Lachramore':      '69cf7da860b712b5eb99625d', // Sky K
  'Macheath':               '69cf7da860b712b5eb99625e', // Charlie BC (moniker: Mac)
  'Yusuf Mammon Kalusicj':  '69cf7da860b712b5eb996268', // Peter K (moniker: Mammon)
  'Reed Justice':           '69cf7da860b712b5eb996261', // Conan F
  'Rene Meyer':             '69cf7da860b712b5eb996262', // Luca V
  'René Meyer':             '69cf7da860b712b5eb996262', // Luca V (accent variant)
  'René St. Dominique':     '69cf7da860b712b5eb996263', // Matt B
  'Sister Hazel':           '69cf7da860b712b5eb996265', // Marni K (moniker: Hazel)
  'Tegan Groves':           '69cf7da860b712b5eb996266', // Alana W
  'Wan Yelong':             '69cf7da860b712b5eb996267', // Michael V
};

// ── Compile st_narrative into a published_outcome markdown string ─────────────
function compileOutcomeText(sub) {
  const nar = sub.st_narrative || {};
  const parts = [];

  // 1. Project responses
  const projectResponses = nar.project_responses || [];
  const projectsResolved = sub.projects_resolved || [];
  for (const pr of projectResponses) {
    if (!pr.response?.trim()) continue;
    const idx = pr.project_index ?? 0;
    const title = projectsResolved[idx]?.title || projectsResolved[idx]?.name || `Project ${idx + 1}`;
    parts.push(`## ${title}\n\n${pr.response.trim()}`);
  }

  // 2. Merit / action responses
  for (const ar of (nar.action_responses || [])) {
    if (!ar.response?.trim()) continue;
    const label = ar.label || ar.merit_type || 'Action';
    parts.push(`## ${label}\n\n${ar.response.trim()}`);
  }

  // 3. Letter From Home
  if (nar.letter_from_home?.trim()) {
    parts.push(`## Letter From Home\n\n${nar.letter_from_home.trim()}`);
  }

  // 4. Touchstone
  if (nar.touchstone?.trim()) {
    parts.push(`## Touchstone\n\n${nar.touchstone.trim()}`);
  }

  // 5. Territory reports
  for (const tr of (nar.territory_reports || [])) {
    if (!tr.response?.trim()) continue;
    const heading = tr.territory_name || tr.territory_id || 'Territory';
    parts.push(`## ${heading}\n\n${tr.response.trim()}`);
  }

  return parts.join('\n\n');
}

async function main() {
  const rawPath = new URL('../TM_downtime1_submissions.json', import.meta.url).pathname
    .replace(/^\/([A-Z]:)/, '$1')   // fix Windows path on some Node versions
    .replace(/%20/g, ' ');           // decode URL-encoded spaces
  if (!fs.existsSync(rawPath)) {
    console.error('Source file not found:', rawPath);
    process.exit(1);
  }

  const submissions = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  console.log(`Loaded ${submissions.length} submissions from source file.\n`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log('Connected to MongoDB\n');

  const db = client.db('tm_suite');
  const cyclesCol = db.collection('downtime_cycles');
  const subsCol   = db.collection('downtime_submissions');

  // ── 1. Find or create DT1 cycle ─────────────────────────────────────────────
  let existingCycle = await cyclesCol.findOne({ label: 'Downtime 1' });
  let cycleOid;

  if (existingCycle) {
    cycleOid = existingCycle._id;
    console.log(`DT1 cycle already exists: ${cycleOid}\n`);
  } else {
    cycleOid = new ObjectId();
    const cycleDoc = {
      _id: cycleOid,
      label: 'Downtime 1',
      status: 'closed',
      opened_at:  '2026-02-27T00:00:00.000Z',
      deadline_at: '2026-03-13T00:00:00.000Z',
      closed_at:  '2026-03-13T00:00:00.000Z',
    };
    console.log(DRY_RUN ? 'WOULD CREATE cycle:' : 'CREATING cycle:', JSON.stringify(cycleDoc, null, 2), '\n');
    if (!DRY_RUN) await cyclesCol.insertOne(cycleDoc);
  }

  // ── 2. Check for existing DT1 submissions (guard against double-import) ──────
  const existingCount = await subsCol.countDocuments({ cycle_id: cycleOid });
  if (existingCount > 0 && !process.argv.includes('--force')) {
    console.error(`${existingCount} DT1 submissions already exist. Re-run with --force to overwrite.`);
    await client.close();
    process.exit(1);
  }

  // ── 3. Build and insert submission documents ──────────────────────────────────
  console.log(DRY_RUN ? '=== DRY RUN — no changes written ===\n' : '=== APPLYING CHANGES ===\n');

  let inserted = 0, skipped = 0;

  for (const sub of submissions) {
    const charName  = sub.character_name;
    const charIdStr = CHAR_ID_MAP[charName];
    const charOid   = charIdStr ? new ObjectId(charIdStr) : null;

    const outcomeText = compileOutcomeText(sub);
    const sectionCount = (outcomeText.match(/^## /gm) || []).length;

    if (!charOid) {
      console.log(`  SKIP (no ID) | ${charName} — ${sectionCount} sections compiled`);
      skipped++;
    } else {
      console.log(`  ${DRY_RUN ? 'WOULD INSERT' : 'INSERTING'} | ${charName} (${charIdStr}) — ${sectionCount} sections`);
      inserted++;
    }

    if (DRY_RUN) continue;
    if (!charOid) continue; // skip Kirk Grimm — no player to receive it

    const doc = {
      character_name:        charName,
      player_name:           sub.player_name || '',
      character_id:          charOid,
      cycle_id:              cycleOid,
      status:                'complete',
      feeding_review:        sub.feeding_review || {},
      projects_resolved:     sub.projects_resolved || [],
      merit_actions_resolved: sub.merit_actions_resolved || [],
      st_narrative:          sub.st_narrative || {},
      st_review: {
        outcome_text:       outcomeText,
        outcome_visibility: 'published',
        published_at:       new Date().toISOString(),
      },
    };

    await subsCol.insertOne(doc);
  }

  console.log(`\n${DRY_RUN ? 'Would insert' : 'Inserted'}: ${inserted}  |  Skipped (no ID): ${skipped}`);

  if (DRY_RUN) {
    console.log('\nRe-run with --apply to write changes.');
    console.log('Add --force to overwrite if DT1 submissions already exist.');
  }

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
