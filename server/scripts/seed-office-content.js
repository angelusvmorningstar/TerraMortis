/**
 * oxp.10 (split out of oxp.1, 2026-08-13) — seed the `office_content`
 * collection from `OFFICE_DATA`/`MERIT_DOT_CAPS`
 * (`public/js/tabs/office-data.js`), and put uniqueness indexes on it.
 *
 * Follows the #826-hardened pattern `seed-bloodlines.js` already proved out:
 * --dry-run is the default, --apply is required to write, the run is
 * idempotent, and dotenv is loaded first.
 *
 * Source of truth for the seed WAS `public/js/tabs/office-data.js`:
 *   MERIT_DOT_CAPS — merit name -> dot cap (flat, not per-office)
 *   OFFICE_DATA    — office category -> {asset, style, merits, manoeuvres,
 *                    statusPower}
 * Both are frozen below, copied verbatim at the moment this script was
 * written. `office-data.js` itself is deleted in the same change (see the
 * story's own Task 0 decision) — this script's frozen copy is now the only
 * place the pre-migration shape exists, kept for provenance and as the one
 * remaining bulk-seed path into a collection that starts empty.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why the integrity gate comes first
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   OFFICE_DATA and MERIT_DOT_CAPS are hand-maintained and can disagree — a
 *   merit an office grants but that has no dot cap, a duplicate manoeuvre
 *   name, an empty field. Bloodlines' own seed script was written after
 *   exactly this class of drift caused a real two-week production defect
 *   (a bloodline's disciplines silently costing wrong). Every check runs
 *   BEFORE anything is written, in dry-run and apply alike, and any failure
 *   aborts with a non-zero exit having written nothing.
 *
 *   The manoeuvre-array ORDER is checked for presence (non-empty, no
 *   duplicate names) but NOT cross-referenced automatically against
 *   `content/rules/office-powers.md` — that file lives outside this repo
 *   (the umbrella workspace root, not TM Game's own git checkout), so an
 *   automated dependency on it would be a fragile, environment-specific
 *   read this codebase does not otherwise do. Manually confirmed instead,
 *   2026-08-27: Primogen's 5-manoeuvre order in the frozen literal below
 *   matches `content/rules/office-powers.md`'s own "The Primogen" section
 *   exactly (People Talk, Freedom of Information, Show of Hands, Pull Rank,
 *   Veto) — spot-check judged sufficient for four offices; re-confirm by
 *   hand if this script is ever re-run against edited source data.
 *
 * Usage — run these FROM `server/`, so cwd-relative `dotenv/config` picks up
 * the local .env.
 *
 *   # preview (default — no writes):
 *   node scripts/seed-office-content.js
 *
 *   # apply:
 *   node scripts/seed-office-content.js --apply
 *
 * NEVER run --apply against live during development; the real seed is an
 * operational act for the ST.
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import Ajv from 'ajv';
import { connectDb, getCollection, closeDb } from '../db.js';
import { officeContentSchema } from '../schemas/office_content.schema.js';
import { OFFICE_CATEGORY_ENUM } from '../schemas/office_seat.schema.js';
import { ensureOfficeContentIndexes } from '../lib/office-content-index.js';

const COLLECTION = 'office_content';

/**
 * FROZEN 2026-08-27. Copied verbatim out of `public/js/tabs/office-data.js`
 * in the same change that deletes it. Do not edit: the `office_content`
 * collection is canonical from this point on, and a future TM Admin story
 * is where office content is added or edited.
 */
export const MERIT_DOT_CAPS = {
  'Safe Place':       5,
  'Haven':             5,
  'Staff':             5,
  'Resources':         5,
  'Contacts':          5,
  'Retainer (Aide)':   5,
  'Retainer (Hound)':  5,
  'Retainer (Spy)':    5,
  'Cacophony Savvy':   3,
  'Trained Observer':  3,
};

