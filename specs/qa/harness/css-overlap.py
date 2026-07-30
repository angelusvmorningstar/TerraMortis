#!/usr/bin/env python3
"""
css-overlap.py — suite.css / components.css overlap classifier.

The measurement instrument ADR-007 D15 mandates for USF Phase 1. Three jobs:

  1. Split the overlap into IDENTICAL (mechanical delete) vs DIVERGENT (a decision),
     by comparing normalised declaration blocks rather than selector presence.
  2. Classify each divergence by kind (A token drift / B superset / C value conflict /
     D structural) so shards can be tiered by risk instead of by family size (D10).
  3. Test admin reachability of each overlapping selector, which is what sets the
     blast radius of a lib edit (D12).

Run it after every Phase 1 shard. The overlap count must decrease by exactly the
shard's size and must never increase (D15 monotonic-overlap gate).

Usage:
    python3 specs/qa/harness/css-overlap.py            # summary
    python3 specs/qa/harness/css-overlap.py --list     # + every selector per bucket
    python3 specs/qa/harness/css-overlap.py --count    # single integer, for CI gating

Method limits, stated so results are not over-trusted:
  - Admin reachability is a static grep over class="..." literals in admin sources.
    Class names built by string concatenation are missed. A negative means "no static
    evidence of admin use", NOT proof of absence. D12's family-prefix hedge covers this.
  - IDENTICAL does not by itself prove a no-op delete. An equal-specificity rule sitting
    between the two copies in cascade order can change the computed value on a
    co-occurring class. That is exactly why D15 requires computed-style parity capture
    and not merely DOM-structure capture.
"""

import re
import sys
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SUITE = ROOT / 'public/css/suite.css'
COMPONENTS = ROOT / 'public/css/components.css'
ADMIN_SOURCES = [ROOT / 'public/js/admin.js', ROOT / 'public/js/admin']

TOKEN = re.compile(r'var\(--[\w-]+\)')


def parse(path):
    """Yield (media_context, selector_text, declaration_text) for every rule."""
    src = re.sub(r'/\*.*?\*/', '', path.read_text(encoding='utf-8'), flags=re.S)
    rules, stack, buf, i, n = [], [], '', 0, len(src)
    while i < n:
        ch = src[i]
        if ch == '{':
            head, buf = buf.strip(), ''
            if head.startswith('@'):          # @media / @supports — push context
                stack.append(head)
                i += 1
                continue
            depth, j = 1, i + 1
            while j < n and depth:
                if src[j] == '{':
                    depth += 1
                elif src[j] == '}':
                    depth -= 1
                j += 1
            rules.append((' '.join(stack), head, src[i + 1:j - 1]))
            i = j
            continue
        if ch == '}':
            if stack:
                stack.pop()
            buf = ''
            i += 1
            continue
        buf += ch
        i += 1
    return rules


def norm_decl(d):
    parts = [re.sub(r'\s+', ' ', p.strip()) for p in d.split(';')]
    return tuple(sorted(p for p in parts if p))


def index(rules):
    """Map (media, single_selector) -> list of declaration tuples, in source order."""
    m = collections.defaultdict(list)
    for media, sel, decl in rules:
        for one in sel.split(','):
            one = re.sub(r'\s+', ' ', one.strip())
            if one:
                m[(media, one)].append(norm_decl(decl))
    return m


def props(decl_tuple):
    return {p.split(':')[0].strip(): p.split(':', 1)[1].strip()
            for p in decl_tuple if ':' in p}


def kind_of(s_decl, c_decl):
    sp, cp = props(s_decl), props(c_decl)
    shared = set(sp) & set(cp)
    conflicting = {k for k in shared if sp[k] != cp[k]}
    only_s, only_c = set(sp) - set(cp), set(cp) - set(sp)
    token_only = conflicting and all(
        TOKEN.search(sp[k]) and TOKEN.search(cp[k])
        and TOKEN.sub('T', sp[k]) == TOKEN.sub('T', cp[k])
        for k in conflicting)
    if token_only and not only_s and not only_c:
        return 'A: token drift only'
    if not conflicting and (only_s or only_c):
        return 'B: superset/subset'
    if conflicting and not (only_s or only_c):
        return 'C: value conflict, same props'
    return 'D: structural'


def admin_classes():
    seen = set()
    for src in ADMIN_SOURCES:
        files = src.rglob('*.js') if src.is_dir() else [src]
        for f in files:
            for attr in re.findall(r'class="([^"]*)"', f.read_text(encoding='utf-8', errors='ignore')):
                seen.update(re.findall(r'[A-Za-z][\w-]{2,}', attr))
    return seen


def main():
    sui, com = index(parse(SUITE)), index(parse(COMPONENTS))
    overlap = sorted(set(sui) & set(com))

    if '--count' in sys.argv:                    # CI gate: bare integer
        print(len(overlap))
        return 0

    identical, divergent = [], []
    for key in overlap:
        s_last, c_last = sui[key][-1], com[key][-1]
        (identical if s_last == c_last else divergent).append((key, s_last, c_last))

    admin = admin_classes()

    def reachable(sel):
        return bool(set(re.findall(r'\.([A-Za-z][\w-]*)', sel)) & admin)

    print(f'overlapping selector+media keys : {len(overlap)}')
    print(f'  IDENTICAL (mechanical delete) : {len(identical)}')
    print(f'  DIVERGENT (a decision)        : {len(divergent)}')

    kinds = collections.Counter(kind_of(s, c) for _, s, c in divergent)
    print('\ndivergence kinds:')
    for k in sorted(kinds):
        print(f'  {k:32s} {kinds[k]}')

    dv_reach = [k[1] for k, _, _ in divergent if reachable(k[1])]
    id_reach = [k for k, _, _ in identical if reachable(k[1])]
    print('\nadmin reachability (D12 blast radius):')
    print(f'  divergent reachable from admin : {len(dv_reach)} / {len(divergent)}')
    for s in dv_reach:
        print(f'      {s}   <-- admin parity capture required, Architect escalation')
    print(f'  identical reachable from admin : {len(id_reach)} / {len(identical)}')

    if '--list' in sys.argv:
        print('\n--- IDENTICAL (Tier 0) ---')
        for k, _, _ in identical:
            print(f'  {k[1]}' + (f'   [{k[0]}]' if k[0] else ''))
        by_kind = collections.defaultdict(list)
        for k, s, c in divergent:
            by_kind[kind_of(s, c)].append(k[1])
        for kd in sorted(by_kind):
            print(f'\n--- DIVERGENT {kd} ---')
            for s in by_kind[kd]:
                print(f'  {s}')

    return 0


if __name__ == '__main__':
    sys.exit(main())
