#!/usr/bin/env node

/**
 * Seed the purchasable_powers collection from JSON extracts.
 *
 * Transforms merits, disciplines, devotions, manoeuvres, attributes, and skills
 * from json_data_from_js/ into the unified purchasable_power schema and inserts
 * into MongoDB.
 *
 * Usage: cd server && node scripts/seed-purchasable-powers.js
 *        MONGODB_URI must be set in .env or environment.
 *
 * Idempotent: drops and re-creates the collection on each run.
 */

import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import Ajv from 'ajv';
import 'dotenv/config';
import { parsePrereq, getWarnings, clearWarnings } from './lib/parse-prereq.js';
import { purchasablePowerSchema } from '../schemas/purchasable_power.schema.js';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

// ── Helpers ──

function slugify(str) {
  return str.toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Generate a unique key by prefixing category for types that collide. */
function makeKey(category, name) {
  const slug = slugify(name);
  // Devotions and rites share names with discipline powers — prefix to avoid collisions
  if (category === 'devotion' || category === 'rite') return `${category}-${slug}`;
  return slug;
}

function parseRatingRange(ratingStr) {
  if (!ratingStr) return null;
  const m = ratingStr.match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  const single = parseInt(ratingStr, 10);
  if (!isNaN(single)) return [single, single];
  return null;
}

// ── Load source files ──

const BASE = new URL('../../json_data_from_js/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, BASE), 'utf8'));

const meritsDB = load('merits_db.json');
const devotionsDB = load('devotions_db.json');
const disciplinesDB = load('disciplines_db.json');
const manoeuvresDB = load('manoeuvres_db.json');
const constants = load('constants.json');

// ── Transform functions ──

// Merit sub-category mapping — intrinsic to the merit, not the character instance
const DOMAIN_MERITS = new Set(['safe place', 'haven', 'feeding grounds', 'herd', 'mandragora garden']);
const INFLUENCE_MERITS = new Set(['allies', 'contacts', 'mentor', 'resources', 'retainer', 'staff', 'status']);

function meritSubCategory(key, entry) {
  if (entry.special === 'standing') return 'standing';
  if (DOMAIN_MERITS.has(key)) return 'domain';
  if (INFLUENCE_MERITS.has(key)) return 'influence';
  return 'general';
}

function transformMerits() {
  const docs = [];
  for (const [key, entry] of Object.entries(meritsDB)) {
    docs.push({
      key: makeKey('merit', key),
      name: key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      category: 'merit',
      sub_category: meritSubCategory(key, entry),
      parent: entry.type || null,
      rank: null,
      rating_range: parseRatingRange(entry.rating),
      description: entry.desc || '',
      pool: null,
      resistance: null,
      cost: null,
      action: null,
      duration: null,
      prereq: parsePrereq(entry.prereq),
      exclusive: entry.excl || null,
      xp_fixed: null,
      bloodline: null,
    });
  }
  return docs;
}

function transformDisciplines() {
  const docs = [];
  for (const [name, entry] of Object.entries(disciplinesDB)) {
    // Determine if this is a rite (Cruac/Theban ritual)
    const isRite = entry.ac === 'Ritual' && (entry.d === 'Cruac' || entry.d === 'Theban');
    const category = isRite ? 'rite' : 'discipline';

    // Extract rank from numbered disciplines (e.g. "Celerity 3")
    const rankMatch = name.match(/\s+(\d+)$/);
    const rank = rankMatch ? parseInt(rankMatch[1], 10) : null;

    const hasPool = entry.a || entry.s;
    docs.push({
      key: makeKey(category, name),
      name,
      category,
      parent: entry.d || null,
      rank,
      rating_range: null,
      description: entry.ef || '',
      pool: hasPool ? {
        attr: entry.a || null,
        skill: entry.s || null,
        disc: entry.d || null,
      } : null,
      resistance: entry.r || null,
      cost: entry.c || null,
      action: entry.ac || null,
      duration: entry.du || null,
      prereq: null, // discipline prereqs are implicit (must have the discipline)
      exclusive: null,
      xp_fixed: null,
      special: null,
      bloodline: null,
    });
  }
  return docs;
}

function transformDevotions() {
  const docs = [];
  for (const dev of devotionsDB) {
    // Parse prereqs from discipline requirements
    const prereqNodes = (dev.p || []).map(p => ({
      type: 'discipline',
      name: p.disc,
      dots: p.dots,
    }));
    const prereq = prereqNodes.length > 1 ? { all: prereqNodes }
      : prereqNodes.length === 1 ? prereqNodes[0]
      : null;

    // Try to extract pool/action/duration from stats string
    let pool = null, action = null, duration = null;
    if (dev.stats) {
      const poolMatch = dev.stats.match(/Pool:\s*(.+?)\s*[•·]/);
      if (poolMatch) {
        const parts = poolMatch[1].split(/\s*\+\s*/);
        const attr = parts[0]?.trim() || null;
        const skill = parts[1]?.trim() || null;
        const disc = parts[2]?.trim() || null;
        pool = { attr, skill, disc };
      }
      const actionMatch = dev.stats.match(/(?:•·]\s*)?(Instant|Contested|Reflexive|Ritual)/);
      if (actionMatch) action = actionMatch[1];
      const durMatch = dev.stats.match(/(?:•·]\s*(?:Instant|Contested|Reflexive|Ritual)\s*[•·]\s*)(.+?)$/);
      if (durMatch) duration = durMatch[1].trim();
    }

    // Determine parent discipline (use first prereq disc, or null if cross-discipline)
    const parentDisc = dev.p?.length === 1 ? dev.p[0].disc : null;

    docs.push({
      key: makeKey('devotion', dev.n),
      name: dev.n,
      category: 'devotion',
      parent: parentDisc,
      rank: null,
      rating_range: null,
      description: dev.effect || '',
      pool,
      resistance: null,
      cost: dev.cost || null,
      action,
      duration,
      prereq,
      exclusive: null,
      xp_fixed: dev.xp || null,
      special: null,
      bloodline: dev.bl || null,
    });
  }
  return docs;
}

