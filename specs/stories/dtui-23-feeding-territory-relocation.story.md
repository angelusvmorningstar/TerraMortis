---
id: dtui.23
epic: dtui
status: done
priority: medium
depends_on: []
---

# Story DTUI-23: Feeding — territory, Blood Type and Method of Feeding grouped as consistent tickers

As a player filling out the Feeding section of my downtime form,
I want Territory, Blood Type and Method of Feeding to sit together directly below my hunt pool, with Blood Type and Method of Feeding styled as the same consistent picker used elsewhere in the form,
So that my feeding choices read as one clear, consistent group instead of three differently-styled widgets scattered through the card.

---

## Context

**FR7/FR8** (epic doc, `specs/epic-dtui-downtime-form-ux-refactor.md` FR Coverage Map): *"Feeding territory relocated"* / *"Three feeding tickers grouped"*. Epic doc Story 1.23 (`specs/epic-dtui-downtime-form-ux-refactor.md` ~line 1108-1140).

**Wave 4** (parallelisable with Waves 2-3 after Wave 1) — Wave 1 is complete (`.dt-ticker` exists, see below), so `depends_on` is empty deliberately. dtui-20 (Court Acknowledge Peers) is the only other Wave 4 story done so far; dtui-21/22 are still backlog and untouched by this story.

### The epic's premise is partly stale — read this before touching anything

The epic doc was written before some of this ground had already shifted under it. Two of its four ACs describe a state that **no longer exists**; do not "fix" something that already works:

1. **AC1 ("territory feeding-pill selector is NO LONGER present in Territory & Influence section") is already true.** `public/js/tabs/downtime-data.js:270-285` — the `territory` section's own comment reads *"Territory — influence spend; feeding territory moved into Feeding section"*, and its `questions` array contains only `influence_spend` (an `influence_grid`). The main render loop (`downtime-form.js:2200-2202`) additionally guards `if (key === 'feeding' && q.type === 'territory_grid') continue;` specifically so the feeding-section's own territory question isn't double-rendered generically. **No code change needed for AC1** — write a regression test that asserts it, don't build anything.
2. **"Blood Type was previously rendered with checkboxes" (AC4's premise) is stale.** It's currently single-select pill *buttons* (`.dt-feed-vi-btn` / `.dt-feed-violence-toggle`, `downtime-form.js:7209-7221`), not checkboxes — some earlier story (DTFP-5 era) already migrated it off checkboxes without the epic doc being updated. The real remaining work is button → `.dt-ticker`, not checkbox → `.dt-ticker`.
3. **dtui.24's own "Method of Feeding" labels ("The Kiss (subtle)" / "The Assault (violent)") already exist verbatim** in the current violence toggle (`downtime-form.js:7229-7230`). That is dtui-24's stated scope, already done as a side effect of this file's own history — **do not claim credit for it in this story**, but also don't be confused into thinking dtui-23 needs to change the copy; it only needs to change the *markup* these labels render inside.

### `.dt-ticker` already exists (Wave 1) and already names this story as an adopter

`public/css/components.css:4783-4861` — the canonical "pick one of 2-5" component, radio-based, with a documented HTML shape:

```html
<fieldset class="dt-ticker">
  <legend class="dt-ticker__legend">Method of Feeding</legend>
  <label class="dt-ticker__pill">
    <input type="radio" name="feed-method" value="kiss">
    <span>The Kiss (subtle)</span>
  </label>
  ...
</fieldset>
```

Its own doc comment explicitly lists **"Method of Feeding"** and **"Blood Type (Animal/Human/Kindred)"** as canonical use-case examples, and its "Adopted by stories" line already names `dtui-23, dtui-24, dtui-25`. Three existing precedents in this same file show the established radio-based pattern end to end (render → native `:has(input:checked)` CSS for selected-state, no JS needed for that part → `collectResponses()` reads `document.querySelector('input[name="dt-..."]:checked')`):

- Desired Outcome: render `downtime-form.js:5833-5837`, collect `downtime-form.js:709`
- Target type: render `downtime-form.js:6053-6056`, collect `downtime-form.js:773`
- Ambience direction: render `downtime-form.js:6302-6304`, collect `downtime-form.js:886`

**Model Blood Type and Method of Feeding on these exactly.**

### `.dt-feed-vi-btn` / `.dt-feed-violence-toggle` is a near-duplicate of `.dt-ticker` that predates it

Compare `public/css/components.css:3908-3921` (`.dt-feed-vi-btn`) against `.dt-ticker__pill` (`components.css:4838-4852`): same padding, `border-radius: var(--radius-sm)`, `border: 1px solid var(--bdr)`, `font-family: var(--ft)`, `font-size: 0.8125rem`. This is exactly the kind of pre-`.dt-ticker` duplicate the component was introduced to retire (CC9). **Confirmed via grep**: `.dt-feed-vi-btn`/`.dt-feed-violence-toggle` are used in exactly two places, both inside this story's own scope (Blood Type at `downtime-form.js:7219`, Method of Feeding at `downtime-form.js:7229-7230`) — nowhere else in `public/js/`. Once both convert to `.dt-ticker`, these two CSS classes have zero remaining consumers and should be deleted, not left as dead CSS.

### Territory is NOT a safe candidate for literal `.dt-ticker` conversion — read this before attempting it

`renderFeedingTerritoryPills()` (`downtime-form.js:6119-6204`) is not a plain "pick one of a few labelled options" widget. Per-pill it carries:

- **Ambience display** (`dt-terr-pill-amb` span — e.g. "Improving (+1)"), read live from `_territories`/`TERRITORY_DATA`.
- **Three colour-coded legality states** (`dt-terr-pill-rights` green / `dt-terr-pill-poach` orange / `dt-terr-pill-barrens` red), each with its own `:hover`/`--selected` variants (`components.css:3884-3896`) — this is how a player sees at a glance whether they have feeding rights, are poaching, or are in the Barrens.
- **Rote-territory locking** (`disabled` + `title="Rote territory must match main feed territory"` when rendered in `rote=true` mode) — a cross-field validation rule, not just a static option list.

`.dt-ticker__pill` is a single flat selected/unselected state (`:has(input:checked)`); it has no equivalent for three simultaneous legality tints plus a selection ring on top, and building that into the shared component is real new component work well outside this story's single-concern scope — it would also mean re-deriving, in a new shape, information `renderFeedingTerritoryPills` already computes correctly. Flattening Territory into bare `.dt-ticker` markup to satisfy AC3's literal wording would be a **functional regression** (loses ambience/rights/poaching/barrens/rote-lock signal), not a refactor.

**Decision, documented rather than silently made:** Territory keeps `renderFeedingTerritoryPills()` and its existing `.dt-terr-pill` markup unchanged. It moves position (see AC2) and sits inside the same visual grouping as the two genuine tickers, but is not re-implemented as literal `.dt-ticker` DOM. If this reads as not satisfying AC3's literal text, that is a real, acknowledged gap between the epic doc's wording and what the codebase can safely do here — flag it in the Dev Agent Record rather than either (a) silently deleting the rights/ambience system to force literal compliance, or (b) silently deciding it doesn't matter without saying so.

### Current section order (to be changed) and why

Inside `.dt-feed-card-wrap` (`downtime-form.js:7124-7242`), current order is:

1. Territory picker (`downtime-form.js:7130-7142`) — **first**
2. "How does your character hunt?" FEED_METHODS cards (`downtime-form.js:7143-7152`) — Seduction/Stalking/By Force/Deception/Intimidation; this is a *different* concept from "Method of Feeding" (see below), untouched by this story
3. Pool builder or MINIMAL-mode auto-derived pool readout (`downtime-form.js:7154-7207`)
4. Blood Type (`downtime-form.js:7209-7221`)
5. Method of Feeding / "How loud was the feeding?" violence toggle (`downtime-form.js:7223-7237`)
6. Description textarea (`downtime-form.js:7239-7241`)

AC2 wants Territory to sit **directly below the feeding dice pool** (item 3 above), grouped with Blood Type and Method of Feeding as three consecutive tickers. New order: FEED_METHODS cards → pool → **[Territory, Blood Type, Method of Feeding group]** → description. Territory moves from position 1 to inside the group after the pool; Blood Type and Method of Feeding stay where they are relative to the pool but change their internal markup and gain Territory as a group-mate.

**Do not confuse "Method of Feeding" (Kiss/Assault, item 5 above, `feed_violence`) with the FEED_METHODS cards (item 2, Seduction/Stalking/etc, `_feed_method`).** The epic's "Method of Feeding ticker" (dtui.24's own AC text: *"Given the Method of Feeding ticker renders... labels are: 'The Kiss (subtle)' and 'The Assault (violent)'"*) is unambiguously the violence toggle. The FEED_METHODS cards are untouched by this story.

