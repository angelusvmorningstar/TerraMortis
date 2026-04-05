#!/usr/bin/env python3
"""
build-merits-ssot.py
Compile all extracted merit docs into two single-source-of-truth markdown files.

Outputs:
  docs/merits-ssot.md          — all non-fighting merits
  docs/fighting-merits-ssot.md — all fighting style merits

Precedence (highest wins for duplicates):
  General merits:   CoD Core > VtR Core
  Fighting merits:  Hurt Locker > CoD Core Fighting
  Covenant merits:  SotC (unique)
  Kindred merits:   VtR Core (unique)
  Errata:           patches rating/prereq/effect fields; never replaces full entry

Usage:
  python scripts/build-merits-ssot.py
"""

import re
import sys
from pathlib import Path

DOCS = Path(__file__).parent.parent / 'docs'

# ─────────────────────────────────────────────────────────────────
#  Source files in load order (later = lower precedence for dedup)
#  Fighting sources are handled separately.
# ─────────────────────────────────────────────────────────────────

GENERAL_SOURCES = [
    # (path, label, precedence)  higher precedence = wins on conflict
    (DOCS / 'VtR Core Merits.md',                  'VtR Core',   10),
    (DOCS / 'CoD Core Merits.md',                  'CoD Core',   20),
    (DOCS / 'Secret of the Covenant Merits.md',    'SotC',       30),
]

FIGHTING_SOURCES = [
    (DOCS / 'CoD Core Fighting Merits.md',         'CoD Fight',  10),
    (DOCS / 'Hurt Locker Merits.md',               'Hurt Locker',20),
]

ERRATA_PATH = DOCS / 'Merits Errata.docx'

# ─────────────────────────────────────────────────────────────────
#  AE → BE spelling substitutions
# ─────────────────────────────────────────────────────────────────

