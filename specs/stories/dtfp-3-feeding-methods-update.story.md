---
id: dtfp.3
epic: dtfp
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTFP-3: Update FEED_METHODS data and add By Force teaching note

As a player choosing a feeding method on the DT form,
I should see each method's suggested attributes, skills, and disciplines reflect the current rules — including a renamed Familiar Face → "Deception", updated Stalking skill, updated Intimidation pool, and a By Force note that surfaces when I pick Vigour or Celerity,
So that the suggestion chips guide me to the right pool for the current rules instead of pointing at obsolete combinations carried over from earlier balance passes.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 2 (Player Form Polish):

> **DTF2.3** — Feeding methods data update + By Force teaching note. Stalking: Athletics → Streetwise. By Force: Nightmare → Celerity. Familiar Face → display name "Deception" (id stays `familiar` for back-compat); attrs `[Manipulation, Wits]`, discs `[Auspex, Obfuscate]`, skills retained `[Persuasion, Subterfuge]`. Intimidation: attrs `[Intelligence, Presence]`, skills `[Expression, Intimidation]`. By Force teaching note when Vigour or Celerity selected.

The data lives in `public/js/tabs/downtime-data.js:87-94` as the exported `FEED_METHODS` array. The DT form's pool-builder reads from this array to render suggestion chips. The id strings (`stalking`, `force`, `familiar`, `intimidation`) are used as the persisted `feed_method` value on submissions, so renaming an `id` would break back-compat reads — instead, only the `name` and the chip arrays change.

The Familiar Face → "Deception" rename is **display-only**: `id` stays `familiar`, all submissions referencing `feed_method: 'familiar'` continue to read correctly. The teaching note for By Force is a small inline hint that appears when the player selects Vigour or Celerity from the disc chips, surfacing a rules cue (e.g. how those disciplines benefit the brawl/weaponry pool) at the right moment.

### Files in scope

- `public/js/tabs/downtime-data.js` — `FEED_METHODS` array at line 87.
- `public/js/tabs/downtime-form.js` — pool-builder render around line 3328 (existing chip block) and the disc-chip click handler around lines 1745, 1754: add the conditional teaching note when the selected disc is Vigour or Celerity within the By Force method.
- (Optional) `public/css/<dt-form-css>.css` — minor styling for the teaching note. Reuse existing tokens.

### Out of scope

- Renaming the `id` of any feed method. `familiar` stays `familiar`; only the `name` flips to "Deception".
- Migrating historical submissions that have `feed_method: 'familiar'` — no migration needed; reads continue to work.
- Server-side validation changes — the schema for `feed_method` (if explicit) accepts the same id strings.
- Changes to the `Other` method — unchanged.
- Changes to the `Seduction` method — not in scope per memory; verify it remains untouched.
- Adding teaching notes for other discipline selections (only By Force gets the note in v1).
- Reordering `FEED_METHODS` — render order is alphabetical via DTFP-2's chip sort; the data file order can be left as-is.

---

## Acceptance Criteria

### Data changes

**Given** `FEED_METHODS` post-DTFP-3
**Then** the array reads:

| id | name (display) | attrs | skills | discs |
|---|---|---|---|---|
| `seduction` | Seduction | Presence, Manipulation | Empathy, Socialise, Persuasion | Majesty, Dominate |
| `stalking` | Stalking | Dexterity, Wits | **Stealth, Streetwise** (was Stealth, Athletics) | Protean, Obfuscate |
| `force` | By Force | Strength | Brawl, Weaponry | **Vigour, Celerity** (was Vigour, Nightmare) |
| `familiar` | **Deception** (was Familiar Face) | **Manipulation, Wits** (was Manipulation, Presence) | Persuasion, Subterfuge | **Auspex, Obfuscate** (was Dominate, Majesty) |
| `intimidation` | Intimidation | **Intelligence, Presence** (was Strength, Manipulation) | **Expression, Intimidation** (was Intimidation, Subterfuge) | Nightmare, Dominate |
| `other` | Other | — | — | — |

**Given** the `id` field of every method
**Then** it is **unchanged** from the current values (`seduction`, `stalking`, `force`, `familiar`, `intimidation`, `other`).

### Display rendering

**Given** the player opens the feed method selector
**Then** the previously-named "Familiar Face" appears as "**Deception**" in the dropdown, the chip lists, and any other label site.

**Given** an existing draft submission has `responses.feed_method === 'familiar'`
**When** the form renders that draft
**Then** the Deception method is correctly highlighted as the selected one (read by `id`, displayed by `name`).

### Suggestion chips

**Given** the player selects "Stalking" as the feed method
**Then** skill chips render `Stealth` and `Streetwise` (alphabetised by DTFP-2 → `Stealth`, `Streetwise`).
**And** Athletics is **not** offered as a Stalking suggestion.

**Given** the player selects "By Force"
**Then** discipline chips render `Vigour` and `Celerity` (alphabetised → `Celerity`, `Vigour`).
**And** Nightmare is **not** offered as a By Force suggestion.

**Given** the player selects "Deception"
**Then** attribute chips render `Manipulation` and `Wits`; skill chips render `Persuasion` and `Subterfuge`; disc chips render `Auspex` and `Obfuscate`. (All alphabetised by DTFP-2.)

**Given** the player selects "Intimidation"
**Then** attribute chips render `Intelligence` and `Presence`; skill chips render `Expression` and `Intimidation`; disc chips render `Dominate` and `Nightmare`.

### By Force teaching note

**Given** the player has selected "By Force" as the feed method
**And** the player selects Vigour from the disc chips
**Then** a small inline note appears below the disc chip row (or near the chip itself), in muted typography, with strawman wording such as:
> *"By Force pools benefit from Vigour's bonus dice when applied to Brawl. Confirm with your ST if you intend to leverage this in your roll."*

