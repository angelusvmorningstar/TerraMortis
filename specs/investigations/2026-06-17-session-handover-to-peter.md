# Session handover → Peter (2026-06-17)

Angelus ran a chat-driven issue→fix cycle. Everything below is on `dev` and
`main` unless noted; production deploy fired for all merges.

## 1. Shipped this session (merged dev + main)

| # | What |
|---|------|
| #847 | DT processing: Outcome box added to the **compact merit panel** (`_renderCompactMeritPanel`) — Contacts intel etc. had no outcome field |
| #842 | Unblocked the `issue-834-m-free-deprecation` test **+ completed the #834 reader-removal** (see flags) |
| #854 | Replaced 12 inline colour literals across 6 JS files with normalised-CSS tokens/classes |
| #860 | DT ribbon now reaches **Complete** on merit outcome (Approved/Partial/Failed) and travel discretion (Obvious/Neutral/Subtle) |
| — | **CSS enforcement infrastructure** (see §3) |

## 2. Flags on Peter's merged work — please read

From #842 / #854 / the CSS work; these touch code/scripts Peter wrote:

- **#834's reader-removal was incomplete.** The commit said `m.free` was dropped
  from `rules-data-view.js`, but only the bonus *rollup* (`:536`) was done — the
  `relevant` **filter at `:527` still read `(m.free || 0)`**. The #834 static test
  correctly caught it; #842 finished the removal.
- **Shebang breaks vitest 4.** `server/scripts/cleanup-m-free-deprecation.js`
  starts with `#!/usr/bin/env node`. The #834 test imports it, and **vitest 4 does
  not strip shebangs in imported modules**, so the whole suite failed to parse
  ("Invalid or unexpected token", no line/col). #842 removed the shebang. Any
  shebang'd script imported by a test will do the same.
- **Direct-invocation guard silently no-ops on Windows.** The
  `import.meta.url === \`file://${process.argv[1]}\`` guard is false on Windows /
  paths with spaces, so `main()` never runs — the script "succeeds" doing nothing.
  The new #840 script uses `pathToFileURL(process.argv[1]).href`. The cleanup/seed
  scripts likely share this latent bug.
- **#820 references refreshed.** The domain-merit refactor (#793/#827/#832)
  shifted `sheet.js` line numbers; #820 (shared-domain partners keyed by name) was
  updated and its scope expanded to 3 files incl. `domain.js:86`/`:202`.

## 3. New: CSS enforcement is now live — please use it

Stood up because AI-built UI kept ignoring the design system:

- **`specs/project-context.md`** (NEW) — auto-loaded by the BMAD dev/story agents
  (their `persistent_facts` glob previously pointed at a non-existent file). Leads
  with the CSS rule + component catalogue.
- **`specs/architecture/coding-standards.md` → CSS Standards** — added a
  component-reuse catalogue, a "styling from JavaScript" rule (apply classes, never
  inline hex), and a WRONG/RIGHT example.
- **`CLAUDE.md`** — normalised-CSS mandate; corrected the stale dark-default token
  note (Parchment is the default theme).
- **`tm-gh-issue-create` / `tm-gh-issue-pickup`** skills now do a CSS check / carry
  a reminder at hand-off.

## 4. Needs Peter's action — data ops (Angelus's new division: live-DB work is Peter's)

- **#840 — Contacts merit unaddable.** Confirmed root cause: the `Contacts` rule
  in `purchasable_powers` has `sub_category: null` (every other influence merit has
  `'influence'`), so it's filtered out of the editor dropdown. **Data-only fix.**
  Idempotent, dry-run-default script merged:
  `server/scripts/set-contacts-influence-subcategory.js`.
  **Run:** `cd server && node scripts/set-contacts-influence-subcategory.js --apply`,
  then smoke-test (add a Contacts merit on a char that has none) and **close #840**.
  No code change needed (convert path verified).
- **#823** — purge live test residue (`Regent Save Test` territories, `Test Cycle`
  cycles) + stop tests writing to prod.
- **#815** — Harbour influence reconcile (+17 shown / +19 expected / 13 raw DB) —
  likely ends in a data correction.
- **#808** — running the `m.free` cleanup against live (finding the *secondary
  writer* is code; the cleanup run is the data part).

## 5. Open backlog — code-only (no live writes), ready to pick up

- **#865** retainer/mentor action-type selection reverts — *confirmed root cause*:
  the retainer/mentor queue-build blocks hardcode `actionType:'resources_retainers'`
  and never read `action_type_override` (the sphere loop does it right at
  `downtime-views.js:3285-3286`). Small, scoped.
- **#843 / #844** Carthian Pull (domain-merit `granted_by` indicator; cap-bound
  Haven rule — needs an ST rules decision).
- **#859** DOM-API inline styles (`.style.*`) cleanup + widen the CSS grep (blind
  spot QA found: `admin.js:222`, `feeding-tab.js:952`).
- **#846** delete dead `initDiceEngine` / `dice-engine.js` (zero callers, confirmed).
- **#816** (+#496) single `normaliseTerritoryId()` — the durable fix behind the
  #814 territory class.
- **m.free family:** **#750 is the lever** (5 evaluators flat-write double-count) →
  unblocks **#707** (union-sum reader cleanup); #749, #676 in the same area.

## 6. Repo state

- All this session's PRs are **merged**; nothing of Angelus's is open.
- ⚠️ **One open PR not from this session: #824 → main** ("feat(editor): sort
  domain merits and group Necropolis targets"). Looks like a stale/duplicate of the
  already-merged #793/#825 — please check whether to close it.
- Closed earlier in the session (by Peter): #836/#837/#838. Verified closeable and
  closed: #818.

## 7. Working-division note (new this session)

Anything that **touches live data is Peter's** — migrations, cleanup/seed scripts,
`--apply` runs, manual DB edits, the data-correction half of an issue. Claude/
Angelus stay on code/CSS/docs/story through PR review, **including authoring** a
data-fix script (just not running it).