AE_TO_BE = [
    # Word-boundary replacements (case-preserving handled below)
    (r'\barmor\b',          'armour'),
    (r'\bArmor\b',          'Armour'),
    (r'\barmored\b',        'armoured'),
    (r'\bArmored\b',        'Armoured'),
    (r'\bdefense\b',        'defence'),
    (r'\bDefense\b',        'Defence'),
    (r'\bdefenses\b',       'defences'),
    (r'\bDefenses\b',       'Defences'),
    (r'\boffense\b',        'offence'),
    (r'\bOffense\b',        'Offence'),
    (r'\bvigour\b',         'vigour'),   # already correct; keep
    (r'\bvigor\b',          'vigour'),
    (r'\bVigor\b',          'Vigour'),
    (r'\bhonor\b',          'honour'),
    (r'\bHonor\b',          'Honour'),
    (r'\bhonored\b',        'honoured'),
    (r'\bHonored\b',        'Honoured'),
    (r'\bhumor\b',          'humour'),
    (r'\bHumor\b',          'Humour'),
    (r'\bfavor\b',          'favour'),
    (r'\bFavor\b',          'Favour'),
    (r'\bfavors\b',         'favours'),
    (r'\bFavors\b',         'Favours'),
    (r'\bfavorite\b',       'favourite'),
    (r'\bFavorite\b',       'Favourite'),
    (r'\bbehavior\b',       'behaviour'),
    (r'\bBehavior\b',       'Behaviour'),
    (r'\bbehaviors\b',      'behaviours'),
    (r'\bcolor\b',          'colour'),
    (r'\bColor\b',          'Colour'),
    (r'\bcolors\b',         'colours'),
    (r'\bColors\b',         'Colours'),
    (r'\bmaneuver\b',       'manoeuvre'),
    (r'\bManeuver\b',       'Manoeuvre'),
    (r'\bmaneuvers\b',      'manoeuvres'),
    (r'\bManeuvers\b',      'Manoeuvres'),
    (r'\bmaneuvering\b',    'manoeuvring'),
    (r'\bManeuvering\b',    'Manoeuvring'),
    (r'\borganize\b',       'organise'),
    (r'\bOrganize\b',       'Organise'),
    (r'\borganizes\b',      'organises'),
    (r'\borganized\b',      'organised'),
    (r'\brecognize\b',      'recognise'),
    (r'\bRecognize\b',      'Recognise'),
    (r'\brecognizes\b',     'recognises'),
    (r'\brecognized\b',     'recognised'),
    (r'\bsocialize\b',      'socialise'),
    (r'\bSocialize\b',      'Socialise'),
    (r'\bcapitalize\b',     'capitalise'),
    (r'\bCapitalize\b',     'Capitalise'),
    (r'\bspecialty\b',      'speciality'),
    (r'\bSpecialty\b',      'Speciality'),
    (r'\bspecialties\b',    'specialities'),
    (r'\bSpecialties\b',    'Specialities'),
    (r'\bspecialization\b', 'specialisation'),
    (r'\bSpecialization\b', 'Specialisation'),
    (r'\bspecialize\b',     'specialise'),
    (r'\bSpecialize\b',     'Specialise'),
    (r'\banalyze\b',        'analyse'),
    (r'\bAnalyze\b',        'Analyse'),
    (r'\bcentered\b',       'centred'),
    (r'\bCentered\b',       'Centred'),
    (r'\bcenter\b',         'centre'),
    (r'\bCenter\b',         'Centre'),
    (r'\blabor\b',          'labour'),
    (r'\bLabor\b',          'Labour'),
    (r'\bneighborhood\b',   'neighbourhood'),
    (r'\bNeighborhood\b',   'Neighbourhood'),
    (r'\bneighbor\b',       'neighbour'),
    (r'\bNeighbor\b',       'Neighbour'),
    (r'\bneighbors\b',      'neighbours'),
    (r'\bpractice\b',       'practise'),   # verb form; noun stays 'practice'
    # Note: 'practise' as verb is BE; 'practice' as noun is correct in both
    # Too risky to auto-convert; skip
    (r'\brumor\b',          'rumour'),
    (r'\bRumor\b',          'Rumour'),
    (r'\brumors\b',         'rumours'),
    (r'\btraveled\b',       'travelled'),
    (r'\btraveling\b',      'travelling'),
    (r'\bmodeling\b',       'modelling'),
    (r'\bcounseling\b',     'counselling'),
    (r'\bfulfill\b',        'fulfil'),
    (r'\bFulfill\b',        'Fulfil'),
    (r'\binstall\b',        'install'),    # same in BE; skip
    (r'\bprogram\b',        'programme'),  # risky (software context); skip
    (r'\bjail\b',           'gaol'),       # too archaic; skip
    # Game-specific
    (r'\bManeuvering\b',    'Manoeuvring'),
    (r'\bSocial Maneuvering\b', 'Social Manoeuvring'),
]

# Remove risky/ambiguous entries (practice/program/jail/install)
AE_TO_BE = [(p, r) for p, r in AE_TO_BE if r not in ('practise', 'programme', 'gaol')]


def apply_spelling(text):
    for pattern, replacement in AE_TO_BE:
        text = re.sub(pattern, replacement, text)
    return text


# ─────────────────────────────────────────────────────────────────
#  Parse extracted markdown files
# ─────────────────────────────────────────────────────────────────

