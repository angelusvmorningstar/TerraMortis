#!/usr/bin/env python3
"""
admin-collision-map.py — the ADR-008 P2 checklist.

A ONE-SHOT MAP, NOT A STANDING GATE. Unlike css-overlap.py (which ADR-007 D15 wired
into a monotonic regression check), this script answers a question once, at the start
of the admin merge, and its output is a list of rules for a human to walk in a browser.
Do not wire it into CI. Re-run it if admin-layout.css or suite.css move substantially.

WHAT IT ANSWERS

  ADR-007 D9 deferred the admin merge on the claim that admin-layout.css would "compete
  with the lib in the same cascade". That clause was never measured. The count it was
  argued from (~2,472 selectors) is a proxy, not the obstacle.

  The obstacle is: for each rule, COULD ITS SELECTOR MATCH AN ELEMENT THE OTHER APP
  EMITS? That is a reachability question and it returns a list, not a number. Measured
  both directions it is ~118 rules, against a count of 2,686. See ADR-008 D8.

  Note that components.css collisions with admin are NOT a merge cost: admin.html:12
  already loads components.css before admin-layout.css, so those rules apply today.
  Admin is inside the design-system cascade already, overriding it. The script reports
  that figure separately so it is not double-counted as merge exposure.

USAGE

    python3 specs/qa/harness/admin-collision-map.py            # summary
    python3 specs/qa/harness/admin-collision-map.py --list     # + every colliding rule
    python3 specs/qa/harness/admin-collision-map.py --dead     # + unreferenced admin classes

METHOD LIMITS — read these before quoting any number this script prints.

  1. CLASS EXTRACTION IS OVER LITERALS. Emitted classes are scraped from class="...",
     className="..." and classList.add/remove/toggle/contains("...") in the JS sources
     and the entry HTML. Class names ASSEMBLED BY STRING CONCATENATION ARE MISSED.
     Every collision figure here is therefore a FLOOR, NOT A CEILING. A rule absent
     from this list is "no static evidence of collision", never proof of safety.
     (Same limit css-overlap.py admits to, and the same hedge applies: if a family
     prefix appears in the other app, check the whole family by hand.)

  2. IT MEASURES MATCH-POSSIBILITY, NOT CASCADE OUTCOME. Which rule actually wins in a
     merged document depends on stylesheet load order and selector specificity, and this
     script models NEITHER. A collision listed here may resolve harmlessly. A rule not
     listed here will not suddenly start matching.

  3. A RULE IS COUNTED ONLY IF *EVERY* CLASS TOKEN IN ITS SELECTOR IS EMITTED BY THE
     OTHER APP. This is deliberately conservative in the direction of a shorter list:
     `.adm-tab.active` is excluded because `.adm-tab` is admin-only, even though
     `.active` is shared. Selectors carrying an #id are excluded outright as shell-
     scoped. Bare element selectors are reported separately because they always apply.

  4. THE DEAD-CLASS FIGURE (--dead) CARRIES LIMIT 1 AT ITS STRONGEST, because
     "unreferenced by static grep" is exactly the claim string concatenation defeats.
     Treat it as a lead to investigate, never as a deletion list.
"""

import re
import sys
import collections
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent

# reuse css-overlap.py's CSS parser rather than writing a second one that can drift
_spec = importlib.util.spec_from_file_location('cssoverlap', HERE / 'css-overlap.py')
_co = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_co)
parse, norm_decl = _co.parse, _co.norm_decl

ADMIN_JS = [ROOT / 'public/js/admin.js', ROOT / 'public/js/admin']
ADMIN_HTML = ROOT / 'public/admin.html'
APP_JS = [ROOT / 'public/js/app.js', ROOT / 'public/js/tabs',
          ROOT / 'public/js/suite', ROOT / 'public/js/game', ROOT / 'public/js/editor']
APP_HTML = ROOT / 'public/index.html'

CLASS_ATTR = (r'class\s*=\s*["\']([^"\']*)["\']',
              r'className\s*=\s*["\']([^"\']*)["\']')
CLASS_LIST = r'classList\.(?:add|remove|toggle|contains)\(\s*["\']([\w-]+)["\']'


def emitted(js_paths, html_path):
    """Class literals a surface actually emits. See METHOD LIMIT 1."""
    seen = collections.Counter()
    blobs = []
    for p in js_paths:
        if not p.exists():
            continue
        for f in (sorted(p.rglob('*.js')) if p.is_dir() else [p]):
            blobs.append(f.read_text(encoding='utf-8', errors='ignore'))
    if html_path.exists():
        blobs.append(html_path.read_text(encoding='utf-8', errors='ignore'))
    for text in blobs:
        for pat in CLASS_ATTR:
            for attr in re.findall(pat, text):
                for c in re.findall(r'[A-Za-z_][\w-]*', attr):
                    seen[c] += 1
        for c in re.findall(CLASS_LIST, text):
            seen[c] += 1
    return seen


