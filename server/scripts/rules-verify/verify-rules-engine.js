/**
 * Verify the rules-engine seed state in the active MongoDB matches
 * expected_sources.json. Fails loud when an evaluator's rule docs are missing —
 * the failure mode that bit RDE-3 (PT XP refund vanished in production because
 * seed-rules-pt.js was never run against tm_suite).
 *
 * Two entry points:
 *   1. CLI: `node server/scripts/rules-verify/verify-rules-engine.js`
 *      - Honours MONGODB_URI / MONGODB_DB env vars (defaults to tm_suite).
 *      - Exits 0 on pass, 1 on miss, 2 on connection failure.
 *   2. Library: `import { verifyRulesEngine } from './verify-rules-engine.js'`
 *      - Pass an open Db instance; returns { ok, missing, counts }.
 *      - Used by server/index.js startup gate so we don't reconnect.
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, 'expected_sources.json');

function loadManifest() {
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.expected)) {
    throw new Error(`Manifest at ${MANIFEST_PATH} has no "expected" array`);
  }
  return parsed.expected;
}

/**
 * Run verification against an open Db.
 * @param {import('mongodb').Db} db
 * @returns {Promise<{ ok: boolean, missing: Array, counts: Record<string, number> }>}
 */
export async function verifyRulesEngine(db) {
  const expected = loadManifest();
  const missing = [];
  const counts = {};

  for (const entry of expected) {
    const { collection, match, min_count, consumer, seed_script } = entry;
    const key = `${collection}:${JSON.stringify(match)}`;
    const count = await db.collection(collection).countDocuments(match);
    counts[key] = count;
    if (count < min_count) {
      missing.push({ collection, match, min_count, actual: count, consumer, seed_script });
    }
  }

  return { ok: missing.length === 0, missing, counts };
}

function formatMissingReport(missing, dbName) {
  const lines = [
    `[verify-rules-engine] FAIL — ${missing.length} expected rule tuple(s) missing from db "${dbName}":`,
  ];
  for (const m of missing) {
    lines.push(
      `  • ${m.collection} ${JSON.stringify(m.match)} — found ${m.actual}, need ${m.min_count}`,
    );
    lines.push(`      consumer: ${m.consumer}`);
    lines.push(`      seed: node ${m.seed_script} --apply`);
  }
  return lines.join('\n');
}

function formatPassReport(counts, dbName) {
  const totalCollections = new Set(Object.keys(counts).map(k => k.split(':')[0])).size;
  return `[verify-rules-engine] OK — ${Object.keys(counts).length} expected tuple(s) across ${totalCollections} collection(s) verified in db "${dbName}".`;
}

export { formatMissingReport, formatPassReport, loadManifest };

// CLI entry — only when invoked directly, not when imported.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'tm_suite';
  if (!uri) {
    console.error('[verify-rules-engine] MONGODB_URI not set');
    process.exit(2);
  }
  const client = new MongoClient(uri.replace(/[&?]ssl=[^&]*/g, ''), {
    serverSelectionTimeoutMS: 5000,
    tls: true,
  });
  try {
    await client.connect();
    const db = client.db(dbName);
    const result = await verifyRulesEngine(db);
    if (result.ok) {
      console.log(formatPassReport(result.counts, dbName));
      process.exit(0);
    } else {
      console.error(formatMissingReport(result.missing, dbName));
      process.exit(1);
    }
  } catch (err) {
    console.error('[verify-rules-engine] connection or query error:', err.message);
    process.exit(2);
  } finally {
    await client.close();
  }
}
