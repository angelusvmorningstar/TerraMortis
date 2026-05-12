# Git hooks

Plain shell git hooks for this repository, opted-in via `core.hooksPath`. No husky, no npm dependency.

## What's here

### `pre-commit`

Parse-checks every staged `public/js/**/*.js` file as an ES module via `node --input-type=module --check`. Fails the commit (exit 1) if any file produces a parse error.

The hook's job is narrow: catch parse-time regressions before they reach `dev` or `main`. The class of incident this prevents is documented in issue #34 / PR #32 (post-mortem):

- PR #28 introduced `renderPersonalStorySection` in `public/js/tabs/downtime-form.js` with smart quotes (U+2018 / U+2019) used as string delimiters — likely an editor auto-conversion. JavaScript can't parse those as quotes; the entire module threw `Invalid or unexpected token` on import. Production was unusable for the player downtime form until PR #32 hotfixed it.

The parse-check makes that class of regression structurally impossible to commit without a deliberate `--no-verify` bypass.

### Scope

- **In:** `public/js/**/*.js` only.
- **Out:** `server/` (already covered by `vitest` in CI), `data/`, `specs/`, anything else.

Smart quotes inside string content (HTML body text in templates, prose copy in `dev-fixtures.js`, rules text in `game/rules.js`) parse cleanly and pass; the hook only fails when smart quotes break the JS grammar.

## Enable

After cloning the repository, run once:

```bash
git config core.hooksPath .githooks
```

This points your local git at `.githooks/` instead of the default `.git/hooks/`. The setting is per-clone; not auto-applied. Re-run if you re-clone.

## Bypass

```bash
git commit --no-verify
```

Reserve for genuine WIP commits on a personal branch. The hook is fast (<2s on a typical staged set) so the friction-cost of running it is low; the cost of letting a parse-error hit `dev` is much higher.

## CI mirror

`.github/workflows/check-js-parse.yml` runs the same parse-check against every `public/js/**/*.js` file in the repo on `push` and `pull_request`. Belt-and-braces: even if a developer hasn't enabled the local hook, CI still catches the regression before it merges.
