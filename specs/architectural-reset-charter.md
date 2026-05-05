# Architectural Reset Charter: Audit & Freeze

**Status:** Working document v0.3 — internal
**Author:** Angelus (with structured input from BMAD roundtable)
**Date:** 2026-05-01

## In one paragraph

The Terra Mortis Suite has accumulated structural drift faster than feature work can keep up with. Effective-rating calculations have no canonical home and have been re-derived in multiple call-sites; cross-cutting concerns ship in two forms simultaneously (two trackers, two editor-handler importers); the documented schema and the live MongoDB shape have parted ways; and AI-generated code has, by default, reached for whatever local fragment was closest rather than a single source of truth. Peter's Discord critique on 2026-04-30 surfaced that this is structural rather than incidental. This charter records the decision to call a stop-the-line on all proposed feature development, run a focused audit to produce a complete drift map, and use the audit's findings to inform a layer-by-layer refactor. The post-audit diagnosis and path-forward proposal — the document Peter will be invited to comment on — is a separate artefact, not this one. This charter scopes only the freeze and the audit. The DT cycle launches **7 May 2026** — six days from charter acceptance — and the phasing is sized to fit that constraint.

## A note on the audit's purpose

The audit is diagnostic and pedagogical, deliberately. Much of the drift in this codebase is invisible to the project lead because it was AI-generated and reached for local fragments rather than a single source of truth. The audit phase is owned by Angelus rather than delegated to Peter because the goal is to build the architectural mental model in the project lead so that drift is visible at PR-review time, not just at audit time. Peter's role is review of findings, not execution. Sanity-check the methodology and the conclusions; don't shortcut the walk-through.

## Acknowledgements

**Peter** catalysed this charter. His structural diagnosis is named verbatim throughout. The substantive collaboration on what follows is with him.

**The BMAD roundtable** drafted earlier versions of this document in four sections: Mary (Analyst), Winston (Architect), Bob (Scrum Master), John (Product Manager). The architecture and guardrails sections from that earlier draft have been removed pending audit findings; what remains is methodology, freeze rules, and comms.

## How to read this document

Three parts:

1. **Diagnosis & Audit Plan** — what we already know is broken (a partial picture by definition) and the methodology the audit will use to produce the complete drift map.
2. **Sequencing, Stop-the-Line, Freeze Rules** — the operational HOW: branches, phases, gates. Phases beyond Phase 2 (Diagnosis Report) are sketched at principle level only; the post-audit report defines them in detail.
3. **Scope, Communication, Trust** — the WHY and the audience-by-audience comms.

This charter does not contain target architecture or drift-prevention guardrails. Both are downstream of audit findings and live in the post-audit report.

---

# Part 1 — Diagnosis & Audit Plan
*Author: Mary, Business Analyst*

## Diagnosis

The drift is real, multi-axial, and now self-reinforcing. Peter's verbatim framing names the mechanism precisely: *"AI has vibe-coded several competing and duplicate implementations of things that should be consistent helper functions."* What follows is the catalogue of where that mechanism has already left tracks. This is the partial picture the project lead can see today; the audit's job is to find the rest.

### Derivation drift (the largest category)
Derived values are computed inline at render sites instead of routed through a single helper. We have canonical helpers for some derivations (`xpEarned`, `xpSpent`, `xpLeft`, `displayName`, `sortName`) but the **effective-rating layer has no canonical home**. Effective dots flow in from at least five channels: manual `bonus`, `free_*` fields, `_mci_/_pt_/_ohm_` standing-merit grants, discipline-to-attribute bonuses (e.g. Vigour), and derived-stat modifiers. Each consumer (pool calculators, prerequisite checks, sheet renderers, DT roller) has incentive to reinvent the sum locally, and the AI loop accelerates that. Hollow-dot rendering is display-only, but pool maths must read effective rating; the failure mode is silent under-counting.

Other derivations with the same vulnerability: health max, vitae max, willpower max, defence, size, speed, influence total, vitae deficit. Memory note "Bonus dots are real dots" exists precisely because this drift has already produced bugs.

### Duplicate implementations of cross-cutting concerns
Two tracker clients ship simultaneously: `public/js/game/tracker.js` (keyed by `_id`, canonical) and `public/js/suite/tracker.js` (keyed by name, legacy). Two editor-handler importers (`admin.js` and `app.js`) must be kept in sync manually, and memory explicitly warns about it. These are confirmed instances of the pattern Peter described; the audit's job is to find the unconfirmed ones.

### Schema gaps and shape tangles
`schemas/schema_v2_proposal.md` is the stated source of truth, but live MongoDB documents drift past it (validation errors of the "additional properties" form already observed). Index-coupled merit arrays remain unfixed. `character.npcs[]` and `character.touchstones[]` are deprecated but extant. We do not yet know how far the live shape has departed from the documented shape, only that it has.

