/**
 * audit-cp-xp-dots-drift.js — READ ONLY. (issue #577)
 *
 * The editor card corner total derives its FILLED portion from cp/xp:
 *   attribute filled = baseDots + cp + floor(xp / 4)   (baseDots = 1, +1 if clan attribute)
 *   skill     filled = cp + floor(xp / 2)
 * but the DOTS drawn beside it come from the stored `dots` field. If `dots`
 * disagrees with `baseDots + cp + xp-derived`, the corner number and the
 * filled-dot count silently diverge.
 *
 * This audit reports, per character and per trait, three categories:
 *   A) ALLOCATION DRIFT   — cp and/or xp present, but dots !== baseDots+cp+floor(xp/cost)
 *   B) DOTS-ONLY (no alloc)— dots > baseDots but NO cp/xp allocation at all
 *                            (corner would under-report to baseDots; a distinct class)
 *   C) clean               — dots === expected
 *
 * The A vs B split decides the fix: pure guard-on-write only helps future
 * writes; existing B-class characters need a migration (or a render that
 * derives dots from cp/xp). Run:
 *   cd server && node -r dotenv/config scripts/audit-cp-xp-dots-drift.js dotenv_config_path=../.env
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) { console.error('MONGODB_URI not set'); process.exit(1); }
const DB_NAME = process.env.MONGODB_DB || 'tm_suite';

const ATTRS = ['Intelligence','Wits','Resolve','Strength','Dexterity','Stamina','Presence','Manipulation','Composure'];

function xpToDots(xp, cost) { return Math.floor((xp || 0) / cost); }

function classify(stored, baseDots, cp, xp, cost) {
  const hasAlloc = (cp || 0) > 0 || (xp || 0) > 0;
  const expected = baseDots + (cp || 0) + xpToDots(xp, cost);
  if (stored == null) return { cat: 'missing-dots', expected, stored };
  if (stored === expected) return { cat: 'clean', expected, stored };
  if (!hasAlloc && stored > baseDots) return { cat: 'B-dots-only', expected, stored };
  return { cat: 'A-alloc-drift', expected, stored };
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const chars = await db.collection('characters')
    .find({}, { projection: { name: 1, clan_attribute: 1, retired: 1, attributes: 1, skills: 1 } })
    .toArray();

  const tally = { A: 0, B: 0, clean: 0, missing: 0 };
  const charsWithA = new Set(), charsWithB = new Set();
  const rows = [];

  for (const c of chars) {
    const lines = [];
    // Attributes
    for (const a of ATTRS) {
      const ao = (c.attributes || {})[a];
      if (!ao) continue;
      const baseDots = 1 + (c.clan_attribute === a ? 1 : 0);
      const r = classify(ao.dots, baseDots, ao.cp, ao.xp, 4);
      if (r.cat === 'A-alloc-drift') { tally.A++; charsWithA.add(c.name); lines.push(`    ATTR ${a}: stored ${r.stored} != expected ${r.expected} (base ${baseDots}, cp ${ao.cp||0}, xp ${ao.xp||0}) [A]`); }
      else if (r.cat === 'B-dots-only') { tally.B++; charsWithB.add(c.name); lines.push(`    ATTR ${a}: stored ${r.stored}, NO cp/xp -> corner would show ${baseDots} [B]`); }
      else if (r.cat === 'missing-dots') { tally.missing++; }
      else tally.clean++;
    }
    // Skills
    for (const [s, so] of Object.entries(c.skills || {})) {
      if (!so) continue;
      const r = classify(so.dots, 0, so.cp, so.xp, 2);
      if (r.cat === 'A-alloc-drift') { tally.A++; charsWithA.add(c.name); lines.push(`    SKILL ${s}: stored ${r.stored} != expected ${r.expected} (cp ${so.cp||0}, xp ${so.xp||0}) [A]`); }
      else if (r.cat === 'B-dots-only') { tally.B++; charsWithB.add(c.name); lines.push(`    SKILL ${s}: stored ${r.stored}, NO cp/xp -> corner would show 0 [B]`); }
      else if (r.cat === 'missing-dots') { tally.missing++; }
      else tally.clean++;
    }
    if (lines.length) rows.push(`${c.retired ? '[retired] ' : ''}${c.name}\n${lines.join('\n')}`);
  }

  console.log('='.repeat(90));
  console.log(`cp/xp-vs-dots DRIFT AUDIT — ${chars.length} characters`);
  console.log('='.repeat(90));
  console.log(rows.length ? rows.join('\n') : '(no per-trait mismatches)');
  console.log('-'.repeat(90));
  console.log(`Category A (allocation drift, cp/xp present but dots wrong): ${tally.A} traits across ${charsWithA.size} characters`);
  console.log(`Category B (dots-only, NO cp/xp allocation):                ${tally.B} traits across ${charsWithB.size} characters`);
  console.log(`Clean traits: ${tally.clean} | missing-dots fields: ${tally.missing}`);
  console.log('');
  console.log(`Chars with A: ${[...charsWithA].join(', ') || '(none)'}`);
  console.log(`Chars with B: ${[...charsWithB].join(', ') || '(none)'}`);
  console.log('='.repeat(90));

  await client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
