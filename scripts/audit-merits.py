#!/usr/bin/env python3
"""
audit-merits.py
Cross-reference merits-ssot.md and fighting-merits-ssot.md against MERITS_DB
in merits-db-data.js and produce a structured diff report.

Output: docs/merits-audit.md

Sections:
  1. Removed by errata but still in DB  — pull these from MERITS_DB
  2. In SSOT, not in DB                 — need to add to MERITS_DB
  3. In DB, not in SSOT                 — Ordo Dracul / homebrew / missing source doc
  4. Rating mismatches                  — errata changed cost; DB not updated
  5. Prerequisite mismatches            — DB missing prereq or has wrong one
  6. OK / matched                       — for reference

Usage:
    python scripts/audit-merits.py
"""

import re
import json
from pathlib import Path

DOCS   = Path(__file__).parent.parent / 'docs'
JS     = Path(__file__).parent.parent / 'public/js/data/merits-db-data.js'

SSOT_PATHS = [
    DOCS / 'merits-ssot.md',
    DOCS / 'fighting-merits-ssot.md',
]

ERRATA_PATH = DOCS / 'Merits Errata.md'


# ─────────────────────────────────────────────────────────────────
#  Name normalisation
# ─────────────────────────────────────────────────────────────────

def norm_key(name):
    """Normalise a merit name to match DB keys: lowercase, strip punctuation."""
    s = name.lower().strip()
    # Strip leading "the " for matching (DB sometimes omits it)
    s = re.sub(r"^the\s+", "", s)
    # Collapse non-alphanumeric runs to single space
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def build_norm_index(d):
    """Return {norm_key: original_key} for a dict keyed by merit names."""
    return {norm_key(k): k for k in d}


# ─────────────────────────────────────────────────────────────────
#  Parse MERITS_DB from JS
# ─────────────────────────────────────────────────────────────────

def load_db():
    text = JS.read_text(encoding='utf-8')
    m = re.search(r'export const MERITS_DB\s*=\s*(\{.+\});', text, re.DOTALL)
    if not m:
        raise RuntimeError('Could not find MERITS_DB in merits-db-data.js')
    return json.loads(m.group(1))


# ─────────────────────────────────────────────────────────────────
#  Parse merits-ssot.md
# ─────────────────────────────────────────────────────────────────

def parse_ssot(path):
    """
    Return list of dicts: {name, rating, prereq, removed}
    Removed entries are those flagged > REMOVED FROM PLAY in the SSOT
    (should not appear there after the build script fix, but kept for safety).
    """
    entries = []
    current = None

    for line in path.read_text(encoding='utf-8').splitlines():
        s = line.strip()

        if s.startswith('## '):
            if current:
                entries.append(current)
            title = s[3:].strip().replace('*(Style)*', '').strip()
            m = re.match(r'^(.+?)\s*\((●[^)]*)\)\s*$', title)
            if m:
                name   = m.group(1).strip()
                rating = dots_to_rating(m.group(2))
            else:
                name   = title
                rating = ''
            current = {'name': name, 'rating': rating, 'prereq': None, 'removed': False}

        elif current and s.startswith('**Prerequisites:**'):
            val = re.sub(r'^\*\*Prerequisites?:\*\*\s*', '', s).strip()
            current['prereq'] = val

        elif current and 'REMOVED FROM PLAY' in s:
            current['removed'] = True

    if current:
        entries.append(current)

    return entries


def dots_to_rating(dots_str):
    parts = re.findall(r'●+', dots_str)
    counts = [len(p) for p in parts]
    if not counts:
        return ''
    if len(counts) == 1:
        return str(counts[0])
    return f'{counts[0]}-{counts[-1]}'


# ─────────────────────────────────────────────────────────────────
#  Parse removed-from-play names from Merits Errata.md
# ─────────────────────────────────────────────────────────────────

