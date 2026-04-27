---
id: dtux.1
epic: dtux
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTUX-1: DT Processing — Phase Ribbon Navigation

As a Storyteller working a downtime cycle in the admin app,
I want a single clickable phase ribbon at the top of the Downtime tab — DT Prep | DT City | DT Projects | DT Story | DT Ready — with a sign-off badge on each phase,
So that I can navigate the cycle non-linearly, see at-a-glance which phases are signed off, and stop hunting for the right "Open next phase" button.

---

## Context

### Origin

User-surfaced during the 2026-04-26 CSS-6 visual verification session. Quote captured in the original proposal stub:

> Right now, there is an "Open City and Feeding Phase". This is actually redundant. In fact, the way the ribboning is done is slightly off. What I would recommend the button switchers between DT City, DT Processing, and DT Story, these should be clickable sections on the Ribbon. So you can click to any stage between DT prep, DT City, DT Projects, and DT Story, DT Ready. Instead of gating, something marks each tab when it's been signed off.

### Current state — three navigation systems coexist

The Downtime admin tab currently runs three independent navigation patterns. The user is asking for them to consolidate into one.

1. **Sub-tab strip** (`#dt-sub-tab-bar` at `public/admin.html:107-111`): three buttons — DT City | DT Processing | DT Story — that swap between the panels `#dt-city-panel`, `#dt-processing-panel`, and `#dt-story-panel`. Click handler at `public/js/admin.js:233`. No completion indicators.
2. **Phase ribbon** (`#dt-phase-ribbon` at `public/admin.html:127`): five-step read-only ribbon — DT Prep | City & Feeding | Downtimes | ST Processing | Push Ready — derived from `cycle.status` (`prep` | `game` | `active` | `closed`). Renders via `renderPhaseRibbon()` at `public/js/admin/downtime-views.js:262-299`. Steps are styled `.pr-step pr-done | pr-active | pr-future` but are **not clickable** — the CSS sets `cursor: default`.
3. **Gate buttons**: explicit transition buttons that move `cycle.status` forward. The visible one in the user's quote is "Open City & Feeding Phase →" rendered inside `renderPrepPanel` at `public/js/admin/downtime-views.js:1444`. Confirms with a dialog and flips `prep → game`. Other transitions exist in db.js: `closeCycle()` (`active → closed`), `openGamePhase()` (`closed → game`).

### What this story consolidates

Replace all three with a **single unified phase ribbon** that:

- Drives panel switching (replaces the sub-tab strip).
- Drives lifecycle progression (replaces the gate buttons; `cycle.status` is auto-derived from sign-off state).
- Shows completion state (replaces the read-only `.pr-done` indicator with an explicit per-phase sign-off badge).

The new ribbon takes over the surface served today by `#dt-phase-ribbon` and `#dt-sub-tab-bar`. The sub-ribbon (`#dt-sub-ribbon`) is **retired** — phase-internal completion checkboxes (Auto-Open Set, Deadline Set, etc.) move into the body of each phase panel as inline status text rather than a separate sub-strip.

### Why now (sequencing)

`memory/project_dt_overhaul_2026-04-27.md` "Adjacent backlog" section flags this:

> If DTUX-1 lands first, Epics 4 and 5 inherit the ribbon and place themselves as ribbon tabs naturally. If the epics land first, DTUX-1 will need to fold their new surfaces into the ribbon. Slightly easier to ship DTUX-1 first, but not blocking either way.

DTIL adds three new admin surfaces (Court Pulse, Action Queue, Territory Pulse) and JDT adds a new ST Processing phase (Joint Projects). If the ribbon ships first they slot in cleanly; if not, every DTIL/JDT story has to spend cycles reopening the spec to declare ribbon placement.

---

## Open product decisions (flagged for resolution at implementation kickoff)

These are the calls that should be locked before code starts. Strawman defaults below; each has a written justification so the dev can proceed if the user accepts the strawman as-is.

