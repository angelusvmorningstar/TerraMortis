# Story Fix.586: DT Processing target picker should pre-populate from the player's submitted target

## Status: review

> **Implemented 2026-06-05.** Throughline seeded for investigate + attack, new picker added for block, non-character targets surfaced read-only. New spec `tests/fix-586-target-prepopulate.spec.js` — 6/6 pass (investigate/attack/block seed; ST-clear-wins; ST-set-wins; territory display). ESM parse-check green. Not committed/pushed pending Angelus review.

## Metadata
- issue: 586
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/586
- branch: morningstar-issue-586-target-prepopulate
- type: fix / throughline
- relates: #285 (same pre-population family — pool + territory pills), #583 (investigate lead, prior follow-on)

---

## Story

**As** an ST resolving an action in DT Processing,
**I want** the target the player selected in the DT form to pre-populate the processing Target picker,
**so that** I can see who/what the action is aimed at (e.g. Ryan Ambrose on Einar's "Hunting the Hunter") without re-entering it from the raw submission.

---

## Background

The player picks a target in the DT form; DT Processing shows none (the picker reads "Add character…"). This is the same pre-population throughline #285 fixed for the pool builder and territory pills, never extended to the target. The **critical path is the character target** (the common case).

### Throughline audit (the targeting block, `downtime-views.js:6981-7041`)

Each action type seeds its target picker differently:

| Action type | Seeds from | Correct? |
|---|---|---|
| `investigate` (`:6986`) | `rev.investigate_target_char \|\| ''` | ❌ ST-only — ignores player |
| `attack` (`:7023`) | `rev.attack_target_char \|\| ''` | ❌ ST-only — ignores player |
| `sorcery` (`:7032`) | `rev.sorc_targets ?? <player targets>` | ✅ falls back to player submission |
| `block` | (no target picker rendered here at all) | ❌ player `target_char` dropped entirely |

So sorcery is the reference pattern. investigate + attack must gain the same player fallback; `block` (which the form captures a `target_char` for, see `downtime-form.js:227`) currently renders no character target picker on the processing side at all.

### How the player target is stored

`_composeTargetString` (`downtime-views.js:2739-2767`) reads, for a given prefix:
- `${prefix}_target_type` — `character` / `territory` / `own_merit` / `other`
- `${prefix}_target_value` — for `character`: a char `_id`, or a JSON-array string of ids
- `${prefix}_target_terr` / `${prefix}_target_other`

For a project, the prefix is `project_${slot}`; the composed display string is already on the entry as `entry.projTarget` (`:3045`, `:3108`). Sphere/status merit targets use `sphere_${n}` / `status_${n}` prefixes (`:3252`).

### How the picker is keyed and saved (the override mechanic)

- `_renderCharTypeahead(key, selectedKeys, allChars, {...})` (`:7062`) renders chips for any `selectedKeys` that match `allChars`, where each char's **key is `sortName(c)`** (`:7047`, `:5707`). So a seed value must be a `sortName(c)` key, NOT a display string and NOT an `_id`.
- The save handler (`:5760+`, single mode) writes `{ [saveField]: chips[0] || null }`. Therefore the rev field is:
  - **absent** (`undefined`) when the ST has never touched the picker,
  - **`null`** when the ST deliberately cleared it,
  - a `sortName` key when the ST set it.
- This distinction is the key to "ST override wins": seed the player value **only when the rev key is absent**. Using `??`/`||` (which also fires on `null`) would re-seed the player target after the ST clears it. (Note: sorcery's `rev.sorc_targets ?? _tRaw` has this exact latent issue; out of scope to change here, but do not copy the `??` for the single pickers.)

---

## Acceptance Criteria

- [x] **AC1 (critical)** — Investigate with a player character target shows that character chip on first open (Einar → Ryan Ambrose). _(Test: "investigate seeds the player character target".)_
- [x] **AC2** — Covered for **attack** (seed) and **block** (picker newly added + seed). _(Tests: "attack seeds…", "block seeds… (picker newly added)".)_
- [x] **AC3 (override wins)** — `('field' in rev)` presence check: ST clear (null) shows no chip; ST set shows the ST's character, not the player's. _(Tests: "ST clear wins…", "ST set wins…".)_
- [x] **AC4** — `_composeTargetCharKeys` maps stored char `_id`(s) → `sortName(c)`, skipping unresolved/retired ids (no chip, no crash).
- [x] **AC5 (secondary)** — Non-character (territory/other) targets render a read-only "Submitted target" line from `entry.projTarget`; `block`'s target is no longer dropped. _(Test: "non-character (territory) target surfaces read-only, no chip".)_
- [x] **AC6** — Playwright spec `tests/fix-586-target-prepopulate.spec.js`, 6 tests, all passing.

---

## Decision / open question (resolved per Angelus)

- **Critical path = the target information getting through**; the **character target** is the priority. Territory/other targets need only surface as display (AC5), not necessarily in the interactive character picker.
- **Single vs multi:** investigate/attack pickers are `single: true`. Default = seed the **first** submitted character target (these actions are single-target in practice). If the player submitted multiple ids, seed the first and rely on `entry.projTarget` display to show the full list. (Confirm if a multi-target picker is wanted — not blocking.)

---

## Tasks

### Task 1 — Compute the player target char key(s) on the queue entry (AC1, AC4) — [x] DONE
In `buildProcessingQueue` (`downtime-views.js:2773+`), alongside `entry.projTarget`, compute `entry.targetCharKeys` = the `sortName(c)` keys for the player's character target(s). Reuse the parse from `_composeTargetString` (target_type === 'character' → ids → `chars.find(_id)` → `sortName(c)`), filtering unresolved/retired. Do this for the project prefix (`project_${slot}`) and the merit prefixes (`sphere_${n}` / `status_${n}`) so the field is populated wherever a target picker renders. Keep `entry.projTarget` (display) as-is.

### Task 2 — Seed the single-target pickers, override-aware (AC1, AC2, AC3) — [x] DONE
In the targeting block (`downtime-views.js:6985-7029`):
- investigate: `const _invT = ('investigate_target_char' in rev) ? (rev.investigate_target_char || '') : (entry.targetCharKeys?.[0] || '');`
- attack: same with `attack_target_char`.
- Apply the identical `('<field>' in rev)` guard so an ST clear (rev field === null) wins and is not re-seeded.

### Task 3 — Block target picker (AC2, AC5) — [x] DONE
`block` captures a player `target_char` (`downtime-form.js:227`) but renders no character target picker in the targeting block. Add a single-target picker for `block` mirroring `attack` (saveField e.g. `block_target_char`), seeded the same override-aware way. If a `block_target_char` rev field / save path does not yet exist, add it consistently with attack/investigate. (If this proves larger than a seed, split to a follow-up and ensure AC5's "not silently dropped" is met via the `entry.projTarget` display at minimum.)

### Task 4 — Non-character target display (AC5) — [x] DONE
Ensure territory / other / multi targets surface via the existing `entry.projTarget` display string on the card (it is already composed). Confirm it renders where the ST can see it for these action types; if not, add a read-only Target line (reusing the `proc-proj-field` pattern) when `entry.projTarget` is present and the picker cannot represent it.

### Task 5 — Tests (AC6) — [x] DONE
New Playwright spec (model on `tests/feature-583-investigate-lead-card.spec.js` — the flat-card-wall-aware harness; target the action row by title text, not `.first()`): investigate submission with `project_1_target_type='character'` + `project_1_target_value=<id>` pre-populates the Target chip; an ST-saved/cleared rev value wins over the player seed; a non-investigate action is unaffected.

---

## Dev Notes

### Files / artifacts
- `public/js/admin/downtime-views.js:6981-7060` — the targeting block (`_renderActionTypeRow` target section); primary edit site.
- `public/js/admin/downtime-views.js:2739-2767` — `_composeTargetString` (the parse to reuse for id→key).
- `public/js/admin/downtime-views.js:5698-5790` — typeahead wiring + single-mode save (`{[saveField]: chips[0] || null}`); confirms absent-vs-null semantics.
- `public/js/admin/downtime-views.js:7062-7077` — `_renderCharTypeahead` (keyed by `sortName(c)`).
- `public/js/admin/downtime-views.js:2773+` — `buildProcessingQueue` (where to attach `entry.targetCharKeys`).
- `public/js/tabs/downtime-form.js:226-229` — form action field sets (`attack`/`block` use `target_char`; `investigate` uses `target_flex`).

### Must preserve / watch-outs
- **ST override wins** is the trap: use the `('field' in rev)` presence check, NOT `||`/`??`. The save writes `null` on clear, so `??` would re-seed the player target and the ST could never clear it.
- Seed value MUST be a `sortName(c)` key (matches the typeahead's `selectedSet`), not a display string or `_id`. Cross-check `sortName` usage at `:7047` / `:5707`.
- `investigate` uses a **flex** target (character/territory/other) — only seed the picker when `target_type === 'character'`; otherwise leave the picker empty and rely on the `entry.projTarget` display (AC5).
- Retired/unresolved ids: `chars.find` returns undefined → skip (no chip), do not push a `'<id> (unresolved)'` key into the picker.
- This is render/seed only on the ST side — do NOT change how the form stores targets.
- British English; reuse existing `proc-*` classes (no new CSS — that is issue #587).

### References
- [Source: downtime-views.js:6986,7023,7032] — per-action target seeding (investigate/attack ST-only; sorcery correct)
- [Source: downtime-views.js:2739-2767] — `_composeTargetString`
- [Source: downtime-views.js:5760+] — single typeahead save (`chips[0] || null`)
- #285 — pool/territory pre-population precedent
- #587 — the related CSS normalisation (out of scope here)
- #583 / `tests/feature-583-investigate-lead-card.spec.js` — flat-wall test harness to model

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / dev-story)

### Debug Log References

- `node --input-type=module --check < public/js/admin/downtime-views.js` — PASS.
- `npx playwright test fix-586-target-prepopulate.spec.js --project=chromium` — 6 passed.
- Targeted regression check: only `downtime-processing.spec.js` (already pre-broken by #581) and `downtime-processing-dt-fixes.spec.js` touch the targeting block; no spec asserts `.proc-conn-chip` presence/absence, so the additive seed has nil regression surface.
- Attempted to run `downtime-processing-dt-fixes.spec.js` as a regression gate; it hung on the #581 flat-wall-broken `setupDowntimeProcessing`/`openFirstAction` helpers (timeout-retry loop, no result) and was stopped. No clean signal available from that suite until #585 repairs it; relying on the nil-regression analysis + the 6 passing new tests + parse-check.

### Completion Notes List

- New pure helper `_composeTargetCharKeys(resp, prefix, chars)` mirrors `_composeTargetString`'s character branch, returning `sortName(c)` keys (skips non-character targets and unresolved/retired ids).
- `buildProcessingQueue` attaches `entry.targetCharKeys` to project entries (scoped to projects — investigate/attack/block are all `source: 'project'`; merit actions render no character target picker, so merit prefixes were not needed).
- investigate (`:6986`) and attack (`:7023`) seeds rewritten to `('<field>' in rev) ? (rev.<field> || '') : (entry.targetCharKeys?.[0] || '')` — ST override (incl. clear-to-null) wins; player seeds only when untouched. Deliberately did NOT copy sorcery's `??` (which would re-seed after a clear).
- Added a `block` branch to the targeting block (mirrors attack, `saveField: 'block_target_char'`) — block previously rendered no target picker at all.
- Added a read-only "Submitted target" line (`proc-mod-row`) for investigate/attack/block when the player target is non-character (territory/other) and the char picker can't represent it, so it is not silently dropped.
- No CSS added (that is #587). No change to how the form stores targets.

### File List

- `public/js/admin/downtime-views.js` (modified — `_composeTargetCharKeys` helper; `entry.targetCharKeys`; override-aware investigate/attack seeds; new block picker; non-character target line)
- `tests/fix-586-target-prepopulate.spec.js` (new — 6 Playwright tests)
- `specs/stories/fix.586.dt-processing-target-prepopulate.story.md` (this story)
- `specs/stories/sprint-status.yaml` (status tracking)

### Change Log

- 2026-06-05 — Throughline fix: DT Processing target pickers (investigate/attack/block) pre-populate from the player's submitted character target, override-aware; non-character targets surfaced read-only; new block picker. 6 Playwright tests passing. Status → review.
