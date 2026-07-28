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

Approved

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

- [ ] Generate + commit the frozen selector list (AC: 1)
  - [ ] `python3 specs/qa/harness/css-overlap.py --list | awk '/--- IDENTICAL \(Tier 0\) ---/{f=1;next} /^--- /{f=0} f && NF' > specs/qa/harness/tier0-selectors.txt` (110 lines). Commit it so dev + QA reference the same list.
- [ ] Capture BEFORE baseline (AC: 3)
  - [ ] On dev (base), with local http-server + `cd server && npm run dev` (full render): `node specs/qa/harness/usf-smoke.mjs st --classes-file specs/qa/harness/tier0-selectors.txt --capture /tmp/tier0-before.json` (also role player if any Tier-0 class is player-only).
- [ ] Delete the 110 suite.css copies (AC: 1, 5)
  - [ ] For each Tier-0 selector, locate its rule in `public/css/suite.css` and remove it. For grouped blocks (`.a, .b {…}`) where only some selectors are Tier-0, drop only the Tier-0 selectors from the group; keep the block for the rest. Preserve media-query wrappers that still contain kept rules.
  - [ ] Do NOT touch components.css.
- [ ] Verify (AC: 2, 3, 4)
  - [ ] `usf-overlap-gate.py --expect 53` PASS and `--max 163` PASS.
  - [ ] Capture AFTER on this branch (same command → /tmp/tier0-after.json); `diff /tmp/tier0-before.json /tmp/tier0-after.json` is EMPTY. If NOT empty → HALT to Architect (harness defect, not CSS).
  - [ ] Boot smoke player + st → pass:true.

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
### Debug Log References
### Completion Notes List
### File List

## QA Results
