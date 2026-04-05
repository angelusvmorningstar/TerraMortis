#!/usr/bin/env python3
"""
docx-to-merits-md.py
Convert a copy-pasted WoD/VtR merits Word document to structured markdown.

The docx has all paragraphs as Normal style. Merit entries follow the pattern:
    Merit Name (●dots●)          ← name line (dots are garbled CID chars)
    Prerequisite: Resolve ●●     ← optional prereq
    Effect: Your character...    ← effect text
    ...body continues...

Usage:
    python scripts/docx-to-merits-md.py docs/CoD\ Core\ Merits.docx
    python scripts/docx-to-merits-md.py docs/CoD\ Core\ Merits.docx -o docs/CoD-merits.md
"""

import docx
import re
import sys
import argparse
import unicodedata
from pathlib import Path


# ─────────────────────────────────────────────
#  Dot character normalisation
# ─────────────────────────────────────────────

# The copy-paste from PDF renders dot ratings as garbled chars.
# They appear as repeated identical non-ASCII characters.
# We detect them by: all chars in a run are the same non-ASCII char.

def looks_like_dots(s):
    """Return True if string is 1–5 U+2022 bullet chars (the dot rating character)."""
    s = s.strip()
    if not s:
        return False
    return all(c == '\u2022' for c in s) and 1 <= len(s) <= 5


def normalise_dots(text):
    """
    Normalise text from copy-pasted PDF:
    - U+2022 (•) = dot rating character → ●
    - U+2018/U+2019 = curly single quotes → '
    - U+201C/U+201D = curly double quotes → "
    - U+2013/U+2014 = en/em dash → -
    """
    text = text.replace('\u2022', '●')
    text = text.replace('\u2018', "'").replace('\u2019', "'")
    text = text.replace('\u201c', '"').replace('\u201d', '"')
    text = text.replace('\u2013', '-').replace('\u2014', '-')
    return text


def dots_to_int(dots_str):
    """Count ● chars in a string."""
    return dots_str.count('●')


# ─────────────────────────────────────────────
#  Merit name detection
# ─────────────────────────────────────────────

# Pattern: "Some Name (●)" or "Some Name (● to ●●●)" or "Some Name (●, ●●, or ●●●●)"
# After normalisation, dots become ●
MERIT_NAME_RE = re.compile(
    r'^(.+?)\s*\((●+(?:\s*(?:to|,|or)\s*●+)*)\)\s*(?:,\s*Style\s*)?$',
    re.IGNORECASE
)

SECTION_HEADER_RE = re.compile(
    r'^(Mental Merits|Physical Merits|Social Merits|General Merits|'
    r'Fighting Style Merits?|Supernatural Merits?|Kindred Merits?|'
    r'Covenant Merits?|[A-Z][a-z]+ Merits?)\s*$'
)

LABEL_RE = re.compile(r'^(Prerequisites?|Effects?|Drawbacks?|Special|Note)\s*:', re.IGNORECASE)


def is_merit_name_line(text):
    """Detect lines that are merit names with dot ratings."""
    # Must contain parentheses
    if '(' not in text or ')' not in text:
        return False
    # Must not start with a known label
    if LABEL_RE.match(text):
        return False
    # The content in parens must be dots (● chars), optionally with "to"/"or"/","
    m = MERIT_NAME_RE.match(text)
    if not m:
        return False
    dots_part = m.group(2)
    # Verify dots_part only has ●, space, "to", ",", "or"
    stripped = re.sub(r'(●+|to|or|,|\s)', '', dots_part)
    return stripped == ''


def parse_rating(dots_str):
    """Parse '●' or '● to ●●●' into a rating string like '1' or '1-3'."""
    parts = re.findall(r'●+', dots_str)
    counts = [len(p) for p in parts]
    if len(counts) == 1:
        return str(counts[0])
    elif len(counts) == 2:
        return f'{counts[0]}-{counts[1]}'
    elif counts:
        return f'{counts[0]}-{counts[-1]}'
    return ''


# ─────────────────────────────────────────────
#  Document parsing
# ─────────────────────────────────────────────

