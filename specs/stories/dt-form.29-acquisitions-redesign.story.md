---
id: dt-form.29
task: 29
issue: 87
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/87
epic: epic-dt-form-mvp-redesign
status: Ready for Review
priority: medium
depends_on: ['dt-form.17']
hotfix_predecessor: 'GitHub issue #42'
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Audit-baseline)
---

# Story dt-form.29 — Acquisitions section redesign (Resources + Skills)

As a player buying resources or learning skills in downtime,
I should have a clean Acquisitions section that handles both resource buys and skill buys,
With the skill-acquisition pool fix (issue #42 — pool is SKILL only, not ATTR + SKILL) preserved as the source of truth.

This is **ADVANCED-only** per ADR §Q2 — Acquisitions is not in the MINIMAL set.

## Context

ADR-003 §Audit-baseline notes the Acquisitions section has the skill-acquisition pool bug (ATTR + SKILL where rules say SKILL only) which is hotfix issue #42. Story #29 redesigns the section's UI but **preserves** the #42 fix as the underlying logic.

Per Piatra: the redesign is about clean UI surfacing of both resource buys and skill buys, not re-deriving the rules.

### Files in scope

- `public/js/tabs/downtime-form.js` — the `acquisitions` section render path
- `public/js/data/dt-completeness.js` — no MINIMAL impact (Acquisitions is ADVANCED-only); but if any helpers are introduced for the redesign, they may live here

### Files NOT in scope

- The skill-acquisition pool computation (locked by #42 hotfix; preserve)
- Resource cost logic (existing; preserve)
- The MINIMAL set (Acquisitions stays ADVANCED-only per ADR §Q2)

## Acceptance Criteria

**Given** a player on ADVANCED with Acquisitions visible
**When** the section renders
**Then** there are clearly distinguished sub-blocks for Resource buys and Skill buys (or a unified UI that doesn't conflate the two — implementer's call).

**Given** the skill-acquisition pool computes
**When** it renders for a skill buy
**Then** it uses SKILL only (per #42 hotfix), not ATTR + SKILL. The #42 logic is the source of truth — story #29 must not duplicate or override it.

**Given** legacy submission data
**When** the form loads against pre-existing Acquisitions data
**Then** the redesign loads it cleanly. Persistence keys preserved or migrated cleanly (document in DAR).

**Given** the redesign ships
**When** a developer greps for the skill-pool computation
**Then** there is one canonical helper (from #42); the new UI consumes it.

## Implementation Notes

Survey current Acquisitions UI before redesign — its persistence keys, cost computations, dropdown sources. Document in DAR. Then redesign with the survey as the contract.

If the redesign is large, surface to Piatra during pickup; consider scoping down (e.g. ship the visual reorganisation only this story; defer deeper UX changes).

## Test Plan

- DAR captures pre/post UI state
- Browser smoke: resource buy and skill buy both work; skill pool uses SKILL only; legacy data loads

## Definition of Done

- [x] Acquisitions section redesigned (Resources + Skills as distinct sub-tables per HALT-DAR-A2 + B-readout)
- [x] #42 skill-pool fix preserved as source of truth (`skillAcqPoolStr` is the only computation site; inline duplicate at form.js:4684-4688 deleted as adjacent-scope cleanup)
- [x] Legacy data loads cleanly (backward-compat row[0] seed + mirror builder roll-forward)
- [x] PR opened into `dev` with `Closes #87`

## Dependencies

- **Upstream**: #17 (rendering gate; ADVANCED-only); **hotfix #42** (skill-pool fix — must land first)
- **Downstream**: none
- **Cross-reference**: GitHub issue #42 carries the skill-pool fix.
