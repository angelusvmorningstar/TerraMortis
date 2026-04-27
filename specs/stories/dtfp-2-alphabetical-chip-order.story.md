---
id: dtfp.2
epic: dtfp
status: ready-for-dev
priority: low
depends_on: []
---

# Story DTFP-2: Alphabetical chip ordering at render time across the DT form

As a player scanning the suggestion chips, spec chips, and merit chips on my DT form,
I should see chips appear in alphabetical order so that I can find a specific chip predictably (e.g. always look for "Brawl" between "Athletics" and "Crafts"),
So that the form's chip lists feel deterministic instead of resembling whatever order the underlying data happens to come in.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 2 (Player Form Polish):

> **DTF2.2** — Alphabetical chip ordering at render time (global rule across attrs/skills/discs/merits chip lists)

Today's chip rendering iterates lists in whatever order the source data provides. For the feeding pool builder at `public/js/tabs/downtime-form.js:3328-3349`, this means:
- `m.attrs` chips render in the order defined in `FEED_METHODS` data (e.g. always [Manipulation, Wits], not always alphabetical).
- `m.skills` chips render in `FEED_METHODS` order similarly.
- `m.discs` chips render in `FEED_METHODS` order.
- Spec chips iterate `nativeSpecs` (per-skill order) followed by `isSpecsList` (varied).

For other chip surfaces in the DT form (merit pickers, target pickers, etc.), the order varies by source. The result: players have to scan from beginning to find a specific chip every time, instead of relying on alphabetical position.

DTFP-2 introduces a **render-time alphabetical sort** before each chip-emitting loop. The underlying data is unchanged; the sort happens at display time only. This keeps the chip behaviour deterministic without requiring a change to the source-data files (`FEED_METHODS`, etc.).

### Files in scope

Primary: `public/js/tabs/downtime-form.js`. Apply the rule wherever chips are rendered:

- Pool-builder suggestion chips (line 3328 `attrs`, `skills`, `discs` blocks).
- Spec chips (line 3354 `nativeSpecs`, line 3355 `isSpecsList`).
- Skill-acquisition spec chips (line 3131-3135).
- Any merit chip lists (search for `chip` and audit at implementation).
- Any target / NPC / character chip lists rendered as multi-pick affordances.

Secondary: any other tab files that render chip lists for the player form. Check `public/js/tabs/` broadly during implementation.

### Out of scope

- Changing the source data (`FEED_METHODS` arrays, `MERITS_DB`, etc.). The order in the data file is unchanged; only the render-time presentation sorts.
- Re-sorting after a chip is selected. Selection toggles the chip's `dt-feed-chip-on` class but does not reorder.
- Sorting by anything other than alphabetical (e.g. by dot count, by category). v1 is alphabetical only; if other sort orders become useful, add as separate stories.
- Special-case handling for chips like specialisations that have a parenthetical suffix (e.g. "Snakes (Animal Ken)") — the sort key uses the chip's display text as-is. If the result is awkward, refine in a follow-up.
- Non-DT-form chip surfaces (admin chips, sheet display, etc.). DTFP-2 is the player DT form only.
- Pinning the currently-selected chip to the top. Sort is purely alphabetical regardless of selection state.

---

## Acceptance Criteria

### Pool builder chips

**Given** I am a player on the DT form's Feeding section
**When** the suggestion chips render for a feed method (e.g. Stalking)
**Then** the **attribute chips** appear in alphabetical order (e.g. "Strength" before "Wits"), not in the order defined in `FEED_METHODS`.
**And** the **skill chips** appear in alphabetical order (e.g. "Athletics" before "Stealth").
**And** the **discipline chips** appear in alphabetical order (e.g. "Auspex" before "Vigour").

**Given** the same applies to other actions that use the same `renderPoolBuilder` (or equivalent) helper
**Then** every chip block within the pool builder uses alphabetical order across attrs, skills, and discs.

### Spec chips

**Given** I have selected a skill that has multiple specialisations
**When** the spec chips render
**Then** chips appear in alphabetical order — both the native skill specs and any IS specs from cross-skills are merged into a single alphabetical list.
**And** if the merge changes the perceived "type" boundary (native vs IS), accept that — the alphabetical order takes precedence over the type grouping.