**Given** the player selects Celerity instead of Vigour for By Force
**Then** the note appears similarly, with the wording adjusted to mention Celerity (or a single shared note that mentions both: "Vigour or Celerity adds bonus dice to Brawl/Weaponry pools — confirm with your ST if your roll relies on this.").

**Given** the player selects By Force but neither Vigour nor Celerity
**Then** the note **does not** appear.

**Given** the player switches away from By Force entirely
**Then** the note disappears.

### Back-compat reads

**Given** a published cycle where a player chose `feed_method: 'familiar'` under the old "Familiar Face" name
**Then** the submission renders correctly post-DTFP-3 with the method displayed as "Deception" everywhere it surfaces.

**Given** a published cycle with old chip selections (e.g. a Stalking submission that picked Athletics)
**Then** the saved selections persist and render correctly; the chip set has changed for new submissions but old data is not retroactively edited.

---

## Implementation Notes

### Data file change

In `public/js/tabs/downtime-data.js` at line 87, replace the entries:

```js
export const FEED_METHODS = [
  { id: 'seduction',    name: 'Seduction',    desc: 'Lure a vessel close',                  attrs: ['Presence', 'Manipulation'],     skills: ['Empathy', 'Socialise', 'Persuasion'], discs: ['Majesty', 'Dominate'] },
  { id: 'stalking',     name: 'Stalking',     desc: 'Prey on a target unseen',              attrs: ['Dexterity', 'Wits'],            skills: ['Stealth', 'Streetwise'],              discs: ['Protean', 'Obfuscate'] },
  { id: 'force',        name: 'By Force',     desc: 'Overpower and drain',                  attrs: ['Strength'],                     skills: ['Brawl', 'Weaponry'],                  discs: ['Vigour', 'Celerity'] },
  { id: 'familiar',     name: 'Deception',    desc: 'Exploit an existing acquaintance',     attrs: ['Manipulation', 'Wits'],         skills: ['Persuasion', 'Subterfuge'],           discs: ['Auspex', 'Obfuscate'] },
  { id: 'intimidation', name: 'Intimidation', desc: 'Compel through fear',                  attrs: ['Intelligence', 'Presence'],     skills: ['Expression', 'Intimidation'],         discs: ['Nightmare', 'Dominate'] },
  { id: 'other',        name: 'Other',        desc: 'Custom method (subject to ST approval)', attrs: [], skills: [], discs: [] },
];
```

The `desc` field for `familiar` may also benefit from a tweak now that the method is named "Deception" — at implementation, decide whether to keep "Exploit an existing acquaintance" or update to something like "Get close and feed under false pretences". Strawman: keep the desc as-is unless the rename forces ambiguity.

### Teaching note

In the disc-chip render at `public/js/tabs/downtime-form.js:3342-3349`, after the disc-chip loop, add a conditional note:

```js
if (m.discs.length) {
  // ... existing chip render ...
  if (m.id === 'force' && (selDisc === 'Vigour' || selDisc === 'Celerity')) {
    h += `<div class="dt-feed-teaching-note">Vigour and Celerity add bonus dice to Brawl/Weaponry pools — confirm with your ST if your roll relies on this.</div>`;
  }
}
```

The exact wording is a strawman; final at implementation. Verify the `m.id` value is accessible at this scope (the loop already references `m`, so `m.id` should be fine).

The note should also appear when the disc chip is **clicked** to select Vigour/Celerity, not just on initial render. Verify the existing chip click handler triggers a re-render of the pool builder section; if so, the conditional in the render handles it. If chip clicks update state without re-rendering, attach a small show/hide hook to the click handler.

### CSS

```css
.dt-feed-teaching-note {
  color: var(--txt3);
  font-size: .85em;
  font-style: italic;
  margin-top: .5rem;
  padding: .5rem .75rem;
  border-left: 2px solid var(--gold2);
  background: rgba(0, 0, 0, 0.15); /* replace with token-based equivalent at implementation */
}
```

Reuse tokens; verify the rgba is replaced with a project-canonical surface or transparency token.

### No tests required

Data + render change. Manual smoke test:
- Open DT form Feeding section.
- Cycle through each method, verify the chip lists match the new tables.
- Verify "Deception" appears as the method name; old draft with `feed_method: 'familiar'` renders Deception highlighted correctly.
- Select By Force + Vigour: teaching note appears.
- Switch to By Force + Nightmare (no longer suggested but custom dropdown selection): note does not appear.
- Switch back to Vigour: note reappears.

### British English

Verify the teaching note uses British English (no US spellings) and no em-dashes (use commas, en-dashes, or rephrase).

---

## Files Expected to Change

- `public/js/tabs/downtime-data.js` — `FEED_METHODS` array updated per the table above.
- `public/js/tabs/downtime-form.js` — disc chip render extended with conditional teaching note for By Force + Vigour/Celerity selection.
- `public/css/<dt-form-css>.css` — `.dt-feed-teaching-note` style. Reuse existing tokens.

No schema, no API, no server changes. No migration.

---

## Definition of Done

- All AC verified.
- Manual smoke test exercises every method's chip set.
- Back-compat verified: a draft from before this story with `feed_method: 'familiar'` opens with Deception highlighted.
- Teaching note appears/disappears correctly on disc selection within By Force.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtfp-3-feeding-methods-update: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- Compatible with DTFP-2 (alphabetical chip sort): the new chip lists render alphabetically post-DTFP-2.
- Compatible with DTFP-4 (templates as UX-only): the templates derived from `FEED_METHODS` automatically inherit the new data.
- Compatible with DTFP-5 (Kiss/Violent toggle): unrelated surface; no interaction.
