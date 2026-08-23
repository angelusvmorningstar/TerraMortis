/**
 * xpl.2 — historic XP reconciliation: backfill `xp_ledger` rows for real,
 * confirmable merit purchases made in downtime cycles before the ledger
 * (xpl.1) existed. Manual, ST-invoked, one-off. Nothing calls this on
 * server boot and nothing calls it in test setup.
 *
 * NOTE FOR ANYONE TIDYING THIS FILE: there is deliberately NO
 * `#!/usr/bin/env node` shebang - a shebang breaks vitest's transform for
 * any file importing this one (see every sibling migration script's own
 * header comment for the same landmine).
 *
 * ==========================================================================
 *   RUNNING THIS FOR REAL IS ANGELUS'S OWN ACTION, NOT AN AGENT'S.
 * ==========================================================================
 *
 *   Connection comes from `../db.js` (MONGODB_URI via config.js, database
 *   name from MONGODB_DB, defaulting to `tm_suite`). Running this bare from
 *   `server/` with `server/.env` in place therefore targets LIVE Atlas. What
 *   makes that survivable is the DRY-RUN DEFAULT: without `--apply` this
 *   only reads, and prints exactly what it would do.
 *
 * BACKGROUND (specs/stories/xpl-2-historic-reconciliation.md): xpl.1's write
 * hook only ledgers XP spent from the day it shipped onward. This script
 * backfills the five real historic cycles that predate it (chapters at
 * `game_number: 3` through `7` — NOT `1`/`2`; see SCOPE below) by reading
 * each submission's `responses.xp_spend` and writing one `xp_ledger` row per
 * request that the character's CURRENT live state can actually corroborate.
 *
 * SCOPE — why game_number 3 through 7, not 1 through 6:
 *   `cm-4`'s historical renumber (2026-08-xx, already live) shifted every
 *   cycle's content forward by one `game_number`. What this story's own
 *   investigation recorded as "Game 2" through "Game 6" now lives at
 *   `game_number: 3` through `7`. `game_number: 1` (the Chapter-1 placeholder)
 *   and `game_number: 2` are BOTH excluded, for two different reasons:
 *     - `game_number: 1` has zero submissions — nothing to backfill.
 *     - `game_number: 2` has 25 real, already-published submissions, but
 *       NONE carry `responses.xp_spend` at all (confirmed by direct query,
 *       2026-08-15 and re-confirmed 2026-08-18) — the XP-request section of
 *       the downtime form did not exist yet when that cycle was processed.
 *       There is nothing structural to backfill FROM.
 *   (A separate identity question — whether `game_number: 2`'s content is
 *   what story `di-1` calls "DT1" — was resolved 2026-08-18 while dev-storying
 *   this one: it is. See `di-1-import-dt1-narratives.story.md`'s own
 *   "DO NOT --apply" flag for the full finding; it does not change this
 *   script's own scope either way, since the exclusion holds on the
 *   no-xp_spend-data fact alone.)
 *
 * CONFIRMED-ONLY, per Angelus's own ruling (this story's Context): a ledger
 * row is written ONLY when the character's current live state demonstrably
 * corroborates the historic request. Everything else is surfaced in the
 * plan's own report for manual ST review — never silently written, never
 * silently dropped.
 *
 * WHY MERIT-ONLY: a graduated merit row (`"Name|grad|current|target"`) is
 * self-describing — it states the dots-at-request-time and the target being
 * bought toward, so comparing CURRENT live rating against that target is a
 * real, meaningful check. Attribute/skill/discipline rows and flat-form
 * merit rows carry no before/after snapshot at all in this data; confirming
 * those would mean trusting the request at face value, exactly what
 * "confirmed-only" exists to avoid. See the story's own "Confirmation
 * Coverage" Dev Note for the full reasoning.
 *
 * SAME-NAMED MERITS: a character can hold more than one merit sharing a
 * name, distinguished only by `area`/`qualifier` (Allies, Contacts,
 * Retainer, Language, ...) — xpl.1's own code review (`xp-ledger-diff.js`'s
 * `meritKey` comment) already found and fixed a real bug from treating this
 * as an edge case rather than the normal shape it is. A historic
 * `xp_spend` row's `item` string carries no qualifier/area at all
 * (`"Name|grad|current|target"` only), and `xp_ledger.trait_name` has no
 * qualifier slot to record one in either — so this script cannot and does
 * not try to disambiguate WHICH same-named entry a row refers to. A
 * graduated row confirms if ANY of the character's live merit entries
 * sharing that name has reached the target rating. Verified against real
 * production data while writing this (Macheath's "Allies|grad|2|3" row:
 * his live sheet holds an "Allies" (Street) at rating 5 AND a separate
 * "Allies" (Underworld) at rating 1 — matching only the first entry, or a
 * naive last-write-wins name map, would have wrongly refused a real,
 * corroborated purchase).
 *
 * COST RECONSTRUCTION: when a row carries its own valid, non-negative
 * numeric `xpCost`, that value is used directly. When absent, or present but
 * malformed (non-numeric or negative — code review, 2026-08-18: a corrupted
 * `xpCost` used to be inserted as `NaN`/negative straight into the ledger
 * with no guard), the cost is reconstructed from this project's flat merit
 * rate, 1 XP/dot (CLAUDE.md — XP cost rates), applied to `dotsBuying` (the
 * dots THIS row requests, not the target). Real data needs this path: e.g.
 * Anichka's "Mandragora Garden|grad|0|3" row carries no `xpCost` at all.
 *
 * `new_total` — not spelled out by the story's own AC4, which lists
 * historic-specific values for `delta`/`at`/`st_username`/`reason` but is
 * silent on this field. Resolved here, not guessed: xpl.1's real write hook
 * (`server/lib/xp-ledger-diff.js`, read from the still-unmerged
 * `ms/xpl-1-xp-ledger-write-hook` branch since `xp_ledger.schema.js` does
 * not exist on `main`/`dev` yet) defines `new_total` as the trait's
 * CUMULATIVE XP-spent tally immediately after the write that produced the
 * row, not merely that write's own cost. The historic-backfill equivalent —
 * consistent across multiple confirmed rows for the same merit across
 * different cycles — is `maxTarget * MERIT_XP_RATE`: the cumulative XP the
 * confirmed target dots represent, at the point in history this specific
 * row's own claim is anchored to.
 *
 * IDEMPOTENCE (redesigned in code review, 2026-08-18 — see that section of
 * the story file for the full finding): the guard is keyed on
 * `{character_id, category: 'merit', trait_name, new_total, st_username}`,
 * NOT on the source submission id. This single change closes two real gaps
 * the original submission-id-keyed guard had:
 *   1. A submission with TWO OR MORE confirmed rows (a real shape — see
 *      SAME-NAMED MERITS above; Macheath's own submission has both a
 *      confirmed "Allies" and a confirmed "Contacts" row) used to collide:
 *      the first insert's `reason` cited the submission id, and the second
 *      row's lookup matched that same document purely on the shared id
 *      substring, so it was skipped as "already backfilled" without ever
 *      being written — on the FIRST `--apply` run, not merely a re-run.
 *   2. Two DIFFERENT submissions independently requesting the same
 *      character reach the same target on the same merit (a duplicate or
 *      resubmitted historic request) are now recognised as the same
 *      real-world purchase and credited exactly once, instead of both
 *      passing an id-scoped guard and double-inserting.
 * Two submissions requesting DIFFERENT targets for the same merit (a
 * genuine two-step purchase spread across cycles, e.g. 0→2 then 2→3) still
 * produce two distinct `new_total` values and so still produce two distinct,
 * correct rows. The `reason` string still cites the source submission id and
 * game number for traceability — it is no longer part of the dedup key.
 *
 * DEFENSIVE VALIDATION (added in code review, 2026-08-18): a graduated item
 * string missing or unable to parse its target segment (e.g. a truncated
 * `"Name|grad|2"`) used to default `maxTarget` to `0`, which any live rating
 * of `0` or higher would trivially "confirm" — now classified unconfirmable
 * as malformed instead. A negative or non-numeric `dotsBuying` used to be
 * silently treated the same as a real `0` (form-artifact) row — now reported
 * as a distinct unconfirmable row instead of silently discarded. A
 * submission whose `character_id` does not resolve to any live character
 * document used to report every one of its merit rows as "character has no
 * live merit by that name" — a misleading diagnosis that hides the real
 * problem; it now reports the missing/broken character link directly. A
 * confirmed row whose source submission has neither `submitted_at` nor
 * `created_at` used to be written with `at: null`; it is now routed to
 * `unconfirmable` instead, since `null` is not "a real historic date"
 * (AC4's own requirement).
 *
 * WHAT THIS SCRIPT DELIBERATELY DOES NOT DO: it does not modify xpl.1's
 * live write hook, does not touch any `character` document, does not
 * process `game_number: 1` or `2` (see SCOPE above), and does not guess at
 * an unconfirmable row's real disposition — every unconfirmable row is
 * reported for a human to read and act on by hand, never silently written
 * or silently dropped.
 *
 * SAFETY: DRY-RUN BY DEFAULT. `--apply` is required to write anything.
 * This story's own Definition of Done is explicit that `--apply` against
 * live `tm_suite` is NOT run by this dev-story pass; that remains
 * Angelus's own action, same convention as every other migration script.
 *
 * KNOWN, DEFERRED LIMITATION: the idempotency guard above is a non-atomic
 * check-then-insert (a `findOne` followed by `insertOne`, no unique index,
 * no transaction). Two overlapping `--apply` invocations could both pass the
 * "not found" check for the same row. Deferred as pre-existing convention,
 * not a regression this script introduces — every other one-off migration
 * script in this repo has the identical class of guard, mitigated only by
 * "a human runs this once, by hand." See specs/deferred-work.md.
 *
 * Usage, from `server/` so that cwd-relative `dotenv/config` picks up
 * `server/.env`:
 *
 *   # preview against the configured database, no writes (the default):
 *   node scripts/xpl-2-historic-xp-reconciliation.mjs
 *
 *   # write:
 *   node scripts/xpl-2-historic-xp-reconciliation.mjs --apply
 *
 *   # write to the throwaway test database instead of live:
 *   MONGODB_DB=tm_suite_test node scripts/xpl-2-historic-xp-reconciliation.mjs --apply
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { connectDb, getCollection, closeDb } from '../db.js';

/** Real, live-verified scope: the five historic cycles with structured
 * xp_spend data. See file header SCOPE for why 1 and 2 are excluded. */
