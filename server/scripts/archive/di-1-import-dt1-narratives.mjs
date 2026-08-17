/**
 * ARCHIVED 2026-08-18 (story di-1, resolved not reworked). Never run with
 * --apply. The target this script assumed was empty (chapters at
 * game_number: 1) is genuinely empty and correctly so — under cm-4's
 * chapter-anchor model it represents the downtime that would have preceded
 * Game 1, which never existed. The real DT1 content this script's own
 * source JSON carries (st-working/downtime/dt1/TM_downtime1_submissions.json,
 * self-identified as cycle_id:"downtime_1") was already imported to live
 * Mongo back on 2026-04-17 (439a9ebb, migrate-dt1-submissions.js) and lives
 * today at chapters/game_number:2 — confirmed word-for-word identical
 * against a live sample (Alice Vunder's "Party with Cyrus" narrative).
 * Players already see it in their Chronicle (story-tab.js's render has no
 * chapter-number gate). Nothing left for this script to do. Moved here
 * alongside migrate-dt1.js/migrate-dt1-submissions.js, the two scripts it
 * was written to replace — all three are dead code for the same reason.
 *
 * DI-1 - import the 26 Downtime 1 narratives (written before the app form
 * existed) into `downtime_submissions`, attached to the existing Chapter-1
 * placeholder (`chapters` document at `game_number: 1`). Manual, ST-invoked,
 * one-off. Nothing calls this on server boot and nothing calls it in test
 * setup.
 *
 * NOTE FOR ANYONE TIDYING THIS FILE: there is deliberately NO
 * `#!/usr/bin/env node` shebang - a shebang breaks vitest's transform for any
 * file importing this one (see dbo-1/dbo-2/dbo-8's own scripts).
 *
 * ==========================================================================
 *   RUNNING THIS FOR REAL IS ANGELUS'S ACTION, NOT AN AGENT'S.
 * ==========================================================================
 *
 *   Connection comes from `../db.js` (MONGODB_URI via config.js, database
 *   name from MONGODB_DB, defaulting to `tm_suite`). Running this bare from
 *   `server/` with `server/.env` in place therefore targets LIVE Atlas. What
 *   makes that survivable is the DRY-RUN DEFAULT: without `--apply` this only
 *   reads, and prints exactly what it would do.
 *
 * BACKGROUND (specs/stories/di-1-import-dt1-narratives.story.md): DT1 predates
 * the app form. Its 26 submissions live only in
 * `st-working/downtime/dt1/TM_downtime1_submissions.json` and in static
 * per-character .docx files. `cm-4`'s historical renumber already created the
 * Chapter-1 placeholder this script targets
 * (`chapters._id: 69f2dc48a77e2f00eb39a43c`, `game_number: 1`,
 * `placeholder: true`), precisely because no submission pointed at it yet.
 * This script is what actually attaches DT1 content there.
 *
 * WHAT IT DOES, per source record:
 *   - Resolves `character_id`. 21 of 26 records carry a real one already; the
 *     other 5 (Charles Mercer-Willows, Eve Lockridge, Ivana Horvat, Kirk
 *     Grimm, Tegan Groves) have a blank source `character_id` and are
 *     resolved by an exact live `characters.name` match INSTEAD OF a
 *     hardcoded id map. The archived `migrate-dt1.js`'s own `CHAR_ID_FIXES`
 *     map was checked against live `tm_suite` during this story's dev pass
 *     and found STALE - all 5 of its hardcoded ids belong to a prior,
 *     no-longer-live character import (`69cf7da8...` prefix); the real ids
 *     today share the `69d73ea4...` prefix the other 21 source records
 *     already carry inline. Re-deriving by name avoids repeating that same
 *     staleness bug a second time.
 *   - Re-derives the target chapter by `game_number: 1` query, never by
 *     hardcoded `_id` (though the id is expected to be
 *     `69f2dc48a77e2f00eb39a43c` as of this story's writing).
 *   - Builds `published_outcome` markdown with ONLY single-level `## `
 *     headings - one per project (title from `projects_resolved[i].title`),
 *     one per territory report is NOT used (all 26 records have exactly one
 *     territory each in practice, but the code handles more) - instead a
 *     single `## Territory Reports` heading holds every territory as its own
 *     plain-text-labelled paragraph block, and a single `## Merit Actions`
 *     heading holds every `merit_actions_resolved[i].header` line as its own
 *     paragraph. DELIBERATE DEVIATION from the archived `migrate-dt1.js`
 *     reference logic, which nested per-item `### Title` sub-headings inside
 *     one `## Projects` block: `parseOutcomeSections`
 *     (`public/js/data/helpers.js`) only treats a line starting with exactly
 *     `## ` as a heading, so a `### `-prefixed sub-heading is not consumed -
 *     it renders as LITERAL text with visible hash characters, which is
 *     exactly what this story's own AC ("no ## characters in display, no
 *     broken backticks") forbids. Giving each project its own top-level `##
 *     <Title>` heading instead avoids the leak entirely and matches the
 *     current live convention `compilePushOutcome`
 *     (`public/js/admin/downtime-story.js`) already uses for DT2/DT3 - one
 *     heading per project/territory/action - without reformatting DT1 to the
 *     full v2 six-section shape (out of this story's scope).
 *   - `merit_actions_resolved[i].header` (NOT
 *     `st_narrative.action_responses[i].response`) is the real narrative
 *     text in the source data - confirmed by reading several non-empty
 *     records directly. `action_responses[*].response` is empty-string on
 *     every record that has any merit action content at all. The archived
 *     script read the empty field; this one does not repeat that.
 *   - Writes `st_narrative` verbatim from the source (plain-string
 *     `touchstone` / `letter_from_home`, not the DTSR-2 `{status, response}`
 *     shape). This is deliberate, not an oversight: `renderStoryMoment()`
 *     (`public/js/tabs/story-tab.js`) only produces dedicated Story
 *     Moment/Home Report output when `st_narrative.<field>.response` is
 *     truthy - a plain string has no `.response` property, so it safely
 *     returns falsy and produces no output, leaving the Touchstone/Letter
 *     headings in `published_outcome` as the only render of that content.
 *     Wrapping these fields in a `{response: ...}` object would trigger a
 *     SECOND, duplicate render of the same content.
 *   - Sets `st_review.outcome_visibility: 'published'` and
 *     `st_review.outcome_text` / top-level `published_outcome` to the same
 *     assembled markdown (the client falls back to deriving `published_outcome`
 *     from `st_review.outcome_text` when absent, per `story-tab.js`, but this
 *     writes both explicitly rather than relying on that fallback).
 *   - Clears the Chapter-1 placeholder (`placeholder` / `placeholder_note`)
 *     and sets `submission_count` to the chapter's real, freshly counted
 *     `downtime_submissions` total for that `chapter_id` (re-counted after
 *     the writes, not assumed to be exactly 26, in case a `--force` re-run
 *     or a partial prior run left a different real count).
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it does not edit DT1 narrative text, does
 * not reformat DT1 to the v2 six-section shape, does not build any ST-editing
 * surface, does not touch the archived `server/scripts/archive/migrate-dt1*.js`
 * files, and does not resolve any source data-quality issue - a record is
 * either mapped as given or skipped and reported, never silently patched.
 *
 * SAFETY: DRY-RUN BY DEFAULT. `--apply` writes a JSON backup of the target
 * chapter document to
 * `server/scripts/_backups/di-1-import-dt1-narratives-<ISO>.json` BEFORE
 * issuing any update, and aborts (writes nothing) if the backup write throws.
 * Idempotent by default: an existing `(character_id, chapter_id)` submission
 * is reported "SKIP (exists)" and left untouched; pass `--force` to overwrite.
 * If the target chapter is not found by `game_number: 1`, or is found but does
 * not carry `placeholder: true` / `submission_count: 0` (live state has moved
 * since this story was written), the script HALTS and reports rather than
 * guessing or creating a new chapter.
 *
 * Usage, from `server/` so that cwd-relative `dotenv/config` picks up
 * `server/.env`:
 *
 *   # preview against the configured database, no writes (the default):
 *   node scripts/di-1-import-dt1-narratives.mjs
 *
 *   # write:
 *   node scripts/di-1-import-dt1-narratives.mjs --apply
 *
 *   # overwrite existing DT1 submissions for this chapter (re-import):
 *   node scripts/di-1-import-dt1-narratives.mjs --apply --force
 *
 *   # write to the throwaway test database instead of live:
 *   MONGODB_DB=tm_suite_test node scripts/di-1-import-dt1-narratives.mjs --apply
 */

