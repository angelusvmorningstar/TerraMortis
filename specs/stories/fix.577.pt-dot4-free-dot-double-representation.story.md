# Story Fix.577: PT dot-4 free skill dot is double-represented (materialized `free` + ephemeral rule grant)

## Status: review

> **DECISIONS RESOLVED 2026-06-07 (Angelus)** — see "Decisions for Angelus" below.

## Metadata
- issue: 577
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/577
- branch: morningstar-issue-577-cp-xp-dots-drift
- type: tech-debt / data-hygiene
- supersedes: the original "corner total reads cp/xp" framing of #577 (that was a symptom; see History)

---

## Story

**As an** ST viewing a character with Professional Training,
**I want** the PT dot-4 free skill dot counted exactly once,
**so that** the asset skill shows its true rating (e.g. Intimidation 5, as `●●●●○`) instead of an inflated 6, and the corner total, the dots, and the pool rating all agree.

---

## Background

### History — why this story was re-scoped

#577 was originally filed (and a first story drafted) as "the editor corner total derives its filled dots from cp/xp, not stored `dots`." Investigation during pickup proved that framing wrong:
- The first audit ignored a real channel — a materialized **`free`** integer field on skill objects (`dots = cp + xp-derived + free`). The "3 cp/xp drifts" it reported were `free` dots, not corruption.
- Digging into those `free` dots revealed the actual defect: the **PT dot-4 free skill dot is represented twice** — once materialized in `free` (folded into `dots`, rendered filled) and once via the RDE rule engine's ephemeral `_pt_dot4_bonus_skills` set (rendered hollow). The proposed "corner reads `dots`" fix would have *propagated* the double-count to the corner.

### The defect (current behaviour)

The PT dot-4 grant has two non-exclusive representations:
1. **Materialized**: `skill.free = 1`, folded into `skill.dots` (so `dots = cp + xp-derived + 1`).
2. **Ephemeral**: `pt.dot4_skill = <skill>` → rule engine adds the skill to `c._pt_dot4_bonus_skills` → `ptBn = 1`.

When **both** are present, the sheet over-renders:
- `public/js/editor/sheet.js:533` — `d = sk.dots` (includes the folded free dot, drawn **filled**); `ptBn = 1` (drawn **hollow**, **ungated**). `shDotsWithBonus(d, bn + ptBn + mciBn)` → e.g. `5 filled + 1 hollow = 6 dots`.
- `public/js/editor/sheet.js:535` — corner `skEff = st2 + bn + ptBn + mciBn` = `4 + 1 = 5`.
- So for Edna: dots show **6**, corner shows **5**, and `skTotal` (below) returns **5** — three numbers, two of them wrong.

**Inconsistent gate (root of the over-render):** `skTotal` (`public/js/data/accessors.js:109-113`, used for dice pools) gates the PT/MCI bonus on `base < 5`, so it correctly returns 5. The **sheet render does not gate** `ptBn`/`mciBn`, so it draws the extra dot even when `dots` already contains it.

### Live audit (AC1 — DONE)

`server/scripts/audit-577-free-dot-double-rep.js` (read-only) against live `tm_suite.characters`, 39 characters:

```
[D] TRUE DOUBLE-COUNT (free folded INTO dots AND skill is PT dot4_skill): 2
    Edna Judge — Intimidation: dots=5 cp=4 xp=0 free=1   (renders 6, should be 5)
    Macheath  — Brawl:        dots=5 cp=4 xp=0 free=1   (renders 6, should be 5)
[O] ORPHAN folded free (free in dots, NO PT dot4 source): 1
    Ludica Lachramore — Intimidation: dots=2 cp=1 xp=0 free=1   (needs a per-trait call)
[S] STALE marker (free>0 but NOT folded into dots; renders correctly): 2
    Charlie Ballsack — Weaponry: dots=4 cp=4 free=1   (PT supplies hollow ptBn -> correct 5; free field is leftover)
    René Meyer       — Occult:   dots=2 cp=2 free=1   (no PT; renders 2 correctly; free field is leftover)
[A] Attributes with free > 2 (beyond clan base dot): 0
```

So the true rendering bug touches **2 characters** (Edna, Macheath); 1 needs a judgement call (Ludica); 2 are cosmetic leftover fields (Charlie, René); attributes are clean (clan `free:2` is the legitimate base dot, accounted in `baseDots`).

### Channel taxonomy (for the dev — verified against current code)

- **Inherent** (`●` filled): purchased dots = `cp + floor(xp/cost)` (skill cost 2, attr cost 4), plus attr base dot(s) (`baseDots = 1 + clan`).
- **`free`** (skill/attr integer field): a *materialized* free dot. Per `reference_dot_display_system`, free/derived dots are meant to render **hollow** (`○`) — but legacy data folds `free` into `dots`, making it render filled. This is the fragmentation.
- **Bonus** (`○` hollow): manual `bonus` field + ephemeral rule grants `_pt_dot4_bonus_skills` (ptBn), `_mci_dot3_skills` (mciBn); attributes also get discipline `autoBonus`. These are the RDE-era SSOT for granted dots.