def selectors(css_name):
    """Yield (media, single_selector, normalised_declarations) for one stylesheet."""
    for media, sel, decl in parse(ROOT / f'public/css/{css_name}.css'):
        d = norm_decl(decl)
        for one in sel.split(','):
            one = re.sub(r'\s+', ' ', one.strip())
            if one:
                yield media, one, d


def reachable_from(css_name, other_emits):
    """Rules in css_name whose EVERY class token is emitted by the other surface.

    See METHOD LIMIT 3 for why this is deliberately conservative.
    """
    hits, bare = [], []
    for media, one, d in selectors(css_name):
        if one.startswith('@') or one == '*':
            continue
        if '@keyframes' in media:                      # `from`/`to`/`50%` are stops, not selectors
            continue
        if re.search(r'#', one):                       # id-scoped -> that shell only
            continue
        cls = re.findall(r'\.([A-Za-z_][\w-]*)', one)
        if not cls:
            if not re.search(r'[.\[%]', one) and not one.endswith('%'):
                bare.append((media, one, d))
            continue
        if all(c in other_emits for c in cls):
            hits.append((media, one, d))
    return hits, bare


def main():
    want_list = '--list' in sys.argv
    want_dead = '--dead' in sys.argv

    admin_em = emitted(ADMIN_JS, ADMIN_HTML)
    app_em = emitted(APP_JS, APP_HTML)

    adm_hits, adm_bare = reachable_from('admin-layout', set(app_em))
    suite_hits, _ = reachable_from('suite', set(admin_em))
    comp_hits, _ = reachable_from('components', set(admin_em))

    total = len(adm_hits) + len(suite_hits) + len(adm_bare)

    print('=' * 74)
    print('ADR-008 MERGE COLLISION MAP   (floors, not ceilings -- see METHOD LIMITS)')
    print('=' * 74)
    print(f'  admin-layout.css rules matching PLAYER-emitted classes : {len(adm_hits):5d}')
    print(f'  suite.css        rules matching ADMIN-emitted classes  : {len(suite_hits):5d}')
    print(f'  admin-layout.css unscoped element rules                : {len(adm_bare):5d}')
    print(f'  {"-" * 56}')
    print(f'  NEW exposure created by merging the documents          : {total:5d}')
    print()
    print(f'  components.css rules matching ADMIN-emitted classes    : {len(comp_hits):5d}')
    print('     ^ NOT merge exposure. admin.html:12 already loads components.css,')
    print('       so these apply today. Reported so they are not double-counted.')
    print()

    comp_classes = {c for _, one, _ in selectors('components')
                    for c in re.findall(r'\.([A-Za-z_][\w-]*)', one)}
    a_adopt = len(comp_classes & set(admin_em))
    p_adopt = len(comp_classes & set(app_em))
    print('  design-system adoption (ADR-008 context table)')
    print(f'     components.css defines {len(comp_classes)} classes;'
          f' admin emits {a_adopt} ({100*a_adopt/len(comp_classes):.1f}%),'
          f' player emits {p_adopt} ({100*p_adopt/len(comp_classes):.1f}%)')
    print()

    if want_list:
        for title, hits in (('admin-layout -> PLAYER elements', adm_hits),
                            ('suite -> ADMIN elements', suite_hits),
                            ('admin-layout UNSCOPED (always apply)', adm_bare)):
            print('-' * 74)
            print(f'{title}   [{len(hits)}]')
            print('-' * 74)
            for media, one, d in hits:
                body = '; '.join(d)
                if len(body) > 88:
                    body = body[:85] + '...'
                tag = f'  @{media}' if media else ''
                print(f'  {one:<42} {{{body}}}{tag}')
            print()

    if want_dead:
        adm_classes = {c for _, one, _ in selectors('admin-layout')
                       for c in re.findall(r'\.([A-Za-z_][\w-]*)', one)}
        dead = sorted(adm_classes - set(admin_em) - set(app_em))
        print('-' * 74)
        print(f'admin-layout classes emitted by NEITHER app   [{len(dead)} of {len(adm_classes)}]')
        print('METHOD LIMIT 4 APPLIES AT ITS STRONGEST HERE. Lead, not a deletion list.')
        print('-' * 74)
        for i in range(0, len(dead), 4):
            print('  ' + '  '.join(f'.{c:<22}' for c in dead[i:i + 4]))

    return 0


if __name__ == '__main__':
    sys.exit(main())