import 'dotenv/config';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ObjectId } from 'mongodb';
import { connectDb, getCollection, closeDb } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, '_backups');

// Two levels up from server/scripts/ reaches the project root. The archived
// migrate-dt1.js's own wrong-relative-path bug (per its own header) came from
// this exact miscount when the script lived one level shallower, at
// server/ - this script lives at server/scripts/, so it needs one more `..`.
export const SOURCE_PATH = join(__dirname, '../../st-working/downtime/dt1/TM_downtime1_submissions.json');

export const DT1_LOADED_AT = '2026-02-28T00:00:00.000Z';
export const DT1_CLOSED_AT = '2026-03-13T23:59:59.000Z';

/**
 * Assemble the Chronicle-ready markdown for one DT1 source record. Pure - no
 * I/O, no DB access - so it can be exercised directly against fixture data.
 *
 * Only single-level `## ` headings are ever emitted (see the file header for
 * why). A section is omitted entirely when it has no real content, matching
 * this project's "absent, not empty-and-blank" convention elsewhere.
 *
 * @param {object} raw - one record from TM_downtime1_submissions.json
 * @returns {string}
 */
export function buildPublishedOutcome(raw) {
  const fr = raw.feeding_review || {};
  const sn = raw.st_narrative || {};
  const sections = [];

  // ── Feeding ──────────────────────────────────────────────────────────
  const feedLines = [];
  if (fr.method) feedLines.push(fr.method);
  if (fr.dice_pool) feedLines.push(fr.dice_pool);
  // best_ambience already names its own (best) territory, e.g. "The Second
  // City — +2" — only prepend the fuller territories list when it says more
  // than that (multiple territories fed in), to avoid "X — X — +2".
  if (fr.best_ambience && fr.territories && !fr.best_ambience.startsWith(fr.territories)) {
    feedLines.push(`${fr.territories} — ${fr.best_ambience}`);
  } else if (fr.best_ambience) {
    feedLines.push(fr.best_ambience);
  } else if (fr.territories) {
    feedLines.push(fr.territories);
  }
  if (feedLines.length) sections.push(`## Feeding\n${feedLines.join('\n')}`);

  // ── Projects, one top-level heading per project with a real response ───
  const projectsResolved = Array.isArray(raw.projects_resolved) ? raw.projects_resolved : [];
  const projectResponses = Array.isArray(sn.project_responses) ? sn.project_responses : [];
  projectsResolved.forEach((proj, i) => {
    const response = (projectResponses[i]?.response || '').trim();
    if (!response) return;
    const title = proj?.title || proj?.name || `Project ${i + 1}`;
    sections.push(`## ${title}\n${response}`);
  });

  // ── Touchstone / Letter — plain strings in DT1 source, written verbatim ─
  if (sn.touchstone) sections.push(`## Touchstone\n${sn.touchstone}`);
  if (sn.letter_from_home) sections.push(`## Letter\n${sn.letter_from_home}`);

  // ── Territory Reports — one heading, each territory its own paragraph ──
  const terrLines = [];
  for (const t of (Array.isArray(sn.territory_reports) ? sn.territory_reports : [])) {
    const response = (t?.response || '').trim();
    if (!response) continue;
    const label = t.territory_name || t.territory_id || 'Territory';
    terrLines.push(`${label}\n\n${response}`);
  }
  if (terrLines.length) sections.push(`## Territory Reports\n${terrLines.join('\n\n')}`);

  // ── Merit Actions — one heading, each resolved action its own paragraph.
  // `header` carries the real narrative text; `action_responses[*].response`
  // is empty on every record with merit-action content (see file header). ──
  const meritLines = (Array.isArray(raw.merit_actions_resolved) ? raw.merit_actions_resolved : [])
    .map(a => (a?.header || '').trim())
    .filter(Boolean);
  if (meritLines.length) sections.push(`## Merit Actions\n${meritLines.join('\n\n')}`);

  return sections.join('\n\n');
}