### D1 — Phase list: five tabs, in this order

**Strawman:** `DT Prep | DT City | DT Projects | DT Story | DT Ready`

This matches the user's quote verbatim. Mapping to current panels:

| Phase tab | Renders | Cycle status correlation (informational) |
|---|---|---|
| **DT Prep** | Existing `#dt-prep-panel` (early-access toggles, deadline, auto-open) | `cycle.status === 'prep'` |
| **DT City** | Existing `#dt-city-panel` (territory ambience overview) | Available from `'game'` onward |
| **DT Projects** | Existing `#dt-processing-panel` (the full ST Processing UI: Sorcery → Feeding → Ambience → Hide/Protect → Investigate → Projects → Merits) | Most useful at `'closed'`, but reachable any time |
| **DT Story** | Existing `#dt-story-panel` (DT Story tab content) | Most useful at `'closed'`, but reachable any time |
| **DT Ready** | Push Cycle action area (compile + publish) | Reaches "ready" when DT Story is signed off |

**Note on naming:** "DT Projects" is the user's chosen label for what is internally the full ST Processing surface (which today bundles Sorcery, Feeding, Ambience, Hide/Protect, Investigate, Projects, Merits — see `buildProcessingQueue` in `downtime-views.js`). This story does **not** split that surface into separate ribbon tabs; further breakdown is out of scope for v1. If the user later wants Sorcery / Feeding / Projects as their own tabs, that is a follow-up story.

### D2 — Sign-off semantics: manual button per phase

**Strawman:** Each phase has a "Mark phase signed-off" button at the bottom of the phase body. Click sets `cycle.phase_signoff[phase] = { at: <iso>, by: <user_id> }`. Click again to undo (Mark not signed-off).

**Why manual, not auto-rollup:** auto-derivation (e.g. "all submissions resolved → DT Projects auto-signed-off") is a footgun — the ST loses the explicit moment of confirmation. Manual is forgiving and explicit. The phase body can still surface auto-derived hints (e.g. "12 of 12 submissions resolved" next to the sign-off button) so the ST has the data, but the click is theirs.

**Why per-phase, not global:** the ribbon's whole purpose is non-linear navigation; sign-off must be per-phase to match.

### D3 — Free navigation, no warning

**Strawman:** Click any phase tab, regardless of cycle.status. No warning banner if a phase is unsigned. The badge is the indicator.

**Why no warning:** the badge already communicates state. A warning banner duplicates the signal and trains the ST to dismiss without reading.

### D4 — `cycle.status` is auto-derived from sign-off state

**Strawman:** Replace gate-button-driven status flips with auto-derivation:

| `cycle.status` | Derived when |
|---|---|
| `prep` | DT Prep is **not** signed off |
| `game` | DT Prep signed off, DT City **not** signed off |
| `active` | DT City signed off, DT Projects **not** signed off |
| `closed` | DT Projects signed off |

`cycle.status` remains in the schema (existing code in 14+ places reads it; no rip-out). It just becomes a function of `cycle.phase_signoff`. The "Open City & Feeding Phase →" button at `downtime-views.js:1444` is **removed**; its effect now happens implicitly when the ST signs off DT Prep.

**Why keep `cycle.status`:** widespread reads in `loadCycleById` (lines 807-866), `renderSnapshotPanel` (line 713), the `dt-cycle-sel` rendering (line 1369), `db.js` queries (`getActiveCycle`, `getGamePhaseCycle`). Replacing all those with sign-off lookups is a much bigger blast radius than this story should take on.

**Why auto-derive instead of keep both:** if both exist as independent state, they can drift. Single source of truth.

### D5 — DT Ready phase

**Strawman:** "DT Ready" is the final phase tab, and is reached when DT Story is signed off. Renders the existing Push Cycle action area (compile published outcomes, send player report). Sign-off on DT Ready means "cycle is published". After publish, the ribbon is read-only (no further editing).

