#!/usr/bin/env node

// ORD.5: Direct migration of ordeal submissions and rubrics from tm_deprecated
// to tm_suite. Replaces the original JSON-extract chain (ORD.5/6/7/8/9 collapsed).
//
// Name resolution: tm_deprecated.characters is empty, so the deprecated
// character_ids cannot be resolved by direct join. Instead, this script extracts
// character names from tm_deprecated.archive_documents dossiers (first <strong>
// in the content_html) and builds a deprecated_character_id → tm_suite.character
// map from there. All ordeal_submissions share the same character_id pool as
// dossiers (verified during scoping).
//
// Also handles:
//   - Covenant slug normalisation: "Carthian Movement" / "Carthian" → "carthian"
//   - player_id resolution for player-level ordeals (lore, rules, covenant)
//   - Idempotent upsert by (character_id, ordeal_type [, covenant]); preserves
//     marking state on re-runs via $setOnInsert
//   - Rubric migration with the same slug normalisation
//
// Usage:
//   cd server && node scripts/migrate-ordeal-submissions-from-deprecated.js
//   cd server && node scripts/migrate-ordeal-submissions-from-deprecated.js --dry-run

import { MongoClient } from 'mongodb';
import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

// ── Covenant slug normalisation ──────────────────────────────────────────────

const COVENANT_SLUG_MAP = {
  'Carthian Movement':   'carthian',
  'Carthian':            'carthian',
  'carthian':            'carthian',
  'Circle of the Crone': 'crone',
  'Circle':              'crone',
  'crone':               'crone',
  'Invictus':            'invictus',
  'invictus':            'invictus',
  'Lancea et Sanctum':   'lancea',
  'Lancea':              'lancea',
  'lancea':              'lancea',
  'Unaligned':           'unaligned',
  'unaligned':           'unaligned',
};

function toCovenantSlug(input) {
  if (!input) return null;
  return COVENANT_SLUG_MAP[input] || null;
}

// ── Name normalisation ──────────────────────────────────────────────────────

// Keys are normalised (lowercase, honorific-stripped) dossier names; values are
// the search term (name or moniker, lowercase) that resolves against live
// tm_suite.characters. null means "no live match; skip silently". Mirrors the
// override pattern proven in server/scripts/import-archive-documents.js.
const NAME_OVERRIDES = {
  'conrad archibald sondergaard': 'conrad sondergaard', // live is "Conrad Sondergaard"
  'ludica lachrimore':            'ludica',             // live is "Ludica Lachramore" (spelling variant)
  'charles balsac':               'charlie ballsack',   // after "Lord" honorific stripped
  'lord charles balsac':          'charlie ballsack',   // defensive pre-strip lookup
  'casimir':                      'cazz',               // after "Cazz" quoted moniker stripped
  'casimir cazz':                 'cazz',               // defensive pre-strip lookup
};

const HONORIFICS = /^(lord|lady|doctor|dr|sister|sir|miss|mr|mrs|madam|don|preacher|inquisitor|rev|reverend|baron|brother|monsignor)\s+/i;