def parse_docx(path):
    """
    Parse a merits docx into a list of merit entry dicts:
    {
        name:     str,
        rating:   str,        e.g. '1' or '1-3'
        prereq:   str | None,
        effect:   str | None,
        body:     [str],      remaining paragraphs
        section:  str,        e.g. 'Mental Merits'
        style:    bool,       True if fighting style
    }
    """
    doc_obj = docx.Document(str(path))
    entries = []
    current = None
    current_section = 'General'
    mode = None   # 'prereq', 'effect', 'body'

    def flush():
        nonlocal current, mode
        if current:
            entries.append(current)
        current = None
        mode = None

    for para in doc_obj.paragraphs:
        raw = para.text
        if not raw.strip():
            continue

        text = normalise_dots(raw).strip()

        # ── Section header ───────────────────────────────────────────
        if SECTION_HEADER_RE.match(text):
            flush()
            current_section = text
            continue

        # ── Merit name line ──────────────────────────────────────────
        if is_merit_name_line(text):
            flush()
            m = MERIT_NAME_RE.match(text)
            name = m.group(1).strip()
            dots_part = m.group(2)
            is_style = bool(re.search(r'\bStyle\b', text, re.IGNORECASE))
            current = {
                'name':    name,
                'rating':  parse_rating(dots_part),
                'prereq':  None,
                'effect':  None,
                'body':    [],
                'section': current_section,
                'style':   is_style,
            }
            mode = 'body'
            continue

        # ── Labelled lines ───────────────────────────────────────────
        if current is not None:
            lm = LABEL_RE.match(text)
            if lm:
                label = lm.group(1).lower().rstrip('s')  # normalise plural
                rest = text[lm.end():].strip()
                if 'prerequisite' in label:
                    current['prereq'] = rest if rest else ''
                    mode = 'prereq'
                elif 'effect' in label:
                    current['effect'] = rest if rest else ''
                    mode = 'effect'
                else:
                    current['body'].append(text)
                    mode = 'body'
                continue

            # Continuation of labelled section or general body
            if mode == 'prereq' and current['prereq'] is not None:
                # Continuation of prerequisite text (wrapped lines)
                if current['prereq']:
                    current['prereq'] += ' ' + text
                else:
                    current['prereq'] = text
            elif mode == 'effect' and current['effect'] is not None:
                if current['effect']:
                    current['effect'] += ' ' + text
                else:
                    current['effect'] = text
                # After first line of effect, switch to body for remainder
                mode = 'body' if current['effect'] else mode
            else:
                current['body'].append(text)

        # Lines before any merit (preamble) — skip
        # continue implicitly

    flush()
    return entries


# ─────────────────────────────────────────────
#  Markdown output
# ─────────────────────────────────────────────

def entry_to_md(e):
    lines = []

    # Heading
    def dots(n):
        try:
            return '●' * int(n)
        except:
            return n
    rating_md = re.sub(r'(\d+)', lambda m: dots(m.group(1)), e['rating'].replace('-', ' to '))
    style_tag = ' *(Style)*' if e['style'] else ''
    lines.append(f"## {e['name']} ({rating_md}){style_tag}")
    lines.append('')

    if e['prereq'] is not None:
        lines.append(f"**Prerequisites:** {e['prereq'] or '—'}")
        lines.append('')

    if e['effect']:
        lines.append(f"**Effect:** {e['effect']}")
        lines.append('')

    for b in e['body']:
        lines.append(b)
    if e['body']:
        lines.append('')

    return '\n'.join(lines)


def entries_to_markdown(entries, source_name):
    output = [f'# {source_name}', '', '---', '']

    current_section = None
    for e in entries:
        if e['section'] != current_section:
            current_section = e['section']
            output.append(f'# {current_section}')
            output.append('')

        output.append(entry_to_md(e))
        output.append('---')
        output.append('')

    return '\n'.join(output)


# ─────────────────────────────────────────────
#  Summary for cross-referencing with MERITS_DB
# ─────────────────────────────────────────────

def print_summary(entries):
    print(f'\n{"Name":<40} {"Rating":<10} {"Has Prereq":<12} {"Has Effect"}')
    print('-' * 80)
    for e in entries:
        prereq = 'Y' if e['prereq'] else '-'
        effect = 'Y' if e['effect'] else '-'
        print(f"{e['name']:<40} {e['rating']:<10} {prereq:<12} {effect}")


# ─────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Convert WoD merits docx to markdown.')
    parser.add_argument('docx_file', help='Path to the .docx file')
    parser.add_argument('-o', '--output', help='Output .md path (default: same name as input)')
    parser.add_argument('--summary', action='store_true', help='Print a summary table to stdout')
    args = parser.parse_args()

    docx_path = Path(args.docx_file)
    if not docx_path.exists():
        print(f'File not found: {docx_path}')
        sys.exit(1)

    out_path = Path(args.output) if args.output else docx_path.with_suffix('.md')

    print(f'Parsing: {docx_path.name}')
    entries = parse_docx(docx_path)
    print(f'Found {len(entries)} merit entries')

    if args.summary:
        print_summary(entries)

    md = entries_to_markdown(entries, docx_path.stem)
    out_path.write_text(md, encoding='utf-8')
    print(f'Written: {out_path}')


if __name__ == '__main__':
    main()