**Note:** "Push" is currently invoked from elsewhere in the UI (the publishing workflow lives in DT Story, per `epic-dt-story` story 1.14). DTUX-1 surfaces it as a dedicated phase but the publish action handler itself is unchanged.

### D6 — Sub-ribbon retirement

**Strawman:** Remove `#dt-sub-ribbon` and the `getSubPhases()` function. The completion indicators it surfaced (Auto-Open Set, Deadline Set, Submissions Received, Deadline Passed, Reviewing, All Resolved) move inline into each phase body as informational text near the sign-off button. They were never used to gate anything.

---

## Acceptance Criteria

### Render — ribbon structure

**Given** I am viewing the Downtime admin tab with a cycle selected
**Then** a single phase ribbon renders at the top with five tabs in order: `DT Prep | DT City | DT Projects | DT Story | DT Ready`.
**And** each tab shows:
- The phase label (e.g. "DT City").
- A sign-off badge: a checkmark icon (✓) when `cycle.phase_signoff[phase].at` is set, an empty/dim circle when not.
- An "active" visual treatment when this is the currently displayed phase.

**Given** the existing read-only ribbon previously rendered five steps as `.pr-step pr-done | pr-active | pr-future`
**Then** that visual is retired in favour of a clickable tab strip with sign-off badges.

**Given** the existing sub-ribbon (`#dt-sub-ribbon`) previously rendered phase-internal completion badges
**Then** the sub-ribbon is removed entirely; its content (Auto-Open Set, Deadline Set, etc.) appears inline within the relevant phase body.

**Given** the existing sub-tab strip (`#dt-sub-tab-bar`) previously offered three buttons (DT City, DT Processing, DT Story)
**Then** that strip is removed entirely; the new ribbon is the sole switcher.

### Navigation — clickable, free

**Given** I click any phase tab
**Then** the corresponding panel renders and all other panels are hidden.
**And** the clicked tab gets the active visual treatment.
**And** no confirmation dialog appears.
**And** I can navigate freely regardless of cycle.status or sign-off state.

**Given** I click the currently-active tab
**Then** nothing changes (no error, no redundant render).

**Given** I navigate away from the Downtime tab and come back
**Then** the last-viewed phase tab is restored (use a session variable; no need to persist across page reloads in v1).

### Sign-off — manual button per phase

**Given** I am viewing any phase body
**Then** a "Mark phase signed-off" button is visible at the bottom of the phase body.
**And** the button shows current state: "Mark phase signed-off" when not signed off, "✓ Signed-off — undo?" when signed off.

**Given** I click "Mark phase signed-off"
**Then** `cycle.phase_signoff[<phase>]` is set to `{ at: <ISO timestamp>, by: <current user id> }`.
**And** the badge on the corresponding ribbon tab updates to show ✓.
**And** if signing off DT Prep, DT City, or DT Projects causes the derived `cycle.status` to advance, that change is persisted to the cycle document in the same save.

**Given** I click "✓ Signed-off — undo?"
**Then** `cycle.phase_signoff[<phase>]` is removed (or `at` set to null).
**And** the badge updates to dim/empty.
**And** the derived `cycle.status` recalculates and persists if changed.

### `cycle.status` auto-derivation

**Given** the DT Prep sign-off is **not** set
**Then** `cycle.status === 'prep'`.

**Given** DT Prep is signed off but DT City is not
**Then** `cycle.status === 'game'`.

**Given** DT Prep + DT City are signed off but DT Projects is not
**Then** `cycle.status === 'active'`.

**Given** DT Projects is signed off
**Then** `cycle.status === 'closed'`.

**Given** the previously-existing button "Open City & Feeding Phase →" at `downtime-views.js:1444`
**Then** the button is removed from the prep panel.
**And** the prep-panel render (`renderPrepPanel`) no longer wires its click handler.

