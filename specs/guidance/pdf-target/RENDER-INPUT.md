# PDF Render Input — contract

The renderer in `pdf_tool/src/render.js` consumes the exact JSON shape defined
by `schemas/print-character.schema.json`, which is the return value of
`public/js/editor/export-character.js::serialiseForPrint(c)`.

This document records extensions the renderer needs on top of the schema, and
the fields that are missing today and have to be added in task #7.

## Canonical schema

Source of truth: `schemas/print-character.schema.json`. Top-level required
fields: `identity`, `stats`, `attributes`, `skills`, `disciplines`, `merits`,
`xp`. Optional: `willpower_conditions`, `devotions`, `rites`,
`fighting_styles`, `touchstones`, `banes`, `influence_breakdown`.

## Extensions the renderer needs (added as `print_meta` block)

The renderer itself is pure — it does not consult the wall clock or the
filesystem. Anything that depends on "render time" must be supplied by the
caller in a new `print_meta` block:

```jsonc
{
  // ... existing serialiseForPrint fields ...
  "print_meta": {
    "printed_date": "19-Mar-26",     // DD-MMM-YY; caller formats Date.now()
    "xp_display": "0 / 54",          // "remaining / earned" per decision
    "clan_key": "Nosferatu",         // lookup key into iconmap.js
    "covenant_key": "Carthian Movement",
    "feed_sources": ["Animals"],     // for the "Can feed from:" line under Vitae
    "vitae_per_turn": 2              // Blood Potency derivation
  }
}
```

## XP display convention

**`remaining / earned`** — Mammon.pdf shows `0 / 54` meaning 0 XP remaining,
54 XP total earned lifetime. This is the format the renderer prints in the
masthead XP field. The caller computes `print_meta.xp_display` from
`data.xp.remaining` and `data.xp.earned`.

Not `spent / earned`. Not `earned / spent`. Not `remaining / spent`. Locked.

## Gaps in serialiseForPrint that task #7 must fix

These fields appear on Mammon.pdf but are not currently produced by
`serialiseForPrint()`:

1. **`stats.status.city | .clan | .covenant`** — the three diamond values in
   the masthead (Mammon shows 2 / 1 / 2). Schema allows them but serialiser
   may not populate them. Audit `export-character.js` and add if missing.

2. **Herd feed sources** — Mammon shows "Can feed from: Animals" under Vitae.
   This is derived from the Herd merit plus the Farmer merit and similar. Add
   a `print_meta.feed_sources` derivation function.

3. **Touchstones bucketed by humanity rating** — today `data.touchstones` is
   a flat `[{humanity, name, desc}]` list. The renderer needs to bucket each
   touchstone next to its row on the Humanity ladder. No schema change needed;
   the renderer handles the bucketing itself from the existing shape.

4. **`print_meta` block** — new top-level property on the render input. Either
   add it to `serialiseForPrint()` output, or have the call site compute it
   and merge it in before calling `render()`. Recommend the latter so the
   serialiser stays pure and the browser layer owns "now()" concerns.

None of these gaps block the standalone utility from rendering Mammon — we
hard-code the Mammon fixture today. They only block the integration step
(task #9) where the site calls `serialiseForPrint(c)` for real characters and
feeds the result into the renderer.

## Contract for the renderer

```js
// All fields optional except what print-character.schema.json requires.
// print_meta is optional for basic renders; renderer substitutes defaults.
const data = {
  identity:     { /* per schema */ },
  stats:        { /* per schema */ },
  attributes:   { /* per schema */ },
  skills:       [ /* per schema */ ],
  disciplines:  [ /* per schema */ ],
  merits:       [ /* per schema */ ],
  devotions:    [ /* optional */ ],
  rites:        [ /* optional */ ],
  fighting_styles: [ /* optional */ ],
  touchstones:  [ /* optional */ ],
  banes:        [ /* optional */ ],
  xp:           { earned, spent, remaining, breakdown: {...} },
  influence_breakdown: [ /* optional strings */ ],

  // Render-specific extensions (optional — renderer fills defaults):
  print_meta: {
    printed_date, xp_display, clan_key, covenant_key,
    feed_sources, vitae_per_turn,
  },
};
```
