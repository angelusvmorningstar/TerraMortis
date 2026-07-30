#!/usr/bin/env python3
"""
write-path-inventory.py — generator AND standing gate for the ADR-007 D7 write-path inventory.

THIS IS A STANDING GATE, not a one-shot map. (Contrast specs/qa/harness/admin-collision-map.py,
which answers a question once.) D7's escalation contract — "any PR that adds, removes or
reshapes a write site is a red-flag review" — is only enforceable if the inventory is complete
and current. The hand-maintained version was neither: at ADR-007 Rev 3 it captured 5 of 47
frontend write sites, and 3 of its 7 rows cited files that had not existed since 2026-04-21
(`public/js/player/` was renamed to `public/js/tabs/` in ecc6f71e, three months before the
inventory was frozen). It had been written from documentation rather than from the tree.

USAGE

    python3 specs/qa/harness/write-path-inventory.py            # regenerate the .md
    python3 specs/qa/harness/write-path-inventory.py --check    # exit 1 if the tree disagrees
    python3 specs/qa/harness/write-path-inventory.py --print    # to stdout, write nothing

Run --check in review on any PR touching public/js. A non-zero exit means the set of write
sites changed, which is exactly the D7 escalation trigger.

WHAT COUNTS AS A WRITE SITE

Any call in public/js/**/*.js that could mutate one of the two sacrosanct collections
(ADR-007 D7: characters must never be lost, downtime submissions must always be captured):

  - apiPost / apiPut / apiPatch / apiDelete  (public/js/data/api.js:33-37) whose argument
    window mentions /api/characters or /api/downtime_submissions
  - apiRaw or a bare fetch() mentioning one of those paths together with a mutating method

Brace-matched argument windows are used rather than line matching, because several real sites
span multiple lines — `apiPatch(\n  `/api/characters/${id}/carthian_pull`,\n {...})` is invisible
to a line grep, and that is how the Carthian Pull write (#508/#522) stayed out of the inventory.

THE GATE KEY IS DELIBERATELY NOT THE LINE NUMBER

--check compares SIGNATURES of (collection, method, endpoint, file). Line numbers appear in the
generated markdown for human use but are excluded from the comparison, so ordinary edits that
shift a call down a file do not trip the gate. Only adding, removing, moving between files, or
changing the endpoint/method does — which is the set D7 actually cares about.

METHOD LIMITS — read before trusting a negative.

  1. STATIC AND LITERAL. An endpoint assembled from a variable (`apiPut(url, body)` where `url`
     was built elsewhere) is MISSED. The output is a floor, not a ceiling. A site absent from
     this list means "no static evidence", never "no write".
  2. IT DOES NOT PROVE A SITE EXECUTES. The `reachable` column is advisory only: it reports
     whether the containing module has any importer, which is a module-level answer to a
     call-level question. An unreachable module can still hold a live site if something imports
     it later; a reachable module can hold a dead branch. Per ADR-008 D8 rule 4, that column is
     at coarser granularity than a delete decision, so do NOT delete on it — use it to decide
     what to investigate. `public/js/tabs/wizard.js` is the current worked example: no importer,
     yet it holds POST /api/characters/wizard against a live server route.
  3. FRONTEND ONLY. The server routes are the enforcement surface and are not enumerated here;
     see server/routes/characters.js and server/routes/downtime_submissions.js.
"""

import re
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'specs/architecture/usf-write-path-inventory.md'
SRC_GLOB = 'public/js/**/*.js'

COLLECTIONS = {
    'characters': re.compile(r'/api/characters'),
    'downtime_submissions': re.compile(r'/api/downtime_submissions'),
}
HELPERS = re.compile(r'\b(apiPost|apiPut|apiPatch|apiDelete)\s*\(')
RAW = re.compile(r'\b(apiRaw|fetch)\s*\(')
METHOD_IN_RAW = re.compile(r'[\'"](POST|PUT|PATCH|DELETE)[\'"]')


def arg_window(src, open_paren_idx):
    """Brace-matched text from a call's open paren to its matching close."""
    depth, j, n = 0, open_paren_idx, len(src)
    while j < n:
        if src[j] == '(':
            depth += 1
        elif src[j] == ')':
            depth -= 1
            if depth == 0:
                return src[open_paren_idx:j + 1]
        j += 1
    return src[open_paren_idx:]


def normalise_endpoint(window):
    m = re.search(r'[\'"`]([^\'"`]*api/[^\'"`]*)', window)
    if not m:
        return '?'
    url = m.group(1)
    url = re.sub(r'\$\{[^}]*\}', ':id', url)      # template placeholders
    # A literal ending in '/' is a concatenation site: `'/api/characters/' + id`.
    # Without this, an update is indistinguishable from a create against the
    # collection root, and the gate signature would not tell them apart.
    if url.endswith('/'):
        url = url + ':id'
    return url or '/'