**Given** the previously-existing `closeCycle()` and `openGamePhase()` calls in db.js
**Then** the `cycle.status` field continues to exist and continues to be writable from those helpers (no schema change), but the sign-off path is the canonical writer for ribbon-driven progression.

### Schema — `phase_signoff` field on cycle

**Given** the cycle document
**Then** a new field `phase_signoff` exists on `downtime_cycle`, shape `{ [phase: string]: { at: ISO string, by: string user_id } }`.
**And** the field is optional — legacy cycles without it render with all phases unsigned.
**And** the schema validator (`server/schemas/downtime_cycle.schema.js` or wherever cycle schema lives) accepts the new field.

### Back-compat — historical cycles

**Given** I open a closed (historical) cycle that pre-dates this story
**Then** the ribbon renders with all five tabs unsigned (no badge).
**And** I can view each phase by clicking its tab.
**And** I can retroactively sign-off phases on the historical cycle if I wish (no read-only restriction on closed cycles).
**And** the cycle's existing `cycle.status === 'closed'` is unaffected by my retroactive sign-off clicks.

### Visual

**Given** the new ribbon renders
**Then** it occupies the same vertical region currently occupied by `#dt-phase-ribbon` + `#dt-sub-tab-bar` (header area of the Downtime tab).
**And** each tab is at least 120px wide (long phase names like "DT Projects" do not truncate).
**And** the active-tab visual reuses the existing `--accent` token (matches `.pr-active` colour).
**And** the badge ✓ uses the existing `--gold2` (`#E0C47A`) accent token.
**And** the unsigned badge is rendered as an empty circle in `--txt3` (subdued).
**And** at narrow viewports (<900px) the ribbon scrolls horizontally rather than wrapping or truncating labels.

### Gate-button removal

**Given** the prep panel previously contained the "Open City & Feeding Phase →" button
**Then** the button is gone.
**And** the `dt-prep-actions` div either is removed or contains only future actions (currently it has only this one button — likely remove the wrapper too).
**And** no other code path attempts to wire `#dt-open-game-phase` (verify by grep).

### `loadCycleById` and rendering

**Given** I select a cycle
**Then** `loadCycleById` runs and renders all five phase panels in their hidden state, with the last-viewed tab visible.
**And** the existing per-status conditional rendering inside `loadCycleById` (the `isPrep / isActive / isGame / isClosed` branches around lines 807-866) continues to work unchanged — `cycle.status` is still authoritative for those branches; only the *path by which it changes* differs.

### Removal of sub-ribbon completion text

**Given** the sub-ribbon previously displayed phase-internal hints (Auto-Open Set, Deadline Set, Ambience Applied, Submissions Received, Deadline Passed, Reviewing, All Resolved)
**Then** each of these hints relocates as plain text near the relevant control inside its phase body. Examples:
- DT Prep panel shows "Auto-open set ✓" or "Auto-open: not set" as a small grey line under the Auto-Open input.
- DT Prep panel shows "Deadline set ✓" or "Deadline: not set" similarly under the Deadline input.
- DT City panel shows "Ambience applied ✓" or "Ambience: not yet applied" near the Apply Ambience button (the button itself is unchanged).
- DT Projects panel shows "12 of 12 submissions resolved" near the sign-off button (auto-derived from review state).

These hints are **informational only**; they do not gate the sign-off button.

---

## Implementation Notes

### Files in scope