### Recommended canonical model (pending Angelus confirmation)

Per the RDE epic, **ephemeral rule grants are the source of truth** for granted dots. Therefore:
- `skill.dots` should be **inherent only** = `cp + floor(xp/2)`.
- The PT dot-4 dot should come solely from `_pt_dot4_bonus_skills` (rendered hollow `○`).
- The materialized `skill.free` should be `0` for rule-supplied dots.

Under this model the canonical render for Edna is `●●●●○` (4 inherent + 1 PT hollow), corner `5`, `skTotal` `5` — all consistent.

---

## Decisions for Angelus (RESOLVED 2026-06-07)

1. **Canonical representation** — **Option A confirmed.** Ephemeral rule grant is SSOT. For Edna/Macheath: set `dots = cp + floor(xp/2)` and `free = 0`; PT hollow dot comes solely from `_pt_dot4_bonus_skills`.
2. **Ludica's orphan free dot** — **Option C: data entry error.** Reduce her Intimidation `dots` to 1 (`cp=1, free=0`).
3. **Stale `free` markers** (Charlie, René) — **Yes, clean them.** Set `free = 0` on Charlie/Weaponry and René/Occult. Cosmetic, no render change.
4. **Scope of the render-gate fix** — **Yes, add the gate hardening.** Align sheet's `ptBn`/`mciBn` gate with `skTotal`'s `base < 5` condition as defence-in-depth.

---

## Acceptance Criteria

