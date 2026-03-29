# Terra Mortis Character Data Schema v2

## Design Principles

1. **Consistency**: Same structure for similar data. No mixed formats (int vs object for the same field type).
2. **Derive, don't store**: Speed, Defence, Health, Willpower max, Vitae max are all calculable from attributes, merits, and BP. Store only what can't be derived.
3. **Unified merits**: One array, categorised. Display grouping and CSV column mapping are presentation concerns handled at render/export time.
4. **Specs as arrays**: A skill can have multiple specialisations. Always an array, even if empty.
5. **Flat where possible**: Avoid nesting that doesn't earn its keep.

---

## Schema

```js
{
  // ── Identity ──
  name: "Charlie Ballsack",
  player: "Kurtis W",
  concept: "Putrescent Invictus secret police",
  pronouns: "it/it",
  clan: "Nosferatu",
  bloodline: "Order of Sir Martin",    // null if none
  covenant: "Invictus",
  mask: "Conformist",
  dirge: "Rebel",
  court_title: null,                   // null if none
  apparent_age: "indeterminate",       // free text, null if unset
  features: null,                      // free text, null if unset

  // ── Willpower Conditions ──
  // Tied to Mask/Dirge identity, not mechanical stats
  willpower: {
    mask_1wp:  "Choose an obviously disadvantageous path because it fits with protocol.",
    mask_all:  "Stand by the losing side with shield at the ready, because it is your side.",
    dirge_1wp: "Openly flout a tradition.",
    dirge_all: "Openly flout a Kindred Tradition or a covenant taboo."
  },

  // ── Aspirations ──
  aspirations: [],                     // array of strings

  // ── Core Stats ──
  blood_potency: 1,
  humanity: 4,
  xp_total: 62,
  xp_spent: 62,                        // xp_left is derived: xp_total - xp_spent

  // ── Status ──
  status: { city: 1, clan: 2, covenant: 3 },

  // ── Covenant Standings ──
  // Only non-primary covenants, keyed by short label
  covenant_standings: {
    Carthian: 0,
    Crone: 0,
    Lance: 0
  },
  // Primary covenant status is status.covenant above.
  // The character's own covenant is excluded from this object.
  // Render logic: show all four covenant labels, pull primary from status.covenant,
  // pull others from covenant_standings.

  // ── Attributes ──
  // Always { dots, bonus }. Bonus comes from discipline effects (Resilience, Vigour, etc.)
  // Minimum 1 dot for vampires.
  attributes: {
    Intelligence: { dots: 1, bonus: 0 },
    Wits:         { dots: 3, bonus: 0 },
    Resolve:      { dots: 3, bonus: 0 },
    Strength:     { dots: 3, bonus: 0 },
    Dexterity:    { dots: 3, bonus: 0 },
    Stamina:      { dots: 3, bonus: 0 },
    Presence:     { dots: 2, bonus: 0 },
    Manipulation: { dots: 2, bonus: 0 },
    Composure:    { dots: 3, bonus: 0 }
  },

  // ── Skills ──
  // Always { dots, bonus, specs, nine_again }.
  // Only skills with dots > 0, bonus > 0, specs, or nine_again are stored.
  // Absent keys = 0 dots, no specs, no flags.
  skills: {
    Crafts:       { dots: 4, bonus: 0, specs: ["Smithing"],   nine_again: true },
    Stealth:      { dots: 3, bonus: 0, specs: ["Coward Punch"], nine_again: true },
    Weaponry:     { dots: 4, bonus: 1, specs: ["Lgt Weapons +2","Weapon & Shield +2"], nine_again: true },
    Empathy:      { dots: 2, bonus: 0, specs: [],             nine_again: true },
    Intimidation: { dots: 2, bonus: 0, specs: ["Interrogation"], nine_again: true },
    Socialise:    { dots: 3, bonus: 0, specs: [],             nine_again: false }
  },

  // ── Disciplines ──
  // Keyed by name, value is rating. No change from current; already clean.
  disciplines: {
    Celerity: 1,
    Nightmare: 1,
    Obfuscate: 5
  },

  // ── Powers ──
  // Each power has a category to eliminate guesswork during rendering.
  // "discipline" powers reference their parent discipline.
  // "devotion" and "pact" powers stand alone.
  powers: [
    {
      category: "discipline",        // "discipline" | "devotion" | "pact"
      discipline: "Obfuscate",       // parent discipline (discipline category only)
      name: "Face in the Crowd",
      rank: 1,                       // dot level
      stats: "Cost: -  •  Pool: -  •  Instant  •  Scene",
      pool_size: null,
      effect: "Blend into surroundings..."
    },
    {
      category: "devotion",
      name: "Repulsive Mien",
      stats: "Cost: 1 V (Order of Sir Martin Only)...",
      pool_size: null,
      effect: "As Dread Presence but -3 to all actions..."
    },
    {
      category: "pact",
      name: "Oath of Fealty",
      rank: 1,
      effect: "Draw Invictus Status in Vitae weekly from liege..."
    },
    {
      category: "pact",
      name: "Oath of the True Knight",
      rank: 4,
      effect: "Impartial covenant defender..."
    }
  ],

  // ── Merits (unified) ──
  // Every merit is one entry. Category drives display grouping and editor UI.
  // Manoeuvre names reference MAN_DB for full effect text.
  // Influence types reference the downtime system.
  merits: [
    // General
    { category: "general",    name: "Area of Expertise",          rating: 1, qualifier: "Coward Punch" },
    { category: "general",    name: "Closed Book",                rating: 3 },
    { category: "general",    name: "Defensive Combat",           rating: 1, qualifier: "Weaponry" },
    { category: "general",    name: "Indomitable",                rating: 2 },
    { category: "general",    name: "Invested",                   rating: 1 },
    { category: "general",    name: "Secret Society Junkie",      rating: 1 },

    // Influence
    { category: "influence",  name: "Allies",     rating: 1, area: "Police" },
    { category: "influence",  name: "Contacts",   rating: 3, area: "Street, Underworld, Police" },
    { category: "influence",  name: "Resources",  rating: 5 },

    // Domain
    { category: "domain",     name: "Safe Place",       rating: 3 },
    { category: "domain",     name: "Haven",            rating: 3 },
    { category: "domain",     name: "Herd",             rating: 5 },

    // Standing
    { category: "standing",   name: "Mystery Cult Initiation", rating: 5, cult_name: "The Ashen Path" },
    { category: "standing",   name: "Professional Training",   rating: 4, role: "Enforcer" },

    // Manoeuvre
    { category: "manoeuvre",  name: "Courtoisie",            rating: 1, rank_name: "Establish the Duel" },
    { category: "manoeuvre",  name: "Courtoisie",            rating: 3, rank_name: "Demanding Attention" },
    { category: "manoeuvre",  name: "Light Weapons",         rating: 2, rank_name: "Thrust" },
    { category: "manoeuvre",  name: "Light Weapons",         rating: 4, rank_name: "Flurry" },
    { category: "manoeuvre",  name: "Weapon and Shield",     rating: 1, rank_name: "Shield Bash" },
    { category: "manoeuvre",  name: "Weapon and Shield",     rating: 3, rank_name: "Pin Weapon" }
  ],

  // ── Touchstones ──
  // No change from current; already clean.
  touchstones: [
    { humanity: 6, name: "Priya", desc: "saved assailant" }
  ],

  // ── Banes ──
  // No change from current; already clean.
  banes: [
    { name: "Lonely Curse",  effect: "With mortals, Humanity counts -2..." },
    { name: "Rat King/Queen", effect: "Surrounded by vermin..." }
  ]
}
```

