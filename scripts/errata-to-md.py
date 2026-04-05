#!/usr/bin/env python3
"""
errata-to-md.py
Convert Merits Errata.docx to clean markdown.

Usage:
    python scripts/errata-to-md.py
    python scripts/errata-to-md.py docs/Merits\ Errata.docx -o docs/Merits\ Errata.md
"""

import re
import sys
import argparse
from pathlib import Path

DOCS = Path(__file__).parent.parent / 'docs'
DEFAULT_IN  = DOCS / 'Merits Errata.docx'
DEFAULT_OUT = DOCS / 'Merits Errata.md'


# ─────────────────────────────────────────────
#  Text normalisation (same as other scripts)
# ─────────────────────────────────────────────

def normalise(text):
    text = text.replace('\u2022', '●')
    text = text.replace('\u2018', "'").replace('\u2019', "'")
    text = text.replace('\u201c', '"').replace('\u201d', '"')
    text = text.replace('\u2013', '-').replace('\u2014', '-')
    return text


# ─────────────────────────────────────────────
#  Detection helpers
# ─────────────────────────────────────────────

# Known top-level section headers in the errata
SECTION_HEADERS = {
    'mental merits',
    'physical merits',
    'social merits',
    'general merits',
    'kindred merits',
    'carthian merits',
    'circle of the crone merits',
    'invictus merits',
    'lancea et sanctum merits',
    'ordo dracul merits',
    'carthian law',
    'invictus oaths',
    'crúac styles',
    'cruac styles',
    'fighting style merits',
    'fighting merits',
    'general',
}

PREAMBLE_HEADERS = {
    'cashing in merits',
    'permanent merits',
    'merits errata',
}

MERIT_NAME_RE = re.compile(r'^(.+?)\s*\((●[^)]*)\)\s*(?:,\s*Style\s*)?$', re.IGNORECASE)


def is_section_header(text):
    return text.lower().strip() in SECTION_HEADERS

def is_preamble_header(text):
    return text.lower().strip() in PREAMBLE_HEADERS

def is_merit_name(text):
    return bool(MERIT_NAME_RE.match(text))

def is_source_line(text):
    return text.strip().startswith('Source:')

def collapse_wrapped(lines):
    """Join a list of continuation lines into a single unwrapped string."""
    return ' '.join(l.strip() for l in lines if l.strip())


# ─────────────────────────────────────────────
#  Parse errata docx
# ─────────────────────────────────────────────

def parse_errata_docx(path):
    """
    Returns a list of section dicts:
    {
        type:    'preamble' | 'section' | 'merit',
        title:   str,
        entries: [str]   # for preamble/section: intro paragraphs
                         # for merit: change description paragraphs
        subsections: []  # for section only: list of merit dicts
    }
    """
    import docx as docxlib
    doc = docxlib.Document(str(path))

    result   = []
    current_section = None
    current_merit   = None
    current_lines   = []
    in_preamble     = False
    preamble_block  = None

    def flush_merit():
        nonlocal current_merit, current_lines
        if current_merit is not None:
            current_merit['lines'] = collapse_wrapped(current_lines)
            if current_section:
                current_section['merits'].append(current_merit)
            current_merit = None
            current_lines = []

    def flush_section():
        nonlocal current_section
        flush_merit()
        if current_section is not None:
            result.append(current_section)
        current_section = None

    for para in doc.paragraphs:
        raw = normalise(para.text.strip())
        if not raw:
            continue

        # ── Document title ────────────────────────────────────────
        if raw.lower() == 'merits errata':
            continue

        # ── Preamble section headers (Cashing in Merits, etc.) ───
        if is_preamble_header(raw):
            flush_section()
            preamble_block = {'type': 'preamble', 'title': raw, 'lines': []}
            result.append(preamble_block)
            in_preamble = True
            continue

        # ── Section headers ──────────────────────────────────────
        if is_section_header(raw):
            flush_section()
            in_preamble = False
            preamble_block = None
            current_section = {'type': 'section', 'title': raw, 'merits': []}
            continue

        # ── Preamble body ────────────────────────────────────────
        if in_preamble and preamble_block is not None:
            preamble_block['lines'].append(raw)
            continue

        # ── Merit name line ──────────────────────────────────────
        if current_section is not None and is_merit_name(raw):
            flush_merit()
            m = MERIT_NAME_RE.match(raw)
            current_merit = {
                'name':   m.group(1).strip(),
                'rating': m.group(2),
                'lines':  '',
                'source': '',
            }
            current_lines = []
            continue

        # ── Source citation ──────────────────────────────────────
        if current_merit is not None and is_source_line(raw):
            current_merit['source'] = raw[len('Source:'):].strip()
            continue

        # ── Merit change body ────────────────────────────────────
        if current_merit is not None:
            current_lines.append(raw)
            continue

        # ── Fallback: section-level note ─────────────────────────
        if current_section is not None and not current_merit:
            current_section.setdefault('notes', []).append(raw)

    flush_section()
    return result