/** FROZEN 2026-08-27 alongside MERIT_DOT_CAPS above. Same rules apply. */
export const OFFICE_DATA = {
  'Head of State': {
    asset: 'Government House',
    merits: ['Safe Place', 'Haven', 'Staff', 'Resources'],
    style: 'First Among Equals',
    manoeuvres: [
      { name: 'Due Diligence',       effect: 'Each Court, a number of times equal to your City Status; spend 1 Influence to learn the rating of one named merit, Kindred or mortal, held by a Kindred you can see. They will know this was done, unless you also spend Influence equal to their City Status.' },
      { name: 'Call in a Favour',    effect: 'Each Court, a number of times equal to your City Status; spend 1 Influence to require any Court Position holder to use an ability from their own sheet on your behalf. You pay its cost.' },
      { name: 'Sovereignty Inviolate', effect: 'Once per Court; spend Influence equal to Clan Status or Covenant Status to add to City Status for a single role (this can influence Blood Potency for resistance).' },
      { name: 'Willing Coalition',   effect: 'Once per Court; spend Influence equal to a Court Position holder\'s City Status to force them use an equal amount of Influence in a vote of your choosing.' },
      { name: 'Executive Order',     effect: 'Spend Influence equal to the City Status of a target you can see to order them to act. The target chooses between compliance and a Condition of the Storyteller\'s choice.' },
    ],
    statusPower: [
      'Each session, you can raise or lower another\'s City Status by 1. You can do this a number of times per session equal to your own Effective City Status. You cannot raise or lower the same character more than once per session (but you can coordinate with your Socialite or other Court roles to stack changes).',
      'You can strip a character\'s last dot of City Status, casting them out of the domain. You can grant the first dot of City Status to newcomers at no cost.',
      'Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
    ],
  },
  'Primogen': {
    asset: 'Chains of Office',
    merits: ['Contacts', 'Retainer (Aide)', 'Resources'],
    style: 'Balance of Power',
    manoeuvres: [
      { name: 'People Talk',            effect: 'Once per Court; spend Influence equal to the City Status of a target you can see to learn their rating in one Discipline you name. If they hold that Discipline, you may then name one of its powers and learn their dice pool for it.' },
      { name: 'Freedom of Information', effect: 'Spend 1 Influence to read the Position sheet of any one Position in play. The cost rises by 1 Influence with each further use.' },
      { name: 'Show of Hands',          effect: 'Spend 1 Influence to look inside one bidding box: Territory, Primogen, or Harpy. The cost rises by 1 Influence with each further use.' },
      { name: 'Pull Rank',              effect: 'Once per Court; spend Influence equal to the target\'s City Status to deny them the effects of an exceptional success.' },
      { name: 'Veto',                   effect: 'Each Court, a number of times equal to your City Status; block a manoeuvre from any Position by spending Influence equal to that manoeuvre\'s cost.' },
    ],
    statusPower: [
      'Each session, you can raise or lower another character\'s City Status by 1, once. You may permanently sacrifice one of your own City Status dots to make a second Status change in the same session. You cannot affect your own City Status.',
      'Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
    ],
  },
  'Socialite': {
    asset: 'Elan',
    merits: ['Cacophony Savvy', 'Contacts', 'Retainer (Spy)'],
    style: 'Elan',
    manoeuvres: [
      { name: 'Size Them Up',       effect: 'Each Court, a number of times equal to your City Status; spend 1 Influence to learn the rating of one named Status type, Kindred or mortal, for a Kindred you can see. They will know this was done, unless you also spend Influence equal to their City Status.' },
      { name: 'Saving Face',        effect: 'Once per Court; spend 1 Influence to reroll a failed Resistance roll against a contested mental Discipline, or to force a reroll against a resisted one.' },
      { name: 'Goad',               effect: 'Once per Court; spend Influence equal to the target\'s City Status to learn their Mask and Dirge.' },
      { name: 'Playing Favourites', effect: 'Once per Court; when a Kindred\'s City Status is being changed, spend Influence equal to the new Status to make that change cost one further point of Status.' },
      { name: 'Curry Favour',       effect: 'Once per Court; spend 1 Influence to impose the Leveraged Condition publicly on a Kindred you can see.' },
    ],
    statusPower: [
      'Each session, you can raise or lower another character\'s City Status by 1. You can do this a number of times per session equal to your own Effective City Status. You cannot affect your own City Status, and you cannot hold another major court position simultaneously.',
      'Your decisions should be grounded in the City Deeds. If you can\'t justify a Status change, others will be justified in dropping yours.',
    ],
  },
  'Enforcer': {
    asset: 'Goon Squad',
    merits: ['Safe Place', 'Retainer (Hound)', 'Trained Observer'],
    style: 'Goon Squad',
    manoeuvres: [
      { name: 'Perimeter',           effect: 'Once per Downtime; choose a Territory and spend Influence equal to its Ambience rating to receive a report as though you had scored an exceptional success on a Patrol or Scout action.' },
      { name: 'Ear to the Ground',   effect: 'At Court, you count as holding Contacts in every sphere for the purpose of news from the city at large reaching you, such as a potential Masquerade breach coming to the attention of the police. Each time the Storyteller offers you such information, you must pay Influence to receive it.' },
      { name: 'Stakeout',            effect: 'Each Court, a number of times equal to your City Status; spend 1 Influence to learn one of the following about a target you can see: their Herd rating, their Feeding Grounds rating, or where they hold Feeding Rights. They will know this was done, unless you also spend Influence equal to their City Status.' },
      { name: 'Crackdown',           effect: 'Once per Downtime; spend Influence equal to the target\'s City Status to give your attempts to interfere with their Downtime actions the rote quality. This is not subtle.' },
      { name: 'Neighbourhood Watch', effect: 'Once per Court; spend Influence equal to the City Status of a target you can see to learn one of their Resistance Attributes.' },
    ],
    statusPower: [
      'Each session, you can lower another character\'s City Status by 1 when they breach what you are charged to enforce. Your enforcement must conform to the norms of court.',
      'If you overstep, others will be justified in dropping your own City Status.',
    ],
  },
};