def parse_errata_removed():
    """Return set of norm_keys for merits flagged 'Removed from play' in errata."""
    if not ERRATA_PATH.exists():
        return set()
    removed = set()
    current_name = None
    for line in ERRATA_PATH.read_text(encoding='utf-8').splitlines():
        s = line.strip()
        # Section headers (# or ##) — reset context so stale current_name can't bleed
        if re.match(r'^#{1,2} ', s):
            current_name = None
            continue
        # ### headings = merit entry
        if s.startswith('### '):
            title = s[4:].strip()
            m = re.match(r'^(.+?)\s*\(', title)
            current_name = norm_key(m.group(1)) if m else norm_key(title)
        # Italic merit name lines: *Merit Name (●)*  (used for unlisted merits)
        elif re.match(r'^\*[^*].+\(', s) and s.endswith('*'):
            inner = s.strip('*').strip()
            m = re.match(r'^(.+?)\s*\(', inner)
            if m:
                current_name = norm_key(m.group(1))
        elif current_name and 'removed from play' in s.lower():
            removed.add(current_name)
    return removed


# ─────────────────────────────────────────────────────────────────
#  Rating comparison helpers
# ─────────────────────────────────────────────────────────────────

def normalise_rating(r):
    """Normalise rating string for comparison: '1-3', '3', '1-5'."""
    if not r:
        return ''
    # Handle en-dash, em-dash
    r = r.replace('\u2013', '-').replace('\u2014', '-').replace('\u2212', '-')
    r = r.strip()
    # 'X to Y' -> 'X-Y'
    r = re.sub(r'(\d)\s+to\s+(\d)', r'\1-\2', r)
    return r


def ratings_match(ssot_r, db_r):
    return normalise_rating(ssot_r) == normalise_rating(db_r)


# ─────────────────────────────────────────────────────────────────
#  Prerequisite comparison
# ─────────────────────────────────────────────────────────────────

def norm_prereq(p):
    if not p:
        return ''
    p = p.lower().strip().rstrip('.')
    p = re.sub(r'\s+', ' ', p)
    # Convert dot notation to numbers: "●●●" -> "3"
    p = re.sub(r'●+', lambda m: str(len(m.group(0))), p)
    # Normalise covenant name abbreviations
    p = p.replace('carthian status', 'carthian status')
    p = p.replace('crone status', 'circle status')
    p = p.replace('circle of the crone status', 'circle status')
    p = p.replace('lance status', 'sanctified status')
    p = p.replace('lancea et sanctum status', 'sanctified status')
    p = p.replace('invictus status', 'invictus status')
    p = p.replace('ordo status', 'ordo status')
    p = p.replace('ordo dracul status', 'ordo status')
    # Strip trailing body text (anything after a second sentence or past 120 chars)
    # Body text bleeding from the SSOT parser shows up as long prereq strings
    p = p[:120]
    p = re.sub(r'\s+', ' ', p).strip()
    return p


def prereqs_match(ssot_p, db_p):
    """
    Returns True if prereqs are equivalent.
    DB has no prereq and SSOT does = real mismatch.
    Both have prereqs but differ in format only = treat as match.
    """
    ns = norm_prereq(ssot_p)
    nd = norm_prereq(db_p)
    if ns == nd:
        return True
    # DB empty but SSOT has something = real gap
    if not nd and ns:
        return False
    # Both non-empty: check if they share the same skill/stat names and numbers
    # Extract tokens: word + optional number pairs
    def tokens(s):
        return set(re.findall(r'[a-z][a-z ]*\d', s))
    st = tokens(ns)
    dt = tokens(nd)
    if st and dt:
        # If token sets overlap substantially, treat as match
        overlap = st & dt
        if len(overlap) >= min(len(st), len(dt)):
            return True
    return False


# ─────────────────────────────────────────────────────────────────
#  Main audit logic
# ─────────────────────────────────────────────────────────────────