export const SCOPE_GAME_NUMBERS = [3, 4, 5, 6, 7];

/** Flat merit XP rate, per CLAUDE.md's XP cost rates section. Every row this
 * script confirms is a merit row (see file header WHY MERIT-ONLY), so no
 * attribute/skill/discipline rate lookup is needed here. */
export const MERIT_XP_RATE = 1;

/**
 * Parse one `xp_spend` row's `item` string. Pure — no I/O.
 *
 * A graduated-form item missing or unable to parse its `currentDots`/
 * `maxTarget` segments returns `form: 'grad-malformed'` rather than silently
 * defaulting the missing number to `0` (code review, 2026-08-18: a `0`
 * default made `classifyRow` trivially "confirm" against any live rating).
 *
 * @param {string} item
 * @returns {{name:string, form:'grad', currentDots:number, maxTarget:number}
 *          |{name:string, form:'grad-malformed'}
 *          |{name:string, form:'flat', rating:number}
 *          |{name:string, form:string}}
 */
export function parseMeritItem(item) {
  const parts = String(item || '').split('|');
  const name = parts[0] || '';
  const form = parts[1] || '';
  if (form === 'grad') {
    const currentDots = Number(parts[2]);
    const maxTarget = Number(parts[3]);
    if (parts.length < 4 || !Number.isFinite(currentDots) || !Number.isFinite(maxTarget)) {
      return { name, form: 'grad-malformed' };
    }
    return { name, form: 'grad', currentDots, maxTarget };
  }
  if (form === 'flat') {
    return { name, form: 'flat', rating: Number(parts[2]) || 0 };
  }
  return { name, form };
}