### `feed_violence` explicit-vs-default logic simplifies under native radio, doesn't need separate preservation

Current logic (`downtime-form.js:493-496`, run inside `collectResponses()`'s `feeding_method` branch) merges an explicit prior save (`responseDoc.responses.feed_violence`) with a method-based default (`FEED_VIOLENCE_DEFAULTS[feedMethodId]`) to decide what to write and what to visually pre-select. The render side (`downtime-form.js:7224-7225`) computes the same `preselect` value to decide which `.dt-feed-vi-btn` gets `dt-feed-vi-on`.

Under native radio: render sets `checked` on whichever option matches `preselect` (identical logic, just emitted as a `checked` attribute instead of a class). `collectResponses()` can then just read `document.querySelector('input[name="dt-feed_violence"]:checked')?.value` directly — this is **equivalent**, not a behaviour change: if the player never clicks, the radio that was pre-checked at render time (the default) is what `:checked` returns; if they do click, `:checked` reflects their choice. The `_explicitViolence`/`_defaultViolence` merge in `collectResponses()` becomes unnecessary and should be deleted, not kept alongside the new DOM read.

**Blood Type's array shape must be preserved.** `_feed_blood_types` is persisted as a JSON array (`downtime-form.js:509`, read by `downtime-form.js:7212` and multiple ST-side/admin consumers — see Testing below), even though the UI has been single-select for a while (`downtime-form.js:7213` already only reads `savedBlood[0]`). Do not change the persisted shape to a bare string; write `JSON.stringify(checked ? [checked.value] : [])` from the single `:checked` radio, matching what the array-shaped consumers already expect.

### Existing interaction plumbing to replace, not duplicate

- Click handler `downtime-form.js:3014-3021` (`[data-blood-type]` → toggles `.dt-feed-vi-on` class across all blood-type buttons) — delete once Blood Type is a native radio group (native radio behaviour replaces the manual "uncheck siblings" logic for free).
- Click handler `downtime-form.js:3030-3037` (`[data-feed-violence]` → writes `responseDoc.responses.feed_violence` directly and calls `renderForm(container)`) — delete the click handler; add a `change`-event branch in the existing delegated `change` listener (`downtime-form.js:2712` onward — see the `[data-feed-terr]` branch at `downtime-form.js:2757-2762` for the closest existing shape to copy) that does the same responseDoc write + `renderForm(container)` + `scheduleSave()`, keyed off `input[name="dt-feed_violence"]`. The re-render is still needed post-change: it updates the "Pre-selected based on your method..." vs "Pick one..." hint text (`downtime-form.js:7232-7236`), which depends on `persistedViolence` being non-empty.
- Blood Type's click handler never called `renderForm()` (only `scheduleSave()`) — no visible dependent text changes when Blood Type changes, so its `change` handler only needs `scheduleSave()`, not a full re-render. Preserve this asymmetry; don't add an unnecessary re-render.

---

## Files in scope

- `public/js/tabs/downtime-form.js`:
  - `feeding_method` case in `renderQuestion()`'s switch (`~7124-7242`): reorder so the Territory/Blood Type/Method-of-Feeding group renders after the pool (item 3) instead of Territory rendering first; convert Blood Type and Method of Feeding to `<fieldset class="dt-ticker">` + native radio markup; leave Territory's own `renderFeedingTerritoryPills()` call and its surrounding label/description text untouched apart from the reposition.
  - `collectResponses()`'s `feeding_method` branch (`~482-514`): replace the `_explicitViolence`/`_defaultViolence` merge and the `.dt-feed-vi-on` DOM scan for blood type with `:checked` radio reads for both fields, same persisted shapes (`feed_violence` string, `_feed_blood_types` JSON array).
  - Click handler `[data-blood-type]` (`~3014-3021`) — delete.
  - Click handler `[data-feed-violence]` (`~3030-3037`) — delete; replace with a `change`-event branch in the existing delegated listener (`~2712` onward) for `input[name="dt-feed_violence"]`.
- `public/css/components.css`:
  - Delete `.dt-feed-violence-toggle`, `.dt-feed-vi-btn`, `.dt-feed-vi-btn:hover`, `.dt-feed-vi-btn.dt-feed-vi-on` and any other rules under the "DTFP-5: Kiss / Violent feeding declaration toggle" comment block (`~3902-3925` — read the actual current block before deleting; grep for `dt-feed-vi` first to catch every rule) once both consumers are converted and confirmed zero remaining references.
  - No new component needed — `.dt-ticker` already exists.
- No changes to `public/js/tabs/downtime-data.js` — the `territory`/`feeding` section definitions and their question keys are unaffected; only rendering markup and grouping change.
- No changes to `FEED_METHODS`, `FEED_VIOLENCE_DEFAULTS`, or `inferFeedViolenceFromMethod`/`effectiveFeedViolence` in `downtime-data.js` — those are read, not modified.

---

## Out of scope

- **Converting Territory to literal `.dt-ticker` markup.** Documented at length above — would regress ambience/rights/poaching/barrens/rote-lock signal. Territory is repositioned, not re-implemented.
- **dtui-24 (Method of Feeding label rename)** — already true in the current code (see Context above); this story does not touch label copy and should not claim dtui-24 as done in its own records (that's dtui-24's own story to formally close).
- **dtui-25 (Rote panel ordering + selectors)** — the Rote panel's own three feeding selectors (`renderFeedingTerritoryPills(roteTerrGridVals, true, mainTerrGridVals)` at `downtime-form.js:3959` and its surroundings) are a separate rendering path with independent state (rote territory can differ from main territory) and get their own story. Do not extend this story's ticker conversion into the Rote panel.
- **The FEED_METHODS cards** ("How does your character hunt?" — Seduction/Stalking/By Force/Deception/Intimidation) and the pool builder/readout beneath them — untouched, not part of "Territory + Blood Type + Method of Feeding".
- **Changing `_feed_blood_types`'s persisted shape from array to string**, even though it's been single-select for a while — downstream consumers (admin/downtime-views.js, feeding-tab.js, multiple test fixtures) read it as a JSON array; that's a separate, larger data-shape migration this story doesn't need and shouldn't cause.
- **Adding multi-select to Blood Type or Method of Feeding.** Both stay single-select radio groups, matching current behaviour exactly.

---

## Acceptance Criteria

### AC1 — Territory feeding-pill selector already absent from Territory & Influence (regression guard only)

**Given** the `territory` section (`Territory & Influence`) renders,
**When** the player views it,
**Then** it contains only the Influence-spend grid — no feeding-territory picker. (Already true at the data level; this AC exists to be tested, not implemented.)

### AC2 — Territory sits directly below the feeding pool, grouped with Blood Type and Method of Feeding

**Given** the Feeding section renders,
**When** the player scrolls past "How does your character hunt?" and the resulting pool (builder or MINIMAL readout),
**Then** the next content is the Territory / Blood Type / Method of Feeding group — Territory no longer renders above the FEED_METHODS cards.

### AC3 — Blood Type and Method of Feeding are `.dt-ticker`s; Territory keeps its own established rendering

**Given** the Feeding section renders,
**When** the grouped block appears,
**Then** Blood Type and Method of Feeding are each a `<fieldset class="dt-ticker">` with native radio `.dt-ticker__pill` options (Blood Type: Animal/Human/Kindred; Method of Feeding: The Kiss (subtle)/The Assault (violent)), consistent with the three existing `.dt-ticker` usages elsewhere in this file. Territory renders via the existing `renderFeedingTerritoryPills()` immediately alongside them, keeping its ambience/rights/poaching/barrens/rote-lock behaviour exactly as today (see Context for why Territory is not itself converted).

### AC4 — Blood Type is a real radiogroup, not button-toggled classes

**Given** the Blood Type ticker renders,
**When** the player selects Animal, Human, or Kindred,
**Then** the browser's native radio behaviour handles the single-select (no manual "uncheck the others" JS), and on save `responses._feed_blood_types` is written as a one-element JSON array matching the selected option (or `[]` if none selected) — the same shape today's consumers already read.

**Given** the player has already selected a Blood Type,
**When** the player then picks a Method of Feeding option,
**Then** the Blood Type selection survives — this AC's own change handler must sync into `responseDoc.responses` immediately rather than relying solely on the debounced `scheduleSave()` path, because the Method of Feeding handler triggers a synchronous `renderForm()` that would otherwise rebuild this ticker from stale state.

**Correction made during code review (Codex, Medium)**: this AC originally read "matching current behaviour exactly" for the single-select mechanism. That framing does not survive scrutiny on one point: native radios cannot be un-checked by clicking the already-checked option, whereas the old button-toggle handler deliberately supported clicking an active Blood Type button again to clear it back to no selection (`[]`). This is a genuine, narrow capability loss from converting to `.dt-ticker`, not preserved by this AC's own "or `[]` if none selected" clause (that clause covers *never having selected one*, not *clearing after selecting one*). **Not patched** — adding bespoke un-check logic to only this one ticker would make it inconsistent with every other `.dt-ticker` in this file (none of which support clearing to no-selection either), undermining the reason CC9 asks for the canonical component in the first place. **Open question for the ST team**: is "Blood Type, once picked, can no longer be cleared back to blank" an acceptable trade-off for consistency with the rest of the form's ticker components, or does this specific field need its own clearable affordance? Left as shipped (matching every other `.dt-ticker` in the file) pending that ruling.

### AC5 — Method of Feeding is a real radiogroup; pre-selection behaviour is unchanged

**Given** the Method of Feeding ticker renders,
**When** no explicit `feed_violence` has been saved and the chosen FEED_METHODS card has a default (`FEED_VIOLENCE_DEFAULTS`),
**Then** the corresponding radio renders pre-checked — matching current behaviour exactly.

**Correction made during dev-story**: the AC as originally drafted also claimed the "Pre-selected based on your method. Click to confirm or change." hint text would show in this state. Confirmed during implementation this hint is **already unreachable, pre-existing, and not something this story changes**: the fix.48 hydration step (`downtime-form.js:1614-1620`) backfills `responseDoc.responses.feed_violence` from `FEED_VIOLENCE_DEFAULTS` *before* the first render whenever a saved method has a default and no explicit violence is saved, and a live method-card click's own `collectResponses()` call does the same before its re-render (see AC5's second Given below). Either way, `persistedViolence` is already truthy by the time the render case's hint-selection logic runs, so the "pre-selected" branch of that logic has had no live path to it since fix.48 landed. Not fixed here — out of scope for a Feeding-restructure story; flagged for whoever next touches that hint.

