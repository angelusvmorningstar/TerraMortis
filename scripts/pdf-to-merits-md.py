#!/usr/bin/env python3
"""
pdf-to-merits-md.py
Extract merit entries from WoD/VtR rulebook PDFs and output structured markdown.

Merit names are in the image/background layer of these PDFs and cannot be
extracted as text. This script extracts Prerequisites and Effects, groups
them by dot-rating markers, and attempts to match names from the existing
merits-db-data.js using prereq + effect keyword matching.

Usage:
    python scripts/pdf-to-merits-md.py docs/Core\ Merits.pdf
    python scripts/pdf-to-merits-md.py docs/Core\ Merits.pdf -o docs/core-merits-extracted.md
    python scripts/pdf-to-merits-md.py --all          # process all PDFs in docs/

Requires: pip install pymupdf
"""

import fitz  # PyMuPDF
import re
import json
import sys
import argparse
from pathlib import Path

# ─────────────────────────────────────────────
#  Config
# ─────────────────────────────────────────────

DOCS_DIR = Path(__file__).parent.parent / 'docs'
MERITS_JS = Path(__file__).parent.parent / 'public/js/data/merits-db-data.js'

PDF_FILES = [
    'Core Merits.pdf',
    'VTR Core Merits.pdf',
    'Core Merits Fighting Styles.pdf',
    'Hurt Locker Merits.pdf',
    'SotC Merits.pdf',
]

# Font size thresholds (from inspection of these specific PDFs)
SIZE_DOT_RATING   = 14.0   # Large dot markers (●, ●●, etc.) — marks a merit entry/level
SIZE_PAGE_NUMBER  = 12.0   # Page numbers to skip
SIZE_BODY         = 10.0   # Normal body text

# Two-column layout: right column starts around x=295
COL_SPLIT_X = 295

# ─────────────────────────────────────────────
#  Load known merits from merits-db-data.js
# ─────────────────────────────────────────────

def load_known_merits():
    """Return dict of {lowercase_name: {desc, prereq, rating, type}} from the JS module."""
    if not MERITS_JS.exists():
        return {}
    text = MERITS_JS.read_text(encoding='utf-8')
    m = re.search(r'export const MERITS_DB\s*=\s*(\{.+\});', text, re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}


# ─────────────────────────────────────────────
#  PDF parsing
# ─────────────────────────────────────────────

def is_page_number(text, size):
    return size >= SIZE_PAGE_NUMBER and re.match(r'^\s*\d{1,3}\s*$', text)

def is_dot_marker(size):
    """Large size = the decorative dot-rating symbol."""
    return size >= SIZE_DOT_RATING

def count_dots(text):
    """
    The dot characters render as garbage glyphs from CIDFont+F1.
    They show as repeated single characters. Count them as the merit rating.
    """
    cleaned = text.strip()
    if not cleaned:
        return 0
    # All same character = dot rating (1–5 dots)
    if len(set(cleaned)) == 1 and 1 <= len(cleaned) <= 5:
        return len(cleaned)
    # Sometimes multiple ratings appear joined: e.g. "● ●●●●●" = "1 to 5"
    parts = cleaned.split()
    if all(len(set(p)) == 1 for p in parts if p):
        counts = [len(p) for p in parts if p]
        return counts  # list means "X to Y"
    return 0


def extract_page_spans(page):
    """
    Extract all text spans from a page, sorted by column then vertical position.
    Returns list of dicts: {text, size, bold, x, y, col}
    """
    spans = []
    for block in page.get_text('dict')['blocks']:
        if block['type'] != 0:
            continue
        for line in block['lines']:
            y = line['bbox'][1]
            x_left = min(s['bbox'][0] for s in line['spans'])
            col = 1 if x_left >= COL_SPLIT_X else 0
            for span in line['spans']:
                spans.append({
                    'text':  span['text'],
                    'size':  span['size'],
                    'bold':  bool(span['flags'] & 16),
                    'x':     span['bbox'][0],
                    'y':     y,
                    'col':   col,
                })
    # Sort: left col first, then right col; within col by y then x
    spans.sort(key=lambda s: (s['col'], s['y'], s['x']))
    return spans


