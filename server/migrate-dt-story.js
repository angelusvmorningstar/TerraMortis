#!/usr/bin/env node

// Migrates feature.66 st_response fields from projects_resolved[N] entries
// into the new st_narrative.project_responses[N].response structure.
//
// Safe to run multiple times — already-migrated entries are skipped (st_response is null).
// Does NOT drop or alter schema fields on the resolvedAction definition.
//
// Usage:
//   cd server && node migrate-dt-story.js           (prompts for confirmation)
//   cd server && node migrate-dt-story.js --confirm (skip prompt — CI/scripted use)

import { createInterface } from 'node:readline';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

async function confirm() {
  if (process.argv.includes('--confirm')) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => {
    rl.question(
      '\nThis script will migrate feature.66 st_response fields into st_narrative.project_responses.\n' +
      'Existing st_response values will be nulled after migration.\n' +
      'Already-null entries are skipped.\n\n' +
      'Type YES to continue: ',
      answer => {
        rl.close();
        if (answer.trim() === 'YES') resolve();
        else { console.log('Aborted.'); process.exit(0); }
      }
    );
  });
}

async function migrate() {
  await confirm();

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db  = client.db('tm_suite');
    const col = db.collection('downtime_submissions');

    const all = await col.find({}).toArray();

    let scanned = 0;
    let migrated = 0;
    let alreadyNull = 0;

    for (const sub of all) {
      scanned++;
      const projectsResolved = sub.projects_resolved;
      if (!Array.isArray(projectsResolved) || !projectsResolved.length) continue;

      // Build the updated st_narrative.project_responses array from existing data
      const existingNarrative = sub.st_narrative || {};
      const existingResponses = Array.isArray(existingNarrative.project_responses)
        ? existingNarrative.project_responses
        : [];

      const updatedProjectsResolved = [...projectsResolved];
      let docChanged = false;

      for (let n = 0; n < projectsResolved.length; n++) {
        const entry = projectsResolved[n];
        if (entry == null) continue;

        if (!entry.st_response) {
          alreadyNull++;
          continue;
        }

        // Find or create the matching project_responses entry
        let responseEntry = existingResponses.find(r => r.project_index === n);
        if (!responseEntry) {
          responseEntry = { project_index: n };
          existingResponses.push(responseEntry);
        }

        // Copy the st_response data across
        responseEntry.response         = entry.st_response;
        if (entry.response_author)     responseEntry.author         = entry.response_author;
        if (entry.response_status)     responseEntry.status         = entry.response_status;
        if (entry.response_reviewed_by) responseEntry.reviewed_by   = entry.response_reviewed_by;

        // Null the source field (keep the key — schema has additionalProperties: true)
        updatedProjectsResolved[n] = { ...entry, st_response: null };

        migrated++;
        docChanged = true;
      }

      if (!docChanged) continue;

      await col.updateOne(
        { _id: sub._id },
        {
          $set: {
            projects_resolved: updatedProjectsResolved,
            'st_narrative.project_responses': existingResponses,
          },
        }
      );
    }

    console.log(`\nMigration complete.`);
    console.log(`  Scanned:      ${scanned}`);
    console.log(`  Migrated:     ${migrated}`);
    console.log(`  Already null: ${alreadyNull}`);
  } finally {
    await client.close();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
