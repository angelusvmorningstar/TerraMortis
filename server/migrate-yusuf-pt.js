#!/usr/bin/env node

// Adds missing Professional Training merit to Yusuf Kalusicj and removes
// erroneous nine_again: false from his three PT asset skills (Intimidation,
// Empathy, Investigation).
//
// PT details (sighted on character sheet):
//   Rating:       5
//   Role:         Wet-Interrogator
//   Asset skills: Intimidation, Empathy, Investigation
//   Dot 4:        +1 dot in Intimidation
//
// The stored nine_again: false on asset skills is cleaned up so the
// applyDerivedMerits auto-detection (via _pt_nine_again_skills) is unambiguous.
//
// Safe to run multiple times — PT is only added if not already present.
//
// Usage:
//   cd server && node migrate-yusuf-pt.js           (prompts for confirmation)
//   cd server && node migrate-yusuf-pt.js --confirm (skip prompt)

import { createInterface } from 'node:readline';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const CHAR_NAME = 'Yusuf Kalusicj';

const PT_MERIT = {
  category: 'standing',
  name: 'Professional Training',
  rating: 5,
  role: 'Wet-Interrogator',
  asset_skills: ['Intimidation', 'Empathy', 'Investigation'],
  dot4_skill: 'Intimidation',
  active: true,
  benefits: ['', '', '', '', ''],
  benefit_grants: [null, null, null, null, null],
};

const ASSET_SKILLS = ['Intimidation', 'Empathy', 'Investigation'];

async function run(skipPrompt) {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'tm_suite');
  const col = db.collection('characters');

  const char = await col.findOne({ name: CHAR_NAME });
  if (!char) {
    console.error(`Character "${CHAR_NAME}" not found.`);
    await client.close();
    process.exit(1);
  }

  const hasPT = (char.merits || []).some(m => m.name === 'Professional Training');
  if (hasPT) {
    console.log('PT already present — nothing to do.');
    await client.close();
    return;
  }

  // Build unset patch for nine_again: false on asset skills
  const unsetPatch = {};
  for (const sk of ASSET_SKILLS) {
    const skillObj = char.skills?.[sk];
    if (skillObj && skillObj.nine_again === false) {
      unsetPatch[`skills.${sk}.nine_again`] = '';
    }
  }

  console.log(`\nTarget: ${CHAR_NAME}`);
  console.log('Action: push Professional Training (rating 5, Wet-Interrogator)');
  console.log('Asset skills with nine_again auto-detected via PT:', ASSET_SKILLS.join(', '));
  if (Object.keys(unsetPatch).length) {
    console.log('Clearing erroneous nine_again: false from:', Object.keys(unsetPatch).map(k => k.split('.')[1]).join(', '));
  }

  if (!skipPrompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => rl.question('\nProceed? (y/N) ', ans => {
      rl.close();
      if (ans.toLowerCase() !== 'y') { console.log('Aborted.'); process.exit(0); }
      resolve();
    }));
  }

  const updateOp = { $push: { merits: PT_MERIT } };
  if (Object.keys(unsetPatch).length) updateOp.$unset = unsetPatch;

  const result = await col.updateOne({ name: CHAR_NAME }, updateOp);
  console.log(`\nUpdated ${result.modifiedCount} document.`);
  console.log('Done.');

  await client.close();
}

const skipPrompt = process.argv.includes('--confirm');
run(skipPrompt).catch(err => { console.error(err); process.exit(1); });