/**
 * Parse the JSON-stringified `responses.xp_spend` field. Malformed or
 * missing input yields an empty array rather than throwing — a submission
 * with no real xp_spend content is exactly as common as one with it (see
 * story Dev Notes: 104 of ~162 submissions carry the field at all, most as
 * empty/placeholder rows).
 *
 * @param {string|undefined} raw
 * @returns {Array<{category:string, item:string, dotsBuying:number, xpCost?:number}>}
 */
export function parseXpSpendRows(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Classify one non-zero-`dotsBuying` row against a character's current live
 * merits. Pure — no I/O; `meritEntriesByName` is a pre-built
 * `Map<name, Array<meritEntry>>` (see file header SAME-NAMED MERITS for why
 * this is an array, not a single entry).
 *
 * `maxTarget`/`currentDots` are attached to BOTH confirmed and unconfirmable
 * graduated-row verdicts (code review, 2026-08-18, AC3 symmetry — the report
 * owes an ST the same "requested dots/target, current live value" detail as
 * a structured field regardless of which bucket a row lands in, not only in
 * the free-text `reason` string).
 *
 * @param {object} row - {category, item, dotsBuying, xpCost?}
 * @param {Map<string, Array<{rating?: number}>>} meritEntriesByName
 * @returns {{classification:'confirmed', trait_name:string, maxTarget:number, currentDots:number}
 *          |{classification:'unconfirmable', trait_name:string, reason:string, maxTarget?:number, currentDots?:number}}
 */
export function classifyRow(row, meritEntriesByName) {
  if (row.category !== 'merit') {
    return {
      classification: 'unconfirmable',
      trait_name: row.item || '(unnamed)',
      reason: `${row.category} row carries no before/after dots snapshot to confirm against current state`,
    };
  }

  const parsed = parseMeritItem(row.item);

  if (parsed.form === 'grad-malformed') {
    return {
      classification: 'unconfirmable',
      trait_name: parsed.name || row.item || '(unnamed)',
      reason: `graduated-form merit item "${row.item}" is malformed — cannot parse current/target dots`,
    };
  }

  if (parsed.form !== 'grad') {
    return {
      classification: 'unconfirmable',
      trait_name: parsed.name || row.item || '(unnamed)',
      reason: parsed.form === 'flat'
        ? `flat-form merit row has only a rating, no before/after target to compare against`
        : `merit row "${row.item}" is not in the expected graduated or flat form`,
    };
  }

  const entries = meritEntriesByName.get(parsed.name) || [];
  const corroborated = entries.some(m => (Number(m.rating) || 0) >= parsed.maxTarget);

  if (corroborated) {
    return {
      classification: 'confirmed',
      trait_name: parsed.name,
      maxTarget: parsed.maxTarget,
      currentDots: parsed.currentDots,
    };
  }

  const bestRating = entries.length ? Math.max(...entries.map(m => Number(m.rating) || 0)) : 0;
  return {
    classification: 'unconfirmable',
    trait_name: parsed.name,
    maxTarget: parsed.maxTarget,
    currentDots: parsed.currentDots,
    reason: entries.length
      ? `graduated merit "${parsed.name}" targets ${parsed.maxTarget} dots; best current live rating is ${bestRating}`
      : `graduated merit "${parsed.name}" targets ${parsed.maxTarget} dots; character has no live merit by that name`,
  };
}

/**
 * Walk every real submission in scope, parse its `xp_spend` rows, and
 * classify each non-zero row. PURE with respect to writes — reads only, no
 * side effects — so `main()` can print the whole plan before anyone decides
 * whether to run it.
 *
 * @param {import('mongodb').Collection} submissionsCollection
 * @param {import('mongodb').Collection} charactersCollection
 * @param {import('mongodb').Collection} chaptersCollection
 * @returns {Promise<{counts:{confirmed:number,unconfirmable:number,zero:number}, confirmed:Array<object>, unconfirmable:Array<object>}>}
 */
export async function planReconciliation(submissionsCollection, charactersCollection, chaptersCollection) {
  // Re-derive chapter ids by game_number fresh, every run — never hardcode
  // them. This project has already been burned once by a hardcoded-vs-
  // re-derived assumption going stale (see di-1's own STALE correction note).
  const chapters = await chaptersCollection.find({ game_number: { $in: SCOPE_GAME_NUMBERS } }).toArray();
  const chapterIds = chapters.map(c => c._id);
  const chapterByIdStr = new Map(chapters.map(c => [String(c._id), c]));

  const submissions = chapterIds.length
    ? await submissionsCollection
      .find({ chapter_id: { $in: chapterIds }, 'responses.xp_spend': { $exists: true, $ne: '' } })
      .toArray()
    : [];

  // Batch-fetch every character these submissions touch, once, rather than
  // one findOne per submission.
  const characters = submissions.some(s => s.character_id)
    ? await charactersCollection.find({ _id: { $in: submissions.map(s => s.character_id).filter(Boolean) } }).toArray()
    : [];
  const characterByIdStr = new Map(characters.map(c => [String(c._id), c]));

  const confirmed = [];
  const unconfirmable = [];
  let zeroCount = 0;

  for (const sub of submissions) {
    const rows = parseXpSpendRows(sub.responses?.xp_spend);
    if (!rows.length) continue;

    const character = sub.character_id ? characterByIdStr.get(String(sub.character_id)) : null;
    const characterResolved = !!character;
    const meritEntriesByName = new Map();
    for (const m of (character?.merits || [])) {
      if (!m?.name) continue;
      if (!meritEntriesByName.has(m.name)) meritEntriesByName.set(m.name, []);
      meritEntriesByName.get(m.name).push(m);
    }

    const chapter = chapterByIdStr.get(String(sub.chapter_id));
    const submittedAt = sub.submitted_at || sub.created_at || null;

    for (const row of rows) {
      const rawDotsBuying = Number(row?.dotsBuying);
      if (rawDotsBuying === 0) { zeroCount += 1; continue; } // real form artifact, per AC2

      const base = {
        submission_id: sub._id,
        character_id: sub.character_id || null,
        character_name: sub.character_name || character?.name || 'Unknown',
        game_number: chapter?.game_number ?? null,
        chapter_id: sub.chapter_id || null,
        category: row.category,
        item: row.item,
        dotsBuying: rawDotsBuying,
        xpCost: row.xpCost,
        submitted_at: submittedAt,
      };

      // A NaN (missing/non-numeric) or negative dotsBuying is not a real
      // "0 dots" form artifact — it is malformed data. Surface it, don't
      // silently fold it into the zero bucket or classify it further.
      if (!Number.isFinite(rawDotsBuying) || rawDotsBuying < 0) {
        unconfirmable.push({
          ...base,
          trait_name: row.item || '(unnamed)',
          reason: `dotsBuying is malformed or negative (${JSON.stringify(row?.dotsBuying)}) — cannot classify`,
        });
        continue;
      }

      // A merit row on a submission with no resolvable character record
      // cannot be checked against anything — report the real problem (the
      // broken/missing character link) rather than letting classifyRow's
      // empty merit map produce a misleading "no live merit by that name".
      if (row.category === 'merit' && !characterResolved) {
        unconfirmable.push({
          ...base,
          trait_name: row.item || '(unnamed)',
          reason: sub.character_id
            ? `submission's character_id (${sub.character_id}) does not resolve to any live character document — cannot verify against current state`
            : `submission carries no character_id at all — cannot verify against current state`,
        });
        continue;
      }

      const verdict = classifyRow(row, meritEntriesByName);
      const withTrait = { ...base, trait_name: verdict.trait_name };
      const withDots = verdict.maxTarget != null
        ? { ...withTrait, maxTarget: verdict.maxTarget, currentDots: verdict.currentDots }
        : withTrait;

      if (verdict.classification === 'confirmed') {
        if (!submittedAt) {
          // AC4: `at` must be "a real historic date, never now" — a source
          // submission with neither submitted_at nor created_at has no real
          // date to write. Route to unconfirmable instead of inserting null.
          unconfirmable.push({
            ...withDots,
            reason: `merit "${verdict.trait_name}" is otherwise confirmed, but the source submission has ` +
              'neither submitted_at nor created_at — cannot backfill without a real historic date',
          });
          continue;
        }
        confirmed.push(withDots);
      } else {
        unconfirmable.push({ ...withDots, reason: verdict.reason });
      }
    }
  }

  return {
    counts: { confirmed: confirmed.length, unconfirmable: unconfirmable.length, zero: zeroCount },
    confirmed,
    unconfirmable,
  };
}

/**
 * Carry out (or, by default, merely narrate) the confirmed half of the plan.
 * `unconfirmable` rows are never passed here — they are report-only, handled
 * entirely by `main()`'s own printing.
 *
 * Return shape keeps `inserted` (rows actually written, apply mode only) and
 * `wouldInsert` (rows that would be written, dry-run mode only) separate —
 * code review, 2026-08-18: a single overloaded `inserted` counter used to
 * report non-zero even in dry-run mode, a trap for any future caller of this
 * exported function that checks `result.inserted > 0` to mean "something was
 * actually written."
 *
 * @param {import('mongodb').Collection} ledgerCollection
 * @param {Array<object>} confirmedRows - the `confirmed` array from `planReconciliation`
 * @param {{ apply?: boolean, log?: Function }} [opts]
 * @returns {Promise<{inserted:number, wouldInsert:number, skipped:number}>}
 */
export async function applyReconciliation(ledgerCollection, confirmedRows, { apply = false, log = () => {} } = {}) {
  let inserted = 0;
  let wouldInsert = 0;
  let skipped = 0;

  for (const row of confirmedRows) {
    const newTotal = row.maxTarget * MERIT_XP_RATE;
    const xpCostNum = row.xpCost != null ? Number(row.xpCost) : NaN;
    const delta = (Number.isFinite(xpCostNum) && xpCostNum >= 0)
      ? xpCostNum
      : row.dotsBuying * MERIT_XP_RATE; // absent OR malformed xpCost falls back to reconstruction

    const sourceTag = String(row.submission_id);

    // Idempotency key: see file header IDEMPOTENCE. Deliberately keyed on
    // structured fields, not the source submission id, so it catches both
    // multiple confirmed rows sharing a submission AND a duplicate request
    // for the same target arriving via a different submission.
    const existing = await ledgerCollection.findOne({
      character_id: row.character_id,
      category: 'merit',
      trait_name: row.trait_name,
      new_total: newTotal,
      st_username: 'historic-reconciliation',
    });

    if (existing) {
      skipped += 1;
      log(`  SKIP (already backfilled) | ${row.character_name} — ${row.trait_name} → ${newTotal} XP (source ${sourceTag})`);
      continue;
    }

    if (!apply) {
      wouldInsert += 1;
      log(`  WOULD INSERT | ${row.character_name} — ${row.trait_name} +${delta} XP (new_total ${newTotal}, source ${sourceTag})`);
      continue;
    }

    const doc = {
      character_id: row.character_id,
      category: 'merit',
      trait_name: row.trait_name,
      delta,
      new_total: newTotal,
      at: row.submitted_at,
      st_username: 'historic-reconciliation',
      reason: `Historic backfill (xpl.2) from downtime_submissions ${sourceTag}, Game ${row.game_number}`,
    };
    await ledgerCollection.insertOne(doc);
    inserted += 1;
    log(`  INSERTED | ${row.character_name} — ${row.trait_name} +${delta} XP (source ${sourceTag})`);
  }

  return { inserted, wouldInsert, skipped };
}

export async function main(argv = process.argv) {
  const apply = argv.includes('--apply');
  const dbName = process.env.MONGODB_DB || 'tm_game';

  console.log(`Mode     : ${apply ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${dbName}`);
  console.log(`Scope    : chapters with game_number in [${SCOPE_GAME_NUMBERS.join(', ')}]`);
  console.log('');

  await connectDb();
  try {
    const chaptersCollection = getCollection('chapters');
    const submissionsCollection = getCollection('downtime_submissions');
    const charactersCollection = getCollection('characters');
    const ledgerCollection = getCollection('xp_ledger');

    const plan = await planReconciliation(submissionsCollection, charactersCollection, chaptersCollection);
    const realRows = plan.counts.confirmed + plan.counts.unconfirmable;

    console.log(`Real xp_spend rows (dotsBuying != 0): ${realRows}  (zero-dots form artifacts excluded: ${plan.counts.zero})`);
    console.log(`  confirmed:     ${plan.counts.confirmed}`);
    console.log(`  unconfirmable: ${plan.counts.unconfirmable}`);
    console.log('');

    if (plan.unconfirmable.length) {
      console.log('UNCONFIRMABLE — for manual ST review; nothing written for any of these:');
      for (const row of plan.unconfirmable) {
        console.log(`  ${row.character_name} | Game ${row.game_number} | ${row.category} "${row.item}" (+${row.dotsBuying} dots) — ${row.reason}`);
      }
      console.log('');
    }

    const result = await applyReconciliation(ledgerCollection, plan.confirmed, { apply, log: msg => console.log(msg) });
    const actioned = apply ? result.inserted : result.wouldInsert;

    console.log('');
    console.log(`Totals: ${actioned} ${apply ? 'inserted' : 'would insert'}, ${result.skipped} skipped (already backfilled).`);
    if (apply) {
      console.log('Idempotency check: re-run with --apply and confirm every row reports SKIP (already backfilled).');
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