function deaccent(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normaliseName(raw) {
  if (!raw) return '';
  let s = deaccent(raw).toLowerCase().trim();
  let prev;
  do { prev = s; s = s.replace(HONORIFICS, '').trim(); } while (s !== prev);
  s = s.replace(/[‘’'"][^\n]*?[‘’'"]/g, '').trim();
  s = s.replace(/\(.*?\)/g, '').trim();
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}

// Extracts the character's display name from the first <strong>…</strong>
// inside the dossier content_html. Pattern verified across all 30 dossiers.
function extractDossierName(html) {
  if (!html) return null;
  const match = html.match(/<p[^>]*>\s*<strong[^>]*>([^<]+)<\/strong>\s*<\/p>/i);
  return match ? match[1].trim() : null;
}

function buildCharLookup(liveChars) {
  const map = new Map();
  for (const c of liveChars) {
    for (const n of [c.name, c.moniker].filter(Boolean)) {
      map.set(n.toLowerCase(), c);
      map.set(normaliseName(n), c);
    }
  }
  return map;
}

function resolveChar(name, lookup) {
  if (!name) return { char: null, skipReason: 'empty_name' };
  const norm = normaliseName(name);

  // Overrides table wins: either remaps to a known search term, or returns null
  // (silently skip — no character exists in the live DB).
  if (Object.prototype.hasOwnProperty.call(NAME_OVERRIDES, norm)) {
    const override = NAME_OVERRIDES[norm];
    if (override === null) return { char: null, skipReason: 'override_no_match' };
    if (lookup.has(override)) return { char: lookup.get(override), matched: `override→${override}` };
    return { char: null, skipReason: `override_key_missing:${override}` };
  }

  if (lookup.has(norm)) return { char: lookup.get(norm), matched: norm };

  for (const [key, char] of lookup) {
    if (key && norm && (key.startsWith(norm) || norm.startsWith(key))) {
      return { char, matched: `prefix:${key}` };
    }
  }
  return { char: null, skipReason: 'no_live_match' };
}

// ── Main ────────────────────────────────────────────────────────────────────

const PLAYER_LEVEL_TYPES = new Set(['lore_mastery', 'rules_mastery', 'covenant_questionnaire']);

async function run() {
  if (DRY_RUN) console.log('[DRY RUN] No writes will be made.\n');

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const deprecated = client.db('tm_deprecated');
  const live       = client.db('tm_suite');

  // Load live character + player data
  const liveChars = await live.collection('characters')
    .find({}, { projection: { _id: 1, name: 1, moniker: 1 } }).toArray();
  const livePlayers = await live.collection('players')
    .find({}, { projection: { _id: 1, character_ids: 1 } }).toArray();

  const charLookup = buildCharLookup(liveChars);

  const playerByCharId = new Map();
  for (const p of livePlayers) {
    for (const cid of (p.character_ids || [])) {
      playerByCharId.set(cid.toString(), p._id);
    }
  }

  // Build deprecated_character_id → { live char, player_id } via dossier names
  console.log('── Building character ID translation map ──');
  const dossiers = await deprecated.collection('archive_documents')
    .find({ type: 'dossier' }).toArray();

  const charIdMap = new Map();  // deprecated id (string) → { char, playerId }
  const unresolved = [];

  for (const d of dossiers) {
    const extracted = extractDossierName(d.content_html);
    if (!extracted) {
      unresolved.push({ reason: 'no_name_in_dossier', depId: d.character_id?.toString() });
      continue;
    }
    const { char, skipReason } = resolveChar(extracted, charLookup);
    if (!char) {
      unresolved.push({ reason: skipReason, name: extracted, depId: d.character_id?.toString() });
      continue;
    }
    const playerId = playerByCharId.get(char._id.toString()) || null;
    charIdMap.set(d.character_id.toString(), { char, playerId, extractedName: extracted });
  }

  console.log(`  Resolved: ${charIdMap.size}  |  Unresolved: ${unresolved.length}`);
  for (const u of unresolved) {
    console.log(`  [UNRESOLVED ${u.reason}] ${u.name || ''} (dep id ${u.depId})`);
  }

  // ── Migrate submissions ──────────────────────────────────────────────────
  console.log('\n── Migrating ordeal_submissions ──');
  const submissions = await deprecated.collection('ordeal_submissions').find({}).toArray();
  const counts = { lore_mastery: 0, rules_mastery: 0, covenant_questionnaire: 0, character_history: 0, skipped: 0 };
  const warnings = [];

  for (const sub of submissions) {
    const entry = charIdMap.get(sub.character_id?.toString());
    if (!entry) {
      counts.skipped++;
      warnings.push(`[SKIP] no char mapping for ${sub.ordeal_type} submission (dep id ${sub.character_id})`);
      continue;
    }

    const isPlayerLevel = PLAYER_LEVEL_TYPES.has(sub.ordeal_type);
    const covenantSlug = sub.covenant ? toCovenantSlug(sub.covenant) : null;

    if (sub.covenant && !covenantSlug) {
      warnings.push(`[SKIP] unknown covenant "${sub.covenant}" on ${sub.ordeal_type} for ${entry.char.name}`);
      counts.skipped++;
      continue;
    }

    if (isPlayerLevel && !entry.playerId) {
      warnings.push(`[WARN] no player_id for ${entry.char.name} on ${sub.ordeal_type}; storing with null`);
    }

    const doc = {
      character_id:  entry.char._id,
      player_id:     isPlayerLevel ? entry.playerId : null,
      ordeal_type:   sub.ordeal_type,
      covenant:      covenantSlug,
      source:        sub.source || 'google_form',
      submitted_at:  sub.submitted_at || null,
      responses:     sub.responses || [],
      marking:       sub.marking || {
        status:           'unmarked',
        marked_by:        null,
        marked_at:        null,
        overall_feedback: '',
        xp_awarded:       null,
        answers:          [],
      },
    };

    const filter = {
      character_id: entry.char._id,
      ordeal_type:  sub.ordeal_type,
      ...(sub.ordeal_type === 'covenant_questionnaire' ? { covenant: covenantSlug } : {}),
    };

    if (!DRY_RUN) {
      await live.collection('ordeal_submissions').updateOne(
        filter,
        { $setOnInsert: doc },
        { upsert: true }
      );
    }

    counts[sub.ordeal_type] = (counts[sub.ordeal_type] || 0) + 1;
    console.log(`  [OK] ${sub.ordeal_type}${covenantSlug ? ` (${covenantSlug})` : ''} → ${entry.char.moniker || entry.char.name}`);
  }

  // Create index on (character_id, ordeal_type) for lookup performance
  if (!DRY_RUN) {
    await live.collection('ordeal_submissions').createIndex({ character_id: 1, ordeal_type: 1 });
  }

  // ── Migrate rubrics ──────────────────────────────────────────────────────
  console.log('\n── Migrating ordeal_rubrics ──');
  const rubrics = await deprecated.collection('ordeal_rubrics').find({}).toArray();
  let rubricsWritten = 0;

  for (const r of rubrics) {
    const normSlug = r.covenant ? toCovenantSlug(r.covenant) : null;
    if (r.covenant && !normSlug) {
      warnings.push(`[SKIP RUBRIC] unknown covenant "${r.covenant}"`);
      continue;
    }

    const filter = { ordeal_type: r.ordeal_type, covenant: normSlug };
    const { _id, ...rest } = r;
    const doc = { ...rest, covenant: normSlug };

    if (!DRY_RUN) {
      await live.collection('ordeal_rubrics').updateOne(
        filter,
        { $setOnInsert: doc },
        { upsert: true }
      );
    }
    rubricsWritten++;
    console.log(`  [OK] ${r.ordeal_type}${normSlug ? ` (${normSlug})` : ''}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n── Summary ──');
  console.log(`Lore Mastery:            ${counts.lore_mastery}`);
  console.log(`Rules Mastery:           ${counts.rules_mastery}`);
  console.log(`Covenant Questionnaire:  ${counts.covenant_questionnaire}`);
  console.log(`Character History:       ${counts.character_history}`);
  console.log(`Skipped submissions:     ${counts.skipped}`);
  console.log(`Rubrics migrated:        ${rubricsWritten}`);
  console.log(`Warnings:                ${warnings.length}`);
  if (warnings.length) {
    console.log('');
    for (const w of warnings) console.log(`  ${w}`);
  }
  if (DRY_RUN) console.log('\n[DRY RUN] No writes made. Re-run without --dry-run to apply.');

  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
