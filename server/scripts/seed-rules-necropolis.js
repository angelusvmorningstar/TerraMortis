
/**
 * N-3 / MNEC (issue #692, epic specs/epic-mnec-necropolis-merits.md) — atomic
 * Necropolis merit family seeder.
 *
 * Two collections touched in one idempotent pass:
 *
 *   purchasable_powers — nine merit docs upserted by `key`:
 *     true-worm, necropolis-sepulcher, catacombs, caldarium, garbage-pit,
 *     labyrinth-guardians, dark-temple, white-ants, trap-door.
 *
 *   rule_grant — one Collective Compound source doc for Necropolis Sepulcher
 *     (`source_slug: 'necro'`, `amount_basis: 'rating_of_source'`,
 *     `sharing_scope: { type: 'collective_owners_of_merit', merit:
 *     'Necropolis Sepulcher', min_dots: 1 }`, `partner_shareable: true`,
 *     six pool_targets — the collectively-shared target merits).
 *
 * Verbatim rule text per the MNEC epic. Three typos preserved per Peter's
 * 2026-06-10 ack — see the epic's Editorial Notes:
 *   - White Ants:  'to detects' (intended 'to detect')
 *   - Trap Door:   'above group' (intended 'above ground')
 *   - Trap Door:   'a entrance'  (intended 'an entrance')
 * DO NOT auto-correct these.
 *
 * Idempotent: uses `replaceOne(filter, doc, { upsert: true })` keyed on the
 * stable `key` (merits) and `{source, grant_type}` (rule_grant). Re-running
 * with no flag (dry-run) reports zero pending writes after the first apply.
 *
 * Usage:
 *   node server/scripts/seed-rules-necropolis.js                # dry run (default)
 *   node server/scripts/seed-rules-necropolis.js --apply        # write
 *   MONGODB_DB=tm_suite_test node server/scripts/seed-rules-necropolis.js --apply
 *
 * Locally, run from `server/` so cwd-relative `dotenv/config` picks up
 * `server/.env`. On Render env vars are pre-set (no-op).
 * (See memory [[feedback_server_scripts_dotenv_path]].)
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

// ── Prereq tree shorthands ──
const PREREQ_CLAN = { type: 'clan', name: 'Nosferatu' };
const PREREQ_FAMILY = {
  all: [
    PREREQ_CLAN,
    { type: 'merit', name: 'Necropolis Sepulcher', dots: 1 },
  ],
};

/** Common shape — implementation status flags + nullable fields the existing
 *  merit docs all carry. Filled per-merit below. */