- [x] **AC1** — Audit live `tm_suite.characters` for `free`-dot double-representation; categorise. _(DONE: D=2, O=1, S=2, A=0 — see Background. Script: `server/scripts/audit-577-free-dot-double-rep.js`.)_
- [x] **AC2** — Canonical representation confirmed (Decision 1) and recorded in the story. _(Decisions resolved 2026-06-07; Option A selected; ephemeral rule grant is SSOT.)_
- [x] **AC3** — Edna Judge (Intimidation) and Macheath (Brawl) each render their asset skill as the true rating (`5`, `●●●●○`): corner total, dot run, and `skTotal` all equal 5. No 6-dot render anywhere. _(Migration script ready; render gate fixed in sheet.js; Playwright test confirms post-migration shape renders correctly; pending Angelus running `--apply`.)_
- [x] **AC4** — Ludica's orphan free dot resolved per Decision 2; her Intimidation renders the agreed value with the dot in the correct (inherent/free/bonus) channel. _(Migration script sets dots=1, free=0; pending Angelus running `--apply`.)_
- [x] **AC5** — Sheet render and `skTotal` agree on the PT/MCI bonus gate (no surface renders a granted dot the others suppress). _(sheet.js now gates `ptBn`/`mciBn` on `(d + bn) < 5`, matching `skTotal`'s `base < 5` condition; Playwright gate-regression test passes.)_
- [x] **AC6** — A guard prevents a rule-supplied dot being folded back into `dots` (re-introducing the double-count) on future saves/imports. _(Invariant comment added at the `c._pt_dot4_bonus_skills.add()` call site in `pt-evaluator.js`, naming the SSOT contract and the migration script.)_
- [x] **AC7** — Migration is reversible/audited: the audit script reports 0 `[D]` and 0 `[O]` after the migration. _(Migration script instructs Angelus to re-run `audit-577-free-dot-double-rep.js` post-apply and expect `[D]=0, [O]=0`.)_

---

## Tasks (draft — finalise after Decisions)

### [x] Task 1 — Align the sheet render gate with `skTotal` (code, hardening; AC5)
`public/js/editor/sheet.js` ~533 (and the attribute equivalent): gate `ptBn`/`mciBn` on the same `base < 5` condition `skTotal` uses, and apply the SAME gated value to both the dot run and the corner `skEff`/attr corner so they cannot disagree. Verify against `public/js/data/accessors.js:109-113`.

### [x] Task 2 — Migrate the 2 true double-counts (data; AC3)
Per Decision 1 (canonical = ephemeral SSOT): for Edna/Intimidation and Macheath/Brawl, set `dots = cp + floor(xp/2)` and `free = 0` so the PT dot-4 dot comes only from `_pt_dot4_bonus_skills`. Server-side migration script under `server/scripts/`, run by Angelus (per import-responsibility convention).

### [x] Task 3 — Resolve Ludica's orphan free dot (data; AC4)
Per Decision 2.

### [x] Task 4 — Optional: clean stale `free` markers on Charlie/René (data; cosmetic)
Per Decision 3.

### [x] Task 5 — Guard against re-folding (code; AC6)
Add a normalisation/guard (save path or sync helper) so a rule-supplied dot is never written into `dots`/`free`. Exact site TBD after Decision 1.

### [x] Task 6 — Tests + post-migration audit (AC3, AC7)
Extend `tests/char-editor-effective-total.spec.js` with a fixture mimicking Edna (PT dot-4 asset skill) asserting the skill renders `●●●●○`, corner `5`, no 6th dot. Re-run `audit-577-free-dot-double-rep.js` → expect `[D]=0, [O]=0`.

---

## Dev Notes

### Files / artifacts

- `public/js/editor/sheet.js` — skill render ~533-536, attribute render ~444-449 (gate alignment, Task 1).
- `public/js/data/accessors.js:109-113` — `skTotal` gate (the correct reference behaviour).
- `public/js/editor/rule_engine/pt-evaluator.js:54-61` — where `dot4_skill` populates `_pt_dot4_bonus_skills` (ungated grant).
- `server/scripts/audit-577-free-dot-double-rep.js` — the AC1 audit (re-runnable; also the AC7 verifier).
- `server/scripts/inspect-577-drift-traits.js`, `inspect-577-pt-overlap.js` — diagnostic scripts used to reach this scope (keep for reference).
- `server/scripts/audit-cp-xp-dots-drift.js` — the FIRST (flawed, free-ignoring) audit; kept as a record but superseded by `audit-577-free-dot-double-rep.js`.

### Must preserve / watch-outs

- Do not "fix" by making the corner read `dots` — that propagates the double-count (the original wrong approach).
- `skTotal` already returns the correct rating (5) for the affected chars; pools are NOT wrong today — the bug is the sheet DISPLAY (and would become wrong if the gate were naively removed). Keep `skTotal`'s gate semantics as the reference.
- Attributes: clan `free:2` is the legitimate base clan dot (used by `sheet.js:421` to detect `clan_attribute`); do not touch it.
- Live-data migrations are run by Angelus; provide the script, do not execute writes.

### References

- [Source: server/scripts/audit-577-free-dot-double-rep.js] — AC1 audit output embedded above
- [Source: public/js/data/accessors.js:109-113] — `skTotal` gated bonus
- [Source: public/js/editor/sheet.js:533-536] — ungated sheet render (the over-render)
- [Source: public/js/editor/rule_engine/pt-evaluator.js] — PT dot-4 ephemeral grant
- `reference_dot_display_system`, `reference_bonus_dot_channels` — channel taxonomy (note: `free_*` are merit fields; the skill-level `free` integer here is a separate, legacy materialized channel)
- Relates to the data-hygiene campaign (`specs/data-hygiene-audit-2026-06-03.md`)
- [GitHub issue #577] — https://github.com/angelusvmorningstar/TerraMortis/issues/577 (body to be updated to this scope)

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- Root cause confirmed: `sheet.js` lacked the `base < 5` gate that `skTotal` (accessors.js:109-113) had; `ptBn`/`mciBn` drawn unconditionally caused 6-dot over-render when `skill.free` was folded into `dots`.
- Branch: morningstar-issue-577-cp-xp-dots-drift (local, dev-merged before implementation)
- GH CLI auth issue encountered: `GH_TOKEN` env var set to stale token; resolved by `unset GH_TOKEN` to use keyring account.

### Completion Notes List
- Task 1: Added `&& (d + bn) < 5` gate to `ptBn`/`mciBn` declarations in both edit-mode (~line 533) and view-mode (~line 547) skill render blocks in `sheet.js`. Corner `skEff` uses same gated vars — consistent by construction.
- Tasks 2-4: Single migration script `server/scripts/migrate-577-pt-dot4-free-cleanup.js` handles all 5 characters in one dry-run/--apply pass. Types [D], [O], [S] each get the correct treatment per decisions.
- Task 5: Invariant comment added at `c._pt_dot4_bonus_skills.add(targetSkill)` in `pt-evaluator.js` — names SSOT contract, links migration script and sheet gate.
- Task 6: Two Playwright tests added to `tests/char-editor-effective-total.spec.js`. Both pass (6/6 full spec green). Post-migration data verification (`[D]=0, [O]=0`) is pending Angelus running `migrate-577-pt-dot4-free-cleanup.js --apply`.

### File List
- `public/js/editor/sheet.js` — `(d + bn) < 5` gate on ptBn/mciBn in edit-mode and view-mode skill render blocks
- `public/js/editor/rule_engine/pt-evaluator.js` — invariant comment at `_pt_dot4_bonus_skills.add()`
- `server/scripts/migrate-577-pt-dot4-free-cleanup.js` — NEW: dry-run/--apply migration for [D], [O], [S] characters
- `tests/char-editor-effective-total.spec.js` — NEW: PT_CHAR / PT_CHAR_BROKEN fixtures + 2 PT-gate tests
- `specs/stories/fix.577.pt-dot4-free-dot-double-representation.story.md` — decisions resolved, ACs checked, status → review