### View-data coupling and deployment-shape tangles
Three to four product surfaces (Admin, Suite, Player Portal, Game App) share a single frontend tree, with feature flags and entry-point conditionals doing layering work that should be structural. Render paths carry business logic. The DT app is the worst-affected surface but not the only one.

### API scoping
NPCR-14 established the precedent: role/ownership filters belong in the Mongo query, not in post-fetch JavaScript. We have one fix; we do not have a sweep confirming the precedent holds across every list endpoint.

## Audit Plan

The audit's deliverable is a **structured drift map** spanning the whole suite. Not a narrative report. A table the post-audit report consumes row-by-row.

### Scope
Frontend modules under `public/js/**`; Express routes under `server/**`; live MongoDB collections (`characters`, `territories`, `downtime_cycles`, `downtime_submissions`, `game_sessions`, `session_logs`, `tracker_state`, `npcs`, `rule_*`); the `schemas/` folder; `specs/reference-data-ssot.md`; reference data modules (`MERITS_DB`, `DEVOTIONS_DB`, `MAN_DB`, `FEED_METHODS`, `TERRITORY_DATA`, etc.).

### Methodology
1. **Derivation sweep.** For each derived value (effective dots, XP earned/spent, health/vitae/WP/defence/size/speed, influence total, vitae deficit, pool totals), grep every read site, classify as *helper-routed* or *inline*, and record the file/line.
2. **Schema diff.** For each typed collection, dump a sample of live documents and diff field sets against the schema file. Flag drift in both directions (undocumented fields, documented-but-missing fields, type mismatches).
3. **Duplicate-implementation detection.** For each cross-cutting concern (trackers, editor handlers, sheet renderers, DT form, roller), enumerate every module that claims to do it. Mark canonical vs legacy vs unknown.
4. **Call-graph mapping.** For known canonical helpers (`xpEarned`, `displayName`, etc.), confirm every consumer routes through them. For *missing* helpers (effective rating chief among them), enumerate the would-be consumers so the refactor knows the blast radius.
5. **API endpoint scoping audit.** For every list endpoint, verify role/ownership filtering is at the Mongo query level per NPCR-14.
6. **Render-path business-logic audit.** Flag any render function performing arithmetic on stored fields beyond simple lookup.

### Categories audited
Derivations (every value); schemas (every typed collection plus loose ones); cross-cutting modules; API list/detail endpoints; reference-data ownership (which module owns each `*_DB`); deprecated-field usage.

### Deliverable shape
A single drift-map table: *concern | location(s) | canonical? | drift type | severity | refactor target*. One row per duplicate or drift instance. Plus a derivations matrix: *value | helper exists? | consumers routed | consumers inline*. These two artefacts are the direct input to the post-audit Diagnosis + Path Forward report.

### Honest unknowns
We don't know how many duplicate implementations exist beyond the two trackers and two editor importers. We don't know the true delta between `schema_v2_proposal.md` and live MongoDB shape. We don't know which derived values have silent under-count bugs in the wild versus which only have *risk* of them. The audit exists because guessing these numbers is exactly the failure mode that got us here.

---

# Part 2 — Sequencing, Stop-the-Line, Freeze Rules
*Author: Bob, Scrum Master*

## Stop-the-Line

The freeze takes effect at the moment this charter is accepted. It is operational, not aspirational.

### Branch posture during freeze

| Branch | Posture | What lands |
|---|---|---|
| `Morningstar` | Restricted | Hotfixes, audit findings, doc updates, freeze-rule enforcement only |
| `Piatra` | Coordinated | Peter completes any in-flight story to a clean commit, then mirrors Morningstar's posture. No new feature stories started. |
| `dev` | Integration only | Accepts hotfix merges from either dev branch. No epic merges. |
| `main` | Deploy-on-demand | Merges from `dev` only for hotfixes or the pre-cycle stabilisation pass. User approval per deploy as always. |

**Hotfix definition (strict):** a code change that (a) fixes a bug blocking the live DT cycle or admin operations, (b) touches the minimum surface area required, (c) does not introduce new schema fields, new collections, or new helper modules. Anything else is a feature and waits.

**Errata lane (strict):** a content-only correction to reference data — wrong text, wrong numbers within existing fields, misimplemented rule effects in `MERITS_DB` / `DEVOTIONS_DB` / `MAN_DB` or equivalent — that updates the *value* of fields without changing their *shape*. New fields, new collections, or schema-shape changes are not errata; those wait. Errata corrections are permitted during freeze under the same review gate as hotfixes. Rationale: rule correctness during a live cycle is non-negotiable, and a misimplemented merit denies a player a result they're entitled to. The schema-shape line is the firewall — fix the value, don't restructure the container.