---

## What's Removed (Derived at Render/Export Time)

| Old Field | Derivation |
|-----------|-----------|
| `size` | 5 (+ 1 if Giant merit present) |
| `speed` | Strength dots + Dexterity dots + size + Fleet of Foot rating |
| `defence` | lower(Dexterity, Wits) + Athletics (or Brawl/Weaponry via Defensive Combat merit) |
| `health` | Stamina dots + size |
| `willpower_max` | Resolve dots + Composure dots |
| `vitae_max` | BP lookup table |
| `xp_left` | xp_total - xp_spent |
| `influence_total` | sum of all `category:"influence"` merit ratings |
| `domain` object | filter merits by `category:"domain"` |
| `standing` object | filter merits by `category:"standing"` |

---

## What Changes from Current

| Area | Old | New |
|------|-----|-----|
| Attributes | `3` or `{dots:3, bonus_dots:1}` | Always `{dots:3, bonus:0}` |
| Skills | `3` or `{dots:3, spec:"foo"}` | Always `{dots:3, bonus:0, specs:["foo"], nine_again:false}` (absent = 0) |
| Merits | `["Closed Book ●●●"]` (strings) | `[{name, rating, category, ...}]` (objects) |
| Influence | separate `influence[]` array | merged into `merits` with `category:"influence"` |
| Domain | separate `domain` object | merged into `merits` with `category:"domain"` |
| Standing | separate `standing` object | merged into `merits` with `category:"standing"` |
| Pacts | buried in `powers[]` | moved to `powers[]` with `category:"pact"` |
| Manoeuvres | encoded in merit strings | `merits` with `category:"manoeuvre"` |
| `xp_left` | stored | derived from `xp_total - xp_spent` |
| Derived stats | stored | calculated |
| `covenant_standings` | array with all 4 | object keyed by label, primary excluded |
| `willpower` keys | `mask_all_wp` | `mask_all` (drop redundant `_wp` suffix) |

---

## Migration

A converter function transforms old format to new on load.
An inverse function splits back out for CSV export.
Both are pure transforms with no data loss.