def parse_md(path):
    """
    Parse an extracted merits .md file into a list of merit dicts:
    { name, rating, prereq, effect, body, section, style, source }
    """
    text = path.read_text(encoding='utf-8')
    entries = []
    current = None
    current_section = 'General'
    body_lines = []

    def flush():
        nonlocal current, body_lines
        if current:
            # Collapse wrapped body lines into single paragraph
            raw_body = collapse_lines(body_lines)
            current['body'] = raw_body
            entries.append(current)
        current = None
        body_lines = []

    for line in text.splitlines():
        stripped = line.strip()

        # H1 = file title or section header
        if stripped.startswith('# '):
            heading = stripped[2:].strip()
            if heading in ('---', '') or 'Merits' in heading or 'Oaths' in heading:
                current_section = heading
            continue

        # H2 = merit entry
        if stripped.startswith('## '):
            flush()
            title = stripped[3:].strip()
            # Remove style tag
            is_style = '*(Style)*' in title
            title = title.replace('*(Style)*', '').strip()
            # Parse name and rating: "Name (●●)" or "Name (● to ●●●)"
            m = re.match(r'^(.+?)\s*\((●[^)]*)\)\s*$', title)
            if m:
                name = m.group(1).strip()
                rating_dots = m.group(2)
                rating = dots_to_rating(rating_dots)
            else:
                name = title
                rating = ''
            current = {
                'name':    name,
                'rating':  rating,
                'prereq':  None,
                'effect':  None,
                'body':    '',
                'section': current_section,
                'style':   is_style,
                'source':  path.stem,
                'removed': False,
                'errata_notes': [],
            }
            body_lines = []
            continue

        if current is None:
            continue

        # Prerequisites line
        if stripped.startswith('**Prerequisites:**') or stripped.startswith('**Prerequisite:**'):
            val = re.sub(r'^\*\*Prerequisites?:\*\*\s*', '', stripped)
            current['prereq'] = val.strip()
            continue

        # Effect line
        if stripped.startswith('**Effect:**'):
            val = re.sub(r'^\*\*Effect:\*\*\s*', '', stripped)
            current['effect'] = val.strip()
            continue

        # Separator
        if stripped == '---':
            continue

        # Body text
        if stripped:
            body_lines.append(stripped)

    flush()
    return entries


def dots_to_rating(dots_str):
    """Convert '●●●' or '● to ●●●' to '3' or '1-3'."""
    parts = re.findall(r'●+', dots_str)
    counts = [len(p) for p in parts]
    if not counts:
        return ''
    if len(counts) == 1:
        return str(counts[0])
    return f'{counts[0]}-{counts[-1]}'


def collapse_lines(lines):
    """
    Collapse a list of text lines into single paragraphs.
    Blank lines between items are preserved as paragraph breaks.
    """
    if not lines:
        return ''
    paragraphs = []
    current = []
    for line in lines:
        if not line.strip():
            if current:
                paragraphs.append(' '.join(current))
                current = []
        else:
            current.append(line.strip())
    if current:
        paragraphs.append(' '.join(current))
    return '\n\n'.join(paragraphs)


# ─────────────────────────────────────────────────────────────────
#  Parse errata from docx
# ─────────────────────────────────────────────────────────────────

