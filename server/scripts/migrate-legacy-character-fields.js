#!/usr/bin/env node

/**
 * One-shot migration: excise in-render legacy data shapes from characters.
 * Ports each block from public/js/editor/mci.js:22-119 into discrete
 * idempotent functions that run against MongoDB directly.
 *
 * Database: tm_suite (override with MONGODB_DB env var)
 *
 * Usage:
 *   node server/scripts/migrate-legacy-character-fields.js --dry-run
 *   node server/scripts/migrate-legacy-character-fields.js --apply
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;

const MCI_TIER_BUDGETS = [0, 1, 1, 2, 3, 3]; // index = tier (1-5), 0 unused

// ── Migration functions ──────────────────────────────────────────────────────
// Each returns array of { field, before, after } and mutates c in place.

function stripLegacyDerivedMerits(c) {
  const mutations = [];
  if (!c.merits) return mutations;
  for (let i = c.merits.length - 1; i >= 0; i--) {
    if (c.merits[i].derived) {
      mutations.push({ field: `merits[${i}] name=${c.merits[i].name}`, before: 'present (derived: true)', after: 'removed' });
      c.merits.splice(i, 1);
    }
  }
  return mutations;
}

function renameUpToCp(c) {
  const mutations = [];
  (c.merits || []).forEach((m, i) => {
    if (!m || !m.up) return;
    mutations.push({ field: `merits[${i}] name=${m.name} up→cp`, before: `up=${m.up} cp=${m.cp || 0}`, after: `cp=${(m.cp || 0) + m.up}` });
    m.cp = (m.cp || 0) + m.up;
    delete m.up;
  });
  return mutations;
}

function clearMciGrantedBy(c) {
  const mutations = [];
  (c.merits || []).forEach((m, i) => {
    if (m.granted_by === 'Mystery Cult Initiation' || m.granted_by === 'MCI') {
      mutations.push({ field: `merits[${i}] name=${m.name} granted_by`, before: m.granted_by, after: '(deleted)' });
      delete m.granted_by;
    }
  });
  return mutations;
}

function backfillFtGrantedBy(c) {
  const mutations = [];
  const ftMerit = (c.merits || []).find(m => m.name === 'Fucking Thief' && m.category === 'general');
  if (ftMerit && ftMerit.qualifier) {
    const stolenIdx = (c.merits || []).findIndex(
      m => m.name === ftMerit.qualifier && m.category === 'general' && !m.granted_by
    );
    if (stolenIdx >= 0) {
      mutations.push({ field: `merits[${stolenIdx}] name=${c.merits[stolenIdx].name} granted_by`, before: '(absent)', after: 'Fucking Thief' });
      c.merits[stolenIdx].granted_by = 'Fucking Thief';
    }
  }
  (c.merits || []).forEach((m, i) => {
    if (m.granted_by === 'Fucking Thief' && m.free) {
      mutations.push({ field: `merits[${i}] name=${m.name} free`, before: m.free, after: 0 });
      m.free = 0;
    }
  });
  return mutations;
}

function migrateBenefitGrantsToTierGrants(c) {
  const mutations = [];
  (c.merits || []).forEach((m, i) => {
    if (m.name !== 'Mystery Cult Initiation') return;
    if (m.tier_grants || !m.benefit_grants || !m.benefit_grants.length) return;
    const tierGrants = [];
    m.benefit_grants.forEach((bg, j) => {
      if (!bg || !bg.name) return;
      tierGrants.push({ tier: j + 1, name: bg.name, category: bg.category || 'general', rating: bg.rating || 1, qualifier: bg.qualifier || bg.area || null });
    });
    mutations.push({ field: `merits[${i}] MCI benefit_grants→tier_grants`, before: JSON.stringify(m.benefit_grants), after: JSON.stringify(tierGrants) });
    m.tier_grants = tierGrants;
  });
  return mutations;
}

function autoMapMciTierGrants(c) {
  const mutations = [];
  (c.merits || []).forEach((mci, i) => {
    if (mci.name !== 'Mystery Cult Initiation' || mci.tier_grants) return;
    const rating = mci.rating || 0;
    if (rating === 0) return;
    const d1c = mci.dot1_choice || 'merits', d3c = mci.dot3_choice || 'merits', d5c = mci.dot5_choice || 'merits';
    const avail = [];
    if (rating >= 5 && d5c === 'merits') avail.push(5);
    if (rating >= 4) avail.push(4);
    if (rating >= 3 && d3c === 'merits') avail.push(3);
    if (rating >= 2) avail.push(2);
    if (rating >= 1 && d1c === 'merits') avail.push(1);
    if (!avail.length) return;
    const candidates = (c.merits || [])
      .filter(m => m !== mci && (m.free_mci || 0) > 0)
      .map(m => ({ name: m.name, category: m.category, rating: m.free_mci, qualifier: m.area || m.qualifier || null }))
      .sort((a, b) => b.rating - a.rating);
    if (!candidates.length) return;
    const tierGrants = [];
    const usedTiers = new Set();
    for (const cand of candidates) {
      const tier = avail.find(t => !usedTiers.has(t) && MCI_TIER_BUDGETS[t] >= cand.rating);
      if (tier == null) continue;
      usedTiers.add(tier);
      tierGrants.push({ tier, name: cand.name, category: cand.category, rating: Math.min(cand.rating, MCI_TIER_BUDGETS[tier]), qualifier: cand.qualifier });
    }
    if (tierGrants.length) {
      mutations.push({ field: `merits[${i}] MCI tier_grants (auto-map)`, before: '(absent)', after: JSON.stringify(tierGrants) });
      mci.tier_grants = tierGrants;
    }
  });
  return mutations;
}

function renameLegacyFightingStyles(c) {
  const mutations = [];
  (c.fighting_styles || []).forEach((fs, i) => {
    if (fs.name === 'Regular') {
      mutations.push({ field: `fighting_styles[${i}] name+type`, before: `name=Regular type=${fs.type}`, after: 'name=Fighting Merit type=merit' });
      fs.name = 'Fighting Merit';
      fs.type = 'merit';
    }
  });
  return mutations;
}

function dedupMandragoraGarden(c) {
  const mutations = [];
  // Fix miscategorised entries first
  (c.merits || []).forEach((m, i) => {
    if (m.name === 'Mandragora Garden' && m.category !== 'domain') {
      mutations.push({ field: `merits[${i}] Mandragora Garden category`, before: m.category, after: 'domain' });
      m.category = 'domain';
    }
  });
  // Remove duplicates: keep first with shared_with, else first without granted_by, else first
  const mgIdxs = (c.merits || []).reduce((a, m, i) => (m.name === 'Mandragora Garden' ? [...a, i] : a), []);
  if (mgIdxs.length <= 1) return mutations;
  let keepIdx = mgIdxs.find(i => (c.merits[i].shared_with || []).length > 0);
  if (keepIdx === undefined) keepIdx = mgIdxs.find(i => !c.merits[i].granted_by);
  if (keepIdx === undefined) keepIdx = mgIdxs[0];
  const toRemove = mgIdxs.filter(i => i !== keepIdx).sort((a, b) => b - a);
  for (const ri of toRemove) {
    mutations.push({ field: `merits[${ri}] Mandragora Garden`, before: JSON.stringify(c.merits[ri]), after: '(removed duplicate)' });
    c.merits.splice(ri, 1);
  }
  return mutations;
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

function migrateCharacter(c) {
  const mutations = [];
  let meritsChanged = false;
  let fsChanged = false;

  const track = (muts, field) => {
    if (!muts.length) return;
    mutations.push(...muts);
    if (field === 'merits') meritsChanged = true;
    if (field === 'fighting_styles') fsChanged = true;
  };

  track(stripLegacyDerivedMerits(c), 'merits');
  track(renameUpToCp(c), 'merits');
  track(clearMciGrantedBy(c), 'merits');
  track(backfillFtGrantedBy(c), 'merits');
  track(migrateBenefitGrantsToTierGrants(c), 'merits');
  track(autoMapMciTierGrants(c), 'merits');
  track(renameLegacyFightingStyles(c), 'fighting_styles');
  track(dedupMandragoraGarden(c), 'merits');

  return { mutations, meritsChanged, fsChanged };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only)'}`);

  const uri = MONGODB_URI.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, tls: true });

  try {
    await client.connect();
    const dbName = process.env.MONGODB_DB || 'tm_suite';
    const db = client.db(dbName);
    const col = db.collection('characters');

    const characters = await col.find({}).toArray();
    console.log(`Loaded ${characters.length} characters from ${dbName}.characters\n`);

    let totalMutations = 0;
    const toUpdate = [];

    for (const c of characters) {
      const { mutations, meritsChanged, fsChanged } = migrateCharacter(c);
      if (mutations.length) {
        totalMutations += mutations.length;
        console.log(`${c._id} (${c.name || '—'}):`);
        for (const m of mutations) {
          console.log(`  [${m.field}]  before: ${m.before}  →  after: ${m.after}`);
        }
        toUpdate.push({ c, meritsChanged, fsChanged });
      }
    }

    console.log(`\nCharacters needing update: ${toUpdate.length}`);
    console.log(`Total field mutations: ${totalMutations}`);

    if (!APPLY) {
      console.log('\nDRY RUN — no writes. Re-run with --apply to commit.');
      return;
    }

    if (toUpdate.length === 0) {
      console.log('\n0 mutations — nothing to write.');
      return;
    }

    let updated = 0;
    for (const { c, meritsChanged, fsChanged } of toUpdate) {
      const $set = {};
      if (meritsChanged) $set.merits = c.merits;
      if (fsChanged) $set.fighting_styles = c.fighting_styles;
      const result = await col.updateOne({ _id: c._id }, { $set });
      updated += result.modifiedCount;
    }
    console.log(`\nWrote ${updated} characters.`);
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
