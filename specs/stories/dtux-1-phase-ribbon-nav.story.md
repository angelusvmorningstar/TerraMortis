# Story DTUX-1: DT Processing — Phase Ribbon Navigation

Status: backlog (proposal stub — needs full create-story pass)

## Story

As an ST processing a downtime cycle,
I want a clickable phase ribbon at the top of the Downtimes tab that lets me jump freely between DT Prep, DT City, DT Projects, DT Story, and DT Ready (with a sign-off badge on each phase),
so that I can navigate the cycle non-linearly and see at-a-glance which phases are signed off, instead of being forced through sequential gate-buttons like "Open City and Feeding Phase".

## Background (raw, captured 2026-04-26)

User-surfaced during CSS-6 visual verification. Quote:

> Right now, there is an "Open City and Feeding Phase". This is actually redundant. In fact, the way the ribboning is done is slightly off. What I would recommend the button switchers between DT City, DT Processing, and DT Story, these should be clickable sections on the Ribbon. So you can click to any stage between DT prep, DT City, DT Projects, and DT Story, DT Ready. Instead of gating, something marks each tab when it's been signed off.

The current DT processing UI (per memory `reference_downtime_system` and audit work) progresses the cycle through phases via sequential action buttons: feeding open → pre-game sign-in → game → regency confirm → DT open → DT close → ST processing → push cycle. Sub-phases inside the processing step (Sorcery, Feeding, Projects, Merits, Story, etc.) accumulated organically over the various DT epics.

The proposal is to:
1. Replace gate-style "open next phase" buttons with a persistent **phase ribbon** (tab strip) at the top of the Downtimes tab.
2. Tabs: **DT Prep | DT City | DT Projects | DT Story | DT Ready** (exact list TBD — verify against current phase taxonomy during the create-story pass).
3. Allow free navigation — click any tab to jump there regardless of current cycle state.
4. Each tab carries a **sign-off badge** indicating completion status (a tick / coloured dot / similar visual mark). Sign-off is informational rather than restrictive.

## What this story is NOT

- Not part of the CSS panel-chrome harmonisation series (CSS-6 through CSS-10). Those are pure CSS refactors of existing rendered panels. This story changes the **navigation model** of the Downtimes tab — JS + CSS + likely a small persistence model for the sign-off state.
- Not a removal of the existing phase sequencing logic. The cycle still has phases; only the navigation gate is being changed. Sign-off persistence may need a new field (e.g., `cycle.phase_signoff: { prep: true, city: false, ... }`) on the cycle document.

## Open questions to resolve in create-story

1. **Exact phase list.** What are the canonical phases? "DT Prep, DT City, DT Projects, DT Story, DT Ready" sounds right but needs cross-check against current `cycle.status` enum and the actual ST workflow.
2. **Sign-off semantics.** Who marks a phase signed off — automatic when all rows in that phase are validated, manual via an explicit "Mark phase complete" button, or both? Per memory `reference_downtime_system`, there's already a per-action review pattern (`response_status: draft|reviewed`); the phase ribbon could roll those up.
3. **Free-navigation vs warning state.** If a user jumps to "DT Story" while "DT Projects" is unsigned, do they get a warning banner? A visual hint? Or just trust the ST?
4. **Existing buttons.** "Open City and Feeding Phase" and similar gate-buttons — do they get removed entirely, or kept as quick-action shortcuts within the ribbon tabs?
5. **Coordination with existing tabs.** The admin app already has top-level tabs (Player, City, Downtime, etc.). Is this DT-internal phase ribbon a sub-tab strip inside the Downtime tab, or a different widget shape?

## Suggested next step

Run `/bmad-create-story` (or the create-story skill directly) against this stub to produce a fully-contexted story spec when ready to schedule. Audit may not be needed — the navigation model is straightforward — but the create-story pass should at minimum:
- Enumerate the current gate buttons and their handlers in `public/js/admin/downtime-views.js`
- Identify the cycle status enum and whether a new `phase_signoff` model is needed
- Capture the desired ribbon visual chrome (likely matches CSS-7's outer-panel + loud-header pattern when CSS-7 ships)

## References

- Source quote: this conversation, 2026-04-26 (CSS-6 visual verification session)
- Memory: `reference_downtime_system` — full cycle lifecycle and current ST processing flow
- Memory: `project_downtime_ui_harmonise` — broader UI harmonisation context (this stub is a discovery from that work)
- Related: `specs/audits/downtime-ui-audit-2026-04-26.md` — panel chrome audit (this story is navigation, not chrome)