**Given** the player explicitly picks a Method of Feeding option,
**When** the change fires,
**Then** `responseDoc.responses.feed_violence` updates to the chosen value, the form re-renders, and the choice persists on save.

### AC6 — No dead code or dead CSS left behind

**Given** Blood Type and Method of Feeding are both converted,
**When** the change is complete,
**Then** the `[data-blood-type]` and `[data-feed-violence]` click handlers are deleted, and `.dt-feed-violence-toggle`/`.dt-feed-vi-btn` (and its `:hover`/`.dt-feed-vi-on` variants) are deleted from `components.css` — confirmed via grep that zero *active* references (selectors, handlers, class applications) remain anywhere in `public/`.

**Correction made during code review (Codex, Low)**: this AC's wording as originally drafted said "confirmed via grep that zero references remain" without qualifying "active" — a literal `rg` for these four names still returns 4 hits, all of them comments (in `downtime-form.js`/`components.css`) that reference the old names for historical context (e.g. explaining what a class used to be called). The AC's own intent — no runtime dead code — holds; the wording did not distinguish "dead code" from "a comment mentioning a retired name," and has been corrected here rather than left to mislead a future grep-only check.

**Correction made during dev-story**: the `_explicitViolence`/`_defaultViolence` merge in `collectResponses()` (originally planned for deletion, replaced with a DOM `:checked` read) had to be **restored, not deleted** — see the Implementation Notes correction below. A DOM read broke a real, tested behaviour (fix-48's AC-3): the `[data-feed-method]` click handler calls `collectResponses()` immediately after updating `feedMethodId` but *before* `renderForm()` redraws the ticker, so a DOM `:checked` read at that point still sees the previous method's radio state, not the new method's default. The JS-state-based merge has no such ordering dependency and is what stays in the shipped code.

---

## Implementation Notes

**Blood Type ticker** (replaces `downtime-form.js:7209-7221`):

```javascript
const BLOOD_TYPES = ['Animal', 'Human', 'Kindred'];
let savedBlood = [];
try { savedBlood = JSON.parse(responseDoc?.responses?.['_feed_blood_types'] || '[]'); } catch { /* ignore */ }
const selectedBlood = Array.isArray(savedBlood) && savedBlood.length ? savedBlood[0] : '';
h += '<fieldset class="dt-ticker">';
h += '<legend class="dt-ticker__legend">Blood Type</legend>';
for (const bt of BLOOD_TYPES) {
  const checked = selectedBlood === bt ? ' checked' : '';
  h += `<label class="dt-ticker__pill"><input type="radio" name="dt-feed_blood_type" value="${esc(bt)}"${checked}><span>${esc(bt)}</span></label>`;
}
h += '</fieldset>';
```

**Method of Feeding ticker** (replaces `downtime-form.js:7223-7237`, keeps the existing hint-text logic below it):

```javascript
const persistedViolence = responseDoc?.responses?.feed_violence || '';
const preselect = persistedViolence || (FEED_VIOLENCE_DEFAULTS[feedMethodId] || '');
h += '<fieldset class="dt-ticker">';
h += '<legend class="dt-ticker__legend">Method of Feeding</legend>';
h += `<label class="dt-ticker__pill"><input type="radio" name="dt-feed_violence" value="kiss"${preselect === 'kiss' ? ' checked' : ''}><span>The Kiss (subtle)</span></label>`;
h += `<label class="dt-ticker__pill"><input type="radio" name="dt-feed_violence" value="violent"${preselect === 'violent' ? ' checked' : ''}><span>The Assault (violent)</span></label>`;
h += '</fieldset>';
if (!persistedViolence && !preselect) {
  h += '<p class="qf-desc dt-feed-vi-hint">Pick one. Your method does not pre-select for you.</p>';
} else if (!persistedViolence && preselect) {
  h += '<p class="qf-desc dt-feed-vi-hint">Pre-selected based on your method. Click to confirm or change.</p>';
}
```

**`collectResponses()` changes** (`~493-509`) — **corrected during dev-story, see AC6**:

```javascript
// feed_violence: KEEP the existing _explicitViolence/_defaultViolence merge
// as-is (do not replace with a DOM :checked read). The [data-feed-method]
// click handler calls collectResponses() before renderForm() redraws the
// ticker with the new method's default-checked radio, so a DOM read here
// would still see the PREVIOUS method's radio state — this broke fix-48's
// AC-3 in testing (the "choose Kiss or Violent" banner failed to clear on
// the same click that picked a default-violence method). The JS-state
// merge has no such ordering dependency:
const _explicitViolence = responseDoc?.responses?.feed_violence;
const _defaultViolence = feedMethodId ? (FEED_VIOLENCE_DEFAULTS[feedMethodId] || null) : null;
const _violence = _explicitViolence || _defaultViolence;
if (_violence) responses.feed_violence = _violence;

// _feed_blood_types: this one IS safe to replace with a DOM :checked read —
// blood type never had a method-default backfill or an ordering-sensitive
// caller, so it doesn't share feed_violence's hazard:
const checkedBlood = document.querySelector('input[name="dt-feed_blood_type"]:checked');
responses['_feed_blood_types'] = JSON.stringify(checkedBlood ? [checkedBlood.value] : []);
```

**New `change`-listener branch** (add near `downtime-form.js:2757-2762`'s `[data-feed-terr]` branch, same file's existing delegated `change` listener):

```javascript
if (e.target.matches('input[name="dt-feed_violence"]')) {
  if (!responseDoc) responseDoc = { responses: {} };
  if (!responseDoc.responses) responseDoc.responses = {};
  responseDoc.responses.feed_violence = e.target.value;
  renderForm(container);
  scheduleSave();
  return;
}
if (e.target.matches('input[name="dt-feed_blood_type"]')) {
  scheduleSave();
  return;
}
```

(Pseudocode — match this file's real delegated-listener structure and helper names exactly; the sketches above are for shape, not verbatim insertion.)

**Reordering**: move the territory-embed block (`downtime-form.js:7130-7142`, the `{ const feedingSect = ...; ... }` block and its two `h +=` lines) to just after the pool block (after `downtime-form.js:7207`'s closing `}` of the `if (_formMode(...) === 'minimal') { ... } else { ... }`), immediately before the new Blood Type ticker.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — `feeding_method` render case (reorder + Blood Type/Method-of-Feeding markup conversion), `collectResponses()`'s `feeding_method` branch, deletion of the `[data-blood-type]` and `[data-feed-violence]` click handlers, new `change`-listener branches
- `public/css/components.css` — deletion of `.dt-feed-violence-toggle`/`.dt-feed-vi-btn` and variants
- New: `tests/dtui-23-feeding-territory-relocation.spec.js`

---

## Definition of Done

- AC1-AC6 verified
- Territory/Blood Type/Method of Feeding group renders directly below the pool, in that order
- Blood Type and Method of Feeding are native `.dt-ticker` radiogroups; Territory keeps its existing rich rendering
- `_feed_blood_types` (array) and `feed_violence` (string) persisted shapes unchanged — verified against at least one existing downstream-consumer test
- `.dt-feed-vi-btn`/`.dt-feed-violence-toggle` deleted from CSS, confirmed zero remaining references
- `[data-blood-type]`/`[data-feed-violence]` click handlers deleted, confirmed unreachable
- `tests/dt-form-35-feed-violence-default.spec.js` updated: its `toHaveClass(/dt-feed-vi-on/)` assertions (`~lines 191-286`) must change to check radio `:checked` state instead — this spec directly asserts the old button+class markup and will fail against the new radio markup unless updated. Read it fully before starting; do not skip fixing it.
- `specs/stories/sprint-status.yaml` updated: dtui-23 → review

---

## Compliance

- CC4 — Token discipline: zero new CSS added (`.dt-ticker` already exists); deletions only
- CC5 — British English, no em-dashes in any player-facing copy or code comments
- CC9 — Retires a near-duplicate pre-`.dt-ticker` component (`.dt-feed-vi-btn`) in favour of the canonical one, exactly the kind of consolidation CC9 asks for; does NOT force an unsuitable component (`.dt-ticker`) onto Territory where it would regress functionality

---

## Dependencies and Ordering

- **Depends on:** nothing blocking — Wave 1 (`.dt-ticker`) is done
- **Blocks:** dtui-24 (label rename — already incidentally satisfied, but its own story should still formally verify/close it) and dtui-25 (Rote panel selectors) are sequenced *after* this story per the epic's own Wave 4 table — do not run either concurrently with this one, since both touch the Feeding section this story restructures

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Completion Notes

Implemented as scoped in Implementation Notes, with one real correction found and fixed during dev
(see AC5/AC6's own "Correction made during dev-story" notes above — not repeated in full here).

- **Reordering**: the territory-embed block moved from the top of `.dt-feed-card-wrap` to
  immediately after the pool block (minimal-mode readout or advanced pool builder), directly
  before the new Blood Type ticker. FEED_METHODS cards and the pool itself are untouched.
- **Blood Type and Method of Feeding** converted to real `<fieldset class="dt-ticker">` radiogroups
  (`name="dt-feed_blood_type"`, `name="dt-feed_violence"`), matching the three existing `.dt-ticker`
  precedents in this file exactly. Territory kept its existing `renderFeedingTerritoryPills()`
  rendering untouched apart from the reposition, per the story's own documented scope decision.
- **`.dt-feed-vi-btn`/`.dt-feed-violence-toggle` deleted from `components.css`** (`.dt-feed-vi-hint`
  kept — still used by the ticker version's own hint paragraph). Confirmed via grep: zero remaining
  references anywhere in `public/`.
- **`[data-blood-type]`/`[data-feed-violence]` click handlers deleted**; replaced with two `change`-
  listener branches (`input[name="dt-feed_violence"]` re-renders for the hint text and persists;
  `input[name="dt-feed_blood_type"]` just persists, matching the old handler's own asymmetry).
- **Real regression found and fixed during testing, not by inspection alone**: my first pass replaced
  `collectResponses()`'s `_explicitViolence`/`_defaultViolence` merge with a DOM `input:checked` read,
  reasoning (wrongly, at the time) that native-radio `:has(input:checked)` styling made the two
  equivalent. `tests/fix-48-feed-card-violence-sync.spec.js`'s own AC-3 caught this: the
  `[data-feed-method]` click handler calls `collectResponses()` *before* `renderForm()` redraws the
  ticker with the new method's default-checked radio, so a DOM read at that point still sees the
  *previous* method's radio state. Restored the JS-state-based merge (no DOM dependency, no ordering
  hazard) — confirmed fix-48's AC-3 passes again, confirmed dtui-23's own AC5 still passes with the
  merge restored. Blood Type's own DOM-read replacement was safe throughout (it never had a
  method-default backfill or an ordering-sensitive caller) and was kept.
- **Real pre-existing dead-hint finding, not fixed here**: while writing AC5's own test, found that
  the Method of Feeding ticker's "Pre-selected based on your method. Click to confirm or change."
  hint text has been unreachable since fix.48 (`downtime-form.js:1614-1620`) added an eager
  load-time backfill of `feed_violence` from the method default — by the time this render case's
  hint-selection logic runs, `persistedViolence` is already truthy in every real flow (load *and*
  live click), so the "pre-selected" branch never fires. Confirmed via direct code trace, not
  guessed. Out of scope for this story (a Feeding-restructure story, not a fix.48 follow-up) —
  flagged in AC5 and left as dead code for whoever next touches that hint.
- **dtui-24's label rename confirmed already satisfied** by existing code ("The Kiss (subtle)"/"The
  Assault (violent)" were already the labels before this story) — not claimed as this story's own
  work, dtui-24's own story should still formally verify/close it.

**Testing**: `tests/dtui-23-feeding-territory-relocation.spec.js` (8 tests, AC1-AC5c plus AC4b — see
Senior Developer Review below; AC6 verified by direct grep, not a runtime assertion — see below). All
8 passed clean in isolation (single worker, port 8099 to dodge a respawning TM Admin dev-supervisor
squatting the usual port 8080 in this shared local environment — a known, previously-documented
environmental gotcha, not a code issue). `tests/dt-form-35-feed-violence-default.spec.js` updated (its
`.toHaveClass(/dt-feed-vi-on/)`/`[data-feed-violence=...]` assertions changed to `:checked` state on
the new `input[name="dt-feed_violence"]` selector) — all 6 tests pass. Broader regression batch run
(`tests/cm-3-dt-form-finale-gate.spec.js`, `dt-form-599-flock-herd.spec.js`, `dt-form-609-ssj-herd.spec.js`,
`fix-45-feeding-validation-false-block.spec.js`, `fix-46-game-recount-non-attendee.spec.js`,
`fix-473-feeding-custom-pool-blank.spec.js`, `fix-475-feeding-vitae-pipeline.spec.js`,
`fix-479-dt-influence-budget-cap.spec.js`, `fix-48-feed-card-violence-sync.spec.js`) — 11 of these
failed on the first pass; a `git stash` A/B run against unmodified base code within this same session
reproduced the identical 10 `fix-473`/`fix-475` failures, plus the one real fix-48 regression this
story caused and then fixed (above).

**Correction (Codex review, Low)**: this note originally said `fix-473`/`fix-475` "mount a completely
different module, `feeding-tab.js`, never touched by this story." That overstates it — both spec files
*also* contain `downtime-form.js` coverage elsewhere in the same file (`fix-473` and `fix-475` each
import both modules). The precise, verified claim is narrower: all 10 of the actual failures are in
those two specs' `feeding-tab.js`-mounting test cases specifically, `feeding-tab.js` has zero diff from
base commit `361716b6`, and the failures reproduce identically with or without this story's changes —
so the conclusion (pre-existing, unrelated to this diff) still holds; only the blanket "different
module" description of the whole file was inaccurate.

After the fix: fix-48 4/4, dt-form-35 6/6, dtui-23's own 8/8, all re-confirmed together in one run.

**Correction (Codex review, Medium)**: this note originally claimed "No server-side (vitest) suite
references the changed client markup or field shapes." That is false —
`server/tests/issue-939-personal-story-optional.test.js` references all three persisted fields
(`_feed_blood_types`, `feed_violence`, `feeding_territories`) directly. Re-run: 1 file, 7/7 passed,
unaffected by this diff (the field *shapes* are unchanged, which is the part that was actually true;
the "no suite references them" framing was simply wrong and has been corrected here rather than left
standing).

**AC6 verified by direct grep**: `rg -n "dt-feed-vi-btn|dt-feed-violence-toggle|data-blood-type|data-feed-violence" public` returns 4 matches, all of them comments referencing the old names for historical
context (confirmed by reading each) — zero *active* selectors, handlers, or class applications remain.
**Correction (Codex review, Low)**: the original wording here said "zero matches," which is a direct
self-contradiction with the very next sentence naming 4 comment matches. Corrected to state the real,
defensible claim precisely: zero *active* references, four historical-comment mentions.

### Senior Developer Review (AI)

External review via `codex-review` (Codex CLI, `model_reasoning_effort=high`, 3-pass Blind Hunter →
Edge Case Hunter → Acceptance Auditor, single session). Findings persisted at
`specs/stories/code-review/dtui-23-feeding-territory-relocation-codex-findings.md`. Every finding below
was independently re-verified against the real code in this session before being triaged — none were
accepted on Codex's word alone. Codex's own validation notes show real command execution (it started
its own isolated server on port 8099 after two failed attempts, ran all three required gate specs
live, ran the broader regression batch live, and ran the one server vitest file live) — this was a
genuine adversarial pass, not a static read.

**High:**

1. **A Blood Type pick can be silently erased by an immediately-following Method of Feeding pick**
   (`downtime-form.js`'s new `change`-listener branches) — **confirmed real**, reproduced with a new
   test (AC4b) and prove-discriminated with a single-change revert (reverting the fix made AC4b fail on
   the exact expected assertion; restoring it passed again). Root cause: the Method of Feeding branch
   calls `renderForm(container)` synchronously to keep its own hint text accurate; that rebuild reads
   Blood Type back out of `responseDoc.responses._feed_blood_types`, but the Blood Type branch had only
   called `scheduleSave()` without writing into `responseDoc` first — a rapid Blood Type → Method of
   Feeding click sequence (well within the 800ms/2000ms save debounce) discarded the Blood Type pick.
   **Confirmed pre-existing in base commit `361716b6` too** (the old button-toggle handler had the exact
   same gap — it also never wrote to `responseDoc`, and the old violence handler's `renderForm()` call
   read the same stale field). Not introduced by this story, but **patched here anyway**: dtui-23 is
   already rewriting this exact pair of controls, the fix is a two-line addition, and leaving a newly
   more-visible bug in code this story is actively restructuring did not seem defensible just because
   it predates the story. **Triage: patched, not deferred.**

**Medium:**

2. **The AC2 test didn't actually verify the group renders after the pool, only after the method
   cards** — **confirmed real** (the test compared Territory's index only against `dt-feed-methods`,
   never located a pool marker). **Triage: patched.** Added a `dt-feed-min-pool` index check between
   the method cards and Territory, so the test now fails if the group moves to sit between the cards
   and the pool rather than after both.
3. **Legacy lowercase Blood Type values (`"human"` instead of `"Human"`) render unselected and get
   silently normalised to `[]` on next save** — **confirmed real**, and **confirmed pre-existing**:
   base commit `361716b6` used the exact same case-sensitive `===` comparison, so this migration
   preserves rather than introduces the defect. **Triage: deferred, not patched.** Normalising legacy
   casing is a data-shape concern broader than this story's own scope (a Feeding-restructure story, not
   a data-migration story) — logged to `deferred-work.md`, not folded in here.
4. **Native Blood Type radios removed the prior ability to clear a selection back to none** —
   **confirmed real**, a genuine behaviour change this story does introduce (native radios cannot
   self-uncheck the way the old toggle buttons could). **Triage: not patched, AC4 corrected instead.**
   See AC4's own "Correction made during code review" note above — adding bespoke clear-logic to only
   this one ticker would make it inconsistent with every other `.dt-ticker` in the file, undermining
   the reason CC9 asks for the canonical component. Logged as an open product question for the ST team,
   not decided unilaterally.
5. **The Dev Agent Record's claim that no server-side suite references the changed field shapes is
   false** — **confirmed real** (`issue-939-personal-story-optional.test.js` references all three
   fields directly, 7/7 passing). **Triage: patched** — corrected in the Completion Notes above rather
   than left standing.

**Low (7 total):**

- AC1's own regression-guard test only checked the section body was visible, not that an influence
  grid actually renders inside it. **Triage: patched** — now asserts `.dt-influence-grid` directly.
- The spec file's own header comment promised AC5 hint-text coverage the suite deliberately does not
  provide (the hint is confirmed unreachable, see AC5). **Triage: patched** — header corrected to state
  precisely what AC5a/b/c each assert.
- The new test's territory/attendance fixtures return `[]` rather than realistic live-shaped documents,
  so AC3 proves `.dt-terr-pill` exists without proving the retained renderer's live ambience/rights
  semantics still work end-to-end. **Triage: acknowledged, not patched** — this story doesn't modify
  `renderFeedingTerritoryPills()`'s internals, only its position, so deeper fixture fidelity for a
  renderer this story doesn't touch is scope creep relative to what needs proving here.
- AC6's own wording said "zero references remain" without qualifying "active," and the Dev Agent
  Record self-contradicted by saying "zero matches" then naming four comment matches in the next
  sentence. **Triage: patched** — both corrected above.
- The broader-regression note described `fix-473`/`fix-475` as mounting "a completely different
  module," overstating it since both files also contain `downtime-form.js` coverage. **Triage:
  patched** — corrected above; the underlying pre-existing/unrelated conclusion still holds.
- Codex could not independently reproduce this session's own discarded DOM-`:checked` implementation
  or its `git stash` A/B (neither artifact exists in the delivered tree, and Codex did not mutate
  source to recreate them) — a fair methodological limit on an external reviewer's ability to verify
  session-internal provenance claims, not a factual dispute. **Triage: acknowledged, wording softened**
  to "within this session" rather than implying independent reproducibility from the diff alone.

**Verified-clean per the Acceptance Auditor pass:** all three required gate specs pass (dtui-23's own
8/8, dt-form-35's 6/6, fix-48's 4/4); no out-of-scope work found (Territory was not converted to
literal `.dt-ticker`, dtui-24/25 scope untouched, multi-select not added, `_feed_blood_types`'s array
shape preserved).

**Outcome:** Approved with patches applied. The one High finding is patched and prove-discriminated;
the four Medium findings are split between one patch (AC2 test), one deferral (legacy casing, logged
to `deferred-work.md`), and two documentation corrections (AC4's clearability, the false server-suite
claim); all Low findings are patched or acknowledged. No unresolved High or Medium defect remains.

### File List

- `public/js/tabs/downtime-form.js` — modified (`feeding_method` render case: reorder + Blood
  Type/Method of Feeding `.dt-ticker` conversion; `collectResponses()`'s `feeding_method` branch;
  deletion of `[data-blood-type]`/`[data-feed-violence]` click handlers; two new `change`-listener
  branches; post-review: Blood Type's `change` branch now syncs `_feed_blood_types` into
  `responseDoc.responses` immediately, fixing a cross-control state-loss race with Method of Feeding)
- `public/css/components.css` — modified (deleted `.dt-feed-violence-toggle`/`.dt-feed-vi-btn` and
  variants; kept `.dt-feed-vi-hint`)
- `tests/dtui-23-feeding-territory-relocation.spec.js` — new (8 Playwright tests, AC1-AC5c plus AC4b;
  post-review: strengthened AC1 to assert `.dt-influence-grid` presence, AC2 to check pool position
  not just method-card position, added AC4b regression test, corrected file header)
- `tests/dt-form-35-feed-violence-default.spec.js` — modified (updated stale button+class assertions
  to native-radio `:checked` assertions, matching the new markup)
- `specs/deferred-work.md` — modified (logged the pre-existing legacy-lowercase Blood Type finding)

**Not part of this story's scope, present in the working tree from elsewhere — do not attribute to
dtui-23 or include in its commit**: `public/css/suite.css` (an unrelated nav-tile sizing fix, same
session, different task) and `server/schemas/character.schema.js` (a concurrent session's own TM
Admin interop work, confirmed not authored by this story).