def parse_errata():
    """
    Parse Merits Errata.docx into a dict of patches keyed by lowercase merit name.
    Each patch: { rating, prereq, effect, removed, notes }
    """
    try:
        import docx as docxlib
    except ImportError:
        print('Warning: python-docx not installed, errata skipped.')
        return {}

    if not ERRATA_PATH.exists():
        print(f'Warning: errata not found at {ERRATA_PATH}')
        return {}

    doc = docxlib.Document(str(ERRATA_PATH))
    patches = {}
    current_name = None

    # Normalise dots in errata text
    def norm(text):
        text = text.replace('\u2022', '●')
        text = text.replace('\u2018', "'").replace('\u2019', "'")
        text = text.replace('\u201c', '"').replace('\u201d', '"')
        text = text.replace('\u2013', '-').replace('\u2014', '-')
        return text

    REMOVED_PHRASES = [
        'removed from play',
        'removed',
    ]

    RATING_RE = re.compile(
        r'cost (?:reduced|increased) from .+? to (\d+) dot',
        re.IGNORECASE
    )
    PREREQ_RE = re.compile(
        r'prerequisites? (?:now (?:read[s]?|changed to)|changed to|now):?\s*(.+)',
        re.IGNORECASE
    )
    REWRITE_RE = re.compile(r'merit now reads?:?', re.IGNORECASE)

    # Merit name line: text ending in (●) or similar, or short title lines
    # In the errata doc, merit names appear as e.g. "Iron Will (●●)"
    ERRATA_NAME_RE = re.compile(r'^(.+?)\s*\((●[^)]*)\)\s*$')

    lines = [norm(p.text.strip()) for p in doc.paragraphs if p.text.strip()]

    i = 0
    current_patch = None
    collecting_rewrite = False
    rewrite_lines = []

    while i < len(lines):
        line = lines[i]

        # Section headers (Mental Merits, Physical Merits, etc.) — reset context
        if re.match(r'^(Mental|Physical|Social|General|Kindred|Carthian|Circle|Invictus|Lancea|Ordo|Fighting Style|Crúac|Carthian Law|Invictus Oaths?)\b', line) and len(line) < 40:
            current_name = None
            current_patch = None
            collecting_rewrite = False
            i += 1
            continue

        # Merit name line in errata
        m = ERRATA_NAME_RE.match(line)
        if m:
            # Save previous
            if current_patch and collecting_rewrite and rewrite_lines:
                current_patch['effect'] = collapse_lines(rewrite_lines)
                collecting_rewrite = False
                rewrite_lines = []

            current_name = m.group(1).strip().lower()
            current_patch = patches.setdefault(current_name, {
                'rating': None, 'prereq': None, 'effect': None,
                'removed': False, 'notes': []
            })
            i += 1
            continue

        # Also catch name lines without dot rating (some errata entries)
        # e.g. "Iron Will" standalone then next line is the change
        # These tend to be short lines not starting with known labels
        if (current_patch is None and current_name is None and
                len(line) < 60 and
                not line.startswith('Source:') and
                not line[0].islower()):
            # Could be a merit name without rating
            if not re.match(r'^(Prerequisite|Effect|Cost|Removed|Changed|Now|Merit|Note|Source)', line, re.IGNORECASE):
                potential_name = line.lower().rstrip('.')
                # Only treat as name if it doesn't look like a sentence
                if len(potential_name.split()) <= 6:
                    current_name = potential_name
                    current_patch = patches.setdefault(current_name, {
                        'rating': None, 'prereq': None, 'effect': None,
                        'removed': False, 'notes': []
                    })
                    i += 1
                    continue

        if current_patch is None:
            i += 1
            continue

        line_lower = line.lower()

        # Removal — "Removed from play." often has "Source: ..." on same line
        if 'removed from play' in line_lower:
            current_patch['removed'] = True
            i += 1
            continue

        # Rating change
        rm = RATING_RE.search(line)
        if rm:
            current_patch['rating'] = rm.group(1)
            i += 1
            continue

        # Explicit rating in parentheses at start: "(●)" or "(● to ●●●)"
        if line.startswith('(') and ')' in line[:10]:
            dots_m = re.match(r'^\((●[^)]*)\)', line)
            if dots_m:
                current_patch['rating'] = dots_to_rating(dots_m.group(1))
                i += 1
                continue

        # Prereq change
        pm = PREREQ_RE.search(line)
        if pm:
            current_patch['prereq'] = pm.group(1).strip().rstrip('.')
            i += 1
            continue

        # Merit rewrite ("Merit now reads:")
        if REWRITE_RE.search(line):
            collecting_rewrite = True
            rewrite_lines = []
            i += 1
            continue

        # Collecting rewrite lines
        if collecting_rewrite:
            # Stop collecting on source line or new merit name
            if line.startswith('Source:') or ERRATA_NAME_RE.match(line):
                current_patch['effect'] = collapse_lines(rewrite_lines)
                collecting_rewrite = False
                rewrite_lines = []
                if ERRATA_NAME_RE.match(line):
                    continue  # re-process this line
            else:
                rewrite_lines.append(line)
                i += 1
                continue

        # Clarifications / notes
        if line.startswith('Source:'):
            i += 1
            continue

        # Anything else with substance = note
        if len(line) > 10 and not line.startswith('('):
            current_patch['notes'].append(line)

        i += 1

    # Flush last rewrite
    if current_patch and collecting_rewrite and rewrite_lines:
        current_patch['effect'] = collapse_lines(rewrite_lines)

    return patches


# ─────────────────────────────────────────────────────────────────
#  Categorisation
# ─────────────────────────────────────────────────────────────────

CATEGORY_ORDER = [
    'Mental Merits',
    'Physical Merits',
    'Social Merits',
    'Kindred Merits',
    'Carthian Movement Merits',
    'Carthian Law',
    'Circle of the Crone Merits',
    'Invictus Merits',
    'Invictus Oaths',
    'Lancea et Sanctum Merits',
]

