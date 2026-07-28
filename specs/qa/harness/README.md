# USF harness — browser smoke, computed-style parity, overlap gate

Tooling for Epic USF (#1047 / ADR-007). Phase 0 used the boot smoke; Phase 1 adds
computed-style DOM parity (D15) and the monotonic-overlap gate.

## Files

- `usf-smoke.mjs` — headless Chromium (Playwright) smoke + DOM + computed-style capture.
- `css-overlap.py` — the overlap measurement instrument (Imhotep). `--count` / `--list`.
- `usf-overlap-gate.py` — machine gate over `--count` (`--expect N` / `--max N`), D15 UPGRADE 2.
- `css985-violations-suite.txt` — up-front #985 bare-hex/rgba baseline for suite.css (Q4).

## Setup

```sh
# static server (from repo root)
npx http-server public -p 8080 -s

# FULL render (needed for Phase 1 tab-family parity): local API, accepts local-test-token
cd server && npm run dev        # :3000; server/middleware/auth.js:21 bypasses auth when NODE_ENV!=production
```

Boot smoke works without the API; computed capture of some tab families works too
(they mount via `goTab`), but run the API for complete coverage of feeding/proj/dt/story.

## Boot smoke

```sh
node specs/qa/harness/usf-smoke.mjs player      # or: st
```
`pass:true` iff no `pageErrors` and no *meaningful* console errors (benign no-backend
noise filtered). Exit code mirrors `pass`.

## Computed-style parity (Phase 1, ADR-007 D15)

A CSS-promotion's failure mode is a dropped class OR a cascade-order change that
leaves the DOM identical but the computed value different — so capture computed
style, not just DOM structure.

```sh
# 1. class list for the shard's tier (from the instrument)
python3 specs/qa/harness/css-overlap.py --list > /tmp/overlap.txt
#    (extract the tier's classes into /tmp/tier.txt — one class per line)

# 2. capture on BASE branch, then on the SHARD branch
git checkout <base>;  node specs/qa/harness/usf-smoke.mjs st --classes-file /tmp/tier.txt --capture /tmp/before.json
git checkout <shard>; node specs/qa/harness/usf-smoke.mjs st --classes-file /tmp/tier.txt --capture /tmp/after.json

# 3. diff — expect EMPTY for a non-behavioural shard (Tier 0)
diff /tmp/before.json /tmp/after.json
```

`--surfaces feeding,downtime,story` (default) drives `goTab` to mount the tab
families. `--classes "a,b"` inlines a list. The capture records, per class, the
first surface it renders on and the curated computed properties of every matching
element.

## Monotonic-overlap gate (D15 UPGRADE 2)

```sh
python3 specs/qa/harness/usf-overlap-gate.py --max 163      # standing: overlap must never increase
python3 specs/qa/harness/usf-overlap-gate.py --expect 53    # after Tier 0 (163 - 110 identical)
```
Run `--expect <post-count>` after each shard (assert it dropped by exactly the
shard's size); `--max` is the standing anti-refragmentation guard. **Phase 1 floor
is 6, not 0** — the six D13 renderer-collision selectors carve out to Phase 2.

## #985 absorption (Q4)

`css985-violations-suite.txt` is the up-front bare-hex/rgba baseline. Each shard
clears violations in the rules it KEEPS and ignores rules it DELETES. Do not run a
final sweep — it reopens files Phase 1 already closed and invalidates their captures.

## Caveats

- Computed capture without the API misses tab families that only mount on real data.
- `getComputedStyle` reflects the viewport; keep the same Playwright viewport across
  before/after (default is Playwright's headless default — do not override per-run).
- Class-reachability in `css-overlap.py` is a static grep over `class="..."` literals;
  a negative means "no static evidence", not proof (ADR-007 D12 hedge). Re-run the
  classifier each shard — admin is under change from other epics.
- Dev-only: relies on `public/dev-login.html`'s token; never ships to production.
