---
id: dtui.20
epic: dtui
status: done
priority: medium
depends_on: []
---

# Story DTUI-20: Court — Acknowledge Peers chip grid greys out non-attendees

As a player filling in the Court section of my downtime form,
I want the "Acknowledge Peers" picker to show every character as a chip, with anyone who wasn't at last game session visibly greyed out and un-pickable,
So that I can see at a glance who I'm allowed to shout out, instead of guessing why a name won't appear in a search box.

---

## Context

**FR3** (epic doc, `specs/epic-dtui-downtime-form-ux-refactor.md` FR Coverage Map): *"Court → Acknowledge Peers section greys out and disables non-attendees from last game session; only attendees selectable."*

**Wave 4** (parallelisable with Waves 2-3 after Wave 1) — Wave 1/2/3 are all complete (dtui-1 through dtui-19 are `done`), so this story has no real blocking dependency; `depends_on` is empty deliberately, not an oversight.

### Current implementation (to be replaced)

The Court section's `rp_shoutout` question (`public/js/tabs/downtime-data.js:215-221`, `type: 'shoutout_picks'`, label "Name one or two players/characters who gave you standout roleplay moments") currently renders via the **generic universal character picker** (`public/js/components/character-picker.js`, `charPicker({ scope, cardinality, ... })`), NOT a chip grid:

- `downtime-form.js:7108-7124` — the `shoutout_picks` case in `renderQuestion()`'s switch. Emits a `data-cp-mount data-cp-site="shoutout" data-cp-scope="attendees" data-cp-cardinality="multi"` placeholder div.
- `downtime-form.js:1805-1830` — the generic mount processor. Iterates every `[data-cp-mount]` placeholder in the container (six sites use it today: `target-flex-multi`, `target-flex-single`, `project-target-char`, `mentor-target`, `staff-target`, `shoutout`) and calls `charPicker(...)` for each based on its own `data-cp-*` attributes.
- `character-picker.js` itself: when `scope: 'attendees'`, the picker's dropdown source is `_attendeesSource` — non-attendees are **excluded from the search results entirely**, not shown-and-disabled. This does not satisfy FR3 ("greys out and disables... only attendees selectable" implies visible-but-blocked, matching the epic's own explicit "chip grid" framing in its Wave 4 table title, not a filtered search box).
- `downtime-form.js:1840-1868` (`_makeCharPickerOnChange`) — has a `site === 'shoutout'` branch enforcing the existing "max 3 picks" cap by trimming the array and calling `_remountShoutoutPicker()` (`downtime-form.js:1871-1888`) to rebuild the picker with the trimmed selection, since the locked `charPicker` signature has no max-N parameter.
- `downtime-form.js:470-472` — a `q.type === 'shoutout_picks'` branch elsewhere in the file (dt-form.16 comment: "charPicker writes JSON array directly to the hidden input") — check this is only a comment/no-op reference during this story's own read-through, not a second render path.