def run_audit():
    db = load_db()
    db_norm = build_norm_index(db)

    # Load all SSOT entries
    ssot_entries = []
    for p in SSOT_PATHS:
        if p.exists():
            ssot_entries.extend(parse_ssot(p))
        else:
            print(f'Warning: SSOT file not found: {p}')

    ssot_by_norm = {}
    for e in ssot_entries:
        ssot_by_norm[norm_key(e['name'])] = e

    errata_removed = parse_errata_removed()

    # ── Categorise ──────────────────────────────────────────────

    removed_in_db      = []   # removed by errata but key still in DB
    ssot_not_in_db     = []   # in SSOT (not removed), no DB entry
    db_not_in_ssot     = []   # in DB, no SSOT entry
    rating_mismatch    = []   # both exist, rating differs
    prereq_mismatch    = []   # both exist, prereq differs (or DB missing one)
    ok                 = []   # matched, no issues

    # Check every SSOT entry against DB
    for nk, entry in sorted(ssot_by_norm.items()):
        if entry.get('removed'):
            continue   # already excluded from SSOT file

        db_key = db_norm.get(nk)

        if db_key is None:
            # Try partial match (e.g. "oath of the safe word" vs "safe word")
            candidates = [k for k in db_norm if nk in k or k in nk]
            db_key = db_norm[candidates[0]] if len(candidates) == 1 else None

        if db_key is None:
            ssot_not_in_db.append(entry)
            continue

        db_entry = db[db_key]
        issues = []

        # Rating check
        ssot_r = entry['rating']
        db_r   = db_entry.get('rating', '')
        if ssot_r and db_r and not ratings_match(ssot_r, db_r):
            issues.append(('rating', ssot_r, db_r))

        # Prereq check
        ssot_p = entry.get('prereq') or ''
        db_p   = db_entry.get('prereq') or ''
        if ssot_p and not prereqs_match(ssot_p, db_p):
            issues.append(('prereq', ssot_p, db_p or '(none)'))

        if issues:
            for issue_type, ssot_val, db_val in issues:
                if issue_type == 'rating':
                    rating_mismatch.append((entry['name'], ssot_val, db_val))
                else:
                    prereq_mismatch.append((entry['name'], ssot_val, db_val))
        else:
            ok.append(entry['name'])

    # Check DB entries not in SSOT
    for db_nk, db_key in sorted(db_norm.items()):
        if db_nk not in ssot_by_norm:
            # Check if it was removed by errata
            if db_nk in errata_removed:
                removed_in_db.append(db_key)
            else:
                db_not_in_ssot.append(db_key)

    # Also flag DB entries that errata removed but we found them in SSOT matching
    for nk in errata_removed:
        db_key = db_norm.get(nk)
        if db_key and nk in ssot_by_norm:
            removed_in_db.append(db_key)

    return {
        'removed_in_db':   sorted(set(removed_in_db)),
        'ssot_not_in_db':  ssot_not_in_db,
        'db_not_in_ssot':  sorted(set(db_not_in_ssot)),
        'rating_mismatch': rating_mismatch,
        'prereq_mismatch': prereq_mismatch,
        'ok':              sorted(ok),
    }


# ─────────────────────────────────────────────────────────────────
#  Render report
# ─────────────────────────────────────────────────────────────────

