# USF browser smoke + DOM-parity harness

Headless Chromium (Playwright) smoke for the unified app, using the dev-login
`local-test-token` bypass — **no Discord OAuth, no live data**. Built for Epic USF
(#1047 / ADR-007) where the sacrosanct-foundations parity check is DOM parity
(ADR-007 D7): rendered HTML before/after a shard, diffed.

## Setup

```sh
# 1. static server (from repo root)
npx http-server public -p 8080 -s

# 2. (only for FULL sheet render — Phase 1/2 CSS/renderer parity) local API
cd server && npm run dev        # serves :3000; loads equipment-catalogue + rules
```

Playwright + chromium are already installed (`node_modules/playwright`).

## Run

```sh
# boot smoke, player role
node specs/qa/harness/usf-smoke.mjs player

# boot smoke, ST role
node specs/qa/harness/usf-smoke.mjs st

# capture the sheet DOM for parity diffing
node specs/qa/harness/usf-smoke.mjs player /tmp/sheet-before.html
```

Prints JSON with `pass` (true iff no `pageErrors` and no *meaningful* console
errors — benign "no local backend" noise is filtered), the containers rendered,
and the captured sheet path. Exit code mirrors `pass`.

## DOM-parity workflow (per shard, ADR-007 D7)

```sh
git checkout <base>;  node ...usf-smoke.mjs player /tmp/before.html
git checkout <shard>; node ...usf-smoke.mjs player /tmp/after.html
diff /tmp/before.html /tmp/after.html    # expect empty for a non-behavioural shard
```

A CSS-promotion shard's failure mode is a **dropped class name**, which this DOM
diff catches (cheaper + more deterministic than a screenshot diff).

## Caveats

- Without the local API, the sheet renders only partially and the benign filter
  hides the resulting connection errors. That is fine for **boot smoke** but NOT
  sufficient for **sheet DOM parity** — run the API (step 2) for parity work.
- Fixture data comes from `public/js/dev-fixtures.js` (31 characters). Player role
  loads fixture character `600000000000000000000006`.
- This is a dev-only harness. It relies on `public/dev-login.html`'s token, which
  must never ship to production.