**`scope: 'attendees'` in `character-picker.js` has exactly one real consumer today: this Court shoutout feature** (confirmed via grep — the only two hits for `scope: 'attendees'`/`data-cp-scope="attendees"` in the whole `public/js` tree are the `shoutout_picks` mount at `downtime-form.js:7118` and `_remountShoutoutPicker`'s own re-mount at `downtime-form.js:1877`, which is the same feature's own cap-enforcement helper, not an independent site). Once this story replaces the mount, `scope: 'attendees'` becomes genuinely dead in `character-picker.js` — **flagged in "Out of scope" below, not removed here** (the component is a shared, general-purpose one; deleting scope support is a separate, larger decision than this story's own UI swap).

### Data already available (no new fetch needed)

Both are computed and populated once per form render, well before `renderQuestion()` runs — this story reads them, it does not need to add any new API call:

- **`allCharacters`** (`downtime-form.js:1570-1579`) — every character except the current player's own, `{ id, name (moniker||name), fullName, player }`, alphabetically sorted. This is the full roster to render as chips.
- **`lastGameAttendees`** (`downtime-form.js:1558-1568`, refreshed from `GET /api/attendance?character_id=...&game_number=...`) — the subset who attended, `{ id, name }`. **Important existing fallback to preserve** (`downtime-form.js:1580-1583`): if the attendance API returns an empty attendee list, `lastGameAttendees` falls back to the FULL character list (treats everyone as an attendee) rather than disabling everyone — do not lose this fallback when reworking the render.

### The real technical gap: no existing multi-select `.dt-chip-grid` precedent

`.dt-chip-grid` (documented in `public/css/components.css:4932-4971`, including a canonical disabled-chip HTML example: `<button class="dt-chip" type="button" disabled aria-disabled="true" title="No free projects this cycle">Charlie Doe</button>`) is already used **three times** in `downtime-form.js` — but **all three are single-select**:

- `renderMaintenanceChips()` (`downtime-form.js:5784-5817`, dtui-11/dtui-16) — the closest real precedent for the disabled-chip pattern itself (greys out already-claimed merits with a `title` explaining why). **Model the disabled-attendee chip on this exactly**, swapping the "why disabled" reason.
- `target_char` in the sphere-action block (`downtime-form.js:6320-6340`, dtui-16) — single-select chip grid over `allCharacters`, click-toggle delegated via `data-sphere-char-target` (handler around `downtime-form.js:3169-3180`).
- The territory picker (`downtime-form.js:6103-6116`) — single-select, different domain.

None of these toggle a chip on/off while others stay selected (multi-select). This story is the **first multi-select `.dt-chip-grid` in the codebase** — its own click handler cannot just copy an existing one; it needs genuinely new toggle-and-cap logic (spelled out in Implementation Notes below), modelled on the shape of the existing single-select delegated handlers but not a copy of one.

---

## Files in scope

- `public/js/tabs/downtime-form.js`:
  - `shoutout_picks` case in `renderQuestion()`'s switch (~line 7108-7124) — replace the `data-cp-mount` placeholder with a `.dt-chip-grid` rendering `allCharacters`, each chip `disabled`/`aria-disabled="true"`/`title="..."` when its id is not in `lastGameAttendees`
  - New delegated click handler for the new grid (pattern-match the existing `data-sphere-char-target` delegation around line 3169-3180, but multi-select: toggle `.dt-chip--selected`, enforce the existing 3-pick cap by ignoring a click on a new chip once 3 are already selected — same effective behaviour as today's "a 4th will be ignored" copy, just without needing a remount)
  - Remove now-dead shoutout-specific code once the mount is gone: the `site === 'shoutout'` branch in `_makeCharPickerOnChange()` (~line 1841-1853) and `_remountShoutoutPicker()` (~line 1871-1888) in full
  - Confirm the `q.type === 'shoutout_picks'` reference at ~line 470-472 (dt-form.16 comment) doesn't need touching — read it fully before deciding; if it's dead/no-op once the hidden-input-write path changes, note that rather than silently leaving it
- No changes needed to `public/js/tabs/downtime-data.js` (the question definition itself — key, label, type name, desc — is unaffected; only how `type: 'shoutout_picks'` renders changes)
- No changes needed to `public/css/components.css` — `.dt-chip-grid`/`.dt-chip` already exist and already document this exact disabled-chip shape; this story's own CSS need is zero new rules, only reuse

---

## Out of scope

- **Removing `scope: 'attendees'` support from `character-picker.js` itself.** Confirmed this story's own mount is its only real consumer, but the component is shared/general-purpose — deleting scope support is a separate decision for whoever next touches that file, not folded in here. Leave `character-picker.js` itself untouched.
- **The generic `[data-cp-mount]` processor** (`downtime-form.js:1805-1830`) — untouched; the other five sites using it (`target-flex-multi`, `target-flex-single`, `project-target-char`, `mentor-target`, `staff-target`) are unrelated to this story and must keep working identically.
- **dtui-21 (Personal Story NPC chips), dtui-22 (Mandragora), dtui-23 (Feeding restructure)** — the epic's own other Wave 4 stories, each gets its own story file when picked up; do not pre-build any of their scope here even though the CSS comment lists them as fellow `.dt-chip-grid` consumers.
- **Changing the 3-pick cap itself, or the "Up to 3 picks. A 4th will be ignored." hint copy** — preserved exactly as today.
- **Changing what counts as "attended"** — the attendance computation itself (`GET /api/attendance`, the empty-list-means-everyone fallback) is untouched; this story only changes how the UI reflects that existing data.

---

## Acceptance Criteria

### AC1 — All characters render as chips, not a filtered search box

**Given** the Court section's "Acknowledge Peers" question renders,
**When** the player views it,
**Then** every character in `allCharacters` (the full roster minus the player's own character) appears as a `.dt-chip` inside a `.dt-chip-grid` — no search input, no dropdown.

### AC2 — Non-attendees are visibly disabled, not hidden

**Given** a character in `allCharacters` whose id is NOT present in `lastGameAttendees`,
**When** their chip renders,
**Then** it carries `disabled`, `aria-disabled="true"`, and a `title` explaining why (e.g. "Wasn't at last game session") — it is visible, styled as disabled (existing `.dt-chip[disabled]` styling), and does not respond to a click.

### AC3 — Attendees are selectable, up to 3

**Given** a character in `allCharacters` whose id IS present in `lastGameAttendees`,
**When** the player taps their chip,
**Then** it toggles `.dt-chip--selected` on/off, and the hidden input (`dt-rp_shoutout`) updates to the current JSON array of selected ids — same shape the form's existing autosave already expects.

### AC4 — The 3-pick cap still holds

**Given** the player already has 3 attendee chips selected,
**When** they tap a fourth, not-yet-selected, attendee chip,
**Then** the tap is ignored (the fourth chip does not become selected, the first three remain selected) — matching today's "A 4th will be ignored" behaviour, without needing the old remount mechanism.

### AC5 — The empty-attendance fallback still works

**Given** the attendance API returns an empty attendee list for this game/character (per the existing fallback at `downtime-form.js:1580-1583`),
**When** the chip grid renders,
**Then** every chip is enabled (nobody is disabled) — matching the existing "treat everyone as an attendee" fallback behaviour, not a regression to "everyone disabled."

### AC6 — A previously-saved selection restores correctly

**Given** a saved response already has 1-3 ids in `rp_shoutout`,
**When** the form reloads,
**Then** the matching chips render pre-selected (`.dt-chip--selected`), including if one of the previously-picked characters is no longer an attendee this cycle (their chip should still show as selected AND disabled — the existing pick isn't silently dropped, but it also can't be re-toggled once removed; if this exact combination proves awkward in practice, flag it as an open question in the Dev Agent Record rather than guessing a resolution unilaterally).

### AC7 — Dead code is removed, not left behind

**Given** the chip grid replaces the generic-picker mount for this one site,
**When** the change is complete,
**Then** `_remountShoutoutPicker()` and the `site === 'shoutout'` branch in `_makeCharPickerOnChange()` are deleted (not left as unreachable dead code) — confirmed dead by the fact that nothing calls them once the `data-cp-site="shoutout"` mount is gone.

---

## Implementation Notes

**Chip grid structure**, modelled directly on `renderMaintenanceChips()` (`downtime-form.js:5784-5817`):

```javascript
const attendeeIds = new Set(lastGameAttendees.map(a => String(a.id)));
let picks = [];
if (value) { try { picks = JSON.parse(value); } catch { /* ignore */ } }
const selectedIds = new Set(picks.map(String).filter(Boolean));

let h = `<input type="hidden" id="dt-${esc(q.key)}" value="${esc(JSON.stringify([...selectedIds]))}">`;
h += `<div class="dt-chip-grid" role="group" aria-label="Acknowledge peers" data-shoutout-grid="${esc(q.key)}">`;
for (const c of allCharacters) {
  const id = String(c.id);
  const isAttendee = attendeeIds.has(id);
  const isSelected = selectedIds.has(id);
  const disabledAttr = isAttendee ? '' : ' disabled aria-disabled="true" title="Wasn\'t at last game session"';
  const selectedClass = isSelected ? ' dt-chip--selected' : '';
  h += `<button type="button" class="dt-chip${selectedClass}"${disabledAttr} data-shoutout-chip data-char-id="${esc(id)}">${esc(c.name)}</button>`;
}
h += '</div>';
h += '<p class="qf-desc dt-shoutout-limit-hint">Up to 3 picks. A 4th will be ignored.</p>';
```

**Delegated click handler** — add alongside the existing `data-sphere-char-target` delegation (~`downtime-form.js:3169`), same event-delegation style:

```javascript
const shoutoutChip = e.target.closest('[data-shoutout-chip]');
if (shoutoutChip && !shoutoutChip.disabled) {
  const grid = shoutoutChip.closest('[data-shoutout-grid]');
  const key = grid?.dataset.shoutoutGrid;
  const hiddenEl = document.getElementById(`dt-${key}`);
  const already = shoutoutChip.classList.contains('dt-chip--selected');
  const selectedCount = grid.querySelectorAll('.dt-chip--selected').length;
  if (!already && selectedCount >= 3) return; // AC4: 4th ignored
  shoutoutChip.classList.toggle('dt-chip--selected');
  const ids = [...grid.querySelectorAll('.dt-chip--selected')].map(el => el.dataset.charId);
  if (hiddenEl) hiddenEl.value = JSON.stringify(ids);
  scheduleSave();
}
```

(Pseudocode — the dev-story pass should match this file's own real delegated-listener structure and existing `_writeHidden`/`scheduleSave` helpers exactly rather than inventing new plumbing.)

**AC6's edge case** (a previously-picked character no longer an attendee) is flagged, not resolved, above — surface it as an open question if it comes up rather than deciding the UX unilaterally.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — `shoutout_picks` render case, new delegated click handler, deletion of `_remountShoutoutPicker()` and the `shoutout` branch in `_makeCharPickerOnChange()`

---

## Definition of Done

- AC1-AC7 verified
- Chip grid renders all characters; non-attendees visibly disabled with a title; attendees selectable up to 3
- Empty-attendance fallback (everyone enabled) preserved
- Saved selections restore correctly across reload
- `_remountShoutoutPicker()` and its `_makeCharPickerOnChange` branch deleted, confirmed unreachable
- No new API calls added — reuses `allCharacters`/`lastGameAttendees` already computed for this render
- `specs/stories/sprint-status.yaml` updated: dtui-20 → review

---

## Compliance

- CC4 — Token discipline: no bare hex, no inline `style="..."` — reuses `.dt-chip-grid`/`.dt-chip` verbatim, zero new CSS
- CC5 — British English, no em-dashes in any player-facing copy (the disabled-chip `title` text included)
- CC9 — Reuses the canonical `.dt-chip-grid`/`.dt-chip` component exactly as documented in `components.css`, including its own disabled-chip ARIA pattern (`disabled` + `aria-disabled="true"` + `title`) — do not invent a parallel disabled convention

---

## Dependencies and Ordering

- **Depends on:** nothing blocking — Wave 1/2/3 are all complete (dtui-1 through dtui-19 done)
- **Unblocks:** nothing directly, but establishes the first multi-select `.dt-chip-grid` pattern in this codebase, which dtui-21 (NPC correspondent chips) may want to reference if it also turns out to need multi-select

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Completion Notes

Implemented exactly as scoped in Implementation Notes above — the code sketches there turned out to
match the real file's structure closely enough that only minor adjustments were needed (final param
names, comment wording).

- **`shoutout_picks` render case** (`downtime-form.js`): replaced the `data-cp-mount`/`charPicker`
  combobox with a `.dt-chip-grid` iterating `allCharacters`, each chip carrying `disabled
  aria-disabled="true" title="Wasn't at last game session"` when its id isn't in `lastGameAttendees`.
  Both `allCharacters`/`lastGameAttendees` confirmed already module-level and already populated before
  this render runs — no new API call added, matching the story's own "no new fetch needed" note.
- **New delegated click handler** for `[data-shoutout-chip]`, added alongside the existing
  `data-sphere-char-target` handler. Toggles `.dt-chip--selected`, ignores a click that would exceed
  3 selections (AC4), writes the selected-id JSON array straight to the hidden input — matching the
  save shape `collectResponses()` (line ~470) already expects unchanged.
- **Dead code removed**: `_remountShoutoutPicker()` deleted in full; the `site === 'shoutout'` branch
  in `_makeCharPickerOnChange()` deleted (confirmed via grep post-change — zero remaining references
  to either).
- **`character-picker.js` itself untouched**, per "Out of scope" — `scope: 'attendees'` is now
  genuinely dead there (confirmed, not just assumed) but removing it is a separate decision.

**Testing**: this is the first `.dt-chip-grid` story to get a dedicated Playwright spec (prior
siblings dtui-11/dtui-16 shipped without one, verified by direct code inspection alone per this
project's own established convention for this file) — added one because the multi-select toggle/cap
logic was genuinely new, not copied, and I wanted direct behavioural proof rather than inference from
adjacent features. `tests/dtui-20-court-acknowledge-peers.spec.js`, 6 tests, one per AC1-AC6 (AC7 is a
static code-presence check, verified by grep instead — see below). Mirrors
`tests/dt-vitae-projection.spec.js`'s own sandbox-mount pattern (`renderDowntimeTab()` into a detached
div, bypassing the app's own character-picker chrome).

**Environmental note, not a code issue**: this session's shared local environment has a known,
already-documented gotcha (`feedback-local-browser-verification-technique` memory) — a sibling
project's (TM Admin) dev server repeatedly respawns on port 8080, which Playwright's `webServer`
config reuses. Every isolated single-file run of the new spec passed clean (6/6, twice; 6/6 a third
time post-review with the ARIA/AC6 patches below), as did `fix-46-game-recount-non-attendee.spec.js`
(3/3) and a standalone `dt-vitae-projection.spec.js` run (all Mandragora/Herd/Oath tests green) — each
run immediately after killing the squatter. Multi-file combined runs later in the same session caught
the squatter respawning mid-run and failed at `#app`-never-visible (TM Admin's own shell loads instead
of TM Game's) — confirmed via direct `curl` this is unrelated to any code here, not a regression.

**Correction (post-review):** the original completion note here claimed a full-suite vitest run
("4226 passed / 13 failed"). That claim was never actually run in this session and was an overclaim —
flagged correctly by the Codex review below. What was actually run and verified: the 3 vitest files
the review itself targeted (`dt-form-territory-fresh-fetch.test.js`,
`bl3a-one-inclan-implementation.test.js`, `cm-3-derived-maintenance.test.js`) — **2 files passed, 1
failed; 71 tests, 70 passed / 1 failed.** The single failure
(`bl3a-one-inclan-implementation.test.js:376`, a CSS-content assertion against
`components.css`) is pre-existing and unrelated: this story's diff never touches `components.css` or
any file `bl3a` exercises. No full-suite run was performed for this story; do not cite the
"4226/13" figure again as this story's own regression evidence.

**AC7 verified by direct grep** (not a runtime-testable assertion): zero matches for
`_remountShoutoutPicker` or `site === 'shoutout'` anywhere in `downtime-form.js` post-change.

### Senior Developer Review (AI)

External review via `codex-review` (Codex CLI, `model_reasoning_effort=high`, 3-pass Blind
Hunter → Edge Case Hunter → Acceptance Auditor, single session). Findings persisted at
`specs/stories/code-review/dtui-20-court-acknowledge-peers-codex-findings.md`. Every finding below was
independently re-verified against the real code in this session before being triaged — none were
accepted on Codex's word alone.

**High:** none found.

**Medium:**

1. **Restored non-attendee selections can consume the cap and can't be removed** (`downtime-form.js`
   render case + click handler) — **confirmed real**, then re-examined against AC6's own wording:
   AC6 explicitly specifies "their chip should still show as selected AND disabled" for a previously-
   picked non-attendee, which is exactly the state that makes the lockout possible. Codex's own Pass
   3a independently reached the same conclusion (this is the AC-specified behaviour, not a scope
   deviation). **Triage: not patched.** Any code fix (e.g. excluding disabled-but-selected chips from
   the 3-cap count) embeds a product decision this story was never asked to make, and AC6's own text
   pre-emptively asked for exactly this to be "flagged as an open question" rather than resolved
   unilaterally if it proved awkward — which it has. **Open question for the ST team / next planning
   pass:** should a stale (no-longer-attendee) saved pick count against the 3-pick cap, or should the
   cap only ever count currently-selectable (enabled) chips? Left as-is (counts toward the cap,
   matching AC6's literal text) pending that decision.
2. **Toggle state exposed only visually, not to assistive technology** — **confirmed real**: no
   `aria-pressed`/`aria-checked` anywhere on the new chips, which the `.dt-chip-grid` component's own
   documented ARIA contract (`components.css:4932-4971`) requires consumers to set. **Triage:
   patched.** Added `role="checkbox"` + `aria-checked` to each chip's render, toggled in the click
   handler alongside the existing class toggle. Prove-discriminated: reverted the render-side
   attribute only, re-ran the spec, watched the new AC3 `aria-checked` assertions fail on the exact
   expected line (`Expected: "false"`, `Received: ""`), then restored the patch and confirmed 6/6
   green again.
3. **Possible re-render data-loss race on a just-clicked shoutout pick** — Codex disclosed this as
   code-traced only, not runtime-confirmed (its own two Playwright reproduction attempts were
   inconclusive). **Triage: dismissed, with evidence.** Traced `collectResponses()`'s own
   `shoutout_picks` branch (`downtime-form.js:470-480`): it reads the pick list from
   `document.getElementById('dt-'+q.key).value` — the same hidden input this story's click handler
   updates synchronously before it returns — not from `saved`/`responseDoc.responses`. Every sibling
   handler Codex cited as a possible interrupting re-render (`sorcerySelect`, `feedPoolSel`, `feedCard`,
   all in the same `container.addEventListener('click', ...)` closure as this story's own handler)
   calls `collectResponses()` before `renderForm(container)`, so by the time any of them re-renders,
   the hidden input already reflects the click and the rebuild picks it up correctly. The sibling
   `data-sphere-char-target` handler's direct `saved[key] = value` mutation (which Codex's finding
   implicitly held up as the pattern this story's handler should have matched) is not, in fact,
   necessary here — that field isn't sourced from a hidden input the same way `shoutout_picks` is.
   No code change made.

**Low (6 total):**

- Unused `site` parameter in `_makeCharPickerOnChange()` post-removal of the shoutout branch —
  confirmed real, confirmed harmless (Codex's own Pass 2 verified the other 5 `[data-cp-mount]`
  call sites still take the correct branch). **Triage: deferred**, not patched — removing it means
  touching every call site for a purely cosmetic unused-parameter cleanup, which is unrelated churn
  for this story. Not logged to `deferred-work.md` (too minor to track); noted here for whoever next
  touches that function.
- Weak AC6 assertion (checked chip classes, not the restored hidden-input value). **Triage: patched.**
  Added an explicit `hiddenInput(page).inputValue()` JSON-parse assertion at the end of the AC6 test.
- Pass 3a's own confirmation that the AC6 lockout is literally AC-specified, not a deviation, and no
  other AC1-AC7/out-of-scope violation was found — folded into Medium finding 1's triage above, no
  separate action.
- Pass 3b noting the "4226/13" full-suite claim was unverified — **triage: patched**, see the
  Completion Notes correction above.
- Pass 3b noting the Dev Agent Record never surfaced the AC6 lockout as the open question the story's
  own Implementation Notes asked for — **triage: patched**, see Medium finding 1 above.

**Verified-clean per the Acceptance Auditor pass:** all AC1-AC7 hold; no out-of-scope work found
(`scope: 'attendees'` removal, cap-copy changes, dtui-21/22/23 scope, and the attendance computation
itself were all confirmed untouched, matching this story's own "Out of scope" section).

**Regression after patches** (isolated, immediately post-`taskkill` on the port-8080 squatter):
`tests/dtui-20-court-acknowledge-peers.spec.js` 6/6 green; the same 3 targeted vitest files 2/3 passed
(70/71 tests), the 1 failure pre-existing and unrelated (see Completion Notes correction above).

**Outcome:** Approved with patches applied. No unresolved High or Medium defect remains — Medium
findings 1 and 3 resolved via documented deliberate triage (open product question / dismissed with
code-trace evidence) rather than a code patch, Medium finding 2 patched and prove-discriminated.

### File List

- `public/js/tabs/downtime-form.js` — modified (`shoutout_picks` render case, new delegated click
  handler, deletion of `_remountShoutoutPicker()` and the `shoutout` branch in
  `_makeCharPickerOnChange()`; post-review: added `role="checkbox"`/`aria-checked` to the render and
  click handler)
- `tests/dtui-20-court-acknowledge-peers.spec.js` — new (6 Playwright tests, AC1-AC6; post-review:
  strengthened AC3 with `aria-checked` assertions, strengthened AC6 with a restored hidden-input-value
  assertion)