/**
 * Verify the source structures agree with each other and with the office
 * category enum, before a single document is built.
 *
 * @param {object} args
 * @param {object} args.officeData - OFFICE_DATA shape
 * @param {object} args.meritCaps  - MERIT_DOT_CAPS shape
 * @returns {{ errors: string[], warnings: string[], officeCount: number, meritCount: number }}
 */
export function checkIntegrity({ officeData, meritCaps }) {
  const errors = [];
  const warnings = [];
  const categories = Object.keys(officeData);

  for (const category of categories) {
    // Checked against the FULL 5-value OFFICE_CATEGORY_ENUM (Codex review,
    // oxp-10 — the schema's own category enum is the full set too, so a
    // premature "Administrator" entry in OFFICE_DATA would pass THIS check;
    // what actually keeps oxp-8's content out of this migration is that
    // OFFICE_DATA's frozen literal below simply has no such key today).
    if (!OFFICE_CATEGORY_ENUM.includes(category)) {
      errors.push(`"${category}" is not a known office category.`);
      continue;
    }
    const entry = officeData[category];
    for (const field of ['asset', 'style']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) {
        errors.push(`"${category}" has an empty or non-string "${field}".`);
      }
    }
    if (!Array.isArray(entry.merits) || entry.merits.length === 0) {
      errors.push(`"${category}" has no merits array, or it is empty.`);
    } else {
      for (const merit of entry.merits) {
        if (typeof merit !== 'string' || !merit.trim()) {
          errors.push(`"${category}" lists an empty or non-string merit.`);
          continue;
        }
        // An unlisted merit legitimately defaults to a cap of 5 (the
        // existing `MERIT_DOT_CAPS[merit] || 5` convention every consumer
        // preserves) — this is a WARNING, not an error, so it does not
        // block a build/seed (an intentional default-cap merit is common
        // and correct), but it must actually surface: a genuinely mistyped
        // merit name (e.g. "Contact" for "Contacts") is otherwise
        // indistinguishable from an intentional one. Codex review, oxp-10
        // (Low): an earlier draft's comment promised this warning but never
        // implemented it — `checkIntegrity` silently returned no signal at
        // all, and `seedOfficeContent` printed "Integrity: OK" either way.
        if (!(merit in meritCaps)) {
          warnings.push(`"${category}" lists merit "${merit}", which has no MERIT_DOT_CAPS entry — it will default to a cap of 5. If this is a typo, fix the name; if intentional, no action needed.`);
        }
      }
    }
    if (!Array.isArray(entry.manoeuvres) || entry.manoeuvres.length === 0) {
      errors.push(`"${category}" has no manoeuvres array, or it is empty.`);
    } else {
      const seenNames = new Set();
      for (const m of entry.manoeuvres) {
        if (typeof m?.name !== 'string' || !m.name.trim()) {
          errors.push(`"${category}" has a manoeuvre with an empty or missing name.`);
          continue;
        }
        if (typeof m?.effect !== 'string' || !m.effect.trim()) {
          errors.push(`"${category}" manoeuvre "${m.name}" has an empty or missing effect.`);
        }
        if (seenNames.has(m.name)) {
          errors.push(`"${category}" lists manoeuvre "${m.name}" more than once.`);
        }
        seenNames.add(m.name);
      }
    }
    if (!Array.isArray(entry.statusPower) || entry.statusPower.length === 0) {
      errors.push(`"${category}" has no statusPower array, or it is empty.`);
    }
  }

  for (const [merit, cap] of Object.entries(meritCaps)) {
    if (typeof merit !== 'string' || !merit.trim()) {
      errors.push('MERIT_DOT_CAPS has an empty or non-string merit name key.');
    }
    if (!Number.isInteger(cap) || cap < 1) {
      errors.push(`MERIT_DOT_CAPS["${merit}"] is ${JSON.stringify(cap)}, expected a positive integer.`);
    }
  }

  return { errors, warnings, officeCount: categories.length, meritCount: Object.keys(meritCaps).length };
}

