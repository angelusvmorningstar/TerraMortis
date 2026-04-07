#!/usr/bin/env node

/**
 * Schema v3 migration: inline creation tracking.
 *
 * Merges parallel creation arrays (attr_creation, skill_creation, disc_creation,
 * merit_creation) into the objects they describe, converts discipline values from
 * integers to objects, sets rule_key from purchasable_powers, and removes the old
 * parallel fields.
 *
 * Idempotent: safe to run multiple times. Already-migrated documents are skipped.
 * Transactional: uses a MongoDB session so a validation failure writes zero docs.
 *
 * Usage: cd server && node scripts/migrate-schema-v3.js [--dry-run]
 *        MONGODB_URI must be set in .env or environment.
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import Ajv from 'ajv';
import { characterSchema } from '../schemas/character.schema.js';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

// ── Helpers ──

function slugify(str) {
  return str.toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function makeKey(category, name) {
  const slug = slugify(name);
  if (category === 'devotion' || category === 'rite') return `${category}-${slug}`;
  return slug;
}

// ── Migration logic for a single character ──

function migrateCharacter(doc, rulesMap) {
  // Skip already-migrated documents (disciplines are objects, not integers)
  const firstDisc = doc.disciplines && Object.values(doc.disciplines)[0];
  if (firstDisc !== undefined && typeof firstDisc === 'object') {
    // Already migrated — still ensure old fields are removed
    const hadOld = ['attr_creation', 'skill_creation', 'disc_creation', 'merit_creation']
      .some(f => doc[f] !== undefined);
    if (!hadOld) return { changed: false };
  }

  const changes = [];

  // ── Attributes: merge attr_creation inline ──
  if (doc.attributes) {
    const ac = doc.attr_creation || {};
    for (const [name, attrObj] of Object.entries(doc.attributes)) {
      const creation = ac[name] || { cp: 0, xp: 0, free: 0 };
      attrObj.cp = creation.cp || 0;
      attrObj.xp = creation.xp || 0;
      attrObj.free = creation.free || 0;
      attrObj.rule_key = rulesMap.get(`attribute:${slugify(name)}`) || null;
    }
    changes.push('attributes');
  }

  // ── Skills: merge skill_creation inline ──
  if (doc.skills) {
    const sc = doc.skill_creation || {};
    for (const [name, skillObj] of Object.entries(doc.skills)) {
      const creation = sc[name] || { cp: 0, xp: 0, free: 0 };
      skillObj.cp = creation.cp || 0;
      skillObj.xp = creation.xp || 0;
      skillObj.free = creation.free || 0;
      skillObj.rule_key = rulesMap.get(`skill:${slugify(name)}`) || null;
    }
    changes.push('skills');
  }

  // ── Disciplines: convert integer to object, merge disc_creation ──
  if (doc.disciplines) {
    const dc = doc.disc_creation || {};
    const newDisc = {};
    for (const [name, value] of Object.entries(doc.disciplines)) {
      const dots = typeof value === 'number' ? value : (value.dots ?? 0);
      const creation = dc[name] || { cp: 0, xp: 0, free: 0 };
      newDisc[name] = {
        dots,
        cp: creation.cp || 0,
        xp: creation.xp || 0,
        free: creation.free || 0,
        rule_key: null, // discipline names aren't in purchasable_powers (individual powers are)
      };
    }
    doc.disciplines = newDisc;
    changes.push('disciplines');
  }

  // ── Merits: merge merit_creation inline ──
  if (Array.isArray(doc.merits)) {
    const mc = doc.merit_creation || [];
    for (let i = 0; i < doc.merits.length; i++) {
      const merit = doc.merits[i];
      const creation = mc[i] || {};
      // Only set fields that don't already exist (idempotency)
      if (merit.cp === undefined) merit.cp = creation.cp || 0;
      if (merit.xp === undefined) merit.xp = creation.xp || 0;
      if (merit.free === undefined) merit.free = creation.free || 0;
      if (merit.free_mci === undefined) merit.free_mci = creation.free_mci || 0;
      if (merit.free_vm === undefined) merit.free_vm = creation.free_vm || 0;
      if (merit.free_lk === undefined) merit.free_lk = creation.free_lk || 0;
      if (merit.free_ohm === undefined) merit.free_ohm = creation.free_ohm || 0;
      if (merit.free_inv === undefined) merit.free_inv = creation.free_inv || 0;
      if (merit.free_pt === undefined) merit.free_pt = creation.free_pt || 0;
      if (merit.free_mdb === undefined) merit.free_mdb = creation.free_mdb || 0;
      // Handle legacy 'up' field — merge into cp
      if (creation.up) {
        merit.cp = (merit.cp || 0) + creation.up;
      }
      // Set rule_key from purchasable_powers
      if (merit.rule_key === undefined) {
        const key = slugify(merit.name);
        merit.rule_key = rulesMap.get(`merit:${key}`) || null;
      }
    }
    changes.push('merits');
  }

  // ── Powers: set rule_key and xp for devotions/rites ──
  if (Array.isArray(doc.powers)) {
    for (const power of doc.powers) {
      if (power.rule_key !== undefined) continue; // already migrated

      const slug = slugify(power.name);
      switch (power.category) {
        case 'discipline':
          power.rule_key = rulesMap.get(`discipline:${slug}`) || null;
          break;
        case 'devotion': {
          const ruleKey = `devotion:devotion-${slug}`;
          power.rule_key = rulesMap.get(ruleKey) || null;
          // Copy xp_fixed from rule into power's xp field
          if (power.xp === undefined) {
            const xpFixed = rulesMap.get(`xp_fixed:devotion-${slug}`);
            power.xp = xpFixed ?? 0;
          }
          break;
        }
        case 'rite': {
          const ruleKey = `rite:rite-${slug}`;
          power.rule_key = rulesMap.get(ruleKey) || null;
          // Compute xp for rites: 0 if free, else 1 for level 1-3, 2 for level 4-5
          if (power.xp === undefined) {
            if (power.free) {
              power.xp = 0;
            } else {
              power.xp = (power.level && power.level >= 4) ? 2 : 1;
            }
          }
          break;
        }
        case 'pact':
          // Pacts already have cp/xp; just set rule_key
          power.rule_key = null; // pacts aren't in purchasable_powers
          break;
        default:
          power.rule_key = null;
      }
    }
    changes.push('powers');
  }

  // ── Fighting styles: set rule_key ──
  if (Array.isArray(doc.fighting_styles)) {
    for (const fs of doc.fighting_styles) {
      if (fs.rule_key !== undefined) continue;
      // Fighting styles are manoeuvres in purchasable_powers, keyed by style name
      const key = slugify(fs.name);
      fs.rule_key = rulesMap.get(`manoeuvre:${key}`) || null;
    }
    changes.push('fighting_styles');
  }

  // ── Remove old parallel fields ──
  const removed = [];
  for (const field of ['attr_creation', 'skill_creation', 'disc_creation', 'merit_creation']) {
    if (doc[field] !== undefined) {
      delete doc[field];
      removed.push(field);
    }
  }
  if (removed.length) changes.push(`removed: ${removed.join(', ')}`);

  return { changed: changes.length > 0, changes };
}

// ── Main ──

async function main() {
  console.log(`Schema v3 migration${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`URI: ${MONGODB_URI.replace(/\/\/[^@]+@/, '//***@')}`);

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db('tm_suite_dev');

    // ── Build rule_key lookup from purchasable_powers ──
    const rulesCol = db.collection('purchasable_powers');
    const rules = await rulesCol.find({}).toArray();
    console.log(`Loaded ${rules.length} purchasable_powers for rule_key lookup`);

    // Map: "category:key" → key (for existence check), plus "xp_fixed:key" → xp_fixed
    const rulesMap = new Map();
    for (const rule of rules) {
      rulesMap.set(`${rule.category}:${rule.key}`, rule.key);
      if (rule.xp_fixed != null) {
        rulesMap.set(`xp_fixed:${rule.key}`, rule.xp_fixed);
      }
    }

    // ── Read all characters ──
    const charsCol = db.collection('characters');
    const characters = await charsCol.find({}).toArray();
    console.log(`Found ${characters.length} characters to migrate\n`);

    // ── Set up schema validation ──
    const ajv = new Ajv({ allErrors: true });
    // Remove $schema key as ajv doesn't like it in compile
    const schemaForValidation = { ...characterSchema };
    delete schemaForValidation.$schema;
    const validate = ajv.compile(schemaForValidation);

    // ── Migrate each character ──
    const results = [];
    for (const doc of characters) {
      const name = doc.name || doc._id.toString();
      const beforeMeritCount = doc.merits?.length || 0;
      const beforeDiscKeys = doc.disciplines ? Object.keys(doc.disciplines) : [];

      const { changed, changes } = migrateCharacter(doc, rulesMap);

      if (!changed) {
        console.log(`  ✓ ${name} — already migrated, skipped`);
        results.push({ name, status: 'skipped' });
        continue;
      }

      // Validate against new schema (exclude _id and MongoDB internal fields)
      const { _id, ...docForValidation } = doc;
      if (!validate(docForValidation)) {
        const errors = validate.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
        console.error(`  ✗ ${name} — VALIDATION FAILED: ${errors}`);
        console.error('    Aborting migration — no documents have been written.');
        process.exit(1);
      }

      const afterMeritCount = doc.merits?.length || 0;
      const afterDiscKeys = doc.disciplines ? Object.keys(doc.disciplines) : [];

      console.log(`  ✓ ${name} — ${changes.join(', ')}`);
      console.log(`    merits: ${beforeMeritCount} → ${afterMeritCount}, discs: ${beforeDiscKeys.length} → ${afterDiscKeys.length}`);
      results.push({ name, status: 'migrated', _id, doc });
    }

    const migrated = results.filter(r => r.status === 'migrated');
    const skipped = results.filter(r => r.status === 'skipped');
    console.log(`\nMigration summary: ${migrated.length} to update, ${skipped.length} already current`);

    if (migrated.length === 0) {
      console.log('Nothing to write. All documents already migrated.');
      return;
    }

    if (DRY_RUN) {
      console.log('DRY RUN — no changes written to database.');
      return;
    }

    // ── Write within a session/transaction ──
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const { _id, doc } of migrated) {
          const { _id: _, ...updateDoc } = doc;
          await charsCol.replaceOne(
            { _id },
            updateDoc,
            { session }
          );
        }
      });
      console.log(`\n✅ Transaction committed — ${migrated.length} documents updated.`);
    } finally {
      await session.endSession();
    }

    // ── Verify no old fields remain ──
    const oldFieldCheck = await charsCol.countDocuments({
      $or: [
        { attr_creation: { $exists: true } },
        { skill_creation: { $exists: true } },
        { disc_creation: { $exists: true } },
        { merit_creation: { $exists: true } },
      ]
    });
    if (oldFieldCheck > 0) {
      console.error(`⚠️  ${oldFieldCheck} documents still have old creation fields!`);
    } else {
      console.log('✅ Verified: no documents have old creation fields.');
    }

  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