- **`public/admin.html`** lines 107-134 — replace `#dt-sub-tab-bar` and `#dt-phase-ribbon` markup with a single `#dt-phase-ribbon-v2` (or rename the existing id). Remove `#dt-sub-ribbon`. Keep `#dt-prep-panel`, `#dt-city-panel`, `#dt-processing-panel`, `#dt-story-panel`. Add a fifth `#dt-ready-panel`.
- **`public/js/admin/downtime-views.js`**:
  - Replace `renderPhaseRibbon` (lines 262-299) with a new `renderPhaseRibbonV2` that renders the five clickable tabs with badges. Read `cycle.phase_signoff` directly.
  - Remove or repurpose `getCyclePhase` (lines 216-224) — it conflated cycle.status with display index. The new ribbon doesn't need a single "current phase" derivation; the active tab is whatever the user clicked.
  - Remove `getSubPhases` (lines 226-260) — sub-ribbon retired. Move each branch's hint text into the corresponding phase body's render code.
  - Modify `renderPrepPanel` (lines 1399-1484) to remove the "Open City & Feeding Phase →" button and the `dt-open-game-phase` click handler. Add inline hints for "Auto-open set / Deadline set" near each input. Add the sign-off button at the bottom.
  - Add a new `renderReadyPanel(cycle, subs)` for the DT Ready tab that surfaces the publish action.
  - Add a `signoffPhase(cycle, phase, signedOff)` helper that updates `cycle.phase_signoff`, derives the new `cycle.status`, and writes both fields via `updateCycle`.
  - Add a `deriveCycleStatus(cycle)` pure helper used by `signoffPhase` to compute `prep | game | active | closed` from `phase_signoff`.
- **`public/js/admin.js`** lines 196 + 233-236 — remove the `dt-sub-tab-btn` click handler (and its initial state setter at line 196). Replace with a wiring that listens on the new ribbon's tab clicks and toggles panel visibility.
- **`public/css/admin-layout.css`** lines 1230-1359 (existing ribbon CSS) and 6340-6360 (sub-tab strip CSS) — collapse into a single set of styles for the new ribbon. The existing `.pr-step` styles can mostly be reused with the addition of `cursor: pointer` and a hover state. The `.pr-connector` arrow styling is optional — can keep or drop.
- **`server/schemas/downtime_cycle.schema.js`** (or wherever the cycle schema is defined) — add `phase_signoff` as an optional object. Verify by `Glob` for schema file location before editing.
- **`server/routes/downtime_cycles.js`** (or wherever the PATCH handler is) — verify `phase_signoff` is accepted in update payloads. Likely no change if `additionalProperties: true` or if explicit fields are listed.

### Key code shapes

```js
// pure helper — no side effects, deterministic
function deriveCycleStatus(cycle) {
  const ps = cycle.phase_signoff || {};
  if (!ps.prep)     return 'prep';
  if (!ps.city)     return 'game';
  if (!ps.projects) return 'active';
  return 'closed';
}

// sign-off mutation — writes both phase_signoff and derived status
async function signoffPhase(cycle, phase, signedOff) {
  const ps = { ...(cycle.phase_signoff || {}) };
  if (signedOff) {
    ps[phase] = { at: new Date().toISOString(), by: currentUserId() };
  } else {
    delete ps[phase];
  }
  const newStatus = deriveCycleStatus({ ...cycle, phase_signoff: ps });
  await updateCycle(cycle._id, { phase_signoff: ps, status: newStatus });
  cycle.phase_signoff = ps;
  cycle.status = newStatus;
}
```

```js
// ribbon render — five tabs, one badge per tab, active tab highlighted
function renderPhaseRibbonV2(cycle, activePhase) {
  const el = document.getElementById('dt-phase-ribbon');
  if (!el) return;
  const phases = [
    { key: 'prep',     label: 'DT Prep' },
    { key: 'city',     label: 'DT City' },
    { key: 'projects', label: 'DT Projects' },
    { key: 'story',    label: 'DT Story' },
    { key: 'ready',    label: 'DT Ready' },
  ];
  const ps = cycle.phase_signoff || {};
  el.style.display = '';
  el.innerHTML = phases.map(p => {
    const signed = !!ps[p.key];
    const active = p.key === activePhase;
    const cls = `pr-tab${active ? ' pr-tab-active' : ''}${signed ? ' pr-tab-signed' : ''}`;
    const badge = signed ? '<span class="pr-tab-badge">✓</span>' : '<span class="pr-tab-badge pr-tab-badge-empty">○</span>';
    return `<button class="${cls}" data-phase="${p.key}">${badge}<span class="pr-tab-label">${p.label}</span></button>`;
  }).join('');
}
```

