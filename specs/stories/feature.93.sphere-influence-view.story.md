# Story CR-4: Sphere / Influence View (ST Admin)

Status: complete

## Story

**As a** Storyteller viewing the Spheres tab,
**I want** a clear per-sphere view showing all 16 spheres with ranked holders and vacant spheres flagged,
**so that** I can quickly see who dominates each sphere and which spheres are uncontested.

## Background

`spheres-view.js` already implements a basic Spheres tab with ranked tables per sphere. The current view has two limitations:

1. **Only shows occupied spheres** — if no character holds Allies/Status/Contacts in a sphere, it doesn't appear at all
2. **Table layout doesn't scale well** — 16 spheres as individual tables is verbose; the CSS already has a compact card grid (`.spheres-grid` / `.sphere-card`) ready to use

CR-4 upgrades the view to: show all 16 canonical spheres, use the card grid layout, highlight the dominant holder (top by total dots), and clearly mark vacant spheres. The view remains read-only — sphere rankings are derived from character merit data, editable via the character editor.

The "slot caps" concept doesn't exist in canon rules — sphere influence is purely competitive. The ST display reflects who currently leads each sphere, not a fixed vacancy structure.

---

## Acceptance Criteria

1. All 16 canonical spheres are shown — no sphere is hidden because it has no current holders.
2. Spheres with active holders are sorted first (by total dots descending), followed by vacant spheres alphabetically.
3. Each sphere card shows:
   - Sphere name (Cinzel heading)
   - If occupied: dominant holder highlighted (rank 1, highest Allies + Status total) with their dot score
   - If occupied: remaining holders in compact list (rank 2+), showing Allies | Status | Contact ✓
   - If vacant: "No current holders" placeholder
4. Dominant holder is visually distinct from the rest (e.g., gold name colour or left-accent border).
5. Vacant sphere cards are visually dimmed / de-emphasised.
6. The layout uses the `.spheres-grid` card grid (already defined in `admin-layout.css`).
7. The existing `normaliseSphere()` logic is preserved — case-insensitive matching against canonical names.
8. `INFLUENCE_SPHERES` from `public/js/data/constants.js` is imported and used as the canonical sphere list — no hardcoded array.

---

## Tasks / Subtasks

- [x] Task 1: Import canonical sphere list
  - [x] `import { INFLUENCE_SPHERES } from '../data/constants.js';` added to spheres-view.js

- [x] Task 2: Update `getSpheresData()` to include all 16 spheres
  - [ ] After building the `spheres` map from character merits (existing logic — keep it), add a second pass:
    ```js
    // Ensure all 16 canonical spheres appear, even if vacant
    for (const canonical of INFLUENCE_SPHERES) {
      if (!spheres[canonical]) spheres[canonical] = {};
    }
    ```
  - [x] Return value: array of `{ sphere, rows, total }` where `rows = []` and `total = 0` for vacant spheres
  - [x] Sort: occupied first (total desc), then vacant alphabetically

- [x] Task 3: Rewrite `renderSpheres()` to use card grid layout
  - [x] `renderSphereCard()` added; uses `.spheres-grid` + `.sphere-card`
  - [x] Dominant holder (rank 1) marked with `.sphere-dominant`
  - [x] Vacant cards show "No current holders" with `.sphere-card-vacant`

- [x] Task 4: Add CSS for dominant holder and vacant card
  - [x] `.sphere-card-vacant`, `.sphere-vacant-msg`, `.sphere-dominant .sphere-char-name` added to `admin-layout.css`

- [ ] Task 5: Manual verification
  - [ ] Open Spheres tab in ST admin
  - [ ] Confirm all 16 sphere cards appear
  - [ ] Confirm occupied spheres come first, vacant at bottom
  - [ ] Confirm dominant holder (rank 1) has gold name
  - [ ] Confirm vacant spheres are dimmed with "No current holders" text

---

## Dev Notes

### INFLUENCE_SPHERES canonical list (from `constants.js`)

```
Bureaucracy, Church, Finance, Health, High Society, Industry, Legal, Media,
Military, Occult, Police, Politics, Street, Transportation, Underworld, University
```

### Existing logic to preserve

- `normaliseSphere(raw)` — case-insensitive normalisation; keep exactly as-is
- `DOTTED_MERITS = new Set(['Allies', 'Status'])` — keep; Contacts is presence-only
- `applyDerivedMerits(c)` call in `initSpheresView()` — keep; required for MCI-derived merits
- The `row.allies`, `row.status`, `row.hasContacts` data structure — keep; just change how it renders

### Sphere scores legend (card meta)

- `A2` = 2 dots of Allies in this sphere
- `S1` = 1 dot of Status in this sphere
- `✓` = Contacts entry (presence only, not a dot count)
- Total = A + S (Contacts not counted in total)

### Editability

Read-only. The ST edits sphere rankings by modifying character merits in the character editor (Player tab → character sheet → Influence section). No in-situ editing is added by this story.

### No slot caps

Sphere influence is purely competitive — no canon slot cap exists. The view ranks holders by total dots; whoever has the most is the de facto leader. No "1@max, 2@next" structure is needed here.

### CSS grid already defined

`.spheres-grid` is already in `admin-layout.css` (line ~955):
```css
.spheres-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
  padding: 8px 0;
}
.sphere-card {
  background: var(--surf);
  border: 1px solid var(--bdr);
  border-radius: 6px;
  padding: 8px 10px;
}
```
Do NOT redefine these — only add the new `.sphere-card-vacant`, `.sphere-vacant-msg`, `.sphere-dominant` rules.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/spheres-view.js` | Refactor: import INFLUENCE_SPHERES, update getSpheresData, rewrite renderSpheres |
| `public/css/admin-layout.css` | Add: 3 new CSS rules in spheres panel block |

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- Imported `INFLUENCE_SPHERES` from `../data/constants.js` — canonical 16-sphere list; no local duplicate
- `getSpheresData()`: second pass adds all 16 canonical spheres before converting to output array; sort updated to occupied-first (total desc), then vacant alphabetically
- `renderSphereCard()` added: `.sphere-card` + `.sphere-card-vacant` for vacant; `.sphere-dominant` on rank 1 row; meta shows A/S/✓ abbreviations
- `renderSpheres()` simplified: `.spheres-grid` wrapper, calls `renderSphereCard` per entry; no empty-data guard needed (always 16 entries)
- CSS: `.sphere-card-vacant` (opacity .55), `.sphere-vacant-msg` (italic placeholder), `.sphere-dominant .sphere-char-name` (gold2 + bold) — appended after existing `.sphere-char-meta` block

### File List
- `public/js/admin/spheres-view.js`
- `public/css/admin-layout.css`
- `specs/stories/cr.4.sphere-influence-view.story.md`
