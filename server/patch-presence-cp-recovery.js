#!/usr/bin/env node
// Recovery script: restore lost .cp (and .xp) fields on the Presence attribute
// for characters affected by the setAttrVal bug that overwrote {dots,bonus} only.
//
// What happened: setAttrVal clobbered cp/xp/free/rule_key when adjusting bonus dots.
// The stored `dots` value is still correct — we derive cp from it.
//
// Formula: dots = 1 + cp + (1 if clan_attribute === 'Presence') + xpDots
// Since xp was also wiped (assumed 0), cp = dots - 1 - (1 if clan)
//
// Usage: cd server && node patch-presence-cp-recovery.js

import { connectDb, getDb, closeDb } from './db.js';

// Affected characters — searched by legal name OR moniker
const AFFECTED_NAMES = ['Alice', 'Anichka', 'Brandy', 'Cyrus', 'Etsy', 'Jack', 'Keeper'];

async function run() {
  await connectDb();
  const db = getDb();
  const col = db.collection('characters');

  // Match on legal name OR moniker, case-insensitive prefix
  const namePatterns = AFFECTED_NAMES.map(n => new RegExp(`^${n}`, 'i'));
  const chars = await col.find({
    $or: [
      { name:    { $in: namePatterns } },
      { moniker: { $in: namePatterns } },
    ]
  }).toArray();

  console.log(`Found ${chars.length} characters to inspect:`);

  for (const c of chars) {
    const presence = c.attributes?.Presence;
    if (!presence) { console.log(`  ${c.name}: no Presence attribute — skip`); continue; }

    const storedDots = presence.dots || 0;
    const currentCp  = presence.cp  ?? null;
    const currentXp  = presence.xp  ?? null;
    const currentBonus = presence.bonus ?? 0;
    const isClan     = c.clan_attribute === 'Presence';
    const base       = 1 + (isClan ? 1 : 0);

    // Only patch if cp is missing/0 but dots > base (i.e., CP was actually spent)
    const cpShouldBe = Math.max(0, storedDots - base);

    console.log(`\n  ${c.name}:`);
    console.log(`    dots=${storedDots}, bonus=${currentBonus}, cp=${currentCp}, xp=${currentXp}, clan=${isClan}`);
    console.log(`    → recovered cp=${cpShouldBe}, xp=0`);

    if (currentCp !== null && currentCp === cpShouldBe) {
      console.log(`    [skip — cp already correct]`);
      continue;
    }

    await col.updateOne(
      { _id: c._id },
      { $set: {
        'attributes.Presence.cp':       cpShouldBe,
        'attributes.Presence.xp':       currentXp ?? 0,
        'attributes.Presence.free':     presence.free ?? 0,
        'attributes.Presence.rule_key': presence.rule_key ?? null,
      }}
    );
    console.log(`    [patched]`);
  }

  await closeDb();
  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
