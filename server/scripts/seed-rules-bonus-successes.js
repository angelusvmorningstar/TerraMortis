/**
 * Seed script — inserts the rule_bonus_success docs (dtlt.1).
 * Idempotent: replaceOne/upsert on a stable composite key.
 *
 * One doc in v1 (scope confirmed by Angelus, 2026-08-31):
 *   Stronger Than You — Strength Performance rank 4. A successful Strength
 *   roll gains one free success. Gated on having actually PICKED the
 *   manoeuvre (fighting_picks[]), not on Strength Performance style dots.
 *
 * Any further "+N successes when X" house rule is a Mongo doc edit through the
 * admin Engine panel, not a code change — that is the whole point of the
 * collection. Add new docs here only when they should ship as defaults.
 *
 * Usage:
 *   node server/scripts/seed-rules-bonus-successes.js --dry-run   (default)
 *   node server/scripts/seed-rules-bonus-successes.js --apply
 *
 * Target DB is the MONGODB_DB env var (default: tm_game).
 * Use MONGODB_DB=tm_game_test for test-DB seeding.
 */

import { pathToFileURL } from 'url';

// ── Rule docs ─────────────────────────────────────────────────────────────────

export const BONUS_SUCCESS_DOCS = [
  {
    doc: {
      source: 'Stronger Than You',
      predicate: { kind: 'manoeuvre_present', name: 'Stronger Than You' },
      also_requires: [{ kind: 'roll_attr', name: 'Strength' }],
      count_basis: 'flat',
      flat_amount: 1,
      notes:
        'Strength Performance rank 4 (public/data/man_db.json): a successful Strength roll adds '
        + 'one free success. Applies only when the roll already scored at least one rolled success. '
        + 'Requires an explicit fighting_picks entry — Strength Performance style dots alone do not '
        + 'grant it.',
    },
    filter: { source: 'Stronger Than You', 'predicate.name': 'Stronger Than You' },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  await import('dotenv/config');
  const { MongoClient } = await import('mongodb');

  const DRY_RUN = !process.argv.includes('--apply');
  const MONGODB_URI = process.env.MONGODB_URI;
  const DB_NAME = process.env.MONGODB_DB || 'tm_game';

  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set — ensure server/.env is present.');
    process.exit(1);
  }

  const strip = (uri) => uri.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(strip(MONGODB_URI), { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const now = new Date().toISOString();

  console.log(`[seed-rules-bonus-successes] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  for (const { doc, filter } of BONUS_SUCCESS_DOCS) {
    const existing = await db.collection('rule_bonus_success').findOne(filter);
    console.log(`  [rule_bonus_success] ${existing ? 'EXISTS (upsert will refresh)' : 'INSERT'} — ${doc.source}`);
    console.log(`    doc:   `, JSON.stringify({ ...doc, created_at: now, updated_at: now }));

    if (!DRY_RUN) {
      await db.collection('rule_bonus_success').replaceOne(
        filter,
        { ...doc, created_at: existing?.created_at || now, updated_at: now },
        { upsert: true },
      );
      console.log(`    → written`);
    }
  }

  console.log(`\n[seed-rules-bonus-successes] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

// Only connect when invoked directly. Importing this module (tests read
// BONUS_SUCCESS_DOCS as the single source of truth for the seed) must never
// open a Mongo connection or load dotenv over the test harness's env.
const _invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_invokedDirectly) {
  run().catch(err => {
    console.error('[seed-rules-bonus-successes] Error:', err.message);
    process.exit(1);
  });
}