/**
 * Build the full `downtime_submissions` document for one resolved DT1 record.
 *
 * @param {object} raw
 * @param {import('mongodb').ObjectId} characterOid
 * @param {import('mongodb').ObjectId} chapterOid
 * @param {string} nowIso
 * @returns {object}
 */
export function buildSubmissionDoc(raw, characterOid, chapterOid, nowIso) {
  const publishedOutcome = buildPublishedOutcome(raw);
  return {
    character_id: characterOid,
    character_name: raw.character_name,
    player_name: raw.player_name || '',
    chapter_id: chapterOid,
    status: 'submitted',
    responses: {},
    feeding_review: raw.feeding_review || {},
    projects_resolved: raw.projects_resolved || [],
    merit_actions_resolved: raw.merit_actions_resolved || [],
    st_narrative: raw.st_narrative || {},
    st_review: {
      outcome_text: publishedOutcome,
      outcome_visibility: 'published',
      published_at: DT1_CLOSED_AT,
    },
    published_outcome: publishedOutcome,
    submitted_at: DT1_CLOSED_AT,
    created_at: DT1_LOADED_AT,
    updated_at: nowIso,
  };
}

/**
 * Load and parse the source JSON. Separated from `planImport` so a caller
 * (or a future test) can hand in fixture records directly instead.
 *
 * @param {string} [sourcePath]
 * @returns {Array<object>}
 */
