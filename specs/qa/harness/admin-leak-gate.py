#!/usr/bin/env python3
"""
admin-leak-gate.py — makes ADR-008 D4/AC8 measurable.

THE PROBLEM THIS EXISTS FOR

D4 originally made "a player session fetches zero modules from public/js/admin/" the
acceptance criterion for every phase that moves a surface across. That criterion is
UNMEASURABLE, because it is already false: `public/js/app.js` statically imports its way
into admin code today, through a chain nobody put there on purpose. The admin dependency
enters at ONE join point --

    tabs/story-tab.js:9  ->  admin/downtime-story.js  ->  admin/downtime-constants.js

-- and `tabs/story-tab.js` is itself held reachable by THREE independent index-side
importers: `tabs/archive-tab.js:16` and `tabs/downtime-tab.js:6` (both for
`renderOutcomeWithCards`), and `game/dt-lookup.js:4` (for `renderLatestReport`). Cost is
~214 KB of ST-only code on every player session (`downtime-story.js` imports `isSTRole`).

READ THE `via` LINE AS ONE REPRESENTATIVE PATH, NOT THE ONLY ONE. The report prints a
single path per leaked module because printing all of them is noise. The failure mode that
creates: someone fixing #1075 cuts ONE of the three importers, re-runs the gate, sees the
module count unchanged, and concludes the fix failed -- when in fact cutting any single
caller of `story-tab.js` achieves nothing, because the other two still reach it. Only
cutting the JOIN POINT (`story-tab.js:9`) closes the leak, and it closes it for all three.
Use `--paths` to see every route to a module before concluding anything about a partial fix.

DISTINGUISH TWO CLAIMS THAT SOUND THE SAME. "One cut closes it" is about the FIX: severing
`story-tab.js:9` removes the admin dependency for every importer at once. "One path reaches
it" is about the TOPOLOGY and is FALSE here: three paths reach `story-tab.js`. Both
sentences are about a single edge and only the first is true, which is exactly how a
correct fix-plan and a wrong mental model of the graph can be stated in the same breath.
`--paths` is the check that separates them. A reviewer checking "zero" sees two modules and cannot tell an expected legacy
leak from a new regression, so sixteen future passes against it would assert nothing. A gate
that cannot fail meaningfully is worse than no gate: it manufactures confidence. That is the
same defect this project found in usf-smoke.mjs, one level up.

SO THE CRITERION IS ATTRIBUTABLE + RATCHET, NOT ZERO

  * ATTRIBUTABLE — no admin module may become statically reachable from the player entry
    because of a merged surface. A moved surface reaches its module through dynamic
    `import()` only, which this gate does not follow (by design: dynamic imports are the
    sanctioned path).
  * RATCHET — the set of leaked modules may SHRINK but never GROW. Baselining a NAMED SET
    rather than a COUNT matters: a count of 2 would let a different leak silently substitute
    for a fixed one.

The ratchet gets stricter for free as the baseline shrinks, and it converts the legacy leak
from a blocker into tracked debt with a number attached (issue #1075).

USAGE

    python3 specs/qa/harness/admin-leak-gate.py            # report, one path per module
    python3 specs/qa/harness/admin-leak-gate.py --paths    # ALL static paths to each module
    python3 specs/qa/harness/admin-leak-gate.py --check    # exit 1 if the set grew
    python3 specs/qa/harness/admin-leak-gate.py --bless    # rewrite baseline (SHRINK ONLY)

`--bless` refuses to record a larger set. Shrinking the baseline is the only sanctioned
direction, and it is what closing #1075 will do.

METHOD LIMITS

  1. STATIC IMPORTS ONLY, which is the point. `import()` expressions are deliberately NOT
     followed -- they are the sanctioned mechanism, and a gate that flagged them would fire
     on every correct surface migration.
  2. LITERAL SPECIFIERS ONLY. A specifier built at runtime is invisible here. Floor, not
     ceiling.
  3. IT MEASURES REACHABILITY, NOT BYTES FETCHED. A browser fetches a statically imported
     module whether or not any code path uses it, so reachability is the right proxy for the
     network cost -- but the KB figures printed are file sizes on disk, uncompressed.
"""