def collect():
    rows = []
    for f in sorted(ROOT.glob(SRC_GLOB)):
        rel = f.relative_to(ROOT).as_posix()
        src = f.read_text(encoding='utf-8', errors='ignore')
        for rx, kind in ((HELPERS, 'helper'), (RAW, 'raw')):
            for m in rx.finditer(src):
                win = arg_window(src, m.end() - 1)
                for coll, crx in COLLECTIONS.items():
                    if not crx.search(win):
                        continue
                    if kind == 'helper':
                        method = m.group(1).replace('api', '').upper()
                    else:
                        mm = METHOD_IN_RAW.search(win)
                        if not mm:
                            continue
                        method = mm.group(1)
                    line = src[:m.start()].count('\n') + 1
                    rows.append({
                        'collection': coll, 'method': method,
                        'endpoint': normalise_endpoint(win),
                        'file': rel, 'line': line,
                    })
    # de-dupe identical (file, line, endpoint) picked up by both patterns
    seen, out = set(), []
    for r in rows:
        k = (r['file'], r['line'], r['endpoint'], r['method'])
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def importer_count(rel):
    """Advisory only — METHOD LIMIT 2."""
    base = Path(rel).name
    try:
        res = subprocess.run(['grep', '-rl', '--', base, str(ROOT / 'public/js')],
                             capture_output=True, text=True)
        hits = [h for h in res.stdout.split() if not h.endswith(rel)]
        return len(hits)
    except Exception:
        return -1


def signature(rows):
    return sorted({(r['collection'], r['method'], r['endpoint'], r['file']) for r in rows})


def sig_from_markdown(text):
    sigs = set()
    for line in text.split('\n'):
        m = re.match(r'\|\s*`?(POST|PUT|PATCH|DELETE)`?\s*\|\s*`([^`]+)`\s*\|\s*`([^`:]+):\d+`',
                     line.strip())
        if m:
            coll = 'characters' if '/api/characters' in m.group(2) else 'downtime_submissions'
            sigs.add((coll, m.group(1), m.group(2), m.group(3)))
    return sorted(sigs)


def render(rows):
    reach = {}
    for r in rows:
        if r['file'] not in reach:
            reach[r['file']] = importer_count(r['file'])
    L = []
    L.append('# USF Write-Path Inventory (generated)')
    L.append('')
    L.append('Source: ADR-007 D7 (`specs/architecture/adr-007-unified-suite-topology.md`), Rev 4.')
    L.append('')
    L.append('**GENERATED FILE — do not hand-edit.** Regenerate with')
    L.append('`python3 specs/qa/harness/write-path-inventory.py`, and verify in review with')
    L.append('`--check` (non-zero exit means the write-site set changed, which is the D7')
    L.append('escalation trigger). The generator carries the method limits; read its docstring')
    L.append('before trusting an absence.')
    L.append('')
    L.append('**Contract (D7, unchanged):** any PR that adds, removes or reshapes an entry here')
    L.append('is a red-flag review, escalated to the Architect, regardless of diff size.')
    L.append('')
    for coll, title in (('characters', 'Characters'),
                        ('downtime_submissions', 'Downtime submissions')):
        sub = [r for r in rows if r['collection'] == coll]
        L.append(f'## {title}')
        L.append('')
        L.append(f'{len(sub)} frontend write sites.')
        L.append('')
        L.append('| Method | Endpoint | Site | Module has importers |')
        L.append('|---|---|---|---|')
        for r in sorted(sub, key=lambda r: (r['file'], r['line'])):
            n = reach.get(r['file'], -1)
            flag = '**none — investigate**' if n == 0 else str(n)
            L.append(f"| `{r['method']}` | `{r['endpoint']}` | `{r['file']}:{r['line']}` | {flag} |")
        L.append('')
    L.append('## Write shapes')
    L.append('')
    L.append('Three distinct shapes exist. D7 Rev 3 and earlier described only the first.')
    L.append('')
    L.append('1. **Whole-document save.** `buildSaveBody(c)` into `PUT /api/characters/:id`,')
    L.append('   plus create and delete. ST-driven, from `admin.js`.')
    L.append('2. **PATCH sub-resource.** Narrow slices written without `buildSaveBody`:')
    L.append('   `carthian_pull`, `safe_place_locations`, `player_prefs`, `st_mods_suppressed`.')
    L.append('3. **Shared helper.** `public/js/downtime/db.js` (`updateSubmission` and friends)')
    L.append('   is the common downtime write path; admin views route through it.')
    L.append('')
    L.append('**Players write to their own character.** Three of the PATCH sub-resource routes')
    L.append('carry no `requireRole` and instead do an in-handler ownership check (see')
    L.append('`server/routes/characters.js:611-614` for `carthian_pull`). The earlier inventory')
    L.append('implied that STs write characters and players write submissions; that is false.')
    L.append('')
    return '\n'.join(L)


def main():
    rows = collect()
    text = render(rows)
    if '--print' in sys.argv:
        print(text)
        return 0
    if '--check' in sys.argv:
        if not OUT.exists():
            print('FAIL: inventory missing at', OUT)
            return 1
        want, have = signature(rows), sig_from_markdown(OUT.read_text(encoding='utf-8'))
        if want == have:
            print(f'write-path inventory OK — {len(rows)} sites, signature matches')
            return 0
        print('FAIL: write-path inventory is out of date (D7 escalation).')
        for s in sorted(set(want) - set(have)):
            print('  + in tree, not in inventory:', s)
        for s in sorted(set(have) - set(want)):
            print('  - in inventory, not in tree:', s)
        return 1
    OUT.write_text(text, encoding='utf-8')
    print(f'wrote {OUT} — {len(rows)} sites')
    return 0


if __name__ == '__main__':
    sys.exit(main())
