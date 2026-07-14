/**
 * Issue #992 — uplift full rulebook text from `markdown/` sourcebooks into
 * `purchasable_powers.rules_text` (+ `rules_source` provenance).
 *
 * `description` (the existing one-line summary) is NEVER read for matching
 * beyond identity, and is NEVER written by this script. Option B (locked
 * 2026-07-14, Peter): `description` untouched, new `rules_text` / `rules_source`
 * fields added alongside it.
 *
 * ── Pipeline ────────────────────────────────────────────────────────────────
 * 1. Read each book in `markdown/` (declarative BOOKS table below).
 * 2. Normalise the PDF-extracted double-spaced wrap: the source has every
 *    wrapped line followed by a blank line, whether that line is mid-paragraph
 *    or a genuine paragraph break — the extraction does not distinguish them.
 *    We therefore treat the file as a stream of non-blank "fragments" and
 *    re-flow them: fragments before the first structured (`**Label:**`) line
 *    in a block become one running flavour paragraph; fragments from the
 *    first structured line onward are appended to whichever label is active.
 * 3. Segment fragments into power blocks using a declarative heading-pattern
 *    table (name + trailing dot glyphs, name + parenthesised dots, bold name
 *    + parenthesised dots followed by a colon and inline body, etc). Heading
 *    detection requires the ENTIRE trimmed fragment to match — normal prose
 *    fragments never coincidentally satisfy this because the dot glyphs
 *    (•/●) are used in this corpus only for power ranks.
 * 4. Match blocks to DB `purchasable_powers` docs by normalised name (case /
 *    punctuation / diacritic-insensitive, leading "the " stripped), sanity
 *    checked against `rank` (or `rating_range` for ranged merits) where the
 *    heading carries dots. A rank mismatch on the only candidate(s) is
 *    reported as ambiguous, not guessed into a match.
 * 5. Errata precedence: when a power appears in both an errata file and a
 *    book, the errata block's text is used, `rules_source` records both
 *    (e.g. "VtR 2e Rulebook + TM Errata").
 * 6. No fuzzy matching beyond normalisation — unmatched is a reportable
 *    outcome, not a failure (Design notes, story 992).
 *
 * ── Safety (2026-06-16 PR #813 lesson) ──────────────────────────────────────
 * Apply mode writes ONLY `updateOne({ _id }, { $set: { rules_text, rules_source } })`
 * — never find+projection+replaceOne. Apply mode also exports a full-collection
 * backup JSON before any write. `--apply` is required for writes; default is
 * dry-run (report-only, zero DB writes).
 *
 * Usage:
 *   cd server && node scripts/uplift-power-rules-text.js              (dry-run)
 *   cd server && node scripts/uplift-power-rules-text.js --apply       (write)
 *
 * NEVER run --apply against the live DB for this story (#992) — apply is a
 * separate, explicitly-authorised step per the Decisions section of the story.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDb, getCollection } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKDOWN_DIR = path.resolve(__dirname, '..', '..', 'markdown');
const REPORTS_DIR = path.resolve(__dirname, 'reports');
const BACKUPS_DIR = path.resolve(__dirname, 'backups');

// ─────────────────────────────────────────────────────────────────────────────
// Declarative per-book table — new books are additive, nothing else changes.
// ─────────────────────────────────────────────────────────────────────────────

export const BOOKS = [
  { file: 'Vampire the Requiem 2e Rulebook.md', label: 'VtR 2e Rulebook', isErrata: false },
  { file: 'Chronicles of Darkness Rulebook.md', label: 'CofD Rulebook', isErrata: false },
  { file: 'Hurt Locker.md', label: 'Hurt Locker', isErrata: false },
  { file: 'Secrets of the Covenants.md', label: 'Secrets of the Covenants', isErrata: false },
  { file: 'Blood Sorcery- New Rules.md', label: 'Blood Sorcery - New Rules', isErrata: false },
  { file: 'Damnation City Model - New Rules.md', label: 'Damnation City Model - New Rules', isErrata: false },
  { file: 'Blood Sorcery Themes and Motifs.md', label: 'Blood Sorcery Themes and Motifs', isErrata: false },
  { file: 'Terra Mortis - Errata Master.md', label: 'TM Errata', isErrata: true },
  { file: 'Auspex Errata.md', label: 'Auspex Errata', isErrata: true },
  // 'Terra Mortis Treatment.md' is campaign fiction — deliberately excluded.
];

const DOTS = '[•●]';

// ─────────────────────────────────────────────────────────────────────────────
// Name normalisation — the DB join key.
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeName(s) {
  if (!s) return '';
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics (René -> Rene)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^\s*the\s+/, '')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countDots(s) {
  return (s.match(new RegExp(DOTS, 'g')) || []).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heading patterns — declarative, applied to every book. A fragment is a
// heading candidate only when the WHOLE trimmed fragment matches (no partial
// matches inside a longer sentence) and is under HEADING_MAX_LEN chars.
// ─────────────────────────────────────────────────────────────────────────────

const HEADING_MAX_LEN = 100;
const NAME_CHARS = "[\\w'’.,\\-&À-ÿ ]"; // letters/digits/apostrophe/&/accents/space

const HEADING_PATTERNS = [
  // Bold name + parenthesised dot RANGE + colon, inline body follows.
  // e.g. "**Army of One (• to •••••):** text..."
  {
    kind: 'boldColonRange',
    re: new RegExp(`^\\*\\*(${NAME_CHARS}+?)\\s*\\(\\s*(${DOTS}{1,5})\\s+to\\s+(${DOTS}{1,5})\\s*\\)\\s*:\\*\\*\\s*(.*)$`),
  },
  // Bold name + parenthesised single rank + colon, inline body follows.
  // e.g. "**Hamstring (•):** text..." (also covers the CofD split-bold
  // artifact after normalizeSplitBoldDots() below has repaired it).
  {
    kind: 'boldColon',
    re: new RegExp(`^\\*\\*(${NAME_CHARS}+?)\\s*\\(\\s*(${DOTS}{1,5})\\s*\\)\\s*:\\*\\*\\s*(.*)$`),
  },
  // Plain name + parenthesised dot RANGE, own line, no colon.
  // e.g. "Alley Cat (• to •••)" (Secrets of the Covenants merits)
  {
    kind: 'parensRange',
    re: new RegExp(`^\\*{0,2}(${NAME_CHARS}+?)\\s*\\(\\s*(${DOTS}{1,5})\\s+to\\s+(${DOTS}{1,5})\\s*\\)\\*{0,2}$`),
  },
  // Plain name + parenthesised single rank, own line, no colon.
  // e.g. "Blandishment of Sin (•)", "Oath of Serfdom (••)"
  {
    kind: 'parens',
    re: new RegExp(`^\\*{0,2}(${NAME_CHARS}+?)\\s*\\(\\s*(${DOTS}{1,5})\\s*\\)\\*{0,2}$`),
  },
  // Bold name + trailing dots, own line, no parens/colon.
  // e.g. "**Creation •**" (Blood Sorcery Themes and Motifs)
  {
    kind: 'boldBareDots',
    re: new RegExp(`^\\*\\*(${NAME_CHARS}+?)\\s+(${DOTS}{1,5})\\*\\*$`),
  },
  // Plain name + trailing dots, own line, no bold/parens.
  // e.g. "Feral Whispers •", "Raise the Familiar ••"
  {
    kind: 'bareDots',
    re: new RegExp(`^(${NAME_CHARS}+?)\\s+(${DOTS}{1,5})$`),
  },
];

// The CofD Rulebook's PDF extraction splits the bold span around the dot
// glyph itself, e.g.:
//   **Cover the Angles (**• **):** Whenever you take a Dodge action,
// Repair this into the canonical **Name (dots):** shape before heading
// detection runs, so the boldColon pattern above matches normally.
function normalizeSplitBoldDots(line) {
  return line.replace(
    new RegExp(`\\*\\*([^*()\\n]+?)\\(\\*\\*(${DOTS}{1,5})\\s*\\*\\*\\):\\*\\*`, 'g'),
    (_m, name, dots) => `**${name.trim()} (${dots}):**`
  );
}

// Patterns whose syntax is unambiguously a heading (bold name + parens +
// colon, with an inline body) — these are accepted regardless of what
// precedes them. The remaining "weak" patterns (bare/parenthesised dots with
// no colon) are indistinguishable, in isolation, from a wrapped prerequisite
// list item like "Martial Arts •• or Street Fighting ••,\nStamina •••" — the
// second physical line reads exactly like a "Stamina •••" heading. Weak
// patterns are only accepted when the preceding fragment reads like the END
// of a sentence/section (see isPlausibleHeadingContext below).
const STRONG_KINDS = new Set(['boldColon', 'boldColonRange']);

function matchHeading(rawFragment) {
  const fragment = normalizeSplitBoldDots(rawFragment.trim());
  if (!fragment || fragment.length > HEADING_MAX_LEN) return null;
  // Must start with a letter (excludes bare bullet-list markers like "●").
  if (!/^[A-Za-zÀ-ÿ*]/.test(fragment)) return null;

  for (const { kind, re } of HEADING_PATTERNS) {
    const m = fragment.match(re);
    if (!m) continue;
    const name = m[1].trim().replace(/[*_]+$/, '');
    if (!name || !/[A-Za-z]/.test(name)) continue;
    const strong = STRONG_KINDS.has(kind);
    if (kind === 'boldColonRange' || kind === 'parensRange') {
      return { name, dots: null, dotsRange: [countDots(m[2]), countDots(m[3])], inlineBody: m[4] || '', strong };
    }
    if (kind === 'boldColon') {
      return { name, dots: countDots(m[2]), dotsRange: null, inlineBody: m[3] || '', strong };
    }
    // parens / boldBareDots / bareDots
    return { name, dots: countDots(m[2]), dotsRange: null, inlineBody: '', strong };
  }
  return null;
}

// A "weak" heading candidate (no colon) is implausible only when the
// fragment immediately preceding it dangles mid-list — a trailing comma,
// conjunction, or hyphenated word-wrap. That specific shape is what a
// wrapped prerequisite list item looks like ("...Street Fighting ••,\n
// Stamina •••" or "...Athletics ••, Stealth ••,\nStreetwise ••") and is
// otherwise indistinguishable, fragment-by-fragment, from a genuine
// "Name dots" heading. Everything else (including short label values like
// "**Action:** Instant" with no terminal punctuation) is accepted — the
// dangling-list shape is a much more reliable negative signal than
// requiring an explicit positive one.
function isPlausibleHeadingContext(lastFragment) {
  const t = (lastFragment || '').trim();
  if (!t) return true; // start of file / right after a heading with no body yet
  if (/,$/.test(t)) return false; // dangling list item: "...Stealth ••,"
  if (/\b(or|and|&)$/i.test(t)) return false; // dangling conjunction
  if (/[a-z]-$/.test(t)) return false; // hyphenated word-wrap continuation
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured (bold-label) line detection inside a block.
// ─────────────────────────────────────────────────────────────────────────────

const LABEL_COLON_RE = /^\*\*([A-Za-z][A-Za-z0-9 /&'\-]*?)\s*:\*\*\s*(.*)$/;
const LABEL_BARE_RE = /^\*\*([A-Za-z][A-Za-z0-9 /&'\-]*?)\*\*\s*$/;

// PDF hyphenation-aware fragment joiner: "modi-" + "fier" -> "modifier";
// otherwise space-join.
export function joinFragment(acc, frag) {
  const f = frag.trim();
  if (!f) return acc;
  if (!acc) return f;
  if (/[a-z]-$/.test(acc)) return acc.slice(0, -1) + f;
  return acc + ' ' + f;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse a single book's raw text into an array of power blocks.
// ─────────────────────────────────────────────────────────────────────────────

export function parseBook(rawText, book) {
  const fragments = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const blocks = [];
  let current = null;
  let lastFragment = '';

  function closeCurrent() {
    if (current) blocks.push(current);
    current = null;
  }

  for (const fragment of fragments) {
    const candidate = matchHeading(fragment);
    const heading = candidate && (candidate.strong || isPlausibleHeadingContext(lastFragment)) ? candidate : null;
    lastFragment = fragment;
    if (heading) {
      closeCurrent();
      current = {
        name: heading.name,
        normName: normalizeName(heading.name),
        dots: heading.dots,
        dotsRange: heading.dotsRange,
        flavourParts: [],
        sections: [], // ordered [{ label, text }]
        book: book.label,
        file: book.file,
        isErrata: book.isErrata,
      };
      if (heading.inlineBody) current.flavourParts.push(heading.inlineBody);
      continue;
    }
    if (!current) continue; // preamble text before the first heading — discard

    const colonMatch = fragment.match(LABEL_COLON_RE);
    const bareMatch = !colonMatch && fragment.match(LABEL_BARE_RE);
    if (colonMatch) {
      current.sections.push({ label: colonMatch[1].trim(), text: colonMatch[2] || '' });
      continue;
    }
    if (bareMatch) {
      current.sections.push({ label: bareMatch[1].trim(), text: '' });
      continue;
    }
    // Continuation: if we've started structured sections, this fragment
    // continues the most recent one. Otherwise it's still flavour text.
    if (current.sections.length > 0) {
      const last = current.sections[current.sections.length - 1];
      last.text = joinFragment(last.text, fragment);
    } else {
      current.flavourParts.push(fragment);
    }
  }
  closeCurrent();

  for (const b of blocks) {
    b.flavour = b.flavourParts.reduce((acc, f) => joinFragment(acc, f), '');
    delete b.flavourParts;
    b.rulesText = buildRulesText(b);
  }
  return blocks;
}

export function buildRulesText(block) {
  const parts = [];
  if (block.flavour && block.flavour.trim()) parts.push(block.flavour.trim());
  if (block.sections.length) {
    const lines = block.sections.map(s =>
      s.text && s.text.trim() ? `**${s.label}:** ${s.text.trim()}` : `**${s.label}**`
    );
    parts.push(lines.join('\n'));
  }
  return parts.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Load + index every book.
// ─────────────────────────────────────────────────────────────────────────────

export function loadAllBlocks(markdownDir = MARKDOWN_DIR, books = BOOKS) {
  const allBlocks = [];
  const bookStatus = [];
  for (const book of books) {
    const filePath = path.join(markdownDir, book.file);
    if (!fs.existsSync(filePath)) {
      bookStatus.push({ file: book.file, found: false, blocks: 0 });
      continue;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const blocks = parseBook(raw, book);
    allBlocks.push(...blocks);
    bookStatus.push({ file: book.file, found: true, blocks: blocks.length });
  }

  const byNormName = new Map();
  for (const b of allBlocks) {
    if (!byNormName.has(b.normName)) byNormName.set(b.normName, []);
    byNormName.get(b.normName).push(b);
  }
  return { allBlocks, byNormName, bookStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// Match DB powers against parsed blocks.
// ─────────────────────────────────────────────────────────────────────────────

export function matchPower(power, byNormName) {
  const norm = normalizeName(power.name);
  const candidates = byNormName.get(norm) || [];
  if (!candidates.length) return { status: 'unmatched' };

  let rankFiltered = candidates;
  if (power.rank != null) {
    rankFiltered = candidates.filter(c => c.dots == null || c.dots === power.rank);
  } else if (Array.isArray(power.rating_range)) {
    rankFiltered = candidates.filter(c =>
      !c.dotsRange || (c.dotsRange[0] === power.rating_range[0] && c.dotsRange[1] === power.rating_range[1])
    );
  }
  if (!rankFiltered.length) {
    return { status: 'ambiguous', reason: 'rank_mismatch', candidates };
  }

  const errataCands = rankFiltered.filter(c => c.isErrata);
  const bookCands = rankFiltered.filter(c => !c.isErrata);

  if (errataCands.length > 1) {
    return { status: 'ambiguous', reason: 'multiple_errata_sources', candidates: rankFiltered };
  }
  if (errataCands.length === 1) {
    const errBlock = errataCands[0];
    const bookBlock = bookCands[0];
    const source = bookBlock ? `${bookBlock.book} + ${errBlock.book}` : errBlock.book;
    return { status: 'matched', block: errBlock, source };
  }
  if (bookCands.length === 1) {
    return { status: 'matched', block: bookCands[0], source: bookCands[0].book };
  }
  return { status: 'ambiguous', reason: 'multiple_book_sources', candidates: rankFiltered };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost-extraction side artifact (GDX-6 / #987 reuse). No cost fields are
// written to the DB by this script — this is a read-only JSON export.
// ─────────────────────────────────────────────────────────────────────────────

export function extractCost(block) {
  const s = block.sections.find(sec => sec.label.toLowerCase() === 'cost');
  return s ? s.text.trim() : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report generation.
// ─────────────────────────────────────────────────────────────────────────────

function buildReport(results, bookStatus) {
  const byCategory = {};
  for (const r of results) {
    const cat = r.category;
    if (!byCategory[cat]) byCategory[cat] = { matched: 0, unmatched: 0, ambiguous: 0 };
    byCategory[cat][r.status === 'matched' ? 'matched' : r.status === 'ambiguous' ? 'ambiguous' : 'unmatched']++;
  }

  const matches = results
    .filter(r => r.status === 'matched')
    .map(r => ({
      key: r.key,
      name: r.name,
      category: r.category,
      source: r.source,
      before_len: r.before_len,
      after_len: r.after_len,
      preview: r.preview,
    }));

  const ambiguous = results
    .filter(r => r.status === 'ambiguous')
    .map(r => ({ key: r.key, name: r.name, category: r.category, reason: r.reason }));

  const unmatched = results
    .filter(r => r.status === 'unmatched')
    .map(r => ({ key: r.key, name: r.name, category: r.category }));

  return {
    generated_at: new Date().toISOString(),
    book_status: bookStatus,
    totals: {
      matched: matches.length,
      ambiguous: ambiguous.length,
      unmatched: unmatched.length,
      total: results.length,
    },
    by_category: byCategory,
    matches,
    ambiguous,
    unmatched,
  };
}

function buildMarkdownSummary(report) {
  const lines = [];
  lines.push('# Story 992 — power rules-text uplift dry-run report');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push('');
  lines.push('## Book segmentation');
  lines.push('');
  lines.push('| File | Found | Blocks parsed |');
  lines.push('|---|---|---|');
  for (const b of report.book_status) {
    lines.push(`| ${b.file} | ${b.found ? 'yes' : 'NO'} | ${b.blocks} |`);
  }
  lines.push('');
  lines.push('## Per-category match statistics');
  lines.push('');
  lines.push('| Category | Matched | Unmatched | Ambiguous |');
  lines.push('|---|---|---|---|');
  for (const [cat, counts] of Object.entries(report.by_category)) {
    lines.push(`| ${cat} | ${counts.matched} | ${counts.unmatched} | ${counts.ambiguous} |`);
  }
  lines.push('');
  lines.push(`**Totals** — matched: ${report.totals.matched}, unmatched: ${report.totals.unmatched}, ambiguous: ${report.totals.ambiguous}, total DB docs: ${report.totals.total}`);
  lines.push('');
  lines.push('## Sample matches');
  lines.push('');
  for (const m of report.matches.slice(0, 20)) {
    lines.push(`- **${m.name}** (${m.category}, \`${m.key}\`) — source: ${m.source}, ${m.before_len} → ${m.after_len} chars`);
    lines.push(`  > ${m.preview}`);
  }
  lines.push('');
  lines.push('## Ambiguous (needs review)');
  lines.push('');
  for (const a of report.ambiguous) {
    lines.push(`- **${a.name}** (${a.category}, \`${a.key}\`) — ${a.reason}`);
  }
  lines.push('');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Backup export (apply mode only) — full collection dump before any write.
// ─────────────────────────────────────────────────────────────────────────────

function exportBackup(docs, backupsDir) {
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `992-purchasable-powers-backup-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(docs, null, 2));
  return backupPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// main()
//
// Accepts an optional overrides object so the integration test can point at
// a fixture markdown dir + throwaway reports/backups dirs instead of the real
// `markdown/` corpus and `server/scripts/{reports,backups}/`. CLI usage
// (`node scripts/uplift-power-rules-text.js [--apply]`) needs none of this —
// every override defaults to the real story-992 paths.
// ─────────────────────────────────────────────────────────────────────────────

export async function main(overrides = {}) {
  const APPLY = overrides.apply != null ? overrides.apply : process.argv.includes('--apply');
  const DRY_RUN = !APPLY;
  const markdownDir = overrides.markdownDir || MARKDOWN_DIR;
  const books = overrides.books || BOOKS;
  const reportsDir = overrides.reportsDir || REPORTS_DIR;
  const backupsDir = overrides.backupsDir || BACKUPS_DIR;

  await connectDb();
  const col = getCollection('purchasable_powers');
  const query = overrides.query || {};
  const powers = await col.find(query).toArray();

  const { byNormName, bookStatus } = loadAllBlocks(markdownDir, books);

  const results = [];
  const costArtifact = [];
  let written = 0;
  let skippedEmpty = 0;

  let backupPath = null;
  if (!DRY_RUN) {
    backupPath = exportBackup(powers, backupsDir);
  }

  for (const p of powers) {
    const m = matchPower(p, byNormName);
    if (m.status === 'unmatched') {
      results.push({ status: 'unmatched', key: p.key, name: p.name, category: p.category });
      continue;
    }
    if (m.status === 'ambiguous') {
      results.push({ status: 'ambiguous', key: p.key, name: p.name, category: p.category, reason: m.reason });
      continue;
    }

    const rulesText = m.block.rulesText;
    const before_len = (p.description || '').length;
    const after_len = rulesText.length;
    const preview = rulesText.slice(0, 150).replace(/\n/g, ' ');

    results.push({
      status: 'matched',
      key: p.key,
      name: p.name,
      category: p.category,
      source: m.source,
      before_len,
      after_len,
      preview,
    });

    const cost_raw = extractCost(m.block);
    if (cost_raw) costArtifact.push({ key: p.key, name: p.name, cost_raw });

    if (!DRY_RUN) {
      if (!rulesText || !rulesText.trim()) {
        skippedEmpty++;
        continue;
      }
      await col.updateOne(
        { _id: p._id },
        { $set: { rules_text: rulesText, rules_source: m.source } }
      );
      written++;
    }
  }

  const report = buildReport(results, bookStatus);
  const markdown = buildMarkdownSummary(report);

  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const reportJsonPath = path.join(reportsDir, '992-uplift-report.json');
  const reportMdPath = path.join(reportsDir, '992-uplift-report.md');
  const costsPath = path.join(reportsDir, '992-costs-extract.json');
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportMdPath, markdown);
  fs.writeFileSync(costsPath, JSON.stringify(costArtifact, null, 2));

  console.log(`\n${DRY_RUN ? '[DRY RUN]' : '[APPLY]'} uplift-power-rules-text.js`);
  console.log(`Docs scanned: ${powers.length}`);
  console.log(`Matched: ${report.totals.matched}, Unmatched: ${report.totals.unmatched}, Ambiguous: ${report.totals.ambiguous}`);
  if (!DRY_RUN) {
    console.log(`Backup written: ${backupPath}`);
    console.log(`Written: ${written}, Skipped (empty parsed text): ${skippedEmpty}`);
  } else {
    console.log(`Reports written to ${reportsDir}. Re-run with --apply to write (never against the live DB for this story).`);
  }

  return { report, written, skippedEmpty, backupPath, reportJsonPath, reportMdPath, costsPath, costArtifact };
}

const _invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (_invokedDirectly) {
  main().catch(err => { console.error(err); process.exit(1); });
}