def render_report(results):
    lines = [
        '# Merits Audit Report',
        '',
        '*Cross-reference of merits-ssot.md + fighting-merits-ssot.md vs MERITS_DB.*',
        '*Work through sections 1–5 in order. Section 6 is for reference.*',
        '',
        '---',
        '',
    ]

    def h2(title, count):
        lines.append(f'## {title} ({count})')
        lines.append('')

    # ── 1. Removed by errata, still in DB ──────────────────────
    h2('1. Removed by errata — delete from MERITS_DB', len(results['removed_in_db']))
    if results['removed_in_db']:
        lines.append('These merits are flagged "Removed from play" in the errata. Remove them from `merits-db-data.js`.')
        lines.append('')
        for name in results['removed_in_db']:
            lines.append(f'- [ ] `{name}`')
        lines.append('')
    else:
        lines.append('*None.*')
        lines.append('')
    lines.append('---')
    lines.append('')

    # ── 2. In SSOT, not in DB ───────────────────────────────────
    h2('2. In SSOT, not in DB — add to MERITS_DB', len(results['ssot_not_in_db']))
    if results['ssot_not_in_db']:
        lines.append('These merits exist in the source books but have no entry in `MERITS_DB`. Add them.')
        lines.append('')
        lines.append('| Merit | Rating | Prereq (from SSOT) |')
        lines.append('|-------|--------|--------------------|')
        for e in sorted(results['ssot_not_in_db'], key=lambda x: x['name'].lower()):
            r = e['rating'] or '—'
            p = e['prereq'] or '—'
            lines.append(f"| [ ] {e['name']} | {r} | {p} |")
        lines.append('')
    else:
        lines.append('*None.*')
        lines.append('')
    lines.append('---')
    lines.append('')

    # ── 3. In DB, not in SSOT ───────────────────────────────────
    h2('3. In DB, not in SSOT — verify or remove', len(results['db_not_in_ssot']))
    if results['db_not_in_ssot']:
        lines.append('These DB entries have no matching SSOT entry. Likely causes:')
        lines.append('- Ordo Dracul merit (not a playable covenant — remove)')
        lines.append('- Homebrew/custom merit (keep, just not in source books)')
        lines.append('- Name mismatch between DB key and SSOT heading (fix the key)')
        lines.append('')
        for name in results['db_not_in_ssot']:
            lines.append(f'- [ ] `{name}`')
        lines.append('')
    else:
        lines.append('*None.*')
        lines.append('')
    lines.append('---')
    lines.append('')

    # ── 4. Rating mismatches ────────────────────────────────────
    h2('4. Rating mismatches — update MERITS_DB rating', len(results['rating_mismatch']))
    if results['rating_mismatch']:
        lines.append('SSOT rating (errata-corrected) differs from DB rating.')
        lines.append('')
        lines.append('| Merit | SSOT (correct) | DB (stale) |')
        lines.append('|-------|----------------|------------|')
        for name, ssot_r, db_r in sorted(results['rating_mismatch']):
            lines.append(f'| [ ] {name} | {ssot_r} | {db_r} |')
        lines.append('')
    else:
        lines.append('*None.*')
        lines.append('')
    lines.append('---')
    lines.append('')

    # ── 5. Prerequisite mismatches ──────────────────────────────
    h2('5. Prerequisite mismatches — update MERITS_DB prereq', len(results['prereq_mismatch']))
    if results['prereq_mismatch']:
        lines.append('SSOT prerequisite differs from DB. SSOT wins (errata applied).')
        lines.append('')
        lines.append('| Merit | SSOT prereq (correct) | DB prereq (stale) |')
        lines.append('|-------|----------------------|-------------------|')
        for name, ssot_p, db_p in sorted(results['prereq_mismatch']):
            ssot_p_safe = ssot_p.replace('|', '\\|')
            db_p_safe   = db_p.replace('|', '\\|')
            lines.append(f'| [ ] {name} | {ssot_p_safe} | {db_p_safe} |')
        lines.append('')
    else:
        lines.append('*None.*')
        lines.append('')
    lines.append('---')
    lines.append('')

    # ── 6. Matched OK ───────────────────────────────────────────
    h2('6. Matched OK', len(results['ok']))
    lines.append('*These entries exist in both SSOT and DB with consistent rating and prereqs.*')
    lines.append('')
    for name in results['ok']:
        lines.append(f'- {name}')
    lines.append('')

    return '\n'.join(lines)


# ─────────────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────────────

def main():
    print('Running merits audit...')
    results = run_audit()

    print(f'  Removed by errata still in DB : {len(results["removed_in_db"])}')
    print(f'  In SSOT, not in DB            : {len(results["ssot_not_in_db"])}')
    print(f'  In DB, not in SSOT            : {len(results["db_not_in_ssot"])}')
    print(f'  Rating mismatches             : {len(results["rating_mismatch"])}')
    print(f'  Prerequisite mismatches       : {len(results["prereq_mismatch"])}')
    print(f'  Matched OK                    : {len(results["ok"])}')

    out = DOCS / 'merits-audit.md'
    report = render_report(results)
    out.write_text(report, encoding='utf-8')
    print(f'\nReport written: {out}')


if __name__ == '__main__':
    main()
