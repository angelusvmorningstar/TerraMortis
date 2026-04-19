---
id: dtfc.8
epic: downtime-form-calibration
group: B
status: ready-for-dev
priority: high
depends_on: [dtfc.3]
---

# Story dtfc.8: XP Spend — Structured Dot Purchase + Admin Carry-forward

As a player spending XP,
I want to select exactly what I'm buying with a structured picker that shows cost and availability,
So that I can't submit mechanically incoherent XP purchases and the ST doesn't have to decode free-text.

---

## Context

Two connected changes:

**1. Project XP Spend action:** Replace the free-text XP note with a structured picker — category → item → dot purchase with cost display. One dot purchase per project slot commitment.

**2. Admin section carry-forward:** The Admin section's XP grid should auto-populate from committed project XP spends (read-only), then allow free purchases of merits (1–3 dots) that don't require a project slot.

**Merits 1–3 dots:** These can be purchased without committing a project action. They are declared directly in the Admin section.

---

## Acceptance Criteria

### Project XP Spend Action

**Given** a project slot with action type `xp_spend`  
**When** the player views the slot  
**Then** the following fields appear:
  - **Category** dropdown: Attributes / Skills / Disciplines / Devotions / Rites / (other)
  - **Item** dropdown/search: filtered to items in that category the character could actually buy next dot of
  - **Dots buying**: always 1 (one dot per project commitment) — shown as read-only
  - **XP cost**: calculated and shown based on category and character's current rating
  - **Available XP**: shown from `xpLeft(currentChar)` — updates as commitments accumulate

**Given** the player selects Attributes → Strength  
**When** the cost display renders  
**Then** it shows "4 XP (Strength 2 → 3)" based on the character's current rating

**Given** the player has insufficient XP for the selected purchase  
**When** the cost display renders  
**Then** the cost is shown in a warning colour  
**And** a note reads "Insufficient XP"  
**And** the form does not block submission (ST makes final call)

**Given** the player saves the XP spend  
**When** `collectResponses` runs  
**Then** `responses.project_N_xp_category` = the selected category  
**And** `responses.project_N_xp_item` = the selected item name  
**And** `responses.project_N_xp_dots` = `'1'`  
**And** the old `responses.project_N_xp` (free text) key is not written

### Admin Section

**Given** one or more project slots have `xp_spend` actions committed  
**When** the Admin section renders  
**Then** a read-only "Project XP Commitments" table shows each committed purchase: Category / Item / Cost  
**And** a running total of committed XP is shown against the character's available XP

**Given** the admin section renders  
**When** the player views free merit purchases  
**Then** a separate "Additional Merits (no project required)" panel appears  
**And** it uses the same structured picker (category fixed to Merits, items filtered to merits 1–3 dots)  
**And** the player can add multiple free merit rows with "Add row" button  
**And** response key: `admin_free_merit_N_item`, `admin_free_merit_N_dots`, `admin_free_merit_N_cost`  
**And** the total of all XP spend (project + free merits) is shown against available XP

### ST Processing Panel

**Given** a submission with `project_N_xp_category` and `project_N_xp_item`  
**When** the ST XP summary renders  
**Then** it displays structured rows correctly: "Attributes — Strength (1 dot, 4 XP)"

**Given** a legacy submission with `project_N_xp` free text  
**When** the ST XP summary renders  
**Then** it falls back gracefully, displaying the text content

---

## Implementation Notes

### Category → item mapping

Build a helper `getXPItems(category, char)` returning an array of `{ name, currentDots, cost, canBuy }`:

```js
// Attributes
const ATTR_COST = 4;
// Skills  
const SKILL_COST = 2;
// Disciplines: clan disc = 3, out-of-clan = 4
// Merits: 1 XP/dot
// Devotions: from DEVOTIONS_DB
// Rites: 4 XP/dot (out-of-clan sorcery rate)
```

For Attributes: iterate `ALL_ATTRS`, get current dots, calculate cost of next dot.  
For Skills: iterate `ALL_SKILLS` similarly.  
For Disciplines: char's existing disciplines + clan disciplines not yet purchased (up to 5 dots).  
For Merits (Admin section only): `MERITS_DB` items rated 1–3.  
For Devotions/Rites: from `DEVOTIONS_DB` / rite lists.

Only show items where `currentDots < maxDots` (don't show maxed traits).

### Available XP tracking

`xpLeft(currentChar)` from `xp.js` gives the base available XP. During form fill, subtract committed project XP spends and free merit purchases to show a live "remaining" figure. This is client-side only — `xpLeft` is not modified.

### collectResponses

```js
// In project slot collection, replace old project_N_xp:
const xpCatEl = document.getElementById(`dt-project_${n}_xp_category`);
const xpItemEl = document.getElementById(`dt-project_${n}_xp_item`);
responses[`project_${n}_xp_category`] = xpCatEl ? xpCatEl.value : '';
responses[`project_${n}_xp_item`] = xpItemEl ? xpItemEl.value : '';
responses[`project_${n}_xp_dots`] = '1'; // always 1

// Admin free merits:
const freeMeritCount = ... // count rows
for (let n = 1; n <= freeMeritCount; n++) {
  responses[`admin_free_merit_${n}_item`] = ...
  responses[`admin_free_merit_${n}_dots`] = ...
}
```

### Admin section

The Admin section currently has an `xp_grid` question type. The new design:

1. Read all project slots for `xp_spend` actions → render as read-only table
2. Render "Additional Merits" panel below with dynamic rows
3. Show running XP total

The `xp_grid` question type in `renderQuestion` needs to be updated (or replaced with two new types: `xp_carry_forward` and `xp_free_merits`).

### ST Panel update

In `downtime-views.js` lines ~2565-2606 (XP spend display), add a branch to detect new keys:

```js
// New format
const cat = s.responses?.[`project_${n}_xp_category`];
const item = s.responses?.[`project_${n}_xp_item`];
if (cat && item) {
  rows.push({ category: cat, item, dotsBuying: 1 });
  continue;
}
// Legacy fallback: old project_N_xp free text
const legacy = s.responses?.[`project_${n}_xp`];
if (legacy) rows.push({ category: 'Legacy', item: legacy, dotsBuying: null });
```

---

## Files Expected to Change

- `public/js/player/downtime-form.js` — XP spend slot rendering; Admin section carry-forward + free merit rows; collectResponses
- `public/js/player/downtime-data.js` — update `xp_spend` action fields; update admin xp question type
- `public/js/admin/downtime-views.js` — structured XP display + legacy fallback
- `public/css/components.css` — XP picker styles, admin carry-forward table, free merit rows

## Dev Agent Record
### Agent Model Used
_to be filled_
### Completion Notes
_to be filled_
### File List
_to be filled_