# Categories to silently exclude (non-playable covenants, etc.)
EXCLUDED_CATEGORIES = {'Ordo Dracul Merits'}

FIGHTING_CATEGORIES = ['Fighting Merits']

# DB type → category
DB_TYPE_MAP = {
    'Mental':       'Mental Merits',
    'Physical':     'Physical Merits',
    'Social':       'Social Merits',
    'Kindred':      'Kindred Merits',   # refined further by prereq parsing below
    'Carthian Law': 'Carthian Law',
    'Invictus Oath':'Invictus Oaths',
    'Style':        'Fighting Merits',
}

# Prereq keyword → covenant category (checked in order)
COVENANT_PREREQ = [
    (r'carthian status',       'Carthian Movement Merits'),
    (r'crone status|circle',   'Circle of the Crone Merits'),
    (r'invictus status',       'Invictus Merits'),
    (r'lance status|sanctified','Lancea et Sanctum Merits'),
    (r'ordo status|dragon',    'Ordo Dracul Merits'),
]

# Hardcoded overrides for merits whose prereqs don't clearly identify covenant
COVENANT_OVERRIDES = {
    'alley cat':                    'Carthian Movement Merits',
    'army of one':                  'Carthian Movement Merits',
    'breaking the chains':          'Carthian Movement Merits',
    'cease fire':                   'Carthian Movement Merits',
    'coda against sorcery':         'Carthian Movement Merits',
    'empower judiciary':            'Carthian Movement Merits',
    'establish precedent':          'Carthian Movement Merits',
    'finger on the pulse':          'Carthian Movement Merits',
    'honey with vinegar':           'Carthian Movement Merits',
    'i know a guy':                 'Carthian Movement Merits',
    'jack-booted thug':             'Carthian Movement Merits',
    'mandate from the masses':      'Carthian Movement Merits',
    'picket line':                  'Carthian Movement Merits',
    'plausible deniability':        'Carthian Movement Merits',
    'right of return':              'Carthian Movement Merits',
    'sell out':                     'Carthian Movement Merits',
    'smooth criminal':              'Carthian Movement Merits',
    'strength of resolution':       'Carthian Movement Merits',
    'toss that shit right back':    'Carthian Movement Merits',
    'weaponise dissent':            'Carthian Movement Merits',
    'weaponize dissent':            'Carthian Movement Merits',
    'altar':                        'Circle of the Crone Merits',
    'chorister':                    'Circle of the Crone Merits',
    'mandragora garden':            'Circle of the Crone Merits',
    'the mother-daughter bond':     'Circle of the Crone Merits',
    'mother-daughter bond':         'Circle of the Crone Merits',
    'opening the void':             'Circle of the Crone Merits',
    'primal creation':              'Circle of the Crone Merits',
    'unbridled chaos':              'Circle of the Crone Merits',
    'undead menses':                'Circle of the Crone Merits',
    'viral mythology':              'Circle of the Crone Merits',
    "what you've done for her lately": 'Circle of the Crone Merits',
    'attaché':                      'Invictus Merits',
    'attache':                      'Invictus Merits',
    'crowdsourcing':                'Invictus Merits',
    'dynasty membership':           'Invictus Merits',
    'friends in high places':       'Invictus Merits',
    'information network':          'Invictus Merits',
    'invested':                     'Invictus Merits',
    'major domo':                   'Invictus Merits',
    'moderator':                    'Invictus Merits',
    'noblesse oblige':              'Invictus Merits',
    'notary':                       'Invictus Merits',
    'one foot in the door':         'Invictus Merits',
    'prestigious sire':             'Invictus Merits',
    'social engineering':           'Invictus Merits',
    'speaker for the silent':       'Invictus Merits',
    'tech-savvy':                   'Invictus Merits',
    'travel agent':                 'Invictus Merits',
    'where the bodies are buried':  'Invictus Merits',
    'anointed':                     'Lancea et Sanctum Merits',
    'laity':                        'Lancea et Sanctum Merits',
    'lorekeeper':                   'Lancea et Sanctum Merits',
    'sanctuary':                    'Lancea et Sanctum Merits',
    'sorcerous eunuch':             'Lancea et Sanctum Merits',
    'stigmata':                     'Lancea et Sanctum Merits',
    'independent study':            'Ordo Dracul Merits',
    'temple of damnation':          'Ordo Dracul Merits',
}