# ─────────────────────────────────────────────
#  Render to markdown
# ─────────────────────────────────────────────

SECTION_TITLE_MAP = {
    'general merits':           'Kindred Merits',
    'kindred merits':           'Kindred Merits',
    'carthian merits':          'Carthian Movement Merits',
    'circle of the crone merits': 'Circle of the Crone Merits',
    'invictus merits':          'Invictus Merits',
    'lancea et sanctum merits': 'Lancea et Sanctum Merits',
    'ordo dracul merits':       'Ordo Dracul Merits',
    'cruac styles':             'Crúac Styles',
    'carthian law':             'Carthian Law',
    'invictus oaths':           'Invictus Oaths',
}

def canonical_section(raw_title):
    return SECTION_TITLE_MAP.get(raw_title.lower().strip(), raw_title.title())


def render_errata(sections):
    lines = [
        '# Terra Mortis — Merits Errata',
        '',
        '*House rules and errata for Terra Mortis LARP. Where errata conflicts with book text, errata wins.*',
        '',
        '---',
        '',
    ]

    for block in sections:
        if block['type'] == 'preamble':
            lines.append(f"## {block['title'].title()}")
            lines.append('')
            if block.get('lines'):
                lines.append(collapse_wrapped(block['lines']))
                lines.append('')
            lines.append('---')
            lines.append('')

        elif block['type'] == 'section':
            title = canonical_section(block['title'])
            lines.append(f'# {title}')
            lines.append('')

            for note in block.get('notes', []):
                lines.append(f'*{note}*')
                lines.append('')

            for merit in block.get('merits', []):
                lines.append(f"### {merit['name']} ({merit['rating']})")
                lines.append('')
                if merit['lines']:
                    lines.append(merit['lines'])
                    lines.append('')
                if merit.get('source'):
                    lines.append(f"*Source: {merit['source']}*")
                    lines.append('')
                lines.append('---')
                lines.append('')

    return '\n'.join(lines)


# ─────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Convert Merits Errata.docx to markdown.')
    parser.add_argument('docx_file', nargs='?', default=str(DEFAULT_IN))
    parser.add_argument('-o', '--output', default=str(DEFAULT_OUT))
    args = parser.parse_args()

    in_path  = Path(args.docx_file)
    out_path = Path(args.output)

    if not in_path.exists():
        print(f'Not found: {in_path}')
        sys.exit(1)

    print(f'Parsing: {in_path.name}')
    sections = parse_errata_docx(in_path)

    merit_count = sum(len(b.get('merits', [])) for b in sections if b['type'] == 'section')
    section_count = sum(1 for b in sections if b['type'] == 'section')
    print(f'  {section_count} sections, {merit_count} merit entries')

    md = render_errata(sections)
    out_path.write_text(md, encoding='utf-8')
    print(f'Written: {out_path}')


if __name__ == '__main__':
    main()
