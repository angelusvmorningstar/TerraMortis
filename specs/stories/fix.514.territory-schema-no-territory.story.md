---
issue: 514
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/514
branch: morningstar-issue-514-territory-schema-no-territory
---

# Story fix.514: DT territory schema must accept the `--` (no territory) option

**Story ID:** fix.514
**Status:** review
**Date:** 2026-06-01
**Issue:** [#514](https://github.com/angelusvmorningstar/TerraMortis/issues/514)
**Branch:** morningstar-issue-514-territory-schema-no-territory
**Severity:** cycle-blocker

---

## User Story

As a player, I want to submit a downtime where a project or merit-action is set to `--` (no territory) without the whole submission being rejected, so that autosave and submit work for the common case of an action with no territorial component.

---

## Root cause (one line)

The territory pill's `--` option ("no territory") serialises to `''`, but the submission schema's `territoryOid` requires a strict ObjectId (`^[a-f0-9]{24}$`) and rejects `''` — so any project/action left as `--` makes `POST /api/downtime_submissions` return 400 and the downtime cannot save.

- Client is **correct** — sends `''` for `--` (`downtime-form.js:671`). No client change.
- Server schema is too strict (`downtime_submission.schema.js:62`).

## The fix

In `server/schemas/downtime_submission.schema.js`, relax `territoryOid` to accept `''` **or** a 24-hex ObjectId, while still rejecting arbitrary non-empty values:

```js
// :62  before
const territoryOid = { type: 'string', pattern: '^[a-f0-9]{24}$' };
// after
const territoryOid = { type: 'string', pattern: '^([a-f0-9]{24})?$' };
```

`^([a-f0-9]{24})?$` matches exactly 24 hex chars **or** the empty string, and still rejects anything else (e.g. a slug `the_docklands`). This automatically fixes every field using `territoryOid` — `project_${n}_territory` (`:78`) and `sphere_${n}_territory` (`:141`) (the only two usages).

## Acceptance Criteria

1. A submission with `project_${n}_territory: ''` validates OK (no 400).
2. A submission with `project_${n}_territory: '<24-hex ObjectId>'` validates OK (no regression — real territories still store the OID).
3. A submission with `project_${n}_territory: 'the_docklands'` (a slug) is still **rejected**.
4. `sphere_${n}_territory` behaves the same (it shares `territoryOid`).

## Tasks / Subtasks

- [x] **T1 — Schema** (AC: #1,#2,#3,#4): changed `territoryOid` pattern to `^([a-f0-9]{24})?$` in `server/schemas/downtime_submission.schema.js:62` (with a `#514` comment). No other change. Covers `project_${n}_territory` (`:78`) and `sphere_${n}_territory` (`:141`) — the only two usages (confirmed `project_${n}_ambience_target`/`target_terr` do NOT use `territoryOid`).
- [x] **T2 — Test** (AC: all): added `server/tests/schema-territory-no-territory.test.js` (AJV-compile, `minimalSubmission` helper). 5 tests: `project_1_territory: ''` valid; ObjectId valid; slug rejected; `sphere_1_territory` `''`/OID valid + slug rejected; all four project slots `''` together valid.
- [x] **T3 — Regression**: `schema-project-action-enum.test.js` (11) + `api-downtime.test.js` (20) green.

## Dev Notes

- **Pure server schema change** — no client edit (the form already sends `''` for `--`, which is correct). It will not be verifiable on the dev site until `main` deploys (server deploys from `main`).
- **Only two fields use `territoryOid`** (`:78`, `:78` project, `:141` sphere). The issue mentioned `project_${n}_ambience_target` / `project_${n}_target_terr`, but those do **not** use `territoryOid` (verify via grep before assuming) — confirm and, if they also need empty-tolerance, note it; otherwise leave them.
- **Test harness**: `schema-project-action-enum.test.js` is the exemplar — AJV `new Ajv({ allErrors: true, coerceTypes: false })`, `ajv.compile(downtimeSubmissionSchema)`, a `minimalSubmission({ responses: {...} })` builder. No DB needed.
- **Distinct from #496** — that is the full territory→ObjectId canonicalisation migration. This is a focused blocker fix; `^([a-f0-9]{24})?$` still validates the canonical OID form, so it does not conflict with #496.
- **British English**, existing schema style.

### References

- `server/schemas/downtime_submission.schema.js:62` (`territoryOid`), `:78` (`project_${n}_territory`), `:141` (`sphere_${n}_territory`)
- `server/routes/downtime.js:605` (`validate(downtimeSubmissionSchema)` gates the POST)
- `server/tests/schema-project-action-enum.test.js` (test exemplar)
- `public/js/tabs/downtime-form.js:671` (client sends `''` for `--` — correct)
- Related: #496, #497
- Issue: [#514](https://github.com/angelusvmorningstar/TerraMortis/issues/514)

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia, dev-story)

### Debug Log References

- `node --check` clean on `downtime_submission.schema.js`.
- `server/tests/schema-territory-no-territory.test.js` — 5/5; `schema-project-action-enum.test.js` — 11/11; `api-downtime.test.js` — 20/20.

### Completion Notes List

- One-line schema fix: `territoryOid` pattern `^[a-f0-9]{24}$` → `^([a-f0-9]{24})?$` — matches a 24-hex ObjectId OR `''` (the `--` no-territory option), still rejecting slugs (`the_docklands`) and any other non-empty non-ObjectId value.
- Both fields using `territoryOid` (`project_${n}_territory`, `sphere_${n}_territory`) are fixed by the single change. Confirmed `project_${n}_ambience_target` / `target_terr` do not use `territoryOid`, so they are unaffected (and were never the problem).
- Client unchanged — the form already sends `''` for `--`, which is correct.
- Pure server schema change; not verifiable on the dev site until `main` deploys.

### File List

- `server/schemas/downtime_submission.schema.js` — `territoryOid` pattern relaxed to allow `''`
- `server/tests/schema-territory-no-territory.test.js` — new, 5 AJV schema tests

### Change Log

- 2026-06-01 — Implemented #514 (T1-T3). `territoryOid` → `^([a-f0-9]{24})?$`; 5 new schema tests; 31 regression tests green. Status → review.
- 2026-06-01 — Story created at ready-for-dev. One-line schema fix (`territoryOid` → `^([a-f0-9]{24})?$`) + a focused AJV schema test. Client unchanged (already sends `''` for `--`). Cycle-blocker.

---

## QA Results (Quinn, claude-opus-4-8)

**Verdict: PASS** — verified against the compiled schema.

### 1. Regex correctness (incl. near-misses)
Ran the actual AJV-compiled `downtimeSubmissionSchema` against an adversarial set — all behave correctly:

| Input | Result |
|---|---|
| `''` (no territory) | accept ✓ |
| 24-hex ObjectId | accept ✓ |
| 23-hex / 25-hex | reject ✓ |
| uppercase hex | reject ✓ |
| slug (`the_docklands`) | reject ✓ |
| 24 chars w/ one non-hex | reject ✓ |
| leading space + OID | reject ✓ |
| OID + trailing `\n` | reject ✓ (the JS `^…$`-without-`m` gotcha doesn't bite — AJV's RegExp is strict) |

So the empty-string allowance does **not** widen the field to arbitrary input. I added the six near-miss cases to `schema-territory-no-territory.test.js` as permanent regression guards (now 11 tests).

### 2. Blast radius
`territoryOid` is referenced at exactly two sites — `project_${n}_territory` (`:80`) and `sphere_${n}_territory` (`:143`). Nothing else uses it, so nothing else was unintentionally loosened. (Confirmed `project_${n}_ambience_target` / `target_terr` do not use it.)

### 3. Regression
`schema-territory-no-territory` (11) + `schema-project-action-enum` (11) + `api-downtime` (20) — all green. The submission POST validation path is unaffected for non-territory fields.

### Findings
None blocking. Client correctly unchanged; pure server schema change (verifiable in production once `main` deploys).

### Test coverage
- `server/tests/schema-territory-no-territory.test.js` — **11/11** (5 ACs + 6 near-miss rejections).