# Load DB types once at module level
_DB_TYPES = {}

def load_db_types():
    global _DB_TYPES
    if _DB_TYPES:
        return
    import json
    js_path = Path(__file__).parent.parent / 'public/js/data/merits-db-data.js'
    if not js_path.exists():
        return
    text = js_path.read_text(encoding='utf-8')
    m = re.search(r'export const MERITS_DB\s*=\s*(\{.+\});', text, re.DOTALL)
    if m:
        try:
            db = json.loads(m.group(1))
            _DB_TYPES = {k: v.get('type', '') for k, v in db.items()}
        except Exception:
            pass


def categorise(entry):
    load_db_types()
    key = entry['name'].lower().strip()

    # 1. Hardcoded covenant override
    if key in COVENANT_OVERRIDES:
        return COVENANT_OVERRIDES[key]

    # 2. DB type lookup
    db_type = _DB_TYPES.get(key, '')
    if db_type and db_type != 'Kindred':
        return DB_TYPE_MAP.get(db_type, 'Kindred Merits')

    # 3. Prereq-based covenant detection
    prereq = (entry.get('prereq') or '').lower()
    for pattern, cat in COVENANT_PREREQ:
        if re.search(pattern, prereq):
            return cat

    # 4. DB says Kindred or unknown → Kindred Merits
    return 'Kindred Merits'


# ─────────────────────────────────────────────────────────────────
#  Build merged merit set
# ─────────────────────────────────────────────────────────────────

def merge_sources(sources):
    """
    Load sources in precedence order (lowest first), higher precedence overwrites.
    Returns dict keyed by lowercase name: best entry.
    """
    merged = {}  # lowercase name -> entry

    for path, label, precedence in sorted(sources, key=lambda x: x[2]):
        if not path.exists():
            print(f'  Skipping (not found): {path.name}')
            continue
        entries = parse_md(path)
        print(f'  Loaded {len(entries):3d} entries from {path.name}')
        for e in entries:
            key = e['name'].lower().strip()
            existing = merged.get(key)
            if existing is None or precedence >= existing.get('_prec', 0):
                e['_prec'] = precedence
                e['_source'] = label
                merged[key] = e

    return merged


def apply_errata(merged, patches):
    """Apply errata patches to merged entries."""
    applied = 0
    removed = 0
    for name_lower, patch in patches.items():
        # Try exact match first, then fuzzy
        entry = merged.get(name_lower)
        if entry is None:
            # Try stripping "the " prefix
            for key in merged:
                if key.rstrip('s') == name_lower.rstrip('s') or name_lower in key or key in name_lower:
                    entry = merged[key]
                    break
        if entry is None:
            continue

        if patch['removed']:
            entry['removed'] = True
            removed += 1

        if patch['rating']:
            entry['rating'] = patch['rating']

        if patch['prereq']:
            entry['prereq'] = patch['prereq']

        if patch['effect']:
            entry['effect'] = patch['effect']

        if patch['notes']:
            entry['errata_notes'] = patch['notes']

        applied += 1

    print(f'  Errata: {applied} entries patched, {removed} marked removed')
    return merged


# ─────────────────────────────────────────────────────────────────
#  Markdown rendering
# ─────────────────────────────────────────────────────────────────

def rating_to_dots(rating_str):
    """Convert '3' or '1-3' to '●●●' or '● to ●●●'."""
    if not rating_str:
        return ''
    parts = rating_str.split('-')
    if len(parts) == 1:
        try:
            return '●' * int(parts[0])
        except ValueError:
            return rating_str
    else:
        try:
            lo = '●' * int(parts[0])
            hi = '●' * int(parts[1])
            return f'{lo} to {hi}'
        except ValueError:
            return rating_str