(If grouping by native vs IS is mandated, add a separate story; default to alphabetical merge per memory's "global rule".)

### Merit chips

**Given** any chip list that surfaces merits (merit picker, own-merit target, contacts list)
**Then** chips appear in alphabetical order by merit name.

### Target / character / NPC chips

**Given** any chip list that surfaces character or NPC names (target pickers, sorcery targets, support targets)
**Then** chips appear in alphabetical order by display name (use `displayName(c)` for characters and the equivalent for NPCs; the same `sortName(c)` helper is also available).

(Some surfaces may already sort; the AC verifies they all do.)

### Stability

**Given** the chip list contains items with the same display text (rare but possible — e.g. duplicate target chip)
**Then** the relative order between equal items is unspecified (browsers' `Array.prototype.sort` is stable in modern environments; relying on stability is fine).

### Performance

**Given** a chip list of any size encountered in practice (typically ≤20 chips per list)
**Then** the sort overhead is negligible.

---

## Implementation Notes

### Sort helper

Add a tiny helper at the top of `public/js/tabs/downtime-form.js` (or in `public/js/data/helpers.js` if other tabs need the same behaviour):

```js
function sortChips(items, keyFn = x => x) {
  return items.slice().sort((a, b) =>
    String(keyFn(a)).localeCompare(String(keyFn(b)), undefined, { sensitivity: 'base' })
  );
}
```

`localeCompare` with `sensitivity: 'base'` treats accented characters and case as equal — usually the desired behaviour for a UX sort.

`.slice()` ensures the original array is not mutated; chip-emitting code typically reads from shared data structures (like `FEED_METHODS`) that should not be reordered.

### Apply at each chip site

Pool builder (lines 3331-3349) becomes:

```js
for (const a of sortChips(m.attrs)) { /* ... */ }
// ...
for (const s of sortChips(m.skills)) { /* ... */ }
// ...
for (const d of sortChips(m.discs)) { /* ... */ }
```

Spec chips (lines 3354-3365) — merge into one array, sort, then render with both native and IS variants distinguishable by their HTML:

```js
const allSpecs = [
  ...nativeSpecs.map(sp => ({ sp, fromSkill: null, native: true })),
  ...isSpecsList.map(({ spec, fromSkill }) => ({ sp: spec, fromSkill, native: false })),
];
const sortedSpecs = sortChips(allSpecs, item => item.sp);
for (const item of sortedSpecs) {
  const on = selSpec === item.sp ? ' dt-feed-spec-on' : '';
  const label = item.native ? esc(item.sp) : `${esc(item.sp)} (${esc(item.fromSkill)})`;
  h += `<button type="button" class="dt-feed-spec-chip${on}" data-feed-spec="${esc(item.sp)}"${scope==='rote'?' data-rote-spec="1"':''}>${label} <span class="dt-feed-spec-bonus">+${hasAoE(c, item.sp) ? 2 : 1}</span></button>`;
}
```

### Audit other chip sites

Grep for `chip` in `public/js/tabs/downtime-form.js` and verify each chip-emitting loop applies `sortChips` (or sorts inline). The pool-builder and spec sites are the most prominent; minor sites (skill-acquisition spec chips at line 3131, etc.) need the same treatment.

### Don't over-apply

Some chip lists are deliberately ordered (e.g. action-type tabs, severity-ordered status chips). Only apply the sort to chip lists where alphabetical is the desired UX. If unsure, leave as-is and note it for review; the dev should use judgement.

### No tests required

Pure render-order change. Manual smoke test:
- Open DT form, navigate to Feeding section: chips read alphabetically left-to-right within each row.
- Select a feed method that has discipline chips (e.g. Stalking, By Force, Familiar Face): discs chips alphabetical.
- Select a skill with multiple specs: spec chips alphabetical (native + IS interleaved).
- Open project slot and select Investigate or other actions that render merit chips: chips alphabetical.

### Strawman wording

No wording changes — purely an ordering tweak.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — `sortChips` helper added (or imported); applied at every chip-emitting loop. Spec chips merged into a single alphabetical list with native/IS distinguished by suffix only.
- (Possibly) `public/js/data/helpers.js` — if `sortChips` lives here as a shared helper, export from here.

No CSS, no schema, no API, no server changes.

---

## Definition of Done

- All AC verified.
- Manual smoke test exercises the four primary chip surfaces (attrs, skills, discs, specs) and any audited additional sites.
- `sortChips` helper does not mutate input arrays.
- No regression on chip selection / toggling behaviour.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtfp-2-alphabetical-chip-order: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies. Independent of every other story.
- Compatible with DTFP-3 (feeding methods data update) — the sort applies after the data update reaches the chips.