### Coordination with Peter

Peter finishes whatever work is mid-flight, commits, and merges to `dev` once. From that point his branch holds. Daily-ish async check-in (Discord or commit comments) is sufficient — no ceremony.

### The pre-cycle stabilisation pass

**Constraint: the DT cycle launches 7 May 2026.** The audit, diagnosis, triage, and hotfix work all fit inside the six days from charter acceptance to cycle launch. Sequencing:

1. **Audit (Phase 1)** runs today/tomorrow — half a day of focused walkthrough.
2. **Diagnosis + path-forward report (Phase 2)** drafted Saturday/Sunday and sent to Peter.
3. **Hotfix list triaged with Peter** Sunday, using the audit's findings as input.
4. **Submission-blocker hotfixes ship** Monday through Wednesday.
5. **Cycle launches Thursday 7 May** on stabilised state.

The trade-off: shipping a known-broken submission flow burns trust and creates dirty data the refactor will then have to migrate. Hence: audit and diagnose first, even at compressed pace, so the triage list is informed by what's actually wrong rather than just what's been noticed.

## Phases

### Phase 0 — Freeze declared
- **Starts:** charter accepted by Angelus.
- **Finishes:** `FREEZE.md` posted, Peter notified via Discord, in-flight work on his branch committed.
- **Owner:** Angelus.

### Phase 1 — Audit
- **Starts:** Phase 0 closed.
- **Finishes:** audit deliverable per Part 1 is complete.
- **Owner:** Angelus drives. Peter reviews findings (likely batch review given the timeline below).
- **Timeline:** Half a day to a day of focused work. The codebase is small and the project lead authored most of it; "deep audit" here means a methodical walkthrough, not weeks of forensics.

### Phase 2 — Diagnosis Report drafted and sent to Peter
- **Starts:** audit deliverable complete.
- **Finishes:** post-audit Diagnosis + Path Forward report drafted (separate file, proposed location: `specs/architectural-diagnosis-report.md`); sent to Peter inviting comment; refactor direction ratified after his response. Hotfix list triaged together as part of this phase.
- **Owner:** Angelus drafts; Peter reviews and comments.