def flush_entry(entry, lines):
    """Finalise the current entry, clean up the body text."""
    if entry is None:
        return
    body = ' '.join(lines)
    # Collapse multiple spaces
    body = re.sub(r'  +', ' ', body)
    # Clean up hyphenated line breaks from the PDF column layout
    body = re.sub(r'(\w)-\s+(\w)', r'\1\2', body)
    entry['body'] = body.strip()


def process_pdf(pdf_path):
    """
    Parse a PDF and return a list of entry dicts:
    {
        dots:      int or [int, int] for ranges,
        dots_raw:  str (raw glyph text),
        prereq:    str or None,
        body:      str,
        page:      int,
        name:      str or None   (filled in later by name-matching)
    }
    """
    doc = fitz.open(str(pdf_path))
    entries = []
    current = None
    current_lines = []
    capture_prereq = False

    for page_num in range(len(doc)):
        page = doc[page_num]
        spans = extract_page_spans(page)

        for span in spans:
            text  = span['text']
            size  = span['size']
            bold  = span['bold']
            stripped = text.strip()

            if not stripped:
                continue

            # Skip page numbers
            if is_page_number(stripped, size):
                continue

            # ── New merit entry / dot level ──────────────────────────
            if is_dot_marker(size):
                # Save previous entry
                if current is not None:
                    flush_entry(current, current_lines)
                    entries.append(current)

                dots = count_dots(stripped)
                current = {
                    'dots':     dots,
                    'dots_raw': stripped,
                    'prereq':   None,
                    'body':     '',
                    'page':     page_num + 1,
                    'name':     None,
                }
                current_lines = []
                capture_prereq = False
                continue

            # ── Bold labels (Prerequisite, Effect, etc.) ─────────────
            if bold and current is not None:
                label = stripped.rstrip(':').lower()
                if 'prerequisite' in label:
                    capture_prereq = True
                    current_lines.append(f'\n**{stripped}**')
                    continue
                else:
                    capture_prereq = False
                    current_lines.append(f'\n**{stripped}**')
                    continue

            # ── Body text ─────────────────────────────────────────────
            if current is not None:
                # If we're right after a Prerequisite label, capture it
                if capture_prereq and current['prereq'] is None:
                    current['prereq'] = stripped
                    capture_prereq = False

                # Replace the garbled dot glyphs inline (dots in prereq text)
                # These appear as repeated same-character strings of 1–5 chars
                def replace_inline_dots(m):
                    n = len(m.group(0).strip())
                    return '●' * n if 1 <= n <= 5 else m.group(0)

                # We can't easily regex the CID garbage, so just append as-is
                # (they'll show as ? in the markdown; user can fix)
                current_lines.append(stripped)

    # Flush last entry
    if current is not None:
        flush_entry(current, current_lines)
        entries.append(current)

    return entries


# ─────────────────────────────────────────────
#  Name matching against merits-db-data.js
# ─────────────────────────────────────────────

def build_match_index(known_merits):
    """
    Build a simple index for matching.
    Key: set of significant words from the merit name.
    Returns list of (name, words, prereq_words) tuples.
    """
    index = []
    stopwords = {'the', 'of', 'and', 'or', 'a', 'an', 'in', 'for', 'to', 'with'}
    for name, data in known_merits.items():
        words = {w for w in re.split(r'\W+', name) if len(w) > 3 and w not in stopwords}
        prereq_str = (data.get('prereq') or '').lower()
        prereq_words = {w for w in re.split(r'\W+', prereq_str) if len(w) > 3}
        index.append((name, words, prereq_words, data))
    return index


