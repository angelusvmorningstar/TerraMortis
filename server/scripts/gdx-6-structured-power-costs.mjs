/**
 * gdx.6 (#987) migration: derive structured `vitae_cost`/`willpower_cost`/
 * `cost_note` on `purchasable_powers` from the existing free-text `cost`
 * field, for `discipline`/`devotion`/`rite` rows only (the only three
 * categories that ever carry a non-null `cost` in live data — confirmed by
 * this story's own investigation, see its Dev Notes). Manual, ST-invoked,
 * one-off. Nothing calls this on server boot; the vitest suite imports its
 * exported functions and runs them against `tm_suite_test` only.
 *
 * NO `#!/usr/bin/env node` SHEBANG, deliberately — this script is imported
 * directly by its own test suite, and vitest's transform fails on a
 * shebang with a bare, location-less SyntaxError that silently takes down
 * the whole test file (documented at length in CLAUDE.md and in every
 * sibling migration script's own header, e.g.
 * migrate-office-purchases-to-seats.mjs). Run this with an explicit `node`.
 *
 * ==========================================================================
 *   RUNNING THIS FOR REAL IS ANGELUS'S ACTION, NOT AN AGENT'S.
 * ==========================================================================
 *
 *   Connection comes from `../db.js` (MONGODB_URI via config.js, database
 *   name from MONGODB_DB, defaulting to `tm_suite`). Running this bare from
 *   `server/` with `server/.env` in place therefore targets LIVE Atlas.
 *   What makes that survivable is the DRY-RUN DEFAULT: without `--apply`
 *   this only reads, and prints exactly what it would set.
 *
 * Usage, from `server/`:
 *
 *   # preview against the configured database, no writes (the default):
 *   node scripts/gdx-6-structured-power-costs.mjs
 *
 *   # write:
 *   node scripts/gdx-6-structured-power-costs.mjs --apply
 *
 *   # write to the throwaway test database instead of live:
 *   MONGODB_DB=tm_suite_test node scripts/gdx-6-structured-power-costs.mjs --apply
 *
 * WHAT IT DOES: for every `purchasable_powers` document with
 * `category` in `['discipline', 'devotion', 'rite']`, parses `cost` into
 * one of three classifications:
 *
 *   - `zero`     — `cost` is `null` or the literal string `"-"` (both are
 *                  real, distinct sentinels the live data actually uses
 *                  for "no cost" — three devotions use `"-"` specifically).
 *                  Confirmed free to activate: `vitae_cost: 0,
 *                  willpower_cost: 0, cost_note: null`.
 *   - `parsed`   — `cost` matches a recognised shape (see
 *                  `parseCostString`'s own doc comment for the exact
 *                  patterns, built from the real live samples this story's
 *                  investigation pulled — plain "N V"/"N Vitae"/"N WP",
 *                  "N V (& or +) M WP" tolerant of the real separator/
 *                  spacing inconsistency between disciplines and rites,
 *                  "N V per effect", "N V/turn", "N V (qualifier)").
 *   - `unparsed` — everything else (a genuine choice like "Free / 1 V" or
 *                  "1 W (Opt 1 V)", a range like "3–9 V & 1 WP", "Varies",
 *                  or a devotion whose cost is a health-damage cost plus an
 *                  unquantified "+ Vitae"). `vitae_cost: null,
 *                  willpower_cost: null`, and `cost_note` is the row's own
 *                  original `cost` string VERBATIM — never summarised or
 *                  fabricated, so an ST reviewing the plan output sees
 *                  exactly what a player would see on the sheet today.
 *
 * This migration NEVER touches, overwrites, or deletes the existing `cost`
 * string field — purely additive. `cost` remains the permanent display
 * fallback of last resort (see `fmtRuleStats` in
 * public/js/suite/sheet-helpers.js).
 *
 * IDEMPOTENT BY CONSTRUCTION, not by a guard: `planCostMigration` is a pure
 * re-derivation from each row's own stable `cost` string, not a stateful
 * diff against a prior run, so applying twice writes the same three values
 * both times. No duplicate-detection logic is needed here (unlike, say, a
 * ledger-insert migration, which genuinely needs one) — this is a plain
 * `updateOne` `$set` per row, not an insert.
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { connectDb, getCollection, closeDb } from '../db.js';

/** The only categories that ever carry a non-null `cost` in live data
 *  (confirmed 2026-08-15: 0 of 9 attributes, 24 skills, 178 manoeuvres, or
 *  230 merits carry one). "Activation cost" is not a concept that applies
 *  to the other four categories, so they are never touched by this
 *  migration — not even to explicitly null the new fields. */
export const COST_CATEGORIES = ['discipline', 'devotion', 'rite'];