export function loadSourceRecords(sourcePath = SOURCE_PATH) {
  if (!existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }
  return JSON.parse(readFileSync(sourcePath, 'utf8'));
}

/**
 * Classify every source record against live DB state. PURE with respect to
 * writes - reads only, no side effects - so `main()` can print the whole plan
 * before anyone decides whether to run it.
 *
 * @param {object} opts
 * @param {import('mongodb').Collection} opts.chapterCollection
 * @param {import('mongodb').Collection} opts.characterCollection
 * @param {import('mongodb').Collection} opts.submissionCollection
 * @param {Array<object>} opts.records
 * @returns {Promise<{chapter: object|null, problems: string[], rows: Array<object>}>}
 */
export async function planImport({ chapterCollection, characterCollection, submissionCollection, records }) {
  const problems = [];
  const chapter = await chapterCollection.findOne({ game_number: 1 });

  if (!chapter) {
    problems.push('No chapters document found for game_number: 1. Halting rather than guessing or creating one.');
    return { chapter: null, problems, rows: [] };
  }
  if (chapter.placeholder !== true) {
    problems.push(
      `chapters/${chapter._id} does not carry placeholder: true (it is ${JSON.stringify(chapter.placeholder)}). ` +
      'Expected the untouched Chapter-1 placeholder; halting rather than guessing at intent.'
    );
  }
  if ((chapter.submission_count ?? 0) !== 0) {
    problems.push(
      `chapters/${chapter._id} already has submission_count ${chapter.submission_count} (expected 0). ` +
      'Halting rather than guessing at intent.'
    );
  }
  if (problems.length) return { chapter, problems, rows: [] };

  // Re-derive the 5 blank-character_id records by an exact live name match -
  // never a hardcoded id map (see file header for why that matters here).
  const blankNames = [...new Set(records.filter(r => !r.character_id).map(r => r.character_name))];
  const lookedUp = blankNames.length
    ? await characterCollection.find({ name: { $in: blankNames } }).project({ _id: 1, name: 1 }).toArray()
    : [];
  const nameToId = new Map(lookedUp.map(c => [c.name, c._id]));

  const rows = [];
  for (const raw of records) {
    let charIdStr = raw.character_id || null;
    let resolvedVia = 'source';

    if (!charIdStr) {
      const found = nameToId.get(raw.character_name);
      if (found) {
        charIdStr = String(found);
        resolvedVia = 'live-lookup-by-name';
      }
    }

    if (!charIdStr) {
      rows.push({ character_name: raw.character_name, skip: true, reason: 'no character_id (source blank, no live character found by exact name match)' });
      continue;
    }
    if (!ObjectId.isValid(charIdStr)) {
      rows.push({ character_name: raw.character_name, skip: true, reason: `character_id "${charIdStr}" is not a valid ObjectId` });
      continue;
    }

    const characterOid = new ObjectId(charIdStr);
    const existing = await submissionCollection.findOne({ character_id: characterOid, chapter_id: chapter._id });

    rows.push({
      character_name: raw.character_name,
      character_id: characterOid,
      resolvedVia,
      exists: !!existing,
      existingId: existing?._id || null,
      raw,
    });
  }

  return { chapter, problems, rows };
}

/**
 * Carry out (or, by default, merely narrate) the plan.
 *
 * @param {object} opts
 * @param {import('mongodb').Collection} opts.chapterCollection
 * @param {import('mongodb').Collection} opts.submissionCollection
 * @param {object} opts.chapter
 * @param {Array<object>} opts.rows
 * @param {{ apply?: boolean, force?: boolean, log?: Function }} [opts.runOpts]
 * @returns {Promise<{inserted: number, updated: number, skipped: number, chapterUpdated: boolean, backedUp: boolean}>}
 */