/**
 * Build the seed documents (both kinds). Throws if the source does not pass
 * the integrity gate.
 */
export function buildSeedDocs({ officeData, meritCaps, now = new Date().toISOString() }) {
  const { errors } = checkIntegrity({ officeData, meritCaps });
  if (errors.length) {
    throw new Error(`buildSeedDocs refused: ${errors.length} integrity failure(s).\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  const officeDocs = Object.keys(officeData)
    .sort((a, b) => a.localeCompare(b))
    .map(category => {
      const entry = officeData[category];
      return {
        kind: 'office',
        category,
        asset: entry.asset,
        style: entry.style,
        merits: [...entry.merits],
        manoeuvres: entry.manoeuvres.map(m => ({ name: m.name, effect: m.effect })),
        statusPower: [...entry.statusPower],
        created_at: now,
        updated_at: now,
      };
    });

  const meritCapsDoc = {
    kind: 'merit_caps',
    caps: { ...meritCaps },
    created_at: now,
    updated_at: now,
  };

  return [...officeDocs, meritCapsDoc];
}

/**
 * Drive the seed. Returns the summary; throws on an integrity or schema
 * failure, having written nothing.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=true]
 * @param {boolean} [opts.log=true]
 */
export async function seedOfficeContent(opts = {}) {
  const { dryRun = true, log = true } = opts;

  // ── Gate 1: the source is internally consistent ──
  const integrity = checkIntegrity({ officeData: OFFICE_DATA, meritCaps: MERIT_DOT_CAPS });
  if (log) {
    console.log(`Integrity: ${integrity.officeCount} office(s), ${integrity.meritCount} merit cap(s) in source.`);
  }
  if (integrity.errors.length) {
    const detail = integrity.errors.map(e => `  - ${e}`).join('\n');
    throw new Error(`Seed aborted: ${integrity.errors.length} integrity failure(s), nothing written.\n${detail}`);
  }
  if (log) console.log('Integrity: OK (every office has non-empty asset/style/merits/manoeuvres/statusPower; no duplicate manoeuvre names; every merit cap is a positive integer).');
  if (log && integrity.warnings.length) {
    console.log('');
    console.log(`Integrity WARNINGS (${integrity.warnings.length}) — not blocking, but worth a human's eyes:`);
    for (const w of integrity.warnings) console.log(`  - ${w}`);
  }

  // ── Gate 2: every built document satisfies the schema ──
  const docs = buildSeedDocs({ officeData: OFFICE_DATA, meritCaps: MERIT_DOT_CAPS });
  const ajv = new Ajv({ allErrors: true, coerceTypes: false });
  const validate = ajv.compile(officeContentSchema);
  const schemaFailures = [];
  for (const d of docs) {
    if (!validate(d)) {
      schemaFailures.push(`  - ${d.kind === 'office' ? d.category : 'merit_caps'}: ${JSON.stringify(validate.errors)}`);
    }
  }
  if (schemaFailures.length) {
    throw new Error(`Seed aborted: ${schemaFailures.length} document(s) failed schema validation, nothing written.\n${schemaFailures.join('\n')}`);
  }

  // ── Reconcile against what is already in the collection ──
  // Same three-state report as seed-bloodlines.js: DIFFERS (never
  // auto-overwritten), orphan, dupe.
  const col = getCollection(COLLECTION);
  const existing = await col.find({}).toArray();
  const existingByKey = new Map(); // key = category, or 'merit_caps' sentinel
  const duplicateKeys = [];
  // Codex review, oxp-10 (Medium, reproduced against real MongoDB): the
  // previous `d.kind === 'office' ? d.category : 'merit_caps'` treated EVERY
  // non-'office' kind as the merit_caps singleton, including a malformed or
  // legacy document this seed script has never heard of (kind:'legacy',
  // kind: undefined, ...). That aliased a real orphan onto the merit_caps
  // slot: the orphan was never reported as an orphan, the real merit_caps
  // document was skipped from `toInsert` (its key already looked "present"),
  // and `--apply` could finish successfully having never written the
  // singleton at all. Only the two real kinds this collection ever holds map
  // to a source-matchable key; anything else gets a key that can never equal
  // a real source key (`docs` — built by buildSeedDocs — only ever contains
  // 'office'/'merit_caps' kinds), so it always resolves as a genuine orphan.
  const keyOf = (d) => {
    if (d.kind === 'office') return `office:${d.category}`;
    if (d.kind === 'merit_caps') return 'merit_caps';
    return `unrecognised-kind:${d._id}`;
  };
  // Human-readable label for console output only — never used for
  // dedup/lookup, so it can stay collision-tolerant (falls back to the raw
  // key for anything not recognised as a real office or the caps singleton).
  const labelOf = (d) => (d.kind === 'office' ? d.category : d.kind === 'merit_caps' ? 'merit_caps' : keyOf(d));
  for (const d of existing) {
    const key = keyOf(d);
    if (existingByKey.has(key)) duplicateKeys.push(labelOf(d));
    else existingByKey.set(key, d);
  }

  const sameList = (a, b) => Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((x, i) => JSON.stringify(x) === JSON.stringify(b[i]));
  const sameCaps = (a, b) => a && b && JSON.stringify(a) === JSON.stringify(b);

  const differing = [];
  for (const d of docs) {
    const key = keyOf(d);
    const live = existingByKey.get(key);
    if (!live) continue;
    const deltas = [];
    if (d.kind === 'office') {
      if (live.asset !== d.asset) deltas.push(`asset ${JSON.stringify(live.asset)} -> ${JSON.stringify(d.asset)}`);
      if (live.style !== d.style) deltas.push(`style ${JSON.stringify(live.style)} -> ${JSON.stringify(d.style)}`);
      if (!sameList(live.merits, d.merits)) deltas.push('merits differ');
      if (!sameList(live.manoeuvres, d.manoeuvres)) deltas.push('manoeuvres differ (content or order)');
      if (!sameList(live.statusPower, d.statusPower)) deltas.push('statusPower differs');
    } else if (!sameCaps(live.caps, d.caps)) {
      deltas.push('merit dot caps differ');
    }
    if (deltas.length) differing.push({ key, label: labelOf(d), deltas });
  }

  const sourceKeys = new Set(docs.map(keyOf));
  const orphans = [...existingByKey.keys()].filter(k => !sourceKeys.has(k));
  const toInsert = docs.filter(d => !existingByKey.has(keyOf(d)));
  const differingKeys = new Set(differing.map(d => d.key));

  if (log) {
    console.log('');
    console.log('  Office / doc                Status');
    console.log('  ' + '-'.repeat(50));
    for (const d of docs) {
      const key = keyOf(d);
      let status;
      if (!existingByKey.has(key)) status = dryRun ? 'would insert' : 'inserting';
      else if (differingKeys.has(key)) status = 'DIFFERS';
      else status = 'present';
      console.log('  ' + labelOf(d).padEnd(28) + status);
    }
  }

  let inserted = 0;
  if (!dryRun) {
    if (duplicateKeys.length) {
      throw new Error(`Seed aborted: the collection already holds duplicate document(s) for: ${duplicateKeys.join(', ')}. Nothing written.`);
    }
    await ensureOfficeContentIndexes(col);
    if (toInsert.length) {
      try {
        const result = await col.insertMany(toInsert);
        inserted = result.insertedCount;
      } catch (err) {
        const landed = err?.result?.insertedCount ?? err?.insertedCount ?? 0;
        console.error(`Insert failed after ${landed} of ${toInsert.length} document(s). The collection is PARTIALLY seeded; re-run to insert the remainder.`);
        throw err;
      }
    }
  }

  const summary = {
    dryRun,
    total: docs.length,
    alreadyPresent: docs.length - toInsert.length,
    wouldInsert: toInsert.length,
    inserted,
    differing,
    orphans,
    duplicateKeys,
  };

  if (log) {
    console.log('');
    const verb = dryRun ? 'would insert' : 'inserted';
    console.log(`Summary: ${docs.length} document(s) in source; ${summary.alreadyPresent} already present; ${verb} ${inserted || toInsert.length}.`);
    if (differing.length) {
      console.log('');
      console.log(`  DIFFERS (${differing.length}) — present but disagreeing with the source. NOT overwritten; a human decides which side is right:`);
      for (const d of differing) console.log(`    ${d.label}: ${d.deltas.join('; ')}`);
    }
    if (orphans.length) {
      console.log('');
      console.log(`  ORPHANS (${orphans.length}) — in the collection but not in the source: ${orphans.join(', ')}`);
    }
    if (duplicateKeys.length) {
      console.log('');
      console.log(`  DUPLICATES (${duplicateKeys.length}) — the unique index cannot be created until these are resolved: ${duplicateKeys.join(', ')}`);
    }
  }

  return summary;
}

/**
 * @param {string[]} [argv]
 * @param {object} [opts]
 * @param {boolean} [opts.closeConnection=true]
 */
export async function main(argv = process.argv, opts = {}) {
  const { closeConnection = true } = opts;
  const dryRun = !argv.includes('--apply');

  console.log(`Mode: ${dryRun ? 'DRY RUN (read only; pass --apply to write)' : 'APPLY (will write)'}`);
  console.log(`Target DB: ${process.env.MONGODB_DB || 'tm_game'}`);
  console.log('');

  await connectDb();
  try {
    const summary = await seedOfficeContent({ dryRun });
    if (!dryRun) {
      console.log('');
      console.log('Idempotency check: re-run with --apply and confirm "inserted 0".');
    }
    return summary;
  } finally {
    if (closeConnection) await closeDb();
  }
}

// Auto-run only when invoked directly (not when imported by a test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(1); });
}
