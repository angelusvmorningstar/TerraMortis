---
epic: USF (#1047)
adr: ADR-007 Rev 2 (D10-D15)
phase: 1
tier: 0
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1047
branch: piatra/usf-phase1-tier0-delete
---

# Story USF-1 (Phase 1 Tier 0 pilot): batch-delete the 110 byte-identical suite.css selector copies

## Status

Done

## Story

**As a** maintainer reclaiming the live CSS cascade,
**I want** the 110 suite.css selector rules whose declaration bodies are byte-identical to components.css deleted (the lib copy is canonical and unchanged),
**so that** the design system stops being silently shadowed for these selectors, AND the Phase 1 parity apparatus (computed-style diff + monotonic-overlap gate) is validated on a set with zero judgement calls before any shard where a parity failure would be ambiguous.

## Acceptance Criteria

1. The 110 Tier-0 selectors (list: `specs/qa/harness/tier0-selectors.txt`, reproducible via `css-overlap.py --list`) have their suite.css rule copy removed. The components.css copy is UNCHANGED (it is identical and canonical per ADR-007 D11).
2. **Overlap gate:** `python3 specs/qa/harness/usf-overlap-gate.py --expect 53` PASSES after the change (163 − 110 = 53). `--max 163` PASSES (never increased).
3. **Computed-style parity (the pilot's real gate):** capture before (base = dev) and after (this branch) via `usf-smoke.mjs --classes-file tier0-selectors.txt --capture`; the diff is **EMPTY**. A non-empty diff on byte-identical deletions means the HARNESS is wrong (ADR-007 D15) — HALT and escalate to Architect, do not "fix" the CSS.
4. **Boot smoke:** `usf-smoke.mjs player` and `st` both `pass:true`.
5. Grouped-selector safety: where a Tier-0 selector shares a comma-group rule block with a NON-Tier-0 selector in suite.css, only the Tier-0 selector is removed from the group (the block and its other selectors stay). No non-Tier-0 selector's rule is deleted or altered.
6. No components.css edit. No #985 normalisation of DELETED rules (Q4 — violations in removed rules are moot); do not touch kept rules in this shard.
7. Admin: Tier 0 has 0 admin-reachable selectors (instrument-confirmed 0/110), so index parity only — no admin capture, no escalation (D12).

## Tasks / Subtasks

- [x] Generate + commit the frozen selector list (AC: 1)
  - [x] Frozen list `specs/qa/harness/tier0-selectors.txt` (110 lines) already committed on-branch by SM; dev + QA reference the same list. Verified count = 110.
- [x] Capture BEFORE baseline (AC: 3)
  - [x] With local http-server + API on :3000 (Atlas connected, full render): captured `st` → /tmp/tier0-before.json and `player` → /tmp/tier0-before-player.json.
- [x] Delete the 110 suite.css copies (AC: 1, 5)
  - [x] Removed every top-level (no @media) Tier-0 rule from `public/css/suite.css` — 112 rule blocks (110 unique + 2 duplicated selectors each appearing twice). Structural analysis confirmed ZERO shared comma-groups (no partial-group edits needed) and no Tier-0 selector inside any @media wrapper. Match set == the 110 selectors exactly, no collateral.
  - [x] components.css NOT touched.
- [x] Verify (AC: 2, 3, 4)
  - [x] `usf-overlap-gate.py --expect 53` PASS and `--max 163` PASS.
  - [x] Captured AFTER (same commands → /tmp/tier0-after.json, /tmp/tier0-after-player.json); `diff` is EMPTY for both roles.
  - [x] Boot smoke player + st → pass:true.

## Dev Notes

### Why Tier 0 first (D14)
Its job is to validate the apparatus, not to be small. Zero judgement calls: every deletion is byte-identical, so the correct computed-style diff is provably empty. If it isn't, the harness — not the CSS — is wrong, and we must learn that before Tier 1-3 where a parity failure is ambiguous between "harness wrong" and "judgement wrong".

### Resolution rule (D11)
For these 110 there is no admin surface rendering the components.css copy (0/110 reachable) and the bodies are identical, so "promote suite into lib" collapses to "delete the suite copy; lib copy already identical and canonical". Invariant: exactly one copy survives — leaving both is not done; deleting both (i.e. also removing the lib copy) is a regression.

### The instrument + gate
- `css-overlap.py --count` → overlap integer (163 now). `--list` → per-tier selectors.
- `usf-overlap-gate.py --expect 53` is the machine assertion this shard drops overlap by exactly 110.
- Selectors are keyed by selector+media; some carry pseudo/descendant parts (`.feed-confirm-btn:hover`, `.dt-hist-outcome p`). Delete the matching suite.css rule for each; the gate re-measures, so a missed or over-deletion shows as `--expect` failure.

### Parity harness (D15)
`usf-smoke.mjs` drives `goTab` across feeding/downtime/story to mount these families, then captures curated computed style per class. Run with the local API (`cd server && npm run dev`; it accepts `local-test-token` per auth.js:21) so tab families fully render — a partial render passes parity on unmounted elements (silent false green). Keep the same viewport for before/after.

### Not write-path (D7)
CSS-only; touches no write path in the frozen inventory. DOM/computed parity is the gate; no round-trip smoke needed.

### Relevant files
- `public/css/suite.css` (delete-from), `public/css/components.css` (unchanged, canonical)
- `specs/qa/harness/{css-overlap.py, usf-overlap-gate.py, usf-smoke.mjs, tier0-selectors.txt}`

## Testing
No unit framework. Gates: overlap `--expect 53`, computed-parity empty-diff, boot smoke pass. All reproducible via the harness commands above.

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-28 | 0.1 | Initial draft — Tier 0 pilot per ADR-007 Rev 2 | Khepri (SM) |

## Dev Agent Record
### Agent Model Used
claude-opus-4-8 (Ptah / BMAD dev)

### Debug Log References
- Structural analysis of suite.css vs tier0 (mirrors css-overlap.py parser): all 110 selectors present at media-context ''; ZERO shared comma-groups (tier0+non-tier0); ZERO tier0 inside any @media; 2 selectors appear twice — `.feeding-state-detail` (both suite copies byte-match the two components copies) and `.proj-card-dice` (suite #913 == components; earlier suite #629 divergent but already dead-shadowed by #913 at equal specificity).
- Deleter dry-run: 112 spans, unique heads 110, tier0-not-matched none, matched-not-tier0 none.
- Post-delete brace balance 1476/1476 BALANCED; served suite.css confirms deletion (0 hits for a sample deleted selector).
- Gates: `usf-overlap-gate.py --expect 53` -> `overlap=53 expected=53 PASS`; `--max 163` -> `overlap=53 max=163 PASS`.

### Completion Notes List
- **Deletions:** 112 rule blocks removed from `public/css/suite.css` (161 line deletions), covering all 110 Tier-0 selectors. components.css untouched (AC6). Overlap 163 -> 53 (AC2).
- **AC5 grouped-selector safety:** no cases existed — every Tier-0 selector was a standalone single-selector rule; no comma-group mixing tier0/non-tier0. No partial-group edits, no non-Tier-0 rule altered.
- **Duplicate-occurrence handling (nuance):** overlap is keyed by set-membership, so to drop a key both suite occurrences must go. `.feeding-state-detail` x2 (both match the two lib copies) and `.proj-card-dice` x2 deleted. For `.proj-card-dice` the earlier suite copy (#629: `font-family:var(--fl); margin-top:2px`, no word-break) DIVERGED from the lib body but was already fully shadowed by the later suite copy (#913, == lib) at equal specificity, so its removal is a behavioural no-op (computed value was governed by #913 before, by the identical lib copy after). Load order confirms it: index.html loads components.css (line 21) before suite.css (line 22), so the surviving lib copy governs with the same body.
- **Parity (AC3):** computed-style diff EMPTY for BOTH roles (st, player). Apparatus behaved as the pilot predicts for byte-identical deletes.
- **Boot smoke (AC4):** st and player both `pass:true` (0 pageErrors, 0 meaningfulConsoleErrors) before and after.
- **RENDER-COVERAGE CAVEAT (report to SM/Architect — the pilot's key finding):** even with the local API up AND Atlas connected (real character data), parity capture only rendered **st: 5/89, player: 0/89** leading classes. The 5 that render are the `.dt-hist-*` downtime-history family (surface: feeding tab). The feeding/feed/fvc/fvt/regency/proj-card families are STATE-GATED — they mount only under an active downtime submission in a specific feeding/resolution phase, which `goTab(feeding|downtime|story)` alone does not create. So the EMPTY diff genuinely covers only the 5 rendered classes; the safety of the other 105 rests on the structural byte-identical proof + the overlap gate, NOT on computed parity. This is exactly the "silent false green" the story (D15) warns about, surfaced by the pilot as intended. It is a HARNESS coverage limitation, not a CSS defect, and it will recur for Tier 1-3 (same families). Flagged for the Architect: Tier 1+ needs the harness to drive real feeding/downtime state (seed a submission) or those tiers' parity will be equally vacuous.
- Not a HALT: the two hard HALT conditions (non-empty diff, `--expect != 53`) did not trigger; low render is the story's explicit "tell me / note which" case.
- Env note (setup, not story): the dev API bound to :8030 (ambient PORT) and `config.js:6` loads repo-root `.env` (nonexistent) not `server/.env`, so Mongo was unconfigured on first launch. Relaunched with `PORT=3000 node --env-file=server/.env` so the frontend (hardcoded :3000) reached it and Atlas connected. No app code changed for this.

### File List
- `public/css/suite.css` (modified — 112 Tier-0 rule blocks deleted, 161 line deletions)
- `specs/stories/usf.1.tier0-identical-batch-delete.story.md` (this record)
- (`specs/qa/harness/tier0-selectors.txt` — frozen list, already committed on-branch by SM; unchanged here)

## QA Results

### Review — 2026-07-29, Ma'at (Test Architect)

**Gate: CONCERNS** → `specs/qa/gates/usf.1-tier0.yml`

Everything in the dev record that I was asked to re-derive independently is **confirmed**. The CONCERNS is not about the CSS, which I judge provably safe — more strongly than the record argued. It is about AC3 being recorded as met on evidence that covers 6 of 110 selectors.

#### Re-derived, not taken on trust

| Claim | Verdict | Basis |
|---|---|---|
| AC5 zero shared comma-groups | **Confirmed** | Re-parsed pre-delete `suite.css`: 112 blocks contain a Tier-0 selector; **0** mix Tier-0 with non-Tier-0; **0** all-Tier-0 multi-selector groups; **0** inside any `@media`. Every one is a standalone single-selector rule. The case AC5 guards against did not exist. |
| `.proj-card-dice` shadowing | **Confirmed** | Both suite copies are specificity (0,1,0), so later `#913` governed. The argument holds *because* `#629`'s property set is a strict **subset** of `#913`'s — had `#629` carried one property `#913` lacked, it would have applied pre-delete and its removal would be a real change. It does not. Same subset condition verified for `.feeding-state-detail`. |
| Deletion exactness | **Confirmed** | 1573 → 1461 blocks. 110 keys, 112 occurrences removed. Collateral **0**, survivors **0**, partial removals **0**, surviving-rule body changes **0**, new heads **0**. |
| AC2 overlap gate | **Confirmed** | QA re-ran: `--expect 53` PASS, `--max 163` PASS, `--count` → 53. |
| AC4 boot smoke | **Confirmed** | `pass:true`, 0 pageErrors, 0 meaningful console errors — both roles, both trees. |
| AC7 admin reachability | **Confirmed** | 0/110 via the instrument's own `admin_classes()`. |

Neither HALT-DAR condition tripped; re-derivation confirms rather than contradicts the dev record.

#### Cascade-order proof (QA addition — this is what carries the 104 unrendered selectors)

`css-overlap.py`'s own docstring states byte-identity does **not** prove a no-op delete: an equal-specificity rule interposed in cascade order can change the computed value. The record rests the 104 on byte-identity alone, which is insufficient by the instrument's stated limit. Two checks close it (load order `theme < layout < components < suite`, index.html:19-22):

- **Check 1 — relative order preserved.** 0 inversions across all co-occurring, equal-specificity, conflicting Tier-0 pairs.
- **Check 2 — no surviving-suite interposer.** A survivor that *preceded* a deleted rule lost before but would win after. 33 raw candidates → **0 reachable**: `.fvt-pos`/`.fvt-neg`/`.fvt-total` are mutually exclusive per feeding-tab.js:563-575 (the total row is `fvt-row fvt-total`, never `fvt-pos`); `.primer-content`/`.story-narrative`/`.dt-hist-outcome`/`.feeding-disc-row` are distinct tab-level roots that never nest.
- **Check 2b — `@media` survivors.** 23 blocks precede the last deleted rule; **0** mention any Tier-0 class.

Computed values are therefore unchanged for all 110 **regardless of whether they render**. The shard is safe on structure, not on the parity diff.

#### AC3 — the finding

Reproduced end-to-end rather than accepted: pre-delete tree via `git worktree add` served on :8081, branch tree on :8080, shared API on :3000 with Atlas connected; confirmed the two servers served different bytes. **Diff EMPTY for both roles** — matching the record.

Coverage is the problem. st renders 5/89 leading classes, player 0/89 — and the player payload is literally `computed: {}`, so "EMPTY for both roles" is one role contributing evidence and one contributing an empty-vs-empty comparison. Mapped back to the frozen list: **6 of 110 selectors have computed evidence, 104 have none** (uncovered: feeding 61, feed 20, fvc 9, fvt 9, regency 3, proj 1, dt 1).

The letter of AC3 is met; the assurance it was written to provide is not.

#### Why this blocks Tier 1 (usf.1-02, high)

Tier 0 tolerates a vacuous parity diff **only** because the structural proof above substitutes for it. Tier 1-3 are by definition **divergent** bodies — no structural argument is available, so computed parity is their *only* gate. That gate currently covers 0/89 of exactly the families those tiers consist of. Running Tier 1 on this harness yields an empty diff that looks like a pass and asserts nothing, against changes that genuinely alter declarations. That is worse than no gate.

Tier 0 did its D14 job: it validated the deletion method and **falsified the parity apparatus**. That is the more valuable result and precisely why the pilot ran first.

#### Recommended follow-ups (not in this story)

1. **Seeded-state harness** — drive a real downtime submission into a feeding/resolution phase so the gated families mount. Hard prerequisite for Tier 1 entry, not a parallel improvement. Architect note: ADR-007 D15's apparatus as specified does not reach the surfaces D10's tiering targets.
2. **Coverage floor** (usf.1-03, low) — `usf-smoke.mjs` exits 0 on an empty capture, making a vacuous run indistinguishable from a full-coverage pass at CI level. Add `--min-rendered N` with non-zero exit.
3. **Harness README env note** — entrypoint is `server/index.js` and `config.js` resolves `.env` from repo root, so the API needs `cd server && PORT=3000 node --env-file=.env index.js`. Cost setup time twice now.

**Merge to dev: recommended.** The three follow-ups are not blockers for this shard; item 1 is a blocker for the next one.