// Matches "V" or the spelled-out "Vitae" as the same unit (The Taste of
// Things Lived's own live cost is "1 Vitae", not an abbreviation).
const VITAE_UNIT = '(?:V(?:itae)?)';

const RE_ZERO_SENTINEL = /^-$/;
const RE_VITAE_ONLY = new RegExp(`^(\\d+)\\s*${VITAE_UNIT}$`, 'i');
const RE_WP_ONLY = /^(\d+)\s*WP$/i;
// Tolerant of the real live spacing inconsistency around the separator
// ("2 V +1 WP", "3 V + 1WP", "1 V & 1 WP") and of the two different
// separator tokens disciplines ("&") and rites ("+") actually use.
const RE_COMBO = new RegExp(`^(\\d+)\\s*${VITAE_UNIT}\\s*[&+]\\s*(\\d+)\\s*WP$`, 'i');
const RE_PER_EFFECT = new RegExp(`^(\\d+)\\s*${VITAE_UNIT}\\s+per\\s+effect$`, 'i');
const RE_PER_TURN = new RegExp(`^(\\d+)\\s*${VITAE_UNIT}\\s*/\\s*turn$`, 'i');
// "1 V (0 in bond)" — a real mechanical qualifier (a blood-bond exception),
// kept verbatim in cost_note rather than discarded.
const RE_QUALIFIED = new RegExp(`^(\\d+)\\s*${VITAE_UNIT}\\s*\\(([^)]+)\\)$`, 'i');

/**
 * Pure classifier for one `cost` string. Never throws — an unrecognised
 * shape is always `unparsed`, never a crash, since this runs unattended
 * over real, messy, human-authored rulebook text. Review finding: a
 * non-string, non-null `cost` (the schema types it `['string','null']`, but
 * this function does not trust that blindly — a hand-malformed document is
 * a real possibility, not a hypothetical) is treated as `unparsed` rather
 * than crashing on `.trim()`. An empty or whitespace-only string is folded
 * into `zero` (the same "no cost" meaning as `null`/`"-"`), not `unparsed`
 * with a garbage-looking `cost_note`.
 *
 * @param {string|null} cost
 * @returns {{classification: 'zero'|'parsed'|'unparsed', vitae_cost: number|null, willpower_cost: number|null, cost_note: string|null}}
 */
export function parseCostString(cost) {
  if (cost == null) {
    return { classification: 'zero', vitae_cost: 0, willpower_cost: 0, cost_note: null };
  }
  if (typeof cost !== 'string') {
    return { classification: 'unparsed', vitae_cost: null, willpower_cost: null, cost_note: String(cost) };
  }

  const trimmed = cost.trim();
  if (trimmed === '' || RE_ZERO_SENTINEL.test(trimmed)) {
    return { classification: 'zero', vitae_cost: 0, willpower_cost: 0, cost_note: null };
  }

  let m = RE_COMBO.exec(trimmed);
  if (m) {
    return { classification: 'parsed', vitae_cost: Number(m[1]), willpower_cost: Number(m[2]), cost_note: null };
  }

  m = RE_PER_EFFECT.exec(trimmed);
  if (m) {
    return { classification: 'parsed', vitae_cost: Number(m[1]), willpower_cost: 0, cost_note: 'per effect' };
  }

  m = RE_PER_TURN.exec(trimmed);
  if (m) {
    return { classification: 'parsed', vitae_cost: Number(m[1]), willpower_cost: 0, cost_note: 'per turn' };
  }

  m = RE_QUALIFIED.exec(trimmed);
  if (m) {
    // Review finding: the capture allows whitespace-only parenthetical
    // content ("5 V (   )"); trimming that down to '' would violate
    // cost_note's own "null, or a meaningful qualifier" contract and read
    // as a silently-dropped note to fmtCostLine. Treat as no qualifier.
    const qualifier = m[2].trim();
    return { classification: 'parsed', vitae_cost: Number(m[1]), willpower_cost: 0, cost_note: qualifier || null };
  }

  m = RE_VITAE_ONLY.exec(trimmed);
  if (m) {
    return { classification: 'parsed', vitae_cost: Number(m[1]), willpower_cost: 0, cost_note: null };
  }

  m = RE_WP_ONLY.exec(trimmed);
  if (m) {
    return { classification: 'parsed', vitae_cost: 0, willpower_cost: Number(m[1]), cost_note: null };
  }

  // Genuine choices ("Free / 1 V", "1 W (Opt 1 V)"), ranges ("3–9 V & 1 WP"),
  // "Varies", and health-damage-plus-unquantified-Vitae devotion costs all
  // fall here. The original text is preserved verbatim (trimmed of
  // surrounding whitespace only — never otherwise altered) — refuse to guess.
  return { classification: 'unparsed', vitae_cost: null, willpower_cost: null, cost_note: trimmed };
}

