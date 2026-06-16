#!/usr/bin/env node

/**
 * NPCR.5 pre-migration audit — READ ONLY.
 *
 * Enumerates the three legacy shapes NPCR.5 must handle so the migration
 * script can be built with the actual data in mind:
 *
 *   1. character.npcs[] stubs — counts + distinct relationship_type values
 *      (drives the relationship_type → kind map)
 *   2. character.touchstones[] entries — counts, humanity distribution,
 *      anchor-range check, any already carrying edge_id
 *   3. npcs documents — linked_character_ids / is_correspondent coverage
 *   4. relationships.kind='touchstone' — orphans not referenced by any
 *      character.touchstones[].edge_id (smoke-test residue)
 *
 * Usage: cd server && node scripts/audit-npcr5-preconditions.js
 *        MONGODB_URI must be set in .env or environment.
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

const DB_NAME = process.env.MONGODB_DB || 'tm_suite';

function anchorFor(clan) {
  return clan === 'Ventrue' ? 7 : 6;
}

function line(ch = '─', len = 68) { return ch.repeat(len); }
function hdr(title) {
  console.log('\n' + line('═'));
  console.log('  ' + title);
  console.log(line('═'));
}
function sub(title) {
  console.log('\n' + line('─'));
  console.log('  ' + title);
  console.log(line('─'));
}

async function main() {
  const client = new MongoClient(MONGODB_URI.replace(/[&?]ssl=[^&]*/g, ''), {
    serverSelectionTimeoutMS: 5000,
    tls: true,
  });
  await client.connect();
  const db = client.db(DB_NAME);
  const characters = db.collection('characters');
  const npcs = db.collection('npcs');
  const relationships = db.collection('relationships');

  hdr(`NPCR.5 audit · db=${DB_NAME}`);

  // ── 1. character.npcs[] stubs ─────────────────────────────────────────────
  sub('1. character.npcs[] stubs');
  const charsWithNpcs = await characters.find(
    { 'npcs.0': { $exists: true } },
    { projection: { name: 1, moniker: 1, honorific: 1, clan: 1, 'npcs.name': 1, 'npcs.relationship_type': 1, 'npcs.touchstone_eligible': 1 } }
  ).toArray();
  console.log(`Characters with at least one stub: ${charsWithNpcs.length}`);
  const stubTotal = charsWithNpcs.reduce((sum, c) => sum + (c.npcs?.length || 0), 0);
  console.log(`Total stub entries: ${stubTotal}`);

  const typeCounts = new Map();
  const touchstoneEligibleCount = { true: 0, false: 0, undefined: 0 };
  for (const c of charsWithNpcs) {
    for (const s of (c.npcs || [])) {
      const t = s.relationship_type == null ? '(missing)' : String(s.relationship_type);
      typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
      const te = s.touchstone_eligible;
      if (te === true) touchstoneEligibleCount.true += 1;
      else if (te === false) touchstoneEligibleCount.false += 1;
      else touchstoneEligibleCount.undefined += 1;
    }
  }
  console.log('\nDistinct relationship_type values (count):');
  [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => {
    console.log(`  ${String(n).padStart(4)}  ${t}`);
  });
  console.log(`\ntouchstone_eligible: true=${touchstoneEligibleCount.true}  false=${touchstoneEligibleCount.false}  unset=${touchstoneEligibleCount.undefined}`);

  console.log('\nPer-character stub counts:');
  const byCount = charsWithNpcs.map(c => ({
    name: c.moniker || c.name,
    count: (c.npcs || []).length,
  })).sort((a, b) => b.count - a.count);
  byCount.forEach(r => console.log(`  ${String(r.count).padStart(3)}  ${r.name}`));

  // ── 2. character.touchstones[] ────────────────────────────────────────────
  sub('2. character.touchstones[]');
  const charsWithTs = await characters.find(
    { 'touchstones.0': { $exists: true } },
    { projection: { name: 1, moniker: 1, honorific: 1, clan: 1, touchstones: 1 } }
  ).toArray();
  console.log(`Characters with at least one touchstone: ${charsWithTs.length}`);
  const tsTotal = charsWithTs.reduce((sum, c) => sum + (c.touchstones?.length || 0), 0);
  console.log(`Total touchstone entries: ${tsTotal}`);

  let alreadyLinked = 0;
  let objectTouchstones = 0;
  let overCap = 0;
  let outOfRange = 0;
  const humanityDist = new Map();
  const outOfRangeRows = [];
  const overCapRows = [];

  for (const c of charsWithTs) {
    const anchor = anchorFor(c.clan);
    const minRating = Math.max(1, anchor - 5);
    const ts = c.touchstones || [];
    if (ts.length > 6) {
      overCap += 1;
      overCapRows.push({ name: c.moniker || c.name, clan: c.clan, count: ts.length });
    }
    for (const t of ts) {
      const h = t.humanity;
      humanityDist.set(h, (humanityDist.get(h) || 0) + 1);
      if (typeof t.edge_id === 'string' && t.edge_id) alreadyLinked += 1;
      else objectTouchstones += 1;
      if (!Number.isInteger(h) || h < minRating || h > anchor) {
        outOfRange += 1;
        outOfRangeRows.push({
          char: c.moniker || c.name,
          clan: c.clan || '(none)',
          anchor,
          humanity: h,
          name: t.name,
        });
      }
    }
  }
  console.log(`\nAlready linked (edge_id present): ${alreadyLinked}`);
  console.log(`Object touchstones (no edge_id):  ${objectTouchstones}`);
  console.log(`Over the cap of 6:                ${overCap}`);
  console.log(`Humanity out of anchor range:      ${outOfRange}`);

  console.log('\nHumanity distribution across all touchstones:');
  [...humanityDist.entries()].sort((a, b) => b[0] - a[0]).forEach(([h, n]) => {
    console.log(`  H${String(h).padStart(2)}  ${String(n).padStart(4)}  ${'█'.repeat(Math.min(n, 40))}`);
  });

  if (overCapRows.length > 0) {
    console.log('\nCharacters exceeding 6 touchstones (would be SKIPPED by migration):');
    overCapRows.forEach(r => console.log(`  [${r.count} touchstones] ${r.name} (${r.clan})`));
  }

  if (outOfRangeRows.length > 0) {
    console.log('\nTouchstones outside anchor range (would be FLAGGED in report):');
    outOfRangeRows.forEach(r => console.log(
      `  ${r.char} (${r.clan}, anchor=${r.anchor}): H${r.humanity} "${r.name}"`
    ));
  }

  // ── 3. npcs collection ────────────────────────────────────────────────────
  sub('3. npcs collection');
  const totalNpcs = await npcs.countDocuments();
  const withLinked = await npcs.countDocuments({ 'linked_character_ids.0': { $exists: true } });
  const correspondents = await npcs.countDocuments({ is_correspondent: true });
  const correspondentsWithLinks = await npcs.countDocuments({
    is_correspondent: true,
    'linked_character_ids.0': { $exists: true },
  });
  const stSuggestedFor = await npcs.countDocuments({ 'st_suggested_for.0': { $exists: true } });

  console.log(`Total NPCs:                                  ${totalNpcs}`);
  console.log(`With linked_character_ids (any):             ${withLinked}`);
  console.log(`is_correspondent = true:                     ${correspondents}`);
  console.log(`is_correspondent=true AND linked_character:  ${correspondentsWithLinks}`);
  console.log(`With st_suggested_for (any):                 ${stSuggestedFor}`);

  const byStatus = await npcs.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();
  console.log('\nNPCs by status:');
  byStatus.forEach(r => console.log(`  ${String(r.n).padStart(4)}  ${r._id ?? '(none)'}`));

  // ── 4. relationships · kind=touchstone orphans ────────────────────────────
  sub('4. relationships · kind=touchstone orphans');
  const touchstoneEdges = await relationships.find({ kind: 'touchstone' }).toArray();
  console.log(`Total touchstone edges: ${touchstoneEdges.length}`);

  const byStatusEdges = touchstoneEdges.reduce((m, e) => {
    m[e.status || '(none)'] = (m[e.status || '(none)'] || 0) + 1;
    return m;
  }, {});
  console.log('By status:');
  for (const [s, n] of Object.entries(byStatusEdges)) {
    console.log(`  ${String(n).padStart(4)}  ${s}`);
  }

  // Collect all edge_ids referenced by any character.touchstones[].edge_id
  const referencedEdgeIds = new Set();
  for (const c of charsWithTs) {
    for (const t of (c.touchstones || [])) {
      if (typeof t.edge_id === 'string' && t.edge_id) {
        referencedEdgeIds.add(String(t.edge_id));
      }
    }
  }
  const orphans = touchstoneEdges.filter(
    e => e.status !== 'retired' && !referencedEdgeIds.has(String(e._id))
  );
  console.log(`\nReferenced by character.touchstones[].edge_id: ${referencedEdgeIds.size}`);
  console.log(`Active touchstone edges with NO character reference (orphans): ${orphans.length}`);
  if (orphans.length > 0) {
    console.log('\nOrphan touchstone edges (consider retiring manually):');
    orphans.forEach(e => {
      const pcEp = e.a?.type === 'pc' ? e.a : e.b;
      const npcEp = e.a?.type === 'npc' ? e.a : e.b;
      console.log(`  ${String(e._id)}  pc=${pcEp?.id} npc=${npcEp?.id} H=${e.touchstone_meta?.humanity}  created_at=${e.created_at}`);
    });
  }

  hdr('Audit complete · no writes performed');
  await client.close();
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