import re
import sys
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ENTRY = ROOT / 'public/js/app.js'
ADMIN_DIR = ROOT / 'public/js/admin'
BASELINE = Path(__file__).resolve().parent / 'admin-leak-baseline.json'

# `import ... from 'x'` and bare `import 'x'` — NOT `import('x')`, see METHOD LIMIT 1.
STATIC_IMPORT = re.compile(
    r"""(?:^|\n)\s*import\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]""", re.M)


def resolve(spec, importer):
    if not spec.startswith('.'):
        return None
    p = (importer.parent / spec).resolve()
    return p if p.exists() else None


def closure(entry):
    """Modules statically reachable from entry, with the path that reaches each."""
    seen, order, paths = set(), [], {}
    stack = [(entry, [entry])]
    while stack:
        cur, path = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        order.append(cur)
        paths[cur] = path
        try:
            src = cur.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        for spec in STATIC_IMPORT.findall(src):
            nxt = resolve(spec, cur)
            if nxt and nxt not in seen:
                stack.append((nxt, path + [nxt]))
    return order, paths


def all_paths(target, entry):
    """Every simple static path from entry to target. Used by --paths."""
    found, stack = [], [(entry, [entry])]
    while stack:
        cur, path = stack.pop()
        try:
            src = cur.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        for spec in STATIC_IMPORT.findall(src):
            nxt = resolve(spec, cur)
            if not nxt or nxt in path:
                continue
            if nxt == target:
                found.append(path + [nxt])
            else:
                stack.append((nxt, path + [nxt]))
    return found


def leaked():
    order, paths = closure(ENTRY)
    out = []
    for m in order:
        try:
            m.relative_to(ADMIN_DIR)
        except ValueError:
            continue
        out.append((m.relative_to(ROOT).as_posix(),
                    [p.relative_to(ROOT).as_posix() for p in paths[m]],
                    m.stat().st_size))
    return sorted(out)


def load_baseline():
    if not BASELINE.exists():
        return None
    return set(json.loads(BASELINE.read_text())['modules'])


def main():
    rows = leaked()
    names = {r[0] for r in rows}
    total = sum(r[2] for r in rows)

    if '--bless' in sys.argv:
        old = load_baseline()
        if old is not None and not names <= old:
            print('REFUSED: --bless may only SHRINK the baseline (ratchet).')
            for n in sorted(names - old):
                print('  would add:', n)
            return 1
        BASELINE.write_text(json.dumps(
            {'_comment': 'ADR-008 D4 ratchet. May shrink, never grow. See admin-leak-gate.py.',
             'issue': 'https://github.com/angelusvmorningstar/TerraMortis/issues/1075',
             'modules': sorted(names)}, indent=2) + '\n', encoding='utf-8')
        print(f'baseline written — {len(names)} modules, {total/1024:.0f} KB')
        return 0

    print('=' * 74)
    print('ADMIN LEAK GATE (ADR-008 D4) — static reach from public/js/app.js')
    print('=' * 74)
    print(f'  admin modules statically reachable : {len(rows)}')
    print(f'  uncompressed weight                : {total/1024:.0f} KB')
    print()
    show_all = '--paths' in sys.argv
    for name, path, size in rows:
        print(f'  {name}  ({size/1024:.0f} KB)')
        if show_all:
            routes = all_paths(ROOT / name, ENTRY)
            print(f'     {len(routes)} static path(s):')
            for r in routes:
                print('       ' + ' -> '.join(p.name for p in r))
        else:
            print('     via ' + ' -> '.join(p.split('/')[-1] for p in path)
                  + '   (one representative path — use --paths for all)')
    print()

    base = load_baseline()
    if base is None:
        print('no baseline recorded; run --bless to create one')
        return 0 if '--check' not in sys.argv else 1
    added, removed = names - base, base - names
    for n in sorted(removed):
        print(f'  IMPROVED: {n} no longer statically reachable — run --bless')
    if added:
        print('FAIL: new admin modules statically reachable from the player entry.')
        for n in sorted(added):
            print('  +', n)
        print('This is the ADR-008 D4 attributability failure. A merged surface must reach')
        print('its modules through dynamic import() only.')
        return 1
    print(f'OK — no increase over baseline ({len(base)} modules).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