### Sign-off undo

The undo path (clicking "✓ Signed-off — undo?") will *retract* `cycle.status` (e.g. closed → active). This is the only intentional path that walks status backwards. The ST may need this if they signed off too early — fine. Do not block.

### Phase-panel visibility wiring

Today, `loadCycleById` calls `renderSnapshotPanel`, `renderPhaseRibbon`, `renderPrepPanel` — and the city/processing/story panels are rendered by their own per-tab handlers when the sub-tab is clicked. After this story:

- All five phase panels render lazily on first tab click (no preemptive render).
- The ribbon's tab click is the sole gateway: `el.addEventListener('click', e => { const phase = e.target.closest('[data-phase]')?.dataset.phase; if (phase) showPhase(phase); })`.
- `showPhase(phase)` hides all five panels, shows the one for `phase`, calls its render function if not already rendered, and updates the ribbon's active tab.

### `cycle.status` writes to remove

Two existing call sites flip `cycle.status` directly: `handleOpenGamePhase` at line 1495 (closed → game, used in dev-fixture flow only?) and the inline write at line 1479 (prep → game, the gate button). The inline write goes away with the gate button. `handleOpenGamePhase` should be reviewed at implementation — it appears to be a re-open path; keep if still used, remove if dead.

### `closeCycle` and the "Close Cycle" button

The toolbar still has a `#dt-close-cycle` button (admin.html:116, wired at downtime-views.js:312). This button currently calls `closeCycle(id)` which writes `status: 'closed', closed_at: now`. Decision: **keep** the button as a manual override / safety hatch (e.g. for closing a cycle that the ST never signed-off DT Projects on). Document that the canonical path is sign-off-driven, but the manual close stays as a fallback. No changes to the button itself.

### Visual reuse

The existing `.pr-step / .pr-step-num / .pr-done / .pr-active / .pr-future` styles at `admin-layout.css:1257-1305` can largely transfer. The connector arrows (`.pr-connector` lines 1308-1328) are decorative and can drop in v1; they assume strict left-to-right progression which conflicts with free navigation. Replace with simple gaps between tabs.

### Strawman wording

- Sign-off button (unsigned state): **"Mark phase signed-off"**
- Sign-off button (signed state): **"✓ Signed-off — undo?"**
- Empty badge: **U+25CB** (white circle ○)
- Filled badge: **U+2713** (check mark ✓)

These are starting points; tune at implementation if visual review suggests better.

### British English

Verify all new strings: "signed-off" (hyphenated, British), "Cycle published", no em-dashes, no US spellings.

---

## Files Expected to Change

- `public/admin.html` — replace ribbon + sub-tab bar markup; add `#dt-ready-panel`; remove `#dt-sub-ribbon`.
- `public/js/admin/downtime-views.js` — replace `renderPhaseRibbon`, remove `getCyclePhase` + `getSubPhases`, modify `renderPrepPanel` (remove gate button, add inline hints, add sign-off button), add `renderReadyPanel`, add `signoffPhase` + `deriveCycleStatus` helpers, add `showPhase` panel-visibility router.
- `public/js/admin.js` — remove `dt-sub-tab-btn` handler block; wire ribbon click delegation if not handled inside downtime-views.js.
- `public/css/admin-layout.css` — collapse ribbon CSS at lines 1230-1359 and sub-tab CSS at 6340-6360 into a single new ribbon style block. Add `.pr-tab`, `.pr-tab-active`, `.pr-tab-signed`, `.pr-tab-badge` styles.
- `server/schemas/downtime_cycle.schema.js` (verify exact filename via `Glob server/schemas/downtime*`) — add optional `phase_signoff` field shape.
- `server/routes/downtime_cycles.js` (verify) — confirm PATCH accepts `phase_signoff`.

