#!/usr/bin/env python3
"""Monotonic-overlap gate for USF Phase 1 (ADR-007 D15 UPGRADE 2).

Wraps css-overlap.py --count. Two modes:

  --expect N    exit 0 iff current overlap == N   (per-shard: assert it dropped to
                exactly the expected post-shard count)
  --max N       exit 0 iff current overlap <= N   (standing never-increase guard;
                baseline today is 163, Phase 1 target floor is 6 per D13 carve-out)

Usage:
  python3 specs/qa/harness/usf-overlap-gate.py --expect 53   # after Tier 0 (163 - 110)
  python3 specs/qa/harness/usf-overlap-gate.py --max 163      # anti-refragmentation guard
"""
import subprocess, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))

def current():
    out = subprocess.run([sys.executable, os.path.join(HERE, 'css-overlap.py'), '--count'],
                         capture_output=True, text=True)
    if out.returncode != 0:
        print('css-overlap.py failed:\n' + out.stderr, file=sys.stderr); sys.exit(2)
    return int(out.stdout.strip().splitlines()[-1])

def main():
    a = sys.argv
    n = current()
    if '--expect' in a:
        want = int(a[a.index('--expect') + 1])
        ok = n == want
        print(f'overlap={n} expected={want} -> {"PASS" if ok else "FAIL"}')
        sys.exit(0 if ok else 1)
    if '--max' in a:
        cap = int(a[a.index('--max') + 1])
        ok = n <= cap
        print(f'overlap={n} max={cap} -> {"PASS" if ok else "FAIL (overlap increased)"}')
        sys.exit(0 if ok else 1)
    print(f'overlap={n}')
    sys.exit(0)

if __name__ == '__main__':
    main()