function transformManoeuvres() {
  const docs = [];
  for (const [key, entry] of Object.entries(manoeuvresDB)) {
    const rank = entry.rank ? parseInt(entry.rank, 10) : null;
    docs.push({
      key: makeKey('manoeuvre', entry.name || key),
      name: entry.name || key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      category: 'manoeuvre',
      parent: entry.style || null,
      rank: isNaN(rank) ? null : rank,
      rating_range: null,
      description: entry.effect || '',
      pool: null,
      resistance: null,
      cost: null,
      action: null,
      duration: null,
      prereq: parsePrereq(entry.prereq),
      exclusive: null,
      xp_fixed: null,
      special: null,
      bloodline: null,
    });
  }
  return docs;
}

function transformAttributes() {
  const SKILL_CATS = constants.SKILL_CATS || {};
  // Build attr category mapping from ATTR_CATS or manually
  const ATTR_CATS = {
    Intelligence: 'Mental', Wits: 'Mental', Resolve: 'Mental',
    Strength: 'Physical', Dexterity: 'Physical', Stamina: 'Physical',
    Presence: 'Social', Manipulation: 'Social', Composure: 'Social',
  };

  const attrs = constants.ALL_ATTRS || [];
  return attrs.map(name => ({
    key: makeKey('attribute', name),
    name,
    category: 'attribute',
    parent: ATTR_CATS[name] || null,
    rank: null,
    rating_range: [1, 5],
    description: '',
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
  }));
}

function transformSkills() {
  const SKILL_CATS = constants.SKILL_CATS || {};
  const allSkills = constants.ALL_SKILLS || [];

  // Build reverse mapping: skill → category
  const skillToCategory = {};
  for (const [cat, skills] of Object.entries(SKILL_CATS)) {
    for (const skill of skills) skillToCategory[skill] = cat;
  }

  return allSkills.map(name => ({
    key: makeKey('skill', name),
    name,
    category: 'skill',
    parent: skillToCategory[name] || null,
    rank: null,
    rating_range: [0, 5],
    description: '',
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
  }));
}

// ── Main ──

async function seed() {
  clearWarnings();

  console.log('Transforming source data...');
  const allDocs = [
    ...transformAttributes(),
    ...transformSkills(),
    ...transformDisciplines(),
    ...transformMerits(),
    ...transformDevotions(),
    ...transformManoeuvres(),
  ];

  // Validate all documents against schema before insert
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(purchasablePowerSchema);
  const invalid = [];
  for (const doc of allDocs) {
    if (!validate(doc)) {
      invalid.push({ key: doc.key, errors: validate.errors.map(e => `${e.instancePath} ${e.message}`) });
    }
  }
  if (invalid.length) {
    console.error(`SCHEMA VALIDATION FAILED: ${invalid.length} documents failed:`);
    invalid.slice(0, 10).forEach(i => console.error(`  ${i.key}:`, i.errors.join('; ')));
    if (invalid.length > 10) console.error(`  ... and ${invalid.length - 10} more`);
    process.exit(1);
  }
  console.log(`Schema validation: all ${allDocs.length} documents passed`);

  // Check for duplicate keys
  const keySet = new Set();
  const dupes = [];
  for (const doc of allDocs) {
    if (keySet.has(doc.key)) dupes.push(doc.key);
    keySet.add(doc.key);
  }
  if (dupes.length) {
    console.warn(`WARNING: ${dupes.length} duplicate keys found:`, dupes.slice(0, 10));
    // Dedupe by keeping first occurrence
    const seen = new Set();
    const deduped = allDocs.filter(doc => {
      if (seen.has(doc.key)) return false;
      seen.add(doc.key);
      return true;
    });
    allDocs.length = 0;
    allDocs.push(...deduped);
  }

  // Count by category
  const counts = {};
  for (const doc of allDocs) {
    counts[doc.category] = (counts[doc.category] || 0) + 1;
  }
  console.log('Documents by category:', counts);
  console.log('Total documents:', allDocs.length);

  // Check prereq warnings
  const warnings = getWarnings();
  if (warnings.length) {
    console.warn(`\nPrereq parsing warnings (${warnings.length}):`);
    warnings.forEach(w => console.warn('  ', w));
  }

  // Connect and seed
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db('tm_suite_dev');
    const col = db.collection('purchasable_powers');

    console.log('\nDropping existing collection...');
    await col.drop().catch(() => {});

    console.log('Inserting documents...');
    const result = await col.insertMany(allDocs);
    console.log(`Inserted ${result.insertedCount} documents`);

    // Create indexes
    await col.createIndex({ key: 1 }, { unique: true });
    await col.createIndex({ category: 1 });
    console.log('Indexes created: key (unique), category');

    // Verify
    const total = await col.countDocuments();
    console.log(`\nVerification: ${total} documents in purchasable_powers`);
    for (const [cat, count] of Object.entries(counts)) {
      const actual = await col.countDocuments({ category: cat });
      const match = actual === count ? '✓' : '✗';
      console.log(`  ${match} ${cat}: ${actual} (expected ${count})`);
    }
  } finally {
    await client.close();
  }
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