/**
 * PURE: reads only, no writes, no side effects, so `main()` can print the
 * whole plan before anyone decides whether to run it.
 *
 * Takes the collection as an ARGUMENT rather than resolving it internally,
 * so a test can hand over a `tm_suite_test` collection and this can never
 * reach live data by accident.
 *
 * @param {import('mongodb').Collection} powersCollection
 * @returns {Promise<{zero: object[], parsed: object[], unparsed: object[], counts: {zero:number, parsed:number, unparsed:number, total:number}}>}
 */
export async function planCostMigration(powersCollection) {
  const docs = await powersCollection.find({ category: { $in: COST_CATEGORIES } }).toArray();

  const zero = [];
  const parsed = [];
  const unparsed = [];

  for (const doc of docs) {
    const result = parseCostString(doc.cost ?? null);
    const row = {
      _id: doc._id,
      name: doc.name,
      category: doc.category,
      cost: doc.cost ?? null,
      vitae_cost: result.vitae_cost,
      willpower_cost: result.willpower_cost,
      cost_note: result.cost_note,
    };
    if (result.classification === 'zero') zero.push(row);
    else if (result.classification === 'parsed') parsed.push(row);
    else unparsed.push(row);
  }

  return {
    zero, parsed, unparsed,
    counts: { zero: zero.length, parsed: parsed.length, unparsed: unparsed.length, total: docs.length },
  };
}

/**
 * Carry out (or, by default, merely narrate) the plan. Every row in every
 * bucket gets written — `unparsed` rows still get an explicit
 * `vitae_cost: null, willpower_cost: null, cost_note: <original text>`,
 * which is itself real, useful, structured information (distinct from the
 * field being entirely absent on a category this migration never touches).
 *
 * @param {import('mongodb').Collection} powersCollection
 * @param {{zero: object[], parsed: object[], unparsed: object[]}} plan - the output of `planCostMigration`
 * @param {{ apply?: boolean, log?: Function }} opts
 * @returns {Promise<{written:number}>}
 */
export async function applyCostMigration(powersCollection, plan, { apply = false, log = () => {} } = {}) {
  let written = 0;
  const allRows = [...plan.zero, ...plan.parsed, ...plan.unparsed];

  for (const row of allRows) {
    const update = {
      vitae_cost: row.vitae_cost,
      willpower_cost: row.willpower_cost,
      cost_note: row.cost_note,
    };

    if (!apply) {
      log(`  [DRY RUN] ${row.category} '${row.name}': cost=${JSON.stringify(row.cost)} -> ` +
          `vitae_cost=${update.vitae_cost}, willpower_cost=${update.willpower_cost}, cost_note=${JSON.stringify(update.cost_note)}`);
      continue;
    }

    await powersCollection.updateOne({ _id: row._id }, { $set: update });
    written += 1;
    log(`  set      : ${row.category} '${row.name}' -> vitae_cost=${update.vitae_cost}, willpower_cost=${update.willpower_cost}`);
  }

  return { written };
}

export async function main(argv = process.argv) {
  const apply = argv.includes('--apply');
  const dbName = process.env.MONGODB_DB || 'tm_game';

  console.log(`Mode     : ${apply ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${dbName}`);
  console.log('');

  await connectDb();
  try {
    const powersCollection = getCollection('purchasable_powers');
    const plan = await planCostMigration(powersCollection);

    console.log(`${plan.counts.total} document(s) across ${COST_CATEGORIES.join('/')}.`);
    console.log(`  ${plan.counts.zero} confirmed zero-cost, ${plan.counts.parsed} parsed, ${plan.counts.unparsed} unparsed.`);
    console.log('');

    if (plan.unparsed.length) {
      // Review finding: this used to say "left as cost_note only", which
      // undersold it — every unparsed row also gets an explicit
      // vitae_cost/willpower_cost: null written (see applyCostMigration's
      // own doc comment), not left untouched or "lighter" than a parsed row.
      console.log('UNPARSED — needs ST review. vitae_cost/willpower_cost will be set to null, cost_note to the text below:');
      for (const row of plan.unparsed) {
        console.log(`  ${row.category} '${row.name}': ${JSON.stringify(row.cost)}`);
      }
      console.log('');
    }

    const result = await applyCostMigration(powersCollection, plan, { apply, log: msg => console.log(msg) });

    console.log('');
    if (apply) {
      console.log(`Wrote ${result.written} document(s).`);
      console.log('Idempotency check: re-run with --apply and confirm the same values are written again (this is expected — see the header comment).');
    } else {
      console.log('Re-run with --apply to write.');
    }
  } finally {
    await closeDb();
  }
}

// Auto-run only when invoked directly, never when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