def render_entry(entry):
    """Render a single merit entry as markdown. No line wrapping."""
    lines = []

    name = entry['name']
    rating = rating_to_dots(entry.get('rating', ''))
    style_tag = ' *(Style)*' if entry.get('style') else ''
    removed = entry.get('removed', False)

    heading = f"## {name} ({rating}){style_tag}"
    lines.append(heading)
    lines.append('')

    if removed:
        lines.append('> **REMOVED FROM PLAY**')
        lines.append('')

    if entry.get('prereq'):
        prereq = apply_spelling(entry['prereq'])
        lines.append(f'**Prerequisites:** {prereq}')
        lines.append('')

    if entry.get('effect'):
        effect = apply_spelling(entry['effect'])
        lines.append(f'**Effect:** {effect}')
        lines.append('')

    if entry.get('body'):
        body = apply_spelling(entry['body'])
        lines.append(body)
        lines.append('')

    for note in (entry.get('errata_notes') or []):
        note = apply_spelling(note)
        lines.append(f'> *Errata: {note}*')
    if entry.get('errata_notes'):
        lines.append('')

    lines.append('---')
    lines.append('')
    return '\n'.join(lines)


def render_ssot(entries_by_category, title, category_order):
    """Render the full SSOT document."""
    sections = [
        f'# {title}',
        '',
        f'*Single source of truth. Errata applied. British/Australian spelling.*',
        '',
        '---',
        '',
    ]

    SUBSECTIONS = {'Carthian Law'}  # rendered as subsections under their parent

    for cat in category_order:
        entries = entries_by_category.get(cat, [])
        if not entries:
            continue
        if cat in SUBSECTIONS:
            sections.append(f'## {cat}')
        else:
            sections.append(f'# {cat}')
        sections.append('')
        for e in sorted(entries, key=lambda x: x['name'].lower()):
            if e.get('removed'):
                continue
            sections.append(render_entry(e))

    return '\n'.join(sections)


# ─────────────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────────────

def main():
    print('Building merits SSOT...')

    # ── General merits ──────────────────────────────────────────
    print('\nLoading general merit sources:')
    general_merged = merge_sources(GENERAL_SOURCES)

    print('\nLoading errata:')
    patches = parse_errata()
    general_merged = apply_errata(general_merged, patches)

    # Categorise
    general_by_cat = {}
    fighting_from_general = {}
    for key, entry in general_merged.items():
        cat = categorise(entry)
        if cat in EXCLUDED_CATEGORIES:
            continue
        if cat in FIGHTING_CATEGORIES:
            fighting_from_general.setdefault(cat, []).append(entry)
        else:
            general_by_cat.setdefault(cat, []).append(entry)

    # ── Fighting merits ─────────────────────────────────────────
    print('\nLoading fighting merit sources:')
    fighting_merged = merge_sources(FIGHTING_SOURCES)
    fighting_merged = apply_errata(fighting_merged, patches)

    fighting_by_cat = {'Fighting Merits': list(fighting_merged.values())}
    # Include any fighting merits pulled from general sources
    for cat, entries in fighting_from_general.items():
        fighting_by_cat.setdefault(cat, []).extend(entries)

    # ── Write outputs ────────────────────────────────────────────
    general_out = DOCS / 'merits-ssot.md'
    fighting_out = DOCS / 'fighting-merits-ssot.md'

    print(f'\nWriting {general_out.name}...')
    md = render_ssot(general_by_cat, 'Terra Mortis — Merits Reference', CATEGORY_ORDER)
    general_out.write_text(md, encoding='utf-8')

    general_count = sum(len([e for e in v if not e.get('removed')]) for v in general_by_cat.values())
    print(f'  {general_count} entries across {len(general_by_cat)} categories')

    print(f'Writing {fighting_out.name}...')
    md = render_ssot(fighting_by_cat, 'Terra Mortis — Fighting Merits Reference', ['Fighting Merits'])
    fighting_out.write_text(md, encoding='utf-8')

    fighting_count = sum(len([e for e in v if not e.get('removed')]) for v in fighting_by_cat.values())
    print(f'  {fighting_count} entries')

    print('\nDone.')


if __name__ == '__main__':
    main()
