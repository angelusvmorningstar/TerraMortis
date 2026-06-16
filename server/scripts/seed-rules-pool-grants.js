#!/usr/bin/env node

/**
 * N-1 / ADR-005 Rev 2 (issue #670) — atomic pool-grant seed for the new
 * channel-map + flag-driven sharing fields on existing rule_grant docs.
 *
 * Adds two N-1 fields to the six EXISTING pool-grant rule_grant docs that
 * the codebase's hardcoded reads currently look at — Lorekeeper, Invested,
 * Viral Mythology, Mystery Cult Initiation, Bloodline, and Retainer (style):
 *
 *   - `source_slug`        — canonical short identifier (`lk`, `inv`, `vm`,
 *                            `mci`, `bloodline`, `retainer`). Used as the key
 *                            in `m.free_grants[slug]` and as the lookup key
 *                            in `shareableSumForMerit` for any future code
 *                            that wants to consult the flag.
 *
 *   - `partner_shareable`  — boolean, seeded to the UNION baseline (Khepri
 *                            resolution 2026-06-10): TRUE for MCI / Bloodline
 *                            / Retainer (currently in the server's
 *                            `characters.js:195` partner subset); FALSE for
 *                            Lorekeeper / Invested / VM (currently in
 *                            neither client nor server subset).
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Concern #1 Rev 2 (load-bearing) — DO NOT silently fix the divergence.
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   The client at `public/js/editor/domain.js#domMeritShareableSingle` only
 *   includes `free_mci` in its partner subset. The server at
 *   `server/routes/characters.js:195` includes `free_mci + free_bloodline +
 *   free_retainer`. They disagree today.
 *
 *   N-1 PRESERVES that divergence verbatim: the two hardcoded reads stay
 *   on their existing subsets and DO NOT consult `partner_shareable` for
 *   these legacy sources. The seeded UNION values are CANONICAL DATA
 *   intended for the future MNEC-prerequisite audit story, which will:
 *
 *     (a) grep the codebase to determine whether the divergence is
 *         deliberate (e.g. a player-portal-only enrichment) or accreted;
 *     (b) either migrate both hardcoded reads to the flag-driven helper
 *         (`shareableSumForMerit`) OR document the asymmetry intentionally;
 *     (c) prune any UNION value that turns out to be over-inclusive.
 *
 *   "UNION" was chosen as the seed default because it keeps current sharing
 *   intact: the audit can REMOVE flags if a deliberate exclusion surfaces.
 *   The opposite ("intersection / mci-only") would silently break the
 *   server's existing partner enrichment if the audit ever wired the flag
 *   to it. Do NOT mistake the seeded values for "the right answer" — they
 *   are a STARTING POINT for the audit.
 *
 * Idempotent — re-running matches the same docs and $sets the same values.
 *
 * Usage:
 *   node server/scripts/seed-rules-pool-grants.js                # dry run (default)
 *   node server/scripts/seed-rules-pool-grants.js --apply        # write
 *   MONGODB_DB=tm_suite_test node server/scripts/seed-rules-pool-grants.js --apply
 *
 * On Render env vars are already set; locally, run from `server/` so cwd-
 * relative `dotenv/config` picks up `server/.env`
 * (see memory [[feedback_server_scripts_dotenv_path]]).
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'tm_suite';

if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure server/.env is present and the script is run from server/.');
  process.exit(1);
}

// ── The six existing pool-grant sources getting N-1 fields ──
// `filter` identifies the existing rule_grant doc; `$set` adds the N-1 fields
// without disturbing other properties on the doc (pool_targets / category /
// amount_basis etc. stay untouched). UNION baseline per Khepri resolution.
const SEED = [
  { filter: { source: 'Mystery Cult Initiation' },               $set: { source_slug: 'mci',       partner_shareable: true  } },
  { filter: { source: 'Bloodline' },                             $set: { source_slug: 'bloodline', partner_shareable: true  } },
  { filter: { source: 'Retainer' },                              $set: { source_slug: 'retainer', partner_shareable: true  } },
  { filter: { source: 'Lorekeeper' },                            $set: { source_slug: 'lk',        partner_shareable: false } },
  { filter: { source: 'Invested' },                              $set: { source_slug: 'inv',       partner_shareable: false } },
  { filter: { source: 'Viral Mythology' },                       $set: { source_slug: 'vm',        partner_shareable: false } },
];

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${DB_NAME}\n`);

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000, tls: true });
  try {
    await client.connect();
    const coll = client.db(DB_NAME).collection('rule_grant');

    let totalMatched = 0;
    let totalModified = 0;
    let totalNeedingUpdate = 0;

    for (const { filter, $set } of SEED) {
      // Count docs that match the source AND don't already have the canonical N-1 fields set.
      const needingUpdate = await coll.countDocuments({
        ...filter,
        $or: [
          { source_slug:       { $exists: false } },
          { source_slug:       { $ne: $set.source_slug } },
          { partner_shareable: { $exists: false } },
          { partner_shareable: { $ne: $set.partner_shareable } },
        ],
      });
      const matchTotal = await coll.countDocuments(filter);
      totalMatched += matchTotal;
      totalNeedingUpdate += needingUpdate;

      const verb = DRY_RUN ? '[DRY RUN] would set' : 'set';
      console.log(`  ${filter.source}: matched ${matchTotal} doc(s); ${verb} source_slug='${$set.source_slug}', partner_shareable=${$set.partner_shareable}; need-update ${needingUpdate}`);

      if (!DRY_RUN && needingUpdate > 0) {
        const result = await coll.updateMany(filter, { $set });
        totalModified += result.modifiedCount;
      }
    }

    console.log('');
    if (DRY_RUN) {
      console.log(`[DRY RUN] Would touch ${totalNeedingUpdate} doc(s) across ${SEED.length} sources (of ${totalMatched} matching).`);
      console.log('Re-run with --apply to write.');
    } else {
      console.log(`Modified ${totalModified} doc(s) across ${SEED.length} sources (of ${totalMatched} matching).`);
      console.log('Idempotency check: re-run with no flag (dry-run) and confirm need-update == 0 across all sources.');
    }
  } finally {
    await client.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