### Phase 3 — Refactor execution
- **Starts:** Phase 2 ratified, the 7 May DT cycle has launched.
- **Sub-phases:** sequenced per the post-audit report. Each its own freeze point. (Sub-phase shape is not specified here; it is the post-audit report's job.)
- **Finishes:** each sub-phase exits when its guardrails are in place and the next sub-phase's preconditions are met.
- **Owner:** as defined at Phase 2.

### Phase 4 — Guardrails landed, freeze lifted
- **Entry criteria:** per Resumption Criteria section in Part 3.
- **Finishes:** feature development resumes under new rules.

## Freeze Rules

### The checklist (applies to every proposed merge during freeze)

1. Is this a hotfix or errata correction per the strict definitions? If no, reject.
2. Does it add a schema field, collection, or helper module? If yes, reject.
3. Does it touch the layer currently being refactored in Phase 3? If yes, reject unless coordinated.
4. Has the diff been reviewed by the other developer? If no, hold.
5. Is there a one-line rationale tying it to freeze-permitted work? If no, reject.

### Rollback escape valve

If Phase 1 reveals the refactor is multi-week rather than days:
- **Off-ramp A — Scope cut:** ratify only the highest-leverage refactor target identified by the audit; defer the rest; lift freeze with a narrower guardrail set.
- **Off-ramp B — Parallel track:** keep `main` on current architecture, branch `refactor/*` for long-haul work, lift freeze on `Morningstar` and `Piatra` for non-conflicting features. Decision point: end of Phase 2.

The off-ramp is chosen at Phase 2, not improvised mid-Phase 3.

---

# Part 3 — Scope, Communication, Trust
*Author: John, Product Manager*

## Why We Are Pausing

Feature velocity is a vanity metric when the substrate underneath is drifting. We have been shipping onto a foundation whose contracts are implicit, whose conventions are inferred from the last person who touched the file, and whose data shape disagrees with itself across surfaces. Peter's critique surfaced what was already structurally true: three layers were moving at once — schema, helpers, UI — and any polish applied to the top layer was being undone by motion in the layers below it. You cannot finish a surface that is still being structurally extended.

The actual product is not the Downtime app. The product is **player trust in the suite**. Thirty players are about to have their first sustained, app-mediated interaction with this system. Trust on a tool like this is a one-shot event: the first cycle either feels coherent or it feels brittle, and the second impression is much harder to earn than the first. The DT overhaul backlog, the NPC/edges integration, and the unverified merit-action matrices are not features that improve trust — they are surface area that risks it.

The cost of not pausing is concrete: we ship the imminent cycle on drifting substrate, players experience inconsistencies between sheet and DT and tracker, an ST burns a weekend reconciling state by hand, and Peter's prior diagnosis (the data shape is wrong) gets validated the expensive way. Pausing now is cheaper than pausing later under duress.

Trust is polish, and polish is impossible without scope discipline. That is the spine of this charter.

## Scope of the Freeze

### Paused
- All new feature work across admin, player portal, and game app.
- New schema additions and new collections.
- New UI surfaces and new tabs.
- The 34-story DT overhaul backlog (DTSR, DTIL, and siblings) in its entirety.
- The NPC/edges/relationships DT integration. Feature-flagged off for the imminent cycle. We carry the code; players do not see the surface.
- Phone/mobile optimisation. Desktop-first holds.

### Continues
- Live-cycle-blocker hotfixes per Part 2's gating rules.
- Audit work (Part 1).
- Documentation and convention authoring as it emerges from audit findings.
- Reference data corrections per the errata lane defined in Part 2 (content within existing schemas only).

### Ambiguous edges, ruled explicitly
- A player's sheet breaks during the freeze: **fix it.** That is a hotfix, not a feature.
- A merit action matrix is wrong and a player will be denied a result: **fix it.** Correctness is not a feature.
- An ST asks for a "small" admin convenience: **defer.** No exceptions for ST quality-of-life during freeze.
- A bug is discovered in code being refactored: **fix in the refactor**, not in a parallel patch.

If a thing is not visibly listed above, default-paused, raise it to the group.

## Communication Plan

### Peter
Peter catalysed this charter and is the substantive collaborator on the work that follows. The post-audit Diagnosis + Path Forward report (Phase 2 deliverable) is the artefact specifically inviting his comment; this charter is the orientation. Architecture decisions where Angelus and Peter disagree are recorded as ADRs with both positions; a contested architecture is not shipped.

A specific ask on the diagnosis report: prefer answers that explain over answers that conclude. The audit is also a learning exercise for the project lead, and "this is wrong because X, and the pattern that produces it is Y" is more durable than "fix this." If a conclusion is so obvious it doesn't need explaining, say that too — it's data about where the project lead's mental model needs filling in.

### Third ST
Informed, not consulted at architectural depth. A summary of the freeze, the timeline shape (criteria, not dates), and what changes for them operationally. They are not asked to review audit findings.

### Players
One short message before the imminent cycle. Honest, not effusive. Suggested shape: the app is in a known-rough state for cycle one, the team is doing a structural pass after this cycle to make later cycles feel right, here is what works today and here is what to expect quirks on. No dates promised. Apologise once, then stop. Treat them as adults running a LARP with us, not customers owed an SLA.

## Resumption Criteria

Freeze lifts when **all** of the following are demonstrably true. Not dated. Not partial. The post-audit report may refine these; this list is the principle-level spine.

- **Canonical effective-rating module** exists, is the single read path for any pool, prereq, or rule check, and is proven in production across at least one cycle of use.
- **Schema validation gate** is operational at the API boundary. Writes that violate the contract are rejected at the edge, not absorbed and reconciled later.
- **ADR pattern in use.** Foundational decisions captured; pattern is alive (most recent ADR is recent at freeze-lift, not abandoned after the first two).
- **Drift-prevention guardrails operational.** Specific shape defined post-audit; the principle is: the next drift becomes visible at PR-review time, not at bug time.
- **Audit findings closed-out.** Closed-out means each finding is addressed, deferred with written rationale, or accepted with written rationale. Not "all fixed."

Anything short is freeze-creep dressed as progress. Hold the line.

---

## What follows this charter

This charter scopes the freeze and the audit. It does not commit to a refactor direction. The audit (Phase 1) produces a structured drift map and a derivations matrix. Those feed a post-audit Diagnosis + Path Forward report (Phase 2), drafted in a separate file (proposed: `specs/architectural-diagnosis-report.md`). That report is the document sent to Peter inviting comment. Refactor execution (Phase 3 onwards) is defined in that report, not here.

Open methodology questions held until Phase 2:
- Does the audit treat the documented schema as reference and diff data against it, or treat live data as reference and reconstruct an accurate schema from it?
- What is the appropriate schema-validation library given the project's no-build-step deploy posture?
- How are migration scripts gated against accidental writes to live `tm_suite`?
- How is parity verified between pre- and post-refactor derivation outputs without an existing test framework?
- How is browser/CDN cache invalidation handled when canonical modules ship?
- What is the dependency direction between canonical modules (effective, merits, xp, influence) and how are circular imports prevented?

These are flagged here so the audit phase consciously gathers evidence to answer them, rather than discovering them at report-writing time.

---

*End of charter v0.3.*
