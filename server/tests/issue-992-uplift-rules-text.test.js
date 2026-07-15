/**
 * Issue #992 — integration test for uplift-power-rules-text.js `main()`
 * end-to-end, dry-run AND apply, against a seeded test collection.
 *
 * Per `feedback_script_integration_test`: a data-mutating script needs at
 * least one test calling main() end-to-end (not just unit tests on the pure
 * parser helpers) — the #813 incident (find+projection+replaceOne wiping 13
 * character docs) was caused by a write-path bug that helper-level unit
 * tests never exercised.
 *
 * Uses a fixture markdown "book" (string written to a temp dir) rather than
 * the real `markdown/` corpus, and throwaway reports/backups dirs — never
 * the real `server/scripts/reports/` (which holds the committed AC9 live
 * dry-run report) or `server/scripts/backups/`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { main, parseBook, normalizeName, matchPower, joinFragment, composeRulesText } from '../scripts/uplift-power-rules-text.js';

const TEST_FLAG = { _test_992: true };

// A fixture "book" covering: plain trailing-dot heading (discipline-style),
// bold parens-colon heading (manoeuvre-style), a rank-mismatch heading, and
// a base version of a power that's overridden by the errata fixture below.
const FIXTURE_BOOK_MD = `
Some Book Chapter Intro

This paragraph is book intro prose before any heading and must be discarded,
not attached to any block.

Fixture Power Alpha •

This is the flavour text for Alpha, explaining what it does in the

fiction before the mechanics.

**Cost:** 1 Vitae

**Dice Pool:** Wits + Composure

**Action:** Instant

Fixture Manoeuvre Beta (••)

Body text for the manoeuvre style, wrapped across two

physical lines describing what Beta accomplishes in a fight.

Fixture Mismatch Epsilon •

Heading dots say rank 1, but the DB doc below will claim rank 5 —

this must resolve to ambiguous (rank mismatch), never a guess.

Fixture Errata Gamma •••

Base-book flavour for Gamma, which the errata fixture below appends to (not replaces).

**Cost:** 2 Vitae

Fixture Auspex Zeta •

Book flavour for Zeta, an Auspex-parented power that must be skipped entirely —

no match, no write — regardless of how cleanly it would otherwise resolve.

**Cost:** 1 Vitae
`;

const FIXTURE_ERRATA_MD = `
Errata Preamble

Fixture Errata Gamma (•••)

**Clarification:** Errata-corrected addendum for Gamma.

**Cost:** 1 Vitae (errata correction)

Fixture Auspex Zeta (•)

**Clarification:** Errata text for Zeta — must still be skipped since DB parent is Auspex,

even though this errata block would otherwise resolve cleanly (2026-07-15 revision).
`;

function seedPowers() {
  return [
    {
      ...TEST_FLAG,
      key: 'test-fixture-power-alpha',
      name: 'Fixture Power Alpha',
      category: 'discipline',
      rank: 1,
      parent: 'TestDiscipline',
      description: 'Alpha one-line summary.',
    },
    {
      ...TEST_FLAG,
      key: 'test-fixture-manoeuvre-beta',
      name: 'Fixture Manoeuvre Beta',
      category: 'manoeuvre',
      rank: 2,
      parent: 'Test Style',
      description: 'Beta one-line summary.',
    },
    {
      ...TEST_FLAG,
      key: 'test-fixture-unmatched-delta',
      name: 'Fixture Unmatched Delta',
      category: 'merit',
      rank: null,
      parent: 'Kindred',
      description: 'Delta has no markdown counterpart.',
    },
    {
      ...TEST_FLAG,
      key: 'test-fixture-mismatch-epsilon',
      name: 'Fixture Mismatch Epsilon',
      category: 'discipline',
      rank: 5,
      parent: 'TestDiscipline',
      description: 'Epsilon rank mismatch summary.',
    },
    {
      ...TEST_FLAG,
      key: 'test-fixture-errata-gamma',
      name: 'Fixture Errata Gamma',
      category: 'discipline',
      rank: 3,
      parent: 'TestDiscipline',
      description: 'Gamma one-line summary.',
    },
    {
      ...TEST_FLAG,
      key: 'test-fixture-auspex-zeta',
      name: 'Fixture Auspex Zeta',
      category: 'discipline',
      rank: 1,
      parent: 'Auspex', // exact DB casing
      description: 'Zeta one-line summary (Auspex — excluded).',
    },
    {
      ...TEST_FLAG,
      key: 'test-fixture-auspex-eta',
      name: 'Fixture Auspex Eta',
      category: 'discipline',
      rank: 1,
      parent: 'AUSPEX', // different casing — exclusion is case-insensitive
      description: 'Eta one-line summary (Auspex, uppercase parent — excluded).',
    },
  ];
}

let tmpDir;
let tmpReportsDir;
let tmpBackupsDir;
let overrides;

beforeAll(async () => {
  await setupDb();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-992-fixture-'));
  fs.writeFileSync(path.join(tmpDir, 'fixture-book.md'), FIXTURE_BOOK_MD);
  fs.writeFileSync(path.join(tmpDir, 'fixture-errata.md'), FIXTURE_ERRATA_MD);
  tmpReportsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-992-reports-'));
  tmpBackupsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-992-backups-'));

  overrides = {
    markdownDir: tmpDir,
    books: [
      { file: 'fixture-book.md', label: 'Fixture Book', isErrata: false },
      { file: 'fixture-errata.md', label: 'Fixture Errata', isErrata: true },
    ],
    reportsDir: tmpReportsDir,
    backupsDir: tmpBackupsDir,
    query: TEST_FLAG,
  };

  await getCollection('purchasable_powers').deleteMany(TEST_FLAG);
});

afterAll(async () => {
  await getCollection('purchasable_powers').deleteMany(TEST_FLAG);
  await teardownDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(tmpReportsDir, { recursive: true, force: true });
  fs.rmSync(tmpBackupsDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await getCollection('purchasable_powers').deleteMany(TEST_FLAG);
  await getCollection('purchasable_powers').insertMany(seedPowers());
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('#992 — pure parser helpers', () => {
  it('normalizeName strips case/punctuation/diacritics and leading "the "', () => {
    expect(normalizeName('The Spirit’s Touch')).toBe("spirit's touch");
    expect(normalizeName('René')).toBe('rene');
    expect(normalizeName('  Cover   the Angles ')).toBe('cover the angles');
  });

  it('joinFragment repairs PDF hyphenation and otherwise space-joins', () => {
    expect(joinFragment('modi-', 'fier')).toBe('modifier');
    expect(joinFragment('Intelligence +', 'Academics')).toBe('Intelligence + Academics');
    expect(joinFragment('', 'first')).toBe('first');
  });

  it('parseBook segments both heading styles and captures structured sections', () => {
    const blocks = parseBook(FIXTURE_BOOK_MD, { file: 'fixture-book.md', label: 'Fixture Book', isErrata: false });
    const alpha = blocks.find(b => b.normName === 'fixture power alpha');
    expect(alpha).toBeTruthy();
    expect(alpha.dots).toBe(1);
    expect(alpha.flavour).toMatch(/flavour text for Alpha/);
    expect(alpha.sections.find(s => s.label === 'Cost').text).toBe('1 Vitae');
    expect(alpha.sections.find(s => s.label === 'Dice Pool').text).toBe('Wits + Composure');

    const beta = blocks.find(b => b.normName === 'fixture manoeuvre beta');
    expect(beta).toBeTruthy();
    expect(beta.dots).toBe(2);
    expect(beta.flavour).toMatch(/Body text for the manoeuvre style/);

    // Book intro prose before the first heading is discarded, not attached.
    expect(blocks.every(b => !b.flavour.includes('must be discarded'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// main() — DRY RUN
// ─────────────────────────────────────────────────────────────────────────────

describe('#992 — main() dry-run', () => {
  it('writes nothing to the DB and produces report + cost artifact files', async () => {
    const col = getCollection('purchasable_powers');
    const before = await col.find(TEST_FLAG).toArray();

    const result = await main({ ...overrides, apply: false });

    const after = await col.find(TEST_FLAG).toArray();
    expect(after).toEqual(before); // zero writes in dry-run

    expect(fs.existsSync(result.reportJsonPath)).toBe(true);
    expect(fs.existsSync(result.reportMdPath)).toBe(true);
    expect(fs.existsSync(result.costsPath)).toBe(true);
    expect(fs.existsSync(tmpBackupsDir)).toBe(true);
    expect(fs.readdirSync(tmpBackupsDir)).toHaveLength(0); // no backup in dry-run

    const report = JSON.parse(fs.readFileSync(result.reportJsonPath, 'utf8'));
    const byKey = Object.fromEntries(report.matches.map(m => [m.key, m]));
    expect(byKey['test-fixture-power-alpha']).toBeTruthy();
    expect(byKey['test-fixture-power-alpha'].source).toBe('Fixture Book');
    expect(byKey['test-fixture-manoeuvre-beta']).toBeTruthy();
    expect(byKey['test-fixture-errata-gamma'].source).toBe('Fixture Book + Fixture Errata');

    const ambiguousKeys = report.ambiguous.map(a => a.key);
    expect(ambiguousKeys).toContain('test-fixture-mismatch-epsilon');

    const unmatchedKeys = report.unmatched.map(u => u.key);
    expect(unmatchedKeys).toContain('test-fixture-unmatched-delta');

    // Auspex exclusion: Zeta is skipped entirely, not matched/ambiguous/unmatched.
    expect(byKey['test-fixture-auspex-zeta']).toBeUndefined();
    expect(ambiguousKeys).not.toContain('test-fixture-auspex-zeta');
    expect(unmatchedKeys).not.toContain('test-fixture-auspex-zeta');
    const skippedAuspexKeys = report.skipped_auspex.map(s => s.key);
    expect(skippedAuspexKeys).toContain('test-fixture-auspex-zeta');
    // Case-insensitive: parent 'AUSPEX' (uppercase) is excluded exactly the
    // same as parent 'Auspex' — no markdown match required either, since
    // exclusion happens before matchPower runs.
    expect(skippedAuspexKeys).toContain('test-fixture-auspex-eta');
    expect(report.totals.skipped_auspex).toBe(2);
    expect(report.by_category.discipline.skipped_auspex).toBe(2);

    // Errata append (not replace): rules_text carries BOTH book and errata text.
    expect(byKey['test-fixture-errata-gamma'].preview).toMatch(/Base-book flavour for Gamma/);

    // Cost side-artifact: every matched power with a Cost line is present.
    // No cost fields are ever written to the DB — report-only (GDX-6 reuse).
    const costsByKey = Object.fromEntries(result.costArtifact.map(c => [c.key, c.cost_raw]));
    expect(costsByKey['test-fixture-power-alpha']).toBe('1 Vitae');
    expect(costsByKey['test-fixture-errata-gamma']).toBe('1 Vitae (errata correction)'); // errata's Cost line still wins for the cost artifact
    expect(costsByKey['test-fixture-auspex-zeta']).toBeUndefined(); // skipped before cost extraction runs
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Errata composition — append, not replace (2026-07-15 revision)
// ─────────────────────────────────────────────────────────────────────────────

describe('#992 — composeRulesText (errata append)', () => {
  it('appends the errata section after the full book text, delimited, when both exist', () => {
    const bookBlock = { book: 'Fixture Book', rulesText: 'Book flavour text.\n\n**Cost:** 2 Vitae' };
    const errataBlock = { book: 'Fixture Errata', rulesText: '**Clarification:** Errata addendum.\n\n**Cost:** 1 Vitae (errata correction)' };
    const combined = composeRulesText(bookBlock, errataBlock);

    // Book text is preserved in full, unmodified, first.
    expect(combined.startsWith('Book flavour text.\n\n**Cost:** 2 Vitae')).toBe(true);
    // Followed by a clear delimiter and a labelled errata section.
    expect(combined).toMatch(/\n\n---\n\*\*Fixture Errata:\*\*\n/);
    expect(combined).toMatch(/Errata addendum\./);
    // The book's own (now-superseded) Cost line is still present — this is an
    // append, not a replace; readers see both and the errata section is the
    // clearly-marked authoritative correction.
    expect(combined).toMatch(/\*\*Cost:\*\* 2 Vitae/);
    expect(combined).toMatch(/\*\*Cost:\*\* 1 Vitae \(errata correction\)/);
  });

  it('errata-only match (no book block) keeps the errata text as the whole rules_text, unchanged', () => {
    const errataBlock = { book: 'Fixture Errata', rulesText: 'Errata-only power text.' };
    expect(composeRulesText(null, errataBlock)).toBe('Errata-only power text.');
  });

  it('book-only match (no errata) is untouched — just the book text', () => {
    const bookBlock = { book: 'Fixture Book', rulesText: 'Book-only power text.' };
    expect(composeRulesText(bookBlock, null)).toBe('Book-only power text.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// main() — APPLY
// ─────────────────────────────────────────────────────────────────────────────

describe('#992 — main() apply', () => {
  it('writes rules_text/rules_source via updateOne($set) only, leaves description and unmatched docs untouched, and backs up first', async () => {
    const col = getCollection('purchasable_powers');
    const beforeDocs = await col.find(TEST_FLAG).toArray();
    const beforeByKey = Object.fromEntries(beforeDocs.map(d => [d.key, d]));

    const result = await main({ ...overrides, apply: true });

    // Backup exported before any write.
    expect(result.backupPath).toBeTruthy();
    expect(fs.existsSync(result.backupPath)).toBe(true);
    const backupDocs = JSON.parse(fs.readFileSync(result.backupPath, 'utf8'));
    expect(backupDocs.some(d => d.key === 'test-fixture-power-alpha')).toBe(true);

    const afterDocs = await col.find(TEST_FLAG).toArray();
    const afterByKey = Object.fromEntries(afterDocs.map(d => [d.key, d]));

    // ── Matched docs: rules_text/rules_source set, description untouched ──
    const alpha = afterByKey['test-fixture-power-alpha'];
    expect(alpha.description).toBe(beforeByKey['test-fixture-power-alpha'].description);
    expect(alpha.rules_text).toMatch(/flavour text for Alpha/);
    expect(alpha.rules_text).toMatch(/\*\*Cost:\*\* 1 Vitae/);
    expect(alpha.rules_source).toBe('Fixture Book');

    const beta = afterByKey['test-fixture-manoeuvre-beta'];
    expect(beta.description).toBe(beforeByKey['test-fixture-manoeuvre-beta'].description);
    expect(beta.rules_text).toMatch(/Body text for the manoeuvre style/);

    // Errata APPEND (2026-07-15 revision): rules_text carries the FULL book
    // text followed by a clearly delimited errata section — not a replace.
    const gamma = afterByKey['test-fixture-errata-gamma'];
    expect(gamma.description).toBe(beforeByKey['test-fixture-errata-gamma'].description);
    expect(gamma.rules_text).toMatch(/Base-book flavour for Gamma/); // book text preserved
    expect(gamma.rules_text).toMatch(/Errata-corrected addendum for Gamma/); // errata appended
    expect(gamma.rules_text).toMatch(/\n\n---\n\*\*Fixture Errata:\*\*\n/); // delimiter + label
    // Book text comes first, errata section after — order matters for readers.
    expect(gamma.rules_text.indexOf('Base-book flavour for Gamma'))
      .toBeLessThan(gamma.rules_text.indexOf('Errata-corrected addendum for Gamma'));
    expect(gamma.rules_source).toBe('Fixture Book + Fixture Errata');

    // ── Unmatched / ambiguous docs: completely untouched ──
    const delta = afterByKey['test-fixture-unmatched-delta'];
    expect(delta).toEqual(beforeByKey['test-fixture-unmatched-delta']);
    expect(delta.rules_text).toBeUndefined();

    const epsilon = afterByKey['test-fixture-mismatch-epsilon'];
    expect(epsilon).toEqual(beforeByKey['test-fixture-mismatch-epsilon']);
    expect(epsilon.rules_text).toBeUndefined();

    // ── Auspex exclusion: Zeta is completely untouched despite having both a
    // clean book match AND a clean errata match — parent === 'Auspex' skips
    // it before matchPower ever runs.
    const zeta = afterByKey['test-fixture-auspex-zeta'];
    expect(zeta).toEqual(beforeByKey['test-fixture-auspex-zeta']);
    expect(zeta.rules_text).toBeUndefined();
    expect(zeta.rules_source).toBeUndefined();

    // ── Only rules_text/rules_source changed — nothing else on matched docs ──
    for (const key of ['test-fixture-power-alpha', 'test-fixture-manoeuvre-beta', 'test-fixture-errata-gamma']) {
      const b = beforeByKey[key];
      const a = afterByKey[key];
      const { rules_text: _rt, rules_source: _rs, ...aRest } = a;
      expect(aRest).toEqual(b);
    }
  });

  it('idempotent-ish: matchPower resolves rank mismatch as ambiguous, never guesses', () => {
    const blocks = parseBook(FIXTURE_BOOK_MD, { file: 'fixture-book.md', label: 'Fixture Book', isErrata: false });
    const byNormName = new Map();
    for (const b of blocks) {
      if (!byNormName.has(b.normName)) byNormName.set(b.normName, []);
      byNormName.get(b.normName).push(b);
    }
    const power = { name: 'Fixture Mismatch Epsilon', rank: 5, rating_range: null };
    const m = matchPower(power, byNormName);
    expect(m.status).toBe('ambiguous');
    expect(m.reason).toBe('rank_mismatch');
  });
});
