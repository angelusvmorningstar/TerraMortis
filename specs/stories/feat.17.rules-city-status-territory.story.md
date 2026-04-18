# Story feat.17: Rules Reference — City Status and Territory

**Story ID:** feat.17
**Epic:** Feature Backlog
**Status:** ready-for-dev
**Date:** 2026-04-18

---

## User Story

As a player or ST using the game app rules tab, I want dedicated City Status and Territory sections in the rules quick reference so that I can look up political mechanics and territory claiming rules during a session without leaving the app.

---

## Background

### Source material

`Player Guide.pdf` (2 pages, project root) is the official player quick-reference. It covers:
1. **City Status** — what it is, deeds that earn 1–5 dots, and the five court position tiers with their per-session status powers
2. **Territory** — the three-phase claiming process (challenge → blind bid → resolution), sources of influence tokens, and the ambience feeding modifier table

### Existing rules reference

`public/js/game/rules.js` contains a `RULES` array of section objects. Each section has:
```js
{ id: 'string', title: 'string', entries: [{ term: 'string', text: 'string' }] }
```

The existing sections are: `rolls`, `resistance`, `frenzy`, `vitae`, `disciplines`, `merits`.

The `merits` section already has a brief `"City Status"` entry (`"General vampire political standing. Grants bonus dice on city social rolls."`). **Do not remove it** — it belongs there as a merit summary. The new sections expand on the political mechanics separately.

### No other files are touched

This story is purely a content addition to `rules.js`. No CSS, no API, no schema changes. The existing search/highlight/collapse infrastructure handles new sections automatically.

---

## Acceptance Criteria

- [ ] A "City Status" section appears in the rules reference (both the Rules tab and the overlay)
- [ ] The section contains entries for: what city status is, deeds (1–5 dots), and all five court position tiers
- [ ] A "Territory" section appears in the rules reference
- [ ] The section contains entries for: the claim process (challenge, blind bid, resolution), sources of influence, and the ambience modifier table
- [ ] Both new sections are collapsed by default (only `rolls` opens by default)
- [ ] Both new sections are searchable — searching "primogen" or "ambience" returns the relevant entries
- [ ] The existing brief "City Status" entry in the `merits` section is preserved unchanged

---

## Implementation

**File:** `public/js/game/rules.js` only.

Insert two new section objects into the `RULES` array. Place them **between** the `vitae` section and the `disciplines` section (i.e., after the `vitae` block at index 3, before `disciplines`). This groups the game-world political/social mechanics together before the supernatural mechanics.

### City Status section

```js
{
  id: 'city-status',
  title: 'City Status',
  entries: [
    { term: 'What It Is',             text: 'Your political standing in the domain. Be polite to Kindred who have more; you may look down on those with less. Court positions grant bonus Status while held and powers to give or take it.' },
    { term: '1 dot — Attend',         text: 'Attend gatherings without causing disruption.' },
    { term: '2 dots — Support',       text: 'Consistently support praxis.' },
    { term: '3 dots — Fulfil',        text: 'Fulfil city objectives; provide exceptional service.' },
    { term: '4 dots — Advance',       text: "Advance the city\u2019s interests; eliminate a threat." },
    { term: '5 dots — Expand',        text: "Greatly expand the city\u2019s power or reputation; assume a major leadership role." },
    { term: 'Head of State (+3)',      text: 'Prince, Archbishop, Oracle, Premier. Can give or take City Status up to their own City Status.' },
    { term: 'Primogen (+2)',           text: 'Can give or take City Status once per session.' },
    { term: 'Socialite (+1)',          text: 'Harpy, Tribune, Penitent, Jester, Fool. Can give or take City Status up to their own. No more than 2 in the city.' },
    { term: 'Enforcer (+1)',           text: 'Hound, Master of Elysium, Reeve, Constable. Can take City Status for breaches or violations.' },
    { term: 'Administrator (+1)',      text: 'Seneschal, Arbiter, Legate, Keeper of Records, Chancellor. Can block one City Status loss for the night.' },
  ],
},
```

### Territory section

```js
{
  id: 'territory',
  title: 'Territory',
  entries: [
    { term: 'Eligibility',            text: 'Must be City Status 2+ to claim. Must be seconded by another Kindred who is also City Status 2+.' },
    { term: 'Challenge',              text: 'The Head of State puts the district up for bid publicly.' },
    { term: 'Blind Bid',              text: 'Add Influence tokens to a box throughout the game. Recruit other Kindred to add their Influence to your bid. Wheel and deal for support.' },
    { term: 'Resolution',             text: 'Last call 30 minutes before game end. Before tallies are revealed, the Ruler may move tokens (up to their City Status). Ruler tallies all bids publicly. Regent gets +3 to tally; ambience affects tally. Highest bid wins. Defender wins ties.' },
    { term: 'Sources of Influence',   text: 'Clan Status: 1 per dot. Covenant Status: 1 per dot. Influence merit at 3 dots: 1. Influence merit at 5 dots: 2. Mystery Cult Initiation at 5 dots: 1. Specialist Status at 5 dots: 1.' },
    { term: 'Influence Merits',       text: 'Allies, Contacts, Mentor, Resources, Retainer, Staff, Mortal Status.' },
    { term: 'Ambience: The Rack',     text: 'Feed +5 · Pop Cap 8.' },
    { term: 'Ambience: Verdant',      text: 'Feed +4 · Pop Cap 7.' },
    { term: 'Ambience: Curated',      text: 'Feed +3 · Pop Cap 7.' },
    { term: 'Ambience: Tended',       text: 'Feed +2 · Pop Cap 6.' },
    { term: 'Ambience: Settled',      text: 'Feed +0 · Pop Cap 6.' },
    { term: 'Ambience: Untended',     text: 'Feed \u22122 · Pop Cap 5.' },
    { term: 'Ambience: Neglected',    text: 'Feed \u22123 · Pop Cap 4. Districts naturally decay to Neglected at one step per month.' },
    { term: 'Ambience: Barrens',      text: 'Feed \u22124 · Pop Cap N/A.' },
    { term: 'Ambience: Hostile',      text: 'Feed \u22125 · Pop Cap N/A.' },
  ],
},
```

### Exact insertion point

The `RULES` array currently ends with the `merits` section. Insert the two new sections **before** `disciplines`:

```js
// Current order (unchanged except two insertions):
{ id: 'rolls', ... },
{ id: 'resistance', ... },
{ id: 'frenzy', ... },
{ id: 'vitae', ... },
{ id: 'city-status', ... },   // NEW
{ id: 'territory', ... },     // NEW
{ id: 'disciplines', ... },
{ id: 'merits', ... },
```

---

## Files to Change

| File | Change |
|---|---|
| `public/js/game/rules.js` | Add two section objects to `RULES` array between `vitae` and `disciplines` |