---

## Definition of Done

- All AC verified manually.
- Manual smoke test against a cycle in each lifecycle stage:
  - Prep cycle: ribbon shows DT Prep active, all unsigned. Click each tab — switches panel. Sign-off DT Prep → status flips to `game`.
  - Game cycle: status auto-derived correctly given current sign-off state. Removing DT Prep sign-off rolls status back to `prep`.
  - Closed cycle: all phases pre-existing (no `phase_signoff` field) render unsigned; can retroactively sign each off without affecting the existing `closed` status.
- "Open City & Feeding Phase →" button is gone; no orphan references in JS or CSS.
- Sub-ribbon (`#dt-sub-ribbon`) is removed; no orphan references.
- Sub-tab strip (`#dt-sub-tab-bar`) is removed; no orphan references in JS or CSS.
- All existing per-status conditional rendering inside `loadCycleById` continues to work (no regressions to snapshot panel, deadline display, ambience apply button, close button visibility).
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtux-1-phase-ribbon-nav: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

### Upstream

None. This story is independent of every NPCP / CHM / DTSR / DTFP / DTIL / JDT story.

### Downstream — what benefits if DTUX-1 ships first

- **DTIL-1 (Court Pulse synthesis)**, **DTIL-2 (Action Queue triage)**, **DTIL-4 (Territory Pulse synthesis)**: these add new ST-facing surfaces. If the ribbon exists, the stories can declare which phase tab they live under (likely DT Projects or a future DT Intelligence tab). Without the ribbon, they each have to negotiate placement in the existing sub-tab structure.
- **JDT-5 (ST Processing Joint Projects phase)**: introduces a new processing sub-phase. With the new ribbon, the story can either nest under DT Projects or claim its own ribbon tab. Without it, the sub-phase logic is bolted onto the existing processing surface with no clear nav.
- **DTSR-1 (section reorder + Rumours rename)**, **DTSR-9 (ST flag inbox)**: live in the DT Story tab. Unaffected by the ribbon change other than the tab moves from a sub-tab button to a ribbon tab — purely cosmetic for these stories.

### Sequencing recommendation

Land DTUX-1 **before** any DTIL or JDT story. Land it in **parallel** with NPCP / CHM / DTSR / DTFP without conflict.

### What this story does NOT do (deliberate scope guards)

- Does **not** introduce a sub-phase ribbon for inside DT Projects (Sorcery / Feeding / Projects-proper / Merits as separate ribbon tabs). The user's quote names "DT Projects" as one tab; further sub-division is a follow-up if requested.
- Does **not** add cross-cycle persistence (e.g. "DT Projects sign-off in cycle N tells cycle N+1 something"). Sign-off is per-cycle.
- Does **not** restrict navigation based on sign-off state. All tabs are always reachable.
- Does **not** redesign the publish action itself. DT Ready surfaces the existing publish button; the publish handler is unchanged.
- Does **not** rip out `cycle.status` or rewrite the 14+ existing reads of it. Status remains an authoritative field; sign-off just becomes the canonical writer.

---

## References

- Original proposal stub: this same file (pre-create-story) captured 2026-04-26 during CSS-6 visual verification.
- `memory/project_dt_overhaul_2026-04-27.md` "Adjacent backlog" section — sequencing rationale vs DTIL/JDT.
- `memory/reference_downtime_system.md` — full cycle lifecycle and current ST processing flow.
- `memory/project_downtime_ui_harmonise.md` — broader UI harmonisation context (CSS-6 through CSS-10).
- `specs/audits/downtime-ui-audit-2026-04-26.md` — panel chrome inventory; this story changes the *navigation model* and is orthogonal to that audit.
- Code references: `public/admin.html:107-134`, `public/js/admin/downtime-views.js:214-299, 1399-1504`, `public/js/admin.js:196, 233`, `public/css/admin-layout.css:1230-1359, 6340-6360`.