def match_name(entry, index):
    """
    Attempt to identify the merit name by matching body/prereq text
    against the known merits index.
    Returns (name, confidence) or (None, 0).
    """
    body_lower = entry['body'].lower()
    prereq_lower = (entry['prereq'] or '').lower()
    combined = body_lower + ' ' + prereq_lower

    best_name = None
    best_score = 0

    for name, name_words, prereq_words, data in index:
        score = 0

        # Name word matches in body text
        name_hits = sum(1 for w in name_words if w in combined)
        if name_words:
            score += (name_hits / len(name_words)) * 40

        # Prereq word matches
        prereq_hits = sum(1 for w in prereq_words if w in combined)
        if prereq_words:
            score += (prereq_hits / len(prereq_words)) * 30

        # Rating match bonus
        db_rating = data.get('rating', '')
        entry_dots = entry['dots']
        if isinstance(entry_dots, int) and db_rating:
            try:
                parts = str(db_rating).replace('–', '-').split('-')
                if len(parts) == 2:
                    lo, hi = int(parts[0]), int(parts[1])
                    if lo <= entry_dots <= hi:
                        score += 20
                elif int(parts[0]) == entry_dots:
                    score += 20
            except (ValueError, IndexError):
                pass

        if score > best_score and score >= 30:
            best_score = score
            best_name = name

    return best_name, best_score


# ─────────────────────────────────────────────
#  Markdown output
# ─────────────────────────────────────────────

def dots_display(dots):
    if isinstance(dots, list):
        return '●' * dots[0] + ' to ' + '●' * dots[-1]
    if isinstance(dots, int) and 1 <= dots <= 5:
        return '●' * dots
    return f'({dots}?)'


def entries_to_markdown(entries, source_name, known_merits):
    index = build_match_index(known_merits)

    # Attempt name matching
    for e in entries:
        name, confidence = match_name(e, index)
        e['name'] = name
        e['match_confidence'] = confidence

    lines = [
        f'# {source_name}',
        '',
        f'> Extracted from PDF. **Merit names are in the image layer and cannot be read automatically.**',
        f'> Names marked `[NEEDS NAME — page N]` must be filled in manually.',
        f'> Names with `~` prefix are guesses (confidence score shown) — verify before using.',
        '',
        f'---',
        '',
    ]

    for e in entries:
        d = dots_display(e['dots'])
        if e['name'] and e['match_confidence'] >= 60:
            heading = f"{e['name'].title()} ({d})"
        elif e['name']:
            heading = f"~{e['name'].title()} ({d})  <!-- confidence: {e['match_confidence']:.0f} -->"
        else:
            heading = f"[NEEDS NAME — page {e['page']}] ({d})"

        lines.append(f'## {heading}')
        lines.append('')

        if e['prereq']:
            lines.append(f'**Prerequisites:** {e["prereq"]}')
            lines.append('')

        lines.append(e['body'].replace('\n', '\n\n'))
        lines.append('')
        lines.append('---')
        lines.append('')

    return '\n'.join(lines)


# ─────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Extract merits from WoD/VtR PDFs to markdown.')
    parser.add_argument('pdf', nargs='?', help='Path to PDF file')
    parser.add_argument('-o', '--output', help='Output markdown file path')
    parser.add_argument('--all', action='store_true', help='Process all known PDFs in docs/')
    args = parser.parse_args()

    known_merits = load_known_merits()
    if known_merits:
        print(f'Loaded {len(known_merits)} known merits from merits-db-data.js')
    else:
        print('Warning: could not load merits-db-data.js — name matching disabled')

    pdfs_to_process = []

    if args.all:
        for fname in PDF_FILES:
            p = DOCS_DIR / fname
            if p.exists():
                pdfs_to_process.append(p)
            else:
                print(f'  Skipping (not found): {fname}')
    elif args.pdf:
        pdfs_to_process.append(Path(args.pdf))
    else:
        parser.print_help()
        sys.exit(1)

    for pdf_path in pdfs_to_process:
        if not pdf_path.exists():
            print(f'Not found: {pdf_path}')
            continue

        print(f'\nProcessing: {pdf_path.name} ...')
        entries = process_pdf(pdf_path)
        print(f'  Found {len(entries)} entries')

        if args.output and len(pdfs_to_process) == 1:
            out_path = Path(args.output)
        else:
            out_path = pdf_path.with_suffix('.extracted.md')

        md = entries_to_markdown(entries, pdf_path.stem, known_merits)
        out_path.write_text(md, encoding='utf-8')
        print(f'  Written: {out_path}')

    print('\nDone.')


if __name__ == '__main__':
    main()