export async function applyImport({ chapterCollection, submissionCollection, chapter, rows }, { apply = false, force = false, log = () => {} } = {}) {
  const insertable = rows.filter(r => !r.skip);
  const skippedNoId = rows.filter(r => r.skip);

  for (const r of skippedNoId) {
    log(`  SKIP (${r.reason}) | ${r.character_name}`);
  }

  if (!apply) {
    let wouldInsert = 0, wouldUpdate = 0, wouldSkip = skippedNoId.length;
    for (const row of insertable) {
      if (row.exists && !force) {
        log(`  SKIP (exists)          | ${row.character_name}`);
        wouldSkip++;
      } else {
        log(`  ${row.exists ? 'WOULD UPDATE' : 'WOULD INSERT'} | ${row.character_name} (${row.resolvedVia})`);
        if (row.exists) wouldUpdate++; else wouldInsert++;
      }
    }
    log(`\nWould insert: ${wouldInsert}  |  Would update: ${wouldUpdate}  |  Would skip: ${wouldSkip}`);
    log('\nRe-run with --apply to write. Add --force to overwrite existing DT1 submissions.');
    return { inserted: 0, updated: 0, skipped: wouldSkip, chapterUpdated: false, backedUp: false };
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, `di-1-import-dt1-narratives-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify(chapter, null, 2));
  log(`Backup written: ${backupPath}`);

  const nowIso = new Date().toISOString();
  let inserted = 0, updated = 0, skipped = skippedNoId.length;

  for (const row of insertable) {
    if (row.exists && !force) {
      log(`  SKIP (exists)          | ${row.character_name}`);
      skipped++;
      continue;
    }

    const doc = buildSubmissionDoc(row.raw, row.character_id, chapter._id, nowIso);

    if (row.exists) {
      await submissionCollection.updateOne({ _id: row.existingId }, { $set: doc });
      log(`  UPDATED                | ${row.character_name}`);
      updated++;
    } else {
      await submissionCollection.insertOne(doc);
      log(`  INSERTED               | ${row.character_name} (${row.resolvedVia})`);
      inserted++;
    }
  }

  // Re-count from the collection itself rather than assuming inserted+updated
  // equals the chapter's real total, so a partial prior run or a --force
  // re-import still leaves an accurate submission_count.
  const realCount = await submissionCollection.countDocuments({ chapter_id: chapter._id });
  await chapterCollection.updateOne(
    { _id: chapter._id },
    { $set: { submission_count: realCount }, $unset: { placeholder: '', placeholder_note: '' } }
  );

  return { inserted, updated, skipped, chapterUpdated: true, backedUp: true };
}

export async function main(argv = process.argv) {
  const apply = argv.includes('--apply');
  const force = argv.includes('--force');
  const dbName = process.env.MONGODB_DB || 'tm_suite';

  console.log(`Mode     : ${apply ? 'APPLY (will backup + write)' : 'DRY RUN (read only; pass --apply to write)'}${force ? ' [--force]' : ''}`);
  console.log(`Target DB: ${dbName}`);
  console.log(`Source   : ${SOURCE_PATH}`);
  console.log('');

  const records = loadSourceRecords();
  console.log(`Loaded ${records.length} DT1 source record(s).\n`);

  await connectDb();
  try {
    const chapterCollection = getCollection('chapters');
    const characterCollection = getCollection('characters');
    const submissionCollection = getCollection('downtime_submissions');

    const plan = await planImport({ chapterCollection, characterCollection, submissionCollection, records });

    if (plan.problems.length) {
      console.log('HALTED - not proceeding:');
      for (const p of plan.problems) console.log(`  ${p}`);
      return;
    }

    console.log(
      `Target chapter: ${plan.chapter._id} (game_number: 1, label "${plan.chapter.label}", ` +
      `placeholder: ${plan.chapter.placeholder}, submission_count: ${plan.chapter.submission_count})`
    );
    console.log('');

    const result = await applyImport(
      { chapterCollection, submissionCollection, chapter: plan.chapter, rows: plan.rows },
      { apply, force, log: msg => console.log(msg) }
    );

    console.log('');
    console.log(`Totals: ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped.`);
    if (apply) {
      console.log(`Chapter ${plan.chapter._id} placeholder cleared, submission_count set from a fresh count.`);
      console.log('Idempotency check: re-run with --apply (no --force) and confirm every record reports SKIP (exists).');
    }
  } finally {
    await closeDb();
  }
}

// Auto-run only when invoked directly, never when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