function _baseDoc(overrides) {
  return {
    category: 'merit',
    parent: 'Kindred',
    rank: null,
    rating_range: null,
    description: null,
    pool: null,
    resistance: null,
    cost: null,
    action: null,
    duration: null,
    prereq: null,
    exclusive: null,
    xp_fixed: null,
    special: null,
    bloodline: null,
    implemented: true,
    selected: true,
    sub_category: null,
    cult: null,
    offering: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Nine merits — verbatim rule text per epic-mnec-necropolis-merits.md
// ─────────────────────────────────────────────────────────────────────────────

const MERITS = [
  // 1. Necropolis Sepulcher — the gate / Collective Compound source.
  _baseDoc({
    key: 'necropolis-sepulcher',
    name: 'Necropolis Sepulcher',
    rating_range: [1, 5],
    sub_category: 'domain',
    prereq: PREREQ_CLAN,
    description:
      "Prerequisites: Nosferatu Status •\n\n" +
      "One dot of this merit buys a Nosferatu small home within the Necropolis and gives them 1 point per dot to spend in other Necropolis Merits. " +
      "Further expenditure on this merit provides a larger space for the Haunt's Haven and provides more dots to invest into the Necropolis. " +
      "This acts as a personal, non-shareable, Safe Place in the Necropolis.",
  }),

  // 2. Catacombs — collective-shared.
  _baseDoc({
    key: 'catacombs',
    name: 'Catacombs',
    rating_range: [1, 5],
    sub_category: 'domain',
    prereq: PREREQ_FAMILY,
    description:
      "Navigating the tunnels necessitates an extended Wits + Investigation roll, with ten successes required. " +
      "Each roll is equivalent to one hour's worth of wandering. Those who do not have dots in Necropolis Sepulcher suffer a penalty to this roll equal to the total dots in this Catacombs. " +
      "Those who do possess any dots in the Merit, however, may still have to succeed if distracted, or under time pressure or duress. " +
      "Even the Haunts may find themselves periodically lost in the dark and distorted heart of their own Necropolis. " +
      "In such a case, a resident can add Clan Status to these rolls, representing how familiar they are with the Catacombs and the Warren in general.\n\n" +
      "This Merit is shared between all Haunts with dots in the Necropolis.",
  }),

  // 3. Caldarium — collective-shared.
  _baseDoc({
    key: 'caldarium',
    name: 'Caldarium',
    rating_range: [1, 3],
    sub_category: 'domain',
    prereq: PREREQ_FAMILY,
    description:
      "The Caldaria is the one location in the Necropolis that strangers may be allowed to visit, it is, in a way, a Nosferatu Elysium: one shall not bring violence here.\n\n" +
      "At one dot, the Caldarium provides a place of social power for the Nosferatu: all Haunts within the Caldarium gain +1 to City Status and rolls involving Expression, Persuasion, Socialize or Subterfuge.\n\n" +
      "At two dots, this bonus increases to +2.\n\n" +
      "At three dots, a dark serenity stays with the Haunt even after it leaves the bathhouse. For the rest of the night, Haunts may re-roll one Social or Mental action.\n\n" +
      "This Merit is shared between all Haunts with dots in the Necropolis.",
  }),

  // 4. Garbage Pit — collective-shared.
  _baseDoc({
    key: 'garbage-pit',
    name: 'Garbage Pit',
    rating_range: [1, 3],
    sub_category: 'domain',
    prereq: PREREQ_FAMILY,
    description:
      "The Garbage Pit provides 2 distinct benefits that Haunts have learnt not to look too closely at: " +
      "Once per Chapter a Haunt willing to spend the time can find a trash version of basically anything in the depths of the pit. " +
      "Anything above Availability equal to this merit will be trashed enough to reduce it to that level. " +
      "Secondly, any object thrown into the Garbage Pit with intention is never, ever, seen again. No, torpored Kindred are not objects.\n\n" +
      "This Merit is shared between all Haunts with dots in the Necropolis.",
  }),

  // 5. Labyrinth Guardians — collective-shared.
  _baseDoc({
    key: 'labyrinth-guardians',
    name: 'Labyrinth Guardians',
    rating_range: [1, 5],
    sub_category: 'domain',
    prereq: PREREQ_FAMILY,
    description:
      "Guardian Swarms are packs or hordes of mutant animals that live in the Warren. " +
      "These creatures are unnatural (flat-white eyes, stitched-together limbs, too human voices, etc.) and will attack any non-resident they come across. " +
      "If the Guardians have their Health track filled with lethal damage, they'll disperse. However, they will return after a week to roam the Warren once again. " +
      "Any resident who encounters the Labyrinth Guardians must feed them a point of Vitae, or suffer their attacks — their vigil has a price, after all.\n\n" +
      "This Merit is shared between all Haunts with dots in the Necropolis.",
  }),

  // 6. Dark Temple — collective-shared; flat 2 dots, xp_fixed: 2.
  _baseDoc({
    key: 'dark-temple',
    name: 'Dark Temple',
    rating_range: [2, 2],
    xp_fixed: 2,
    sub_category: 'domain',
    prereq: PREREQ_FAMILY,
    description:
      "A Haunt spending time in the Dark Temple has their Beast quietened; they take the Sated Condition (+1 on Frenzy checks) and are considered to have meditated (+1 on Breakpoint checks). " +
      "However, it is unquiet even for a Haunt, and they take the Spooked Condition, distracted by otherworldly whispers at the edges of perception.\n\n" +
      "This Merit is shared between all Haunts with dots in the Necropolis.",
  }),

  // 7. White Ants — collective-shared, territory-linked. Typo PRESERVED: "to detects".
  _baseDoc({
    key: 'white-ants',
    name: 'White Ants',
    rating_range: [1, 5],
    sub_category: 'domain',
    prereq: PREREQ_FAMILY,
    description:
      "The Necropolis sprawls and opens into Territories far beyond what is reasonable. " +
      "For each dot in this merit select a Territory the Necropolis has infected. " +
      // VERBATIM TYPO PRESERVED ("to detects" — intended "to detect") per Peter 2026-06-10 ack.
      "Haunts taking clandestine actions in that area apply a -3 to all rolls to detects their personal actions against anyone who does not possess dots in Necropolis Sepulcher.\n\n" +
      "This Merit is shared between all Haunts with dots in the Necropolis.",
  }),

  // 8. Trap Door — attached dual-anchor; flat 1 dot, xp_fixed: 1.
  //    Typos PRESERVED: "a entrance", "above group".
  _baseDoc({
    key: 'trap-door',
    name: 'Trap Door',
    rating_range: [1, 1],
    xp_fixed: 1,
    sub_category: 'domain',
    prereq: PREREQ_FAMILY,
    description:
      // VERBATIM TYPOS PRESERVED ("a entrance" → "an entrance"; "above group" → "above ground") per Peter 2026-06-10 ack.
      "The Haunt has put a entrance to the Necropolis in a purchased Safe Place above group in a Territory covered by White Ants. " +
      "While they can do much to keep this entrance secret from other Haunts, nothing is ever guaranteed and any other Haunt using this entrance can bypass external Safe Place benefits. " +
      "To find this other Haunts must navigate the Catacomb as if they do not possess dots in Necropolis Sepulcher.\n\n" +
      "This merit is not shared and is linked to a specific Safe Place.",
  }),

  // 9. True Worm — standalone drawback; flat 2 dots, xp_fixed: 2.
  _baseDoc({
    key: 'true-worm',
    name: 'True Worm',
    rating_range: [2, 2],
    xp_fixed: 2,
    sub_category: 'general',
    prereq: PREREQ_CLAN,
    description:
      "So used to the dark, the Nosferatu no longer feels the draw of day sleep when in the tunnels of the Necropolis that lay more than 10 meters below the earth where there is no possibility of sunlight. " +
      "They still must spend 1 Vitae each day to 'wake'.\n\n" +
      "Drawback: While active during the day, the Nosferatu is at half his normal Speed (round up). " +
      "In addition, a Haunt possessing this Merit is especially harmed by sunlight. " +
      "The Nosferatu suffers +1 Health point per time unit when exposed to any of the sun's rays.",
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// One Collective Compound source rule_grant doc for Necropolis Sepulcher.
// ─────────────────────────────────────────────────────────────────────────────

const NECRO_RULE_GRANT = {
  source: 'Necropolis Sepulcher',
  source_slug: 'necro',
  // Issue #775: belt-and-braces — write both `category` (N-1 convention,
  // read directly by _renderPoolCounters filters at sheet.js:124) and
  // `source_slug` (legacy field). Pool-evaluator now bridges both at write
  // time via `rule.category ?? rule.source_slug` so future rule_grant docs
  // don't need this dual field, but keeping it explicit here matches the
  // shape consumers expect and survives a re-seed without surprise.
  category: 'necro',
  grant_type: 'pool',
  condition: 'merit_present',
  amount_basis: 'rating_of_source',
  pool_targets: [
    'Catacombs',
    'Caldarium',
    'Garbage Pit',
    'Labyrinth Guardians',
    'Dark Temple',
    'White Ants',
  ],
  partner_shareable: true,
  sharing_scope: {
    type: 'collective_owners_of_merit',
    merit: 'Necropolis Sepulcher',
    min_dots: 1,
  },
  notes:
    'MNEC Collective Compound source (issue #692). R dots in Necropolis Sepulcher grant R free dots into free_grants.necro, ' +
    'distributable across the six collectively-shared target merits. Sharing is auto-synthesised at render time via ' +
    'resolveSharingScope (no partner_explicit list to maintain). Per MNEC epic + ADR-005 Rev 2.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${DB_NAME}\n`);

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000, tls: true });
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const merits = db.collection('purchasable_powers');
    const grants = db.collection('rule_grant');

    let touched = 0;

    console.log('purchasable_powers:');
    for (const doc of MERITS) {
      // Compare against the existing doc (if any) to decide whether this run
      // would actually change state. _id is preserved on existing docs and
      // re-generated on inserts; excluded from comparison.
      const existing = await merits.findOne({ key: doc.key });
      const willChange = _docDiffers(existing, doc);
      const verb = DRY_RUN ? '[DRY RUN] would' : '';
      console.log(`  ${doc.key.padEnd(22)} ${existing ? 'exists' : 'new   '} ${willChange ? `${verb} write` : 'no change'}`);
      if (!DRY_RUN && willChange) {
        await merits.replaceOne({ key: doc.key }, doc, { upsert: true });
        touched++;
      } else if (DRY_RUN && willChange) {
        touched++;
      }
    }

    console.log('\nrule_grant:');
    const existingRule = await grants.findOne({ source: NECRO_RULE_GRANT.source, grant_type: 'pool' });
    const ruleChanges = _docDiffers(existingRule, NECRO_RULE_GRANT);
    const verb = DRY_RUN ? '[DRY RUN] would' : '';
    console.log(`  Necropolis Sepulcher pool ${existingRule ? 'exists' : 'new   '} ${ruleChanges ? `${verb} upsert` : 'no change'}`);
    if (!DRY_RUN && ruleChanges) {
      await grants.replaceOne({ source: NECRO_RULE_GRANT.source, grant_type: 'pool' }, NECRO_RULE_GRANT, { upsert: true });
      touched++;
    } else if (DRY_RUN && ruleChanges) {
      touched++;
    }

    console.log('');
    if (DRY_RUN) {
      console.log(`[DRY RUN] Would touch ${touched} doc(s) across both collections.`);
      console.log('Re-run with --apply to write.');
    } else {
      console.log(`Touched ${touched} doc(s) across both collections.`);
      console.log('Idempotency check: re-run with no flag (dry-run) and confirm "no change" on every line.');
    }
  } finally {
    await client.close();
  }
}

/** Shallow-then-deep comparison excluding _id. Returns true if the docs differ
 *  in any field that the seed populates. New doc keys not in existing → diff. */
function _docDiffers(existing, target) {
  if (!existing) return true;
  for (const k of Object.keys(target)) {
    if (k === '_id') continue;
    if (JSON.stringify(existing[k]) !== JSON.stringify(target[k])) return true;
  }
  return false;
}

main().catch(err => { console.error(err); process.exit(1); });
